'use strict';

const crypto = require('node:crypto');
const Engine = require('../engine.js');
const SHOP_CATALOG = require('../cosmetics.js');

const VALID_SIZES = new Set([8, 10, 12, 14, 16, 18, 20]);
const DENSITIES = Object.freeze({ easy: 0.25, medium: 0.35, hard: 0.50 });
const ARENA_SKINS = new Set(SHOP_CATALOG.arena.map(item => item.id));
const BOMB_SKINS = new Set(SHOP_CATALOG.bomb.map(item => item.id));
const COSMETIC_ALLOWLISTS = Object.fromEntries(Object.entries(SHOP_CATALOG).filter(([category]) => category !== 'arena').map(([category, items]) => [category, new Set(items.map(item => item.id))]));
const DEFAULT_COSMETICS = Object.fromEntries(Object.entries(SHOP_CATALOG).filter(([category]) => category !== 'arena').map(([category, items]) => [category, (items.find(item => item.defaultEquipped) || items[0]).id]));
const CHARACTER_SKINS = COSMETIC_ALLOWLISTS.skin;
const SKIN_COLORS = Object.freeze({ 'skin-classic': '#63e0d5', 'skin-gold': '#ffc267', 'skin-violet': '#9e8aff', 'skin-crimson': '#ff7884', 'skin-mint': '#85dcad' });
// Match the offline palette and preserve a stable seat color across disconnect/rejoin.
const COLORS = ['#63e0d5', '#ffc267', '#9e8aff', '#ff7884', '#85dc87'];
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MATCH_DURATIONS = Object.freeze([10, 15, 20, 25, 30]);
const DEFAULT_MATCH_DURATION_MINUTES = 10;
const MATCH_SECONDS = DEFAULT_MATCH_DURATION_MINUTES * 60;
const TURN_SECONDS = 60;
const DISCONNECT_GRACE_MS = 30_000;
const SKIP_PENALTY = 5;
const PLACE_POINTS = Object.freeze({ 1: 200, 2: 150, 3: 75, 4: 38, 5: 19 });

function cleanName(value) {
  if (typeof value !== 'string') return 'Người chơi';
  const name = value.replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 18);
  return name || 'Người chơi';
}

function cleanIdentity(value, fallback) {
  if (typeof value !== 'string') return `session-${fallback}`;
  const identity = value.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80);
  return identity.length >= 12 ? identity : `session-${fallback}`;
}

function normalizeCosmetics(raw = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) raw = {};
  const output = {};
  for (const [category, allowed] of Object.entries(COSMETIC_ALLOWLISTS)) {
    output[category] = allowed.has(raw[category]) ? raw[category] : DEFAULT_COSMETICS[category];
  }
  return output;
}

function normalizeConfig(raw = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) raw = {};
  const size = Number(raw.boardSize ?? 16);
  if (raw.difficulty !== undefined && !DENSITIES[raw.difficulty]) throw new Error('Độ khó phải là easy, medium hoặc hard.');
  const difficulty = raw.difficulty || 'medium';
  const maxPlayers = Number(raw.maxPlayers ?? 2);
  const matchDurationMinutes = Number(raw.matchDurationMinutes ?? DEFAULT_MATCH_DURATION_MINUTES);
  if (!VALID_SIZES.has(size)) throw new Error('Kích thước bàn phải là 8, 10, 12, 14, 16, 18 hoặc 20.');
  if (!Number.isInteger(maxPlayers) || maxPlayers < 2 || maxPlayers > 5) throw new Error('Số người chơi phải từ 2 đến 5.');
  if (!MATCH_DURATIONS.includes(matchDurationMinutes)) throw new Error('Thời lượng trận phải là 10, 15, 20, 25 hoặc 30 phút.');
  const arenaSkin = ARENA_SKINS.has(raw.arenaSkin) ? raw.arenaSkin : 'arena-standard';
  const bombSkin = BOMB_SKINS.has(raw.bombSkin) ? raw.bombSkin : 'bomb-standard';
  return { boardSize: size, difficulty, density: DENSITIES[difficulty], mineCount: Math.round(size * size * DENSITIES[difficulty]), matchDurationMinutes, arenaSkin, bombSkin, maxPlayers };
}

function makeCode(existing) {
  for (let attempt = 0; attempt < 100; attempt++) {
    let code = '';
    for (let i = 0; i < 6; i++) code += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
    if (!existing.has(code)) return code;
  }
  throw new Error('Không tạo được mã phòng duy nhất. Thử lại.');
}

class RoomManager {
  constructor({ now = () => Date.now(), rng = Math.random, disconnectGraceMs = DISCONNECT_GRACE_MS } = {}) {
    this.rooms = new Map();
    this.clientRoom = new Map();
    this.resumeSessions = new Map();
    this.now = now;
    this.rng = rng;
    const grace = Number(disconnectGraceMs);
    this.disconnectGraceMs = Number.isFinite(grace) && grace > 0 ? Math.max(1, Math.floor(grace)) : DISCONNECT_GRACE_MS;
  }

