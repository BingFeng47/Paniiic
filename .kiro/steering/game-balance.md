---
inclusion: fileMatch
fileMatchPattern: ["src/game/balance/**", "src/game/director/**"]
---

# Game balance

The run should feel like the chapter beats in #[[file:docs/game-design.md]]: tense, unfair-feeling
at the peak, but winnable.

- All tuning values live in `src/game/balance/`. Logic reads them; it never hard-codes numbers.
- Keep the chapter timeline as data (start times, which mobs and ads are unlocked, spawn rates).
- Target numbers to protect when tuning:
  - Total run from dial-up start to the result: about 150 seconds for a player who wins.
  - A competent player can afford the **saw by ~1:10** (tank intro) and the
    **flamethrower by ~1:30** (pinch 2).
  - Modem integrity should be "critical" (≤ 20%) for most players during plot turn 2.
- When changing balance, state the old value, the new value and the reason, and run the headless
  simulation (once the zombie-sim tool exists) to report win rates before and after.
