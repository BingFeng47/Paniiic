import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { SCREEN_H, SCREEN_W, toClientPoint, toScreenPoint, type Rect } from '../../src/core/monitor';
import {
  LANE_CANVAS_H,
  LANE_CANVAS_W,
  LINE_FROM_BOTTOM,
  MANHOLE_AREA_W,
  MODEM_AREA_W,
  canvasToLane,
  clientToLane,
  createLaneLayout,
  laneToCanvas,
  LANE_DOCK_RECT,
  laneToScreen,
  offFeedLaneY,
  screenToLane,
} from '../../src/render/laneLayout';

const EPS = 1e-6;

describe('laneLayout', () => {
  const layout = createLaneLayout(LANE_CANVAS_W, LANE_CANVAS_H, 800);

  it('maps the default anchors', () => {
    expect(layout.scale).toBe(1);
    expect(laneToCanvas({ x: 0, y: 0 }, layout)).toEqual({ x: 112, y: 232 });
    expect(laneToCanvas({ x: 800, y: 0 }, layout)).toEqual({ x: 912, y: 232 });
    expect(canvasToLane({ x: 912, y: 232 }, layout)).toEqual({ x: 800, y: 0 });
  });

  it('puts the anchors on the modem edge, manhole centre and line for other sizes, with Lane_Y up', () => {
    // Req 10.1 at a non-default layout: 600 × 200 canvas, Lane_Length 250 → scale 376 / 250.
    const other = createLaneLayout(600, 200, 250);
    const modemEdge = laneToCanvas({ x: 0, y: 0 }, other);
    const manhole = laneToCanvas({ x: 250, y: 0 }, other);
    expect(modemEdge.x).toBeCloseTo(MODEM_AREA_W, 9);
    expect(modemEdge.y).toBeCloseTo(200 - LINE_FROM_BOTTOM, 9);
    expect(manhole.x).toBeCloseTo(600 - MANHOLE_AREA_W, 9);
    expect(manhole.y).toBeCloseTo(200 - LINE_FROM_BOTTOM, 9);
    expect(laneToCanvas({ x: 0, y: 10 }, other).y).toBeLessThan(modemEdge.y);
  });

  it('maps Lane_Units to Screen px through the Lane_Dock under the Desktop_Area', () => {
    // pacing-and-economy Req 6.5: Screen 768 − taskbar 28 − dock 260 puts the dock top at 480.
    expect(LANE_DOCK_RECT).toEqual({ x: 0, y: 480, w: 1024, h: 260 });
    expect(laneToScreen({ x: 0, y: 0 }, layout)).toEqual({ x: 112, y: 712 });
    expect(laneToScreen({ x: 100, y: 36 }, layout)).toEqual({ x: 212, y: 676 });
    expect(screenToLane({ x: 212, y: 676 }, layout)).toEqual({ x: 100, y: 36 });
    // The off-feed parking spot lies above the whole canvas.
    expect(laneToCanvas({ x: 0, y: offFeedLaneY(layout) }, layout).y).toBe(-LANE_CANVAS_H);
  });

  it('converts client points through toScreenPoint at scale 2 with an offset canvas', () => {
    const toScreen = (x: number, y: number) => ({ x: (x - 10) / 2, y: (y - 20) / 2 });
    const rect = { left: 10, top: 20 + 2 * 508 }; // canvas top at Screen y 508
    // Lane (100, 32) → canvas (212, 200) → client (10 + 424, 1036 + 400)
    const p = clientToLane(434, 1436, rect, toScreen, layout);
    expect(p.x).toBeCloseTo(100, 9);
    expect(p.y).toBeCloseTo(32, 9);
  });

  describe('Property 12', () => {
    const finite = (min: number, max: number) => fc.double({ min, max, noNaN: true, noDefaultInfinity: true });

    // Canvas wide enough for the modem and manhole areas, any Lane_Length, any lane point inside
    // the lane area (Lane_X 0..Lane_Length, Lane_Y from the line up to the canvas top).
    const layoutAndPoint = fc
      .record({
        canvasW: finite(MODEM_AREA_W + MANHOLE_AREA_W + 1, 4096),
        canvasH: finite(LINE_FROM_BOTTOM + 1, 1024),
        laneLength: finite(1, 5000),
        fx: finite(0, 1),
        fy: finite(0, 1),
      })
      .map(({ canvasW, canvasH, laneLength, fx, fy }) => {
        const l = createLaneLayout(canvasW, canvasH, laneLength);
        return { layout: l, point: { x: fx * laneLength, y: (fy * l.lineY) / l.scale } };
      });

    // Feature: connection-lane, Property 12: Lane coordinates round-trip through the screen
    // Property: Req 10.3 canvasToLane ∘ laneToCanvas is the identity for any layout and point
    it('maps lane → canvas → lane back to the original point', () => {
      fc.assert(
        fc.property(layoutAndPoint, ({ layout: l, point }) => {
          const back = canvasToLane(laneToCanvas(point, l), l);
          expect(Math.abs(back.x - point.x)).toBeLessThanOrEqual(EPS);
          expect(Math.abs(back.y - point.y)).toBeLessThanOrEqual(EPS);
        }),
        { numRuns: 200 },
      );
    });

    // Feature: connection-lane, Property 12: Lane coordinates round-trip through the screen
    // Property: Req 10.3 lane → canvas → client → clientToLane returns the point at any monitor
    // scale and canvas offset
    it('maps lane → canvas → client → lane back to the original point', () => {
      fc.assert(
        fc.property(
          layoutAndPoint,
          finite(0.25, 4),
          finite(-2000, 2000),
          finite(-2000, 2000),
          finite(-1024, SCREEN_W),
          finite(-768, SCREEN_H),
          ({ layout: l, point }, monitorScale, screenLeft, screenTop, canvasScreenX, canvasScreenY) => {
            const screenRect: Rect = {
              left: screenLeft,
              top: screenTop,
              width: SCREEN_W * monitorScale,
              height: SCREEN_H * monitorScale,
            };
            const toScreen = (x: number, y: number) => toScreenPoint(x, y, screenRect);
            // The canvas's client origin, as getBoundingClientRect would report it.
            const canvasRect = toClientPoint(canvasScreenX, canvasScreenY, screenRect);
            const c = laneToCanvas(point, l);
            const client = toClientPoint(canvasScreenX + c.x, canvasScreenY + c.y, screenRect);
            const back = clientToLane(
              client.x,
              client.y,
              { left: canvasRect.x, top: canvasRect.y },
              toScreen,
              l,
            );
            expect(Math.abs(back.x - point.x)).toBeLessThanOrEqual(EPS);
            expect(Math.abs(back.y - point.y)).toBeLessThanOrEqual(EPS);
          },
        ),
        { numRuns: 200 },
      );
    });
  });
});
