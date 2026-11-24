// Where a new ad lands (Requirement 4). Pure: randomness only through the `random` argument,
// which systems pass as `ctx.random`. All results are integer Screen pixels inside the field.
import type { AdBalance } from '../balance/ads';
import type { AdKind, Rect } from './adTypes';

/** Draws tried before falling back to a fixed spot. */
export const PLACEMENT_DRAWS = 8;
/** Smallest gap between a fake button and the Real_Link. */
export const FAKE_MIN_GAP = 8;

export function intersects(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

export function contains(outer: Rect, inner: Rect): boolean {
  return inner.x >= outer.x && inner.y >= outer.y
    && inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h;
}

/** Euclidean distance between the closest points of two rectangles (0 when they touch). */
export function rectGap(a: Rect, b: Rect): number {
  const dx = Math.max(0, b.x - (a.x + a.w), a.x - (b.x + b.w));
  const dy = Math.max(0, b.y - (a.y + a.h), a.y - (b.y + b.h));
  return Math.hypot(dx, dy);
}

function randInt(random: () => number, min: number, max: number): number {
  if (max <= min) return min;
  return min + Math.floor(random() * (max - min + 1));
}

function clampInto(area: Rect, w: number, h: number, x: number, y: number): Rect {
  const cx = Math.min(Math.max(x, area.x), area.x + area.w - w);
  const cy = Math.min(Math.max(y, area.y), area.y + area.h - h);
  return { x: Math.round(cx), y: Math.round(cy), w, h };
}

/** Uniform integer spot for a w × h rect fully inside `area`. */
export function uniformIn(area: Rect, w: number, h: number, random: () => number): Rect {
  const x = randInt(random, area.x, area.x + area.w - w);
  const y = randInt(random, area.y, area.y + area.h - h);
  return { x, y, w, h };
}

function placeClutter(b: AdBalance, laneCover: boolean, first: boolean, random: () => number): Rect {
  const { w, h } = b.sizes.clutter;
  // Lane_Cover clutter lands fully inside the Lane_Area (ad-pressure Req 6.2).
  const area = laneCover ? b.laneArea : b.desktop;
  if (!first) return uniformIn(area, w, h, random);
  for (let i = 0; i < PLACEMENT_DRAWS; i++) {
    const r = uniformIn(area, w, h, random);
    if (!intersects(r, b.realLink)) return r;
  }
  // Same spot as before for desktop clutter; Lane_Cover clutter stays inside the Lane_Area.
  return { x: area.x, y: area.y, w, h };
}

/** Fixed fallback: centred under the Real_Link, clamped into the field. */
export function fakeFallback(b: AdBalance): Rect {
  const { w, h } = b.sizes.fake;
  const link = b.realLink;
  return clampInto(b.field, w, h, link.x + (link.w - w) / 2, link.y + link.h + FAKE_MIN_GAP);
}

function placeFake(b: AdBalance, random: () => number): Rect {
  const { w, h } = b.sizes.fake;
  const link = b.realLink;
  const maxGap = Math.max(FAKE_MIN_GAP, b.fakeRange - 1);
  for (let i = 0; i < PLACEMENT_DRAWS; i++) {
    const side = Math.floor(random() * 4);
    const gap = randInt(random, FAKE_MIN_GAP, maxGap);
    let x: number;
    let y: number;
    if (side === 0 || side === 1) {
      // Above or below: overlap the link horizontally.
      x = randInt(random, link.x - w + 1, link.x + link.w - 1);
      y = side === 0 ? link.y - gap - h : link.y + link.h + gap;
    } else {
      // Left or right: overlap the link vertically.
      y = randInt(random, link.y - h + 1, link.y + link.h - 1);
      x = side === 2 ? link.x - gap - w : link.x + link.w + gap;
    }
    const r = clampInto(b.field, w, h, x, y);
    if (!intersects(r, link) && rectGap(r, link) <= b.fakeRange) return r;
  }
  return fakeFallback(b);
}

export interface PlaceOptions {
  readonly laneCover: boolean;
  /** True for the first clutter ad of a Run (Requirement 4.5). */
  readonly firstClutter: boolean;
}

export function placeAd(kind: AdKind, b: AdBalance, opts: PlaceOptions, random: () => number): Rect {
  switch (kind) {
    case 'clutter':
      return placeClutter(b, opts.laneCover, opts.firstClutter, random);
    case 'fake':
      return placeFake(b, random);
    case 'interrupter': {
      const { w, h } = b.sizes.interrupter;
      return uniformIn(b.page, w, h, random);
    }
  }
}
