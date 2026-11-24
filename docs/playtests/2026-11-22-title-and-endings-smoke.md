# Playtest: title screen, Options and lose ending (smoke)

- Date: 2026-11-22
- Spec: `.kiro/specs/title-and-endings/requirements.md`
- Build: Vite dev server on http://localhost:3000 (already running, not restarted)
- Browser: Playwright MCP (Chromium), viewport about 1490x817
- Instrumentation (browser-side only, via `page.addInitScript`): `localStorage['phantom98.settings']`
  cleared before load; `AudioContext` wrapped to count oscillators, buffer sources and gain nodes,
  tag which voice gains connect to the music or sfx bus, log `linearRampToValueAtTime` calls and
  read master / music / sfx gain values; `CanvasRenderingContext2D.prototype.setTransform` wrapped
  to record max |e| and |f| for canvases attached to the document. For the second lose run,
  `OscillatorNode.prototype.start` was also wrapped to log oscillator types.
- Times below are seconds after the Connect click unless marked otherwise.

## Summary

The full flow ran twice without skipping: power-off screen, title, Options, keyboard start, BIOS,
desktop, dial-up, two idle lose runs, Back to Desktop, a new connection, and a fresh tab to check
persistence. Every required check passed. The theme plays on the music bus from power-on, loops
every 24.0 s, keeps playing while Options is open and fades to 0 over exactly 0.600 s before the
BIOS appears. Volume and Screen shake changes reach storage and the master gain on the same key
press. With Screen shake off, the visible lane canvas got 35,268 `setTransform` calls across 19
modem hits and every one had e = f = 0. The lose ending shows static with a blinking NO CARRIER,
plays the screech and hiss, then shows the Connection Terminated window with correct copy, a 0%
frozen bar, `SKELETON_DATING_SIM.EXE`, stats `1:10 / 0% / 0%` and a focused Back to Desktop
button. I found no console errors or warnings. The only issues are small keyboard and screen
reader gaps, listed below.

## Checks

