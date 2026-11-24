# Requirements Document

## Introduction

The leaderboard feature gives every run a score, lets the player sign it into an online
guestbook after a win or a loss, and adds a Hall of Fame page to the title screen. Every player
gets the same run each day through a daily seed. It is milestone 12 in `docs/roadmap.md` and
follows `docs/game-design.md` sections 1 and 12 as updated on 23 Nov. It reads `bestCombo` from
`pacing-and-economy` and should be built after it; without combos the combo part is 0.

Scores are stored in Supabase through its REST API with the **publishable key only**. The secret
key and the database password are never used by the game, never written to the repo and never
needed by any task in this spec. The table is created by the team by pasting
`docs/leaderboard.sql` into the Supabase SQL editor.

Out of scope: accounts, server-side score checks, profanity filtering, and changing the run
rules.

## Glossary

Terms from earlier specs keep their meaning (Run, Final_State, Result_Screen, Result_Buttons,
Title_Scene, Settings_Store, Session_Registry, Game_Systems). New terms:

- **Day**: the UTC date as `YYYY-MM-DD`.
- **Daily_Seed**: the Run seed derived from the Day.
- **Run_Stats**: plain-data counters in `GameState.stats`: kills, boss killed, ads closed.
- **Score**: a whole number computed from the Final_State by `scoreRun`.
- **Score_Breakdown**: the parts of the Score, shown as the Receipt.
- **Receipt**: the score breakdown printed on the Result_Screen.
- **Guestbook_Form**: the name field and Sign button on the Result_Screen.
- **Player_Name**: 3–12 characters from letters, digits, space, `_` and `-`, trimmed.
- **Leaderboard_Client**: the module that talks to the Supabase REST API.
- **Hall_of_Fame**: the guestbook page opened from the Title_Scene.

## Requirements

### Requirement 1: Daily seed

**User Story:** As a player, I want everyone to play the same run today, so that the Hall of Fame
compares like with like.

#### Acceptance Criteria

1. THE module `src/game/dailySeed.ts` SHALL export a pure `dailySeed(day)` that returns the
   32-bit FNV-1a hash of `DEADLINE56K:` followed by the Day.
2. IF `day` does not match `YYYY-MM-DD`, THEN `dailySeed` SHALL throw.
3. THE Desktop_Scene's default seed source SHALL be `dailySeed(utcDay(new Date()))`, with
   `utcDay` in `src/core/clock.ts`, so Retry on the same Day replays the same Run.
4. THE injected `seedSource` used by tests SHALL keep working.

### Requirement 2: Run stats

**User Story:** As a developer, I want the counts the score needs to live in the Run state, so
that the score is a pure function of the Final_State.

#### Acceptance Criteria

