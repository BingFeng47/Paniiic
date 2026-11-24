# Implementation Plan: connection-lane

## Overview

Build the lane bottom-up in TypeScript: lane balance and types, the small game-core extensions
(`hammer` command, lane events, `ctx.inputs`), then the pure lane systems and their tests, then
the shell hook (`toScreenPoint`), the sprite pipeline, the renderer pieces and the Lane_View, and
finally the Session_Registry wiring and the Kiro artifacts. Every task names its files. Read
`design.md` for interfaces, numbers and copy; read `.kiro/steering/sprites.md` before touching
`src/render/`, `.kiro/steering/game-balance.md` before touching `src/game/balance/`, and
`.kiro/steering/retro-copy.md` before writing in-game text. Never write into `assets/sprites/`.

## Tasks

- [x] 1. Lane balance, lane types and game-core extensions
  - [x] 1.1 Create `src/game/balance/lane.ts` and `src/game/laneTypes.ts`
    - `laneTypes.ts`: `MobKind`, `EnemyKind`, `MOB_KINDS`, `ENEMY_KINDS`, the `Enemy` union,
      `LaneState`, `HammerCommand`, `SpawnSource`, `BurstCause`, `LaneEventBody` exactly as in the
      design (type-only import of `LaneBalance`)
    - `balance/lane.ts`: `EnemyStats`, `SpawnWave`, `LaneBalance`, `LaneBalanceOverrides`,
      deep-frozen `DEFAULT_LANE_BALANCE` with the design's stats table, other defaults and
      placeholder Spawn_Schedule, `secondsToTicks`, `LaneBalanceError` and `resolveLaneBalance`
      (nested merge for `enemies`, `hammer`, `ranged`, `boss`; whole replacement for `spawns` and
      `boss.thresholds`; every validation rule from the design, all problems collected)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 3.3_

  - [x]* 1.2 Write balance tests in `tests/game/balance/lane.test.ts`
    - Defaults match `docs/game-design.md` section 5 and the speed ordering; `secondsToTicks(0.3)`
      is 18 and `secondsToTicks(8)` is 480; one example per validation rule; two invalid fields
      are both listed; an unknown spawn kind is reported; `{ enemies: { tank: { hp: 6 } } }`
      changes only that value; resolving overrides does not change `DEFAULT_LANE_BALANCE`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [x] 1.3 Extend `src/game/types.ts`, `src/game/context.ts` and `src/game/step.ts`
    - `types.ts`: `InputCommand` adds `HammerCommand`; `GameEventBody` adds `LaneEventBody`;
      `GameState` gains optional `readonly lane?: LaneState` (type-only imports)
    - `context.ts`: `TickContext.inputs: readonly InputCommand[]`;
      `createTickContext(draft, events, inputs = [])`
    - `step.ts`: pass `inputs` to `createTickContext`; add `case 'hammer': break;` with a comment
      that lane systems read it through `ctx.inputs`; no other behaviour change
    - Do not change `createRun`; every existing test in `tests/game/` must pass unchanged
    - _Requirements: 1.2, 7.1, 9.1, 9.2, 9.3, 9.4_

  - [x]* 1.4 Write game-core extension tests in `tests/game/step.lane.test.ts`
    - **Property 11: step() itself ignores hammer commands**
    - Examples: `createTickContext(draft, events).inputs` is `[]`; a probe system sees the tick's
      commands in arrival order; `createRun({ seed: 1 })` has no `lane` key
    - **Validates: Requirements 1.2, 9.1, 9.2, 9.4**

