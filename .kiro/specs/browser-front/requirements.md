# Requirements Document

## Introduction

The browser-front feature is the top front of the game. When the modem connects, the NetSurfer
browser opens by itself on the MidnightNet download page. The player clicks a small grey real
link to start downloading `HOMEWORK.ZIP`, then fights pop-up ads that try to waste their time:
clutter banners, fake "DOWNLOAD NOW!!" buttons and interrupters that pause the download. Each ad
uses one of seven close patterns with exactly one correct control. It is milestone 4 in
`docs/roadmap.md` and follows `docs/game-design.md` sections 1, 2, 7 and 8.

The ad rules live in `src/game/` as pure game-core systems, like the lane. Ad positions are plain
numbers in Screen pixels, chosen with the Run's seeded RNG. The browser window and the ads are
drawn with DOM elements that only read the state and send input commands.

This feature uses a placeholder Ad_Schedule, as connection-lane used a placeholder spawn
schedule. The chapter director (`cross-front-and-director`) replaces it. The fake button's
zombie spawn belongs to `cross-front-and-director` and its −5 KB to `economy-weapons`; this
feature applies the −20% download penalty and emits the event those features consume. The +2 KB
for a correct close is emitted here and credited in `economy-weapons`.

## Glossary

Terms from game-core, retro-shell and connection-lane keep their meaning (Run, Tick, phase,
Pause_Source, `startDownload`, Session, Session_View, Session_Registry, Window_Manager,
Desktop_Area, Lane_Dock, Dialer, Audio_Engine, Copy_Modules, Pop_Up_Burst_Request). New terms:

- **NetSurfer_Window**: the browser window this feature opens through the Window_Manager.
- **Download_Page**: the web page inside the NetSurfer_Window, served from the invented address
  `http://files.midnightnet.example/homework/`.
- **Target_File**: the file the player must download, shown as `HOMEWORK.ZIP (2,048 KB)`.
- **Real_Link**: the small grey link on the Download_Page that starts the download.
- **Download_Panel**: the "File Download" box on the Download_Page with the Download_Bar, the
  percentage, the transfer rate and the time left.
- **Download_Bar**: the bar in the Download_Panel whose fill shows download progress.
- **Ad**: one pop-up in the Ad_State, with an id, an Ad_Kind, a Close_Pattern, a rectangle in
  Screen pixels, an open Tick and its pattern state.
- **Ad_Kind**: `clutter` (a banner), `fake` (a fake download button) or `interrupter` (a modal
  that pauses the download).
- **Close_Pattern**: how an Ad is closed: `plain`, `decoy`, `hidden`, `swapped`, `countdown`,
  `confirm` or `runaway`. Fake buttons have no Close_Pattern.
- **Ad_Control**: a named clickable part of an Ad: `close`, `bigClose`, `tinyClose`, `ok`,
  `cancel`, `noThanks`, `skip`, `confirmYes`, `confirmNo`, `fakeButton` or `body`.
- **Correct_Control**: the one Ad_Control that closes an Ad in its current pattern stage.
- **Wrong_Control**: an Ad_Control that is a mistake for an Ad in its current pattern stage.
- **Ad_Click_Command**: the input command `{ type: 'adClick', adId, control }`.
- **Ad_Hover_Command**: the input command `{ type: 'adHover', adId }`, sent when the pointer
  enters a runaway ✕.
- **Ad_Mistake**: activating a Wrong_Control.
- **Ad_State**: the plain-data part of the Run state that holds the open Ads, the next Ad id and
  the Ad_Balance.
- **Ad_Balance**: the ad tuning table in `src/game/balance/ads.ts`, including the Ad_Schedule and
  the Ad_Field layout.
- **Ad_Field**: the Screen area an Ad may cover: the Desktop_Area plus the Lane_Dock, 1024 × 740
  Screen pixels from the top-left of the Screen during a Session.
- **Lane_Cover**: an Ad rectangle that overlaps the Lane_Dock.
- **Ad_Schedule**: the placeholder list of timed ad spawns and the Close_Patterns allowed from
  each time.
