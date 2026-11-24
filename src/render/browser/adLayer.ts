/**
 * Ad_Layer: keyed DOM reconcile of `state.ads.ads` over the whole Ad_Field (Req 12.1–12.6, 9.3).
 * It only reads state and sends `adClick` / `adHover` commands.
 */
import { h } from '../../core/h';
import type { AdClickCommand, AdControl, AdHoverCommand } from '../../game/ads/adTypes';
import type { GameState } from '../../game/types';
import { adSignature, buildAd, updateAdText } from './adDom';

const CONTROLS: ReadonlySet<string> = new Set<AdControl>([
  'close', 'bigClose', 'tinyClose', 'ok', 'cancel', 'noThanks',
  'skip', 'confirmYes', 'confirmNo', 'fakeButton', 'body',
]);

export interface AdLayer {
  readonly element: HTMLDivElement;
  mount(host: HTMLElement): void;
  update(state: GameState): void;
  unmount(): void;
}

interface Entry { readonly el: HTMLElement; sig: string; shield: HTMLElement | null }

export function createAdLayer(send: (cmd: AdClickCommand | AdHoverCommand) => void): AdLayer {
  const layer = h('div', { className: 'ad-layer' });
  const entries = new Map<number, Entry>();

  const onPointerDown = (e: PointerEvent): void => {
    const target = e.target instanceof Element ? e.target : null;
    const adEl = target?.closest<HTMLElement>('[data-ad-id]');
    if (!target || !adEl || !layer.contains(adEl)) return;
    const ctlEl = target.closest<HTMLElement>('[data-control]');
    const control = ctlEl && adEl.contains(ctlEl) ? ctlEl.dataset.control : 'body';
    if (!control || !CONTROLS.has(control)) return;
    e.preventDefault();
    e.stopPropagation();
    send({ type: 'adClick', adId: Number(adEl.dataset.adId), control: control as AdControl });
  };

  // pointerenter does not bubble; capture on the layer and filter to runaway ✕ buttons.
  const onPointerEnter = (e: PointerEvent): void => {
    const t = e.target instanceof HTMLElement ? e.target : null;
    if (!t || !t.classList.contains('ad-runaway-close')) return;
    const adEl = t.closest<HTMLElement>('[data-ad-id]');
    if (adEl) send({ type: 'adHover', adId: Number(adEl.dataset.adId) });
  };

  function clear(): void {
    for (const e of entries.values()) { e.el.remove(); e.shield?.remove(); }
    entries.clear();
  }

  return {
    element: layer,
    mount(host) {
      host.append(layer);
      layer.addEventListener('pointerdown', onPointerDown);
      layer.addEventListener('pointerenter', onPointerEnter, true);
    },
    update(state) {
      const ads = state.ads;
      if (!ads) { clear(); return; }
      const live = new Set(ads.ads.map((a) => a.id));
      for (const [id, e] of entries) {
        if (!live.has(id)) { e.el.remove(); e.shield?.remove(); entries.delete(id); }
      }
      const page = ads.balance.page;
      const order: HTMLElement[] = [];
      for (const ad of ads.ads) {
        const sig = adSignature(ad);
        let entry = entries.get(ad.id);
        if (!entry || entry.sig !== sig) {
          const el = buildAd(ad, ads.balance, state.tick);
          if (entry) { entry.el.replaceWith(el); }
          let shield = entry?.shield ?? null;
          if (shield && ad.kind !== 'interrupter') { shield.remove(); shield = null; }
          if (ad.kind === 'interrupter' && !shield) {
            shield = h('div', { className: 'ad-modal-shield', attrs: { 'data-shield-for': String(ad.id) } });
            const s = shield.style;
            s.left = `${page.x}px`; s.top = `${page.y}px`; s.width = `${page.w}px`; s.height = `${page.h}px`;
          }
          entry = { el, sig, shield };
          entries.set(ad.id, entry);
        } else {
          updateAdText(entry.el, ad, ads.balance, state.tick);
        }
        if (entry.shield) order.push(entry.shield);
        order.push(entry.el);
      }
      // Keep DOM order equal to id order (later ads on top), moving only nodes out of place.
      order.forEach((node, i) => {
        if (layer.children[i] !== node) layer.insertBefore(node, layer.children[i] ?? null);
      });
    },
    unmount() {
      layer.removeEventListener('pointerdown', onPointerDown);
      layer.removeEventListener('pointerenter', onPointerEnter, true);
      clear();
      layer.remove();
    },
  };
}
