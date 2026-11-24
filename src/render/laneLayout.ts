/**
 * Lane_Layout: the one mapping between Lane_Units and lane canvas pixels (Req 10.1, 10.3), plus
 * the client → Lane_Units conversion the Lane_View uses for pointer input (Req 10.2).
 *
 * Lane_X 0 sits at the right edge of the drawn modem, Lane_Length at the Manhole centre and
 * Lane_Y 0 on the drawn phone line, with Lane_Y growing upward on screen. At the defaults
 * (1024-wide canvas, Lane_Length 800) one Lane_Unit is one canvas pixel.
 */
import { SCREEN_W, type Point } from '../core/monitor';
import { desktopArea, LANE_DOCK_H } from '../desktop/layout';

/** The canvas fills the Lane_Dock: 1024 × 260 Screen px. */
export const LANE_CANVAS_W = SCREEN_W;
export const LANE_CANVAS_H = LANE_DOCK_H;
/** Screen y of the Lane_Dock's top edge: it sits right under the Session's Desktop_Area. */
export const LANE_DOCK_TOP = desktopArea(true).h;
/** The Lane_Dock in Screen px; the lane canvas covers all of it. */
export const LANE_DOCK_RECT = Object.freeze({ x: 0, y: LANE_DOCK_TOP, w: LANE_CANVAS_W, h: LANE_CANVAS_H });
/** Canvas px left of Lane_X 0, where the modem is drawn. */
export const MODEM_AREA_W = 112;
/** Canvas px right of Lane_Length, the right half of the Manhole. */
export const MANHOLE_AREA_W = 112;
/** Canvas px from the bottom of the canvas up to the phone line. */
export const LINE_FROM_BOTTOM = 28;

export interface LaneLayout {
  /** Canvas x of Lane_X 0. */
  readonly originX: number;
  /** Canvas y of Lane_Y 0 (the phone line). */
  readonly lineY: number;
  /** Canvas px per Lane_Unit, on both axes. */
  readonly scale: number;
}

/** `scale = (canvasW − MODEM_AREA_W − MANHOLE_AREA_W) / laneLength`, 1 at the defaults. */
export function createLaneLayout(canvasW: number, canvasH: number, laneLength: number): LaneLayout {
  return {
    originX: MODEM_AREA_W,
    lineY: canvasH - LINE_FROM_BOTTOM,
    scale: (canvasW - MODEM_AREA_W - MANHOLE_AREA_W) / laneLength,
  };
}

/** Lane_Units → canvas px: `(originX + x·s, lineY − y·s)`. */
export function laneToCanvas(p: Point, layout: LaneLayout): Point {
  return { x: layout.originX + p.x * layout.scale, y: layout.lineY - p.y * layout.scale };
}

/** Canvas px → Lane_Units; the exact inverse of `laneToCanvas`. */
export function canvasToLane(p: Point, layout: LaneLayout): Point {
  return { x: (p.x - layout.originX) / layout.scale, y: (layout.lineY - p.y) / layout.scale };
}

/** Lane_Units → Screen px: the canvas point offset by the Lane_Dock's top edge. */
export function laneToScreen(p: Point, layout: LaneLayout): Point {
  const c = laneToCanvas(p, layout);
  return { x: c.x + LANE_DOCK_RECT.x, y: c.y + LANE_DOCK_TOP };
}
/** Screen px → Lane_Units; the exact inverse of `laneToScreen`. */
export function screenToLane(p: Point, layout: LaneLayout): Point {
  return canvasToLane({ x: p.x - LANE_DOCK_RECT.x, y: p.y - LANE_DOCK_TOP }, layout);
}
/**
 * Lane_Y reported while the pointer is off the canvas: one canvas height above the top of the
 * feed, far beyond any packet's pickup radius, so hovering collects nothing while the pointer is
 * over a Lane_Cover Ad or anywhere else off the lane (ad-pressure Req 6.4).
 */
export function offFeedLaneY(layout: LaneLayout): number {
  return canvasToLane({ x: 0, y: -LANE_CANVAS_H }, layout).y;
}
/**
 * Client px → Lane_Units through Screen px (Req 10.2). Both the pointer and the canvas origin go
 * through the same `toScreenPoint`, so the result holds at any monitor scale and while the
 * Lane_Dock slides. The canvas's CSS size equals its pixel size, so Screen px offsets are canvas px.
 */
export function clientToLane(
  clientX: number,
  clientY: number,
  canvasRect: { readonly left: number; readonly top: number },
  toScreenPoint: (x: number, y: number) => Point,
  layout: LaneLayout,
): Point {
  const pointer = toScreenPoint(clientX, clientY);
  const origin = toScreenPoint(canvasRect.left, canvasRect.top);
  return canvasToLane({ x: pointer.x - origin.x, y: pointer.y - origin.y }, layout);
}

/*
 * Lane_HUD layout (src/styles/lane.css). The CSS numbers are mirrored here so hint balloons can
 * point at the HUD; tests/render/laneHudLayout.test.ts reads lane.css and fails if they drift.
 * All x values are canvas px, which equal Screen px because the canvas spans the Screen width.
 */
/** `.shop-tray { left: 50%; transform: translateX(-50%) }`: the tray, KB counter first, is centred. */
export const SHOP_TRAY_CENTRE_X = LANE_CANVAS_W / 2;
/** `.lane-hud { right: 12px }`. */
export const LANE_HUD_RIGHT = 12;
/** `.lane-hud { gap: 8px }`. */
export const LANE_HUD_GAP = 8;
/** `.lane-hud-bar { width: 160px }`. */
export const LANE_HUD_BAR_W = 160;
/** `.lane-hud-value { min-width: 4ch }` at `.lane-hud { font-size: 20px }`; VT323 is ~0.5em per ch. */
export const LANE_HUD_VALUE_CH = 4;
export const LANE_HUD_FONT_PX = 20;
export const LANE_HUD_VALUE_W = LANE_HUD_VALUE_CH * LANE_HUD_FONT_PX * 0.5;
/** Centre x of the integrity bar: right edge, minus the value, the gap and half the bar. */
export const INTEGRITY_METER_CENTRE_X =
  LANE_CANVAS_W - LANE_HUD_RIGHT - LANE_HUD_VALUE_W - LANE_HUD_GAP - LANE_HUD_BAR_W / 2;
