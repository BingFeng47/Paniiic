# Requirements Document

## Introduction

Playtest feedback (23 Nov): the game is too easy and too short, and weapons unlock too fast. The
`balance_report` baseline (30 seeds) agrees: every bot wins every run, the modem never goes
critical, the median win is 2:15, every bot can afford the saw at 0:52 and saw plus
flamethrower at 1:24, and the boss reaches the modem only after a typical run has been won.

This spec makes a run last about 3:00 with a quiet start and a ramp, ties the boss to download
progress, tightens the economy, adds combos, teaches the bots to move a cursor between the two
fronts, and finishes with a measured tuning pass. It is milestone 11 in `docs/roadmap.md` and
follows `docs/game-design.md` sections 3, 5, 6 and 9 as updated on 23 Nov. It depends on
`ad-pressure` being built.

Shipped tests that pin old numbers (chapter start seconds, boss at 118 s, prices, drops, the
6,600-Tick download) are updated to the new design values in the same task that changes the
value, and each change is listed in the task notes. Tests are never weakened.

## Glossary

Terms from earlier specs keep their meaning. New terms:

- **Boss_Trigger**: the download percent at which the Boss_Rise runs (`bossAtPercent`, 65), with
  a clock fallback (`bossLatestSecond`, 200).
- **Combo**: a chain of Mob kills, each less than `comboWindowSeconds` after the previous one.
  Globs don't count.
- **Bot_Cursor**: the Screen point where a zombie-sim bot's mouse is. Moving it takes time.
- **Balance_Targets**: the checks `balance_report` runs, from `.kiro/steering/game-balance.md`.

## Requirements

### Requirement 1: About 3:00 per run

**User Story:** As a player, I want a run long enough to build up, so that the ending feels
earned.

#### Acceptance Criteria

1. THE core balance SHALL set `downloadPercentPerSecond` to `100 / 135`.
2. THE default Chapter_Table SHALL start the Chapters at 0, 20, 55, 90, 115 and 145 s.

### Requirement 2: Slow start, fast finish

**User Story:** As a player, I want a quiet start that gets busier each chapter, so that I learn
first and fight hard later.

#### Acceptance Criteria

1. THE default Chapter_Table SHALL use these waves (every seconds, offset seconds):

   | Chapter | default | fast | tank | ranged |
   |---|---|---|---|---|
   | Hook | 10, 8 | – | – | – |
   | Plot turn 1 | 9, 0 | – | – | – |
   | Pinch 1 | 8, 0 | 10, 4 | – | – |
   | Midpoint | 7, 0 | 9, 0 | 15, 3 | – |
   | Pinch 2 | 5, 0 | 7, 0 | 12, 0 | 16, 2 |
   | Plot turn 2 | 2.5, 0 | 4, 0 | 8, 0 | 10, 0 |

2. THE default Chapter_Table SHALL use these ad rows (every seconds; start and end relative to the
   Chapter; patterns as in `cross-front-and-director`):

   | Chapter | Rows |
   |---|---|
   | Plot turn 1 | clutter 9 s, 13–35, plain |
   | Pinch 1 | clutter 8 s, 0–35, tricky; Lane_Cover clutter 16 s, 4–35, tricky; fake 12 s, 5–35; interrupter 18 s, 10–35, tricky |
   | Midpoint | clutter 7 s, 0–25, all but runaway; Lane_Cover clutter 14 s, 3–25, all but runaway; interrupter 18 s, 0–25, all but runaway; fake 12 s, 0–25 |
   | Pinch 2 | Lane_Cover clutter 6 s, 0–30, all but runaway; interrupter 15 s, 0–30, all; fake 10 s, 0–30 |
   | Plot turn 2 | Lane_Cover clutter 3.5 s, 0–90, all but runaway; fake 8 s, 0–90 |

3. THE Midpoint_Calm, Midpoint_Cluster (4 ads), first clutter (connect + 5 s) and
   Last_Interrupter (90%) SHALL keep their rules.

### Requirement 3: The boss rises on download progress

**User Story:** As a player, I want the boss to reach the modem before I win, so that the final
fight happens in every run.

#### Acceptance Criteria

1. THE Chapter_Table SHALL replace `bossSecond` with `bossAtPercent` (default 65, in [0, 100])
   and `bossLatestSecond` (default 200, ≥ 0).
2. WHEN download progress first reaches `bossAtPercent`, or the Run reaches `bossLatestSecond`,
   whichever comes first, THE Director SHALL run the Boss_Rise once.
3. THE lane balance SHALL set the boss speed to 32 Lane_Units per second (25 s to cross).
4. THE Midpoint_Calm SHALL NOT hold the Boss_Rise.

### Requirement 4: A tighter economy

**User Story:** As a player, I want weapons to feel earned and the shop to involve a choice.

#### Acceptance Criteria

1. THE lane balance SHALL set drops to default 3, fast 4, tank 12, ranged 8, boss 60 and glob 0.
2. THE economy balance SHALL set the saw to 75 KB, the flamethrower to 150 KB and
   `packetLifetimeSeconds` to 3. The other prices stay.
