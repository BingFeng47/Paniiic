# Implementation Plan: pacing-and-economy

## Overview

Change the data, add the Boss_Trigger and combos, teach the bots to move a cursor, update the
report targets, then tune. Requires `ad-pressure` to be done (it adds `createGameSystems`,
`hatchKind` and the Pinch 1 Lane_Cover row). Read `design.md` and
`.kiro/steering/game-balance.md` before touching `src/game/balance/`.

## Tasks

- [x] 1. Run length and timeline
  - [x] 1.1 Set `downloadPercentPerSecond` to 100 / 135 and the new Chapter starts, waves and ad
    rows in `src/game/balance/chapters.ts`
    - Update `tests/game/step.test.ts`, the chapter default tests and the director timeline
      tests to the new values; list each change
    - _Requirements: 1.1, 1.2, 2.1, 2.2, 2.3, 9.1_
  - [x] 1.2 Boss_Trigger: `bossAtPercent`, `bossLatestSecond`, validation, `directorLane`; boss
    speed 32
    - _Requirements: 3.1, 3.2, 3.3, 3.4_
  - [x] 1.3 Tests: boss examples and Property 1 in `tests/game/director/bossTrigger.test.ts`
    - _Requirements: 3.1–3.4, 9.1_
- [x] 2. Economy
  - [x] 2.1 New drops, prices, packet life and `rewardKb`
    - Update the lane, economy and ad balance default tests and the economy examples; list each
      change
    - _Requirements: 4.1, 4.2, 4.3, 4.4_
  - [x] 2.2 Combo in `walletSystem`, the balance keys, the `combo` event and `KbReason`
    - _Requirements: 5.1, 5.2, 5.3, 5.4_
  - [x] 2.3 Tests: combo examples and Properties 2–3 in `tests/game/economy/combo.test.ts`
    - _Requirements: 5.1–5.4_
  - [x] 2.4 Combo view and sound
    - Copy in `src/ui/laneCopy.ts` following `.kiro/steering/retro-copy.md`
    - _Requirements: 5.5_
- [x] 3. Checkpoint
  - Run `npm run typecheck` and `npm test`; ask the user if questions arise.
- [x] 4. Bots and report
  - [x] 4.1 Bot_Cursor in `tools/mcp-sim/src/policies.ts` with `cursorPxPerSecond`
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_
  - [x] 4.2 New targets and metrics in `tools/mcp-sim/src/report.ts`, `schemas.ts`, the
    `balance-tuner` agent file and `.kiro/steering/game-balance.md`
    - _Requirements: 7.1, 7.2_
  - [x] 4.3 Tests: Property 4 and the report targets in `tests/tools/`
    - _Requirements: 6.3, 7.1, 7.2_
  - [x] 4.4 Run `npm run sim:check` and a 50-seed `balance_report`; save it as the baseline
    - _Requirements: 8.2_
- [ ] 5. Tuning pass
  - [x] 5.1 Run the `balance-tuner` agent against the Requirement 7 targets
    - One `docs/balance/` file per accepted change, with before-and-after tables
    - _Requirements: 8.1, 8.2_
  - [-] 5.2 Update `docs/game-design.md` to every tuned value that differs
    - _Requirements: 8.3_
- [ ] 6. Docs and playtest
  - [-] 6.1 Dated note in `docs/kiro-log.md`; demo-video note in `docs/submission-checklist.md`
    - _Requirements: 9.3_
  - [~] 6.2 Run the `playtester` agent for one full run: quiet first minute, ramp, saw around
    1:20–1:35, boss reaching the modem before the end, combos showing
    - _Requirements: 9.4_
- [~] 7. Final checkpoint
  - Run `npm run typecheck`, `npm test`, `npm run build` and `npm run sim:check`; ask the user if
    questions arise.

## Notes

- Never weaken a failing test; update it only where this spec changes the value, and say so.
- The determinism property (Property 5) is covered by the existing director and economy
  determinism properties once they run with the new defaults; check they still pass.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1"] },
    { "id": 1, "tasks": ["1.2", "2.2"] },
    { "id": 2, "tasks": ["1.3", "2.3", "2.4"] },
    { "id": 3, "tasks": ["3"] },
    { "id": 4, "tasks": ["4.1", "4.2"] },
    { "id": 5, "tasks": ["4.3"] },
    { "id": 6, "tasks": ["4.4"] },
    { "id": 7, "tasks": ["5.1"] },
    { "id": 8, "tasks": ["5.2", "6.1"] },
    { "id": 9, "tasks": ["6.2"] },
    { "id": 10, "tasks": ["7"] }
  ]
}
```
