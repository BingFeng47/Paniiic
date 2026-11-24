// Download speed right now (ad-pressure Req 2.4, 2.5, 3.2–3.4). Pure: step() stage 6 and the
// Download_Panel both call it, so the rate the player sees is the rate the simulation uses.

import type { GameState } from './types';

/**
 * Line_Quality: the share of full speed left after modem damage. It runs linearly from
 * `lineQualityFloor` at 0 integrity to exactly 1 at `maxIntegrity`. The integrity share is
 * clamped to [0, 1], so out-of-range integrity never pushes it outside [floor, 1].
 */
export function lineQuality(state: Pick<GameState, 'integrity' | 'balance'>): number {
  const { maxIntegrity, lineQualityFloor: f } = state.balance;
  const share = Math.min(1, Math.max(0, state.integrity / maxIntegrity));
  return f + (1 - f) * share;
}

/**
 * Download_Rate in percent per second: `downloadPercentPerSecond × Bandwidth_Factor ×
 * Line_Quality`. A missing `bandwidth` counts as 1, so core-only runs keep their timing.
 */
export function downloadRate(state: Pick<GameState, 'integrity' | 'balance' | 'bandwidth'>): number {
  return state.balance.downloadPercentPerSecond * (state.bandwidth ?? 1) * lineQuality(state);
}
