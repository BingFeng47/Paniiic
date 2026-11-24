/**
 * One DOM builder per ad kind and close pattern (Req 10.3, 12.2, 12.7, 12.8). The controls come
 * only from `controlsFor(ad)`, so the view and the rules never disagree. Every control is a
 * `<button data-control>`; the ad element itself carries `data-control="body"`.
 */
import { h } from '../../core/h';
import type { AdBalance } from '../../game/balance/ads';
import { controlsFor, countdownReadyTick, RUNAWAY_CLOSE_SIZE, runawayCloseAt } from '../../game/ads/closePatterns';
import { hatchView } from '../../game/ads/hatch';
import type { Ad, AdControl } from '../../game/ads/adTypes';
import { TICK_RATE } from '../../game/types';
import { AD_COPY, AD_LABELS } from '../../ui/browserCopy';
import { HATCH_CRACK_SVG, HATCH_HAND_SVG } from './hatchArt';

/** Parses compile-time constant markup from hatchArt.ts (never game or ad text). */
function constantSvg(markup: string): Node {
  const doc = new DOMParser().parseFromString(markup, 'image/svg+xml');
  return document.importNode(doc.documentElement, true);
}

/**
 * The crack and the hand a clutter Ad shows during its Hatch_Warning (ad-pressure Req 7.2).
 * CSS hides it unless the Ad has `is-hatching`; it never takes pointer events.
 */
function hatchArt(): HTMLElement {
  return h('div', { className: 'ad-hatch-art', attrs: { 'aria-hidden': 'true' } },
    h('div', { className: 'ad-hatch-crack' }, constantSvg(HATCH_CRACK_SVG)),
    h('div', { className: 'ad-hatch-hand' }, constantSvg(HATCH_HAND_SVG)));
}

/** True while the Ad's Hatch_Warning is on; the timing comes only from `hatchView`. */
export function isHatching(ad: Ad, balance: AdBalance, tick: number): boolean {
  return hatchView(ad, tick, balance)?.warning ?? false;
}

function syncHatching(el: HTMLElement, ad: Ad, balance: AdBalance, tick: number): void {
  el.classList.toggle('is-hatching', isHatching(ad, balance, tick));
}

/** Seconds shown on a countdown ad's Skip button: max(0, ceil((ready - tick) / 60)). */
export function countdownSeconds(ad: Ad, balance: AdBalance, tick: number): number {
  return Math.max(0, Math.ceil((countdownReadyTick(ad, balance) - tick) / TICK_RATE));
}

function control(name: AdControl, className: string, text: string): HTMLButtonElement {
  return h('button', { className: `ad-control ${className}`, attrs: { type: 'button', 'data-control': name } }, text);
}

/** A stable signature of everything the ad's DOM depends on except the countdown text. */
export function adSignature(ad: Ad): string {
  return [ad.kind, ad.pattern, ad.stage, ad.copy, ad.corner, ad.rect.x, ad.rect.y, ad.rect.w, ad.rect.h,
    ad.closeAt?.x, ad.closeAt?.y, ad.laneCover].join('|');
}

