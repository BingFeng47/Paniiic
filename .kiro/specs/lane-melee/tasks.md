# Implementation Plan: lane-melee

## Overview

Change the lane so melee Mobs stay at the modem and hit it on a timer. Work bottom-up: balance and
types, then the mob rules and their tests, then drawing and sounds, then the skill, docs and the
connection-lane playtest that was left open. Read `design.md` for every number and interface, and
`.kiro/steering/game-balance.md` before touching `src/game/balance/`. Only the tests listed in the
design's "Replaced connection-lane tests" table may change their assertions.

## Tasks

- [x] 1. Balance and types
  - [x] 1.1 Add melee types and the `mobArrived` event in `src/game/laneTypes.ts`
    - `MeleeKind`, frozen `MELEE_KINDS`, `isMeleeKind`, `isAttacker`; `nextHitTick` and
      `lastMeleeTick` on the default, fast, tank and boss Enemy variants; `mobArrived` in
      `LaneEventBody`
    - _Requirements: 1.2, 6.1_
  - [x] 1.2 Add the `melee` table to `src/game/balance/lane.ts`
    - `MeleeStats`, `LaneBalance.melee`, `LaneBalanceOverrides.melee`, `attackPoint()`; new
      defaults (damage 4 / 3 / 10 / 20, intervals 1.5 / 1 / 2 / 2 s); field-by-field merge; the
      two new validation problems collected with the rest
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 2.5_
  - [x]* 1.3 Update `tests/game/balance/lane.test.ts`
    - Replace the section 5 damage test with the new values (listed in the design); add melee
      merge, each new validation problem and two problems listed together
    - _Requirements: 5.2, 5.3_

- [x] 2. Mob rules
  - [x] 2.1 Update `addMob` and `mobSystem` in `src/game/mobs.ts`
    - `addMob` clamps a melee Mob to `[attackPoint, laneLength]` and starts both fields at `null`
    - Attackers don't move; melee arrival sets x, `nextHitTick = tick` and emits `mobArrived`;
      Melee_Hit emits `mobBit`, calls `damageModem`, emits the first-hit burst for tanks and
      bosses, sets `lastMeleeTick` and advances `nextHitTick`; Globs keep the old impact
    - Update the file's doc comments to describe the new rules
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 2.1, 2.2, 2.3, 3.1, 3.2, 3.3, 3.5, 4.1, 4.2, 4.3, 4.4, 6.3_
  - [x] 2.2 Update the lane test helpers in `tests/helpers/lane.ts`
    - Melee fixtures default `nextHitTick: null, lastMeleeTick: null`; add a helper that builds an
      Attacker at its Attack_Point; fixture shape only, no assertion changes
    - _Requirements: 8.1_
  - [x]* 2.3 Replace the bite examples in `tests/game/mobs.test.ts`
    - The five tests in the design's table, plus: second hit 90 ticks later; tank and boss second
      hit has no burst; hammer kill on a hit Tick cancels the hit; Glob still impacts for 5;
      `addMob` clamping; ranged Mobs never become Attackers
    - _Requirements: 1.1, 1.2, 1.5, 2.1, 2.3, 3.2, 3.3, 3.4, 3.5, 4.1, 4.2, 4.3, 8.1_
  - [x]* 2.4 Write lane-melee Properties 1, 2, 3, 6 and 7 in `tests/game/laneMeleeProperties.test.ts`
    - Extend `arbLaneRun` (or add an arbitrary) so melee Mobs spawn near the modem and Attackers
      appear in short runs
    - Property 1: Attackers stand still at their Attack_Point — _Requirements: 1.1, 1.3, 1.4_
    - Property 2: hits follow the Hit_Interval — _Requirements: 1.2, 2.1, 2.4, 2.5_
    - Property 3: killed Attackers stop hitting — _Requirements: 3.1, 3.2, 3.3_
    - Property 6: one burst per tank or boss arrival — _Requirements: 4.1, 4.2, 4.3_
    - Property 7: same-Tick hits resolve in id order — _Requirements: 2.3_
  - [x]* 2.5 Replace connection-lane Property 4 in `tests/game/laneProperties.test.ts`
    - lane-melee Property 4: Mobs leave only by `mobKilled`, Globs by `mobKilled` or one
      `mobBit`; keep Property 5 and every other property unchanged
    - _Requirements: 1.5, 3.2, 6.2, 8.1, 8.2_
  - [x]* 2.6 Add the idle-run check to `tests/game/lane.test.ts`
    - `runHeadless` with lane systems and no commands ends `lost`, with every `modemHit`
      preceded by a `mobBit` from a melee Mob or a Glob
    - _Requirements: 6.4_

- [x] 3. Checkpoint
  - Run `npm run typecheck` and `npm test`. Every test outside the design's replacement table
    must pass unchanged; ask the user if questions arise.

- [x] 4. Drawing and sounds
  - [x] 4.1 Update `src/render/laneDrawList.ts`
    - `enemyAnimation` Attacker branch (`hit`, then `attack` for 12 Ticks after each hit, then
      `idle`); exported `attackerOffset(id, hitPadding)`; Attacker feet drawn with the offset
    - _Requirements: 7.1, 7.2_
  - [x] 4.2 Add the `zombieGroan` recipe to `src/render/laneSounds.ts`
    - Synthesized with Web Audio nodes only; `soundFor` maps `mobArrived` to it
    - _Requirements: 7.3, 7.4_
  - [x]* 4.3 Update `tests/render/laneDrawList.test.ts` and `tests/render/laneSounds.test.ts`
    - lane-melee Property 8 in place of the Property 13 feet check; Attacker animation examples;
      `attackerOffset` returns -6, 0, 6; `mobArrived` plays once per frame; the shake still
      follows every `modemHit` and Screen_Shake
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 8.2_

- [x] 5. Skill and docs
  - [x] 5.1 Update `.kiro/skills/add-mob/SKILL.md`
    - Hit_Damage per hit, the `melee` row and `MELEE_KINDS` for melee kinds; every backticked
      path must exist (`tests/skills.test.ts`)
    - _Requirements: 8.3_
  - [x] 5.2 Add a dated note to `docs/kiro-log.md`
    - One line under "Notes": melee rule, first-hit bursts, property count, replaced tests
    - _Requirements: 8.5_

- [x] 6. Playtester smoke run
  - Invoke the `playtester` agent to play boot → desktop → dial-up for about 40 seconds, let at
    least one zombie reach the modem, confirm it stays and keeps hitting, kill it, and write
    `docs/playtests/YYYY-MM-DD-lane-melee-smoke.md`. This also closes connection-lane task 10.
  - If the dev server or Playwright MCP is unavailable, skip this task and say so
  - _Requirements: 7.1, 7.3, 7.5_

- [x] 7. Final checkpoint
  - Run `npm run typecheck`, `npm test` and `npm run build`. Manual check in `npm run dev`: a
    zombie at the modem stays, plays its attack animation, groans on arrival and drains integrity
    in steps; killing it stops the drain; ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional test tasks, but 2.3–2.5 replace tests that would otherwise
  fail, so they are needed before checkpoint 3 passes.
- Never weaken a failing test outside the replacement table; fix the code or stop and explain.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2"] },
    { "id": 2, "tasks": ["1.3", "2.1", "2.2"] },
    { "id": 3, "tasks": ["2.3", "2.4", "2.5", "2.6", "4.1", "4.2"] },
    { "id": 4, "tasks": ["3", "4.3", "5.1"] },
    { "id": 5, "tasks": ["5.2", "6"] },
    { "id": 6, "tasks": ["7"] }
  ]
}
```
