'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { RoomManager, normalizeConfig, cleanName, DISCONNECT_GRACE_MS } = require('../server/room-manager.js');

function twoPlayerRoom(manager, config = { boardSize: 8, difficulty: 'medium' }) {
  const created = manager.createRoom('c1', 'Phong', config);
  manager.joinRoom('c2', created.room.code, 'Lan');
  manager.setReady('c1', true);
  manager.setReady('c2', true);
  return created.room;
}

test('normalizes supported online configuration and rounds mine count', () => {
  assert.deepEqual(normalizeConfig({ boardSize: 8, difficulty: 'easy' }), { boardSize: 8, difficulty: 'easy', density: 0.25, mineCount: 16, matchDurationMinutes: 10, arenaSkin: 'arena-standard', bombSkin: 'bomb-standard', maxPlayers: 2 });
  assert.equal(normalizeConfig({ boardSize: 20, difficulty: 'hard' }).mineCount, 200);
  assert.equal(normalizeConfig({ boardSize: 10, difficulty: 'medium', arenaSkin: 'arena-neon' }).arenaSkin, 'arena-neon');
  assert.equal(normalizeConfig({ boardSize: 20, difficulty: 'hard', bombSkin: 'bomb-fire' }).bombSkin, 'bomb-fire');
  assert.equal(normalizeConfig({ boardSize: 20, difficulty: 'hard', bombSkin: 'bad-id' }).bombSkin, 'bomb-standard');
  assert.equal(normalizeConfig({ boardSize: 10, difficulty: 'medium', arenaSkin: 'custom-css' }).arenaSkin, 'arena-standard');
  assert.throws(() => normalizeConfig({ boardSize: 9, difficulty: 'medium' }), /Kích thước/);
  assert.throws(() => normalizeConfig({ boardSize: 8, difficulty: 'impossible' }), /Độ khó/);
  assert.equal(normalizeConfig({ boardSize: 8, difficulty: 'easy', maxPlayers: 5 }).maxPlayers, 5);
  assert.throws(() => normalizeConfig({ boardSize: 8, difficulty: 'easy', maxPlayers: 1 }), /2 đến 5/);
  assert.throws(() => normalizeConfig({ boardSize: 8, difficulty: 'easy', maxPlayers: 6 }), /2 đến 5/);
  for (const minutes of [10, 15, 20, 25, 30]) assert.equal(normalizeConfig({ matchDurationMinutes: minutes }).matchDurationMinutes, minutes);
  for (const minutes of [0, 5, 12, 35, 60]) assert.throws(() => normalizeConfig({ matchDurationMinutes: minutes }), /Thời lượng trận/);
});


test('match duration selection is authoritative from room creation through server timeout', () => {
  let now = 5000;
  const manager = new RoomManager({ now: () => now, rng: () => 0.13 });
  const room = twoPlayerRoom(manager, { boardSize: 8, difficulty: 'easy', matchDurationMinutes: 30 });
  assert.equal(manager.publicRoom(room).config.matchDurationMinutes, 30);
  manager.startMatch('c1');
  assert.equal(room.matchState.matchLeft, 1800);
  manager.activateRoulette('c2');
  manager.beginMatch('c1', room.matchId);
  assert.equal(room.matchState.matchDeadline, now + 1800000);
  now += 1799000;
  manager.tickRoom(room);
  assert.equal(room.matchState.matchLeft, 1);
  now += 1000;
  manager.tickRoom(room);
  assert.equal(room.matchState.ended, true);
  assert.equal(room.matchState.endReason, 'timeout');
});

test('sanitizes player names and limits display length', () => {
  assert.equal(cleanName('  <Phong>\n'), 'Phong');
  assert.equal(cleanName('A'.repeat(30)).length, 18);
  assert.equal(cleanName('   '), 'Người chơi');
});

test('creates a waiting room and allows a second participant to join', () => {
  const manager = new RoomManager();
  const { room, player } = manager.createRoom('c1', 'Phong', { boardSize: 8, difficulty: 'medium' });
  assert.equal(room.status, 'waiting');
  assert.equal(room.players.length, 1);
  assert.equal(player.name, 'Phong');
  manager.joinRoom('c2', room.code.toLowerCase(), 'Lan');
  assert.equal(room.players.length, 2);
  assert.throws(() => manager.joinRoom('c3', room.code, 'Third'), /đủ 2/);
});