- [x] 2. Pure lane simulation
  - [x] 2.1 Create `src/game/laneState.ts`
    - `MutableLaneState` and `MutableEnemy`, `initialLane(balance)` (no Enemies, `nextId` 1,
      `hammerReadyTick` 0), `laneOf(state)` returning `null` when absent, `laneDraft(draft)`
      throwing when `draft.lane` is absent
    - _Requirements: 1.1, 1.3_

  - [x] 2.2 Create `src/game/mobs.ts`
    - `enemyStats`, `addMob` (next id, full HP, spawn tick, x capped to (0, laneLength], emits
      `mobSpawned`), `damageEnemy` (HP floor at 0, `lastHitTick`, `mobHit` with the HP actually
      removed, `mobKilled` with drop on 0 HP, boss summons per the design's steps and event order,
      no summon on a killing hit, no-op for unknown ids, throws on negative or non-finite amounts)
    - `mobSystem`: per Enemy in ascending id order move, ranged arrival, spit (Globs appended after
      the loop), bite (`mobBit`, `ctx.damageModem`, `popupBurst` for tank and boss, remove)
    - Read every number from `lane.balance`; use `secondsToTicks` for every duration
    - _Requirements: 1.4, 3.5, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 5.1, 5.2, 5.3, 5.4, 5.5, 6.1, 6.2, 6.3, 6.4, 8.1, 8.2, 8.3, 8.4_

  - [x] 2.3 Create `src/game/hammer.ts`
    - `hitBox` (padded, feet at (x, 0), edges inclusive), `compareHitPriority` (lower x, then lower
      id), `hitTest`, and `hammerSystem` reading `ctx.inputs`: skip non-`hammer` commands and
      non-finite points, skip while `tick < hammerReadyTick`, else set
      `hammerReadyTick = tick + secondsToTicks(cooldownSeconds)`, emit `hammerSwing` and call
      `damageEnemy` on the target
    - _Requirements: 7.2, 7.3, 7.4, 7.5, 7.6_

  - [x] 2.4 Create `src/game/spawner.ts`
    - `scheduledSpawnsAt(tick, spawns)` per the design's rule, and `scheduleSpawner` that adds each
      kind at `x = laneLength` with source `schedule` in Spawn_Schedule order
    - _Requirements: 3.2, 3.6, 3.7_

  - [x] 2.5 Create `src/game/lane.ts`
    - `LaneOptions` and `createLaneSystems(options)`: resolve the balance once (throws
      `LaneBalanceError`), return `[ensureLane, hammerSystem, mobSystem, spawner ?? scheduleSpawner]`;
      `ensureLane` sets `draft.lane = initialLane(balance)` only when absent; no other closure state
    - _Requirements: 1.1, 1.4, 1.5, 1.7, 2.6, 3.4_

  - [x]* 2.6 Create lane test helpers in `tests/helpers/lane.ts`
    - `laneWith(enemies, overrides?)`, `fastSchedule()`, `arbLaneRun()` and `runLane(spec, systems?)`
      as described in the design's Testing Strategy (aimed actions turn into the point at the
      chosen Enemy's Hit_Box centre on the state at that moment; some raw points are non-finite)
    - Add a short `tests/helpers/lane.test.ts` checking `runLane` sends aimed clicks to the right
      point
    - _Requirements: 1.6, 7.2_

  - [x]* 2.7 Write mob tests in `tests/game/mobs.test.ts`
    - **Property 10: Boss summons follow the thresholds**
    - Examples from the design: default walk and bite after 1,200 ticks; tank and boss
      `popupBurst` after `modemHit`, none for default; same-tick bites in id order; ranged arrival
      after 600 ticks and spits at +60, +240, +420; Glob killed by one hit with drop 1; Glob bites
      for 5; Globs survive their ranged Mob; a 30-damage hit kills the boss with no summon; summon
      positions boss x + k × 36 capped at 800
    - **Validates: Requirements 4.4, 4.6, 5.1, 5.2, 5.3, 5.4, 6.1, 6.2, 6.3, 6.4**

  - [x]* 2.8 Write hammer tests in `tests/game/hammer.test.ts`
    - **Property 8: The hammer hits the first Enemy in Hit_Priority under the point**
    - Examples: a click deals 1 damage; a click 17 ticks later is ignored and one 18 ticks later is
      accepted; a miss starts the cooldown; `NaN` neither swings nor starts the cooldown; padded
      edges hit; overlapping Enemies pick lower x then lower id
    - **Validates: Requirements 7.2, 7.3, 7.4, 7.5**

  - [x]* 2.9 Write spawner and wiring tests in `tests/game/spawner.test.ts` and `tests/game/lane.test.ts`
    - Spawner: default schedule first spawns at ticks 480 (default), 2,700 (fast), 4,200 (tank),
      5,400 (ranged) and exactly one boss at 7,080; a wave starting at second 0 first spawns on
      its interval tick; same-tick waves in schedule order
    - Wiring: first step adds `initialLane(balance)`; a state built with balance A and continued
      with systems of balance B behaves per A; a custom spawner replaces the schedule while the
      hammer still works; Mobs move in `dialing`, `connected` and `downloading`; overrides do not
      leak between system sets; `runHeadless` with lane systems and no input ends `lost`, and a
      hammer script records `hammerSwing` events
    - **Validates: Requirements 1.1, 1.4, 1.7, 2.6, 3.3, 3.4, 3.7, 9.7**

  - [x]* 2.10 Write lane run properties in `tests/game/laneProperties.test.ts`
    - **Property 1: Lane runs are deterministic and lane systems hold no hidden state**
    - **Property 2: Lane states and events survive a JSON round trip**
    - **Property 3: Enemies only move left, at their speed, and stay on the lane**
    - **Property 4: Every Enemy enters once and leaves once**
    - **Property 5: Modem damage equals the sum of bites**
    - **Property 6: HP stays in range and hits account for every point removed**
    - **Property 7: Scheduled spawns follow the schedule and ignore the player**
    - **Property 9: The hammer obeys its cooldown**
    - One fast-check test per property, `numRuns ≥ 100`, runs ≤ 1,200 ticks
    - **Validates: Requirements 1.3, 1.5, 1.6, 3.2, 3.5, 3.6, 3.7, 4.1, 4.2, 4.3, 4.5, 5.1, 5.5, 7.3, 7.4, 7.5, 7.6, 8.1, 8.2, 8.3**

