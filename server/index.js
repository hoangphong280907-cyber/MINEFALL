'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { WebSocketServer, WebSocket } = require('ws');
const { RoomManager } = require('./room-manager');
const Engine = require('../engine.js');
const SHOP_CATALOG = require('../cosmetics.js');
const PACKAGE_INFO = require('../package.json');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const MAX_MESSAGE_BYTES = 16 * 1024;
const MAX_SOCKET_BACKLOG = 1024 * 1024;
const MAX_STATE_BACKLOG = 512 * 1024;
const RATE_WINDOW_MS = 10_000;
// Allow normal fast touch input while keeping a per-connection flood ceiling.
const RATE_MAX = 120;
const manager = new RoomManager();
const sockets = new Map();
const pendingMatchBroadcasts = new Map();
const lastEmoteAt = new Map();
const ALLOWED_EMOTES = new Map([['🤔','Đang suy nghĩ'],['😎','Tự tin'],['😱','Hoảng sợ'],['😈','Khiêu khích'],['👍','Tán thưởng']]);

const PUBLIC_FILES = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/engine.js', ['engine.js', 'text/javascript; charset=utf-8']],
  ['/cosmetics.js', ['cosmetics.js', 'text/javascript; charset=utf-8']],
  ['/online-client.js', ['online-client.js', 'text/javascript; charset=utf-8']],
  ['/arena-visuals.js', ['arena-visuals.js', 'text/javascript; charset=utf-8']],
  ['/arena-visuals.css', ['arena-visuals.css', 'text/css; charset=utf-8']],
  ['/online.css', ['online.css', 'text/css; charset=utf-8']]
]);

// Only catalogue-declared cosmetic assets are public. Optional skin PNGs are
// whitelisted by skin ID so uploaded artwork cannot become a path traversal.
for (const item of SHOP_CATALOG.flag || []) {
  if (item.asset && /^[a-z0-9-]+\.svg$/.test(item.asset)) PUBLIC_FILES.set(`/assets/flags/${item.asset}`, [`assets/flags/${item.asset}`, 'image/svg+xml; charset=utf-8']);
}
for (const item of SHOP_CATALOG.bomb || []) {
  if (item.asset && /^[a-z0-9-]+\.svg$/.test(item.asset)) PUBLIC_FILES.set(`/assets/mines/${item.asset}`, [`assets/mines/${item.asset}`, 'image/svg+xml; charset=utf-8']);
}
for (const item of SHOP_CATALOG.skin || []) {
  if (/^skin-[a-z0-9-]+$/.test(item.id)) PUBLIC_FILES.set(`/assets/skins/${item.id}.png`, [`assets/skins/${item.id}.png`, 'image/png']);
}

function send(ws, type, payload = {}) {
  if (ws.readyState !== WebSocket.OPEN) return false;
  // Clock snapshots are replaceable: a slow client will receive the next complete
  // snapshot instead of building an unbounded queue of obsolete one-second states.
  if ((type === 'match:state' && ws.bufferedAmount > MAX_STATE_BACKLOG) ||
      (type === 'game:cursor' && ws.bufferedAmount > MAX_STATE_BACKLOG)) return false;
  if (ws.bufferedAmount > MAX_SOCKET_BACKLOG * 2) {
    try { ws.close(1013, 'slow client'); } catch {}
    return false;
  }
  try {
    ws.send(JSON.stringify({ type, ...payload }));
    return true;
  } catch {
    return false;
  }
}

function sendError(ws, code, message) {
  send(ws, 'server:error', { error: { code, message } });
}

function broadcastRoom(room) {
  if (!room) return;
  const publicRoom = manager.publicRoom(room);
  for (const player of room.players) {
    const ws = sockets.get(player.connectionId);
    if (ws) send(ws, 'room:update', { room: publicRoom, selfPlayerId: player.id });
  }
}

