---
name: add-mob
description: Add a new zombie mob type to the connection lane (for example a "crawler") end to end, covering the kind union, balance stats and validation, behaviour, spawn entry, placeholder sprite, sounds and tests. Use when adding, renaming or changing a mob kind or a mob's behaviour on the lane.
---

# Add a mob to the connection lane

The checklist below uses a new mob called `crawler` as the example. Replace it with the real
name. Each step names the file and the symbol to change.

## 0. Before writing code

- `docs/game-design.md` is the source of truth, and it fixes **five mob types** (section 5).
  A new kind changes the design. Ask the team first, then add the mob's row (role, HP, speed,
  modem damage, drop, behaviour, chapter it joins) to section 5 and its chapter to section 3.
- Read the `game-balance` and `sprites` steering files (`.kiro/steering/game-balance.md`,
  `.kiro/steering/sprites.md`).
- The name must be lowercase letters, digits or `-`. It is also the sprite folder name.

## 1. Kind union: `src/game/laneTypes.ts`

1. Add `'crawler'` to `MobKind`.
2. Add `'crawler'` to `MOB_KINDS`. **Typecheck will not remind you.** `resolveLaneBalance` and
   its validation loop over `ENEMY_KINDS` (built from `MOB_KINDS`), so a kind missing here
   resolves to a balance with no stats row and fails at runtime.
3. A melee kind (walks to its Attack_Point and hits the modem again and again) also goes into
   `MeleeKind` and `MELEE_KINDS`, and into `isMeleeKind`. A kind that never reaches the modem
   (like `ranged`) stays out of them.
4. Pick the `Enemy` variant:
   - No extra state: add it to the `'default' | 'fast' | 'tank'` variant.
   - Extra state (timers, counters): add a new variant with `readonly` plain-data fields
     (numbers, `null`, no `undefined`, no functions) so the state survives a JSON round trip.
5. A projectile (like `glob`) is an `EnemyKind` but not a `MobKind`. Add it to the
   `EnemyKind` union and to `ENEMY_KINDS` only, so it cannot be scheduled.
6. New events, spawn sources or burst causes go into `LaneEventBody`, `SpawnSource` or
   `BurstCause` here.

## 2. Balance: `src/game/balance/lane.ts`

1. Add a `crawler` row to `DEFAULT_LANE_BALANCE.enemies` with `hp`, `speed` (Lane_Units per
   second; the lane is 800 long), `damage` (Hit_Damage: damage per hit, or per Glob for a
   projectile), `dropKb`, `width` and `height` (the Hit_Box). Note the crossing time in a
   comment, like the other rows.
2. For a melee kind, add a `crawler: { hitEverySeconds: ... }` row to
   `DEFAULT_LANE_BALANCE.melee` (the Hit_Interval from design section 5). The mob lands its
   first hit on arrival, then one hit every `hitEverySeconds`. `resolveLaneBalance` and
   `validateLaneBalance` loop over `MELEE_KINDS`, so a melee kind missing from that list has no
   Hit_Interval.
3. Behaviour numbers (stop points, intervals, thresholds) get their own section in
   `LaneBalance`, `LaneBalanceOverrides`, the `merged` object in `resolveLaneBalance` and a
   `check(...)` line in `validateLaneBalance`. See `ranged` and `boss` for the pattern.
   Durations are in seconds and go through `secondsToTicks`.
4. Never put a number inline in logic. Logic reads it from `lane.balance`.

## 3. Behaviour: `src/game/mobs.ts`

1. `addMob`: add a `case 'crawler'` to the switch. The `never` default makes typecheck fail
   until you do. Initialise any extra variant fields here.
2. `mobSystem`: kind-specific behaviour goes in an `if (enemy.kind === 'crawler')` block
   between move and bite, like the ranged block. Read stats through `enemyStats`. New enemies
   created during the loop go into `spat` (appended after the loop) and take their id from
   `lane.nextId`.
3. `damageEnemy`: reactions to being hit go after the kill check, like the boss summons. A
   killing hit must not trigger them.
4. A bite that should also fire a pop-up burst: extend the `tank`/`boss` condition at the bite
   step and add a `BurstCause`.
5. Keep it pure: no DOM, timers, `Date.now()` or `Math.random()`. Randomness only through
   `ctx.random()`.

## 4. Spawning: `src/game/spawner.ts`

