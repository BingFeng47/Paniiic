// Pure Hint_Balloon placement (player-guide Req 3.1). Coordinates are Screen pixels with the
// Desktop_Area at the top-left; the Lane_Dock starts at the Desktop_Area's bottom edge.
import { DEFAULT_AD_BALANCE } from '../../game/balance/ads';
import type { Rect } from '../../game/ads/adTypes';
import type { GameState } from '../../game/types';
import type { Anchor } from './hintTable';
import { DEFAULT_LANE_BALANCE } from '../../game/balance/lane';
import {
  createLaneLayout,
  INTEGRITY_METER_CENTRE_X,
  LANE_CANVAS_H,
  LANE_CANVAS_W,
  laneToCanvas,
  SHOP_TRAY_CENTRE_X,
} from '../../render/laneLayout';

export interface Point {
  readonly x: number;
  readonly y: number;
}
export interface Size {
  readonly w: number;
  readonly h: number;
}

export const DESKTOP_AREA: Rect = Object.freeze({ x: 0, y: 0, w: 1024, h: 480 });
/** The Lane_Dock below the Desktop_Area during a Session (LANE_DOCK_H = 260). */
export const LANE_DOCK: Rect = Object.freeze({ x: 0, y: 480, w: 1024, h: 260 });
export const BALLOON_SIZE: Size = Object.freeze({ w: 260, h: 84 });
/** Gap between the balloon and its anchor, room for the tail. */
export const BALLOON_GAP = 16;
const MARGIN = 8;

/**
 * Anchor x positions on the Desktop_Area's bottom edge for lane anchors, from the shared Lane_HUD
 * layout constants. The lane canvas spans the Screen width at x 0, so canvas px are Screen px.
 */
export const LANE_X: Readonly<Record<'lane' | 'shop' | 'integrity', number>> = Object.freeze({
  lane: LANE_CANVAS_W / 2,
  shop: SHOP_TRAY_CENTRE_X,
  integrity: INTEGRITY_METER_CENTRE_X,
});
/** Screen x of a Lane_X, through the Lane_Layout for this Run's Lane_Length. */
export function packetScreenX(laneX: number, state: GameState | null): number {
  const laneLength = state?.lane?.balance?.laneLength ?? DEFAULT_LANE_BALANCE.laneLength;
  const x = laneToCanvas({ x: laneX, y: 0 }, createLaneLayout(LANE_CANVAS_W, LANE_CANVAS_H, laneLength)).x;
  return LANE_DOCK.x + clamp(x, 0, LANE_CANVAS_W);
}

export interface Placement {
  readonly rect: Rect;
  /** Tail from the nearest balloon edge point to the anchor centre. */
  readonly tail: { readonly from: Point; readonly to: Point };
}

/** The Real_Link rect for this Run, or the default when ads are absent. */
export function realLinkRect(state: GameState | null): Rect {
  return state?.ads?.balance?.realLink ?? DEFAULT_AD_BALANCE.realLink;
}

const centre = (r: Rect): Point => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

/**
 * The anchor's target point. Lane anchors map to the Desktop_Area's bottom edge so the tail
 * points down into the lane. An ad that no longer exists falls back to the lane centre.
 */
export function anchorPoint(anchor: Anchor, state: GameState | null): Point {
  const bottom = DESKTOP_AREA.y + DESKTOP_AREA.h;
  switch (anchor.kind) {
    case 'lane':
    case 'shop':
    case 'integrity':
      return { x: LANE_X[anchor.kind], y: bottom };
    case 'packet':
      return { x: packetScreenX(anchor.x, state), y: bottom };
    case 'realLink':
      return centre(realLinkRect(state));
    case 'ad': {
      const ad = state?.ads?.ads?.find((a) => a.id === anchor.adId);
      return ad ? centre(ad.rect) : { x: LANE_X.lane, y: bottom };
    }
  }
}

export function intersects(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

function inside(r: Rect, area: Rect): boolean {
  return r.x >= area.x && r.y >= area.y && r.x + r.w <= area.x + area.w && r.y + r.h <= area.y + area.h;
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(Math.max(v, lo), Math.max(lo, hi));

function nearestEdgePoint(r: Rect, p: Point): Point {
  const x = clamp(p.x, r.x, r.x + r.w);
  const y = clamp(p.y, r.y, r.y + r.h);
  if (x !== p.x || y !== p.y) return { x, y };
  // Anchor inside the rect: use the nearest edge.
  const d = [p.y - r.y, r.y + r.h - p.y, p.x - r.x, r.x + r.w - p.x];
  const m = Math.min(...d);
  if (m === d[0]) return { x: p.x, y: r.y };
  if (m === d[1]) return { x: p.x, y: r.y + r.h };
  if (m === d[2]) return { x: r.x, y: p.y };
  return { x: r.x + r.w, y: p.y };
}

/**
 * Tries above, below, left and right of the anchor, keeping the first rect inside the
 * Desktop_Area that avoids every `avoid` rect and the Lane_Dock; falls back to the top-right.
 */
export function placeBalloon(anchor: Point, size: Size = BALLOON_SIZE, avoid: readonly Rect[] = []): Placement {
  const a = DESKTOP_AREA;
  const fx = (x: number): number => clamp(x, a.x, a.x + a.w - size.w);
  const fy = (y: number): number => clamp(y, a.y, a.y + a.h - size.h);
  const candidates: Rect[] = [
    { x: fx(anchor.x - size.w / 2), y: anchor.y - BALLOON_GAP - size.h, w: size.w, h: size.h },
    { x: fx(anchor.x - size.w / 2), y: anchor.y + BALLOON_GAP, w: size.w, h: size.h },
    { x: anchor.x - BALLOON_GAP - size.w, y: fy(anchor.y - size.h / 2), w: size.w, h: size.h },
    { x: anchor.x + BALLOON_GAP, y: fy(anchor.y - size.h / 2), w: size.w, h: size.h },
  ];
  const blocked = [...avoid, LANE_DOCK];
  const ok = (r: Rect): boolean => inside(r, a) && !blocked.some((b) => intersects(r, b));
  const rect = candidates.find(ok) ?? { x: a.x + a.w - size.w - MARGIN, y: a.y + MARGIN, w: size.w, h: size.h };
  return { rect, tail: { from: nearestEdgePoint(rect, anchor), to: anchor } };
}
