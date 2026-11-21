---
inclusion: fileMatch
fileMatchPattern: ["tests/**/*.ts", "src/game/**/*.ts"]
---

# Testing

- Vitest, run with `npm test`. Tests live in `tests/`, mirroring `src/`.
- Simulation code in `src/game/` must have tests. Rendering code needs tests only for logic that
  can break silently (layout maths, sprite frame selection, input mapping).
- Use **fast-check property tests** for simulation invariants. Name each property after the
  requirement it checks, for example `// Property: Req 2.3 integrity never goes below 0`.
  Good candidates:
  - determinism: same seed and inputs give identical states
  - bounds: integrity stays in [0, max], download progress stays in [0, 100]
  - monotonic rules: the download never moves while paused by an interrupter
  - conservation: currency spent never exceeds currency earned
- Build simulation states through small factory helpers in `tests/helpers/` rather than large
  inline literals.
- Never weaken or delete a failing test to make a task pass. Fix the code, or stop and explain
  why the requirement itself looks wrong.
