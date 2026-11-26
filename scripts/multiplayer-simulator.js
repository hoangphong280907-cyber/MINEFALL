'use strict';

const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const net = require('node:net');
const path = require('node:path');
const fs = require('node:fs');
const WebSocket = require('ws');

const ROOT = path.resolve(__dirname, '..');
const SERVER = path.join(ROOT, 'server', 'index.js');
const PLAYER_COUNTS = [2, 3, 4, 5];
const BOARD_SIZES = [8, 10, 12, 14, 16, 18, 20];
const DENSITIES = { easy: 0.25, medium: 0.35, hard: 0.5 };
const SCENARIO_TIMEOUT_MS = 90_000;
const MAX_GAME_ACTIONS = 1200;

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function reservePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(error => error ? reject(error) : resolve(port));
    });
  });
}

async function waitForHealth(url, child, readOutput) {
  const deadline = Date.now() + 12_000;
  let lastError = null;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error('Server exited before health check.\n' + readOutput());
    }
    try {
      const response = await fetch(url + '/health', { signal: AbortSignal.timeout(1000) });
      if (response.ok) {
        const health = await response.json();
        assert.equal(health.status, 'ok');
        return health;
      }
      lastError = new Error('HTTP ' + response.status);
    } catch (error) {
      lastError = error;
    }
    await delay(150);
  }
  throw new Error('Server health timeout: ' + (lastError?.message || 'unknown') + '\n' + readOutput());
}

class TestClient {
  constructor(socket, name) {
    this.socket = socket;
    this.name = name;
    this.messages = [];
    this.waiters = [];

    socket.on('message', raw => {
      let message;
      try {
        message = JSON.parse(raw.toString('utf8'));
      } catch (error) {
        this.rejectWaiters(new Error(this.name + ' received invalid JSON: ' + error.message));
        return;
      }
      this.dispatch(message);
    });

    socket.on('error', error => this.rejectWaiters(error));
    socket.on('close', (code, reason) => {
      this.rejectWaiters(new Error(this.name + ' socket closed (' + code + '): ' + reason.toString()));
    });
  }

  static connect(url, name) {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(url);
      let settled = false;
      socket.once('open', () => {
        settled = true;
        resolve(new TestClient(socket, name));
      });
      socket.once('error', error => {
        if (!settled) reject(error);
      });
    });
  }

  dispatch(message) {
    const index = this.waiters.findIndex(waiter => waiter.matches(message));
    if (index >= 0) {
      const waiter = this.waiters.splice(index, 1)[0];
      clearTimeout(waiter.timer);
      waiter.resolve(message);
      return;
    }
    this.messages.push(message);
    if (this.messages.length > 500) this.messages.shift();
  }

  rejectWaiters(error) {
    for (const waiter of this.waiters.splice(0)) {
      clearTimeout(waiter.timer);
      waiter.reject(error);
    }
  }

  waitFor(type, predicate = () => true, timeoutMs = 7000) {
    const matches = message => message?.type === type && predicate(message);
    const queuedIndex = this.messages.findIndex(matches);
    if (queuedIndex >= 0) return Promise.resolve(this.messages.splice(queuedIndex, 1)[0]);

    return new Promise((resolve, reject) => {
      const waiter = {
        matches,
        resolve,
        reject,
        timer: setTimeout(() => {
          const index = this.waiters.indexOf(waiter);
          if (index >= 0) this.waiters.splice(index, 1);
          reject(new Error(this.name + ' timed out waiting for ' + type));
        }, timeoutMs)
      };
      this.waiters.push(waiter);
    });
  }

  send(type, payload = {}) {
    if (this.socket.readyState !== WebSocket.OPEN) throw new Error(this.name + ' socket is not open');
    this.socket.send(JSON.stringify({ type, payload }));
  }

  sendEnvelope(message) {
    if (this.socket.readyState !== WebSocket.OPEN) throw new Error(this.name + ' socket is not open');
    this.socket.send(JSON.stringify(message));
  }

  close() {
    if (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING) {
      this.socket.terminate();
    }
  }
}

