/**
 * Mulberry32: a small seeded 32-bit generator. Its whole state is one unsigned 32-bit integer,
 * which lives in `GameState.rng` so it survives a JSON round trip (Req 1.3, 6.2).
 *
 * Pure: the caller passes the current state and stores the returned `next` state.
 */

/** Weyl-sequence increment used by Mulberry32. */
const INCREMENT = 0x6d2b79f5;

/** 2^32, used to map a uint32 onto [0, 1). */
const UINT32_RANGE = 4294967296;

/**
 * Draws one random number.
 *
 * @param rngState the current generator state (a uint32; other numbers are coerced with `>>> 0`)
 * @returns `value` in [0, 1) and `next`, the uint32 state to use for the following draw
 */
export function nextRandom(rngState: number): { value: number; next: number } {
  const next = ((rngState >>> 0) + INCREMENT) >>> 0;
  let t = Math.imul(next ^ (next >>> 15), next | 1);
  t = (t + Math.imul(t ^ (t >>> 7), t | 61)) ^ t;
  const value = ((t ^ (t >>> 14)) >>> 0) / UINT32_RANGE;
  return { value, next };
}
