# MINEFALL 1.0.0-rc.2 — Validation Report

## Scope

Source package: derived from the latest available `MINEFALL 1.0.0-rc.1` archive, with the offline landing-pod visor-position correction and release-preparation files. Deployment preparation adds the Render Blueprint, GitHub Actions CI, smoke-test script, catalog-asset audit and version metadata.

## Checks that passed locally

- `node --test`: **65 passed, 0 failed** after the release-preparation edits.
- `node --check` passed for `engine.js`, `cosmetics.js`, `online-client.js`, `server/index.js`, `server/room-manager.js` and the added JavaScript scripts.
- Inline JavaScript syntax scan for `index.html`: passed.
- Catalog-asset audit: all registered flag and bomb SVG assets exist; skin IDs match the allowlist format.
- Added regression coverage for the offline landing-pod sibling/layer structure, visor coordinates, and explicit “BÀN CỜ” vs “CỤM ĐÁP” labels.
- Offline landing screen now infers board width/height from the generated cell count and mine count from generated cells; it no longer depends on the 16×16 UI default. Online landing continues to use the authoritative server board size.
- Added regression test proving the offline landing labels use generated board dimensions and mine count.
- HTML ID scan: 126 IDs, no duplicates.
- `render.yaml` parsed successfully with a YAML parser.
- Reviewed public file routes, WebSocket same-origin protection, `.gitignore` and project files for obvious credentials, `.env` files and Cloudflare quick-tunnel URLs. No credential file or hard-coded tunnel URL was found in project source.

## Checks not completed in this environment

- `npm install` timed out because `registry.npmjs.org` could not be resolved (`EAI_AGAIN`). The `ws` dependency was therefore not installed here.
- `npm run smoke` and `npm start` were not run successfully in this environment because the runtime dependency `ws` is absent. The smoke test is wired into GitHub Actions, where dependency installation should run on a connected CI runner.
- No public Render deployment, two-browser live match, or physical-phone test was performed.
- A headless Chromium visual screenshot could not be completed in this environment; the pod fix is supported by the verified DOM/CSS positioning relationship and regression test, but should still be visually checked in a normal browser after extraction.

## Release decision

**Not signed off as final v1.0.** This is Release Candidate 2. Final release requires the GitHub Actions workflow and server smoke test to pass, plus every mandatory checkbox in `VERSION_1.0_RELEASE_GATES.md` to be verified against the deployed build. Real multiplayer testing remains outstanding.
