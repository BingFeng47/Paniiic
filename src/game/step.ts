// The step function: the only way the simulation advances (Req 1.1). It follows the seven-stage
// tick order from the design ("Order inside one tick") and never mutates its input (Req 1.5).

import { dialTicks } from './balance/core';
import { createTickContext, type System } from './context';
import { downloadRate } from './downloadRate';
import { TICK_RATE, type GameEvent, type GameState, type InputCommand, type MutableGameState } from './types';

export interface StepResult {
  readonly state: GameState;
  readonly events: readonly GameEvent[];
}

const HALFWAY = 50;
const COMPLETE = 100;

/**
 * Tolerance for download thresholds. Progress is a sum of float increments (100 / 110 / 60 per
 * tick by default), so after the mathematically exact number of ticks it can sit a few ulps
 * below 50 or 100. Treating anything within 1e-9 of a threshold as reaching it makes a full
 * download finish on exactly the expected tick (6,600 un-paused ticks by default), and the
 * stored value is snapped to 100 so the state shows a clean 100. One tick of progress is far
 * larger than this (about 0.015), so the tolerance can never end a download a tick early.
 */
const EPSILON = 1e-9;

function reached(value: number, threshold: number): boolean {
  return value >= threshold - EPSILON;
}

/** A shallow copy of `obj` without `key`, so the shared table is left out of the deep clone. */
function withoutKey<T extends object, K extends keyof T>(obj: T, key: K): Omit<T, K> {
  const { [key]: _omitted, ...others } = obj;
  return others;
}

/**
 * Advance `state` by one tick with the player's `inputs` for this tick and the lane `systems`.
 * Returns the next state and the events of this tick in order, each tagged with the tick.
 */
export function step(
  state: GameState,
  inputs: readonly InputCommand[],
  systems: readonly System[] = [],
): StepResult {
  // 1. Terminal phases are absorbing: same object, no events (Req 3.9).
  if (state.phase === 'won' || state.phase === 'lost') {
    return { state, events: [] };
  }

  // 2. Work on a deep copy so the caller's state is never touched (Req 1.5). The tick is
  //    advanced before the context exists, so every event is tagged with the new tick.
  //    `balance` is read-only and never changes during a run, so it is shared, not cloned.
  //    The nested read-only tables (lane/ads/economy balance, director table) are shared the
  //    same way: no system writes into them, so the draft reuses the same references.
  const { balance: sharedBalance, lane, ads, economy, director, ...rest } = state;
  const cloned = structuredClone({
    rest,
    lane: lane && withoutKey(lane, 'balance'),
    ads: ads && withoutKey(ads, 'balance'),
    economy: economy && withoutKey(economy, 'balance'),
    director: director && withoutKey(director, 'table'),
  });
  const draft: MutableGameState = {
    ...cloned.rest,
    balance: sharedBalance,
    pauseSources: [...state.pauseSources],
  };
  if (lane && cloned.lane) draft.lane = { ...cloned.lane, balance: lane.balance };
  if (ads && cloned.ads) draft.ads = { ...cloned.ads, balance: ads.balance };
  if (economy && cloned.economy) draft.economy = { ...cloned.economy, balance: economy.balance };
  if (director && cloned.director) draft.director = { ...cloned.director, table: director.table };
  draft.tick += 1;
  const events: GameEvent[] = [];
  const ctx = createTickContext(draft, events, inputs);
  const { balance } = draft;

  // 3. Input commands, in array order. `startDownload` only works once connected (Req 3.2, 3.4).
  for (const input of inputs) {
    switch (input.type) {
      case 'startDownload':
        if (draft.phase === 'connected') {
          draft.phase = 'downloading';
          draft.phaseStartTick = draft.tick;
          ctx.emit({ type: 'downloadStarted' });
        }
        break;
      case 'hammer':
        // Lane input: step() ignores it here; the lane systems read it through ctx.inputs.
        break;
      case 'adClick':
      case 'adHover':
        // Browser-front input: the ad systems read it through ctx.inputs.
        break;
      case 'lanePointer':
      case 'buy':
      case 'switchWeapon':
      case 'equipWeapon':
        // Economy input: weaponSystem and walletSystem read it through ctx.inputs.
        break;
      default: {
        const unknown: never = input;
        throw new Error(`step: unknown input command ${String((unknown as { type: unknown }).type)}`);
      }
    }
  }

  // 4. Systems, in array order. A pause source that was active when the tick began still holds
  //    this tick's progress even if a system removes it now: "resume on the next tick" (Req 5.4)
  //    means the first tick after the removal. A source added now pauses this tick (Req 5.3).
  const pausedAtStart = draft.pauseSources.length > 0;
  for (const system of systems) system(draft, ctx);

  // 5. Dial timer: lane systems run while dialing; the link comes up after the dial duration
  //    (Req 3.2, 3.3).
  if (draft.phase === 'dialing' && draft.tick - draft.phaseStartTick >= dialTicks(balance)) {
    draft.phase = 'connected';
    draft.phaseStartTick = draft.tick;
    ctx.emit({ type: 'connected' });
  }

  // 6. Download progress while downloading and not paused (Req 3.5, 5.1, 5.3, 5.4, 5.5). The
  //    rate uses the bandwidth and integrity as they stand now, after this tick's systems
  //    (ad-pressure Req 2.4, 3.2). At full integrity with no bandwidth field it is exactly
  //    `downloadPercentPerSecond`, so the 8,100-tick timing and EPSILON still hold (Req 3.3).
  const paused = pausedAtStart || draft.pauseSources.length > 0;
  if (draft.phase === 'downloading' && !paused) {
    const perTick = downloadRate(draft) / TICK_RATE;
    const next = draft.download + perTick;
    draft.download = reached(next, COMPLETE) ? COMPLETE : next;
    if (!draft.halfwayReached && reached(draft.download, HALFWAY)) {
      draft.halfwayReached = true;
      ctx.emit({ type: 'downloadHalfway' });
    }
  }

  // 7. Resolve: the win takes priority over a same-tick loss (Req 3.6, 3.7, 3.8).
  if (draft.download >= COMPLETE) {
    draft.phase = 'won';
    draft.phaseStartTick = draft.tick;
    ctx.emit({ type: 'won' });
  } else if (draft.integrity <= 0) {
    draft.phase = 'lost';
    draft.phaseStartTick = draft.tick;
    ctx.emit({ type: 'lost' });
  }

  return { state: draft, events };
}
