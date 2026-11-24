/**
 * Download_Panel (Req 6.1–6.5; ad-pressure Req 7.1, 7.4). `downloadView` is pure; the DOM writes
 * `textContent` only when a value changes. The 30-Tick penalty window is tracked by the caller via
 * `setPenalty`. The shown rate comes from `downloadRate(state)`, the helper `step()` uses, so the
 * panel never re-derives the bandwidth or line quality rules.
 */
import { h } from '../../core/h';
import { clutterCount } from '../../game/ads/openAd';
import { downloadRate, lineQuality } from '../../game/downloadRate';
import type { GameState } from '../../game/types';
import { DOWNLOAD_PANEL } from '../../ui/browserCopy';

/** Size of HOMEWORK.ZIP in KB, used for the shown transfer rate. */
export const FILE_KB = 2048;

export interface DownloadView {
  readonly percent: number;
  /** 0..1 */
  readonly fraction: number;
  readonly waiting: boolean;
  readonly rateText: string;
  /** "m:ss", or the waiting text while paused. */
  readonly timeLeftText: string;
  /** Why the rate is below full speed, or '' at full speed (ad-pressure Req 7.1). */
  readonly causeText: string;
}

/** The state fields `downloadRate` and the cause line need. */
export type DownloadViewInput = Pick<
  GameState,
  'download' | 'pauseSources' | 'integrity' | 'bandwidth' | 'balance' | 'ads'
>;

/**
 * Cause line: the open clutter count when the Bandwidth_Factor is below 1, line noise when
 * Line_Quality is below 1, both joined when both apply, and '' at full speed. It reads the same
 * `bandwidth` field `downloadRate` reads, so the cause always matches the shown rate.
 */
export function causeText(state: DownloadViewInput): string {
  const clutter = state.ads ? clutterCount(state.ads) : 0;
  const parts: string[] = [];
  if (clutter > 0 && (state.bandwidth ?? 1) < 1) parts.push(DOWNLOAD_PANEL.causeAds(clutter));
  if (lineQuality(state) < 1) parts.push(DOWNLOAD_PANEL.causeLine);
  return parts.join(' ');
}

export function downloadView(state: DownloadViewInput): DownloadView {
  const download = Math.min(100, Math.max(0, state.download));
  const ratePct = downloadRate(state);
  const waiting = state.pauseSources.length > 0;
  const rateKb = Math.round(((FILE_KB * ratePct) / 100) * 10) / 10;
  return {
    percent: Math.floor(download),
    fraction: download / 100,
    waiting,
    rateText: DOWNLOAD_PANEL.rate(waiting ? 0 : rateKb),
    timeLeftText: waiting
      ? DOWNLOAD_PANEL.waiting
      : DOWNLOAD_PANEL.timeLeft(ratePct > 0 ? Math.ceil((100 - download) / ratePct) : 0),
    causeText: causeText(state),
  };
}

export interface DownloadPanel {
  readonly root: HTMLElement;
  update(state: DownloadViewInput): void;
  setPenalty(on: boolean): void;
}

export function createDownloadPanel(): DownloadPanel {
  const percent = h('span', { className: 'dl-percent' });
  const fill = h('div', { className: 'dl-fill' });
  const bar = h('div', { className: 'dl-bar' }, fill);
  const rate = h('span', { className: 'dl-rate' });
  const timeLeft = h('span', { className: 'dl-time' });
  const cause = h('div', { className: 'dl-cause' });
  cause.hidden = true;
  const root = h(
    'div',
    { className: 'dl-panel' },
    h('div', { className: 'dl-title' }, DOWNLOAD_PANEL.title),
    h('div', { className: 'dl-saving' }, DOWNLOAD_PANEL.savingTo),
    h('div', { className: 'dl-bar-row' }, bar, percent),
    h('div', { className: 'dl-row' }, h('span', null, DOWNLOAD_PANEL.rateLabel), ' ', rate),
    h('div', { className: 'dl-row' }, h('span', null, DOWNLOAD_PANEL.timeLeftLabel), ' ', timeLeft),
    cause,
  );
  const setText = (el: HTMLElement, text: string): void => {
    if (el.textContent !== text) el.textContent = text;
  };
  let lastWidth = '';
  return {
    root,
    update(state) {
      const v = downloadView(state);
      setText(percent, DOWNLOAD_PANEL.percent(v.percent));
      setText(rate, v.rateText);
      setText(timeLeft, v.timeLeftText);
      setText(cause, v.causeText);
      const noCause = v.causeText === '';
      if (cause.hidden !== noCause) cause.hidden = noCause;
      const width = `${(v.fraction * 100).toFixed(2)}%`;
      if (width !== lastWidth) {
        fill.style.width = width;
        lastWidth = width;
      }
      root.classList.toggle('is-waiting', v.waiting);
    },
    setPenalty(on) {
      root.classList.toggle('is-penalty', on);
    },
  };
}
