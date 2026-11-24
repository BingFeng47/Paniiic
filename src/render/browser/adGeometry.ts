/**
 * Ad control geometry: where each control of an Ad sits on the Screen, for code that must aim at
 * a control without a DOM (the zombie-sim bots, pacing-and-economy Req 6.3).
 *
 * Absolutely positioned controls use the numbers of src/styles/browser.css and
 * src/styles/desktop.css, mirrored here; tests/render/browser/adGeometry.test.ts reads the CSS and
 * fails if they drift. The runaway ✕ uses the same `runawayCloseAt` as adDom.ts. Controls laid
 * out by the normal text flow (OK / Cancel, the "no thanks" link, Skip, Yes / No) depend on the
 * ad copy and font, so their centres are estimates: horizontally centred like `.ad-body
 * { text-align: center }`, at a fixed share of the ad's height below the title bar.
 */
import { RUNAWAY_CLOSE_SIZE, runawayCloseAt } from '../../game/ads/closePatterns';
import type { Ad, AdControl } from '../../game/ads/adTypes';
import { TITLE_BAR_H } from '../../desktop/layout';

export interface ScreenPoint {
  readonly x: number;
  readonly y: number;
}

/** `.ad { border: 2px outset }` with `box-sizing: border-box`; fake buttons have `border: 0`. */
export const AD_BORDER = 2;
/** `.title-bar { height: calc(var(--title-bar-h) - 3px); padding: 0 2px }`. */
export const AD_TITLE_BAR_H = TITLE_BAR_H - 3;
export const AD_TITLE_BAR_PAD = 2;
/** `.title-bar-button { width: 16px }`. */
export const AD_TITLE_BUTTON_W = 16;
/** `.ad-big-close { right: 10px; top: 40%; width: 44px; height: 44px }`. */
export const AD_BIG_CLOSE_RIGHT = 10;
export const AD_BIG_CLOSE_TOP = 0.4;
export const AD_BIG_CLOSE_SIZE = 44;
/** `.ad-tiny-close { width: 12px; height: 12px }` and `.ad-corner-* { 2px }`. */
export const AD_TINY_CLOSE_SIZE = 12;
export const AD_TINY_CLOSE_INSET = 2;
/** `.ad-button { min-width: 64px; margin: 4px }`: centres of two side-by-side buttons. */
export const AD_BUTTON_HALF_GAP = 64 / 2 + 4;

/** Estimated share of the height below the title bar for flow-laid controls (see header). */
const FLOW_ROW: Readonly<Partial<Record<AdControl, number>>> = {
  ok: 0.62,
  cancel: 0.62,
  noThanks: 0.82,
  skip: 0.72,
  confirmYes: 0.72,
  confirmNo: 0.72,
};

/** Centre of `control` on `ad` in Screen px. Unknown controls aim at the ad's middle. */
export function adControlCentre(ad: Ad, control: AdControl): ScreenPoint {
  const r = ad.rect;
  if (ad.kind === 'fake' || control === 'fakeButton') return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
  const left = r.x + AD_BORDER;
  const top = r.y + AD_BORDER;
  const innerW = r.w - 2 * AD_BORDER;
  const innerH = r.h - 2 * AD_BORDER;
  const centreX = left + innerW / 2;
  switch (control) {
    case 'close': {
      if (ad.pattern === 'runaway') {
        const at = runawayCloseAt(ad);
        return { x: left + at.x + RUNAWAY_CLOSE_SIZE / 2, y: top + at.y + RUNAWAY_CLOSE_SIZE / 2 };
      }
      return { x: left + innerW - AD_TITLE_BAR_PAD - AD_TITLE_BUTTON_W / 2, y: top + AD_TITLE_BAR_H / 2 };
    }
    case 'bigClose':
      return {
        x: left + innerW - AD_BIG_CLOSE_RIGHT - AD_BIG_CLOSE_SIZE / 2,
        y: top + AD_BIG_CLOSE_TOP * innerH + AD_BIG_CLOSE_SIZE / 2,
      };
    case 'tinyClose': {
      const corner = ad.corner ?? 'br';
      const half = AD_TINY_CLOSE_INSET + AD_TINY_CLOSE_SIZE / 2;
      return {
        x: corner === 'tl' || corner === 'bl' ? left + half : left + innerW - half,
        y: corner === 'tl' || corner === 'tr' ? top + half : top + innerH - half,
      };
    }
    default: {
      const bodyTop = top + AD_TITLE_BAR_H;
      const bodyH = innerH - AD_TITLE_BAR_H;
      const row = FLOW_ROW[control];
      if (row === undefined) return { x: centreX, y: bodyTop + bodyH / 2 }; // 'body'
      const dx = control === 'ok' || control === 'confirmYes' ? -AD_BUTTON_HALF_GAP
        : control === 'cancel' || control === 'confirmNo' ? AD_BUTTON_HALF_GAP : 0;
      return { x: centreX + dx, y: bodyTop + row * bodyH };
    }
  }
}

/** True when the Screen point lies inside the Ad's rect. */
export function adContains(ad: Ad, p: ScreenPoint): boolean {
  const r = ad.rect;
  return p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h;
}
