# Playtest: pacing and economy (task 6.2, Req 9.4), 2026-11-24

Screenshots: `docs/playtests/2026-11-24-pacing-and-economy/`. All times are run seconds from
clicking **Connect** in the dial-up dialog. They come from the game tick (tick / 60), so they
are exact, not wall-clock estimates. One run was played. It was a **loss at 2:33.2 with the
download at 90.8%**.

**Method.** Startup played in full: title → **Play game** → BIOS → splash → desktop →
double-click "Connect to MidnightNet" → **Connect**
([title](2026-11-24-pacing-and-economy/01-title.png), [BIOS](2026-11-24-pacing-and-economy/02-bios.png),
[splash](2026-11-24-pacing-and-economy/02b-splash.png), [desktop](2026-11-24-pacing-and-economy/03-desktop.png),
[dialer](2026-11-24-pacing-and-economy/04-dialer.png)). The run was played by a Playwright bot,
`.playwright-mcp/pacingbot.js`, adapted from `adpressurebot.js` and `juicebot.js`. It uses only
`page.mouse` and `page.keyboard`. It does these things:

- clicks the grey real link once it shows
- closes interrupters first, then lane-cover clutter, then other clutter, each with its correct
  control (it waits out countdowns)
- never clicks fake buttons
- hammers, saws or flames the mob nearest the modem
- hovers every visible packet
- presses **2** at 75 KB and **3** at 150 KB
- with the flamethrower owned, fires it until the fuel is empty, then switches to the saw (Q) and
  back (E) at 3 s of fuel

It does not buy upgrades, the pop-up blocker or the surge protector. The loop ran in the
background, so play did not stop between tool calls.

**Instrumentation (read-only).** `.playwright-mcp/pacing-observer.js` adds one Session_View to
the live `SESSION_REGISTRY.views`. Its `update(state, events)` copies the tick, download,
integrity, ads, mobs, packets, wallet, `gained` and the events to `window.__obs`. It never sends
commands. It also wraps `AudioParam.setValueAtTime` and the `value` setter to log the
frequencies that are scheduled, without changing them. That log is used to check the combo blip.

Console: 3 messages over the session: Vite connecting/connected and a Chromium verbose note,
"Password field is not contained in a form". **0 errors, 0 warnings.**

## Summary

The pacing data matches the tuned tables. The first zombie came at 0:08.0 and the next at 0:18.0.
After that there was one every 9 s, and each chapter added its new kind on the tick the table
gives it. The saw became affordable, and was bought, at 1:19.7. The flamethrower was bought at
2:11.0. The boss rose at exactly 75.02% (2:05.6) with 150 HP and moved at 38 units/s. It reached
the modem at 2:25.2 with the download at 88.8%. Combos showed "COMBO x3 +1 KB" and
"COMBO x4 +1 KB" on the CCTV display, and a blip at the right pitch was scheduled for each one.
The run did not reach 3:00. Regular mobs never touched the modem. The boss alone took it from
100 to 0 in 8 s: five 20-point hits, the first on arrival at 2:25.2, the last at 2:33.2. The modem
went critical (20) in plot turn 2, at 2:31.2, only 2 s before the loss. The download was at 88.8%
when the boss arrived and needed about 15 s more at full speed. Two boss bursts landed 0.6 s apart
and pushed the bar to the 40% floor, so the player could not finish in time. I found no crashes
or console errors. I found one balance concern (major), two cosmetic issues and some design gaps.

## Checks

