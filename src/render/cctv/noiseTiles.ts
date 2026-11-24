/**
 * Offscreen canvases for the CCTV layer (lane-cctv spec, Requirements 1.2, 1.3).
 *
 * Noise tiles and the scanline + vignette overlay are built once on mount, then only blitted
 * each frame, so no per-frame pixel reads or writes are needed. Noise comes from a fixed-seed
 * mulberry32 (render-only, never Math.random), so screenshots are repeatable.
 * Every builder fails safe: no canvas or no 2D context gives an empty list or null.
 */
import { mulberry32 } from '../../core/soundKit';
import { CCTV_TUNING } from './cctvTuning';

/** Fixed seed for the grain tiles. */
export const NOISE_SEED = 0x0cc7_1998;

export interface LaneRect {
  readonly width: number;
  readonly height: number;
}

function makeCanvas(width: number, height: number): HTMLCanvasElement | null {
  try {
    if (typeof document === 'undefined') return null;
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.floor(width));
    c.height = Math.max(1, Math.floor(height));
    return c;
  } catch {
    return null;
  }
}

function context2d(c: HTMLCanvasElement): CanvasRenderingContext2D | null {
  try {
    return c.getContext('2d');
  } catch {
    return null;
  }
}

/**
 * Builds up to `CCTV_TUNING.grainTiles` grey noise tiles. Returns fewer (possibly none) when
 * canvases or contexts are unavailable.
 */
export function createNoiseTiles(
  count: number = CCTV_TUNING.grainTiles,
  size: number = CCTV_TUNING.grainTileSize,
  seed: number = NOISE_SEED,
): HTMLCanvasElement[] {
  const n = Math.max(0, Math.min(CCTV_TUNING.grainTiles, Math.floor(count)));
  const rand = mulberry32(seed);
  const tiles: HTMLCanvasElement[] = [];
  for (let i = 0; i < n; i++) {
    const c = makeCanvas(size, size);
    if (!c) break;
    const g = context2d(c);
    if (!g) break;
    try {
      const img = g.createImageData(c.width, c.height);
      const d = img.data;
      for (let p = 0; p < d.length; p += 4) {
        const v = Math.floor(rand() * 256);
        d[p] = v;
        d[p + 1] = v;
        d[p + 2] = v;
        d[p + 3] = 255;
      }
      g.putImageData(img, 0, 0);
    } catch {
      break;
    }
    tiles.push(c);
  }
  return tiles;
}

/**
 * Builds the cached scanline + vignette canvas sized to the lane rect. Returns null when a
 * canvas or 2D context is unavailable.
 */
export function createOverlayCache(rect: LaneRect): HTMLCanvasElement | null {
  const c = makeCanvas(rect.width, rect.height);
  if (!c) return null;
  const g = context2d(c);
  if (!g) return null;
  try {
    const w = c.width;
    const h = c.height;
    g.fillStyle = `rgba(0,0,0,${CCTV_TUNING.scanlineAlpha})`;
    for (let y = 0; y < h; y += CCTV_TUNING.scanlineStep) g.fillRect(0, y, w, 1);
    const r = Math.hypot(w, h) / 2;
    const v = g.createRadialGradient(w / 2, h / 2, r * 0.45, w / 2, h / 2, r);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, `rgba(0,0,0,${CCTV_TUNING.vignetteAlpha})`);
    g.fillStyle = v;
    g.fillRect(0, 0, w, h);
  } catch {
    return null;
  }
  return c;
}

/** Shrinks canvases to 1×1 so their backing stores can be freed, and empties the list. */
export function releaseCanvases(canvases: HTMLCanvasElement[] | readonly (HTMLCanvasElement | null)[]): void {
  for (const c of canvases) {
    if (!c) continue;
    c.width = 1;
    c.height = 1;
  }
  if (Array.isArray(canvases) && !Object.isFrozen(canvases)) (canvases as unknown[]).length = 0;
}
