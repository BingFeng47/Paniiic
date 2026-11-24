# Requirements Document

## Introduction

The lane-cctv feature makes the connection lane look like a night-time security camera feed
watching the phone line. The camera adds an on-screen display (camera label, blinking REC dot,
timestamp), scanlines, grain and a vignette. It breaks up with static when the modem is hit,
loses signal when the modem is critical, and draws "MOTION" boxes around new zombies. It is
milestone 3d in `docs/roadmap.md` and follows `docs/game-design.md` sections 2, 8 and 10.

This feature only changes how the lane is drawn and heard. It changes no game rule, state or
event, so the same seed and inputs give the same Run with or without it. Clicks must land
exactly where they did before: no camera effect may move what the player aims at.

Out of scope: the corruption and crack overlays across both screens (`juice-and-endings`), the
KB counter and shop tray (`economy-weapons`, which reuse the OSD style defined here) and the
team's final art (`final-art`).

## Glossary

Terms from connection-lane and title-and-endings keep their meaning (Lane_View, Lane_Dock,
Lane_HUD, Lane_Layout, Lane_Sounds, Hit_Padding, Sprite_Atlas, Audio_Engine, Sfx_Channel,
View_Prefs, Screen_Shake, Session, Run, Tick). New terms:

- **CCTV_Feed**: the lane picture as the camera shows it: the lane drawing with the Camera_Grade
  and the Camera_Overlay on top.
- **Camera_Grade**: the colour treatment of the lane drawing: dark, low-saturation green-grey,
  like a night camera.
- **Camera_Overlay**: the layer above the lane drawing with scanlines, Grain and a vignette.
- **Grain**: moving noise drawn from Noise_Tiles.
- **Noise_Tile**: a small pre-rendered canvas of random noise made once when the Lane_View
  mounts.
- **OSD**: the camera's on-screen display: the Camera_Label, the REC_Indicator, the
  Camera_Timestamp and the Lane_HUD.
- **Camera_Label**: the text "CAM 01  LINE TAP" in the top-left corner of the feed.
- **REC_Indicator**: a red dot and "REC" in the top-right corner of the feed.
- **Camera_Timestamp**: a date and clock in the bottom-left corner of the feed, counted in Run
  Ticks from 11:59:00 PM.
- **Feed_Startup**: the short static and "CONNECTING CAMERA..." text shown when the Lane_View
  mounts.
- **Signal_Tear**: a short burst of static bands over the feed after a modem hit.
- **Signal_Dropout**: a very short loss of picture while integrity is critical, shown as noise
  and the text "SIGNAL WEAK".
- **Motion_Box**: a thin rectangle with the label "MOTION" drawn around a newly spawned Mob.
- **Camera_Hum**: a quiet synthesized mains hum played while the CCTV_Feed is shown.
- **Camera_Static**: a short synthesized crackle played with a Signal_Tear.
- **Flash**: a change of the feed's average brightness by more than 10% of full scale within one
  frame.
- **Copy_Module**: a source file that holds in-game text.

## Requirements

### Requirement 1: Camera picture

**User Story:** As a player, I want the lane to look like a security camera on the phone line,
so that the lane fits the late-90s horror costume.

#### Acceptance Criteria

1. WHILE a Session is active, THE Lane_View SHALL draw the lane with the Camera_Grade and SHALL
   draw the Camera_Overlay above the lane drawing.
2. THE Camera_Overlay SHALL show scanlines, a vignette that darkens the corners, and Grain that
   changes at least 15 times per second.
3. THE Lane_View SHALL draw the Grain from at most 4 Noise_Tiles made when the Lane_View mounts,
   and SHALL do no per-pixel work on the full canvas in a frame.
4. THE Lane_View SHALL draw the hammer cursor and every later weapon cursor above the
   Camera_Overlay, without the Camera_Grade, so that the player's own pointer reads as outside
   the camera.
5. WHILE the Camera_Grade is applied, THE Lane_View SHALL keep every Enemy and the frame numbers
   of placeholder sprites readable against the lane background.

### Requirement 2: On-screen display

**User Story:** As a player, I want camera text on the feed and the modem health in the same
style, so that the HUD looks like part of the camera.

#### Acceptance Criteria

1. WHILE a Session is active, THE Lane_View SHALL show the Camera_Label, the REC_Indicator and
   the Camera_Timestamp over the feed.
2. WHILE a Session is active, THE REC_Indicator SHALL blink once per second, measured in Run
   Ticks.
3. WHEN the Lane_View receives a state, THE Camera_Timestamp SHALL show 11:59:00 PM plus the Run
   Tick divided by 60, rounded down to whole seconds, in the form `11-23-98 11:59:07 PM`, and
   SHALL roll over to `11-24-98 12:00:00 AM` at midnight.
4. THE Lane_HUD SHALL use the OSD style: a monospace font, light text with a dark outline, and
   the integrity bar as a segmented camera meter labelled "MODEM".
5. WHILE integrity is at or below the critical integrity, THE Lane_HUD SHALL keep the critical
   style and critical note of connection-lane Requirement 12.3 in the OSD style.
6. THE Lane_View SHALL take every OSD string from a Copy_Module that follows the `retro-copy`
   steering file, and SHALL set DOM text only through `textContent`.

### Requirement 3: Feed startup

**User Story:** As a player, I want the camera to switch on when I start dialing, so that the
raid begins like a feed coming online.

#### Acceptance Criteria