  createRoom(connectionId, name, rawConfig, identityValue, cosmeticsValue) {
    if (this.clientRoom.has(connectionId)) throw new Error('Bạn đang ở trong một phòng khác.');
    const config = normalizeConfig(rawConfig);
    const code = makeCode(this.rooms);
    const identityKey = cleanIdentity(identityValue, connectionId);
    const cosmetics = normalizeCosmetics(cosmeticsValue);
    const seatIndex = 0;
    const player = this._newPlayer(connectionId, name, seatIndex, identityKey, cosmetics);
    const room = {
      code, hostPlayerId: player.id, status: 'waiting', config,
      players: [player], createdAt: this.now(), matchId: null,
      matchState: null, cursors: new Map(), seenCommandIds: new Set(), lastEvent: null,
      rouletteActivated: false, seatAssignments: new Map([[identityKey, { playerId: player.id, seatIndex }]]),
      rematchVotes: new Set(), rematchInvitedBy: null
    };
    const resumeToken = this._issueResumeToken(room, player);
    this.rooms.set(code, room);
    this.clientRoom.set(connectionId, code);
    return { room, player, resumeToken };
  }

  joinRoom(connectionId, codeValue, name, identityValue, cosmeticsValue) {
    if (this.clientRoom.has(connectionId)) throw new Error('Bạn đang ở trong một phòng khác.');
    const code = String(codeValue || '').trim().toUpperCase();
    const room = this.rooms.get(code);
    if (!room) throw new Error('Không tìm thấy phòng. Kiểm tra lại mã phòng.');
    if (room.status !== 'waiting') throw new Error('Phòng đã bắt đầu trận hoặc không còn nhận người.');
    const identityKey = cleanIdentity(identityValue, connectionId);
    const priorSeat = room.seatAssignments.get(identityKey);
    const existingIdentity = room.players.find(p => p.identityKey === identityKey);
    if (existingIdentity) {
      throw new Error(existingIdentity.connected
        ? 'Danh tính này đã ở trong phòng.'
        : 'Phiên trước vẫn đang được giữ. Hãy khôi phục kết nối thay vì tham gia lại bằng mã phòng.');
    }
    if (room.players.length >= room.config.maxPlayers) throw new Error(`Phòng đã đủ ${room.config.maxPlayers} người chơi.`);
    const occupiedSeats = new Set(room.players.map(p => p.seatIndex));
    let seatIndex = priorSeat && !occupiedSeats.has(priorSeat.seatIndex) ? priorSeat.seatIndex : -1;
    if (seatIndex < 0) {
      for (let candidate = 0; candidate < room.config.maxPlayers; candidate++) {
        if (!occupiedSeats.has(candidate)) { seatIndex = candidate; break; }
      }
    }
    if (seatIndex < 0) throw new Error('Không tìm được vị trí người chơi trống.');
    const cosmetics = normalizeCosmetics(cosmeticsValue);
    const player = this._newPlayer(connectionId, name, seatIndex, identityKey, cosmetics, priorSeat?.playerId);
    room.players.push(player);
    room.seatAssignments.set(identityKey, { playerId: player.id, seatIndex });
    if (!room.hostPlayerId) room.hostPlayerId = player.id;
    const resumeToken = this._issueResumeToken(room, player);
    this.clientRoom.set(connectionId, code);
    return { room, player, resumeToken };
  }

  _hashResumeToken(token) {
    return crypto.createHash('sha256').update(token, 'utf8').digest('hex');
  }

  _invalidateResumeToken(player) {
    if (!player) return;
    if (player.resumeTokenHash) this.resumeSessions.delete(player.resumeTokenHash);
    player.resumeTokenHash = null;
  }

  _issueResumeToken(room, player) {
    this._invalidateResumeToken(player);
    const token = crypto.randomBytes(32).toString('base64url');
    const tokenHash = this._hashResumeToken(token);
    player.resumeTokenHash = tokenHash;
    this.resumeSessions.set(tokenHash, { roomCode: room.code, playerId: player.id });
    return token;
  }

  resume(connectionId, tokenValue) {
    if (this.clientRoom.has(connectionId)) throw new Error('Kết nối này đã thuộc về một phòng.');
    if (typeof tokenValue !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(tokenValue)) {
      throw new Error('Mã khôi phục phiên không hợp lệ.');
    }

    const tokenHash = this._hashResumeToken(tokenValue);
    const session = this.resumeSessions.get(tokenHash);
    if (!session) throw new Error('Phiên khôi phục không hợp lệ hoặc đã được sử dụng.');

    const room = this.rooms.get(session.roomCode);
    const player = room?.players.find(item => item.id === session.playerId);
    if (!room || !player || player.resumeTokenHash !== tokenHash) {
      this.resumeSessions.delete(tokenHash);
      throw new Error('Phòng hoặc phiên khôi phục không còn tồn tại.');
    }
    if (player.connected) throw new Error('Phiên này vẫn đang được kết nối trên một thiết bị khác.');
    if (!Number.isFinite(player.disconnectDeadline) || player.disconnectDeadline <= this.now()) {
      throw new Error('Đã hết thời gian khôi phục kết nối.');
    }

    player.connectionId = connectionId;
    player.connected = true;
    player.ready = false;
    player.disconnectedAt = null;
    player.disconnectDeadline = null;
    player.disconnectExpired = false;
    this.clientRoom.set(connectionId, room.code);

    const gamePlayer = room.matchState?.players.find(item => item.id === player.id);
    if (gamePlayer) gamePlayer.connected = true;

    room.lastEvent = { type: 'player-reconnected', playerId: player.id, name: player.name, at: this.now() };
    const resumeToken = this._issueResumeToken(room, player);
    return { room, player, resumeToken };
  }

