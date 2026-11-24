import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  accumulate,
  MAX_FRAME_MS,
  startFixedLoop,
  TICK_MS,
  type FixedLoopDeps,
} from '../../src/core/fixedLoop';

/** Fake clock, frame queue and visibility target so the loop runs without real time. */
function fakeDeps(hidden = false) {
  let time = 0;
  let nextId = 1;
  const frames = new Map<number, (t: number) => void>();
  const listeners = new Set<() => void>();
  const visibility = {
    hidden,
    addEventListener: (_t: 'visibilitychange', f: () => void) => void listeners.add(f),
    removeEventListener: (_t: 'visibilitychange', f: () => void) => void listeners.delete(f),
  };
  const deps: FixedLoopDeps = {
    now: () => time,
    requestFrame: (cb) => {
      const id = nextId++;
      frames.set(id, cb);
      return id;
    },
    cancelFrame: (id) => void frames.delete(id),
    visibility,
  };
  return {
    deps,
    frames,
    listeners,
    /** Advance the clock and run every frame that was pending before the call. */
    frame(ms: number) {
      time += ms;
      const pending = [...frames.entries()];
      frames.clear();
      for (const [, cb] of pending) cb(time);
    },
    /** Advance the clock without running any frames. */
    advance(ms: number) {
      time += ms;
    },
    /** Change visibility; with `dispatch` false the event has not arrived yet. */
    setHidden(value: boolean, dispatch = true) {
      visibility.hidden = value;
      if (dispatch) for (const f of [...listeners]) f();
    },
  };
}

describe('accumulate (smoke)', () => {
  it('runs one tick for exactly one tick of time and keeps no leftover', () => {
    expect(accumulate(0, TICK_MS)).toEqual({ ticks: 1, accMs: 0 });
  });

  it('carries the remainder', () => {
    const r = accumulate(0, TICK_MS * 2.5);
    expect(r.ticks).toBe(2);
    expect(r.accMs).toBeCloseTo(TICK_MS / 2, 9);
  });

  it('counts 250 ms as exactly 15 ticks despite TICK_MS rounding', () => {
    expect(accumulate(0, 250)).toEqual({ ticks: 15, accMs: 0 });
  });

  it('treats negative and NaN elapsed time as 0', () => {
    expect(accumulate(5, -100)).toEqual({ ticks: 0, accMs: 5 });
    expect(accumulate(5, Number.NaN)).toEqual({ ticks: 0, accMs: 5 });
  });
});

describe('startFixedLoop (smoke)', () => {
  it('calls onTicks each frame and stops cleanly; stopping twice is safe', () => {
    const f = fakeDeps();
    const calls: number[] = [];
    const stop = startFixedLoop((n) => calls.push(n), f.deps);
    f.frame(TICK_MS * 3);
    f.frame(TICK_MS);
    expect(calls).toEqual([3, 1]);

    stop();
    stop();
    expect(f.frames.size).toBe(0);
    expect(f.listeners.size).toBe(0);
    f.frame(TICK_MS * 10);
    expect(calls).toEqual([3, 1]);
  });

  it('does not request a frame while hidden at start', () => {
    const f = fakeDeps(true);
    const stop = startFixedLoop(() => {}, f.deps);
    expect(f.frames.size).toBe(0);
    expect(f.listeners.size).toBe(1);
    stop();
  });

  it('imports and runs with browser defaults under jsdom', () => {
    const stop = startFixedLoop(() => {});
    stop();
  });
});

// ---------------------------------------------------------------------------------------------
// accumulate: P8 and the clamp
// ---------------------------------------------------------------------------------------------

/** Elapsed time as accumulate counts it: non-positive or NaN is 0, above 250 ms is 250 ms. */
const clamped = (elapsedMs: number): number =>
  elapsedMs > 0 ? Math.min(elapsedMs, MAX_FRAME_MS) : 0;

/** Leftover accumulator values the caller may pass in: [0, TICK_MS). */
const accArb = fc.double({ min: 0, max: TICK_MS, maxExcluded: true, noNaN: true });

