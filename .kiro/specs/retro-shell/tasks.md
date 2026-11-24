# Implementation Plan: retro-shell

## Overview

Build the shell bottom-up in TypeScript: pure helpers and models first (scene table, monitor
geometry, boot and dial timelines, window stack, Session tick driving), then the thin DOM and
Web Audio layers on top, then the desktop scene that wires everything to a game-core Run, and
finally `main.ts`. Every task names its files. Read `design.md` for interfaces, copy text and
numbers; read `.kiro/steering/retro-copy.md` before changing any in-game text.

## Tasks

- [x] 1. Foundations
  - [x] 1.1 Add `dialTicks(balance)` to game-core
    - In `src/game/balance/core.ts` export `dialTicks(balance: CoreBalance): number` returning
      `Math.round(balance.dialSeconds * TICK_RATE)` (import `TICK_RATE` from `../types`; that file
      only imports `CoreBalance` as a type, so there is no runtime cycle)
    - Replace the inline rounding in `src/game/step.ts` stage 5 with `dialTicks(balance)`; no
      behaviour change
    - Add an example to `tests/game/balance/core.test.ts`: `dialTicks(DEFAULT_CORE_BALANCE) === 1200`
    - Existing `tests/game/step.test.ts` must still pass unchanged
    - _Requirements: 11.3_
  - [x] 1.2 Create `src/core/h.ts`
    - `h(tag, props, ...children)` per design: strings and numbers become `Text` nodes, `null` /
      `undefined` / `false` skipped, `className`, `attrs` (throw on names starting with `on`), `on`
      listeners on the element
    - _Requirements: 14.3, 14.4_
  - [x] 1.3 Write tests for `h()` in `tests/core/h.test.ts`
    - **Property 13: `h()` never turns strings into markup** (fast-check, ≥ 100 runs, strings that
      include `<`, `>`, `&`, quotes)
    - Examples: attrs and className applied, `on` listener fires, `onclick` attr throws
    - **Validates: Requirements 14.3**
  - [x] 1.4 Create `src/core/scene.ts`
    - `Mountable`, `Scene`, `SceneId`, `SceneSignal`, `SignalFn`, pure `nextScene()` with the four
      transitions, `createSceneDirector(root, factories)` that unmounts before mounting, clears
      `root`, and queues signals raised during a switch
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 14.1_
  - [x] 1.5 Write tests for the scene director in `tests/core/scene.test.ts`
    - **Property 1: The desktop is only reachable through the boot** (fast-check over signal arrays)
    - Examples: `start()` mounts powerOff; call log shows unmount before mount; a signal from
      inside `mount()` is handled after the switch; `stop()` unmounts
    - **Validates: Requirements 1.1, 1.6, 1.7, 1.8**
  - [x] 1.6 Create shell test helpers
    - `tests/helpers/loop.ts`: `createManualLoop()` → `{ start: LoopStarter, frame(n), isRunning(), stopCount() }`
      (define the `LoopStarter` shape locally as `(onTicks: (n: number) => void) => () => void`)
    - `tests/helpers/audio.ts`: `createFakeAudioContext()` recording oscillators (type, frequency
      values set), buffer sources, gains, filters, `start`/`stop`, `suspend`/`resume`/`close`;
      `createFakeAudioEngine()` with the `AudioEngine` method names that logs `play(recipe, duration)`
      and voice `stop()` calls (type it structurally so it compiles before `src/core/audio.ts` exists)
    - `tests/helpers/dom.ts`: `trackListeners(target)` reporting listeners still attached,
      `fakeVisibility(hidden?)` with `setHidden(bool)` that dispatches `visibilitychange`
    - _Requirements: 14.2 (testing support)_

