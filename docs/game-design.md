# Game design

Source of truth for the game. Numbers are starting values; tuning happens in
`src/game/balance/`. Section 9 records why each rule was chosen.

## 1. Flow

**Objective:** get online and download `HOMEWORK.ZIP` before the zombies wreck the modem.

1. **Title screen (theme song, Play game, Hall of Fame, Options) → BIOS → splash → desktop.** The page opens
   straight on the title screen; the theme starts on the first click or key press. Always played,
   never skipped. During the boot or the desktop, the monitor's power button opens a dimmed
   "Return to the main menu?" confirm that pauses everything until answered. A sticky note on the desktop states the objective.
2. **Dial-up.** The player opens the dial-up connection. Dialing and the handshake take a fixed
   **20 seconds**. **The zombie raid has already started** on the connection lane, which the
   player watches through a CCTV feed.
3. **Connected.** The NetSurfer browser opens the download page by itself. The download cannot
   start until now. The player clicks the small grey real link to start it.
4. **Download.** Two-front play until the download hits 100% (win) or modem integrity hits 0
   (lose).
5. **Result screen** opens over the desktop. It shows the score as a printed receipt and a
   "Sign our Guestbook!" name field that submits the score to the Hall of Fame (section 12), win
   or lose. Two buttons: **Retry** dials up again at once (the 20 s dial-up and the raid play in
   full), **Main menu** goes back to the title screen.

Short hint balloons guide a first-time player through each new thing once per run (section 11).

## 2. Screen layout

- **Top: browser front.** Dial-up dialog first, then the NetSurfer window with the download page,
  the download bar and the ads.
- **Bottom: connection lane, shown as a CCTV feed.** A security camera watches the phone line:
  modem on the left, line across, manhole on the right. Mobs come out of the manhole and walk left
  along the line. The camera overlay shows "CAM 01", a blinking REC dot, a timestamp, scanlines
  and grain. HUD: integrity bar, KB counter, shop tray, styled as the camera's on-screen display.
- One mouse covers both. The distance the cursor must travel between them is part of the
  challenge.

## 3. Chapters (timeline from the moment dialing starts)

The run starts quiet and gets faster: the gap between default zombies shrinks from 10 s in the
hook to 2.5 s in plot turn 2.

| # | Chapter | Time | Browser front | Connection lane |
|---|---|---|---|---|
| 1 | Hook | 0:00–0:20 | Dial-up dialog: dialing, handshake screech, "Verifying user name and password..." No download yet. | CCTV feed flickers on. Manhole rattles. First **default** zombie crawls out about 0:08, the next about 0:18. Player learns the hammer. |
| 2 | Plot turn 1 | 0:20–0:55 | Connected. Download page with a small grey real link. First clutter ad bounces in (plain ✕, safe to close). Player clicks the real link and the bar starts. An open clutter ad visibly slows the bar. | Sparse default zombies, one about every 9 s. First KB drops. |
| 3 | Pinch 1 | 0:55–1:30 | First fake "DOWNLOAD NOW!!" button. First interrupter pauses the download. Ads start using tricky close patterns. First clutter ad lands **over the lane**. | **Fast** zombies join. A clutter ad left open for 10 s lets a zombie out of the manhole. |
| 4 | Midpoint | 1:30–1:55 | Bar crosses 50% (about 1:30). 2 seconds of calm (natural shop moment), then the biggest ad cluster so far. | **Tank** joins (4 HP). The saw becomes clearly worth buying. A tank at the modem hits for 10 every 2 s, and its first hit fires a pop-up burst. Ads now let out fast zombies. |
| 5 | Pinch 2 | 1:55–2:25 | Interrupters and fake buttons together. More clutter covers the lane. The ✕ on an interrupter runs away from the cursor. | **Ranged** zombie joins. All types active. Flamethrower earns its keep. Corruption overlay creeps in. |
| 6 | Plot turn 2 | 2:25–2:50 | Ad storm. One last interrupter at 90%. | **Boss** rises from the manhole when the download reaches 75% (about 2:12, late in pinch 2) and reaches the modem in plot turn 2, before the end. Zombie flood: a default zombie every 2.5 s. Fast, tank and ranged zombies come less often than in pinch 2 (every 8, 16 and 20 s). Integrity critical. Screen shake and crack overlay at maximum. |
| 7 | Resolution | about 3:00 | **Win:** bar hits 100%, handshake chime, "Welcome to the Internet!", file revealed as `funny_cats_1998.avi`. | **Lose:** integrity 0, modem screech, static, "Connection terminated" dialog, frozen file `SKELETON_DATING_SIM.EXE`. |

