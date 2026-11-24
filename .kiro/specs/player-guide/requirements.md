# Requirements Document

## Introduction

The player-guide feature gives a first-time player the objective and just enough help to play,
without a tutorial. A sticky note on the desktop states the objective. During a run, small hint
balloons in the late-90s tray style explain each new thing the first time it happens in that
run. A "Show hints" checkbox in Options turns the balloons off. It is milestone 6b in
`docs/roadmap.md` and follows `docs/game-design.md` sections 1 and 11.

The guide only reads the Run state and events. It never pauses the game, never sends input
commands and never covers the lane or the real link.

Out of scope: a step-by-step tutorial, voice-over and hints on the Title_Scene.

## Glossary

Terms from retro-shell, title-and-endings, connection-lane, browser-front and economy-weapons
keep their meaning (Desktop_Scene, Desktop_Area, Desktop_Icon, Taskbar, Tray, Session,
Session_View, Run, Tick, Lane_Dock, Options_Dialog, Settings, Settings_Store, Default_Settings,
Settings_Version, NetSurfer_Window, Real_Link, Ad, Data_Packet, Wallet, Shop_Slot,
Copy_Modules). New terms:

- **Mission_Note**: the yellow sticky note on the desktop wallpaper with the objective.
- **Hint**: one short message about one game mechanic, with a title and a body.
- **Hint_Trigger**: the state change or event that makes a Hint due.
- **Hint_Balloon**: the rounded late-90s balloon that shows one Hint, with a ✕ and a pointer
  tail.
- **Hint_View**: the Session_View that watches the Run and shows Hint_Balloons.
- **Hints_Enabled**: a new setting, true by default, shown as "Show hints" in the
  Options_Dialog.
- **Hint_Table**: the data table of Hints, their Hint_Triggers and their anchors.
- **Hint_Anchor**: the thing a Hint_Balloon's tail points at: the lane, the Real_Link, an Ad, a
  Data_Packet, the Shop_Tray or the integrity meter.

## Requirements

### Requirement 1: Mission note

**User Story:** As a first-time player, I want the objective on the desktop, so that I know what
to do before I dial.

#### Acceptance Criteria

1. WHEN the Desktop_Scene mounts, THE Desktop_Scene SHALL show the Mission_Note on the wallpaper
   with the text from the Copy_Modules: "Get online. Download HOMEWORK.ZIP before midnight.
   Don't let anything eat the modem."
2. THE Desktop_Scene SHALL place the Mission_Note in the top-right of the Desktop_Area, clear of
   the Desktop_Icons.
3. THE Mission_Note SHALL stay below every window and SHALL NOT capture pointer input.
4. THE README text SHALL state the objective and the three controls: click zombies, close
   pop-ups, click the small grey link.

### Requirement 2: Hints in a run

**User Story:** As a first-time player, I want a short tip the first time each thing happens, so
that I learn the controls while playing.

#### Acceptance Criteria

1. THE Hint_Table SHALL hold these Hints and Hint_Triggers: dialing starts (zombies on the line,
   click them), `connected` (click the small grey link, not the big green button), first clutter
   `adOpened` (close pop-ups to keep the page clear), first interrupter `adOpened` (this pop-up
   paused your download), first `packetDropped` (move over the packet to grab the KB), first Tick
   the Wallet covers the cheapest Shop_Slot (press 1–5 to buy) and first `integrityCritical` (the
   modem is dying).
2. WHEN a Hint_Trigger happens while Hints_Enabled is true, THE Hint_View SHALL show that Hint's
   Hint_Balloon unless the Hint was already shown in this Run.
3. THE Hint_View SHALL show each Hint at most once per Run.
4. WHILE a Hint_Balloon is shown and another Hint becomes due, THE Hint_View SHALL queue the new
   Hint and show it when the current Hint_Balloon closes, keeping at most 2 queued Hints and
   dropping the oldest.
5. WHEN a Hint_Balloon has been shown for 360 Ticks or the player clicks its ✕, THE Hint_View
   SHALL close it.
6. THE Hint_View SHALL take Hint text from Copy_Modules that follow the `retro-copy` steering
   file and set it through `textContent`.

### Requirement 3: Balloon placement and safety

**User Story:** As a player, I want hints that never block what I need, so that help never costs
me a zombie or a click.

#### Acceptance Criteria

1. THE Hint_View SHALL place every Hint_Balloon inside the Desktop_Area, outside the Lane_Dock and
   outside the Real_Link rectangle, with its tail pointing at its Hint_Anchor.
2. THE Hint_View SHALL draw Hint_Balloons above the Ads and below the Result_Screen.
3. THE Hint_Balloon SHALL capture pointer input only on its own rectangle.
4. THE Hint_View SHALL send no input commands, so that the Session produces the same states and
   events with or without Hints.
5. WHEN a Hint_Balloon opens, THE Hint_View SHALL play a short synthesized balloon pop once.
6. WHEN the Hint_View unmounts, THE Hint_View SHALL remove every Hint_Balloon and stop its
   sounds.

### Requirement 4: Show hints option

**User Story:** As a returning player, I want to turn hints off, so that they don't nag me.

#### Acceptance Criteria

1. THE Settings SHALL include Hints_Enabled, and THE Default_Settings SHALL set it to true.
2. THE Options_Dialog SHALL show a "Show hints" checkbox for Hints_Enabled, below the Screen shake
   checkbox.
3. WHEN the player toggles the "Show hints" checkbox, THE Settings_Store SHALL set Hints_Enabled
   to the checkbox state and save the Settings.
4. IF stored Settings with Settings_Version 1 have no Hints_Enabled field, THEN THE Settings_Store
   SHALL use true for it and keep every other valid field, as title-and-endings Requirement 5.6
   requires.
5. FOR ALL valid Settings including Hints_Enabled, serializing then parsing SHALL produce Settings
   equal to the original.
6. WHEN a Session starts, THE Desktop_Scene SHALL give the Hint_View the current Hints_Enabled
   value in View_Prefs.

### Requirement 5: Docs

**User Story:** As a team member, I want the guide recorded, so that the design doc and the game
agree.

#### Acceptance Criteria

1. THE file `docs/game-design.md` section 11 SHALL match the Hint_Table and the Mission_Note text.
2. THE file `docs/kiro-log.md` SHALL contain a dated note under "Notes" describing this spec.

## Decisions

1. **Balloons sit in the Desktop_Area, not over the tray.** During a Session the Lane_Dock sits
   between the Desktop_Area and the Taskbar, so a real tray balloon would cover the manhole.
2. **Hints every run, not only the first run.** Each Hint shows once per run; "Show hints" turns
   them off for players who know the game.
3. **No new Settings_Version.** A missing field already falls back to its default, so old stored
   settings keep working.