| # | Check (requirement) | Result | Evidence |
|---|---|---|---|
| 1 | Power button → Title_Scene (1.1) | PASS | Click on "Power" mounted `.scene.scene-title.crt-on`. `01-power-off.png`, `02-title.png` |
| 2 | CRT power-on effect, wordmark "DEAD LINE 56K", subtitle "a Phantom 98 nightmare", Play game and Options buttons (2.1) | PASS | Scene has class `crt-on` with CSS animation `crt-on`; h1 text, subtitle and both buttons are in the DOM and on screen. `02-title.png` |
| 3 | Focus on Play on mount (2.2) | PASS | `document.activeElement` = "Play game" at 50 ms, 300 ms, 800 ms and 1.5 s after power-on |
| 4 | Theme plays on the Music_Channel after power-on (3.1) | PASS | Context `running`; one voice gain connected to the music bus at power-on; 154 oscillators scheduled; master 0.6, music 1, sfx 1 |
| 5 | Theme loops (3.2, 3.3 range 16–32 s) | PASS | New music voices at page time 28.1 s, 52.1 s, 76.1 s and 100.1 s, so a pass is 24.0 s |
| 6 | Options dialog shows slider, % label and three checkboxes with defaults 100 / on / on / on (4.1) | PASS | Slider `#options-volume` 0–100 step 10, value 100, label "100%", Music / Sound effects / Screen shake all checked |
| 7 | Focus on the Volume_Slider when Options opens (4.2) | PASS | `activeElement` = `INPUT#options-volume` (range) |
| 8 | Volume change updates the label, storage and audio (4.3, 4.5, 5.2) | PASS | Five ArrowLeft presses gave 90 / 80 / 70 / 60 / 50; after each press the label, `aria-valuetext`, stored `masterVolume` and master gain (0.54 … 0.30 = 0.6 × vol/100) all matched |
| 9 | Unticking Screen shake updates storage (4.4) | PASS | Stored value became `{"v":1,"masterVolume":50,"musicEnabled":true,"sfxEnabled":true,"screenShake":false}`. `03-options.png` |
| 10 | Escape closes Options, focus returns to Options (4.6) | PASS | Dialog removed, `activeElement` = "Options". In the second tab the OK button did the same |
| 11 | Theme keeps playing while Options is open (4.7) | PASS | The 2nd and 3rd theme passes started while the dialog was open; context stayed `running` |
| 12 | Enter on the focused Play button starts the game (2.3) | PASS | Shift+Tab from Options moved focus to Play with no `.focus()` call; Enter started the fade. Space on Play also works (checked in the second tab) |
| 13 | Theme fades over 600 ms, then the BIOS starts (3.5, 3.6) | PASS | Music voice gains ramped to 0 from ctx time 76.709 to 77.309 (0.600 s); title still mounted at 519 ms, `.scene-boot` with NightOwl BIOS text at 622 ms |
| 14 | Boot → splash → desktop | PASS (BIOS, desktop) / NOT VERIFIED (splash) | BIOS text seen, desktop reached. My polling started after the boot had finished, so I did not see the splash stage |
| 15 | Zombies on the lane during dial-up | PASS | Two default zombies on the lane while the dialer reads "Logging on to network...". `04-dialup-lane.png` |
| 16 | Screen shake off → zero Shake_Offset (7.1, 7.2) | PASS | Run 1: 25,182 calls on the visible `.lane-canvas`, 10 modem hits. Run 2: 10,077 calls, 9 hits. `nonZero` = 0, max \|e\| = 0, max \|f\| = 0. Sampled 60 ms after the first hit: still 0. `05-lane-after-first-hit.png` shows the lane at rest after the first hit (integrity 90%). Limitation: I did not do a shake-on control run |
| 17 | Lose opens with static, Modem_Screech and Static_Hiss (10.1) | PASS | `.result-screen.is-lost` with `.result-static` over the whole screen; `.result-static-text` "NO CARRIER" uses animation `result-static-blink` (visibility toggled hidden → visible between samples). Audio at the death tick: square + two sawtooth oscillators and a noise buffer source (the `modemScreech` recipe), plus another noise buffer source (`staticHiss`), all on the sfx bus. `06-lose-static-no-carrier.png` |
| 18 | Reveal after 1,500 ms (10.3) | PASS | The window was `display:none` at 0.93 s and `flex` at 1.33 s after detection. Detection lagged the screech start by about 0.23 s, so the reveal fell between 1.16 s and 1.56 s after open |
| 19 | Connection Terminated dialog content (10.2) | PASS | Title "Connection Terminated", "The connection was terminated by the remote computer.", bar "0%", `SKELETON_DATING_SIM.EXE` / "Estimated time left: forever". `07-lose-dialog.png`, `07b-lose-dialog-run2.png` |
| 20 | Run statistics (8.6) | PASS | Session time 1:10, Modem integrity 0%, Downloaded 0%, in both runs (death about 69.8–70.2 s after Connect) |
| 21 | Back to Desktop gets focus when it appears (11.1) | PASS | `activeElement` = "Back to Desktop" from the reveal onward |
| 22 | Desktop gets no pointer input under the overlay (8.3) | PASS | `elementFromPoint` at five spots (icons, Start button, centre, tray) all hit `.result-screen`. A real double-click on README.TXT and a click on Start opened nothing |
| 23 | Back to Desktop closes the overlay; idle desktop; dialer can start a new Session (11.2, 11.3) | PASS | Overlay removed, dialer back to its Connect / Cancel form, lane dock hidden. Clicking Connect started a new Session (lane visible, integrity 100%, "Dialing 555-0199..."). In run 2, Enter on the focused Back button also closed it. `08-back-to-desktop.png`. The "stop every Result_Screen sound" part of 11.2 is NOT VERIFIED because the 1.2 s and 1.5 s sounds had already ended |
| 24 | Settings persist after reload (5.1) | PASS | Fresh tab without the init script: stored value intact; Options shows 50% and Screen shake unticked, Music and Sound effects ticked. `09-options-after-reload.png` |
| 25 | Console clean | PASS | No errors or warnings on the game tab at any step. One Chromium verbose message: "[DOM] Password field is not contained in a form" (dialer password field) |

## Bugs

### B1. Title wordmark's accessible name is read twice (minor, accessibility)

- Steps: power on, open the accessibility tree (or use a screen reader) on the title screen.
- Expected: the heading reads "DEAD LINE 56K".
- Actual: the heading's accessible name is "DEAD LINE 56K DEAD LINE 56K".
- Cause: the red ghost layer is `.title-wordmark::after { content: attr(data-text); }`
  (`src/styles/title.css` lines 141–145). Chromium includes CSS generated content in the
  accessible name. Possible fix: use the alt-text form `content: attr(data-text) / "";`, or move
  the ghost copy into an `aria-hidden` element.
- Screenshot: `02-title.png` (looks correct; the problem only shows in the accessibility tree).
- Console errors: none.

### B2. Keyboard focus falls to `<body>` after Back to Desktop (minor, accessibility)

- Steps: lose a run, press Enter or click Back to Desktop.
- Expected: focus lands on something useful on the idle desktop, such as the dialer's Connect
  button or the active window. The spec does not require a target, so this is a polish item.