test('supports host-selected rooms for 2 through 5 participants', () => {
  for (const maxPlayers of [2, 3, 4, 5]) {
    const manager = new RoomManager();
    const { room } = manager.createRoom('host', 'Host', { boardSize: 8, difficulty: 'easy', maxPlayers });
    for (let i = 1; i < maxPlayers; i++) manager.joinRoom(`conn-${i}`, room.code, `Player ${i}`);
    assert.equal(room.players.length, maxPlayers);
    assert.equal(manager.publicRoom(room).config.maxPlayers, maxPlayers);
    assert.throws(() => manager.joinRoom('overflow', room.code, 'Overflow'), new RegExp(`đủ ${maxPlayers}`));
    for (const player of room.players) manager.setReady(player.connectionId, true);
    assert.equal(room.status, 'ready');
    assert.equal(manager.startMatch('host').status, 'playing');
    assert.equal(room.matchState.players.length, maxPlayers);
    assert.equal(new Set(room.matchState.players.map(p => p.color)).size, maxPlayers);
  }
});

test('room cannot start until configured capacity is filled and all participants are ready', () => {
  const manager = new RoomManager();
  const { room } = manager.createRoom('host', 'Host', { boardSize: 8, difficulty: 'easy', maxPlayers: 5 });
  manager.joinRoom('c2', room.code, 'Guest');
  manager.setReady('host', true); manager.setReady('c2', true);
  assert.equal(room.status, 'waiting');
  assert.throws(() => manager.startMatch('host'), /Cần đủ 5 người chơi/);
});

test('host arena and bomb visual remain authoritative and joining players cannot override them', () => {
  const manager = new RoomManager();
  const { room } = manager.createRoom('host-connection', 'Phong', { boardSize: 10, difficulty: 'easy', arenaSkin: 'arena-neon', bombSkin: 'bomb-fire' }, 'host-identity-001', { bomb: 'bomb-fire' });
  assert.equal(manager.publicRoom(room).config.arenaSkin, 'arena-neon');
  assert.equal(manager.publicRoom(room).config.bombSkin, 'bomb-fire');
  manager.joinRoom('guest-connection', room.code, 'Lan', 'guest-identity-001', { bomb: 'bomb-ice' });
  assert.equal(room.config.arenaSkin, 'arena-neon');
  assert.equal(room.config.bombSkin, 'bomb-fire');
  for (const p of room.players) manager.setReady(p.connectionId, true);
  manager.startMatch('host-connection');
  assert.deepEqual(room.matchState.players.map(p => p.bomb), ['bomb-fire', 'bomb-fire']);
});

test('rejects create/join when a connection already belongs to a room', () => {
  const manager = new RoomManager();
  const { room } = manager.createRoom('c1', 'Phong', { boardSize: 8, difficulty: 'easy' });
  assert.throws(() => manager.createRoom('c1', 'Again', { boardSize: 8, difficulty: 'easy' }), /phòng khác/);
  assert.throws(() => manager.joinRoom('c1', room.code, 'Again'), /phòng khác/);
});

test('default two-player room becomes ready only when both connected players are ready', () => {
  const manager = new RoomManager();
  const { room } = manager.createRoom('c1', 'Phong', { boardSize: 8, difficulty: 'medium' });
  assert.equal(manager.setReady('c1', true).status, 'waiting');
  manager.joinRoom('c2', room.code, 'Lan');
  manager.setReady('c2', true);
  assert.equal(room.status, 'ready');
  manager.setReady('c1', false);
  assert.equal(room.status, 'waiting');
});

test('only the ready host can start a match', () => {
  const manager = new RoomManager();
  const room = twoPlayerRoom(manager);
  const guestId = room.players[1].connectionId;
  assert.throws(() => manager.startMatch(guestId), /chủ phòng/);
  assert.equal(manager.startMatch('c1').status, 'playing');
});

test('roulette activation broadcasts a server-authoritative starter for both players', () => {
  const manager = new RoomManager();
  const room = twoPlayerRoom(manager, { boardSize: 8, difficulty: 'easy' });
  manager.startMatch('c1');
  const expectedStarter = room.matchState.currentId;
  const activated = manager.activateRoulette('c2');
  assert.equal(activated.room, room);
  assert.equal(activated.matchId, room.matchId);
  assert.equal(activated.startPlayerId, expectedStarter);
  assert.equal(room.rouletteActivated, true);
  const again = manager.activateRoulette('c1');
  assert.equal(again.startPlayerId, expectedStarter);
  assert.throws(() => manager.activateRoulette('unknown-connection'), /Trận chưa ở giai đoạn roulette/);
});

