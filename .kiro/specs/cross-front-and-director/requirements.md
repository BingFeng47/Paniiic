# Requirements Document

## Introduction

The cross-front-and-director feature turns the two placeholder schedules into the scripted
7-chapter run from `docs/game-design.md` section 3, and adds the cross-front rule that a fake
button click spawns a fast zombie. It is milestone 5 in `docs/roadmap.md`.

The Director is a pure game-core system. It replaces the connection-lane Spawner and the
browser-front Ad_Schedule through the replacement hooks those specs provide. The chapter
timeline is data in `src/game/balance/`, as the `game-balance` steering file requires. Most
chapters start on a clock measured from the moment dialing starts. A few Beats react to the
download, such as the 2-second calm after the bar crosses 50%.

Out of scope: KB and the −5 KB fake-button penalty (`economy-weapons`), visual overlays
(`juice-and-endings`) and win-rate tuning with bots (`zombie-sim-mcp`).

## Glossary

Terms from game-core, connection-lane, lane-melee and browser-front keep their meaning (Run,
Tick, phase, Mob, Spawner, Spawn_Wave, Lane_Systems, Ad, Ad_Kind, Close_Pattern, Ad_Systems,
Ad_Schedule, Lane_Cover, Ad_Cap, `downloadHalfway`, `fakeButtonClicked`). New terms:

- **Director**: the game-core system that decides which Mobs and Ads appear on each Tick.
- **Chapter**: one of the seven chapters of the run: Hook, Plot turn 1, Pinch 1, Midpoint,
  Pinch 2, Plot turn 2 and Resolution.
- **Chapter_Table**: the data table of Chapters in `src/game/balance/`, each with a start second,
  the Mob Spawn_Waves, the ad rows and the Close_Patterns allowed in that Chapter.
- **Ad_Row**: one ad entry of a Chapter: Ad_Kind, interval, allowed Close_Patterns and whether
  Lane_Cover Ads are allowed.
- **Current_Chapter**: the Chapter the Run is in, stored in the Run state.
- **Beat**: a one-off scripted moment in the Chapter_Table with a trigger and an effect.
- **Midpoint_Calm**: the Beat that holds new Mobs and Ads for 2 s after `downloadHalfway`.
- **Midpoint_Cluster**: the Beat that opens the biggest ad cluster so far when the
  Midpoint_Calm ends.
- **Boss_Rise**: the Beat that spawns the boss at 118 s.
- **Last_Interrupter**: the Beat that opens one `runaway` interrupter when download progress
  first reaches 90% during Plot turn 2 or later.
- **Fake_Spawn**: a fast Mob spawned at the Manhole because a fake button was clicked.

## Requirements

### Requirement 1: Chapter timeline as data

**User Story:** As a designer, I want the whole run written as one table, so that I can retime a
chapter without touching logic.

#### Acceptance Criteria

1. THE Chapter_Table SHALL list the seven Chapters in order with the start seconds 0, 20, 45, 70,
   90 and 115 for Hook to Plot turn 2, from `docs/game-design.md` section 3.
2. WHEN the Run Tick reaches the start Tick of the next Chapter from Hook to Plot turn 2, THE
   Director SHALL set the Current_Chapter to it and emit `chapterStarted` with the Chapter's
   number and name.
3. WHILE the Run phase is `won` or `lost`, THE `currentChapter(state)` selector SHALL return
   Resolution. No `chapterStarted` event is emitted for it, because `step()` runs no systems
   after the phase becomes `won` or `lost`; views react to the `won` and `lost` events.
4. THE Director SHALL read Chapters and Beats only from the Chapter_Table in the Run's balance.
5. IF a Chapter_Table has start seconds out of order, an unknown Mob kind, an unknown Ad_Kind, an
   unknown Close_Pattern or a non-finite number, THEN THE balance resolver SHALL throw an error
   that lists every problem found.

### Requirement 2: Mobs by chapter

**User Story:** As a player, I want new zombie types to join chapter by chapter, so that the lane
teaches me one threat at a time.

#### Acceptance Criteria

1. THE Director SHALL replace the connection-lane Spawner through the replacement hook of
   connection-lane Requirement 3.4.
2. WHILE a Chapter is the Current_Chapter, THE Director SHALL spawn Mobs from that Chapter's
   Spawn_Waves only, with `mobSpawned` source `schedule`.
3. THE default Chapter_Table SHALL spawn the first default Mob at 8 s, add fast Mobs in Pinch 1,
   tank Mobs in Midpoint and ranged Mobs in Pinch 2, and raise the spawn rate of every kind in
   Plot turn 2.
4. WHEN the Run Tick reaches 118 s, THE Director SHALL run the Boss_Rise and spawn one boss Mob.
5. WHILE the Run phase is `dialing`, `connected` or `downloading`, THE Director SHALL keep
   spawning Mobs.

### Requirement 3: Ads by chapter

**User Story:** As a player, I want the ads to get trickier chapter by chapter, so that each
close pattern arrives when I can handle it.

#### Acceptance Criteria

1. THE Director SHALL replace the browser-front Ad_Schedule through the replacement hook of
   browser-front Requirement 3.3.
