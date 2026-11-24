// Bandwidth_Factor examples (ad-pressure Req 2.2, 2.3) and Correctness Property 1 (bandwidth
// bounds). Properties 2 and 3 live in tests/game/downloadRate.test.ts.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { initialAds } from '../../../src/game/ads/adSystems';
import type { Ad, AdKind, AdState } from '../../../src/game/ads/adTypes';
import { bandwidthFor, bandwidthSystem } from '../../../src/game/ads/bandwidth';
import { DEFAULT_AD_BALANCE, resolveAdBalance } from '../../../src/game/balance/ads';
import { createRun } from '../../../src/game/state';
import type { TickContext } from '../../../src/game/context';
import type { MutableGameState } from '../../../src/game/types';

function ad(id: number, kind: AdKind): Ad {
  return {
    id,
    kind,
    pattern: kind === 'fake' ? null : 'plain',
    rect: { x: 0, y: 0, w: 10, h: 10 },
    openTick: 0,
    copy: 0,
    laneCover: false,
    stage: 'main',
    corner: null,
    closeAt: null,
    jumps: 0,
  };
}

function adsWith(kinds: readonly AdKind[], balance = DEFAULT_AD_BALANCE): AdState {
  return { ...initialAds(balance), ads: kinds.map((k, i) => ad(i + 1, k)) };
}

describe('bandwidthFor (Req 2.2, 2.3)', () => {
  it('is 1 with no ads and drops 0.15 per open clutter Ad', () => {
    expect(bandwidthFor(adsWith([]))).toBe(1);
    expect(bandwidthFor(adsWith(['clutter']))).toBeCloseTo(0.85, 12);
    expect(bandwidthFor(adsWith(['clutter', 'clutter', 'clutter']))).toBeCloseTo(0.55, 12);
  });

  it('stops at the floor', () => {
    expect(bandwidthFor(adsWith(['clutter', 'clutter', 'clutter', 'clutter']))).toBe(0.4);
    expect(bandwidthFor(adsWith(Array<AdKind>(8).fill('clutter')))).toBe(0.4);
  });

  it('ignores fake buttons and interrupters', () => {
    expect(bandwidthFor(adsWith(['fake', 'interrupter', 'interrupter']))).toBe(1);
    expect(bandwidthFor(adsWith(['fake', 'clutter', 'interrupter']))).toBeCloseTo(0.85, 12);
  });

  it('reads the Run balance', () => {
    const b = resolveAdBalance({ bandwidthPerClutter: 0.5, bandwidthFloor: 0.1 });
    expect(bandwidthFor(adsWith(['clutter'], b))).toBe(0.5);
    expect(bandwidthFor(adsWith(['clutter', 'clutter'], b))).toBe(0.1);
  });
});

describe('bandwidthSystem (Req 2.2)', () => {
  const ctx = {} as TickContext;

  it('writes draft.bandwidth from the Ad_State', () => {
    const draft = { ...createRun({ seed: 1 }), ads: adsWith(['clutter', 'fake']) } as MutableGameState;
    bandwidthSystem(draft, ctx);
    expect(draft.bandwidth).toBeCloseTo(0.85, 12);
  });

  it('leaves bandwidth absent while there is no Ad_State', () => {
    const draft = { ...createRun({ seed: 1 }) } as MutableGameState;
    bandwidthSystem(draft, ctx);
    expect('bandwidth' in draft).toBe(false);
  });
});
// ---------------------------------------------------------------------------------------------
// Property 1
const arbBandwidthCase = fc.record({
  bandwidthPerClutter: fc.double({ min: 0, max: 1, noNaN: true }),
  bandwidthFloor: fc.double({ min: 0, max: 1, noNaN: true }),
  kinds: fc.array(fc.constantFrom<AdKind>('clutter', 'fake', 'interrupter'), { maxLength: 12 }),
  added: fc.constantFrom<AdKind>('clutter', 'fake', 'interrupter'),
  at: fc.nat(),
});
describe('Property 1', () => {
  // Property: Req 2.1, 2.2, 2.3 bandwidthFor is in [floor, 1], never rises when a clutter Ad
  // opens, and ignores fake buttons and interrupters
  // Feature: ad-pressure, Property 1: Bandwidth bounds
  it('Property 1: bandwidth bounds', () => {
    fc.assert(
      fc.property(arbBandwidthCase, ({ bandwidthPerClutter, bandwidthFloor, kinds, added, at }) => {
        const balance = resolveAdBalance({ bandwidthPerClutter, bandwidthFloor });
        const before = bandwidthFor(adsWith(kinds, balance));
        expect(before).toBeGreaterThanOrEqual(bandwidthFloor);
        expect(before).toBeLessThanOrEqual(1);
        const i = at % (kinds.length + 1);
        const after = bandwidthFor(adsWith([...kinds.slice(0, i), added, ...kinds.slice(i)], balance));
        expect(after).toBeGreaterThanOrEqual(bandwidthFloor);
        expect(after).toBeLessThanOrEqual(1);
        if (added === 'clutter') expect(after).toBeLessThanOrEqual(before);
        else expect(after).toBe(before);
        // Only the clutter count matters: dropping every fake and interrupter changes nothing.
        expect(bandwidthFor(adsWith(kinds.filter((k) => k === 'clutter'), balance))).toBe(before);
      }),
      { numRuns: 300 },
    );
  });
});