- **Ad_Cap**: the most Ads that can be open at once.
- **Ad_Systems**: the game-core systems that run the Ads inside `step()`.
- **Ad_Layer**: the DOM layer over the Ad_Field where the Ads are drawn.
- **Browser_View**: the Session_View that opens the NetSurfer_Window, draws the Download_Page,
  the Download_Panel and the Ad_Layer, and turns pointer input into commands.
- **Browser_Sounds**: the synthesized ad and browser sound recipes.

## Requirements

### Requirement 1: Ad state inside the Run

**User Story:** As a developer, I want the ads to live in the Run state, so that ad runs are
deterministic, replayable and playable headless like the lane.

#### Acceptance Criteria

1. WHEN the Ad_Systems run on a Run state that has no Ad_State, THE Ad_Systems SHALL add an
   Ad_State with no Ads, next Ad id 1 and the Ad_Balance given to the Ad_Systems.
2. THE Ad_State SHALL contain only plain data, so that `JSON.parse(JSON.stringify(state))` equals
   the state.
3. WHEN two Runs start from the same seed with the same Ad_Balance and receive the same input
   commands on the same Ticks, THE Ad_Systems SHALL produce identical states and identical events
   on every Tick.
4. THE Ad_Systems SHALL take every random choice (position, Close_Pattern, copy variant) from the
   Run's seeded RNG.
5. WHILE the Run phase is `dialing`, THE Ad_Systems SHALL open no Ads.
6. WHILE the Run phase is `won` or `lost`, THE Ad_Systems SHALL leave the Ad_State unchanged.
7. WHEN `runHeadless` receives the Ad_Systems and a script with Ad_Click_Commands, THE headless
   runner SHALL play the Run in Node with no DOM.

### Requirement 2: Ad tuning as data

**User Story:** As a designer, I want every ad number in one table, so that I can tune the
browser front without touching logic.

#### Acceptance Criteria

1. THE Ad_Balance defaults SHALL set the fake button penalty to 20 percent, the fake button
   lifetime to 8 s, the correct-close reward to 2 KB, the countdown to 3 s, the runaway jump limit
   to 3, the Ad_Cap to 8 and one extra clutter Ad per Ad_Mistake.
2. THE Ad_Balance SHALL hold the Ad_Field size, the Real_Link rectangle, the Download_Page
   rectangle and the size of every Ad_Kind in Screen pixels.
3. IF Ad_Balance overrides contain a non-finite number, a value outside its allowed range, an
   unknown Ad_Kind or an unknown Close_Pattern, THEN THE `resolveAdBalance` function SHALL throw
   an `AdBalanceError` that lists every problem found.
4. THE Ad_Systems SHALL read ad tuning only from the Ad_State's Ad_Balance.

### Requirement 3: Placeholder ad schedule

**User Story:** As a player, I want ads to arrive on a rough version of the chapter timeline, so
that the browser front is playable before the director exists.

#### Acceptance Criteria

1. THE Ad_Schedule SHALL be a list of rows, each with an Ad_Kind, a start second, an end second,
   an interval and the Close_Patterns it may use.
2. THE default Ad_Schedule SHALL open the first clutter Ad 5 s after `connected` with the `plain`
   Close_Pattern, start fake buttons at 45 s and interrupters at 55 s, allow `decoy`, `hidden`
   and `swapped` from 45 s, `countdown` and `confirm` from 70 s, `runaway` interrupters and
   Lane_Cover clutter from 90 s, and double the clutter rate from 115 s.
3. WHERE a replacement ad scheduler is passed to the Ad_Systems, THE Ad_Systems SHALL run the
   replacement in the Ad_Schedule's place and keep every other Ad_System unchanged.
4. IF opening an Ad would exceed the Ad_Cap, THEN THE Ad_Systems SHALL skip that Ad and emit
   `adSkipped` with its Ad_Kind.

### Requirement 4: Ad placement

**User Story:** As a player, I want ads to land where they hurt but stay closable, so that the
browser front is chaotic and fair.

#### Acceptance Criteria

1. THE Ad_Systems SHALL place every Ad rectangle fully inside the Ad_Field.
2. THE Ad_Systems SHALL place an Ad as a Lane_Cover only when the schedule row that opens it
   allows Lane_Cover Ads.
3. THE Ad_Systems SHALL place every fake button within 120 Screen pixels of the Real_Link
   rectangle without covering the Real_Link.
