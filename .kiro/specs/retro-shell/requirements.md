# Requirements Document

## Introduction

The retro-shell feature is everything the player sees from the power button to the moment the
modem connects: a CRT monitor, the BIOS screen, the "Phantom 98" splash, a late-1990s desktop
with icons, windows, a taskbar and a start menu, and the dial-up dialog with synthesized modem
audio. It is milestone 2 in `docs/roadmap.md`.

The dial-up dialog starts a game-core run and shows its `dialing` and `connected` states. The
20-second dial duration stays in game-core's balance config: the dialog reads the run's phase,
tick and balance and never keeps its own timer. The connection lane (milestone 3) and the
browser front (milestone 4) are out of scope. This feature leaves a session host that they plug
into: a lane dock under the desktop area and a window manager for browser windows.

The design source of truth is `docs/game-design.md`. In-game text follows the `retro-copy`
steering file and uses only invented names.

## Glossary

- **Shell**: the whole retro-shell feature: monitor, scenes, desktop, dialer and audio.
- **Monitor**: the persistent CRT bezel with a power button and power LED that frames the Screen.
- **Screen**: the logical 1024 × 768 pixel display area inside the Monitor where scenes draw.
- **Scene**: one full-screen mode of the Shell with `mount()` and `unmount()`. The scenes are
  Power_Off_Scene, Boot_Scene, Desktop_Scene and Shutdown_Scene.
- **Scene_Director**: the component that mounts exactly one Scene at a time and switches Scenes
  on signals.
- **Power_Off_Scene**: the dark screen shown before power-on and after shutdown.
- **Boot_Scene**: the BIOS stage followed by the splash stage.
- **Boot_Script**: the data table of BIOS lines, sound cues and stage times used by the
  Boot_Scene.
- **Desktop_Scene**: the desktop with wallpaper, Desktop_Icons, Window_Manager, Taskbar,
  Start_Menu and, during a Session, the Lane_Dock.
- **Shutdown_Scene**: the shutdown messages and CRT power-off effect.
- **Desktop_Area**: the part of the Screen above the Taskbar, and above the Lane_Dock while a
  Session is active, where windows and icons live.
- **Desktop_Icon**: a labelled icon on the wallpaper that opens an App.
- **App**: something a Desktop_Icon or Start_Menu item opens: the Dialer, the README window or
  the Wastebasket window.
- **Window_Manager**: the component that opens, closes, stacks, focuses, minimizes and moves
  windows in the Desktop_Area.
- **Focused_Window**: the single window that receives the active title bar style.
- **Taskbar**: the bar at the bottom of the Screen with the Start button, window buttons and the
  Tray.
- **Tray**: the right end of the Taskbar with the modem indicator, the speaker toggle and the
  clock.
- **Start_Menu**: the menu that opens from the Start button.
- **Dialer**: the "Connect To" App. It starts a Session and shows dial progress.
- **Run**: one game-core run, created with `createRun` and advanced with `step`.
- **Tick**: one game-core simulation step of 1/60 second.
- **Session**: the host that owns one Run in the browser: it drives `step` from the fixed loop,
  queues input commands and passes state and events to Session_Views.
- **Session_View**: a component that a Session mounts for the length of the Run, reads state and
  events, and changes the Run only by sending input commands. The Dialer is the first one; the
  lane and browser front add more later.
- **Session_Registry**: the module where later features list their Session_Views and game-core
  systems.
- **Lane_Dock**: the panel between the Desktop_Area and the Taskbar where the connection lane
  mounts during a Session.
- **Dial_Stage**: one step of the dial sequence (initializing, dialing, ringing, negotiating,
  verifying, logging on), plus the end states connected and terminated.
- **Dial_Script**: the data table of Dial_Stages, each with its share of the dial duration, its
  status text and its sound.
- **Dial_Fraction**: ticks elapsed in the `dialing` phase divided by the dial duration in ticks
  from the Run's balance.
- **Audio_Engine**: the single Web Audio context wrapper with a master gain, mute, unlock and
  visibility handling.
- **Modem_Sounds**: the synthesized dial tone, DTMF digits, ringback, handshake and relay click.
- **Boot_Sounds**: the synthesized CRT power-on thunk, POST beep, disk seek clicks and startup
  chime.
- **h_Helper**: the `h()` function that builds DOM elements.
- **Copy_Modules**: the source files that hold the Shell's in-game text.

## Requirements

### Requirement 1: Scene flow without skipping

**User Story:** As a player, I want every run to start from the power button and go through the
boot and the desktop, so that the late-90s ritual sets the mood before the zombies arrive.

