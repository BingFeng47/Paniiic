/**
 * Combo display (pacing-and-economy Req 5.5): the Lane_View keeps the last `combo` event and the
 * Tick it arrived, and the CCTV OSD shows "COMBO xN +1 KB" for COMBO_SHOW_TICKS. Render-only:
 * these helpers read events and return new values; they never touch the game state.
 *
 * The text stays steady while it shows (no blinking), so it adds no flashes to the CCTV feed.
 */
import { LANE_COPY } from '../ui/laneCopy';
import type { GameEvent } from '../game/types';

/** 1 s at 60 Ticks per second. */
export const COMBO_SHOW_TICKS = 60;

export interface ComboShow {
  readonly count: number;
  /** Tick the `combo` event arrived. */
  readonly tick: number;
}

/**
 * The combo to show after this frame's events: the longest chain among this frame's `combo`
 * events (same-Tick kills can emit several), else the previous one unchanged.
 */
export function latestCombo(prev: ComboShow | null, events: readonly GameEvent[], tick: number): ComboShow | null {
  let count = -1;
  for (const e of events) if (e.type === 'combo' && e.count > count) count = e.count;
  return count < 0 ? prev : { count, tick };
}

/** OSD text at `tick`: the combo line for COMBO_SHOW_TICKS after it arrived, else ''. */
export function comboTextAt(show: ComboShow | null, tick: number, bonusKb: number): string {
  if (show === null) return '';
  const age = tick - show.tick;
  return age >= 0 && age < COMBO_SHOW_TICKS ? LANE_COPY.cctv.combo(show.count, bonusKb) : '';
}
