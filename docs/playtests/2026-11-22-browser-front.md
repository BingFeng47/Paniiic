# Playtest: browser front (Req 15.3), 2026-11-22

Screenshots: `docs/playtests/2026-11-22-browser-front/`. Times are seconds from clicking **Connect**
(run 3, the most complete run). Played with a Playwright script that clicks the correct control of
each ad and sweep-clicks the phone line with the hammer.

## Summary

Boot → title → BIOS → desktop → dialer works and nothing can be skipped. Connection lands at 20.0 s
and the Real_Link starts the download (~0.9 %/s, 18.6 KB/s). Plain, swapped-buttons and decoy ✕
ads all close with their correct control. The fake button applies −19 to −20 %, turns the bar red
and a fast zombie appears near the manhole. Interrupters pause the download (rate shows 0.0 KB/s).
Ad text is legible. **No KB counter exists anywhere in the UI**, so I could not check +2 KB or −5 KB.
**No hint balloons appeared.** All three runs were lost to the lane between 59 s and 95 s. Two of
those losses came from overlapping modal ads soaking up clicks for 12–21 s. Patterns not reached in
a closable state: hidden ✕, confirm, runaway ✕. Countdown was only partly tested. No console errors
or warnings came from localhost:3000.

## Pattern coverage

| Pattern | Seen | Correct control closes it | +2 KB | Notes |
|---|---|---|---|---|
| Plain (clutter) | 25.8 s, 33.3 s, 41.3 s, 59.3 s | Yes, every time | Not visible (no KB UI) | `30-clutter-plain.png` |
| Swapped (clutter) | 45.8 s, 52.3 s, 66.3 s | Yes ("no thanks, I like slow Internet") | Not visible | `30-clutter-swapped.png` |
| Decoy ✕ (interrupter) | 55.7 s | Yes, small title-bar ✕; download resumed | Not visible | `30-interrupter-decoy.png` |
| Decoy ✕ (clutter) | run 2, ~60 s | Blocked: it sat under an open interrupter's shield | – | `30-clutter-decoy.png`, Bug 2 |
| Countdown (interrupter) | 70.0 s | Early clicks did nothing (correct). After it showed "Skip ad", 85 clicks over 21 s did not close it | – | `30-interrupter-countdown.png`, Bug 2 |
| Hidden ✕ | 70 s (a second interrupter, "Important Message", tiny ✕ bottom-left) | Not attempted | – | |
| Confirm, Runaway ✕ | Not reached | – | – | |

## Bugs

1. **No KB counter in the HUD (High).** Steps: start a run and kill zombies or close ads.
   Expected: a KB counter in the lane HUD (design §2, §6). Actual: the HUD shows only
   `MODEM nn%` (`.lane-hud`). I found no KB text in `src/ui/laneHud.ts`. +2 KB per ad, −5 KB per
   fake click and shop affordability cannot be checked or seen by the player.
2. **Two modal ads at once lock the browser front (High).** Run 3, 70 s: the countdown interrupter
   "SPEED UP YOUR INTERNET" and a second interrupter "Important Message" (hidden ✕) were open
   together. The second one's modal shield covered the first one's Skip button. Run 2, 55–72 s:
   an open swapped interrupter's shield covered a decoy clutter's title-bar ✕. Expected: each
   pattern can be closed in about 2 s (design §7). Actual: the player has to find the tiny ✕ of the
   topmost ad first. Meanwhile the download stays paused and the lane goes unattended. Both runs
   were lost (`06-after-timeout.png`, `30-clutter-decoy.png`, `30-interrupter-countdown.png`).
   Suggestion: allow at most one interrupter at a time, or put clutter ads above the shield. Part
   of this is my script's fault, because it clicked the back ad. A human would still struggle,
   since the topmost ✕ is tiny and far from the visible Skip button.
3. **Leftover ad text after closing (Low).** `21-fake-after.png`: the text "not answered since
   dusk." stays on the page at roughly (920, 360) after the ads close. It looks like an unremoved
   text fragment from a clutter or fake ad.
4. **Fake penalty is −19 %, not −20 % (Low, may be rounding).** 23 % → 4 % at 47.1 s, measured
   400 ms after the click.

Console: no errors or warnings from `localhost:3000`. The shared browser also logged CSP and
preload messages from other tabs, which I ignored.

## Design gaps (vs `docs/game-design.md`)

- **Hint balloons (§11) are missing.** None appeared at dialing, connect, first ad, first
  interrupter or first packet. The only `hint` code is in the title scene options.
- **KB economy is invisible** (Bug 1). I could not test the −5 KB fake penalty.
- **First fake button came at 45.8 s.** This matches pinch 1 (0:45). Fake → fast zombie: a small
  fast mob appears near the manhole in `21-fake-after.png`. I did not confirm it was spawned by the
  click and not by the timeline.
- **The first decoy ✕ (55.7 s) and the first countdown (70 s) arrive on time.** Two interrupters
  open at 70 s goes beyond "first interrupter pauses the download" and makes pinch 1/midpoint
  harsher than intended.
- **Swapped buttons appears as clutter at 45.8 s.** Chapter 3 allows this.

## Feel

- 20–45 s: calm, readable, the plain ✕ is easy. Good onboarding.
- 45–70 s: the green fake button sits right next to where the real link was and reads clearly as
  bait. The red bar after the penalty reads well.
- 55 s onward: overlapping windows hide one another's controls. The decoy clutter's title-bar ✕
  is hard to spot when another window covers it.
- A modal on screen plus zombies reaching the modem drains integrity from 97 % to 0 in about 12 s
  (run 2). That felt brutal, but it was caused by the blocked ad and not by lane balance.
- Ad text (`30-*.png`) is legible: bold headlines, high contrast and sensible font sizes.

## Not covered

Hidden ✕, confirm and runaway ✕ closes. Countdown Skip working when it is not covered. Win path.
To cover these, someone should play a run by hand with focus on the lane, or run it with a seeded
debug hook.
