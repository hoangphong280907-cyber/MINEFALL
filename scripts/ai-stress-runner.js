'use strict';

const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const net = require('node:net');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { performance } = require('node:perf_hooks');
const WebSocket = require('ws');
const packageInfo = require('../package.json');

const ROOT = path.resolve(__dirname, '..');
const SERVER = path.join(ROOT, 'server', 'index.js');
const PLAYER_COUNT = 5;
const BOARD_SIZES = [8, 12, 16, 20, 10, 14, 18, 20, 12, 16, 8, 18];
const WAIT_MS = 8000;

function positiveInt(name, fallback, min, max) {
  const raw = process.env[name];
  const value = raw === undefined ? fallback : Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new RangeError(name + ' must be an integer from ' + min + ' to ' + max);
  }
  return value;
}

const ROOM_COUNT = positiveInt('MINEFALL_STRESS_ROOMS', 6, 2, BOARD_SIZES.length);
const BATCH_COUNT = positiveInt('MINEFALL_STRESS_BATCHES', 3, 1, 4);
const RECONNECT_CYCLES = positiveInt('MINEFALL_STRESS_RECONNECT_CYCLES', 3, 1, 5);
const TURNS_PER_ROOM = positiveInt('MINEFALL_STRESS_TURNS', 5, 1, 10);
const CURSOR_BURST_PER_PLAYER = positiveInt('MINEFALL_STRESS_CURSOR_BURST', 12, 1, 40);
const MAX_HEAP_GROWTH_BYTES = 24 * 1024 * 1024;

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

class LoadClient {
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
    socket.on('error', error => { this.closeError = error; });
    socket.on('close', (code, reason) => {
      this.closeError = new Error(this.label + ' socket closed (' + code + '): ' + reason.toString());
      this.rejectWaiters(this.closeError);
    });
  }

  dispatch(message) {
    const index = this.waiters.findIndex(waiter => waiter.matches(message));
    if (index < 0) {
      this.messages.push(message);
      if (this.messages.length > 1000) this.messages.shift();
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
    const types = Array.isArray(type) ? type : [type];
    const matches = message => message && types.includes(message.type) && predicate(message);
    const queuedIndex = this.messages.findIndex(matches);
    if (queuedIndex >= 0) return Promise.resolve(this.messages.splice(queuedIndex, 1)[0]);
    if (this.socket.readyState === WebSocket.CLOSED) {
      return Promise.reject(this.closeError || new Error(this.label + ' socket is closed'));
    }

    const pending = new Promise((resolve, reject) => {
      const waiter = {
        matches, resolve, reject,
        timer: setTimeout(() => {
          const index = this.waiters.indexOf(waiter);
          if (index >= 0) this.waiters.splice(index, 1);
          reject(this.closeError || new Error(this.label + ' timed out waiting for ' + types.join(' or ')));
        }, timeoutMs)
      };
      this.waiters.push(waiter);
    });
    pending.catch(() => {});
    return pending;
  }

  send(type, payload = {}) {
    assert.equal(this.socket.readyState, WebSocket.OPEN, this.label + ' socket is not open');
    this.socket.send(JSON.stringify({ type, payload }));
  }

  sendCommand(command) {
    assert.equal(this.socket.readyState, WebSocket.OPEN, this.label + ' socket is not open');
    this.socket.send(JSON.stringify({ type: 'game:command', command }));
  }

  terminate() {
    if (this.socket.readyState !== WebSocket.CLOSED) this.socket.terminate();
  }

  async closeGracefully() {
    if (this.socket.readyState === WebSocket.CLOSED) return;
    const closed = new Promise(resolve => this.socket.once('close', resolve));
    if (this.socket.readyState === WebSocket.OPEN) this.socket.close(1000, 'stress cleanup');
    await Promise.race([closed, delay(1500)]);
    if (this.socket.readyState !== WebSocket.CLOSED) this.socket.terminate();
    await Promise.race([closed, delay(250)]);
  }
}

