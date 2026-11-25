// Run stats (leaderboard Req 2): the counts the score needs, kept in the Run state so the score
// is a pure function of the Final_State. Pure: reads only this Tick's events.
import type { System } from './context';

/** Plain-data counters for one Run. Survives a JSON round trip. */
export interface RunStats {
  /** `mobKilled` events of every kind except `glob`. */
  readonly kills: number;
  /** True once a boss `mobKilled` has happened. */
  readonly bossKilled: boolean;
  /** `adClosed` events. Ads cleared by the pop-up blocker emit `adBlocked` and don't count. */
  readonly adsClosed: number;
}

/**
 * Folds this Tick's events into `draft.stats` (Req 2.1). It must run last among the
 * Game_Systems, so it sees every event of the Tick. `stats` is absent until the first run
 * (Req 2.2).
 */
export const statsSystem: System = (draft, ctx) => {
  let { kills, bossKilled, adsClosed } = draft.stats ?? { kills: 0, bossKilled: false, adsClosed: 0 };
  for (const ev of ctx.eventsSoFar()) {
    if (ev.type === 'mobKilled') {
      if (ev.kind !== 'glob') kills += 1;
      if (ev.kind === 'boss') bossKilled = true;
    } else if (ev.type === 'adClosed') {
      adsClosed += 1;
    }
  }
  draft.stats = { kills, bossKilled, adsClosed };
};