- [x] 3. Checkpoint: simulation complete
  - Run `npm run typecheck` and `npm test`. Ensure all tests pass, including every existing
    game-core test unchanged; ask the user if questions arise.

- [x] 4. Shell hook for screen coordinates
  - [x] 4.1 Add `toScreenPoint` to `SessionContext`
    - `src/dialup/session.ts`: add the field to `SessionContext` (so `start(host)` requires it) and
      pass it through to views
    - `src/scenes/desktop/desktopScene.ts`: pass `(x, y) => monitor.toScreenPoint(x, y)` in
      `s.start(...)`
    - Update the literal `SessionContext` and host fixtures in `tests/dialup/dialer.test.ts` with an
      identity `toScreenPoint`; change no assertions
    - _Requirements: 9.6_

  - [x]* 4.2 Extend `tests/scenes/desktop/desktopScene.test.ts`
    - A registry test view receives a `ctx.toScreenPoint` that returns what the fake monitor's
      `toScreenPoint` returns
    - _Requirements: 9.6_

- [x] 5. Sprite pipeline
  - [x] 5.1 Create `src/render/sprites/entities.ts` and `src/render/sprites/frames.ts`
    - `AnimationName`, `SpriteEntity`, `ENTITY_LOOKS` (colours, boxes and animation lists from the
      design table), `ANIMATION_FPS`, `LOOPING`, `HIT_FLASH_TICKS`, `ATTACK_TICKS`, `SWING_TICKS`
    - `frameIndex(animation, age, count)` and `enemyAnimation(enemy, tick)` per the design
    - _Requirements: 13.8, 13.9_

  - [x]* 5.2 Write frame tests in `tests/render/sprites/frames.test.ts`
    - **Property 14: Frame selection stays in range and loops or holds**
    - Examples: hit 5 ticks after a hit but not 6; ranged `attack` within 12 ticks of a spit,
      `idle` after, `walk` before arrival
    - **Validates: Requirements 13.8, 13.9**

  - [x] 5.3 Create `src/render/sprites/manifest.ts` and `src/render/sprites/spriteModules.ts`
    - `SPRITE_PATH`, `buildManifest(modules)` returning `{ manifest, problems }` with the
      grouping, ordering and rejection rules from the design
    - `spriteModules.ts`: the single literal
      `import.meta.glob<string>('/assets/sprites/**/*.svg', { eager: true, query: '?url', import: 'default' })`
    - _Requirements: 13.1, 13.2, 13.3_

  - [x]* 5.4 Write manifest tests in `tests/render/sprites/manifest.test.ts`
    - **Property 16: The manifest keeps valid animations and reports broken ones**
    - Smoke: `SPRITE_MODULES` is `{}` while `assets/sprites/` is absent
    - **Validates: Requirements 13.1, 13.2, 13.3**

  - [x] 5.5 Create `src/render/sprites/placeholder.ts`
    - `PLACEHOLDER_FRAME_COUNT`, `placeholderSvg(entity, animation, frame)` with one silhouette
      per entity from the design table (Enemies face left, feet at bottom centre, `width`,
      `height` and `viewBox` from the entity box, frame number in `<text font-family="monospace">`,
      the per-animation variations), and `placeholderFrames()` returning
      `data:image/svg+xml;charset=utf-8,` + `encodeURIComponent(svg)` URLs
    - _Requirements: 13.4, 13.5_

  - [x]* 5.6 Write placeholder tests in `tests/render/sprites/placeholder.test.ts`
    - **Property 17: Placeholders follow the sprite rules**
    - **Validates: Requirements 13.5**

  - [x] 5.7 Create `src/render/sprites/atlas.ts`
    - `rasterSize`, `createSpriteAtlas(deps)` (team frames per entity and animation when present,
      placeholders otherwise; each URL loaded and drawn into its own offscreen canvas once;
      `frame()` returns `null` until rasterized; a failing team frame logs `console.warn` and
      falls back to placeholders), and lazy `getDefaultAtlas()` over `SPRITE_MODULES` with real
      `Image` loading that logs manifest problems once
    - _Requirements: 13.4, 13.6, 13.7_

  - [x]* 5.8 Write atlas tests in `tests/render/sprites/atlas.test.ts`
    - With fake `loadImage` and `createRaster`: empty manifest uses placeholder counts and `data:`
      URLs; team frames for `tank/walk` replace only that animation; `frame()` is `null` before
      `ready()` and set after; each URL loads once over many `frame()` calls; a failing team frame
      falls back; `rasterSize` keeps the natural aspect and uses the box when natural size is 0
    - _Requirements: 13.4, 13.6, 13.7_