3. THE ad balance SHALL set `rewardKb` to 3.
4. IF a Glob is killed, THEN THE wallet SHALL drop no packet, because its drop is 0.

### Requirement 5: Combos

**User Story:** As a player, I want quick kills to chain into a combo, so that clean lane play
feels good.

#### Acceptance Criteria

1. THE economy balance SHALL define `comboWindowSeconds` (default 2, ≥ 1 Tick), `comboStart`
   (default 3, integer ≥ 2) and `comboBonusKb` (default 1, integer ≥ 0).
2. WHEN a non-Glob Mob is killed at most `comboWindowSeconds` after the previous non-Glob kill,
   THE wallet SHALL add 1 to the chain; otherwise the chain SHALL restart at 1. Kills on the same
   Tick count one by one in event order.
3. WHEN the chain reaches `comboStart` or more, THE wallet SHALL emit `combo` with the chain
   length and add `comboBonusKb` with reason `combo`.
4. THE Economy_State SHALL keep the chain, the last kill Tick and `bestCombo`, the longest chain
   of the Run, as plain data.
5. WHEN `combo` arrives, THE Lane_View SHALL show "COMBO xN +1 KB" in the CCTV display for 1 s
   and play a blip that rises with N up to 10.

### Requirement 6: Bots move a cursor

**User Story:** As the team, we want the bots to pay for moving the mouse between the fronts, so
that the balance numbers match real players.

#### Acceptance Criteria

1. THE Bot_Policies SHALL keep a Bot_Cursor in Screen pixels in `BotMemory`, starting at the
   centre of the Lane_Dock.
2. THE bot table SHALL give each policy a `cursorPxPerSecond`: casual 1,400, competent 2,200,
   perfect 1,000,000.
3. A bot SHALL act on a point only once the Bot_Cursor has reached it, moving at most
   `cursorPxPerSecond / TICK_RATE` pixels per Tick in a straight line.
4. WHILE the Bot_Cursor is over the Lane_Dock, THE bot SHALL send `lanePointer` at the
   Bot_Cursor's lane position each Tick, so packets are collected only along the cursor's path.
5. THE bots SHALL map Lane_Units to Screen pixels with the Lane_View's own layout maths.
6. Bots SHALL keep their own RNG stream and SHALL NOT read the Run RNG.

### Requirement 7: New Balance_Targets

**User Story:** As the team, we want the report to check the new design targets.

#### Acceptance Criteria

1. THE file `.kiro/steering/game-balance.md` SHALL hold the targets, and `balance_report` SHALL
   check them on the competent policy:

   | Target | Goal |
   |---|---|
   | Winning run length | median win 170–200 s |
   | Saw affordable | median time KB earned ≥ saw price: 80–95 s |
   | Flamethrower affordable | median time KB earned ≥ saw + flamethrower price: 120–140 s |
   | Shop choice | median KB earned by the end of a win < the sum of all weapon and upgrade prices |
   | Critical in Plot turn 2 | share ≥ 0.5 |
   | Boss arrives | share of wins where the boss reached the modem ≥ 0.5 |
   | Winnable | win rate 0.4–0.9 |

2. THE report SHALL read the prices from the economy balance in use, so a price override moves
   the KB thresholds.

### Requirement 8: Tuning pass

**User Story:** As the team, we want the defaults tuned against the targets with evidence.

#### Acceptance Criteria

1. AFTER Requirements 1–7 are built, THE `balance-tuner` agent SHALL tune the values in
   `src/game/balance/` until every target passes or explain which ones cannot pass and why.
2. EACH change SHALL be recorded in a dated file in `docs/balance/` with the old value, the new
   value, the reason and before-and-after `balance_report` tables.
3. WHERE a tuned value differs from `docs/game-design.md`, THE design doc SHALL be updated to the
   tuned value.

### Requirement 9: Determinism, docs and checks

**User Story:** As the team, we want the timeline tests and docs to match the new run.

#### Acceptance Criteria

1. THE timeline tests SHALL pin the new Chapter start seconds, an idle Run that is `lost` before
   120 s, and a Boss_Rise at 65% for a killer bot.
2. WHEN two Runs start from the same seed with the same inputs, THE Runs SHALL produce identical
   states and events.
3. THE file `docs/kiro-log.md` SHALL get a dated note, and `docs/submission-checklist.md` SHALL
   note that the demo video must cut the run to stay under 3 minutes.
4. THE `playtester` agent SHALL run one full playtest and write its report to `docs/playtests/`.

## Decisions

1. **Chapters on the clock, beats on progress.** The clock keeps the story repeatable; the boss
   joins the midpoint beats and the last interrupter in reacting to the bar, so it can't miss.
2. **Clock fallback for the boss.** A run stuck at low download still gets the boss by 200 s.
3. **Bot cursor before tuning.** Without travel, skill doesn't change KB timing at all, so
   tuning against the old bots would only tune the clock.
4. **Starting values.** Every number above is a starting value. Requirement 8 may change them;
   the design doc follows the tuned value.
