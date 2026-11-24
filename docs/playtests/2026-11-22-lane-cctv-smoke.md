# Playtest: lane CCTV (smoke)

- Date: 2026-11-22
- Spec: `.kiro/specs/lane-cctv/requirements.md`
- Build: Vite dev server on http://localhost:3000 (already running, not restarted)
- Browser: Playwright MCP (Chromium), viewport about 1490x817, **devicePixelRatio 2** (lane
  canvas backing store 2048x520 for a 1024x260 CSS box)
- Instrumentation (browser-side only): a `requestAnimationFrame` loop logged changes of
  `.cctv-status`, `.cctv-osd.is-tearing` and `.lane-hud-value`, and sampled the lane canvas
  mean brightness every frame (downscaled to 32x8) for the flash check. Canvas frames were
  captured with `toDataURL` when "SIGNAL WEAK" appeared. Times are seconds after Connect.
- Runs: run 1 went through power-off, title (Play game), BIOS, desktop, dial-up. Runs 2 and 3
  used the end screen's **Retry**, which redials with the full 20 s dial-up and raid
  (design doc 1.5). Run 1's timed captures were lost because real time passed between tool
  calls, so the timed checks come from runs 2 and 3.

Note on numbering: the task brief cited Req 1.1/1.5, 4.1/5.1, 2.1 and 6.1/7.1. In the spec,
Feed_Startup is Req 3, Signal_Tear Req 4, Signal_Dropout Req 5, Motion_Box Req 6, aim
safety Req 7 and flashes Req 8. This report uses the spec numbers.

## Summary

All CCTV beats appear at the right times: "CONNECTING CAMERA..." for 0.57 s after Connect,
a yellow MOTION box on the first zombie at 8.3 s, static bands right after the first modem hit
(27.4 s), and "SIGNAL WEAK" for 0.13 s at 44.4 s, two seconds after integrity went critical.
Hammer clicks still kill zombies while the effects run, and no canvas frame changed brightness
by more than 7% of full scale. One visible bug: on a 2x display every full-canvas camera
effect (grain, vignette, startup static, tear bands, dropout noise) covers only the
**top-left quarter** of the lane. No console errors or warnings.

## Checks

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Feed_Startup "CONNECTING CAMERA..." (Req 3.1) | PASS, with bug 1 | `05-feed-startup.png` (run 1). Status text from 0.00 s to 0.572 s (about 34 ticks, spec 36) |
| 2 | Motion_Box on a new zombie (Req 6.1) | PASS | `12-motion-box.png` at 8.3 s: yellow box labelled MOTION around the first zombie at the manhole. Also visible on the newest zombie in `canvas-weak.png` |
| 3 | Signal_Tear after a modem hit (Req 4.1) | PASS, with bug 1 | `14-signal-tear.png`, taken about 0.6 s after the first hit at 27.42 s, shows horizontal static bands, only in the left half of the top of the feed. `.cctv-osd.is-tearing` never switched on; see Design gaps |
| 4 | Critical integrity → "SIGNAL WEAK" (Req 5.1, 5.2) | PASS, with bug 1 | Critical (16%) at 42.42 s. "SIGNAL WEAK" from 44.421 s to 44.551 s (130 ms, about 8 ticks, limit 9). One dropout before the loss at 45.43 s. `16-signal-weak.png` (page), `canvas-weak.png` (canvas frame at the dropout), `15-critical.png` |
| 5 | Hammer kills with effects on (Req 3.2, 7.1) | PASS | Run 3: two clicks at 17.52 s and 17.88 s on the second zombie (lane x 659 and 645). `17-after-kill.png` shows it gone. The next hits took 4 per hit (84 → 80 → 76 → 72 from 33.38 s), so only one zombie reached the modem instead of two |
| 6 | KB drop after the kill | PARTIAL | A faint packet shape is visible near the kill spot in `17-after-kill.png`. The HUD has no KB counter yet (it belongs to `economy-weapons`), so I could not confirm collection |
| 7 | Flashes at most 3 per second (Req 8.1) | PASS (canvas only) | 10,892 frames sampled in run 2. Largest frame-to-frame change 18.2/255 (7.1%), under the 10% Flash threshold, so 0 flashes. DOM overlays were not measured |
| 8 | Effects do not shift click targets (Req 7.1–7.3) | PASS | `.cctv-osd` has `pointer-events: none`. Clicks computed from `laneLayout.ts` with no correction landed on the zombie. Tear bands are overlays; zombies stay in place in `14-signal-tear.png` |
| 9 | Console clean | PASS | 0 errors, 0 warnings (one DOM verbose note about the password field outside a form) |

