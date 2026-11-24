# Design Document: pacing-and-economy

## Overview

Mostly data, plus three small pieces of logic:

1. **Data**: new core rate, chapter table, drops, prices, packet life and ad reward.
2. **Boss_Trigger** in `directorLane`: progress first, clock fallback.
3. **Combo** in `walletSystem`, with a view in the CCTV display.
4. **Bot cursor** in `tools/mcp-sim/src/policies.ts` and new targets in `report.ts`.

Then the `balance-tuner` agent tunes against the targets.

## Components and Interfaces

### Data changes

| File | Key | Old | New |
|---|---|---|---|
| `balance/core.ts` | `downloadPercentPerSecond` | 100 / 110 | 100 / 135 |
| `balance/chapters.ts` | chapter starts | 0, 20, 45, 70, 90, 115 | 0, 20, 55, 90, 115, 145 |
| `balance/chapters.ts` | waves, ad rows | see old table | Requirement 2 tables |
| `balance/chapters.ts` | `bossSecond` | 118 | removed |
| `balance/chapters.ts` | `bossAtPercent` | – | 65 |
| `balance/chapters.ts` | `bossLatestSecond` | – | 200 |
| `balance/lane.ts` | `enemies.boss.speed` | 26 | 32 |
| `balance/lane.ts` | `dropKb` default/fast/tank/ranged/boss/glob | 5/8/20/15/100/1 | 3/4/12/8/60/0 |
| `balance/lane.ts` | placeholder `spawns` boss | 118 | 160 (placeholder only) |
| `balance/economy.ts` | `prices.saw` / `prices.flamethrower` | 60 / 120 | 75 / 150 |
| `balance/economy.ts` | `packetLifetimeSeconds` | 4 | 3 |
| `balance/economy.ts` | `comboWindowSeconds` / `comboStart` / `comboBonusKb` | – | 2 / 3 / 1 |
| `balance/ads.ts` | `rewardKb` | 2 | 3 |

The placeholder ad `schedule` in `balance/ads.ts` is only used by tests without the Director; it
is left alone.

### Boss_Trigger (`src/game/director/directorLane.ts`)

```ts
const due = draft.download >= t.bossAtPercent - 1e-9 || tick >= secondsToTicks(t.bossLatestSecond);
if (!director.bossDone && due) { addMob(...'boss'...); emit beat bossRise; bossDone = true }
```

`directorLane` runs in stage 4, before the download stage, so it sees the download from the end
of the previous Tick. The boss therefore rises on the Tick after the bar crosses 65%, like the
Midpoint_Calm. Validation drops the "bossSecond ≥ Plot turn 2 start" rule and adds the two new
range rules. The MCP schemas and `simulate_run` accept the new keys through the existing
`chapters` override.

### Combo (`src/game/economy/wallet.ts`)

Economy_State gains `comboCount: number`, `lastKillTick: number | null`, `bestCombo: number`.
For each `mobKilled` with `kind !== 'glob'` in event order:

```ts
const win = secondsToTicks(b.comboWindowSeconds);
e.comboCount = e.lastKillTick !== null && ctx.tick - e.lastKillTick <= win ? e.comboCount + 1 : 1;
e.lastKillTick = ctx.tick;
e.bestCombo = Math.max(e.bestCombo, e.comboCount);
if (e.comboCount >= b.comboStart) {
  ctx.emit({ type: 'combo', count: e.comboCount });
  addKb(e, ctx, b.comboBonusKb, 'combo');
}
```

`KbReason` gains `'combo'`; `EconomyEventBody` gains `{ type: 'combo'; count: number }`. The
currency conservation property still holds: the bonus goes through `addKb`.

View: `src/render/laneView.ts` (or the CCTV OSD module from `lane-cctv`) keeps the last combo
and the Tick it arrived, and draws "COMBO xN +1 KB" in the OSD font for 60 Ticks. Copy lives in
`src/ui/laneCopy.ts`. Sound in `src/render/economySounds.ts`: a square blip at
`440 × 2^(min(N, 10) / 12)` Hz.

### Bot cursor (`tools/mcp-sim/src/policies.ts`)

- `BotParams.cursorPxPerSecond`; `BotMemory.cursor: { x: number; y: number }` and
  `BotMemory.goal: { x: number; y: number } | null`.
- Each Tick the policy picks its intended action as today, turns it into a Screen point (an Ad
  control's centre from the Ad rect and the control offsets in `closePatterns`/`adDom` geometry;
  a lane target through `src/render/laneLayout.ts`), moves the cursor toward it, and emits the
  command only on the Tick the cursor arrives.
- While the cursor is in the Lane_Dock rect, the bot emits `lanePointer` at the cursor's lane
  position (with `down` as the weapon needs), replacing today's direct packet hops.
- If the needed geometry lives only in a DOM module, move the pure numbers into a shared
  constant module the DOM module also imports; do not duplicate them.

### Report (`tools/mcp-sim/src/report.ts`)

- Replace `median60KbSeconds` / `median180KbSeconds` with `medianSawKbSeconds` and
  `medianFlameKbSeconds`, computed from the run's economy prices.
- Add `medianEarnedAtWin`, `bossArrivedShare` (wins with a boss `mobArrived`) and the targets of
  Requirement 7. `RunSummary` gains `bossArrived: boolean` and `earnedAtEnd: number`.
- Update `tools/mcp-sim/src/schemas.ts`, the `balance-tuner` agent file and its tests.

## Correctness Properties

1. **Boss once, on progress or clock**: in any bot run, at most one Boss_Rise, and it happens on
   the first Tick with `download ≥ bossAtPercent` seen by the Director or at `bossLatestSecond`,
   whichever is first. _Req 3.1, 3.2, 3.4_
2. **Combo chain**: for any sequence of kill Ticks, the emitted `combo` counts match a reference
   fold over the gaps, and `bestCombo` equals the longest chain. _Req 5.2–5.4_
3. **Conservation**: `gained − spent − lost = wallet` with combos. _Req 5.3_
4. **Bot cursor speed**: between two Ticks the Bot_Cursor moves at most
   `cursorPxPerSecond / TICK_RATE` pixels. _Req 6.3_
5. **Determinism**: same seed and inputs give identical states and events. _Req 9.2_

## Testing Strategy

- Update the balance default tests, `tests/game/step.test.ts` (8,100 Ticks for a full download),
  the director timeline tests and the economy examples to the new values. Note each one.
- Example tests: boss on progress, boss on the clock fallback, combo with same-Tick kills, glob
  kill drops nothing.
- Properties 1–5 in `tests/game/director/bossTrigger.test.ts`,
  `tests/game/economy/combo.test.ts` and `tests/tools/policies.test.ts`.
- `npm run sim:check` and a `balance_report` run before the tuning pass, saved as the "Before"
  table of the first `docs/balance/` file.