| # | Check | Result | Observed |
|---|---|---|---|
| 1 | Quiet first minute | **PASS** | Default spawns at 8.0, 18.0, 20.0, 29.0, 38.0, 47.0 s. In plot turn 1 (20–55 s): 20, 29, 38, 47, every 9 s. One extra default came out at 20.0 s, 2 s after the 18.0 s one (see design gaps). Each mob was killed within 0.5 s, and integrity stayed at 100. [First zombie](2026-11-24-pacing-and-economy/10-first-zombie.png) |
| 2 | Spawn ramp | **PASS** | Pinch 1 (55 s): default every 8 s (55, 63, 71, 79, 87). The first fast came at **59.0** s, then 69 and 79 (every 10 s, offset 4). Midpoint (90 s): default 90, 97, 104, 111; fast 90, 99, 108. The first tank came at **93.0** s, then 108. Pinch 2 (115 s): default every 5 s (115 to 140); fast 115, 122, 129, 136, 143; tank 115, 127, 139. The first ranged came at **117.0** s, then 133. Plot turn 2 (145 s): default 145.0, 147.5, 150.0, 152.5 (every 2.5 s); fast 145, 153; tank 145; ranged 145. The run ended at 153 s, so the 16 s tank and 20 s ranged gaps in plot turn 2 could not be seen beyond their first spawn. No hatches happened, because every clutter ad was closed before its 10 s. All 42 ads closed were closed correctly, with 0 mistakes. |
| 3 | Saw around 1:20–1:35 | **PASS (marginal)** | Total KB earned (`economy.gained`) first reached 75 at **79.70 s (1:19.7)**, from a packet. Hotkey 2 was pressed on the same frame, and `itemBought saw` came at **79.73 s**. That is 0.3 s before the window opens and 1.3 s before the sim's 81 s. [Bought](2026-11-24-pacing-and-economy/30-bought-saw.png). The flamethrower was bought at **131.03 s (2:11.0)**, inside the 2:00–2:20 target, when `gained` reached 226. KB by source over the run: packets 176, ad closes 126 (42 × 3), combos 4, spent 225. |
| 4 | Boss on 75%, 150 HP, speed 38, 30 KB, reaches the modem | **PASS** (drop not verified) | Rise at **125.6 s (2:05.6)** at **75.02%**. Its HP on spawn was **150**. Its x went from 777.2 at 126.2 s to 56 at 145.4 s, which is 721 units in 19.2 s, or **37.6 units/s**. Each 0.5 s sample moved exactly 19.0 units, so the speed is 38. It reached the modem (`mobArrived boss`) at **145.2 s (2:25.2)** at **88.8%**, with 71 HP left, before the run ended. Summons and bursts came at 75% HP (134.9 s), 50% (144.6 s) and 25% (152.8 s), 2 defaults each time. The first-hit burst came at 145.2 s. The boss was never killed (36 HP at the end), so the **30 KB drop was not observed**. [Rise](2026-11-24-pacing-and-economy/40-boss-rise.png), [at modem](2026-11-24-pacing-and-economy/41-boss-at-modem.png) |
| 5 | Combo display and sound | **PASS** | `combo` events: x3 at 116.53 s, x4 at 117.63 s, x3 at 132.02 s, x3 at 151.05 s. Each came with `kbChanged +1 (combo)`. In the first chain, kills came at 115.3 (fast), 115.7 (default), 116.5 (tank) and 117.6 s (ranged), all less than 2 s apart. The OSD showed "COMBO x3 +1 KB" under the shop tray ([x3](2026-11-24-pacing-and-economy/20-combo-x3-1.png), [x4](2026-11-24-pacing-and-economy/20-combo-x4-2.png), and again in [critical](2026-11-24-pacing-and-economy/42-integrity-critical.png)). Sound: for each combo, the audio log has the expected `comboBlipHz` frequency scheduled within 0.4 ms of the event (523.25 Hz for x3, 554.37 Hz for x4). That is the `comboBlip` recipe from `src/render/laneView.ts` lines 520–522. I did not time the 1 s show by eye. The code shows it for `COMBO_SHOW_TICKS = 60` (`src/render/comboDisplay.ts`). |
| 6 | Run length 3:00–3:20 | **FAIL** | **Lost at 153.18 s (2:33.2)** with the download at 90.8%. The result screen says "Session time: 2:33". The download kept close to full speed: it was 88.8% at 145 s, against 92.6% with zero slowdown. At that pace a survived run would have won at about 2:40–2:45, which is also under 3:00. The sim's competent bot wins at a median of 3:16. |
| – | Modem critical in plot turn 2 | **Yes, briefly** | `integrityCritical` at **151.18 s (2:31.2)** with integrity 20, two seconds before 0. |

Integrity timeline: 100 until 145.0 s. Then 80 (145.2), 60 (147.2), 40 (149.2), 20 (151.2) and
0 (153.2), all from the boss. No regular mob or glob damaged the modem in this run.

Other beats seen on time:

- `downloadHalfway` at 87.67 s.
- 2 s of calm, then the midpoint cluster of 4 clutter ads at 89.7 s.
- The first lane-cover clutter at 59 s (pinch 1 + 4 s).
- Interrupters at 65, 83, 90, 108, 115 and 130 s.
- The last interrupter (runaway ✕) at 149.4 s, at 90%.
- The first clutter ad at connect + 5 s (25 s).

## Bugs

