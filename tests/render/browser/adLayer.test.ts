// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { createAdLayer } from '../../../src/render/browser/adLayer';
import { countdownSeconds } from '../../../src/render/browser/adDom';
import { controlsFor } from '../../../src/game/ads/closePatterns';
import { hatchesNow, hatchView } from '../../../src/game/ads/hatch';
import { resolveAdBalance, type AdBalance } from '../../../src/game/balance/ads';
import { secondsToTicks } from '../../../src/game/balance/lane';
import type { Ad, ClosePattern } from '../../../src/game/ads/adTypes';
import { TICK_RATE, type GameState } from '../../../src/game/types';
import { loadRepoFiles } from '../../helpers/repo';

const balance = resolveAdBalance();
const ad = (id: number, over: Partial<Ad> = {}): Ad => ({
  id, kind: 'clutter', pattern: 'plain', rect: { x: 10 * id, y: 20, w: 300, h: 180 }, openTick: 0,
  copy: 0, laneCover: false, stage: 'main', corner: null, closeAt: null, jumps: 0, ...over,
});
const stateWith = (b: AdBalance, ads: Ad[], tick: number): GameState =>
  ({ tick, ads: { balance: b, nextId: 99, ads, connectedTick: 0, openedFirstClutter: true } }) as unknown as GameState;
const stateOf = (ads: Ad[], tick = 0): GameState => stateWith(balance, ads, tick);

function setup() {
  const sent: unknown[] = [];
  const host = document.createElement('div');
  document.body.append(host);
  const layer = createAdLayer((c) => sent.push(c));
  layer.mount(host);
  return { sent, host, layer };
}

const PATTERNS: ClosePattern[] = ['plain', 'decoy', 'hidden', 'swapped', 'countdown', 'confirm', 'runaway'];
const arbAd = (id: number) => fc.oneof(
  fc.record({ p: fc.constantFrom(...PATTERNS), c: fc.boolean() }).map(({ p, c }): Ad => ad(id, {
    kind: p === 'runaway' || c ? 'interrupter' : 'clutter', pattern: p,
    stage: p === 'confirm' && c ? 'confirm' : 'main',
    corner: p === 'hidden' ? 'tl' : null, closeAt: p === 'runaway' ? { x: 5, y: 5 } : null,
  })),
  fc.constant(ad(id, { kind: 'fake', pattern: null, rect: { x: 1, y: 2, w: 220, h: 64 } })),
);

