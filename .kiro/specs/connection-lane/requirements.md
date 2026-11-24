# Requirements Document

## Introduction

The connection-lane feature is the bottom front of the game: the phone line between the modem
and the manhole, the five mob types that walk along it, the hammer the player starts with, and
the modem hits that end a run. It is milestone 3 in `docs/roadmap.md`.

The rules live in `src/game/` as pure game-core systems plugged into the Session_Registry. They
run from the first dial tick, so zombies attack during dial-up as `docs/game-design.md` requires.
The lane is drawn on a Canvas 2D view in the 260 px Lane_Dock from retro-shell. Sprites follow
`.kiro/steering/sprites.md`: one SVG per frame from `assets/sprites/`, with generated
placeholders for every frame the team has not drawn yet. The folder does not exist yet, so the
game must run with zero art files.

Out of scope for this milestone: KB collection and the shop (milestone 6), the browser front that
shows pop-up bursts (milestone 4), the 7-chapter director (milestone 5) and juice such as crack
overlays (milestone 8). This feature emits the events those milestones consume and uses a
simple placeholder spawn schedule that the director will replace.

## Glossary

- **Run**: one game-core play-through, held in `GameState` and advanced only by `step()`.
- **Tick**: one fixed simulation step of 1/60 s. Tick 0 is the moment dialing starts.
- **Lane**: the phone line from the Modem_Line to the Manhole, measured in Lane_Units.
- **Lane_Unit**: the unit of every lane position and size. It is a plain number with no relation
  to DOM pixels.
- **Lane_X**: the position along the Lane. 0 is the Modem_Line; Lane_Length is the Manhole.
- **Lane_Y**: the height above the phone line. 0 is on the line; positive values are higher.
- **Lane_Length**: the distance from the Modem_Line to the Manhole in Lane_Units.
- **Modem_Line**: Lane_X 0, where an Enemy bites the modem.
- **Manhole**: Lane_X equal to Lane_Length, where scheduled Mobs appear.
- **Mob**: a zombie of one of five kinds: default, fast, tank, ranged, boss.
- **Glob**: a projectile spat by a ranged Mob. A Glob walks the Lane like a Mob and can be hit.
- **Enemy**: a Mob or a Glob.
- **Enemy_Stats**: the tuning row of one Enemy kind: HP, speed, modem damage, KB drop, Hit_Box
  width and height.
- **Hit_Box**: the rectangle of an Enemy in Lane_Units, anchored at its feet: Lane_X ±
  width / 2, Lane_Y from 0 to height, grown on every side by the Hit_Padding.
- **Hit_Padding**: extra Lane_Units added around each Hit_Box so clicks near the edge still hit.
- **Hit_Priority**: the order in which overlapping Enemies are chosen: lowest Lane_X first, then
  lowest id.
- **Bite**: an Enemy reaching the Modem_Line, dealing its modem damage once and leaving the Lane.
- **Lane_State**: the plain-data part of the Run state that holds the Enemies, the next Enemy
  id, the Hammer cooldown and the Lane_Balance.
- **Lane_Balance**: the lane tuning table in `src/game/balance/lane.ts`, including the
  Spawn_Schedule.
- **Lane_Systems**: the game-core systems created by `createLaneSystems()` that run the Lane
  inside `step()`.
- **Spawner**: the Lane_System that adds scheduled Mobs. It is replaceable as a unit.
- **Spawn_Wave**: one Spawn_Schedule row: Mob kind, start second, end second and interval.
- **Spawn_Schedule**: the list of Spawn_Waves in the Lane_Balance.
- **Hammer**: the starting weapon. A click deals hammer damage to one Enemy, then the Hammer
  cools down.
- **Hammer_Command**: the game-core input command `{ type: 'hammer', x, y }` with a point in
  Lane_Units.
- **Swing**: a Hammer_Command that the Lane_Systems accept, whether it hits or misses.
- **Boss_Threshold**: a share of boss maximum HP (0.75, 0.5, 0.25) at which the boss summons.
- **Pop_Up_Burst_Request**: the `popupBurst` event asking the browser front for a burst of
  clutter ads. The browser front (milestone 4) consumes it.
