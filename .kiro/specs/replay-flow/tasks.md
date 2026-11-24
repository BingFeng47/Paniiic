# Implementation Plan: replay-flow

## Overview

Add the `mainMenu` scene transition, give the Result_Screen Retry and Main menu buttons, and wire
them in the Desktop_Scene. Read `design.md` for interfaces and the changed-tests table, and
`.kiro/steering/retro-copy.md` before changing copy. Only the tests in that table may change, and
only the button they press.

## Tasks

- [x] 1. Scene transition
  - [x] 1.1 Add the `mainMenu` signal to `src/core/scene.ts`
    - `SceneSignal` gains `mainMenu`; `TRANSITIONS.desktop` gains `mainMenu: 'title'`; update
      the header and table comments
    - _Requirements: 3.2, 3.3, 3.5, 3.6_
  - [x]* 1.2 Update the scene director tests
    - Transition table row; `mainMenu` ignored outside the desktop; extend the director property
      into Property 1 (desktop only through boot, title only from power off or desktop)
    - _Requirements: 3.2, 3.3, 3.5, 3.6, 3.7_

- [x] 2. Result_Screen buttons
  - [x] 2.1 Update `src/ui/resultCopy.ts` and `src/ui/resultScreen.ts`
    - Copy `retry: 'Retry'`, `mainMenu: 'Main menu'`; remove `back`
    - `ResultActions`, new `ResultScreenFactory` signature; `.result-retry` then
      `.result-main-menu` in `.result-buttons`; focus Retry at the reveal; `chosen` flag
    - Gap between the buttons in the result CSS
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_
  - [x]* 2.2 Update `tests/ui/resultScreen.test.ts`
    - The rows of the design's changed-tests table for this file; new tests for each action,
      Enter and Space, and the ignored second activation
    - Property 3: one activation per Result_Screen
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 5.2_

- [x] 3. Desktop_Scene wiring
  - [x] 3.1 Add `retry()` and `mainMenu()` to `src/scenes/desktop/desktopScene.ts`
    - Pass `{ onRetry: retry, onMainMenu: mainMenu }` to the factory; `retry` closes the result,
      opens the Dialer and calls `startSession`; `mainMenu` closes the result and signals
      `mainMenu`; both no-op without a result
    - Update the `SessionView.unmount()` doc comment in `src/dialup/session.ts` to require
      closing the view's own windows
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 4.1, 4.2_
  - [x]* 3.2 Update `tests/scenes/desktop/desktopScene.test.ts`
    - The rows of the changed-tests table; Retry and Main menu examples from the design; a
      test-only Session_View whose window is closed between runs
    - Property 2: Retry never stacks Sessions or Result_Screens
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 4.1, 4.3, 5.2_
  - [x]* 3.3 Update `tests/scenes/index.test.ts`
    - Lose → Main menu → title → Play → boot → desktop; lose → Retry → dialing with no boot;
      the Desktop_Scene leaves no listeners, loops or voices after Main menu
    - _Requirements: 2.1, 3.3, 3.4, 4.2, 5.2_

- [x] 4. Docs
  - [x] 4.1 Add a dated note to `docs/kiro-log.md`
    - One line under "Notes": Retry and Main menu, the new transition, the changed tests
    - _Requirements: 5.1, 5.3_

- [x] 5. Final checkpoint
  - Run `npm run typecheck`, `npm test` and `npm run build`. Manual check in `npm run dev`: lose a
    run, press Retry and see the dial-up start at once; lose again, press Main menu and see the
    title with its theme; ask the user if questions arise.

## Notes

- Tasks marked with `*` are test tasks. 2.2, 3.2 and 3.3 update tests that would otherwise fail,
  so they are needed before the final checkpoint passes.
- Never weaken a failing test outside the changed-tests table; fix the code or stop and explain.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1"] },
    { "id": 1, "tasks": ["1.2", "2.2", "3.1"] },
    { "id": 2, "tasks": ["3.2", "3.3"] },
    { "id": 3, "tasks": ["4.1"] },
    { "id": 4, "tasks": ["5"] }
  ]
}
```