test('public match snapshot hides truth for all covered cells', () => {
  const manager = new RoomManager();
  const room = twoPlayerRoom(manager, { boardSize: 8, difficulty: 'hard' });
  manager.startMatch('c1');
  const publicState = manager.publicMatchState(room);
  assert.equal(publicState.board.cells.length, 64);
  assert.equal(publicState.board.mineCount, 32);
  const hidden = publicState.board.cells.filter(cell => !cell.revealed && !cell.exploded && !cell.endRevealed);
  assert.ok(hidden.length > 0);
  assert.ok(hidden.every(cell => cell.mine === null && cell.adj === null));
  assert.equal(publicState.board.cells.filter(cell => cell.revealed && cell.mine === true).length, 0);
});

test('cursor changes broadcast-safe data without changing hidden board truth', () => {
  const manager = new RoomManager();
  const room = twoPlayerRoom(manager);
  manager.startMatch('c1');
  const before = manager.publicMatchState(room);
  const player = room.players[1];
  const index = 7;
  const out = manager.setCursor(player.connectionId, index);
  assert.equal(out.player.id, player.id);
  assert.deepEqual(manager.publicRoom(room).cursors, [{ playerId: player.id, index }]);
  const after = manager.publicMatchState(room);
  assert.deepEqual(after.board.cells.map(c => c.mine), before.board.cells.map(c => c.mine));
  assert.throws(() => manager.setCursor(player.connectionId, 64), /không hợp lệ/);
});

test('public room never contains connection identifiers', () => {
  const manager = new RoomManager();
  const { room } = manager.createRoom('secret-connection-id', 'Phong', { boardSize: 8, difficulty: 'easy' });
  const text = JSON.stringify(manager.publicRoom(room));
  assert.equal(text.includes('secret-connection-id'), false);
  assert.equal(text.includes('connectionId'), false);
});

test('leaving during the pregame cancels match setup and removes cursors', () => {
  const manager = new RoomManager();
  const room = twoPlayerRoom(manager);
  manager.startMatch('c1');
  manager.setCursor('c1', 10);
  const result = manager.leave('c2');
  assert.equal(result.room.status, 'waiting');
  assert.equal(result.room.players.length, 1);
  assert.equal(result.room.matchState, null);
  assert.equal(result.room.cursors.size, 0);
});

test('Phase 0.9C: gameplay starts only after roulette and the server clock starts', () => {
  let now = 1000;
  const manager = new RoomManager({ now: () => now, rng: () => 0.17 });
  const room = twoPlayerRoom(manager, { boardSize: 10, difficulty: 'easy', maxPlayers: 2 });
  manager.startMatch('c1');
  assert.equal(room.matchState.started, false);
  manager.activateRoulette('c1');
  manager.beginMatch('c2', room.matchId);
  assert.equal(room.matchState.started, true);
  assert.equal(room.matchState.matchLeft, 600);
  assert.equal(room.matchState.turnLeft, 60);
  assert.equal(room.matchState.matchDeadline, now + 600000);
  assert.equal(room.matchState.turnDeadline, now + 60000);
});

test('Phase 0.9C: MOVE changes position without ending the turn, then FLAG ends it', () => {
  const manager = new RoomManager({ rng: () => 0.23 });
  const room = twoPlayerRoom(manager, { boardSize: 10, difficulty: 'easy' });
  manager.startMatch('c1'); manager.activateRoulette('c1'); manager.beginMatch('c1', room.matchId);
  const state = room.matchState;
  const activeId = state.currentId;
  const activeConnection = room.players.find(p => p.id === activeId).connectionId;
  const index = state.cells.find(cell => !cell.revealed && !cell.zone && !cell.mine)?.i;
  assert.ok(Number.isInteger(index));
  const command = (type, id, n, at) => ({ protocolVersion: 1, type, playerId: id, matchId: state.matchId, turnId: state.turnId, commandId: `cmd-${n}`, payload: { index: at } });
  const oldTurn = state.turnId;
  const fromIndex = state.players.find(p => p.id === activeId).pos;
  assert.equal(manager.applyCommand(activeConnection, command('MOVE', activeId, 1, index)).action, 'move');
  assert.equal(state.players.find(p => p.id === activeId).pos, index);
  assert.equal(state.turnId, oldTurn);
  const moveSnapshot = manager.publicMatchState(room);
  assert.equal(moveSnapshot.lastAction.type, 'move');
  assert.equal(moveSnapshot.lastAction.playerId, activeId);
  assert.equal(moveSnapshot.lastAction.fromIndex, fromIndex);
  assert.equal(moveSnapshot.lastAction.index, index);
  assert.equal(manager.applyCommand(activeConnection, command('FLAG', activeId, 2, index)).action, 'flag');
  assert.equal(state.cells[index].flagOwner, activeId);
  assert.equal(state.turnId, oldTurn + 1);
  assert.equal(manager.publicMatchState(room).lastAction.type, 'flag');
  assert.notEqual(state.currentId, activeId);
});

