/**
 * NetSurfer_Window content (Req 5.2, 5.3, 5.5): inert toolbar, address bar, the Download_Page
 * body at `adBalance.page` and the Real_Link at `adBalance.realLink`, and a status bar.
 *
 * The window opens at Screen (0, 0), so Screen rects become content-relative by subtracting the
 * window chrome offset (3 px frame + title bar). All text comes from browserCopy via `h()`.
 */
import { h } from '../../core/h';
import { TITLE_BAR_H } from '../../desktop/layout';
import type { Rect } from '../../game/ads/adTypes';
import type { AdBalance } from '../../game/balance/ads';
import { BROWSER_WINDOW, DOWNLOAD_PAGE } from '../../ui/browserCopy';

/** Window frame padding (desktop.css `.window { padding: 3px }`). */
export const WINDOW_FRAME = 3;
/** Top-left of the window content in Screen pixels when the window sits at (0, 0). */
export const CONTENT_ORIGIN = Object.freeze({ x: WINDOW_FRAME, y: TITLE_BAR_H });

export function toContentRect(screen: Rect): Rect {
  return { x: screen.x - CONTENT_ORIGIN.x, y: screen.y - CONTENT_ORIGIN.y, w: screen.w, h: screen.h };
}

function place(el: HTMLElement, r: Rect): void {
  el.style.left = `${r.x}px`;
  el.style.top = `${r.y}px`;
  el.style.width = `${r.w}px`;
  el.style.height = `${r.h}px`;
}

export interface NetsurferContent {
  readonly root: HTMLElement;
  readonly page: HTMLElement;
  readonly realLink: HTMLButtonElement;
  /** Slot inside the page where the Download_Panel goes. */
  readonly panelSlot: HTMLElement;
  /** Busy text, or `null` for the ready text. */
  setStatus(text: string | null): void;
  /** Replace the Real_Link with the "started" line (Req 5.5). */
  showStarted(): void;
}

export function createNetsurferContent(
  balance: Pick<AdBalance, 'page' | 'realLink'>,
  onRealLink: () => void,
): NetsurferContent {
  const toolbar = h(
    'div',
    { className: 'ns-toolbar', attrs: { role: 'toolbar' } },
    ...BROWSER_WINDOW.toolbar.map((label) =>
      h('button', { className: 'ns-tool', attrs: { type: 'button', tabindex: '-1' } }, label),
    ),
  );
  const address = h(
    'div',
    { className: 'ns-address' },
    h('span', { className: 'ns-address-label' }, BROWSER_WINDOW.addressLabel),
    h('span', { className: 'ns-address-field' }, BROWSER_WINDOW.address),
  );

  const pageRect = toContentRect(balance.page);
  const linkRect = balance.realLink;
  const realLink = h(
    'button',
    {
      className: 'ns-real-link',
      attrs: { type: 'button' },
      on: { click: () => onRealLink() },
    },
    DOWNLOAD_PAGE.realLink,
  );
  // Page-relative position, so the link lands exactly on adBalance.realLink in Screen pixels.
  place(realLink, {
    x: linkRect.x - balance.page.x,
    y: linkRect.y - balance.page.y,
    w: linkRect.w,
    h: linkRect.h,
  });
  const started = h('div', { className: 'ns-started', attrs: { hidden: '' } }, DOWNLOAD_PAGE.started);
  place(started, {
    x: 0,
    y: linkRect.y - balance.page.y,
    w: balance.page.w,
    h: linkRect.h,
  });
  const panelSlot = h('div', { className: 'ns-panel-slot' });
  const page = h(
    'div',
    { className: 'ns-page' },
    h('h1', { className: 'ns-heading' }, DOWNLOAD_PAGE.heading),
    h('p', { className: 'ns-intro' }, DOWNLOAD_PAGE.intro),
    h('p', { className: 'ns-file' }, DOWNLOAD_PAGE.file),
    realLink,
    started,
    panelSlot,
    h('p', { className: 'ns-footer' }, DOWNLOAD_PAGE.footer),
  );
  place(page, pageRect);

  const statusText = h('span', { className: 'ns-status-text' }, BROWSER_WINDOW.statusReady);
  const status = h('div', { className: 'ns-status' }, statusText);
  const root = h('div', { className: 'ns-content' }, toolbar, address, page, status);

  return {
    root,
    page,
    realLink,
    panelSlot,
    setStatus(text) {
      const next = text ?? BROWSER_WINDOW.statusReady;
      if (statusText.textContent !== next) statusText.textContent = next;
    },
    showStarted() {
      realLink.hidden = true;
      started.hidden = false;
    },
  };
}
