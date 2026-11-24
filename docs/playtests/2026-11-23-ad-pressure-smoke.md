# Playtest: ad-pressure smoke (Req 10.4), 2026-11-23

Screenshots: `docs/playtests/2026-11-23-ad-pressure-smoke/`. Run 1 has no prefix; runs 2–7 use
`r2-` … `r7-`. Times are seconds from clicking **Connect** (run 1) or **Retry** (runs 2–7). They
come from the game tick (tick / 60), so they are exact, not wall-clock estimates.

**Method.** Run 1 went through title → BIOS → desktop → dial-up → Connect
([title](2026-11-23-ad-pressure-smoke/01-title.png),
[BIOS](2026-11-23-ad-pressure-smoke/02-bios.png),
[desktop](2026-11-23-ad-pressure-smoke/03-desktop.png),
[dialer](2026-11-23-ad-pressure-smoke/04-dialer.png)). Runs 2–7 used **Retry**, which plays the
full 20 s dial-up. I played with a Playwright script, `.playwright-mcp/adpressurebot.js`, adapted
from `juicebot.js`. It clicks the real link, clicks the hammer on the mob nearest the modem,
leaves ads open or closes them with their correct control depending on the run, and runs the
lane-cover steps below.

**Instrumentation (read-only, no game code changed).** `.playwright-mcp/adpressure-observer.js`
does two things before the first Connect:

- It appends one extra view factory to the live `SESSION_REGISTRY.views` array through a dynamic
  `import('/src/dialup/sessionRegistry.ts')`. The view gets the same `update(state, events)`
  call as every other view. It copies the tick, download, bandwidth, integrity, ads, mobs, packets
  and events to `window.__obs`. It never sends commands.
- A MutationObserver logs ad elements being added and removed, `is-hatching` toggles and hint
  balloons.

Runs: run 1 (startup, left ads open, lost at 79.1 s), run 2 (wrong-control pile-up, lost at
99.9 s), run 3 (lane cover and line noise, lost at 104.5 s), runs 4–5 (lane-cover attempts with
unsuitable ad positions, lost), run 6 (lane-cover attempt, invalid packet test, lost at 143.5 s
at 90 %), run 7 (**packet test passed, won at 143.3 s**,
[result](2026-11-23-ad-pressure-smoke/r7-90-result.png)). Most losses happened while the script
was between tool calls and nobody was defending, or because I left ads open on purpose.

## Summary

All four checks pass. Open clutter slows the download by exactly 15 points per ad down to the
40 % floor. The KB/s rate, %/s progress and "Time left" all agree with `1 − 0.15 × n`. A damaged
modem adds "Line noise detected…", and the rate then matches `0.6 + 0.4 × integrity / 100`.
Every clutter ad got `is-hatching` exactly 7.0 s after opening and hatched exactly at 10.0 s. Each
ad kept hatching every 10 s until it was closed. Hatches spawned `default` zombies up to 69 s and
`fast` zombies from 71 s. The "Pop-up hatched" balloon showed once per run. A Lane_Cover ad
swallowed hammer clicks on the zombie under it, and the same zombie took damage when I clicked
the part sticking out. Hovering a packet through the ad did not collect it, and hovering the
visible canvas next to it did. With 8 clutter ads open, every 9th clutter was skipped, while
interrupters and fake buttons still opened. The console had 0 errors and 0 warnings over seven
runs. I found no new game bugs. There are design questions about lane-cover placement and about
clicks under a lane-cover ad counting as a wrong control.

## Check 1: Bandwidth (Req 2, 3, 7.1): pass

Run 1: no ad was closed, and one clutter opened at 25, 33, 41, 45, 49 and 52 s. Rates are from
`.dl-rate`. The %/s is the `.dl-percent` source value (state download) over 1 s. The expected
values use the code's full rate of 100/110 %/s = 18.6 KB/s for the 2,048 KB file.

