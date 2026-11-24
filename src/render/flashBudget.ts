/**
 * Shared flash budget (juice-and-endings Req 8.1, design "Flash budget").
 *
 * One budget per Session for the whole Screen: at most `FLASH_LIMIT` `full` grants in any
 * `FLASH_WINDOW_TICKS` window. A request over the limit gets `dim` and is not counted.
 * Pure bookkeeping on Run Ticks; no timers, no DOM.
 */
import { CCTV_TUNING } from './cctv/cctvTuning';

export const FLASH_LIMIT = CCTV_TUNING.flashBudget;
export const FLASH_WINDOW_TICKS = CCTV_TUNING.flashWindowTicks;

export type FlashGrant = 'full' | 'dim';

export interface FlashBudget {
  requestFlash(tick: number): FlashGrant;
  /** Granted `full` onsets still inside the window ending at `tick`. */
  recent(tick: number): readonly number[];
}

function inWindow(ticks: readonly number[], tick: number): number[] {
  return ticks.filter((t) => t > tick - FLASH_WINDOW_TICKS && t <= tick);
}

/** `seed` lists earlier `full` onsets (used when a caller carries its own history). */
export function createFlashBudget(seed: readonly number[] = []): FlashBudget {
  let granted: number[] = [...seed];
  return {
    requestFlash(tick) {
      granted = inWindow(granted, tick);
      if (granted.length >= FLASH_LIMIT) return 'dim';
      granted.push(tick);
      return 'full';
    },
    recent(tick) {
      return inWindow(granted, tick);
    },
  };
}
