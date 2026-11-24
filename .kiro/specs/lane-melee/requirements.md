# Requirements Document

## Introduction

The lane-melee feature changes what a zombie does when it reaches the modem. In connection-lane a
Mob bit once, dealt its damage and left the Lane. Now a Mob that reaches the modem **stays there
and keeps hitting the modem until the player kills it**. A Glob is a projectile and still hits
once and is gone. It is milestone 3c in `docs/roadmap.md` and follows `docs/game-design.md`
sections 4, 5, 8 and 9 as updated on 22 Nov 2026.

This feature changes shipped connection-lane rules:

- connection-lane Requirement 4.2 (a Mob that reaches the Modem_Line bites once and is removed)
  now applies only to Globs. Mobs follow Requirements 1–3 here.
- connection-lane Requirement 4.4 (every tank or boss bite emits a Pop_Up_Burst_Request) now
  applies only to the first Melee_Hit of each tank or boss (Requirement 4 here).
- connection-lane Requirement 2.1 modem damage defaults change to the hit damage in
  Requirement 5 here.
- connection-lane Requirement 13.9 gains the Attacker animation rule in Requirement 7 here.

Out of scope: the CCTV look of the lane (`lane-cctv`), the surge protector (`economy-weapons`),
the browser front that shows pop-up bursts (`browser-front`) and the chapter director
(`cross-front-and-director`).

## Glossary

Terms from connection-lane keep their meaning (Run, Tick, Lane, Lane_X, Modem_Line, Manhole,
Mob, Glob, Enemy, Enemy_Stats, Hit_Box, Hit_Padding, Hit_Priority, Lane_State, Lane_Balance,
Lane_Systems, Lane_View, Pop_Up_Burst_Request, Sprite_Atlas). New and changed terms:

- **Attack_Point**: the Lane_X where a Mob stands while it hits the modem: half its Hit_Box
  width, so the front of the Hit_Box touches the Modem_Line.
- **Attacker**: a Mob standing at its Attack_Point. An Attacker does not move.
- **Melee_Hit**: one hit an Attacker deals to the modem.
- **Hit_Interval**: the seconds between two Melee_Hits of one Mob kind, from the Lane_Balance.
- **Hit_Damage**: the modem damage of one Melee_Hit, or of one Glob_Impact, from the
  Enemy_Stats.
- **Glob_Impact**: a Glob reaching the Modem_Line. The Glob deals its Hit_Damage once and leaves
  the Lane. This is the old connection-lane Bite, now for Globs only.
- **Melee_Kind**: a Mob kind that becomes an Attacker when it reaches the modem: default, fast,
  tank and boss. The ranged Mob stops at mid-lane and never reaches the modem.

## Requirements

### Requirement 1: Arriving at the modem

**User Story:** As a player, I want a zombie that reaches the modem to stop there and start
hitting it, so that a zombie I ignored stays a problem I can see.

#### Acceptance Criteria

1. WHEN a walking Mob of a Melee_Kind moves to a Lane_X at or below its Attack_Point, THE
   Lane_Systems SHALL set its Lane_X to its Attack_Point, stop moving it and make it an Attacker
   on the same Tick.
2. WHEN a Mob becomes an Attacker, THE Lane_Systems SHALL emit `mobArrived` with the Mob's id
   and kind, and land the Mob's first Melee_Hit on the same Tick.
3. WHILE a Mob is an Attacker, THE Lane_Systems SHALL keep its Lane_X at its Attack_Point.
4. THE Lane_Systems SHALL keep the Lane_X of every Enemy greater than 0 and no greater than the
   Lane_Length, as connection-lane Requirement 4.3 requires.
5. WHEN a Glob reaches a Lane_X of 0 or less, THE Lane_Systems SHALL resolve a Glob_Impact as
   connection-lane Requirement 4.2 describes: emit `mobBit`, deal its Hit_Damage once and remove
   the Glob on the same Tick.

