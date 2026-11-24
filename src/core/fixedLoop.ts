// Browser-side fixed-timestep loop. Turns real frame time into a whole number of simulation
// ticks, carrying the remainder to the next frame (Req 2.1), clamping long gaps (Req 2.2) and
// pausing while the page is hidden without replaying the hidden time (Req 2.3, 2.4).
//
// Browser globals are resolved lazily inside `startFixedLoop`, so importing this module in Node
// or jsdom is safe. Every dependency can be injected for tests.

import { TICK_RATE } from '../game/types';

/** Length of one simulation tick in milliseconds. */
export const TICK_MS = 1000 / TICK_RATE;

/** Longest frame gap the loop will account for (Req 2.2). 250 ms is 15 ticks. */
export const MAX_FRAME_MS = 250;

/** Rounding slack when deciding whether the leftover is a whole tick. */
const SNAP_MS = 1e-9;

/**
 * Pure: how many ticks to run for this frame, and the leftover time.
 *
 * `accMs` is the leftover from the previous frame, expected in [0, TICK_MS). `elapsedMs` is the
 * real time since the previous frame. Negative or NaN elapsed time counts as 0, and anything
 * above `MAX_FRAME_MS` counts as `MAX_FRAME_MS`. The returned `accMs` is always in [0, TICK_MS).
 */
export function accumulate(accMs: number, elapsedMs: number): { ticks: number; accMs: number } {
  const elapsed = elapsedMs > 0 ? Math.min(elapsedMs, MAX_FRAME_MS) : 0;
  const prior = accMs > 0 && Number.isFinite(accMs) ? accMs : 0;
  // No time passed: run no ticks, even if the leftover is within SNAP_MS of a full tick.
  if (elapsed === 0 && prior < TICK_MS) return { ticks: 0, accMs: prior };
  const total = prior + elapsed;

  let ticks = Math.floor(total / TICK_MS);
  let acc = total - ticks * TICK_MS;
  // The division can round across a tick boundary in either direction. Correct by one tick.
  if (acc < 0) {
    ticks -= 1;
    acc += TICK_MS;
  }
  // A leftover within SNAP_MS of a full tick is a full tick. TICK_MS is stored slightly above
  // 1000/60, so without this, 250 ms would give 14 ticks plus a 16.6666666666666 ms leftover.
  if (acc >= TICK_MS - SNAP_MS) {
    ticks += 1;
    acc -= TICK_MS;
  }
  // Last guard against rounding residue; any error here is far below 1e-6 ms.
  if (acc < 0 || acc >= TICK_MS) acc = 0;
  return { ticks, accMs: acc };
}

export interface FixedLoopDeps {
  readonly now: () => number;
  readonly requestFrame: (cb: (t: number) => void) => number;
  readonly cancelFrame: (id: number) => void;
  readonly visibility: {
    readonly hidden: boolean;
    addEventListener(t: 'visibilitychange', f: () => void): void;
    removeEventListener(t: 'visibilitychange', f: () => void): void;
  };
}

/** Calls onTicks(n) each frame with n ≥ 0. Returns a stop function. */
export function startFixedLoop(
  onTicks: (n: number) => void,
  deps: Partial<FixedLoopDeps> = {},
): () => void {
  const now = deps.now ?? (() => performance.now());
  const requestFrame = deps.requestFrame ?? ((cb: (t: number) => void) => requestAnimationFrame(cb));
  const cancelFrame = deps.cancelFrame ?? ((id: number) => cancelAnimationFrame(id));
  const visibility = deps.visibility ?? document;

  let stopped = false;
  let frameId: number | null = null;
  let lastMs = 0;
  let accMs = 0;

  const cancelPending = (): void => {
    if (frameId !== null) {
      cancelFrame(frameId);
      frameId = null;
    }
  };

  const frame = (): void => {
    frameId = null;
    // A frame can still arrive just before the visibilitychange event; skip it and let the
    // visible handler restart the loop with a fresh clock.
    if (stopped || visibility.hidden) return;
    const t = now();
    const result = accumulate(accMs, t - lastMs);
    lastMs = t;
    accMs = result.accMs;
    onTicks(result.ticks);
    // onTicks may have stopped the loop or the page may have been hidden meanwhile.
    if (!stopped && !visibility.hidden && frameId === null) frameId = requestFrame(frame);
  };

  /** Start or restart from "now" with an empty accumulator, so no hidden time is replayed. */
  const resume = (): void => {
    lastMs = now();
    accMs = 0;
    frameId = requestFrame(frame);
  };

  const onVisibilityChange = (): void => {
    if (stopped) return;
    if (visibility.hidden) cancelPending();
    else if (frameId === null) resume(); // ignore a repeated "visible" while already running
  };

  visibility.addEventListener('visibilitychange', onVisibilityChange);
  if (!visibility.hidden) resume();

  return () => {
    if (stopped) return;
    stopped = true;
    cancelPending();
    visibility.removeEventListener('visibilitychange', onVisibilityChange);
  };
}