- **Session**: the retro-shell host that runs one Run in the browser and drives Session_Views.
- **Session_View**: a retro-shell component with `mount(ctx)`, `update(state, events)` and
  `unmount()`.
- **Session_Registry**: `src/dialup/sessionRegistry.ts`, the list of Session_Views and systems
  every Session uses.
- **Lane_Dock**: the 1024 × 260 Screen-pixel area above the taskbar that hosts the lane during a
  Session (`SessionContext.laneHost`).
- **Lane_View**: the Session_View that draws the Lane on a canvas in the Lane_Dock and turns
  pointer input into Hammer_Commands.
- **Lane_Layout**: the pure mapping between Lane_Units and canvas pixels.
- **Lane_HUD**: the DOM strip in the Lane_View that shows modem integrity.
- **Sprite_Manifest**: the table entity → animation → frame URLs built from the files in
  `assets/sprites/`.
- **Placeholder_Generator**: the code in `src/render/sprites/` that generates a placeholder SVG
  for every frame the renderer uses.
- **Sprite_Atlas**: the runtime store of pre-rasterized frames, team frames first and
  placeholders otherwise.
- **Lane_Sounds**: the synthesized lane sound recipes played through the Audio_Engine.
- **Audio_Engine**: the retro-shell Web Audio wrapper in `src/core/audio.ts`.

## Requirements

### Requirement 1: Lane state inside the Run

**User Story:** As a developer, I want the lane to live in the Run state, so that lane runs are
deterministic, replayable and playable headless like the rest of game-core.

#### Acceptance Criteria

1. WHEN the Lane_Systems run on a Run state that has no Lane_State, THE Lane_Systems SHALL add a
   Lane_State with no Enemies, next Enemy id 1, the Hammer ready on that tick and the
   Lane_Balance given to `createLaneSystems()`.
2. THE `createRun` function SHALL return the same state fields it returned before this feature,
   with no Lane_State field.
3. THE Lane_State SHALL contain only plain objects, arrays, finite numbers, strings, booleans and
   `null`, so that `JSON.parse(JSON.stringify(state))` equals the state.
4. WHILE a Lane_State exists, THE Lane_Systems SHALL read lane tuning only from the Lane_State's
   Lane_Balance.
5. THE Lane_Systems SHALL keep no data between calls outside the Run state, so that one set of
   Lane_Systems reused for several Runs gives each Run the same result as a fresh set.
6. WHEN two Runs start from the same seed with the same Lane_Balance and receive the same input
   commands on the same ticks, THE Lane_Systems SHALL produce identical states and identical
   events on every tick.
7. WHILE the Run phase is `dialing`, `connected` or `downloading`, THE Lane_Systems SHALL advance
   the Lane on every tick.

### Requirement 2: Lane tuning as data

**User Story:** As a designer, I want every lane number in one balance table, so that I can tune
the lane without touching logic.

#### Acceptance Criteria

1. THE Lane_Balance defaults SHALL use the mob table in `docs/game-design.md` section 5: HP
   default 2, fast 1, tank 4, ranged 3, boss 30, Glob 1; modem damage default 10, fast 8, tank
   20, Glob 5, boss 40; KB drop default 5, fast 8, tank 20, ranged 15, boss 100, Glob 1.

   _Note: modem damage is superseded by `lane-melee` Requirement 5.2; damage is now dealt per Melee_Hit on a timer._
2. THE Lane_Balance defaults SHALL give the fast Mob a higher speed than the default Mob, give
   the ranged Mob the default Mob's speed, and give the tank and boss Mobs lower speeds than the
   default Mob.
3. THE Lane_Balance defaults SHALL set Hammer damage 1, Hammer cooldown 0.3 s, ranged stop
   point at half the Lane_Length, Glob interval 3 s, Boss_Thresholds 0.75, 0.5 and 0.25, 2
   default Mobs per boss summon and 3 ads per Pop_Up_Burst_Request.
