# Implementation Plan: cross-front-and-director

## Overview

Build the chapter table, the director state and its two systems, wire them into the lane Spawner
and ad scheduler slots, and pin the timeline with headless tests. Depends on `lane-melee` and
`browser-front` being built (it uses `openAd`, `eventsSoFar` and the scheduler slot). Read
`design.md` for the table and the per-Tick order, and `.kiro/steering/game-balance.md` before
touching `src/game/balance/`.

## Tasks

- [x] 1. Chapter table
  - [x] 1.1 Create `src/game/balance/chapters.ts`
    - `ChapterId`, `ChapterWave`, `Chapter`, `ChapterTable`, the default table from the design,
      `resolveChapterTable`, `ChapterTableError`
    - _Requirements: 1.1, 1.4, 1.5, 2.3, 3.3, 4.4_
  - [ ]* 1.2 Write `tests/game/balance/chapters.test.ts`
    - Defaults match design section 3; one example per validation rule; all problems listed
    - _Requirements: 1.1, 1.5, 9.1_

- [x] 2. Director state and systems
  - [x] 2.1 Create `src/game/director/directorTypes.ts` and extend the game types
    - `DirectorState`, `DirectorEventBody`, `currentChapter`; `GameState.director?`;
      `SpawnSource` gains `fakeButton`
    - _Requirements: 1.3, 6.2, 7.3_
  - [x] 2.2 Create `src/game/director/directorLane.ts`
    - Ensure state, chapter advance, calm start from `halfwayReached`, Boss_Rise, current waves
      unless calm
    - _Requirements: 1.2, 2.1, 2.2, 2.4, 2.5, 4.1, 4.2, 7.1_
  - [x] 2.3 Create `src/game/director/directorAds.ts`
    - Fake_Spawns, calm end and cluster, forced first clutter, current ad rows and bursts unless
      calm, Last_Interrupter with the pending state; all through `openAd`
    - _Requirements: 3.1, 3.2, 3.4, 3.5, 4.3, 5.1, 5.2, 5.3, 6.1, 6.3, 7.1_
  - [x] 2.4 Create `src/game/director/index.ts` with `createDirector`
    - _Requirements: 2.1, 3.1_
  - [ ]* 2.5 Write example tests in `tests/game/director/`
    - The examples in the design's testing strategy
    - _Requirements: 1.2, 2.4, 3.4, 4.1, 4.2, 4.3, 5.1, 5.3, 6.1, 8.3_
  - [ ]* 2.6 Write `tests/game/director/directorProperties.test.ts`
    - Property 1: director runs are deterministic and plain data — _Requirements: 7.1, 7.2, 7.3_
    - Property 2: chapters advance on the clock, in order — _Requirements: 1.2, 1.3_
    - Property 3: spawns and Ads come only from the current Chapter — _Requirements: 2.2, 3.2, 3.3_
    - Property 4: the calm is quiet, then the cluster lands — _Requirements: 4.1, 4.2, 4.3, 4.4_
    - Property 5: every fake click spawns one fast zombie — _Requirements: 6.1, 6.2, 6.3_
    - Property 6: boss and last interrupter happen at most once — _Requirements: 2.4, 5.1, 5.2, 5.3_

- [x] 3. Wiring
  - [x] 3.1 Use the director in `src/dialup/sessionRegistry.ts`
    - `createLaneSystems({ spawner: d.laneSpawner })` and `createAdSystems({ scheduler:
      d.adScheduler })`; keep the placeholder schedules for tests that ask for them
    - _Requirements: 2.1, 3.1_
  - [ ]* 3.2 Write `tests/helpers/bots.ts` and `tests/game/director/timeline.test.ts`
    - Idle run: first default at Tick 480, `lost` before 120 s; killer bot: chapters 1–6 start on
      time
    - _Requirements: 8.1, 8.2_

- [x] 4. Checkpoint
  - Run `npm run typecheck` and `npm test`; ask the user if questions arise.

- [x] 5. Docs
  - [x] 5.1 Check `docs/game-design.md` section 3 against the default table and fix any mismatch
    in the doc, recording the change
    - _Requirements: 9.1_
  - [x] 5.2 Add a dated note to `docs/kiro-log.md`
    - _Requirements: 9.2_

- [x] 6. Final checkpoint
  - Run `npm run typecheck`, `npm test` and `npm run build`. Manual check in `npm run dev`: fast
    zombies arrive around 0:45, a fake click spawns one at once, the 2 s calm and the 4-ad
    cluster happen at halfway, the boss rises near 1:58; ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional test tasks; 3.2 pins the timeline the demo video relies on.
- Never weaken a failing test; fix the code or stop and explain.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1"] },
    { "id": 1, "tasks": ["1.2", "2.2", "2.3"] },
    { "id": 2, "tasks": ["2.4"] },
    { "id": 3, "tasks": ["2.5", "2.6", "3.1"] },
    { "id": 4, "tasks": ["3.2"] },
    { "id": 5, "tasks": ["4"] },
    { "id": 6, "tasks": ["5.1", "5.2"] },
    { "id": 7, "tasks": ["6"] }
  ]
}
```
