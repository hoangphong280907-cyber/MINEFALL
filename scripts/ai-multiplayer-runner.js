'use strict';

const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const net = require('node:net');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const WebSocket = require('ws');
const packageInfo = require('../package.json');

const ROOT = path.resolve(__dirname, '..');
const SERVER = path.join(ROOT, 'server', 'index.js');
const BOARD_SIZES = [8, 10, 12, 14, 16, 18, 20];
const PLAYER_COUNTS = [2, 3, 4, 5];
const QUICK = process.argv.includes('--quick');
const SIZES = QUICK ? [8, 20] : BOARD_SIZES;
const COUNTS = QUICK ? [2, 5] : PLAYER_COUNTS;
const WAIT_MS = 6000;

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function reservePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(error => error ? reject(error) : resolve(address.port));
    });
  });
}

class SimulatedClient {
  constructor(socket, label) {
    this.socket = socket;
    this.label = label;
    this.messages = [];
    this.waiters = [];
    this.closeError = null;

    socket.on('message', raw => {
      let message;
      try {
        message = JSON.parse(raw.toString('utf8'));
      } catch (error) {
        this.rejectWaiters(new Error(this.label + ' received invalid JSON: ' + error.message));
        return;
      }
      this.dispatch(message);
    });

    socket.on('error', error => {
      this.closeError = error;
    });
    socket.on('close', (code, reason) => {
      this.closeError = new Error(this.label + ' socket closed (' + code + '): ' + reason.toString());
    });
  }

  dispatch(message) {
    const index = this.waiters.findIndex(waiter => waiter.matches(message));
    if (index < 0) {
      this.messages.push(message);
      if (this.messages.length > 500) this.messages.shift();
      return;
    }
    const waiter = this.waiters.splice(index, 1)[0];
    clearTimeout(waiter.timer);
    waiter.resolve(message);
  }

  rejectWaiters(error) {
    for (const waiter of this.waiters.splice(0)) {
      clearTimeout(waiter.timer);
      waiter.reject(error);
    }
  }

  waitFor(type, predicate = () => true, timeoutMs = WAIT_MS) {
    const matches = message => message && message.type === type && predicate(message);
    const queuedIndex = this.messages.findIndex(matches);
    if (queuedIndex >= 0) return Promise.resolve(this.messages.splice(queuedIndex, 1)[0]);
    if (this.socket.readyState === WebSocket.CLOSED) {
      return Promise.reject(this.closeError || new Error(this.label + ' socket is already closed'));
    }

    const pending = new Promise((resolve, reject) => {
      const waiter = {
        matches,
        resolve,
        reject,
        timer: setTimeout(() => {
          const index = this.waiters.indexOf(waiter);
          if (index >= 0) this.waiters.splice(index, 1);
          reject(this.closeError || new Error(this.label + ' timed out waiting for ' + type));
        }, timeoutMs)
      };
      this.waiters.push(waiter);
    });
    // A sibling waiter in Promise.all may already have failed when this socket closes.
    // Keep the original rejection observable to awaiters without creating a second
    // unhandled-rejection crash during scenario cleanup.
    pending.catch(() => {});
    return pending;
  }

  send(type, payload = {}) {
    assert.equal(this.socket.readyState, WebSocket.OPEN, this.label + ' socket is not open');
    this.socket.send(JSON.stringify({ type, payload }));
  }

  sendCommand(command) {
    assert.equal(this.socket.readyState, WebSocket.OPEN, this.label + ' socket is not open');
    // game:command deliberately uses a top-level command envelope in the protocol.
    this.socket.send(JSON.stringify({ type: 'game:command', command }));
  }

  terminate() {
    if (this.socket.readyState !== WebSocket.CLOSED) this.socket.terminate();
  }
}

async function connectClient(url, label) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    // Attach message handling before the handshake completes; the server sends hello immediately.
    const client = new SimulatedClient(socket, label);
    let opened = false;
    socket.once('open', () => {
      opened = true;
      resolve(client);
    });
    socket.once('error', error => {
      if (!opened) reject(error);
    });
  });
}

async function waitForHealth(baseUrl, child, readOutput) {
  const deadline = Date.now() + 10000;
  let lastError = null;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error('Server exited before health check.\n' + readOutput());
    }
    try {
      const response = await fetch(baseUrl + '/health', { signal: AbortSignal.timeout(1000) });
      if (response.ok) {
        const health = await response.json();
        assert.equal(health.status, 'ok');
        assert.equal(health.version, packageInfo.version);
        return health;
      }
      lastError = new Error('/health returned HTTP ' + response.status);
    } catch (error) {
      lastError = error;
    }
    await delay(120);
  }
  throw new Error('Server did not become healthy: ' + (lastError?.message || 'timeout') + '\n' + readOutput());
}

