# Requirements Document

## Introduction

The title-and-endings feature adds a front door and an exit to the game. After the player
presses the monitor's power button, a title screen appears on the CRT with an original
synthesized theme song, a "Play game" button and an "Options" button. "Play game" fades the
theme out and runs the normal BIOS → splash → desktop → dial-up flow, so the full startup is
still played every time. "Options" opens a small dialog for master volume, music on/off, sound
effects on/off and screen shake on/off. Settings persist in `localStorage` and fall back to
defaults when storage is missing or holds bad data.

When a Run ends, the desktop shows a result screen. A win shows the completed download, a
handshake chime, "Welcome to the Internet!" and the file `funny_cats_1998.avi`. A loss shows a
modem screech, static, a "Connection terminated" dialog and the frozen file
`SKELETON_DATING_SIM.EXE`. Closing the result screen leaves the player on the idle desktop, ready
to dial again. These endings follow `docs/game-design.md` section 3, chapter 7, and section 1,
step 5.

This feature changes two retro-shell rules: power-on now leads to the Title_Scene instead of the
Boot_Scene (retro-shell Requirement 1.2), and retro-shell decision 8 ("After a Run ends the
desktop returns to its idle state. Result screens come in milestone 8.") is replaced by
Requirements 8–11 here: every Run end shows the Result_Screen, and the desktop is idle again once
the player closes it. The win / lose endings move out of milestone
8 (`juice-and-endings`). Screen shake, crack and corruption overlays and audio polish stay there.

Out of scope: the browser front (milestone 4), so in real play the download cannot start yet and
only the lose ending is reachable without a test harness. Also out of scope: options reachable from
the desktop, key remapping and difficulty settings.

## Glossary

- **Shell**: the retro-shell feature: Monitor, Scenes, desktop, Dialer and audio.
- **Scene_Director**: the retro-shell component that mounts one Scene at a time and switches
  Scenes on signals.
- **Power_Off_Scene**: the dark screen shown before power-on and after shutdown.
- **Title_Scene**: the new Scene between the Power_Off_Scene and the Boot_Scene with the game
  title, the Theme_Song, the Play_Button and the Options_Button.
- **Boot_Scene**: the BIOS stage followed by the splash stage.
- **Desktop_Scene**: the desktop with icons, windows, Taskbar, Start_Menu and, during a Session,
  the Lane_Dock.
- **Play_Button**: the "Play game" button on the Title_Scene.
- **Options_Button**: the "Options" button on the Title_Scene.
- **Options_Dialog**: the modal dialog on the Title_Scene with the Volume_Slider and the Music,
  Sound effects and Screen shake checkboxes.
- **Volume_Slider**: the Options_Dialog control for Master_Volume, from 0 to 100 in steps of 10.
- **Settings**: the four player preferences: Master_Volume, Music_Enabled, Sfx_Enabled and
  Screen_Shake.
- **Master_Volume**: an integer from 0 to 100 that scales all game audio.
- **Music_Enabled**: whether the Music_Channel is audible.
- **Sfx_Enabled**: whether the Sfx_Channel is audible.
- **Screen_Shake**: whether the lane shakes after a modem hit.
- **Default_Settings**: Master_Volume 100, Music_Enabled true, Sfx_Enabled true, Screen_Shake
  true.
- **Settings_Store**: the component that holds the current Settings, reads them from and writes
  them to the Storage_Key, and notifies listeners of changes.
- **Storage_Key**: the `localStorage` key `phantom98.settings`.
- **Settings_Version**: the format version written with stored Settings, currently 1.
- **Audio_Engine**: the single Web Audio context wrapper with a master gain, mute, unlock and
  visibility handling.
- **Music_Channel**: the Audio_Engine output group for the Theme_Song.
- **Sfx_Channel**: the Audio_Engine output group for every other sound: boot, modem, lane and
  result sounds.
- **Voice**: one playing sound returned by the Audio_Engine.
- **Theme_Song**: the original looping title tune, synthesized from the Theme_Score.
- **Theme_Score**: the data table of notes (start beat, length in beats, pitch, instrument) and
  the tempo that define one pass of the Theme_Song.
- **Theme_Pass**: one play-through of the Theme_Score from its first beat to its last.
- **Fixed_Loop**: the Shell's fixed-timestep frame loop of 60 ticks per second that pauses while
  the page is hidden.
- **Session**: the host that owns one Run in the browser and reports the final state to the
  Desktop_Scene when the Run is won or lost.
- **Run**: one game-core run, created with `createRun` and advanced with `step`.
- **Final_State**: the Run state the Session reports when the Run phase becomes `won` or `lost`.
- **Outcome**: `won` when the Final_State phase is `won`, `lost` when it is `lost`.
- **Session_View**: a component a Session mounts for the length of the Run that reads state and
  sends input commands.
- **View_Prefs**: the read-only display preferences the Desktop_Scene gives every Session_View
  when a Session starts. It holds Screen_Shake.
- **Lane_View**: the connection-lane Session_View that draws the lane canvas.
- **Shake_Offset**: the pixel offset the Lane_View applies to the lane drawing after a modem hit.
- **Result_Screen**: the full-Screen overlay inside the Desktop_Scene that shows the ending for
  an Outcome.
- **Result_Script**: the data table of stage times for each Outcome's ending.
- **Back_Button**: the "Back to Desktop" button on the Result_Screen.
- **Handshake_Chime**: the synthesized win sound.
- **Modem_Screech**: the synthesized lose screech.
- **Static_Hiss**: the synthesized lose noise burst played with the static effect.
- **Copy_Modules**: the source files that hold in-game text.
- **Game_Design_Doc**: `docs/game-design.md`.
- **Roadmap_Doc**: `docs/roadmap.md`.

## Requirements

### Requirement 1: Scene flow through the title screen

**User Story:** As a player, I want a title screen after I power on and before the BIOS, so that
the game has a proper front door while the full late-90s startup still plays every time.

#### Acceptance Criteria

1. WHEN the player activates the power button while the Power_Off_Scene is mounted, THE
   Scene_Director SHALL switch to the Title_Scene.
2. WHEN the player activates the Play_Button, THE Scene_Director SHALL switch to the Boot_Scene.
3. THE Scene_Director SHALL enter the Boot_Scene only from the Title_Scene.
4. THE Scene_Director SHALL enter the Title_Scene only from the Power_Off_Scene.

   _Note: superseded by `replay-flow` Requirement 3.2; the Title_Scene can also be entered from the Desktop_Scene through the Main_Menu_Button._
5. THE Scene_Director SHALL enter the Desktop_Scene only from the Boot_Scene.
6. THE Title_Scene SHALL provide the Play_Button as the only way to leave the Title_Scene.
7. IF the Scene_Director receives a signal that does not match the mounted Scene, THEN THE
   Scene_Director SHALL keep the mounted Scene unchanged.
8. WHEN the Shutdown_Scene finishes, THE Scene_Director SHALL switch to the Power_Off_Scene, so
   that the next power-on shows the Title_Scene again.

### Requirement 2: Title screen

**User Story:** As a player, I want a spooky title card with clear buttons, so that I know what
the game is and how to start it.

#### Acceptance Criteria

1. WHEN the Title_Scene mounts, THE Title_Scene SHALL show the CRT power-on effect, the game
   title wordmark, a subtitle, the Play_Button and the Options_Button.
2. WHEN the Title_Scene mounts, THE Title_Scene SHALL move keyboard focus to the Play_Button.
3. THE Title_Scene SHALL accept activation of the Play_Button and the Options_Button by pointer
   click and by the Enter or Space key while the button has keyboard focus.
4. WHEN the player activates the Play_Button, THE Title_Scene SHALL ignore every later
   activation of the Play_Button and the Options_Button until the Title_Scene unmounts.
5. WHILE the Options_Dialog is open, THE Title_Scene SHALL ignore activation of the Play_Button.
6. WHILE the Title_Scene is mounted, THE Monitor SHALL ignore activation of the power button.

### Requirement 3: Theme song

**User Story:** As a player, I want an original creepy tune on the title screen that fades when I
start, so that the game sets its mood before the BIOS beeps.

#### Acceptance Criteria

1. WHEN the Title_Scene mounts, THE Title_Scene SHALL play the Theme_Song on the Music_Channel.
2. WHILE the Title_Scene is mounted, THE Title_Scene SHALL start the next Theme_Pass when the
   current Theme_Pass ends, measuring the pass length in Fixed_Loop ticks.
3. THE Theme_Score SHALL define one Theme_Pass that lasts between 16 and 32 seconds at the
   Theme_Score tempo.
4. WHEN the Theme_Song is played for a duration, THE Theme_Song SHALL schedule every note to start
   at or after the start of that duration and end at or before the end of that duration.
5. WHEN the player activates the Play_Button, THE Title_Scene SHALL fade the Theme_Song to silence
   over 600 ms before the Scene_Director switches to the Boot_Scene.
6. WHEN a Theme_Song fade reaches silence, THE Audio_Engine SHALL stop the Theme_Song Voice.
7. WHEN the Title_Scene unmounts without a fade in progress, THE Title_Scene SHALL stop the
   Theme_Song Voice.
8. THE Shell SHALL synthesize the Theme_Song with the Web Audio API and load no audio files.
9. IF the Audio_Engine is unavailable, THEN THE Title_Scene SHALL show the title screen and accept
   the Play_Button and the Options_Button without sound.

### Requirement 4: Options dialog

**User Story:** As a player, I want to set volume, music, sound effects and screen shake before I
play, so that the game fits my ears and my stomach.

#### Acceptance Criteria

1. WHEN the player activates the Options_Button, THE Title_Scene SHALL open the Options_Dialog
   with the Volume_Slider, its value as a percentage, and checkboxes for Music, Sound effects and
   Screen shake, each showing the current Settings.
2. WHEN the Options_Dialog opens, THE Options_Dialog SHALL move keyboard focus to the
   Volume_Slider.
3. WHEN the player changes the Volume_Slider, THE Settings_Store SHALL set Master_Volume to the
   slider value, and THE Options_Dialog SHALL show the new percentage.
4. WHEN the player toggles the Music, Sound effects or Screen shake checkbox, THE Settings_Store
   SHALL set Music_Enabled, Sfx_Enabled or Screen_Shake to the checkbox state.
5. WHEN the Settings_Store changes Master_Volume, Music_Enabled or Sfx_Enabled, THE Shell SHALL
   apply the new value to the Audio_Engine within the same input event.
6. WHEN the player activates OK, presses Escape, or activates the close button while the
   Options_Dialog is open, THE Title_Scene SHALL close the Options_Dialog and move keyboard focus
   to the Options_Button.
7. WHILE the Options_Dialog is open, THE Title_Scene SHALL keep playing the Theme_Song.

### Requirement 5: Settings persistence and fail-safe loading

**User Story:** As a player, I want my settings remembered between visits, so that I set them
once, and I want the game to start normally even if my browser blocks storage.

#### Acceptance Criteria

1. WHEN the Settings_Store is created, THE Settings_Store SHALL load the Settings from the value
   stored under the Storage_Key.
2. WHEN the Settings_Store changes a setting, THE Settings_Store SHALL write the serialized
   Settings with the Settings_Version to the Storage_Key.
3. FOR ALL valid Settings, serializing then parsing SHALL produce Settings equal to the original
   (round-trip property).
4. IF no value is stored under the Storage_Key, THEN THE Settings_Store SHALL use the
   Default_Settings.
5. IF the stored value is not valid JSON, is not a JSON object, or has a Settings_Version other
   than 1, THEN THE Settings_Store SHALL use the Default_Settings.
6. IF a stored field is missing or has the wrong type, THEN THE Settings_Store SHALL use the
   Default_Settings value for that field and keep every valid stored field.
7. WHEN the Settings_Store reads a numeric Master_Volume, THE Settings_Store SHALL round the value
   to the nearest integer and clamp the result to the range 0 to 100.
8. IF a Master_Volume value is not a finite number, THEN THE Settings_Store SHALL use the
   Default_Settings Master_Volume.
9. IF `localStorage` is missing or throws on access or on read, THEN THE Settings_Store SHALL use
   the Default_Settings and keep later changes in memory for the life of the page.
10. IF writing to `localStorage` throws, THEN THE Settings_Store SHALL keep the new Settings in
    memory and continue without an error reaching the player.
11. WHEN the page loads, THE Shell SHALL apply the loaded Settings to the Audio_Engine before the
    Scene_Director mounts the first Scene.

### Requirement 6: Audio channels, volume and fades

**User Story:** As a developer, I want the Audio_Engine to know music from sound effects and to
fade a sound out, so that the options and the theme fade work without each scene doing its own
mixing.

#### Acceptance Criteria

1. WHEN a caller plays a sound, THE Audio_Engine SHALL route the sound to the Music_Channel or the
   Sfx_Channel chosen by the caller, using the Sfx_Channel when the caller chooses none.
2. WHILE the Audio_Engine is not muted, THE Audio_Engine SHALL set the master gain to the master
   level times Master_Volume divided by 100.
3. WHILE the Audio_Engine is muted, THE Audio_Engine SHALL set the master gain to 0.
4. THE Audio_Engine SHALL set the Music_Channel gain to 1 when Music_Enabled is true and to 0
   when Music_Enabled is false.
5. THE Audio_Engine SHALL set the Sfx_Channel gain to 1 when Sfx_Enabled is true and to 0 when
   Sfx_Enabled is false.
6. WHEN the Audio_Engine unlocks, THE Audio_Engine SHALL apply the Master_Volume, Music_Enabled
   and Sfx_Enabled values it received before unlocking.
7. WHEN a caller asks a Voice to fade out over a duration, THE Audio_Engine SHALL ramp that
   Voice's gain linearly to 0 over the duration and stop the Voice when the duration has passed.
8. WHEN a caller stops a Voice that is fading out, THE Audio_Engine SHALL stop the Voice at once.
9. WHEN the Audio_Engine unmounts, THE Audio_Engine SHALL cancel every pending fade and stop
   every Voice.

### Requirement 7: Screen shake option

**User Story:** As a player who gets motion sick, I want to turn screen shake off, so that modem
hits stay readable without the lane jumping.

#### Acceptance Criteria

1. WHEN a Session starts, THE Desktop_Scene SHALL give every Session_View View_Prefs holding the
   current Screen_Shake setting.
2. WHILE View_Prefs Screen_Shake is false, THE Lane_View SHALL draw the lane with a Shake_Offset
   of zero on both axes.
3. WHILE View_Prefs Screen_Shake is true, THE Lane_View SHALL draw the lane with the Shake_Offset
   from the connection-lane shake rule.
4. THE Session SHALL produce the same states and events for the same seed and the same
   tick-aligned input commands for either Screen_Shake value.

### Requirement 8: Result screen on run end

**User Story:** As a player, I want a clear ending screen when the run is over, so that I know
whether the line held and can go again.

#### Acceptance Criteria

1. WHEN the Session reports the Final_State to the Desktop_Scene, THE Desktop_Scene SHALL end the
   Session and show the Result_Screen for the Outcome over the whole Screen.
2. THE Result_Screen SHALL take the Outcome only from the Final_State phase.
3. WHILE the Result_Screen is shown, THE Result_Screen SHALL capture all pointer input on the
   Screen, so that desktop icons, windows, the Taskbar and the Start_Menu receive none.
4. WHILE the Result_Screen is shown, THE Desktop_Scene SHALL start no Session.
5. THE Result_Screen SHALL measure elapsed time in Fixed_Loop ticks, so that a hidden page holds
   the ending timeline.
6. THE Result_Screen SHALL show the Final_State time since dialing started as minutes and
   seconds, the modem integrity left as a percentage of the maximum integrity, and the download
   progress as a whole percentage from 0 to 100.

### Requirement 9: Win ending

**User Story:** As a player who finished the download, I want the full "you made it" moment, so
that winning feels like getting online in 1998.

#### Acceptance Criteria

1. WHEN the Result_Screen opens for the `won` Outcome, THE Result_Screen SHALL show a
   "Download complete" dialog with a full download bar at 100% and play the Handshake_Chime.
2. WHEN the `won` Result_Screen has been open for the win reveal time in the Result_Script, THE
   Result_Screen SHALL show the headline "Welcome to the Internet!", the revealed file
   `funny_cats_1998.avi`, the run statistics and the Back_Button.
3. THE Result_Script SHALL set the win reveal time to 1,200 ms.

### Requirement 10: Lose ending

**User Story:** As a player whose modem died, I want the connection to fail loudly and then show
what I lost, so that losing is funny instead of flat.

#### Acceptance Criteria

1. WHEN the Result_Screen opens for the `lost` Outcome, THE Result_Screen SHALL play the
   Modem_Screech and the Static_Hiss and show a static noise effect over the Screen.
2. WHEN the `lost` Result_Screen has been open for the lose reveal time in the Result_Script, THE
   Result_Screen SHALL end the static effect and show a "Connection terminated" dialog with the
   text "The connection was terminated by the remote computer.", a download bar frozen at the
   Final_State download percentage, the frozen file `SKELETON_DATING_SIM.EXE`, the run statistics
   and the Back_Button.
3. THE Result_Script SHALL set the lose reveal time to 1,500 ms.

### Requirement 11: Returning to the desktop

_Note: superseded by `replay-flow` Requirements 1–3; the Back_Button is replaced by the Retry_Button and the Main_Menu_Button._

**User Story:** As a player, I want to close the ending and land on the desktop, so that I can
dial up again without rebooting.

#### Acceptance Criteria

1. WHEN the Back_Button appears, THE Result_Screen SHALL move keyboard focus to the Back_Button.
2. WHEN the player activates the Back_Button, THE Desktop_Scene SHALL close the Result_Screen and
   stop every Result_Screen sound.
3. WHEN the Result_Screen closes, THE Desktop_Scene SHALL show the idle desktop with the Dialer
   able to start a new Session.
4. WHEN the Desktop_Scene unmounts while the Result_Screen is shown, THE Result_Screen SHALL stop
   its Fixed_Loop, stop its sounds and remove its elements.

### Requirement 12: Lifecycle, safe DOM, copy and art rules

**User Story:** As a developer, I want the new screens to follow the same rules as the rest of
the shell, so that replays don't leak and the entry stays within the contest rules.

#### Acceptance Criteria

1. THE Title_Scene, the Options_Dialog and the Result_Screen SHALL each provide a `mount()` and an
   `unmount()` operation.
2. WHEN the Title_Scene, the Options_Dialog or the Result_Screen unmounts, THE unmounting
   component SHALL remove its listeners on `document` and `window`, stop its Fixed_Loop and
   timers, stop its sounds except a Voice that is fading out, and remove its elements.
3. THE Shell SHALL build the new screens with the `h()` helper and set all their text through
   text nodes or `textContent`.
4. THE Shell SHALL keep the text of the Title_Scene, the Options_Dialog and the Result_Screen in
   Copy_Modules that use only invented product, company and brand names and follow the
   `retro-copy` steering file.
5. THE Shell SHALL draw the new screens with CSS that reads its colours from the custom
   properties in `src/styles/theme.css`.
6. THE Shell SHALL synthesize the Handshake_Chime, the Modem_Screech and the Static_Hiss with the
   Web Audio API and load no audio files.

### Requirement 13: Design and roadmap documents

**User Story:** As a team member, I want the design doc and roadmap to describe the title screen,
options and endings, so that the source of truth matches the game.

#### Acceptance Criteria

1. THE Game_Design_Doc SHALL list the Title_Scene with the Theme_Song, the Play_Button and the
   Options_Button between power-on and the BIOS in section 1.
2. THE Game_Design_Doc SHALL record in section 9 the reasons for placing the title screen before
   the BIOS and for storing Settings in `localStorage` with a fail-safe fallback.
3. THE Roadmap_Doc SHALL list `title-and-endings` as a milestone with its contents and Kiro
   features.
4. THE Roadmap_Doc SHALL list the win and lose endings only under `title-and-endings`, and keep
   screen shake, crack and corruption overlays and audio polish under `juice-and-endings`.

## Decisions

Assumptions made while writing these requirements. Each one is a constant, a copy string or a
small rule, so it is cheap to change.

1. **Game title:** the title wordmark reads "PANIIIC" (the game is called Paniiic)
   with the subtitle "a Phantom 98 nightmare".
2. **Result screen is an overlay, not a Scene.** It mounts inside the Desktop_Scene. This keeps
   "the desktop is entered only from the boot" and leaves the desktop's windows and icons as they
   were, so "back to the desktop" needs no reboot.
3. **Options live only on the Title_Scene.** Screen_Shake is read once when a Session starts.
   To change settings the player shuts down and powers on again. An "Options..." Start_Menu item
   could come later.
4. **Tray speaker mute stays separate** from the Settings and is not saved. It mutes everything
   on top of the Settings, as it does today.
5. **Volume:** 0–100 in steps of 10 on the slider. The default is 100, which matches today's
   loudness exactly.
6. **Storage:** key `phantom98.settings`, JSON with a `v: 1` field. Any other version falls back
   to the defaults until a migration is written.
7. **Theme fade:** 600 ms. The Boot_Scene's CRT thunk plays over the tail of the fade.
8. **Retro-shell changes:** retro-shell Requirement 1.2 (power-on → Boot_Scene) becomes
   Requirement 1.1 here (power-on → Title_Scene), and retro-shell decision 8 ("After a Run ends
   the desktop returns to its idle state") is superseded: the Result_Screen is on by default in
   the Desktop_Scene, and the idle desktop comes after the player closes it (Requirement 11.3).
   The existing scene-director and shell-flow tests are updated for the new transition. Two
   existing desktop tests, "ends the Session when a registry system deals 100 damage at tick 5"
   and "can start a new Session after one ends" in `tests/scenes/desktop/desktopScene.test.ts`,
   gain a step in their setup that closes the Result_Screen with the Back_Button before they
   shut down or reconnect; their assertions are unchanged. No other retro-shell assertion
   changes.
9. **Win in real play:** until the browser front (milestone 4) sends `startDownload`, a real Run
   can only be lost. Automated tests reach the win ending with a test Session_View that sends
   `startDownload`.
10. **Design doc conflict:** `docs/game-design.md` section 1 step 1 reads "Power on → BIOS →
    splash → desktop". Requirement 13 changes it to include the title screen. The team must
    approve that edit before the documentation task runs.
