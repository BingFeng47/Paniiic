# Implementation Plan: browser-front

## Overview

Build the browser front bottom-up: the two small shell hooks (`eventsSoFar`, `overlayHost`),
ad types and balance, the pure ad systems and close pattern table with their tests, then the
Browser_View (window, download panel, Ad_Layer, copy, sounds), the registry wiring and the Kiro
artifacts. Read `design.md` for every interface, number and table, and
`.kiro/steering/retro-copy.md` before writing copy. No existing test assertion may change.

## Tasks

- [x] 1. Shell hooks
  - [x] 1.1 Add `eventsSoFar()` to the tick context in `src/game/context.ts`
    - Returns a frozen copy of this Tick's events in order
    - _Requirements: 7.3, 14.4_
  - [x] 1.2 Add `overlayHost` to `SessionContext` and the Desktop_Scene
    - `src/dialup/session.ts` field; `div.session-overlay` (1024 × 740, below the Result_Screen) in
      `src/scenes/desktop/desktopScene.ts` and its CSS
    - _Requirements: 12.1, 14.3_
  - [ ]* 1.3 Test both hooks
    - `tests/game/context.test.ts` and `tests/scenes/desktop/desktopScene.test.ts`; existing
      assertions unchanged
    - _Requirements: 14.4_

- [x] 2. Ad types and balance
  - [x] 2.1 Create `src/game/ads/adTypes.ts` and extend `src/game/types.ts` and `src/game/step.ts`
    - Types from the design; `InputCommand` and `GameEventBody` unions; optional `GameState.ads`;
      the input switch accepts `adClick` and `adHover` as system-read commands
    - _Requirements: 1.2, 14.1_
  - [x] 2.2 Create `src/game/balance/ads.ts`
    - `AdRow`, `AdBalance`, defaults and schedule table from the design, `resolveAdBalance`,
      `AdBalanceError` with every validation rule
    - _Requirements: 2.1, 2.2, 2.3, 3.1, 3.2_
  - [ ]* 2.3 Write `tests/game/balance/ads.test.ts`
    - Defaults, merge, one example per rule, two problems listed together
    - _Requirements: 2.1, 2.2, 2.3_

- [x] 3. Ad rules
  - [x] 3.1 Create `src/game/ads/closePatterns.ts`
    - The close pattern table, `controlsFor(ad)`, `resolveClick`, `resolveHover`
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8, 10.9, 10.10_
  - [x] 3.2 Create `src/game/ads/placement.ts` and `src/game/ads/openAd.ts`
    - Placement rules per kind with `ctx.random()`; `openAd` with cap, pattern and copy choice,
      hidden corner, runaway start, interrupter pause source, `adOpened` / `adSkipped`
    - _Requirements: 1.4, 3.4, 4.1, 4.2, 4.3, 4.4, 4.5, 7.1, 8.1, 9.1_
  - [x] 3.3 Create `src/game/ads/adSystems.ts`
    - `createAdSystems({ balance, scheduler })`: `ensureAds`, `adInputSystem`, `scheduleAds`
      (forced first clutter, rows, bursts from `eventsSoFar`), `adExpirySystem`
    - _Requirements: 1.1, 1.5, 1.6, 2.4, 3.2, 3.3, 7.2, 7.3, 7.4, 8.2, 8.3, 8.4, 9.2, 11.1, 11.2, 11.3_
  - [ ]* 3.4 Write example tests in `tests/game/ads/`
    - One test per close pattern row, first clutter at connect + 5 s, same-Tick burst, cap,
      fake lifetime and penalty, interrupter pause and resume, mistake extras, stale commands
    - _Requirements: 3.2, 3.4, 7.2, 7.3, 8.2, 8.3, 9.1, 9.2, 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 11.1, 11.2_
  - [ ]* 3.5 Write `tests/game/ads/adProperties.test.ts`
    - `arbAdRun` arbitrary
    - Property 1: ad runs are deterministic and plain data — _Requirements: 1.2, 1.3, 1.4, 1.7_
    - Property 2: ad state invariants hold on every Tick — _Requirements: 1.5, 1.6, 3.4, 4.1, 4.2, 10.9_
    - Property 3: placement rules — _Requirements: 4.3, 4.4, 4.5_
    - Property 4: interrupters freeze the download — _Requirements: 9.1, 9.2, 9.4_
    - Property 5: exactly one way out per stage — _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.8, 10.10_
    - Property 6: clicks have exactly their table effect — _Requirements: 7.2, 8.2, 8.4, 11.1, 11.2, 11.3_
    - Property 7: the runaway ✕ jumps at most 3 times — _Requirements: 10.7, 10.8_
    - Property 8: bursts and schedule — _Requirements: 3.1, 3.2, 3.4, 7.1, 7.3, 7.4_
  - [ ]* 3.6 Add the headless win check to `tests/game/headless.test.ts`
    - Ad systems only, scripted correct closes reach `won`; fake clicks make it later
    - _Requirements: 1.7_

