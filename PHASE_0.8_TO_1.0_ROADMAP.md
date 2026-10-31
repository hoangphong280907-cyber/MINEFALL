# MINEFALL Roadmap — Phase 0.8 → Phase 1.0

## Status

- **0.8 — Offline progression:** prototype has fast-forward after elimination, death placement, score-to-coins and a local cosmetic shop.
- **0.9A — Engine refactor:** complete as incremental boundary. `engine.js` is DOM-free and covered by tests.
- **0.9B — Online room + public-state sync:** implementation included in this build. Room/lobby and public snapshot tests pass; actual gameplay actions remain disabled online.
- **0.9C — Online gameplay:** enable authoritative actions; test 2 players first, then configured capacities 3–5.
- **1.0 — Online 2–5 player MVP:** a room selects 2, 3, 4 or 5 actual players and completes one authoritative match.

## Phase 0.9A — Separate game rules from rendering

Completed baseline:
- DOM-free board/reveal/flag/turn/scoring/pathfinding functions in `engine.js`.
- Versioned command envelope: `MOVE`, `DIG`, `FLAG`, `UNFLAG`, `READY`, `START_MATCH`, `REQUEST_STATE`.
- Serializable state and a public projection that redacts covered mines.
- Automated engine tests.

## Phase 0.9B — Room and public-state synchronization (current build)

Implemented:
- Node.js HTTP server, `/health`, WebSocket `/ws`, and an allowlist for public client assets.
- Create/join room with six-character code, host-selected capacity from 2 to 5, player slots, ready toggles and host-only start.
- Board generated server-side when all players for the selected room capacity are connected and ready.
- `MinefallEngine.toPublicGameState` snapshot broadcast. Covered cells have `mine: null` and `adj: null`.
- Cursor-selection events shared between participants to verify outbound commands and room broadcasts.
- Basic payload/message validation, 16 KiB maximum payload, per-connection message-rate limit, and command-envelope validation for the reserved gameplay path.
- Room manager / public-state tests.

Not yet implemented by design:
- Online DIG/FLAG/UNFLAG mutations, official movement, turn advancement, timeouts, deaths, scores, coins, endgame reveal, authentication, persistent rooms, reconnect grace, or public matchmaking.

Exit criteria for 0.9B:
1. Clients can create/join one room with capacity selected as 2, 3, 4 or 5.
2. The room becomes ready only when the selected capacity is filled and every participant is connected and ready.
3. The host can start only after that condition is met.
4. All participants receive the same room config and public board snapshot.
5. Cursor selection from any participant is broadcast to all room members.
6. Covered mine truth is absent from every client-visible snapshot.

## Phase 0.9C — Authoritative online gameplay

- Move all online board changes into server-side action handlers built over `engine.js`.
- Validate caller identity, room membership, match ID, turn ID, command ID, active turn and cell index for every action.
- Implement MOVE, DIG, FLAG, UNFLAG; movement may repeat during a player's turn but does not end the turn. DIG/FLAG/UNFLAG ends the action turn.
- Run the 60-second turn timer and the configured match timer on the server (10 minutes for the current baseline; board-size-based durations are planned for 1.0.1). Apply the −5 skip penalty once per timeout.
- Handle safe reveal expansion, exploded mines, elimination order, fast-forward observer mode, end reveal, flag scoring, rank points and coin reward on the server.
- Broadcast authoritative public state/events to every room participant, with acknowledgements and state correction for rejected or stale commands.
- Add reconnect tokens and a short reconnect grace window, or terminate the match cleanly if reconnect is not possible.
- Test a complete match with two browser clients first, then repeat at capacity 3, 4 and 5 and with two separate devices.

## Phase 0.9C.5 — Cosmetic catalogue foundation (current update)

- Shared `cosmetics.js` catalog drives both shop UI and server-side validation.
- Added 12 arena themes with per-arena number palettes, 10 flags including the Vietnam flag, 10 bomb/explosion designs, 10 elimination effects, 10 movement trails and 11 victory celebrations.
- Player cosmetic equipment is passed into authoritative online player snapshots; arena floor and number colors follow the host-selected arena.
- Shop/profile remains localStorage-based; accounts and cross-device synchronization are explicitly out of scope for v1.0.
- See `VERSION_1.0_RELEASE_GATES.md` for the necessary and sufficient release conditions.

## Phase 1.0 — Online 2–5 player MVP

Definition of done:
1. The host selects a capacity of 2, 3, 4 or 5; that number of real players enter a private room by code and complete a match end-to-end. Acceptance testing proceeds from 2 players, then 3, 4 and 5.
2. Server owns hidden mines, turn order, clocks, legal actions, ranks, scores and rewards.
3. All clients receive the same rank, score breakdown, coins earned and match result.
4. Clients cannot see unopened mine truth, spoof scores, act out of turn or duplicate an action to receive duplicate rewards.
5. Final scoring includes remaining correct and incorrect flags for every participant; eliminated players retain their death-order place and their flags still contribute to their individual total.
6. Disconnect, reconnect, timeout, room leave and server restart behavior is handled explicitly.
7. Public deployment uses HTTPS/WSS, origin checks, validated message schemas, rate limits and logs without exposing secret board state.
8. The catalog provides 10+ flags (including Vietnam), bombs, elimination effects, movement trails and victory celebrations, plus arena themes whose number palette is configurable.
9. All gates in `VERSION_1.0_RELEASE_GATES.md` pass on the exact build being released.

## Out of scope for 1.0

Public matchmaking, Elo/rank ladder, global leaderboard, friends, 2v2, public spectator mode and purchases synchronized across accounts. The current `localStorage` profile remains local-only until server-side profiles and transactions are designed.