4. THE Ad_Systems SHALL place every interrupter over the Download_Page.
5. THE Ad_Systems SHALL place the first clutter Ad of a Run so that it does not cover the
   Real_Link.

### Requirement 5: NetSurfer window and download page

**User Story:** As a player, I want the browser to open on the download page as soon as I am
online, so that I know where to go next.

#### Acceptance Criteria

1. WHEN a `connected` event arrives, THE Browser_View SHALL minimize the Dialer window and open
   the NetSurfer_Window filling the Desktop_Area, showing the Download_Page.
2. THE NetSurfer_Window SHALL show the title "MidnightNet Download Center - NetSurfer", a toolbar
   with Back, Forward, Stop, Refresh and Home buttons that do nothing, an address bar with the
   Download_Page address and a status bar.
3. THE Download_Page SHALL show the Target_File and the Real_Link as small grey text.
4. WHEN the player clicks the Real_Link in the `connected` phase, THE Browser_View SHALL send one
   `startDownload` command.
5. WHEN a `downloadStarted` event arrives, THE Download_Page SHALL replace the Real_Link with the
   text "Your download has started. Please do not hang up." and show the Download_Panel.
6. WHEN the player asks to close the NetSurfer_Window during a Session, THE Browser_View SHALL
   refuse and show "NetSurfer is busy. Please try again later." in the status bar for 180 Ticks.
7. WHEN the Browser_View unmounts, THE Browser_View SHALL close the NetSurfer_Window and remove
   the Ad_Layer.

### Requirement 6: Download panel

**User Story:** As a player, I want a classic download box that shows progress, stalls and
penalties, so that I can see the effect of every ad.

#### Acceptance Criteria

1. WHEN the Browser_View receives a state in the `downloading` phase, THE Download_Panel SHALL
   set the Download_Bar fill to download progress divided by 100 and show the progress as a whole
   percentage.
2. WHILE no Pause_Source is active, THE Download_Panel SHALL show a transfer rate and an
   estimated time left computed from the remaining progress and the download rate in the Run's
   balance.
3. WHILE one or more Pause_Sources are active, THE Download_Panel SHALL show "Waiting for
   server..." in place of the time left.
4. WHEN a `downloadPenalty` event arrives, THE Download_Panel SHALL show the Download_Bar in the
   penalty style for 30 Ticks.
5. THE Download_Panel SHALL take its text from the Copy_Modules and set it through
   `textContent`.

### Requirement 7: Clutter banners

**User Story:** As a player, I want loud banners that I must close, so that the page and the lane
stay visible only if I keep up.

#### Acceptance Criteria

1. WHEN the Ad_Systems open a clutter Ad, THE Ad_Systems SHALL emit `adOpened` with its id,
   Ad_Kind and Close_Pattern.
2. WHEN a clutter Ad is closed through its Correct_Control, THE Ad_Systems SHALL remove the Ad
   and emit `adClosed` with its id and the correct-close reward in KB.
3. WHEN a Pop_Up_Burst_Request arrives, THE Ad_Systems SHALL open its count of clutter Ads on the
   same Tick, subject to the Ad_Cap.
4. WHILE the Run phase is `dialing`, THE Ad_Systems SHALL ignore Pop_Up_Burst_Requests.

### Requirement 8: Fake buttons

**User Story:** As a player, I want big green buttons that lie, so that clicking the wrong thing
costs me download progress.

#### Acceptance Criteria

1. WHEN the Ad_Systems open a fake button, THE Ad_Systems SHALL emit `adOpened` with Ad_Kind
   `fake`.
2. WHEN the player activates the `fakeButton` or `body` Ad_Control of a fake button, THE
   Ad_Systems SHALL apply the fake button penalty with game-core's download penalty, emit
   `fakeButtonClicked` with the Ad id, and remove the fake button.
3. WHEN a fake button has been open for the fake button lifetime, THE Ad_Systems SHALL remove it
   and emit `adExpired` with its id.
4. THE Ad_Systems SHALL give no KB reward for a fake button.

### Requirement 9: Interrupters

**User Story:** As a player, I want modal pop-ups that freeze my download until I close them, so
that the browser front demands attention.

#### Acceptance Criteria