## Bugs

### Bug 1: camera effects cover only the top-left quarter of the lane on HiDPI screens (Medium-High)

- Steps: on a display with `devicePixelRatio` 2, go through the startup and dial.
- Expected: grain, vignette, startup static, Signal_Tear bands and Signal_Dropout noise cover
  the whole feed (Req 1.1, 1.2, 3.1, 4.2, 5).
- Actual: they fill a rectangle of 1024x260 **backing pixels**, which is the top-left quarter
  of the 2048x520 canvas. The rest of the feed has no grain or vignette, and a hard edge runs
  across the middle of the lane. Very visible in `05-feed-startup.png` and `canvas-weak.png`,
  and as a darker, grainier block in every other screenshot.
- Likely cause: `src/render/cctv/cctvDraw.ts` resets the transform with
  `g.setTransform(1, 0, 0, 1, 0, 0)` (lines 36, 62, 89, 105, 117) and then fills
  `rect.width` x `rect.height` in CSS px (lines 45, 49, 68, 73, 95, 108, 120–124). It should
  either use `setTransform(dpr, 0, 0, dpr, 0, 0)` as `laneView.ts` does (lines 244–257) or
  fill `rect.width * dpr` x `rect.height * dpr`. The unit tests probably run at dpr 1, which
  hides it. This hurts the Costume Contest look on most laptops.
- Console errors: none.

## Design gaps

- `.cctv-osd.is-tearing` never appeared during 13 modem hits. The code sets it only when
  Screen_Shake is enabled (`src/render/cctv/cctvOsd.ts` line 50). Either Screen_Shake is off
  by default or not read here. I did not check the Options value. If shake is on by default,
  the OSD jitter during tears is missing.
- The first Signal_Dropout comes a full 120 ticks after integrity turns critical, and
  `hash32(cycle) % 3` can skip a cycle (`cctvState.ts` line 67). In this run the player saw
  "SIGNAL WEAK" once, 1 s before losing. Design doc section 8 says the feed "starts losing
  signal" at critical, so showing the first dropout sooner may read better. This is a feel
  question, not a spec violation.
- No KB counter in the HUD yet, so check 6 is partial (expected, `economy-weapons`).

## Feel

- 0.0–0.6 s: the startup is short and reads well, but the static block covers only part of
  the screen (bug 1), so it looks like a drawing glitch rather than a camera turning on.
- 8.3 s: the yellow MOTION box is the clearest cue on the lane and catches the eye even with
  the dialer open.
- 27.4 s onward: tear bands show on each hit. With three zombies at the modem by 39 s,
  integrity fell 12% every 1.5 s. An idle player loses at about 45 s, during plot turn 1
  (lane-melee tuning, already noted in the lane-melee report).
- 44.4 s: "SIGNAL WEAK" is easy to miss at 130 ms and comes too late to warn the player.

## Screenshots

All in `docs/playtests/2026-11-22-lane-cctv-smoke/`:

- `00-power-off.png`, `01-title.png`, `02-bios.png`, `03-desktop.png`, `04-dialer.png`: startup
- `05-feed-startup.png`: "CONNECTING CAMERA..." (run 1)
- `06-feed-live.png`: feed after startup (run 1)
- `07-motion-box.png`, `08-kill-packet.png`, `09b-after-first-hit.png`: run 1, mistimed (lose
  screen and "NO CARRIER"); kept for the record
- `10-run1-lose-dialog.png`: Connection Terminated dialog with Retry / Main menu
- `11-feed-startup-retry.png`: run 2 startup (taken after the 0.6 s startup ended)
- `12-motion-box.png`: Motion_Box at 8.3 s
- `13-after-kill-packet.png`: run 2, kill attempt missed (my click used a canvas rect measured
  while the dock was still sliding in)
- `14-signal-tear.png`: tear bands after the first hit
- `15-critical.png`: integrity 16%
- `16-signal-weak.png`: page right after the dropout (the 130 ms dropout ended before the
  screenshot finished)
- `canvas-weak.png`: lane canvas captured on the dropout frame
- `17-after-kill.png`: run 3, zombie killed by the hammer

## Limitations

- Flash check covered the canvas only, not DOM overlays or the Monitor scanlines.
- Audio (Camera_Hum, Camera_Static) was not checked.
- Bug 1 was seen at dpr 2 only. I did not test at dpr 1.
