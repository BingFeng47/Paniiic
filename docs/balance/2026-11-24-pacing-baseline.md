# 2026-11-24 Pacing baseline (before the pacing-and-economy tuning pass)

Baseline: `balance_report`, 50 seeds (1–50, `firstSeed: 1`), policies idle, casual, competent
and perfect, no overrides. Targets are checked on `competent`. This is the "Before" table for
the first tuning change of the `pacing-and-economy` spec (Requirement 8.2).

## Change

None. This file records the defaults after spec tasks 1–4.3, with the Bot_Cursor in the bots
and the seven Requirement 7 targets in the report. No value in `src/game/balance/` changed.

## How it was run

- `npm run sim:check` (20 seeds, competent): every balance table validates; 3 pass, 4 warn,
  the same results as the table below.
- The 50-seed report was run with `balanceReport()` from a fresh `npm run sim:build`
  (`tools/mcp-sim/dist/`). The running zombie-sim MCP server answered with the old five-target
  report and the old numbers, so it is still on a build from before task 4.2. Restart it
  before the tuning pass so `balance_report` matches these tables.

## Defaults in effect

| Area | Value |
|---|---|
| Download | `downloadPercentPerSecond` 100 / 135 (0.74 %/s), dial-up 20 s |
| Chapter starts (s) | hook 0, plot turn 1 20, pinch 1 55, midpoint 90, pinch 2 115, plot turn 2 145 |
| Boss_Trigger | `bossAtPercent` 65, `bossLatestSecond` 200, boss speed 32 |
| Mobs (hp / speed / damage / drop KB) | default 2/40/4/3, fast 1/110/3/4, tank 4/24/10/12, ranged 3/40/–/8, boss 30/32/20/60, glob 1/150/5/0 |
| Prices (KB) | heavy head 30, saw 75, high RPM 50, flamethrower 150, big tank 60, blocker 40, surge 50 |
| KB thresholds | saw 75, saw + flamethrower 225, shop (weapons and upgrades) 365 |
| Economy | packet life 3 s, ad `rewardKb` 3, combo window 2 s, combo from chain 3, +1 KB per combo kill |
| Bot_Cursor (`cursorPxPerSecond`) | casual 1,400, competent 2,200, perfect 1,000,000 |

## Before

| Policy | Win rate | Median win (s) | Median saw KB (s) | Median saw + flame KB (s) | Median KB earned at win | Boss arrived share | Critical share |
|---|---|---|---|---|---|---|---|
| idle | 0 | – | – | – | – | – | 0 |
| casual | 0.86 | 242 | 81 | 122 | 955 | 0 | 0 |
| competent | 1 | 173.44 | 81 | 123 | 570 | 0 | 0 |
| perfect | 1 | 162.98 | 80 | 114 | 513.5 | 0 | 0 |

| Target | Goal | Measured | Result |
|---|---|---|---|
| Winning run length | median win 170–200 s | 173.44 | pass |
| Saw affordable | median 75 KB time 80–95 s | 81 | pass |
| Flamethrower affordable | median 225 KB time 120–140 s | 123 | pass |
| Shop choice | median KB earned at win < 365 | 570 | warn |
| Critical in Plot turn 2 | share ≥ 0.5 | 0 | warn |
| Boss arrives | share of wins ≥ 0.5 | 0 | warn |
| Winnable | win rate 0.4–0.9 | 1 | warn |

## Notes for the tuning pass

- The three timing targets pass, but two sit near the bottom of their bands: the saw time is
  1 s inside (81 vs 80) and the flamethrower time is 3 s inside (123 vs 120). A change that
  speeds up KB income will likely break them.
- Competent earns 570 KB by the end of a win, 205 KB more than the whole shop costs.
- No policy ever drops to critical integrity, and the boss never reaches the modem in a win.
  Competent still wins every seed.
