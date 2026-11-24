// Property-based tests for the game-core simulation (design: "Correctness properties").
// The shared arbitraries and helpers at the top describe a random run script: a seed, a short
// balance, startDownload inputs, scheduled damage and penalties, pause add/remove events and a
// system that draws from the seeded RNG. Later properties (P2–P6, P9, P10) reuse them.

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { CoreBalance } from '../../src/game/balance/core';
import { createTickContext, type System } from '../../src/game/context';
import { createRun } from '../../src/game/state';
import { step } from '../../src/game/step';
import {
  TICK_RATE,
  type GameEvent,
  type GameState,
  type InputCommand,
  type MutableGameState,
} from '../../src/game/types';
import {
  scheduledDamage,
  scheduledPenalty,
  type ScheduledAmount,
  type ScheduledInput,
} from '../helpers/game';

// ---------------------------------------------------------------------------------------------
// Shared arbitraries
// ---------------------------------------------------------------------------------------------

/** Upper bound on run length in ticks, so each property stays fast. */
const MAX_TICKS = 600;

const PAUSE_IDS = ['ad', 'modal', 'popup'] as const;

interface PauseEvent {
  readonly tick: number;
  readonly op: 'add' | 'remove';
  readonly id: string;
}

interface RunScript {
  readonly seed: number;
  /** Shortened balance so dialing (0.5–2 s) and the download (1–5 s) fit inside MAX_TICKS. */
  readonly balance: Partial<CoreBalance>;
  readonly ticks: number;
  readonly inputs: readonly ScheduledInput[];
  readonly damage: readonly ScheduledAmount[];
  readonly penalties: readonly ScheduledAmount[];
  readonly pauses: readonly PauseEvent[];
  /** Per-tick chance that the random-hit system damages the modem. */
  readonly randomHitChance: number;
}

const seedArb = fc.integer({ min: 0, max: 0xffffffff });

const shortBalanceArb: fc.Arbitrary<Partial<CoreBalance>> = fc.record({
  dialSeconds: fc.integer({ min: 30, max: 120 }).map((ticks) => ticks / 60),
  downloadPercentPerSecond: fc.double({ min: 20, max: 100, noNaN: true }),
});

const tickInRun = (ticks: number) => fc.integer({ min: 1, max: ticks });

const amountArb = (max: number) => fc.double({ min: 0, max, noNaN: true });

const runScriptArb: fc.Arbitrary<RunScript> = fc
  .integer({ min: 1, max: MAX_TICKS })
  .chain((ticks) =>
    fc.record({
      seed: seedArb,
      balance: shortBalanceArb,
      ticks: fc.constant(ticks),
      inputs: fc.array(
        tickInRun(ticks).map((tick): ScheduledInput => ({ tick, command: { type: 'startDownload' } })),
        { maxLength: 5 },
      ),
      damage: fc.array(fc.record({ tick: tickInRun(ticks), amount: amountArb(15) }), { maxLength: 20 }),
      penalties: fc.array(fc.record({ tick: tickInRun(ticks), amount: amountArb(30) }), {
        maxLength: 10,
      }),
      pauses: fc.array(
        fc.record({
          tick: tickInRun(ticks),
          op: fc.constantFrom('add' as const, 'remove' as const),
          id: fc.constantFrom(...PAUSE_IDS),
        }),
        { maxLength: 10 },
      ),
      randomHitChance: fc.double({ min: 0, max: 0.1, noNaN: true }),
    }),
  );

// ---------------------------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------------------------

/** A system that adds/removes pause sources on the scheduled ticks, in array order. */
function scheduledPauses(schedule: readonly PauseEvent[]): System {
  return (_draft, ctx) => {
    for (const { tick, op, id } of schedule) {
      if (tick !== ctx.tick) continue;
      if (op === 'add') ctx.addPauseSource(id);
      else ctx.removePauseSource(id);
    }
  };
}

/** A system that uses the seeded RNG every tick: with probability `chance`, a random hit. */
function randomHits(chance: number): System {
  return (_draft, ctx) => {
    if (ctx.random() < chance) ctx.damageModem(ctx.random() * 10);
  };
}

