# MINEFALL Phase 0.9A — Engine Boundary and Data Contract

## Goal
Separate gameplay rules from rendering before a network server is introduced. Do not intentionally alter gameplay behavior in this phase.

## Current structure

```text
MINEFALL_Phase_0.9A/
  index.html                 # Offline UI/controller, DOM rendering, bot strategy, visual timing
  engine.js                  # DOM-free rule calculations and state transitions
  tests/
    engine.test.js           # Node built-in test suite
  README.md
  PHASE_0.8_TO_1.0_ROADMAP.md
  PHASE_0.9A_ARCHITECTURE.md
```

This is an incremental boundary, not yet the final `client/engine/shared/server` folder split. A classic-script UMD wrapper is used intentionally so the user can still open `index.html` directly without ES-module `file://` CORS restrictions, while Node tests can `require('../engine.js')`.

## Engine ownership

| Domain | Engine API | UI/controller responsibility |
|---|---|---|
| Board | `generateBoard`, `validateBoard`, `neighbors` | Build and render 256–400 tile DOM grid |
| Reveal | `revealSafeRegion`, `revealCell` | Play reveal animation and log event |
| Flags | `toggleFlag` | Update each player's UI-facing `flagsOwned` set, render flag and feedback |
| Turn order | `nextAlivePlayerId` | Schedule clocks, bot waits and UI refresh |
| Timeout | `applyTimeoutPenalty` | Run the interval and show the timeout event |
| Elimination | `eliminatePlayer` | Effects, toast and spectator presentation |
| Pathfinding | `findPathBFS` | Animate the path step-by-step |
| Scoring | `allMarkableCellsMarked`, `calculateMatchResult` | Show final score panel and award local coins once |
| Commands | `createCommand`, `validateCommand` | Collect input; later send commands to server |
| State projection | `toSerializableGameState`, `toPublicGameState` | Render current state; future server sends only public projection |

## Versioned command envelope

```json
{
  "protocolVersion": 1,
  "commandId": "match-id:sequence",
  "matchId": "match-id",
  "turnId": 12,
  "playerId": "human",
  "type": "DIG",
  "payload": { "index": 73 }
}
```

Supported command types are `MOVE`, `DIG`, `FLAG`, `UNFLAG`, `READY`, `START_MATCH`, and `REQUEST_STATE`.

`MOVE`, `DIG`, `FLAG`, and `UNFLAG` are turn-sensitive. The validator can reject wrong match, stale turn, duplicate command ID, unknown player, non-active player, unsupported command and invalid tile index. The server still must revalidate everything authoritatively in later phases; a client-side validator is never a security boundary.

## Serializable state contract

The local snapshot uses `schemaVersion: 1` and stores board size/mine count, spawn, zone/ring indices, cell states, player summaries, turn order/turn ID/timer, match time and elimination order. Sets are converted to arrays, so the snapshot can be JSON-serialized.

`toSerializableGameState` is an internal full-state snapshot and includes mine truth. It must stay server/internal only in online architecture.

`toPublicGameState` creates a safe projection:

- Covered, non-exploded cells use `mine: null` and `adj: null`.
- Revealed or exploded cells disclose only what is already public.
- During final reveal, each cell becomes public as its `endRevealed` state changes; once the match is ended, all mine truth is disclosed.

The offline client necessarily owns the full board in memory. Phase 0.9B must move board generation and authoritative state to the server so public projection is the only network state sent to clients.

## Tests

Run:

```bash
node --test tests/engine.test.js
```

Tests are deterministic where practical and cover board invariants for sizes 8, 10, 12, 14, 16, 18, 20 and mine densities 25%, 35%, 50%; reveal safety; flags; turn order; timeouts; death ranks; score eligibility/ties; hidden mine secrecy; snapshots; command validation; and BFS shortest paths.

## Exit criteria for 0.9A

- UI action flows use engine methods for board/reveal/flag/turn/death/scoring rules.
- The engine does not read or write the DOM.
- State snapshots serialize; public snapshots do not leak covered mine truth.
- Commands have protocol and turn versions and can reject stale/duplicate/invalid requests.
- Automated engine tests pass.
- No multiplayer server is claimed to exist yet; networking is Phase 0.9B.


## Scoring clarification (0.9B.1)
At match end, every flag still on the board is scored for its owner, including owners who were eliminated earlier. Correct flag = +1, incorrect flag = -1. Eliminated players retain their elimination-order place, but their flag points contribute to their total score. Per-player total = placement points + flag points - (5 × missed turns). Placement for a sole survivor remains first place irrespective of flag score.
