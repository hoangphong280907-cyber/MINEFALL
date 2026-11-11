'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const net = require('node:net');
const path = require('node:path');
const WebSocket = require('ws');
const packageInfo = require('../package.json');

const projectRoot = path.resolve(__dirname, '..');
const serverPath = path.join(projectRoot, 'server', 'index.js');

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

async function waitForHealth(baseUrl, child, readOutput) {
  const deadline = Date.now() + 10_000;
  let lastError = null;

  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Server exited before becoming healthy.\n${readOutput()}`);
    }

    try {
      const response = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(1000) });
      if (response.ok) {
        const health = await response.json();
        assert.equal(health.status, 'ok');
        assert.equal(health.version, packageInfo.version);
        return health;
      }
      lastError = new Error(`/health returned HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }

    await delay(150);
  }

  throw new Error(`Server did not become healthy: ${lastError?.message || 'timeout'}\n${readOutput()}`);
}

function connectClient(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    const messages = [];
    const waiters = [];
    let opened = false;

    function dispatch(message) {
      const index = waiters.findIndex(waiter => waiter.matches(message));
      if (index < 0) {
        messages.push(message);
        if (messages.length > 200) messages.shift();
        return;
      }

      const [waiter] = waiters.splice(index, 1);
      clearTimeout(waiter.timer);
      waiter.resolve(message);
    }

    function waitFor(type, predicate = () => true, timeoutMs = 5000) {
      const matches = message => message?.type === type && predicate(message);
      const queuedIndex = messages.findIndex(matches);
      if (queuedIndex >= 0) return Promise.resolve(messages.splice(queuedIndex, 1)[0]);

      return new Promise((resolveWaiter, rejectWaiter) => {
        const waiter = {
          matches,
          resolve: resolveWaiter,
          reject: rejectWaiter,
          timer: setTimeout(() => {
            const index = waiters.indexOf(waiter);
            if (index >= 0) waiters.splice(index, 1);
            rejectWaiter(new Error(`Timed out waiting for WebSocket message: ${type}`));
          }, timeoutMs)
        };
        waiters.push(waiter);
      });
    }

    socket.on('message', raw => {
      let message;
      try {
        message = JSON.parse(raw.toString('utf8'));
      } catch (error) {
        for (const waiter of waiters.splice(0)) {
          clearTimeout(waiter.timer);
          waiter.reject(new Error(`Server sent invalid JSON: ${error.message}`));
        }
        return;
      }
      dispatch(message);
    });

    socket.on('error', error => {
      if (!opened) reject(error);
      for (const waiter of waiters.splice(0)) {
        clearTimeout(waiter.timer);
        waiter.reject(error);
      }
    });

    socket.once('open', () => {
      opened = true;
      resolve({
        socket,
        send(type, payload = {}) {
          if (socket.readyState !== WebSocket.OPEN) {
            throw new Error(`Cannot send ${type}: WebSocket is not open.`);
          }
          socket.send(JSON.stringify({ type, payload }));
        },
        waitFor,
        terminate() {
          if (socket.readyState !== WebSocket.CLOSED) socket.terminate();
        }
      });
    });
  });
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

