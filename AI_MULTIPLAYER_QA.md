# AI Multiplayer QA System

## Purpose

Run repeatable end-to-end multiplayer checks against the real Node.js HTTP/WebSocket server. The runner uses scripted virtual clients over WebSocket; it does not call RoomManager directly and does not alter a deployed Render service.

## Run

```bash
npm ci
npm run test:multiplayer
```

Run a short local check while developing:

```bash
npm run test:multiplayer -- --quick
```

The default run covers 28 scenarios: player counts 2, 3, 4 and 5, crossed with board sizes 8, 10, 12, 14, 16, 18 and 20. The quick run checks the 2-player/5-player configurations on 8x8 and 20x20 boards.

## Checks per scenario

- Connects the configured number of independent WebSocket clients.
- Creates and joins a room, marks every player ready, starts the match, activates roulette and begins the match.
- Confirms the configured player count, board dimensions, cell count and easy-mode mine count.
- Confirms five unique spawn cells and a connected landing opening of 15-20 cells.
- Compares authoritative match snapshots across all connected clients.
- Confirms hidden mine positions are redacted from public snapshots.
- Attempts an out-of-turn flag command and expects the server to reject it.
- Tests MOVE without consuming a turn, FLAG consuming exactly one turn, and UNFLAG by the original owner.
- Attempts to replay an accepted command and expects duplicate-command rejection.

## CI

The GitHub Actions workflow runs this matrix after the normal unit tests and before the HTTP/WebSocket smoke test. A failed scenario fails the CI job and prints the affected player-count/board-size combination.

## Limits

These scripted agents are protocol and server-behavior test clients. They are not a substitute for real people using separate browsers, real mobile devices, visual inspection, or long-duration performance testing. The runner starts a fresh local server; it does not test Render, public DNS, production TLS/WSS, PWA installation, or browser rendering. Those checks remain part of the v1.0 release gates.

The test runner uses safe, non-destructive game actions and terminates its local server after the matrix completes.


## Stress and memory lifecycle test

Run the bounded stress suite:

```bash
npm run test:stress
```

Default profile: 6 simultaneous rooms × 5 WebSocket clients, 3 batches, 3 reconnect cycles per room per batch, 5 game turns per room, and 12 cursor updates per player. Across the full run this creates 18 room lifecycles, 54 reconnect cycles, 180 game commands, and 1,080 cursor messages sent by clients.

Tune the load with environment variables:

- `MINEFALL_STRESS_ROOMS`: 2–12 (default 6)
- `MINEFALL_STRESS_BATCHES`: 1–4 (default 3)
- `MINEFALL_STRESS_RECONNECT_CYCLES`: 1–5 (default 3)
- `MINEFALL_STRESS_TURNS`: 1–10 (default 5)
- `MINEFALL_STRESS_CURSOR_BURST`: 1–40 (default 12)

The runner launches a local test server with `--expose-gc`. A local-only `/__test/metrics` endpoint is enabled only when both `NODE_ENV=test` and `MINEFALL_TEST_METRICS=1`; it reports process heap/RSS, room count and live WebSocket count, and optionally triggers garbage collection. This endpoint is not available in a normal production environment.

The runner measures command acknowledgement and reconnect latency, peak RSS/heap, and post-GC retained heap. It also verifies that every batch releases all test rooms and sockets and that retained heap stays within a 24 MiB allowance after forced GC. The test is a bounded CI regression/load check, not a capacity certification or a substitute for profiling under real production traffic.