function broadcastMatchState(room) {
  if (!room || !room.matchState) return;
  // Several commands can arrive close together. Publish only the latest authoritative
  // snapshot per room within a short frame, rather than serializing/broadcasting every
  // intermediate state to every phone. The server still validates and applies each command.
  if (pendingMatchBroadcasts.has(room)) return;
  const timer = setTimeout(() => {
    pendingMatchBroadcasts.delete(room);
    if (manager.rooms.get(room.code) !== room || !room.matchState) return;
    const state = manager.publicMatchState(room);
    const publicRoom = manager.publicRoom(room);
    const payload = { roomCode: room.code, state, roomConfig: publicRoom.config, cursors: publicRoom.cursors };
    for (const player of room.players) {
      const ws = sockets.get(player.connectionId);
      if (ws) send(ws, 'match:state', payload);
    }
  }, 20);
  pendingMatchBroadcasts.set(room, timer);
}

function broadcastCursor(room, player, index) {
  const event = { type: 'game:cursor', roomCode: room.code, playerId: player.id, playerName: player.name, color: player.color, index, at: Date.now() };
  for (const member of room.players) {
    const ws = sockets.get(member.connectionId);
    if (ws) send(ws, 'game:cursor', event);
  }
}

function clientIdFor(ws) { return ws.clientId; }