async function connectClient(url, label) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    const client = new LoadClient(socket, label);
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
    if (child.exitCode !== null) throw new Error('Stress server exited before health check.\n' + readOutput());
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
    await delay(100);
  }
  throw new Error('Stress server health timeout: ' + (lastError?.message || 'unknown') + '\n' + readOutput());
}

async function getMetrics(baseUrl, collectGarbage = false) {
  const response = await fetch(baseUrl + '/__test/metrics' + (collectGarbage ? '?gc=1' : ''), {
    signal: AbortSignal.timeout(2000),
    cache: 'no-store'
  });
  assert.equal(response.status, 200, 'test-only metrics endpoint must be enabled for the local stress server');
  const metrics = await response.json();
  assert.equal(typeof metrics.memory?.heapUsed, 'number');
  assert.equal(typeof metrics.memory?.rss, 'number');
  assert.equal(typeof metrics.rooms, 'number');
  assert.equal(typeof metrics.connectedClients, 'number');
  return metrics;
}

async function stopServer(child) {
  if (child.exitCode !== null) return;
  child.kill('SIGTERM');
  await Promise.race([new Promise(resolve => child.once('exit', resolve)), delay(2500)]);
  if (child.exitCode === null) {
    child.kill('SIGKILL');
    await Promise.race([new Promise(resolve => child.once('exit', resolve)), delay(1000)]);
  }
}

function stateForAll(group, predicate) {
  return Promise.all(group.clients.map(client => client.waitFor(
    'match:state',
    message => message.state?.matchId === group.matchId && predicate(message.state)
  )));
}

function assertSnapshotsEqual(messages, context) {
  assert.ok(messages.length > 0, context + ': missing snapshots');
  const expected = JSON.stringify(messages[0].state);
  for (const message of messages.slice(1)) {
    assert.equal(JSON.stringify(message.state), expected, context + ': clients disagree on authoritative state');
  }
}

function hiddenMinesAreRedacted(state, context) {
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
    commandId: 'stress-' + randomUUID(),
    payload: { index }
  };
}

function chooseCoveredCell(state) {
  const cell = state.board.cells.find(item => !item.revealed && !item.zone && !item.flagOwner);
  assert.ok(cell, 'no covered cell left for stress actions');
  return cell.i;
}

