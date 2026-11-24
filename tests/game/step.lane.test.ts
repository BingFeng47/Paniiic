// Game-core extension tests for the connection lane (task 1.4): the tick context carries the
// tick's input commands to every system, and step() itself ignores Hammer_Commands.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { CoreBalance } from '../../src/game/balance/core';
import { createTickContext, type System } from '../../src/game/context';
import { createRun } from '../../src/game/state';
import { step } from '../../src/game/step';
import type { GameEvent, GameState, InputCommand, MutableGameState } from '../../src/game/types';
import {
  scheduledDamage,
  scheduledPenalty,
  stepN,
  type ScheduledAmount,
  type ScheduledInput,
} from '../helpers/game';

const hammer = (x: number, y: number): InputCommand => ({ type: 'hammer', x, y });
const START: InputCommand = { type: 'startDownload' };

describe('createTickContext inputs', () => {
  it('exposes an empty input list when called without inputs', () => {
    const draft: MutableGameState = { ...createRun({ seed: 1 }), pauseSources: [] };
    const ctx = createTickContext(draft, []);
    expect(ctx.inputs).toEqual([]);
  });
});

describe('step() passes inputs to systems', () => {
  it('shows every system the tick commands in arrival order, and [] on ticks without input', () => {
    const seen: { tick: number; call: number; inputs: InputCommand[] }[] = [];
    const probe =
      (call: number): System =>
      (_draft, ctx) => {
        seen.push({ tick: ctx.tick, call, inputs: [...ctx.inputs] });
      };
    const systems = [probe(0), probe(1), probe(2)];
    const tick2 = [hammer(5, 1), START, hammer(Number.NaN, Infinity), hammer(-3, 0)];
    const inputs: ScheduledInput[] = tick2.map((command) => ({ tick: 2, command }));

    stepN(step, createRun({ seed: 7 }), 3, { systems, inputs });

    expect(seen).toEqual([
      { tick: 1, call: 0, inputs: [] },
      { tick: 1, call: 1, inputs: [] },
      { tick: 1, call: 2, inputs: [] },
      { tick: 2, call: 0, inputs: tick2 },
      { tick: 2, call: 1, inputs: tick2 },
      { tick: 2, call: 2, inputs: tick2 },
      { tick: 3, call: 0, inputs: [] },
      { tick: 3, call: 1, inputs: [] },
      { tick: 3, call: 2, inputs: [] },
    ]);
  });
});

describe('createRun and the lane', () => {
  it('returns a state with no lane key', () => {
    const state = createRun({ seed: 1 });
    expect('lane' in state).toBe(false);
    expect(Object.keys(state)).not.toContain('lane');
  });
});

// ---------------------------------------------------------------------------------------------
// Property 11
// ---------------------------------------------------------------------------------------------

const MAX_TICKS = 600;

interface Script {
  readonly seed: number;
  readonly balance: Partial<CoreBalance>;
  readonly ticks: number;
  /** startDownload and hammer commands, in arrival order within each tick. */
  readonly inputs: readonly ScheduledInput[];
  /** Core-only effects so the run reaches damaged, penalized, won and lost states. */
  readonly damage: readonly ScheduledAmount[];
  readonly penalties: readonly ScheduledAmount[];
}

/** Any double, including NaN, ±Infinity and -0, so non-finite clicks are covered. */
const coordArb = fc.oneof(
  fc.double(),
  fc.constantFrom(Number.NaN, Infinity, -Infinity),
  fc.double({ min: -50, max: 1000, noNaN: true }),
);

const scriptArb: fc.Arbitrary<Script> = fc.integer({ min: 1, max: MAX_TICKS }).chain((ticks) => {
  const tickArb = fc.integer({ min: 1, max: ticks });
  const commandArb: fc.Arbitrary<InputCommand> = fc.oneof(
    { weight: 1, arbitrary: fc.constant(START) },
    { weight: 4, arbitrary: fc.record({ x: coordArb, y: coordArb }).map(({ x, y }) => hammer(x, y)) },
  );
  return fc.record({
    seed: fc.integer({ min: 0, max: 0xffffffff }),
    balance: fc.record({
      dialSeconds: fc.integer({ min: 30, max: 120 }).map((t) => t / 60),
      downloadPercentPerSecond: fc.double({ min: 20, max: 100, noNaN: true }),
    }),
    ticks: fc.constant(ticks),
    inputs: fc
      .array(fc.record({ tick: tickArb, command: commandArb }), { maxLength: 40 })
      .map((list) => [...list].sort((a, b) => a.tick - b.tick)),
    damage: fc.array(
      fc.record({ tick: tickArb, amount: fc.double({ min: 0, max: 15, noNaN: true }) }),
      { maxLength: 15 },
    ),
    penalties: fc.array(
      fc.record({ tick: tickArb, amount: fc.double({ min: 0, max: 30, noNaN: true }) }),
      { maxLength: 8 },
    ),
  });
});

/** Step tick by tick and record every state and every tick's events. */
function trace(
  script: Script,
  inputs: readonly ScheduledInput[],
): { states: GameState[]; events: (readonly GameEvent[])[] } {
  const systems: System[] = [scheduledDamage(script.damage), scheduledPenalty(script.penalties)];
  let state = createRun({ seed: script.seed, balance: script.balance });
  const states: GameState[] = [state];
  const events: (readonly GameEvent[])[] = [];
  for (let i = 0; i < script.ticks; i++) {
    const tick = state.tick + 1;
    const commands = inputs.filter((entry) => entry.tick === tick).map((entry) => entry.command);
    const result = step(state, commands, systems);
    state = result.state;
    states.push(state);
    events.push(result.events);
  }
  return { states, events };
}

describe('step() and hammer commands', () => {
  it('produces the same states and events with hammer commands removed', () => {
    // Property: Req 9.2 step() leaves phase, download and pause sources unchanged for hammer commands
    // Feature: connection-lane, Property 11: step() itself ignores hammer commands
    fc.assert(
      fc.property(scriptArb, (script) => {
        const withHammers = trace(script, script.inputs);
        const withoutHammers = trace(
          script,
          script.inputs.filter((entry) => entry.command.type !== 'hammer'),
        );
        expect(withHammers.states).toEqual(withoutHammers.states);
        expect(withHammers.events).toEqual(withoutHammers.events);
        for (const state of withHammers.states) expect('lane' in state).toBe(false);
      }),
      { numRuns: 150 },
    );
  });
});
