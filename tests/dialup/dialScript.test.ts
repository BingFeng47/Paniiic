// Tests for the dial script: stage table examples, Property 10 (status depends only on the dial
// clock) and Property 11 (stage time left ends exactly at the stage boundary), plus a cross-check
// against the real step() that the last dialing stage hands over to `connected` at dialTicks.

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  DIAL_STAGES,
  dialStatusOf,
  formatDuration,
  stageTimeLeftSeconds,
  type DialStatus,
} from '../../src/dialup/dialScript';
import { dialTicks, type CoreBalance } from '../../src/game/balance/core';
import { createRun } from '../../src/game/state';
import { step } from '../../src/game/step';
import { TICK_RATE, type GameState, type Phase } from '../../src/game/types';
import { stepN } from '../helpers/game';

function atTick(tick: number, overrides: Partial<GameState> = {}): GameState {
  return { ...createRun({ seed: 1 }), tick, ...overrides };
}

/** A dialing Run with the given dial length, `elapsed` dial ticks after `phaseStartTick`. */
function dialingState(
  balance: Partial<CoreBalance>,
  elapsed: number,
  overrides: Partial<GameState> = {},
): GameState {
  const phaseStartTick = overrides.phaseStartTick ?? 0;
  return {
    ...createRun({ seed: 1, balance }),
    ...overrides,
    phase: 'dialing',
    phaseStartTick,
    tick: phaseStartTick + elapsed,
  };
}

function indexOf(status: DialStatus): number {
  if (status.kind !== 'dialing') throw new Error(`expected a dialing status, got ${status.kind}`);
  return status.index;
}

/** Highest Dial_Fraction while dialing ("capped just below 1"). */
const MAX_FRACTION = 1 - 1e-9;

/** Slack for turning a float tick count into an integer; real stage ends sit ≥ 1/40 tick off. */
const TICK_SLACK = 1e-6;

/**
 * Dial lengths that give at least one dial tick (below 1/120 s rounds to 0 ticks). Mixes exact
 * tick multiples with arbitrary doubles so rounding inside `dialTicks` is exercised too.
 */
const dialSecondsArb = fc.oneof(
  fc.integer({ min: 1, max: 7200 }).map((ticks) => ticks / TICK_RATE),
  fc.double({ min: 0.01, max: 120, noNaN: true, noDefaultInfinity: true }),
);

/** A dial length plus an elapsed dial tick inside the dialing phase, `[0, dialTicks)`. */
const dialClockArb = dialSecondsArb.chain((dialSeconds) => {
  const total = dialTicks(resolve(dialSeconds));
  return fc.record({
    dialSeconds: fc.constant(dialSeconds),
    total: fc.constant(total),
    elapsed: fc.integer({ min: 0, max: total - 1 }),
  });
});

/** Everything Property 10 says must not matter: seed, rng, integrity, download, pauses, balance. */
const unrelatedArb = fc
  .record({
    seed: fc.integer({ min: 0, max: 0xffffffff }),
    rng: fc.integer({ min: 0, max: 0xffffffff }),
    maxIntegrity: fc.integer({ min: 1, max: 1000 }),
    integrityShare: fc.double({ min: 0.001, max: 1, noNaN: true }),
    criticalShare: fc.double({ min: 0, max: 1, noNaN: true }),
    download: fc.double({ min: 0, max: 100, noNaN: true }),
    downloadPercentPerSecond: fc.double({ min: 0.01, max: 100, noNaN: true }),
    pauseSources: fc.uniqueArray(fc.string({ minLength: 1, maxLength: 8 }), { maxLength: 4 }),
    phaseStartTick: fc.integer({ min: 0, max: 100_000 }),
    criticalLatched: fc.boolean(),
    halfwayReached: fc.boolean(),
  })
  .map((r) => ({
    balance: {
      maxIntegrity: r.maxIntegrity,
      criticalIntegrity: r.criticalShare * r.maxIntegrity,
      downloadPercentPerSecond: r.downloadPercentPerSecond,
    },
    overrides: {
      seed: r.seed,
      rng: r.rng,
      integrity: r.integrityShare * r.maxIntegrity,
      download: r.download,
      pauseSources: [...r.pauseSources].sort(),
      phaseStartTick: r.phaseStartTick,
      criticalLatched: r.criticalLatched,
      halfwayReached: r.halfwayReached,
    } satisfies Partial<GameState>,
  }));