- [x] 6. Lane rendering, HUD and sounds
  - [x] 6.1 Create `src/render/laneLayout.ts`
    - Constants, `createLaneLayout`, `laneToCanvas`, `canvasToLane` and `clientToLane` per the
      design (canvas origin through the same `toScreenPoint`)
    - _Requirements: 10.1, 10.2, 10.3_

  - [x]* 6.2 Write layout tests in `tests/render/laneLayout.test.ts`
    - **Property 12: Lane coordinates round-trip through the screen**
    - Examples: default anchors (0, 0) → (112, 232) and (800, 0) → (912, 232)
    - **Validates: Requirements 10.1, 10.3**

  - [x] 6.3 Create `src/render/laneEffects.ts` and `src/render/laneDrawList.ts`
    - `LaneEffects`, `EMPTY_EFFECTS`, `applyEvents` (corpses on `mobKilled` expiring after their die
      length, swing tick, shake window on `modemHit`, rattle on scheduled `mobSpawned`, modem hit
      tick), `shakeOffset` (deterministic, within ±3 px for 12 ticks)
    - `buildDrawList(state, effects, layout, frameCount)`: modem (`hit` after a bite), manhole
      (`attack` while rattling), corpses (`die`), then Enemies in reverse Hit_Priority with feet and
      height per the design; works when `state.lane` is absent
    - _Requirements: 11.2, 11.3, 11.6, 11.7_

  - [x]* 6.4 Write draw-list and effects tests in `tests/render/laneDrawList.test.ts` and `tests/render/laneEffects.test.ts`
    - **Property 13: The draw list shows every Enemy where it stands, target on top**
    - Examples: corpse added and expired; swing tick recorded; `shakeOffset` within ±3 px on every
      tick of the window and 0 after it
    - **Validates: Requirements 11.2, 11.3, 11.6, 11.7**

  - [x] 6.5 Create `src/render/laneSounds.ts`
    - `LaneSoundId`, `LANE_SOUND_SEC`, the six `LANE_SOUNDS` recipes from the design table
      (following the recipe rules in `src/dialup/modemSounds.ts`: schedule inside the window,
      fade in and out, stop function safe to call twice), and `laneSoundsFor(events)`
    - _Requirements: 14.1, 14.2, 14.3_

  - [x]* 6.6 Write sound tests in `tests/render/laneSounds.test.ts`
    - **Property 18: Each lane sound plays at most once per frame**
    - Examples: the event → sound table; each recipe run on `createFakeAudioContext()` creates
      nodes, stops them by the end and survives a double stop
    - **Validates: Requirements 14.1, 14.2, 14.3**

  - [x] 6.7 Create `src/ui/laneCopy.ts` and `src/ui/laneHud.ts`
    - `LANE_COPY` from the design (follow `retro-copy`); `integrityView(state)`; `createLaneHud()`
      building the HUD DOM with `h()`, updating fill width, value text, critical note and
      `.is-critical` only when they change, text through `textContent`
    - _Requirements: 12.1, 12.2, 12.3, 12.4_

  - [x]* 6.8 Write HUD and copy tests in `tests/ui/laneHud.test.ts` and `tests/copy.test.ts`
    - **Property 15: The HUD shows integrity as a fraction, a percentage and a critical flag**
    - Examples: DOM fill width, value text and `.is-critical` toggling; add `LANE_COPY` to
      `COPY_TABLES` in `tests/copy.test.ts`
    - **Validates: Requirements 12.1, 12.2, 12.3, 12.4**

  - [x] 6.9 Create `src/render/laneView.ts` and `src/styles/lane.css`
    - `createLaneView(deps?)` as a `SessionView` per the design: mount builds
      `div.lane-view > canvas.lane-canvas + HUD` in `ctx.laneHost` (backing store × dpr capped at
      2, `aria-label` from `LANE_COPY`), primary-button `pointerdown` → `ctx.send(hammer)` via
      `clientToLane`, `pointermove` / `pointerleave` track the hammer cursor; update folds events,
      updates the HUD, plays `laneSoundsFor(events)` and, when a 2D context exists, draws the
      background, the draw list (atlas frame or flat colour box) and the hammer cursor; unmount
      removes listeners and elements and stops voices
    - `lane.css`: canvas fills the Lane_Dock with `cursor: none`, HUD strip styled with theme
      tokens from `src/styles/theme.css` (add any new tokens there)
    - `src/main.ts`: import `./styles/lane.css`
    - _Requirements: 10.2, 10.4, 11.1, 11.2, 11.4, 11.5, 11.8, 13.4, 13.6, 14.1, 14.4_

  - [x]* 6.10 Write Lane_View tests in `tests/render/laneView.test.ts`
    - Mount places canvas and HUD in `laneHost`; a primary `pointerdown` with a scale-2 fake
      `toScreenPoint` and an offset canvas rect sends the expected lane point; button 2 sends
      nothing; update with a deep-frozen state works and leaves it unchanged; with `getContext`
      returning `null` the HUD still updates; one voice per sound per frame; unmount empties
      `laneHost`, leaves no listeners (`trackListeners`) and stops voices
    - _Requirements: 10.2, 10.4, 11.1, 11.4, 11.5, 14.2, 14.4_