#### Acceptance Criteria

1. WHEN the page loads, THE Scene_Director SHALL mount the Power_Off_Scene.
2. WHEN the player activates the power button while the Power_Off_Scene is mounted, THE
   Scene_Director SHALL switch to the Boot_Scene.

   _Note: superseded by `title-and-endings` Requirement 1.1; power-on now leads to the Title_Scene, and the Play_Button leads to the Boot_Scene._
3. WHEN the Boot_Scene finishes its splash stage, THE Scene_Director SHALL switch to the
   Desktop_Scene.
4. WHEN the player chooses "Shut Down..." in the Start_Menu, THE Scene_Director SHALL switch to
   the Shutdown_Scene.
5. WHEN the Shutdown_Scene finishes, THE Scene_Director SHALL switch to the Power_Off_Scene.
6. THE Scene_Director SHALL enter the Desktop_Scene only from the Boot_Scene.
7. IF the Scene_Director receives a signal that does not match the mounted Scene, THEN THE
   Scene_Director SHALL keep the mounted Scene unchanged.
8. WHEN the Scene_Director switches Scenes, THE Scene_Director SHALL unmount the current Scene
   before mounting the next Scene.
9. WHILE the Boot_Scene is mounted, THE Boot_Scene SHALL ignore keyboard and pointer input.

### Requirement 2: Monitor and Screen scaling

**User Story:** As a player, I want the game to look like an old CRT on any window size, so that
the retro costume holds up in the browser and in the demo video.

#### Acceptance Criteria

1. THE Monitor SHALL present the Screen at a fixed logical size of 1024 × 768 pixels inside a CRT
   bezel with a power button and a power LED.
2. WHEN the Monitor mounts or the browser viewport size changes, THE Monitor SHALL scale the
   Screen and bezel uniformly to the largest size that fits inside the viewport.
3. WHEN the Shell receives a pointer position in client coordinates, THE Monitor SHALL convert
   the position to Screen coordinates using the current scale and offset.
4. THE Monitor SHALL draw a scanline and vignette overlay above the Screen content that does not
   capture pointer input.

### Requirement 3: Power on and audio unlock

**User Story:** As a player, I want pressing the power button to start the sound as well as the
boot, so that the modem screech works despite browser autoplay rules.

#### Acceptance Criteria

1. WHILE the Power_Off_Scene is mounted, THE Power_Off_Scene SHALL show a dark Screen and a
   blinking power LED.
2. WHEN the player activates the power button while the Power_Off_Scene is mounted, THE
   Audio_Engine SHALL create or resume its audio context inside the same input event handler.
3. IF the audio context cannot be created or resumed, THEN THE Shell SHALL continue the boot
   with sound disabled.
4. WHILE the Audio_Engine is not unlocked, THE Audio_Engine SHALL ignore requests to play sounds.
5. WHILE a Scene other than the Power_Off_Scene is mounted, THE Monitor SHALL ignore activation
   of the power button.

### Requirement 4: Boot sequence

**User Story:** As a player, I want a short BIOS screen and splash with a little horror leaking
through, so that the computer feels real and slightly wrong.

#### Acceptance Criteria

1. WHEN the Boot_Scene mounts, THE Boot_Scene SHALL play a CRT power-on effect, the CRT thunk and
   the POST beep from the Boot_Sounds.
2. WHILE the Boot_Scene is in its BIOS stage, THE Boot_Scene SHALL show each BIOS line of the
   Boot_Script once the elapsed boot time reaches that line's scheduled time.
3. WHILE the Boot_Scene is in its BIOS stage, THE Boot_Scene SHALL count the memory test line up
   from 0K to 65536K over the period set in the Boot_Script.
4. WHEN the elapsed boot time reaches a sound cue in the Boot_Script, THE Boot_Scene SHALL play
   that cue's sound once.
5. WHEN the BIOS stage ends, THE Boot_Scene SHALL show the splash stage with the "Phantom 98"
   wordmark and an animated progress strip.
6. THE Boot_Scene SHALL finish the splash stage when the elapsed boot time reaches 8,000 ms.
7. THE Boot_Scene SHALL measure elapsed boot time in fixed-loop ticks, so that the page being
   hidden holds the boot timeline.

### Requirement 5: Desktop and icons

**User Story:** As a player, I want a believable desktop with a few icons, so that finding and
opening the dial-up connection feels like using a real old PC.

#### Acceptance Criteria

