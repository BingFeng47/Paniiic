import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { nextRandom } from '../../src/game/rng';

const MAX_UINT32 = 0xffffffff;

/** The widely published closure form of Mulberry32, used as an independent reference. */
function referenceMulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Draws `count` values starting from `state`. */
function draw(state: number, count: number): number[] {
  const values: number[] = [];
  let current = state;
  for (let i = 0; i < count; i++) {
    const result = nextRandom(current);
    values.push(result.value);
    current = result.next;
  }
  return values;
}

const uint32 = fc.integer({ min: 0, max: MAX_UINT32 });

describe('nextRandom', () => {
  it('returns values in [0, 1)', () => {
    fc.assert(
      fc.property(uint32, (state) => {
        const { value } = nextRandom(state);
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThan(1);
      }),
    );
  });

  it('gives the same value and next state for the same input state', () => {
    fc.assert(
      fc.property(uint32, (state) => {
        expect(nextRandom(state)).toEqual(nextRandom(state));
      }),
    );
  });

  it('returns a next state that is an integer in the uint32 range', () => {
    fc.assert(
      fc.property(uint32, (state) => {
        const { next } = nextRandom(state);
        expect(Number.isInteger(next)).toBe(true);
        expect(next).toBeGreaterThanOrEqual(0);
        expect(next).toBeLessThanOrEqual(MAX_UINT32);
      }),
    );
  });

  it('matches the reference Mulberry32 sequence', () => {
    fc.assert(
      fc.property(uint32, (seed) => {
        const reference = referenceMulberry32(seed);
        const expected = Array.from({ length: 8 }, () => reference());
        expect(draw(seed, 8)).toEqual(expected);
      }),
    );
  });

  it('wraps the state at the top of the uint32 range', () => {
    const { next, value } = nextRandom(MAX_UINT32);
    expect(next).toBe((MAX_UINT32 + 0x6d2b79f5) % 2 ** 32);
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThan(1);
  });

  it('produces different values along a sequence', () => {
    const values = draw(1, 100);
    expect(new Set(values).size).toBe(100);
  });

  it('keeps state and value JSON-safe', () => {
    const result = nextRandom(42);
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });
});
