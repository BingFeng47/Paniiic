/**
 * Canvas drawing for the CCTV camera layer (lane-cctv design, "Drawing").
 *
 * Every function only paints over pixels: no getImageData/putImageData, no ctx.filter, and each
 * one wraps its state changes in save/restore so the lane transform is left as it was
 * (Requirements 1.3, 4.2, 7.1, 7.2). Tiles and the overlay cache come from noiseTiles.ts.
 */
import { hitBox } from '../../game/hammer';
import { isAttacker, type LaneState } from '../../game/laneTypes';
import { attackerOffset } from '../laneDrawList';
import { laneToCanvas, type LaneLayout } from '../laneLayout';
import { grainFrame, hash32, type MotionBox } from './cctvState';
import { CCTV_TUNING as T } from './cctvTuning';
import type { LaneRect } from './noiseTiles';

/** Fallback label when no copy is passed (laneCopy.cctv.motion arrives in task 3.1). */
export const MOTION_LABEL = 'MOTION';

export interface CctvColors {
  /** Camera_Grade tint (`--c-cctv-grade`). */
  readonly grade: string;
  /** Motion_Box outline and label (`--c-cctv-motion`). */
  readonly motion: string;
}

export const DEFAULT_CCTV_COLORS: CctvColors = Object.freeze({ grade: '#7f9a86', motion: '#e8ff6a' });

type Tiles = readonly HTMLCanvasElement[];

/**
 * Sets the caller's transform with its translation dropped: the DPR scale stays (so fills cover
 * the full backing store on HiDPI) while any shake offset is removed (Req 4.2, 7.1).
 * Returns the resulting transform so fillTile can return to it.
 */
function unshaken(g: CanvasRenderingContext2D): readonly [number, number, number, number] {
  const m = typeof g.getTransform === 'function' ? g.getTransform() : undefined;
  const t: [number, number, number, number] =
    m && typeof m.a === 'number' ? [m.a, m.b, m.c, m.d] : [1, 0, 0, 1];
  g.setTransform(t[0], t[1], t[2], t[3], 0, 0);
  return t;
}

function fillTile(g: CanvasRenderingContext2D, base: readonly [number, number, number, number], tile: HTMLCanvasElement, x: number, y: number, w: number, h: number, dx: number, dy: number): void {
  const pattern = g.createPattern(tile, 'repeat');
  if (!pattern) return;
  g.translate(-dx, -dy);
  g.fillStyle = pattern;
  g.fillRect(x + dx, y + dy, w, h);
  g.setTransform(base[0], base[1], base[2], base[3], 0, 0);
}

/** Camera_Grade: `color` blend tint (keeps luminance), then a `multiply` darken (Req 1.1, 1.5). */
export function drawGrade(g: CanvasRenderingContext2D, rect: LaneRect, colors: CctvColors = DEFAULT_CCTV_COLORS): void {
  g.save();
  g.globalCompositeOperation = 'color';
  g.globalAlpha = T.gradeAlpha;
  g.fillStyle = colors.grade;
  g.fillRect(0, 0, rect.width, rect.height);
  g.globalCompositeOperation = 'multiply';
  g.globalAlpha = T.darken;
  g.fillStyle = '#000';
  g.fillRect(0, 0, rect.width, rect.height);
  g.restore();
}

/** Grain tile for this tick, then the cached scanline + vignette canvas (Req 1.2, 1.3). */
export function drawOverlay(
  g: CanvasRenderingContext2D,
  rect: LaneRect,
  tiles: Tiles,
  cached: HTMLCanvasElement | null,
  tick: number,
): void {
  g.save();
  const base = unshaken(g);
  if (tiles.length > 0) {
    const f = grainFrame(tick);
    const tile = tiles[f.tile % tiles.length];
    if (tile) {
      g.globalAlpha = T.grainAlpha;
      fillTile(g, base, tile, 0, 0, rect.width, rect.height, f.dx, f.dy);
    }
  }
  if (cached) {
    g.globalAlpha = 1;
    g.drawImage(cached, 0, 0, rect.width, rect.height);
  }
  g.restore();
}

/**
 * Signal_Tear: `tearBands` noise strips covering at most `tearMaxCover` of the height, positions
 * from hash32(tick). Unshaken (DPR-only) transform; the lane underneath is not moved (Req 4.2).
 * `alphaScale` is 0.5 for a tear over the flash budget.
 */
export function drawTear(g: CanvasRenderingContext2D, rect: LaneRect, tiles: Tiles, tick: number, alphaScale = 1): void {
  const tile = tiles[0];
  if (!tile) return;
  const bandH = Math.max(1, Math.floor((rect.height * T.tearMaxCover) / T.tearBands));
  const slots = Math.max(1, Math.floor(rect.height / bandH));
  g.save();
  const base = unshaken(g);
  g.globalAlpha = T.tearAlpha * alphaScale;
  for (let i = 0; i < T.tearBands; i++) {
    const h = hash32(tick * T.tearBands + i);
    const y = (h % slots) * bandH;
    const t = tiles[(h >>> 8) % tiles.length] ?? tile;
    fillTile(g, base, t, 0, y, rect.width, bandH, (h >>> 4) % t.width, 0);
  }
  g.restore();
}