1. WHEN the Desktop_Scene mounts, THE Desktop_Scene SHALL show the wallpaper, the Desktop_Icons
   and the Taskbar, and play the startup chime from the Boot_Sounds.
2. THE Desktop_Scene SHALL show the Desktop_Icons "Connect to MidnightNet", "README.TXT" and
   "Wastebasket" in one column from the top-left of the Desktop_Area.
3. WHEN the player clicks a Desktop_Icon, THE Desktop_Scene SHALL select that Desktop_Icon and
   deselect every other Desktop_Icon.
4. WHEN the player double-clicks a Desktop_Icon, THE Desktop_Scene SHALL open that icon's App.
5. WHEN the player presses Enter while a Desktop_Icon is selected and has keyboard focus, THE
   Desktop_Scene SHALL open that icon's App.
6. WHEN the player clicks the wallpaper, THE Desktop_Scene SHALL deselect every Desktop_Icon.
7. WHEN the README App opens, THE Desktop_Scene SHALL open a text window titled
   "README.TXT - Jotter" that shows the README text from the Copy_Modules.
8. WHEN the Wastebasket App opens, THE Desktop_Scene SHALL open a window titled "Wastebasket"
   that lists the wastebasket filenames from the Copy_Modules and an object count.
9. WHEN an App that already has an open window is opened, THE Desktop_Scene SHALL focus the
   existing window instead of opening a second window.

### Requirement 6: Window manager

**User Story:** As a player, I want windows to stack, focus, move and minimize the way I
remember, so that the desktop feels solid when ads start piling up later.

#### Acceptance Criteria

1. WHEN a window is opened, THE Window_Manager SHALL place the window above all other windows and
   make the window the Focused_Window.
2. WHEN the player presses a pointer button on a window, THE Window_Manager SHALL move that
   window above all other windows and make the window the Focused_Window.
3. THE Window_Manager SHALL keep the Focused_Window equal to the topmost window that is not
   minimized, or no window when every window is closed or minimized.
4. WHEN a window is closed, THE Window_Manager SHALL remove the window and keep the stacking
   order of the remaining windows.
5. WHEN a window is minimized, THE Window_Manager SHALL hide the window and keep the window in
   the Taskbar.
6. WHEN the player drags a window's title bar, THE Window_Manager SHALL move the window by the
   pointer movement converted to Screen coordinates.
7. THE Window_Manager SHALL keep each window's title bar fully inside the Desktop_Area vertically
   and at least 48 pixels of the title bar inside the Desktop_Area horizontally.
8. WHEN the Desktop_Area size changes, THE Window_Manager SHALL apply the title bar rule of
   criterion 7 to every open window.
9. THE Window_Manager SHALL draw the Focused_Window's title bar in the active style and every
   other title bar in the inactive style.
10. WHEN the player clicks a window's close button, THE Window_Manager SHALL ask the window's
    owner whether to close.
11. IF a window's owner refuses a close request, THEN THE Window_Manager SHALL keep the window
    open.
12. WHEN a window opens without a given position, THE Window_Manager SHALL place the window at a
    cascade position offset by 24 pixels right and down from the previous cascade position.

### Requirement 7: Taskbar

**User Story:** As a player, I want a taskbar that shows my open windows and the modem status, so
that I can find windows and see the connection at a glance.

#### Acceptance Criteria

1. THE Taskbar SHALL show the Start button, one button per open window in the order the windows
   were opened, and the Tray.
2. WHEN the player clicks the Taskbar button of the Focused_Window, THE Taskbar SHALL minimize
   that window.
3. WHEN the player clicks the Taskbar button of a window that is not the Focused_Window, THE
   Taskbar SHALL restore that window if minimized and make the window the Focused_Window.
4. THE Taskbar SHALL show the Focused_Window's button in the pressed style.
5. THE Tray SHALL show the clock text "11:59 PM".
6. WHILE a Session is active and the Run phase is `dialing`, THE Tray SHALL show a blinking modem
   indicator.
7. WHILE a Session is active and the Run phase is `connected` or `downloading`, THE Tray SHALL
   show a steady modem indicator.
8. WHEN the player clicks the Tray speaker icon, THE Audio_Engine SHALL toggle mute, and THE Tray
   SHALL show the muted or unmuted speaker icon to match.

### Requirement 8: Start menu

**User Story:** As a player, I want a start menu with the familiar items, so that I can open the
dial-up connection or shut the computer down another way.

#### Acceptance Criteria

1. WHEN the player clicks the Start button, THE Start_Menu SHALL open if closed and close if
   open.
