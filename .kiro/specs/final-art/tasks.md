# Implementation Plan: final-art

## Overview

Add the Animation_Table, the shared sprite validator, the atlas fallback and the generated
Art_List, then update the art-integrator agent and run the art checks once the team's frames
land. Read `design.md` and `.kiro/steering/sprites.md` first. Never write to `assets/sprites/`.

## Tasks

- [x] 1. Animation_Table
  - [x] 1.1 Create `src/render/sprites/animationTable.ts`
    - Every entity and animation the renderer uses, fps defaults equal to today's
      `ANIMATION_FPS`, `loop`, `suggestedFrames`, walk `stride` with fps derived from the lane
      speed; `frameIndex` and `animationTicks` read the spec
    - _Requirements: 1.1, 1.2, 4.1_
  - [ ]* 1.2 Write `tests/render/sprites/animationTable.test.ts`
    - Property 4: walks don't slide — _Requirements: 4.1_
    - Existing frame-selection tests pass unchanged

- [x] 2. Validator
  - [x] 2.1 Create `src/render/sprites/validate.ts`
    - Every rule in the design table, text checks only, Node-safe
    - _Requirements: 3.2, 3.3_
  - [ ]* 2.2 Write `tests/render/sprites/validate.test.ts`
    - Property 1: the validator finds every broken rule — _Requirements: 3.2, 3.3_
  - [x] 2.3 Write `tests/render/sprites/assets.test.ts`
    - Validator over the real folder, budget check, passes when empty
    - _Requirements: 3.2, 3.3_

- [x] 3. Atlas fallback
  - [x] 3.1 Update `src/render/sprites/atlas.ts`
    - A failed team frame switches its whole animation to placeholders with one warning
    - _Requirements: 2.1, 2.2, 2.3_
  - [ ]* 3.2 Write the atlas fallback test
    - Property 3: animations are all team or all placeholder — _Requirements: 2.1, 2.2, 2.3_

- [x] 4. Art_List
  - [x] 4.1 Create `src/render/sprites/artList.ts` with the pure `renderArtList` and the `art:list` npm script
    - `art:list` runs the Art_List test with `ART_LIST_WRITE=1` to write `docs/art-list.md`; no new
      dependency
    - _Requirements: 1.1, 1.2, 1.3_
  - [ ]* 4.2 Write `tests/docs/artList.test.ts`
    - Property 2: the Art_List matches the tables and files — _Requirements: 1.1, 1.2, 1.3_
    - Stale-file check — _Requirements: 1.4_

- [x] 5. Checkpoint
  - Run `npm run typecheck`, `npm test` and `npm run art:list`; commit the generated list; ask the
    user if questions arise.

- [x] 6. Agent, legal and docs
  - [x] 6.1 Update `.kiro/agents/art-integrator.md`
    - The check-then-wire workflow, report path, write scope without `assets/sprites/`
    - _Requirements: 2.4, 3.1, 4.1_
  - [x] 6.2 Add the README "Art" credit and a dated note in `docs/kiro-log.md`
    - _Requirements: 5.2, 5.3_

- [ ] 7. Art drop (after the team adds frames)
  - [~] 7.1 Run the `art-integrator` agent
    - Validate, report problems in `docs/playtests/`, regenerate the Art_List, tune strides and
      fps, record each change
    - _Requirements: 3.1, 4.1_
  - [~] 7.2 Run the `playtester` agent
    - Full run with the final art; screenshots of every Mob under the CCTV grade for the
      silhouette check; note any logo-like shapes; report in `docs/playtests/`
    - _Requirements: 4.2, 4.3, 5.1_

- [~] 8. Final checkpoint
  - Run `npm run typecheck`, `npm test`, `npm run art:list` and `npm run build`. Manual check in
    `npm run dev`: every drawn entity uses team art or a clean placeholder, walks don't slide, and
    the build stays within the art budget; ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional test tasks; 2.3 is the gate that keeps broken art out of the
  demo, so keep it.
- Group 7 waits on the team's frames; everything before it works with an empty `assets/sprites/`.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1"] },
    { "id": 1, "tasks": ["1.2", "2.2", "2.3", "3.1"] },
    { "id": 2, "tasks": ["3.2", "4.1"] },
    { "id": 3, "tasks": ["4.2"] },
    { "id": 4, "tasks": ["5"] },
    { "id": 5, "tasks": ["6.1", "6.2"] },
    { "id": 6, "tasks": ["7.1"] },
    { "id": 7, "tasks": ["7.2"] },
    { "id": 8, "tasks": ["8"] }
  ]
}
```
