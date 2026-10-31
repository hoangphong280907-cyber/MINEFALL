# MINEFALL Phase 0.9B.3 — WebSocket Protocol

Protocol version: `1`  
Transport: WebSocket at `/ws`  
HTTP health endpoint: `/health`

## Message envelope

Client messages are JSON objects with a `type` and optional `payload`/`command`. Server messages are JSON objects with a `type` plus the corresponding fields. Payloads are capped at 16 KiB; the development server closes clients that exceed the basic message-rate limit.

## Client → server

| Type | Payload | Description |
|---|---|---|
| `room:create` | `{name, config: {boardSize, difficulty, arenaSkin?, maxPlayers?}}` | Create a room for 2–5 participants. `maxPlayers` defaults to 2 and must be an integer from 2 to 5. `boardSize` must be 8, 10, 12, 14, 16, 18 or 20; difficulty is easy/medium/hard. `arenaSkin` is optional and validated against `arena-standard`, `arena-lava`, `arena-neon`, `arena-frost`. It is captured from the host's equipped arena when creating the room. |
| `room:join` | `{name, code}` | Join a waiting room by six-character code. |
| `player:ready` | `{ready: boolean}` | Set own ready state. A room becomes `ready` only when the configured capacity is filled and every participant is connected and ready. |
| `match:start` | none | Host-only start request; server generates the board and publishes a redacted snapshot. Clients first show pregame presentation rather than exposing the board immediately. |
| `match:roulette:activate` | none | Either room participant can activate the roulette after landing. Server broadcasts one authoritative start-player ID to all room participants. |
| `state:request` | none | Request latest room/public match state. |
| `game:cursor` | `{index}` | Send a tile-selection cursor in the public-state preview. This is not a gameplay move. |
| `game:command` | `{command}` | Versioned engine command envelope. The server validates `MOVE` envelope shape/identity/turn/index; 0.9B only acknowledges it as a selection cursor. `DIG`, `FLAG`, and `UNFLAG` are rejected with `PHASE_0_9C_REQUIRED`. |
| `room:leave` | none | Leave the room. A started 0.9B preview is reset to waiting if one participant leaves. |

## Server → client

| Type | Fields | Description |
|---|---|---|
| `system:hello` | `phase`, `protocolVersion`, `connectionId`, `serverTime` | Connection handshake. |
| `room:update` | `room`, `selfPlayerId` | Public room roster, readiness, config, public cursors and own player ID. Internal connection IDs are omitted. |
| `match:state` | `roomCode`, `state`, `cursors` | Public game state. The server never sends full hidden board state. |
| `match:roulette:start` | `roomCode`, `matchId`, `startPlayerId`, `activatedByPlayerId`, `at` | Synchronized roulette activation event; the target is the starting player chosen by the server. |
| `game:cursor` | `playerId`, `playerName`, `color`, `index`, `at` | Cursor event broadcast to room members. |
| `command:ack` | `commandId`, `accepted`, `note` | Acknowledges the 0.9B cursor-only command boundary. |
| `server:error` | `error: {code, message}` | Validated failure. |
| `room:left` | `code` | Confirms leave action. |

## Room states

- `waiting`: the configured capacity is not yet full, or at least one participant is not connected/ready.
- `ready`: `room.config.maxPlayers` connected participants are all ready; host can start.
- `playing`: server has generated a board. Each client shows the pregame sequence (preparing arena → landing reveal → roulette) before showing the synchronized public-state preview. The roulette's final choice comes from the server's `turn.currentPlayerId`.

A disconnect removes the participant from the in-memory room in this phase. Reconnect tokens, grace windows, and resuming a live match are Phase 0.9C concerns.

## Host-owned arena theme

The host passes its equipped arena skin in `room:create`. The server validates the ID against an allowlist, stores it in room config and returns it in `room:update`. Join clients cannot override it; all room participants render the arena theme selected by the host. Character/player colors remain separate from the board theme. This is presentation only and does not affect mine generation or gameplay.

## Public state guarantee

The server uses `MinefallEngine.toPublicGameState`. For covered cells whose mine truth is not public, both `mine` and `adj` are `null`. Only already-revealed safe cells, the known landing zone/clue ring, exploded cells, and end-revealed cells disclose their truth. `toSerializableGameState` must never be broadcast.

## 0.9C additions

The next phase will make `MOVE`, `DIG`, `FLAG`, and `UNFLAG` mutate server-owned state, validate action ownership and turn IDs, emit authoritative state deltas/snapshots, run server-side turn/match timers, and resolve death/rank/score/reward events. The client must not self-award score/coins or decide mine outcomes.


## Scoring contract update (engine v0.9A.3)
The 0.9B.3 room-sync slice supports lobby capacity and public-state synchronization but does not yet execute online flag/scoring mutations. The shared engine scoring contract is: at match finalization, count every remaining flag on the board for its owner, whether that owner is alive or eliminated. Correct flag = +1; incorrect flag = −1. Eliminated players keep their elimination-order placement, while their existing flags still affect their personal match total. Match total = place points + (correct flags − incorrect flags) − (5 × missed turns). The server implementation in 0.9C must use this rule.