1. WHEN the Ad_Systems open an interrupter, THE Ad_Systems SHALL add the Pause_Source
   `ad:<id>` and emit `adOpened` with Ad_Kind `interrupter`.
2. WHEN an interrupter is closed through its Correct_Control, THE Ad_Systems SHALL remove the Ad,
   remove its Pause_Source and emit `adClosed` with the correct-close reward.
3. WHILE an interrupter is open, THE Browser_View SHALL block pointer input to the Download_Page
   beneath it.
4. FOR ALL Runs and Ticks, WHILE an interrupter is open, THE Run SHALL NOT increase download
   progress.

### Requirement 10: Close patterns

**User Story:** As a player, I want each ad to hide its way out a little differently, so that
closing ads wastes my time but every pattern can be learned.

#### Acceptance Criteria

1. WHERE an Ad uses the `plain` Close_Pattern, THE Ad_Systems SHALL treat `close` as the
   Correct_Control and `body` as a Wrong_Control.
2. WHERE an Ad uses the `decoy` Close_Pattern, THE Ad_Systems SHALL treat the small title-bar
   `close` as the Correct_Control and the large in-ad `bigClose` and `body` as Wrong_Controls.
3. WHERE an Ad uses the `hidden` Close_Pattern, THE Browser_View SHALL draw no ✕ in the title
   bar and a `tinyClose` in another corner chosen from the Ad's state, and THE Ad_Systems SHALL
   treat `tinyClose` as the Correct_Control and `body` as a Wrong_Control.
4. WHERE an Ad uses the `swapped` Close_Pattern, THE Ad_Systems SHALL treat the `noThanks` text
   link as the Correct_Control and `ok`, `cancel` and `body` as Wrong_Controls.
5. WHERE an Ad uses the `countdown` Close_Pattern, THE Ad_Systems SHALL ignore `skip` until the
   countdown has passed since the Ad opened, then treat `skip` as the Correct_Control, and SHALL
   treat `body` as a Wrong_Control at any time.
6. WHERE an Ad uses the `confirm` Close_Pattern, THE Ad_Systems SHALL move the Ad to its confirm
   stage on `close`, then treat `confirmYes` as the Correct_Control, return the Ad to its first
   stage on `confirmNo`, and treat `body` as a Wrong_Control in either stage.
7. WHERE an interrupter uses the `runaway` Close_Pattern, WHEN an Ad_Hover_Command arrives for it
   and its jumps are below the runaway jump limit, THE Ad_Systems SHALL move its `close` to a new
   position inside the Ad chosen with the seeded RNG, count one jump and emit `adCloseJumped`.
8. WHERE an interrupter uses the `runaway` Close_Pattern, THE Ad_Systems SHALL treat `close` as
   the Correct_Control whenever the Ad_Click_Command arrives, and SHALL move `close` no more
   than the runaway jump limit.
9. THE Ad_Systems SHALL give Close_Patterns only to clutter Ads and interrupters, and the
   `runaway` Close_Pattern only to interrupters.
10. FOR ALL Ads and Close_Patterns, THE Ad_Systems SHALL have exactly one Correct_Control in each
    pattern stage, and a scripted player who sends it SHALL close the Ad within 2 Ticks, or
    within the countdown plus 2 Ticks for the `countdown` Close_Pattern.

### Requirement 11: Mistakes

**User Story:** As a player, I want a wrong click on an ad to cost me, so that I learn to read the
pattern instead of clicking wildly.

#### Acceptance Criteria

1. WHEN the player activates a Wrong_Control, THE Ad_Systems SHALL keep the Ad open, emit
   `adMistake` with the Ad id and the Ad_Control, and open the extra clutter Ads from the
   Ad_Balance, subject to the Ad_Cap.
2. IF an Ad_Click_Command or Ad_Hover_Command names an Ad that is not open or an Ad_Control the
   Ad does not have, THEN THE Ad_Systems SHALL ignore the command and emit no event.
3. THE Ad_Systems SHALL give no KB reward for an Ad_Mistake.

### Requirement 12: Drawing ads

**User Story:** As a player, I want the ads to look like real late-90s pop-ups, so that the
browser front sells the costume.

#### Acceptance Criteria