/** Fresh systems for a script. Built per run so no state can leak between runs. */
function systemsFor(script: RunScript): System[] {
  return [
    scheduledPauses(script.pauses),
    scheduledDamage(script.damage),
    scheduledPenalty(script.penalties),
    randomHits(script.randomHitChance),
  ];
}

interface RunTrace {
  /** states[0] is the start state; states[i] is the state after tick i. */
  readonly states: readonly GameState[];
  /** events[i] holds the events returned by the step that produced states[i + 1]. */
  readonly events: readonly (readonly GameEvent[])[];
}

/** Play a script tick by tick and record every state and every step's events. */
function traceRun(script: RunScript): RunTrace {
  const systems = systemsFor(script);
  let state = createRun({ seed: script.seed, balance: script.balance });
  const states: GameState[] = [state];
  const events: (readonly GameEvent[])[] = [];
  for (let i = 0; i < script.ticks; i++) {
    const tick = state.tick + 1;
    const inputs: InputCommand[] = script.inputs
      .filter((entry) => entry.tick === tick)
      .map((entry) => entry.command);
    const result = step(state, inputs, systems);
    state = result.state;
    states.push(state);
    events.push(result.events);
  }
  return { states, events };
}

const jsonRoundTrip = <T>(value: T): unknown => JSON.parse(JSON.stringify(value));

/** Freeze a plain-data value and everything reachable from it. Writes then throw (strict mode). */
function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

/**
 * A system that calls every tick-context method on every tick without changing the outcome much:
 * zero-amount damage and penalty (they still write `integrity` / `download` and emit events),
 * one RNG draw, and a pause source that is added and removed within the same tick.
 */
const touchEveryContextMethod: System = (_draft, ctx) => {
  ctx.random();
  ctx.damageModem(0);
  ctx.penalizeDownload(0);
  ctx.addPauseSource('probe');
  ctx.removePauseSource('probe');
};

// ---------------------------------------------------------------------------------------------
// Arbitraries for the bounds and critical-crossing properties (P3, P4, P9)
// ---------------------------------------------------------------------------------------------

/** Integrity tuning with the critical threshold at 0, at the maximum, or anywhere between. */
const integrityBalanceArb: fc.Arbitrary<Pick<CoreBalance, 'maxIntegrity' | 'criticalIntegrity'>> =
  fc
    .integer({ min: 1, max: 200 })
    .chain((maxIntegrity) =>
      fc.record({
        maxIntegrity: fc.constant(maxIntegrity),
        criticalIntegrity: fc.oneof(
          fc.constant(0),
          fc.constant(maxIntegrity),
          fc.double({ min: 0, max: maxIntegrity, noNaN: true }),
        ),
      }),
    );

/**
 * A run script with large damage and penalty amounts (so the 0 floors are hit), varied
 * integrity tuning, and optionally a `startDownload` on the first tick after the link comes up
 * (so the download runs and its cap at 100 is hit).
 */
const harshRunScriptArb: fc.Arbitrary<RunScript> = runScriptArb.chain((script) =>
  fc
    .record({
      integrity: integrityBalanceArb,
      startOnConnect: fc.boolean(),
      damage: fc.array(
        fc.record({ tick: tickInRun(script.ticks), amount: fc.oneof(amountArb(15), amountArb(250)) }),
        { maxLength: 30 },
      ),
      penalties: fc.array(
        fc.record({ tick: tickInRun(script.ticks), amount: fc.oneof(amountArb(30), amountArb(150)) }),
        { maxLength: 15 },
      ),
    })
    .map(({ integrity, startOnConnect, damage, penalties }): RunScript => {
      const dialTicks = Math.round((script.balance.dialSeconds ?? 0) * TICK_RATE);
      const startInput: ScheduledInput = { tick: dialTicks + 1, command: { type: 'startDownload' } };
      return {
        ...script,
        balance: { ...script.balance, ...integrity },
        inputs: startOnConnect ? [...script.inputs, startInput] : script.inputs,
        damage,
        penalties,
      };
    }),
);

