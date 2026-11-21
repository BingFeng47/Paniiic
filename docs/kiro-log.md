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

## Task log