The download needs **135 seconds** of un-paused progress at full speed (0.74% per second). Full
speed needs a healthy modem and no open clutter ads (section 7). Interrupters, slowdowns and
fake-button penalties push a winning run to about 3:00 (the sim's competent bot wins at a median
of 3:16). Chapters start on the clock; the
midpoint beats, the boss and the last interrupter start on download progress.

## 4. Modem integrity

- Maximum **100**. **Critical at 20 or below**: a tank at the modem disconnects it in two hits
  (about 2 seconds), which matches the "one hit from disconnect" beat in plot turn 2.
- If the download completes on the same tick the modem dies, **the player wins**.
- **Line quality:** a damaged modem downloads slower. Download speed is multiplied by
  `0.6 + 0.4 × integrity / 100`, so it runs at 100% speed at full integrity and 68% at critical.

## 5. Mobs

All mobs walk left along the phone line. A mob that reaches the modem **stays there and hits it
again and again until it is killed**. It lands its first hit on arrival, then one hit every
"hit every" seconds. Globs are projectiles: a glob that reaches the modem hits once and is gone.

| Mob | Role | HP | Speed | Hit damage | Hit every | Drop | Behaviour |
|---|---|---|---|---|---|---|---|
| default | Teaches the basics | 5 (3 hammer hits) | slow | 4 | 1.5 s | 3 KB | Shambling crawler. |
| fast | Tests tracking | 3 (2 hammer hits) | fast | 3 | 1 s | 4 KB | Small and quick. Joins in pinch 1. |
| tank | Needs the saw | 6 | very slow | 10 | 2 s | 12 KB | Its first modem hit also fires a pop-up burst. Joins at the midpoint. |
| ranged | Punishes ignoring the lane | 4 | slow, then stops | 5 per glob | 3 s (spit) | 8 KB | Stops at mid-lane and spits a glob along the line every 3 s. Never walks to the modem. A glob dies to one hammer hit and drops nothing. Joins in pinch 2. |
| boss | Final threat | 150 | slow (a little slower than default) | 20 | 2 s | 30 KB | At 75%, 50% and 25% HP it summons 2 default zombies and fires a pop-up burst. Its first modem hit also fires a pop-up burst. Rises when the download reaches 75%, or at 3:20 at the latest. |

Drops and speeds are starting values; `src/game/balance/` holds the tuned numbers.

## 6. Weapons, KB and shop

- **KB (kilobytes)** is the currency. Killed mobs drop a data packet. **Moving the cursor over
  a packet collects it**; no click needed. Packets fade after **3 seconds**.
- Closing an ad correctly gives **+3 KB**.
- **Combo:** killing zombies less than 2 s apart builds a chain. From the third kill on, each
  kill in the chain shows "COMBO xN" on the CCTV display and gives +1 KB. Globs don't count.
- **Shop tray** in the lane HUD. Each slot shows its key as a boxed key cap, apart from the
  price. Buying does **not** pause the game.
