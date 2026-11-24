import fc from 'fast-check';
import { afterEach, describe, expect, it } from 'vitest';
import {
  BEZEL,
  createMonitor,
  fitMonitor,
  MONITOR_H,
  MONITOR_W,
  SCREEN_H,
  SCREEN_W,
  toClientPoint,
  toScreenPoint,
  type Rect,
} from '../../src/core/monitor';
import { trackListeners, type ListenerTracker } from '../helpers/dom';

const trackers: ListenerTracker[] = [];

afterEach(() => {
  for (const t of trackers.splice(0)) t.restore();
});

function track(target: EventTarget): ListenerTracker {
  const tracker = trackListeners(target);
  trackers.push(tracker);
  return tracker;
}

function fakeWindow(innerWidth: number, innerHeight: number) {
  const target = new EventTarget();
  const tracker = track(target);
  return { tracker, win: Object.assign(target, { innerWidth, innerHeight }) };
}

/** Reads `translate(Xpx[, Ypx]) scale(S)`; jsdom drops a zero Y, so a missing Y means 0. */
function parseTransform(transform: string): { x: number; y: number; scale: number } {
  const m = /^translate\(([^,)]+)px(?:,\s*([^)]+)px)?\)\s*scale\(([^)]+)\)$/.exec(transform);
  if (!m) throw new Error(`unexpected transform: "${transform}"`);
  return { x: Number(m[1]), y: m[2] === undefined ? 0 : Number(m[2]), scale: Number(m[3]) };
}

function mountMonitor(innerWidth = MONITOR_W * 2, innerHeight = MONITOR_H * 3) {
  const host = document.createElement('div');
  const { win, tracker } = fakeWindow(innerWidth, innerHeight);
  const monitor = createMonitor(host, win);
  const q = <T extends Element>(sel: string): T => {
    const el = host.querySelector<T>(sel);
    if (!el) throw new Error(`missing ${sel}`);
    return el;
  };
  return {
    host,
    win,
    tracker,
    monitor,
    root: q<HTMLElement>(':scope > div.monitor'),
    led: q<HTMLElement>('.monitor-controls > span.monitor-led'),
    power: q<HTMLButtonElement>('.monitor-controls > button.monitor-power'),
  };
}

const TOL_FIT = 1e-9;
const TOL_POINT = 1e-6;

describe('fitMonitor', () => {
  it('sizes the monitor as the 1024 × 768 Screen plus the bezel', () => {
    expect([SCREEN_W, SCREEN_H]).toEqual([1024, 768]);
    expect(MONITOR_W).toBe(SCREEN_W + 2 * BEZEL.side);
    expect(MONITOR_H).toBe(SCREEN_H + BEZEL.top + BEZEL.bottom);
  });

  it('fits and centres the monitor on the limiting axis', () => {
    expect(fitMonitor(MONITOR_W * 2, MONITOR_H * 3)).toEqual({ scale: 2, offsetX: 0, offsetY: MONITOR_H / 2 });
    expect(fitMonitor(MONITOR_W * 3, MONITOR_H)).toEqual({ scale: 1, offsetX: MONITOR_W, offsetY: 0 });
  });

  it.each([
    [0, 500],
    [500, 0],
    [-10, 500],
    [500, -10],
    [Number.NaN, 500],
    [Number.POSITIVE_INFINITY, 500],
    [500, Number.POSITIVE_INFINITY],
  ])('gives scale 0 and zero offsets for viewport %s × %s', (w, h) => {
    expect(fitMonitor(w, h)).toEqual({ scale: 0, offsetX: 0, offsetY: 0 });
  });

  it('fits the viewport as large as possible, centred', () => {
    // Property: Req 2.2 the monitor scales uniformly to the largest size that fits the viewport
    // Feature: retro-shell, Property 2: The monitor fits the viewport as large as possible
    const side = fc.double({ min: 1e-3, max: 1e6, noNaN: true, noDefaultInfinity: true });
    fc.assert(
      fc.property(side, side, (w, h) => {
        const { scale, offsetX, offsetY } = fitMonitor(w, h);
        const scaledW = scale * MONITOR_W;
        const scaledH = scale * MONITOR_H;
        expect(scale).toBeGreaterThan(0);
        expect(scaledW).toBeLessThanOrEqual(w + TOL_FIT);
        expect(scaledH).toBeLessThanOrEqual(h + TOL_FIT);
        expect(Math.abs(scaledW - w) <= TOL_FIT || Math.abs(scaledH - h) <= TOL_FIT).toBe(true);
        expect(Math.abs(offsetX - (w - scaledW) / 2)).toBeLessThanOrEqual(TOL_FIT);
        expect(Math.abs(offsetY - (h - scaledH) / 2)).toBeLessThanOrEqual(TOL_FIT);
        expect(offsetX).toBeGreaterThanOrEqual(-TOL_FIT);
        expect(offsetY).toBeGreaterThanOrEqual(-TOL_FIT);
      }),
      { numRuns: 500 },
    );
  });
});