- [x] 2. Monitor, audio engine, styles, icon art and copy
  - [x] 2.1 Create `src/core/monitor.ts`
    - Constants `SCREEN_W`, `SCREEN_H`, `BEZEL`, `MONITOR_W`, `MONITOR_H`; pure `fitMonitor`,
      `toScreenPoint`, `toClientPoint` (rect width 0 → scale 1)
    - `createMonitor(host, win?)`: bezel, `.screen` (1024 × 768), `.crt-overlay`, power button,
      LED with `setLed`, `setPowerHandler` (null → inert button), `resize` listener applying
      `transform: translate() scale()`, removed in `unmount()`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 3.5_
  - [x] 2.2 Write tests for the monitor in `tests/core/monitor.test.ts`
    - **Property 2: The monitor fits the viewport as large as possible**
    - **Property 3: Client and Screen coordinates round-trip**
    - Examples: DOM structure; null handler makes the button inert; resize listener removed after
      unmount (`trackListeners`)
    - **Validates: Requirements 2.1, 2.2, 2.3, 3.5, 14.2**
  - [x] 2.3 Create `src/core/audio.ts`
    - `SoundRecipe`, `Voice`, `AudioEngine`, `createAudioEngine(deps?)` per design: lazy context in
      `unlock()`, master gain 0.6, failure → silent engine, no-op voices while locked, mute via
      gain 0, `visibilitychange` suspend/resume, voice tracking, `stopAll`, `unmount` closes
    - _Requirements: 3.2, 3.3, 3.4, 7.8, 10.8, 10.9, 12.7, 14.2_
  - [x] 2.4 Write tests for the audio engine in `tests/core/audio.test.ts`
    - Examples with the fake context: locked `play` creates no nodes; throwing factory and
      rejecting `resume` give a silent engine whose `play` is a no-op; hidden → `suspend`,
      visible → `resume`; mute sets gain 0 and back; `unmount` stops voices, closes the context and
      removes the visibility listener
    - _Requirements: 3.3, 3.4, 7.8, 10.8, 10.9, 14.2_
  - [x] 2.5 Create the stylesheets in `src/styles/`
    - `theme.css` (all colour and font tokens from the design), `monitor.css` (bezel, LED
      `standby` blink and `on`, scanlines + vignette with `pointer-events: none`, `crt-on` and
      `crt-collapse` keyframes), `boot.css` (VT323 BIOS text, splash wordmark and progress strip),
      `desktop.css` (wallpaper, icons, bevelled windows, active/inactive title bars, taskbar,
      tray, start menu with vertical banner, disabled items, Lane_Dock slide-up 300 ms with
      `.is-session`), `dialup.css` (Connect To form, progress view)
    - No colours outside `theme.css` custom properties
    - _Requirements: 2.1, 2.4, 3.1, 4.5, 6.9, 7.4, 8.5, 10.10, 14.6_
  - [x] 2.6 Create `src/desktop/iconArt.ts` and `src/desktop/copy.ts`
    - `IconName`, `ICON_SVG` (original 32 × 32 constant SVG for dialer, text, wastebasket, file,
      start, speaker, speakerMuted, computer) and `iconEl(name)`, the only `innerHTML` use in `src/`
    - `DESKTOP_COPY` with the exact strings from the design (icon labels, window titles, README
      text, wastebasket files and "4 object(s)", start menu items and "Phantom 98" banner,
      "Start", clock "11:59 PM"), following `retro-copy`
    - _Requirements: 5.2, 5.7, 5.8, 7.5, 8.2, 14.5, 14.6, 14.7_

- [x] 3. Power-off and boot scenes
  - [x] 3.1 Create `src/scenes/boot/bootScript.ts`
    - `BootScript`, `BOOT_SCRIPT` with the BIOS lines, memory count (900–2,400 ms, 1024K steps,
      `65536K OK`), footer, cues, `splashAtMs: 5400`, `doneAtMs: 8000`, splash copy from the design
    - Pure `bootFrameAt(elapsedMs, script?)` and `cuesBetween(prevMs, nowMs, script?)`
    - _Requirements: 4.2, 4.3, 4.4, 4.5, 4.6, 14.7_
  - [x] 3.2 Write tests for the boot script in `tests/scenes/boot/bootScript.test.ts`
    - **Property 4: The boot timeline only moves forward**
    - **Property 5: Every boot cue fires exactly once**
    - Examples: stage at 5,399 / 5,400 / 7,999 / 8,000 ms; memory line reads `65536K OK` at 2,400 ms
    - **Validates: Requirements 4.2, 4.3, 4.4, 4.6**
  - [x] 3.3 Create `src/scenes/boot/bootSounds.ts`
    - `SoundRecipe`s `crtThunk`, `postBeep`, `diskSeek`, `startupChime` (original A-minor
      arpeggio) per design; every recipe returns a stop function that stops and disconnects its
      nodes; noise generated in code
    - _Requirements: 4.1, 4.4, 5.1, 12.7_
  - [x] 3.4 Create `src/scenes/powerOffScene.ts` and `src/scenes/boot/bootScene.ts`
    - Power off: dark screen, `setLed('standby')`, power handler calls `audio.unlock()` then
      `signal('powerOn')`; unmount clears the handler and sets the LED `on`
    - Boot: `crt-on` class, loop via injected `startLoop` (default `startFixedLoop`), elapsed =
      ticks × `TICK_MS`, cues via `cuesBetween` (first `prev = -1`), render `bootFrameAt` with
      one `<div>` per line updated through `textContent`, splash view, `signal('bootDone')` once at
      `done`; no input listeners; unmount stops loop and voices
    - _Requirements: 1.2, 1.3, 1.9, 3.1, 3.2, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 14.1, 14.2_
  - [x] 3.5 Write tests for the power-off and boot scenes
    - `tests/scenes/powerOffScene.test.ts`: LED standby; `unlock` logged before `signal('powerOn')`;
      button inert after unmount
    - `tests/scenes/boot/bootScene.test.ts` with the manual loop and fake audio: first frames play
      `crtThunk` and `postBeep`; 480 ticks signal `bootDone` exactly once; zero-tick frames change
      nothing; click and keydown change nothing; unmount stops the loop and leaves no listeners
    - _Requirements: 1.9, 3.1, 3.2, 3.5, 4.1, 4.6, 4.7, 14.2_

