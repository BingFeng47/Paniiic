// Headless runner: plays a whole run in a plain loop over `step()`, with no browser (Req 7.1).
// Tests and the future zombie-sim MCP server use it to measure runs. Pure: no DOM, timers,
// wall clock or Math.random.
import type { System } from './context';
import { createRun, type NewRunOptions } from './state';
import { step } from './step';
import { TICK_RATE, type GameEvent, type GameState, type InputCommand, type Phase } from './types';

/** An input command delivered on the step that produces `tick` (ticks count from 1). */
export interface ScriptedInput {
  readonly tick: number;
  readonly command: InputCommand;
}

/** A snapshot of the run's headline numbers. */
export interface RunSample {
  /** `tick / TICK_RATE`. A whole number, except possibly for the final sample. */
  readonly second: number;
  readonly phase: Phase;
  readonly integrity: number;
  readonly download: number;
}

export interface HeadlessOptions extends NewRunOptions {
  readonly script?: readonly ScriptedInput[];
  readonly systems?: readonly System[];
  /** Stop after this much simulated time if the run hasn't ended. Default 300. */
  readonly maxSeconds?: number;
}

export interface HeadlessResult {
  readonly final: GameState;
  /** Every event of the run, in order. */
  readonly events: readonly GameEvent[];
  /** One per whole second (starting with second 0), plus the final tick. */
  readonly samples: readonly RunSample[];
  readonly endedBy: 'won' | 'lost' | 'timeout';
}

export const DEFAULT_MAX_SECONDS = 300;

function sample(state: GameState): RunSample {
  return {
    second: state.tick / TICK_RATE,
    phase: state.phase,
    integrity: state.integrity,
    download: state.download,
  };
}

/** Group scripted commands by tick, keeping script order within a tick. Throws on bad ticks. */
function commandsByTick(script: readonly ScriptedInput[]): Map<number, InputCommand[]> {
  const map = new Map<number, InputCommand[]>();
  for (const { tick, command } of script) {
    if (!Number.isInteger(tick) || tick < 1) {
      throw new Error(`runHeadless: script ticks must be integers >= 1, got ${tick}`);
    }
    const list = map.get(tick);
    if (list) list.push(command);
    else map.set(tick, [command]);
  }
  return map;
}

/**
 * Play one run from `options.seed` until it is won or lost, or until `maxSeconds` of simulated
 * time have passed (Req 7.1, 7.2).
 *
 * - The run is created with `createRun`, so balance overrides apply to this run only (Req 7.3).
 *   Invalid overrides throw `BalanceError` before anything runs.
 * - Script entries for tick T are passed to the step that produces tick T, in script order.
 *   Entries for ticks after the run ends are never delivered.
 * - `maxSeconds` must be finite and > 0. It becomes `max(1, round(maxSeconds * TICK_RATE))`
 *   ticks, the same rounding the dial timer uses.
 * - Samples: the initial state is sampled as second 0, then the state after every tick that is
 *   a multiple of TICK_RATE. The final state is added once more only if its tick is not a whole
 *   second, so there is never a duplicate. A run that ends at tick T always has its last sample
 *   at `T / TICK_RATE`.
 * - A run that wins or loses on the very last allowed tick ends by `won` / `lost`, not timeout.
 */
export function runHeadless(options: HeadlessOptions): HeadlessResult {
  const maxSeconds = options.maxSeconds ?? DEFAULT_MAX_SECONDS;
  if (!Number.isFinite(maxSeconds) || maxSeconds <= 0) {
    throw new Error(`runHeadless: maxSeconds must be finite and > 0, got ${maxSeconds}`);
  }
  const maxTicks = Math.max(1, Math.round(maxSeconds * TICK_RATE));
  const inputsByTick = commandsByTick(options.script ?? []);
  const systems = options.systems ?? [];

  let state = createRun({ seed: options.seed, balance: options.balance });
  const events: GameEvent[] = [];
  const samples: RunSample[] = [sample(state)];

  while (state.phase !== 'won' && state.phase !== 'lost' && state.tick < maxTicks) {
    const result = step(state, inputsByTick.get(state.tick + 1) ?? [], systems);
    state = result.state;
    events.push(...result.events);
    if (state.tick % TICK_RATE === 0) samples.push(sample(state));
  }

  if (state.tick % TICK_RATE !== 0) samples.push(sample(state));

  const endedBy = state.phase === 'won' || state.phase === 'lost' ? state.phase : 'timeout';
  return { final: state, events, samples, endedBy };
}