- [x] 7. Wire the lane into every Session
  - [x] 7.1 Register the lane in `src/dialup/sessionRegistry.ts`
    - `SESSION_REGISTRY = { views: [() => createLaneView()], systems: createLaneSystems() }`; update
      the file comment
    - In `tests/dialup/session.test.ts` replace the "registry starts empty" example with one that
      checks one view factory producing a `SessionView` and four systems (design decision D14)
    - _Requirements: 9.5_

- [x] 8. Checkpoint: lane playable in the shell
  - Run `npm run typecheck`, `npm test` and `npm run build`. Ensure all tests pass; ask the user if
    questions arise.

- [x] 9. Kiro artifacts
  - [x] 9.1 Write the `add-mob` skill in `.kiro/skills/add-mob/SKILL.md`
    - YAML front matter `name: add-mob` and a `description` saying when to use it; body: the
      numbered recipe from the design pointing at the real files and functions as they now exist
      (`laneTypes.ts`, `balance/lane.ts`, `mobs.ts`, `spawner.ts`, `entities.ts`,
      `placeholder.ts`, `laneSounds.ts`, the tests to add), plus the `sprites` and `game-balance`
      steering rules and the reminder never to write into `assets/sprites/`
    - _Requirements: 15.1, 15.2_

  - [x]* 9.2 Write `tests/skills.test.ts`
    - `SKILL.md` front matter has `name: add-mob` and a non-empty `description`; every backticked
      `src/` path in the body exists on disk (use `tests/helpers/repo.ts`)
    - _Requirements: 15.1, 15.2_

  - [x] 9.3 Add a note to `docs/kiro-log.md`
    - One dated line under "Notes" describing the connection-lane spec (systems, sprite
      placeholders, property count) and the new `add-mob` skill
    - _Requirements: 15.3_

