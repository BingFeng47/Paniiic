import { beforeAll, describe, expect, it } from 'vitest';
import type { Ad } from '../../../src/game/ads/adTypes';
import { RUNAWAY_CLOSE_SIZE } from '../../../src/game/ads/closePatterns';
import {
  AD_BIG_CLOSE_RIGHT, AD_BIG_CLOSE_SIZE, AD_BIG_CLOSE_TOP, AD_BORDER, AD_TINY_CLOSE_INSET,
  AD_TINY_CLOSE_SIZE, AD_TITLE_BAR_PAD, AD_TITLE_BUTTON_W, adContains, adControlCentre,
} from '../../../src/render/browser/adGeometry';
import { loadRepoFiles } from '../../helpers/repo';

const ad = (over: Partial<Ad> = {}): Ad => ({
  id: 1, kind: 'clutter', pattern: 'plain', rect: { x: 100, y: 50, w: 300, h: 180 }, openTick: 0,
  copy: 0, laneCover: false, stage: 'main', corner: null, closeAt: null, jumps: 0, ...over,
});

let BROWSER = '';
let DESKTOP = '';
beforeAll(async () => {
  const repo = await loadRepoFiles();
  BROWSER = repo.read('src/styles/browser.css');
  DESKTOP = repo.read('src/styles/desktop.css');
});
function rule(css: string, selector: string): string {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = new RegExp(`(^|\\n)${esc}\\s*\\{([^}]*)\\}`).exec(css);
  if (!m) throw new Error(`no rule ${selector}`);
  return m[2]!;
}
const prop = (body: string, name: string): string | undefined =>
  new RegExp(`(^|[\\s;])${name}\\s*:\\s*([^;]+);`).exec(body)?.[2]!.trim();

describe('adGeometry constants match the CSS', () => {
  it('ad frame, title bar and buttons', () => {
    expect(prop(rule(BROWSER, '.ad'), 'border')).toBe(`${AD_BORDER}px outset #fff`);
    expect(prop(rule(BROWSER, '.ad'), 'box-sizing')).toBe('border-box');
    expect(prop(rule(DESKTOP, '.title-bar'), 'height')).toBe('calc(var(--title-bar-h) - 3px)');
    expect(prop(rule(DESKTOP, '.title-bar'), 'padding')).toBe(`0 ${AD_TITLE_BAR_PAD}px 0 ${AD_TITLE_BAR_PAD}px`);
    expect(prop(rule(DESKTOP, '.title-bar-button'), 'width')).toBe(`${AD_TITLE_BUTTON_W}px`);
  });
  it('big and tiny ✕', () => {
    const big = rule(BROWSER, '.ad-big-close');
    expect(big).toContain(`right: ${AD_BIG_CLOSE_RIGHT}px`);
    expect(big).toContain(`top: ${AD_BIG_CLOSE_TOP * 100}%`);
    expect(big).toContain(`width: ${AD_BIG_CLOSE_SIZE}px`);
    expect(big).toContain(`height: ${AD_BIG_CLOSE_SIZE}px`);
    const tiny = rule(BROWSER, '.ad-tiny-close, .ad-runaway-close');
    expect(tiny).toContain(`width: ${AD_TINY_CLOSE_SIZE}px`);
    expect(rule(BROWSER, '.ad-corner-br')).toContain(`right: ${AD_TINY_CLOSE_INSET}px; bottom: ${AD_TINY_CLOSE_INSET}px`);
  });
});

describe('adControlCentre', () => {
  it('puts the title-bar ✕ in the top-right corner of the title bar', () => {
    // left 102 + inner 296 − pad 2 − half button 8; top 52 + half of the 17 px bar.
    expect(adControlCentre(ad(), 'close')).toEqual({ x: 388, y: 60.5 });
  });
  it('puts the tiny ✕ in its corner and the runaway ✕ at closeAt', () => {
    expect(adControlCentre(ad({ pattern: 'hidden', corner: 'bl' }), 'tinyClose')).toEqual({ x: 110, y: 220 });
    const run = ad({ kind: 'interrupter', pattern: 'runaway', closeAt: { x: 40, y: 30 } });
    expect(adControlCentre(run, 'close')).toEqual({ x: 102 + 40 + RUNAWAY_CLOSE_SIZE / 2, y: 52 + 30 + RUNAWAY_CLOSE_SIZE / 2 });
  });
  it('aims at a fake button centre and keeps every control inside its ad', () => {
    const fake = ad({ kind: 'fake', pattern: null, rect: { x: 400, y: 330, w: 220, h: 60 } });
    expect(adControlCentre(fake, 'fakeButton')).toEqual({ x: 510, y: 360 });
    const swapped = ad({ pattern: 'swapped' });
    for (const c of ['ok', 'cancel', 'noThanks', 'body'] as const) {
      expect(adContains(swapped, adControlCentre(swapped, c))).toBe(true);
    }
    expect(adContains(ad({ pattern: 'decoy' }), adControlCentre(ad({ pattern: 'decoy' }), 'bigClose'))).toBe(true);
  });
});
