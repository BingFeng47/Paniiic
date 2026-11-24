// Bandwidth (ad-pressure Req 2): every open clutter Ad eats a share of the download speed, down
// to a floor. Fake_Buttons and Interrupters don't count; Interrupters already pause the download
// (Req 2.3). Pure: reads only the Ad_State and its balance.
import type { System } from '../context';
import type { AdState } from './adTypes';

/** Bandwidth_Factor for this Ad_State: `max(bandwidthFloor, 1 − bandwidthPerClutter × n)`. */
export function bandwidthFor(ads: AdState): number {
  const n = ads.ads.filter((a) => a.kind === 'clutter').length;
  const b = ads.balance;
  return Math.max(b.bandwidthFloor, 1 - b.bandwidthPerClutter * n);
}

/**
 * Writes `draft.bandwidth` from the open clutter Ads (Req 2.2). It runs last among the
 * Game_Systems, so it counts clutter after this Tick's closes, openings and blocks. Before the ad
 * systems have run there is no Ad_State and the field stays absent (treated as 1).
 */
export const bandwidthSystem: System = (draft) => {
  if (draft.ads !== undefined) draft.bandwidth = bandwidthFor(draft.ads);
};
