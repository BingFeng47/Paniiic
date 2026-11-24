// Lane wiring: builds the four connection-lane systems in tick order (design D4). Wiring only;
// the rules live in laneState.ts, hammer.ts, mobs.ts and spawner.ts.
//
// The balance is resolved once, here, so invalid overrides throw LaneBalanceError before any Run
// starts (Req 2.6). The resolved balance is the only closure state, and only ensureLane uses it:
// it is copied into the Lane_State on the first lane tick, and from then on every system reads
// draft.lane.balance (Req 1.4, 1.5). A state started with one balance therefore keeps it even
// when continued with systems built from another.
//
// Terminal phases need no handling here: step() returns before running any system once a Run is
// won or lost, so the lane freezes with the Run.
import { resolveLaneBalance, type LaneBalanceOverrides } from './balance/lane';
import type { System } from './context';
import { hammerSystem } from './hammer';
import { initialLane } from './laneState';
import { mobSystem } from './mobs';
import { scheduleSpawner } from './spawner';

export interface LaneOptions {
  readonly balance?: LaneBalanceOverrides;
  /** Replaces the scheduled spawner (milestone 5 director) (Req 3.4). */
  readonly spawner?: System;
  /** Optional weapon system (economy-weapons), run between hammerSystem and mobSystem. */
  readonly weapons?: System;
}

/**
 * Resolves the balance now (throws LaneBalanceError) and returns
 * `[ensureLane, hammerSystem, weapons?, mobSystem, spawner]` (Req 1.1, 1.7, 2.6, 3.4).
 */
export function createLaneSystems(options: LaneOptions = {}): readonly System[] {
  const balance = resolveLaneBalance(options.balance);
  /** Adds the Lane_State on the first lane tick; never replaces an existing one (Req 1.1, 1.4). */
  const ensureLane: System = (draft) => {
    if (draft.lane === undefined) draft.lane = initialLane(balance);
  };
  const weapons = options.weapons === undefined ? [] : [options.weapons];
  return [ensureLane, hammerSystem, ...weapons, mobSystem, options.spawner ?? scheduleSpawner];
}