  _newPlayer(connectionId, name, seatIndex, identityKey, cosmetics, existingPlayerId = null) {
    return {
      id: existingPlayerId || `p_${crypto.randomUUID()}`, connectionId,
      identityKey, seatIndex,
      name: cleanName(name), color: cosmetics.skin === 'skin-classic' ? COLORS[seatIndex % COLORS.length] : SKIN_COLORS[cosmetics.skin],
      skin: cosmetics.skin, avatar: cosmetics.avatar, flag: cosmetics.flag, bomb: cosmetics.bomb, elimination: cosmetics.elimination, trail: cosmetics.trail, celebration: cosmetics.celebration,
      ready: false, connected: true, joinedAt: this.now(),
      resumeTokenHash: null, disconnectedAt: null, disconnectDeadline: null, disconnectExpired: false
    };
  }

  findRoomForConnection(connectionId) {
    const code = this.clientRoom.get(connectionId);
    return code ? this.rooms.get(code) || null : null;
  }

  findPlayer(room, connectionId) {
    return room?.players.find(player => player.connectionId === connectionId) || null;
  }

  _transferHost(room, departingPlayerId) {
    if (!room || room.hostPlayerId !== departingPlayerId) return;
    const successor = room.players.find(player => player.id !== departingPlayerId && player.connected && player.connectionId);
    room.hostPlayerId = successor?.id || null;
    room.lastEvent = { type: 'host-transferred', fromPlayerId: departingPlayerId, toPlayerId: room.hostPlayerId, at: this.now() };
  }

  setReady(connectionId, ready) {
    const room = this.findRoomForConnection(connectionId);
    if (!room) throw new Error('Bạn chưa ở trong phòng.');
    if (room.status !== 'waiting' && room.status !== 'ready') throw new Error('Không thể đổi trạng thái sẵn sàng sau khi bắt đầu.');
    const player = this.findPlayer(room, connectionId);
    if (!player) throw new Error('Không tìm thấy người chơi trong phòng.');
    player.ready = !!ready;
    room.status = room.players.length === room.config.maxPlayers && room.players.every(p => p.ready && p.connected) ? 'ready' : 'waiting';
    room.lastEvent = { type: 'player-ready', playerId: player.id, ready: player.ready, at: this.now() };
    return room;
  }

  startMatch(connectionId) {
    const room = this.findRoomForConnection(connectionId);
    if (!room) throw new Error('Bạn chưa ở trong phòng.');
    const player = this.findPlayer(room, connectionId);
    if (!player || player.id !== room.hostPlayerId) throw new Error('Chỉ chủ phòng mới có thể bắt đầu trận.');
    if (room.status !== 'ready' || room.players.length !== room.config.maxPlayers || !room.players.every(p => p.ready && p.connected)) {
      throw new Error(`Cần đủ ${room.config.maxPlayers} người chơi đã kết nối và sẵn sàng trước.`);
    }

    this._createMatch(room);
    return room;
  }

  _createMatch(room) {
    const { boardSize, mineCount } = room.config;
    const board = Engine.generateBoard({ size: boardSize, mineCount, rng: this.rng });
    const spawnCells = Engine.shuffle([...board.zone], this.rng);
    const players = room.players.map((p, index) => ({
      id: p.id, name: p.name, isHuman: true, alive: true, connected: p.connected,
      color: p.color, skin: p.skin, avatar: p.avatar, flag: p.flag, bomb: room.config.bombSkin, elimination: p.elimination, trail: p.trail, celebration: p.celebration, pos: spawnCells[index],
      score: 0, rankPoints: 0, place: null, deathOrder: null, missedTurns: 0,
      skipPenalty: 0, correctFlags: 0, wrongFlags: 0, flagScore: 0, scoreBreakdown: null
    }));
    const order = Engine.shuffle(players.map(p => p.id), this.rng);
    const now = this.now();
    room.matchId = `online-${crypto.randomUUID()}`;
    room.matchState = {
      matchId: room.matchId, started: false, ended: false, endReason: null,
      boardSize: board.size, mineCount: board.mineCount,
      cells: board.cells, zone: board.zone, clueRing: board.clueRing, spawn: board.spawn,
      players, turnOrder: order, currentId: order[0], turnId: 1, turnLeft: TURN_SECONDS,
      matchLeft: room.config.matchDurationMinutes * 60, turnDeadline: null, matchDeadline: null,
      matchStartedAt: null, deathOrder: [], endRevealComplete: false,
      results: null, scoreNote: '', lastEvent: { type: 'match-created', at: now }, lastAction: null
    };
    room.cursors.clear();
    room.seenCommandIds.clear();
    room.rouletteActivated = false;
    room.rematchVotes?.clear();
    room.rematchInvitedBy = null;
    room.status = 'playing';
    room.lastEvent = { type: 'match-started', matchId: room.matchId, at: now };
    return room;
  }

