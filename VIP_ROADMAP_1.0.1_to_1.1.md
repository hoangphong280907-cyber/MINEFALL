# MINEFALL — VIP Update: Roadmap 1.0.1 → 1.1

This roadmap filters the 20-page VIP proposal into releases. It preserves the proposal's themes while avoiding features that depend on systems not yet implemented. Items marked **Source idea** summarize the uploaded PDF; items marked **Recommendation** are prioritization or compatibility decisions for MINEFALL.

## Already included in Phase 0.9B.3 / 0.9C

- Online room capacity chosen by the host: 2, 3, 4, or 5 participants.
- The host's selected arena theme remains authoritative for the room.
- Match-end flag scoring is defined for every participant: correct flag +1, incorrect flag -1. Remaining flags owned by eliminated players still contribute to their personal totals; elimination order still determines their place.
- Phase 0.9C now implements server-authoritative MOVE/DIG/FLAG/UNFLAG, 60-second turn timers, selectable 10/15/20/25/30-minute match timers (10-minute default), −5 missed-turn penalty, death order, end reveal, final scoring for every player and 2–5 player room replay. It keeps hidden mine truth on the server until the match ends. The browser-to-browser WebSocket smoke test still needs to be run after installing `ws`.

## Version 1.0.1 — Stability and gameplay balance (highest priority)

**Goal:** prove the 0.9C online core is stable, then lock high-impact balance rules before adding progression systems.

1. **Online 2–5 player stability gate.** Core gameplay now exists in 0.9C. For 1.0.1, perform browser-to-browser smoke tests with 2 players first, then capacities 3–5. Check command rejection for wrong turns, hidden mine redaction, disconnect handling, timer consistency and identical results on every client. Fix any defects found before adding persistence or rewards.
2. **Board-size-based match duration** (source idea, PDF p.1):
   - 8×8, 10×10, 12×12: 10 minutes.
   - 14×14, 16×16: 20 minutes.
   - 18×18, 20×20: 40 minutes.
   Implement one shared rule used by offline and server-authoritative online matches. Display the actual duration in the lobby and match UI. Add timer tests for every board size.
3. **Adaptive bot thinking by revealed-map progress** (source idea, PDF p.1). Thresholds: mid-game at about 25% of board revealed; late-game at about 50% revealed. Proposed ranges from the PDF:

   | Difficulty | Mid-game, ~25% open | Late-game, ~50% open |
   |---|---:|---:|
   | Easy | 6–10 s | 7–15 s |
   | Medium | 11–20 s | 16–25 s |
   | Hard | 21–35 s | 27–45 s |

   **Recommendation:** make these ranges configurable and test them before release. Keep the current short 3–5 second early-game pause. Use a progress metric that works on dense boards; do not wait for 60% of all cells to be revealed on a 50%-mine board. Spectator fast-forward should shorten waiting after the human is eliminated. The long Hard end-game range may need tuning if playtests show excessive idle time.
4. **Default three bots, not a forced cap of three** (source idea, PDF p.1): set the offline default to 3 bots, but keep the existing player choice of 2–4 bots unless testing proves the other options cause pacing problems.
5. **Scoring and rewards regression tests.** For every participant, final total = placement points + correct flags − incorrect flags − 5 × missed turns. Correct/incorrect flag counts include the participant's remaining flags even if eliminated; placement for eliminated players stays based on elimination order. The server, offline engine and summary UI must agree.

### Landing-zone change: do not ship in 1.0.1

The PDF proposes changing the start-zone geometry (p.1). The current engine now creates a compact, irregular connected opening of 15–20 safe revealed cells: five distinct spawn cells plus 10–15 clue cells. **Recommendation: keep this engine-generated opening through 1.0.1.** Any later layout experiment must preserve a connected 15–20-cell cluster, five distinct spawn positions for a 5-player room, correct adjacency values and readability. A 2×2 blank pad alone cannot provide five distinct spawn positions.

## Already delivered in Phase 0.9C.5 — visual cosmetic catalog

- Shop categories: 12 arenas with number palettes; 10 flags including the Vietnam flag; 10 bomb visuals/explosion palettes; 10 elimination effects; 10 movement trails; 11 victory celebrations.
- All categories are local profile cosmetics and are transmitted in each player's online loadout. The profile is still saved only in localStorage.
- Future roadmap items in 1.0.2–1.1 refer to tuning, economy/progression, profile persistence and additional content, not to creating these base categories from scratch.

## Version 1.0.2 — Cosmetic economy and polish

**Goal:** tune the now-present cosmetic catalog, resolve the coin economy and improve previews/readability without creating gameplay advantages.

1. **Audit and lock one coin model first.** The existing rule is 10 match points = 1 gold coin. The PDF proposes a different model (p.10): +10 coins per correct flag, -10 per incorrect flag, and placement rewards such as 500 for first, 300 for second, 150 for third and 100 for fourth. It also proposes shop prices of 500–1,000 Common, 2,500–5,000 Rare, 10,000–20,000 Epic and 50,000 Legendary (pp.9–10). These models conflict; do not stack both. Simulate expected earnings and prices before choosing, and define a fifth-place reward before implementation.
2. **Polish and playtest the delivered 12 arena themes.** Confirm every arena changes board surface, border and the number palette 1–8 on both desktop and mobile. Keep number contrast/accessibility high.
3. **Audit shop values and presentation.** The existing character/avatar catalog remains modest; add new assets only after the coin model and licensing/presentation checks are complete.
4. **Add cosmetic rarity labels** (Common/Rare/Epic/Legendary) only after the coin economy is decided. All items remain cosmetic-only.
5. **Prototype the proposed 2×2 landing zone** in a separate test build. Accept it only if five-player spawn safety, number-ring correctness and readability all pass automated tests and playtesting.

