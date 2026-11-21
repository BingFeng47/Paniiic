# Implementation plan: game-core

- [ ] 1. Types, balance config and RNG
  - [ ] 1.1 Create `src/game/types.ts` with `TICK_RATE`, `Phase`, `InputCommand`, `GameEventBody`,
    `GameEvent` and `GameState` as in the design
    - _Requirements: 1.1, 6.2_
  - [ ] 1.2 Create `src/game/balance/core.ts` with `CoreBalance`, `DEFAULT_CORE_BALANCE`,
    `BalanceError` and `resolveCoreBalance` (merge overrides, validate, list every problem)
    - Example tests in `tests/game/balance/core.test.ts` for each validation rule
    - _Requirements: 8.1, 8.2_
  - [ ] 1.3 Create `src/game/rng.ts` (Mulberry32, state is one uint32)
    - Tests: values in [0, 1); same state gives same value; state stays an integer
    - _Requirements: 1.3_

- [ ] 2. Run creation and tick context
  - [ ] 2.1 Create `src/game/state.ts` with `createRun` (seed normalized with `>>> 0`, phase
    `dialing`, full integrity, download 0)
    - _Requirements: 3.1_
  - [ ] 2.2 Create `src/game/context.ts` with `TickContext`, `System` and a context factory over a
    draft state: `emit`, `random`, `damageModem`, `penalizeDownload`, `addPauseSource`,
    `removePauseSource`. Throw on negative or non-finite amounts.
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 5.1, 5.2, 5.3, 5.4_
  - [ ] 2.3 Create `tests/helpers/game.ts` with `stepN`, `scheduledDamage` and
    `scheduledPenalty`
    - _Requirements: testing support_

- [ ] 3. The step function
  - [ ] 3.1 Create `src/game/step.ts` following the seven-stage tick order in the design
    - _Requirements: 1.1, 1.5, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 5.3, 5.4, 5.5, 6.1_
  - [ ] 3.2 Example tests in `tests/game/step.test.ts`: connected at exactly tick 1,200;
    `startDownload` ignored while dialing; full download wins; integrity 0 loses during dialing;
    same-tick tie wins; halfway fires once; resume on the tick after the last pause source is
    removed
    - _Requirements: 3.2, 3.3, 3.4, 3.6, 3.7, 3.8, 5.4, 5.5_

- [ ] 4. Property-based tests for the simulation (`tests/game/properties.test.ts`)
  - [ ] 4.1 P1 determinism and P7 JSON round trip
    - _Requirements: 1.2, 6.2_
  - [ ] 4.2 P2 no mutation (deep-freeze the input state)
    - _Requirements: 1.5_
  - [ ] 4.3 P3 integrity bounds, P4 download bounds, P9 critical crossings
    - _Requirements: 4.2, 4.3, 5.1_
  - [ ] 4.4 P5 no progress while paused, P10 pause-order independence
    - _Requirements: 1.2, 5.3_
  - [ ] 4.5 P6 terminal phases are absorbing
    - _Requirements: 3.9_

- [ ] 5. Headless runner
  - [ ] 5.1 Create `src/game/headless.ts` with `runHeadless` (scripted inputs by tick, per-second
    samples plus the final tick, stop on won/lost/timeout, default 300 s)
    - _Requirements: 7.1, 7.2, 7.3_
  - [ ] 5.2 Tests in `tests/game/headless.test.ts`: a scripted perfect run wins at the expected
    tick; a run with no `startDownload` times out; overrides change only that run
    - _Requirements: 7.1, 7.2, 7.3_

- [ ] 6. Browser fixed-timestep loop
  - [ ] 6.1 Create `src/core/fixedLoop.ts` with `accumulate` and `startFixedLoop` (injectable
    clock, frames and visibility)
    - _Requirements: 2.1, 2.2, 2.3, 2.4_
  - [ ] 6.2 Tests in `tests/core/fixedLoop.test.ts`: P8 as a property test; the clamp at
    250 ms; no ticks while hidden; no catch-up after becoming visible
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

- [ ] 7. Checkpoint: `npm run typecheck`, `npm test` and `npm run build` all pass
