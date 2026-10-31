'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Engine = require('../engine.js');

function player(id, alive = true, missedTurns = 0, deathOrder = null) {
  return { id, name: id, alive, isHuman: id === 'human', pos: 0, missedTurns,
    deathOrder, flagsOwned: new Set(), score: 0, correctFlags: 0, wrongFlags: 0 };
}

function simpleCells() {
  return [
    { i: 0, mine: true, adj: 0, revealed: false, flagOwner: 'A', exploded: false, zone: false },
    { i: 1, mine: false, adj: 1, revealed: false, flagOwner: 'A', exploded: false, zone: false },
    { i: 2, mine: true, adj: 0, revealed: false, flagOwner: 'B', exploded: false, zone: false },
    { i: 3, mine: false, adj: 1, revealed: false, flagOwner: 'B', exploded: false, zone: false },
    { i: 4, mine: false, adj: 0, revealed: false, flagOwner: null, exploded: false, zone: false }
  ];
}

test('engine has explicit versions and command types', () => {
  assert.match(Engine.ENGINE_VERSION, /^0\.9A/);
  assert.equal(Engine.PROTOCOL_VERSION, 1);
  assert.deepEqual(Engine.COMMAND_TYPES, ['MOVE', 'DIG', 'FLAG', 'UNFLAG', 'READY', 'START_MATCH', 'REQUEST_STATE']);
});

test('neighbour counts are 3 at a corner and 8 in the center', () => {
  assert.equal(Engine.neighbors(0, 8).length, 3);
  assert.equal(Engine.neighbors(3 * 8 + 3, 8).length, 8);
  assert.deepEqual(Engine.neighbors(0, 8), [1, 8, 9]);
});

test('all selectable board sizes create the exact mine count and one irregular connected 15–20 cell opening', () => {
  for (const size of [8, 10, 12, 14, 16, 18, 20]) {
    for (const density of [0.25, 0.35, 0.5]) {
      const mineCount = Math.round(size * size * density);
      const board = Engine.generateBoard({ size, mineCount, rng: Math.random });
      const audit = Engine.validateBoard(board);
      assert.equal(audit.ok, true, audit.errors.join('; '));
      assert.equal(board.cells.length, size * size);
      assert.equal(board.cells.filter(cell => cell.mine).length, mineCount);
      assert.equal(board.zone.size, 5);
      assert.ok(board.clueRing.size >= 10 && board.clueRing.size <= 15);
      const opening = new Set([...board.zone, ...board.clueRing]);
      assert.ok(opening.size >= 15 && opening.size <= 20);
      assert.equal([...opening].some(i => board.cells[i].mine), false);
      assert.ok([...opening].every(i => board.cells[i].revealed));
      const visited = new Set(); const queue = [opening.values().next().value];
      for (let head = 0; head < queue.length; head++) { const i = queue[head]; if (visited.has(i)) continue; visited.add(i); for (const n of Engine.neighbors(i, size)) if (opening.has(n) && !visited.has(n)) queue.push(n); }
      assert.equal(visited.size, opening.size, 'opening must be a single connected cluster');
      assert.equal(new Set(board.zone).size, 5, 'five distinct spawn cells exist for one human plus four bots');
    }
  }
});

test('board generator rejects invalid size and impossible mine count', () => {
  assert.throws(() => Engine.generateBoard({ size: 7, mineCount: 5 }), RangeError);
  assert.throws(() => Engine.generateBoard({ size: 8, mineCount: 45 }), RangeError);
});

test('revealSafeRegion expands through zero cells but preserves mines and flags', () => {
  const size = 5;
  const cells = Array.from({ length: size * size }, (_, i) => ({ i, mine: false, adj: 0, revealed: false, flagOwner: null, zone: false }));
  cells[0].mine = true; cells[0].adj = 1;
  cells[24].mine = true; cells[24].adj = 1;
  cells[6].flagOwner = 'P';
  const opened = Engine.revealSafeRegion(cells, size, [12]);
  assert.ok(opened > 0);
  assert.equal(cells[0].revealed, false);
  assert.equal(cells[24].revealed, false);
  assert.equal(cells[6].revealed, false);
  assert.equal(cells[12].revealed, true);
});

