# Game design

Source of truth for the game. Numbers are starting values; tuning happens in
`src/game/balance/`. Section 9 records why each rule was chosen.

## 1. Flow

1. **Power on → BIOS → splash → desktop.** Always played, never skipped.
2. **Dial-up.** The player opens the dial-up connection. Dialing and the handshake take a fixed
   **20 seconds**. **The zombie raid has already started** on the connection lane.
3. **Connected.** The browser opens the download page. The download cannot start until now.
4. **Download.** Two-front play until the download hits 100% (win) or modem integrity hits 0
   (lose).
5. **Result screen**, then back to the desktop to play again.

## 2. Screen layout

- **Top: browser front.** Dial-up dialog first, then the download page, the download bar and the
  ads.
- **Bottom: connection lane.** Modem on the left, phone line across, manhole on the right. Mobs
  come out of the manhole and walk left along the line. HUD: integrity bar, KB counter, shop tray.
- One mouse covers both. The distance the cursor must travel between them is part of the
  challenge.

## 3. Chapters (timeline from the moment dialing starts)

| # | Chapter | Time | Browser front | Connection lane |
|---|---|---|---|---|
| 1 | Hook | 0:00–0:20 | Dial-up dialog: dialing, handshake screech, "Verifying user name and password..." No download yet. | Manhole rattles. First **default** zombie crawls out about 0:08. Player learns the hammer. |
| 2 | Plot turn 1 | 0:20–0:45 | Connected. Download page with a small grey real link. First clutter ad bounces in (safe to close). Player clicks the real link and the bar starts. | Steady default zombies. First KB drops. |
| 3 | Pinch 1 | 0:45–1:10 | First fake "DOWNLOAD NOW!!" button. First interrupter pauses the download. | **Fast** zombies join. Two mobs on screen at once. |
| 4 | Midpoint | 1:10–1:30 | Bar crosses 50%. 2 seconds of calm (natural shop moment), then the biggest ad cluster so far. | **Tank** joins (4 HP). The saw becomes clearly worth buying. A tank hit costs 20 integrity and fires a pop-up burst. |
| 5 | Pinch 2 | 1:30–1:55 | Interrupters and fake buttons together. Clutter ads start covering part of the lane. The ✕ on an interrupter runs away from the cursor. | **Ranged** zombie joins. All types active. Flamethrower earns its keep. Corruption overlay creeps in. |
| 6 | Plot turn 2 | 1:55–2:15 | Ad storm. Bar near 80%. One last interrupter at the worst moment. | **Boss** rises from the manhole about 1:58. Zombie flood. Integrity critical. Screen shake and crack overlay at maximum. |
| 7 | Resolution | 2:15–2:30 | **Win:** bar hits 100%, handshake chime, "Welcome to the Internet!", file revealed as `funny_cats_1998.avi`. | **Lose:** integrity 0, modem screech, static, "Connection terminated" dialog, frozen file `SKELETON_DATING_SIM.EXE`. |

The download needs about **110 seconds** of un-paused progress (0.91% per second). Interrupters
and fake-button penalties push a run toward the 2:30 mark.

## 4. Modem integrity

- Maximum **100**. **Critical at 20 or below**: one tank hit from disconnect, which matches the
  "one hit from disconnect" beat in plot turn 2.
- If the download completes on the same tick the modem dies, **the player wins**.

## 5. Mobs

All mobs walk left along the phone line. A mob that reaches the modem bites once, deals its
damage and is gone.