1. WHEN the Browser_View receives a state, THE Browser_View SHALL draw each open Ad in the
   Ad_Layer at its rectangle, above the windows and the Lane_View and below the Result_Screen.
2. THE Browser_View SHALL draw clutter Ads and interrupters with a pop-up title bar in the
   Phantom 98 style, and fake buttons as large green buttons.
3. WHEN the player activates an Ad_Control, THE Browser_View SHALL send one Ad_Click_Command with
   the Ad id and that Ad_Control.
4. WHEN the pointer enters the `close` control of a `runaway` interrupter, THE Browser_View SHALL
   send one Ad_Hover_Command.
5. WHEN the player presses a pointer button on a Lane_Cover Ad, THE Lane_View SHALL receive no
   Hammer_Command for that press.
6. THE Ad_Layer outside the Ad rectangles SHALL NOT capture pointer input.
7. THE Browser_View SHALL show the countdown of a `countdown` Ad as whole seconds left, computed
   from the Run Tick.
8. THE Browser_View SHALL build Ads with the `h()` helper, set every ad string through
   `textContent`, take ad copy from Copy_Modules that follow the `retro-copy` steering file, and
   draw ad art only from CSS and constant inline SVG.
9. THE Browser_View SHALL animate blinking ad text at most 3 times per second.

### Requirement 13: Browser sounds

**User Story:** As a player, I want ads to ding and mistakes to buzz, so that I can track the
browser front by ear.

#### Acceptance Criteria

1. WHEN a frame's events include `adOpened`, `adClosed`, `adMistake`, `fakeButtonClicked` or
   `adCloseJumped`, THE Browser_View SHALL play the matching Browser_Sounds recipe once for that
   frame, using a separate alert recipe for an interrupter's `adOpened`.
2. THE Browser_Sounds SHALL be synthesized with Web Audio nodes and SHALL load no audio files.
3. WHEN the Browser_View unmounts, THE Browser_View SHALL stop every voice it started.

### Requirement 14: Integration

**User Story:** As a developer, I want the browser front to plug into the Session like the lane,
so that later milestones need no rewiring.

#### Acceptance Criteria

1. THE game-core `InputCommand` union SHALL include the Ad_Click_Command and the
   Ad_Hover_Command.
2. THE Session_Registry SHALL list the Browser_View factory and the default Ad_Systems after the
   Lane_Systems.
3. THE Browser_View SHALL change the Run only by sending input commands through the Session
   context.
4. THE existing game-core, connection-lane and retro-shell tests SHALL pass without changes to
   their assertions.

### Requirement 15: Kiro workflow artifacts

**User Story:** As the team, we want the ad recipe captured as a skill and the front checked in a
real browser, so that adding the next ad is repeatable and the Kiro story is documented.

#### Acceptance Criteria

1. THE repository SHALL contain `.kiro/skills/add-ad/SKILL.md` with front matter `name: add-ad`
   and a `description` that says when to use it.
2. THE `add-ad` skill SHALL list the files and steps for adding an Ad_Kind or a Close_Pattern as
   they exist in the code after this milestone.
3. THE `playtester` agent SHALL play from dial-up to at least 60 s after `connected`, close ads
   of every Close_Pattern reachable by then, and write a report to `docs/playtests/`.
4. THE file `docs/kiro-log.md` SHALL contain a dated note under "Notes" describing this spec.

## Decisions

1. **Target file name.** The page offers `HOMEWORK.ZIP`; the win screen reveals it was really
   `funny_cats_1998.avi`. Cheap to change in the copy.
2. **Ads are not Window_Manager windows.** They are drawn in their own Ad_Layer from the Run
   state, so the simulation decides where they are and the Window_Manager's real close button
   can't bypass a Close_Pattern.
3. **The NetSurfer_Window can't be closed** during a Session, like the Dialer's "Unable to hang
   up" joke. It can be minimized, which hides the Real_Link, so minimizing hurts the player.
4. **The Dialer minimizes on connect** so the NetSurfer_Window gets the whole 1024 × 480
   Desktop_Area.
5. **Clicking an ad's body is a mistake** for every pattern. This is the classic late-90s trap
   and keeps "click carefully" as the browser-front skill.
6. **`confirmNo` is not a mistake.** It only costs time, which is the point of the pattern.