### Requirement 2: Hitting the modem on a timer

**User Story:** As a player, I want each zombie at the modem to hit at a steady pace, so that I
can read the danger and decide which one to kill first.

#### Acceptance Criteria

1. WHILE a Mob is an Attacker, THE Lane_Systems SHALL land a Melee_Hit on every Tick that is a
   whole multiple of its Hit_Interval in Ticks after its first Melee_Hit.
2. WHEN a Melee_Hit lands, THE Lane_Systems SHALL emit `mobBit` with the Mob's id, kind and
   Hit_Damage, and then call `damageModem` once with the Hit_Damage, so that `mobBit` comes
   immediately before the `modemHit` event of that Melee_Hit.
3. WHEN several Melee_Hits and Glob_Impacts land on the same Tick, THE Lane_Systems SHALL resolve
   them in ascending Enemy id order.
4. FOR ALL Attackers that stay alive for n Ticks after becoming Attackers, THE Lane_Systems SHALL
   land exactly `floor(n / hitIntervalTicks) + 1` Melee_Hits from that Attacker in those Ticks,
   counting the arrival Tick.
5. THE Lane_Systems SHALL convert each Hit_Interval to Ticks with `Math.round(seconds × 60)`, as
   connection-lane Requirement 2.4 requires.

### Requirement 3: Killing an Attacker

**User Story:** As a player, I want a zombie to stop hitting the modem the moment I kill it, so
that killing it is always worth the click.

#### Acceptance Criteria

1. THE Lane_Systems SHALL keep an Attacker on the Lane, landing Melee_Hits, until its HP reaches
   0.
2. WHEN an Attacker's HP reaches 0 on a Tick, THE Lane_Systems SHALL remove it and SHALL land no
   Melee_Hit from it on that Tick or later.
3. THE Lane_Systems SHALL resolve weapon damage before Melee_Hits within one Tick, so that a
   killing blow on the Tick of a scheduled Melee_Hit cancels that Melee_Hit.
4. WHEN an Attacker is killed, THE Lane_Systems SHALL emit `mobKilled` with its Lane_X and KB
   drop as connection-lane Requirement 8.2 requires.
5. THE Lane_Systems SHALL let the Hammer hit Attackers with the same Hit_Box and Hit_Priority
   rules as walking Mobs.

### Requirement 4: Pop-up bursts on the first hit only

**User Story:** As a player, I want a tank or boss reaching the modem to spill ads into the
browser once, so that the browser front reacts without flooding.

#### Acceptance Criteria

1. WHEN a tank Mob lands its first Melee_Hit, THE Lane_Systems SHALL emit a Pop_Up_Burst_Request
   with the Lane_Balance burst count and cause `tankBite`.
2. WHEN a boss Mob lands its first Melee_Hit, THE Lane_Systems SHALL emit a Pop_Up_Burst_Request
   with the Lane_Balance burst count and cause `bossBite`.
3. WHEN a tank or boss Mob lands any Melee_Hit after its first, THE Lane_Systems SHALL emit no
   Pop_Up_Burst_Request for that Melee_Hit.
4. THE Lane_Systems SHALL keep the boss summon bursts of connection-lane Requirement 6.1
   unchanged.

### Requirement 5: Melee tuning as data

**User Story:** As a designer, I want hit damage and hit timing in the lane balance table, so
that I can tune the pressure at the modem without touching logic.

#### Acceptance Criteria

1. THE Lane_Balance SHALL hold a Hit_Damage for every Enemy kind and a Hit_Interval for every
   Melee_Kind.
2. THE Lane_Balance defaults SHALL use `docs/game-design.md` section 5: Hit_Damage default 4,
   fast 3, tank 10, boss 20, Glob 5 and ranged 0; Hit_Interval default 1.5 s, fast 1 s, tank 2 s
   and boss 2 s.