2. THE Start_Menu SHALL list "Connect to MidnightNet", "README.TXT", "Wastebasket", a separator
   and "Shut Down...", beside a vertical "Phantom 98" banner.
3. WHEN the player chooses an enabled Start_Menu item, THE Start_Menu SHALL close and run that
   item's action.
4. WHEN the player presses Escape or presses a pointer button outside the Start_Menu and the
   Start button, THE Start_Menu SHALL close.
5. WHILE a Session is active, THE Start_Menu SHALL show "Shut Down..." in the disabled style and
   ignore choosing it.

### Requirement 9: Dialer connect window

**User Story:** As a player, I want the classic "Connect To" dialog, so that dialing in is a
deliberate click that kicks off the run.

#### Acceptance Criteria

1. WHEN the Dialer App opens while no Session is active, THE Dialer SHALL show a "Connect To"
   window with the connection name "MidnightNet Online", the user name "guest", a masked
   password, the phone number "555-0199", and Connect and Cancel buttons.
2. WHEN the player clicks Connect, THE Desktop_Scene SHALL start a Session.
3. WHEN the player clicks Cancel or the close button while no Session is active, THE Dialer SHALL
   close the "Connect To" window.
4. WHILE a Session is active, THE Dialer SHALL show the dial progress view in place of the
   connection form.

### Requirement 10: Session hosting a Run

**User Story:** As a developer, I want one place that runs game-core in the browser and hands
state to views, so that the lane and browser front can plug in without touching the shell.

#### Acceptance Criteria

1. WHEN a Session starts, THE Session SHALL create a Run with `createRun` using a seed from the
   Session's seed source, and start the fixed loop.
2. WHEN the fixed loop reports n ticks for a frame, THE Session SHALL call `step` n times with
   the systems from the Session_Registry, passing the queued input commands on the first of
   those ticks.
3. WHEN a Session_View sends an input command, THE Session SHALL queue the command for the next
   tick that the Session runs.
4. WHEN the ticks of a frame are done, THE Session SHALL pass the latest state and every event of
   that frame, in order, to each Session_View.
5. THE Session SHALL produce the same states and events for the same seed and the same
   tick-aligned input commands regardless of how the ticks are grouped into frames.
6. WHEN the Run phase becomes `won` or `lost`, THE Session SHALL stop the fixed loop, run no
   further ticks and report the final state to the Desktop_Scene.
7. WHEN a Session ends or the Desktop_Scene unmounts, THE Session SHALL unmount every
   Session_View and stop the fixed loop.
8. WHILE the page is hidden, THE Session SHALL run no ticks and THE Audio_Engine SHALL suspend
   audio output.
9. WHEN the page becomes visible again, THE Audio_Engine SHALL resume audio output.
10. WHEN a Session starts, THE Desktop_Scene SHALL show the Lane_Dock between the Desktop_Area
    and the Taskbar, and mount every lane Session_View from the Session_Registry into the
    Lane_Dock.
11. WHEN a Session ends, THE Desktop_Scene SHALL hide the Lane_Dock and return the Dialer to the
    connection form.
12. THE Session SHALL give each Session_View the Lane_Dock element, the Window_Manager, the
    Audio_Engine and a send function as the only ways to affect the game.
13. WHILE a Session is active, THE Desktop_Scene SHALL start no second Session.

### Requirement 11: Dial progress from the simulation

**User Story:** As a player, I want the dialog to walk through dialing, the handshake and the
password check in step with the zombies on the lane, so that the 20 seconds feel scripted.

#### Acceptance Criteria

1. WHILE the Run phase is `dialing`, THE Dialer SHALL show the status text of the Dial_Stage whose
   share of the Dial_Script contains the current Dial_Fraction.
2. THE Dial_Script SHALL order the Dial_Stages as initializing, dialing, ringing, negotiating,
   verifying and logging on, with shares that start at 0, end at 1 and leave no gaps.
3. THE Dialer SHALL compute the Dial_Fraction only from the Run's tick, phase start tick and dial
   duration in the Run's balance.
4. WHEN the Run emits a `connected` event, THE Dialer SHALL show "Connected at 28,800 bps." and a
   connection duration counted in Run ticks since that event.
5. WHILE the Run phase is `connected` or `downloading`, THE Dialer SHALL show the connected
   status.
6. IF the Run phase becomes `lost`, THEN THE Dialer SHALL show "The connection was terminated by
   the remote computer."
7. WHEN the player clicks Cancel or the close button while a Session is active, THE Dialer SHALL
   keep the Session and the window, and show "Unable to hang up. Something is holding the line."
   for 180 Run ticks.

