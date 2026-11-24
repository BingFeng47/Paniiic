import { h } from '../core/h';
import type { GameState } from '../game/types';
import { LANE_COPY } from './laneCopy';

export interface IntegrityView {
  /** integrity / max, clamped to [0, 1]. */
  readonly fraction: number;
  /** Whole-number percentage plus suffix, e.g. "73%". Rounded up, so "0%" shows only at 0. */
  readonly percentText: string;
  /** True while integrity is at or below the run's critical integrity. */
  readonly critical: boolean;
}

/** Pure HUD numbers for a state (Req 12.1–12.3). */
export function integrityView(state: GameState): IntegrityView {
  const { maxIntegrity, criticalIntegrity } = state.balance;
  const integrity = Math.min(Math.max(state.integrity, 0), maxIntegrity);
  // integrity * 100 / max rather than fraction * 100: for integer inputs the division is exact,
  // so ceil never rounds 7/100 up to 8 through float error.
  const percent = Math.ceil((integrity * 100) / maxIntegrity);
  return {
    fraction: integrity / maxIntegrity,
    percentText: `${percent}${LANE_COPY.percentSuffix}`,
    critical: state.integrity <= criticalIntegrity,
  };
}

export interface LaneHud {
  readonly el: HTMLElement;
  update(state: GameState): void;
}

/**
 * Builds `div.lane-hud > span.lane-hud-label + div.lane-hud-bar > div.lane-hud-fill +
 * span.lane-hud-value + span.lane-hud-note`. `update` touches the DOM only when a value changes
 * and writes text only through `textContent` (Req 12.4). It holds no listeners or timers.
 */
export function createLaneHud(): LaneHud {
  const fill = h('div', { className: 'lane-hud-fill' });
  const bar = h('div', { className: 'lane-hud-bar', attrs: { 'aria-hidden': 'true' } }, fill);
  const value = h('span', { className: 'lane-hud-value' });
  const note = h('span', { className: 'lane-hud-note', attrs: { 'aria-live': 'polite' } });
  const el = h(
    'div',
    { className: 'lane-hud' },
    h('span', { className: 'lane-hud-label' }, LANE_COPY.integrityLabel),
    bar,
    value,
    note,
  );

  let lastWidth: string | null = null;
  let lastPercent: string | null = null;
  let lastCritical: boolean | null = null;

  return {
    el,
    update(state) {
      const view = integrityView(state);

      const width = `${view.fraction * 100}%`;
      if (width !== lastWidth) {
        fill.style.width = width;
        lastWidth = width;
      }

      if (view.percentText !== lastPercent) {
        value.textContent = view.percentText;
        lastPercent = view.percentText;
      }

      if (view.critical !== lastCritical) {
        el.classList.toggle('is-critical', view.critical);
        note.textContent = view.critical ? LANE_COPY.criticalNote : '';
        lastCritical = view.critical;
      }
    },
  };
}