  requestRematch(connectionId) {
    const room = this.findRoomForConnection(connectionId);
    if (!room || room.status !== 'playing' || !room.matchState?.ended) throw new Error('Chỉ có thể mời tái đấu sau khi trận kết thúc.');
    const player = this.findPlayer(room, connectionId);
    if (!player || !player.connected) throw new Error('Không tìm thấy người chơi đang kết nối.');
    if (!room.rematchVotes) room.rematchVotes = new Set();
    if (room.rematchVotes.has(player.id)) return { room, restarted: false };
    room.rematchVotes.add(player.id);
    if (!room.rematchInvitedBy) room.rematchInvitedBy = player.id;
    const eligible = room.players.filter(p => p.connected);
    const pendingReconnect = room.players.some(p => !p.connected && Number.isFinite(p.disconnectDeadline));
    room.lastEvent = { type: 'rematch-vote', playerId: player.id, count: room.rematchVotes.size, required: eligible.length, at: this.now() };
    const allVoted = eligible.length >= 2 && !pendingReconnect && eligible.every(p => room.rematchVotes.has(p.id));
    if (allVoted) {
      this._createMatch(room);
      room.lastEvent = { type: 'rematch-started', matchId: room.matchId, at: this.now() };
      return { room, restarted: true };
    }
    return { room, restarted: false };
  }

  activateRoulette(connectionId) {
    const room = this.findRoomForConnection(connectionId);
    if (!room || room.status !== 'playing' || !room.matchState || room.matchState.ended) throw new Error('Trận chưa ở giai đoạn roulette.');
    const player = this.findPlayer(room, connectionId);
    if (!player) throw new Error('Không tìm thấy người chơi trong phòng.');
    if (room.rouletteActivated) return { room, player, matchId: room.matchId, startPlayerId: room.matchState.currentId };
    room.rouletteActivated = true;
    room.lastEvent = { type: 'roulette-activated', playerId: player.id, at: this.now() };
    return { room, player, matchId: room.matchId, startPlayerId: room.matchState.currentId };
  }

  beginMatch(connectionId, matchId) {
    const room = this.findRoomForConnection(connectionId);
    if (!room || room.status !== 'playing' || !room.matchState) throw new Error('Không có trận để bắt đầu.');
    const player = this.findPlayer(room, connectionId);
    if (!player) throw new Error('Không tìm thấy người chơi trong phòng.');
    const state = room.matchState;
    if (matchId !== state.matchId) throw new Error('Lệnh bắt đầu thuộc về trận cũ.');
    if (state.ended) return { room, started: false, ended: true };
    if (state.started) return { room, started: false, ended: false };
    if (!room.rouletteActivated) throw new Error('Hãy hoàn tất roulette trước khi bắt đầu lượt chơi.');
    const now = this.now();
    state.started = true;
    state.matchStartedAt = now;
    state.matchDeadline = now + room.config.matchDurationMinutes * 60 * 1000;
    state.turnDeadline = now + TURN_SECONDS * 1000;
    state.matchLeft = room.config.matchDurationMinutes * 60;
    state.turnLeft = TURN_SECONDS;
    state.lastEvent = { type: 'match-began', playerId: state.currentId, at: now };
    room.lastEvent = state.lastEvent;
    return { room, started: true, ended: false };
  }

  setCursor(connectionId, index) {
    const room = this.findRoomForConnection(connectionId);
    if (!room || room.status !== 'playing' || !room.matchState) throw new Error('Chưa có bản đồ online để đồng bộ.');
    const player = this.findPlayer(room, connectionId);
    const size = room.config.boardSize;
    if (!player || !Number.isInteger(index) || index < 0 || index >= size * size) throw new Error('Ô được chọn không hợp lệ.');
    room.cursors.set(player.id, index);
    room.lastEvent = { type: 'cursor-selected', playerId: player.id, index, at: this.now() };
    return { room, player, index };
  }

