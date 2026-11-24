// Manual stand-in for `setTimeout` / `clearTimeout`. Code under test receives the returned object
// as its `timers` dependency (same shape as `Timers` in `src/core/audio.ts`); the test then moves
// the clock by hand with `advance(ms)`.

export interface FakeTimers {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
  /**
   * Move the clock forward by `ms` (≥ 0) and run every timer that falls due, in due-time order
   * (ties in scheduling order). A timer scheduled while advancing also runs if it falls due
   * within the same advance.
   */
  advance(ms: number): void;
  /** Number of timers scheduled and neither run nor cleared. */
  pending(): number;
  /** Fake clock in ms since creation. */
  now(): number;
}

interface Timer {
  readonly id: number;
  readonly due: number;
  readonly fn: () => void;
}

export function createFakeTimers(): FakeTimers {
  let clock = 0;
  let nextId = 1;
  const timers = new Map<number, Timer>();

  const nextDue = (limit: number): Timer | undefined => {
    let best: Timer | undefined;
    for (const t of timers.values()) {
      if (t.due > limit) continue;
      if (!best || t.due < best.due || (t.due === best.due && t.id < best.id)) best = t;
    }
    return best;
  };

  return {
    setTimeout(fn, ms) {
      const delay = Number.isFinite(ms) && ms > 0 ? ms : 0;
      const id = nextId++;
      timers.set(id, { id, due: clock + delay, fn });
      return id;
    },
    clearTimeout(handle) {
      if (typeof handle === 'number') timers.delete(handle);
    },
    advance(ms) {
      if (!(Number.isFinite(ms) && ms >= 0)) {
        throw new Error(`fake timers: advance(ms) needs a non-negative finite number, got ${ms}`);
      }
      const target = clock + ms;
      for (let t = nextDue(target); t; t = nextDue(target)) {
        timers.delete(t.id);
        clock = t.due;
        t.fn();
      }
      clock = target;
    },
    pending: () => timers.size,
    now: () => clock,
  };
}
