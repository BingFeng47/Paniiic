# Playtest: leaderboard end to end (task 8.1, Req 9.3), 2026-11-24

Screenshots: `docs/playtests/2026-11-24-leaderboard-e2e/`. Played in Playwright against the dev
server on http://localhost:3000, which was already running. It used the **real Supabase `scores`
table**, which was empty before the run. Input went only through `page.mouse`, `page.keyboard` and
locator clicks. No devtools calls changed game state. Run times are the "Session time" shown on
the Result_Screen. No key, URL secret or `.env.local` content was read or recorded.

**Test data left in the table.** The row `KIRO TEST` (score 0, outcome lost) stays in the table,
because the table is insert-only for the publishable key. The team can delete it from the
Supabase dashboard (Table editor → `scores`).

## Summary

The full startup played: title → **Play game** → BIOS → splash → desktop → "Connect to
MidnightNet" → **Connect**. I clicked the grey real link once the browser opened and did nothing
on the lane. The modem died at **0:46 with the download at 0%**. The Result_Screen showed the
"NetSurfer Billing Dept." receipt with a **total of 0 pts**, and Retry had focus. Signing as
"KIRO TEST" with Enter showed "Signing...", then "Your rank today: **#1**" and today's top 10 with
the row highlighted (`tr.is-you`). The Hall of Fame showed "Loading guestbook...", then a guest
counter of **000001** and the KIRO TEST row in both top-10 lists. Play was inert while the window
was open. Escape, Close and the title-bar ✕ all closed it and gave focus back to the Hall of Fame
button. A second loss replayed the same run (0:46 again, daily seed) with the name prefilled.
The console had **0 errors and 0 warnings**. Every check passed. I found three minor issues
(below). The receipt line items could not be seen, because every part of a 0-point idle loss is
zero.

## Checks

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Title buttons are Play game, Hall of Fame, Options, in that order | **PASS** | Snapshot: `button "Play game"`, `button "Hall of Fame"`, `button "Options"`. [01-title](2026-11-24-leaderboard-e2e/01-title.png) |
| 2 | Full startup: BIOS → splash → desktop → dial-up → Connect | **PASS** | Polled page text: NightOwl BIOS at 0–3 s, "Phantom 98" splash at 4–6 s, desktop with the sticky note at 7 s. [02-bios](2026-11-24-leaderboard-e2e/02-bios.png), [03-desktop](2026-11-24-leaderboard-e2e/03-desktop.png), [04-dialer](2026-11-24-leaderboard-e2e/04-dialer.png), [05-dialing-lane](2026-11-24-leaderboard-e2e/05-dialing-lane.png). I took no splash screenshot; the text poll caught it. |
| 3 | Lose the run (integrity 0) | **PASS** | "Connection Terminated", `SKELETON_DATING_SIM.EXE`, Session time **0:46**, Modem integrity 0%, Downloaded **0%**. [06-loss](2026-11-24-leaderboard-e2e/06-loss.png) |
| 4 | Receipt from "NetSurfer Billing Dept." with line items and a total | **PASS (partial)** | `group "NetSurfer Billing Dept."` with "STATEMENT OF ACCOUNT", "TOTAL SCORE ..... 0 pts" and the footer "Thank you for choosing NetSurfer. Do not open the manhole." No line items appeared. That is correct under Req 4.1, which shows only non-zero parts, and every part was 0 (0% download, 0 kills, 0 ads closed). Line items with values were **not verified** in this test. |
| 5 | Retry has initial focus | **PASS** | Snapshot: `button "Retry" [active]`. Same on the second loss. |
| 6 | Sign button disabled until the name is valid | **PASS** | Empty field: `button "Sign" [disabled]`. After typing "KIRO TEST": enabled. |
| 7 | Sign with Enter shows "Signing..." | **PASS** | "Signing..." visible from 0 to about 700 ms after Enter. [08-signing](2026-11-24-leaderboard-e2e/08-signing.png) |
| 8 | Rank today and today's top 10 with the new row highlighted | **PASS** | At about 1.4 s: "Thank you for signing! Please come again.", "Your rank today: #1", table "Today's top 10". DOM: `<tr class="is-you"><td class="guestbook-pos">1.</td><td class="guestbook-row-name">KIRO TEST</td><td class="guestbook-score">0</td><td class="guestbook-outcome">Eaten</td></tr>`. [09-signed-rank](2026-11-24-leaderboard-e2e/09-signed-rank.png) |
| 9 | Submitted score matches the receipt total | **PASS** | Receipt 0 pts, board row 0, Hall of Fame row 0. |
| 10 | Submits at most once | **PASS** | After signing, the field and Sign are both `disabled`, and `.guestbook[data-state="done"]`. The guest counter is 1 after the session. |
| 11 | Typing in the name field triggers no hotkeys | **PASS** | I typed `1`, Backspace, then `KIRO TEST` (which includes `E`). The field read "KIRO TEST". Nothing else changed on screen, and there were no console messages. The run was over, so hotkey effects on the lane could only be checked as "nothing visible changed". |
| 12 | Last name remembered | **PASS** | `localStorage["phantom98.guestbook"]` = `{"v":1,"name":"KIRO TEST"}`. On the second loss the field was prefilled with "KIRO TEST" and Sign was enabled. [15-second-loss-prefilled](2026-11-24-leaderboard-e2e/15-second-loss-prefilled.png) |
| 13 | Main menu → title | **PASS** | [10-title-again](2026-11-24-leaderboard-e2e/10-title-again.png) |
| 14 | Hall of Fame shows "Loading guestbook..." | **PASS** | Visible for about 350 ms, with the counter showing `- - - - - -`. [11-hof-loading](2026-11-24-leaderboard-e2e/11-hof-loading.png) |
| 15 | Guest counter ≥ 1, today's and all-time top 10 both show KIRO TEST | **PASS** | "Guests signed: 0 0 0 0 0 1". Both tables: "1. KIRO TEST 0 Eaten". [12-hof-loaded](2026-11-24-leaderboard-e2e/12-hof-loaded.png), [16-hof-after-second-run](2026-11-24-leaderboard-e2e/16-hof-after-second-run.png) |
| 16 | Play is inert while the window is open | **PASS** | An ancestor of Play has `inert`. A forced click on Play did not start the BIOS, and the window stayed open. Tab cycled only to "Close". Focus opens on "Close". [13-hof-play-inert](2026-11-24-leaderboard-e2e/13-hof-play-inert.png) |
| 17 | Escape closes it and the menu works again | **PASS** | After Escape: no dialog, the menu was no longer inert, and focus was on "Hall of Fame". [14-hof-closed](2026-11-24-leaderboard-e2e/14-hof-closed.png). The Close button and title-bar ✕ also closed it and returned focus to "Hall of Fame". Clicking Play then started the BIOS. |
| 18 | Daily seed: Retry/replay gives the same run | **PASS** (observation) | The second idle run also ended at 0:46 with 0%. |
| 19 | Console | **PASS** | 6 messages over the whole session: Vite connecting/connected (×2) and Chromium's verbose "Password field is not contained in a form" (×2, from the dialer). **0 errors, 0 warnings.** |