4. WHEN a Lane_Balance duration in seconds is converted to Ticks, THE Lane_Systems SHALL use
   `Math.round(seconds × 60)`.
5. IF Lane_Balance overrides contain a non-finite number, a value outside its allowed range or an
   unknown Mob kind in the Spawn_Schedule, THEN THE `resolveLaneBalance` function SHALL throw a
   `LaneBalanceError` that lists every problem found.
6. WHEN `createLaneSystems()` receives Lane_Balance overrides, THE Lane_Systems SHALL apply the
   overrides only to the Runs that use those Lane_Systems.

### Requirement 3: Placeholder spawn schedule

**User Story:** As a player, I want zombies to crawl out of the manhole on a fixed schedule, so
that the lane is playable before the chapter director exists.

#### Acceptance Criteria

1. THE Spawn_Schedule SHALL be a list of Spawn_Waves, each with a Mob kind, a start second, an
   end second and an interval in seconds.
2. WHEN the current Tick equals a Spawn_Wave's start Tick plus a whole multiple of its interval
   in Ticks and is no later than its end Tick, THE Spawner SHALL add one Mob of that kind at the
   Manhole and emit `mobSpawned` with source `schedule`.
3. THE default Spawn_Schedule SHALL spawn the first default Mob at 8 s (Tick 480), start fast
   Mobs at 45 s, tank Mobs at 70 s and ranged Mobs at 90 s, and spawn one boss Mob at 118 s.
4. WHERE a replacement Spawner is passed to `createLaneSystems()`, THE Lane_Systems SHALL run
   the replacement in the Spawner's place and keep every other Lane_System unchanged.
5. WHEN a Mob is added, THE Lane_Systems SHALL give the Mob the next Enemy id, full HP from its
   Enemy_Stats and the current Tick as its spawn Tick, and SHALL increase the next Enemy id by 1.
6. THE Spawner SHALL decide scheduled spawns from the Tick and the Spawn_Schedule only, so that
   player input never changes which Mobs are scheduled on which Ticks.
7. WHEN several Spawn_Waves spawn on the same Tick, THE Spawner SHALL add their Mobs in
   Spawn_Schedule order.

### Requirement 4: Movement and modem bites

**User Story:** As a player, I want zombies to walk left along the line and bite the modem once,
so that every hit is a readable moment.

#### Acceptance Criteria

1. WHEN a Tick runs, THE Lane_Systems SHALL move every walking Enemy left by its speed in
   Lane_Units per second divided by 60.
2. WHEN an Enemy's Lane_X reaches 0 or less after moving, THE Lane_Systems SHALL emit `mobBit`,
   call `damageModem` once with the Enemy's modem damage and remove the Enemy on the same Tick.

   _Note: superseded by `lane-melee` Requirements 1–3 for Mobs; a Mob now stays at the modem and keeps hitting it until killed. This rule still applies to Globs._
3. THE Lane_Systems SHALL keep the Lane_X of every Enemy in the Lane_State greater than 0 and no
   greater than the Lane_Length.
4. WHEN a tank or boss Mob bites, THE Lane_Systems SHALL emit a Pop_Up_Burst_Request with the
   Lane_Balance burst count and the cause `tankBite` or `bossBite`.

   _Note: superseded by `lane-melee` Requirement 4; the burst now fires on the first Melee_Hit of each tank or boss only._
5. WHEN an Enemy bites, THE Lane_Systems SHALL emit `mobBit` immediately before the `modemHit`
   event of that Bite.
6. WHEN several Enemies bite on the same Tick, THE Lane_Systems SHALL resolve the Bites in
   ascending Enemy id order.

### Requirement 5: Ranged Mob and Globs

**User Story:** As a player, I want the ranged zombie to stop mid-lane and spit, so that ignoring
the lane is punished.

#### Acceptance Criteria

1. WHEN a ranged Mob's move would take its Lane_X below the ranged stop point, THE Lane_Systems
   SHALL set its Lane_X to the stop point and stop moving the Mob.
