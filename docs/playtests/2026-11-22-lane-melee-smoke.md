# Playtest: lane melee (smoke)

- Date: 2026-11-22
- Spec: `.kiro/specs/lane-melee/requirements.md` (task 6). This run also closes
  connection-lane task 10 (the playtest left open there).
- Build: Vite dev server on http://localhost:3000 (already running, not restarted)
- Browser: Playwright MCP (Chromium), viewport about 1490x817
- Instrumentation (browser-side only, via `page.addInitScript`): `OscillatorNode.prototype.start`
  wrapped to log time and oscillator type. The HUD value `.lane-hud-value` was polled every
  ~40 ms. Hammer clicks were sent with `page.mouse.click` at canvas positions computed from
  `src/render/laneLayout.ts` and the default speed (40 units/s).
- Times below are seconds after the Connect click.

## Summary

The full flow ran without skipping: power-off screen, title, Play, BIOS, desktop, dial-up. The
first default zombie reached the modem at 27.4 s, stayed there and hit it seven times, 4 damage
every 1.5 s, first hit on arrival. To keep it the only attacker, every later default zombie was
hammered on the walk. The attacker was killed with the hammer at about 36.8 s. After that,
integrity held at 72% until the script ended at 48 s. The arrival fired the two-sawtooth
`zombieGroan` pattern once, and every hit fired the `modemCrunch` square. The attacker is drawn
in a different, arms-out pose at the modem. No console errors or warnings. No bugs found.

## Checks

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Zombie stays at the modem rather than vanishing | PASS | Same zombie visible at the modem in `09-t31-at-modem.png` and `10-t35.7-before-kill.png`; integrity kept falling for 9 s after arrival |
| 2 | Integrity drains in discrete steps, 4 every 1.5 s, first hit on arrival | PASS | 100% → 96% at 27.42, 92% at 28.90, 88% at 30.40, 84% at 31.93, 80% at 33.43, 76% at 34.93, 72% at 36.42. Gaps 1.48–1.53 s (40 ms polling). Arrival predicted at 27.45 s (spawn 8 s + 778 / 40); first hit landed at 27.42 s |
| 3 | Attack animation plays | PASS (visual, limited) | At the modem the placeholder shows an arms-out lunge pose with frame label `01` (`08-first-hit-attack.png`, `10-t35.7-before-kill.png`), different from the walk pose (`07-t25-approaching.png`). I could not check the 12-tick `attack` → `idle` timing from screenshots |
| 4 | Groan on arrival | PASS (node pattern) | Exactly two `sawtooth` oscillators started at 27.4 s, together with the first `square` crunch, and none at any other hit. This matches the `zombieGroan` recipe (`src/render/laneSounds.ts` lines 190–205). I did not listen to the output, and Web Audio does not expose recipe names |
| 5 | Hammer kill stops the drain | PASS | Hammer clicks at 36.20 s and 36.84 s (sine thuds logged). One more hit landed at 36.42 s, between the two hammer hits (HP 2). No change from 72% between 36.42 s and 48 s. `11-t38.5-after-kill.png` shows the modem clear |
| 6 | Boot → splash → desktop | PASS (BIOS, desktop) / NOT VERIFIED (splash) | Scene classes: title, then `scene-boot` at 0.6 s, `scene-desktop` at 8.6 s. No separate splash scene class, so I could not detect the splash stage |
| 7 | Console clean | PASS | No errors, warnings or page errors during the run |

## Bugs

None found.

## Design gaps

- The browser front is not built yet, so the dialer just shows "Connected at 28,800 bps." after
  20 s and the download cannot start. This is expected for this milestone.
- The placeholder sprites show frame-number labels (`00`, `01`) above each mob and the modem.
  These are expected until the team's frames land.

## Feel

- 27.4 s: the arrival is easy to read. The groan and the first crunch play together, then a
  steady 1.5 s crunch beat. That beat is much faster than the old 6 s bite rhythm, and the HUD
  ticking down every 1.5 s gives real pressure.
- An ignored default zombie costs 28% in about 9 s. At this rate an idle player would die much
  earlier than the old 1:10. That is a tuning question for the director milestone, not a bug.
- After my script stopped at 48 s, a fast zombie (spawn 45 s) reached the modem at 52.1 s.
  It fired its own groan and then crunched every 1.0 s (53.1, 54.1, ... 57.1 s), which matches
  the fast interval of 1 s.
- The hammer has to land twice on an attacker that keeps hitting, so one extra hit can land
  between the two swings (36.42 s here). This is fair and reads well.

## Screenshots

All in `docs/playtests/2026-11-22-lane-melee-smoke/` (device scale 2980x1634):

- `01-power-off.png`: power-off screen
- `02-title.png`: title screen
- `04-desktop.png`: desktop
- `05-dialer.png`: dial-up dialog before Connect
- `06-t10-dialing-lane.png`: lane during dialing
- `07-t25-approaching.png`: first zombie walking toward the modem
- `08-first-hit-attack.png`: just after the first hit (96%)
- `09-t31-at-modem.png`: zombie still at the modem
- `10-t35.7-before-kill.png`: attack pose at the modem, 76%
- `11-t38.5-after-kill.png`: modem clear after the hammer kill, 72%
- `12-t47-end.png`: end of the observed window, still 72%

(`03-splash.png` was not taken, see check 6.)

## Limitations

- I identified audio by its oscillator pattern only. I did not listen to it or check its
  levels.
- The attack animation was checked from still frames, not frame by frame.
- Screen shake and CCTV static on each hit were not measured.
