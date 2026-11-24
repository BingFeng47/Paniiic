# Requirements Document

## Introduction

The economy-weapons feature adds the currency and the tools. Killed zombies drop data packets
worth KB, which the player collects by moving the cursor over them. Correctly closed ads give
KB too, and a fake button click costs KB. The shop tray in the lane HUD sells an electric saw, a
flamethrower, a pop-up blocker, a surge protector and one upgrade per weapon. It is milestone 6
in `docs/roadmap.md` and follows `docs/game-design.md` section 6 as updated on 22 Nov 2026.

All economy and weapon rules live in `src/game/` as pure game-core systems. The lane view and the
HUD turn pointer and keyboard input into commands and never change the state.

Out of scope: tuning against win rates (`zombie-sim-mcp`), final weapon art (`final-art`) and
hit effects beyond the basics (`juice-and-endings`).

## Glossary

Terms from game-core, connection-lane, lane-melee, lane-cctv and browser-front keep their
meaning (Run, Tick, Enemy, Mob, Attacker, Melee_Hit, Glob_Impact, Hit_Box, Hit_Priority,
Lane_Units, Lane_View, Lane_HUD, OSD, `mobKilled`, `adClosed`, `fakeButtonClicked`, Ad, Ad_Kind).
New terms:

- **KB**: kilobytes, the currency. Always a whole number.
- **Wallet**: the player's KB in the Run state. It starts at 0 and never goes below 0.
- **Data_Packet**: a pickup dropped where a Mob or Glob died, worth that Enemy's KB drop.
- **Packet_Lifetime**: 4 s. A Data_Packet that is not collected by then fades away.
- **Pickup_Radius**: the distance in Lane_Units within which the pointer collects a Data_Packet.
- **Lane_Pointer_Command**: the input command `{ type: 'lanePointer', x, y, down }` that the
  Lane_View sends with the pointer position in Lane_Units and whether the primary button is held.
- **Weapon**: the hammer, the electric saw or the flamethrower.
- **Active_Weapon**: the owned Weapon the pointer uses on the lane.
- **Item**: anything the shop sells: a Weapon, a Weapon_Upgrade, the pop-up blocker or the surge
  protector.
- **Weapon_Upgrade**: the single upgrade of a Weapon: heavy head, high RPM or big tank.
- **Shop_Tray**: the row of Shop_Slots in the Lane_HUD.
- **Shop_Slot**: one of five slots, hotkeys 1–5: 1 hammer upgrade, 2 saw then its upgrade,
  3 flamethrower then its upgrade, 4 pop-up blocker, 5 surge protector.
- **Buy_Command**: the input command `{ type: 'buy', slot }`.
- **Switch_Command**: the input command `{ type: 'switchWeapon', direction }` with direction
  `next` or `previous`.
- **Fuel**: the flamethrower's seconds of firing left.
- **Burn**: the after-effect of the flamethrower: 1 damage per second for 2 s.
- **Blocker_Window**: the 6 s during which the pop-up blocker closes clutter Ads.
- **Surge_Shield**: the 5 s during which the surge protector blocks all modem damage.
- **Economy_State**: the plain-data part of the Run state that holds the Wallet, the Data_Packets,
  the owned Items, the Active_Weapon, the Fuel, the Burns, the Blocker_Window and the
  Surge_Shield.
- **Economy_Balance**: the tuning table in `src/game/balance/economy.ts`.

## Requirements

### Requirement 1: Wallet and conservation

**User Story:** As a player, I want my KB to add up exactly, so that I can trust the number when
I am about to buy.

#### Acceptance Criteria

1. WHEN a Run gets its Economy_State, THE Economy_State SHALL start with a Wallet of 0, the
   hammer as the only owned Weapon and the hammer as the Active_Weapon.
2. WHEN KB is added to or taken from the Wallet, THE economy systems SHALL emit `kbChanged` with
   the change, the reason and the new Wallet.
