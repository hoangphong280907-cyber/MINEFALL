# MINEFALL RC3 Preview — Validation Report

## Scope

Dynamic pawn scaling from selected board-cell dimensions and lightweight CSS animation for the visible PNG character sprites. No gameplay, position, collision, scoring, or WebSocket protocol changes.

## Passed in patch workspace

- `node --test`: **66 passed, 0 failed**.
- `node scripts/check-inline-js.js`: passed.
- `node scripts/audit-static-assets.js`: passed.
- `node --check` for `engine.js`, `cosmetics.js`, `online-client.js`, `server/index.js`, and `server/room-manager.js`: passed.
- Regression test added for cell-relative sprite dimensions, idle/movement/death animation targets, and reduced-motion support.

## Pending on the connected project

- `npm run smoke` was not run in this isolated patch workspace because the `ws` dependency is not installed here.
- Visual test in a real browser at 8×8, 16×16, and 20×20, desktop and phone.
- Two-client online visual check to confirm both clients render the same enlarged animated skin.

## Release status

**Preview only. Do not merge to `main` until the real browser and online visual checks pass.**
