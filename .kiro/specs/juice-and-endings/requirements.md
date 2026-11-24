# Requirements Document

## Introduction

The juice-and-endings feature makes the run feel dangerous across both screens. It adds screen
shake on both fronts, crack and corruption overlays as the modem fails, stronger hit and kill
feedback, the boss's rise, audio polish and short transitions into the result screen. It is
milestone 8 in `docs/roadmap.md` and follows `docs/game-design.md` sections 3, 8 and 10.

The win and lose result screens themselves live in `title-and-endings` and `replay-flow`. The
lane's camera effects (static, signal loss) live in `lane-cctv`. This feature only reads the Run
state and events and changes no game rule.

Out of scope: final art (`final-art`) and new mechanics.

## Glossary

Terms from the earlier specs keep their meaning (Run, Tick, Session, Session_View, Screen,
Desktop_Area, Lane_Dock, Lane_View, Browser_View, NetSurfer_Window, Real_Link, Result_Screen,
CCTV_Feed, Flash, Screen_Shake, View_Prefs, Audio_Engine, Sfx_Channel, Music_Channel, Chapter,
`integrityCritical`, `modemHit`, `chapterStarted`). New terms:

- **Juice_View**: the Session_View that draws the Screen_Overlays and the Screen_Shake of both
  fronts.
- **Screen_Shake_Offset**: the pixel offset applied to the whole Screen content after a modem hit.
- **Crack_Overlay**: SVG cracks across the Screen glass that grow as integrity falls.
- **Crack_Stage**: one of 3 crack levels, shown at integrity 20, 10 and 5 or below.
- **Corruption_Overlay**: glitch blocks, colour bleed and garbled text on the browser front.
- **Screen_Overlays**: the Crack_Overlay and the Corruption_Overlay.
- **Kill_Pop**: a short burst drawn where an Enemy dies.
- **Boss_Rumble**: the manhole shaking and a low rumble in the 3 s before the boss spawns.
- **End_Transition**: the short moment between the last Tick of a Run and the Result_Screen.
- **Chapter_Sting**: the one short synthesized sting played when Midpoint, Pinch 2 or Plot turn 2
  starts.
- **Voice_Cap**: the most sound effect voices that play at once.

## Requirements

### Requirement 1: Screen shake on both fronts

**User Story:** As a player, I want big hits to shake the whole computer, so that the danger is
felt on the browser too.

#### Acceptance Criteria

1. WHEN a frame's events include `modemHit` and View_Prefs Screen_Shake is true, THE Juice_View
   SHALL shake the Screen content for 12 Ticks with a Screen_Shake_Offset of at most 2 pixels for
   a hit below 10 damage and at most 4 pixels for 10 or more.
2. WHILE integrity is at or below the critical integrity, THE Juice_View SHALL use a maximum
   Screen_Shake_Offset of 3 pixels for a hit below 10 damage and 5 pixels for 10 or more, the
   criterion 1 limits raised by 1 pixel.
3. WHILE View_Prefs Screen_Shake is false, THE Juice_View SHALL apply no Screen_Shake_Offset.
4. THE Juice_View SHALL convert pointer input with the Monitor's `toScreenPoint` as before, so
   that clicks during a shake land on what the player sees.

### Requirement 2: Crack overlay

**User Story:** As a player, I want the screen glass to crack as the modem dies, so that I can
feel how close I am to losing.

#### Acceptance Criteria

1. WHEN integrity first falls to or below 20, 10 and 5 in a Run, THE Juice_View SHALL show Crack
   Stages 1, 2 and 3 with a glass-crack sound, each Crack_Stage adding cracks to the ones before
   it so the glass looks more broken at each stage.
2. THE Crack_Overlay SHALL stay until the Session ends, and SHALL NOT capture pointer input.
3. THE Crack_Overlay SHALL leave the Real_Link and the centre half of the Lane_Dock readable at
   every Crack_Stage.
4. WHEN one hit takes integrity past several crack thresholds at once, THE Juice_View SHALL show
   the highest Crack_Stage reached and play the glass-crack sound once.

### Requirement 3: Corruption overlay

**User Story:** As a player, I want the browser to glitch late in the run, so that pinch 2 and
plot turn 2 feel like the system is breaking.

#### Acceptance Criteria

1. WHEN `chapterStarted` arrives for Pinch 2, THE Juice_View SHALL start a faint
   Corruption_Overlay over the NetSurfer_Window.
2. WHILE integrity is at or below the critical integrity, THE Juice_View SHALL show the
   Corruption_Overlay at its strongest level over both fronts.
