/**
 * Shutdown copy and timeline (Req 13.1–13.3, 14.7). Pure data and one pure function.
 *
 * 0–1,500 ms "Please wait...", 1,500–3,500 ms "It is now safe...", 3,500–4,000 ms CRT collapse,
 * then done.
 */

export const SHUTDOWN_COPY = {
  wait: 'Please wait while your computer shuts down...',
  safe: 'It is now safe to switch off your computer.',
} as const;

export const SHUTDOWN_TIMES = { safeAtMs: 1500, collapseAtMs: 3500, doneAtMs: 4000 } as const;

export type ShutdownFrame = 'wait' | 'safe' | 'collapse' | 'done';

/** The frame shown `elapsedMs` after the scene mounted. NaN counts as 0. Pure. */
export function shutdownFrameAt(elapsedMs: number): ShutdownFrame {
  const t = Number.isNaN(elapsedMs) ? 0 : elapsedMs;
  if (t < SHUTDOWN_TIMES.safeAtMs) return 'wait';
  if (t < SHUTDOWN_TIMES.collapseAtMs) return 'safe';
  if (t < SHUTDOWN_TIMES.doneAtMs) return 'collapse';
  return 'done';
}
