# Requirements Document

## Introduction

The zombie-sim-mcp feature is our own MCP server in `tools/mcp-sim/`. It lets Kiro play whole
runs headless with scripted bot players, report win rates and timings against the targets in the
`game-balance` steering file, and check the team's sprite files against the `sprites` steering
file. A `balance-tuner` custom agent uses it to propose balance changes, and a hook runs a quick
balance check when balance files change. It is milestone 7 in `docs/roadmap.md`.

The server reuses the pure simulation in `src/game/` and `runHeadless`. It never needs a browser.

Out of scope: tuning the game itself (that is the agent's job once the tool exists) and any
network access.

## Glossary

Terms from game-core and the later specs keep their meaning (Run, Tick, seed, `runHeadless`,
balance overrides, Chapter, Wallet, Shop_Slot, Ad, Close_Pattern). New terms:

- **Sim_Server**: the MCP server in `tools/mcp-sim/`, run over stdio with Node.
- **Tool**: an MCP tool the Sim_Server offers: `simulate_run`, `balance_report` or
  `validate_sprites`.
- **Bot_Policy**: a deterministic scripted player that reads the Run state each Tick and sends
  input commands like a real player: `idle`, `casual`, `competent` or `perfect`.
- **Reaction_Delay**: the Ticks a Bot_Policy waits before reacting to something new.
- **Run_Summary**: the result of one bot Run: outcome, end time, per-second integrity, download
  progress and Wallet, chapter start times, purchases and the number of Ad_Mistakes.
- **Balance_Targets**: the targets in `.kiro/steering/game-balance.md`: about 150 s for a winning
  run, the saw affordable by about 70 s, the flamethrower by about 90 s, and integrity critical
  during Plot turn 2 for most players.
- **Target_Check**: one Balance_Target with its measured value and a `pass` or `warn` result.
- **Sprite_Problem**: one broken sprite rule, with the file path and the rule.
- **Balance_Tuner**: the custom agent in `.kiro/agents/balance-tuner.md`.
- **Balance_Hook**: the Kiro hook that runs a quick balance report after a file in
  `src/game/balance/` is saved.

## Requirements

### Requirement 1: Server

**User Story:** As a developer, I want the simulator available to Kiro as an MCP server, so that
balance questions get measured answers.

#### Acceptance Criteria

1. THE Sim_Server SHALL start over stdio with one Node command and offer the Tools
   `simulate_run`, `balance_report` and `validate_sprites`, each with a JSON input schema.
2. THE workspace `.kiro/settings/mcp.json` SHALL list the Sim_Server under the name `zombie-sim`,
   and `docs/mcp.example.json` SHALL show the same entry.
3. IF a Tool receives input that does not match its schema, THEN THE Sim_Server SHALL return an
   MCP tool error naming every invalid field and keep running.
4. IF a Run throws, THEN THE Sim_Server SHALL return an MCP tool error with the seed and the
   message and keep running.
5. THE Sim_Server SHALL make no network requests and write no files.

### Requirement 2: Bot players

**User Story:** As a designer, I want bots of different skill, so that a report shows how the run
feels for different players.

#### Acceptance Criteria

1. THE Bot_Policies SHALL send only the input commands a real player can send, and SHALL read the
   Run state without changing it.
2. THE `idle` Bot_Policy SHALL send no commands.
3. THE `casual`, `competent` and `perfect` Bot_Policies SHALL click the Real_Link, attack Mobs,
   collect Data_Packets, close Ads with their Correct_Control and buy Items in Shop_Slot order,
   with Reaction_Delays of 30, 15 and 0 Ticks.
4. THE `casual` and `competent` Bot_Policies SHALL make Ad_Mistakes and fake-button clicks at the
   rates set in the bot table, chosen with an RNG seeded from the Run seed.
5. WHEN a Bot_Policy plays the same seed with the same balance twice, THE two Runs SHALL produce
   the same Run_Summary.

### Requirement 3: simulate_run

**User Story:** As a designer, I want to watch one run as numbers, so that I can see where a run
went wrong.

#### Acceptance Criteria

1. WHEN `simulate_run` receives a seed, a Bot_Policy and optional balance overrides and maximum
   seconds, THE Sim_Server SHALL play one Run and return its Run_Summary.
2. THE Sim_Server SHALL apply the balance overrides to that Run only.

### Requirement 4: balance_report

**User Story:** As a designer, I want win rates and timings over many seeds, so that I can tell a
real improvement from luck.

#### Acceptance Criteria

1. WHEN `balance_report` receives a seed count, a first seed, a list of Bot_Policies and optional
   balance overrides, THE Sim_Server SHALL play one Run per seed per Bot_Policy.
2. THE `balance_report` result SHALL give for each Bot_Policy the win rate, the median run length
   of wins, the median times the Wallet plus KB spent reaches 60 and 180 KB, and the share of Runs
   critical during Plot turn 2.
3. THE `balance_report` result SHALL list one Target_Check per Balance_Target for the `competent`
   Bot_Policy.
4. WHEN `balance_report` receives baseline overrides as well, THE result SHALL show each number
   for the baseline and the proposal side by side.
5. WHEN `balance_report` plays 50 seeds for 3 Bot_Policies, THE Sim_Server SHALL return within 60
   seconds on a developer laptop.

### Requirement 5: validate_sprites

**User Story:** As an artist, I want my frames checked before they go in, so that a broken SVG
never reaches the game.

#### Acceptance Criteria

1. WHEN `validate_sprites` runs, THE Sim_Server SHALL check every file in `assets/sprites/`
   against the `sprites` steering file: the path convention, frame numbers from `00` with no
   gaps, one `viewBox` per entity, no scripts, no external references, no raster images, no web
   fonts and a size under 20 KB.
2. THE `validate_sprites` result SHALL list every Sprite_Problem and the entities and animations
   the renderer uses that have no team frames yet.
3. THE Sim_Server SHALL only read files in `assets/sprites/`.

### Requirement 6: Balance tuner agent

**User Story:** As a team, we want an agent that tunes with evidence, so that balance changes
come with before-and-after numbers.

#### Acceptance Criteria

1. THE repository SHALL contain `.kiro/agents/balance-tuner.md` with access to the `zombie-sim`
   Tools and write access only to `src/game/balance/` and `docs/balance/`.
2. THE Balance_Tuner SHALL state for each change the old value, the new value, the reason and the
   `balance_report` numbers before and after, as the `game-balance` steering file requires.
3. THE Balance_Tuner SHALL write each tuning report to `docs/balance/YYYY-MM-DD-<topic>.md`.

### Requirement 7: Balance hook

**User Story:** As a developer, I want a quick balance check whenever tuning changes, so that a
bad number is caught on save.

#### Acceptance Criteria

1. THE repository SHALL contain a Balance_Hook in `.kiro/hooks/` that runs after a file in
   `src/game/balance/` is saved.
2. WHEN the Balance_Hook runs, THE Balance_Hook SHALL play 20 seeds with the `competent`
   Bot_Policy and print the win rate and each Target_Check in at most 10 lines.
3. IF the balance files fail validation, THEN THE Balance_Hook SHALL print the validation
   problems instead of a report.

### Requirement 8: Tests, dependencies and docs

**User Story:** As the team, we want the tool tested and documented, so that it is trusted and
shows up in the Kiro story.

#### Acceptance Criteria

1. THE Tool handlers SHALL be plain functions tested with Vitest in `tests/tools/mcp-sim/`
   without starting the server.
2. THE Sim_Server SHALL add no dependency other than the MCP SDK, as a dev dependency (approved
   by the team on 22 Nov 2026), so that nothing new ships with the game.
3. THE file `docs/kiro-log.md` SHALL contain a dated note under "Notes" describing the Sim_Server,
   the Balance_Tuner and the Balance_Hook.

## Decisions

1. **Bots, not recordings.** Bots that play through the same input commands as a person keep the
   tool honest when the rules change.
2. **New folder `docs/balance/`** for tuning reports, beside `docs/playtests/`.
3. **Runtime cost:** the server runs TypeScript through the existing Vite/Vitest toolchain or a
   small build step chosen in the design, so no new runtime dependency ships with the game.
