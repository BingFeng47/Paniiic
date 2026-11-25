# Kiro development log

Appended automatically by the `task-done` hook. Add manual notes about notable Kiro moments
(a hook that caught a bug, a property test that found an edge case) under "Notes".

## Notes

- 2026-11-21: Set up the repo with steering (8 files), hooks (5), an example Playwright MCP config
  and the first spec (`game-core`, requirements stage).
- 2026-11-21: Settled the open design rules (fixed 20 s dial-up, win on same-tick tie, integrity
  100 with critical at 20, hover to collect KB, runaway ✕ capped at 3 jumps). Wrote the
  `game-core` design (10 correctness properties) and tasks. Added `playtester` and
  `art-integrator` custom agents with scoped write permissions.
- 2026-11-21: Implemented `game-core`. Property 9 found two bugs in the critical-integrity latch,
  both fixed, and the `fixedLoop` Property 8 found a phantom tick when elapsed time was zero.
- 2026-11-21: Wrote and implemented the `retro-shell` spec: scene director (Property 1), window
  stack (Properties 6–7), dial-up session (Property 9) and synthesized boot and modem audio.
  The suite reached 521 tests.
- 2026-11-21: Wrote and implemented the `connection-lane` spec (lane setup, hammer, mobs and a
  placeholder spawner, plus the lane view, HUD and placeholder sprites for every frame) with 18
  properties. Property 14 on `frameIndex` found a NaN on overflow, the tests caught a `-0` in the
  hammer hit box, and we added the `add-mob` skill; the playtester run is still pending.
- 2026-11-22: Fixed the `task-done` hook. Task-log lines before this date say "unknown task"
  because Kiro's PostTaskExec payload has no task name. The hook now names each task by
  diffing the spec's checkboxes against a snapshot. During "Run all", parallel hooks used to
  run the 30-second suite at the same time, which made property tests time out and produced
  false "CHECKS FAILED" lines. They now share one suite run.
- 2026-11-22: Wrote and implemented the `title-and-endings` spec: a title scene with a
  synthesized looping theme and an Options dialog, a `localStorage` settings store that falls
  back to defaults on missing or bad storage, and win / lose result screens over the desktop,
  with 13 properties. It supersedes retro-shell Requirement 1.2 and decision 8.
- 2026-11-22: Aligned the design with the team: zombies now stay at the modem and keep hitting
  it, the lane is a CCTV feed, the result screen gets Retry and Main menu, ads get seven close
  patterns and a guide was added. Updated `docs/game-design.md` and `docs/roadmap.md` (with a
  design coverage table) and wrote requirements for the ten remaining specs: `lane-melee`,
  `lane-cctv`, `replay-flow`, `browser-front`, `cross-front-and-director`, `economy-weapons`,
  `player-guide`, `zombie-sim-mcp`, `juice-and-endings` and `final-art`. The team approved every
  decision in those specs, including Retry skipping the boot and the MCP SDK as a dev dependency.
- 2026-11-22: Implemented `lane-melee`: mobs now stay at the modem and hit it every Hit_Interval, and a tank's or boss's first hit fires a pop-up burst. Added or replaced lane-melee Properties 1–4 and 6–8 (Property 5 is unchanged) and replaced 17 connection-lane tests listed in the design, including 9 extra rows the team approved for fixture shape and old assumptions.
- 2026-11-22: Implemented `replay-flow`: the result screen now has Retry and Main menu instead of Back to Desktop, and a new `desktop → title` transition fires on `mainMenu`. The Back_Button tests moved to the new buttons (see the replay-flow design, "Changed tests").
- 2026-11-22: Implemented `lane-cctv`: a render-only camera layer over the lane (night grade, scanline and grain overlay, "CAM 01" OSD with REC dot and timestamp, signal tears, dropouts, motion boxes around mobs, and a camera hum with static bursts), with 7 correctness properties. A flash budget allows at most 3 flashes per 60 ticks; over budget, tears draw at half alpha and dropouts are skipped.
- 2026-11-22: Implemented `browser-front`: pure ad systems in `src/game/ads/` with all seven close patterns, `eventsSoFar` and `overlayHost` hooks in the shell, and the NetSurfer Browser_View. Kiro ran it through the orchestrator with parallel sub-agents. The team approved an exception to Requirement 14.4, so the registry test now expects 2 views and 8 systems. A parallel sub-agent overwrote `src/styles/browser.css`; we caught it and restored the file.
- 2026-11-22: Implemented `cross-front-and-director`: a director replaces the placeholder lane spawner and ad schedule with a data-driven 7-chapter table in `src/game/balance/chapters.ts`, wired in `sessionRegistry`. It adds the midpoint calm followed by a 4-ad cluster, the boss at 118 s, a last runaway interrupter at 90% download, and a fast zombie spawned when the player clicks a fake button. The optional test tasks 1.2, 2.5, 2.6 and 3.2 are not written yet.
- 2026-11-22: Implemented `economy-weapons`: KB packets, the shop tray with hotkeys 1–5, the saw, the flamethrower, upgrades, the pop-up blocker and the surge protector, run as economy systems in three tick slots (weapons, a `hitModem` guard and the wallet), with 8 fast-check properties. Property 6 found a surge-window edge bug in `guard.ts`: on the tick a window ended, the expired window was not cleared before a held surge switched on. Fixed. The economy target holds: a player who kills most mobs reaches 60 KB at about 52 s and has 92 KB at 70 s. Added the `add-weapon` skill.
- 2026-11-22: Wrote and implemented `player-guide`: a desktop Mission_Note sticky with the objective, seven tray-style hint balloons (lane, real link, first clutter ad, first interrupter, first packet, first affordable item, integrity critical) that each show once per run and never pause the game, and a "Show hints" checkbox in Options. Hints_Enabled is a new Settings field with no new Settings_Version: stored version-1 settings without it default to true and keep their other fields. Checked `docs/game-design.md` section 11 against `hintTable.ts` and `guideCopy.ts`; they agree, so the doc was not changed.

- 2026-11-23: Built the `final-art` swap pipeline. One pure sprite validator
  (`src/render/sprites/validate.ts`) checks the team's SVG frames against the sprite rules and is
  shared by the tests, the asset check and the Art_List. `npm run art:list` generates the
  Art_List (`docs/art-list.md`) from the renderer's tables and the files on disk, showing each
  frame as team-made or placeholder. The atlas draws team frames first and falls back to the
  placeholder for a whole animation if any of its team frames fails to load. The Animation_Table
  (`src/render/sprites/animationTable.ts`) holds the frame rate per entity and animation. The
  `art-integrator` agent wires the frames in and checks them, and it never edits the art itself.
- 2026-11-23: Implemented `ad-pressure` after the 23 Nov playtest, where players left clutter ads
  open because it cost nothing, and the sim showed that the shared Ad_Cap let unclosed clutter
  block interrupters and fake buttons. Each open clutter ad now takes 15 points of download
  speed, down to 40%, and a damaged modem downloads slower (`0.6 + 0.4 × integrity / 100`, 68%
  at critical). Both factors come from one `downloadRate(state)`, which the download panel also
  uses for its rate and cause line. A clutter ad open for 10 s hatches a zombie at the manhole
  (default before the midpoint, fast after) and again every 10 s, with a 3 s shake, crack and
  hand warning, a creak-and-groan sound and a new `hatch` hint. The cap of 8 now counts clutter
  only, Lane_Cover clutter lands inside `laneArea` over the Lane_Dock from Pinch 1 on, and the
  lane ignores hammer, saw and pickups under it. A new `createGameSystems()` gives the browser
  and the zombie-sim bots the same system list, so the bots measure every new rule. Shipped tests
  that pinned the old rules (cap, Last_Interrupter `pending`, chapter and ad defaults, hint
  table, same-tick tie) were updated to the new rules, not weakened. Kiro ran the spec through
  the orchestrator with parallel spec-task-execution sub-agents.
- 2026-11-24: Implemented `pacing-and-economy` after the 23 Nov playtest, where the run felt
  short and easy. A winning run now lasts about 3:00 (the download needs 135 s at full speed),
  with a new chapter timeline and waves that start quiet and ramp up. The boss rises on download
  progress, with a clock fallback at 200 s. The economy is tighter (lower drops, higher prices,
  +3 KB per closed ad), and kill combos show "COMBO xN" on the CCTV display with a sound. The
  zombie-sim bots now move a cursor between the two fronts at a capped speed, and
  `balance_report` checks seven new Balance_Targets. For the tuning pass the zombie-sim MCP
  server was on a stale build and then disconnected, so the `balance-tuner` agent called
  `balanceReport()` from `tools/mcp-sim/src/report.ts` from the shell instead, 50 seeds per
  policy. It reproduced the baseline tables exactly before any change. Accepted changes: the boss
  rises at 75% (not 65%), boss HP 150 (was 30), speed 38 (was 32), drop 30 KB (was 60), and the
  plot turn 2 fast, tank and ranged waves spawn half as often. On the competent bot six of seven
  targets pass (median win 196.47 s, saw at 81 s, flamethrower at 126.5 s, critical share 0.7,
  boss arrives in every win, win rate 0.82). Shop choice fails: 612 KB earned at a win against a
  365 KB shop. Passing would need upgrade prices about 3× the design, so the team kept the
  design prices and accepted the miss. Reports: `docs/balance/2026-11-24-boss-threat.md` and
  `docs/balance/2026-11-24-late-income.md`.