/**
 * Count crossings from above the critical threshold to at/below it, given the integrity before
 * the first hit and the integrity after each hit in order.
 */
function countCrossings(start: number, afterEachHit: readonly number[], critical: number): number {
  let crossings = 0;
  let previous = start;
  for (const current of afterEachHit) {
    if (previous > critical && current <= critical) crossings++;
    previous = current;
  }
  return crossings;
}

// ---------------------------------------------------------------------------------------------
// Arbitraries for the pause properties (P5, P10)
// ---------------------------------------------------------------------------------------------

/**
 * A run script that starts the download on the first tick after the link comes up and has dense
 * pause add/remove events, so many downloading ticks are paused and many resume.
 */
const pausedRunScriptArb: fc.Arbitrary<RunScript> = runScriptArb.chain((script) =>
  fc
    .array(
      fc.record({
        tick: tickInRun(script.ticks),
        op: fc.constantFrom('add' as const, 'remove' as const),
        id: fc.constantFrom(...PAUSE_IDS),
      }),
      { maxLength: 40 },
    )
    .map((pauses): RunScript => {
      const dialTicks = Math.round((script.balance.dialSeconds ?? 0) * TICK_RATE);
      const startInput: ScheduledInput = { tick: dialTicks + 1, command: { type: 'startDownload' } };
      return { ...script, inputs: [...script.inputs, startInput], pauses };
    }),
);

/** Pause source ids: the usual few, plus arbitrary short strings to exercise the sort order. */
const pauseIdArb = fc.oneof(fc.constantFrom(...PAUSE_IDS), fc.string({ maxLength: 4 }));

/** A context over a fresh run's draft, for testing the pause-source methods directly. */
function freshContext(seed: number): { draft: MutableGameState; ctx: ReturnType<typeof createTickContext> } {
  const run = createRun({ seed });
  const draft: MutableGameState = { ...run, pauseSources: [...run.pauseSources] };
  return { draft, ctx: createTickContext(draft, []) };
}

/** The canonical pause-source array for a set of ids: sorted with the default sort, unique. */
const canonicalPauses = (ids: Iterable<string>): string[] => [...new Set(ids)].sort();

// ---------------------------------------------------------------------------------------------
// Arbitraries and helpers for the terminal-phase property (P6)
// ---------------------------------------------------------------------------------------------

/**
 * Hard cap for playing a script to its end. Scheduled effects all land within MAX_TICKS, and
 * after that a winning script needs at most 2 s of dialing plus 5 s of download, so the cap is
 * never reached by the scripts below.
 */
const TERMINAL_CAP_TICKS = 2 * MAX_TICKS + 10 * TICK_RATE;

/**
 * A script built to end in `lost`: a harsh script plus one overkill hit (twice the maximum
 * integrity) somewhere in the run. A fast download can still win first, which is fine; the
 * property counts which terminal phase each run actually reached.
 */
const losingRunScriptArb: fc.Arbitrary<RunScript> = harshRunScriptArb.chain((script) =>
  tickInRun(script.ticks).map((tick): RunScript => {
    const max = script.balance.maxIntegrity ?? 100;
    return { ...script, damage: [...script.damage, { tick, amount: max * 2 }] };
  }),
);

/**
 * A script built to end in `won`: the download starts on the first tick after the link comes up,
 * no damage can reach the modem, and every pause source is removed on the tick after the last
 * scheduled effect, so the download always finishes within TERMINAL_CAP_TICKS.
 */
const winningRunScriptArb: fc.Arbitrary<RunScript> = pausedRunScriptArb.map(
  (script): RunScript => ({
    ...script,
    damage: [],
    randomHitChance: 0,
    pauses: [
      ...script.pauses,
      ...PAUSE_IDS.map((id): PauseEvent => ({ tick: script.ticks + 1, op: 'remove', id })),
    ],
  }),
);