- Actual: `document.activeElement` is `BODY` in both runs. A keyboard-only player has to Tab from
  the top of the page to reach Connect.
- Screenshot: `08-back-to-desktop.png`.
- Console errors: none.

Note: during the 1.5 s static stage, focus is also on `<body>` (nothing on the desktop is
focused), so keyboard input does not reach a desktop control while the overlay is up. I did not
test whether document-level desktop key handlers react during that window.

## Design gaps

These differences from `docs/game-design.md` are expected for this milestone. I list them so
they are tracked, not as bugs.

- The browser front is not built yet (milestone 4), so the download can never start. The lose bar
  is frozen at 0% and the win ending cannot be reached in real play (spec decision 9).
- Section 3, chapter 6 / section 8: at critical integrity (14% and below) the lane HUD shows
  "Line noise detected. Something is chewing the cable." but there is no crack or corruption
  overlay and no shake (shake was off for this run). Those belong to `juice-and-endings`.
- Section 3, chapter 7 writes the dialog name as "Connection terminated". The game uses the title
  case "Connection Terminated" as a window title. This is fine for a 1998 window title; I only
  mention it in case the copy should match exactly.
- An idle player dies at about 1:10, before the tank arrives (midpoint, 1:10–1:30). That is a
  reasonable fail state for doing nothing.

## Feel

- 0:00 (power-on): the title card looks good. The green phosphor wordmark, moon, telephone poles
  and the "(C) 1998 Graveyard Shift Software. All souls reserved." footer set the mood well. The
  grey 98-style buttons are small (166x21) next to the large wordmark. They are readable, but a
  little more size or hover glow would make "Play game" pop in the demo video.
- Options: compact and clear. "Changes take effect immediately." is useful because there is no
  Cancel button. The volume change is audible on each arrow press.
- Play → BIOS: the 0.6 s fade into the BIOS feels smooth, with no gap or click in the gain log.
- Dial-up (0–20 s): two default zombies are already walking during "Logging on to network...",
  which matches chapter 1.
- Each mob and the modem show a small "00" glyph label above them (`04-dialup-lane.png`,
  `05-lane-after-first-hit.png`). I assume this is placeholder sprite art. If it is meant to show
  HP, it is unreadable at this size.
- Modem hit timeline, idle run 1: 27.9 s 90%, 33.9 s 80%, 39.9 s 70%, 45.9 s 60%, 52.0 s 50%,
  52.2 s 42% (first fast), 58.0 s 32%, 59.2 s 24% (fast), 63.9 s 14% (critical note appears),
  66.2 s 6% (fast), about 69.8 s dead. Run 2 died at 70.2 s. Default bites land on a steady 6 s
  beat, which is easy to read.
- With shake off, hits are still readable through the integrity bar and the bite sound. Without
  any shake the impact is subtle; a short HUD flash would help motion-sensitive players. That
  belongs to `juice-and-endings`.
- Lose ending: the static plus blinking NO CARRIER is a strong, readable beat, and 1.5 s is the
  right length. The Connection Terminated window looks like a real 1998 dialog. "Estimated time
  left: forever" is a good joke. The red monospace file name stands out. The white text in the
  0% bar has a dark outline that looks slightly doubled at 1x scale (`07-lose-dialog.png`); this
  is cosmetic.

## Screenshots

All in `docs/playtests/2026-11-22-title-and-endings-smoke/`:

- `01-power-off.png`: power-off screen (overwrote the leftover file)
- `02-title.png`: title screen
- `03-options.png`: Options at 50%, Screen shake off
- `04-dialup-lane.png`: lane during dial-up, run 2
- `05-lane-after-first-hit.png`: lane 60 ms after the first modem hit, run 1 (integrity 90%)
- `06-lose-static-no-carrier.png`: lose static stage, run 2
- `07-lose-dialog.png`: Connection Terminated window, run 1
- `07b-lose-dialog-run2.png`: Connection Terminated window, run 2
- `08-back-to-desktop.png`: idle desktop after Back to Desktop
- `09-options-after-reload.png`: Options in a fresh tab, settings kept

Files 01–03 and 07 are at CSS scale (1490x817). The others were saved by `page.screenshot` at
device scale (2980x1634).

## Limitations

- No shake-on control run, so this test shows shake is off when disabled. It does not show that
  shake works when enabled (7.3).
- I did not see the splash stage (polling started late).
- I did not verify that Back to Desktop stops still-playing result sounds (11.2), because they had
  ended before the click.
- Recipe names are not visible through Web Audio. The screech and hiss were identified by their
  node pattern (square LFO + two sawtooths + noise for `modemScreech`, noise source for
  `staticHiss`), matching `src/ui/resultSounds.ts`.
