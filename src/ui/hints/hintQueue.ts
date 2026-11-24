// Pure Hint queue (player-guide Req 2.2-2.5). Plain data held by the Hint_View, never in GameState.
// Invariants: queued.length <= 2; ids unique across shown, current and queued.
import type { Anchor, HintId } from './hintTable';
import type { DueHint } from './hintTriggers';

/** Ticks a Hint_Balloon stays open before it closes by itself (Req 2.5). */
export const HINT_TIMEOUT_TICKS = 360;
/** Most Hints waiting behind the current one (Req 2.4). */
export const MAX_QUEUED = 2;

export interface CurrentHint {
  readonly id: HintId;
  readonly sinceTick: number;
  readonly anchor: Anchor;
}

export interface HintQueue {
  /** Every id that has become current this Run. */
  readonly shown: readonly HintId[];
  readonly current: CurrentHint | null;
  readonly queued: readonly DueHint[];
}

export function createHintQueue(): HintQueue {
  return { shown: [], current: null, queued: [] };
}

function promote(q: HintQueue, tick: number): HintQueue {
  const [next, ...rest] = q.queued;
  if (!next) return { ...q, current: null };
  return {
    shown: [...q.shown, next.id],
    current: { id: next.id, sinceTick: tick, anchor: next.anchor },
    queued: rest,
  };
}

/** Adds due Hints: skips known ids, shows one if idle, else queues and drops the oldest over 2. */
export function pushDue(q: HintQueue, due: readonly DueHint[], tick: number): HintQueue {
  let out = q;
  for (const d of due) {
    if (out.shown.includes(d.id) || out.current?.id === d.id || out.queued.some((x) => x.id === d.id)) continue;
    if (out.current === null) {
      out = { shown: [...out.shown, d.id], current: { id: d.id, sinceTick: tick, anchor: d.anchor }, queued: out.queued };
    } else {
      const queued = [...out.queued, d];
      out = { ...out, queued: queued.length > MAX_QUEUED ? queued.slice(queued.length - MAX_QUEUED) : queued };
    }
  }
  return out;
}

/** Closes the current Hint once it has been open for 360 Ticks and promotes the next one. */
export function tickQueue(q: HintQueue, tick: number): HintQueue {
  if (q.current === null) return q.queued.length > 0 ? promote(q, tick) : q;
  if (tick - q.current.sinceTick >= HINT_TIMEOUT_TICKS) return promote(q, tick);
  return q;
}

/** The player clicked the ✕: close the current Hint and promote the next one. */
export function dismiss(q: HintQueue, tick: number): HintQueue {
  if (q.current === null) return q;
  return promote(q, tick);
}