async function createRoomGroup(wsUrl, batch, roomIndex, boardSize, allClients, timings) {
  const label = 'batch-' + batch + '-room-' + roomIndex;
  const clients = [];
  const clientByPlayerId = new Map();
  const tokens = new Map();
  const startedAt = performance.now();

  const addClient = async playerIndex => {
    const client = await connectClient(wsUrl, label + '-player-' + playerIndex);
    clients.push(client);
    allClients.add(client);
    await client.waitFor('system:hello', message => message.protocolVersion === 1);
    return client;
  };

  const host = await addClient(0);
  const hostSessionPromise = host.waitFor('room:session', message => message.resumed === false);
  host.send('room:create', {
    name: 'Stress Host',
    config: { boardSize, difficulty: 'easy', maxPlayers: PLAYER_COUNT, matchDurationMinutes: 10 },
    identity: 'stress-host-' + batch + '-' + roomIndex + '-' + randomUUID()
  });
  const hostSession = await hostSessionPromise;
  const roomCode = hostSession.roomCode;
  clientByPlayerId.set(hostSession.playerId, host);
  tokens.set(hostSession.playerId, hostSession.resumeToken);
  const playerIds = [hostSession.playerId];

  for (let playerIndex = 1; playerIndex < PLAYER_COUNT; playerIndex++) {
    const guest = await addClient(playerIndex);
    const sessionPromise = guest.waitFor('room:session', message => message.resumed === false);
    guest.send('room:join', {
      code: roomCode,
      name: 'Stress Player ' + playerIndex,
      identity: 'stress-guest-' + batch + '-' + roomIndex + '-' + playerIndex + '-' + randomUUID()
    });
    const session = await sessionPromise;
    playerIds.push(session.playerId);
    clientByPlayerId.set(session.playerId, guest);
    tokens.set(session.playerId, session.resumeToken);
  }

  const lobbyUpdates = await Promise.all(clients.map(client =>
    client.waitFor('room:update', message => message.room?.players?.length === PLAYER_COUNT)
  ));
  for (const update of lobbyUpdates) {
    assert.equal(update.room.code, roomCode);
    assert.equal(update.room.config.boardSize, boardSize);
    assert.equal(update.room.config.maxPlayers, PLAYER_COUNT);
  }

  const readyWaiters = clients.map(client => client.waitFor('room:update', message => message.room?.status === 'ready'));
  for (const client of clients) client.send('player:ready', { ready: true });
  await Promise.all(readyWaiters);

  const initialWaiters = clients.map(client => client.waitFor('match:state', message => Boolean(message.state?.matchId)));
  host.send('match:start');
  const initialMessages = await Promise.all(initialWaiters);
  const state = initialMessages[0].state;
  const matchId = state.matchId;
  assert.equal(state.players.length, PLAYER_COUNT);
  assert.equal(state.board.size, boardSize);
  assert.equal(state.board.cells.length, boardSize * boardSize);
  assert.equal(new Set(state.players.map(player => player.pos)).size, PLAYER_COUNT);
  assertSnapshotsEqual(initialMessages, label + ' initial state');
  hiddenMinesAreRedacted(state, label + ' initial state');

  const rouletteWaiters = clients.map(client => client.waitFor('match:roulette:start'));
  clients[PLAYER_COUNT - 1].send('match:roulette:activate');
  await Promise.all(rouletteWaiters);

  const begunWaiters = stateForAll(
    { clients, matchId },
    snapshot => snapshot.started === true
  );
  const beginAck = host.waitFor('match:begin:ack', message => message.accepted === true);
  host.send('match:begin', { matchId });
  const [begunSnapshots] = await Promise.all([Promise.all(begunWaiters), beginAck]);
  assertSnapshotsEqual(begunSnapshots, label + ' begun state');

  const group = {
    label, roomCode, boardSize, clients, clientByPlayerId, playerIds, tokens,
    matchId, state: begunSnapshots[0].state
  };
  timings.roomSetupMs.push(performance.now() - startedAt);
  return group;
}

async function executeTurn(group, latencySamples) {
  const state = group.state;
  const playerId = state.turn.currentPlayerId;
  const client = group.clientByPlayerId.get(playerId);
  assert.ok(client, group.label + ': active player has no open simulated client');
  const index = chooseCoveredCell(state);
  const turnId = state.turn.turnId;

  const move = makeCommand('MOVE', playerId, state, index);
  let started = performance.now();
  const moveAck = client.waitFor('command:ack', message => message.commandId === move.commandId && message.accepted);
  const moveStates = stateForAll(group, snapshot =>
    snapshot.lastAction?.type === 'move' &&
    snapshot.lastAction?.playerId === playerId &&
    snapshot.lastAction?.index === index &&
    snapshot.turn.turnId === turnId &&
    snapshot.turn.currentPlayerId === playerId
  );
  client.sendCommand(move);
  const [moveAcknowledgement, moveSnapshots] = await Promise.all([moveAck, moveStates]);
  latencySamples.push(performance.now() - started);
  assert.equal(moveAcknowledgement.action, 'move');
  assertSnapshotsEqual(moveSnapshots, group.label + ' MOVE');
  group.state = moveSnapshots[0].state;

  const flag = makeCommand('FLAG', playerId, group.state, index);
  started = performance.now();
  const flagAck = client.waitFor('command:ack', message => message.commandId === flag.commandId && message.accepted);
  const flagStates = stateForAll(group, snapshot =>
    snapshot.lastAction?.type === 'flag' &&
    snapshot.lastAction?.playerId === playerId &&
    snapshot.lastAction?.index === index &&
    snapshot.turn.turnId === turnId + 1 &&
    snapshot.board.cells[index]?.flagOwner === playerId
  );
  client.sendCommand(flag);
  const [flagAcknowledgement, flagSnapshots] = await Promise.all([flagAck, flagStates]);
  latencySamples.push(performance.now() - started);
  assert.equal(flagAcknowledgement.action, 'flag');
  assertSnapshotsEqual(flagSnapshots, group.label + ' FLAG');
  hiddenMinesAreRedacted(flagSnapshots[0].state, group.label + ' FLAG');
  group.state = flagSnapshots[0].state;
}