describe('Ad_Layer', () => {
  it('Property 10: mirrors the Ad_State with exactly the table controls in id order', () => {
    // **Validates: Requirements 10.3, 12.1, 12.2, 12.3**
    const { host, layer } = setup();
    fc.assert(fc.property(
      fc.array(fc.uniqueArray(fc.integer({ min: 1, max: 20 }), { maxLength: 6 }), { maxLength: 5 })
        .chain((lists) => fc.tuple(...lists.map((ids) =>
          fc.tuple(...[...ids].sort((a, b) => a - b).map(arbAd))))),
      (states) => {
        for (const ads of states as Ad[][]) {
          layer.update(stateOf(ads));
          const els = [...host.querySelectorAll<HTMLElement>('.ad')];
          expect(els.map((e) => Number(e.dataset.adId))).toEqual(ads.map((a) => a.id));
          ads.forEach((a, i) => {
            const el = els[i]!;
            expect(el.style.left).toBe(`${a.rect.x}px`);
            expect(el.style.width).toBe(`${a.rect.w}px`);
            const ctl = [...el.querySelectorAll<HTMLElement>('button[data-control]')].map((b) => b.dataset.control);
            expect([...ctl, 'body'].sort()).toEqual([...controlsFor(a)].sort());
          });
          expect(host.querySelectorAll('.ad-modal-shield').length)
            .toBe(ads.filter((a) => a.kind === 'interrupter').length);
        }
      }), { numRuns: 100 });
    layer.unmount();
  });

  it('delegated pointerdown sends adClick for controls and body', () => {
    const { sent, host, layer } = setup();
    layer.update(stateOf([ad(3, { pattern: 'decoy' })]));
    host.querySelector('[data-control="bigClose"]')!.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    host.querySelector('.ad-text')!.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(sent).toEqual([
      { type: 'adClick', adId: 3, control: 'bigClose' },
      { type: 'adClick', adId: 3, control: 'body' },
    ]);
    layer.unmount();
    expect(host.children.length).toBe(0);
  });

  it('hidden has no title ✕; runaway hover sends adHover; shield sits under its interrupter', () => {
    const { sent, host, layer } = setup();
    layer.update(stateOf([
      ad(1, { pattern: 'hidden', corner: 'bl' }),
      ad(2, { kind: 'interrupter', pattern: 'runaway', closeAt: { x: 30, y: 40 } }),
    ]));
    expect(host.querySelector('[data-ad-id="1"] .title-bar [data-control]')).toBeNull();
    expect(host.querySelector('[data-ad-id="1"] .ad-corner-bl')).not.toBeNull();
    const x = host.querySelector<HTMLElement>('.ad-runaway-close')!;
    expect(x.style.left).toBe('30px');
    x.dispatchEvent(new Event('pointerenter'));
    expect(sent).toEqual([{ type: 'adHover', adId: 2 }]);
    const shield = host.querySelector('.ad-modal-shield')!;
    expect(shield.nextElementSibling).toBe(host.querySelector('[data-ad-id="2"]'));
    layer.unmount();
  });

  it('countdown text counts down to Skip', () => {
    const a = ad(1, { pattern: 'countdown', openTick: 100 });
    expect(countdownSeconds(a, balance, 100)).toBe(3);
    expect(countdownSeconds(a, balance, 221)).toBe(1);
    expect(countdownSeconds(a, balance, 280)).toBe(0);
    const { host, layer } = setup();
    layer.update(stateOf([a], 100));
    expect(host.querySelector('[data-control="skip"]')!.textContent).toBe('Skip ad in 3...');
    layer.update(stateOf([a], 400));
    expect(host.querySelector('[data-control="skip"]')!.textContent).toBe('Skip ad');
    layer.unmount();
  });
});