/** Frame gaps: wide random range plus the edges that matter (0, tick multiples, 250, huge). */
const elapsedArb = fc.oneof(
  fc.double({ min: -1000, max: 10_000, noNaN: true }),
  fc.double({ min: MAX_FRAME_MS - 1e-6, max: MAX_FRAME_MS + 1e-6, noNaN: true }),
  fc.integer({ min: 0, max: 20 }).map((k) => k * TICK_MS),
  fc.constantFrom(0, -0, -1e-12, 1e-12, MAX_FRAME_MS, 1e9, Infinity, -Infinity, Number.NaN),
);

describe('accumulate properties', () => {
  // Feature: game-core, Property P8: accumulate conserves time
  // **Validates: Requirements 2.1, 2.2**
  it('P8: ticks × TICK_MS + new acc = old acc + min(elapsed, 250), and 0 ≤ new acc < TICK_MS', () => {
    fc.assert(
      fc.property(accArb, elapsedArb, (acc, elapsed) => {
        const r = accumulate(acc, elapsed);
        expect(Number.isInteger(r.ticks)).toBe(true);
        expect(r.ticks).toBeGreaterThanOrEqual(0);
        expect(r.accMs).toBeGreaterThanOrEqual(0);
        expect(r.accMs).toBeLessThan(TICK_MS);
        // The SNAP_MS rounding moves at most 1e-9 ms, well inside the 1e-6 ms tolerance.
        expect(Math.abs(r.ticks * TICK_MS + r.accMs - (acc + clamped(elapsed)))).toBeLessThan(1e-6);
      }),
      { numRuns: 1000 },
    );
  });

  // Feature: game-core, Property P8 (edge): no elapsed time runs no ticks
  // **Validates: Requirements 2.1**
  it('elapsed ≤ 0 or NaN gives 0 ticks and leaves the accumulator unchanged', () => {
    const nonPositive = fc.oneof(
      fc.double({ min: -1e6, max: 0, noNaN: true }),
      fc.constantFrom(-Infinity, Number.NaN),
    );
    fc.assert(
      fc.property(accArb, nonPositive, (acc, elapsed) => {
        expect(accumulate(acc, elapsed)).toEqual({ ticks: 0, accMs: acc });
      }),
      { numRuns: 500 },
    );
  });
});

describe('accumulate clamp (Req 2.2)', () => {
  it('counts 1000 ms as 250 ms: 15 ticks and no leftover', () => {
    expect(accumulate(0, 1000)).toEqual({ ticks: 15, accMs: 0 });
  });

  it('keeps the incoming leftover on top of the clamped 250 ms', () => {
    const r = accumulate(TICK_MS / 2, 5000);
    expect(r.ticks).toBe(15);
    expect(r.accMs).toBeCloseTo(TICK_MS / 2, 9);
  });
});

// ---------------------------------------------------------------------------------------------
// startFixedLoop: clamp, hidden pause, no catch-up
// ---------------------------------------------------------------------------------------------

describe('startFixedLoop clamp (Req 2.2)', () => {
  it('runs at most 15 ticks for a single 5000 ms frame and does not carry the excess', () => {
    const f = fakeDeps();
    const calls: number[] = [];
    const stop = startFixedLoop((n) => calls.push(n), f.deps);
    f.frame(5000);
    expect(calls).toEqual([15]);
    // Only a normal tick's worth of time follows; the 4750 ms cut off is gone.
    f.frame(TICK_MS);
    expect(calls).toEqual([15, 1]);
    stop();
  });

  it('keeps an existing leftover across a clamped frame', () => {
    const f = fakeDeps();
    const calls: number[] = [];
    const stop = startFixedLoop((n) => calls.push(n), f.deps);
    f.frame(TICK_MS / 2);
    f.frame(5000);
    f.frame(TICK_MS / 2);
    expect(calls).toEqual([0, 15, 1]);
    stop();
  });

  // Feature: game-core, Property P8 (loop): total ticks follow the clamped frame time
  // **Validates: Requirements 2.1, 2.2**
  it('over any frame sequence, total ticks = floor(sum of clamped gaps / TICK_MS)', () => {
    const gapArb = fc.oneof(
      fc.double({ min: 0, max: 600, noNaN: true }),
      fc.integer({ min: 0, max: 3 }).map((k) => k * TICK_MS),
    );
    fc.assert(
      fc.property(fc.array(gapArb, { minLength: 1, maxLength: 60 }), (gaps) => {
        const f = fakeDeps();
        let total = 0;
        const stop = startFixedLoop((n) => {
          expect(n).toBeGreaterThanOrEqual(0);
          total += n;
        }, f.deps);
        for (const g of gaps) f.frame(g);
        stop();
        const sum = gaps.reduce((s, g) => s + clamped(g), 0);
        // Allow float slack right at a tick boundary, in either direction.
        const tol = 1e-6;
        expect(total).toBeGreaterThanOrEqual(Math.floor((sum - tol) / TICK_MS));
        expect(total).toBeLessThanOrEqual(Math.floor((sum + tol) / TICK_MS));
      }),
      { numRuns: 300 },
    );
  });
});