- `scheduleSpawner` passes the run's `lane.balance.spawns` to `scheduledSpawnsAt`; the
  defaults come from `DEFAULT_LANE_BALANCE.spawns` in `src/game/balance/lane.ts`. Add a
  `SpawnWave` (`kind`, `startSecond`, `endSecond`, `everySeconds`) there so the mob appears in
  the chapter the design gives it. No code change in `spawner.ts` is needed.
- This schedule is a placeholder. The milestone-5 director (`cross-front-and-director`)
  replaces `scheduleSpawner` through `createLaneSystems({ spawner })` in `src/game/lane.ts` and
  reuses `addMob`. Once it exists, add the mob to the director's chapter data instead.
- Other spawn paths (boss summons, fake-button penalty) call `addMob` with their own
  `SpawnSource`.

## 5. Sprite look and placeholder

1. `src/render/sprites/entities.ts`: add `crawler` to `ENTITY_LOOKS` with a colour no other
   entity uses, a `box` matching the balance `width`/`height` proportions, and its animations
   (usually `MOB_ANIMATIONS`). `SpriteEntity` includes every `EnemyKind`, so typecheck fails
   until the row exists.
2. `src/render/sprites/placeholder.ts`: write a `Body` function with its own silhouette and add
   it to `BODIES` (typecheck fails until you do). Rules from `sprites` steering:
   - coordinates as fractions of `w` and `h`, feet on `y = h` at the bottom centre;
   - the mob faces **left** (head and mouth on the left);
   - frames vary with `pose` (legs, mouth) so animation timing is visible;
   - no scripts, external references, raster images or web fonts.
3. `src/render/sprites/frames.ts`: only if the mob needs its own animation rule, extend
   `enemyAnimation` (see the ranged `attack`/`idle` branch). Otherwise it walks.
4. `src/render/laneDrawList.ts` needs no change: `buildDrawList` draws every Enemy from
   `ENTITY_LOOKS` and the balance height, and falls back to `walk` for missing animations.
5. Add `crawler` to the entity list in `.kiro/steering/sprites.md`, so artists know the folder
   `assets/sprites/crawler/<animation>/<NN>.svg`.
6. **Never write files into `assets/sprites/`.** That folder holds the team's final art and the
   `guard-write` hook blocks it. The placeholder covers every frame until the team's SVGs land.

## 6. Sounds (optional): `src/render/laneSounds.ts`

- Kills, bites and scheduled spawns already play `mobSplat`, `modemCrunch` and `manholeClank`.
- For a new cue: add an id to `LaneSoundId`, a length to `LANE_SOUND_SEC`, a recipe built from
  the `src/core/soundKit.ts` helpers to `LANE_SOUNDS`, and a case in `soundFor` that
  `laneSoundsFor` uses. Synthesized Web Audio only, no audio files.

## 7. Text (if the mob has any)

- Player-facing strings go into `LANE_COPY` in `src/ui/laneCopy.ts`, are set with
  `textContent` and follow the `retro-copy` steering. `tests/copy.test.ts` scans them for real
  trademarks.

## 8. Tests to add or update

- `tests/game/balance/lane.test.ts`: add the row to `EXPECTED_DEFAULTS` (typecheck forces it)
  and to the section 5 value checks; test validation of any new balance section.
- `tests/helpers/lane.ts`: add the kind to the `laneWith` switch (typecheck forces it, since
  the function must return an `Enemy`) and add a wave to `fastSchedule()` so the run
  properties in `tests/game/laneProperties.test.ts` cover the new mob.
- `tests/game/mobs.test.ts`: add the kind to the `addMob covers every Mob kind` list, plus
  example tests for its speed, bite damage, drop and any special behaviour, with exact ticks.
- `tests/game/spawner.test.ts`: the first tick the default schedule spawns the new kind.
- `tests/render/sprites/frames.test.ts`: only if `enemyAnimation` changed.
- `tests/render/sprites/placeholder.test.ts` and `tests/render/laneDrawList.test.ts` loop over
  `ENTITY_LOOKS`, so they check the new silhouette (own shape, inside the viewBox, same size
  for every frame) without edits.
- `tests/render/laneSounds.test.ts`: only if a new cue or event mapping was added.
- Property tests are named after the requirement they check, for example
  `// Property: Req 4.1 enemies only move left`.

## 9. Check

```sh
npm run typecheck   # lists every exhaustive Record and switch still missing the new kind
npm test
```

Fix the code, never weaken a failing test. If the mob changes the run's pacing, report the
old and new numbers and the reason, as the `game-balance` steering asks.