function handleMessage(ws, raw) {
  let message;
  try { message = JSON.parse(raw.toString('utf8')); }
  catch { return sendError(ws, 'INVALID_JSON', 'Tin nhắn phải là JSON hợp lệ.'); }
  if (!message || typeof message !== 'object' || Array.isArray(message) || typeof message.type !== 'string') {
    return sendError(ws, 'INVALID_MESSAGE', 'Thiếu loại thông điệp hợp lệ.');
  }

  const connectionId = clientIdFor(ws);
  try {
    switch (message.type) {
      case 'room:create': {
        const payload = message.payload && typeof message.payload === 'object' ? message.payload : {};
        const { room, player, resumeToken } = manager.createRoom(connectionId, payload.name, payload.config, payload.identity, payload.cosmetics);
        send(ws, 'room:session', { roomCode: room.code, playerId: player.id, resumeToken, resumed: false });
        broadcastRoom(room);
        break;
      }
      case 'room:join': {
        const payload = message.payload && typeof message.payload === 'object' ? message.payload : {};
        const { room, player, resumeToken } = manager.joinRoom(connectionId, payload.code, payload.name, payload.identity, payload.cosmetics);
        send(ws, 'room:session', { roomCode: room.code, playerId: player.id, resumeToken, resumed: false });
        broadcastRoom(room);
        break;
      }
      case 'room:resume': {
        const payload = message.payload && typeof message.payload === 'object' ? message.payload : {};
        const { room, player, resumeToken } = manager.resume(connectionId, payload.resumeToken);
        send(ws, 'room:session', { roomCode: room.code, playerId: player.id, resumeToken, resumed: true });
        broadcastRoom(room);
        broadcastMatchState(room);
        break;
      }
      case 'player:ready': {
        const value = message.payload && message.payload.ready;
        if (typeof value !== 'boolean') { sendError(ws, 'INVALID_READY_VALUE', 'ready phải là true hoặc false.'); break; }
        const room = manager.setReady(connectionId, value);
        broadcastRoom(room);
        break;
      }
      case 'match:start': {
        const room = manager.startMatch(connectionId);
        broadcastRoom(room);
        broadcastMatchState(room);
        break;
      }
      case 'match:begin': {
        const payload = message.payload && typeof message.payload === 'object' ? message.payload : {};
        const result = manager.beginMatch(connectionId, payload.matchId);
        if (result.started) broadcastRoom(result.room);
        broadcastMatchState(result.room);
        send(ws, 'match:begin:ack', { accepted: true, matchId: result.room.matchId, started: !!result.room.matchState?.started });
        break;
      }
      case 'match:roulette:activate': {
        const result = manager.activateRoulette(connectionId);
        const event = {
          type: 'match:roulette:start', roomCode: result.room.code,
          matchId: result.matchId, startPlayerId: result.startPlayerId,
          activatedByPlayerId: result.player.id, at: Date.now()
        };
        for (const member of result.room.players) {
          const target = sockets.get(member.connectionId);
          if (target) send(target, 'match:roulette:start', event);
        }
        break;
      }
      case 'state:request': {
        const room = manager.findRoomForConnection(connectionId);
        if (!room) throw new Error('Bạn chưa ở trong phòng.');
        const player = manager.findPlayer(room, connectionId);
        send(ws, 'room:update', { room: manager.publicRoom(room), selfPlayerId: player.id });
        if (room.matchState) send(ws, 'match:state', { roomCode: room.code, state: manager.publicMatchState(room), roomConfig: manager.publicRoom(room).config, cursors: manager.publicRoom(room).cursors });
        break;
      }
      case 'game:cursor': {
        const payload = message.payload && typeof message.payload === 'object' ? message.payload : {};
        const out = manager.setCursor(connectionId, payload.index);
        broadcastCursor(out.room, out.player, out.index);
        break;
      }
      case 'game:emote': {
        const payload = message.payload && typeof message.payload === 'object' ? message.payload : {};
        const room = manager.findRoomForConnection(connectionId);
        if (!room || room.status !== 'playing' || !room.matchState?.started || room.matchState.ended) throw new Error('Chỉ có thể dùng biểu cảm trong trận đang diễn ra.');
        const player = manager.findPlayer(room, connectionId);
        const gamePlayer = room.matchState.players.find(item => item.id === player?.id);
        if (!player || !gamePlayer?.alive) throw new Error('Người chơi đã bị loại hoặc không còn trong phòng.');
        const emoji = String(payload.emoji || '');
        if (!ALLOWED_EMOTES.has(emoji)) throw new Error('Biểu cảm không hợp lệ.');
        const now = Date.now();
        if (now - (lastEmoteAt.get(player.id) || 0) < 3500) throw new Error('Chờ một chút trước khi dùng biểu cảm tiếp theo.');
        lastEmoteAt.set(player.id, now);
        const event = { type: 'game:emote', playerId: player.id, playerName: player.name, emoji, caption: ALLOWED_EMOTES.get(emoji), at: now };
        for (const member of room.players) { const target = sockets.get(member.connectionId); if (target) send(target, 'game:emote', event); }
        break;
      }
      case 'game:command': {
        const command = message.command;
        if (!command || typeof command !== 'object') throw new Error('Thiếu command envelope.');
        const result = manager.applyCommand(connectionId, command);
        broadcastMatchState(result.room);
        send(ws, 'command:ack', { commandId: command.commandId, accepted: true, action: result.action, note: result.action === 'move' ? 'Đã di chuyển nhân vật.' : 'Máy chủ đã xử lý hành động và cập nhật trạng thái.' });
        break;
      }
      case 'match:rematch': {
        const result = manager.requestRematch(connectionId);
        broadcastRoom(result.room);
        if (result.restarted) broadcastMatchState(result.room);
        send(ws, 'match:rematch:ack', { accepted: true, restarted: result.restarted, matchId: result.room.matchId });
        break;
      }
      case 'match:return': {
        const result = manager.returnToLobby(connectionId);
        if (result.room) broadcastRoom(result.room);
        send(ws, 'match:returned', { code: result.removedCode || result.room?.code || null });
        break;
      }
      case 'room:leave': {
        const result = manager.leave(connectionId);
        if (result && result.room) { broadcastRoom(result.room); broadcastMatchState(result.room); }
        send(ws, 'room:left', { code: result?.removedCode || null });
        break;
      }
      default:
        sendError(ws, 'UNKNOWN_MESSAGE', 'Yêu cầu không được hỗ trợ trong phiên bản này.');
    }
  } catch (error) {
    sendError(ws, error?.code || 'REQUEST_REJECTED', error instanceof Error ? error.message : 'Yêu cầu bị từ chối.');
  }
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  if (url.pathname === '/health') {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    res.end(JSON.stringify({ status: 'ok', version: PACKAGE_INFO.version, phase: '0.9C.9', rooms: manager.rooms.size, connectedClients: sockets.size }));
    return;
  }
  const entry = PUBLIC_FILES.get(url.pathname);
  if (!entry || (req.method !== 'GET' && req.method !== 'HEAD')) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
    res.end('Not found');
    return;
  }
  const [fileName, contentType] = entry;
  const filePath = path.resolve(ROOT, fileName);
  if (!filePath.startsWith(ROOT + path.sep)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }
  fs.readFile(filePath, (error, data) => {
    if (error) { const status = error.code === 'ENOENT' ? 404 : 500; res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' }); res.end(status === 404 ? 'Not found' : 'Unable to read app asset'); return; }
    res.writeHead(200, {
      'content-type': contentType,
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'same-origin'
    });
    res.end(req.method === 'HEAD' ? undefined : data);
  });
});

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: MAX_MESSAGE_BYTES, perMessageDeflate: false, verifyClient: (info, done) => {
  const origin = info.origin;
  const host = info.req.headers.host;
  // Development protection: accept browser sockets only from this server's own origin.
  if (!origin || origin === `http://${host}` || origin === `https://${host}`) done(true);
  else done(false, 403, 'Origin not allowed');
} });