async function stopServer(child) {
  if (child.exitCode !== null) return;
  child.kill('SIGTERM');
  await Promise.race([
    new Promise(resolve => child.once('exit', resolve)),
    delay(2500)
  ]);
  if (child.exitCode === null) {
    child.kill('SIGKILL');
    await Promise.race([
      new Promise(resolve => child.once('exit', resolve)),
      delay(1000)
    ]);
  }
}

function expectStateForAll(clients, matchId, predicate) {
  return Promise.all(clients.map(client => client.waitFor(
    'match:state',
    message => message.state?.matchId === matchId && predicate(message.state)
  )));
}

function assertSameSnapshot(messages, context) {
  assert.ok(messages.length > 0, context + ': no client snapshots received');
  const reference = JSON.stringify(messages[0].state);
  for (let i = 1; i < messages.length; i++) {
    assert.equal(JSON.stringify(messages[i].state), reference, context + ': clients received different authoritative snapshots');
  }
}

function assertHiddenMinesAreRedacted(state, context) {
  for (const cell of state.board.cells) {
    if (!cell.revealed && !cell.exploded && !cell.endRevealed) {
      assert.equal(cell.mine, null, context + ': hidden mine leaked at cell ' + cell.i);
    }
  }
}

function makeCommand(type, playerId, state, index) {
  return {
    protocolVersion: 1,
    type,
    playerId,
    matchId: state.matchId,
    turnId: state.turn.turnId,
    commandId: 'ai-' + randomUUID(),
    payload: { index }
  };
}

function chooseCoveredCell(state) {
  const cell = state.board.cells.find(item =>
    !item.revealed && !item.zone && !item.flagOwner
  );
  assert.ok(cell, 'test agent could not find a covered unflagged cell');
  return cell.i;
}

async function executeCommand(clients, activeClient, command, statePredicate, expectedAction) {
  const ackPromise = activeClient.waitFor(
    'command:ack',
    message => message.commandId === command.commandId && message.accepted === true
  );
  const statePromises = expectStateForAll(clients, command.matchId, statePredicate);
  activeClient.sendCommand(command);
  const [ack, snapshots] = await Promise.all([ackPromise, Promise.all(statePromises)]);
  if (expectedAction) assert.equal(ack.action, expectedAction);
  assertSameSnapshot(snapshots, command.type + ' broadcast');
  assertHiddenMinesAreRedacted(snapshots[0].state, command.type + ' broadcast');
  return snapshots[0].state;
}