- 2026-11-24: Implemented `leaderboard`. Every run now uses a daily seed (FNV-1a of
  `DEADLINE56K:` plus the UTC date), so Retry and every player on the same day get the same run.
  A `statsSystem` at the end of `createGameSystems` counts kills, the boss kill and closed ads in
  `GameState.stats`, and the pure `scoreRun` turns the final state into a score from the table in
  `src/game/balance/score.ts`. The result screen prints the score as a "NetSurfer Billing Dept."
  receipt and adds a "Sign our Guestbook!" form that remembers the last name, submits once and
  shows today's rank and top 10. The title screen gained a Hall of Fame guestbook window with a
  guest counter and today's and all-time top 10. `src/core/leaderboard.ts` talks to the Supabase
  REST API with plain `fetch` and the publishable key only, refuses `sb_secret_` keys and never
  throws. `docs/leaderboard.sql` creates the `scores` table with range checks and row-level
  security that allows select and insert but no update or delete, and a secrets test fails if a
  real secret key shows up in tracked files or `dist/`. Kiro ran the spec tasks through the
  orchestrator, with spec-task-execution sub-agents working in parallel waves on tasks that
  touch different files. Five fast-check properties cover the daily seed, stats against the
  event log, score bounds, name normalization and a client that never throws.
## Task log

- 2026-11-25: Weapon switching and roles, from playtest feedback. Keys 1–3 now take the hammer,
  saw or flamethrower in hand (new `equipWeapon` command); Shift + 1–3 and a "+" button in the
  tray buy upgrades. The flamer does 25% fire damage to the boss, the hammer hits for 2 (3 with
  the heavy head), the saw does 5.25/s, and default, tank and ranged HP rose to 3, 6 and 4 so the
  early lane stays as hard. Chosen with `balanceReport` over 50 seeds
  (`docs/balance/2026-11-25-weapon-roles.md`). The shop tray now shows each key as a boxed key
  cap apart from the price, so "1  30 KB" no longer reads as "130 KB". New `weapons` hint balloon
  and README lines explain the roles.
- 2026-11-25: Follow-up from playtest feedback. The upgrade is now a raised "UPG" button,
  filled yellow when affordable, so players stop clicking the weapon box to upgrade. Default
  zombies take 3 hammer hits (HP 5) and fast ones 2 (HP 3); flamer 3 damage/s. To keep the run
  winnable (the HP rise alone dropped the competent bot to 13% wins), the hammer cooldown went to
  0.38 s and the saw to 6.25/s (`docs/balance/2026-11-25-weapon-roles.md`).
- 2026-11-25: Saw raised to 7 damage/s on request. The sim shows it makes the end easier
  (critical in plot turn 2 drops from 60% to 10% of competent runs); recorded in the same file.
- 2026-11-25: Pop-up blocker and surge protector get a 20 s cooldown from purchase
  (`blockerCooldownSeconds`, `surgeCooldownSeconds`; buy rejected with reason `cooldown`; tray
  shows "WAIT Ns"). Bots skip items on cooldown. Sim numbers unchanged.