describe('startFixedLoop while hidden (Req 2.3)', () => {
  it('cancels the pending frame and runs no ticks while hidden', () => {
    const f = fakeDeps();
    const calls: number[] = [];
    const stop = startFixedLoop((n) => calls.push(n), f.deps);
    f.frame(TICK_MS);
    expect(calls).toEqual([1]);

    f.setHidden(true);
    expect(f.frames.size).toBe(0);
    for (let i = 0; i < 10; i++) f.frame(1000);
    expect(calls).toEqual([1]);
    expect(f.frames.size).toBe(0);
    stop();
  });

  it('skips a frame that arrives after hiding but before the visibilitychange event', () => {
    const f = fakeDeps();
    const calls: number[] = [];
    const stop = startFixedLoop((n) => calls.push(n), f.deps);
    f.setHidden(true, false);
    f.frame(1000);
    expect(calls).toEqual([]);
    expect(f.frames.size).toBe(0);
    f.setHidden(true);
    expect(f.frames.size).toBe(0);
    stop();
  });
});

describe('startFixedLoop after becoming visible (Req 2.4)', () => {
  it('does not replay hidden time and resets the accumulator', () => {
    const f = fakeDeps();
    const calls: number[] = [];
    const stop = startFixedLoop((n) => calls.push(n), f.deps);
    // Leave 0.9 of a tick in the accumulator.
    f.frame(TICK_MS * 0.9);
    expect(calls).toEqual([0]);

    f.setHidden(true);
    f.advance(10_000);
    f.setHidden(false);
    expect(f.frames.size).toBe(1);

    // First frame right after becoming visible: no hidden time counted.
    f.frame(0);
    expect(calls).toEqual([0, 0]);
    // 0.2 of a tick would complete a tick if the old 0.9 were still there.
    f.frame(TICK_MS * 0.2);
    expect(calls).toEqual([0, 0, 0]);
    // Only time since becoming visible counts.
    f.frame(TICK_MS * 0.8);
    expect(calls).toEqual([0, 0, 0, 1]);
    stop();
  });

  it('counts only the time since becoming visible on the first frame', () => {
    const f = fakeDeps();
    const calls: number[] = [];
    const stop = startFixedLoop((n) => calls.push(n), f.deps);
    f.setHidden(true);
    f.advance(10_000);
    f.setHidden(false);
    f.frame(TICK_MS * 2);
    expect(calls).toEqual([2]);
    stop();
  });

  it('starts ticking once a page that was hidden at start becomes visible', () => {
    const f = fakeDeps(true);
    const calls: number[] = [];
    const stop = startFixedLoop((n) => calls.push(n), f.deps);
    f.advance(10_000);
    f.setHidden(false);
    f.frame(TICK_MS);
    expect(calls).toEqual([1]);
    stop();
  });

  it('does not request a second frame on a repeated visible event', () => {
    const f = fakeDeps();
    const stop = startFixedLoop(() => {}, f.deps);
    expect(f.frames.size).toBe(1);
    f.setHidden(false);
    f.setHidden(false);
    expect(f.frames.size).toBe(1);
    stop();
  });
});