  applyCommand(connectionId, command) {
    const room = this.findRoomForConnection(connectionId);
    if (!room || room.status !== 'playing' || !room.matchState) throw new Error('Chưa có trận online.');
    const state = room.matchState;
    if (!state.started || state.ended) throw new Error('Trận chưa bắt đầu hoặc đã kết thúc.');
    const clientPlayer = this.findPlayer(room, connectionId);
    if (!clientPlayer || !command || command.playerId !== clientPlayer.id) {
      const error = new Error('playerId trong lệnh không khớp kết nối hiện tại.'); error.code = 'PLAYER_ID_MISMATCH'; throw error;
    }
    const verdict = Engine.validateCommand(command, {
      matchId: state.matchId, turnId: state.turnId,
      playerIds: state.players.map(p => p.id), activePlayerId: state.currentId,
      boardSize: state.boardSize, seenCommandIds: room.seenCommandIds
    });
    if (!verdict.ok) { const error = new Error(verdict.reason); error.code = verdict.code; throw error; }
    const player = state.players.find(p => p.id === clientPlayer.id);
    if (!player || !player.alive || !clientPlayer.connected) throw new Error('Người chơi này đã bị loại hoặc mất kết nối.');
    const index = command.payload.index;
    const cell = state.cells[index];
    const now = this.now();

    if (command.type === 'MOVE') {
      const fromIndex = player.pos;
      player.pos = index;
      room.seenCommandIds.add(command.commandId);
      state.lastEvent = { type: 'move', playerId: player.id, index, at: now };
      state.lastAction = { type: 'move', playerId: player.id, index, fromIndex, at: now };
      room.lastEvent = state.lastEvent;
      return { room, accepted: true, action: 'move', index };
    }

    if (player.pos !== index) throw new Error('Hãy di chuyển nhân vật đến ô đó trước khi hành động.');
    if (cell.zone) throw new Error('Ô xuất phát trong bãi đáp an toàn không thể đào hoặc cắm cờ.');
    if (command.type === 'DIG') {
      if (cell.revealed) throw new Error('Ô này đã mở. Hãy chọn một ô chưa mở.');
      if (cell.flagOwner) throw new Error('Ô đang có cờ. Hãy gỡ cờ trước khi đào.');
      const result = Engine.revealCell(state.cells, index, state.boardSize, { adjacentRevealChance: 0.35, rng: this.rng });
      if (!result.ok) throw new Error(result.reason || 'Không thể đào ô này.');
      room.seenCommandIds.add(command.commandId);
      if (result.mine) {
        cell.explodedBy = player.id;
        const eliminated = Engine.eliminatePlayer(state.players, state.deathOrder, player.id, index);
        state.lastEvent = { type: 'eliminated', playerId: player.id, index, deathOrder: eliminated?.deathOrder, at: now };
        state.lastAction = { ...state.lastEvent };
        room.lastEvent = state.lastEvent;
        this._resolveAfterDeath(room, player.id);
        return { room, accepted: true, action: 'eliminated', index };
      }
      state.lastEvent = { type: 'dig', playerId: player.id, index, openedCount: result.openedCount, additionalOpened: result.additionalOpened, openedIndices: result.newlyOpened || [index], at: now };
      state.lastAction = { ...state.lastEvent };
      room.lastEvent = state.lastEvent;
      this._advanceTurn(room, player.id);
      return { room, accepted: true, action: 'dig', index, openedCount: result.openedCount };
    }

    if (command.type === 'FLAG' || command.type === 'UNFLAG') {
      if (cell.revealed) throw new Error('Ô này đã mở.');
      if (command.type === 'FLAG' && cell.flagOwner) throw new Error('Ô đã có cờ. Hãy gỡ cờ trước.');
      if (command.type === 'UNFLAG' && !cell.flagOwner) throw new Error('Ô này chưa có cờ để gỡ.');
      if (command.type === 'UNFLAG' && cell.flagOwner !== player.id) throw new Error('Đấu cờ tiêu chuẩn chỉ cho phép gỡ cờ do chính bạn đặt. Cướp cờ dành cho chế độ Hỗn loạn sau này.');
      const result = Engine.toggleFlag(state.cells, index, player.id);
      if (!result.ok) throw new Error(result.reason || 'Không thể đổi cờ ở ô này.');
      room.seenCommandIds.add(command.commandId);
      state.lastEvent = { type: result.action, playerId: player.id, index, previousOwner: result.previousOwner || null, ownerId: result.ownerId || null, at: now };
      state.lastAction = { ...state.lastEvent };
      room.lastEvent = state.lastEvent;
      this._advanceTurn(room, player.id);
      return { room, accepted: true, action: result.action, index };
    }
    throw new Error('Loại lệnh chưa được hỗ trợ.');
  }

  _advanceTurn(room, previousId) {
    const state = room.matchState;
    if (!state || state.ended) return;
    const alive = state.players.filter(p => p.alive);
    if (alive.length <= 1) {
      this.finishMatch(room, alive.length === 1 ? 'survivor' : 'everyone-eliminated');
      return;
    }
    const nextId = Engine.nextAlivePlayerId(state.turnOrder, previousId, state.players);
    state.currentId = nextId;
    state.turnId += 1;
    state.turnLeft = TURN_SECONDS;
    state.turnDeadline = this.now() + TURN_SECONDS * 1000;
    state.lastEvent = { type: 'turn-started', playerId: nextId, turnId: state.turnId, at: this.now() };
    room.lastEvent = state.lastEvent;
  }

