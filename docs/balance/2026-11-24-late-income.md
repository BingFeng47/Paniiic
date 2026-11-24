# 2026-11-24 Late income (pacing-and-economy tuning pass, change 2 of 2)

Before: the "After" of `docs/balance/2026-11-24-boss-threat.md`. Targets are checked on
`competent`. Same method: `balanceReport()` called directly, 50 seeds (`firstSeed: 1`), all
four policies.

## Change

| File | Key | Old | New |
|---|---|---|---|
| `src/game/balance/chapters.ts` | plot turn 2 wave `fast` `everySeconds` | 4 | 8 |
| `src/game/balance/chapters.ts` | plot turn 2 wave `tank` `everySeconds` | 8 | 16 |
| `src/game/balance/chapters.ts` | plot turn 2 wave `ranged` `everySeconds` | 10 | 20 |
| `src/game/balance/lane.ts` | `enemies.boss.dropKb` | 60 | 30 |

The plot turn 2 default flood (every 2.5 s) is unchanged.

## Reason

- After change 1, competent earns 733.5 KB by the end of a win against a 365 KB shop. Most of
  it arrives after the flamethrower: from about 130 s to the win, the bot earns 375+ KB, about
  6 KB per second.
- These kinds don't add lane pressure. Halving them had no effect on critical share in any
  sweep, so this change takes KB out without making the run easier.
- These cuts all land after 145 s, so they don't move the saw time (81 s) or the flamethrower
  time (126.5 s). Cutting drops that land earlier pushed the flamethrower time past 140 s. For
  example, tank drop 8 and ranged drop 4 gave 141 s.

## Before

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

## After

| Policy | Win rate | Median win (s) | Median saw KB (s) | Median saw + flame KB (s) | Median KB earned at win | Boss arrived share | Critical share |
|---|---|---|---|---|---|---|---|
| idle | 0 | – | – | – | – | – | 0 |
| casual | 0.7 | 245.43 | 81 | 122 | 774 | 1 | 0.14 |
| competent | 0.82 | 196.47 | 81 | 126.5 | 612 | 1 | 0.7 |
| perfect | 1 | 177.23 | 80 | 133 | 531.5 | 1 | 0.1 |

| Target | Goal | Measured | Result |
|---|---|---|---|
| Winning run length | median win 170–200 s | 196.47 | pass |
| Saw affordable | median 75 KB time 80–95 s | 81 | pass |
| Flamethrower affordable | median 225 KB time 120–140 s | 126.5 | pass |
| Shop choice | median KB earned at win < 365 | 612 | warn |
| Critical in Plot turn 2 | share ≥ 0.5 | 0.7 | pass |
| Boss arrives | share of wins ≥ 0.5 | 1 | pass |
| Winnable | win rate 0.4–0.9 | 0.82 | pass |

`npm run sim:check` (20 seeds) agrees: 6 pass, shop choice warns (610).

## Shop choice cannot pass at the design prices

This target stays failing by decision (user, 24 Nov). The flamethrower target needs 225 KB
earned by 140 s, so income before then can't drop much. After 140 s the bot keeps earning from
kills, ad closes (+3 KB) and combos. The three upgrades cost only 140 KB together
(30 + 50 + 60). The steepest late cut tried had plot turn 2 rich kinds at a third, fewer pinch 2
tanks and ranged, a boss drop of 0 and slower clutter. It still ended at 511 KB earned against
365. Passing needs upgrade prices of about 3× the design: heavy head 90, high RPM 130 and big
tank 180 make a 625 KB shop. That also makes runs harder. With those prices, the closest
config (boss at 75%, 140 HP, speed 44) measured 645.5 KB earned, still over 625. The user chose
to keep the design prices.

## Design values that now differ (for task 5.2)

- `docs/game-design.md` sections 3, 5 and 9: the boss rises at **75%**, not 65%.
- Section 5 boss row: HP **150** (was 30), drop **30 KB** (was 60). Speed 38 still fits "very
  slow" (below the default zombie's 40).
- Section 3: plot turn 2 fast, tank and ranged spawn half as often (every 8 / 16 / 20 s).
- Section 6: "A typical run earns less than the whole shop costs" does not hold for the
  competent bot (612 vs 365 KB).