async function runScenario(port, playerCount, boardSize, scenarioNumber) {
  const wsUrl = 'ws://127.0.0.1:' + port + '/ws';
  const clients = [];
  const clientByPlayerId = new Map();
  const scenario = 'players=' + playerCount + ', board=' + boardSize + 'x' + boardSize;

  const addClient = async label => {
    const client = await connectClient(wsUrl, label);
    clients.push(client);
    await client.waitFor('system:hello', message => message.protocolVersion === 1);
    return client;
  };

  try {
    const host = await addClient('scenario-' + scenarioNumber + '-host');
    const hostSessionPromise = host.waitFor('room:session', message => message.resumed === false);
    host.send('room:create', {
      name: 'AI Host',
      config: {
        boardSize,
        difficulty: 'easy',
        maxPlayers: playerCount,
        matchDurationMinutes: 10
      },
      identity: 'ai-host-' + scenarioNumber + '-' + randomUUID()
    });
    const hostSession = await hostSessionPromise;
    assert.match(hostSession.roomCode, /^[A-Z0-9]{6}$/);
    clientByPlayerId.set(hostSession.playerId, host);

    const sessions = [hostSession];
    for (let index = 1; index < playerCount; index++) {
      const guest = await addClient('scenario-' + scenarioNumber + '-player-' + (index + 1));
      const sessionPromise = guest.waitFor('room:session', message => message.resumed === false);
      guest.send('room:join', {
        code: hostSession.roomCode,
        name: 'AI Player ' + (index + 1),
        identity: 'ai-guest-' + scenarioNumber + '-' + index + '-' + randomUUID()
      });
      const session = await sessionPromise;
      sessions.push(session);
      clientByPlayerId.set(session.playerId, guest);
    }

    const lobbyUpdates = await Promise.all(clients.map(client =>
      client.waitFor('room:update', message => message.room?.players?.length === playerCount)
    ));
    for (const update of lobbyUpdates) {
      assert.equal(update.room.config.boardSize, boardSize, scenario + ': lobby board size mismatch');
      assert.equal(update.room.config.maxPlayers, playerCount, scenario + ': lobby capacity mismatch');
    }

    const readyUpdates = clients.map(client =>
      client.waitFor('room:update', message => message.room?.status === 'ready')
    );
    for (const client of clients) client.send('player:ready', { ready: true });
    await Promise.all(readyUpdates);

    const matchWaiters = clients.map(client =>
      client.waitFor('match:state', message => Boolean(message.state?.matchId))
    );
    host.send('match:start');
    const initialMessages = await Promise.all(matchWaiters);
    const initialState = initialMessages[0].state;
    const matchId = initialState.matchId;

    assert.ok(matchId, scenario + ': match ID missing');
    assert.equal(initialState.started, false, scenario + ': match should wait for roulette');
    assert.equal(initialState.players.length, playerCount, scenario + ': wrong player count');
    assert.equal(initialState.board.size, boardSize, scenario + ': wrong board size');
    assert.equal(initialState.board.cells.length, boardSize * boardSize, scenario + ': wrong board cell count');
    assert.equal(initialState.board.mineCount, Math.round(boardSize * boardSize * 0.25), scenario + ': wrong mine count');
    assert.equal(initialState.board.zone.length, 5, scenario + ': spawn zone must contain five cells');
    const openingCount = initialState.board.zone.length + initialState.board.clueRing.length;
    assert.ok(openingCount >= 15 && openingCount <= 20, scenario + ': landing opening must contain 15-20 cells');
    assert.equal(new Set(initialState.players.map(player => player.pos)).size, playerCount, scenario + ': spawn positions are not unique');
    assertSameSnapshot(initialMessages, scenario + ' initial snapshot');
    assertHiddenMinesAreRedacted(initialState, scenario + ' initial snapshot');

    const rouletteWaiters = clients.map(client => client.waitFor('match:roulette:start'));
    clients[playerCount - 1].send('match:roulette:activate');
    await Promise.all(rouletteWaiters);

    const beginClient = clients[0];
    const beginAckPromise = beginClient.waitFor('match:begin:ack', message => message.accepted === true);
    const begunStatesPromise = expectStateForAll(clients, matchId, snapshot => snapshot.started === true);
    beginClient.send('match:begin', { matchId });
    const [, stateMessages] = await Promise.all([beginAckPromise, begunStatesPromise]);
    let state = stateMessages[0].state;
    assertSameSnapshot(stateMessages, scenario + ' begun snapshot');
    assert.equal(state.started, true, scenario + ': match did not begin');
    assertHiddenMinesAreRedacted(state, scenario + ' begun snapshot');

    const firstPlayerId = state.turn.currentPlayerId;
    const firstClient = clientByPlayerId.get(firstPlayerId);
    assert.ok(firstClient, scenario + ': current player has no simulated client');
    const stolenTurnIndex = chooseCoveredCell(state);
    const nonActiveId = sessions.find(session => session.playerId !== firstPlayerId).playerId;
    const nonActiveClient = clientByPlayerId.get(nonActiveId);
    const unauthorizedCommand = makeCommand('FLAG', nonActiveId, state, stolenTurnIndex);
    const unauthorizedError = nonActiveClient.waitFor(
      'server:error',
      message => message.error?.code === 'NOT_ACTIVE_PLAYER'
    );
    nonActiveClient.sendCommand(unauthorizedCommand);
    const rejected = await unauthorizedError;
    assert.equal(rejected.error.code, 'NOT_ACTIVE_PLAYER', scenario + ': server accepted an out-of-turn command');

    let target = chooseCoveredCell(state);
    let turnId = state.turn.turnId;
    const moveCommand = makeCommand('MOVE', firstPlayerId, state, target);
    state = await executeCommand(
      clients,
      firstClient,
      moveCommand,
      snapshot => snapshot.players.find(player => player.id === firstPlayerId)?.pos === target &&
        snapshot.turn.currentPlayerId === firstPlayerId && snapshot.turn.turnId === turnId,
      'move'
    );
    assert.equal(state.turn.currentPlayerId, firstPlayerId, scenario + ': MOVE must not end the turn');

    const flagCommand = makeCommand('FLAG', firstPlayerId, state, target);
    state = await executeCommand(
      clients,
      firstClient,
      flagCommand,
      snapshot => snapshot.board.cells[target]?.flagOwner === firstPlayerId &&
        snapshot.turn.currentPlayerId !== firstPlayerId && snapshot.turn.turnId === turnId + 1,
      'flag'
    );
    assert.equal(state.turn.turnId, turnId + 1, scenario + ': FLAG must end exactly one turn');

    const duplicateErrorPromise = firstClient.waitFor(
      'server:error',
      message => message.error?.code === 'DUPLICATE_COMMAND'
    );
    firstClient.sendCommand(flagCommand);
    const duplicateError = await duplicateErrorPromise;
    assert.equal(duplicateError.error.code, 'DUPLICATE_COMMAND', scenario + ': duplicate command was not rejected');

    // Each remaining test agent takes one complete MOVE + FLAG turn.
    for (let turn = 0; turn < playerCount - 1; turn++) {
      const activeId = state.turn.currentPlayerId;
      const activeClient = clientByPlayerId.get(activeId);
      assert.ok(activeClient, scenario + ': active player has no simulated client');
      const cellIndex = chooseCoveredCell(state);
      const currentTurn = state.turn.turnId;
      const move = makeCommand('MOVE', activeId, state, cellIndex);
      state = await executeCommand(
        clients,
        activeClient,
        move,
        snapshot => snapshot.players.find(player => player.id === activeId)?.pos === cellIndex &&
          snapshot.turn.currentPlayerId === activeId && snapshot.turn.turnId === currentTurn,
        'move'
      );
      const flag = makeCommand('FLAG', activeId, state, cellIndex);
      state = await executeCommand(
        clients,
        activeClient,
        flag,
        snapshot => snapshot.board.cells[cellIndex]?.flagOwner === activeId &&
          snapshot.turn.currentPlayerId !== activeId && snapshot.turn.turnId === currentTurn + 1,
        'flag'
      );
    }

    assert.equal(state.turn.currentPlayerId, firstPlayerId, scenario + ': turn order did not return to its first player');
    const ownedFlags = state.board.cells.filter(cell => cell.flagOwner);
    assert.equal(ownedFlags.length, playerCount, scenario + ': expected one flag from each test agent');
    for (const player of state.players) {
      assert.equal(ownedFlags.filter(cell => cell.flagOwner === player.id).length, 1, scenario + ': a player flag was missing or duplicated');
    }

    const firstFlagIndex = ownedFlags.find(cell => cell.flagOwner === firstPlayerId).i;
    const unflagTurn = state.turn.turnId;
    const unflagCommand = makeCommand('UNFLAG', firstPlayerId, state, firstFlagIndex);
    state = await executeCommand(
      clients,
      firstClient,
      unflagCommand,
      snapshot => snapshot.board.cells[firstFlagIndex]?.flagOwner === null &&
        snapshot.turn.currentPlayerId !== firstPlayerId && snapshot.turn.turnId === unflagTurn + 1,
      'unflag'
    );
    assert.equal(state.board.cells[firstFlagIndex].flagOwner, null, scenario + ': own flag could not be removed');

    console.log('PASS AI multiplayer scenario ' + scenario);
    return {
      players: playerCount,
      boardSize,
      matchId,
      commandsVerified: playerCount * 2 + 1,
      snapshotClients: playerCount
    };
  } finally {
    for (const client of clients) client.terminate();
    await delay(30);
  }
}

