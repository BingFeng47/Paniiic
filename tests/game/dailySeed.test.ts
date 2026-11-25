// Daily seed (leaderboard Req 1.1, 1.2; design Property 1).
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { dailySeed } from '../../src/game/dailySeed';

const FNV_OFFSET = 0x811c9dc5n;
const FNV_PRIME = 0x01000193n;
const MASK_32 = 0xffffffffn;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Independent reference: textbook 32-bit FNV-1a over the string's bytes, in BigInt. */
function referenceFnv1a(text: string): number {
  let h = FNV_OFFSET;
  for (const byte of new TextEncoder().encode(text)) {
    h = ((h ^ BigInt(byte)) * FNV_PRIME) & MASK_32;
  }
  return Number(h);
}

/** Every Day of `year` (UTC) as `YYYY-MM-DD`, in order. */
function daysOfYear(year: number): string[] {
  const days: string[] = [];
  const d = new Date(Date.UTC(year, 0, 1));
  while (d.getUTCFullYear() === year) {
    days.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return days;
}

const dayArb = fc
  .date({ min: new Date(Date.UTC(1970, 0, 1)), max: new Date(Date.UTC(9999, 11, 31)), noInvalidDate: true })
  .map((d) => d.toISOString().slice(0, 10));

describe('referenceFnv1a', () => {
  it('matches the published FNV-1a 32-bit test vectors', () => {
    expect(referenceFnv1a('')).toBe(0x811c9dc5);
    expect(referenceFnv1a('a')).toBe(0xe40c292c);
    expect(referenceFnv1a('foobar')).toBe(0xbf9cf968);
  });
});

describe('dailySeed', () => {
  it('is the FNV-1a hash of DEADLINE56K: + Day (Req 1.1)', () => {
    expect(dailySeed('2026-11-24')).toBe(referenceFnv1a('DEADLINE56K:2026-11-24'));
    expect(dailySeed('1998-10-31')).toBe(referenceFnv1a('DEADLINE56K:1998-10-31'));
  });

  it('throws on strings that are not YYYY-MM-DD (Req 1.2)', () => {
    for (const bad of ['', '2026-1-01', '2026-11-24T00:00', ' 2026-11-24', '2026/11/24', '26-11-24', 'today']) {
      expect(() => dailySeed(bad), bad).toThrow();
    }
  });

  // Property 1: Req 1.1, 1.2 Daily seed is deterministic, a uint32, and differs between consecutive Days
  describe('Property 1: daily seed', () => {
    it('is deterministic, a uint32 and equals the reference FNV-1a', () => {
      /** **Validates: Requirements 1.1** */
      fc.assert(
        fc.property(dayArb, (day) => {
          const seed = dailySeed(day);
          expect(dailySeed(day)).toBe(seed);
          expect(Number.isInteger(seed)).toBe(true);
          expect(seed).toBeGreaterThanOrEqual(0);
          expect(seed).toBeLessThanOrEqual(0xffffffff);
          expect(seed).toBe(referenceFnv1a(`DEADLINE56K:${day}`));
        }),
      );
    });

    it('differs for consecutive Days across a sampled year', () => {
      /** **Validates: Requirements 1.1** */
      fc.assert(
        fc.property(fc.integer({ min: 1970, max: 2100 }), (year) => {
          const seeds = daysOfYear(year).map(dailySeed);
          for (let i = 1; i < seeds.length; i++) expect(seeds[i]).not.toBe(seeds[i - 1]);
        }),
        { numRuns: 20 },
      );
    });

    it('throws for any string that is not YYYY-MM-DD', () => {
      /** **Validates: Requirements 1.2** */
      fc.assert(
        fc.property(
          fc.string().filter((s) => !DAY.test(s)),
          (bad) => {
            expect(() => dailySeed(bad)).toThrow();
          },
        ),
      );
    });
  });
});