## Bugs

All three issues are minor. None blocks the feature.

### B1. Status line goes blank for about 0.5 s between "Signing..." and the board

- **Steps:** Lose a run, type a valid name, press Enter. Sample the guestbook text every 100 ms.
- **Expected:** "Signing..." stays until the rank and top 10 replace it (Req 5.3).
- **Actual:** "Signing..." showed from 0 to 700 ms. From 800 to 1,300 ms the guestbook showed only
  the heading, field, Sign and hint. The board appeared at 1,400 ms. This is probably the gap
  between the insert response and the `rankToday`/`topToday` reads. A player might think the
  signing failed.
- **Evidence:** text samples taken every 100 ms (800 ms: `Sign our Guestbook! | Your name: | Sign |
  3-12 letters, digits, spaces, _ or -`). After the board shows, the DOM has
  `<p class="guestbook-status" role="status" hidden="">`.

### B2. Focus drops to `<body>` after signing

- **Steps:** Sign with Enter in the name field.
- **Expected:** Focus moves somewhere useful, for example Retry, or the rank line.
- **Actual:** The field and Sign become `disabled` while the field has focus, so
  `document.activeElement` becomes `<body>`. A keyboard user has to Tab back to Retry or Main
  menu. Retry and Main menu still worked with the mouse.

### B3 (could not reproduce). Hall of Fame window closed by itself once

- **What happened:** In the first session (title reached through Main menu after the signed loss),
  the window was open and loaded at screenshot 12. On the next tool call, a few seconds later,
  there was no `[role=dialog]` and focus was on the "Hall of Fame" button, as after a normal close.
  I sent no input in between. I then pressed Enter, which started the BIOS, as expected with the
  menu active.
- **Retests:** A fresh load with the window open and idle for 30 s stayed open. The same path as
  the first session (loss → Main menu → Hall of Fame), minus signing, stayed open for 30 s idle.
- **Status:** not reproduced. It may be harness timing. Recorded so the team can watch for it.

## Design gaps

- None found against `docs/game-design.md` sections 1 and 12, or against Req 5 and 7, within what
  a 0-point loss can show. Not covered: receipt line items and the win bonus (needs a scoring run),
  "Server busy. Try again later." and the one retry (needs a failing or slow server), and
  "Guestbook closed for maintenance." (needs no config).
- The board labels a loss "Eaten". The spec and design doc don't name the outcome label. It fits
  the retro copy.

## Feel

- 0:00–0:20: the dial-up and CCTV lane ran normally. The modem was at 100% at 0:18.
- About 0:36: the modem was already at 76%. Two clutter ads (SCREENSAVERS.EXE, PUNCH THE MUMMY)
  were open, and the "Pop-up hatched" balloon was showing. An idle player loses at **0:46**,
  inside plot turn 1 and before the download can move. That is intended for an idle test, but a
  first-time player who freezes up dies quickly.
- The guestbook and Hall of Fame look right for the period: purple title bars, an "UNDER
  CONSTRUCTION" stripe, a red LED-style guest counter and the "Hosted free by PhantomHTTPd" footer.
  The highlighted row is easy to read. A 0-point receipt with only a total looks bare. One line
  such as "No charges this session." would fill it, if the team wants it.