2. WHEN a stopped ranged Mob has been stopped for the first-spit delay, and every Glob interval
   after that, THE Lane_Systems SHALL add a Glob at the ranged Mob's Lane_X and emit `globSpat`.
3. THE Lane_Systems SHALL move, damage and bite with a Glob using the Glob Enemy_Stats, so that
   one Hammer hit kills a Glob, a Glob Bite deals 5 damage and a killed Glob drops 1 KB.
4. WHEN a ranged Mob is killed, THE Lane_Systems SHALL keep every Glob that Mob spat on the Lane.
5. WHILE a ranged Mob is stopped, THE Lane_Systems SHALL keep the Mob's Lane_X at the stop point.

### Requirement 6: Boss summons

**User Story:** As a player, I want the boss to call for help as it weakens, so that the final
fight escalates on both fronts.

#### Acceptance Criteria

1. WHEN a hit leaves the boss with HP above 0 and at or below a Boss_Threshold × maximum HP that
   the boss has not passed yet, THE Lane_Systems SHALL emit `bossSummon`, add the summon count of
   default Mobs with `mobSpawned` source `bossSummon`, and emit a Pop_Up_Burst_Request with cause
   `bossSummon`.
2. WHEN one hit passes several Boss_Thresholds, THE Lane_Systems SHALL run one summon per passed
   Boss_Threshold in descending threshold order, and each Boss_Threshold SHALL summon at most
   once per boss.
3. WHEN a hit kills the boss, THE Lane_Systems SHALL run no summon for that hit.
4. WHEN the boss summons, THE Lane_Systems SHALL place the k-th summoned Mob (k from 0) at the
   boss Lane_X plus k × the summon spacing, capped at the Lane_Length.

### Requirement 7: Hammer

**User Story:** As a player, I want to click zombies with a hammer, so that I can defend the
modem from the first second of dial-up.

#### Acceptance Criteria

1. THE game-core `InputCommand` union SHALL include the Hammer_Command
   `{ type: 'hammer', x: number, y: number }` with the point in Lane_Units.
2. WHEN a Swing's point is inside one or more Hit_Boxes, THE Lane_Systems SHALL deal Hammer
   damage to the Enemy that comes first in Hit_Priority.
3. IF a Hammer_Command arrives on a Tick before the Hammer is ready, THEN THE Lane_Systems SHALL
   ignore the Hammer_Command and emit no event for it.
4. WHEN the Lane_Systems accept a Swing, THE Lane_Systems SHALL emit `hammerSwing` with the point
   and the hit Enemy id or `null`, and SHALL make the Hammer ready again after the Hammer
   cooldown in Ticks, for hits and misses alike.
5. IF a Hammer_Command has a non-finite coordinate, THEN THE Lane_Systems SHALL ignore the
   Hammer_Command and emit no event for it.
6. WHEN several Hammer_Commands arrive on one Tick, THE Lane_Systems SHALL process them in
   arrival order, so that at most one of them is accepted while the cooldown is above 0 Ticks.

### Requirement 8: Damage and kills

**User Story:** As a player, I want every hit and kill to register clearly, so that I can read
the fight and later earn KB from kills.

#### Acceptance Criteria

1. WHEN an Enemy takes damage, THE Lane_Systems SHALL set its HP to the larger of 0 and HP minus
   the damage, record the Tick as its last hit Tick and emit `mobHit` with the HP actually
   removed and the new HP.
2. WHEN an Enemy's HP reaches 0, THE Lane_Systems SHALL remove the Enemy and emit `mobKilled`
   with its id, kind, Lane_X and KB drop.
3. THE Lane_Systems SHALL keep the HP of every Enemy in the Lane_State between 1 and the
   maximum HP of its kind.
4. THE Lane_Systems SHALL report KB drops only through the `mobKilled` event and SHALL leave
   currency handling to the economy milestone.

### Requirement 9: Integration with game-core and retro-shell

**User Story:** As a developer, I want the lane to plug into the existing step function and
Session, so that the shell and later milestones need no rewiring.

#### Acceptance Criteria

