# Implementation Plan: player-guide

## Overview

Add the hints setting, the Mission_Note, then the pure hint logic and the Hint_View. Read
`design.md` for the hint table and placement rules, and `.kiro/steering/retro-copy.md` before
writing copy. The guide only reads state; it never sends commands.

## Tasks

- [x] 1. Setting
  - [x] 1.1 Add `hintsEnabled` to `src/core/settings.ts`, `ViewPrefs` and the Options_Dialog
    - Default true, missing field falls back to true, "Show hints" checkbox after Screen shake,
      passed to views in `src/scenes/index.ts`
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.6_
  - [x] 1.2 Test the setting
    - Property 4: settings round trip with hints — _Requirements: 4.1, 4.4, 4.5_
    - Options checkbox toggles and saves — _Requirements: 4.2, 4.3_

- [x] 2. Mission_Note and README
  - [x] 2.1 Create `src/ui/guideCopy.ts` and `src/desktop/missionNote.ts`; mount in the Desktop_Scene
    - Top-right of the wallpaper, below windows, `pointer-events: none`; README lines updated in
      `src/desktop/copy.ts`; note styles in `src/styles/desktop.css`
    - _Requirements: 1.1, 1.2, 1.3, 1.4_
  - [x] 2.2 Test the note and README in `tests/scenes/desktop/desktopScene.test.ts`
    - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [x] 3. Hint logic
  - [x] 3.1 Create `src/ui/hints/hintTable.ts`, `hintTriggers.ts`, `hintQueue.ts` and `hintPlacement.ts`
    - Table, defensive triggers, queue with a 360-Tick timeout and a 2-item limit, placement
      that avoids the Real_Link and the Lane_Dock
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 3.1_
  - [x] 3.2 Write `tests/ui/hints/*.test.ts`
    - Property 1: each Hint shows at most once per Run — _Requirements: 2.2, 2.3_
    - Property 2: queue limit and timeout — _Requirements: 2.4, 2.5_
    - Property 3: balloons stay in the Desktop_Area and off the link — _Requirements: 3.1_

- [x] 4. Hint_View
  - [x] 4.1 Create `src/ui/hints/hintView.ts`, the `balloonPop` sound and balloon CSS; register the view
    - Layer in `overlayHost` above ads and below the Result_Screen; ✕ dismiss; `textContent`
      only; no commands; cleanup on unmount; add to `src/dialup/sessionRegistry.ts`
    - _Requirements: 2.2, 2.5, 2.6, 3.2, 3.3, 3.4, 3.5, 3.6_
  - [x] 4.2 Write `tests/ui/hints/hintView.test.ts`
    - The jsdom checks from the design
    - Property 5: the guide never changes the Run — _Requirements: 3.4_

- [x] 5. Docs
  - [x] 5.1 Check `docs/game-design.md` section 11 against the table and copy; add a dated note to `docs/kiro-log.md`
    - _Requirements: 5.1, 5.2_

- [x] 6. Final checkpoint
  - Run `npm run typecheck`, `npm test` and `npm run build`. Manual check in `npm run dev`: the
    note is on the desktop, each hint pops once per run without covering the lane or the link,
    and "Show hints" off silences them; ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional test tasks.
- Triggers for ads, packets and the shop only fire once those specs are built.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1", "3.1"] },
    { "id": 1, "tasks": ["1.2", "2.2", "3.2", "4.1"] },
    { "id": 2, "tasks": ["4.2", "5.1"] },
    { "id": 3, "tasks": ["6"] }
  ]
}
```
