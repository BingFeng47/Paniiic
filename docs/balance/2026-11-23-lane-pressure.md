# 2026-11-23 Lane pressure (first tuning pass)

Baseline: `balance_report`, 50 seeds, all policies, no overrides.

## Change
- File: src/game/balance/lane.ts
- Key: enemies.tank.speed
- Old value: 24
- New value: 36

## Reason
The tank should reach the modem in the midpoint beat. The design only says "very slow", so speed is tunable.

## Before
| Policy | Win rate | Median win (s) | Median 60 KB (s) | Median 180 KB (s) | Critical share |
|---|---|---|---|---|---|
| idle | 0 | – | – | – | 0 |
| casual | 1 | 178.875 | 52 | 84 | 0 |
| competent | 1 | 135.61666666666667 | 52 | 84 | 0 |
| perfect | 1 | 130.30833333333334 | 52 | 83 | 0 |

| Target | Measured | Result |
|---|---|---|
| Winning run length | 135.61666666666667 | pass |
| Saw affordable | 52 | pass |
| Flamethrower affordable | 84 | pass |
| Critical in Plot turn 2 | 0 | warn |
| Winnable | 1 | warn |

## After (`baseline: {}`, same seeds)
Identical to Before in every row and every check.

## Decision
Rejected: no number changed, so `src/game/balance/` is left as is. In `simulate_run` (seed 1, competent) integrity stays at 100 for the whole run because the bot kills every mob about 1 s after it spawns, so mob stats cannot add pressure.

## Needs work outside balance tables
1. Bot model (`tools/mcp-sim/src/policies.ts`): casual and competent have no reaction delay or cursor travel between fronts. Add these, then re-baseline. Until then "Critical in Plot turn 2" and "Winnable" cannot move.
2. Boss timing (design-fixed): spawn at ~118 s with speed 26 reaches the modem ~149 s, after the 135.6 s median win. Threatening the modem in Plot turn 2 needs a design decision.
3. Median win passes by only 0.62 s; expect it to shift after the bot fix.

Next candidate after re-baseline: Plot turn 2 `default` wave in `src/game/balance/chapters.ts`, every 3 s → 2 s.