1. WHEN `step()` runs systems, THE `step` function SHALL make the Tick's input commands
   available to every system, in arrival order, through the tick context.
2. WHEN `step()` applies a Hammer_Command in its own input stage, THE `step` function SHALL leave
   the phase, download and pause sources unchanged.
3. THE existing game-core tests and property tests SHALL pass without changes to their
   assertions.
4. WHEN `createTickContext` is called without input commands, THE tick context SHALL expose an
   empty input list.
5. THE Session_Registry SHALL list the Lane_View factory and the default Lane_Systems.
6. THE Session SHALL pass a `toScreenPoint` function to every Session_View, and THE
   Desktop_Scene SHALL supply the Monitor's `toScreenPoint`.
7. WHEN `runHeadless` receives the Lane_Systems and a script with Hammer_Commands, THE headless
   runner SHALL play the Run in Node with no DOM.

### Requirement 10: Lane coordinates and pointer input

**User Story:** As a player, I want a click on a zombie to hit that zombie at any monitor scale,
so that aiming feels exact.

#### Acceptance Criteria

1. THE Lane_Layout SHALL map Lane_X 0 to the right edge of the drawn modem, Lane_Length to the
   Manhole centre and Lane_Y 0 to the drawn phone line, with Lane_Y growing upward on screen.
2. WHEN the primary pointer button is pressed on the Lane_View canvas, THE Lane_View SHALL
   convert the client point to Screen pixels with the Session's `toScreenPoint`, subtract the
   canvas origin in Screen pixels, convert the result to Lane_Units with the Lane_Layout and send
   one Hammer_Command with that point.
3. FOR ALL Lane_Layouts and points, converting a point from Lane_Units to canvas pixels and back
   SHALL return the original point within 1e-6 Lane_Units.
4. IF a pointer press uses a button other than the primary button, THEN THE Lane_View SHALL send
   no Hammer_Command.

### Requirement 11: Lane rendering

**User Story:** As a player, I want to see the modem, the line, the manhole and every zombie in
the lane dock, so that I can defend the line.

#### Acceptance Criteria

1. WHEN the Lane_View mounts, THE Lane_View SHALL add its canvas and the Lane_HUD to the
   Lane_Dock, and WHEN the Lane_View unmounts, THE Lane_View SHALL remove both and every listener
   and voice it added.
2. WHEN the Lane_View receives a state, THE Lane_View SHALL draw the modem, the phone line, the
   Manhole and every Enemy with its feet at its Lane_X on the phone line and its height equal to
   its Hit_Box height in canvas pixels.
3. THE Lane_View SHALL draw Enemies in reverse Hit_Priority, so that the Enemy a click would hit
   is drawn on top.
4. THE Lane_View SHALL change the Run only by sending input commands through the Session
   context.
5. IF the canvas has no 2D context, THEN THE Lane_View SHALL keep the Lane_HUD working and skip
   canvas drawing without throwing.
6. WHEN a `mobKilled` event arrives, THE Lane_View SHALL play the Enemy's `die` animation at its
   last Lane_X for the length of that animation.
7. WHEN a `modemHit` event arrives, THE Lane_View SHALL offset the lane drawing by at most 3
   canvas pixels for 12 Ticks.
8. WHILE the pointer is over the Lane_View canvas, THE Lane_View SHALL hide the system cursor and
   draw the Hammer sprite at the pointer, using the Hammer `use` animation for 12 Ticks after each
   `hammerSwing` event.

### Requirement 12: Lane HUD

**User Story:** As a player, I want to see the modem's integrity at a glance, so that I know how
close I am to disconnect.

#### Acceptance Criteria

1. WHEN the Lane_View receives a state, THE Lane_HUD SHALL set the integrity bar fill to the
   integrity divided by the maximum integrity.
2. WHEN the Lane_View receives a state, THE Lane_HUD SHALL show the integrity as a whole-number
   percentage.
3. WHILE the integrity is at or below the critical integrity, THE Lane_HUD SHALL show the
   critical style and the critical note.