test('Standard mode rejects removing an opponent flag without consuming the turn or freezing later actions', () => {
  const manager = new RoomManager({ rng: () => 0.29 });
  const room = twoPlayerRoom(manager, { boardSize: 10, difficulty: 'easy' });
  manager.startMatch('c1'); manager.activateRoulette('c2'); manager.beginMatch('c2', room.matchId);
  const state = room.matchState;
  const activeId = state.currentId;
  const otherId = state.turnOrder.find(id => id !== activeId);
  const activeConnection = room.players.find(p => p.id === activeId).connectionId;
  const otherConnection = room.players.find(p => p.id === otherId).connectionId;
  const index = state.cells.find(cell => !cell.revealed && !cell.zone && !cell.mine)?.i;
  const alternate = state.cells.find(cell => !cell.revealed && !cell.zone && !cell.mine && cell.i !== index)?.i;
  let counter = 0;
  const issue = (connectionId, id, type, at) => manager.applyCommand(connectionId, {
    protocolVersion: 1, type, playerId: id, matchId: state.matchId, turnId: state.turnId,
    commandId: `toggle-${++counter}`, payload: { index: at }
  });
  issue(activeConnection, activeId, 'MOVE', index);
  issue(activeConnection, activeId, 'FLAG', index);
  assert.equal(state.cells[index].flagOwner, activeId);
  assert.equal(state.currentId, otherId);
  issue(otherConnection, otherId, 'MOVE', index);
  const turnBeforeRejectedUnflag = state.turnId;
  assert.throws(() => issue(otherConnection, otherId, 'UNFLAG', index), /chỉ cho phép gỡ cờ do chính bạn đặt/i);
  assert.equal(state.cells[index].flagOwner, activeId);
  assert.equal(state.currentId, otherId);
  assert.equal(state.turnId, turnBeforeRejectedUnflag, 'rejected action must not advance or lock the turn');
  issue(otherConnection, otherId, 'MOVE', alternate);
  issue(otherConnection, otherId, 'FLAG', alternate);
  assert.equal(state.cells[alternate].flagOwner, otherId, 'player can continue with a valid action after rejection');
  assert.notEqual(state.currentId, otherId);
});

test('Phase 0.9C: hidden mines stay private in play and all become public with all-player results at end', () => {
  const manager = new RoomManager({ rng: () => 0.41 });
  const room = twoPlayerRoom(manager, { boardSize: 8, difficulty: 'easy' });
  manager.startMatch('c1'); manager.activateRoulette('c1'); manager.beginMatch('c1', room.matchId);
  const state = room.matchState;
  const hiddenMine = state.cells.find(cell => cell.mine && !cell.revealed && !cell.zone);
  const visibleBefore = manager.publicMatchState(room).board.cells[hiddenMine.i];
  assert.equal(visibleBefore.mine, null);
  state.cells.find(cell => !cell.revealed && !cell.zone && !cell.mine).flagOwner = state.players[1].id;
  manager.finishMatch(room, 'timeout');
  const after = manager.publicMatchState(room);
  assert.equal(after.status, 'ended');
  assert.equal(after.board.cells[hiddenMine.i].mine, true);
  assert.equal(after.results.players.length, 2);
  const flagOwnerResult = after.results.players.find(result => result.id === state.players[1].id);
  assert.equal(flagOwnerResult.wrongFlags, 1);
  assert.equal(flagOwnerResult.flagScore, -1);
});


