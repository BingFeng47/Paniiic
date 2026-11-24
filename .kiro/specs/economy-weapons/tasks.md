# Implementation Plan: economy-weapons

## Overview

Add the economy types and balance, the two lane hooks, then the shop, weapons, guard and wallet
systems with their tests, then the HUD, input, drawing and sounds, and finally wiring, the skill
and docs. This spec depends on `lane-melee`, `browser-front` and `cross-front-and-director`. Read
`design.md` for the system slots and every number, and `.kiro/steering/game-balance.md` before
touching `src/game/balance/`.

## Tasks

- [x] 1. Types, balance and hooks
  - [x] 1.1 Create `src/game/economy/economyTypes.ts` and extend `src/game/types.ts` and `src/game/step.ts`
    - State, commands and events from the design; `GameState.economy?`; `step()` passes the new
      commands to the systems
    - _Requirements: 1.1, 13.1, 13.3_
  - [x] 1.2 Create `src/game/balance/economy.ts`
    - Defaults table, `resolveEconomyBalance`, `EconomyBalanceError`
    - _Requirements: 4.1, 8.4_
  - [x] 1.3 Add the lane hooks
    - `createLaneSystems({ weapons })` slot in `src/game/lane.ts`; `src/game/economy/guard.ts`
      with `hitModem`, called from `mobSystem` and the Glob impact; the hammer reads the
      active weapon and the heavy head
    - _Requirements: 6.1, 6.2, 10.1, 10.2_
  - [x] 1.4 Write `tests/game/balance/economy.test.ts` and the hook tests
    - Without an EconomyState every lane test passes unchanged; heavy head gives 2 damage at a
      0.3 s cooldown
    - _Requirements: 4.1, 6.1, 6.2_

- [x] 2. Economy rules
  - [x] 2.1 Create `src/game/economy/shop.ts`
    - `nextItem`, `slotStatus`, buy with reject reasons, item effects, switch cycling
    - _Requirements: 4.2, 4.3, 4.4, 5.3, 9.1, 10.4_
  - [x] 2.2 Create `src/game/economy/weapons.ts`
    - `weaponSystem`: input handling, saw with carry, flame cone, fuel, latch and refill, burns
    - _Requirements: 4.7, 5.3, 7.1, 7.2, 8.1, 8.2, 8.3, 8.5_
  - [x] 2.3 Create `src/game/economy/wallet.ts`
    - `walletSystem`: drops, pickups, ad KB, fake loss, the blocker clearing clutter, and
      blocker and surge timers
    - _Requirements: 1.2, 2.1, 2.2, 2.3, 3.1, 3.2, 9.2, 9.3, 9.4, 10.3_
  - [x] 2.4 Create `src/game/economy/index.ts` with `createEconomySystems()`
    - Returns `{ weapons, wallet }` for the two slots
    - _Requirements: 13.5_
  - [x] 2.5 Write example tests in `tests/game/economy/`
    - The examples in the design's testing strategy
    - _Requirements: 2.2, 2.3, 3.2, 4.3, 6.1, 7.1, 8.1, 8.2, 8.5, 9.2, 10.2_
  - [x] 2.6 Write `tests/game/economy/economyProperties.test.ts`
    - Property 1: KB is conserved — _Requirements: 1.1, 1.2, 1.3, 1.4, 3.1, 3.2_
    - Property 2: packets are collected at most once — _Requirements: 2.1, 2.2, 2.3_
    - Property 3: the shop matches its model — _Requirements: 4.2, 4.3, 4.4, 5.3, 10.4_
    - Property 4: saw kills a tank on time — _Requirements: 7.1, 7.2, 7.3_
    - Property 5: fuel stays in range and latches at empty — _Requirements: 8.3, 8.4, 8.5_
    - Property 6: surge blocks a 5 s window that starts at a hit — _Requirements: 10.1, 10.2, 10.3_
    - Property 7: the blocker clears clutter only — _Requirements: 9.2, 9.3_
    - Property 8: economy runs are deterministic and plain data — _Requirements: 13.1, 13.2_