- **Switching weapons:** press **1 / 2 / 3** (or click the weapon's slot) to take the hammer, saw
  or flamethrower in hand, back and forth at any time. Q/E and the mouse wheel still cycle.
- **Weapon roles:** the hammer hits hardest per click, the saw is steady damage while held, the
  flamethrower burns crowds but the boss takes only a quarter of its fire damage.
- Each upgrade has a single level, so the shop stays readable at a glance.

| Item | Cost | How it works | Upgrade |
|---|---|---|---|
| Hammer | free (default) | Click a mob: 2 damage, 0.38 s cooldown. Hardest hit; best on the boss once upgraded. | Heavy head, 30 KB: 3 damage. |
| Electric saw | 75 KB | Hold on a mob: 7 damage per second. Steady, no clicking; best against tanks. | High RPM, 50 KB: +50% damage. |
| Flamethrower | 150 KB | Hold and drag: cone deals 3 damage per second to every mob in it, and burning mobs take 1 more per second for 2 s. The boss takes 25% of that. 6 s of fuel; refills while not firing. | Big tank, 60 KB: +50% fuel. |
| Pop-up blocker | 40 KB, one use, 20 s cooldown | Auto-closes clutter ads for 6 seconds. The only item that helps the browser front. Can't be bought again for 20 s after a purchase (the tray shows "WAIT 12s"). | – |
| Surge protector | 50 KB, hold max 1, 20 s cooldown | Switches on at the next modem hit and blocks all modem damage for 5 seconds, that hit included. Can't be bought again for 20 s after a purchase. | – |

Hotkeys: **1 / 2 / 3** take the hammer, saw or flamethrower in hand, or buy the weapon if it is
not owned yet. **Shift + 1 / 2 / 3** buy that weapon's upgrade (also the "UPG" button under the
weapon in the tray, lit yellow when affordable). **4** pop-up blocker, **5** surge protector.

Rough economy target: a player who kills most mobs and closes most ads can buy the saw around
1:20–1:35 (just before tanks) and the flamethrower around 2:00–2:20. The aim was that a typical
run earns less than the whole shop costs, so the player chooses what to buy. At these prices it
does not hold for a skilled player: the sim's competent bot earns about 610 KB by a win against
a 365 KB shop (`docs/balance/2026-11-24-late-income.md`). Most of that arrives after the
flamethrower, so the choice still matters before 2:20. We kept the prices on purpose.

## 7. Ads (browser front)

| Ad | Behaviour | Correct response | Mistake |
|---|---|---|---|
| Clutter banner | Bounces in with a ding and covers part of the screen. From pinch 1 some land over the lane, where they block clicks on the zombies under them. | Close it with its close pattern (+3 KB). | While open it **eats bandwidth**: each open clutter ad slows the download by 15 points, down to 40% of full speed. After **10 s open it hatches**: it shakes, cracks, and a zombie climbs out of the manhole (default before the midpoint, fast after). It hatches again every 10 s until closed. A wrong control opens one more clutter banner. |
| Fake button | Big green "DOWNLOAD NOW!!" near the real link. Disappears by itself after 8 s. | Ignore it. Click only the small grey real link. | Download −20%, a fast zombie spawns and −5 KB. |
| Interrupter | Modal over the browser that pauses the download. From pinch 2 its ✕ jumps away from the cursor, **at most 3 times**, then stays put. | Close it with its close pattern (+3 KB). | Download stays paused. A wrong control opens one more clutter banner. |

At most **8 clutter ads** are open at once; a new clutter ad over that limit is skipped.
Interrupters and fake buttons are never skipped, so a screen full of clutter can't shield the
download.

### Close patterns

Every clutter banner and interrupter has one close pattern. Each pattern has exactly one correct
control, and a player who has seen it once can close it in about 2 seconds.

| Pattern | What the player sees | Correct control | From chapter |
|---|---|---|---|
| Plain | A normal ✕ in the title bar. | The ✕. | 2 |
| Decoy ✕ | A big ✕ inside the ad and a small ✕ in the title bar. | The small title-bar ✕. The big one is part of the ad. | 3 |
| Hidden ✕ | No ✕ in the usual corner. A tiny ✕ sits in another corner. | The tiny ✕. | 3 |
| Swapped buttons | "OK" and "Cancel" where "OK" means "install". | The plain text link "no thanks, I like slow Internet". | 3 |
| Countdown | "Skip ad in 3..." | The Skip button once the count reaches 0. Clicks before that do nothing. | 4 |
| Confirm | The ✕ opens "Are you sure you want to miss this deal? [Yes] [No]". | ✕, then "Yes". | 4 |
| Runaway ✕ | Interrupters only. The ✕ jumps away from the cursor at most 3 times. | The ✕ once it stops. | 5 |

## 8. Cross-front rules

