# Implementation Plan: juice-and-endings

## Overview

Add the shared flash budget and audio engine changes first, then the pure juice state, the
Juice_View overlays and sounds, the lane additions, and the End_Transition. Depends on `lane-cctv`
(flash budget, OSD copy), `browser-front` (overlay host, Ad_Controls) and
`cross-front-and-director` (`chapterStarted`, boss time). Read `design.md` for every number. No
game rule changes.

## Tasks

- [x] 1. Shared foundations
  - [x] 1.1 Move the flash budget to `src/render/flashBudget.ts`
    - `requestFlash(tick)` returning `full` or `dim`, one budget per Session; lane-cctv calls it
      instead of its own list
    - _Requirements: 8.1_
  - [x] 1.2 Add the voice cap and limiter to `src/core/audio.ts`
    - Cap 24 sfx voices with a 20 ms fade on the oldest; `{ keep: true }` exempts loops and music;
      `DynamicsCompressorNode` after the master gain
    - _Requirements: 6.4, 6.5_
  - [ ]* 1.3 Test the foundations
    - Property 4: flash budget holds across both fronts — _Requirements: 8.1_
    - Property 5: voice cap drops the oldest — _Requirements: 6.4_
    - Limiter in the chain; the lane-cctv flash property still passes

- [x] 2. Juice state
  - [x] 2.1 Create `src/render/juice/juiceTuning.ts` and `src/render/juice/juiceState.ts`
    - `applyJuiceEvents`, `shakeOffset`, crack stages, corruption level, win fade start
    - _Requirements: 1.1, 1.2, 1.3, 2.1, 2.2, 2.4, 3.1, 3.2_
  - [ ]* 2.2 Write `tests/render/juice/juiceState.test.ts`
    - Property 1: shake stays within its limits — _Requirements: 1.1, 1.2, 1.3_
    - Property 2: cracks escalate and never heal — _Requirements: 2.1, 2.2, 2.4_
    - Property 3: corruption level follows chapter and integrity — _Requirements: 3.1, 3.2_
    - The three examples from the design

- [x] 3. Juice_View
  - [x] 3.1 Create `src/render/juice/crackArt.ts` and the overlay CSS
    - Three stage SVGs, each a superset of the last, clear of the Real_Link and the middle of the
      Lane_Dock; corruption from CSS gradients and blend modes with a ≤ 120 ms cover duty;
      `.is-still` with shake off; `pointer-events: none`
    - _Requirements: 2.3, 3.3, 8.2, 8.3_
  - [x] 3.2 Create `src/render/juice/juiceSounds.ts`
    - `glassCrack`, `modemAlarm` loop, `chapterSting`, `bossRumble`, `bossRoar`, `kindGroans`; Web
      Audio nodes only
    - _Requirements: 5.2, 5.3, 6.1, 6.2, 6.3, 6.6_
  - [x] 3.3 Create `src/render/juice/juiceView.ts` and register it
    - Shake transform on `.screen-content`; juice layer above the session overlay and below the
      Result_Screen; alarm with critical; one sting per chapter event; cleanup on unmount; add to
      `src/dialup/sessionRegistry.ts`
    - _Requirements: 1.1, 1.4, 2.1, 2.2, 3.1, 3.2, 3.3, 6.2, 6.3, 9.1_
  - [ ]* 3.4 Write `tests/render/juice/juiceView.test.ts`
    - The jsdom checks from the design
    - _Requirements: 1.3, 1.4, 2.3, 3.3, 6.2, 6.3, 8.2, 9.1_

- [x] 4. Lane additions
  - [x] 4.1 Update `src/render/laneEffects.ts`, `laneDrawList.ts` and `laneView.ts`
    - Hit flash for 4 Ticks, Kill_Pop for 18, "+N KB" for 30 under the camera grade; Boss_Rumble
      for 180 Ticks before the boss time; one roar per boss spawn; per-kind groans
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 5.1, 5.2, 5.3, 6.1_
  - [ ]* 4.2 Update `tests/render/laneView.test.ts` and `tests/render/laneDrawList.test.ts`
    - _Requirements: 4.1, 4.2, 4.3, 5.1, 5.3, 6.1_

- [x] 5. Checkpoint
  - Run `npm run typecheck` and `npm test`; ask the user if questions arise.

- [x] 6. End_Transition
  - [x] 6.1 Add `endFrame` to `SessionView` and the 30-tick hold to `src/scenes/desktop/desktopScene.ts`
    - Views stay mounted for 30 loop ticks after `onEnd`, then unmount and the Result_Screen
      opens; an `endFrame` error shows the result at once
    - _Requirements: 7.3_
  - [x] 6.2 Implement `endFrame` in the Lane_View and the Juice_View
    - Lost: noise and "NO SIGNAL" with the timestamp frozen; won: overlays fade out over 30 ticks
    - _Requirements: 7.1, 7.2_
  - [ ]* 6.3 Update the desktop tests and write `tests/render/juice/juiceRun.test.ts`
    - Existing desktop tests add 30 manual ticks before looking for the Result_Screen, with no
      other change; the result appears after 30 ticks with the same Final_State and no `step`
      in between
    - Property 6: effects never change the Run — _Requirements: 7.3, 9.2_

- [x] 7. Docs and playtest
  - [x] 7.1 Add a dated note to `docs/kiro-log.md`
    - _Requirements: 9.3_
  - [x] 7.2 Playtester full run
    - Invoke the `playtester` agent to play a full run, screenshot each crack stage, the
      corruption and the NO SIGNAL cut, and report the Plot turn 2 frame rate in
      `docs/playtests/YYYY-MM-DD-juice-and-endings.md`. Skip and say so if the dev server or
      Playwright MCP is unavailable
    - _Requirements: 8.4_

- [x] 8. Final checkpoint
  - Run `npm run typecheck`, `npm test` and `npm run build`. Manual check in `npm run dev`: hits
    shake the whole screen and clicks still land, cracks grow at 20, 10 and 5, ads stay clickable
    under the corruption, the boss rumbles then roars, and both endings have their beat before
    the result screen; ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional test tasks; 6.3 updates desktop tests that would otherwise
  fail, so it is needed before the final checkpoint.
- Never weaken a failing test; fix the code or stop and explain.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "2.1"] },
    { "id": 1, "tasks": ["1.3", "2.2", "3.1", "3.2", "4.1"] },
    { "id": 2, "tasks": ["3.3", "4.2"] },
    { "id": 3, "tasks": ["3.4", "5"] },
    { "id": 4, "tasks": ["6.1"] },
    { "id": 5, "tasks": ["6.2"] },
    { "id": 6, "tasks": ["6.3", "7.1"] },
    { "id": 7, "tasks": ["7.2"] },
    { "id": 8, "tasks": ["8"] }
  ]
}
```