2. WHILE a Chapter is the Current_Chapter, THE Director SHALL open Ads from that Chapter's
   Ad_Rows only, using only the Close_Patterns those rows allow.
3. THE default Chapter_Table SHALL allow `plain` clutter in Plot turn 1; fake buttons,
   interrupters and the `decoy`, `hidden` and `swapped` Close_Patterns from Pinch 1; `countdown`
   and `confirm` from Midpoint; `runaway` interrupters and Lane_Cover clutter from Pinch 2; and an
   ad storm with the highest ad rate in Plot turn 2.
4. THE Director SHALL open the first clutter Ad of Plot turn 1 5 s after `connected`.
5. THE Director SHALL respect the Ad_Cap of browser-front Requirement 3.4.

### Requirement 4: Midpoint beats

**User Story:** As a player, I want a short breather when the download passes halfway, so that I
can shop before the biggest ad cluster hits.

#### Acceptance Criteria

1. WHEN the Director first sees `halfwayReached` true in the Run state, THE Director SHALL
   start the Midpoint_Calm on that Tick and emit `beat` with the name `midpointCalm`. This is the
   Tick after `downloadHalfway`, because `step()` emits that event after the systems run.
2. WHILE the Midpoint_Calm lasts, THE Director SHALL open no Ads and spawn no scheduled Mobs.
3. WHEN the Midpoint_Calm has lasted 2 s, THE Director SHALL run the Midpoint_Cluster: open the
   Midpoint_Cluster count of clutter Ads at once, subject to the Ad_Cap, and emit `beat` with the
   name `midpointCluster`.
4. THE default Chapter_Table SHALL set the Midpoint_Cluster count to 4, the biggest single ad
   group before Plot turn 2.

### Requirement 5: Plot turn 2 beats

**User Story:** As a player, I want the last stretch to throw its worst at me, so that a win
feels earned.

#### Acceptance Criteria

1. WHEN download progress first reaches 90% while the Current_Chapter is Plot turn 2, THE
   Director SHALL run the Last_Interrupter: open one interrupter with the `runaway` Close_Pattern
   and emit `beat` with the name `lastInterrupter`.
2. THE Director SHALL run the Last_Interrupter at most once per Run.
3. IF the Ad_Cap is reached when the Last_Interrupter runs, THEN THE Director SHALL open the
   Last_Interrupter on the first later Tick with room, while the Run phase is `downloading`.

### Requirement 6: Fake button spawns a zombie

**User Story:** As a player, I want a browser mistake to show up on the lane, so that the two
fronts feel connected.

#### Acceptance Criteria

1. WHEN a `fakeButtonClicked` event arrives, THE Director SHALL add one fast Mob at the Manhole on
   the same Tick and emit `mobSpawned` with source `fakeButton`.
2. THE connection-lane `SpawnSource` type SHALL include `fakeButton`.
3. THE Director SHALL add Fake_Spawns during the Midpoint_Calm too.

### Requirement 7: Determinism

**User Story:** As a developer, I want the director to stay deterministic, so that the demo video
and the balance tools can repeat a run exactly.

#### Acceptance Criteria

1. THE Director SHALL decide every spawn and Beat from the Run state, the Tick, the Tick's events
   and the Run's seeded RNG only.
2. WHEN two Runs start from the same seed with the same balance and receive the same input
   commands on the same Ticks, THE Director SHALL produce identical states and identical events
   on every Tick.
3. THE Current_Chapter and Beat progress SHALL be plain data that survives a JSON round trip
   unchanged.

### Requirement 8: Timeline checks

**User Story:** As the team, we want tests that pin the main beats to the clock, so that tuning
never silently breaks the story.

#### Acceptance Criteria

1. WHEN `runHeadless` plays a Run with a script that sends no commands, THE Run SHALL start the
   first default Mob at Tick 480 and SHALL reach the `lost` phase before 120 s.
2. WHEN `runHeadless` plays a Run with a script that starts the download at 21 s and kills every
   Mob within 0.5 s of its spawn, THE Run SHALL emit `chapterStarted` for each of Hook to Plot
   turn 2 at its start second.
3. THE tests for Requirements 4 and 5 SHALL use a balance override with a short download, so that
   each Beat is reached within a few seconds of simulated time.

### Requirement 9: Docs

**User Story:** As a team member, I want the design doc and the data to agree, so that the
chapter table in the doc stays the truth.

#### Acceptance Criteria

1. THE file `docs/game-design.md` section 3 SHALL match the default Chapter_Table start times and
   the unlock of each Mob kind, Ad_Kind and Close_Pattern.
2. THE file `docs/kiro-log.md` SHALL contain a dated note under "Notes" describing this spec.

## Decisions

1. **Clock first, download second.** Chapters start on the clock so the demo video is repeatable
   (design section 9, "Fixed 20 s dial-up"). Only the Midpoint Beats and the Last_Interrupter
   react to the download, because the design ties them to the bar.
2. **The idle-player check (Requirement 8.1)** asks that a player who does nothing loses before
   the boss. With lane-melee numbers this happens well before 2:00.
3. **Spawn counts and rates** in the default Chapter_Table are starting values. The balance tool
   in `zombie-sim-mcp` tunes them against the targets in the `game-balance` steering file.
