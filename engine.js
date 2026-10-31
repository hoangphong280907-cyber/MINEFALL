/* MINEFALL Game Engine v0.9A
 * Pure, DOM-free rules used by the offline UI today and designed for the future
 * authoritative WebSocket server. Keep browser compatibility: no ES module syntax.
 */
(function attachMinefallEngine(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.MinefallEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function buildMinefallEngine() {
  'use strict';

  const ENGINE_VERSION = '0.9A.4';
  const GAME_STATE_SCHEMA_VERSION = 1;
  const PROTOCOL_VERSION = 1;
  const COMMAND_TYPES = Object.freeze(['MOVE', 'DIG', 'FLAG', 'UNFLAG', 'READY', 'START_MATCH', 'REQUEST_STATE']);
  const ACTION_COMMANDS = new Set(['MOVE', 'DIG', 'FLAG', 'UNFLAG']);

  function assertBoardSize(size) {
    if (!Number.isInteger(size) || size < 8 || size > 20 || size % 2 !== 0) {
      throw new RangeError('Board size must be an even integer from 8 to 20.');
    }
  }

  function inside(row, col, size) {
    return row >= 0 && row < size && col >= 0 && col < size;
  }

  function indexOf(row, col, size) { return row * size + col; }
  function rowCol(index, size) { return { r: Math.floor(index / size), c: index % size }; }
  function coordinate(index, size) {
    const { r, c } = rowCol(index, size);
    return String.fromCharCode(65 + c) + (r + 1);
  }

  function neighbors(index, size) {
    const { r, c } = rowCol(index, size);
    const out = [];
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const rr = r + dr, cc = c + dc;
        if (inside(rr, cc, size)) out.push(indexOf(rr, cc, size));
      }
    }
    return out;
  }

  function shuffle(items, rng = Math.random) {
    const result = items.slice();
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  function weightedGrowCluster(seedIndex, size, targetSize, rng, allowedIndices = null) {
    const cluster = new Set([seedIndex]);
    const allowed = allowedIndices || new Set(Array.from({ length: size * size }, (_, i) => i));
    while (cluster.size < targetSize) {
      const frontier = new Map();
      for (const current of cluster) {
        for (const next of neighbors(current, size)) {
          if (!allowed.has(next) || cluster.has(next)) continue;
          frontier.set(next, (frontier.get(next) || 0) + 1);
        }
      }
      if (!frontier.size) throw new Error('Could not grow a contiguous landing cluster.');
      // More neighbours already in the cluster means higher selection weight,
      // keeping the shape compact while still irregular rather than rectangular.
      let totalWeight = 0;
      const candidates = [...frontier.entries()].map(([index, count]) => {
        const weight = count * count;
        totalWeight += weight;
        return { index, weight };
      });
      let draw = Math.max(0, Math.min(0.999999999, Number(rng()) || 0)) * totalWeight;
      let chosen = candidates[candidates.length - 1].index;
      for (const candidate of candidates) {
        draw -= candidate.weight;
        if (draw < 0) { chosen = candidate.index; break; }
      }
      cluster.add(chosen);
    }
    return cluster;
  }

  function generateBoard({ size, mineCount, rng = Math.random } = {}) {
    assertBoardSize(size);
    const total = size * size;
    if (!Number.isInteger(mineCount) || mineCount < 1 || mineCount > total - 20) {
      throw new RangeError('Mine count must leave room for a 15–20 cell landing cluster.');
    }
    const cells = Array.from({ length: total }, (_, i) => ({
      i, mine: false, adj: 0, revealed: false, flagOwner: null,
      exploded: false, zone: false, landingClue: false
    }));

    // Create one compact, irregular, connected opening of 15–20 revealed safe cells.
    // Five of those cells form the spawn pad, enough for the player plus four bots.
    const sr = 2 + Math.floor(Math.max(0, Math.min(0.999999, rng())) * (size - 4));
    const sc = 2 + Math.floor(Math.max(0, Math.min(0.999999, rng())) * (size - 4));
    const spawnIndex = indexOf(sr, sc, size);
    const targetOpenCount = 15 + Math.floor(Math.max(0, Math.min(0.999999, rng())) * 6);
    const interior = new Set();
    for (let r = 1; r < size - 1; r++) {
      for (let c = 1; c < size - 1; c++) interior.add(indexOf(r, c, size));
    }
    const opening = weightedGrowCluster(spawnIndex, size, targetOpenCount, rng, interior);
    const zone = weightedGrowCluster(spawnIndex, size, 5, rng, opening);
    const clueRing = new Set([...opening].filter(i => !zone.has(i)));
    for (const i of zone) {
      cells[i].zone = true;
      cells[i].revealed = true;
    }
    for (const i of clueRing) {
      cells[i].landingClue = true;
      cells[i].revealed = true;
    }

    const safeStart = new Set([...zone, ...clueRing]);
    const candidates = shuffle(cells.filter(cell => !safeStart.has(cell.i)).map(cell => cell.i), rng);
    if (candidates.length < mineCount) throw new RangeError('Not enough cells for requested mines.');
    for (let i = 0; i < mineCount; i++) cells[candidates[i]].mine = true;
    for (const cell of cells) {
      cell.adj = neighbors(cell.i, size).reduce((n, j) => n + (cells[j].mine ? 1 : 0), 0);
    }

    const board = { size, mineCount, cells, zone, clueRing, opening, spawn: { r: sr, c: sc } };
    const invariant = validateBoard(board);
    if (!invariant.ok) throw new Error('Generated board invariant failed: ' + invariant.errors.join('; '));
    return board;
  }

  function validateBoard(board) {
    const errors = [];
    if (!board || !Number.isInteger(board.size)) return { ok: false, errors: ['Missing board or size.'] };
    const total = board.size * board.size;
    if (!Array.isArray(board.cells) || board.cells.length !== total) errors.push('Cell count does not match size.');
    else {
      if (board.cells.filter(cell => cell.mine).length !== board.mineCount) errors.push('Mine count mismatch.');
      for (const cell of board.cells) {
        if (cell.i < 0 || cell.i >= total) errors.push('Invalid cell index.');
        if (!cell.mine) {
          const expected = neighbors(cell.i, board.size).filter(i => board.cells[i].mine).length;
          if (cell.adj !== expected) errors.push('Adjacency count mismatch at cell ' + cell.i + '.');
        }
      }
    }
    if (!(board.zone instanceof Set) || board.zone.size !== 5) errors.push('Spawn pad must contain exactly 5 cells for up to five players.');
    if (!(board.clueRing instanceof Set) || board.clueRing.size < 10 || board.clueRing.size > 15) errors.push('Clue cluster must contain 10–15 cells.');
    const zone = board.zone instanceof Set ? board.zone : new Set();
    const clueRing = board.clueRing instanceof Set ? board.clueRing : new Set();
    const opening = new Set([...zone, ...clueRing]);
    if (opening.size < 15 || opening.size > 20) errors.push('Initial revealed cluster must contain 15–20 distinct cells.');
    if ([...zone].some(i => clueRing.has(i))) errors.push('Spawn pad and clue cells must not overlap.');
    for (const i of opening) {
      const cell = board.cells?.[i];
      if (!cell || cell.mine || !cell.revealed) errors.push('Landing cluster must be revealed and mine-free.');
      if (zone.has(i) && !cell?.zone) errors.push('Spawn-pad cell is missing zone marker.');
      if (clueRing.has(i) && !cell?.landingClue) errors.push('Clue cell is missing landing marker.');
    }
    if (opening.size) {
      const visited = new Set();
      const queue = [opening.values().next().value];
      for (let head = 0; head < queue.length; head++) {
        const i = queue[head];
        if (visited.has(i)) continue;
        visited.add(i);
        for (const next of neighbors(i, board.size)) if (opening.has(next) && !visited.has(next)) queue.push(next);
      }
      if (visited.size !== opening.size) errors.push('Initial revealed cells must form one contiguous cluster.');
    }
    if (board.spawn) {
      const spawnIndex = indexOf(board.spawn.r, board.spawn.c, board.size);
      if (!zone.has(spawnIndex)) errors.push('Spawn origin must be part of the spawn pad.');
    }
    return { ok: errors.length === 0, errors };
  }

  function revealSafeRegion(cells, size, startIndices) {
    if (!Array.isArray(cells) || cells.length !== size * size) throw new TypeError('Invalid board cells.');
    const queue = [...startIndices];
    const visited = new Set();
    let opened = 0;
    for (let head = 0; head < queue.length; head++) {
      const i = queue[head];
      if (visited.has(i)) continue;
      visited.add(i);
      const cell = cells[i];
      if (!cell || cell.mine || cell.flagOwner || cell.zone || cell.revealed) continue;
      cell.revealed = true;
      opened++;
      if (cell.adj === 0) {
        for (const j of neighbors(i, size)) {
          const next = cells[j];
          if (!visited.has(j) && !next.revealed && !next.flagOwner && !next.mine && !next.zone) queue.push(j);
        }
      }
    }
    return opened;
  }

  function revealCell(cells, index, size, { adjacentRevealChance = 0.35, rng = Math.random } = {}) {
    const cell = cells[index];
    if (!cell || cell.revealed || cell.flagOwner || cell.zone) {
      return { ok: false, reason: cell && cell.flagOwner ? 'Ô đang có cờ. Hãy gỡ cờ trước.' : 'Ô này không thể đào.' };
    }
    const before = new Set(cells.filter(item => item.revealed).map(item => item.i));
    if (cell.mine) {
      cell.revealed = true;
      cell.exploded = true;
      return { ok: true, mine: true, openedCount: 0, additionalOpened: 0, newlyOpened: [index] };
    }
    let openedCount = revealSafeRegion(cells, size, [index]);
    if (cell.adj > 0 && adjacentRevealChance > 0) {
      for (const nextIndex of neighbors(index, size)) {
        const next = cells[nextIndex];
        if (next.revealed || next.flagOwner || next.zone || next.mine) continue;
        if (rng() < adjacentRevealChance) openedCount += revealSafeRegion(cells, size, [nextIndex]);
      }
    }
    const newlyOpened = cells.filter(item => item.revealed && !before.has(item.i)).map(item => item.i);
    return { ok: true, mine: false, openedCount, additionalOpened: Math.max(0, openedCount - 1), newlyOpened };
  }

  function toggleFlag(cells, index, ownerId, { allowSteal = false } = {}) {
    const cell = cells[index];
    if (!cell) return { ok: false, reason: 'Unknown cell.' };
    if (cell.revealed || cell.zone) return { ok: false, reason: 'Cell cannot be flagged.' };
    if (typeof ownerId !== 'string' || !ownerId) return { ok: false, reason: 'Flag owner is required.' };
    if (cell.flagOwner) {
      const previousOwner = cell.flagOwner;
      if (previousOwner !== ownerId && !allowSteal) {
        return { ok: false, reason: 'Đấu cờ tiêu chuẩn chỉ cho phép gỡ cờ do chính bạn đặt.' };
      }
      if (previousOwner !== ownerId && allowSteal) {
        cell.flagOwner = ownerId;
        return { ok: true, action: 'steal', previousOwner, ownerId, index };
      }
      cell.flagOwner = null;
      return { ok: true, action: 'unflag', previousOwner, ownerId: null, index };
    }
    cell.flagOwner = ownerId;
    return { ok: true, action: 'flag', previousOwner: null, ownerId, index };
  }

  function nextAlivePlayerId(turnOrder, fromId, players) {
    if (!Array.isArray(turnOrder) || !turnOrder.length) return null;
    const byId = new Map(players.map(player => [player.id, player]));
    const start = Math.max(0, turnOrder.indexOf(fromId));
    for (let step = 1; step <= turnOrder.length; step++) {
      const id = turnOrder[(start + step) % turnOrder.length];
      const player = byId.get(id);
      if (player && player.alive) return id;
    }
    return null;
  }

  function applyTimeoutPenalty(player, penaltyPerMissedTurn = 5) {
    if (!player || typeof player !== 'object') throw new TypeError('Player is required.');
    player.missedTurns = Math.max(0, Number(player.missedTurns) || 0) + 1;
    player.skipPenalty = Math.max(0, Number(penaltyPerMissedTurn) || 0) * player.missedTurns;
    player.score = -player.skipPenalty; // interim display; final score is computed at match end
    player.mobileTimedOut = true;
    return { missedTurns: player.missedTurns, skipPenalty: player.skipPenalty };
  }

  function eliminatePlayer(players, deathOrder, playerId, cellIndex) {
    const player = players.find(item => item.id === playerId);
    if (!player || !player.alive) return null;
    player.alive = false;
    player.deathOrder = deathOrder.length + 1;
    player.place = players.length - player.deathOrder + 1;
    player.pos = cellIndex;
    deathOrder.push(player.id);
    return { playerId: player.id, deathOrder: player.deathOrder, place: player.place };
  }

  function allMarkableCellsMarked(cells) {
    return cells.filter(cell => !cell.revealed && !cell.zone).every(cell => cell.flagOwner !== null);
  }

  function calculateMatchResult({ players, cells, deathOrder, reason, placePoints = { 1: 200, 2: 150, 3: 75, 4: 38, 5: 19 }, skipPenaltyPerTurn = 5 } = {}) {
    if (!Array.isArray(players) || !Array.isArray(cells) || !Array.isArray(deathOrder)) throw new TypeError('Players, cells and deathOrder are required.');
    const total = players.length;
    const alive = players.filter(player => player.alive);
    const allMarked = allMarkableCellsMarked(cells);
    // Flag scoring applies to every participant at match end. Remaining flags on the
    // board are attributed to their owners, even if that owner was eliminated earlier.
    const scored = true;
    const resultById = new Map(players.map(player => [player.id, {
      id: player.id, place: null, rankPoints: 0, correctFlags: 0, wrongFlags: 0,
      flagScore: 0, skipPenalty: Math.max(0, Number(skipPenaltyPerTurn) || 0) * Math.max(0, Number(player.missedTurns) || 0), totalScore: 0, scoreBreakdown: null
    }]));

    if (scored) {
      for (const cell of cells) {
        if (!cell.flagOwner) continue;
        const owner = players.find(player => player.id === cell.flagOwner);
        if (!owner) continue;
        const update = resultById.get(owner.id);
        if (cell.mine) update.correctFlags++;
        else update.wrongFlags++;
      }
      for (const player of players) {
        const update = resultById.get(player.id);
        update.flagScore = update.correctFlags - update.wrongFlags;
      }
    }

    if (reason === 'survivor' && alive.length === 1) {
      resultById.get(alive[0].id).place = 1;
      for (const id of deathOrder) {
        const update = resultById.get(id);
        const player = players.find(item => item.id === id);
        if (update && player) update.place = total - player.deathOrder + 1;
      }
    } else if (reason === 'everyone-eliminated') {
      [...deathOrder].reverse().forEach((id, index) => {
        const update = resultById.get(id);
        if (update) update.place = index + 1;
      });
    } else {
      const ordered = [...alive].sort((a, b) => resultById.get(b.id).flagScore - resultById.get(a.id).flagScore);
      let lastScore = null, lastPlace = 0;
      ordered.forEach((player, index) => {
        const value = resultById.get(player.id).flagScore;
        if (index === 0 || value !== lastScore) lastPlace = index + 1;
        resultById.get(player.id).place = lastPlace;
        lastScore = value;
      });
      for (const id of deathOrder) {
        const update = resultById.get(id);
        const player = players.find(item => item.id === id);
        if (update && player) update.place = total - player.deathOrder + 1;
      }
    }

    for (const player of players) {
      const update = resultById.get(player.id);
      update.rankPoints = Number(placePoints[update.place || total]) || Number(placePoints[total]) || 0;
      // Score flags for every participant, including eliminated players.
      // A surviving player keeps their placement rules; a dead player keeps the
      // placement assigned by elimination order, while their remaining flags still
      // contribute to their individual total score.
      update.totalScore = update.rankPoints + update.flagScore - update.skipPenalty;
      update.scoreBreakdown = {
        schemaVersion: 1, place: update.place, rankPoints: update.rankPoints,
        correctFlags: update.correctFlags, wrongFlags: update.wrongFlags,
        flagPoints: update.flagScore, missedTurns: Math.max(0, Number(player.missedTurns) || 0),
        skipPenalty: update.skipPenalty, total: update.totalScore
      };
    }

    return {
      schemaVersion: GAME_STATE_SCHEMA_VERSION,
      scored, allMarked, aliveCount: alive.length,
      scoreNoteKey: reason === 'survivor' && alive.length === 1 ? 'survivor-flags-counted' : alive.length === 0 ? 'no-survivors' : allMarked ? 'all-markable-marked' : 'survivor-flags-counted',
      players: players.map(player => resultById.get(player.id))
    };
  }

  function findPathBFS(start, target, size) {
    if (start === null || start === undefined || start === target) return [];
    const total = size * size;
    if (!Number.isInteger(start) || !Number.isInteger(target) || start < 0 || target < 0 || start >= total || target >= total) return [];
    const prev = new Int32Array(total); prev.fill(-2); prev[start] = -1;
    const queue = [start];
    for (let head = 0; head < queue.length; head++) {
      const current = queue[head]; if (current === target) break;
      for (const next of neighbors(current, size)) {
        if (prev[next] !== -2) continue;
        prev[next] = current; queue.push(next);
      }
    }
    if (prev[target] === -2) return [];
    const path = [];
    for (let at = target; at !== start; at = prev[at]) path.push(at);
    path.reverse();
    return path;
  }

  function createCommand({ type, playerId, matchId, turnId, commandId, payload = {} } = {}) {
    return { protocolVersion: PROTOCOL_VERSION, type, playerId, matchId, turnId, commandId, payload };
  }

  function validateCommand(command, context = {}) {
    const fail = (code, reason) => ({ ok: false, code, reason });
    if (!command || typeof command !== 'object' || Array.isArray(command)) return fail('INVALID_COMMAND', 'Command must be an object.');
    if (command.protocolVersion !== PROTOCOL_VERSION) return fail('PROTOCOL_MISMATCH', 'Unsupported protocol version.');
    if (!COMMAND_TYPES.includes(command.type)) return fail('UNKNOWN_COMMAND', 'Unknown command type.');
    if (typeof command.commandId !== 'string' || !command.commandId.trim()) return fail('INVALID_COMMAND_ID', 'commandId is required.');
    if (typeof command.matchId !== 'string' || !command.matchId.trim()) return fail('INVALID_MATCH_ID', 'matchId is required.');
    if (typeof command.playerId !== 'string' || !command.playerId.trim()) return fail('INVALID_PLAYER_ID', 'playerId is required.');
    if (!Number.isInteger(command.turnId) || command.turnId < 0) return fail('INVALID_TURN_ID', 'turnId must be a non-negative integer.');
    if (!command.payload || typeof command.payload !== 'object' || Array.isArray(command.payload)) return fail('INVALID_PAYLOAD', 'payload must be an object.');
    if (context.matchId !== undefined && command.matchId !== context.matchId) return fail('STALE_MATCH', 'Command belongs to another match.');
    if (context.turnId !== undefined && ACTION_COMMANDS.has(command.type) && command.turnId !== context.turnId) return fail('STALE_TURN', 'Command belongs to a stale turn.');
    if (context.seenCommandIds && context.seenCommandIds.has(command.commandId)) return fail('DUPLICATE_COMMAND', 'Command was already processed.');
    if (context.playerIds && !context.playerIds.includes(command.playerId)) return fail('UNKNOWN_PLAYER', 'Player is not in this match.');
    if (ACTION_COMMANDS.has(command.type) && context.activePlayerId !== undefined && command.playerId !== context.activePlayerId) return fail('NOT_ACTIVE_PLAYER', 'Only the active player may act.');
    if (ACTION_COMMANDS.has(command.type)) {
      const size = context.boardSize;
      if (!Number.isInteger(size) || !Number.isInteger(command.payload.index) || command.payload.index < 0 || command.payload.index >= size * size) {
        return fail('INVALID_CELL', 'Action requires an in-bounds cell index.');
      }
    }
    return { ok: true, command };
  }

  function toSerializableGameState(state) {
    return {
      schemaVersion: GAME_STATE_SCHEMA_VERSION,
      matchId: state.matchId || null,
      status: state.ended ? 'ended' : state.started ? 'playing' : 'waiting',
      started: !!state.started,
      ended: !!state.ended,
      endReason: state.endReason || null,
      scoreNote: state.scoreNote || '',
      results: state.ended && state.results ? state.results : null,
      board: {
        size: state.boardSize,
        mineCount: state.mineCount,
        spawn: state.spawn ? { r: state.spawn.r, c: state.spawn.c } : null,
        zone: [...(state.zone || [])], clueRing: [...(state.clueRing || [])],
        cells: (state.cells || []).map(cell => ({
          i: cell.i, mine: !!cell.mine, adj: cell.adj, revealed: !!cell.revealed,
          flagOwner: cell.flagOwner || null, exploded: !!cell.exploded, explodedBy: cell.explodedBy || null, zone: !!cell.zone,
          landingClue: !!cell.landingClue, endRevealed: !!cell.endRevealed
        }))
      },
      players: (state.players || []).map(player => ({
        id: player.id, name: player.name, color: player.color || null, skin: player.skin || 'skin-classic', avatar: player.avatar || 'avatar-cadet', flag: player.flag || 'flag-classic', bomb: player.bomb || 'bomb-standard', elimination: player.elimination || 'elim-standard', trail: player.trail || 'trail-dust', celebration: player.celebration || 'celebration-confetti',
        isHuman: !!player.isHuman, alive: !!player.alive, connected: player.connected !== false,
        pos: player.pos, score: Number(player.score) || 0, place: player.place ?? null,
        rankPoints: Number(player.rankPoints) || 0,
        flagScore: Number(player.flagScore) || 0,
        correctFlags: Number(player.correctFlags) || 0,
        wrongFlags: Number(player.wrongFlags) || 0,
        missedTurns: Number(player.missedTurns) || 0,
        skipPenalty: Number(player.skipPenalty) || 0,
        deathOrder: player.deathOrder ?? null,
        scoreBreakdown: player.scoreBreakdown || null
      })),
      turn: { order: [...(state.turnOrder || [])], currentPlayerId: state.currentId || null, turnId: Number(state.turnId) || 0, secondsLeft: Number(state.turnLeft) || 0 },
      matchSecondsLeft: Number(state.matchLeft) || 0,
      deathOrder: [...(state.deathOrder || [])],
      lastEvent: state.lastEvent || null,
      lastAction: state.lastAction || null
    };
  }

  function toPublicGameState(state) {
    const snapshot = toSerializableGameState(state);
    const revealAll = !!state.ended || !!state.endRevealComplete;
    snapshot.board.cells = snapshot.board.cells.map(cell => {
      const source = state.cells[cell.i];
      const publicKnowledge = revealAll || source.revealed || source.exploded || source.endRevealed;
      return {
        i: source.i,
        mine: publicKnowledge ? !!source.mine : null,
        adj: publicKnowledge && !source.mine ? source.adj : null,
        revealed: !!source.revealed,
        flagOwner: source.flagOwner || null,
        exploded: !!source.exploded, explodedBy: source.explodedBy || null,
        zone: !!source.zone,
        landingClue: !!source.landingClue,
        endRevealed: !!source.endRevealed
      };
    });
    snapshot.board.zone = [...(state.zone || [])];
    snapshot.board.clueRing = [...(state.clueRing || [])];
    return snapshot;
  }

  return Object.freeze({
    ENGINE_VERSION, GAME_STATE_SCHEMA_VERSION, PROTOCOL_VERSION, COMMAND_TYPES,
    assertBoardSize, inside, indexOf, rowCol, coordinate, neighbors, shuffle,
    generateBoard, validateBoard, revealSafeRegion, revealCell, toggleFlag,
    nextAlivePlayerId, applyTimeoutPenalty, eliminatePlayer, allMarkableCellsMarked,
    calculateMatchResult, findPathBFS, createCommand, validateCommand,
    toSerializableGameState, toPublicGameState
  });
});
