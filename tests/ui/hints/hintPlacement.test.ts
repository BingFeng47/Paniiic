import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { DEFAULT_AD_BALANCE } from '../../../src/game/balance/ads';
import { createRun } from '../../../src/game/state';
import {
  BALLOON_SIZE, DESKTOP_AREA, LANE_DOCK, anchorPoint, intersects, placeBalloon, realLinkRect,
} from '../../../src/ui/hints/hintPlacement';
import { INTEGRITY_METER_CENTRE_X } from '../../../src/render/laneLayout';

const SCREEN = { w: 1024, h: 740 };
const insideDesktop = (r: { x: number; y: number; w: number; h: number }) =>
  r.x >= 0 && r.y >= 0 && r.x + r.w <= DESKTOP_AREA.w && r.y + r.h <= DESKTOP_AREA.h;

describe('hintPlacement unit', () => {
  it('places above an anchor in open space with the tail ending at the anchor', () => {
    const p = placeBalloon({ x: 300, y: 200 });
    expect(p.rect).toEqual({ x: 170, y: 200 - 16 - BALLOON_SIZE.h, w: BALLOON_SIZE.w, h: BALLOON_SIZE.h });
    expect(p.tail.to).toEqual({ x: 300, y: 200 });
    expect(p.tail.from).toEqual({ x: 300, y: p.rect.y + p.rect.h });
  });
  it('lane anchors sit on the desktop bottom edge', () => {
    expect(anchorPoint({ kind: 'lane' }, null)).toEqual({ x: 512, y: 480 });
    expect(anchorPoint({ kind: 'ad', adId: 99 }, createRun({ seed: 1 }))).toEqual({ x: 512, y: 480 });
  });
  it('shop points at the tray centre and critical at the bottom-right integrity meter', () => {
    expect(anchorPoint({ kind: 'shop' }, null)).toEqual({ x: 512, y: 480 });
    expect(anchorPoint({ kind: 'integrity' }, null)).toEqual({ x: INTEGRITY_METER_CENTRE_X, y: 480 });
    expect(INTEGRITY_METER_CENTRE_X).toBeGreaterThan(800);
  });
  it('packet points at the dropped packet through the Lane_Layout', () => {
    // Defaults: Lane_X 0 at canvas x 112, one Lane_Unit per px.
    expect(anchorPoint({ kind: 'packet', x: 0 }, null)).toEqual({ x: 112, y: 480 });
    expect(anchorPoint({ kind: 'packet', x: 300 }, createRun({ seed: 1 }))).toEqual({ x: 412, y: 480 });
  });
  it('realLinkRect falls back to the default without ads', () => {
    expect(realLinkRect(null)).toEqual(DEFAULT_AD_BALANCE.realLink);
  });
});

describe('hintPlacement properties', () => {
  // Feature: player-guide, Property 3. **Validates: Requirements 3.1**
  it('Property 3: balloon stays in the Desktop_Area, off the Real_Link and the Lane_Dock', () => {
    const link = realLinkRect(null);
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: SCREEN.w }),
        fc.integer({ min: 0, max: SCREEN.h }),
        (x, y) => {
          const { rect } = placeBalloon({ x, y }, BALLOON_SIZE, [link]);
          expect(insideDesktop(rect)).toBe(true);
          expect(intersects(rect, link)).toBe(false);
          expect(intersects(rect, LANE_DOCK)).toBe(false);
        },
      ),
    );
  });
});
