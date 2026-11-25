# Implementation Plan: leaderboard

## Overview

Pure parts first (daily seed, stats, score), then the network client, then the Result_Screen and
Title_Scene UI, then a real end-to-end check. Build after `pacing-and-economy` (it reads
`bestCombo` and uses `createGameSystems`). Before task 7, the team must paste
`docs/leaderboard.sql` into the Supabase SQL editor. No task needs the secret key or the database
password.

## Tasks

- [x] 1. Daily seed
  - [x] 1.1 Create `src/game/dailySeed.ts` and `src/core/clock.ts`; make the daily seed the
    Desktop_Scene default
    - _Requirements: 1.1, 1.2, 1.3, 1.4_
  - [x] 1.2 Tests: Property 1 and the Desktop_Scene default seed
    - _Requirements: 1.1–1.4_
- [x] 2. Stats and score
  - [x] 2.1 Create `src/game/stats.ts`, add `GameState.stats?`, append `statsSystem` in
    `createGameSystems`
    - _Requirements: 2.1, 2.2_
  - [x] 2.2 Create `src/game/balance/score.ts` and `src/game/score.ts`
    - _Requirements: 3.1, 3.2, 3.3, 3.4_
  - [x] 2.3 Tests: Properties 2–3 in `tests/game/stats.test.ts` and `tests/game/score.test.ts`
    - _Requirements: 2.1, 2.2, 3.1–3.4_
- [x] 3. Leaderboard client
  - [x] 3.1 Create `src/core/leaderboardConfig.ts` and `src/core/leaderboard.ts`
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_
  - [x] 3.2 Tests: Property 5 and the request shapes in `tests/core/leaderboard.test.ts`
    - _Requirements: 6.1–6.5_
- [x] 4. Checkpoint
  - Run `npm run typecheck` and `npm test`; ask the user if questions arise.
- [x] 5. Result_Screen
  - [x] 5.1 Create `src/ui/guestbook/guestbookName.ts` with Property 4 tests
    - _Requirements: 5.2, 5.8_
  - [x] 5.2 Receipt in the Result_Screen; copy in `src/ui/resultCopy.ts`
    - Load `.kiro/steering/retro-copy.md` for the copy
    - _Requirements: 4.1, 4.2, 4.3_
  - [x] 5.3 Create `src/ui/guestbook/guestbookForm.ts` and mount it in the Result_Screen; pass the
    shared client from `src/scenes/index.ts` through the Desktop_Scene
    - _Requirements: 5.1, 5.3, 5.4, 5.5, 5.6, 5.7_
  - [x] 5.4 Result_Screen tests for 5.2–5.3
    - _Requirements: 4.1, 5.1–5.8_
- [x] 6. Hall of Fame
  - [x] 6.1 Title model actions, the Hall of Fame button and window, styles
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_
  - [x] 6.2 Title tests: button order, open/close, Play ignored while open, failure text
    - _Requirements: 7.1–7.5_
- [x] 7. Database, secrets and docs
  - [x] 7.1 Check `docs/leaderboard.sql` against the design; confirm `.env.example` and
    `.gitignore`; add the README setup section
    - _Requirements: 8.1, 8.2_
  - [x] 7.2 Create `tests/docs/secrets.test.ts`
    - _Requirements: 8.3_
  - [x] 7.3 Check `docs/game-design.md` section 12; dated note in `docs/kiro-log.md`
    - _Requirements: 9.1, 9.2_
- [x] 8. End-to-end
  - [x] 8.1 Ask the user to confirm the table exists (a `GET /rest/v1/scores?limit=1` with the
    publishable key returns 200), then run the `playtester` agent: lose a run, sign the
    guestbook, see the rank, open the Hall of Fame
    - _Requirements: 9.3_
- [x] 9. Final checkpoint
  - Run `npm run typecheck`, `npm test` and `npm run build`; ask the user if questions arise.

## Notes

- Never put the secret key anywhere. If a task seems to need it, stop and ask.
- Never weaken a failing test.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1", "3.1"] },
    { "id": 1, "tasks": ["1.2", "2.2", "3.2"] },
    { "id": 2, "tasks": ["2.3"] },
    { "id": 3, "tasks": ["4"] },
    { "id": 4, "tasks": ["5.1", "5.2", "6.1"] },
    { "id": 5, "tasks": ["5.3", "6.2"] },
    { "id": 6, "tasks": ["5.4", "7.1", "7.2", "7.3"] },
    { "id": 7, "tasks": ["8.1"] },
    { "id": 8, "tasks": ["9"] }
  ]
}
```
