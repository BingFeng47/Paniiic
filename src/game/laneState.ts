// Lane_State helpers shared by every lane module (Req 1.1, 1.3), so mobs.ts, hammer.ts and
// spawner.ts do not have to import the wiring module (lane.ts).
import type { LaneBalance } from './balance/lane';
import type { Enemy, LaneState } from './laneTypes';
import type { GameState, MutableGameState } from './types';

/** Drops `readonly` from the top-level fields. Distributes over unions because T is generic. */
type Writable<T> = { -readonly [K in keyof T]: T[K] };

/** The writable form of each Enemy variant, for use on a step() draft only. */
export type MutableEnemy = Writable<Enemy>;

/** LaneState with writable fields and arrays, for use on a step() draft only. */
export type MutableLaneState = {
  -readonly [K in keyof LaneState]: K extends 'enemies' ? MutableEnemy[] : LaneState[K];
};

/**
 * A new Lane_State: no Enemies, next Enemy id 1 and the Hammer ready from tick 0, so it is ready
 * on whatever tick the lane is added (Req 1.1). Plain data only (Req 1.3).
 */
export function initialLane(balance: LaneBalance): LaneState {
  return { balance, nextId: 1, enemies: [], hammerReadyTick: 0 };
}

/** The Lane_State of a Run, or null before the first lane tick or in runs without lane systems. */
export function laneOf(state: GameState): LaneState | null {
  return state.lane ?? null;
}

/**
 * Writable view of draft.lane for lane systems. Throws if ensureLane has not run (a wiring bug).
 *
 * The cast is safe because of where drafts come from: step() builds the draft with
 * structuredClone, so `draft.lane` is a fresh, unfrozen copy that no earlier state shares. The
 * only other source is ensureLane assigning initialLane(), which also builds a new object with
 * its own `enemies` array. `balance` stays read-only in MutableLaneState, because the resolved
 * balance may still be the deep-frozen object and tuning never changes during a Run.
 */
export function laneDraft(draft: MutableGameState): MutableLaneState {
  const lane = draft.lane;
  if (lane === undefined) {
    throw new Error('laneDraft: draft.lane is absent; ensureLane must run before other lane systems');
  }
  return lane as MutableLaneState;
}