test('Phase 0.9C: board uses the exact selected dimensions and the offline default character palette', () => {
  const expectedPalette = ['#63e0d5', '#ffc267', '#9e8aff', '#ff7884', '#85dc87'];
  const manager = new RoomManager({ rng: () => 0.19 });
  const room = twoPlayerRoom(manager, { boardSize: 20, difficulty: 'easy', maxPlayers: 2 });
  manager.startMatch('c1');
  assert.equal(room.matchState.boardSize, 20);
  assert.equal(room.matchState.cells.length, 400);
  assert.deepEqual(room.matchState.players.map(player => player.color), expectedPalette.slice(0, 2));
  assert.equal(manager.publicMatchState(room).board.size, 20);
  assert.equal(manager.publicMatchState(room).board.cells.length, 400);
});

test('Phase 0.9C: explicitly leaving a match preserves the leaver flags for final scoring', () => {
  const manager = new RoomManager({ rng: () => 0.37 });
  const room = twoPlayerRoom(manager, { boardSize: 10, difficulty: 'easy' });
  manager.startMatch('c1'); manager.activateRoulette('c1'); manager.beginMatch('c1', room.matchId);
  const state = room.matchState;
  const ownerId = state.currentId;
  const ownerConnection = room.players.find(p => p.id === ownerId).connectionId;
  const mineIndex = state.cells.find(cell => cell.mine && !cell.revealed && !cell.zone).i;
  let seq = 0;
  const issue = (type, index) => manager.applyCommand(ownerConnection, {
    protocolVersion: 1, type, playerId: ownerId, matchId: state.matchId,
    turnId: state.turnId, commandId: `disconnect-${++seq}`, payload: { index }
  });
  issue('MOVE', mineIndex);
  issue('FLAG', mineIndex);
  assert.equal(state.cells[mineIndex].flagOwner, ownerId);
  const outcome = manager.leave(ownerConnection);
  assert.ok(outcome.room);
  assert.equal(state.cells[mineIndex].flagOwner, ownerId);
  assert.equal(state.players.find(p => p.id === ownerId).alive, false);
  assert.equal(state.ended, true);
  const result = state.results.players.find(player => player.id === ownerId);
  assert.equal(result.correctFlags, 1);
  assert.equal(result.flagScore, 1);
});