  _resolveAfterDeath(room, playerId) {
    const state = room.matchState;
    const alive = state.players.filter(p => p.alive);
    if (alive.length <= 1) {
      this.finishMatch(room, alive.length === 1 ? 'survivor' : 'everyone-eliminated');
      return;
    }
    if (state.currentId === playerId) this._advanceTurn(room, playerId);
  }

  finishMatch(room, reason) {
    const state = room?.matchState;
    if (!state || state.ended) return state;
    const results = Engine.calculateMatchResult({
      players: state.players, cells: state.cells, deathOrder: state.deathOrder,
      reason, placePoints: PLACE_POINTS, skipPenaltyPerTurn: SKIP_PENALTY
    });
    for (const update of results.players) {
      const player = state.players.find(p => p.id === update.id);
      if (!player) continue;
      player.place = update.place; player.rankPoints = update.rankPoints;
      player.correctFlags = update.correctFlags; player.wrongFlags = update.wrongFlags;
      player.flagScore = update.flagScore; player.skipPenalty = update.skipPenalty;
      player.score = update.totalScore; player.scoreBreakdown = update.scoreBreakdown;
    }
    state.ended = true;
    state.started = false;
    state.endReason = reason;
    state.results = results;
    state.turnLeft = 0;
    state.matchLeft = Math.max(0, Number(state.matchLeft) || 0);
    state.turnDeadline = null; state.matchDeadline = null;
    state.endRevealComplete = true;
    state.scoreNote = 'Điểm cờ đúng +1, cờ sai −1 cho tất cả người chơi, kể cả người đã bị loại. Tổng điểm = điểm hạng + điểm cờ − (5 × lượt bỏ qua).';
    state.lastEvent = { type: 'match-ended', reason, results, at: this.now() };
    room.lastEvent = state.lastEvent;
    return state;
  }

  tickRoom(room) {
    const state = room?.matchState;
    if (!room || room.status !== 'playing' || !state || !state.started || state.ended) return false;
    const now = this.now();
    state.matchLeft = Math.max(0, Math.ceil((state.matchDeadline - now) / 1000));
    state.turnLeft = Math.max(0, Math.ceil((state.turnDeadline - now) / 1000));
    if (now >= state.matchDeadline) {
      this.finishMatch(room, 'timeout');
      return true;
    }
    if (now >= state.turnDeadline) {
      const player = state.players.find(p => p.id === state.currentId);
      if (player?.alive) Engine.applyTimeoutPenalty(player, SKIP_PENALTY);
      state.lastEvent = { type: 'turn-timeout', playerId: state.currentId, at: now };
      state.lastAction = { ...state.lastEvent };
      room.lastEvent = state.lastEvent;
      this._advanceTurn(room, state.currentId);
      return true;
    }
    return true; // Publish clock updates every server tick.
  }

  publicRoom(room) {
    if (!room) return null;
    return {
      code: room.code, status: room.status, hostPlayerId: room.hostPlayerId,
      config: { boardSize: room.config.boardSize, difficulty: room.config.difficulty, density: room.config.density, mineCount: room.config.mineCount, matchDurationMinutes: room.config.matchDurationMinutes, arenaSkin: room.config.arenaSkin, bombSkin: room.config.bombSkin, maxPlayers: room.config.maxPlayers },
      players: room.players.map(player => ({
        id: player.id, name: player.name, color: player.color, skin: player.skin, avatar: player.avatar,
        flag: player.flag, bomb: player.bomb, elimination: player.elimination, trail: player.trail,
        celebration: player.celebration, seatIndex: player.seatIndex, ready: player.ready, connected: player.connected,
        reconnectSeconds: !player.connected && Number.isFinite(player.disconnectDeadline)
          ? Math.max(0, Math.ceil((player.disconnectDeadline - this.now()) / 1000)) : 0
      })),
      rematch: room.matchState?.ended ? { votes: [...(room.rematchVotes || [])], count: (room.rematchVotes || new Set()).size, required: room.players.filter(p => p.connected).length, invitedBy: room.rematchInvitedBy || null, inviterName: room.players.find(p => p.id === room.rematchInvitedBy)?.name || null } : null,
      lastEvent: room.lastEvent,
      cursors: [...room.cursors.entries()].map(([playerId, index]) => ({ playerId, index }))
    };
  }

  publicMatchState(room) {
    if (!room?.matchState) return null;
    return Engine.toPublicGameState(room.matchState);
  }