1. THE `statsSystem` SHALL be appended to `createGameSystems` and keep `GameState.stats` with
   `kills` (non-Glob `mobKilled`), `bossKilled` (a boss `mobKilled` happened) and `adsClosed`
   (`adClosed` events; blocked ads don't count).
2. `GameState.stats` SHALL be absent until the system first runs and SHALL survive a JSON round
   trip.

### Requirement 3: Score

**User Story:** As a player, I want a score that rewards both fronts, so that a loss with good
play still ranks.

#### Acceptance Criteria

1. THE file `src/game/balance/score.ts` SHALL hold the score table and `SCORE_VERSION` (1):
   10 per whole download percent, 10 per kill, 200 for the boss, 20 per ad closed, 25 × best
   combo when it is at least 3, and a win bonus of 1,000 + 10 per integrity point + 5 per whole
   second under 240 s.
2. THE pure `scoreRun(final)` in `src/game/score.ts` SHALL return the Score_Breakdown and the
   total, using `final.tick / TICK_RATE` as the run seconds.
3. IF the Final_State phase is neither `won` nor `lost`, THEN `scoreRun` SHALL throw.
4. THE Score SHALL be a whole number ≥ 0, and a `won` Final_State SHALL always score more than
   the same Final_State marked `lost`.

### Requirement 4: Receipt

**User Story:** As a player, I want to see how my score was made, so that I know what to improve.

#### Acceptance Criteria

1. WHEN the Result_Screen reveals, THE Result_Screen SHALL show the Receipt: a monospace bill
   from "NetSurfer Billing Dept." with one line per non-zero part and the total.
2. THE Receipt SHALL appear for both outcomes, below the statistics and above the
   Guestbook_Form.
3. ALL Receipt text SHALL follow the `retro-copy` steering file and go in through `textContent`.

### Requirement 5: Guestbook form

**User Story:** As a player, I want to sign my name after a run, win or lose, so that my score
goes on the board.

#### Acceptance Criteria

1. WHEN the Result_Screen reveals, THE Result_Screen SHALL show "Sign our Guestbook!" with a name
   field, prefilled with the last Player_Name used, and a Sign button.
2. THE pure `normalizeName(raw)` SHALL trim the input and return the Player_Name, or `null` if it
   is not 3–12 allowed characters. THE Sign button SHALL be disabled while it returns `null`.
3. WHEN Sign is activated, by click or Enter in the field, THE Guestbook_Form SHALL submit once,
   show "Signing...", then show the player's rank today and today's top 10 with the new row
   highlighted.
4. THE Guestbook_Form SHALL submit at most once per Result_Screen.
5. IF the request fails or takes longer than 5 s, THEN THE Guestbook_Form SHALL show "Server
   busy. Try again later." and allow one more try.
6. IF the Leaderboard_Client has no configuration, THEN THE Guestbook_Form SHALL show "Guestbook
   closed for maintenance." with no field.
7. THE Result_Buttons SHALL keep working at all times, Retry SHALL keep the initial focus
   (replay-flow Requirement 1.2), and keys typed in the name field SHALL NOT trigger game
   hotkeys.
8. THE last Player_Name SHALL be stored in `localStorage` under `phantom98.guestbook`, and
   blocked or bad storage SHALL fall back to an empty field without errors.

### Requirement 6: Leaderboard client

**User Story:** As the team, we want one small, safe module for the network calls.

#### Acceptance Criteria

1. THE file `src/core/leaderboard.ts` SHALL export `createLeaderboardClient(config, fetchFn)` with
   `submit`, `topToday`, `topAllTime`, `rankToday` and `guestCount`, each resolving to
   `{ ok: true, value }` or `{ ok: false, reason }` and never throwing.
2. THE client SHALL call only `<url>/rest/v1/scores`, send the key in the `apikey` header only,
   encode every query value, and abort each request after 5 s.
3. THE configuration SHALL come only from `import.meta.env.VITE_SUPABASE_URL` and
   `import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY`, read in `src/core/leaderboardConfig.ts`.
4. IF the URL is not `https://` or the key does not start with `sb_publishable_`, THEN the
   configuration SHALL be `null`. A key starting with `sb_secret_` SHALL be refused with a console
   error that does not print the key.
5. THE client SHALL submit `name`, `score`, `outcome`, `seconds`, `download`, `kills` and
   `version` only. The database sets `id`, `created_at` and `day`.
6. THE game SHALL add no runtime dependency for this; it uses `fetch`.

### Requirement 7: Hall of Fame

**User Story:** As a player, I want to see the best scores from the title screen.

#### Acceptance Criteria

1. THE Title_Scene SHALL show the buttons Play game, Hall of Fame and Options, in that order.
2. WHEN Hall of Fame is activated, THE Title_Scene SHALL open a NetSurfer-style guestbook window
   with a guest counter, today's top 10 and the all-time top 10, and make the menu inert, like the
   Options_Dialog. Close and Escape SHALL close it.
3. WHILE the lists load, THE window SHALL show "Loading guestbook..."; on failure it SHALL show
   "Server busy. Try again later."
4. THE window SHALL use only original art, follow the `retro-copy` steering file, put names in
   through `textContent`, and flash no more than 3 times per second.
5. THE title model SHALL route the new actions so that Play is ignored while the Hall_of_Fame is
   open, like Options.

### Requirement 8: Database and secrets

**User Story:** As the team, we want the table to be safe to expose with the publishable key.

#### Acceptance Criteria

1. THE file `docs/leaderboard.sql` SHALL create `public.scores` with range checks on every
   column, enable row-level security, allow the `anon` role to select all rows and insert only the
   seven client columns, and allow no update or delete.
2. THE file `.env.example` SHALL list both variables with placeholder values, `.env` and
   `.env.*` (except `.env.example`) SHALL be gitignored, and the README SHALL explain the setup.
3. THE build test SHALL fail if any file in `dist/` or tracked in git matches
   `sb_secret_[A-Za-z0-9_-]{16,}`, which is a real secret key rather than the prefix the docs and
   the config check mention.

### Requirement 9: Docs and checks

**User Story:** As the team, we want the docs to match and a real end-to-end check.

#### Acceptance Criteria

1. THE `docs/game-design.md` section 12 SHALL match the score table.
2. THE file `docs/kiro-log.md` SHALL get a dated note.
3. THE `playtester` agent SHALL sign the guestbook after a loss and open the Hall of Fame, against
   the real table, and write its report to `docs/playtests/`.

## Decisions

1. **Plain fetch, no SDK.** Five REST calls don't justify a 30 KB dependency (tech steering asks
   before adding runtime dependencies).
2. **Client-side score.** Faking a score is possible with devtools. Database checks bound the
   damage; it is acceptable for a jam and keeps the spec within the deadline.
3. **Day set by the database.** The client can't backdate a row. Near midnight UTC a row may land
   on the next Day; that is acceptable.
4. **Retry keeps focus.** Fast retries after a loss matter more than typing speed; the name field
   is one click away and remembers the last name.