- [x] 4. Window system
  - [x] 4.1 Create `src/desktop/layout.ts`
    - Constants `TASKBAR_H`, `LANE_DOCK_H`, `TITLE_BAR_H`, `MIN_TITLE_VISIBLE`, `CASCADE_ORIGIN`,
      `CASCADE_STEP`; `Size`, `Point`; `desktopArea`, `clampWindow`, `cascadePosition` per design
    - _Requirements: 6.7, 6.8, 6.12, 10.10_
  - [x] 4.2 Write tests for the layout in `tests/desktop/layout.test.ts`
    - **Property 8: Clamped windows keep their title bar reachable**
    - Examples: `desktopArea(false)` is 1024 × 740, `desktopArea(true)` is 1024 × 480; cascade
      slots 0, 1, 2 and the wrap
    - **Validates: Requirements 6.7, 6.8, 6.12**
  - [x] 4.3 Create `src/desktop/windowStack.ts`
    - `WindowStack`, `EMPTY_STACK`, `StackOp`, `applyStackOp`, `topVisible` per the op table; pure
      and immutable
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 7.1, 7.2, 7.3_
  - [x] 4.4 Write tests for the window stack in `tests/desktop/windowStack.test.ts`
    - **Property 6: The window stack invariants hold after every operation**
    - **Property 7: Window operations have their stated effects**
    - Use a pool of 4 ids and op arrays of length 0–40
    - **Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5, 7.1, 7.2, 7.3**
  - [x] 4.5 Create `src/desktop/windowManager.ts`
    - `WindowSpec`, `WindowInfo`, `WindowListener`, `WindowManager`, `createWindowManager(deps)`:
      title bar with icon, title, minimize and close buttons; every change through
      `applyStackOp` then one `render()` (z-index, `.is-active`, `hidden`, notify listeners);
      capture-phase `pointerdown` focus; title-bar drag with `toScreenPoint` + `clampWindow` and
      guarded `setPointerCapture`; ✕ → `requestClose` → `onCloseRequest`; `setArea` re-clamps;
      cascade placement; `setTitle`, `setContent`; `unmount` removes all windows
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 6.10, 6.11, 6.12, 14.1, 14.2_
  - [x] 4.6 Write DOM tests for the window manager in `tests/desktop/windowManager.test.ts`
    - z-index order and `.is-active` follow the stack; pointerdown focuses; drag with a scale-2
      `toScreenPoint` moves by half the client delta; `setArea` pulls a low window up; ✕ asks the
      owner and a `false` answer keeps the window; reopening an id focuses instead of duplicating;
      subscribers get updates and stop after unsubscribe
    - Dispatch `MouseEvent`s named `pointerdown` / `pointermove` / `pointerup` (jsdom)
    - _Requirements: 5.9, 6.1, 6.2, 6.6, 6.8, 6.9, 6.10, 6.11_

