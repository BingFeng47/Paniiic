/**
 * CCTV on-screen display (lane-cctv design, "OSD"): camera label, blinking REC, timestamp and a
 * status line. DOM only, `pointer-events: none` via the `.cctv-osd` class. Text is written through
 * `textContent`, and only when it changes.
 */
import { h } from '../../core/h';
import { LANE_COPY } from '../../ui/laneCopy';
import { cameraTimestamp } from './cctvTimestamp';
import { dropoutActive, recOn, startupActive, tearActive, type CctvState } from './cctvState';

export interface CctvOsdFrame {
  /** Run Tick of the frame being shown. */
  readonly tick: number;
  /** Combo line to show (pacing-and-economy Req 5.5), '' or omitted for none. */
  readonly combo?: string;
}

export interface CctvOsdOptions {
  /** Screen_Shake preference. When false, `.is-tearing` is never set (Req 8.2). */
  readonly shakeEnabled: boolean;
}

export interface CctvOsd {
  readonly el: HTMLDivElement;
  update(state: CctvOsdFrame, cctv: CctvState, opts: CctvOsdOptions): void;
  /** Feed cut: centred "NO SIGNAL", REC off, timestamp left as it was (juice Req 7.1). */
  cut(): void;
}

export function createCctvOsd(): CctvOsd {
  const copy = LANE_COPY.cctv;
  const label = h('span', { className: 'cctv-label' }, copy.label);
  const rec = h('span', { className: 'cctv-rec' }, copy.rec);
  const time = h('span', { className: 'cctv-time' });
  const status = h('span', { className: 'cctv-status' });
  const combo = h('span', { className: 'cctv-combo' });
  const el = h('div', { className: 'cctv-osd', attrs: { 'aria-hidden': 'true' } }, label, rec, time, status, combo);

  const setText = (node: HTMLElement, text: string): void => {
    if (node.textContent !== text) node.textContent = text;
  };

  return {
    el,
    update(state, cctv, opts) {
      const { tick } = state;
      rec.classList.toggle('is-on', recOn(tick));
      setText(time, cameraTimestamp(tick));
      const text = startupActive(cctv, tick)
        ? copy.connecting
        : dropoutActive(cctv, tick)
          ? copy.signalWeak
          : '';
      setText(status, text);
      setText(combo, state.combo ?? '');
      el.classList.toggle('is-tearing', opts.shakeEnabled && tearActive(cctv, tick));
    },
    cut() {
      rec.classList.remove('is-on');
      el.classList.remove('is-tearing');
      el.classList.add('is-no-signal');
      setText(status, copy.noSignal);
      setText(combo, '');
    },
  };
}
