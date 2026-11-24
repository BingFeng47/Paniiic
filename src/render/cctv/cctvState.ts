/**
 * Render-only camera state for the CCTV feed (lane-cctv design, "Camera state").
 *
 * Pure: every value derives from the Run Tick, the frame's events and the critical flag. The only
 * "randomness" is `hash32`, a fixed integer hash. Nothing here feeds back into `src/game/`.
 */
import type { GameEvent } from '../../game/types';
import { createFlashBudget, type FlashBudget } from '../flashBudget';
import { CCTV_TUNING as T } from './cctvTuning';

export interface MotionBox {
  readonly id: number;
  readonly untilTick: number;
}

export interface CctvState {
  /** First update's tick; Feed_Startup runs from here. */
  readonly startTick: number | null;
  /** A Signal_Tear shows while tick < this. */
  readonly tearUntilTick: number;
  /** True when the current tear started over the flash budget: draw it at half alpha. */
  readonly tearDim: boolean;
  readonly criticalSinceTick: number | null;
  /** Dropout cycle (since `criticalSinceTick`) that is shown, or null. */
  readonly dropoutCycle: number | null;
  /** Last dropout cycle already decided (shown or skipped), so a cycle is judged once. */
  readonly decidedCycle: number | null;
  /** Onsets of this feed's `full` flashes within the last `flashWindowTicks` (granted by the shared budget). */
  readonly flashTicks: readonly number[];
  readonly motionBoxes: readonly MotionBox[];
}

export const EMPTY_CCTV: CctvState = Object.freeze({
  startTick: null,
  tearUntilTick: 0,
  tearDim: false,
  criticalSinceTick: null,
  dropoutCycle: null,
  decidedCycle: null,
  flashTicks: Object.freeze([]) as readonly number[],
  motionBoxes: Object.freeze([]) as readonly MotionBox[],
});

/** Fixed 32-bit integer hash (lowbias32). Returns an unsigned 32-bit integer. */
export function hash32(n: number): number {
  let x = n | 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d);
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b);
  x ^= x >>> 16;
  return x >>> 0;
}

export function startupActive(s: CctvState, tick: number): boolean {
  return s.startTick !== null && tick - s.startTick >= 0 && tick - s.startTick < T.startupTicks;
}

export function tearActive(s: CctvState, tick: number): boolean {
  return tick < s.tearUntilTick;
}

function dropoutPhase(s: CctvState, tick: number): { cycle: number; inWindow: boolean } | null {
  if (s.criticalSinceTick === null) return null;
  const c = tick - s.criticalSinceTick;
  if (c < 0) return null;
  const cycle = Math.floor(c / T.dropoutEveryTicks);
  const inWindow = c % T.dropoutEveryTicks < T.dropoutTicks && hash32(cycle) % 3 !== 0;
  return { cycle, inWindow };
}

export function dropoutActive(s: CctvState, tick: number): boolean {
  if (startupActive(s, tick)) return false;
  const p = dropoutPhase(s, tick);
  return p !== null && p.inWindow && p.cycle === s.dropoutCycle;
}

/** Grain tile and offset; changes every `grainEveryTicks` ticks. */
export function grainFrame(tick: number): { tile: number; dx: number; dy: number } {
  const step = Math.floor(tick / T.grainEveryTicks);
  const h = hash32(step);
  return {
    tile: ((step % T.grainTiles) + T.grainTiles) % T.grainTiles,
    dx: h % T.grainTileSize,
    dy: (h >>> 16) % T.grainTileSize,
  };
}

export function recOn(tick: number): boolean {
  const period = 2 * T.recHalfPeriodTicks;
  return ((tick % period) + period) % period < T.recHalfPeriodTicks;
}

/**
 * Advance the camera state for one rendered frame.
 * `liveIds`, when given, lists the Mob ids still on the lane; boxes for other ids are dropped.
 * `budget` is the Session's shared flash budget; without one, a budget seeded from
 * `s.flashTicks` is used, so the feed alone still keeps the limit.
 */
export function applyCctvEvents(
  s: CctvState,
  events: readonly GameEvent[],
  tick: number,
  critical: boolean,
  liveIds?: readonly number[],
  budget: FlashBudget = createFlashBudget(s.flashTicks),
): CctvState {
  let flashTicks = s.flashTicks.filter((t) => t > tick - T.flashWindowTicks && t <= tick);
  /** Ask the shared budget; record the onset when granted `full`. */
  const flash = (): boolean => {
    if (budget.requestFlash(tick) !== 'full') return false;
    flashTicks = [...flashTicks, tick];
    return true;
  };

  // Startup: set on the first call, counts as one flash onset.
  let startTick = s.startTick;
  if (startTick === null) {
    startTick = tick;
    flash();
  }

  // Tear: restart on any modemHit; a fresh start is a flash onset unless over budget (dimmed).
  let tearUntilTick = s.tearUntilTick;
  let tearDim = s.tearDim;
  if (events.some((e) => e.type === 'modemHit')) {
    if (!tearActive(s, tick)) {
      tearDim = !flash();
    }
    tearUntilTick = tick + T.tearTicks;
  }

  // Dropout bookkeeping.
  let criticalSinceTick = s.criticalSinceTick;
  let dropoutCycle = s.dropoutCycle;
  let decidedCycle = s.decidedCycle;
  if (critical && criticalSinceTick === null) {
    criticalSinceTick = tick;
    dropoutCycle = null;
    decidedCycle = null;
  } else if (!critical) {
    criticalSinceTick = null;
    dropoutCycle = null;
    decidedCycle = null;
  }
  const next0: CctvState = { ...s, startTick, criticalSinceTick };
  const p = dropoutPhase(next0, tick);
  if (p !== null && p.inWindow && p.cycle !== decidedCycle && !startupActive(next0, tick)) {
    decidedCycle = p.cycle;
    if (flash()) dropoutCycle = p.cycle;
  }

  // Motion boxes.
  let motionBoxes = s.motionBoxes.filter(
    (b) => tick < b.untilTick && (liveIds === undefined || liveIds.includes(b.id)),
  );
  for (const e of events) {
    if (e.type === 'mobSpawned') {
      motionBoxes = [...motionBoxes.filter((b) => b.id !== e.id), { id: e.id, untilTick: tick + T.motionBoxTicks }];
    }
  }

  return {
    startTick,
    tearUntilTick,
    tearDim,
    criticalSinceTick,
    dropoutCycle,
    decidedCycle,
    flashTicks,
    motionBoxes,
  };
}