- [x] 5. Taskbar, start menu, icons and text windows
  - [x] 5.1 Create `src/desktop/taskbar.ts`
    - Start button (`iconEl('start')` + "Start"), window buttons from `stack.opened` with the
      pressed style on `stack.focused`, click → `windows.taskbarClick(id)`; Tray with modem lamp
      (`setModem`), speaker toggle using `audio.setMuted` and icon swap, clock text; unmount
      unsubscribes
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 14.2_
  - [x] 5.2 Create `src/desktop/startMenu.ts`
    - Items and banner from `DESKTOP_COPY.startMenu`; `toggle/open/close/isOpen/setDisabled`;
      `document` `pointerdown` and `keydown` (Escape) listeners only while open; clicks on the
      anchor ignored by the outside-press check; disabled items get `aria-disabled` and do nothing
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 14.2_
  - [x] 5.3 Create `src/desktop/icons.ts` and `src/desktop/textWindow.ts`
    - `createIconGrid`: `<button>` icons in one column from (16, 16), 80 px apart; click selects
      one, dblclick and Enter call `onOpen`; `clearSelection`, `selected`
    - `readmeContent()` (`<pre>` with the README text) and `wastebasketContent()` (file rows with
      `iconEl('file')` and the "4 object(s)" status bar)
    - _Requirements: 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8_
  - [x] 5.4 Write tests for the taskbar in `tests/desktop/taskbar.test.ts`
    - Buttons in open order, pressed style follows focus, click minimizes the focused window and
      restores another, clock text, speaker toggles mute and icon, `setModem` sets `data-state`,
      no subscription after unmount
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8_
  - [x] 5.5 Write tests for the start menu in `tests/desktop/startMenu.test.ts`
    - Toggle, item order and banner, choosing closes and calls `onChoose`, Escape and outside
      press close, `trackListeners(document)` empty when closed and after unmount, disabled
      "Shut Down..." ignored
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 14.2_
  - [x] 5.6 Write tests for icons and text windows in `tests/desktop/icons.test.ts` and
    `tests/desktop/textWindow.test.ts`
    - Three labels in order and increasing y; single selection; clearSelection; dblclick and
      Enter open; README text and wastebasket rows match `DESKTOP_COPY`
    - _Requirements: 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8_

- [x] 6. Checkpoint - Ensure all tests pass
  - Run `npm run typecheck` and `npm test`; ensure all tests pass, ask the user if questions arise.

