import { beforeAll, describe, expect, it } from 'vitest';
import {
  LANE_HUD_BAR_W, LANE_HUD_FONT_PX, LANE_HUD_GAP, LANE_HUD_RIGHT, LANE_HUD_VALUE_CH, LANE_CANVAS_W,
  SHOP_TRAY_CENTRE_X,
} from '../../src/render/laneLayout';
// Vitest stubs CSS imports, so lane.css is read from disk (repo has no @types/node).
let CSS = '';
beforeAll(async () => {
  const fs = (await import('node:fs' as string)) as { readFileSync(p: string, e: 'utf8'): string };
  CSS = fs.readFileSync('src/styles/lane.css', 'utf8');
});
function rule(selector: string): string {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = new RegExp(`(^|\\n)${esc}\\s*\\{([^}]*)\\}`).exec(CSS);
  if (!m) throw new Error(`no rule ${selector}`);
  return m[2];
}
const prop = (body: string, name: string): string | undefined =>
  new RegExp(`(^|[\\s;])${name}\\s*:\\s*([^;]+);`).exec(body)?.[2].trim();
describe('Lane_HUD layout constants match lane.css', () => {
  it('shop tray is horizontally centred', () => {
    const r = rule('.shop-tray');
    expect(prop(r, 'left')).toBe('50%');
    expect(prop(r, 'transform')).toBe('translateX(-50%)');
    expect(SHOP_TRAY_CENTRE_X).toBe(LANE_CANVAS_W / 2);
  });
  it('integrity HUD is right-anchored with the mirrored sizes', () => {
    const hud = rule('.lane-hud');
    expect(prop(hud, 'right')).toBe(`${LANE_HUD_RIGHT}px`);
    expect(prop(hud, 'left')).toBeUndefined();
    expect(prop(hud, 'gap')).toBe(`${LANE_HUD_GAP}px`);
    expect(prop(hud, 'font-size')).toBe(`${LANE_HUD_FONT_PX}px`);
    expect(prop(rule('.lane-hud-bar'), 'width')).toBe(`${LANE_HUD_BAR_W}px`);
    expect(prop(rule('.lane-hud-value'), 'min-width')).toBe(`${LANE_HUD_VALUE_CH}ch`);
  });
});
