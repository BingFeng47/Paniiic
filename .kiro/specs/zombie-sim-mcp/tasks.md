# Implementation Plan: zombie-sim-mcp

## Overview

Build the bot loop and policies first, then the report and sprite handlers, then the MCP server,
build step, config, CLI hook and the balance-tuner agent. Depends on every gameplay spec
(`lane-melee`, `browser-front`, `cross-front-and-director`, `economy-weapons`) and on final-art's
`validate.ts`. Read `design.md` for interfaces and targets. Ask before adding any package other
than `@modelcontextprotocol/sdk`.

## Tasks

- [x] 1. Setup
  - [x] 1.1 Add the MCP SDK dev dependency, the build config and npm scripts
    - `@modelcontextprotocol/sdk` (dev); `tools/mcp-sim/vite.config.ts` SSR library build to
      `tools/mcp-sim/dist/`; scripts `sim:build` and `sim:check`; `tools/mcp-sim/dist/` in
      `.gitignore`
    - _Requirements: 1.1, 8.2_

- [x] 2. Bot loop and policies
  - [x] 2.1 Create `tools/mcp-sim/src/runBot.ts`
    - `runBot` over `createRun` and `step` with the registry systems and per-Run overrides;
      per-second summary, chapter starts, purchases, mistakes, critical in Plot turn 2; errors
      carry the seed
    - _Requirements: 1.4, 3.1, 3.2_
  - [x] 2.2 Create `tools/mcp-sim/src/policies.ts`
    - `idle`, `casual`, `competent`, `perfect`, `BOT_TABLE`, the bot's own seeded RNG, the
      priority list and plain `BotMemory`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_
  - [x] 2.3 Write `tests/tools/mcp-sim/runBot.test.ts`
    - Property 1: bot runs are deterministic — _Requirements: 2.5, 3.1_
    - Property 2: bots only send player commands and never change state — _Requirements: 2.1, 2.2_
    - Property 3: overrides apply to one Run only — _Requirements: 3.2_
    - Idle loses before 120 s; perfect wins with a short-download override

- [x] 3. Handlers
  - [x] 3.1 Create `tools/mcp-sim/src/report.ts`
    - `balanceReport` with `PolicyStats`, baseline side by side on the same seeds, `TARGETS` and
      Target_Checks, elapsed time
    - _Requirements: 4.1, 4.2, 4.3, 4.4_
  - [x] 3.2 Create `tools/mcp-sim/src/sprites.ts`
    - Read only `assets/sprites/**`, reject escaping paths, run `validateSprites`, list missing
      animations
    - _Requirements: 5.1, 5.2, 5.3_
  - [x] 3.3 Write `tests/tools/mcp-sim/report.test.ts` and `sprites.test.ts`
    - Property 4: report statistics match the runs — _Requirements: 4.1, 4.2, 4.3, 4.4_
    - Sprite path escape, missing list, empty folder
    - _Requirements: 5.1, 5.2, 5.3_
  - [x] 3.4 Write `tests/tools/mcp-sim/perf.test.ts`
    - 50 seeds × 3 policies under 60 s, long timeout
    - _Requirements: 4.5_

- [x] 4. Checkpoint
  - Run `npm run typecheck` and `npm test`; if the perf test fails, profile `runBot` before
    changing defaults, and ask the user if questions arise.

- [x] 5. Server and config
  - [x] 5.1 Create `tools/mcp-sim/src/schemas.ts` and `tools/mcp-sim/src/server.ts`
    - zod schemas; three Tools on `McpServer` with stdio; schema and Run errors as `isError`
      results; no network or writes
    - _Requirements: 1.1, 1.3, 1.4, 1.5_
  - [x] 5.2 Register the server in `.kiro/settings/mcp.json` and `docs/mcp.example.json`
    - The `zombie-sim` entry from the design; README run steps include `npm run sim:build`
    - _Requirements: 1.2_
  - [x] 5.3 Write `tests/tools/mcp-sim/server.test.ts`
    - Property 5: invalid input is reported, not thrown — _Requirements: 1.3, 1.4_
    - In-memory transport lists three Tools; bundle has no `fetch`, `http` or `writeFile`
    - _Requirements: 1.1, 1.5_

- [x] 6. Hook and agent
  - [x] 6.1 Create `tools/mcp-sim/src/check.ts` and `.kiro/hooks/balance-check.json`
    - Validate balances first; 20 seeds with `competent`; at most 10 lines; hook on saves in
      `src/game/balance/**` running `npm run sim:check`
    - _Requirements: 7.1, 7.2, 7.3_
  - [x] 6.2 Write `tests/tools/mcp-sim/check.test.ts`
    - _Requirements: 7.2, 7.3_
  - [x] 6.3 Create `.kiro/agents/balance-tuner.md`
    - `zombie-sim` tools, read, write only to `src/game/balance/**` and `docs/balance/**`; the
      baseline → change → compare → report workflow
    - _Requirements: 6.1, 6.2, 6.3_

- [x] 7. First tuning pass and docs
  - [x] 7.1 Run the `balance-tuner` agent once
    - Baseline report for 50 seeds, at least one proposed change with a report in
      `docs/balance/`
    - _Requirements: 6.2, 6.3_
  - [x] 7.2 Add a dated note to `docs/kiro-log.md`
    - The server, the agent and the hook
    - _Requirements: 8.3_

- [x] 8. Final checkpoint
  - Run `npm run typecheck`, `npm test`, `npm run build` and `npm run sim:build`. In Kiro, check
    the `zombie-sim` server connects and `balance_report` answers; save a balance file and see
    the hook's report; ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional test tasks; 3.4 guards the 60-second budget.
- The game build must not include anything from `tools/`; `npm run build` stays unchanged.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["2.1", "2.2", "3.2"] },
    { "id": 2, "tasks": ["2.3", "3.1"] },
    { "id": 3, "tasks": ["3.3", "3.4"] },
    { "id": 4, "tasks": ["4"] },
    { "id": 5, "tasks": ["5.1", "6.1", "6.3"] },
    { "id": 6, "tasks": ["5.2", "5.3", "6.2"] },
    { "id": 7, "tasks": ["7.1", "7.2"] },
    { "id": 8, "tasks": ["8"] }
  ]
}
```
