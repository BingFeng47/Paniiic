# Requirements Document

## Introduction

The replay-flow feature changes how a run ends. Today the Result_Screen has one button, "Back to
Desktop", which leaves the player on the idle desktop. Now it has two:

- **Retry** closes the Result_Screen and dials up again at once. The 20-second dial-up and the
  zombie raid play in full, so no part of the run is skipped.
- **Main menu** closes the Result_Screen and goes back to the Title_Scene. From there "Play game"
  runs the full BIOS → splash → desktop startup again.

It is milestone 3e in `docs/roadmap.md` and follows `docs/game-design.md` section 1 step 5 and
section 9 as updated on 22 Nov 2026.

This feature changes shipped title-and-endings rules:

- title-and-endings Requirement 1.4 ("THE Scene_Director SHALL enter the Title_Scene only from
  the Power_Off_Scene") becomes Requirement 3.2 here: the Title_Scene can also be entered from
  the Desktop_Scene through the Main_Menu_Button.
- title-and-endings Requirements 11.1–11.3 (the Back_Button and the idle desktop) are replaced
  by Requirements 1, 2 and 3 here.

Out of scope: options reachable from the desktop and keeping statistics across runs.

## Glossary

Terms from retro-shell and title-and-endings keep their meaning (Scene_Director,
Power_Off_Scene, Title_Scene, Boot_Scene, Desktop_Scene, Session, Session_View, Run,
Final_State, Outcome, Result_Screen, Result_Script, Dialer, Lane_Dock, Window_Manager,
Copy_Modules, Fixed_Loop, View_Prefs, Settings_Store). New terms:

- **Retry_Button**: the "Retry" button on the Result_Screen.
- **Main_Menu_Button**: the "Main menu" button on the Result_Screen.
- **Result_Buttons**: the Retry_Button and the Main_Menu_Button.
- **Main_Menu_Signal**: the signal the Desktop_Scene sends the Scene_Director to switch to the
  Title_Scene.
- **Session_Windows**: every window a Session's views opened, such as the NetSurfer window and
  its ads.

## Requirements

### Requirement 1: Result buttons

**User Story:** As a player, I want to choose between trying again and going back to the start,
so that I can replay quickly or take a break.

#### Acceptance Criteria

1. WHEN the Result_Screen reveals its ending, THE Result_Screen SHALL show the Retry_Button and
   the Main_Menu_Button in place of the Back_Button, in that order.
2. WHEN the Result_Buttons appear, THE Result_Screen SHALL move keyboard focus to the
   Retry_Button.
3. THE Result_Screen SHALL accept activation of each Result_Button by pointer click and by the
   Enter or Space key while the button has keyboard focus.
4. WHEN the player activates one Result_Button, THE Result_Screen SHALL ignore every later
   activation of both Result_Buttons until it unmounts.
5. THE Result_Screen SHALL take the Result_Button labels from the Copy_Modules.

### Requirement 2: Retry

**User Story:** As a player who just lost, I want to dial up again straight away, so that a retry
takes seconds instead of a reboot.

#### Acceptance Criteria

1. WHEN the player activates the Retry_Button, THE Desktop_Scene SHALL close the Result_Screen,
   stop every Result_Screen sound and start a new Session on the same Tick of its loop.
2. WHEN a Session starts from the Retry_Button, THE Session SHALL create its Run with a new seed
   from the Session's seed source, so that the new Run starts in the `dialing` phase with full
   integrity and download progress 0.
3. WHEN a Session starts from the Retry_Button, THE Desktop_Scene SHALL open the Dialer showing
   the dial progress view and show the Lane_Dock, exactly as clicking Connect does.
4. WHEN the previous Session ended, THE Desktop_Scene SHALL have closed every Session_Window of
   that Session, so that no window or ad from the previous Run is open when the new Session
   starts.
5. WHEN a Session starts from the Retry_Button, THE Desktop_Scene SHALL give its Session_Views
   View_Prefs read from the current Settings.

### Requirement 3: Main menu

**User Story:** As a player, I want to go back to the title screen after a run, so that I can
change options or start the whole ritual again.

#### Acceptance Criteria

1. WHEN the player activates the Main_Menu_Button, THE Desktop_Scene SHALL close the
   Result_Screen, stop every Result_Screen sound and send the Main_Menu_Signal.
2. THE Scene_Director SHALL enter the Title_Scene only from the Power_Off_Scene on power-on, or
   from the Desktop_Scene on the Main_Menu_Signal.
3. WHEN the Scene_Director receives the Main_Menu_Signal while the Desktop_Scene is mounted, THE
   Scene_Director SHALL unmount the Desktop_Scene and mount the Title_Scene.
4. WHEN the Title_Scene mounts from the Main_Menu_Signal, THE Title_Scene SHALL behave as on
   power-on: theme song, Play_Button focus and Options_Button.
5. THE Scene_Director SHALL keep entering the Boot_Scene only from the Title_Scene and the
   Desktop_Scene only from the Boot_Scene.
6. IF the Scene_Director receives the Main_Menu_Signal while a Scene other than the
   Desktop_Scene is mounted, THEN THE Scene_Director SHALL keep the mounted Scene unchanged.
7. FOR ALL sequences of signals, THE Scene_Director SHALL reach the Desktop_Scene only through
   the Boot_Scene (scene director property).

### Requirement 4: Cleanup between runs

**User Story:** As a developer, I want each run to start clean, so that replays never leak
sounds, listeners or windows.

#### Acceptance Criteria

1. WHEN a Session ends, THE Session SHALL unmount every Session_View, and each Session_View SHALL
   close the Session_Windows it opened.
2. WHEN the Desktop_Scene unmounts on the Main_Menu_Signal, THE Desktop_Scene SHALL stop every
   sound, timer, listener and Fixed_Loop it started, as retro-shell Requirement 14.2 requires.
3. FOR ALL numbers n of Retry activations in a row, THE Desktop_Scene SHALL hold exactly one
   Session and one Result_Screen at most at any time.

### Requirement 5: Docs and superseded rules

**User Story:** As a team member, I want the old rules marked as replaced, so that nobody builds
against the old Back_Button.

#### Acceptance Criteria

1. THE title-and-endings requirements SHALL carry a note under Requirements 1.4 and 11 that
   points to this spec.
2. THE existing tests that close the Result_Screen with the Back_Button SHALL be changed to use
   the Retry_Button or the Main_Menu_Button, with their other assertions unchanged, and the list
   SHALL be recorded in this spec's design.
3. THE file `docs/kiro-log.md` SHALL contain a dated note under "Notes" describing this change.

## Decisions

1. **Retry skips the boot but not the run.** `.kiro/steering/product.md` says the player always
   goes through the full startup. The BIOS, splash and desktop play on power-on and after Main
   menu. Retry replays the dial-up and the raid in full. The team confirmed this reading of the
   non-negotiable on 22 Nov 2026.
2. **No "Back to Desktop".** Between runs the only thing to do on the desktop is dial again,
   which Retry does. Main menu covers leaving. Two buttons keep the end screen simple.
3. **Labels:** "Retry" and "Main menu", following the `retro-copy` steering file. Cheap to
   change.
