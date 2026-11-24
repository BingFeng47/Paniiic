# Implementation Plan: ad-pressure

## Overview

Share the system list, then add bandwidth and line quality to the download, hatching to the
director, the clutter-only cap and lane placement, and finally the views and hints. Read
`design.md` first, and `.kiro/steering/game-balance.md` before touching `src/game/balance/`.
Run `npm test` before starting; it should pass (1,266 tests on 23 Nov).

## Tasks

- [x] 1. Shared system list
  - [x] 1.1 Create `src/game/systems.ts` with `createGameSystems`
    - Same order as `src/dialup/sessionRegistry.ts` today; switch the registry and
      `tools/mcp-sim/src/runBot.ts` `buildSystems` to it
    - _Requirements: 1.1, 1.2, 1.3_
  - [x] 1.2 Write `tests/game/systems.test.ts`
    - Order matches; invalid overrides throw each resolver's error; `npm run sim:check` passes
    - _Requirements: 1.1, 1.3_
- [x] 2. Download rate
  - [x] 2.1 Add `lineQualityFloor` to `src/game/balance/core.ts` and `bandwidth?` to `GameState`
    - _Requirements: 3.1, 2.5, 9.2_
  - [x] 2.2 Create `src/game/downloadRate.ts` and use it in `step()` stage 6
    - _Requirements: 2.4, 2.5, 3.2, 3.3, 3.4_
  - [x] 2.3 Add the bandwidth keys to `src/game/balance/ads.ts`, create
    `src/game/ads/bandwidth.ts`, append `bandwidthSystem` in `createGameSystems`
    - _Requirements: 2.1, 2.2, 2.3_
  - [x] 2.4 Tests: `tests/game/downloadRate.test.ts`, balance validation, Properties 1–3
    - Update the core and ad balance default tests to the new keys
    - _Requirements: 2.1–2.5, 3.1–3.4_
- [x] 3. Hatching
  - [x] 3.1 Add `hatchSeconds` and `hatchWarningSeconds` to the ad balance; add `hatchKind` to
    every Chapter with validation and the defaults
    - _Requirements: 4.1, 4.2_
  - [x] 3.2 Create `src/game/ads/hatch.ts`; add `adHatched` and `SpawnSource` `adHatch`; hatch in
    `directorAds` after `fakeSpawns`, also during the calm
    - _Requirements: 4.3, 4.4, 4.5, 4.6, 4.7, 9.1_
  - [x] 3.3 Tests: `tests/game/ads/hatch.test.ts` and Property 4
    - _Requirements: 4.1–4.7_
- [x] 4. Cap and lane cover
  - [x] 4.1 Clutter-only cap in `openAd`
    - Update the browser-front cap tests and the director Last_Interrupter `pending` test to
      the new rule; note each one
    - _Requirements: 5.1, 5.2, 5.3_
  - [x] 4.2 Add `laneArea` with validation; place Lane_Cover clutter in it; add the Pinch 1
    Lane_Cover row
    - Test that `laneArea` equals the Lane_Dock rect from `src/desktop/layout.ts`
    - _Requirements: 6.1, 6.2, 6.3_
  - [x] 4.3 Tests: Properties 5–7 in `tests/game/ads/adPressureProperties.test.ts`
    - _Requirements: 5.1, 5.2, 6.2, 9.1, 9.2, 9.3_
- [x] 5. Checkpoint
  - Run `npm run typecheck` and `npm test`; ask the user if questions arise.
- [x] 6. Views
  - [x] 6.1 Download_Panel rate from `downloadRate` and the cause line; copy in `browserCopy.ts`
    - Load `.kiro/steering/retro-copy.md` for the copy
    - _Requirements: 7.1, 7.4_
  - [x] 6.2 Hatch warning in the Ad_Layer (`is-hatching`, crack, hand, 2 Hz shake) and the
    `hatch` sound
    - _Requirements: 7.2, 7.3, 7.4_
  - [x] 6.3 Lane_View: no hammer, no saw, no pickups through a Lane_Cover Ad
    - _Requirements: 6.4_
  - [x] 6.4 Hints: new clutter copy, `hatch` Hint row and copy
    - Update the Hint_Table tests to include `hatch`
    - _Requirements: 8.1, 8.2_
  - [x] 6.5 Render tests for 6.1–6.3
    - _Requirements: 6.4, 7.1, 7.2_
- [x] 7. Docs and playtest
  - [x] 7.1 Check `docs/game-design.md` sections 4, 7, 8 against the defaults; update the `add-ad`
    skill; add a dated note to `docs/kiro-log.md`
    - _Requirements: 10.1, 10.2, 10.3_
  - [x] 7.2 Run the `playtester` agent for a smoke run: the bar slows with open clutter, an ad
    hatches after 10 s with a warning, a lane-cover ad blocks the hammer, interrupters still open
    with 8 clutter ads up
    - _Requirements: 10.4_
- [x] 8. Final checkpoint
  - Run `npm run typecheck`, `npm test`, `npm run build` and `npm run sim:check`; ask the user if
    questions arise.

## Notes

- Balance numbers here are starting values. `pacing-and-economy` tunes them with the sim.
- Never weaken a failing test; update it to the new rule only where this spec changes the rule,
  and say so in the task notes.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "2.1", "3.1", "4.1"] },
    { "id": 2, "tasks": ["2.2", "3.2", "4.2"] },
    { "id": 3, "tasks": ["2.3", "3.3"] },
    { "id": 4, "tasks": ["2.4", "4.3"] },
    { "id": 5, "tasks": ["5"] },
    { "id": 6, "tasks": ["6.1", "6.2", "6.3", "6.4"] },
    { "id": 7, "tasks": ["6.5", "7.1"] },
    { "id": 8, "tasks": ["7.2"] },
    { "id": 9, "tasks": ["8"] }
  ]
}
```