test('resume tokens are private, single-use, and rotate after a successful reconnect', () => {
  let now = 1000;
  const manager = new RoomManager({ now: () => now });
  const created = manager.createRoom('c1', 'Phong', { boardSize: 8, difficulty: 'easy' }, 'resume-host-identity-001');
  const { room, player, resumeToken } = created;

  assert.match(resumeToken, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(player.resumeTokenHash, resumeToken);
  const publicRoom = JSON.stringify(manager.publicRoom(room));
  assert.equal(publicRoom.includes(resumeToken), false);
  assert.equal(publicRoom.includes(player.resumeTokenHash), false);
  assert.equal(publicRoom.includes('resumeTokenHash'), false);

  manager.disconnect('c1');
  assert.equal(player.connected, false);
  assert.equal(player.disconnectDeadline, now + DISCONNECT_GRACE_MS);
  assert.equal(room.players.length, 1);

  now += 5000;
  const resumed = manager.resume('c2', resumeToken);
  assert.equal(resumed.room, room);
  assert.equal(resumed.player.id, player.id);
  assert.equal(player.connected, true);
  assert.equal(player.connectionId, 'c2');
  assert.notEqual(resumed.resumeToken, resumeToken);
  assert.equal(manager.clientRoom.get('c2'), room.code);
  assert.throws(() => manager.resume('c3', resumeToken), /không hợp lệ|đã được sử dụng/);

  assert.equal(manager.disconnect('c1'), null, 'a delayed close from the old socket must not disconnect the rebound player');
  assert.equal(player.connected, true);
});

test('resume rejects a live session and refuses reconnection after the grace deadline', () => {
  let now = 0;
  const manager = new RoomManager({ now: () => now });
  const created = manager.createRoom('c1', 'Phong', { boardSize: 8, difficulty: 'easy' });

  assert.throws(() => manager.resume('c2', created.resumeToken), /đang được kết nối/);
  manager.disconnect('c1');
  now += DISCONNECT_GRACE_MS;
  assert.throws(() => manager.resume('c2', created.resumeToken), /hết thời gian/);
  const expiry = manager.expireDisconnectedPlayers(created.room);
  assert.equal(expiry.roomDeleted, true);
  assert.equal(manager.rooms.has(created.room.code), false);
});

test('temporary disconnect keeps a live match player alive and the authoritative turn clock running', () => {
  let now = 5000;
  const manager = new RoomManager({ now: () => now, rng: () => 0.23 });
  const created = manager.createRoom('c1', 'Phong', { boardSize: 10, difficulty: 'easy' });
  const joined = manager.joinRoom('c2', created.room.code, 'Lan');
  manager.setReady('c1', true);
  manager.setReady('c2', true);
  manager.startMatch('c1');
  manager.activateRoulette('c1');
  manager.beginMatch('c1', created.room.matchId);

  const state = created.room.matchState;
  const currentId = state.currentId;
  const currentRoomPlayer = created.room.players.find(player => player.id === currentId);
  const token = currentId === created.player.id ? created.resumeToken : joined.resumeToken;
  const oldConnection = currentRoomPlayer.connectionId;
  const originalDeadline = state.turnDeadline;

  manager.disconnect(oldConnection);
  assert.equal(state.players.find(player => player.id === currentId).alive, true);
  assert.equal(state.players.find(player => player.id === currentId).connected, false);

  now += 10_000;
  manager.tickRoom(created.room);
  assert.equal(state.turnDeadline, originalDeadline);
  assert.equal(state.turnLeft, 50);

  const resumed = manager.resume('reconnected-socket', token);
  assert.equal(resumed.player.id, currentId);
  assert.equal(state.players.find(player => player.id === currentId).alive, true);
  assert.equal(state.players.find(player => player.id === currentId).connected, true);
  assert.equal(state.turnDeadline, originalDeadline, 'reconnect must not reset or pause the turn deadline');
});

test('grace expiry eliminates a disconnected active player exactly once and ends a two-player match', () => {
  let now = 10_000;
  const manager = new RoomManager({ now: () => now, rng: () => 0.37 });
  const created = manager.createRoom('c1', 'Phong', { boardSize: 10, difficulty: 'easy' });
  manager.joinRoom('c2', created.room.code, 'Lan');
  manager.setReady('c1', true);
  manager.setReady('c2', true);
  manager.startMatch('c1');
  manager.activateRoulette('c1');
  manager.beginMatch('c1', created.room.matchId);

  const state = created.room.matchState;
  const disconnectedId = state.currentId;
  const disconnectedConnection = created.room.players.find(player => player.id === disconnectedId).connectionId;
  manager.disconnect(disconnectedConnection);

  now += DISCONNECT_GRACE_MS;
  const firstExpiry = manager.expireDisconnectedPlayers(created.room);
  assert.equal(firstExpiry.matchChanged, true);
  assert.equal(state.players.find(player => player.id === disconnectedId).alive, false);
  assert.equal(state.players.filter(player => player.alive).length, 1);
  assert.equal(state.ended, true);
  assert.equal(state.endReason, 'survivor');

  const secondExpiry = manager.expireDisconnectedPlayers(created.room);
  assert.equal(secondExpiry.matchChanged, false, 'expiry is applied only once');
  assert.equal(state.players.find(player => player.id === disconnectedId).alive, false);
});

test('disconnect grace keeps a pregame room recoverable, then cancels it when the deadline expires', () => {
  let now = 2000;
  const manager = new RoomManager({ now: () => now });
  const created = manager.createRoom('c1', 'Phong', { boardSize: 8, difficulty: 'easy' });
  manager.joinRoom('c2', created.room.code, 'Lan');
  manager.setReady('c1', true);
  manager.setReady('c2', true);
  manager.startMatch('c1');

  manager.disconnect('c2');
  assert.equal(created.room.status, 'playing');
  assert.ok(created.room.matchState);
  now += DISCONNECT_GRACE_MS;
  manager.expireDisconnectedPlayers(created.room);
  assert.equal(created.room.status, 'waiting');
  assert.equal(created.room.matchState, null);
  assert.equal(created.room.players.length, 1);
  assert.equal(created.room.players[0].connected, true);
});

test('waiting-room grace expiry frees the seat, but the disconnected identity cannot bypass its token', () => {
  let now = 1000;
  const manager = new RoomManager({ now: () => now });
  const created = manager.createRoom('c1', 'Phong', { boardSize: 8, difficulty: 'easy', maxPlayers: 2 }, 'resume-host-identity-002');
  const room = created.room;
  manager.joinRoom('c2', room.code, 'Lan', 'resume-guest-identity-002');

  manager.disconnect('c1');
  assert.throws(
    () => manager.joinRoom('c3', room.code, 'Imposter', 'resume-host-identity-002'),
    /đang được giữ/
  );

  now += DISCONNECT_GRACE_MS;
  const expiry = manager.expireDisconnectedPlayers(room);
  assert.equal(expiry.roomChanged, true);
  assert.equal(room.players.length, 1);
  assert.equal(room.hostPlayerId, room.players[0].id);

  const replacement = manager.joinRoom('c3', room.code, 'Phong', 'resume-host-identity-002');
  assert.equal(replacement.player.seatIndex, 0);
  assert.notEqual(replacement.player.id, created.player.id);
  assert.notEqual(room.hostPlayerId, replacement.player.id, 'an expired former host does not regain host authority');
});

test('Phase 0.9C: turn timeout applies the five-point penalty and advances to a living player', () => {
  let now = 0;
  const manager = new RoomManager({ now: () => now, rng: () => 0.31 });
  const room = twoPlayerRoom(manager, { boardSize: 10, difficulty: 'easy' });
  manager.startMatch('c1'); manager.activateRoulette('c1'); manager.beginMatch('c1', room.matchId);
  const firstId = room.matchState.currentId;
  now = 60001;
  manager.tickRoom(room);
  assert.equal(room.matchState.players.find(p => p.id === firstId).missedTurns, 1);
  assert.equal(room.matchState.players.find(p => p.id === firstId).skipPenalty, 5);
  assert.notEqual(room.matchState.currentId, firstId);
  assert.equal(room.matchState.turnLeft, 60);
});


test('equipped cosmetics propagate to online match players and returning clients retain player ID, seat color, and skin', () => {
  const manager = new RoomManager({ rng: () => 0.21 });
  const created = manager.createRoom('host-1', 'Phong', { boardSize: 10, difficulty: 'easy' }, 'mf-host-persistent-identity-01', { skin: 'skin-mint', avatar: 'avatar-fox' });
  const room = created.room;
  const original = created.player;
  manager.joinRoom('guest-1', room.code, 'Lan', 'mf-guest-persistent-identity-01', { skin: 'skin-gold', avatar: 'avatar-robot' });
  assert.equal(manager.publicRoom(room).players[0].skin, 'skin-mint');
  assert.equal(manager.publicRoom(room).players[0].avatar, 'avatar-fox');
  const originalId = original.id, originalSeat = original.seatIndex, originalColor = original.color;
  manager.leave('host-1');
  assert.equal(room.hostPlayerId, room.players[0].id, 'host transfers to the remaining participant');
  const returned = manager.joinRoom('host-2', room.code, 'Phong', 'mf-host-persistent-identity-01', { skin: 'skin-mint', avatar: 'avatar-fox' }).player;
  assert.equal(returned.id, originalId);
  assert.equal(returned.seatIndex, originalSeat);
  assert.equal(returned.color, originalColor);
  assert.equal(returned.skin, 'skin-mint');
  assert.equal(returned.avatar, 'avatar-fox');
  assert.notEqual(room.hostPlayerId, returned.id, 'rejoining restores identity/color but does not automatically steal host status back');
  for (const p of room.players) manager.setReady(p.connectionId, true);
  assert.throws(() => manager.startMatch('host-2'), /chủ phòng/, 'the returning former host must not regain start permission');
  manager.startMatch('guest-1');
  const gamePlayer = room.matchState.players.find(p => p.id === originalId);
  assert.equal(gamePlayer.skin, 'skin-mint');
  assert.equal(gamePlayer.avatar, 'avatar-fox');
});

test('when a player leaves from results the other returns to lobby, inherits host, and keeps room cosmetics', () => {
  const manager = new RoomManager();
  const room = twoPlayerRoom(manager, { boardSize: 20, difficulty: 'medium', arenaSkin: 'arena-void', bombSkin: 'bomb-cosmic' });
  manager.startMatch('c1');
  manager.finishMatch(room, 'timeout');
  const remainingId = room.players[1].id;
  const result = manager.leave('c1');
  assert.equal(result.returnedToLobby, true);
  assert.equal(result.room.status, 'waiting');
  assert.equal(result.room.matchState, null);
  assert.equal(result.room.players.length, 1);
  assert.equal(result.room.hostPlayerId, remainingId);
  assert.equal(result.room.config.boardSize, 20);
  assert.equal(result.room.config.arenaSkin, 'arena-void');
  assert.equal(result.room.config.bombSkin, 'bomb-cosmic');
  assert.throws(() => manager.startMatch('c2'), /Cần đủ 2 người chơi/);
});

test('rematch waits for both players then creates a new match and resets roulette/clock state', () => {
  const manager = new RoomManager({ rng: () => 0.23 });
  const room = twoPlayerRoom(manager, { boardSize: 10, difficulty: 'easy' });
  manager.startMatch('c1'); manager.activateRoulette('c1'); manager.beginMatch('c1', room.matchId);
  const oldMatchId = room.matchId;
  manager.finishMatch(room, 'timeout');
  const firstVote = manager.requestRematch('c1');
  assert.equal(firstVote.restarted, false);
  assert.equal(manager.publicRoom(room).rematch.count, 1);
  assert.equal(manager.publicRoom(room).rematch.required, 2);
  assert.equal(manager.publicRoom(room).rematch.inviterName, 'Phong');
  assert.equal(manager.requestRematch('c1').restarted, false, 'duplicate vote must be idempotent');
  const secondVote = manager.requestRematch('c2');
  assert.equal(secondVote.restarted, true);
  assert.equal(room.status, 'playing');
  assert.notEqual(room.matchId, oldMatchId);
  assert.equal(room.matchState.started, false, 'new match waits for landing/roulette before the clock starts');
  assert.equal(room.matchState.ended, false);
  assert.equal(room.rouletteActivated, false);
  assert.equal(room.matchState.boardSize, 10);
  assert.equal(room.matchState.players.length, 2);
  assert.equal(manager.publicRoom(room).rematch, null);
});

test('all clients share the host-authoritative board size, arena, and per-player cosmetic loadout', () => {
  const manager = new RoomManager({ rng: () => 0.29 });
  const created = manager.createRoom('host-size', 'Host', { boardSize: 8, difficulty: 'easy', arenaSkin: 'arena-lava', maxPlayers: 2 }, 'mf-host-size-identity-001', { skin: 'skin-violet', avatar: 'avatar-crown' });
  const room = created.room;
  manager.joinRoom('guest-size', room.code, 'Guest', 'mf-guest-size-identity-001', { skin: 'skin-mint', avatar: 'avatar-robot' });
  for (const p of room.players) manager.setReady(p.connectionId, true);
  manager.startMatch('host-size');
  const rosterForHost = manager.publicRoom(room);
  const stateForHost = manager.publicMatchState(room);
  const stateForGuest = manager.publicMatchState(room);
  assert.equal(rosterForHost.config.boardSize, 8);
  assert.equal(rosterForHost.config.arenaSkin, 'arena-lava');
  assert.equal(stateForHost.board.size, 8);
  assert.equal(stateForGuest.board.size, 8);
  assert.equal(stateForHost.board.cells.length, 64);
  assert.equal(stateForGuest.board.cells.length, 64);
  assert.equal(stateForHost.players.find(p => p.id === created.player.id).skin, 'skin-violet');
  assert.equal(stateForHost.players.find(p => p.id === created.player.id).avatar, 'avatar-crown');
  const guest = room.players.find(p => p.id !== created.player.id);
  assert.equal(stateForGuest.players.find(p => p.id === guest.id).skin, 'skin-mint');
  assert.equal(stateForGuest.players.find(p => p.id === guest.id).avatar, 'avatar-robot');
});


test('host-selected board size is identical in lobby config, match snapshot and cell count for every supported size', () => {
  for (const boardSize of [8, 10, 12, 14, 16, 18, 20]) {
    const manager = new RoomManager({ rng: () => 0.193 });
    const room = twoPlayerRoom(manager, { boardSize, difficulty: 'easy', arenaSkin: 'arena-neon' });
    assert.equal(manager.publicRoom(room).config.boardSize, boardSize);
    manager.startMatch('c1');
    const snapshot = manager.publicMatchState(room);
    assert.equal(room.matchState.boardSize, boardSize);
    assert.equal(snapshot.board.size, boardSize);
    assert.equal(snapshot.board.cells.length, boardSize * boardSize);
    assert.equal(snapshot.board.mineCount, Math.round(boardSize * boardSize * 0.25));
  }
});
