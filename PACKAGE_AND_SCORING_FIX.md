# MINEFALL Phase 0.9C — Online gameplay and scoring fix

## Eliminated-player flag display
The previous offline results table hid `correctFlags / wrongFlags` and `flagScore` whenever `player.alive` was false. The engine had already counted those flags in the player's total, so the UI displayed `—` while the total showed the contribution. The results table now uses the match scoring state (`state.scored`) rather than player survival state to decide whether the breakdown should be shown. Every player displays the actual `correct / incorrect` count and flag points after finalization.

## Online gameplay
The 0.9C server handles the complete core loop: match begin after roulette, movement, digging, flag/unflag, turn deadlines, match timeout, missed-turn penalties, mine elimination, death order and score finalization. All gameplay commands are checked against the authenticated socket player and current server-owned match/turn. Hidden mine truth is redacted in public snapshots until the match ends.

## Scoring contract
- Correct flag: +1.
- Incorrect flag: −1.
- Each missed turn: −5.
- Total: placement points + correct flags − incorrect flags − missed-turn penalty.
- Flags remaining on the board are counted for every owner at the end, even if the owner is already eliminated/disconnected.
- Death-order placement remains unchanged for eliminated participants.

## Board/character consistency
The online grid explicitly sets both CSS grid columns and rows to the server-returned size and asserts a cell count of `size * size` in tests. Online pawns use the existing offline default pawn silhouette and the same five-color palette; they are not tied to purchased avatar/skin data, keeping online gameplay readable and cosmetic-independent.