| Mob | Role | HP | Speed | Modem damage | Drop | Behaviour |
|---|---|---|---|---|---|---|
| default | Teaches the basics | 2 | slow | 10 | 5 KB | Shambling crawler. |
| fast | Tests tracking | 1 | fast | 8 | 8 KB | Small and quick. Joins in pinch 1. |
| tank | Needs the saw | 4 | very slow | 20 | 20 KB | Its modem hit also fires a pop-up burst. Joins at the midpoint. |
| ranged | Punishes ignoring the lane | 3 | slow, then stops | 5 per glob | 15 KB | Stops at mid-lane and spits a glob along the line every 3 s. A glob dies to one hammer hit and drops 1 KB. Joins in pinch 2. |
| boss | Final threat | 30 | very slow | 40 | 100 KB | At 75%, 50% and 25% HP it summons 2 default zombies and fires a pop-up burst. Arrives in plot turn 2. |

## 6. Weapons, KB and shop

- **KB (kilobytes)** is the currency. Killed mobs drop a data packet. **Moving the cursor over
  a packet collects it**; no click needed. Packets fade after **4 seconds**.
- Closing an ad correctly gives **+2 KB**.
- **Shop tray** in the lane HUD. Buy by clicking or with hotkeys 1–5. Buying does **not** pause the
  game. Owned weapons are switched with Q/E or the mouse wheel.
- Each upgrade has a single level, so the shop stays readable at a glance.

| Item | Cost | How it works | Upgrade |
|---|---|---|---|
| Hammer | free (default) | Click a mob: 1 damage, 0.3 s cooldown. | Heavy head, 30 KB: 2 damage. |
| Electric saw | 60 KB | Hold on a mob: 5 damage per second. Best against tanks. | High RPM, 50 KB: +50% damage. |
| Flamethrower | 120 KB | Hold and drag: cone deals 4 damage per second, and burning mobs take 1 more per second for 2 s. 6 s of fuel; refills while not firing. | Big tank, 60 KB: +50% fuel. |
| Pop-up blocker | 40 KB, one use | Auto-closes clutter ads for 6 seconds. The only item that helps the browser front. | – |
| Surge protector | 50 KB, hold max 1 | Absorbs the next modem hit completely. | – |

Rough economy target: a player who kills most mobs has 60 KB around 0:55–1:10 (saw before tanks)
and 120 more by about 1:30 (flamethrower for pinch 2).

## 7. Ads (browser front)

| Ad | Behaviour | Correct response | Mistake |
|---|---|---|---|
| Clutter banner | Bounces in with a ding and covers part of the screen. | Close it (+2 KB). | Ignoring it hides the lane. |
| Fake button | Big green "DOWNLOAD NOW!!" | Ignore it. Click only the small grey real link. | Download −20%, a fast zombie spawns and −5 KB. |
| Interrupter | Modal that pauses the download. From pinch 2 its ✕ jumps away from the cursor, **at most 3 times**, then stays put. | Close it (+2 KB). | Download stays paused. |

## 8. Cross-front rules

- Fake button clicked → download −20%, a fast zombie spawns at the manhole, −5 KB.
- Tank or boss modem hit → pop-up burst (3 clutter banners) on the browser front.
- Integrity at or below critical → corruption and crack overlays across both screens.

## 9. Why these rules

| Rule | Reason |
|---|---|
| Fixed 20 s dial-up | The chapter timeline is scripted. A fixed length keeps every beat landing on time and makes the demo video repeatable. |
| Win on a same-tick tie | The resolution beat is "the line holds". Losing on a tie would feel unfair. |
| Mobs bite once and vanish | Each hit is a readable moment with a sound and shake. Mobs that keep chewing would drain integrity invisibly. |
| Collect KB by hovering | It keeps the mouse-travel tension without adding a third kind of click. |
| Runaway ✕ stops after 3 jumps | The gag stays funny without turning into a dead end. |
| Fake button also spawns a zombie | Every browser mistake shows up on the lane, which is the core idea of the game. |
| One upgrade level each | 13 days of build time; the shop must be readable mid-chaos. |

## 10. Art and audio

- Art: one SVG per animation frame (see `.kiro/steering/sprites.md`). Placeholders until the
  team's frames land.
- Audio: synthesized with Web Audio (modem dial and handshake, dings, hits, groans). No samples
  or music we don't own.