- Fake button clicked → download −20%, a fast zombie spawns at the manhole, −5 KB.
- First modem hit of a tank or boss → pop-up burst (3 clutter banners) on the browser front.
- Integrity at or below critical → corruption and crack overlays across both screens, and the
  CCTV feed starts losing signal.
- Open clutter ad → slower download; open for 10 s → a zombie hatches at the manhole.
- Lane-cover clutter ad → blocks clicks on the lane under it.
- Damaged modem → slower download (line quality, section 4).

## 9. Why these rules

| Rule | Reason |
|---|---|
| Fixed 20 s dial-up | The chapter timeline is scripted. A fixed length keeps every beat landing on time and makes the demo video repeatable. |
| Win on a same-tick tie | The resolution beat is "the line holds". Losing on a tie would feel unfair. |
| Mobs stay at the modem and keep hitting it | A zombie the player ignored stays a visible problem until it is dealt with, which gives the lane real pressure. Every hit has a swing, a sound, a shake and CCTV static, so the drain is never invisible. Replaced "bite once and vanish" on 22 Nov. |
| Tank and boss bursts on the first hit only | With repeated hits, a burst on every hit would flood the browser with ads. |
| Surge protector blocks for 5 seconds | With repeated hits, blocking a single hit is worth too little for 50 KB. |
| Collect KB by hovering | It keeps the mouse-travel tension without adding a third kind of click. |
| Runaway ✕ stops after 3 jumps | The gag stays funny without turning into a dead end. |
| One correct control per close pattern | Tricky ads waste time but stay fair. Every pattern can be learned once and then beaten quickly. |
| Fake button also spawns a zombie | Every browser mistake shows up on the lane, which is the core idea of the game. |
| One upgrade level each | 13 days of build time; the shop must be readable mid-chaos. |
| Title screen before the BIOS | It sets the mood and gives Options a home. The BIOS, desktop and dial-up still play every time. |
| Retry dials again without rebooting | A retry after a loss should take seconds. The dial-up and the raid still play in full, so the run is never skipped. Main menu still leads through the full startup. |
| CCTV feed for the lane | It explains why the player can see the phone line, and it is a strong costume for the Costume Contest. |
| Hint balloons, once per run, can be turned off | A first-time player needs to know the objective and the controls. Late-90s tray balloons fit the costume and never pause the game. |
| Settings in `localStorage` with a fail-safe fallback | Players set them once. Blocked or bad storage starts on defaults instead of failing. |
| Open clutter ads slow the download and hatch zombies | Playtest, 23 Nov: players ignored clutter because it cost nothing. A slower bar is visible at once, and a hatching zombie puts the browser mistake on the lane. Replaced "ignoring it only hides the page". |
| Ad limit counts clutter only | With one shared limit, a pile of unclosed clutter blocked interrupters and fake buttons, so ignoring ads protected the download. |
| Lane-cover ads from pinch 1 | The lane is where ads hurt most, and pinch 2 was too late for players to feel it. |
| About 3:00 per run, slow start | Playtest, 23 Nov: the run felt short and easy. Every bot won every run and the modem never went critical. A quiet start teaches; the ramp makes the end tense. Replaced "about 2:30". The demo video cuts the dial-up to stay under 3 minutes. |
| Boss rises on download progress | At a fixed 1:58 it reached the modem after a typical run had already been won. Tying it to 75% makes it arrive with time left for every player. At 65% it rose about 30 s before plot turn 2, and a boss strong enough to threaten the modem then either wrecked it early or stalled the download (`docs/balance/2026-11-24-boss-threat.md`). |
| Boss has 150 HP | A 30 HP boss died to the saw in about 4 s and never reached the modem in a win, so the modem never went critical. At 150 HP it reaches the modem in every win and 70% of competent runs go critical in plot turn 2 (`docs/balance/2026-11-24-boss-threat.md`). |
| Fewer rich zombies in plot turn 2 | Fast, tank and ranged zombies there added KB but no lane pressure. Halving them, and halving the boss drop to 30 KB, cut late income without making the run easier (`docs/balance/2026-11-24-late-income.md`). |
| Line quality | A damaged modem slows the download, so lane mistakes also cost time on the browser front. It is mild (68% at critical) so a hurt run can still be won. |
| Lower drops, higher prices | The sim showed every player could afford the saw at 0:52 and everything by 1:30. Weapons should feel earned and the shop should involve a choice. |
| +3 KB per closed ad | Makes the trip up to the browser pay, which adds to the mouse-travel tension. |
| Direct weapon keys | Feedback, 25 Nov: players want to switch back and forth between weapons. Before, 1–3 bought upgrades and only Q/E or the wheel switched. 1–3 now pick the weapon; Shift buys upgrades so a switch never spends KB. |
| Weapon roles | Feedback, 25 Nov: the flamethrower should be a crowd weapon rather than a boss killer, and the hammer should hit harder. Each weapon now has a job: hammer for big hits and the boss, saw for steady single targets, flamer for crowds. Mob HP rose with the hammer so the early lane stays as hard (`docs/balance/2026-11-25-weapon-roles.md`). |
| 20 s cooldown on the blocker and surge protector | Feedback, 25 Nov: neither item should be buyable back to back. The cooldown starts at purchase, so each one is a timed choice. |
| Combo +1 KB | Rewards clean lane play and the flamethrower without inflating the economy. |
| Daily seed | Everyone plays the same run on a given day, so the Hall of Fame compares like with like. |
| Client-side score, insert-only table | No accounts or server code within the deadline. Anyone with devtools could fake a score; database checks keep values in range, and that is acceptable for a jam. |

