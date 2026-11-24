// Test helpers for game-core: drive a run for N ticks and inject scheduled effects through
// systems. `stepN` takes the step function as a parameter, so this file does not depend on
// `src/game/step.ts` and works with any function of the same shape.

import type { System } from '../../src/game/context';
import type { ScriptedInput } from '../../src/game/headless';
import type { GameEvent, GameState, InputCommand } from '../../src/game/types';

/** The shape of `step()` from the design. */
export type StepFn = (
  state: GameState,
  inputs: readonly InputCommand[],
  systems?: readonly System[],
) => { readonly state: GameState; readonly events: readonly GameEvent[] };

/** An effect applied on the step that produces `tick`. */
export interface ScheduledAmount {
  readonly tick: number;
  readonly amount: number;
}

/** An input command delivered on the step that produces `tick`. Same shape as the headless runner's. */
export type ScheduledInput = ScriptedInput;

export interface StepNOptions {
  readonly systems?: readonly System[];
  readonly inputs?: readonly ScheduledInput[];
}

export interface StepNResult {
  readonly state: GameState;
  /** Every event from all n steps, in order. */
  readonly events: readonly GameEvent[];
}

/** Group entries by tick, keeping array order within each tick. */
function byTick<T extends { readonly tick: number }>(entries: readonly T[]): Map<number, T[]> {
  const map = new Map<number, T[]>();
  for (const entry of entries) {
    const list = map.get(entry.tick);
    if (list) list.push(entry);
    else map.set(entry.tick, [entry]);
  }
  return map;
}

/**
 * Step `state` exactly `n` times with `stepFn`. Inputs scheduled for tick T are passed to the
 * step that produces tick T (the step called on a state whose tick is T - 1).
 */
export function stepN(
  stepFn: StepFn,
  state: GameState,
  n: number,
  options: StepNOptions = {},
): StepNResult {
  if (!Number.isInteger(n) || n < 0) {
    throw new Error(`stepN: n must be a non-negative integer, got ${n}`);
  }
  const inputsByTick = byTick(options.inputs ?? []);
  const events: GameEvent[] = [];
  let current = state;
  for (let i = 0; i < n; i++) {
    const inputs = (inputsByTick.get(current.tick + 1) ?? []).map((entry) => entry.command);
    const result = stepFn(current, inputs, options.systems);
    current = result.state;
    events.push(...result.events);
  }
  return { state: current, events };
}

/** A system that calls `ctx.damageModem(amount)` for every entry whose tick is `ctx.tick`. */
export function scheduledDamage(schedule: readonly ScheduledAmount[]): System {
  const entries = byTick(schedule);
  return (_draft, ctx) => {
    for (const { amount } of entries.get(ctx.tick) ?? []) ctx.damageModem(amount);
  };
}

/** A system that calls `ctx.penalizeDownload(amount)` for every entry whose tick is `ctx.tick`. */
export function scheduledPenalty(schedule: readonly ScheduledAmount[]): System {
  const entries = byTick(schedule);
  return (_draft, ctx) => {
    for (const { amount } of entries.get(ctx.tick) ?? []) ctx.penalizeDownload(amount);
  };
}