describe('toScreenPoint / toClientPoint', () => {
  it('converts with the rect offset and scale, treating width 0 as scale 1', () => {
    const rect = { left: 10, top: 20, width: 2048, height: 1536 };
    expect(toScreenPoint(30, 60, rect)).toEqual({ x: 10, y: 20 });
    expect(toClientPoint(10, 20, rect)).toEqual({ x: 30, y: 60 });
    expect(toScreenPoint(15, 25, { left: 5, top: 5, width: 0, height: 0 })).toEqual({ x: 10, y: 20 });
  });

  it('round-trips Screen points through client coordinates', () => {
    // Property: Req 2.3 client positions convert to Screen coordinates with the current scale and offset
    // Feature: retro-shell, Property 3: Client and Screen coordinates round-trip
    const finite = (min: number, max: number) => fc.double({ min, max, noNaN: true, noDefaultInfinity: true });
    const rect: fc.Arbitrary<Rect> = fc.record({
      left: finite(-1e4, 1e4),
      top: finite(-1e4, 1e4),
      width: finite(16, 16_384),
      height: finite(12, 12_288),
    });
    const point = fc.record({ x: finite(-SCREEN_W, 2 * SCREEN_W), y: finite(-SCREEN_H, 2 * SCREEN_H) });
    fc.assert(
      fc.property(rect, point, (r, p) => {
        const client = toClientPoint(p.x, p.y, r);
        const back = toScreenPoint(client.x, client.y, r);
        expect(Math.abs(back.x - p.x)).toBeLessThanOrEqual(TOL_POINT);
        expect(Math.abs(back.y - p.y)).toBeLessThanOrEqual(TOL_POINT);
      }),
      { numRuns: 500 },
    );
  });
});

describe('createMonitor', () => {
  it('builds the bezel, Screen, overlay, LED and power button', () => {
    const { host, monitor, root, led, power } = mountMonitor();
    expect(host.children).toHaveLength(1);
    expect(monitor.screen.matches('div.monitor > div.monitor-glass > div.screen')).toBe(true);
    expect(monitor.screen.childElementCount).toBe(0);

    const overlay = monitor.screen.nextElementSibling;
    expect(overlay?.matches('div.crt-overlay[aria-hidden="true"]')).toBe(true);
    // The overlay sits outside the Screen, so clearing the Screen keeps it.
    monitor.screen.append(document.createElement('p'));
    monitor.screen.replaceChildren();
    expect(root.querySelector('.crt-overlay')).toBe(overlay);

    expect(led.dataset.state).toBe('off');
    expect(power.type).toBe('button');
    expect(power.getAttribute('aria-label')).toBe('Power');
  });

  it('sets the LED state', () => {
    const { monitor, led } = mountMonitor();
    for (const state of ['standby', 'on', 'off'] as const) {
      monitor.setLed(state);
      expect(led.dataset.state).toBe(state);
    }
  });

  it('applies the fit on mount and again on every resize', () => {
    const { win, root } = mountMonitor(MONITOR_W * 2, MONITOR_H * 3);
    expect(root.style.transform).toBe(`translate(0px, ${MONITOR_H / 2}px) scale(2)`);

    win.innerWidth = MONITOR_W / 2;
    win.innerHeight = MONITOR_H;
    win.dispatchEvent(new Event('resize'));
    expect(root.style.transform).toBe(`translate(0px, ${MONITOR_H / 4}px) scale(0.5)`);

    win.innerWidth = MONITOR_W * 3;
    win.innerHeight = MONITOR_H;
    win.dispatchEvent(new Event('resize'));
    expect(parseTransform(root.style.transform)).toEqual({ x: MONITOR_W, y: 0, scale: 1 });
  });

  it('converts client points with the Screen element bounding rect', () => {
    const { monitor } = mountMonitor();
    const rect = { left: 100, top: 50, width: SCREEN_W * 1.5, height: SCREEN_H * 1.5 };
    monitor.screen.getBoundingClientRect = () => DOMRect.fromRect({ x: rect.left, y: rect.top, ...rect });
    expect(monitor.toScreenPoint(100 + 1.5 * 200, 50 + 1.5 * 300)).toEqual({ x: 200, y: 300 });
    // Unlaid-out jsdom rect (all zeros) counts as scale 1 at the origin.
    monitor.screen.getBoundingClientRect = () => new DOMRect();
    expect(monitor.toScreenPoint(12, 34)).toEqual({ x: 12, y: 34 });
  });

  it('ignores the power button while the handler is null', () => {
    const { monitor, power } = mountMonitor();
    expect(() => power.click()).not.toThrow(); // no handler set yet

    const calls: string[] = [];
    monitor.setPowerHandler(() => calls.push('a'));
    power.click();
    monitor.setPowerHandler(() => calls.push('b'));
    power.click();
    monitor.setPowerHandler(null);
    power.click();
    power.click();
    expect(calls).toEqual(['a', 'b']);
  });

  it('removes its resize listener, power handler and elements on unmount', () => {
    const { host, win, tracker, monitor, root, power } = mountMonitor();
    let presses = 0;
    monitor.setPowerHandler(() => presses++);
    expect(tracker.count('resize')).toBe(1);

    monitor.unmount();
    expect(tracker.count()).toBe(0);
    expect(host.childElementCount).toBe(0);

    const before = root.style.transform;
    win.innerWidth = 10;
    win.dispatchEvent(new Event('resize'));
    expect(root.style.transform).toBe(before);
    power.click();
    expect(presses).toBe(0);

    expect(() => monitor.unmount()).not.toThrow();
    expect(tracker.count()).toBe(0);
  });

  it('listens on the real window by default and detaches on unmount', () => {
    const tracker = track(window);
    const host = document.createElement('div');
    const monitor = createMonitor(host);
    expect(tracker.count('resize')).toBe(1);
    monitor.unmount();
    expect(tracker.attached()).toEqual([]);
  });
});