3. FOR ALL Runs and Ticks, THE Wallet SHALL equal the KB gained minus the KB spent minus the KB
   lost, SHALL be a whole number, and SHALL NOT go below 0.
4. FOR ALL Runs and Ticks, THE KB spent SHALL NOT exceed the KB gained.

### Requirement 2: Data packets

**User Story:** As a player, I want kills to drop packets I grab by moving over them, so that
collecting money keeps my mouse moving without extra clicks.

#### Acceptance Criteria

1. WHEN a `mobKilled` event arrives with a KB drop above 0, THE economy systems SHALL add a
   Data_Packet at the kill's Lane_X with that KB value and emit `packetDropped`.
2. WHEN a Lane_Pointer_Command's point is within the Pickup_Radius of a Data_Packet, THE economy
   systems SHALL remove the Data_Packet, add its KB to the Wallet and emit `packetCollected`.
3. WHEN a Data_Packet has existed for the Packet_Lifetime, THE economy systems SHALL remove it
   and emit `packetExpired`.
4. WHILE the pointer is over the Lane_View canvas, THE Lane_View SHALL send at most one
   Lane_Pointer_Command per Tick, and only on Ticks where the pointer moved or its button state
   changed.
5. THE Lane_View SHALL draw each Data_Packet with the `drop` sprite and fade it out over the last
   second of its Packet_Lifetime.

### Requirement 3: KB from the browser front

**User Story:** As a player, I want ads to pay or cost me KB, so that the browser front feeds the
lane.

#### Acceptance Criteria

1. WHEN an `adClosed` event arrives, THE economy systems SHALL add its reward to the Wallet with
   the reason `adClosed`.
2. WHEN a `fakeButtonClicked` event arrives, THE economy systems SHALL take 5 KB from the Wallet
   with the reason `fakeButton`, or the whole Wallet if it holds less than 5 KB.

### Requirement 4: Shop

**User Story:** As a player, I want to buy with a click or a number key without pausing, so that
shopping is part of the chaos.

#### Acceptance Criteria

1. THE Economy_Balance defaults SHALL use the prices in `docs/game-design.md` section 6: heavy
   head 30 KB, electric saw 60 KB, high RPM 50 KB, flamethrower 120 KB, big tank 60 KB, pop-up
   blocker 40 KB and surge protector 50 KB.
2. WHEN a Buy_Command arrives for a Shop_Slot whose next Item is affordable and allowed, THE
   economy systems SHALL take its price from the Wallet, give the Item and emit `itemBought`.
3. IF a Buy_Command arrives for a Shop_Slot whose next Item costs more than the Wallet, is
   already owned, or is a surge protector while one is held, THEN THE economy systems SHALL leave
   the Economy_State unchanged and emit `buyRejected` with the reason.
4. WHEN the player buys a Weapon, THE economy systems SHALL make it the Active_Weapon.
5. WHEN the player presses a key from 1 to 5 during a Session, THE Lane_HUD SHALL send a
   Buy_Command for that Shop_Slot.
6. WHEN the player clicks a Shop_Slot, THE Lane_HUD SHALL send a Buy_Command for it.
7. THE Run SHALL keep advancing every Tick while the player shops.

### Requirement 5: Switching weapons

**User Story:** As a player, I want to swap tools fast, so that I can use the hammer on runners
and the saw on tanks.

#### Acceptance Criteria

1. WHEN the player presses Q or turns the mouse wheel up during a Session, THE Lane_View SHALL
   send a Switch_Command with direction `previous`.
2. WHEN the player presses E or turns the mouse wheel down during a Session, THE Lane_View SHALL
   send a Switch_Command with direction `next`.
3. WHEN a Switch_Command arrives, THE economy systems SHALL make the previous or next owned
   Weapon, in the order hammer, saw, flamethrower and wrapping around, the Active_Weapon, and
   emit `weaponSwitched`.
