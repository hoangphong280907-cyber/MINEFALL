# MINEFALL RC3 Preview — Character Scale & Animation

This patch is intended to be overlaid on the current `MINEFALL 1.0.0-rc.2` working tree. It includes the updated `index.html`, one new regression test, the five approved skin PNGs, and this note.

## Changes

- Each player pawn frame is sized to 76% of one selected board cell, computed from the actual `SIZE` value at render time. It no longer uses a fixed 3.6% of the whole board or a 25px maximum.
- The PNG sprite remains slightly larger than its frame to compensate for transparent safety padding; the visible character is approximately 80% of a cell.
- Crowd offsets are now based on the selected cell size rather than a fixed board-relative offset.
- Visible PNG sprites now have a subtle idle float, a short movement bounce/tilt, and the existing death animation.
- Existing reduced-motion CSS remains in force. Game state, movement positions, hitboxes, scoring, and WebSocket messages are unchanged.

## Validation performed in the patch workspace

- `node --test`: 66 passed, 0 failed.
- `node scripts/check-inline-js.js`: PASS.
- `node scripts/audit-static-assets.js`: PASS.
- `node --check` for the project JavaScript files: PASS.
- `npm run smoke`: not run in this packaging workspace because `ws` is not installed here. Run it on the user's already-installed project before merging.
- Real browser/phone visual check: pending. In particular, confirm pawn size on 8×8, 16×16 and 20×20 boards, and verify the same skin/animation on both online clients.

## Apply

Extract this ZIP into the project root, allowing `index.html`, `tests/ui-config.test.js`, `CHANGELOG.txt`, and the five files in `assets/skins/` to be replaced. Do not delete `package-lock.json`, `.git`, or any other project files.