/** Play a script with its systems until the phase is `won` or `lost`, or the cap is reached. */
function runToTerminal(script: RunScript): GameState {
  const systems = systemsFor(script);
  let state = createRun({ seed: script.seed, balance: script.balance });
  for (let i = 0; i < TERMINAL_CAP_TICKS && state.phase !== 'won' && state.phase !== 'lost'; i++) {
    const tick = state.tick + 1;
    const inputs: InputCommand[] = script.inputs
      .filter((entry) => entry.tick === tick)
      .map((entry) => entry.command);
    state = step(state, inputs, systems).state;
  }
  return state;
}

/** Something a system could try to do to a terminal state. Each would change state or emit. */
type HostileOp =
  | { readonly kind: 'damage'; readonly amount: number }
  | { readonly kind: 'penalty'; readonly amount: number }
  | { readonly kind: 'addPause'; readonly id: string }
  | { readonly kind: 'removePause'; readonly id: string }
  | { readonly kind: 'random' }
  | { readonly kind: 'emit' }
  | { readonly kind: 'revive' };

const hostileOpArb: fc.Arbitrary<HostileOp> = fc.oneof(
  fc.record({ kind: fc.constant('damage' as const), amount: amountArb(250) }),
  fc.record({ kind: fc.constant('penalty' as const), amount: amountArb(150) }),
  fc.record({ kind: fc.constant('addPause' as const), id: fc.constantFrom(...PAUSE_IDS) }),
  fc.record({ kind: fc.constant('removePause' as const), id: fc.constantFrom(...PAUSE_IDS) }),
  fc.record({ kind: fc.constant('random' as const) }),
  fc.record({ kind: fc.constant('emit' as const) }),
  fc.record({ kind: fc.constant('revive' as const) }),
);

/** One step after the run ended: some startDownload inputs and some hostile system ops. */
interface AfterStep {
  readonly startDownloads: number;
  readonly ops: readonly HostileOp[];
}

const afterStepsArb: fc.Arbitrary<readonly AfterStep[]> = fc.array(
  fc.record({
    startDownloads: fc.integer({ min: 0, max: 3 }),
    ops: fc.array(hostileOpArb, { minLength: 1, maxLength: 6 }),
  }),
  { minLength: 1, maxLength: 60 },
);

/**
 * A system that applies `ops` through the tick context (and, for `revive`, by writing the draft
 * directly, as a buggy system might). It counts its calls so the test can check that step()
 * never ran it on a terminal state.
 */
function hostileSystem(ops: readonly HostileOp[], calls: { count: number }): System {
  return (draft, ctx) => {
    calls.count++;
    for (const op of ops) {
      switch (op.kind) {
        case 'damage':
          ctx.damageModem(op.amount);
          break;
        case 'penalty':
          ctx.penalizeDownload(op.amount);
          break;
        case 'addPause':
          ctx.addPauseSource(op.id);
          break;
        case 'removePause':
          ctx.removePauseSource(op.id);
          break;
        case 'random':
          ctx.random();
          break;
        case 'emit':
          ctx.emit({ type: 'connected' });
          break;
        case 'revive':
          draft.phase = 'downloading';
          draft.integrity = draft.balance.maxIntegrity;
          draft.download = 0;
          break;
      }
    }
  };
}

// ---------------------------------------------------------------------------------------------
// Properties
// ---------------------------------------------------------------------------------------------

