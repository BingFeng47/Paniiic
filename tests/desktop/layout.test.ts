import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  CASCADE_ORIGIN,
  CASCADE_STEP,
  MIN_TITLE_VISIBLE,
  TITLE_BAR_H,
  cascadePosition,
  clampWindow,
  desktopArea,
  type Point,
  type Size,
} from '../../src/desktop/layout';

// ---------------------------------------------------------------------------------------------
// Arbitraries (logical Screen pixels, integers)
// ---------------------------------------------------------------------------------------------

/** Any Desktop_Area the property covers: the two real ones plus random areas at least
 *  MIN_TITLE_VISIBLE wide and TITLE_BAR_H tall (design Property 8 precondition). */
const areaArb: fc.Arbitrary<Size> = fc.oneof(
  fc.constant(desktopArea(false)),
  fc.constant(desktopArea(true)),
  fc.record({
    w: fc.integer({ min: MIN_TITLE_VISIBLE, max: 4000 }),
    h: fc.integer({ min: TITLE_BAR_H, max: 4000 }),
  }),
);

/** Window sizes with positive width, from 1 px up to well past the largest area. */
const sizeArb: fc.Arbitrary<Size> = fc.record({
  w: fc.integer({ min: 1, max: 6000 }),
  h: fc.integer({ min: 1, max: 6000 }),
});

/** Positions inside, near and far outside the area. */
const coordArb = fc.oneof(
  fc.integer({ min: -200, max: 1200 }),
  fc.integer({ min: -1_000_000, max: 1_000_000 }),
);
const pointArb: fc.Arbitrary<Point> = fc.record({ x: coordArb, y: coordArb });

/** Title bar pixels inside the area horizontally: overlap of [x, x + w] with [0, area.w]. */
function visibleTitleWidth(pos: Point, size: Size, area: Size): number {
  return Math.min(pos.x + size.w, area.w) - Math.max(pos.x, 0);
}

function inBounds(pos: Point, size: Size, area: Size): boolean {
  const v = Math.min(MIN_TITLE_VISIBLE, size.w);
  return pos.x >= v - size.w && pos.x <= area.w - v && pos.y >= 0 && pos.y <= area.h - TITLE_BAR_H;
}

const RUNS = { numRuns: 200 };

describe('desktop layout', () => {
  it('sizes the Desktop_Area with and without the Lane_Dock (Req 10.10)', () => {
    expect(desktopArea(false)).toEqual({ w: 1024, h: 740 });
    expect(desktopArea(true)).toEqual({ w: 1024, h: 480 });
  });

  it('keeps the title bar reachable (Req 6.7)', () => {
    const size = { w: 300, h: 200 };
    const area = desktopArea(true);
    expect(clampWindow({ x: -1000, y: -5 }, size, area)).toEqual({ x: 48 - 300, y: 0 });
    expect(clampWindow({ x: 5000, y: 5000 }, size, area)).toEqual({ x: 1024 - 48, y: 480 - 20 });
    expect(clampWindow({ x: 10, y: 10 }, size, area)).toEqual({ x: 10, y: 10 });
  });

  it('cascades by 24 px and wraps to the origin (Req 6.12)', () => {
    const size = { w: 300, h: 200 };
    const area = desktopArea(false);
    expect([0, 1, 2].map((n) => cascadePosition(n, size, area))).toEqual([
      { x: 120, y: 32 },
      { x: 144, y: 56 },
      { x: 168, y: 80 },
    ]);
    // y room: (740 − 20 − 32) / 24 → slots 0..28 fit, slot 29 wraps.
    expect(cascadePosition(28, size, area)).toEqual({ x: 120 + 28 * CASCADE_STEP, y: 32 + 28 * CASCADE_STEP });
    expect(cascadePosition(29, size, area)).toEqual(CASCADE_ORIGIN);
    expect(cascadePosition(30, size, area)).toEqual({ x: 144, y: 56 });
  });

  it('wraps sooner in the smaller session area (Req 6.12)', () => {
    const size = { w: 300, h: 200 };
    const area = desktopArea(true);
    // y room: (480 − 20 − 32) / 24 → slots 0..17 fit, slot 18 wraps.
    expect(cascadePosition(17, size, area)).toEqual({ x: 120 + 17 * CASCADE_STEP, y: 32 + 17 * CASCADE_STEP });
    expect(cascadePosition(18, size, area)).toEqual(CASCADE_ORIGIN);
  });

  // Feature: retro-shell, Property 8: Clamped windows keep their title bar reachable
  // Property: Req 6.7 for any position, size and area the clamped title bar is fully inside
  // vertically and shows at least min(48, w) px horizontally
  it('clamped title bar stays inside the area', () => {
    fc.assert(
      fc.property(pointArb, sizeArb, areaArb, (pos, size, area) => {
        const out = clampWindow(pos, size, area);
        const v = Math.min(MIN_TITLE_VISIBLE, size.w);
        expect(out.y).toBeGreaterThanOrEqual(0);
        expect(out.y + TITLE_BAR_H).toBeLessThanOrEqual(area.h);
        expect(out.x).toBeGreaterThanOrEqual(v - size.w);
        expect(out.x).toBeLessThanOrEqual(area.w - v);
        expect(visibleTitleWidth(out, size, area)).toBeGreaterThanOrEqual(v);
      }),
      RUNS,
    );
  });

  // Feature: retro-shell, Property 8: Clamped windows keep their title bar reachable
  // Property: Req 6.7 clamping is idempotent and leaves in-bounds positions unchanged
  it('clamping is idempotent and keeps in-bounds positions', () => {
    fc.assert(
      fc.property(pointArb, sizeArb, areaArb, (pos, size, area) => {
        const once = clampWindow(pos, size, area);
        expect(clampWindow(once, size, area)).toEqual(once);
        if (inBounds(pos, size, area)) expect(once).toEqual(pos);
      }),
      RUNS,
    );
    const inBoundsArb = fc
      .tuple(sizeArb, areaArb)
      .chain(([size, area]) => {
        const v = Math.min(MIN_TITLE_VISIBLE, size.w);
        return fc.record({
          size: fc.constant(size),
          area: fc.constant(area),
          pos: fc.record({
            x: fc.integer({ min: v - size.w, max: area.w - v }),
            y: fc.integer({ min: 0, max: area.h - TITLE_BAR_H }),
          }),
        });
      });
    fc.assert(
      fc.property(inBoundsArb, ({ pos, size, area }) => {
        expect(clampWindow(pos, size, area)).toEqual(pos);
      }),
      RUNS,
    );
  });

  // Feature: retro-shell, Property 8: Clamped windows keep their title bar reachable
  // Property: Req 6.8 a window clamped in one area and re-clamped after the area changes keeps
  // its title bar reachable in the new area
  it('re-clamping after an area change keeps the title bar reachable', () => {
    fc.assert(
      fc.property(pointArb, sizeArb, areaArb, areaArb, (pos, size, before, after) => {
        const out = clampWindow(clampWindow(pos, size, before), size, after);
        expect(inBounds(out, size, after)).toBe(true);
        expect(visibleTitleWidth(out, size, after)).toBeGreaterThanOrEqual(Math.min(MIN_TITLE_VISIBLE, size.w));
      }),
      RUNS,
    );
  });

  // Property: Req 6.12 every cascade slot is already a clamp fixed point
  it('cascade slots never need clamping', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 500 }), sizeArb, areaArb, (n, size, area) => {
        const pos = cascadePosition(n, size, area);
        expect(clampWindow(pos, size, area)).toEqual(pos);
      }),
      RUNS,
    );
  });
});