describe('dialScript', () => {
  it('orders the stages with contiguous shares from 0 to 1', () => {
    expect(DIAL_STAGES.map((s) => s.id)).toEqual([
      'initializing',
      'dialing',
      'ringing',
      'negotiating',
      'verifying',
      'loggingOn',
    ]);
    expect(DIAL_STAGES[0]!.start).toBe(0);
    expect(DIAL_STAGES[DIAL_STAGES.length - 1]!.end).toBe(1);
    DIAL_STAGES.forEach((stage, i) => {
      expect(stage.end).toBeGreaterThan(stage.start);
      if (i > 0) expect(stage.start).toBe(DIAL_STAGES[i - 1]!.end);
    });
  });

  it('maps default-balance ticks to stages', () => {
    const at = (tick: number) => {
      const status = dialStatusOf(atTick(tick));
      return status.kind === 'dialing' ? status.stage.id : status.kind;
    };
    expect(at(0)).toBe('initializing');
    expect(at(299)).toBe('ringing');
    expect(at(300)).toBe('negotiating');
    expect(at(1199)).toBe('loggingOn');
  });

  it('maps non-dialing phases to connected or terminated', () => {
    for (const phase of ['connected', 'downloading', 'won'] as const) {
      expect(dialStatusOf(atTick(1300, { phase })).kind).toBe('connected');
    }
    expect(dialStatusOf(atTick(1300, { phase: 'lost' })).kind).toBe('terminated');
  });

  it('gives the time left in the current stage', () => {
    expect(stageTimeLeftSeconds(atTick(0))).toBeCloseTo(1.5, 9);
    expect(stageTimeLeftSeconds(atTick(300))).toBeCloseTo(10, 9);
    expect(stageTimeLeftSeconds(atTick(1300, { phase: 'connected' }))).toBe(0);
  });

  it('formats a tick count as hhh:mm:ss', () => {
    expect(formatDuration(420)).toBe('000:00:07');
    expect(formatDuration(60 * 3661)).toBe('001:01:01');
  });

  it('hands the default run from loggingOn to connected on tick 1,200 under real step()', () => {
    const { state: lastDialing } = stepN(step, createRun({ seed: 7 }), 1199);
    expect(lastDialing.phase).toBe('dialing');
    const status = dialStatusOf(lastDialing);
    expect(status.kind === 'dialing' && status.stage.id).toBe('loggingOn');

    const { state: connected, events } = step(lastDialing, []);
    expect(connected.tick).toBe(1200);
    expect(connected.phase).toBe('connected');
    expect(events).toEqual([{ type: 'connected', tick: 1200 }]);
    expect(dialStatusOf(connected)).toEqual({ kind: 'connected' });
  });

  // Feature: retro-shell, Property 10: Dial status depends only on the Run's dial clock
  // Property: Req 11.1 the status is the stage whose share contains the Dial_Fraction
  // Property: Req 11.3 the fraction comes only from tick − phaseStartTick and dialTicks(balance)
  it('Property 10: picks the stage containing the dial fraction, ignoring unrelated state', () => {
    fc.assert(
      fc.property(
        dialClockArb,
        unrelatedArb,
        unrelatedArb,
        fc.double({ min: -0.4, max: 0.4, noNaN: true }),
        ({ dialSeconds, total, elapsed }, a, b, jitter) => {
          const stateA = dialingState({ ...a.balance, dialSeconds }, elapsed, a.overrides);
          // Same dialTicks from a different dialSeconds: only the rounded tick count matters.
          const dialSecondsB = (total + jitter) / TICK_RATE;
          expect(dialTicks(resolve(dialSecondsB))).toBe(total);
          const stateB = dialingState({ ...b.balance, dialSeconds: dialSecondsB }, elapsed, b.overrides);

          const status = dialStatusOf(stateA);
          expect(dialStatusOf(stateB)).toEqual(status);

          const fraction = Math.min(elapsed / total, MAX_FRACTION);
          const expected = DIAL_STAGES.findIndex((s) => s.start <= fraction && fraction < s.end);
          expect(status).toEqual({
            kind: 'dialing',
            index: expected,
            stage: DIAL_STAGES[expected],
            fraction,
          });
        },
      ),
      { numRuns: 200 },
    );
  });

  // Feature: retro-shell, Property 10: Dial status depends only on the Run's dial clock
  // Property: Req 11.1 the stage index never decreases as the dial clock grows
  it('Property 10: never moves back to an earlier stage as the tick grows', () => {
    fc.assert(
      fc.property(dialClockArb, fc.nat(), ({ dialSeconds, total, elapsed }, more) => {
        const later = elapsed + (more % (total - elapsed));
        const before = indexOf(dialStatusOf(dialingState({ dialSeconds }, elapsed)));
        const after = indexOf(dialStatusOf(dialingState({ dialSeconds }, later)));
        expect(after).toBeGreaterThanOrEqual(before);
      }),
      { numRuns: 200 },
    );
  });

  // Feature: retro-shell, Property 10: Dial status depends only on the Run's dial clock
  // Property: Req 11.5 connected, downloading and won show connected; lost shows terminated
  it('Property 10: maps every non-dialing phase by phase alone', () => {
    const phaseArb = fc.constantFrom<Phase>('connected', 'downloading', 'won', 'lost');
    fc.assert(
      fc.property(
        dialSecondsArb,
        unrelatedArb,
        phaseArb,
        fc.integer({ min: 0, max: 100_000 }),
        (dialSeconds, u, phase, tick) => {
          const state: GameState = {
            ...createRun({ seed: 1, balance: { ...u.balance, dialSeconds } }),
            ...u.overrides,
            phase,
            tick: u.overrides.phaseStartTick + tick,
          };
          const expected = phase === 'lost' ? { kind: 'terminated' } : { kind: 'connected' };
          expect(dialStatusOf(state)).toEqual(expected);
          expect(stageTimeLeftSeconds(state)).toBe(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  // Feature: retro-shell, Property 11: Stage sounds last exactly until the stage ends
  // Property: Req 12.1 a stage's sound plays for exactly the time left in that stage
  it('Property 11: time left is positive and runs out exactly when the next stage begins', () => {
    fc.assert(
      fc.property(dialClockArb, fc.integer({ min: 0, max: 100_000 }), ({ dialSeconds, total, elapsed }, start) => {
        const state = dialingState({ dialSeconds }, elapsed, { phaseStartTick: start });
        const index = indexOf(dialStatusOf(state));
        const stage = DIAL_STAGES[index]!;

        const left = stageTimeLeftSeconds(state);
        expect(left).toBeGreaterThan(0);
        const ticksLeft = stage.end * total - elapsed;
        expect(Math.abs(left * TICK_RATE - ticksLeft)).toBeLessThan(1e-9);
        const fraction = Math.min(elapsed / total, MAX_FRACTION);
        expect(Math.abs(left - ((stage.end - fraction) * total) / TICK_RATE)).toBeLessThan(1e-9);

        // Stepping the dial clock by the time left (rounded up to whole ticks) lands on the
        // first tick of a later stage, or on the connect tick; one tick earlier is still this stage.
        const k = Math.ceil(left * TICK_RATE - TICK_SLACK);
        expect(k).toBeGreaterThanOrEqual(1);
        expect(elapsed + k).toBeLessThanOrEqual(total);
        const lastTickOfStage = dialingState({ dialSeconds }, elapsed + k - 1, { phaseStartTick: start });
        expect(indexOf(dialStatusOf(lastTickOfStage))).toBe(index);

        if (elapsed + k < total) {
          const next = dialingState({ dialSeconds }, elapsed + k, { phaseStartTick: start });
          expect(indexOf(dialStatusOf(next))).toBeGreaterThan(index);
        } else {
          const { state: after, events } = step(lastTickOfStage, []);
          expect(after.phase).toBe('connected');
          expect(events).toEqual([{ type: 'connected', tick: start + total }]);
          expect(dialStatusOf(after)).toEqual({ kind: 'connected' });
        }
      }),
      { numRuns: 200 },
    );
  });

  // Feature: retro-shell, Property 11: Stage sounds last exactly until the stage ends
  // Property: Req 11.1, 12.1 under real step() the last dialing stage hands over at dialTicks
  it('Property 11: real step() walks the stages in order and connects exactly at dialTicks', () => {
    const shortDialArb = fc.oneof(
      fc.integer({ min: 1, max: 1800 }).map((ticks) => ticks / TICK_RATE),
      fc.double({ min: 0.01, max: 30, noNaN: true, noDefaultInfinity: true }),
    );
    fc.assert(
      fc.property(shortDialArb, fc.integer({ min: 0, max: 0xffffffff }), (dialSeconds, seed) => {
        let state = createRun({ seed, balance: { dialSeconds } });
        const total = dialTicks(state.balance);
        let previous = -1;
        let left = stageTimeLeftSeconds(state) * TICK_RATE;
        for (let t = 0; t < total; t += 1) {
          expect(state.phase).toBe('dialing');
          const index = indexOf(dialStatusOf(state));
          expect(index).toBeGreaterThanOrEqual(previous);
          if (index !== previous) {
            // Entering a stage: its sound is scheduled for the stage's remaining length.
            left = stageTimeLeftSeconds(state) * TICK_RATE;
            previous = index;
          }
          // The stage is still on while the scheduled sound has time left.
          expect(left).toBeGreaterThan(0);
          const { state: next, events } = step(state, []);
          left -= 1;
          if (t + 1 < total) {
            expect(events).toEqual([]);
            const nextIndex = indexOf(dialStatusOf(next));
            // A stage change happens exactly when the scheduled sound runs out.
            expect(nextIndex !== index).toBe(left <= TICK_SLACK);
          } else {
            expect(left).toBeLessThanOrEqual(TICK_SLACK);
            expect(next.phase).toBe('connected');
            expect(next.tick).toBe(total);
            expect(events).toEqual([{ type: 'connected', tick: total }]);
          }
          state = next;
        }
        // The stage live on the last dialing tick is the last stage that has any tick at all.
        const lastWithTicks = DIAL_STAGES.reduce(
          (last, s, i) => (Math.ceil(s.start * total - TICK_SLACK) < total ? i : last),
          0,
        );
        expect(previous).toBe(lastWithTicks);
      }),
      { numRuns: 100 },
    );
  });
});

function resolve(dialSeconds: number): CoreBalance {
  return createRun({ seed: 0, balance: { dialSeconds } }).balance;
}