describe('Ad_Layer Hatch_Warning (ad-pressure Req 7.2)', () => {
  const period = secondsToTicks(balance.hatchSeconds);
  const warn = secondsToTicks(balance.hatchWarningSeconds);
  const hatching = (host: HTMLElement, id: number): boolean =>
    host.querySelector(`[data-ad-id="${id}"]`)!.classList.contains('is-hatching');

  it('is off at open, on from the first warning Tick, off on the hatch Tick, on again next cycle', () => {
    const open = 50;
    const a = ad(1, { openTick: open });
    const { host, layer } = setup();
    const at = (age: number): boolean => {
      layer.update(stateOf([a], open + age));
      expect(hatching(host, 1)).toBe(hatchView(a, open + age, balance)!.warning);
      return hatching(host, 1);
    };
    expect(at(0)).toBe(false); // built by buildAd at open
    expect(at(period - warn - 1)).toBe(false); // one Tick before the edge
    expect(at(period - warn)).toBe(true); // the edge
    expect(at(period - 1)).toBe(true);
    expect(hatchesNow(a, open + period, balance)).toBe(true);
    expect(at(period)).toBe(false); // the hatch Tick ends the warning
    expect(at(period + 1)).toBe(false);
    expect(at(2 * period - warn - 1)).toBe(false);
    expect(at(2 * period - warn)).toBe(true); // it hatches again every hatchSeconds
    layer.unmount();

    // An Ad first drawn mid-warning gets the class from buildAd.
    const late = setup();
    late.layer.update(stateOf([a], open + period - 1));
    expect(hatching(late.host, 1)).toBe(true);
    late.layer.unmount();
  });

  it('never marks interrupters or fake buttons, and only clutter carries the art', () => {
    const ads = [
      ad(1),
      ad(2, { kind: 'interrupter', pattern: 'plain' }),
      ad(3, { kind: 'interrupter', pattern: 'runaway', closeAt: { x: 5, y: 5 } }),
      ad(4, { kind: 'fake', pattern: null, rect: { x: 1, y: 2, w: 220, h: 64 } }),
    ];
    const { host, layer } = setup();
    for (let t = 0; t <= 2 * period; t++) {
      layer.update(stateOf(ads, t));
      for (const id of [2, 3, 4]) expect(hatching(host, id)).toBe(false);
    }
    expect(host.querySelectorAll('.ad-hatch-art')).toHaveLength(1);
    expect(host.querySelector('[data-ad-id="1"] > .ad-hatch-art')).not.toBeNull();
    layer.unmount();
  });

  it('draws the crack and hand only during the warning and never takes pointer events', async () => {
    const style = document.createElement('style');
    style.textContent = (await loadRepoFiles()).read('src/styles/browser.css');
    document.head.append(style);
    const { host, layer } = setup();
    try {
      const a = ad(1);
      layer.update(stateOf([a], 0));
      const art = host.querySelector<HTMLElement>('[data-ad-id="1"] > .ad-hatch-art')!;
      expect(art.querySelector('.ad-hatch-crack svg')).not.toBeNull();
      expect(art.querySelector('.ad-hatch-hand svg')).not.toBeNull();
      expect(getComputedStyle(art).display).toBe('none');
      expect(getComputedStyle(art).pointerEvents).toBe('none');
      layer.update(stateOf([a], period - warn));
      expect(getComputedStyle(art).display).toBe('block');
      expect(getComputedStyle(art).pointerEvents).toBe('none');
    } finally {
      layer.unmount();
      style.remove();
    }
  });

  it('shakes at no more than 3 cycles per second and animates transform only', async () => {
    const css = (await loadRepoFiles()).read('src/styles/browser.css');
    const shake = /\.ad\.is-hatching\s*\{\s*animation:\s*ad-hatch-shake\s+([\d.]+)s/.exec(css);
    expect(shake).not.toBeNull();
    expect(Number(shake![1])).toBeGreaterThanOrEqual(1 / 3);
    const frames = [...css.matchAll(/@keyframes\s+(ad-hatch-[\w-]+)\s*\{([\s\S]*?)\n\}/g)];
    expect(frames.map((f) => f[1]).sort()).toEqual(['ad-hatch-claw', 'ad-hatch-reach', 'ad-hatch-shake']);
    for (const f of frames) {
      const props = new Set([...f[2]!.matchAll(/([a-z-]+)\s*:/g)].map((p) => p[1]));
      expect([...props]).toEqual(['transform']);
    }
  });

  // Property: ad-pressure Req 7.2 is-hatching follows hatchView().warning on every Tick, so the
  // class turns on at most once per hatchSeconds and stays on for exactly the warning window.
  // **Validates: Requirements 7.2**
  it('toggles is-hatching only with hatchView().warning, never faster than the warning window', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 4 }).chain((hatchSeconds) =>
          fc.record({
            hatchSeconds: fc.constant(hatchSeconds),
            warnTicks: fc.integer({ min: 0, max: hatchSeconds * TICK_RATE }),
            openTick: fc.integer({ min: 0, max: 500 }),
          })),
        ({ hatchSeconds, warnTicks, openTick }) => {
          const b = resolveAdBalance({ hatchSeconds, hatchWarningSeconds: warnTicks / TICK_RATE });
          const p = secondsToTicks(b.hatchSeconds);
          const a = ad(1, { openTick });
          const { host, layer } = setup();
          let prev = false;
          let lastOn = -Infinity;
          let onSince = -Infinity;
          for (let t = openTick; t <= openTick + 3 * p; t++) {
            layer.update(stateWith(b, [a], t));
            const on = hatching(host, 1);
            expect(on).toBe(hatchView(a, t, b)!.warning);
            if (t === openTick && warnTicks < p) expect(on).toBe(false);
            if (on && !prev) {
              expect(t - lastOn).toBeGreaterThanOrEqual(p);
              lastOn = t;
              onSince = t;
            }
            if (!on && prev) {
              expect(t - onSince).toBe(warnTicks);
              expect(hatchesNow(a, t, b)).toBe(true);
            }
            prev = on;
          }
          layer.unmount();
          host.remove();
        },
      ),
      { numRuns: 30 },
    );
  });
});
