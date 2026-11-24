/**
 * The persistent CRT monitor: bezel, power button, LED, scanline overlay and the fixed
 * 1024 × 768 logical Screen that scenes mount into. The whole monitor is scaled uniformly to the
 * viewport with one CSS transform (Req 2.1, 2.2). DOM and class names follow the contract in
 * src/styles/monitor.css; the size constants match the tokens in src/styles/theme.css.
 */

import { h } from './h';

export const SCREEN_W = 1024;
export const SCREEN_H = 768;
/** Bezel thickness in logical px (theme.css `--bezel-top`, `--bezel-side`, `--bezel-bottom`). */
export const BEZEL = { top: 36, side: 44, bottom: 84 } as const;
export const MONITOR_W = SCREEN_W + 2 * BEZEL.side;
export const MONITOR_H = SCREEN_H + BEZEL.top + BEZEL.bottom;

export interface Fit {
  readonly scale: number;
  readonly offsetX: number;
  readonly offsetY: number;
}

/**
 * Largest uniform scale that fits the monitor in the viewport, centred (Req 2.2). A viewport
 * with no area (or a non-finite size) gives scale 0 and zero offsets.
 */
export function fitMonitor(viewportW: number, viewportH: number): Fit {
  if (!(viewportW > 0) || !(viewportH > 0) || !Number.isFinite(viewportW) || !Number.isFinite(viewportH)) {
    return { scale: 0, offsetX: 0, offsetY: 0 };
  }
  const scale = Math.min(viewportW / MONITOR_W, viewportH / MONITOR_H);
  return {
    scale,
    offsetX: (viewportW - scale * MONITOR_W) / 2,
    offsetY: (viewportH - scale * MONITOR_H) / 2,
  };
}

export interface Rect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** Client px per Screen px. A rect without width (jsdom, not laid out) counts as scale 1. */
function rectScale(screenRect: Rect): number {
  return screenRect.width > 0 ? screenRect.width / SCREEN_W : 1;
}

/** Client → Screen coordinates from the Screen element's bounding rect (Req 2.3). */
export function toScreenPoint(clientX: number, clientY: number, screenRect: Rect): Point {
  const scale = rectScale(screenRect);
  return { x: (clientX - screenRect.left) / scale, y: (clientY - screenRect.top) / scale };
}

/** Screen → client coordinates; the inverse of `toScreenPoint`. */
export function toClientPoint(x: number, y: number, screenRect: Rect): Point {
  const scale = rectScale(screenRect);
  return { x: screenRect.left + x * scale, y: screenRect.top + y * scale };
}

export type LedState = 'off' | 'standby' | 'on';

export interface Monitor {
  /** Scenes mount here. The scene director clears it on every switch. */
  readonly screen: HTMLElement;
  setLed(state: LedState): void;
  /** `null` makes the power button do nothing (Req 3.5). */
  setPowerHandler(fn: (() => void) | null): void;
  toScreenPoint(clientX: number, clientY: number): Point;
  unmount(): void;
}

export type MonitorWindow = Pick<Window, 'innerWidth' | 'innerHeight' | 'addEventListener' | 'removeEventListener'>;

export function createMonitor(host: HTMLElement, win: MonitorWindow = window): Monitor {
  let powerHandler: (() => void) | null = null;

  // `.screen-content` is the Juice_View's Screen_Shake target (juice-and-endings Req 1.4).
  const screen = h('div', { className: 'screen screen-content' });
  const overlay = h('div', { className: 'crt-overlay', attrs: { 'aria-hidden': 'true' } });
  const led = h('span', { className: 'monitor-led', attrs: { 'data-state': 'off', 'aria-hidden': 'true' } });
  const power = h('button', {
    className: 'monitor-power',
    attrs: { type: 'button', 'aria-label': 'Power' },
    on: { click: () => powerHandler?.() },
  });

  // The overlay is a sibling of `.screen`, so clearing the Screen never removes it.
  const root = h(
    'div',
    { className: 'monitor' },
    h('div', { className: 'monitor-glass' }, screen, overlay),
    h('div', { className: 'monitor-controls' }, led, power),
  );

  const applyFit = (): void => {
    const { scale, offsetX, offsetY } = fitMonitor(win.innerWidth, win.innerHeight);
    root.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
  };

  host.appendChild(root);
  applyFit();
  win.addEventListener('resize', applyFit);

  let mounted = true;

  return {
    screen,
    setLed(state) {
      led.dataset.state = state;
    },
    setPowerHandler(fn) {
      powerHandler = fn;
    },
    toScreenPoint(clientX, clientY) {
      return toScreenPoint(clientX, clientY, screen.getBoundingClientRect());
    },
    unmount() {
      if (!mounted) return;
      mounted = false;
      win.removeEventListener('resize', applyFit);
      powerHandler = null;
      root.remove();
    },
  };
}