- [x] 7. Dial-up and Session
  - [x] 7.1 Create `src/dialup/dialScript.ts`
    - `DialStageId`, `DialSoundId`, `DialStage`, `DIAL_STAGES` (shares and status text from the
      design table), `DIALER_COPY` (titles, form labels and values, buttons, connected,
      duration, terminated, hang-up message), `dialStatusOf`, `stageTimeLeftSeconds`,
      `formatDuration`; use `dialTicks(state.balance)` from task 1.1
    - _Requirements: 9.1, 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7, 12.1, 14.7_
  - [x] 7.2 Write tests for the dial script in `tests/dialup/dialScript.test.ts`
    - **Property 10: Dial status depends only on the Run's dial clock** (states from `createRun`
      with random valid `dialSeconds` overrides and adjusted tick/phase fields)
    - **Property 11: Stage sounds last exactly until the stage ends**
    - Examples: stage ids in order and shares contiguous 0 → 1; default balance gives
      `negotiating` at tick 300 and `loggingOn` at tick 1,199; `formatDuration(420) === "000:00:07"`
    - **Validates: Requirements 11.1, 11.2, 11.3, 11.5, 12.1**
  - [x] 7.3 Create `src/dialup/modemSounds.ts`
    - `DIAL_TONE_HZ`, `RINGBACK_HZ`, `DTMF`, `PHONE_DIGITS`, pure `handshakePlan`, and
      `MODEM_SOUNDS` recipes (dialTone, dtmf, ringback, handshake from four parts, relayClick)
      per the design table; every recipe returns a stop function
    - _Requirements: 12.2, 12.3, 12.5, 12.7_
  - [x] 7.4 Write tests for modem sounds in `tests/dialup/modemSounds.test.ts`
    - **Property 12: The handshake plan covers its duration in order**
    - Examples with the fake context: dialTone creates 350 and 440 Hz oscillators; dtmf creates
      the row/column pairs for `5550199`; ringback 440 and 480 Hz; handshake includes a 2100 Hz
      oscillator; the stop function stops every started node
    - **Validates: Requirements 12.2, 12.3**
  - [x] 7.5 Create `src/dialup/session.ts` and `src/dialup/sessionRegistry.ts`
    - `SessionContext`, `SessionView`, `SessionViewFactory`, `SessionRegistry`, `LoopStarter`,
      pure `advanceTicks`, `createSession(options)` per design (initial update, input queue
      drained on the first tick of a non-empty frame, per-frame update with all events, stop and
      `onEnd` once on won/lost, reverse-order unmount, idempotent `stop`, `console.error` for a
      throwing `update`, cleanup and rethrow for a throwing `mount`)
    - `SESSION_REGISTRY = { views: [], systems: [] }` with a comment for milestones 3 and 4
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8, 10.12_
  - [x] 7.6 Write tests for the Session in `tests/dialup/session.test.ts`
    - **Property 9: The Session matches tick-by-tick stepping for any frame grouping** (manual
      loop, `scheduledDamage` from `tests/helpers/game.ts`, random partitions with zero-tick
      frames, `startDownload` sends between frames, reference built with `step`)
    - Examples: fixed seed reaches `state().seed`; a command sent before a zero-tick frame is
      delivered on the next non-empty frame; `stop()` unmounts in reverse order and is idempotent;
      a throwing `update` is logged and other views still update
    - **Validates: Requirements 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7**
  - [x] 7.7 Create `src/dialup/dialer.ts` and `src/dialup/trayModemView.ts`
    - `createDialerApp({ windows, audio, onConnect })`: "dialer" window with the Connect To form
      (Connect → `onConnect`, Cancel/✕ close while idle); `sessionView` that swaps to the
      progress view, refuses close, shows the hang-up message for 180 Run ticks, switches stage
      voices with `stageTimeLeftSeconds`, records `connectedAtTick` and plays `relayClick` on
      `connected`, shows connected/duration/terminated text, updates titles from
      `DIALER_COPY`, and on unmount stops the voice and restores the form
    - `trayModemView(taskbar)`: blink while dialing, on while connected or downloading, off on
      unmount
    - _Requirements: 7.6, 7.7, 9.1, 9.2, 9.3, 9.4, 10.11, 11.1, 11.4, 11.5, 11.6, 11.7, 12.1, 12.4, 12.5, 12.6_
  - [x] 7.8 Write tests for the dialer and tray view in `tests/dialup/dialer.test.ts` and
    `tests/dialup/trayModemView.test.ts`
    - Form content and buttons; Connect calls `onConnect`; idle Cancel closes; session mount
      shows the progress view; status text per stage from real `createRun` + `step` states;
      voice log: stop previous, play next, nothing for verifying and logging on, relayClick on
      `connected`; duration text 5 s after connect; hang-up message visible at +179 ticks and
      gone at +180 with the window still open; terminated text on `lost`; unmount stops the voice
      and shows the form; tray lamp states
    - _Requirements: 7.6, 7.7, 9.1, 9.2, 9.3, 9.4, 11.1, 11.4, 11.6, 11.7, 12.1, 12.4, 12.5, 12.6_

