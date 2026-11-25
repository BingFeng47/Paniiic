/**
 * Daily seed (leaderboard Req 1.1, 1.2): every player gets the same Run on the same UTC Day, so
 * the Hall of Fame compares like with like. Pure: the caller supplies the Day string.
 */
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** 32-bit FNV-1a hash of `DEADLINE56K:` + `day`. Throws unless `day` is `YYYY-MM-DD`. */
export function dailySeed(day: string): number {
  if (!DAY.test(day)) throw new Error(`dailySeed: expected YYYY-MM-DD, got ${day}`);
  let h = 0x811c9dc5;
  for (const ch of `DEADLINE56K:${day}`) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}