export function buildAd(ad: Ad, balance: AdBalance, tick: number): HTMLElement {
  const controls = controlsFor(ad);
  const has = (c: AdControl): boolean => controls.includes(c);
  const copy = AD_COPY[ad.kind][ad.copy % AD_COPY[ad.kind].length]!;
  const root = h('div', {
    className: `ad ad-${ad.kind}${ad.pattern ? ` ad-pattern-${ad.pattern}` : ''}${ad.laneCover ? ' ad-lane-cover' : ''}`,
    attrs: { 'data-ad-id': String(ad.id), 'data-control': 'body', 'data-stage': ad.stage },
  });
  const s = root.style;
  s.left = `${ad.rect.x}px`;
  s.top = `${ad.rect.y}px`;
  s.width = `${ad.rect.w}px`;
  s.height = `${ad.rect.h}px`;
  if (ad.kind === 'clutter') {
    // First child, so every positioned control after it paints on top of the art.
    root.append(hatchArt());
    syncHatching(root, ad, balance, tick);
  }

  if (ad.kind === 'fake') {
    root.append(control('fakeButton', 'ad-fake-button', copy.action));
    if (copy.body) root.append(h('span', { className: 'ad-fake-sub' }, copy.body));
    return root;
  }

  // Phantom 98 pop-up title bar. Hidden draws no ✕ here; runaway's ✕ is placed at closeAt.
  const titleControls = h('div', { className: 'title-bar-controls' });
  if (has('close') && ad.pattern !== 'runaway') {
    titleControls.append(control('close', 'title-bar-button title-bar-close ad-close', AD_LABELS.close));
  }
  root.append(h('div', { className: 'title-bar ad-title-bar' },
    h('span', { className: 'title-bar-text' }, copy.title), titleControls));

  const body = h('div', { className: 'ad-body' },
    h('div', { className: 'ad-headline ad-blink' }, copy.headline),
    h('p', { className: 'ad-text' }, copy.body));
  root.append(body);

  if (ad.stage === 'confirm') {
    body.append(h('div', { className: 'ad-confirm' },
      h('p', { className: 'ad-confirm-question' }, AD_LABELS.confirmQuestion),
      h('div', { className: 'ad-buttons' },
        control('confirmYes', 'ad-button', AD_LABELS.confirmYes),
        control('confirmNo', 'ad-button', AD_LABELS.confirmNo))));
    return root;
  }

  if (has('bigClose')) root.append(control('bigClose', 'ad-big-close', AD_LABELS.bigClose));
  if (has('ok') || has('cancel')) {
    body.append(h('div', { className: 'ad-buttons' },
      has('ok') ? control('ok', 'ad-button', AD_LABELS.ok) : null,
      has('cancel') ? control('cancel', 'ad-button', AD_LABELS.cancel) : null));
  } else {
    body.append(h('div', { className: 'ad-action' }, copy.action));
  }
  if (has('noThanks')) body.append(control('noThanks', 'ad-no-thanks', AD_LABELS.noThanks));
  if (has('skip')) {
    const n = countdownSeconds(ad, balance, tick);
    const skip = control('skip', 'ad-button ad-skip', n > 0 ? AD_LABELS.skipIn(n) : AD_LABELS.skip);
    body.append(skip);
  }
  if (has('tinyClose')) {
    root.append(control('tinyClose', `ad-tiny-close ad-corner-${ad.corner ?? 'br'}`, AD_LABELS.tinyClose));
  }
  if (ad.pattern === 'runaway' && has('close')) {
    const at = runawayCloseAt(ad);
    const btn = control('close', 'ad-runaway-close', AD_LABELS.close);
    btn.style.left = `${at.x}px`;
    btn.style.top = `${at.y}px`;
    btn.style.width = `${RUNAWAY_CLOSE_SIZE}px`;
    btn.style.height = `${RUNAWAY_CLOSE_SIZE}px`;
    root.append(btn);
  }
  return root;
}

/**
 * Per-frame refresh of an Ad whose DOM is otherwise unchanged: the `is-hatching` class from
 * `hatchView` and the countdown text (text only changes through textContent).
 */
export function updateAdText(el: HTMLElement, ad: Ad, balance: AdBalance, tick: number): void {
  if (ad.kind === 'clutter') syncHatching(el, ad, balance, tick);
  if (ad.pattern !== 'countdown') return;
  const skip = el.querySelector<HTMLElement>('[data-control="skip"]');
  if (!skip) return;
  const n = countdownSeconds(ad, balance, tick);
  const text = n > 0 ? AD_LABELS.skipIn(n) : AD_LABELS.skip;
  if (skip.textContent !== text) skip.textContent = text;
}
