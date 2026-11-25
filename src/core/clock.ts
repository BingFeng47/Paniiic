/** Wall-clock helpers for the runtime (leaderboard Req 1.3). Keep `src/game/` free of these. */

/** The UTC Day of `d` as `YYYY-MM-DD`. */
export function utcDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}