async function cursorBurst(group) {
  const finalEvents = [];
  for (let playerIndex = 0; playerIndex < group.playerIds.length; playerIndex++) {
    const playerId = group.playerIds[playerIndex];
    const lastIndex = (playerIndex * 31 + (CURSOR_BURST_PER_PLAYER - 1) * 17) % (group.boardSize * group.boardSize);
    for (const recipient of group.clients) {
      finalEvents.push(recipient.waitFor(
        'game:cursor',
        message => message.playerId === playerId && message.index === lastIndex
      ));
    }
  }

  for (let playerIndex = 0; playerIndex < group.playerIds.length; playerIndex++) {
    const client = group.clientByPlayerId.get(group.playerIds[playerIndex]);
    for (let cursor = 0; cursor < CURSOR_BURST_PER_PLAYER; cursor++) {
      const index = (playerIndex * 31 + cursor * 17) % (group.boardSize * group.boardSize);
      client.send('game:cursor', { index });
    }
  }
  await Promise.all(finalEvents);
}

async function reconnectOnePlayer(group, playerId, cycle, allClients, reconnectSamples, wsUrl) {
  const oldClient = group.clientByPlayerId.get(playerId);
  assert.ok(oldClient, group.label + ': cannot reconnect missing client');
  const oldToken = group.tokens.get(playerId);
  const survivors = group.clients.filter(client => client !== oldClient);
  assert.ok(survivors.length > 0);

  const disconnectUpdates = survivors.map(client => client.waitFor(
    'room:update',
    message => message.room?.players?.some(player => player.id === playerId && player.connected === false)
  ));
  oldClient.terminate();
  await Promise.all(disconnectUpdates);
  allClients.delete(oldClient);

  const startedAt = performance.now();
  const replacement = await connectClient(
    oldClient.socket.url,
    group.label + '-reconnect-' + cycle + '-' + playerId
  );
  allClients.add(replacement);
  await replacement.waitFor('system:hello', message => message.protocolVersion === 1);
  const sessionPromise = replacement.waitFor('room:session', message => message.resumed === true);
  const matchPromise = replacement.waitFor(
    'match:state',
    message => message.state?.matchId === group.matchId && message.state?.started === true
  );
  const onlineUpdate = survivors[0].waitFor(
    'room:update',
    message => message.room?.players?.some(player => player.id === playerId && player.connected === true)
  );
  replacement.send('room:resume', { resumeToken: oldToken });
  const [session, restoredMatch] = await Promise.all([sessionPromise, matchPromise, onlineUpdate]).then(values => [values[0], values[1]]);
  assert.equal(session.playerId, playerId);
  assert.equal(session.roomCode, group.roomCode);
  assert.notEqual(session.resumeToken, oldToken, group.label + ': resume token did not rotate');
  assert.equal(restoredMatch.state.matchId, group.matchId);
  group.tokens.set(playerId, session.resumeToken);
  group.clientByPlayerId.set(playerId, replacement);
  const oldIndex = group.clients.indexOf(oldClient);
  assert.ok(oldIndex >= 0);
  group.clients[oldIndex] = replacement;
  reconnectSamples.push(performance.now() - startedAt);
}

async function cleanupRoom(group) {
  const survivorId = group.playerIds[group.playerIds.length - 1];
  const survivor = group.clientByPlayerId.get(survivorId);
  const leavers = group.playerIds.filter(playerId => playerId !== survivorId);

  for (let index = 0; index < leavers.length; index++) {
    const client = group.clientByPlayerId.get(leavers[index]);
    const left = client.waitFor('room:left');
    if (index === leavers.length - 1) {
      // The final leaving player causes the sole remaining survivor to receive the results snapshot.
      var matchEnd = survivor.waitFor(
        'match:state',
        message => message.state?.matchId === group.matchId && message.state?.ended === true
      );
    }
    client.send('room:leave');
    await left;
    if (index === leavers.length - 1) await matchEnd;
  }

  const returned = survivor.waitFor('match:returned');
  survivor.send('match:return');
  await returned;
  const survivorLeft = survivor.waitFor('room:left');
  survivor.send('room:leave');
  await survivorLeft;
}

