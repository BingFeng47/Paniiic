// The tick context: the narrow interface that systems (and `step()` itself) use to change the
// game inside one tick. Every effect goes through here so the rules stay in one deterministic
// path (Req 1.1, 1.3) and every event is tagged with its tick, in order (Req 6.1).

import { nextRandom } from './rng';
import type { GameEvent, GameEventBody, InputCommand, MutableGameState } from './types';

export interface TickContext {
  /** The tick being produced (the draft's tick). */
  readonly tick: number;
  /** The player's commands for this tick, in order. Lane systems read `hammer` from here. */
  readonly inputs: readonly InputCommand[];
  /** Record an event, tagged with the current tick, after all earlier events of this tick. */
  emit(event: GameEventBody): void;
  /** A frozen copy of the events emitted so far in this tick, in emit order (browser-front 7.3). */
  eventsSoFar(): readonly GameEvent[];
  /** Draw a number in [0, 1) from the run's seeded generator, advancing `draft.rng`. */
  random(): number;
  /** Reduce integrity by `amount` (floored at 0) and emit `modemHit` (Req 4.1, 4.2, 4.4). */
  damageModem(amount: number): void;
  /** Reduce download progress by `amount` (floored at 0) and emit `downloadPenalty` (Req 5.1, 5.2). */
  penalizeDownload(amount: number): void;
  /** Mark a pause source active. Adding an active id again is a no-op (Req 5.3). */
  addPauseSource(id: string): void;
  /** Mark a pause source inactive. Removing an absent id is a no-op (Req 5.4). */
  removePauseSource(id: string): void;
}

/** Game logic that runs inside `step()` and changes the draft only through the context. */
export type System = (draft: MutableGameState, ctx: TickContext) => void;

function assertAmount(name: string, amount: number): void {
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error(`${name}: amount must be a finite number >= 0, got ${amount}`);
  }
}

/**
 * Create the tick context over a draft state. Emitted events are pushed onto `events`, so the
 * caller (normally `step()`) owns the event list for the tick and can emit through the same
 * context. The draft is changed in place; the caller is responsible for cloning first.
 */
export function createTickContext(
  draft: MutableGameState,
  events: GameEvent[],
  inputs: readonly InputCommand[] = [],
): TickContext {
  const emit = (event: GameEventBody): void => {
    events.push({ ...event, tick: draft.tick });
  };

  return {
    get tick() {
      return draft.tick;
    },

    inputs,

    emit,

    eventsSoFar() {
      return Object.freeze(events.slice());
    },

    random() {
      const { value, next } = nextRandom(draft.rng);
      draft.rng = next;
      return value;
    },

    damageModem(amount) {
      assertAmount('damageModem', amount);
      const critical = draft.balance.criticalIntegrity;
      // The crossing is judged on the integrity just before this hit, not on the latch, so a
      // hit that follows a (future) repair above critical fires even if no hit landed in
      // between to clear the latch (Req 4.3).
      const wasAbove = draft.integrity > critical;
      draft.integrity = Math.max(0, draft.integrity - amount);
      emit({ type: 'modemHit', amount, integrity: draft.integrity });
      draft.criticalLatched = draft.integrity <= critical;
      if (wasAbove && draft.criticalLatched) {
        emit({ type: 'integrityCritical', integrity: draft.integrity });
      }
    },

    penalizeDownload(amount) {
      assertAmount('penalizeDownload', amount);
      draft.download = Math.max(0, draft.download - amount);
      emit({ type: 'downloadPenalty', amount, download: draft.download });
    },

    addPauseSource(id) {
      if (draft.pauseSources.includes(id)) return;
      // Keep the array sorted so the order of adding never changes the state (Req 1.2).
      draft.pauseSources = [...draft.pauseSources, id].sort();
    },

    removePauseSource(id) {
      if (!draft.pauseSources.includes(id)) return;
      draft.pauseSources = draft.pauseSources.filter((source) => source !== id);
    },
  };
}