test('digging a mine explodes only the selected tile and does not reveal adjacent mines', () => {
  const size = 5;
  const cells = Array.from({ length: size * size }, (_, i) => ({ i, mine: false, adj: 0, revealed: false, flagOwner: null, exploded: false, zone: false }));
  cells[12].mine = true;
  cells[13].mine = true;
  cells[11].adj = 1;
  const out = Engine.revealCell(cells, 12, size, { adjacentRevealChance: 1, rng: () => 0 });
  assert.equal(out.ok, true);
  assert.equal(out.mine, true);
  assert.equal(cells[12].exploded, true);
  assert.equal(cells[13].revealed, false);
});

test('safe numbered dig can reveal adjacent safe cells but never adjacent mines', () => {
  const size = 5;
  const cells = Array.from({ length: size * size }, (_, i) => ({ i, mine: false, adj: 0, revealed: false, flagOwner: null, exploded: false, zone: false }));
  cells[13].mine = true;
  cells[12].adj = 1;
  for (const i of Engine.neighbors(12, size)) if (!cells[i].mine) cells[i].adj = 1;
  const out = Engine.revealCell(cells, 12, size, { adjacentRevealChance: 1, rng: () => 0 });
  assert.equal(out.mine, false);
  assert.equal(cells[13].revealed, false);
  assert.ok(out.openedCount >= 1);
});

test('toggleFlag places and removes flags with previous ownership reported', () => {
  const cells = [
    { i: 0, mine: true, revealed: false, zone: false, flagOwner: null },
    { i: 1, mine: false, revealed: true, zone: false, flagOwner: null },
    { i: 2, mine: false, revealed: false, zone: true, flagOwner: null }
  ];
  assert.deepEqual(Engine.toggleFlag(cells, 0, 'A'), { ok: true, action: 'flag', previousOwner: null, ownerId: 'A', index: 0 });
  assert.equal(cells[0].flagOwner, 'A');
  const blockedSteal = Engine.toggleFlag(cells, 0, 'B');
  assert.equal(blockedSteal.ok, false);
  assert.equal(cells[0].flagOwner, 'A', 'standard mode cannot remove another player flag');
  assert.deepEqual(Engine.toggleFlag(cells, 0, 'A'), { ok: true, action: 'unflag', previousOwner: 'A', ownerId: null, index: 0 });
  assert.equal(cells[0].flagOwner, null);
  assert.deepEqual(Engine.toggleFlag(cells, 0, 'B', { allowSteal: true }), { ok: true, action: 'flag', previousOwner: null, ownerId: 'B', index: 0 });
  assert.deepEqual(Engine.toggleFlag(cells, 0, 'A', { allowSteal: true }), { ok: true, action: 'steal', previousOwner: 'B', ownerId: 'A', index: 0 });
  assert.equal(Engine.toggleFlag(cells, 1, 'A').ok, false);
  assert.equal(Engine.toggleFlag(cells, 2, 'A').ok, false);
});

test('next turn skips dead players and returns null when no player remains alive', () => {
  const players = [player('A'), player('B', false), player('C')];
  assert.equal(Engine.nextAlivePlayerId(['A', 'B', 'C'], 'A', players), 'C');
  players[0].alive = false;
  players[2].alive = false;
  assert.equal(Engine.nextAlivePlayerId(['A', 'B', 'C'], 'A', players), null);
});

test('timeout penalty increments missed turns deterministically', () => {
  const p = player('A');
  assert.deepEqual(Engine.applyTimeoutPenalty(p, 5), { missedTurns: 1, skipPenalty: 5 });
  assert.deepEqual(Engine.applyTimeoutPenalty(p, 5), { missedTurns: 2, skipPenalty: 10 });
  assert.equal(p.score, -10);
  assert.equal(p.mobileTimedOut, true);
});

test('elimination order maps first death to last place and final death to second place', () => {
  const players = [player('A'), player('B'), player('C'), player('D'), player('E')];
  const deathOrder = [];
  assert.equal(Engine.eliminatePlayer(players, deathOrder, 'A', 3).place, 5);
  assert.equal(Engine.eliminatePlayer(players, deathOrder, 'B', 4).place, 4);
  assert.equal(Engine.eliminatePlayer(players, deathOrder, 'C', 5).place, 3);
  assert.equal(Engine.eliminatePlayer(players, deathOrder, 'D', 6).place, 2);
  assert.equal(Engine.eliminatePlayer(players, deathOrder, 'D', 6), null);
});