async function runBatch({ wsUrl, baseUrl, batch, allClients, stats }) {
  const groups = [];
  const metrics = [];
  const baseline = await getMetrics(baseUrl, true);
  metrics.push(baseline);

  const createStart = performance.now();
  const selectedSizes = BOARD_SIZES.slice(0, ROOM_COUNT);
  const created = await Promise.all(selectedSizes.map((size, index) =>
    createRoomGroup(wsUrl, batch, index + 1, size, allClients, stats)
  ));
  groups.push(...created);
  stats.batchSetupMs.push(performance.now() - createStart);

  const active = await getMetrics(baseUrl, true);
  metrics.push(active);
  assert.equal(active.rooms, ROOM_COUNT, 'server room count must equal active load rooms');
  assert.equal(active.connectedClients, ROOM_COUNT * PLAYER_COUNT, 'server connection count must equal active virtual clients');

  for (let cycle = 0; cycle < RECONNECT_CYCLES; cycle++) {
    await Promise.all(groups.map(group =>
      reconnectOnePlayer(group, group.playerIds[cycle % PLAYER_COUNT], cycle, allClients, stats.reconnectMs, wsUrl)
    ));
    const connected = await getMetrics(baseUrl, false);
    assert.equal(connected.rooms, ROOM_COUNT);
    assert.equal(connected.connectedClients, ROOM_COUNT * PLAYER_COUNT);
    metrics.push(connected);
  }

  await Promise.all(groups.map(cursorBurst));
  for (let turn = 0; turn < TURNS_PER_ROOM; turn++) {
    await Promise.all(groups.map(group => executeTurn(group, stats.commandLatencyMs)));
  }

  const cleanupStarted = performance.now();
  await Promise.all(groups.map(cleanupRoom));
  for (const client of [...allClients]) {
    await client.closeGracefully();
    allClients.delete(client);
  }
  await delay(100);
  const cleared = await getMetrics(baseUrl, true);
  metrics.push(cleared);
  stats.cleanupMs.push(performance.now() - cleanupStarted);

  assert.equal(cleared.rooms, 0, 'all stress rooms must be released after cleanup');
  assert.equal(cleared.connectedClients, 0, 'all stress WebSocket sessions must be released after cleanup');
  const heapDelta = cleared.memory.heapUsed - baseline.memory.heapUsed;
  assert.ok(
    heapDelta <= MAX_HEAP_GROWTH_BYTES,
    'heap retained after forced GC exceeded ' + Math.round(MAX_HEAP_GROWTH_BYTES / 1024 / 1024) +
      ' MiB: baseline=' + baseline.memory.heapUsed + ', after=' + cleared.memory.heapUsed
  );

  return {
    batch,
    rooms: ROOM_COUNT,
    simultaneousClients: ROOM_COUNT * PLAYER_COUNT,
    reconnectCycles: RECONNECT_CYCLES,
    cursorEvents: ROOM_COUNT * PLAYER_COUNT * CURSOR_BURST_PER_PLAYER,
    turns: ROOM_COUNT * TURNS_PER_ROOM,
    commandCount: ROOM_COUNT * TURNS_PER_ROOM * 2,
    heapBaseline: baseline.memory.heapUsed,
    heapAfterCleanup: cleared.memory.heapUsed,
    heapDelta,
    peakRss: Math.max(...metrics.map(item => item.memory.rss)),
    peakHeap: Math.max(...metrics.map(item => item.memory.heapUsed))
  };
}

function percentile(values, quantile) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * quantile) - 1)];
}