4. WHILE a Weapon other than the hammer is the Active_Weapon, THE Lane_View SHALL turn pointer
   presses into Lane_Pointer_Commands and not Hammer_Commands.

### Requirement 6: Hammer upgrade

**User Story:** As a player, I want a cheap first upgrade, so that early KB has a use.

#### Acceptance Criteria

1. WHILE the heavy head is owned, THE Lane_Systems SHALL deal 2 hammer damage per hit.
2. THE Lane_Systems SHALL keep the hammer cooldown at 0.3 s with or without the heavy head.

### Requirement 7: Electric saw

**User Story:** As a player, I want a saw I hold on a zombie, so that tanks melt instead of
soaking up clicks.

#### Acceptance Criteria

1. WHILE the saw is the Active_Weapon and the latest Lane_Pointer_Command has the button held, THE
   economy systems SHALL deal 5 damage per second to the Enemy at the pointer chosen by
   Hit_Priority, or 7.5 with high RPM.
2. THE economy systems SHALL apply saw damage in whole points through the lane damage rules, and
   SHALL carry unused fractions of damage on the same target from Tick to Tick.
3. FOR ALL Runs, a saw held without a break on one tank SHALL kill it within 0.8 s plus 1 Tick, or
   within 0.54 s plus 1 Tick with high RPM.
4. WHILE the saw is firing, THE Lane_View SHALL draw the saw `use` animation at the pointer and
   play the saw sound.

### Requirement 8: Flamethrower

**User Story:** As a player, I want a flamethrower I sweep across a crowd, so that pinch 2 floods
are survivable.

#### Acceptance Criteria

1. WHILE the flamethrower is the Active_Weapon, the button is held and Fuel is above 0, THE
   economy systems SHALL deal 4 damage per second to every Enemy whose Hit_Box overlaps the flame
   cone, which starts at the pointer and opens toward the Manhole.
2. WHEN the flame cone hits an Enemy, THE economy systems SHALL set a Burn on it for 2 s that deals
   1 damage per second, restarting the 2 s on each later hit.
3. WHILE the flamethrower is firing, THE economy systems SHALL reduce Fuel by 1 second per second;
   WHILE it is not firing, THE economy systems SHALL refill Fuel at the refill rate up to the
   maximum Fuel.
4. THE Economy_Balance defaults SHALL set the maximum Fuel to 6 s, or 9 s with the big tank.
5. WHEN Fuel reaches 0, THE economy systems SHALL stop the flame until the button is released and
   pressed again with Fuel above 0.
6. THE Lane_HUD SHALL show the Fuel as a gauge while the flamethrower is owned.

### Requirement 9: Pop-up blocker

**User Story:** As a player, I want one panic button for the browser, so that I can buy a few
seconds of quiet.

#### Acceptance Criteria

1. WHEN the player buys the pop-up blocker, THE economy systems SHALL start the Blocker_Window and
   emit `blockerStarted`.
2. WHILE the Blocker_Window lasts, THE Ad_Systems SHALL close every open clutter Ad and every
   clutter Ad that opens, emit `adBlocked` for each, and give no KB reward for them.
3. THE pop-up blocker SHALL leave fake buttons and interrupters open.
4. WHEN the Blocker_Window has lasted 6 s, THE economy systems SHALL end it and emit `blockerEnded`.

### Requirement 10: Surge protector

**User Story:** As a player, I want insurance for the modem, so that a crowd at the modem doesn't
end my run in a second.

#### Acceptance Criteria

1. WHEN a Melee_Hit or Glob_Impact would damage the modem while a surge protector is held and no
   Surge_Shield is active, THE economy systems SHALL use up the surge protector, start the
   Surge_Shield and emit `surgeStarted`.
2. WHILE the Surge_Shield lasts, THE Lane_Systems SHALL deal no modem damage from Melee_Hits and
   Glob_Impacts, starting with the hit that triggered it, and SHALL emit `modemHitBlocked` for each.