describe('game-core properties', () => {
  // Feature: game-core, Property P1: determinism
  // **Validates: Requirements 1.2**
  it('P1: same seed and same inputs give identical states and events on every tick', () => {
    fc.assert(
      fc.property(runScriptArb, (script) => {
        const a = traceRun(script);
        const b = traceRun(script);
        expect(b.states).toHaveLength(script.ticks + 1);
        for (let i = 0; i < a.states.length; i++) {
          expect(b.states[i]).toStrictEqual(a.states[i]);
        }
        for (let i = 0; i < a.events.length; i++) {
          expect(b.events[i]).toStrictEqual(a.events[i]);
        }
      }),
      { numRuns: 100 },
    );
  });

  // Feature: game-core, Property P2: no mutation
  // **Validates: Requirements 1.5**
  it('P2: step never mutates its input, even when the input is deep-frozen', () => {
    fc.assert(
      fc.property(runScriptArb, (script) => {
        // Walk the script's run, deep-freezing every reachable state before stepping it with
        // that tick's scripted inputs, so every phase and every scheduled effect is applied to a
        // frozen input. The probe system makes every context method write on every tick.
        const systems = [...systemsFor(script), touchEveryContextMethod];
        let state = createRun({ seed: script.seed, balance: script.balance });
        for (let i = 0; i < script.ticks; i++) {
          const frozen = deepFreeze(state);
          const snapshot = structuredClone(frozen);
          const tick = frozen.tick + 1;
          const inputs: InputCommand[] = script.inputs
            .filter((entry) => entry.tick === tick)
            .map((entry) => entry.command);
          let result: ReturnType<typeof step> | undefined;
          expect(() => {
            result = step(frozen, inputs, systems);
          }).not.toThrow();
          expect(frozen).toStrictEqual(snapshot);
          state = result!.state;
        }
      }),
      { numRuns: 100 },
    );
  });

  // Feature: game-core, Property P7: JSON round trip
  // **Validates: Requirements 6.2**
  it('P7: every state and event in a random run survives a JSON round trip unchanged', () => {
    fc.assert(
      fc.property(runScriptArb, (script) => {
        const { states, events } = traceRun(script);
        for (const state of states) {
          expect(jsonRoundTrip(state)).toStrictEqual(state);
        }
        for (const event of events.flat()) {
          expect(jsonRoundTrip(event)).toStrictEqual(event);
        }
      }),
      { numRuns: 100 },
    );
  });

  // Feature: game-core, Property P3: integrity bounds
  // **Validates: Requirements 4.2**
  it('P3: integrity stays in [0, max] on every tick and in every modemHit event', () => {
    fc.assert(
      fc.property(harshRunScriptArb, (script) => {
        const { states, events } = traceRun(script);
        const max = states[0]!.balance.maxIntegrity;
        for (const state of states) {
          expect(state.integrity).toBeGreaterThanOrEqual(0);
          expect(state.integrity).toBeLessThanOrEqual(max);
        }
        for (const event of events.flat()) {
          if (event.type !== 'modemHit') continue;
          expect(event.integrity).toBeGreaterThanOrEqual(0);
          expect(event.integrity).toBeLessThanOrEqual(max);
        }
      }),
      { numRuns: 100 },
    );
  });

  // Feature: game-core, Property P4: download bounds
  // **Validates: Requirements 5.1**
  it('P4: download stays in [0, 100] on every tick and in every downloadPenalty event', () => {
    fc.assert(
      fc.property(harshRunScriptArb, (script) => {
        const { states, events } = traceRun(script);
        for (const state of states) {
          expect(state.download).toBeGreaterThanOrEqual(0);
          expect(state.download).toBeLessThanOrEqual(100);
        }
        for (const event of events.flat()) {
          if (event.type !== 'downloadPenalty') continue;
          expect(event.download).toBeGreaterThanOrEqual(0);
          expect(event.download).toBeLessThanOrEqual(100);
        }
      }),
      { numRuns: 100 },
    );
  });

  // Feature: game-core, Property P9: one integrityCritical per crossing (whole runs)
  // **Validates: Requirements 4.3**
  it('P9: in a run, integrityCritical events match the crossings of the critical threshold', () => {
    fc.assert(
      fc.property(harshRunScriptArb, (script) => {
        const { states, events } = traceRun(script);
        const start = states[0]!;
        const all = events.flat();
        const hits = all.flatMap((e) => (e.type === 'modemHit' ? [e.integrity] : []));
        const crossings = countCrossings(start.integrity, hits, start.balance.criticalIntegrity);
        const criticals = all.filter((e) => e.type === 'integrityCritical');
        expect(criticals).toHaveLength(crossings);
        // Without repair, integrity only falls, so a run crosses at most once.
        expect(criticals.length).toBeLessThanOrEqual(1);
      }),
      { numRuns: 100 },
    );
  });

  // Feature: game-core, Property P9: one integrityCritical per crossing (tick context, repairs)
  // **Validates: Requirements 4.3**
  it('P9: the tick context emits one integrityCritical per crossing, also after repairs', () => {
    type Op =
      | { readonly kind: 'damage'; readonly fraction: number }
      | { readonly kind: 'repair'; readonly fraction: number };
    const opArb: fc.Arbitrary<Op> = fc.oneof(
      // Damage as a fraction of max: mostly small hits, sometimes overkill to hit the 0 floor.
      fc.record({
        kind: fc.constant('damage' as const),
        fraction: fc.oneof(fc.double({ min: 0, max: 0.3, noNaN: true }), fc.double({ min: 0, max: 1.5, noNaN: true })),
      }),
      // A repair raises integrity part or all of the way back to max (no repair API exists yet,
      // so the test writes the draft directly, as a future repair system would).
      fc.record({ kind: fc.constant('repair' as const), fraction: fc.double({ min: 0, max: 1, noNaN: true }) }),
    );

    fc.assert(
      fc.property(seedArb, integrityBalanceArb, fc.array(opArb, { maxLength: 40 }), (seed, balance, ops) => {
        const run = createRun({ seed, balance });
        const draft: MutableGameState = { ...run, pauseSources: [...run.pauseSources] };
        const events: GameEvent[] = [];
        const ctx = createTickContext(draft, events);
        const { maxIntegrity: max, criticalIntegrity: critical } = draft.balance;

        let crossings = 0;
        for (const op of ops) {
          if (op.kind === 'repair') {
            draft.integrity += (max - draft.integrity) * op.fraction;
            continue;
          }
          const before = draft.integrity;
          ctx.damageModem(op.fraction * max);
          if (before > critical && draft.integrity <= critical) crossings++;
        }

        expect(events.filter((e) => e.type === 'integrityCritical')).toHaveLength(crossings);
      }),
      { numRuns: 200 },
    );
  });

  // Feature: game-core, Property P5: no progress while paused
  // **Validates: Requirements 5.3, 5.4**
  it('P5: download never increases on a tick that starts or ends with a pause source active', () => {
    // A tick is paused if a source was active when it began (resume waits for the next tick,
    // Req 5.4) or is still active after the systems ran (Req 5.3). Both are visible in the trace
    // as a non-empty pauseSources on the state before or after the tick.
    let pausedDownloadTicks = 0;
    fc.assert(
      fc.property(pausedRunScriptArb, (script) => {
        const { states } = traceRun(script);
        for (let i = 1; i < states.length; i++) {
          const before = states[i - 1]!;
          const after = states[i]!;
          if (before.pauseSources.length === 0 && after.pauseSources.length === 0) continue;
          if (before.phase === 'downloading') pausedDownloadTicks++;
          expect(after.download).toBeLessThanOrEqual(before.download);
        }
      }),
      { numRuns: 100 },
    );
    // Guard against a vacuous pass: the scripts must actually pause running downloads.
    expect(pausedDownloadTicks).toBeGreaterThan(0);
  });

  // Feature: game-core, Property P10: pause-order independence (tick context, add/remove)
  // **Validates: Requirements 1.2, 5.3, 5.4**
  it('P10: after any add/remove sequence, pauseSources is the sorted set of active ids', () => {
    type Op = { readonly op: 'add' | 'remove'; readonly id: string };
    const opArb: fc.Arbitrary<Op> = fc.record({
      op: fc.constantFrom('add' as const, 'remove' as const),
      id: pauseIdArb,
    });

    fc.assert(
      fc.property(seedArb, fc.array(opArb, { maxLength: 40 }), (seed, ops) => {
        const { draft, ctx } = freshContext(seed);
        const active = new Set<string>();
        for (const { op, id } of ops) {
          const before = [...draft.pauseSources];
          if (op === 'add') {
            ctx.addPauseSource(id);
            active.add(id);
          } else {
            ctx.removePauseSource(id);
            active.delete(id);
            // Removing an id that is not active changes nothing.
            if (!before.includes(id)) expect(draft.pauseSources).toStrictEqual(before);
          }
          expect(draft.pauseSources).toStrictEqual(canonicalPauses(active));
        }
      }),
      { numRuns: 200 },
    );
  });

  // Feature: game-core, Property P10: pause-order independence (tick context, permuted adds)
  // **Validates: Requirements 1.2, 5.3**
  it('P10: adding the same ids in any order gives the same sorted, de-duplicated array', () => {
    const idsAndPermutationArb = fc
      .array(pauseIdArb, { maxLength: 12 })
      .chain((ids) =>
        fc.tuple(
          fc.constant(ids),
          fc.shuffledSubarray(ids, { minLength: ids.length, maxLength: ids.length }),
        ),
      );

    fc.assert(
      fc.property(seedArb, idsAndPermutationArb, (seed, [ids, permuted]) => {
        const a = freshContext(seed);
        const b = freshContext(seed);
        for (const id of ids) a.ctx.addPauseSource(id);
        for (const id of permuted) b.ctx.addPauseSource(id);
        expect(a.draft.pauseSources).toStrictEqual(canonicalPauses(ids));
        expect(b.draft).toStrictEqual(a.draft);
      }),
      { numRuns: 200 },
    );
  });

  // Feature: game-core, Property P10: pause-order independence (whole runs)
  // **Validates: Requirements 1.2, 5.3**
  it('P10: adding the same pause sources in a different order within a tick gives the same run', () => {
    const scriptPairArb = pausedRunScriptArb.chain((script) =>
      fc
        .record({
          tick: tickInRun(script.ticks),
          ids: fc.array(pauseIdArb, { minLength: 1, maxLength: 6 }),
        })
        .chain(({ tick, ids }) =>
          fc
            .shuffledSubarray(ids, { minLength: ids.length, maxLength: ids.length })
            .map((permuted): [RunScript, RunScript] => {
              // The extra adds run after the script's own pause events on that tick, so the
              // two scripts differ only in the order of these adds.
              const adds = (order: readonly string[]): PauseEvent[] =>
                order.map((id) => ({ tick, op: 'add', id }));
              return [
                { ...script, pauses: [...script.pauses, ...adds(ids)] },
                { ...script, pauses: [...script.pauses, ...adds(permuted)] },
              ];
            }),
        ),
    );

    fc.assert(
      fc.property(scriptPairArb, ([scriptA, scriptB]) => {
        const a = traceRun(scriptA);
        const b = traceRun(scriptB);
        expect(b.states).toStrictEqual(a.states);
        expect(b.events).toStrictEqual(a.events);
      }),
      { numRuns: 100 },
    );
  });

  // Feature: game-core, Property P6: terminal phases are absorbing
  // **Validates: Requirements 3.9**
  it('P6: once won or lost, every further step returns the same state object and no events', () => {
    const reached = { won: 0, lost: 0 };
    fc.assert(
      fc.property(
        fc.oneof(winningRunScriptArb, losingRunScriptArb),
        afterStepsArb,
        (script, afterSteps) => {
          const terminal = runToTerminal(script);
          // The scripts are built so the cap is never hit; fail loudly if that ever changes.
          expect(['won', 'lost']).toContain(terminal.phase);
          if (terminal.phase === 'won') reached.won++;
          else reached.lost++;

          // Freeze the terminal state so any write would throw, and keep a snapshot to compare.
          const snapshot = structuredClone(terminal);
          deepFreeze(terminal);

          const calls = { count: 0 };
          let state = terminal;
          for (const { startDownloads, ops } of afterSteps) {
            const inputs: InputCommand[] = Array.from({ length: startDownloads }, () => ({
              type: 'startDownload' as const,
            }));
            const systems = [hostileSystem(ops, calls), ...systemsFor(script), touchEveryContextMethod];
            const result = step(state, inputs, systems);
            expect(result.state).toBe(terminal);
            expect(result.events).toHaveLength(0);
            state = result.state;
          }

          expect(calls.count).toBe(0);
          expect(terminal).toStrictEqual(snapshot);
        },
      ),
      { numRuns: 100 },
    );
    // Guard against a vacuous pass: both terminal phases must have been exercised.
    expect(reached.won).toBeGreaterThan(0);
    expect(reached.lost).toBeGreaterThan(0);
  });
});