async function main() {
  const port = await reservePort();
  const baseUrl = 'http://127.0.0.1:' + port;
  const child = spawn(process.execPath, [SERVER], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', NODE_ENV: 'test' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let output = '';
  child.stdout.on('data', chunk => { output += chunk.toString(); });
  child.stderr.on('data', chunk => { output += chunk.toString(); });

  const results = [];
  try {
    const health = await waitForHealth(baseUrl, child, () => output);
    console.log('Server ready: ' + health.version + ' at ' + baseUrl);
    let scenarioNumber = 0;
    for (const playerCount of COUNTS) {
      for (const boardSize of SIZES) {
        scenarioNumber++;
        results.push(await runScenario(port, playerCount, boardSize, scenarioNumber));
      }
    }
    const totalClients = results.reduce((sum, item) => sum + item.snapshotClients, 0);
    const totalCommands = results.reduce((sum, item) => sum + item.commandsVerified, 0);
    console.log('');
    console.log('AI MULTIPLAYER QA: PASS');
    console.log('Scenarios: ' + results.length);
    console.log('Simulated client sessions: ' + totalClients);
    console.log('Accepted game commands: ' + totalCommands);
    console.log('Coverage: players ' + COUNTS.join(', ') + '; boards ' + SIZES.join(', ') + '; hidden-mine redaction; shared snapshots; turn authority; MOVE/FLAG/UNFLAG; duplicate-command rejection.');
  } catch (error) {
    console.error('AI MULTIPLAYER QA: FAIL');
    console.error(error.stack || error.message || String(error));
    if (output) console.error('Server output:\n' + output);
    process.exitCode = 1;
  } finally {
    await stopServer(child);
  }
}

main();