test('sole survivor always receives flag points even when markable cells remain unflagged', () => {
  const players = [player('A', true, 3), player('B', false, 0, 1), player('C', false, 1, 2)];
  const cells = [
    { i: 0, mine: true, revealed: false, zone: false, flagOwner: 'A' },
    { i: 1, mine: false, revealed: false, zone: false, flagOwner: null }
  ];
  const result = Engine.calculateMatchResult({ players, cells, deathOrder: ['B', 'C'], reason: 'survivor' });
  const byId = Object.fromEntries(result.players.map(p => [p.id, p]));
  assert.equal(result.scored, true);
  assert.equal(result.allMarked, false);
  assert.equal(byId.A.place, 1);
  assert.equal(byId.A.rankPoints, 200);
  assert.equal(byId.A.correctFlags, 1);
  assert.equal(byId.A.wrongFlags, 0);
  assert.equal(byId.A.flagScore, 1);
  assert.equal(byId.A.skipPenalty, 15);
  assert.equal(byId.A.totalScore, 186);
  assert.equal(byId.B.place, 3);
  assert.equal(byId.C.place, 2);
});

test('timeout calculates flag scores for every participant and awards living ties equally', () => {
  const players = [player('A', true, 2), player('B'), player('C', false, 0, 1)];
  const result = Engine.calculateMatchResult({ players, cells: simpleCells(), deathOrder: ['C'], reason: 'timeout' });
  const byId = Object.fromEntries(result.players.map(p => [p.id, p]));
  assert.equal(result.scored, true);
  assert.equal(byId.A.correctFlags, 1);
  assert.equal(byId.A.wrongFlags, 1);
  assert.equal(byId.A.flagScore, 0);
  assert.equal(byId.B.correctFlags, 1);
  assert.equal(byId.B.wrongFlags, 1);
  assert.equal(byId.A.place, 1);
  assert.equal(byId.B.place, 1);
  assert.equal(byId.A.rankPoints, 200);
  assert.equal(byId.B.rankPoints, 200);
  assert.equal(byId.A.totalScore, 190);
  assert.equal(byId.B.totalScore, 200);
  assert.equal(byId.C.place, 3);
  assert.equal(byId.C.correctFlags, 0);
  assert.equal(byId.C.wrongFlags, 0);
});

test('flags remaining on the board score for eliminated owners too', () => {
  const players = [player('A', true, 1), player('B', false, 2, 1), player('C', false, 0, 2)];
  const cells = [
    { i: 0, mine: true, revealed: false, zone: false, flagOwner: 'A' },
    { i: 1, mine: false, revealed: false, zone: false, flagOwner: 'B' },
    { i: 2, mine: true, revealed: false, zone: false, flagOwner: 'B' },
    { i: 3, mine: false, revealed: false, zone: false, flagOwner: 'C' },
    { i: 4, mine: false, revealed: false, zone: false, flagOwner: null }
  ];
  const result = Engine.calculateMatchResult({ players, cells, deathOrder: ['B', 'C'], reason: 'survivor' });
  const byId = Object.fromEntries(result.players.map(p => [p.id, p]));
  assert.equal(byId.A.correctFlags, 1);
  assert.equal(byId.A.wrongFlags, 0);
  assert.equal(byId.B.correctFlags, 1);
  assert.equal(byId.B.wrongFlags, 1);
  assert.equal(byId.B.flagScore, 0);
  assert.equal(byId.B.place, 3);
  assert.equal(byId.B.totalScore, 75 + 0 - 10);
  assert.equal(byId.C.correctFlags, 0);
  assert.equal(byId.C.wrongFlags, 1);
  assert.equal(byId.C.flagScore, -1);
  assert.equal(byId.C.place, 2);
  assert.equal(byId.C.totalScore, 150 - 1);
});

test('one survivor scores correct and incorrect flags even when not all markable cells are flagged', () => {
  const players = [player('A'), player('B', false, 0, 1)];
  const cells = [
    { i: 0, mine: true, revealed: false, zone: false, flagOwner: 'A' },
    { i: 1, mine: false, revealed: false, zone: false, flagOwner: 'A' },
    { i: 2, mine: false, revealed: false, zone: false, flagOwner: null },
    { i: 3, mine: false, revealed: true, zone: true, flagOwner: null }
  ];
  const result = Engine.calculateMatchResult({ players, cells, deathOrder: ['B'], reason: 'survivor' });
  const a = result.players.find(p => p.id === 'A');
  assert.equal(result.allMarked, false);
  assert.equal(result.scored, true);
  assert.equal(a.correctFlags, 1);
  assert.equal(a.wrongFlags, 1);
  assert.equal(a.flagScore, 0);
  assert.equal(a.totalScore, 200);
});