3. WHEN the Surge_Shield has lasted 5 s, THE economy systems SHALL end it and emit `surgeEnded`.
4. THE economy systems SHALL let the player hold at most 1 surge protector.

### Requirement 11: Shop tray and HUD

**User Story:** As a player, I want to read my money and the shop at a glance, away from the
hitting lane, so that I can buy mid-fight without thinking. (Playtest: the tray was hard to see
and sat over the hitting lane.)

#### Acceptance Criteria

1. WHEN the Lane_View receives a state, THE Lane_HUD SHALL show the Wallet as "KB" in the OSD
   style of lane-cctv.
2. THE Shop_Tray SHALL show for each Shop_Slot its hotkey, its next Item's name and price, and one
   of the states affordable, too expensive, owned or held.
3. THE Shop_Tray SHALL mark the Active_Weapon and show the Blocker_Window and Surge_Shield time
   left while they last.
4. THE Lane_HUD SHALL take its text from Copy_Modules that follow the `retro-copy` steering file
   and set it through `textContent`.
5. THE Shop_Tray SHALL sit centred along the top edge of the Lane_View, clear of the phone line
   and the Hit_Boxes, and SHALL NOT cover the "CAM 01", REC or timestamp OSD.

### Requirement 12: Sounds

**User Story:** As a player, I want money and weapons to sound distinct, so that I know a buy
worked without looking.

#### Acceptance Criteria

1. WHEN a frame's events include `packetCollected`, `itemBought`, `buyRejected`, `surgeStarted`,
   `modemHitBlocked` or `blockerStarted`, THE Lane_View SHALL play the matching synthesized
   recipe once for that frame.
2. WHILE the saw or the flamethrower is firing, THE Lane_View SHALL play its looping sound and
   stop it when firing stops.
3. THE economy sounds SHALL be synthesized with Web Audio nodes and SHALL load no audio files.

### Requirement 13: Determinism and integration

**User Story:** As a developer, I want the economy to follow the same rules as the rest of
game-core, so that the balance tool can measure it.

#### Acceptance Criteria

1. THE Economy_State SHALL contain only plain data that survives a JSON round trip unchanged.
2. WHEN two Runs start from the same seed with the same balance and receive the same input
   commands on the same Ticks, THE economy systems SHALL produce identical states and identical
   events on every Tick.
3. THE game-core `InputCommand` union SHALL include the Lane_Pointer_Command, the Buy_Command and
   the Switch_Command.
4. WHEN `runHeadless` plays a Run with a script that starts the download at 21 s, collects every
   Data_Packet and kills every Mob within 0.5 s of its spawn, THE Wallet plus KB spent SHALL reach
   at least 60 KB by 70 s.
5. THE Session_Registry SHALL list the economy systems.

### Requirement 14: Kiro workflow artifacts

**User Story:** As the team, we want the weapon recipe captured as a skill, so that adding a
weapon later is a repeatable step.

#### Acceptance Criteria

1. THE repository SHALL contain `.kiro/skills/add-weapon/SKILL.md` with front matter
   `name: add-weapon` and a `description` that says when to use it.
2. THE `add-weapon` skill SHALL list the files and steps for adding a Weapon or an Item as they
   exist in the code after this milestone.
3. THE file `docs/kiro-log.md` SHALL contain a dated note under "Notes" describing this spec.

## Decisions

1. **Hotkey slots.** One key per shop slot: a weapon's slot buys the weapon first and its upgrade
   second. This keeps five keys for seven Items.
2. **Flame cone points at the Manhole**, because every Mob comes from there.
3. **Pop-up blocker starts on purchase.** A one-use item that has to be bought and then triggered
   would need a sixth key.
4. **Surge protector blocks for 5 s** (design section 9) because with lane-melee a single hit is
   worth too little for 50 KB.
5. **Shop is open from the first Tick**, including dial-up, even though the Wallet starts at 0.