/** Signal_Dropout: full-rect noise at `dropoutAlpha` (Req 5.1). */
export function drawDropout(g: CanvasRenderingContext2D, rect: LaneRect, tiles: Tiles, tick = 0): void {
  const tile = tiles[0];
  if (!tile) return;
  g.save();
  const base = unshaken(g);
  g.globalAlpha = T.dropoutAlpha;
  const f = grainFrame(tick);
  fillTile(g, base, tiles[f.tile % tiles.length] ?? tile, 0, 0, rect.width, rect.height, f.dx, f.dy);
  g.restore();
}

/**
 * NO SIGNAL cut (juice-and-endings Req 7.1): the picture goes black under held noise. `t` is the
 * End_Transition tick (1..30); the noise frame changes every `noSignalHoldTicks`.
 */
export function drawNoSignal(g: CanvasRenderingContext2D, rect: LaneRect, tiles: Tiles, t: number, alpha: number): void {
  g.save();
  const base = unshaken(g);
  g.globalAlpha = 1;
  g.fillStyle = '#000';
  g.fillRect(0, 0, rect.width, rect.height);
  if (tiles.length > 0) {
    const f = grainFrame(noSignalFrame(t) * T.grainEveryTicks);
    const tile = tiles[f.tile % tiles.length];
    if (tile) {
      g.globalAlpha = alpha;
      fillTile(g, base, tile, 0, 0, rect.width, rect.height, f.dx, f.dy);
    }
  }
  g.restore();
}
/** Noise frame index for End_Transition tick `t`: constant for `noSignalHoldTicks` ticks. */
export function noSignalFrame(t: number): number {
  return Math.floor(Math.max(0, t - 1) / T.noSignalHoldTicks);
}
/** Feed_Startup: full noise fading out as `progress` goes 0 → 1 over startupTicks. */
export function drawStartup(g: CanvasRenderingContext2D, rect: LaneRect, tiles: Tiles, progress: number, tick = 0): void {
  const p = Math.min(1, Math.max(0, progress));
  if (p >= 1) return;
  g.save();
  const base = unshaken(g);
  g.globalAlpha = 1 - p;
  g.fillStyle = '#000';
  g.fillRect(0, 0, rect.width, rect.height);
  const tile = tiles.length > 0 ? tiles[grainFrame(tick).tile % tiles.length] : undefined;
  if (tile) {
    const f = grainFrame(tick);
    fillTile(g, base, tile, 0, 0, rect.width, rect.height, f.dx, f.dy);
  }
  g.restore();
}

/**
 * Motion_Boxes: a 1 px rectangle around each boxed Mob's padded Hit_Box (with the Attacker
 * offset) and a blinking label above it. Boxes whose Mob is gone are skipped (Req 6.1–6.3).
 * Draws in the caller's (shaken) transform; the transform is restored afterwards.
 */
export function drawMotionBoxes(
  g: CanvasRenderingContext2D,
  boxes: readonly MotionBox[],
  lane: LaneState | null,
  layout: LaneLayout,
  tick: number,
  label: string = MOTION_LABEL,
  colors: CctvColors = DEFAULT_CCTV_COLORS,
): void {
  if (lane === null || boxes.length === 0) return;
  const showLabel = Math.floor(tick / 8) % 2 === 0;
  g.save();
  g.strokeStyle = colors.motion;
  g.fillStyle = colors.motion;
  g.lineWidth = 1;
  g.font = '10px VT323, monospace';
  g.textBaseline = 'bottom';
  for (const box of boxes) {
    if (tick >= box.untilTick) continue;
    const enemy = lane.enemies.find((e) => e.id === box.id);
    if (!enemy) continue;
    const stats = lane.balance.enemies[enemy.kind];
    const offset = isAttacker(enemy) ? attackerOffset(enemy.id, lane.balance.hitPadding) : 0;
    const b = hitBox({ ...enemy, x: enemy.x + offset }, stats, lane.balance.hitPadding);
    const tl = laneToCanvas({ x: b.left, y: b.top }, layout);
    const br = laneToCanvas({ x: b.right, y: b.bottom }, layout);
    const x = Math.round(tl.x) + 0.5;
    const y = Math.round(tl.y) + 0.5;
    g.strokeRect(x, y, Math.round(br.x - tl.x), Math.round(br.y - tl.y));
    if (showLabel) g.fillText(label, x, y - 1);
  }
  g.restore();
}
