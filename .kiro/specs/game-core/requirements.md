# Requirements: game-core

## Introduction

The game-core feature is the pure, deterministic simulation that every other feature builds on.
It owns the run's phases (dialing, connected, downloading, won, lost), modem integrity, download
progress, the fixed-timestep loop, seeded randomness, the event stream and a headless runner.

Mobs, weapons, ads, the shop and all rendering are out of scope here. They plug into this core in
later specs (`connection-lane`, `browser-front`, `economy-weapons`). See `docs/game-design.md`.

## Glossary

- **Simulation:** the pure game-state code in `src/game/`. No DOM, timers or wall clock.
- **Run:** one play session, from the moment dialing starts until won or lost.
- **Tick:** one fixed simulation step of 1/60 second.
- **Input command:** a plain-data instruction from the player, e.g. `{ type: 'startDownload' }`.
- **Event:** a plain-data record of something that happened, e.g. `{ type: 'connected', tick }`.
- **Integrity:** the modem's health. The run is lost when it reaches 0.
- **Download progress:** 0 to 100 percent. The run is won when it reaches 100.
- **Pause source:** anything that holds the download still, e.g. an interrupter ad.
- **Balance config:** the tuning values in `src/game/balance/`.
- **Headless runner:** code that plays a whole run from a seed and a scripted list of input
  commands, without a browser.

## Requirements

### Requirement 1: Deterministic simulation

**User story:** As a developer, I want the simulation to be deterministic, so that tests,
replays and balance tools give repeatable results.

1. THE Simulation SHALL advance only through a step function that takes the current state and the
   input commands for that tick, and returns the next state and the events of that tick.
2. WHEN two runs start from the same seed and receive the same input commands on the same ticks,
   THE Simulation SHALL produce identical states and identical events on every tick.
3. THE Simulation SHALL take all randomness from a seeded random number generator stored in the
   state.
4. THE Simulation SHALL NOT read the DOM, timers, the wall clock or `Math.random`.
5. THE step function SHALL NOT mutate the state passed to it.

### Requirement 2: Fixed-timestep loop

**User story:** As a player, I want the game to run at the same speed on fast and slow machines,
so that the difficulty is fair.

1. WHEN the browser renders a frame, THE game loop SHALL run as many ticks as the real time
   elapsed since the previous frame requires, carrying any remainder to the next frame.
2. IF more than 250 ms of real time elapsed since the previous frame, THEN THE game loop SHALL
   treat the elapsed time as 250 ms.
3. WHEN the page becomes hidden, THE game loop SHALL stop running ticks.
4. WHEN the page becomes visible again, THE game loop SHALL resume without running ticks for the
   time it was hidden.

### Requirement 3: Run phases

**User story:** As a player, I want to fight zombies while the modem is still dialing and only
start downloading once connected, so that the run builds up the way the story describes.

1. WHEN a run starts, THE Simulation SHALL set the phase to `dialing`, integrity to the maximum
   and download progress to 0.
2. WHILE the phase is `dialing`, THE Simulation SHALL keep advancing lane systems and SHALL
   ignore `startDownload` commands.
3. WHEN the dial duration from the balance config has elapsed in the `dialing` phase, THE
   Simulation SHALL set the phase to `connected` and emit a `connected` event.
4. WHEN a `startDownload` command arrives in the `connected` phase, THE Simulation SHALL set the
   phase to `downloading` and emit a `downloadStarted` event.
5. WHILE the phase is `downloading` and no pause source is active, THE Simulation SHALL increase
   download progress by the download rate from the balance config every tick.
6. WHEN download progress reaches 100, THE Simulation SHALL set the phase to `won` and emit a
   `won` event.
7. WHEN integrity reaches 0 in the `dialing`, `connected` or `downloading` phase, THE Simulation
   SHALL set the phase to `lost` and emit a `lost` event.
8. IF the win and lose conditions are both met on the same tick, THEN THE Simulation SHALL set
   the phase to `won`.
9. WHILE the phase is `won` or `lost`, THE Simulation SHALL ignore input commands and SHALL NOT
   change integrity or download progress.

### Requirement 4: Modem integrity

**User story:** As a player, I want clear feedback as the modem takes damage, so that I know when
to focus on the lane.

1. WHEN the modem takes damage, THE Simulation SHALL reduce integrity by the damage amount.
2. THE Simulation SHALL keep integrity between 0 and the maximum from the balance config.
3. WHEN integrity falls to or below the critical threshold from the balance config, THE
   Simulation SHALL emit one `integrityCritical` event for that crossing.
4. WHEN the modem takes damage, THE Simulation SHALL emit a `modemHit` event with the amount and
   the remaining integrity.

### Requirement 5: Download progress

**User story:** As a player, I want mistakes and interruptions to visibly affect the download, so
that the browser front matters.

1. THE Simulation SHALL keep download progress between 0 and 100.
2. WHEN a download penalty is applied, THE Simulation SHALL reduce download progress by the
   penalty amount and emit a `downloadPenalty` event.
3. WHILE one or more pause sources are active, THE Simulation SHALL NOT increase download
   progress.
4. WHEN the last active pause source is removed, THE Simulation SHALL resume increasing download
   progress on the next tick.
5. WHEN download progress first reaches or passes 50, THE Simulation SHALL emit one
   `downloadHalfway` event.

### Requirement 6: Events

**User story:** As a developer, I want the simulation to report what happened as data, so that
audio, effects and UI can react without touching game state.

1. THE Simulation SHALL return the events of each tick in the order they happened, each tagged
   with its tick number.
2. THE Simulation SHALL represent every event and every state as plain data that survives a JSON
   round trip unchanged.

### Requirement 7: Headless runner

**User story:** As a developer, I want to play whole runs without a browser, so that tests and
the future balance MCP server can measure difficulty.

1. WHEN given a seed and a scripted list of input commands, THE headless runner SHALL play the run
   in Node and return the final state, the full event log and a once-per-second summary of phase,
   integrity and download progress.
2. THE headless runner SHALL stop when the phase becomes `won` or `lost`, or when a maximum
   duration is reached (default 300 seconds).
3. WHEN given balance overrides, THE headless runner SHALL use them in place of the matching
   balance config values for that run only.

### Requirement 8: Balance config

**User story:** As a designer, I want all core tuning values in one place, so that I can tune the
run without touching logic.

1. THE Simulation SHALL read the dial duration, download rate, maximum integrity and critical
   threshold from the balance config.
2. THE balance config SHALL reject values outside their valid range (e.g. negative durations or a
   critical threshold above the maximum integrity) when a run is created.

## Open questions for review

1. **Same-tick tie (3.8):** currently the win takes priority. Is that the feel we want?
2. **Dial duration:** a fixed 20 seconds, or random between 18 and 22 seconds from the seed?
3. **Integrity:** is a maximum of 100 with critical at 20 right?
