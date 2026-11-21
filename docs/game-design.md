# Game design

Source of truth for the game. Items marked **(proposal)** are starting ideas for the team to
confirm or change. Numbers are starting values; tuning happens in `src/game/balance/`.

## 1. Flow

1. **Power on → BIOS → splash → desktop.** Always played, never skipped.
2. **Dial-up.** The player opens the dial-up connection. While the modem dials and handshakes,
   **the zombie raid has already started** on the connection lane.
3. **Connected.** The browser opens the download page. The download cannot start until now.
4. **Download.** Two-front play until the download hits 100% (win) or modem integrity hits 0
   (lose).
5. **Result screen**, then back to the desktop to play again.

## 2. Screen layout

- **Top: browser front.** Dial-up dialog first, then the download page, the download bar and the
  ads.
- **Bottom: connection lane.** Modem on the left, phone line across, manhole on the right. Mobs
  come out of the manhole and walk left along the line. HUD: integrity bar, currency, shop tray.
- One mouse covers both. The distance the cursor must travel between them is part of the
  challenge.

## 3. Chapters (timeline from the moment dialing starts)

| # | Chapter | Time | Browser front | Connection lane |
|---|---|---|---|---|
| 1 | Hook | 0:00–0:20 | Dial-up dialog: dialing, handshake screech, "Verifying user name and password..." No download yet. | Manhole rattles. First **default** zombie crawls out about 0:08. Player learns the hammer. |
| 2 | Plot turn 1 | 0:20–0:45 | Connected. Download page with a small grey real link. First clutter ad bounces in (safe to close). Player clicks the real link and the bar starts. | Steady default zombies. First currency drops. |
| 3 | Pinch 1 | 0:45–1:10 | First fake "DOWNLOAD NOW!!" button. First interrupter pauses the download. | **Fast** zombies join. Two mobs on screen at once. |
| 4 | Midpoint | 1:10–1:30 | Bar crosses 50%. 2 seconds of calm (natural shop moment), then the biggest ad cluster so far. | **Tank** joins (4 HP). The saw becomes clearly worth buying. A tank hit costs 20 integrity and fires a pop-up burst. |
| 5 | Pinch 2 | 1:30–1:55 | Interrupters and fake buttons together. Clutter ads start covering part of the lane. The ✕ on an interrupter runs away from the cursor. | **Ranged** zombie joins. All types active. Flamethrower earns its keep. Corruption overlay creeps in. |
| 6 | Plot turn 2 | 1:55–2:15 | Ad storm. Bar near 80%. One last interrupter at the worst moment. | **Boss** rises from the manhole. Zombie flood. Integrity critical. Screen shake and crack overlay at maximum. |
| 7 | Resolution | 2:15–2:30 | **Win:** bar hits 100%, handshake chime, "Welcome to the Internet!", file revealed as `funny_cats_1998.avi`. | **Lose:** integrity 0, modem screech, static, "Connection terminated" dialog, frozen file `SKELETON_DATING_SIM.EXE`. |

The download needs roughly 110 seconds of un-paused progress, so interrupters and fake-button
penalties are what push a run toward the edge.

## 4. Mobs

All mobs walk left along the phone line. Contact with the modem damages integrity, then the mob
is gone (proposal).

| Mob | Role | HP | Speed | Modem damage | Drop | Notes |
|---|---|---|---|---|---|---|
| default | Teaches the basics | 2 | slow | 10 | 5 KB | Shambling crawler. |
| fast | Tests tracking | 1 | fast | 8 | 8 KB | Rusher; small, quick. Appears in pinch 1. |
| tank | Needs the saw | 4 | very slow | 20 | 20 KB | Brute. Modem hit also fires a pop-up burst. |
| ranged | Punishes ignoring the lane | 3 | slow, then stops | 5 per shot | 15 KB | (proposal) Stops at mid-lane and spits at the phone line every 3 s. Projectiles can be hammered. |
| boss | Final threat | 30 | very slow | 40 | 100 KB | (proposal) Appears in plot turn 2. Every 25% HP lost it summons default zombies and fires a pop-up burst. |

## 5. Weapons, currency and shop

- **Currency: KB** (kilobytes). Killed mobs drop data packets. The player clicks a packet to
  collect it; uncollected packets fade after 3 seconds (proposal). Collecting pulls the cursor
  around, which adds tension.
- Closing an ad correctly gives a small bonus (2 KB). Clicking a fake button costs KB as well as
  download progress (proposal).
- **Shop tray** in the lane HUD, hotkeys 1–5. Buying does **not** pause the game.

| Item | Cost | How it works | Upgrades (proposal) |
|---|---|---|---|
| Hammer | free (default) | Click a mob: 1 damage, short cooldown. | Heavy head (+1 damage), quick swing (shorter cooldown). |
| Electric saw | 60 KB | Hold on a mob: continuous damage. Best against tanks. | Higher RPM. |
| Flamethrower | 120 KB | Hold and drag: cone that damages groups and sets them burning. Limited fuel that refills. | Bigger tank. |
| Pop-up blocker | 40 KB, one use | Auto-closes clutter ads for 6 seconds. The only item that helps the browser front. | none |
| Surge protector | 50 KB, one use | Absorbs the next modem hit. | none |

## 6. Ads (browser front)

| Ad | Behaviour | Correct response | Mistake |
|---|---|---|---|
| Clutter banner | Bounces in with a ding, covers part of the screen. | Close it. | Ignoring it hides the lane. |
| Fake button | Big green "DOWNLOAD NOW!!" | Ignore it. Click only the real link. | Download −20% and a zombie spawns. |
| Interrupter | Modal that pauses the download. Its ✕ may run from the cursor. | Close it. | Download stays paused. |

## 7. Cross-front rules

- Fake button clicked → download −20% and a zombie spawns at the manhole.
- Tank (and boss) modem hit → pop-up burst on the browser front.
- Low integrity → corruption and crack overlays across both screens.

## 8. Art and audio

- Art: one SVG per animation frame (see `.kiro/steering/sprites.md`). Placeholders until the
  team's frames land.
- Audio: synthesized with Web Audio (modem dial and handshake, dings, hits, groans). No samples
  or music we don't own.
