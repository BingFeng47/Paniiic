import { describe, expect, it } from 'vitest';
import { createTickContext, type System } from '../../src/game/context';
import { createRun } from '../../src/game/state';
import type { GameEvent, GameState, InputCommand, MutableGameState } from '../../src/game/types';
import { scheduledDamage, scheduledPenalty, stepN, type StepFn } from './game';

function setup(overrides: Partial<MutableGameState> = {}) {
  const run = createRun({ seed: 1 });
  const draft: MutableGameState = { ...run, pauseSources: [...run.pauseSources], ...overrides };
  const events: GameEvent[] = [];
  const ctx = createTickContext(draft, events);
  return { draft, events, ctx };
}

/**
 * A stand-in for `step()`: clone, tick + 1, emit `downloadStarted` per input, run systems.
 * It records the inputs it saw per produced tick so tests can check delivery.
 */
function fakeStep(seen: Array<{ tick: number; inputs: readonly InputCommand[] }>): StepFn {
  return (state: GameState, inputs, systems = []) => {
    const draft: MutableGameState = { ...state, pauseSources: [...state.pauseSources] };
    draft.tick += 1;
    const events: GameEvent[] = [];
    const ctx = createTickContext(draft, events);
    seen.push({ tick: draft.tick, inputs });
    inputs.forEach(() => ctx.emit({ type: 'downloadStarted' }));
    for (const system of systems) system(draft, ctx);
    return { state: draft, events };
  };
}

describe('scheduledDamage', () => {
  it('damages the modem only on scheduled ticks, applying every entry for that tick in order', () => {
    const system = scheduledDamage([
      { tick: 3, amount: 10 },
      { tick: 5, amount: 1 },
      { tick: 3, amount: 5 },
    ]);
    const { draft, events, ctx } = setup({ tick: 2 });

    system(draft, ctx);
    expect(draft.integrity).toBe(100);
    expect(events).toEqual([]);

    draft.tick = 3;
    system(draft, ctx);
    expect(draft.integrity).toBe(85);
    expect(events).toEqual([
      { type: 'modemHit', amount: 10, integrity: 90, tick: 3 },
      { type: 'modemHit', amount: 5, integrity: 85, tick: 3 },
    ]);
  });

  it('does nothing with an empty schedule', () => {
    const { draft, events, ctx } = setup({ tick: 1 });
    scheduledDamage([])(draft, ctx);
    expect(draft.integrity).toBe(100);
    expect(events).toEqual([]);
  });
});

describe('scheduledPenalty', () => {
  it('penalizes the download only on scheduled ticks, applying every entry for that tick', () => {
    const system = scheduledPenalty([
      { tick: 4, amount: 3 },
      { tick: 4, amount: 2 },
    ]);
    const { draft, events, ctx } = setup({ tick: 3, download: 40 });

    system(draft, ctx);
    expect(draft.download).toBe(40);

    draft.tick = 4;
    system(draft, ctx);
    expect(draft.download).toBe(35);
    expect(events).toEqual([
      { type: 'downloadPenalty', amount: 3, download: 37, tick: 4 },
      { type: 'downloadPenalty', amount: 2, download: 35, tick: 4 },
    ]);
  });
});

describe('stepN', () => {
  it('steps exactly n times and returns the final state', () => {
    const seen: Array<{ tick: number; inputs: readonly InputCommand[] }> = [];
    const result = stepN(fakeStep(seen), createRun({ seed: 1 }), 5);
    expect(result.state.tick).toBe(5);
    expect(seen.map((s) => s.tick)).toEqual([1, 2, 3, 4, 5]);
    expect(result.events).toEqual([]);
  });

  it('returns the same state and no events for n = 0', () => {
    const start = createRun({ seed: 1 });
    const result = stepN(fakeStep([]), start, 0);
    expect(result.state).toBe(start);
    expect(result.events).toEqual([]);
  });

  it('rejects a negative or fractional n', () => {
    const start = createRun({ seed: 1 });
    expect(() => stepN(fakeStep([]), start, -1)).toThrow();
    expect(() => stepN(fakeStep([]), start, 1.5)).toThrow();
  });

  it('delivers scheduled inputs on the step that produces their tick', () => {
    const seen: Array<{ tick: number; inputs: readonly InputCommand[] }> = [];
    const start = { type: 'startDownload' } as const;
    const result = stepN(fakeStep(seen), createRun({ seed: 1 }), 3, {
      inputs: [
        { tick: 2, command: start },
        { tick: 2, command: start },
      ],
    });
    expect(seen.map((s) => s.inputs.length)).toEqual([0, 2, 0]);
    expect(result.events).toEqual([
      { type: 'downloadStarted', tick: 2 },
      { type: 'downloadStarted', tick: 2 },
    ]);
  });

  it('passes systems to every step and collects events across steps in order', () => {
    const ticksSeen: number[] = [];
    const recorder: System = (_draft, ctx) => {
      ticksSeen.push(ctx.tick);
    };
    const result = stepN(fakeStep([]), createRun({ seed: 1 }), 4, {
      systems: [recorder, scheduledDamage([{ tick: 2, amount: 30 }, { tick: 4, amount: 60 }])],
    });
    expect(ticksSeen).toEqual([1, 2, 3, 4]);
    expect(result.state.integrity).toBe(10);
    expect(result.events).toEqual([
      { type: 'modemHit', amount: 30, integrity: 70, tick: 2 },
      { type: 'modemHit', amount: 60, integrity: 10, tick: 4 },
      { type: 'integrityCritical', integrity: 10, tick: 4 },
    ]);
  });
});
