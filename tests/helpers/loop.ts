// Manual stand-in for `startFixedLoop`. Code under test receives `loop.start` as its
// `startLoop` dependency; the test then delivers frames by hand with `loop.frame(n)`.

/**
 * Same shape as `LoopStarter` in `src/dialup/session.ts` (defined here so this helper does not
 * depend on that module). Starts a loop that calls `onTicks(n)` once per frame; returns a stop
 * function.
 */
export type LoopStarter = (onTicks: (n: number) => void) => () => void;

export interface ManualLoop {
  /** Pass this wherever a `LoopStarter` is expected. */
  readonly start: LoopStarter;
  /**
   * Deliver one frame of `n` ticks (n ≥ 0, integer) to every loop that is still running, in the
   * order they were started. Loops stopped before or during the frame are skipped, like the real
   * loop, which never calls `onTicks` after its stop function ran.
   */
  frame(n: number): void;
  /** True while at least one started loop has not been stopped. */
  isRunning(): boolean;
  /** Number of loops started so far. */
  startCount(): number;
  /** Number of calls to any returned stop function, repeated calls included. */
  stopCount(): number;
}

interface Subscription {
  readonly onTicks: (n: number) => void;
  running: boolean;
}

export function createManualLoop(): ManualLoop {
  const subscriptions: Subscription[] = [];
  let stops = 0;

  const start: LoopStarter = (onTicks) => {
    const sub: Subscription = { onTicks, running: true };
    subscriptions.push(sub);
    return () => {
      stops += 1;
      sub.running = false;
    };
  };

  return {
    start,
    frame(n) {
      if (!Number.isInteger(n) || n < 0) {
        throw new Error(`manual loop: frame(n) needs a non-negative integer, got ${n}`);
      }
      // Snapshot so loops started during this frame first run on the next frame.
      for (const sub of [...subscriptions]) {
        if (sub.running) sub.onTicks(n);
      }
    },
    isRunning: () => subscriptions.some((sub) => sub.running),
    startCount: () => subscriptions.length,
    stopCount: () => stops,
  };
}
