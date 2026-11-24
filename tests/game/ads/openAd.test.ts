import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { TickContext } from '../../../src/game/context';
import type { AdState } from '../../../src/game/ads/adTypes';
import { openAd } from '../../../src/game/ads/openAd';
import { contains, intersects, placeAd, rectGap } from '../../../src/game/ads/placement';
import { DEFAULT_AD_BALANCE as B, resolveAdBalance } from '../../../src/game/balance/ads';
import type { GameEventBody } from '../../../src/game/types';

function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

function fakeCtx(seed = 1, tick = 100) {
  const events: GameEventBody[] = [];
  const pauses: string[] = [];
  const random = seeded(seed);
  const ctx = {
    tick, inputs: [], emit: (e: GameEventBody) => events.push(e), eventsSoFar: () => [],
    random, damageModem: () => {}, penalizeDownload: () => {},
    addPauseSource: (id: string) => pauses.push(id), removePauseSource: () => {},
  } as unknown as TickContext;
  return { ctx, events, pauses };
}

const empty: AdState = { balance: B, nextId: 1, ads: [], connectedTick: 0, openedFirstClutter: false };

describe('openAd', () => {
  it('opens an interrupter with its pause source and adOpened', () => {
    const { ctx, events, pauses } = fakeCtx();
    const s = openAd(empty, ctx, 'interrupter', ['runaway'], false);
    expect(s.ads).toHaveLength(1);
    expect(s.nextId).toBe(2);
    expect(pauses).toEqual(['ad:1']);
    expect(events).toEqual([{ type: 'adOpened', id: 1, kind: 'interrupter', pattern: 'runaway', laneCover: false }]);
    expect(s.ads[0].closeAt).not.toBeNull();
    expect(contains(B.page, s.ads[0].rect)).toBe(true);
  });

  it('fake buttons have no pattern; hidden picks a corner', () => {
    const { ctx } = fakeCtx();
    const s = openAd(openAd(empty, ctx, 'fake', [], false), ctx, 'clutter', ['hidden'], false);
    expect(s.ads[0].pattern).toBeNull();
    expect(s.ads[1].corner).not.toBeNull();
    expect(s.openedFirstClutter).toBe(true);
  });

  // ad-pressure Req 5.1: the cap counts clutter only.
  it('emits adSkipped for clutter at the clutter cap and leaves the state unchanged', () => {
    const { ctx, events } = fakeCtx();
    let s = empty;
    for (let i = 0; i < B.cap; i++) s = openAd(s, ctx, 'clutter', ['plain'], false);
    events.length = 0;
    expect(openAd(s, ctx, 'clutter', ['plain'], false)).toBe(s);
    expect(events).toEqual([{ type: 'adSkipped', kind: 'clutter' }]);
  });

  // ad-pressure Req 5.2: interrupters and fake buttons open whatever the number of open Ads.
  it('opens interrupters and fake buttons with the clutter cap full', () => {
    const { ctx, events, pauses } = fakeCtx();
    let s = empty;
    for (let i = 0; i < B.cap; i++) s = openAd(s, ctx, 'clutter', ['plain'], false);
    events.length = 0;
    s = openAd(s, ctx, 'interrupter', ['plain'], false);
    s = openAd(s, ctx, 'fake', [], false);
    expect(s.ads.map((a) => a.kind)).toEqual([...Array<string>(B.cap).fill('clutter'), 'interrupter', 'fake']);
    expect(events.map((e) => e.type)).toEqual(['adOpened', 'adOpened']);
    expect(pauses).toEqual([`ad:${B.cap + 1}`]);
  });

  // ad-pressure Req 5.1: interrupters and fake buttons do not count toward the cap.
  it('opens clutter below the clutter cap however many other Ads are open', () => {
    const { ctx, events } = fakeCtx();
    let s = empty;
    for (let i = 0; i < B.cap; i++) {
      s = openAd(s, ctx, 'interrupter', ['plain'], false);
      s = openAd(s, ctx, 'fake', [], false);
    }
    for (let i = 0; i < B.cap - 1; i++) s = openAd(s, ctx, 'clutter', ['plain'], false);
    events.length = 0;
    const next = openAd(s, ctx, 'clutter', ['plain'], false);
    expect(next.ads).toHaveLength(s.ads.length + 1);
    expect(next.ads.filter((a) => a.kind === 'clutter')).toHaveLength(B.cap);
    expect(events).toEqual([{ type: 'adOpened', id: s.nextId, kind: 'clutter', pattern: 'plain', laneCover: false }]);
  });

  // Property: Req 4.1, 4.3, 4.4, 4.5 placement rules
  it('placement stays inside its area and respects the Real_Link', () => {
    fc.assert(fc.property(fc.integer(), fc.boolean(), (seed, laneCover) => {
      const r = seeded(seed);
      const fake = placeAd('fake', B, { laneCover: false, firstClutter: false }, r);
      expect(contains(B.field, fake)).toBe(true);
      expect(intersects(fake, B.realLink)).toBe(false);
      expect(rectGap(fake, B.realLink)).toBeLessThanOrEqual(B.fakeRange);
      expect(contains(B.page, placeAd('interrupter', B, { laneCover, firstClutter: false }, r))).toBe(true);
      // ad-pressure Req 6.2: Lane_Cover clutter lands in laneArea (was anywhere in field).
      const area = laneCover ? B.laneArea : B.desktop;
      const first = placeAd('clutter', B, { laneCover, firstClutter: true }, r);
      expect(intersects(first, B.realLink)).toBe(false);
      expect(contains(area, first)).toBe(true);
      const c = placeAd('clutter', B, { laneCover, firstClutter: false }, r);
      expect(contains(area, c)).toBe(true);
      for (const x of [fake, first, c]) expect(Number.isInteger(x.x) && Number.isInteger(x.y)).toBe(true);
    }));
  });

  // Property: ad-pressure Req 6.2 Lane_Cover clutter lands fully inside laneArea
  it('places Lane_Cover clutter inside any valid laneArea, including through openAd', () => {
    const { w, h } = B.sizes.clutter;
    const laneAreaArb = fc.record({ w: fc.integer({ min: w, max: B.field.w }), h: fc.integer({ min: h, max: 300 }) })
      .chain((s) => fc.record({
        x: fc.integer({ min: 0, max: B.field.w - s.w }),
        y: fc.integer({ min: 0, max: B.field.h - s.h }),
        w: fc.constant(s.w),
        h: fc.constant(s.h),
      }));
    fc.assert(fc.property(fc.integer(), laneAreaArb, fc.boolean(), (seed, laneArea, firstClutter) => {
      const b = resolveAdBalance({ laneArea });
      const rect = placeAd('clutter', b, { laneCover: true, firstClutter }, seeded(seed));
      expect(contains(b.laneArea, rect)).toBe(true);
      const { ctx } = fakeCtx(seed);
      const s = openAd({ ...empty, balance: b }, ctx, 'clutter', ['plain'], true);
      expect(s.ads[0]?.laneCover).toBe(true);
      expect(contains(b.laneArea, s.ads[0]!.rect)).toBe(true);
    }));
  });
});
