// HiDPI coverage for lane-cctv drawing: at devicePixelRatio 2 every camera-effect fill must cover
// the full backing canvas and ignore the shake offset (Req 1.2, 4.2, 5.1, 7.1).
import { describe, expect, it } from 'vitest';
import { drawDropout, drawOverlay, drawStartup, drawTear } from '../../../src/render/cctv/cctvDraw';

const RECT = { width: 320, height: 180 };
const DPR = 2;

interface Box {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

/** Records fills and drawImage calls in device pixels, tracking scale + translate transforms. */
function recordingContext(): { g: CanvasRenderingContext2D; boxes: Box[] } {
  let m = { a: 1, d: 1, e: 0, f: 0 };
  const stack: (typeof m)[] = [];
  const boxes: Box[] = [];
  const put = (x: number, y: number, w: number, h: number): void => {
    boxes.push({ x0: m.a * x + m.e, y0: m.d * y + m.f, x1: m.a * (x + w) + m.e, y1: m.d * (y + h) + m.f });
  };
  const g = {
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    fillStyle: '#000',
    save: () => stack.push({ ...m }),
    restore: () => {
      m = stack.pop() ?? m;
    },
    setTransform: (a: number, _b: number, _c: number, d: number, e: number, f: number) => {
      m = { a, d, e, f };
    },
    getTransform: () => ({ a: m.a, b: 0, c: 0, d: m.d, e: m.e, f: m.f }),
    translate: (x: number, y: number) => {
      m = { ...m, e: m.e + m.a * x, f: m.f + m.d * y };
    },
    createPattern: () => ({}),
    fillRect: put,
    drawImage: (_img: unknown, x: number, y: number, w: number, h: number) => put(x, y, w, h),
  };
  return { g: g as unknown as CanvasRenderingContext2D, boxes };
}

const tile = (): HTMLCanvasElement => {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  return c;
};

const full = { x0: 0, y0: 0, x1: RECT.width * DPR, y1: RECT.height * DPR };

describe('camera effects at devicePixelRatio 2', () => {
  // Caller is mid-shake: DPR scale plus a shake offset that the effects must drop.
  const shaken = (g: CanvasRenderingContext2D): void => g.setTransform(DPR, 0, 0, DPR, 6 * DPR, -4 * DPR);

  it('grain and the overlay cache fill the full backing canvas', () => {
    const { g, boxes } = recordingContext();
    shaken(g);
    drawOverlay(g, RECT, [tile()], tile(), 7);
    expect(boxes).toEqual([full, full]);
  });

  it('dropout and startup noise fill the full backing canvas', () => {
    const { g, boxes } = recordingContext();
    shaken(g);
    drawDropout(g, RECT, [tile()], 3);
    drawStartup(g, RECT, [tile()], 0.25, 3);
    expect(boxes).toEqual([full, full, full]);
  });

  it('tear bands span the full backing width and stay inside the canvas', () => {
    const { g, boxes } = recordingContext();
    shaken(g);
    drawTear(g, RECT, [tile()], 11);
    expect(boxes.length).toBeGreaterThan(0);
    for (const b of boxes) {
      expect(b.x0).toBe(0);
      expect(b.x1).toBe(full.x1);
      expect(b.y0).toBeGreaterThanOrEqual(0);
      expect(b.y1).toBeLessThanOrEqual(full.y1);
    }
  });
});