| Open clutter | Window | Factor shown (`state.bandwidth`) | Rate text | Expected KB/s | Measured %/s | Expected %/s | Time left | Cause line |
|---|---|---|---|---|---|---|---|---|
| 0 | 21–22 s | 1 | 18.6 KB/s | 18.6 | 0.909 | 0.909 | 1:50 | hidden |
| 1 | 26–27 s | 0.85 | 15.8 KB/s | 15.8 | 0.773 | 0.773 | 2:04 | "1 pop-up is using your bandwidth." |
| 2 | 34–35 s | 0.70 | 13.0 KB/s | 13.0 | 0.637 | 0.636 | 2:21 | "2 pop-ups are using your bandwidth." |
| 3 | 42–43 s | 0.55 | 10.2 KB/s | 10.2 | 0.500 | 0.500 | 2:49 | "3 pop-ups are using your bandwidth." |
| 4 | 46–47 s | 0.40 | 7.4 KB/s | 7.4 | 0.363 | 0.364 | 3:47 | "4 pop-ups are using your bandwidth." |
| 5–8 | 49–55 s, 65–70 s | 0.40 (floor) | 7.4 KB/s | 7.4 | 0.363 | 0.364 | 3:4x | "N pop-ups…" with the right N |

Screenshots: [0 ads](2026-11-23-ad-pressure-smoke/10-rate-0-clutter.png),
[1 ad](2026-11-23-ad-pressure-smoke/11-rate-1-clutter.png),
[3 ads](2026-11-23-ad-pressure-smoke/12-rate-3-clutter.png),
[floor](2026-11-23-ad-pressure-smoke/13-rate-floor.png). The bar visibly slows in each step. The
rate changes on the tick the ad opens and goes back up on the tick it closes. In run 2 it went
from 15.8 to 18.6 KB/s at 61.7 s, when the last clutter closed. Fake buttons and interrupters never
changed the factor. An open interrupter shows "0.0 KB/s / Waiting for server..." whatever the
clutter count.

**Line noise.** In run 3 I let mobs hit the modem from 82 s, with no clutter open and no
interrupter:

| Integrity | Rate text | Expected `18.62 × (0.6 + 0.4 × I/100)` | Cause line |
|---|---|---|---|
| 96 | 18.3 KB/s | 18.30 | "Line noise detected. Something is chewing on the modem." |
| 88 | 17.7 KB/s | 17.71 | same |
| 77 | 16.9 KB/s (0.826 %/s measured, 0.825 expected) | 16.89 | same |
| 92, 1 clutter open | 15.3 KB/s | 15.32 (`× 0.85 × 0.968`) | "1 pop-up is using your bandwidth. Line noise detected. …" |

Screenshot: [line noise](2026-11-23-ad-pressure-smoke/r3-15-line-noise-rate.png). Line noise
appeared on the first tick with integrity below 100, in every run (run 1 at 68.0 s, run 3 at
82.5 s).

## Check 2: Hatch (Req 4, 7.2, 7.3, 8.2): pass

MutationObserver and event log for run 1. All ads were left open.

| Ad | Opened | `is-hatching` on | Hatch (`adHatched`, mob `source: adHatch`) | Next warnings / hatches |
|---|---|---|---|---|
| 1 (plain) | 25.017 | 32.017 (age 7.0 s) | 35.017, mob 6 `default` | 42.017 / 45.017, 52.017 / 55.02, 62.017 / 65.02, 72.017 / 75.02 (`fast`) |
| 2 (plain) | 33.0 | 40.0 | 43.0, mob 8 `default` | 50 / 53, 60 / 63, 70 / 73 (`fast`) |
| 3 (plain) | 41.0 | 48.0 | 51.0 | 58 / 61, 68 / 71 (`fast`, the first fast hatch) |
| 6 (hidden, lane cover) | 49.0 | 56.0 | 59.0 | 66 / 69 (`default`), 76 / 79 (`fast`) |

- The warning class went off on the hatch tick and came back 7 s later. The ad stayed open and in
  place. Every run had the same 7.0 s and 10.0 s ages.
- Hatch kind: the last `default` hatch was at 69.0 s and the first `fast` one at 71.0 s in runs 1,
  4 and 5. That matches Pinch 1 → Midpoint at 70 s. No hatch happened before connect.
- The hatch balloon ("Pop-up hatched / A pop-up you left open just let a zombie onto the line.")
  appeared **once**, at 35.017 s, in runs 1, 2 and 7. Run 1 had 23 hatches.
- Screenshots: [warning, 33.0 s](2026-11-23-ad-pressure-smoke/20-hatch-warning.png). The crack
  lines and the hand coming out of the left edge are visible on "SCREENSAVERS.EXE".
  [0.25 s after the hatch](2026-11-23-ad-pressure-smoke/21-hatch-after.png): a zombie climbs out
  of the manhole inside a MOTION box, and the balloon points at the lane.
  [1.2 s after](2026-11-23-ad-pressure-smoke/22-hatch-after-1s.png).
