# Requirements Document

## Introduction

The final-art feature swaps the generated placeholder sprites for the team's own SVG frames and
does a polish pass. The team draws one SVG per animation frame into `assets/sprites/`, following
the `sprites` steering file. The `art-integrator` agent wires the frames in and checks them; it
never edits the art. It is milestone 9 in `docs/roadmap.md` and follows `docs/game-design.md`
section 10.

Out of scope: drawing the art (the team does that), and desktop, icon and ad art, which stay CSS
and constant inline SVG.

## Glossary

Terms from connection-lane, lane-melee, lane-cctv, economy-weapons and zombie-sim-mcp keep their
meaning (Sprite_Manifest, Sprite_Atlas, Placeholder_Generator, entity, animation, frame,
Melee_Kind, CCTV_Feed, Data_Packet, Weapon, `validate_sprites`, Sprite_Problem). New terms:

- **Art_List**: `docs/art-list.md`, the list of every entity and animation the renderer uses, with
  its `viewBox`, frame rate, suggested frame count and a status.
- **Art_Status**: `placeholder`, `partial` or `done` for one entity and animation.
- **Art_Integrator**: the custom agent in `.kiro/agents/art-integrator.md`.
- **Animation_Table**: the data table in `src/render/` of frame rates and loop rules for each
  entity and animation.
- **Art_Budget**: 1.5 MB for all files in `assets/sprites/` together.

## Requirements

### Requirement 1: Art list

**User Story:** As an artist, I want one list of everything I need to draw, so that no frame is
forgotten.

#### Acceptance Criteria

1. THE Art_List SHALL list every entity and animation the Lane_View and the weapon cursors use,
   including the five Mobs, the Glob, the modem, the manhole, the Data_Packet and the three
   Weapons, with the `attack` animation for every Melee_Kind.
2. THE Art_List SHALL give for each entity its `viewBox`, its anchor and, for each animation, its
   frame rate from the Animation_Table and a suggested frame count.
3. THE repository SHALL contain a script that writes the Art_List from the renderer's entity and
   animation tables and the Sprite_Manifest, setting each Art_Status from the frames present.
4. THE tests SHALL fail when the Art_List does not match the script's output.

### Requirement 2: Wiring the team's frames

**User Story:** As an artist, I want my frames to show up as soon as I drop them in, so that I can
judge them in the game.

#### Acceptance Criteria

1. WHERE `assets/sprites/` has valid frames for an entity and animation, THE Sprite_Atlas SHALL
   draw those frames and no placeholder for it, as connection-lane Requirement 13.7 requires.
2. WHERE an entity and animation has no valid team frames, THE Sprite_Atlas SHALL keep drawing its
   placeholder frames.
3. IF a team frame fails to load or rasterize, THEN THE Sprite_Atlas SHALL draw the placeholder
   for that animation, log one warning naming the file, and keep the game running.
4. THE Art_Integrator SHALL change only files in `src/render/`, the Animation_Table, the Art_List
   and its reports, and SHALL NOT write to `assets/sprites/`.

### Requirement 3: Checks

**User Story:** As the team, we want broken art caught before the demo, so that the video never
shows a glitch.

#### Acceptance Criteria

1. WHEN the team adds or changes frames, THE Art_Integrator SHALL run `validate_sprites` and
   report every Sprite_Problem in `docs/playtests/` before wiring.
2. THE tests SHALL fail when any file in `assets/sprites/` breaks a rule of the `sprites` steering
   file.
3. THE files in `assets/sprites/` SHALL stay within the Art_Budget, and THE tests SHALL fail when
   they exceed it.

### Requirement 4: Polish pass

**User Story:** As a player, I want the final art to read clearly on the CCTV feed, so that the
costume looks finished.

#### Acceptance Criteria

1. THE Art_Integrator SHALL tune the Animation_Table frame rates so that walk cycles match the
   Mob speeds without sliding, and record each change in its report.
2. WHILE the CCTV_Feed grade is applied, THE team's frames for each Mob SHALL stay distinguishable
   from each other by silhouette alone, checked by the `playtester` agent with screenshots.
3. THE `playtester` agent SHALL play a full run with the final art and write a report to
   `docs/playtests/`.

### Requirement 5: Legal and docs

**User Story:** As the team, we want the art to be ours and documented, so that the entry stays
within the contest rules.

#### Acceptance Criteria

1. THE files in `assets/sprites/` SHALL be original work by the team, with no traced or copied
   logos, characters or trademarks.
2. THE README SHALL credit the team for the art.
3. THE file `docs/kiro-log.md` SHALL contain a dated note under "Notes" describing the art swap
   and the Art_Integrator's role.

## Decisions

1. **Art is drawn in colour** and graded by the CCTV_Feed, so the same frames would work if the
   grade changes.
2. **Validation runs in tests too**, not only through the MCP tool, so a broken frame fails
   `npm test` even without Kiro.
