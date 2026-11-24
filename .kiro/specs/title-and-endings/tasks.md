# Implementation Plan: title-and-endings

## Overview

Build bottom-up in TypeScript: the Audio_Engine channels and fades, the Settings_Store, then the
pure title pieces (input model, Theme_Score maths), the theme recipe, the Options_Dialog and the
Title_Scene, then the scene-flow wiring, the screen-shake preference, the pure result script,
the result sounds and the Result_Screen, and finally the desktop hook, the docs and a playtest.
Every task names its files. Read `design.md` for interfaces, numbers, notes and copy; read
`.kiro/steering/retro-copy.md` before writing in-game text and `.kiro/steering/testing.md`
before writing tests. Never write into `assets/sprites/`. Only the power-on step in
`tests/core/scene.test.ts` and `tests/scenes/index.test.ts` may change existing expectations,
and two tests in `tests/scenes/desktop/desktopScene.test.ts` gain a dismiss step in their setup
with their assertions unchanged (design "Existing tests that change", task 7.1); every other
existing test must pass unchanged.

## Tasks

- [x] 1. Audio channels, fades and settings
  - [x] 1.1 Extend `src/core/audio.ts` and the fake engine in `tests/helpers/audio.ts`
    - `audio.ts`: `Channel`, `AudioMix`, `DEFAULT_MIX`, `Gains`, pure `mixGains`, `Timers`
      dep (default `globalThis.setTimeout` / `clearTimeout`); `unlock()` builds `master` first
      (still `gains[0]`), then the music and sfx buses into it, and applies the stored mix and
      mute; `setMix` / `mix()`; `play(recipe, d, channel = 'sfx')` through a per-Voice gain node;
      `Voice.fadeOut(d)` (cancel, anchor, linear ramp to 0, stop by timer; ignored when stopped or
      already fading; stops at once for a non-positive or non-finite duration); `stop()` clears a
      pending fade; pruning skips fading voices; `stopAll()` / `unmount()` clear every fade timer;
      no-op Voice gets a no-op `fadeOut`
    - `tests/helpers/audio.ts`: `setMix` / `mix()` (log entry `setMix`), optional `channel` on
      `play` stored on `FakeVoice`, `FakeVoice.fadeOut` (log entry `fadeOut`), option
      `fades: 'instant' | 'manual'` (default `'instant'`) and `finishFades()`; existing log entry
      shapes and behaviour unchanged
    - Every existing test in `tests/core/audio.test.ts` must pass unchanged
    - _Requirements: 3.6, 3.9, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9_

  - [x] 1.2 Write engine tests in `tests/core/audio.test.ts` and `tests/helpers/timers.ts`
    - `timers.ts`: `createFakeTimers()` with `setTimeout`, `clearTimeout`, `advance(ms)`,
      `pending()`
    - **Property 9: Engine gains follow the mix and the mute, before and after unlock**
    - Examples from the design: default routing to sfx and `'music'` routing; master still 0.6
      at volume 100; fade events and stop at 600 ms; stop during a fade; `fadeOut(0)`; unmount
      with pending fades leaves no timers; no-op Voice `fadeOut`
    - **Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9**

  - [x] 1.3 Create `src/core/settings.ts`
    - `Settings`, `SETTINGS_VERSION`, `STORAGE_KEY` (`phantom98.settings`), frozen
      `DEFAULT_SETTINGS`, `VOLUME_STEP`, `normalizeVolume`, `volumeFromSlider`,
      `isValidSettings`, `serializeSettings` (version first), `parseSettings` (never throws, the
      design's rule order), `mergeSettings`, `mixOf`
    - `createSettingsStore(deps?)` over an injected storage getter: memory only after a failed or
      impossible read, write after every change, `warn` once, retry writes after a write
      failure, synchronous listeners each in `try`/`catch`, no write on creation;
      `isPersistent()`
    - `bindAudioSettings(audio, store)` applying `mixOf(store.get())` at once and on every
      change, returning the unsubscribe function
    - _Requirements: 4.3, 4.5, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9, 5.10, 5.11_

  - [x] 1.4 Write settings tests in `tests/core/settings.test.ts` and `tests/helpers/storage.ts`
    - `storage.ts`: `createFakeStorage({ mode, initial })` with modes `ok`, `nullGetter`,
      `getterThrows`, `readThrows`, `writeThrows`
    - **Property 5: Settings survive a storage round trip**
    - **Property 6: Parsing never throws and keeps every valid stored field**
    - **Property 7: Volume values are rounded, clamped and snapped**
    - **Property 8: The Settings_Store behaves like an in-memory model whatever storage does**
    - Examples from the design: key and defaults; `null`, `'{'`, `'[]'`, `'42'`, `v: 2` give
      defaults; a string volume keeps the default volume; `bindAudioSettings` calls and unbind;
      first write only after the first change
    - **Validates: Requirements 4.3, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9, 5.10, 5.11**

- [x] 2. Title screen
  - [x] 2.1 Create `src/scenes/title/titleModel.ts`
    - `THEME_FADE_MS` (600), `THEME_FADE_TICKS` (`Math.round(600 / TICK_MS)` = 36),
      `TitleMode`, `TitleModel`, `INITIAL_TITLE`, `TitleAction`, `TitleEffect` and `titleStep`
      following the design's table exactly
    - _Requirements: 1.6, 2.4, 2.5, 3.5_

  - [x] 2.2 Write title model tests in `tests/scenes/title/titleModel.test.ts`
    - **Property 2: The title screen starts the game exactly once, 600 ms after Play**
    - Examples: each row of the design's table; `ticks` with `n = 0` or `NaN` changes nothing
    - **Validates: Requirements 1.6, 2.4, 2.5, 3.5**

  - [x] 2.3 Create `src/scenes/title/themeScore.ts`
    - `ThemeInstrument`, `ThemeNote`, `ThemeScore`, frozen `THEME_SCORE` (80 BPM, 32 beats, the
      85 notes from the design's bar and lead tables, sorted by beat then bass, pad, bell, lead),
      `midiHz`, `passSeconds`, `passTicks`, `ScheduledNote`, `themeSchedule` (drop, clip and
      empty rules from the design) and `passesBetween`
    - _Requirements: 3.2, 3.3, 3.4_

  - [x] 2.4 Write theme score tests in `tests/scenes/title/themeScore.test.ts`
    - **Property 3: Every theme pass starts once, at its boundary**
    - **Property 4: The theme schedule stays inside its duration**
    - Examples: `passSeconds` is 24 and `passTicks` is 1,440 (inside 16–32 s); 85 notes, every
      note inside 32 beats with `beats > 0`; `midiHz(69)` is 440
    - **Validates: Requirements 3.2, 3.3, 3.4**

  - [x] 2.5 Create `src/scenes/title/themeSong.ts`
    - `THEME_PASS_SEC` and the `themeSong` recipe playing `themeSchedule(THEME_SCORE, d)` with the
      four instruments from the design's synthesis table, built with `src/core/soundKit.ts` and
      following its recipe rules (schedule inside the window, one output gain fading in and out,
      summed peak well below 1, `return g.finish()`); no noise, no files
    - _Requirements: 3.1, 3.4, 3.8_

  - [x] 2.6 Write theme recipe tests in `tests/scenes/title/themeSong.test.ts`
    - On `createFakeAudioContext()`: nodes are created; every source stops by `at + d`; with
      `d = 5` no source starts at or after `at + 5`; a double stop is safe; oscillator types match
      the instruments (triangle, sawtooth, sine)
    - _Requirements: 3.4, 3.8_

  - [x] 2.7 Create `src/scenes/title/titleCopy.ts` and `src/scenes/title/optionsDialog.ts`
    - `TITLE_COPY` and `OPTIONS_COPY` exactly as in the design (placeholder title from
      requirements decision 1; follow `retro-copy`)
    - `createOptionsDialog({ settings, onClose })`: the design's DOM built with `h()` and text
      nodes; mount reads `settings.get()` and focuses the slider; slider `input` →
      `update({ masterVolume: volumeFromSlider(value) })` and the `NN%` label and
      `aria-valuetext`; checkbox `change` → the matching flag; OK, ✕ and Escape → `onClose()`;
      the `document` keydown listener exists only while mounted
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 12.1, 12.2, 12.3, 12.4_

  - [x] 2.8 Write Options_Dialog tests in `tests/scenes/title/optionsDialog.test.ts`
    - Examples from the design: controls show 60 / off / on / off; slider focused; `input` of
      `30` stores 30, shows `30%`, and a bound fake engine's `mix().volume` is 30 inside the same
      event; each checkbox stores its flag; OK, ✕ and Escape call `onClose`; no `document`
      listener after unmount (`trackListeners`)
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 12.2_

  - [x] 2.9 Create `src/scenes/title/titleScene.ts`, `src/styles/title.css` and the title tokens
    - `createTitleScene({ audio, settings, signal, startLoop })` per the design: DOM with `h()`,
      `crt-on`, focus on Play, pass 0 of `themeSong` on `'music'`, tick counting with
      `passesBetween` (new passes only in `menu` / `options`), `dispatch` through `titleStep`
      applying `openOptions` (mount dialog, `inert` on `.title-menu`), `closeOptions` (unmount,
      remove `inert`, focus Options), `startFade` (`fadeOut(0.6)`, hand off the Voice) and
      `finish` (stop the loop, `signal('play')` last); unmount stops the loop, the dialog and the
      theme unless handed off; never sets a power handler
    - `title.css`: layout, night scenery, wordmark glow, flicker and red ghost copy, buttons,
      options backdrop, `prefers-reduced-motion` block; colours only through `var(--c-…)`
    - `src/styles/theme.css`: add the `--c-titlescreen-*` and `--c-options-backdrop` tokens from
      the design
    - _Requirements: 1.6, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 3.1, 3.2, 3.5, 3.7, 3.9, 4.6, 4.7, 12.1, 12.2, 12.3, 12.5_

  - [x] 2.10 Write Title_Scene tests in `tests/scenes/title/titleScene.test.ts`
    - Examples from the design: DOM order and copy, `crt-on`, focus on Play; first voice
      `themeSong` on `'music'` for 24 s; a second pass at tick 1,440 and not at 1,439; Play →
      `fadeOut(0.6)`, `signal('play')` after 36 ticks and not after 35; a second Play and an
      Options click during the fade do nothing; Play while Options is open does nothing; Options
      neither stops nor fades the theme; unmount without a fade stops the theme, unmount during a
      fade (`fades: 'manual'`) does not; with an unavailable fake engine Play still signals; no
      `document` or `window` listeners after unmount
    - _Requirements: 1.6, 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 3.2, 3.5, 3.7, 3.9, 4.6, 4.7, 12.2_

- [x] 3. Checkpoint: audio, settings and title pieces
  - Run `npm run typecheck` and `npm test`. Ensure all tests pass, including every existing test
    unchanged; ask the user if questions arise.

- [x] 4. Scene flow through the title screen
  - [x] 4.1 Wire the Title_Scene into the shell
    - `src/core/scene.ts`: `'title'` scene id, `'play'` signal, the design's five transitions,
      comments from "four" to "five" scenes
    - `src/scenes/index.ts`: optional `settings` in `ShellDeps` (default a memory-only store),
      `title` factory with `createTitleScene({ audio, settings, signal, startLoop })`
    - `src/main.ts`: import `./styles/title.css`; `createSettingsStore()`,
      `bindAudioSettings(audio, settings)` before `director.start()`, pass `settings` to
      `buildSceneFactories`; call the unbind function in the HMR dispose
    - `src/scenes/powerOffScene.ts`: doc comment says power-on leads to the title screen
    - Update the power-on step in `tests/core/scene.test.ts` (ids, signals, expected
      transitions, examples) and `tests/scenes/index.test.ts` (press power → title → Play → 36
      ticks → boot, loop start counts, boot cue indices) exactly as the design's "Existing tests
      that change" lists; change nothing else in either file
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.7, 1.8, 5.11_

  - [x] 4.2 Extend `tests/core/scene.test.ts` and `tests/scenes/index.test.ts`
    - **Property 1: The scene flow passes through the title screen** (extend both existing
      Property 1 tests with the title and boot rules; tag them with both features)
    - Shell examples: the power button is ignored on the title screen (`expectPowerIgnored`);
      Options and Escape leave the title mounted; power off → title → boot → desktop → shutdown
      → power off → title again
    - **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 2.6**

- [x] 5. Screen shake preference
  - [x] 5.1 Pass View_Prefs to Session_Views and honour them in the Lane_View
    - `src/dialup/session.ts`: `ViewPrefs`, frozen `DEFAULT_VIEW_PREFS`, optional
      `SessionContext.prefs`; `start(host)` sets `ctx.prefs = host.prefs ?? DEFAULT_VIEW_PREFS`;
      nothing else reads it
    - `src/render/laneEffects.ts`: pure `laneShake(enabled, tick, shakeUntilTick)`
    - `src/render/laneView.ts`: store `ctx.prefs?.screenShake ?? true` at mount and draw with
      `laneShake` instead of `shakeOffset`
    - `src/scenes/desktop/desktopScene.ts`: optional `viewPrefs` dep (default
      `() => DEFAULT_VIEW_PREFS`), read once per Session start and passed as `prefs` in
      `s.start(...)`
    - `src/scenes/index.ts`: pass `viewPrefs: () => ({ screenShake: settings.get().screenShake })`
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

  - [x] 5.2 Write shake tests in `tests/render/laneEffects.test.ts`, `tests/render/laneView.test.ts` and `tests/scenes/desktop/desktopScene.test.ts`
    - **Property 10: Turning screen shake off removes the offset and nothing else**
    - **Property 11: The screen shake setting never changes the Run** (use `laneRunSystems` /
      `arbLaneRun` from `tests/helpers/lane.ts`, a manual loop and a script view; at most 600
      ticks)
    - Examples: a Lane_View with shake off uses a zero transform offset right after a
      `modemHit` while the modem still shows `hit`; the Desktop_Scene gives a registry view
      `ctx.prefs` from `viewPrefs`, and `DEFAULT_VIEW_PREFS` without it
    - **Validates: Requirements 7.1, 7.2, 7.3, 7.4**

- [x] 6. Result screen
  - [x] 6.1 Create `src/ui/resultScript.ts` and `src/ui/resultCopy.ts`
    - `Outcome`, `ResultStage`, `ResultScript`, `RESULT_SCRIPT` (1,200 / 1,500 ms),
      `ResultModel`, `resultModel` (outcome from the phase only, `null` otherwise; integrity
      through `integrityView`; download `floor` clamped to 0..100), `formatRunTime`,
      `resultStageAt`
    - `RESULT_COPY` exactly as in the design (follow `retro-copy`)
    - _Requirements: 8.2, 8.5, 8.6, 9.3, 10.3, 12.4_

  - [x] 6.2 Write result script tests in `tests/ui/resultScript.test.ts`
    - **Property 12: The result screen reads its outcome and statistics from the final state**
    - **Property 13: The ending reveals once, at its script time, and never goes back**
    - Examples: `RESULT_SCRIPT` values; `formatRunTime(0)` `0:00`, `9060` `2:31`, `-5` `0:00`;
      `resultModel` of a `downloading` state is `null`
    - **Validates: Requirements 8.2, 8.5, 8.6, 9.2, 9.3, 10.2, 10.3**

  - [x] 6.3 Create `src/ui/resultSounds.ts`
    - `ResultSoundId`, `RESULT_SOUND_SEC` (1.6, 1.2, 1.5), the `handshakeChime`, `modemScreech`
      and `staticHiss` recipes from the design's table (soundKit recipe rules, seeded noise,
      oscillators, filters and gains only), `resultSoundsFor(outcome)`
    - _Requirements: 9.1, 10.1, 12.6_

  - [x] 6.4 Write result sound tests in `tests/ui/resultSounds.test.ts`
    - `resultSoundsFor` maps `won` and `lost`; each recipe on `createFakeAudioContext()` creates
      nodes, stops every source by its end and survives a double stop; `staticHiss` is seeded
      (two runs schedule the same gain values)
    - _Requirements: 9.1, 10.1, 12.6_

  - [x] 6.5 Create `src/ui/resultScreen.ts`, `src/styles/result.css` and the result tokens
    - `ResultScreenFactory` and `createResultScreen({ final, audio, onClose, startLoop, script })`
      per the design: the DOM contract with `h()` and text nodes (`iconEl('file')` for the file
      icon), sounds on the Sfx_Channel at mount, tick counting with `resultStageAt`, reveal (show
      parts, hide static, stop the loop, focus Back), Back → `onClose()`, unmount stops the loop
      and every Voice and removes the elements; no `document` or `window` listeners
    - `result.css`: overlay at z-index 6 over the whole Screen, centred window using the desktop
      chrome classes, download bar, static layers with a `steps(6)` animation and the blinking
      "NO CARRIER", `prefers-reduced-motion` block; colours only through `var(--c-…)`
    - `src/styles/theme.css`: add the `--c-result-*` and `--c-static-*` tokens from the design
    - `src/main.ts`: import `./styles/result.css`
    - _Requirements: 8.5, 8.6, 9.1, 9.2, 10.1, 10.2, 11.1, 11.2, 11.4, 12.1, 12.2, 12.3, 12.5_

  - [x] 6.6 Write Result_Screen tests in `tests/ui/resultScreen.test.ts`
    - Examples from the design: won intro and the reveal at 72 ticks (not 71) with the headline,
      `funny_cats_1998.avi`, stats, focused Back and a stopped loop; lost intro with static,
      "NO CARRIER", both sounds and a hidden window, and the reveal at 90 ticks with the
      termination text, a bar frozen at the final percentage, `SKELETON_DATING_SIM.EXE`, stats
      and focused Back; zero-tick frames change nothing; Back calls `onClose`; unmount stops the
      loop and every Voice, removes the elements and leaves no listeners
    - _Requirements: 8.5, 8.6, 9.1, 9.2, 10.1, 10.2, 11.1, 11.2, 11.4, 12.2_

- [x] 7. Show the result on the desktop
  - [x] 7.1 Show the Result_Screen by default in `src/scenes/desktop/desktopScene.ts` and update the two affected desktop tests
    - `desktopScene.ts` (design D12): optional `resultScreen` dep as a test seam only, resolved
      once as `deps.resultScreen ?? ((final, onClose) => createResultScreen({ final, audio,
      startLoop: deps.startLoop, onClose }))`; `onEnd: (final) => onRunEnd(final)` that calls
      `endSession()` and then, with a non-null `resultModel(final)`, `showResult(final)` (close
      the Start_Menu, `inert` on every current child, mount the overlay last); `closeResult()`
      unmounts it and removes `inert`; `startSession()` and `onChoose('shutDown')` return early
      while it is shown; `unmount()` unmounts it first; update the header comment (a Run's end
      always shows the Result_Screen; the desktop is idle again once it closes)
    - `src/scenes/index.ts`: no change for results; `buildSceneFactories` passes no
      `resultScreen`
    - `tests/scenes/desktop/desktopScene.test.ts`, exactly as the design's "Existing tests that
      change" lists: `setup()` creates a second manual loop `resultLoop`, returns it on the
      `Harness` and passes `resultScreen: (final, onClose) => createResultScreen({ final, audio,
      startLoop: resultLoop.start, onClose })`; add the helper `backToDesktop(root, resultLoop)`
      (`resultLoop.frame(90)`, then click `.result-screen .result-back`)
    - In "ends the Session when a registry system deals 100 damage at tick 5 (Req 10.6, 10.7,
      10.11)": add `resultLoop` to the destructured names and insert one
      `backToDesktop(root, resultLoop)` call after the "No further ticks run" check and before
      the `// "Shut Down..." works again.` block
    - In "can start a new Session after one ends": add `resultLoop` to the destructured names and
      insert one `backToDesktop(root, resultLoop)` call after
      `expect(loop.isRunning()).toBe(false)` and before `connectButton(root).click()`
    - In both tests every assertion stays exactly as it is and in the same place; no assertion is
      loosened, removed or moved. The dismiss step reflects that retro-shell decision 8 ("After a
      Run ends the desktop returns to its idle state") is superseded: the idle desktop now comes
      after the Result_Screen is dismissed (requirements decision 8)
    - Every other test in the file, including "shrinks the window area during a Session and grows
      it back after (Req 10.10, 6.8)", must pass with no edit; if one fails, fix the code or stop
      and ask
    - _Requirements: 8.1, 8.3, 8.4, 11.2, 11.3, 11.4_

  - [x] 7.2 Write result flow tests in `tests/scenes/desktop/desktopScene.test.ts` and `tests/scenes/index.test.ts`
    - Desktop with the harness's result screen from task 7.1 and a system dealing 100 damage at
      tick 5: Lane_Dock hidden, overlay last child, every other child `inert`, Start_Menu
      closed; Connect does nothing; "Shut Down..." signals nothing; Back removes the overlay and
      `inert` and Connect starts a new Session; unmount while the overlay is shown stops its loop
      and sounds
    - Default result screen: add a `setup` option that omits the `resultScreen` dep; after the
      same loss the real `.result-screen.is-lost` is shown, `loop.startCount()` is 2 (its loop
      runs on the desktop's `startLoop`), and Back after 90 ticks returns to the idle desktop
    - Shell flow: with a registry system that ends the Run, power on → title → Play → boot →
      desktop → Connect → lose screen → Back to Desktop → idle desktop that can dial again
    - _Requirements: 8.1, 8.3, 8.4, 11.2, 11.3, 11.4_

  - [x] 7.3 Extend the repository scans in `tests/copy.test.ts` and create `tests/styles.test.ts`
    - Add `TITLE_COPY`, `OPTIONS_COPY` and `RESULT_COPY` to `COPY_TABLES`
    - `styles.test.ts` (use `tests/helpers/repo.ts` and `stripComments(..., 'css')`):
      `src/styles/title.css` and `src/styles/result.css` contain no hex, `rgb()`/`rgba()` or
      `hsl()`/`hsla()` literals, and every `var(--c-…)` they use is defined in `theme.css`
    - _Requirements: 3.8, 12.3, 12.4, 12.5, 12.6_

- [x] 8. Checkpoint: title, options and endings playable in the shell
  - Run `npm run typecheck`, `npm test` and `npm run build`. Ensure all tests pass; ask the user if
    questions arise.

- [x] 9. Documentation
  - [x] 9.1 Update `docs/game-design.md`
    - Section 1 step 1: "Power on → title screen (theme song, Play game, Options) → BIOS →
      splash → desktop. Always played, never skipped."; step 5 says the result screen opens over
      the desktop
    - Section 9: add a row for the title screen before the BIOS (sets the mood and gives Options
      a home while the BIOS, desktop and dial-up still play every time) and a row for Settings in
      `localStorage` with a fail-safe fallback (set once; blocked or bad storage starts on
      defaults instead of failing)
    - _Requirements: 13.1, 13.2_

  - [x] 9.2 Update `docs/roadmap.md`
    - Add milestone `3b` `title-and-endings` after `connection-lane`: title screen with synthesized
      theme, Options (volume, music, sound effects, screen shake) in `localStorage`, win / lose
      result screens over the desktop; Kiro features: Spec (requirements first), PBT (settings
      round trip, store model), `retro-copy` steering, `playtester` agent
    - Milestone 8 `juice-and-endings` contents: screen shake, crack and corruption overlays,
      audio polish (the win / lose endings move out)
    - _Requirements: 13.3, 13.4_

  - [x] 9.3 Record the retro-shell supersession and the log note
    - `.kiro/specs/retro-shell/requirements.md`: a one-line note under Requirement 1.2 and under
      decision 8 pointing to `title-and-endings` Requirement 1.1 and Requirements 8–11 (decision
      8: the idle desktop now comes after the Result_Screen is closed)
    - `docs/kiro-log.md`: one dated line under "Notes" describing the title-and-endings spec
      (title scene and theme, settings store, result screens) and its property count (13)
    - _Requirements: 13.1, 13.3_

- [x] 10. Playtester smoke run
  - Invoke the `playtester` custom agent (`.kiro/agents/playtester.md`, Playwright MCP) to play
    power-on → title screen (theme playing) → Options (move the volume, untick Screen shake,
    close with Escape) → Play game → boot → desktop → dial-up → do not hammer and let the modem
    die → lose screen (static, "NO CARRIER", "Connection terminated" dialog,
    `SKELETON_DATING_SIM.EXE`) → Back to Desktop, checking keyboard Enter on the Play button and
    that the lane does not shake with the option off, and write a report to
    `docs/playtests/YYYY-MM-DD-title-and-endings-smoke.md`
  - If the dev server or Playwright MCP is unavailable, skip this task and say so in the final
    summary
  - _Requirements: 2.1, 2.3, 3.1, 4.1, 7.2, 10.1, 10.2, 11.3_

- [x] 11. Final checkpoint
  - Run `npm run typecheck`, `npm test` and `npm run build`. Ensure all tests pass; ask the user if
    questions arise.
  - Manual check in `npm run dev` (port 3000): the theme loops without a gap at 24 s; Play fades
    it in about 0.6 s; volume, music and sound-effects changes are audible at once; settings
    survive a reload; the lose screen appears when the modem dies and Back returns to a desktop
    that can dial again.

## Notes

- Tasks marked with `*` are optional test tasks and can be skipped for a faster MVP. Tasks 4.1
  and 7.1 are not optional: 4.1 updates the two existing tests whose power-on step this feature
  changes, and 7.1 adds the dismiss step to the two desktop tests that the default-on
  Result_Screen would otherwise block.
- Each task references specific requirements for traceability.
- Property tests validate the 13 universal properties in `design.md`; example tests cover
  timings, DOM and edge cases.
- Never weaken a failing test. Only `tests/core/scene.test.ts` and `tests/scenes/index.test.ts`
  change existing expectations, and only for the power-on step (requirements decision 8). In
  `tests/scenes/desktop/desktopScene.test.ts` the harness gains `resultLoop` and
  `backToDesktop`, and "ends the Session when a registry system deals 100 damage at tick 5" and
  "can start a new Session after one ends" each gain one dismiss call with their assertions
  unchanged (task 7.1). `tests/helpers/audio.ts` only gains features.
- `docs/game-design.md` is the source of truth; task 9.1 applies the edit the team approved with
  the requirements (requirements decision 10).

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3", "2.1", "2.3"] },
    { "id": 2, "tasks": ["1.4", "2.2", "2.4", "2.5", "2.7"] },
    { "id": 3, "tasks": ["2.6", "2.8", "2.9"] },
    { "id": 4, "tasks": ["2.10"] },
    { "id": 5, "tasks": ["3"] },
    { "id": 6, "tasks": ["4.1", "6.1", "6.3"] },
    { "id": 7, "tasks": ["4.2", "5.1", "6.2", "6.4", "6.5"] },
    { "id": 8, "tasks": ["6.6", "7.1"] },
    { "id": 9, "tasks": ["5.2", "7.3"] },
    { "id": 10, "tasks": ["7.2"] },
    { "id": 11, "tasks": ["8"] },
    { "id": 12, "tasks": ["9.1", "9.2", "9.3"] },
    { "id": 13, "tasks": ["10"] },
    { "id": 14, "tasks": ["11"] }
  ]
}
```
