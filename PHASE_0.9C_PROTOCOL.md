# MINEFALL Phase 0.9C.3 — WebSocket Protocol

Protocol version: `1`  
Transport: WebSocket at `/ws`  
Health endpoint: `/health`  
Room capacity: 2–5 players  
Board sizes: 8×8 through 20×20, even increments of 2  
Default mode: **Standard Flag Duel**

## Message envelopes

Ordinary messages use `{ "type": "...", "payload": { ... } }`. A gameplay action uses `{ "type": "game:command", "command": { "protocolVersion": 1, "type": "MOVE|DIG|FLAG|UNFLAG", "playerId": "...", "matchId": "...", "turnId": 1, "commandId": "unique-id", "payload": { "index": 0 } } }`.

## Client → server

| Type | Payload | Behavior |
|---|---|---|
| `room:create` | `{name, identity, cosmetics:{skin,avatar}, config:{boardSize,difficulty,arenaSkin,maxPlayers}}` | Creates a room. Capacity is 2–5. Board size/difficulty/arena are controlled by the host. Identity is a session-scoped rejoin key, not an account credential. |
| `room:join` | `{name, code, identity, cosmetics:{skin,avatar}}` | Joins a waiting room and restores prior seat/ID if the same session identity has a reserved assignment and the seat is free. |
| `player:ready` | `{ready:boolean}` | Room becomes ready only when capacity is full and all players are connected and ready. |
| `match:start` | none | Host creates the authoritative board and pregame state. The match clock has not started yet. |
| `match:roulette:activate` | none | Triggers the synchronized roulette. The first player is selected by server state. |
| `match:begin` | `{matchId}` | Starts the authoritative match clock after roulette. |
| `game:command` | `{command}` | Server validates identity, match ID, turn ID, active player, command ID, board index and cell/action rules before mutating the state. |
| `match:rematch` | none | Adds the connected player's rematch vote. When all players in the room have voted, creates a new match ID and resets pregame/landing/roulette/clock state. |
| `state:request` | none | Requests the current room and redacted match snapshot. |
| `match:return` | none | Returns from an ended match to the room lobby and resets readiness. |
| `room:leave` | none | Leaves a room. During active play the character is eliminated and remaining flags stay attributed to that player. During pregame the pending match is cancelled. |

## Gameplay commands

- `MOVE`: moves the active player to an in-bounds tile. Movement does not end the turn.
- `DIG`: the active player must be standing on an unrevealed, unflagged, non-zone tile. Safe digging uses the shared 35% neighbor reveal rule and zero-cell expansion. Digging a mine explodes that tile and eliminates the player.
- `FLAG`: places a flag on an unrevealed, non-zone tile that has no flag. Ends the turn.
- `UNFLAG`: **Standard mode only permits removing a flag owned by the active player.** Attempting to remove another player's flag is rejected on both client and server without consuming the turn. Flag stealing/replacement is reserved for a future Chaos mode.
- A successful dig/flag/unflag ends the turn; movement does not. Turn timeout applies −5 and moves to the next living player.

## Rematch and room configuration

- `room.config.boardSize`, `difficulty`, `mineCount` and `arenaSkin` from the host are authoritative. Every connected client receives the same public room config and the same match snapshot, so the preview and actual board cannot intentionally use independent sizes.
- Each player supplies only the allowlisted equipped `skin` and `avatar`. The server stores these values in the public room roster and match state. The lobby's host-selected arena applies to the shared native board renderer.
- Rematch status is present in `room:update.rematch`: `{votes, count, required, invitedBy, inviterName}` after the first vote. `required` counts room participants. A complete vote starts a new match and clears the vote state; the usual prep/landing/roulette sequence runs again.
- A returning player in the same browser session can reclaim the same ID/seat/color if free. The new host keeps host authority when the former host returns.

## Server-owned clocks and scoring

- Turn timer: 60 seconds; a timeout adds a −5 score penalty and advances turn.
- Match timer: host-configured 600, 900, 1200, 1500 or 1800 seconds (10/15/20/25/30 minutes); defaults to 600 seconds and begins only after roulette is completed.
- End conditions: one survivor, no survivors, or match timeout.
- Total = placement points + correct flags − incorrect flags − (5 × missed turns). Place points: 1st 200, 2nd 150, 3rd 75, 4th 38, 5th 19. Correct flags are +1 and incorrect flags −1, for all participants including eliminated players. Death-order placements are retained for eliminated players.

## Server → client

| Type | Fields | Description |
|---|---|---|
| `system:hello` | `phase`, `protocolVersion`, `connectionId`, `serverTime` | Protocol handshake. |
| `room:update` | `room`, `selfPlayerId` | Public room roster/configuration, player cosmetics and rematch status. Internal connection IDs are not included. |
| `match:state` | `roomCode`, `state`, `cursors` | Authoritative snapshot and server-owned clocks. Hidden mine truth/adjacency remain `null` until disclosure. |
| `match:roulette:start` | `roomCode`, `matchId`, `startPlayerId`, `activatedByPlayerId`, `at` | Synchronized roulette result. |
| `command:ack` | `commandId`, `accepted`, `action`, `note` | A server-accepted action. Rejections use `server:error`. |
| `match:rematch:ack` | `accepted`, `restarted`, `matchId` | Confirms a vote and whether all players have agreed. |
| `match:returned` | `code` | Confirms returning to lobby. |
| `server:error` | `error:{code,message}` | Validated request failure. |

## Security boundary and limitations

Before the end, covered cells use `mine: null` and `adj: null`; clients never receive the live authoritative board truth directly. The server discloses the full board/results only after the match ends. This remains an in-memory development server without authenticated accounts, persistent competitive profile, active-match resume, public matchmaking, persistent XP/coins or a public leaderboard. The session identity is solely a room-seat convenience, not a secure account token.


## 0.9C.6 — Host visual authority

- `room.config.arenaSkin` và `room.config.bombSkin` là cấu hình giao diện do host lúc tạo phòng chọn; cả sàn và hiệu ứng mìn nổ trong trận dùng cấu hình này.
- Mỗi người chơi vẫn giữ loadout riêng cho skin, avatar, cờ, loại bỏ, vệt và ăn mừng. Bom trong match state được chuẩn hóa theo bombSkin của phòng để mọi client hiển thị cùng hiệu ứng.
- Rời phòng ở màn kết quả đưa người còn lại về trạng thái waiting; host/config hiện tại được bảo toàn. Người host cũ vào lại bằng cùng identity giữ ghế/màu nhưng không tự lấy lại quyền host.
- Các cờ và bom dùng asset SVG; nhân vật tải PNG trong suốt theo catalog ID với CSS fallback.


## 0.9C.7 — Bomb skin display consistency
- The active bomb skin is now shared by revealed mine sprites and explosion visuals. In online matches the selected skin remains authoritative from the host room configuration; offline matches use the local equipped profile item.