4. THE Lane_HUD SHALL take its text from a copy table that follows the `retro-copy` steering file
   and SHALL set text only through `textContent`.

### Requirement 13: Sprites and placeholders

**User Story:** As an artist, I want to drop one SVG per frame into `assets/sprites/` and see it in
the game, so that art and code can progress separately.

#### Acceptance Criteria

1. THE Sprite_Manifest loader SHALL collect frame URLs with
   `import.meta.glob('/assets/sprites/**/*.svg', { eager: true, query: '?url', import: 'default' })`.
2. WHEN frame paths of the form `/assets/sprites/<entity>/<animation>/<NN>.svg` are given, THE
   Sprite_Manifest builder SHALL group them by entity and animation and order each animation's
   frames by frame number.
3. IF a path does not match the sprite file convention, or an animation's frame numbers do not
   run from `00` without gaps, THEN THE Sprite_Manifest builder SHALL leave that path or
   animation out and report one problem for it.
4. WHILE `assets/sprites/` holds no SVG files, THE Lane_View SHALL draw every entity from
   placeholder frames.
5. THE Placeholder_Generator SHALL generate, for every entity and animation the Lane_View uses,
   frames that share one `viewBox` per entity, put the entity's feet at the bottom centre, face
   Mobs left, use a colour and silhouette unique to the entity, show the frame number, stay under
   20 KB, and contain no scripts, external references, raster images or web fonts.
6. THE Sprite_Atlas SHALL rasterize each frame to an offscreen canvas once and SHALL draw frames
   with `drawImage`, and WHILE a frame is not rasterized yet, THE Lane_View SHALL draw a flat box
   in the entity colour in its place.
7. WHERE the Sprite_Manifest has frames for an entity and animation, THE Sprite_Atlas SHALL use
   those frames instead of the placeholder frames for that entity and animation.
8. WHEN a frame index is chosen for an animation of n frames at an age in Ticks, THE frame
   selector SHALL return `floor(age × fps / 60) mod n` for `idle`, `walk` and `use`, and the
   smaller of that unwrapped value and n − 1 for `attack`, `hit` and `die`.
9. WHEN the Lane_View chooses an Enemy animation, THE Lane_View SHALL use `hit` for 6 Ticks after
   the Enemy's last hit Tick, `attack` for 12 Ticks after a ranged Mob's last spit, `idle` for a
   stopped ranged Mob otherwise, and `walk` in every other case.

   _Note: extended by `lane-melee` Requirement 7.1 for Mobs standing at the modem._

### Requirement 14: Lane sounds

**User Story:** As a player, I want short sounds for hits, kills and bites, so that the lane is
readable while my eyes are on the browser.

#### Acceptance Criteria

1. WHEN a frame's events include a hit `hammerSwing`, a missed `hammerSwing`, `mobKilled`,
   `mobBit`, `globSpat` or a scheduled `mobSpawned`, THE Lane_View SHALL play the matching
   Lane_Sounds recipe through the Audio_Engine.
2. WHEN one frame contains several events that map to the same Lane_Sounds recipe, THE Lane_View
   SHALL play that recipe once for the frame.
3. THE Lane_Sounds SHALL be synthesized with Web Audio nodes and SHALL load no audio files.
4. WHEN the Lane_View unmounts, THE Lane_View SHALL stop every voice it started.

### Requirement 15: Kiro workflow artifacts

**User Story:** As the team, we want the mob recipe captured as a Kiro skill, so that adding the
next mob is a repeatable step and the Kiro story for judging is documented.

#### Acceptance Criteria

1. THE repository SHALL contain `.kiro/skills/add-mob/SKILL.md` with YAML front matter whose
   `name` is `add-mob` and whose `description` says when to use the skill.
2. THE `add-mob` skill SHALL list the files and steps for adding a Mob kind as they exist in the
   code after this milestone: kind union, Enemy_Stats row, behaviour, spawn entry, placeholder
   silhouette, sounds and tests.
3. THE file `docs/kiro-log.md` SHALL contain a note under "Notes" describing the connection-lane
   spec and the `add-mob` skill.