test('public snapshots never leak hidden mine positions before the end', () => {
  const cells = [
    { i: 0, mine: true, adj: 0, revealed: false, flagOwner: null, exploded: false, zone: false, landingClue: false },
    { i: 1, mine: false, adj: 1, revealed: true, flagOwner: null, exploded: false, zone: false, landingClue: false },
    { i: 2, mine: true, adj: 0, revealed: true, flagOwner: null, exploded: true, zone: false, landingClue: false }
  ];
  const state = { boardSize: 3, mineCount: 2, cells, zone: new Set(), clueRing: new Set(), players: [player('A')], turnOrder: ['A'], currentId: 'A', turnId: 2, started: true, ended: false, matchLeft: 42, turnLeft: 12, deathOrder: [] };
  const publicState = Engine.toPublicGameState(state);
  assert.equal(publicState.board.cells[0].mine, null);
  assert.equal(publicState.board.cells[1].mine, false);
  assert.equal(publicState.board.cells[2].mine, true);
  assert.doesNotThrow(() => JSON.stringify(publicState));
  state.ended = true;
  assert.equal(Engine.toPublicGameState(state).board.cells[0].mine, true);
});

test('serializable local state converts Sets and player fields into JSON-compatible data and preserves visual action metadata', () => {
  const lastAction = { type: 'move', playerId: 'A', fromIndex: 9, index: 18, at: 1234 };
  const state = { matchId: 'match-x', boardSize: 8, mineCount: 10, cells: [], zone: new Set([1, 2]), clueRing: new Set([3]), players: [player('A')], turnOrder: ['A'], currentId: 'A', turnId: 1, started: true, ended: false, matchLeft: 100, turnLeft: 50, deathOrder: [], lastAction };
  const snapshot = Engine.toSerializableGameState(state);
  assert.deepEqual(snapshot.board.zone, [1, 2]);
  assert.deepEqual(snapshot.lastAction, lastAction);
  assert.doesNotThrow(() => JSON.stringify(snapshot));
});

test('protocol validator accepts a current command and rejects stale, duplicate and wrong-player commands', () => {
  const seen = new Set();
  const cmd = Engine.createCommand({ type: 'DIG', playerId: 'A', matchId: 'M', turnId: 4, commandId: 'M:1', payload: { index: 12 } });
  const context = { matchId: 'M', turnId: 4, activePlayerId: 'A', playerIds: ['A', 'B'], boardSize: 8, seenCommandIds: seen };
  assert.equal(Engine.validateCommand(cmd, context).ok, true);
  seen.add(cmd.commandId);
  assert.equal(Engine.validateCommand(cmd, context).code, 'DUPLICATE_COMMAND');
  assert.equal(Engine.validateCommand({ ...cmd, commandId: 'M:2', turnId: 3 }, context).code, 'STALE_TURN');
  assert.equal(Engine.validateCommand({ ...cmd, commandId: 'M:3', playerId: 'B' }, context).code, 'NOT_ACTIVE_PLAYER');
  assert.equal(Engine.validateCommand({ ...cmd, commandId: 'M:4', payload: { index: 64 } }, context).code, 'INVALID_CELL');
});

test('BFS returns a shortest adjacent-cell path for diagonal movement and handles same target', () => {
  const path = Engine.findPathBFS(0, 18, 8);
  assert.equal(path.length, 2);
  assert.deepEqual(path, [9, 18]); // BFS supports 8-way diagonal movement.
  assert.deepEqual(Engine.findPathBFS(5, 5, 8), []);
});

test('one human plus four bots always receive five distinct safe starting cells', () => {
  for (const size of [8, 16, 20]) {
    const board = Engine.generateBoard({ size, mineCount: Math.round(size * size * 0.35), rng: () => 0.37 });
    const positions = Engine.shuffle([...board.zone], () => 0.61).slice(0, 5);
    assert.equal(positions.length, 5);
    assert.equal(new Set(positions).size, 5);
    assert.ok(positions.every(index => board.zone.has(index)));
    assert.ok(positions.every(index => !board.cells[index].mine && board.cells[index].revealed));
  }
});