test('WebSocket integration: reconnect restores the same player and live match, and rotates resume tokens', { timeout: 20_000 }, async () => {
  const port = await reservePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const wsUrl = `ws://127.0.0.1:${port}/ws`;
  const child = spawn(process.execPath, [serverPath], {
    cwd: projectRoot,
    env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', NODE_ENV: 'test' },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let output = '';
  child.stdout.on('data', chunk => { output += chunk.toString(); });
  child.stderr.on('data', chunk => { output += chunk.toString(); });

  const clients = [];
  const addClient = async () => {
    const client = await connectClient(wsUrl);
    clients.push(client);
    await client.waitFor('system:hello', message => message.protocolVersion === 1);
    return client;
  };

  try {
    await waitForHealth(baseUrl, child, () => output);

    const host = await addClient();
    const hostSessionPromise = host.waitFor('room:session', message => message.resumed === false);
    host.send('room:create', {
      name: 'Integration Host',
      config: { boardSize: 8, difficulty: 'easy', maxPlayers: 2 },
      identity: 'integration-host-identity'
    });
    const hostSession = await hostSessionPromise;
    assert.match(hostSession.roomCode, /^[A-Z0-9]{6}$/);
    assert.match(hostSession.resumeToken, /^[A-Za-z0-9_-]{43}$/);

    const guest = await addClient();
    const hostRoomUpdatePromise = host.waitFor('room:update', message => message.room?.players?.length === 2);
    const guestRoomUpdatePromise = guest.waitFor('room:update', message => message.room?.players?.length === 2);
    const guestSessionPromise = guest.waitFor('room:session', message => message.resumed === false);
    guest.send('room:join', {
      code: hostSession.roomCode,
      name: 'Integration Guest',
      identity: 'integration-guest-identity'
    });

    const [hostRoomUpdate, guestRoomUpdate, guestSession] = await Promise.all([
      hostRoomUpdatePromise,
      guestRoomUpdatePromise,
      guestSessionPromise
    ]);
    assert.equal(hostRoomUpdate.room.players.length, 2);
    assert.equal(guestRoomUpdate.room.players.length, 2);
    assert.notEqual(hostSession.playerId, guestSession.playerId);

    const hostReadyPromise = host.waitFor('room:update', message => message.room?.status === 'ready');
    const guestReadyPromise = guest.waitFor('room:update', message => message.room?.status === 'ready');
    host.send('player:ready', { ready: true });
    guest.send('player:ready', { ready: true });
    await Promise.all([hostReadyPromise, guestReadyPromise]);

    const initialMatchPromise = host.waitFor('match:state', message => Boolean(message.state?.matchId));
    host.send('match:start');
    const initialMatch = await initialMatchPromise;
    const matchId = initialMatch.state.matchId;
    assert.ok(matchId);

    const hostRoulettePromise = host.waitFor('match:roulette:start');
    const guestRoulettePromise = guest.waitFor('match:roulette:start');
    guest.send('match:roulette:activate');
    await Promise.all([hostRoulettePromise, guestRoulettePromise]);

    const beginAckPromise = host.waitFor('match:begin:ack', message => message.accepted === true);
    const runningMatchPromise = host.waitFor('match:state', message => message.state?.started === true);
    host.send('match:begin', { matchId });
    await Promise.all([beginAckPromise, runningMatchPromise]);

    const disconnectedRoomPromise = guest.waitFor('room:update', message =>
      message.room?.players?.some(player => player.id === hostSession.playerId && player.connected === false)
    );
    host.terminate();
    await disconnectedRoomPromise;

    const resumed = await addClient();
    const resumedSessionPromise = resumed.waitFor('room:session', message => message.resumed === true);
    const resumedRoomPromise = resumed.waitFor('room:update', message =>
      message.selfPlayerId === hostSession.playerId &&
      message.room?.players?.some(player => player.id === hostSession.playerId && player.connected === true)
    );
    const restoredMatchPromise = resumed.waitFor('match:state', message =>
      message.state?.matchId === matchId && message.state?.started === true
    );

    resumed.send('room:resume', { resumeToken: hostSession.resumeToken });

    const [resumedSession, resumedRoom, restoredMatch] = await Promise.all([
      resumedSessionPromise,
      resumedRoomPromise,
      restoredMatchPromise
    ]);

    assert.equal(resumedSession.roomCode, hostSession.roomCode);
    assert.equal(resumedSession.playerId, hostSession.playerId);
    assert.notEqual(resumedSession.resumeToken, hostSession.resumeToken);
    assert.equal(resumedRoom.selfPlayerId, hostSession.playerId);
    assert.equal(restoredMatch.state.matchId, matchId);
    assert.equal(restoredMatch.state.started, true);
    assert.equal(restoredMatch.state.players.find(player => player.id === hostSession.playerId)?.alive, true);
    assert.equal(resumedSession.resumed, true);

    const staleTokenClient = await addClient();
    const staleTokenErrorPromise = staleTokenClient.waitFor('server:error');
    staleTokenClient.send('room:resume', { resumeToken: hostSession.resumeToken });
    const staleTokenError = await staleTokenErrorPromise;
    assert.ok(staleTokenError.error?.message, 'the previously used token must be rejected');

    const duplicateSessionClient = await addClient();
    const duplicateSessionErrorPromise = duplicateSessionClient.waitFor('server:error');
    duplicateSessionClient.send('room:resume', { resumeToken: resumedSession.resumeToken });
    const duplicateSessionError = await duplicateSessionErrorPromise;
    assert.ok(duplicateSessionError.error?.message, 'a currently connected session must not be resumed twice');

    console.log('PASS: live WebSocket reconnect restores the same player and match; old and duplicate resume tokens are rejected.');
  } catch (error) {
    error.message += `\nServer output:\n${output}`;
    throw error;
  } finally {
    for (const client of clients) client.terminate();
    await stopServer(child);
  }
});