- [ ] 10. Playtester smoke run
  - Invoke the `playtester` custom agent (`.kiro/agents/playtester.md`, Playwright MCP) to play
    boot → desktop → dial-up for about 40 seconds of dialing and connection, clicking zombies on
    the lane, and write a report to `docs/playtests/YYYY-MM-DD-connection-lane-smoke.md`
  - If the dev server or Playwright MCP is unavailable, skip this task and say so in the final
    summary
  - _Requirements: 11.2, 11.8, 12.1_

- [ ] 11. Final checkpoint
  - Run `npm run typecheck`, `npm test` and `npm run build`. Ensure all tests pass; ask the user if
    questions arise.
  - Manual check in `npm run dev` (port 3000): the first default zombie leaves the manhole about
    8 s after Connect; hammer clicks hit at the monitor's current scale; the integrity bar drops
    and turns critical at 20; placeholders show frame numbers; sounds play once per event.

## Notes

- Tasks marked with `*` are optional test tasks and can be skipped for a faster MVP. Task 2.6
  (lane test helpers) is needed by tasks 2.7–2.10.
- Each task references specific requirements for traceability.
- Property tests validate the universal properties in `design.md`; example tests cover specific
  timings and edge cases.
- Never weaken a failing test. Task 4.1 only adds a fixture field and task 7.1 replaces one
  example whose requirement this milestone changes (decision D14).

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3"] },
    { "id": 2, "tasks": ["1.4", "2.1"] },
    { "id": 3, "tasks": ["2.2"] },
    { "id": 4, "tasks": ["2.3", "2.4"] },
    { "id": 5, "tasks": ["2.5"] },
    { "id": 6, "tasks": ["2.6"] },
    { "id": 7, "tasks": ["2.7", "2.8", "2.9", "2.10"] },
    { "id": 8, "tasks": ["3"] },
    { "id": 9, "tasks": ["4.1", "5.1", "6.1", "6.5", "6.7"] },
    { "id": 10, "tasks": ["4.2", "5.2", "5.3", "5.5", "6.2", "6.6", "6.8"] },
    { "id": 11, "tasks": ["5.4", "5.6", "5.7", "6.3"] },
    { "id": 12, "tasks": ["5.8", "6.4", "6.9"] },
    { "id": 13, "tasks": ["6.10", "7.1"] },
    { "id": 14, "tasks": ["8"] },
    { "id": 15, "tasks": ["9.1", "9.3"] },
    { "id": 16, "tasks": ["9.2"] },
    { "id": 17, "tasks": ["10"] },
    { "id": 18, "tasks": ["11"] }
  ]
}
```
