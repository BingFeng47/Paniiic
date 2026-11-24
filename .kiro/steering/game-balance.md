---
inclusion: fileMatch
fileMatchPattern: ["src/game/balance/**", "src/game/director/**"]
---

# Game balance

The run should feel like the chapter beats in #[[file:docs/game-design.md]]: tense, unfair-feeling
at the peak, but winnable.

- All tuning values live in `src/game/balance/`. Logic reads them; it never hard-codes numbers.
- Keep the chapter timeline as data (start times, which mobs and ads are unlocked, spawn rates).
- Target numbers to protect when tuning. This table is the source of truth for the
  Balance_Targets; `balance_report` (`tools/mcp-sim/src/report.ts`) checks them on the
  `competent` policy, and the KB thresholds come from the economy prices in use, so a price
  override moves them:

  | Target | Goal | Report metric |
  |---|---|---|
  | Winning run length | median win 170–200 s | `medianWinSeconds` |
  | Saw affordable | median time KB earned ≥ saw price: 80–95 s | `medianSawKbSeconds` |
  | Flamethrower affordable | median time KB earned ≥ saw + flamethrower price: 120–140 s | `medianFlameKbSeconds` |
  | Shop choice | median KB earned by the end of a win < the sum of all weapon and upgrade prices | `medianEarnedAtWin` vs `shopKb` |
  | Critical in Plot turn 2 | share ≥ 0.5 | `criticalShare` |
  | Boss arrives | share of wins where the boss reached the modem ≥ 0.5 | `bossArrivedShare` |
  | Winnable | win rate 0.4–0.9 | `winRate` |

  "KB earned" is wallet plus KB spent. The weapon and upgrade prices are hammer heavy head,
  saw, high RPM, flamethrower and big tank; the one-use pop-up blocker and surge protector are
  not counted. In play terms: the start is quiet and the spawn rate ramps up chapter by chapter,
  the saw is affordable around the tank intro and the flamethrower around pinch 2, modem
  integrity goes critical (≤ 20%) for most players during plot turn 2, and the boss reaches the
  modem before a typical winning run ends.
- When changing balance, state the old value, the new value and the reason, and run
  `balance_report` from the zombie-sim MCP server to report the targets before and after.