const heartbeatTimer = setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    try { ws.ping(); }
    catch { ws.terminate(); }
  }
}, 10_000);
heartbeatTimer.unref?.();
wss.on('connection', ws => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  ws.clientId = `conn_${require('node:crypto').randomUUID()}`;
  ws.rateWindowStart = Date.now();
  ws.rateCount = 0;
  sockets.set(ws.clientId, ws);
  send(ws, 'system:hello', { version: PACKAGE_INFO.version, phase: '0.9C.9', protocolVersion: 1, connectionId: ws.clientId, serverTime: Date.now() });

  ws.on('message', raw => {
    const now = Date.now();
    if (now - ws.rateWindowStart > RATE_WINDOW_MS) { ws.rateWindowStart = now; ws.rateCount = 0; }
    ws.rateCount++;
    if (ws.rateCount > RATE_MAX) {
      sendError(ws, 'RATE_LIMIT', 'Gửi thông điệp quá nhanh. Vui lòng chậm lại.');
      ws.close(1008, 'rate limit');
      return;
    }
    handleMessage(ws, raw);
  });
  ws.on('error', () => {});
  ws.on('close', () => {
    sockets.delete(ws.clientId);
    const result = manager.disconnect(ws.clientId);
    if (result && result.room) { broadcastRoom(result.room); broadcastMatchState(result.room); }
  });
});

// Server-authoritative clocks. Clients only display these values; they never decide when a turn or match ends.
const gameClock = setInterval(() => {
  for (const room of manager.rooms.values()) {
    const expiration = manager.expireDisconnectedPlayers(room);
    if (manager.rooms.get(room.code) !== room) continue;
    if (expiration.roomChanged) broadcastRoom(room);
    if (expiration.matchChanged || manager.tickRoom(room)) broadcastMatchState(room);
  }
}, 1000);

server.listen(PORT, HOST, () => {
  console.log(`MINEFALL ${PACKAGE_INFO.version} (protocol phase 0.9C.9) listening on http://${HOST}:${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  const interfaces = os.networkInterfaces();
  for (const records of Object.values(interfaces)) {
    for (const record of records || []) {
      if (record.family === 'IPv4' && !record.internal) console.log(`LAN test on another device: http://${record.address}:${PORT}`);
    }
  }
});

function shutdown() {
  clearInterval(gameClock);
  clearInterval(heartbeatTimer);
  for (const timer of pendingMatchBroadcasts.values()) clearTimeout(timer);
  pendingMatchBroadcasts.clear();
  for (const client of wss.clients) client.close(1001, 'server shutdown');
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 3000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