1. WHEN the Lane_View mounts, THE Lane_View SHALL show the Feed_Startup for 36 Ticks and then
   show the CCTV_Feed.
2. WHILE the Feed_Startup is shown, THE Lane_View SHALL still turn pointer presses into
   Hammer_Commands.
3. WHEN the Feed_Startup starts, THE Lane_View SHALL play the Camera_Static once.

### Requirement 4: Static on modem hits

**User Story:** As a player, I want the feed to break up when the modem is hit, so that every hit
is readable even when I am looking at the browser.

#### Acceptance Criteria

1. WHEN a frame's events include `modemHit`, THE Lane_View SHALL show a Signal_Tear for 10 Ticks
   and play the Camera_Static once for that frame.
2. THE Signal_Tear SHALL draw static bands over the feed and SHALL NOT move the lane drawing.
3. WHEN a new `modemHit` arrives during a Signal_Tear, THE Lane_View SHALL restart the
   Signal_Tear's 10 Ticks.

### Requirement 5: Signal loss at critical integrity

**User Story:** As a player, I want the camera to struggle when the modem is dying, so that the
danger is felt on the lane itself.

#### Acceptance Criteria

1. WHILE integrity is at or below the critical integrity, THE Lane_View SHALL show a
   Signal_Dropout at most once every 120 Ticks.
2. THE Lane_View SHALL make each Signal_Dropout last at most 9 Ticks (150 ms).
3. WHILE a Signal_Dropout is shown, THE Lane_View SHALL keep turning pointer presses into
   Hammer_Commands.
4. THE Lane_View SHALL choose Signal_Dropout times without changing the Run, so that the Run
   is the same with or without dropouts.

### Requirement 6: Motion boxes

**User Story:** As a new player, I want the camera to point out each zombie as it appears, so
that I notice the lane even while the dial-up dialog is open.

#### Acceptance Criteria

1. WHEN a frame's events include `mobSpawned`, THE Lane_View SHALL draw a Motion_Box around that
   Mob's Hit_Box for 60 Ticks, following the Mob as it moves.
2. WHEN the Mob of a Motion_Box leaves the Lane, THE Lane_View SHALL stop drawing that
   Motion_Box.
3. THE Lane_View SHALL draw Motion_Boxes as part of the OSD, above the Camera_Grade.

### Requirement 7: Aim and pointer safety

**User Story:** As a player, I want my clicks to land where I see the zombie, so that the camera
look never costs me a hit.

#### Acceptance Criteria

1. THE Lane_View SHALL keep the Lane_Layout mapping of connection-lane Requirement 10 unchanged,
   with no geometric distortion of the lane drawing.
2. THE Lane_View SHALL draw every Enemy within the screen-shake offset of connection-lane
   Requirement 11.7 plus the Attacker offset of lane-melee Requirement 7.2 from its Lane_Layout
   position, whatever camera effect is shown.
3. THE Camera_Overlay, the OSD text and the Motion_Boxes SHALL NOT capture pointer input.
4. THE Session SHALL produce the same states and events for the same seed and the same
   tick-aligned input commands with or without the CCTV_Feed.

### Requirement 8: Flash and motion comfort

**User Story:** As a player who is sensitive to flashing or motion, I want the camera effects to
stay gentle, so that I can play safely.

#### Acceptance Criteria

1. THE Lane_View SHALL show at most 3 Flashes in any one-second window.
2. WHILE View_Prefs Screen_Shake is false, THE Lane_View SHALL draw Signal_Tears and
   Signal_Dropouts as static only, with no jitter of the OSD text.
3. THE Lane_View SHALL keep the REC_Indicator blink and the Grain below the Flash threshold.

### Requirement 9: Camera sounds

**User Story:** As a player, I want the feed to hum and crackle, so that the camera sounds as
real as it looks.

#### Acceptance Criteria

1. WHILE the CCTV_Feed is shown, THE Lane_View SHALL play the Camera_Hum on the Sfx_Channel at a
   level below the lane hit sounds.
2. WHEN the Lane_View unmounts, THE Lane_View SHALL stop the Camera_Hum and every Camera_Static
   voice it started.
3. THE Camera_Hum and the Camera_Static SHALL be synthesized with Web Audio nodes and SHALL load
   no audio files.

### Requirement 10: Fallbacks and lifecycle

**User Story:** As a developer, I want the camera layer to fail safe and clean up, so that a
missing canvas or a replay never breaks the lane.

#### Acceptance Criteria

1. IF the canvas has no 2D context, THEN THE Lane_View SHALL keep the OSD DOM text and the
   Lane_HUD working and skip the camera drawing without throwing.
2. WHEN the Lane_View unmounts, THE Lane_View SHALL release its Noise_Tiles and remove every
   element and listener it added.
3. THE Lane_View SHALL keep the camera tuning (grade colours, grain rate, tear length, dropout
   spacing, motion box length) in one data table in `src/render/`.

## Decisions

1. **Monochrome green-grey grade** is an assumption, cheap to change in the tuning table. The
   team's final art is drawn in colour and graded by the feed.
2. **Timestamp starts at 11:59:00 PM on 11-23-98.** The tray clock is stuck at 11:59 PM, but the
   camera keeps time and passes midnight about one minute into the run: a quiet horror leak.
3. **No barrel distortion.** A curved CRT look would move where clicks land, so the feed stays
   flat. The Monitor's scanlines from retro-shell still sit above everything.
4. **Weapon cursors stay ungraded** so the player's tools read as "in the room", not on camera.