  returnToLobby(connectionId) {
    const room = this.findRoomForConnection(connectionId);
    if (!room) throw new Error('Bạn chưa ở trong phòng.');
    const player = this.findPlayer(room, connectionId);
    if (!player) throw new Error('Không tìm thấy người chơi trong phòng.');
    if (room.status !== 'playing' || !room.matchState?.ended) throw new Error('Chỉ có thể quay lại sảnh sau khi trận kết thúc.');
    room.players = room.players.filter(p => {
      if (p.connected) return true;
      this._invalidateResumeToken(p);
      p.disconnectDeadline = null;
      p.disconnectExpired = true;
      return false;
    });
    if (!room.players.length) {
      this.rooms.delete(room.code);
      this.clientRoom.delete(connectionId);
      return { room: null, removedCode: room.code };
    }
    if (!room.players.some(p => p.id === room.hostPlayerId)) room.hostPlayerId = room.players[0].id;
    room.status = 'waiting'; room.matchState = null; room.matchId = null;
    room.cursors.clear(); room.seenCommandIds.clear(); room.rouletteActivated = false;
    room.rematchVotes?.clear(); room.rematchInvitedBy = null;
    room.players.forEach(p => { p.ready = false; });
    room.lastEvent = { type: 'returned-to-lobby', at: this.now() };
    return { room, removedCode: null };
  }

  leave(connectionId) {
    const code = this.clientRoom.get(connectionId);
    if (!code) return null;
    const room = this.rooms.get(code);
    this.clientRoom.delete(connectionId);
    if (!room) return null;
    const player = this.findPlayer(room, connectionId);
    if (!player) return { room, removedCode: null };
    this._invalidateResumeToken(player);
    player.disconnectDeadline = null;
    player.disconnectExpired = true;

    // If someone leaves during the cinematic/roulette before the clock starts, cancel
    // that pregame and return everyone else to the lobby instead of fabricating a death.
    if (room.status === 'playing' && room.matchState && !room.matchState.ended && !room.matchState.started) {
      room.players = room.players.filter(p => p.connectionId !== connectionId);
      room.cursors.delete(player.id);
      this._transferHost(room, player.id);
      if (!room.players.length) { this.rooms.delete(code); return { room: null, removedCode: code }; }
      room.status = room.players.length === room.config.maxPlayers && room.players.every(p => p.ready && p.connected) ? 'ready' : 'waiting';
      room.matchState = null; room.matchId = null; room.cursors.clear(); room.seenCommandIds.clear(); room.rouletteActivated = false;
      room.rematchVotes?.clear(); room.rematchInvitedBy = null;
      room.players.forEach(p => { p.ready = false; });
      room.lastEvent = { type: 'pregame-cancelled', playerId: player.id, at: this.now() };
      return { room, removedCode: code };
    }

    // Keep an in-progress participant in the match record so their already-placed flags
    // remain attributable at final scoring. Disconnecting abandons their character only.
    if (room.status === 'playing' && room.matchState && !room.matchState.ended) {
      player.connected = false; player.connectionId = null; player.ready = false;
      this._transferHost(room, player.id); // Host authority moves immediately; room config remains immutable.
      const state = room.matchState;
      const gamePlayer = state.players.find(p => p.id === player.id);
      if (gamePlayer) gamePlayer.connected = false;
      if (gamePlayer?.alive) {
        const wasCurrent = state.currentId === gamePlayer.id;
        Engine.eliminatePlayer(state.players, state.deathOrder, gamePlayer.id, Number.isInteger(gamePlayer.pos) ? gamePlayer.pos : 0);
        if (state.players.filter(p => p.alive).length <= 1) this.finishMatch(room, state.players.some(p => p.alive) ? 'survivor' : 'everyone-eliminated');
        else if (wasCurrent) this._advanceTurn(room, gamePlayer.id);
      }
      room.cursors.delete(player.id);
      room.lastEvent = { type: 'player-disconnected', playerId: player.id, name: player.name, at: this.now() };
      return { room, removedCode: null, playerLeftMatch: true };
    }

    if (room.status === 'playing' && room.matchState?.ended) {
      room.players = room.players.filter(p => {
        const keep = p.connectionId !== connectionId && p.connected;
        if (!keep) {
          this._invalidateResumeToken(p);
          p.disconnectDeadline = null;
          p.disconnectExpired = true;
        }
        return keep;
      });
      room.rematchVotes?.delete(player.id);
      if (room.rematchInvitedBy === player.id) room.rematchInvitedBy = null;
      room.cursors.delete(player.id);
      if (!room.players.length) {
        this.rooms.delete(code);
        return { room: null, removedCode: code, returnedToLobby: false };
      }
      this._transferHost(room, player.id);
      room.status = 'waiting'; room.matchState = null; room.matchId = null;
      room.cursors.clear(); room.seenCommandIds.clear(); room.rouletteActivated = false;
      room.rematchVotes?.clear(); room.rematchInvitedBy = null;
      room.players.forEach(p => { p.ready = false; });
      room.lastEvent = { type: 'results-player-left', playerId: player.id, name: player.name, at: this.now() };
      return { room, removedCode: null, returnedToLobby: true };
    }

    room.players = room.players.filter(p => p.connectionId !== connectionId);
    room.rematchVotes?.delete(player.id);
    if (room.rematchInvitedBy === player.id) room.rematchInvitedBy = null;
    room.cursors.delete(player.id);
    room.lastEvent = { type: 'player-left', playerId: player.id, name: player.name, at: this.now() };
    this._transferHost(room, player.id);
    if (!room.players.length) {
      this.rooms.delete(code);
      return { room: null, removedCode: code };
    }
    if (room.status === 'ready') {
      room.status = 'waiting'; room.players.forEach(p => { p.ready = false; });
    }
    return { room, removedCode: code };
  }