- 2026-11-21T09:10:23.950Z | main | /Users/bing/Documents/Kiroween/.kiro/specs/game-core/tasks.md / unknown task | checks passed
- 2026-11-21T09:13:13.581Z | main | /Users/bing/Documents/Kiroween/.kiro/specs/game-core/tasks.md / unknown task | checks passed
- 2026-11-21T09:15:03.989Z | main | /Users/bing/Documents/Kiroween/.kiro/specs/game-core/tasks.md / unknown task | checks passed
- 2026-11-21T09:16:49.818Z | main | /Users/bing/Documents/Kiroween/.kiro/specs/game-core/tasks.md / unknown task | checks passed
- 2026-11-21T09:22:28.822Z | main | /Users/bing/Documents/Kiroween/.kiro/specs/game-core/tasks.md / unknown task | checks passed
- 2026-11-21T09:25:11.532Z | main | /Users/bing/Documents/Kiroween/.kiro/specs/game-core/tasks.md / unknown task | checks passed
- 2026-11-21T09:26:14.709Z | main | /Users/bing/Documents/Kiroween/.kiro/specs/game-core/tasks.md / unknown task | checks passed
- 2026-11-21T10:19:36.491Z | main | /Users/bing/Documents/Kiroween/.kiro/specs/retro-shell/tasks.md / unknown task | checks passed
- 2026-11-21T10:19:36.499Z | main | /Users/bing/Documents/Kiroween/.kiro/specs/retro-shell/tasks.md / unknown task | checks passed
- 2026-11-21T10:19:37.104Z | main | /Users/bing/Documents/Kiroween/.kiro/specs/retro-shell/tasks.md / unknown task | checks passed
- 2026-11-21T10:19:37.253Z | main | /Users/bing/Documents/Kiroween/.kiro/specs/retro-shell/tasks.md / unknown task | checks passed
- 2026-11-21T10:19:37.416Z | main | /Users/bing/Documents/Kiroween/.kiro/specs/retro-shell/tasks.md / unknown task | checks passed
- 2026-11-21T11:33:41.643Z | main | /Users/bing/Documents/Kiroween/.kiro/specs/retro-shell/tasks.md / unknown task | checks passed
- 2026-11-21T11:36:57.763Z | main | /Users/bing/Documents/Kiroween/.kiro/specs/retro-shell/tasks.md / unknown task | CHECKS FAILED
- 2026-11-21T11:36:58.549Z | main | /Users/bing/Documents/Kiroween/.kiro/specs/retro-shell/tasks.md / unknown task | CHECKS FAILED
- 2026-11-21T11:36:58.702Z | main | /Users/bing/Documents/Kiroween/.kiro/specs/retro-shell/tasks.md / unknown task | checks passed
- 2026-11-21T11:36:59.087Z | main | /Users/bing/Documents/Kiroween/.kiro/specs/retro-shell/tasks.md / unknown task | checks passed
- 2026-11-21T11:36:59.344Z | main | /Users/bing/Documents/Kiroween/.kiro/specs/retro-shell/tasks.md / unknown task | checks passed
- 2026-11-21T11:39:13.567Z | main | /Users/bing/Documents/Kiroween/.kiro/specs/retro-shell/tasks.md / unknown task | checks passed
- 2026-11-21T11:39:13.919Z | main | /Users/bing/Documents/Kiroween/.kiro/specs/retro-shell/tasks.md / unknown task | checks passed
- 2026-11-21T11:51:02.432Z | main | /Users/bing/Documents/Kiroween/.kiro/specs/retro-shell/tasks.md / unknown task | CHECKS FAILED
- 2026-11-21T11:51:02.991Z | main | /Users/bing/Documents/Kiroween/.kiro/specs/retro-shell/tasks.md / unknown task | CHECKS FAILED
- 2026-11-21T11:51:03.569Z | main | /Users/bing/Documents/Kiroween/.kiro/specs/retro-shell/tasks.md / unknown task | CHECKS FAILED
- 2026-11-21T11:51:03.733Z | main | /Users/bing/Documents/Kiroween/.kiro/specs/retro-shell/tasks.md / unknown task | CHECKS FAILED
- 2026-11-21T11:51:03.877Z | main | /Users/bing/Documents/Kiroween/.kiro/specs/retro-shell/tasks.md / unknown task | CHECKS FAILED
- 2026-11-21T11:53:16.404Z | main | /Users/bing/Documents/Kiroween/.kiro/specs/retro-shell/tasks.md / unknown task | checks passed
- 2026-11-21T11:53:16.943Z | main | /Users/bing/Documents/Kiroween/.kiro/specs/retro-shell/tasks.md / unknown task | checks passed
- 2026-11-21T11:56:31.956Z | main | /Users/bing/Documents/Kiroween/.kiro/specs/retro-shell/tasks.md / unknown task | CHECKS FAILED
- 2026-11-21T11:56:32.758Z | main | /Users/bing/Documents/Kiroween/.kiro/specs/retro-shell/tasks.md / unknown task | CHECKS FAILED
- 2026-11-21T11:56:33.191Z | main | /Users/bing/Documents/Kiroween/.kiro/specs/retro-shell/tasks.md / unknown task | CHECKS FAILED
- 2026-11-21T11:56:33.503Z | main | /Users/bing/Documents/Kiroween/.kiro/specs/retro-shell/tasks.md / unknown task | checks passed
- 2026-11-21T11:56:33.755Z | main | /Users/bing/Documents/Kiroween/.kiro/specs/retro-shell/tasks.md / unknown task | checks passed
- 2026-11-21T12:02:04.479Z | main | /Users/bing/Documents/Kiroween/.kiro/specs/retro-shell/tasks.md / unknown task | CHECKS FAILED
- 2026-11-21T12:02:05.107Z | main | /Users/bing/Documents/Kiroween/.kiro/specs/retro-shell/tasks.md / unknown task | CHECKS FAILED
- 2026-11-21T12:02:05.319Z | main | /Users/bing/Documents/Kiroween/.kiro/specs/retro-shell/tasks.md / unknown task | checks passed
- 2026-11-21T12:02:05.726Z | main | /Users/bing/Documents/Kiroween/.kiro/specs/retro-shell/tasks.md / unknown task | checks passed
- 2026-11-21T12:03:25.888Z | main | /Users/bing/Documents/Kiroween/.kiro/specs/retro-shell/tasks.md / unknown task | checks passed
- 2026-11-21T12:09:09.236Z | main | /Users/bing/Documents/Kiroween/.kiro/specs/retro-shell/tasks.md / unknown task | CHECKS FAILED
- 2026-11-21T12:09:09.809Z | main | /Users/bing/Documents/Kiroween/.kiro/specs/retro-shell/tasks.md / unknown task | CHECKS FAILED
- 2026-11-21T12:09:10.485Z | main | /Users/bing/Documents/Kiroween/.kiro/specs/retro-shell/tasks.md / unknown task | CHECKS FAILED
- 2026-11-21T12:09:10.694Z | main | /Users/bing/Documents/Kiroween/.kiro/specs/retro-shell/tasks.md / unknown task | checks passed
- 2026-11-21T12:14:35.393Z | main | /Users/bing/Documents/Kiroween/.kiro/specs/retro-shell/tasks.md / unknown task | CHECKS FAILED
- 2026-11-21T12:14:35.421Z | main | /Users/bing/Documents/Kiroween/.kiro/specs/retro-shell/tasks.md / unknown task | CHECKS FAILED
- 2026-11-21T12:14:35.632Z | main | /Users/bing/Documents/Kiroween/.kiro/specs/retro-shell/tasks.md / unknown task | CHECKS FAILED
- 2026-11-21T12:14:36.302Z | main | /Users/bing/Documents/Kiroween/.kiro/specs/retro-shell/tasks.md / unknown task | CHECKS FAILED
- 2026-11-21T12:14:36.304Z | main | /Users/bing/Documents/Kiroween/.kiro/specs/retro-shell/tasks.md / unknown task | CHECKS FAILED
- 2026-11-21T12:19:22.152Z | main | /Users/bing/Documents/Kiroween/.kiro/specs/retro-shell/tasks.md / unknown task | checks passed
- 2026-11-21T12:19:22.453Z | main | /Users/bing/Documents/Kiroween/.kiro/specs/retro-shell/tasks.md / unknown task | checks passed
- 2026-11-21T12:23:44.622Z | main | /Users/bing/Documents/Kiroween/.kiro/specs/retro-shell/tasks.md / unknown task | checks passed
- 2026-11-21T12:23:44.995Z | main | /Users/bing/Documents/Kiroween/.kiro/specs/retro-shell/tasks.md / unknown task | checks passed
- 2026-11-21T12:32:02.509Z | main | /Users/bing/Documents/Kiroween/.kiro/specs/retro-shell/tasks.md / unknown task | checks passed
- 2026-11-21T12:33:54.998Z | main | /Users/bing/Documents/Kiroween/.kiro/specs/retro-shell/tasks.md / unknown task | checks passed
- 2026-11-21T13:16:26.232Z | main | /Users/bing/Documents/Kiroween/.kiro/specs/connection-lane/tasks.md / unknown task | checks passed
- 2026-11-21T13:20:26.583Z | main | /Users/bing/Documents/Kiroween/.kiro/specs/connection-lane/tasks.md / unknown task | checks passed
- 2026-11-21T13:20:26.959Z | main | /Users/bing/Documents/Kiroween/.kiro/specs/connection-lane/tasks.md / unknown task | CHECKS FAILED
- 2026-11-21T13:23:09.027Z | main | /Users/bing/Documents/Kiroween/.kiro/specs/connection-lane/tasks.md / unknown task | checks passed
- 2026-11-21T13:23:09.217Z | main | /Users/bing/Documents/Kiroween/.kiro/specs/connection-lane/tasks.md / unknown task | checks passed
- 2026-11-21T13:27:30.881Z | main | /Users/bing/Documents/Kiroween/.kiro/specs/connection-lane/tasks.md / unknown task | checks passed
- 2026-11-21T13:30:26.441Z | main | /Users/bing/Documents/Kiroween/.kiro/specs/connection-lane/tasks.md / unknown task | checks passed
- 2026-11-21T13:30:26.662Z | main | /Users/bing/Documents/Kiroween/.kiro/specs/connection-lane/tasks.md / unknown task | checks passed
- 2026-11-21T13:33:44.012Z | main | /Users/bing/Documents/Kiroween/.kiro/specs/connection-lane/tasks.md / unknown task | checks passed
- 2026-11-21T13:39:42.927Z | main | /Users/bing/Documents/Kiroween/.kiro/specs/connection-lane/tasks.md / unknown task | checks passed
- 2026-11-21T13:49:56.246Z | main | /Users/bing/Documents/Kiroween/.kiro/specs/connection-lane/tasks.md / unknown task | CHECKS FAILED
- 2026-11-21T13:49:56.963Z | main | /Users/bing/Documents/Kiroween/.kiro/specs/connection-lane/tasks.md / unknown task | CHECKS FAILED
- 2026-11-21T13:49:57.268Z | main | /Users/bing/Documents/Kiroween/.kiro/specs/connection-lane/tasks.md / unknown task | CHECKS FAILED
- 2026-11-21T13:49:57.623Z | main | /Users/bing/Documents/Kiroween/.kiro/specs/connection-lane/tasks.md / unknown task | CHECKS FAILED
- 2026-11-21T13:53:24.289Z | main | /Users/bing/Documents/Kiroween/.kiro/specs/connection-lane/tasks.md / unknown task | checks passed
- 2026-11-21T14:44:58.001Z | main | /Users/bing/Documents/Kiroween/.kiro/specs/connection-lane/tasks.md / unknown task | CHECKS FAILED
- 2026-11-21T14:44:58.671Z | main | /Users/bing/Documents/Kiroween/.kiro/specs/connection-lane/tasks.md / unknown task | CHECKS FAILED
- 2026-11-21T14:45:00.290Z | main | /Users/bing/Documents/Kiroween/.kiro/specs/connection-lane/tasks.md / unknown task | CHECKS FAILED
- 2026-11-21T14:51:09.102Z | main | /Users/bing/Documents/Kiroween/.kiro/specs/connection-lane/tasks.md / unknown task | CHECKS FAILED
- 2026-11-21T14:51:10.021Z | main | /Users/bing/Documents/Kiroween/.kiro/specs/connection-lane/tasks.md / unknown task | CHECKS FAILED
- 2026-11-21T14:54:02.754Z | main | /Users/bing/Documents/Kiroween/.kiro/specs/connection-lane/tasks.md / unknown task | checks passed
- 2026-11-21T14:59:33.569Z | main | /Users/bing/Documents/Kiroween/.kiro/specs/connection-lane/tasks.md / unknown task | CHECKS FAILED
- 2026-11-21T14:59:34.056Z | main | /Users/bing/Documents/Kiroween/.kiro/specs/connection-lane/tasks.md / unknown task | CHECKS FAILED
- 2026-11-21T15:02:29.560Z | main | /Users/bing/Documents/Kiroween/.kiro/specs/connection-lane/tasks.md / unknown task | checks passed
- 2026-11-22T04:55:34.071Z | main | connection-lane 1.1 Create src/game/balance/lane.ts and src/game/laneTypes.ts | checks passed
- 2026-11-22T04:55:34.071Z | main | connection-lane 1.2 Write balance tests in tests/game/balance/lane.test.ts | checks passed
- 2026-11-22T04:55:34.071Z | main | connection-lane 1.3 Extend src/game/types.ts, src/game/context.ts and src/game/step.ts | checks passed
- 2026-11-22T04:55:34.071Z | main | connection-lane 1.4 Write game-core extension tests in tests/game/step.lane.test.ts | checks passed
- 2026-11-22T04:55:34.071Z | main | connection-lane 2.1 Create src/game/laneState.ts | checks passed
- 2026-11-22T04:55:34.071Z | main | connection-lane 2.2 Create src/game/mobs.ts | checks passed
- 2026-11-22T04:55:34.071Z | main | connection-lane 2.3 Create src/game/hammer.ts | checks passed
- 2026-11-22T04:55:34.071Z | main | connection-lane 2.4 Create src/game/spawner.ts | checks passed
- 2026-11-22T04:55:34.071Z | main | connection-lane 2.5 Create src/game/lane.ts | checks passed
- 2026-11-22T04:55:34.071Z | main | connection-lane 2.6 Create lane test helpers in tests/helpers/lane.ts | checks passed
- 2026-11-22T04:55:34.071Z | main | connection-lane 2.7 Write mob tests in tests/game/mobs.test.ts | checks passed
- 2026-11-22T04:55:34.071Z | main | connection-lane 2.8 Write hammer tests in tests/game/hammer.test.ts | checks passed
- 2026-11-22T04:55:34.071Z | main | connection-lane 2.9 Write spawner and wiring tests in tests/game/spawner.test.ts and tests/game/lane.test.ts | checks passed
- 2026-11-22T04:55:34.071Z | main | connection-lane 2.10 Write lane run properties in tests/game/laneProperties.test.ts | checks passed
- 2026-11-22T04:55:34.071Z | main | connection-lane 3 Checkpoint: simulation complete | checks passed
- 2026-11-22T04:55:34.071Z | main | connection-lane 4.1 Add toScreenPoint to SessionContext | checks passed
- 2026-11-22T04:55:34.071Z | main | connection-lane 4.2 Extend tests/scenes/desktop/desktopScene.test.ts | checks passed
- 2026-11-22T04:55:34.071Z | main | connection-lane 5.1 Create src/render/sprites/entities.ts and src/render/sprites/frames.ts | checks passed
- 2026-11-22T04:55:34.071Z | main | connection-lane 5.2 Write frame tests in tests/render/sprites/frames.test.ts | checks passed
- 2026-11-22T04:55:34.071Z | main | connection-lane 5.3 Create src/render/sprites/manifest.ts and src/render/sprites/spriteModules.ts | checks passed
- 2026-11-22T04:55:34.071Z | main | connection-lane 5.4 Write manifest tests in tests/render/sprites/manifest.test.ts | checks passed
- 2026-11-22T04:55:34.071Z | main | connection-lane 5.5 Create src/render/sprites/placeholder.ts | checks passed
- 2026-11-22T04:55:34.071Z | main | connection-lane 5.6 Write placeholder tests in tests/render/sprites/placeholder.test.ts | checks passed
- 2026-11-22T04:55:34.071Z | main | connection-lane 5.7 Create src/render/sprites/atlas.ts | checks passed
- 2026-11-22T04:55:34.071Z | main | connection-lane 5.8 Write atlas tests in tests/render/sprites/atlas.test.ts | checks passed
- 2026-11-22T04:55:34.071Z | main | connection-lane 6.1 Create src/render/laneLayout.ts | checks passed
- 2026-11-22T04:55:34.071Z | main | connection-lane 6.2 Write layout tests in tests/render/laneLayout.test.ts | checks passed
- 2026-11-22T04:55:34.071Z | main | connection-lane 6.3 Create src/render/laneEffects.ts and src/render/laneDrawList.ts | checks passed
- 2026-11-22T04:55:34.071Z | main | connection-lane 6.4 Write draw-list and effects tests in tests/render/laneDrawList.test.ts and tests/render/l… | checks passed
- 2026-11-22T04:55:34.071Z | main | connection-lane 6.5 Create src/render/laneSounds.ts | checks passed
- 2026-11-22T04:55:34.071Z | main | connection-lane 6.6 Write sound tests in tests/render/laneSounds.test.ts | checks passed
- 2026-11-22T04:55:34.071Z | main | connection-lane 6.7 Create src/ui/laneCopy.ts and src/ui/laneHud.ts | checks passed
- 2026-11-22T04:55:34.071Z | main | connection-lane 6.8 Write HUD and copy tests in tests/ui/laneHud.test.ts and tests/copy.test.ts | checks passed
- 2026-11-22T04:55:34.071Z | main | connection-lane 6.9 Create src/render/laneView.ts and src/styles/lane.css | checks passed
- 2026-11-22T04:55:34.071Z | main | connection-lane 6.10 Write Lane_View tests in tests/render/laneView.test.ts | checks passed
- 2026-11-22T04:55:34.071Z | main | connection-lane 7.1 Register the lane in src/dialup/sessionRegistry.ts | checks passed
- 2026-11-22T04:55:34.071Z | main | connection-lane 8 Checkpoint: lane playable in the shell | checks passed
- 2026-11-22T04:55:34.071Z | main | connection-lane 9.1 Write the add-mob skill in .kiro/skills/add-mob/SKILL.md | checks passed
- 2026-11-22T04:55:34.071Z | main | connection-lane 9.2 Write tests/skills.test.ts | checks passed
- 2026-11-22T04:55:34.071Z | main | connection-lane 9.3 Add a note to docs/kiro-log.md | checks passed
- 2026-11-22T04:55:34.071Z | main | game-core 1.1 Create src/game/types.ts with TICK_RATE, Phase, InputCommand, GameEventBody, | checks passed
- 2026-11-22T04:55:34.071Z | main | game-core 1.2 Create src/game/balance/core.ts with CoreBalance, DEFAULT_CORE_BALANCE, | checks passed
- 2026-11-22T04:55:34.071Z | main | game-core 1.3 Create src/game/rng.ts (Mulberry32, state is one uint32) | checks passed
- 2026-11-22T04:55:34.071Z | main | game-core 2.1 Create src/game/state.ts with createRun (seed normalized with >>> 0, phase | checks passed
- 2026-11-22T04:55:34.071Z | main | game-core 2.2 Create src/game/context.ts with TickContext, System and a context factory over a | checks passed
- 2026-11-22T04:55:34.071Z | main | game-core 2.3 Create tests/helpers/game.ts with stepN, scheduledDamage and | checks passed
- 2026-11-22T04:55:34.071Z | main | game-core 3.1 Create src/game/step.ts following the seven-stage tick order in the design | checks passed
- 2026-11-22T04:55:34.071Z | main | game-core 3.2 Example tests in tests/game/step.test.ts: connected at exactly tick 1,200; | checks passed
- 2026-11-22T04:55:34.071Z | main | game-core 4.1 P1 determinism and P7 JSON round trip | checks passed
- 2026-11-22T04:55:34.071Z | main | game-core 4.2 P2 no mutation (deep-freeze the input state) | checks passed
- 2026-11-22T04:55:34.071Z | main | game-core 4.3 P3 integrity bounds, P4 download bounds, P9 critical crossings | checks passed
- 2026-11-22T04:55:34.071Z | main | game-core 4.4 P5 no progress while paused, P10 pause-order independence | checks passed
- 2026-11-22T04:55:34.071Z | main | game-core 4.5 P6 terminal phases are absorbing | checks passed
- 2026-11-22T04:55:34.071Z | main | game-core 5.1 Create src/game/headless.ts with runHeadless (scripted inputs by tick, per-second | checks passed
- 2026-11-22T04:55:34.071Z | main | game-core 5.2 Tests in tests/game/headless.test.ts: a scripted perfect run wins at the expected | checks passed
- 2026-11-22T04:55:34.071Z | main | game-core 6.1 Create src/core/fixedLoop.ts with accumulate and startFixedLoop (injectable | checks passed
- 2026-11-22T04:55:34.071Z | main | game-core 6.2 Tests in tests/core/fixedLoop.test.ts: P8 as a property test; the clamp at | checks passed
- 2026-11-22T04:55:34.071Z | main | game-core 7 Checkpoint: npm run typecheck, npm test and npm run build all pass | checks passed
- 2026-11-22T04:55:34.071Z | main | retro-shell 1.1 Add dialTicks(balance) to game-core | checks passed
- 2026-11-22T04:55:34.071Z | main | retro-shell 1.2 Create src/core/h.ts | checks passed
- 2026-11-22T04:55:34.071Z | main | retro-shell 1.3 Write tests for h() in tests/core/h.test.ts | checks passed
- 2026-11-22T04:55:34.071Z | main | retro-shell 1.4 Create src/core/scene.ts | checks passed
- 2026-11-22T04:55:34.071Z | main | retro-shell 1.5 Write tests for the scene director in tests/core/scene.test.ts | checks passed
- 2026-11-22T04:55:34.071Z | main | retro-shell 1.6 Create shell test helpers | checks passed
- 2026-11-22T04:55:34.071Z | main | retro-shell 2.1 Create src/core/monitor.ts | checks passed
- 2026-11-22T04:55:34.071Z | main | retro-shell 2.2 Write tests for the monitor in tests/core/monitor.test.ts | checks passed
- 2026-11-22T04:55:34.071Z | main | retro-shell 2.3 Create src/core/audio.ts | checks passed
- 2026-11-22T04:55:34.071Z | main | retro-shell 2.4 Write tests for the audio engine in tests/core/audio.test.ts | checks passed
- 2026-11-22T04:55:34.071Z | main | retro-shell 2.5 Create the stylesheets in src/styles/ | checks passed
- 2026-11-22T04:55:34.071Z | main | retro-shell 2.6 Create src/desktop/iconArt.ts and src/desktop/copy.ts | checks passed
- 2026-11-22T04:55:34.071Z | main | retro-shell 3.1 Create src/scenes/boot/bootScript.ts | checks passed
- 2026-11-22T04:55:34.071Z | main | retro-shell 3.2 Write tests for the boot script in tests/scenes/boot/bootScript.test.ts | checks passed
- 2026-11-22T04:55:34.071Z | main | retro-shell 3.3 Create src/scenes/boot/bootSounds.ts | checks passed
- 2026-11-22T04:55:34.071Z | main | retro-shell 3.4 Create src/scenes/powerOffScene.ts and src/scenes/boot/bootScene.ts | checks passed
- 2026-11-22T04:55:34.071Z | main | retro-shell 3.5 Write tests for the power-off and boot scenes | checks passed
- 2026-11-22T04:55:34.071Z | main | retro-shell 4.1 Create src/desktop/layout.ts | checks passed
- 2026-11-22T04:55:34.071Z | main | retro-shell 4.2 Write tests for the layout in tests/desktop/layout.test.ts | checks passed
- 2026-11-22T04:55:34.071Z | main | retro-shell 4.3 Create src/desktop/windowStack.ts | checks passed
- 2026-11-22T04:55:34.071Z | main | retro-shell 4.4 Write tests for the window stack in tests/desktop/windowStack.test.ts | checks passed
- 2026-11-22T04:55:34.071Z | main | retro-shell 4.5 Create src/desktop/windowManager.ts | checks passed
- 2026-11-22T04:55:34.071Z | main | retro-shell 4.6 Write DOM tests for the window manager in tests/desktop/windowManager.test.ts | checks passed
- 2026-11-22T04:55:34.071Z | main | retro-shell 5.1 Create src/desktop/taskbar.ts | checks passed
- 2026-11-22T04:55:34.071Z | main | retro-shell 5.2 Create src/desktop/startMenu.ts | checks passed
- 2026-11-22T04:55:34.071Z | main | retro-shell 5.3 Create src/desktop/icons.ts and src/desktop/textWindow.ts | checks passed
- 2026-11-22T04:55:34.071Z | main | retro-shell 5.4 Write tests for the taskbar in tests/desktop/taskbar.test.ts | checks passed
- 2026-11-22T04:55:34.071Z | main | retro-shell 5.5 Write tests for the start menu in tests/desktop/startMenu.test.ts | checks passed
- 2026-11-22T04:55:34.071Z | main | retro-shell 5.6 Write tests for icons and text windows in tests/desktop/icons.test.ts and | checks passed
- 2026-11-22T04:55:34.071Z | main | retro-shell 6 Checkpoint - Ensure all tests pass | checks passed
- 2026-11-22T04:55:34.071Z | main | retro-shell 7.1 Create src/dialup/dialScript.ts | checks passed
- 2026-11-22T04:55:34.071Z | main | retro-shell 7.2 Write tests for the dial script in tests/dialup/dialScript.test.ts | checks passed
- 2026-11-22T04:55:34.071Z | main | retro-shell 7.3 Create src/dialup/modemSounds.ts | checks passed
- 2026-11-22T04:55:34.071Z | main | retro-shell 7.4 Write tests for modem sounds in tests/dialup/modemSounds.test.ts | checks passed
- 2026-11-22T04:55:34.071Z | main | retro-shell 7.5 Create src/dialup/session.ts and src/dialup/sessionRegistry.ts | checks passed
- 2026-11-22T04:55:34.071Z | main | retro-shell 7.6 Write tests for the Session in tests/dialup/session.test.ts | checks passed
- 2026-11-22T04:55:34.071Z | main | retro-shell 7.7 Create src/dialup/dialer.ts and src/dialup/trayModemView.ts | checks passed
- 2026-11-22T04:55:34.071Z | main | retro-shell 7.8 Write tests for the dialer and tray view in tests/dialup/dialer.test.ts and | checks passed
- 2026-11-22T04:55:34.071Z | main | retro-shell 8.1 Create src/scenes/shutdown/shutdownScript.ts and src/scenes/shutdown/shutdownScene.ts | checks passed
- 2026-11-22T04:55:34.071Z | main | retro-shell 8.2 Write tests for shutdown in tests/scenes/shutdown/shutdownScene.test.ts | checks passed
- 2026-11-22T04:55:34.071Z | main | retro-shell 8.3 Create src/scenes/desktop/desktopScene.ts | checks passed
- 2026-11-22T04:55:34.071Z | main | retro-shell 8.4 Write integration tests in tests/scenes/desktop/desktopScene.test.ts | checks passed
- 2026-11-22T04:55:34.071Z | main | retro-shell 8.5 Create src/scenes/index.ts and rewrite src/main.ts | checks passed
- 2026-11-22T04:55:34.071Z | main | retro-shell 8.6 Write the full-flow and repository scan tests | checks passed
- 2026-11-22T04:55:34.071Z | main | retro-shell 9 Final checkpoint - Typecheck, test and build | checks passed
- 2026-11-22T04:55:34.071Z | main | title-and-endings 1.1 Extend src/core/audio.ts and the fake engine in tests/helpers/audio.ts | checks passed
- 2026-11-22T04:59:27.939Z | main | title-and-endings 1.2 Write engine tests in tests/core/audio.test.ts and tests/helpers/timers.ts | CHECKS FAILED
- 2026-11-22T05:20:07.213Z | main | title-and-endings 1.4 Write settings tests in tests/core/settings.test.ts and tests/helpers/storage.ts | CHECKS FAILED
- 2026-11-22T05:20:07.218Z | main | title-and-endings 2.2 Write title model tests in tests/scenes/title/titleModel.test.ts | CHECKS FAILED
- 2026-11-22T05:28:21.754Z | main | title-and-endings 2.6 Write theme recipe tests in tests/scenes/title/themeSong.test.ts | checks passed
- 2026-11-22T05:32:13.906Z | main | title-and-endings 2.10 Write Title_Scene tests in tests/scenes/title/titleScene.test.ts | checks passed
- 2026-11-22T06:10:10.126Z | main | title-and-endings 3 Checkpoint: audio, settings and title pieces | checks passed
- 2026-11-22T06:19:25.218Z | main | title-and-endings 4.1 Wire the Title_Scene into the shell | checks passed
- 2026-11-22T06:19:25.224Z | main | title-and-endings 6.3 Create src/ui/resultSounds.ts | checks passed
- 2026-11-22T06:19:25.227Z | main | title-and-endings 6.1 Create src/ui/resultScript.ts and src/ui/resultCopy.ts | checks passed
- 2026-11-22T06:36:08.971Z | main | title-and-endings 4.2 Extend tests/core/scene.test.ts and tests/scenes/index.test.ts | checks passed
- 2026-11-22T06:41:13.876Z | main | title-and-endings 6.6 Write Result_Screen tests in tests/ui/resultScreen.test.ts | checks passed
- 2026-11-22T06:41:13.886Z | main | title-and-endings 7.1 Show the Result_Screen by default in src/scenes/desktop/desktopScene.ts and update the tw… | checks passed
- 2026-11-22T06:46:59.665Z | main | title-and-endings 7.3 Extend the repository scans in tests/copy.test.ts and create tests/styles.test.ts | checks passed
- 2026-11-22T06:46:59.669Z | main | title-and-endings 5.2 Write shake tests in tests/render/laneEffects.test.ts, tests/render/laneView.test.ts and … | checks passed
- 2026-11-22T06:51:49.978Z | main | title-and-endings 7.2 Write result flow tests in tests/scenes/desktop/desktopScene.test.ts and tests/scenes/ind… | checks passed
- 2026-11-22T06:53:57.259Z | main | title-and-endings 8 Checkpoint: title, options and endings playable in the shell | checks passed
- 2026-11-22T06:56:22.795Z | main | title-and-endings 9.1 Update docs/game-design.md | checks passed
- 2026-11-22T06:56:22.846Z | main | title-and-endings 9.3 Record the retro-shell supersession and the log note | checks passed
- 2026-11-22T06:56:22.847Z | main | title-and-endings 9.2 Update docs/roadmap.md | checks passed
- 2026-11-22T08:07:29.375Z | main | title-and-endings 10 Playtester smoke run | checks passed
- 2026-11-22T08:10:26.393Z | main | title-and-endings 11 Final checkpoint | checks passed
- 2026-11-22T09:47:51.267Z | main | lane-melee 1.1 Add melee types and the mobArrived event in src/game/laneTypes.ts | CHECKS FAILED
- 2026-11-22T09:49:19.423Z | main | lane-melee 1.2 Add the melee table to src/game/balance/lane.ts | CHECKS FAILED
- 2026-11-22T09:57:07.385Z | main | lane-melee 1.3 Update tests/game/balance/lane.test.ts | CHECKS FAILED
- 2026-11-22T09:57:07.385Z | main | lane-melee 2.1 Update addMob and mobSystem in src/game/mobs.ts | CHECKS FAILED
- 2026-11-22T09:57:07.387Z | main | lane-melee 2.1 Update `addMob` and `mobSystem` in `src/game/mobs.ts` | CHECKS FAILED
- 2026-11-22T09:57:07.435Z | main | lane-melee 2.2 Update the lane test helpers in tests/helpers/lane.ts | CHECKS FAILED
- 2026-11-22T10:03:45.042Z | main | lane-melee 2.2 Update the lane test helpers in `tests/helpers/lane.ts` | CHECKS FAILED
- 2026-11-22T10:07:26.795Z | main | lane-melee 2.3 Replace the bite examples in tests/game/mobs.test.ts | CHECKS FAILED
- 2026-11-22T10:07:26.795Z | main | lane-melee 4.1 Update src/render/laneDrawList.ts | CHECKS FAILED
- 2026-11-22T10:07:26.810Z | main | lane-melee 2.4 Write lane-melee Properties 1, 2, 3, 6 and 7 in tests/game/laneMeleeProperties.test.ts | CHECKS FAILED
- 2026-11-22T10:07:26.810Z | main | lane-melee 2.5 Replace connection-lane Property 4 in tests/game/laneProperties.test.ts | CHECKS FAILED
- 2026-11-22T10:07:26.816Z | main | lane-melee 2.6 Add the idle-run check to tests/game/lane.test.ts | CHECKS FAILED
- 2026-11-22T10:07:26.865Z | main | lane-melee 2.6 Add the idle-run check to `tests/game/lane.test.ts` | CHECKS FAILED
- 2026-11-22T10:09:46.693Z | main | lane-melee 4.2 Add the zombieGroan recipe to src/render/laneSounds.ts | CHECKS FAILED
- 2026-11-22T10:12:50.790Z | main | lane-melee 4.3 Update tests/render/laneDrawList.test.ts and tests/render/laneSounds.test.ts | CHECKS FAILED
- 2026-11-22T10:12:50.822Z | main | lane-melee 5.1 Update .kiro/skills/add-mob/SKILL.md | CHECKS FAILED
- 2026-11-22T10:15:16.066Z | main | lane-melee 3 Checkpoint | checks passed
- 2026-11-22T10:20:51.124Z | main | lane-melee 5.2 Add a dated note to docs/kiro-log.md | checks passed
- 2026-11-22T10:20:51.177Z | main | lane-melee 6 Playtester smoke run | checks passed
- 2026-11-22T10:22:21.536Z | main | lane-melee 7 Final checkpoint | checks passed
- 2026-11-22T11:40:04.498Z | main | replay-flow 1.1 Add the mainMenu signal to src/core/scene.ts | CHECKS FAILED
- 2026-11-22T11:40:04.498Z | main | replay-flow 2.1 Update src/ui/resultCopy.ts and src/ui/resultScreen.ts | CHECKS FAILED
- 2026-11-22T11:40:04.501Z | main | replay-flow 2 Result_Screen buttons | CHECKS FAILED
- 2026-11-22T11:42:32.236Z | main | replay-flow 2.2 Update tests/ui/resultScreen.test.ts | CHECKS FAILED
- 2026-11-22T11:42:32.236Z | main | replay-flow 1.2 Update the scene director tests | CHECKS FAILED
- 2026-11-22T11:42:32.265Z | main | replay-flow 3.1 Add retry() and mainMenu() to src/scenes/desktop/desktopScene.ts | CHECKS FAILED
- 2026-11-22T11:45:27.250Z | main | replay-flow 3.2 Update tests/scenes/desktop/desktopScene.test.ts | checks passed
- 2026-11-22T11:45:27.268Z | main | replay-flow 4.1 Add a dated note to docs/kiro-log.md | checks passed
- 2026-11-22T11:45:27.274Z | main | replay-flow 3.3 Update tests/scenes/index.test.ts | checks passed
- 2026-11-22T11:47:55.086Z | main | replay-flow 5 Final checkpoint | checks passed
- 2026-11-22T12:02:20.085Z | main | lane-cctv 1.1 Create src/render/cctv/cctvTuning.ts | checks passed
- 2026-11-22T12:02:20.133Z | main | lane-cctv 1.2 Create src/render/cctv/cctvTimestamp.ts | checks passed
- 2026-11-22T12:04:17.346Z | main | lane-cctv 1.3 Create src/render/cctv/cctvState.ts | checks passed
- 2026-11-22T12:04:17.352Z | main | lane-cctv 3.3 Create src/render/cctv/cctvSounds.ts | checks passed
- 2026-11-22T12:04:17.385Z | main | lane-cctv 2.1 Create src/render/cctv/noiseTiles.ts | checks passed
- 2026-11-22T12:14:59.233Z | main | lane-cctv 1.4 Write tests/render/cctv/cctvTimestamp.test.ts and tests/render/cctv/cctvState.test.ts | checks passed
- 2026-11-22T12:18:37.748Z | main | lane-cctv 4.1 Wire the camera layer into src/render/laneView.ts | CHECKS FAILED
- 2026-11-22T12:23:03.348Z | main | lane-cctv 4.2 Update tests/render/laneView.test.ts and the Lane_HUD tests | checks passed
- 2026-11-22T12:23:03.400Z | main | lane-cctv 4.3 Write tests/render/cctv/cctvRun.test.ts | checks passed
- 2026-11-22T12:24:56.480Z | main | lane-cctv 5 Checkpoint | checks passed
- 2026-11-22T12:42:15.190Z | main | lane-cctv 6.1 Add a dated note to docs/kiro-log.md | checks passed
- 2026-11-22T12:42:15.190Z | main | lane-cctv 6.2 Playtester smoke run | checks passed
- 2026-11-22T12:42:15.210Z | main | lane-cctv 6 Docs and playtest | checks passed
- 2026-11-22T12:48:45.541Z | main | lane-cctv 7 Final checkpoint | checks passed
- 2026-11-22T13:08:50.805Z | main | browser-front 1.1 Add eventsSoFar() to the tick context in src/game/context.ts | checks passed
- 2026-11-22T13:08:50.829Z | main | browser-front 2.1 Create src/game/ads/adTypes.ts and extend src/game/types.ts and src/game/step.ts | checks passed
- 2026-11-22T13:08:50.848Z | main | browser-front 1.2 Add overlayHost to SessionContext and the Desktop_Scene | checks passed
- 2026-11-22T13:12:31.821Z | main | browser-front 2.2 Create src/game/balance/ads.ts | checks passed
- 2026-11-22T13:12:31.861Z | main | browser-front 3.1 Create src/game/ads/closePatterns.ts | checks passed
- 2026-11-22T13:15:49.664Z | main | browser-front 3.2 Create src/game/ads/placement.ts and src/game/ads/openAd.ts | checks passed
- 2026-11-22T13:19:49.928Z | main | browser-front 3.3 Create src/game/ads/adSystems.ts | checks passed
- 2026-11-22T13:31:55.247Z | main | browser-front 5.1 Create src/ui/browserCopy.ts and the browser icon in src/desktop/iconArt.ts | checks passed
- 2026-11-22T13:31:55.299Z | main | browser-front 5.4 Create src/render/browser/browserSounds.ts | checks passed
- 2026-11-22T13:37:23.780Z | main | browser-front 5.2 Create src/render/browser/netsurferWindow.ts and src/render/browser/downloadPanel.ts | checks passed
- 2026-11-22T13:45:03.041Z | main | browser-front 6.1 Register the Browser_View and the ad systems in src/dialup/sessionRegistry.ts | checks passed
- 2026-11-22T13:48:08.541Z | main | browser-front 7.1 Write .kiro/skills/add-ad/SKILL.md and extend tests/skills.test.ts | checks passed
- 2026-11-22T13:48:08.571Z | main | browser-front 7.2 Add a dated note to docs/kiro-log.md | checks passed
- 2026-11-22T14:07:01.497Z | main | browser-front 7.3 Playtester run | checks passed
- 2026-11-22T14:10:19.680Z | main | browser-front 8 Final checkpoint | checks passed
- 2026-11-22T14:20:05.634Z | main | cross-front-and-director 1.1 Create src/game/balance/chapters.ts | checks passed
- 2026-11-22T14:20:05.661Z | main | cross-front-and-director 2.1 Create src/game/director/directorTypes.ts and extend the game types | checks passed
- 2026-11-22T14:22:25.783Z | main | cross-front-and-director 2.2 Create src/game/director/directorLane.ts | checks passed
- 2026-11-22T14:22:25.797Z | main | cross-front-and-director 2.3 Create src/game/director/directorAds.ts | checks passed
- 2026-11-22T14:23:44.732Z | main | cross-front-and-director 2.4 Create src/game/director/index.ts with createDirector | checks passed
- 2026-11-22T14:26:51.780Z | main | cross-front-and-director 3.1 Use the director in src/dialup/sessionRegistry.ts | checks passed
- 2026-11-22T14:28:30.913Z | main | cross-front-and-director 4 Checkpoint | checks passed
- 2026-11-22T14:29:56.701Z | main | cross-front-and-director 5.1 Check docs/game-design.md section 3 against the default table and fix any mismatch | checks passed
- 2026-11-22T14:36:04.749Z | main | cross-front-and-director 6 Final checkpoint | checks passed
- 2026-11-22T15:29:47.651Z | main | economy-weapons 1.1 Create src/game/economy/economyTypes.ts and extend src/game/types.ts and src/game/step.ts | checks passed
- 2026-11-22T15:29:47.689Z | main | economy-weapons 1.2 Create src/game/balance/economy.ts | checks passed
- 2026-11-22T15:32:33.290Z | main | economy-weapons 1.3 Add the lane hooks | checks passed
- 2026-11-22T15:32:33.321Z | main | economy-weapons 2.1 Create src/game/economy/shop.ts | checks passed
- 2026-11-22T15:36:47.936Z | main | economy-weapons 1.4 Write tests/game/balance/economy.test.ts and the hook tests | checks passed
- 2026-11-22T15:36:47.984Z | main | economy-weapons 2.2 Create src/game/economy/weapons.ts | checks passed
- 2026-11-22T15:36:47.996Z | main | economy-weapons 2.3 Create src/game/economy/wallet.ts | checks passed
- 2026-11-22T15:39:18.070Z | main | economy-weapons 2.4 Create src/game/economy/index.ts with createEconomySystems() | checks passed
- 2026-11-22T15:43:41.325Z | main | economy-weapons 4.3 Create src/render/economySounds.ts | checks passed
- 2026-11-22T15:43:41.337Z | main | economy-weapons 2.5 Write example tests in tests/game/economy/ | checks passed
- 2026-11-22T15:43:41.371Z | main | economy-weapons 2.6 Write tests/game/economy/economyProperties.test.ts | checks passed
- 2026-11-22T15:45:21.040Z | main | economy-weapons 3 Checkpoint | checks passed
- 2026-11-22T15:54:27.359Z | main | economy-weapons 4.1 Update src/render/laneView.ts input and drawing | checks passed
- 2026-11-22T16:05:26.857Z | main | economy-weapons 4.4 Write view, HUD and sound tests | checks passed
- 2026-11-22T16:05:26.857Z | main | economy-weapons 5.2 Write tests/game/economy/economyTarget.test.ts | checks passed
- 2026-11-22T16:05:26.863Z | main | economy-weapons 6.1 Write `.kiro/skills/add-weapon/SKILL.md` and extend `tests/skills.test.ts` | checks passed
- 2026-11-22T16:05:26.919Z | main | economy-weapons 5 Wiring and target check | checks passed
- 2026-11-22T16:05:26.919Z | main | economy-weapons 6.1 Write .kiro/skills/add-weapon/SKILL.md and extend tests/skills.test.ts | checks passed
- 2026-11-22T16:06:47.980Z | main | economy-weapons 6.2 Add a dated note to docs/kiro-log.md | checks passed
- 2026-11-22T16:09:39.833Z | main | economy-weapons 7 Final checkpoint | checks passed
- 2026-11-23T02:56:58.714Z | main | economy-weapons 8.1 Move the Shop_Tray to the top centre of the lane | checks passed
- 2026-11-23T03:20:13.159Z | main | player-guide 1.1 Add hintsEnabled to src/core/settings.ts, ViewPrefs and the Options_Dialog | checks passed
- 2026-11-23T03:20:13.159Z | main | player-guide 2.1 Create src/ui/guideCopy.ts and src/desktop/missionNote.ts; mount in the Desktop_Scene | checks passed
- 2026-11-23T03:20:13.172Z | main | player-guide 2.1 Create `src/ui/guideCopy.ts` and `src/desktop/missionNote.ts`; mount in the Desktop_S… | checks passed
- 2026-11-23T03:20:13.188Z | main | player-guide 3.1 Create src/ui/hints/hintTable.ts, hintTriggers.ts, hintQueue.ts and hintPlacement.ts | checks passed
- 2026-11-23T03:25:43.085Z | main | player-guide 1.2 Test the setting | checks passed
- 2026-11-23T03:57:56.447Z | main | player-guide 3.1 Create `src/ui/hints/hintTable.ts`, `hintTriggers.ts`, `hintQueue.ts` and `hintPlacem… | checks passed
- 2026-11-23T04:49:57.586Z | main | juice-and-endings 1.1 Move the flash budget to src/render/flashBudget.ts | checks passed
- 2026-11-23T04:49:57.600Z | main | juice-and-endings 1.2 Add the voice cap and limiter to src/core/audio.ts | checks passed
- 2026-11-23T05:00:17.754Z | main | juice-and-endings 3.1 Create src/render/juice/crackArt.ts and the overlay CSS | checks passed
- 2026-11-23T05:00:17.796Z | main | juice-and-endings 3.2 Create src/render/juice/juiceSounds.ts | checks passed
- 2026-11-23T05:08:51.274Z | main | juice-and-endings 3.3 Create src/render/juice/juiceView.ts and register it | checks passed
- 2026-11-23T05:10:45.754Z | main | juice-and-endings 5 Checkpoint | checks passed
- 2026-11-23T05:15:46.646Z | main | juice-and-endings 6.1 Add endFrame to SessionView and the 30-tick hold to src/scenes/desktop/desktopScene.ts | checks passed
- 2026-11-23T05:20:49.925Z | main | juice-and-endings 6.2 Implement endFrame in the Lane_View and the Juice_View | checks passed
- 2026-11-22: Implemented `juice-and-endings`: screen shake, crack and corruption overlays at critical integrity, hit and kill feedback, a boss rumble and roar, a voice cap with a limiter on the audio output, and a flash budget shared by the lane effects. The end of a run now plays a 30-tick transition before the result screen: NO SIGNAL on a loss, a fade on a win. The Browser_View is not on the shared flash budget yet.
- 2026-11-23T05:22:09.070Z | main | juice-and-endings 7.1 Add a dated note to docs/kiro-log.md | checks passed
- 2026-11-23T06:10:32.603Z | main | juice-and-endings 7.2 Playtester full run | checks passed
- 2026-11-23T06:12:44.750Z | main | juice-and-endings 8 Final checkpoint | checks passed
- 2026-11-23T06:24:48.211Z | main | final-art 1.1 Create src/render/sprites/animationTable.ts | checks passed
- 2026-11-23T06:24:48.211Z | main | final-art 2.1 Create src/render/sprites/validate.ts | checks passed
- 2026-11-23T06:24:48.255Z | main | final-art 2.1 Create `src/render/sprites/validate.ts` | checks passed
- 2026-11-23T06:27:36.151Z | main | final-art 2.3 Write tests/render/sprites/assets.test.ts | checks passed
- 2026-11-23T06:27:36.183Z | main | final-art 3.1 Update src/render/sprites/atlas.ts | checks passed
- 2026-11-23T06:30:59.242Z | main | final-art 4.1 Create src/render/sprites/artList.ts with the pure renderArtList and the art:list npm scr… | checks passed
- 2026-11-23T06:33:02.179Z | main | final-art 5 Checkpoint | checks passed
- 2026-11-23T06:34:34.744Z | main | final-art 6.1 Update .kiro/agents/art-integrator.md | checks passed
- 2026-11-23T06:34:34.782Z | main | final-art 6.2 Add the README "Art" credit and a dated note in docs/kiro-log.md | checks passed
- 2026-11-23T06:58:39.114Z | main | zombie-sim-mcp 1.1 Add the MCP SDK dev dependency, the build config and npm scripts | checks passed
- 2026-11-23T07:03:44.443Z | main | zombie-sim-mcp 2.1 Create tools/mcp-sim/src/runBot.ts | checks passed
- 2026-11-23T07:03:44.457Z | main | zombie-sim-mcp 3.2 Create tools/mcp-sim/src/sprites.ts | checks passed
- 2026-11-23T07:03:44.496Z | main | zombie-sim-mcp 2.2 Create tools/mcp-sim/src/policies.ts | checks passed
- 2026-11-23T07:05:59.453Z | main | zombie-sim-mcp 3.1 Create tools/mcp-sim/src/report.ts | checks passed
- 2026-11-23T08:17:16.376Z | main | zombie-sim-mcp 4 Checkpoint | checks passed
- 2026-11-23T09:15:29.362Z | main | zombie-sim-mcp 5.1 Create tools/mcp-sim/src/schemas.ts and tools/mcp-sim/src/server.ts | checks passed
- 2026-11-23T09:15:29.367Z | main | zombie-sim-mcp 6.3 Create .kiro/agents/balance-tuner.md | checks passed
- 2026-11-23T09:15:29.371Z | main | zombie-sim-mcp 6.1 Create tools/mcp-sim/src/check.ts and .kiro/hooks/balance-check.json | checks passed
- 2026-11-23T09:17:16.517Z | main | zombie-sim-mcp 2.3 Write tests/tools/mcp-sim/runBot.test.ts | checks passed
- 2026-11-23T09:19:24.932Z | main | zombie-sim-mcp 3.3 Write tests/tools/mcp-sim/report.test.ts and sprites.test.ts | checks passed
- 2026-11-23T09:19:24.939Z | main | zombie-sim-mcp 3.4 Write tests/tools/mcp-sim/perf.test.ts | checks passed
- 2026-11-23T09:21:34.247Z | main | zombie-sim-mcp 5.2 Register the server in .kiro/settings/mcp.json and docs/mcp.example.json | CHECKS FAILED
- 2026-11-23T09:21:34.247Z | main | zombie-sim-mcp 5.3 Write tests/tools/mcp-sim/server.test.ts | CHECKS FAILED
- 2026-11-23T09:21:34.272Z | main | zombie-sim-mcp 5 Server and config | CHECKS FAILED
- 2026-11-23T09:21:34.272Z | main | zombie-sim-mcp 6.2 Write tests/tools/mcp-sim/check.test.ts | CHECKS FAILED
- 2026-11-23T09:21:34.290Z | main | zombie-sim-mcp 6 Hook and agent | CHECKS FAILED
- 2026-11-23T09:23:43.334Z | main | zombie-sim-mcp 6.1 Create `tools/mcp-sim/src/check.ts` and `.kiro/hooks/balance-check.json` | checks passed
- 2026-11-23: Implemented `zombie-sim-mcp`: a local MCP server in `tools/mcp-sim` (built with `npm run sim:build`) with three tools. `simulate_run` plays seeded headless runs with one of four bots (idle, casual, competent, perfect), `balance_report` runs a seed batch per bot and returns a win-rate and timing table, and `validate_sprites` checks frames against the sprite rules. Added the `balance-tuner` custom agent (`.kiro/agents/balance-tuner.md`), which changes balance tables only with before-and-after reports, and the `balance-check` hook (`.kiro/hooks/balance-check.json`), which runs `npm run sim:check` when a file in `src/game/balance/` is saved. A fix to how `step.ts` clones state cut a 50-seed, 3-bot report from about 84 s to about 13–26 s.- 2026-11-23T12:17:47.082Z | main | zombie-sim-mcp 7.1 Run the balance-tuner agent once | checks passed
- 2026-11-23T12:17:47.082Z | main | zombie-sim-mcp 7.2 Add a dated note to docs/kiro-log.md | checks passed
- 2026-11-23T12:17:47.095Z | main | zombie-sim-mcp 7 First tuning pass and docs | checks passed
- 2026-11-23T12:20:12.629Z | main | zombie-sim-mcp 8 Final checkpoint | checks passed
- 2026-11-23T13:24:01.422Z | main | ad-pressure 1.1 Create src/game/systems.ts with createGameSystems | checks passed
- 2026-11-23T13:30:58.912Z | main | ad-pressure 1.2 Write tests/game/systems.test.ts | checks passed
- 2026-11-23T13:30:58.912Z | main | ad-pressure 2.1 Add lineQualityFloor to src/game/balance/core.ts and bandwidth? to GameState | checks passed
- 2026-11-23T13:30:58.913Z | main | ad-pressure 2.1 Add `lineQualityFloor` to `src/game/balance/core.ts` and `bandwidth?` to `GameState` | checks passed
- 2026-11-23T13:30:58.917Z | main | ad-pressure 3.1 Add hatchSeconds and hatchWarningSeconds to the ad balance; add hatchKind to | checks passed
- 2026-11-23T13:30:58.927Z | main | ad-pressure 4.1 Clutter-only cap in openAd | checks passed
- 2026-11-23T13:37:37.320Z | main | ad-pressure 2.2 Create src/game/downloadRate.ts and use it in step() stage 6 | checks passed
- 2026-11-23T13:37:37.320Z | main | ad-pressure 3.2 Create src/game/ads/hatch.ts; add adHatched and SpawnSource adHatch; hatch in | checks passed
- 2026-11-23T13:37:37.329Z | main | ad-pressure 4.2 Add laneArea with validation; place Lane_Cover clutter in it; add the Pinch 1 | checks passed
- 2026-11-23T13:37:37.379Z | main | ad-pressure 4.2 Add `laneArea` with validation; place Lane_Cover clutter in it; add the Pinch 1 | checks passed
- 2026-11-23T13:45:56.491Z | main | ad-pressure 2.3 Add the bandwidth keys to src/game/balance/ads.ts, create | checks passed
- 2026-11-23T13:45:56.505Z | main | ad-pressure 3.3 Tests: tests/game/ads/hatch.test.ts and Property 4 | checks passed
- 2026-11-23T13:53:02.784Z | main | ad-pressure 2.4 Tests: tests/game/downloadRate.test.ts, balance validation, Properties 1–3 | checks passed
- 2026-11-23T13:53:02.788Z | main | ad-pressure 4.3 Tests: Properties 5–7 in tests/game/ads/adPressureProperties.test.ts | checks passed
- 2026-11-23T13:58:22.420Z | main | ad-pressure 5 Checkpoint | checks passed
- 2026-11-23T14:16:42.830Z | main | ad-pressure 6.1 Download_Panel rate from downloadRate and the cause line; copy in browserCopy.ts | CHECKS FAILED
- 2026-11-23T14:16:42.830Z | main | ad-pressure 6.2 Hatch warning in the Ad_Layer (is-hatching, crack, hand, 2 Hz shake) and the | CHECKS FAILED
- 2026-11-23T14:25:03.021Z | main | ad-pressure 6.5 Render tests for 6.1–6.3 | checks passed
- 2026-11-23T14:25:03.039Z | main | ad-pressure 7.1 Check docs/game-design.md sections 4, 7, 8 against the defaults; update the add-ad | checks passed
- 2026-11-23T15:32:11.322Z | main | ad-pressure 7.2 Run the playtester agent for a smoke run: the bar slows with open clutter, an ad | checks passed
- 2026-11-23T15:35:03.500Z | main | ad-pressure 8 Final checkpoint | checks passed
- 2026-11-23T16:03:08.166Z | main | pacing-and-economy 1.1 Set downloadPercentPerSecond to 100 / 135 and the new Chapter starts, waves and ad | CHECKS FAILED
- 2026-11-23T16:03:08.166Z | main | pacing-and-economy 2.1 New drops, prices, packet life and rewardKb | CHECKS FAILED
- 2026-11-23T16:03:08.174Z | main | pacing-and-economy 2.1 New drops, prices, packet life and `rewardKb` | CHECKS FAILED
- 2026-11-23T16:13:12.815Z | main | pacing-and-economy 1.2 Boss_Trigger: bossAtPercent, bossLatestSecond, validation, directorLane; boss | checks passed
- 2026-11-23T16:13:12.815Z | main | pacing-and-economy 2.2 Combo in walletSystem, the balance keys, the combo event and KbReason | checks passed
- 2026-11-23T16:13:12.835Z | main | pacing-and-economy 2.2 Combo in `walletSystem`, the balance keys, the `combo` event and `KbReason` | checks passed
- 2026-11-23T16:20:13.666Z | main | pacing-and-economy 1.3 Tests: boss examples and Property 1 in tests/game/director/bossTrigger.test.ts | CHECKS FAILED
- 2026-11-23T16:20:13.669Z | main | pacing-and-economy 2.3 Tests: combo examples and Properties 2–3 in tests/game/economy/combo.test.ts | CHECKS FAILED
- 2026-11-23T16:38:38.434Z | main | pacing-and-economy 3 Checkpoint | checks passed
- 2026-11-23T16:50:24.875Z | main | pacing-and-economy 4.1 Bot_Cursor in tools/mcp-sim/src/policies.ts with cursorPxPerSecond | checks passed
- 2026-11-23T16:50:24.875Z | main | pacing-and-economy 4.2 New targets and metrics in tools/mcp-sim/src/report.ts, schemas.ts, the | checks passed
- 2026-11-23T16:50:24.889Z | main | pacing-and-economy 4.2 New targets and metrics in `tools/mcp-sim/src/report.ts`, `schemas.ts`, the | checks passed
- 2026-11-23T16:54:27.217Z | main | pacing-and-economy 4.3 Tests: Property 4 and the report targets in tests/tools/ | checks passed
- 2026-11-24T09:33:47.593Z | main | pacing-and-economy 4.4 Run npm run sim:check and a 50-seed balance_report; save it as the baseline | checks passed
- 2026-11-24T15:10:29.449Z | main | pacing-and-economy 5.1 Run the balance-tuner agent against the Requirement 7 targets | checks passed
- 2026-11-24T15:23:14.564Z | main | pacing-and-economy 5.2 Update docs/game-design.md to every tuned value that differs | checks passed
- 2026-11-24T15:23:14.578Z | main | pacing-and-economy 6.1 Dated note in docs/kiro-log.md; demo-video note in docs/submission-checklist.md | checks passed
- 2026-11-24T15:40:47.267Z | main | pacing-and-economy 6.2 Run the playtester agent for one full run: quiet first minute, ramp, saw around | checks passed
- 2026-11-24T15:42:55.169Z | main | pacing-and-economy 7 Final checkpoint | checks passed
- 2026-11-24T15:52:41.405Z | main | leaderboard 1.1 Create src/game/dailySeed.ts and src/core/clock.ts; make the daily seed the | checks passed
- 2026-11-24T15:58:48.400Z | main | leaderboard 1.2 Tests: Property 1 and the Desktop_Scene default seed | checks passed
- 2026-11-24T16:06:19.015Z | main | leaderboard 2.3 Tests: Properties 2–3 in tests/game/stats.test.ts and tests/game/score.test.ts | checks passed
- 2026-11-24T16:08:23.791Z | main | leaderboard 4 Checkpoint | checks passed
- 2026-11-24T16:14:41.616Z | main | leaderboard 5.1 Create src/ui/guestbook/guestbookName.ts with Property 4 tests | checks passed
- 2026-11-24T16:14:41.616Z | main | leaderboard 6.1 Title model actions, the Hall of Fame button and window, styles | checks passed
- 2026-11-24T16:14:41.648Z | main | leaderboard 5.1 Create `src/ui/guestbook/guestbookName.ts` with Property 4 tests | checks passed
- 2026-11-24T16:14:41.648Z | main | leaderboard 5.2 Receipt in the Result_Screen; copy in src/ui/resultCopy.ts | checks passed
- 2026-11-24T16:22:26.003Z | main | leaderboard 5.3 Create src/ui/guestbook/guestbookForm.ts and mount it in the Result_Screen; pass the | checks passed
- 2026-11-24T16:22:26.023Z | main | leaderboard 6.2 Title tests: button order, open/close, Play ignored while open, failure text | checks passed
- 2026-11-24T16:28:49.128Z | main | leaderboard 5.4 Result_Screen tests for 5.2–5.3 | checks passed
- 2026-11-24T16:28:49.128Z | main | leaderboard 7.1 Check docs/leaderboard.sql against the design; confirm .env.example and | checks passed
- 2026-11-24T16:28:49.143Z | main | leaderboard 7.1 Check `docs/leaderboard.sql` against the design; confirm `.env.example` and | checks passed
- 2026-11-24T16:28:49.168Z | main | leaderboard 7.2 Create tests/docs/secrets.test.ts | checks passed
- 2026-11-24T16:28:49.174Z | main | leaderboard 7.3 Check docs/game-design.md section 12; dated note in docs/kiro-log.md | checks passed
- 2026-11-24T17:22:18.619Z | main | leaderboard 8.1 Ask the user to confirm the table exists (a GET /rest/v1/scores?limit=1 with the | checks passed
- 2026-11-24T17:24:51.825Z | main | leaderboard 9 Final checkpoint | checks passed