- [x] 3. Checkpoint
  - Run `npm run typecheck` and `npm test`; ask the user if questions arise.

- [x] 4. View, HUD and sounds
  - [x] 4.1 Update `src/render/laneView.ts` input and drawing
    - Batched `lanePointer`; hotkeys, Q/E and wheel; presses by active weapon; packets with
      fade; saw and flame cursors; flame wedge
    - _Requirements: 2.4, 2.5, 4.5, 5.1, 5.2, 5.4, 7.4_
  - [x] 4.2 Create `src/ui/shopTray.ts` and `src/ui/economyCopy.ts`
    - KB counter, five slots with states, active ring, fuel gauge, timers; click to buy; OSD
      styling in `src/styles/lane.css`
    - _Requirements: 4.6, 8.6, 11.1, 11.2, 11.3, 11.4_
  - [x] 4.3 Create `src/render/economySounds.ts`
    - Six one-shot recipes and two loops, Web Audio nodes only
    - _Requirements: 12.1, 12.2, 12.3_
  - [x] 4.4 Write view, HUD and sound tests
    - The checks listed in the design's testing strategy
    - _Requirements: 2.4, 4.5, 4.6, 5.1, 5.2, 5.4, 11.2, 11.3, 12.1, 12.2_

- [x] 5. Wiring and target check
  - [x] 5.1 Register the economy in `src/dialup/sessionRegistry.ts`
    - `weapons` in the lane slot, `wallet` after the ad systems
    - _Requirements: 13.5_
  - [x] 5.2 Write `tests/game/economy/economyTarget.test.ts`
    - A killer and collector bot reaches wallet + spent ≥ 60 by 70 s
    - _Requirements: 13.4_

- [x] 6. Skill and docs
  - [x] 6.1 Write `.kiro/skills/add-weapon/SKILL.md` and extend `tests/skills.test.ts`
    - _Requirements: 14.1, 14.2_
  - [x] 6.2 Add a dated note to `docs/kiro-log.md`
    - _Requirements: 14.3_

- [x] 7. Final checkpoint
  - Run `npm run typecheck`, `npm test` and `npm run build`. Manual check in `npm run dev`:
    packets drop and collect on hover, hotkeys buy, the saw melts a tank, the flame runs dry and
    refills, the surge blocks a crowd for 5 s, and the blocker clears banners; ask the user if
    questions arise.

- [x] 8. Tray placement
  - [x] 8.1 Move the Shop_Tray to the top centre of the lane
    - Move `.shop-tray` in `src/styles/lane.css` to the top centre of `.lane-view` (top offset,
      `left: 50%`, `translateX(-50%)`), and collapse it to one compact row if the top band is too
      short to stay clear of the Hit_Boxes.
    - Raise readability: bigger font, solid OSD backing, brighter affordable state.
    - Add a test that the tray mounts inside `.lane-view` with its top-centre class; keep the
      existing tests unchanged.
    - Manual check in `npm run dev`: the tray overlaps no CCTV label and no mob near the top.
    - _Requirements: 11.5_
## Notes

- Tasks marked with `*` are optional test tasks; Property 1 is the core economy guard and is
  worth keeping.
- Never weaken a failing test; fix the code or stop and explain.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["1.3", "2.1"] },
    { "id": 2, "tasks": ["1.4", "2.2", "2.3"] },
    { "id": 3, "tasks": ["2.4"] },
    { "id": 4, "tasks": ["2.5", "2.6", "4.3"] },
    { "id": 5, "tasks": ["3"] },
    { "id": 6, "tasks": ["4.1", "4.2", "5.1"] },
    { "id": 7, "tasks": ["4.4", "5.2", "6.1"] },
    { "id": 8, "tasks": ["6.2"] },
    { "id": 9, "tasks": ["7"] },
    { "id": 10, "tasks": ["8.1"] }
  ]
}
```