  disconnect(connectionId) {
    const code = this.clientRoom.get(connectionId);
    if (!code) return null;
    const room = this.rooms.get(code);
    this.clientRoom.delete(connectionId);
    if (!room) return null;

    const player = this.findPlayer(room, connectionId);
    if (!player) return { room, removedCode: null };

    const now = this.now();
    player.connectionId = null;
    player.connected = false;
    player.ready = false;
    player.disconnectedAt = now;
    player.disconnectDeadline = now + this.disconnectGraceMs;
    player.disconnectExpired = false;
    if (room.status === 'ready') room.status = 'waiting';

    this._transferHost(room, player.id);
    const gamePlayer = room.matchState?.players.find(item => item.id === player.id);
    if (gamePlayer) gamePlayer.connected = false;
    room.cursors.delete(player.id);
    room.lastEvent = {
      type: 'player-disconnected', playerId: player.id, name: player.name,
      reconnectSeconds: Math.ceil(this.disconnectGraceMs / 1000), at: now
    };
    return { room, playerDisconnected: true, graceExpiresAt: player.disconnectDeadline };
  }

  expireDisconnectedPlayers(room) {
    const result = { roomChanged: false, matchChanged: false, roomDeleted: false };
    if (!room) return result;

    const now = this.now();
    const expiredPlayers = room.players.filter(player =>
      !player.connected && Number.isFinite(player.disconnectDeadline) && player.disconnectDeadline <= now
    );

    for (const player of expiredPlayers) {
      if (!room.players.includes(player) || player.connected ||
          !Number.isFinite(player.disconnectDeadline) || player.disconnectDeadline > now) continue;

      player.disconnectDeadline = null;
      player.disconnectExpired = true;
      this._invalidateResumeToken(player);

      const state = room.matchState;
      if (room.status === 'playing' && state && !state.ended && state.started) {
        const gamePlayer = state.players.find(item => item.id === player.id);
        if (gamePlayer) {
          gamePlayer.connected = false;
          if (gamePlayer.alive) {
            const wasCurrent = state.currentId === gamePlayer.id;
            Engine.eliminatePlayer(
              state.players, state.deathOrder, gamePlayer.id,
              Number.isInteger(gamePlayer.pos) ? gamePlayer.pos : 0
            );
            this._resolveAfterDeath(room, gamePlayer.id);
            if (!wasCurrent && !state.ended) {
              const event = { type: 'player-disconnect-expired', playerId: player.id, name: player.name, at: now };
              state.lastEvent = event;
              state.lastAction = { ...event };
            }
          }
        }
        room.lastEvent = { type: 'player-disconnect-expired', playerId: player.id, name: player.name, at: now };
        result.roomChanged = true;
        result.matchChanged = true;
        continue;
      }

      if (room.status === 'playing' && state && !state.ended && !state.started) {
        room.players = room.players.filter(item => item.id !== player.id);
        room.cursors.delete(player.id);
        this._transferHost(room, player.id);
        if (!room.players.length) {
          this.rooms.delete(room.code);
          result.roomChanged = true;
          result.roomDeleted = true;
          return result;
        }
        room.status = room.players.length === room.config.maxPlayers && room.players.every(item => item.ready && item.connected) ? 'ready' : 'waiting';
        room.matchState = null;
        room.matchId = null;
        room.cursors.clear();
        room.seenCommandIds.clear();
        room.rouletteActivated = false;
        room.rematchVotes?.clear();
        room.rematchInvitedBy = null;
        room.players.forEach(item => { item.ready = false; });
        room.lastEvent = { type: 'pregame-cancelled', playerId: player.id, at: now };
        result.roomChanged = true;
        continue;
      }

      if (room.status === 'playing' && state?.ended) {
        room.lastEvent = { type: 'results-player-disconnected', playerId: player.id, name: player.name, at: now };
        result.roomChanged = true;
        continue;
      }

      room.players = room.players.filter(item => item.id !== player.id);
      room.cursors.delete(player.id);
      this._transferHost(room, player.id);
      if (!room.players.length) {
        this.rooms.delete(room.code);
        result.roomChanged = true;
        result.roomDeleted = true;
        return result;
      }
      if (room.status === 'ready') {
        room.status = 'waiting';
        room.players.forEach(item => { item.ready = false; });
      }
      room.lastEvent = { type: 'player-disconnect-expired', playerId: player.id, name: player.name, at: now };
      result.roomChanged = true;
    }

    return result;
  }
}

module.exports = { RoomManager, normalizeConfig, normalizeCosmetics, cleanName, DENSITIES, ARENA_SKINS, MATCH_DURATIONS, DEFAULT_MATCH_DURATION_MINUTES, MATCH_SECONDS, TURN_SECONDS, DISCONNECT_GRACE_MS, SKIP_PENALTY, PLACE_POINTS };