3. THE Corruption_Overlay SHALL be drawn above the browser front, including every Ad_Control and
   the Real_Link, SHALL NOT capture pointer input, so every click reaches the control beneath it,
   and SHALL NOT hide any Ad_Control or the Real_Link for more than 150 ms at a time.

### Requirement 4: Hit and kill feedback

**User Story:** As a player, I want every hit and kill to pop, so that the lane feels good to
play.

#### Acceptance Criteria

1. WHEN a frame's events include `mobHit`, THE Lane_View SHALL draw the Enemy with a white hit
   flash for 4 Ticks.
2. WHEN a frame's events include `mobKilled`, THE Lane_View SHALL draw a Kill_Pop at the kill
   position for 18 Ticks.
3. WHEN a frame's events include `packetCollected`, THE Lane_View SHALL draw a "+N KB" label
   rising from the packet for 30 Ticks.
4. THE Lane_View SHALL draw this feedback within the CCTV_Feed rules of lane-cctv.

### Requirement 5: Boss rise

**User Story:** As a player, I want the boss to announce itself, so that plot turn 2 starts with a
moment I remember.

#### Acceptance Criteria

1. WHILE the Run Tick is within 3 s before the boss spawn time in the Chapter_Table, THE Lane_View
   SHALL draw the Boss_Rumble: the manhole cover shaking and dust rising.
2. WHILE the Boss_Rumble lasts, THE Lane_View SHALL play a low synthesized rumble.
3. WHEN a frame's events include a `mobSpawned` event for a boss Mob, THE Lane_View SHALL play the
   boss roar once for each such event.

### Requirement 6: Audio polish

**User Story:** As a player, I want the run to sound full but never clipped, so that the chaos is
fun to listen to.

#### Acceptance Criteria

1. WHEN a Mob spawns, THE Lane_View SHALL play a groan picked for its kind, at most once per frame.
2. WHILE integrity is at or below the critical integrity, THE Juice_View SHALL play a looping
   modem alarm on the Sfx_Channel.
3. WHEN `chapterStarted` arrives for Midpoint, Pinch 2 or Plot turn 2, THE Juice_View SHALL play
   the Chapter_Sting, one short synthesized sound shared by all three chapters.
4. THE Audio_Engine SHALL cap sound effect voices at the Voice_Cap and drop the oldest voice when a
   new one would exceed it.
5. THE Audio_Engine SHALL pass the master output through a limiter so that many sounds at once do
   not clip.
6. THE new sounds SHALL be synthesized with Web Audio nodes and SHALL load no audio files.

### Requirement 7: End transitions

**User Story:** As a player, I want the run to end with a beat, so that the result screen doesn't
just pop in.

#### Acceptance Criteria

1. WHEN the Run phase becomes `lost`, THE Lane_View SHALL show the CCTV_Feed cutting to "NO
   SIGNAL" for 30 Ticks before the Result_Screen opens.
2. WHEN the Run phase becomes `won`, THE Juice_View SHALL clear the Screen_Overlays over 30 Ticks
   before the Result_Screen opens.
3. THE End_Transition SHALL run no Run Ticks and SHALL NOT change the Final_State.

### Requirement 8: Comfort and performance

**User Story:** As a player, I want effects that are safe and smooth, so that anyone can play the
whole run.

#### Acceptance Criteria

1. THE Juice_View, the Lane_View and the Browser_View together SHALL show at most 3 Flashes in any
   one-second window.
2. WHILE View_Prefs Screen_Shake is false, THE Juice_View SHALL show the Screen_Overlays without
   motion.
3. THE Screen_Overlays SHALL be drawn with CSS and constant inline SVG, with no per-pixel canvas
   work per frame.
4. THE `playtester` agent SHALL play a full run and report the frame rate during Plot turn 2 in
   `docs/playtests/`.

### Requirement 9: Lifecycle and docs

**User Story:** As a developer, I want the effects to clean up, so that replays start clean.

#### Acceptance Criteria

1. WHEN the Juice_View unmounts, THE Juice_View SHALL remove every overlay, stop every sound and
   clear every Screen_Shake_Offset.
2. THE Session SHALL produce the same states and events with or without the Juice_View.
3. THE file `docs/kiro-log.md` SHALL contain a dated note under "Notes" describing this spec.

## Decisions

1. **Name kept.** The milestone keeps the name `juice-and-endings` from the roadmap, although the
   result screens moved to `title-and-endings`. This spec owns the transitions into them.
2. **Lane shake and screen shake** both exist. The lane shake of connection-lane stays inside the
   lane canvas; the Screen_Shake_Offset moves everything a little.