1. **Boss at the modem wins the run on its own in 8 s (major: balance and feel, not a code
   defect).**
   - Steps: play a clean run (all ads closed, every regular mob killed) with the saw and the
     flamethrower and no upgrades. Let the boss reach the modem with about 70 HP left.
   - Expected (design section 3, plot turn 2): "Integrity critical", a tense but winnable end.
     The sim's competent bot wins 84% of runs.
   - Actual: the 20-point hits every 2 s, the first on arrival, take a full modem to 0 in 8 s.
     Critical lasts 2 s. The summon burst at 50% HP (144.6 s) and the first-hit burst (145.2 s)
     open 6 clutter ads within 0.6 s. That drops the download to the 40% floor (5.6 KB/s). The
     bar then gains only 2% in the 8 s it has left.
   - Killing the boss in time needs about 5.4 damage per second on the boss alone, sustained over
     its 19.6 s walk plus the 8 s at the modem. That is above the bare saw (5) and the flamethrower
     (4 + 1 burn), with summons and globs on the lane at the same time. Only the heavy-head hammer
     (2 per 0.3 s, about 6.7) or the High RPM saw (7.5) clear it. My bot dealt about 4 per second.
   - It is also the only damage the modem took all run, so the lane gives no pressure before the
     boss and then too much once it arrives.
   - Evidence: [41-boss-at-modem](2026-11-24-pacing-and-economy/41-boss-at-modem.png),
     [42-integrity-critical](2026-11-24-pacing-and-economy/42-integrity-critical.png),
     [90-result](2026-11-24-pacing-and-economy/90-result.png). No console errors.
   - Suggestion for the balance-tuner: compare the sim bot's damage per second on the boss with a
     saw-plus-flamethrower player who has no upgrades. Consider a longer boss hit interval or less
     damage per hit, so that critical lasts longer than one hit.
2. **Line-noise text runs into the modem readout (cosmetic).**
   - Steps: let the integrity drop below 100.
   - Actual: the CCTV OSD shows "MODEM ▮▮▮ 20% Line noise detected. Something is chewing the
     cable." on one line in red. The text overlaps the meter and is cut off at the right edge of
     the feed.
   - Evidence: [42-integrity-critical](2026-11-24-pacing-and-economy/42-integrity-critical.png),
     bottom right.
3. **Leftover ad text "not answered since dusk." (cosmetic, open since 2026-11-22).** It still
   shows to the right of the download box in every connected screenshot, for example
   [20-combo-x3-1](2026-11-24-pacing-and-economy/20-combo-x3-1.png).

## Design gaps (vs `docs/game-design.md`)

- **Run length.** A player who closes every ad at once and kills everything on the lane
  downloads almost at full speed. The boss then rises at 2:05.6 instead of "about 2:12". At that
  pace a win would land at about 2:40–2:45, short of "about 3:00". The 3:00 figure relies on
  hatches, pauses and fake-button penalties that a clean player avoids.
- **Two defaults 2 s apart at 0:18 and 0:20.** The hook wave (every 10 s, offset 8) spawns at
  18 s. Plot turn 1's wave (every 9 s, offset 0) spawns again at 20 s. Section 3 says "the next
  about 0:18" and then "about one every 9 s". An offset of about 7 s on the plot turn 1 wave
  would keep the gap.
- **Title screen has no Hall of Fame button**, and the **result screen has no receipt or
  "Sign our Guestbook!"** (sections 1 and 12). It shows session time, integrity and downloaded
  only. These may belong to a later spec; I list them for completeness.
- **Boss drop 30 KB** was not verified, because the boss never died.

## Feel

- 0:00–0:55: quiet and readable. One zombie at a time, the hammer is enough, and the first
  clutter ads (plain ✕) are easy. Maybe too quiet: the modem took no damage before 2:25.
- 1:20: the saw arrives just before the first tank (1:33), as intended. The tank died in under
  1 s to the saw.
- 1:30–1:55: the midpoint cluster and two fake buttons on screen at once ("DOWNLOAD NOW!!" and
  ">> START DOWNLOAD <<") read well. The grey real link is already gone, so the fakes are only
  temptation by then.
- 2:05–2:25: the boss walk is readable and scary, and the summons and bursts land on schedule.
  The flamethrower cone is clearly visible.
- 2:25–2:33: too abrupt. The CCTV, crack overlay and hint balloon ("Modem integrity critical")
  fade in during the last 2 s, while six new pop-ups cover the browser. A human player would most
  likely not see why they lost.
- Combos are rare in a clean hammer or saw run: 4 in 2:33, because mobs come one by one until
  pinch 2. When they happen they are easy to read, white text under the tray.

## Not covered

- Winning, and so the win screen, `funny_cats_1998.avi` and the boss drop.
- Pop-up blocker, surge protector and upgrades.
- Hatching (no clutter stayed open 10 s).
- Plot turn 2 past 2:33.
- Hearing the audio (the blips are checked through the scheduled frequencies only).
- The zombie-sim MCP server was "Not connected", so I could not replay this seed headless for a
  comparison.