- [x] 8. Desktop scene, shutdown and wiring
  - [x] 8.1 Create `src/scenes/shutdown/shutdownScript.ts` and `src/scenes/shutdown/shutdownScene.ts`
    - `SHUTDOWN_COPY`, `SHUTDOWN_TIMES`, pure `shutdownFrameAt`; scene counts loop ticks, shows
      the two messages, adds `crt-collapse`, calls `signal('shutdownDone')` once; unmount stops the
      loop
    - _Requirements: 1.5, 13.1, 13.2, 13.3, 14.2, 14.7_
  - [x] 8.2 Write tests for shutdown in `tests/scenes/shutdown/shutdownScene.test.ts`
    - `shutdownFrameAt` at 0, 1,499, 1,500, 3,499, 3,500, 3,999, 4,000; scene signals once after
      240 ticks; unmount stops the loop
    - _Requirements: 13.1, 13.2, 13.3_
  - [x] 8.3 Create `src/scenes/desktop/desktopScene.ts`
    - `AppId`, `DesktopDeps`, `createDesktopScene(deps)` per design: wallpaper (click clears
      selection), icon grid, Window_Manager with `desktopArea(false)`, hidden Lane_Dock, Taskbar,
      Start_Menu (Start button toggles, `onOpenChange` → `setStartPressed`), startup chime;
      `openApp` for readme, wastebasket and dialer; Shut Down → `signal('shutDown')`;
      `startSession` / `endSession` with Lane_Dock, `setArea`, Shut Down disable/enable, views
      `[dialer.sessionView, trayModemView(taskbar), ...registry.views]`, systems from the
      registry, seed from `seedSource` (default `crypto.getRandomValues`); unmount ends the
      Session and unmounts every component
    - _Requirements: 1.4, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9, 8.3, 8.5, 9.2, 10.1, 10.6, 10.7, 10.10, 10.11, 10.12, 10.13, 14.1, 14.2_
  - [x] 8.4 Write integration tests in `tests/scenes/desktop/desktopScene.test.ts`
    - Manual loop, fake audio, seed source returning 1, a registry with one recording lane view
    - Startup chime played; README and Wastebasket open from icons and from the Start_Menu;
      double-click "Connect to MidnightNet" then Connect: Lane_Dock visible, lane view got
      `laneHost`, Shut Down disabled; after 300 ticks status `Negotiating with the remote
      computer...`; after 1,200 ticks `Connected at 28,800 bps.` and tray lamp `on`; Connect path
      twice starts one Session; a registry system dealing 100 damage at tick 5 ends the Session,
      hides the Lane_Dock, re-enables Shut Down and shows the form; unmount mid-Session stops the
      loop and leaves no `document`/`window` listeners
    - _Requirements: 5.1, 5.7, 5.8, 8.3, 8.5, 9.2, 10.6, 10.7, 10.10, 10.11, 10.13, 11.1, 11.4, 14.2_
  - [x] 8.5 Create `src/scenes/index.ts` and rewrite `src/main.ts`
    - `ShellDeps` and `buildSceneFactories(deps)` returning the four factories
    - `main.ts`: import `@fontsource/vt323` and the five CSS files, `createMonitor` in `#screen`,
      `createAudioEngine()`, `createSceneDirector(monitor.screen, buildSceneFactories(...)).start()`;
      remove the scaffold text
    - _Requirements: 1.1, 2.1, 3.2_
  - [x] 8.6 Write the full-flow and repository scan tests
    - `tests/scenes/index.test.ts`: `buildSceneFactories` with fakes and a manual loop: power
      button → boot → 480 ticks → desktop → Start → Shut Down... → 240 ticks → power off; the power
      button does nothing while the desktop is mounted
    - `tests/copy.test.ts`: banned-name scan over every string in `DESKTOP_COPY`, `BOOT_SCRIPT`,
      `DIALER_COPY`, `DIAL_STAGES` and `SHUTDOWN_COPY` (list in the design); `innerHTML` appears in
      `src/` only in `src/desktop/iconArt.ts`; no `.mp3` / `.wav` / `.ogg` imports in `src/`
      (read files with `node:fs`)
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 3.5, 12.7, 14.4, 14.5_

- [x] 9. Final checkpoint - Typecheck, test and build
  - Run `npm run typecheck`, `npm test` and `npm run build`; all three must pass. Ensure all
    tests pass, ask the user if questions arise.

## Notes

- Test sub-tasks are not marked optional: the user asked for tests, and the testing steering
  requires property tests for invariants. Never weaken a failing test; fix the code or stop and
  explain.
- Every property test uses fast-check with at least `{ numRuns: 100 }` and carries both
  `// Property: Req X.Y ...` and `// Feature: retro-shell, Property N: <title>` comments.
- No new runtime dependencies. `@fontsource/vt323` is already installed.
- Do not write into `assets/sprites/`; icons are constant SVG in `src/desktop/iconArt.ts`.
- All CSS is imported only from `src/main.ts`, so tests never import CSS.
- Manual checks after task 8.5 (not part of the plan): `npm run dev` on port 3000 to look at and
  listen to the boot and dial-up.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.4", "1.6", "2.5", "2.6"] },
    { "id": 1, "tasks": ["1.3", "1.5", "2.1", "2.3", "3.1", "4.1", "4.3"] },
    { "id": 2, "tasks": ["2.2", "2.4", "3.2", "3.3", "4.2", "4.4", "4.5"] },
    { "id": 3, "tasks": ["3.4", "4.6", "5.1", "5.2", "5.3"] },
    { "id": 4, "tasks": ["3.5", "5.4", "5.5", "5.6"] },
    { "id": 5, "tasks": ["6"] },
    { "id": 6, "tasks": ["7.1", "7.3", "7.5", "8.1"] },
    { "id": 7, "tasks": ["7.2", "7.4", "7.6", "7.7", "8.2"] },
    { "id": 8, "tasks": ["7.8", "8.3"] },
    { "id": 9, "tasks": ["8.4", "8.5"] },
    { "id": 10, "tasks": ["8.6"] },
    { "id": 11, "tasks": ["9"] }
  ]
}
```