## 10. Art and audio

- Art: one SVG per animation frame (see `.kiro/steering/sprites.md`). Placeholders until the
  team's frames land.
- The lane is drawn as a night-time CCTV feed. The camera effects never change where a click
  lands, and they never flash more than 3 times per second.
- Audio: synthesized with Web Audio (modem dial and handshake, dings, hits, groans, camera
  static). No samples or music we don't own.

## 11. Guide

- **Desktop sticky note:** "Get online. Download HOMEWORK.ZIP before midnight. Don't let
  anything eat the modem."
- **Hint balloons** pop up from the taskbar tray, late-90s style, once per run each, and never
  pause the game:
  - dialing starts: zombies are on the line, click them to smash them
  - connected: click the small grey link, not the big green button
  - first ad: close pop-ups, open ones slow the download and let zombies out
  - first interrupter: this pop-up paused your download
  - first data packet: move over it to grab the KB
  - first time the player can afford an item: press 1–5 or click to buy
  - first saw or flamethrower bought: 1–3 switch weapons, what each is good at, Shift+1–3 for upgrades
  - integrity critical: the modem is dying, defend it
- A "Show hints" checkbox in Options turns the balloons off. The sticky note always shows.

## 12. Score and Hall of Fame

**Daily run.** Every run uses a seed made from the UTC date, so all players get the same ad
draws on the same day. Retry replays today's run.

**Score**, computed from the final state, win or lose:

| Part | Points |
|---|---|
| Download | 10 per whole percent (max 1,000) |
| Kills | 10 per zombie killed (globs don't count), +200 for the boss |
| Ads | 20 per ad closed with its correct control |
| Best combo | 25 × the longest chain, if it reached 3 |
| Win bonus | 1,000 + 10 per integrity point left (rounded up) + 5 per whole second under 4:00 from dialing |

The result screen prints the parts as a receipt from "NetSurfer Billing Dept."

**Guestbook.** Below the receipt: "Sign our Guestbook!" with a name field (3–12 letters, digits,
spaces, `_` or `-`; the last name used is remembered) and a **Sign** button. After signing, the
page shows the player's rank today and the top 10. A failed request, or one slower than 5 s,
shows "Server busy. Try again later." and allows one more try. With no server configured the
form shows "Guestbook closed for maintenance." instead. Neither ever blocks Retry or Main menu.

**Hall of Fame** on the title screen opens a late-90s guestbook page with a guest counter (how many scores have been signed) and
two lists: today's top 10 and the all-time top 10.

Scores live in a Supabase table that the game reaches with the publishable key only. Row-level
security allows reading and inserting, never updating or deleting, and database checks keep
every field in range. The secret key is never used by the game.
