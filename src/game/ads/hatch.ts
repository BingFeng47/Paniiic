// Hatching (ad-pressure Req 4): a clutter Ad left open lets a Mob out of the Manhole every
// `hatchSeconds`, timed on the Ad's own clock (`tick − openTick`). Pure: it reads only the Ad, the
// Tick and the ad balance, and draws no random numbers (Req 9.1). Views use `hatchView`; they
// never compute hatch timing themselves (Req 4.7).
import type { AdBalance } from '../balance/ads';
import { secondsToTicks } from '../balance/lane';
import { TICK_RATE } from '../types';
import type { Ad } from './adTypes';
export interface HatchView {
  /** Seconds until this Ad's next Hatch, in (0, hatchSeconds]. */
  readonly secondsLeft: number;
  /** True during the last `hatchWarningSeconds` before each Hatch (the Hatch_Warning). */
  readonly warning: boolean;
}
/** Ticks between Hatches; the resolver guarantees at least 1. */
function hatchTicks(b: AdBalance): number {
  return Math.max(1, secondsToTicks(b.hatchSeconds));
}
/** Ticks left until the next Hatch, in [1, hatchTicks]. On a Hatch Tick it is the full period. */
function ticksLeft(ad: Ad, tick: number, b: AdBalance): number {
  const period = hatchTicks(b);
  const age = Math.max(0, tick - ad.openTick);
  return period - (age % period);
}
/** Hatch timing of a clutter Ad, or null for any other kind. */
export function hatchView(ad: Ad, tick: number, b: AdBalance): HatchView | null {
  if (ad.kind !== 'clutter') return null;
  const left = ticksLeft(ad, tick, b);
  return {
    secondsLeft: left / TICK_RATE,
    warning: left <= secondsToTicks(b.hatchWarningSeconds),
  };
}
/** True on the Ticks this clutter Ad hatches: age > 0 and age % hatchTicks === 0. */
export function hatchesNow(ad: Ad, tick: number, b: AdBalance): boolean {
  if (ad.kind !== 'clutter') return false;
  const age = tick - ad.openTick;
  return age > 0 && age % hatchTicks(b) === 0;
}