function makeCommand(state, playerId, type, index, commandId) {
  return {
    protocolVersion: 1,
    type,
    playerId,
    matchId: state.matchId,
    turnId: state.turn.turnId,
    commandId,
    payload: { index }
  };
}

async function sendSuccessfulCommand(client, command) {
  const ack = client.waitFor('command:ack', message =>
    message.commandId === command.commandId && message.accepted === true
  );
  client.sendEnvelope({ type: 'game:command', command });
  return ack;
}

async function waitForAllStates(clients, predicate, label) {
  const messages = await Promise.all(clients.map(client =>
    client.waitFor('match:state', message => predicate(message.state), 10_000)
  ));
  const reference = JSON.stringify(messages[0].state);
  for (let index = 1; index < messages.length; index++) {
    assert.equal(
      JSON.stringify(messages[index].state),
      reference,
      label + ': public match state differs for client ' + (index + 1)
    );
  }
  return messages[0].state;
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

function makeSeededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

function assertPublicBoard(state, size, difficulty, playerCount) {
  const board = state.board;
  assert.equal(board.size, size, 'selected board size must be authoritative');
  assert.equal(board.cells.length, size * size, 'board cell count must match dimensions');
  assert.equal(board.mineCount, Math.round(size * size * DENSITIES[difficulty]), 'mine count must match selected difficulty');
  assert.equal(board.zone.length, 5, 'spawn pad must contain five unique cells');
  assert.ok(board.clueRing.length >= 10 && board.clueRing.length <= 15, 'clue ring must contain 10–15 cells');

  const opening = new Set([...board.zone, ...board.clueRing]);
  assert.ok(opening.size >= 15 && opening.size <= 20, 'opening cluster must contain 15–20 unique cells');
  for (const index of opening) {
    const cell = board.cells[index];
    assert.ok(cell, 'opening index must exist');
    assert.equal(cell.revealed, true, 'opening cell must be revealed');
    assert.equal(cell.mine, false, 'opening cell must be known safe');
  }

  for (const cell of board.cells) {
    if (!cell.revealed && !cell.exploded && !cell.endRevealed) {
      assert.equal(cell.mine, null, 'hidden mine state must not leak');
      assert.equal(cell.adj, null, 'hidden adjacent-mine count must not leak');
    }
  }

  assert.equal(state.players.length, playerCount, 'match roster must contain every connected player');
  assert.equal(new Set(state.players.map(player => player.id)).size, playerCount, 'player IDs must be unique');
  assert.equal(new Set(state.players.map(player => player.pos)).size, playerCount, 'spawn positions must be unique');
  for (const player of state.players) {
    assert.ok(board.zone.includes(player.pos), 'every player must spawn inside the safe pad');
  }
}

async function runScenario({ clientsCount, boardSize, difficulty, wsUrl, scenarioNumber }) {
  const clients = [];
  const startedAt = Date.now();
  let commandSequence = 0;
  let acceptedActions = 0;
  let rejectedActions = 0;
  let state = null;
  let roomCode = null;
  const random = makeSeededRandom(scenarioNumber * 7919 + clientsCount * 97 + boardSize);
  const nextCommandId = () => 'sim-' + scenarioNumber + '-' + (++commandSequence);

  const deadline = setTimeout(() => {
    for (const client of clients) client.close();
  }, SCENARIO_TIMEOUT_MS);
  deadline.unref?.();

  try {
    for (let index = 0; index < clientsCount; index++) {
      const client = await TestClient.connect(wsUrl, 'scenario-' + scenarioNumber + '-player-' + (index + 1));
      clients.push(client);
      const hello = await client.waitFor('system:hello', message => message.protocolVersion === 1);
      assert.equal(hello.protocolVersion, 1);
    }

    const host = clients[0];
    const hostSessionPromise = host.waitFor('room:session', message => message.resumed === false);
    host.send('room:create', {
      name: 'AI Host ' + scenarioNumber,
      config: { boardSize, difficulty, maxPlayers: clientsCount, matchDurationMinutes: 10 },
      identity: 'sim-host-' + scenarioNumber + '-identity'
    });
    const hostSession = await hostSessionPromise;
    roomCode = hostSession.roomCode;
    assert.match(roomCode, /^[A-Z0-9]{6}$/);

    for (let index = 1; index < clientsCount; index++) {
      const client = clients[index];
      const sessionPromise = client.waitFor('room:session', message => message.resumed === false);
      client.send('room:join', {
        code: roomCode,
        name: 'AI Player ' + index,
        identity: 'sim-player-' + scenarioNumber + '-' + index + '-identity'
      });
      const session = await sessionPromise;
      assert.notEqual(session.playerId, hostSession.playerId);
    }

    const readyWaiters = clients.map(client =>
      client.waitFor('room:update', message =>
        message.room?.status === 'ready' &&
        message.room?.players?.length === clientsCount &&
        message.room.players.every(player => player.ready && player.connected)
      )
    );
    for (const client of clients) client.send('player:ready', { ready: true });
    const readyRooms = await Promise.all(readyWaiters);
    assert.ok(readyRooms.every(message => message.room.players.length === clientsCount));

    const initialStateWaiters = clients.map(client =>
      client.waitFor('match:state', message => message.state?.matchId)
    );
    host.send('match:start');
    const initialMessages = await Promise.all(initialStateWaiters);
    state = initialMessages[0].state;
    const initialSerialized = JSON.stringify(state);
    for (const message of initialMessages) {
      assert.equal(JSON.stringify(message.state), initialSerialized, 'all clients must receive identical initial snapshots');
    }

    assert.equal(state.status, 'waiting');
    assert.equal(state.started, false);
    assertPublicBoard(state, boardSize, difficulty, clientsCount);

    const rouletteWaiters = clients.map(client => client.waitFor('match:roulette:start'));
    host.send('match:roulette:activate');
    await Promise.all(rouletteWaiters);

    const beginAckPromise = host.waitFor('match:begin:ack', message => message.accepted === true);
    const runningStateWaiters = clients.map(client =>
      client.waitFor('match:state', message => message.state?.matchId === state.matchId && message.state?.started === true)
    );
    host.send('match:begin', { matchId: state.matchId });
    await beginAckPromise;
    const runningMessages = await Promise.all(runningStateWaiters);
    state = runningMessages[0].state;
    const runningSerialized = JSON.stringify(state);
    for (const message of runningMessages) {
      assert.equal(JSON.stringify(message.state), runningSerialized, 'running snapshot must be identical for all clients');
    }
    assert.equal(state.status, 'playing');
    assertPublicBoard(state, boardSize, difficulty, clientsCount);

    const roomUpdatePromises = clients.map(client => {
      const promise = client.waitFor('room:update', message => message.room?.players?.length === clientsCount);
      client.send('state:request');
      return promise;
    });
    const roomUpdates = await Promise.all(roomUpdatePromises);
    const clientByPlayerId = new Map(roomUpdates.map((message, index) => [message.selfPlayerId, clients[index]]));
    for (const player of state.players) {
      assert.ok(clientByPlayerId.has(player.id), 'each authoritative player must map to one test client');
    }

    const activeId = state.turn.currentPlayerId;
    const activeClient = clientByPlayerId.get(activeId);
    const nonActivePlayer = state.players.find(player => player.id !== activeId);
    const nonActiveClient = clientByPlayerId.get(nonActivePlayer.id);
    let hidden = state.board.cells.filter(cell => !cell.revealed && !cell.zone && !cell.flagOwner);
    assert.ok(hidden.length >= 4, 'there must be covered cells to exercise game commands');
    const firstIndex = hidden[0].i;
    const secondIndex = hidden[1].i;

    const wrongTurnErrorPromise = nonActiveClient.waitFor('server:error', message => message.error?.code === 'NOT_ACTIVE_PLAYER');
    nonActiveClient.sendEnvelope({
      type: 'game:command',
      command: makeCommand(state, nonActivePlayer.id, 'MOVE', firstIndex, nextCommandId())
    });
    const wrongTurnError = await wrongTurnErrorPromise;
    assert.equal(wrongTurnError.error.code, 'NOT_ACTIVE_PLAYER');
    rejectedActions++;

    const stateRequestPromise = nonActiveClient.waitFor('match:state', message => message.state?.matchId === state.matchId);
    nonActiveClient.send('state:request');
    const afterWrongTurn = (await stateRequestPromise).state;
    assert.equal(afterWrongTurn.turn.turnId, state.turn.turnId, 'rejected non-active command must not advance the turn');
    assert.equal(afterWrongTurn.turn.currentPlayerId, activeId);
    state = afterWrongTurn;

    const moveOne = makeCommand(state, activeId, 'MOVE', firstIndex, nextCommandId());
    const moveOneStateWaiters = clients.map(client => client.waitFor('match:state', message =>
      message.state?.turn?.turnId === state.turn.turnId &&
      message.state?.lastAction?.type === 'move' &&
      message.state?.lastAction?.playerId === activeId &&
      message.state?.lastAction?.index === firstIndex
    ));
    await sendSuccessfulCommand(activeClient, moveOne);
    acceptedActions++;
    const moveOneStates = await Promise.all(moveOneStateWaiters);
    state = moveOneStates[0].state;
    assert.equal(state.turn.currentPlayerId, activeId, 'MOVE must not consume the turn');

    const duplicateErrorPromise = activeClient.waitFor('server:error', message => message.error?.code === 'DUPLICATE_COMMAND');
    activeClient.sendEnvelope({ type: 'game:command', command: moveOne });
    const duplicateError = await duplicateErrorPromise;
    assert.equal(duplicateError.error.code, 'DUPLICATE_COMMAND');
    rejectedActions++;

    const moveTwo = makeCommand(state, activeId, 'MOVE', secondIndex, nextCommandId());
    const moveTwoStateWaiters = clients.map(client => client.waitFor('match:state', message =>
      message.state?.turn?.turnId === state.turn.turnId &&
      message.state?.lastAction?.type === 'move' &&
      message.state?.lastAction?.playerId === activeId &&
      message.state?.lastAction?.index === secondIndex
    ));
    await sendSuccessfulCommand(activeClient, moveTwo);
    acceptedActions++;
    const moveTwoStates = await Promise.all(moveTwoStateWaiters);
    state = moveTwoStates[0].state;
    assert.equal(state.turn.currentPlayerId, activeId, 'second MOVE must still be in the same turn');
    assert.equal(state.turn.turnId, moveOneStates[0].state.turn.turnId);

    const flagCommand = makeCommand(state, activeId, 'FLAG', secondIndex, nextCommandId());
    const afterFlagWaiters = clients.map(client => client.waitFor('match:state', message =>
      message.state?.ended || message.state?.turn?.turnId > state.turn.turnId
    ));
    await sendSuccessfulCommand(activeClient, flagCommand);
    acceptedActions++;
    state = (await Promise.all(afterFlagWaiters))[0].state;
    assert.equal(state.board.cells[secondIndex].flagOwner, activeId, 'flag ownership must be authoritative');
    assert.notEqual(state.turn.currentPlayerId, activeId, 'FLAG must consume the turn');

    const flagOwner = activeId;
    const challengerId = state.turn.currentPlayerId;
    const challenger = clientByPlayerId.get(challengerId);
    const sameFlagMove = makeCommand(state, challengerId, 'MOVE', secondIndex, nextCommandId());
    await sendSuccessfulCommand(challenger, sameFlagMove);
    acceptedActions++;
    const afterMoveRequest = challenger.waitFor('match:state', message => message.state?.matchId === state.matchId);
    challenger.send('state:request');
    state = (await afterMoveRequest).state;

    const rejectedUnflagPromise = challenger.waitFor('server:error', message =>
      /chỉ cho phép gỡ cờ do chính bạn đặt/i.test(message.error?.message || '')
    );
    challenger.sendEnvelope({
      type: 'game:command',
      command: makeCommand(state, challengerId, 'UNFLAG', secondIndex, nextCommandId())
    });
    const rejectedUnflag = await rejectedUnflagPromise;
    assert.match(rejectedUnflag.error.message, /chỉ cho phép gỡ cờ do chính bạn đặt/i);
    rejectedActions++;

    const afterRejectedUnflagPromise = challenger.waitFor('match:state', message => message.state?.matchId === state.matchId);
    challenger.send('state:request');
    const afterRejectedUnflag = (await afterRejectedUnflagPromise).state;
    assert.equal(afterRejectedUnflag.turn.turnId, state.turn.turnId, 'rejected opponent UNFLAG must not advance the turn');
    assert.equal(afterRejectedUnflag.turn.currentPlayerId, challengerId);
    assert.equal(afterRejectedUnflag.board.cells[secondIndex].flagOwner, flagOwner);
    state = afterRejectedUnflag;

    while (!state.ended && acceptedActions < MAX_GAME_ACTIONS) {
      const currentId = state.turn.currentPlayerId;
      const currentClient = clientByPlayerId.get(currentId);
      assert.ok(currentClient, 'current active player must have a connected test client');

      hidden = state.board.cells.filter(cell => !cell.revealed && !cell.zone && !cell.flagOwner);
      assert.ok(hidden.length, 'there must be a covered cell while multiple players survive');
      const selected = hidden[Math.floor(random() * hidden.length)];
      const move = makeCommand(state, currentId, 'MOVE', selected.i, nextCommandId());
      await sendSuccessfulCommand(currentClient, move);
      acceptedActions++;

      const dig = makeCommand(state, currentId, 'DIG', selected.i, nextCommandId());
      const currentTurn = state.turn.turnId;
      const nextStateWaiters = clients.map(client => client.waitFor('match:state', message =>
        message.state?.matchId === state.matchId &&
        (message.state?.ended || message.state?.turn?.turnId > currentTurn)
      ));
      await sendSuccessfulCommand(currentClient, dig);
      acceptedActions++;
      state = (await Promise.all(nextStateWaiters))[0].state;
    }

    assert.equal(state.ended, true, 'public-information gameplay must reach an authoritative end state');
    assert.ok(['survivor', 'everyone-eliminated', 'timeout', 'all-flags'].includes(state.endReason), 'match must use a known end reason');
    assert.equal(state.results?.players?.length, clientsCount, 'final results must include every participant');
    assert.equal(new Set(state.results.players.map(player => player.id)).size, clientsCount, 'final results must not duplicate players');
    for (const cell of state.board.cells) {
      assert.equal(typeof cell.mine, 'boolean', 'all mine locations must be revealed at match end');
    }
    for (const result of state.results.players) {
      assert.ok(Number.isFinite(result.totalScore), 'every player must have a finite final score');
      assert.ok(Number.isInteger(result.place) && result.place >= 1 && result.place <= clientsCount, 'every player must receive a valid placement');
    }

    state = await waitForAllStates(clients, snapshot =>
      snapshot?.matchId === state.matchId && snapshot.ended === true,
    'final results');
    return {
      players: clientsCount,
      boardSize,
      difficulty,
      mineCount: state.board.mineCount,
      turnCount: state.turn.turnId,
      acceptedActions,
      rejectedActions,
      eliminated: state.players.filter(player => !player.alive).length,
      endReason: state.endReason,
      durationMs: Date.now() - startedAt
    };
  } finally {
    clearTimeout(deadline);
    if (roomCode) {
      for (const client of clients) {
        if (client.socket.readyState !== WebSocket.OPEN) continue;
        try {
          const left = client.waitFor('room:left', () => true, 1200);
          client.send('room:leave');
          await left;
        } catch {}
      }
    }
    for (const client of clients) client.close();
  }
}

async function main() {
  const port = await reservePort();
  const baseUrl = 'http://127.0.0.1:' + port;
  const wsUrl = 'ws://127.0.0.1:' + port + '/ws';
  const child = spawn(process.execPath, [SERVER], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', NODE_ENV: 'test' },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let serverOutput = '';
  child.stdout.on('data', chunk => { serverOutput += chunk.toString(); });
  child.stderr.on('data', chunk => { serverOutput += chunk.toString(); });

  const results = [];
  const failures = [];
  const startedAt = Date.now();
  let scenarioNumber = 0;

  try {
    const health = await waitForHealth(baseUrl, child, () => serverOutput);
    assert.equal(health.version, require('../package.json').version);

    for (const players of PLAYER_COUNTS) {
      for (let index = 0; index < BOARD_SIZES.length; index++) {
        scenarioNumber++;
        const boardSize = BOARD_SIZES[index];
        const difficulty = ['easy', 'medium', 'hard'][(scenarioNumber - 1) % 3];
        try {
          const result = await runScenario({
            clientsCount: players,
            boardSize,
            difficulty,
            wsUrl,
            scenarioNumber
          });
          results.push(result);
          console.log(
            'PASS multiplayer ' + players + 'P ' + boardSize + 'x' + boardSize +
            ' ' + difficulty + ': ' + result.turnCount + ' turns, ' +
            result.eliminated + ' eliminated, end=' + result.endReason
          );
        } catch (error) {
          failures.push({
            players,
            boardSize,
            difficulty,
            message: error?.stack || String(error)
          });
          console.error(
            'FAIL multiplayer ' + players + 'P ' + boardSize + 'x' + boardSize +
            ' ' + difficulty + ': ' + (error?.message || error)
          );
        }
      }
    }

    const report = {
      version: require('../package.json').version,
      createdAt: new Date().toISOString(),
      server: baseUrl,
      scenarios: scenarioNumber,
      passed: results.length,
      failed: failures.length,
      durationMs: Date.now() - startedAt,
      results,
      failures
    };
    const artifactDir = path.join(ROOT, 'artifacts');
    fs.mkdirSync(artifactDir, { recursive: true });
    const reportPath = path.join(artifactDir, 'multiplayer-qa-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');

    if (process.env.GITHUB_STEP_SUMMARY) {
      const summary = [
        '# MINEFALL AI multiplayer QA',
        '',
        '- Version: ' + report.version,
        '- Scenarios: **' + report.passed + '/' + report.scenarios + ' passed**',
        '- Duration: ' + Math.round(report.durationMs / 1000) + 's',
        '',
        '| Players | Board | Difficulty | Turns | Eliminated | Result |',
        '|---:|---:|---|---:|---:|---|',
        ...results.map(item =>
          '| ' + item.players + ' | ' + item.boardSize + 'x' + item.boardSize + ' | ' +
          item.difficulty + ' | ' + item.turnCount + ' | ' + item.eliminated + ' | ' + item.endReason + ' |'
        ),
        '',
        'JSON report: artifacts/multiplayer-qa-report.json',
        failures.length ? '\n## Failures\n\n' + failures.map(item =>
          '- ' + item.players + 'P ' + item.boardSize + 'x' + item.boardSize + ': ' + item.message
        ).join('\n') : ''
      ].join('\n');
      fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary + '\n');
    }

    console.log('\nAI multiplayer QA: ' + results.length + '/' + scenarioNumber + ' scenarios passed in ' +
      Math.round((Date.now() - startedAt) / 1000) + 's.');
    console.log('Report written to artifacts/multiplayer-qa-report.json');

    if (failures.length) {
      process.exitCode = 1;
      console.error(failures.length + ' scenario(s) failed.');
    }
  } catch (error) {
    console.error('AI multiplayer simulator failed before completing the matrix.');
    console.error(error?.stack || error);
    console.error(serverOutput);
    process.exitCode = 1;
  } finally {
    await stopServer(child);
  }
}

main().catch(error => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
