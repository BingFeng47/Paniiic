# 2026-11-25 Weapon roles

Feedback (25 Nov): switching between weapons should be easy; the flamethrower should be good on
crowds but weak on the boss; the hammer should hit harder; the saw should be the steady one.

Code changes that come with this tuning: an `equipWeapon` command (keys 1–3), and the zombie-sim
bots now equip directly and use the hammer (with the heavy head) or the saw on the boss, never
the flamethrower.

## Changes

| File | Key | Old | New | Reason |
|---|---|---|---|---|
| `src/game/balance/economy.ts` | `bossFlameFactor` | – (1) | 0.25 | Flamer is a crowd weapon; the boss takes a quarter of flame and burn damage. |
| `src/game/balance/lane.ts` | `hammer.damage` | 1 | 2 | The hammer hits hardest per click. |
| `src/game/balance/lane.ts` | `hammer.cooldownSeconds` | 0.3 | 0.45 | Keeps hammer damage per second (4.4) below the saw's, so the saw stays the steady choice. |
| `src/game/balance/economy.ts` | `heavyHeadDamage` | 2 | 3 | Upgraded hammer: 6.7 per second, the best boss weapon before High RPM. |
| `src/game/balance/economy.ts` | `sawDps` | 5 | 5.25 | Saw just above the plain hammer; High RPM gives 7.9. |
| `src/game/balance/lane.ts` | `enemies.default.hp` | 2 | 3 | With 2 damage the hammer would one-shot defaults; 3 keeps two clicks. |
| `src/game/balance/lane.ts` | `enemies.tank.hp` | 4 | 6 | Keeps the tank a three-click or about one-second-of-saw mob. |
| `src/game/balance/lane.ts` | `enemies.ranged.hp` | 3 | 4 | Two hammer clicks, as before the change. |

## Before and after

`balanceReport` from `tools/mcp-sim/src/report.ts`, run from a throwaway Vitest harness, 50 seeds, competent and casual, all with
the new bot weapon choice. "Before" is the old numbers with the boss fire factor off.

| Set | Competent win rate | Median win (s) | Saw (s) | Flamer (s) | Critical in PT2 | Boss arrives | Casual win rate |
|---|---|---|---|---|---|---|---|
| Before | 0.82 | 196.5 | 81 | 126.5 | 0.70 | 1.0 | 0.50 |
| Rejected B (hammer 2/0.4 s, heavy 3, saw 6) | 0.97 | 188.0 | 81 | 129 | 0.10 | 0.86 | 0.60 |
| Rejected G (hammer 2/0.45 s, heavy 3, saw 5) | 0.54 | 202.7 | 81 | 129 | 0.88 | 1.0 | 0.42 |
| **Chosen H** (hammer 2/0.45 s, heavy 3, saw 5.25) | **0.78** | **199.8** | **81** | **129** | **0.72** | **1.0** | **0.38** |

`npm run sim:check` with the defaults (20 seeds): win rate 0.80, median win 200.8 s (just over
the 200 s target; 199.8 s at 50 seeds), every other target passes except "Shop choice", which
already failed before this change (`2026-11-24-late-income.md`).

## Decision

Accepted H. It gives each weapon a clear job without making the run easier for the competent
bot (0.82 → 0.78) and keeps the modem critical in plot turn 2 for most runs.

## Follow-up, same day: tougher default and fast zombies, weaker flamer

Feedback: a default zombie should take 3 hammer hits and a fast zombie 2, and the flamethrower
should do less damage.

| File | Key | Old | New | Reason |
|---|---|---|---|---|
| `src/game/balance/lane.ts` | `enemies.default.hp` | 3 | 5 | 3 hits of 2 (2 with the heavy head). |
| `src/game/balance/lane.ts` | `enemies.fast.hp` | 1 | 3 | 2 hits of 2 (1 with the heavy head). |
| `src/game/balance/economy.ts` | `flameDps` | 4 | 3 | Requested. |
| `src/game/balance/lane.ts` | `hammer.cooldownSeconds` | 0.45 | 0.38 | Compensation, see below. |
| `src/game/balance/economy.ts` | `sawDps` | 5.25 | 6.25 | Compensation, see below. |

The HP rise alone collapsed the game: competent bot win rate 0.13 and median win 227.6 s over 30
seeds (casual 0.00). The flamer cut alone barely mattered (0.77). Faster hammer and saw bring it
back while every mob still takes the requested number of hits. 50 seeds:

| Set | Competent win | Median win (s) | Critical in PT2 | Casual win |
|---|---|---|---|---|
| Requested only (HP 5 / 3, flamer 3) | 0.13 | 227.6 | 1.00 | 0.00 |
| + hammer 0.38 s, saw 6.0 | 0.56 | 208.9 | 0.72 | 0.36 |
| **+ hammer 0.38 s, saw 6.25 (chosen)** | **0.78** | **205.8** | **0.60** | **0.44** |
| + hammer 0.40 s, saw 6.5 | 0.86 | 199.9 | 0.30 | 0.40 |

`npm run sim:check` (20 seeds): win 0.70, median win 207.1 s. "Winning run length" (170–200 s)
and "Shop choice" warn; the rest pass.

`tests/game/economy/economyTarget.test.ts` assumed a lone default zombie dies within 0.5 s.
That is no longer possible with 3 hits; the window is now derived from HP, damage and the
cooldown (about 1 s). The target itself, 60 KB by 70 s, still passes on all three seeds.

## Follow-up 2: saw a little stronger

Feedback: improve the saw's damage by a little. `sawDps` 6.25 → 7 (+12%; 10.5 with High RPM).
Same harness, 50 seeds:

| Saw dps | Competent win | Median win (s) | Critical in PT2 | Boss arrives | Casual win |
|---|---|---|---|---|---|
| 6.25 (before) | 0.78 | 205.8 | 0.60 | 1.00 | 0.44 |
| 6.5 | 0.84 | 199.4 | 0.28 | 0.86 | 0.50 |
| **7 (applied)** | **0.92** | **191.5** | **0.10** | **0.43** | **0.48** |

Applied as asked. At 7 the run is easier for skilled players: the modem rarely goes critical in
plot turn 2 and the boss reaches the modem in fewer than half of the wins, so the "Critical in
Plot turn 2" target warns. 6.5 is the middle option.
