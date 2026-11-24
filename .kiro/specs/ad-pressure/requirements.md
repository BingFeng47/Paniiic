# Requirements Document

## Introduction

Playtest feedback (23 Nov): clutter ads cost the player nothing, so players leave them open. The
sim also found that the shared Ad_Cap lets a pile of unclosed clutter block interrupters and fake
buttons, so ignoring ads protects the download. This spec gives clutter ads teeth and fixes the
cap. It is milestone 10 in `docs/roadmap.md` and follows `docs/game-design.md` sections 4, 7
and 8 as updated on 23 Nov.

It changes shipped specs on purpose: `game-core` (download rate), `browser-front` (Ad_Cap,
placement), `cross-front-and-director` (hatching, a lane-cover row in Pinch 1) and
`player-guide` (hint copy and one new hint). Where a shipped test pins the old rule, the test is
updated to the new rule in the same task and the change is named in the task notes. Tests are
never weakened.

Out of scope: run length, spawn rates, prices and drops (`pacing-and-economy`); score and
leaderboard (`leaderboard`).

## Glossary

Terms from earlier specs keep their meaning (Run, Tick, Ad, Clutter, Interrupter, Fake_Button,
Ad_Cap, Lane_Cover, Chapter_Table, Director, Mob, Manhole, Session_Registry). New terms:

- **Bandwidth_Factor**: the share of full download speed left after open clutter ads take
  theirs, in [Bandwidth_Floor, 1]. Stored as `GameState.bandwidth`; absent means 1.
- **Bandwidth_Floor**: the lowest Bandwidth_Factor, 0.4 by default.
- **Line_Quality**: the share of full download speed left after modem damage,
  `lineQualityFloor + (1 − lineQualityFloor) × integrity / maxIntegrity`.
- **Download_Rate**: `downloadPercentPerSecond × Bandwidth_Factor × Line_Quality`.
- **Hatch**: a clutter Ad that has been open for a whole multiple of Hatch_Seconds lets one Mob
  out of the Manhole.
- **Hatch_Seconds**: 10 s by default. **Hatch_Warning**: the last 3 s before each Hatch.
- **Hatch_Kind**: the Mob kind a Hatch spawns, set per Chapter in the Chapter_Table.
- **Lane_Area**: the Screen rectangle over the Lane_Dock where Lane_Cover clutter is placed.
- **Game_Systems**: the one ordered list of game-core systems that both the Session_Registry and
  the zombie-sim bot runner use.

## Requirements

### Requirement 1: One shared system list

**User Story:** As a developer, I want the browser and the balance tool to run the same systems,
so that a rule added for players is also measured by the bots.

#### Acceptance Criteria

1. THE module `src/game/systems.ts` SHALL export `createGameSystems(overrides)` that returns the
   Game_Systems in the order the Session_Registry uses today, followed by the systems this spec
   adds.
2. THE Session_Registry and `tools/mcp-sim/src/runBot.ts` SHALL both build their systems with
   `createGameSystems`.
3. IF any balance override is invalid, THEN `createGameSystems` SHALL throw the same balance
   error the system's own resolver throws.

### Requirement 2: Open clutter eats bandwidth

**User Story:** As a player, I want open pop-ups to slow my download, so that closing them is
worth the trip up to the browser.

#### Acceptance Criteria

1. THE ad balance SHALL define `bandwidthPerClutter` (default 0.15) and `bandwidthFloor`
   (default 0.4), and the resolver SHALL reject values outside [0, 1].
2. ON every Tick after the ad and economy systems, THE bandwidth system SHALL set
   `GameState.bandwidth` to `max(bandwidthFloor, 1 − bandwidthPerClutter × n)`, where `n` is the
   number of open clutter Ads after this Tick's closes, blocks and openings.
3. Fake_Buttons and Interrupters SHALL NOT count toward `n`. Interrupters already pause the
   download.
4. WHILE the Run phase is `downloading` and no pause source is active, THE `step()` function
   SHALL advance the download by `Download_Rate / TICK_RATE` per Tick.
5. WHEN `GameState.bandwidth` is absent, THE `step()` function SHALL treat it as 1, so core-only
   runs keep their timing.

### Requirement 3: Line quality

**User Story:** As a player, I want a damaged modem to download slower, so that lane mistakes
also cost me time.

#### Acceptance Criteria

1. THE core balance SHALL define `lineQualityFloor` (default 0.6), and the resolver SHALL reject
   values outside [0, 1].
2. THE `step()` function SHALL use Line_Quality from the integrity at the start of the download
   stage of the Tick.
3. WHEN integrity equals `maxIntegrity`, Line_Quality SHALL be exactly 1, so a healthy run keeps
   the timing of earlier specs.
4. THE module `src/game/downloadRate.ts` SHALL export a pure `downloadRate(state)` that `step()`
   and the Download_Panel both use, so the shown rate matches the simulated one.

### Requirement 4: Clutter ads hatch zombies

**User Story:** As a player, I want an ignored pop-up to let a zombie onto the line, so that
every browser mistake shows up on the lane.

#### Acceptance Criteria

1. THE ad balance SHALL define `hatchSeconds` (default 10) and `hatchWarningSeconds`
   (default 3), and the resolver SHALL require `hatchSeconds` to round to at least 1 Tick and
   `hatchWarningSeconds` to lie in [0, hatchSeconds].
2. THE Chapter_Table SHALL give each Chapter a `hatchKind` of `default`, `fast`, `tank` or
   `null`. The default table SHALL use `null` for Hook, `default` for Plot turn 1 and Pinch 1,
   and `fast` from Midpoint on.
