# Implementation Plan: lane-cctv

## Overview

Add a render-only camera layer to the Lane_View: pure camera state and timestamp first, then
noise tiles and canvas drawing, then the DOM OSD, HUD restyle and sounds, then the Lane_View
wiring and a playtest. Read `design.md` for every number, and `.kiro/steering/sprites.md` and
`.kiro/steering/retro-copy.md` before touching `src/render/` or copy. Nothing in `src/game/`
changes.

## Tasks

- [x] 1. Pure camera logic
  - [x] 1.1 Create `src/render/cctv/cctvTuning.ts`
    - `CCTV_TUNING` with every value from the design; add the `--c-cctv-*` tokens to
      `src/styles/theme.css`
    - _Requirements: 10.3_
  - [x] 1.2 Create `src/render/cctv/cctvTimestamp.ts`
    - `cameraTimestamp(tick)` with the 11-23-98 23:59:00 base, 12-hour clock and date rollover
    - _Requirements: 2.3_
  - [x] 1.3 Create `src/render/cctv/cctvState.ts`
    - `CctvState`, `EMPTY_CCTV`, `applyCctvEvents`, `startupActive`, `tearActive`,
      `dropoutActive`, `grainFrame`, `recOn`, `hash32`; flash budget as in the design
    - _Requirements: 1.2, 2.2, 3.1, 4.1, 4.3, 5.1, 5.2, 5.4, 6.1, 6.2, 8.1_
  - [x] 1.4 Write `tests/render/cctv/cctvTimestamp.test.ts` and `tests/render/cctv/cctvState.test.ts`
    - Property 1: timestamp counts from 11:59:00 PM — _Requirements: 2.3_
    - Property 2: at most 3 flashes per second — _Requirements: 8.1, 8.3_
    - Property 3: dropouts are short, spaced and only at critical — _Requirements: 5.1, 5.2, 5.4_
    - Property 4: tears follow modem hits — _Requirements: 4.1, 4.3_
    - Property 5: motion boxes live 60 ticks and follow their Mob — _Requirements: 6.1, 6.2_
    - Property 6: grain moves at least 15 times per second — _Requirements: 1.2_
    - Examples: tick 420, tick 3,600, startup length, REC blink

- [x] 2. Canvas drawing
  - [x] 2.1 Create `src/render/cctv/noiseTiles.ts`
    - At most 4 offscreen noise canvases from a fixed-seed mulberry32; a cached scanline and
      vignette canvas
    - _Requirements: 1.2, 1.3_
  - [x] 2.2 Create `src/render/cctv/cctvDraw.ts`
    - `drawGrade` (`color` then `multiply` blend), `drawOverlay`, `drawTear`, `drawDropout`,
      `drawStartup`, `drawMotionBoxes`; no per-pixel work, no change to the lane transform
    - _Requirements: 1.1, 1.2, 1.3, 1.5, 4.2, 5.1, 6.1, 6.3, 7.1, 7.2_

- [x] 3. OSD, HUD and sounds
  - [x] 3.1 Create `src/render/cctv/cctvOsd.ts` and add `cctv` copy to `src/ui/laneCopy.ts`
    - Label, REC, timestamp and status spans; text through `textContent` only when it changes;
      `.is-tearing` only with Screen_Shake on; HUD label becomes `MODEM`
    - _Requirements: 2.1, 2.2, 2.3, 2.6, 3.1, 5.1, 8.2_
  - [x] 3.2 Restyle the OSD and Lane_HUD in `src/styles/lane.css`
    - VT323, outlined text, segmented meter, critical meter style; `pointer-events: none` on the
      OSD; colours only from theme tokens
    - _Requirements: 2.4, 2.5, 7.3_
  - [x] 3.3 Create `src/render/cctv/cctvSounds.ts`
    - `cameraHum` and `cameraStatic` with Web Audio nodes only, levels from the tuning table
    - _Requirements: 9.1, 9.3_

- [x] 4. Lane_View wiring
  - [x] 4.1 Wire the camera layer into `src/render/laneView.ts`
    - Mount: tiles, cache, OSD, hum, startup static. Update: `applyCctvEvents`, OSD, static per
      `modemHit` frame, draw order from the design with the cursor last. Null context keeps the
      OSD and HUD. Unmount: stop voices, drop tiles, remove the OSD
    - _Requirements: 1.1, 1.4, 2.1, 3.1, 3.2, 3.3, 4.1, 5.3, 6.1, 7.1, 7.2, 9.1, 9.2, 10.1, 10.2_
  - [x] 4.2 Update `tests/render/laneView.test.ts` and the Lane_HUD tests
    - The Lane_View checks listed in the design's testing strategy; the HUD label change is the
      only changed assertion
    - _Requirements: 1.3, 1.4, 2.1, 2.4, 2.6, 3.2, 5.3, 7.1, 7.3, 8.2, 9.2, 10.1, 10.2_
  - [x] 4.3 Write `tests/render/cctv/cctvRun.test.ts`
    - Property 7: camera state is deterministic and independent of the Run
    - _Requirements: 5.4, 7.4_

- [x] 5. Checkpoint
  - Run `npm run typecheck` and `npm test`; ask the user if questions arise.

- [x] 6. Docs and playtest
  - [x] 6.1 Add a dated note to `docs/kiro-log.md`
    - One line under "Notes": the camera layer, its property count and the flash budget
    - _Requirements: 10.3_
  - [x] 6.2 Playtester smoke run
    - Invoke the `playtester` agent to dial up, screenshot the startup, a tear after a modem hit,
      a motion box and, by letting integrity fall, a dropout; check that clicks still land and
      write `docs/playtests/YYYY-MM-DD-lane-cctv-smoke.md`. Skip and say so if the dev server
      or Playwright MCP is unavailable
    - _Requirements: 1.1, 1.5, 2.1, 4.1, 5.1, 6.1, 7.1_

- [x] 7. Final checkpoint
  - Run `npm run typecheck`, `npm test` and `npm run build`. Manual check in `npm run dev`: the
    feed reads as a camera, placeholders and frame numbers are readable, the timestamp passes
    midnight about a minute in, and no effect feels like a strobe; ask the user if questions
    arise.

## Notes

- Tasks marked with `*` are optional test tasks; 4.2 updates the HUD label assertion, so it is
  needed before checkpoint 5 passes.
- Never weaken a failing test; fix the code or stop and explain.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["1.3", "2.1", "3.3"] },
    { "id": 2, "tasks": ["1.4", "2.2", "3.1", "3.2"] },
    { "id": 3, "tasks": ["4.1"] },
    { "id": 4, "tasks": ["4.2", "4.3"] },
    { "id": 5, "tasks": ["5"] },
    { "id": 6, "tasks": ["6.1", "6.2"] },
    { "id": 7, "tasks": ["7"] }
  ]
}
```