- **Flashing.** By eye, the warning is a small side-to-side shake and a slow claw. There is no
  brightness change. The CSS (`src/styles/browser.css` lines 127–158) uses only transforms: a
  0.5 s shake (2 Hz) and a 1 s claw. That is under 3 per second. The only blinking on the ads is
  the existing `.ad-blink` headline at 1 Hz.
- I did not check the creak-and-groan sound (no listening step).

## Check 3: Lane cover (Req 6): pass

Lane_Cover clutter opened at 49 s and at 65 s in every run (Pinch 1 + 4 s, then every 16 s). In
Pinch 2 and Plot turn 2 it opened every 6 s and then every 3 s.
[First lane cover, run 1](2026-11-23-ad-pressure-smoke/30-lane-cover.png).

**Hammer clicks.** Run 3, ad 6 (decoy) at Screen (502, 549, 300 × 180), which covers canvas
y 69–249 and so the whole phone line:

| Time | Click | Top element | Mob 13 HP | Other effect |
|---|---|---|---|---|
| 54.42 s | On the zombie's centre under the ad, canvas (775, 227) | ad 6 | 2 → 2 | `adMistake` (control `body`) and one more clutter (ad 8). [Screenshot](2026-11-23-ad-pressure-smoke/r3-31-under-click.png) |
| 60.92 s | On the part of the same zombie sticking out of the ad's left edge, canvas (500, 196) | canvas | 2 → 1 | Normal hammer hit. [Screenshot](2026-11-23-ad-pressure-smoke/r3-33-beside-click.png) |

This repeated with mob 22 (64.40 s: HP unchanged, `adMistake`, extra clutter skipped by the cap)
and in runs 6 and 7. In run 6 the bot's own earlier swing had the hammer on cooldown once (70.83 s),
so one outside click did nothing. That is the cooldown, not the ad.

**Packets.** Run 7, ad 11 (hidden) at Screen (606, 550), canvas x 606–906 and y 70–250:

1. 76.08 and 76.42 s: two hammer hits at canvas (603, 175), just left of the ad, killed mob 19.
   Its centre was at canvas x 616, so the packet dropped 10 px inside the ad, on the line.
2. Pointer moved to the browser area, then straight into the ad over the packet at canvas
   (616, 220). It wiggled for about 1 s only to the right and up, so it stayed inside the ad. The
   top element was ad 11. The packet stayed on the line, no `packetCollected` fired, and the
   economy pointer was parked off the feed at lane y 492.
   [Screenshot](2026-11-23-ad-pressure-smoke/r7-32-pointer-in-ad-over-packet.png).
3. Control: the pointer moved onto the visible canvas at (603, 220), 13 px from the packet. The
   packet was collected at once (77.80 s).

Run 6's packet attempt is not counted. My wiggle crossed the ad's left edge onto the canvas, and
the packet was collected from there. That is correct behaviour.

## Check 4: Cap is clutter-only (Req 5): pass

- **Run 1** (all ads left open): the count reached 8 at 65.0 s. Clutter was skipped at 66.0, 70.0
  and 77.0 s. With 8 open, fake 12 opened at 69.0 s, then interrupter 13 and fake 14 at 70.0 s.
- **Run 2** (wrong controls on purpose): body clicks at 67.50–69.28 s each opened one more
  clutter, from 1 to 8. At 70.0 s, on the same tick, a scheduled clutter was skipped and
  interrupter 21 and fake 22 opened.
  [8 clutter + interrupter](2026-11-23-ad-pressure-smoke/r2-41-cap-8-interrupter.png),
  [8 clutter + fake](2026-11-23-ad-pressure-smoke/r2-42-cap-8-fake.png). Fake 26 also opened at
  82.0 s with 8 open.
- Runs 3–5 also reached 8 (at 59 s, 65 s, 65 s) with an interrupter on screen
  ([run 3](2026-11-23-ad-pressure-smoke/r3-41-cap-8-interrupter.png)).
- Over all seven runs, the open clutter count never passed 8, and every `adSkipped` event had kind
  `clutter`. There were 42 skips, and most came from wrong controls clicked at the cap.

## Bugs

No new game bugs.

1. **Leftover ad text "not answered since dusk." (Low, still open from 2026-11-22).** It is still
   visible at the right of the download box in every connected screenshot, for example
   [10-rate-0-clutter](2026-11-23-ad-pressure-smoke/10-rate-0-clutter.png).