3. WHEN a clutter Ad's age `tick − openTick` is a positive whole multiple of the
   `hatchSeconds` Ticks and the Current_Chapter's `hatchKind` is not `null`, THE Director SHALL
   add one Mob of that kind at the Manhole with `mobSpawned` source `adHatch`, then emit
   `adHatched` with the Ad id and the Mob id.
4. THE Director SHALL hatch during the Midpoint_Calm too, because a Hatch is caused by the
   player, like a Fake_Spawn.
5. Hatching SHALL NOT close, move or reset the Ad. It hatches again every `hatchSeconds` until it
   is closed or blocked.
6. THE connection-lane `SpawnSource` type SHALL include `adHatch`.
7. THE module `src/game/ads/hatch.ts` SHALL export a pure `hatchView(ad, tick, balance)` that
   returns the seconds until the next Hatch and whether the Hatch_Warning is on. Views use it;
   they never compute hatch timing themselves.

### Requirement 5: The Ad_Cap counts clutter only

**User Story:** As a player, I want interrupters and fake buttons to keep coming, so that
ignoring clutter is never a safe strategy.

#### Acceptance Criteria

1. WHEN `openAd` is asked for a clutter Ad and `cap` clutter Ads are already open, THE function
   SHALL emit `adSkipped` and return the state unchanged.
2. WHEN `openAd` is asked for an Interrupter or a Fake_Button, THE function SHALL open it
   whatever the number of open Ads.
3. THE Last_Interrupter SHALL therefore open on the Tick it becomes due. The `pending` state
   stays for compatibility, and its existing test is updated to the new rule.

### Requirement 6: Clutter over the lane from Pinch 1

**User Story:** As a player, I want some pop-ups to land on the phone line, so that ignoring ads
costs me on the lane where it hurts.

#### Acceptance Criteria

1. THE ad balance SHALL define `laneArea` (default `{ x: 0, y: 480, w: 1024, h: 260 }`), and the
   resolver SHALL require it to lie inside `field` and to fit a clutter Ad.
2. WHEN a Lane_Cover clutter Ad opens, THE placement SHALL put it fully inside `laneArea`.
3. THE default Chapter_Table SHALL add a Lane_Cover clutter row to Pinch 1 (every 16 s, starting
   4 s into the Chapter) and keep the Lane_Cover rows of Pinch 2 and Plot turn 2.
4. WHILE the pointer is over a Lane_Cover Ad, THE Lane_View SHALL send no hammer swing and SHALL
   send `lanePointer` with `down: false` once, so the saw and flamethrower stop and no packet is
   collected through the Ad.

### Requirement 7: Showing the pressure

**User Story:** As a player, I want to see why my download is slow and which ad is about to
hatch, so that the rules feel fair.

#### Acceptance Criteria

1. THE Download_Panel SHALL show the transfer rate from `downloadRate(state)` and, when it is
   below full speed, one cause line: the number of pop-ups using bandwidth, line noise from the
   modem, or both.
2. WHILE an Ad's Hatch_Warning is on, THE Ad_Layer SHALL mark the Ad with `is-hatching`: a
   shake, a crack overlay and a hand reaching out of the window, with no flashing faster than
   3 times per second (design section 10).
3. WHEN `adHatched` arrives, THE browser sounds SHALL play a synthesized creak-and-groan, and THE
   Lane_View SHALL show the hatched Mob climbing out of the Manhole like any other spawn.
4. ALL new copy SHALL follow the `retro-copy` steering file and go in through `textContent`.

### Requirement 8: Teaching the rule

**User Story:** As a first-time player, I want to be told what open pop-ups do, so that I don't
learn it only by losing.

#### Acceptance Criteria

1. THE `clutter` Hint SHALL say that open pop-ups slow the download and let zombies out.
2. THE Hint_Table SHALL add a `hatch` Hint, due on the first `adHatched` event, anchored to the
   lane, shown once per Run like the other Hints.

### Requirement 9: Determinism and plain data

**User Story:** As a developer, I want the new rules to stay deterministic, so that replays and
the balance tool still work.

#### Acceptance Criteria

1. THE bandwidth and hatch rules SHALL read only the Run state, the Tick, the Tick's events and
   the balance, and SHALL draw no random numbers.
2. `GameState.bandwidth` SHALL survive a JSON round trip.
3. WHEN two Runs start from the same seed and receive the same inputs, THE Runs SHALL produce
   identical states and events on every Tick.

### Requirement 10: Docs and checks

**User Story:** As the team, we want the design doc, the data and the tools to agree.

#### Acceptance Criteria

1. THE file `docs/game-design.md` sections 4, 7 and 8 SHALL match the default values of this
   spec.
2. THE `add-ad` skill SHALL mention `hatchSeconds`, the clutter-only cap and `laneArea`.
3. THE file `docs/kiro-log.md` SHALL get a dated note describing this spec.
4. THE `playtester` agent SHALL run one smoke playtest and write its report to
   `docs/playtests/`.

## Decisions

1. **15 points per ad, floor 40%.** Three open ads already cost 45% of the speed, which is easy to
   see on the bar. The floor stops the bar from looking frozen, which would read as a bug.
2. **Hatch on the Ad's own clock.** Using `tick − openTick` needs no new state and makes the
   warning exact.
3. **Hatch kind per Chapter.** Fast zombies from the midpoint keep the punishment in step with
   the rest of the lane. Tank hatches are allowed by the data but unused by default.
4. **Line quality is mild.** 68% at critical keeps a hurt run winnable.
