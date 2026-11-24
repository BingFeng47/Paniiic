/**
 * Desktop layout: shell size constants and the pure geometry the Window_Manager uses to size the
 * Desktop_Area, keep title bars reachable (Req 6.7, 6.8) and cascade new windows (Req 6.12).
 *
 * The sizes match the tokens in src/styles/theme.css (`--taskbar-h`, `--lane-dock-h`,
 * `--title-bar-h`) and the Screen size in src/core/monitor.ts. All coordinates are logical Screen
 * pixels relative to the top-left of the Desktop_Area.
 */
import { SCREEN_H, SCREEN_W } from '../core/monitor';

/** theme.css `--taskbar-h`. */
export const TASKBAR_H = 28;
/** theme.css `--lane-dock-h`. Shown between the Desktop_Area and the Taskbar during a Session (Req 10.10). */
export const LANE_DOCK_H = 260;
/** theme.css `--title-bar-h`. */
export const TITLE_BAR_H = 20;
/** Pixels of title bar that must stay inside the Desktop_Area horizontally (Req 6.7). */
export const MIN_TITLE_VISIBLE = 48;
/** Cascade slot 0. */
export const CASCADE_ORIGIN = { x: 120, y: 32 } as const;
/** Offset right and down between cascade slots (Req 6.12). */
export const CASCADE_STEP = 24;

export interface Size {
  readonly w: number;
  readonly h: number;
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** Desktop_Area size: the Screen above the Taskbar, and above the Lane_Dock during a Session. */
export function desktopArea(sessionActive: boolean): Size {
  const h = SCREEN_H - TASKBAR_H - (sessionActive ? LANE_DOCK_H : 0);
  return { w: SCREEN_W, h };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Req 6.7: title bar fully inside vertically, min(48, w) px inside horizontally.
 * With `v = min(MIN_TITLE_VISIBLE, size.w)`: `x ∈ [v − size.w, area.w − v]`,
 * `y ∈ [0, max(0, area.h − TITLE_BAR_H)]`. A position already inside the bounds comes back
 * unchanged, so clamping is idempotent.
 */
export function clampWindow(pos: Point, size: Size, area: Size): Point {
  const v = Math.min(MIN_TITLE_VISIBLE, size.w);
  const minX = v - size.w;
  const maxX = Math.max(minX, area.w - v);
  const maxY = Math.max(0, area.h - TITLE_BAR_H);
  return { x: clamp(pos.x, minX, maxX), y: clamp(pos.y, 0, maxY) };
}

function slot(i: number): Point {
  return { x: CASCADE_ORIGIN.x + i * CASCADE_STEP, y: CASCADE_ORIGIN.y + i * CASCADE_STEP };
}

function needsClamp(pos: Point, size: Size, area: Size): boolean {
  const clamped = clampWindow(pos, size, area);
  return clamped.x !== pos.x || clamped.y !== pos.y;
}

/**
 * Req 6.12: n-th cascade slot, `CASCADE_ORIGIN + n × CASCADE_STEP` on both axes. When slot n
 * would need clamping the sequence wraps to the origin and keeps stepping from there, so slot n
 * is slot `n mod k`, where k is the number of leading slots that fit. If even the origin does not
 * fit (a tiny area), the clamped origin is returned.
 */
export function cascadePosition(n: number, size: Size, area: Size): Point {
  const origin = slot(0);
  if (needsClamp(origin, size, area)) return clampWindow(origin, size, area);
  const v = Math.min(MIN_TITLE_VISIBLE, size.w);
  const roomX = area.w - v - CASCADE_ORIGIN.x;
  const roomY = Math.max(0, area.h - TITLE_BAR_H) - CASCADE_ORIGIN.y;
  const fitting = Math.floor(Math.min(roomX, roomY) / CASCADE_STEP) + 1;
  const i = Math.max(0, Math.floor(n)) % fitting;
  return slot(i);
}