2. **Inputs I did not send, run 2 (not a game bug as far as I can tell).** Between 45.2 and 61.7 s,
   seven ads were closed with their correct controls (`rewardKb: 2`), including a hidden ✕ and the
   swapped interrupter's "no thanks". The heavy head was also bought (KB 120 → 90, the HUD shows
   "HAMMER+ MAXED" in `r2-41`). My script was in "leave ads open" mode and never presses keys. The
   most likely cause is someone clicking in the headed browser. Run 2 is only used for the
   wrong-control pile-up after 67 s.

Console: 3 messages over the session (Vite connect ×2 and a Chromium "password field is not in a
form" verbose note). 0 errors, 0 warnings.

## Design gaps (vs `docs/game-design.md` and the spec)

- **Lane-cover ads often leave the line visible.** `laneArea` is 260 px tall and clutter is
  180 px, so the ad's top lands anywhere in Screen y 480–560. Of the 12 lane-cover rects I logged,
  only 5 reached below the phone line (canvas y 232). Rects with y ≤ 520, for example (665, 503),
  (657, 494) and (531, 480), leave the zombies' feet and the line uncovered. Those feet can still
  be hammered: in run 1 the script killed zombies under ad 6 by clicking their feet. Design
  section 7 says lane-cover ads "block clicks on the zombies under them", and this only holds for
  about half of them. Placing them in the lower part of `laneArea`, or making `laneArea` match the
  ad height, would make them land on the line.
- **Lane-cover ads cover the lane HUD.** At the top of `laneArea` they sit over the shop tray (the
  "SURGE PROT." slot in [30-lane-cover](2026-11-23-ad-pressure-smoke/30-lane-cover.png)) or over the
  integrity meter ("MODEM … %" in `r3-31-under-click` and `r7-32`). Neither doc mentions this. It
  may be wanted pressure, but hiding the integrity meter also hides the main lose signal.
- **A click on a zombie under a lane-cover ad counts as a wrong control on that ad.** It hits the
  ad body, so one more clutter opens. That follows the close-pattern table, where the body is
  always wrong. But Req 6.4 and design section 8 only say the click is blocked. A player trying to
  save the modem is punished twice. Please confirm this is intended.
- **Cause line during an interrupter.** While paused, the panel shows "0.0 KB/s / Waiting for
  server..." and still says "N pop-ups are using your bandwidth.". The real reason the bar stopped
  is the interrupter, which the cause line doesn't name.
- **Values that differ from the doc (owned by `pacing-and-economy`, listed for completeness).**
  The full speed is 100/110 %/s (doc: 0.74 %/s, 135 s). Pinch 1 starts at 45 s and the first lane
  cover is at 49 s (doc: Pinch 1 from 0:55). Fast hatches start at 71 s (doc: Midpoint 1:30). A
  correct close gives 2 KB (doc: +3 KB). Run 7 won at 2:23 (doc: about 3:00).

## Feel

- 25–45 s (run 1): the slowdown is easy to read. "Time left" jumps from 1:50 to 3:47 as four
  pop-ups pile up, and the bar crawls. The cause line sits in the download panel, though, and
  clutter often lands on top of the panel ("FREE CURSORS" in `21-hatch-after.png`). The player may
  not see the explanation.
- 32–35 s: the hatch warning reads well. The crack and the hand appear 3 s ahead, and the zombie
  climbs out of the manhole with a MOTION box. The balloon points at the lane from the middle of
  the browser, so it covers part of the page.
- Leaving ads open is punished hard. With nothing closed, run 1 had 23 hatches by 79 s and 27 mobs
  on the line at the end. Integrity went from 100 to 0 in 13 s (66–79 s) once defence stopped.
  Closing ads from 47 s (runs 6 and 7) kept hatches to 4–11 per run, and run 7 won with 94 %
  integrity.
- The hatch-kind switch at 70 s is noticeable. The fast zombies from 71 s reach the modem in about
  7 s.

## Not covered

Audio: the hatch creak-and-groan and the bandwidth or line sounds, because there is no listening
step. `prefers-reduced-motion` (the warning should not shake). The Hall of Fame receipt and
guestbook, which are not on the result screen yet (leaderboard spec). Boss timing and Plot turn 2
balance. The pop-up blocker and surge protector against hatching.
