# 2026-11-24 Boss threat (pacing-and-economy tuning pass, change 1 of 2)

Before: `docs/balance/2026-11-24-pacing-baseline.md`. Targets are checked on `competent`.

## Change

| File | Key | Old | New |
|---|---|---|---|
| `src/game/balance/chapters.ts` | `bossAtPercent` | 65 | 75 |
| `src/game/balance/lane.ts` | `enemies.boss.hp` | 30 | 150 |
| `src/game/balance/lane.ts` | `enemies.boss.speed` | 32 | 38 (lane crossing 25 s → 21 s) |

Boss damage (20) and hit interval (2 s) are unchanged.

## Reason

- In the baseline the competent bot never takes modem damage, and that stays true with any
  regular-mob pressure we tried: even a default zombie every 1 s in plot turn 2 left critical
  share at 0. Only the boss can get past the bot. A 30 HP boss dies to the saw in about 4 s,
  so it never reached the modem in a win. That left 0 for boss arrived share and critical share,
  and a win rate of 1.
- **Why 75% and not 65%.** Competent reaches 65% at 113–125 s in 43 of 50 seeds, about 30 s
  before plot turn 2 starts at 145 s. A boss that rises that early and is strong enough to push
  critical share to 0.5 either wrecks the modem before plot turn 2 (those losses don't count as
  critical in plot turn 2) or stalls the download past 200 s. The best 65% case was 200 HP at
  speed 24: median win 206 s, win rate 0.82, critical share 0.52. 70% passed only with a boss
  faster than the default zombie (140 HP, speed 44). That breaks the design's "very slow" boss,
  which `tests/game/balance/lane.test.ts` pins as boss speed below default speed. At 75% with
  speed 38 every target except shop choice passes with a few seconds of margin on run length.
- 150 HP: the critical share threshold is sharp (145 HP 0.34, 150 HP 0.70 at 75% and speed 38).
  150 lands above it with win rate 0.82.

## How it was run

`balanceReport()` from `tools/mcp-sim/src/report.ts`, bundled with Vite and called from Node,
50 seeds (`firstSeed: 1`), policies idle, casual, competent and perfect. The zombie-sim MCP
server was on a stale build and then disconnected, so the report was called directly. It
reproduced the baseline tables exactly before any change.

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

## After

| Policy | Win rate | Median win (s) | Median saw KB (s) | Median saw + flame KB (s) | Median KB earned at win | Boss arrived share | Critical share |
|---|---|---|---|---|---|---|---|
| idle | 0 | – | – | – | – | – | 0 |
| casual | 0.78 | 244.62 | 81 | 122 | 967 | 1 | 0.08 |
| competent | 0.84 | 198.58 | 81 | 126.5 | 733.5 | 1 | 0.7 |
| perfect | 1 | 177.4 | 80 | 133 | 598 | 1 | 0.1 |

| Target | Goal | Measured | Result |
|---|---|---|---|
| Winning run length | median win 170–200 s | 198.58 | pass |
| Saw affordable | median 75 KB time 80–95 s | 81 | pass |
| Flamethrower affordable | median 225 KB time 120–140 s | 126.5 | pass |
| Shop choice | median KB earned at win < 365 | 733.5 | warn |
| Critical in Plot turn 2 | share ≥ 0.5 | 0.7 | pass |
| Boss arrives | share of wins ≥ 0.5 | 1 | pass |
| Winnable | win rate 0.4–0.9 | 0.84 | pass |

## Notes

- Longer, harder runs earn more, so KB earned at a win rose from 570 to 733.5. Change 2
  (`2026-11-24-late-income.md`) cuts it back.
- Run length has only 1.4 s of margin after this change alone.