- [x] 4. Checkpoint
  - Run `npm run typecheck` and `npm test`; ask the user if questions arise.

- [x] 5. Browser_View
  - [x] 5.1 Create `src/ui/browserCopy.ts` and the `browser` icon in `src/desktop/iconArt.ts`
    - Every string from the design and the ad copy variants, per `retro-copy`
    - _Requirements: 5.2, 5.3, 6.5, 12.8_
  - [x] 5.2 Create `src/render/browser/netsurferWindow.ts` and `src/render/browser/downloadPanel.ts`
    - Window content with toolbar, address bar, page body and Real_Link at the balance rects,
      status bar; pure `downloadView` and the panel DOM with penalty style
    - _Requirements: 5.2, 5.3, 5.5, 6.1, 6.2, 6.3, 6.4, 6.5_
  - [x] 5.3 Create `src/render/browser/adDom.ts` and `src/render/browser/adLayer.ts`
    - Builders per kind and pattern from the close pattern table; keyed reconcile; interrupter
      shield; delegated `pointerdown` → `adClick`; runaway `pointerenter` → `adHover`; countdown
      text; blink at 2 per second; CSS in `src/styles/browser.css`
    - _Requirements: 9.3, 10.3, 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7, 12.8, 12.9_
  - [x] 5.4 Create `src/render/browser/browserSounds.ts`
    - Six synthesized recipes; `browserSoundsFor(events)` once per recipe per frame
    - _Requirements: 13.1, 13.2_
  - [x] 5.5 Create `src/render/browser/browserView.ts`
    - Mount the Ad_Layer; on `connected` minimize the Dialer and open the NetSurfer_Window;
      refuse close with the busy text for 180 Ticks; Real_Link → one `startDownload`; update the
      panel and layer; play sounds; unmount closes the window, removes the layer, stops voices
    - _Requirements: 5.1, 5.4, 5.5, 5.6, 5.7, 13.1, 13.3, 14.3_
  - [ ]* 5.6 Write `tests/render/browser/*.test.ts`
    - The jsdom checks in the design's testing strategy
    - Property 9: the download panel matches the state — _Requirements: 6.1, 6.2, 6.3_
    - Property 10: the Ad_Layer mirrors the Ad_State — _Requirements: 10.3, 12.1, 12.2, 12.3_
    - _Requirements: 5.1, 5.4, 5.6, 5.7, 9.3, 12.4, 12.5, 12.6, 12.7, 13.1, 13.3_

- [x] 6. Wiring
  - [x] 6.1 Register the Browser_View and the ad systems in `src/dialup/sessionRegistry.ts`
    - Views `[lane, browser]`; systems `[...lane, ...ads]`; update the header comment
    - _Requirements: 14.2_
  - [ ]* 6.2 Run the existing suite and add a Session integration test
    - A real Session with the registry reaches `connected`, opens NetSurfer, starts the download
      from a Real_Link click and pauses on an interrupter; no existing assertion changes
    - _Requirements: 14.2, 14.3, 14.4_

- [x] 7. Kiro artifacts
  - [x] 7.1 Write `.kiro/skills/add-ad/SKILL.md` and extend `tests/skills.test.ts`
    - Front matter and the recipe from the design; every backticked path exists
    - _Requirements: 15.1, 15.2_
  - [x] 7.2 Add a dated note to `docs/kiro-log.md`
    - _Requirements: 15.4_
  - [x] 7.3 Playtester run
    - Invoke the `playtester` agent: dial up, start the download from the Real_Link, play to at
      least 60 s after `connected`, close an Ad of every pattern reached, click one fake button,
      and write `docs/playtests/YYYY-MM-DD-browser-front.md`. Skip and say so if the dev server
      or Playwright MCP is unavailable
    - _Requirements: 15.3_

- [x] 8. Final checkpoint
  - Run `npm run typecheck`, `npm test` and `npm run build`. Manual check in `npm run dev`: the
    browser opens on connect, the grey link starts the download, every close pattern can be
    closed once learned, ads over the lane block hammer clicks, and a run can now be won; ask the
    user if questions arise.

## Notes

- Tasks marked with `*` are optional test tasks and can be skipped for a faster MVP, but the
  property tests are the main guard on the close pattern rules.
- Never weaken a failing test; fix the code or stop and explain.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "2.1"] },
    { "id": 1, "tasks": ["1.3", "2.2", "3.1"] },
    { "id": 2, "tasks": ["2.3", "3.2"] },
    { "id": 3, "tasks": ["3.3"] },
    { "id": 4, "tasks": ["3.4", "3.5", "3.6", "5.1", "5.4"] },
    { "id": 5, "tasks": ["4", "5.2", "5.3"] },
    { "id": 6, "tasks": ["5.5"] },
    { "id": 7, "tasks": ["5.6", "6.1"] },
    { "id": 8, "tasks": ["6.2", "7.1", "7.2"] },
    { "id": 9, "tasks": ["7.3"] },
    { "id": 10, "tasks": ["8"] }
  ]
}
```