## Version 1.0.3 — More visual identity

**Goal:** add variety in small, performance-safe batches.

1. Add 2–3 more arena themes from the PDF's Toxic Hazard, Void Shadow, Fairy Light and Cyberpunk concepts (pp.3–4). Do not build all six at once if art production or mobile readability suffers.
2. Add a small selection of movement trails (PDF pp.6): start with two, such as Shadow Ghosting and Lightning Dash. Keep trails short-lived and automatically reduce particles on mobile or when reduced-motion is enabled.
3. Add more emotes (PDF pp.7–8), e.g. Pray, Flex/Smart Move and GG. Keep existing cooldowns and suppress automatic spam.
4. Add one or two optional death effects (PDF pp.6–7), selected from Tombstone, Pixel Disintegration or Petrification. Keep the existing standard effect as the default and preserve gameplay readability.
5. Add static avatar frames before animated frames. Animated fire/cosmic/void frames should be performance-tested separately.

## Version 1.0.4 — Account profile and progression base

**Goal:** establish persistent, server-validated player progress before recurring rewards.

1. Add a persistent player profile and match history, with server-authoritative currency and statistics for online play. Never trust localStorage as the source of competitive currency, XP or rank.
2. Implement an XP ledger and a small initial level track. The PDF's proposed XP values (pp.11–12) include +5 XP per safe tile opened, +20 per correct flag, survival-time XP, +250 for first place, and smaller placement rewards. Treat these as tuning proposals, not final balance.
3. Exclude XP events that depend on mechanics not yet in the game. In particular, “flag stealing” and power-up usage must not be quest/XP objectives until those mechanics are implemented and tested.
4. Add a few milestone rewards, then verify rewards cannot be granted twice for one match or forged by the client.

## Version 1.1 — Retention systems and premium cosmetics

**Goal:** introduce recurring progression only after the economy and server persistence are stable.

1. **Daily quests** (source ideas, PDF pp.12–14): refresh at 00:00; show four active tasks. Start with supported goals such as completing matches, landing correct flags, opening safe tiles and surviving for a cumulative duration. Award XP and coins using the locked economy.
2. **Weekly quests** (source ideas, PDF pp.14–16): refresh Monday 00:00. Use higher targets over multiple matches, with 50% and 100% progress rewards. Only include objectives supported by live mechanics.
3. **Level rewards through level 50** (source ideas, PDF pp.17–20): expand the progression track gradually, including coins, skins, avatars, emotes, trails and titles. The thresholds in the PDF are draft values and should be playtested.
4. **Premium visual rewards**: additional movement trails, avatar frames, death effects and victory celebrations such as the PDF's coin rain/royal banner/cosmic ascension (pp.6–9). Build one effect at a time and verify mobile performance.
5. **Online leaderboard/rank groundwork** (continuation of the earlier MINEFALL direction, not a core item from the PDF): only add persistent competitive rank after server-authoritative scoring, match history and basic abuse prevention are stable. Public matchmaking, 2v2 and advanced social systems can remain beyond 1.1 if they delay stability.

## Deferred or excluded unless separately approved

- Power-up/flag-steal quests before power-ups/flag-steal gameplay exists.
- Replacing the current random connected 15–20-cell landing cluster before five-player spawn safety, adjacency and readability are proven in automated tests and playtests.
- Full catalog of all character skins and all five movement trails in one release.
- All five death effects and all three large victory animations at once; too much implementation and mobile-performance risk.
- The PDF's coin income and shop price tables until they are reconciled with the existing 10-points-to-1-coin rule.
- Any cosmetic that changes mine probability, visibility, action timing or competitive advantage.

## Release gates

- **1.0.1:** two to five people can finish a server-authoritative online match; scoring and placement match across clients; timers match board size; no hidden mine data leaks.
- **1.0.2:** coin model is documented and tested; first new theme(s) and cosmetics save/equip correctly; no cosmetic affects gameplay.
- **1.0.3:** effects are optional, cooldown-limited where relevant, and mobile-safe.
- **1.0.4:** account progress, XP and rewards are server-validated and cannot be duplicated by replaying a client event.
- **1.1:** daily/weekly resets use server time, quest progress is idempotent, and rewards are granted once.


## Future multiplayer modes — after the standard mode is stable

The current online mode is **Standard Flag Duel**. Enemy-flag removal is blocked on client and server; it must not be used as an undocumented side effect of standard play.

1. **Standard Flag Duel**: only the flag owner may remove their flag. This is the baseline and remains the first release gate.
2. **Team 2v2**: implement team assignment, team colors/markers, team survival/win conditions, scoring, friendly-fire/flag ownership rules, and results UI as a complete mode. Do not approximate this by merely allowing four people into a standard free-for-all.
3. **Chaos**: permit removing/replacing an opponent's flag, using explicit mode-level server authorization. Add clear feedback on stolen/replaced flags and define how flag ownership/score is transferred. Never enable it globally.

These are future gameplay modes, not features of Phase 0.9C.3. Build each mode with server-side validation and separate regression tests before exposing a mode selector to players.