async function main() {
  const port = await reservePort();
  const baseUrl = 'http://127.0.0.1:' + port;
  const wsUrl = 'ws://127.0.0.1:' + port + '/ws';
  const child = spawn(process.execPath, ['--expose-gc', SERVER], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      HOST: '127.0.0.1',
      NODE_ENV: 'test',
      MINEFALL_TEST_METRICS: '1'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let output = '';
  child.stdout.on('data', chunk => { output += chunk.toString(); });
  child.stderr.on('data', chunk => { output += chunk.toString(); });
  const allClients = new Set();
  const stats = {
    roomSetupMs: [],
    batchSetupMs: [],
    reconnectMs: [],
    commandLatencyMs: [],
    cleanupMs: []
  };

  try {
    await waitForHealth(baseUrl, child, () => output);
    const initial = await getMetrics(baseUrl, true);
    console.log('Stress server ready: ' + packageInfo.version + ' at ' + baseUrl);
    console.log('Load profile: ' + ROOM_COUNT + ' rooms × ' + PLAYER_COUNT + ' players; ' +
      BATCH_COUNT + ' batches; ' + RECONNECT_CYCLES + ' reconnect cycles; ' +
      TURNS_PER_ROOM + ' turns per room; ' + CURSOR_BURST_PER_PLAYER + ' cursor messages per player.');

    const results = [];
    for (let batch = 1; batch <= BATCH_COUNT; batch++) {
      const result = await runBatch({ wsUrl, baseUrl, batch, allClients, stats });
      results.push(result);
      console.log('PASS stress batch ' + batch + ': ' + result.simultaneousClients +
        ' concurrent clients, ' + result.reconnectCycles + ' reconnect cycles, heap delta ' +
        (result.heapDelta / 1024 / 1024).toFixed(2) + ' MiB.');
    }

    const finalMetrics = await getMetrics(baseUrl, true);
    assert.equal(finalMetrics.rooms, 0);
    assert.equal(finalMetrics.connectedClients, 0);
    const maxHeapDelta = Math.max(...results.map(result => result.heapDelta));
    assert.ok(maxHeapDelta <= MAX_HEAP_GROWTH_BYTES);

    console.log('');
    console.log('AI STRESS QA: PASS');
    console.log('Batches: ' + results.length);
    console.log('Peak simultaneous WebSocket clients: ' + (ROOM_COUNT * PLAYER_COUNT));
    console.log('Total room lifecycles: ' + (ROOM_COUNT * BATCH_COUNT));
    console.log('Total reconnect cycles: ' + (ROOM_COUNT * RECONNECT_CYCLES * BATCH_COUNT));
    console.log('Total game commands: ' + results.reduce((sum, result) => sum + result.commandCount, 0));
    console.log('Total cursor events sent: ' + results.reduce((sum, result) => sum + result.cursorEvents, 0));
    console.log('Command ACK p50/p95: ' + percentile(stats.commandLatencyMs, 0.50).toFixed(1) + ' / ' +
      percentile(stats.commandLatencyMs, 0.95).toFixed(1) + ' ms');
    console.log('Reconnect p50/p95: ' + percentile(stats.reconnectMs, 0.50).toFixed(1) + ' / ' +
      percentile(stats.reconnectMs, 0.95).toFixed(1) + ' ms');
    console.log('Peak server RSS: ' + (Math.max(...results.map(result => result.peakRss)) / 1024 / 1024).toFixed(1) + ' MiB');
    console.log('Max post-GC heap delta: ' + (maxHeapDelta / 1024 / 1024).toFixed(2) + ' MiB');
    console.log('Final server state: rooms=' + finalMetrics.rooms + ', connectedClients=' + finalMetrics.connectedClients);
  } catch (error) {
    console.error('AI STRESS QA: FAIL');
    console.error(error.stack || error.message || String(error));
    if (output) console.error('Server output:\n' + output);
    process.exitCode = 1;
  } finally {
    for (const client of [...allClients]) {
      client.terminate();
      allClients.delete(client);
    }
    await stopServer(child);
  }
}

main();