3. IF Lane_Balance overrides give a Hit_Interval that is not finite or rounds to fewer than 1
   Tick, or a Hit_Damage that is negative or not finite, THEN THE `resolveLaneBalance` function
   SHALL throw a `LaneBalanceError` that lists every problem found.
4. THE Lane_Systems SHALL read Hit_Damage and Hit_Interval only from the Lane_State's
   Lane_Balance.

### Requirement 6: Determinism and plain data

**User Story:** As a developer, I want the new attacker state to follow the game-core rules, so
that tests, replays and the balance tools keep working.

#### Acceptance Criteria

1. THE Lane_State SHALL record for each Attacker only plain data that survives a JSON round trip
   unchanged.
2. WHEN two Runs start from the same seed with the same Lane_Balance and receive the same input
   commands on the same Ticks, THE Lane_Systems SHALL produce identical states and identical
   events on every Tick.
3. WHILE the Run phase is `won` or `lost`, THE Lane_Systems SHALL land no Melee_Hit.
4. WHEN `runHeadless` plays a Run with no input commands, THE Run SHALL reach the `lost` phase
   from Melee_Hits alone.

### Requirement 7: Drawing and sounds for Attackers

**User Story:** As a player, I want to see and hear every hit on the modem, so that the damage
never feels invisible.

#### Acceptance Criteria

1. WHEN the Lane_View chooses an animation for an Attacker, THE Lane_View SHALL use `hit` for 6
   Ticks after the Attacker's last hit Tick, `attack` for 12 Ticks after each of its Melee_Hits,
   and `idle` otherwise.
2. WHEN several Attackers stand at the modem, THE Lane_View SHALL draw each one with a horizontal
   offset of at most the Hit_Padding from its Lane_X, so that every Attacker stays visible and
   clicks still land on its Hit_Box.
3. WHEN a frame's events include `mobArrived`, THE Lane_View SHALL play a groan from the
   Lane_Sounds once for that frame.
4. WHEN a frame's events include `mobBit`, THE Lane_View SHALL play the bite sound once for that
   frame, as connection-lane Requirement 14.2 requires.
5. THE Lane_View SHALL keep the modem-hit shake of connection-lane Requirement 11.7 for every
   Melee_Hit, subject to the Screen_Shake setting.

### Requirement 8: Tests, skill and docs

**User Story:** As the team, we want the old bite tests replaced openly and the mob recipe kept
current, so that the change is traceable.

#### Acceptance Criteria

1. THE connection-lane tests that assert a Mob leaves the Lane on its Bite SHALL be replaced by
   tests for Requirements 1–4 here, and the list of replaced tests SHALL be recorded in this
   spec's design.
2. THE connection-lane property tests that do not assert Bite removal for Mobs SHALL pass
   without changes to their assertions, except connection-lane Property 13, whose feet position
   rule gains the Attacker offset of Requirement 7.2.
3. THE `add-mob` skill SHALL tell the reader to set a Hit_Damage and, for a Melee_Kind, a
   Hit_Interval.
4. THE connection-lane requirements SHALL carry a note under Requirements 2.1, 4.2, 4.4 and 13.9
   that points to this spec.
5. THE file `docs/kiro-log.md` SHALL contain a dated note under "Notes" describing this change.

## Decisions

1. **Bite event name kept.** Each Melee_Hit emits the existing `mobBit` event, so the lane
   sounds and later effects keep working. `mobArrived` is new.
2. **No queue at the modem.** Every Attacker stands at its own Attack_Point and they overlap.
   The drawing spreads them out by a few pixels (Requirement 7.2), and Hit_Priority picks the
   lowest id first when they overlap.
3. **First hit on arrival.** An Attacker hits on the Tick it arrives, so reaching the modem
   always costs integrity at once.
4. **Starting numbers** come from the updated design doc. An unattended default zombie now costs
   about 16 integrity in 6 seconds instead of 10 once; the director and the balance tool tune
   this later.