### Requirement 12: Synthesized modem audio

**User Story:** As a player, I want the real-sounding dial, ring and handshake screech, so that
the dial-up moment lands without any recorded samples.

#### Acceptance Criteria

1. WHEN the Dialer enters a Dial_Stage, THE Modem_Sounds SHALL stop the previous stage's sound
   and play the new stage's sound for the time left in that stage, computed from the Run's dial
   duration.
2. THE Modem_Sounds SHALL play a 350 Hz plus 440 Hz dial tone for initializing, the DTMF tone
   pairs of "5550199" for dialing, a 440 Hz plus 480 Hz ringback for ringing, and the handshake
   for negotiating.
3. THE Modem_Sounds SHALL build the handshake from a 2100 Hz answer tone with phase-reversal
   dips, then fast FSK chirps, then a line-probe chord, then band-passed noise training.
4. WHILE the Dial_Stage is verifying or logging on, THE Modem_Sounds SHALL play no sound.
5. WHEN the Run emits a `connected` event, THE Modem_Sounds SHALL play a relay click.
6. WHEN the Dialer's Session_View unmounts, THE Modem_Sounds SHALL stop every sound the Dialer
   started.
7. THE Shell SHALL generate every sound with the Web Audio API and load no audio files.

### Requirement 13: Shutdown

**User Story:** As a player, I want shutting down to look like the real thing, so that the desktop
has a proper way out.

#### Acceptance Criteria

1. WHEN the Shutdown_Scene mounts, THE Shutdown_Scene SHALL show "Please wait while your computer
   shuts down..." for 1,500 ms.
2. WHEN the first shutdown message has been shown for 1,500 ms, THE Shutdown_Scene SHALL show
   "It is now safe to switch off your computer." for 2,000 ms.
3. WHEN the second shutdown message has been shown for 2,000 ms, THE Shutdown_Scene SHALL play a
   500 ms CRT collapse effect and then finish.

### Requirement 14: Lifecycle, safe DOM and copy rules

**User Story:** As a developer, I want every piece to clean up after itself and every string to be
safe and original, so that replays don't leak and the entry stays within the contest rules.

#### Acceptance Criteria

1. THE Shell SHALL give every Scene and component a `mount()` and an `unmount()` operation.
2. WHEN a Scene or component unmounts, THE Scene or component SHALL remove its listeners on
   `document` and `window`, cancel its timers and animation frames, stop its sounds and remove
   its elements.
3. THE h_Helper SHALL add string children as text nodes, so that markup characters in a string
   appear as literal text.
4. THE Shell SHALL set all in-game text through text nodes or `textContent`.
5. THE Shell SHALL use only invented product, company and brand names in the Copy_Modules.
6. THE Shell SHALL draw icons, logos and wallpaper from the Shell's own CSS and constant inline
   SVG markup.
7. THE Shell SHALL keep the Shell's in-game text in the Copy_Modules and the Boot_Script and
   Dial_Script data tables.

## Decisions

These are assumptions made without the team's trial build. Each is one constant or one CSS
token, so it is cheap to change.

1. **Visual direction:** classic late-90s grey bevelled chrome, murky teal wallpaper, purple
   active title bars and a CRT bezel with scanlines. All colours live in one theme file.
2. **Screen size:** a 4:3 logical screen of 1024 × 768, scaled to fit. During a Session the
   Lane_Dock takes 260 pixels, leaving 480 pixels of Desktop_Area for the browser front.
3. **Boot length:** 8 seconds from power-on to the desktop, so a demo video still fits a full
   2:30 run.
4. **Names:** the OS is "Phantom 98", the BIOS is "NightOwl BIOS", the ISP is "MidnightNet
   Online", the text editor is "Jotter". The phone number uses the fictional 555-01xx range.
5. **Clock:** the Tray clock is stuck at 11:59 PM, one minute before midnight, as a quiet
   horror leak.
6. **No hang-up:** Cancel during a Session cannot end the Run. This keeps the "no skip" rule and
   adds a joke.
7. **Shut down during a Session** is disabled, so a Run only ends by winning or losing.
8. **After a Run ends** the desktop returns to its idle state. Result screens come in milestone 8.

   _Note: superseded by `title-and-endings` Requirements 8–11; every Run end shows the Result_Screen, and the idle desktop now comes after the player closes it (Requirement 11.3)._
9. **Seed:** each Session draws its seed from `crypto.getRandomValues` in the browser. Tests
   inject a fixed seed source.
