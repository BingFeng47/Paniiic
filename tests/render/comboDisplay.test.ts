// Combo display on the CCTV OSD (pacing-and-economy Req 5.5).
import { describe, expect, it } from 'vitest';
import { COMBO_SHOW_TICKS, comboTextAt, latestCombo } from '../../src/render/comboDisplay';
import type { GameEvent } from '../../src/game/types';

const combo = (count: number): GameEvent => ({ type: 'combo', count, tick: 0 });

describe('combo display', () => {
  it('shows "COMBO xN +1 KB" for 60 Ticks, then nothing', () => {
    expect(COMBO_SHOW_TICKS).toBe(60);
    const show = latestCombo(null, [combo(4)], 100);
    expect(show).toEqual({ count: 4, tick: 100 });
    expect(comboTextAt(show, 100, 1)).toBe('COMBO x4 +1 KB');
    expect(comboTextAt(show, 159, 1)).toBe('COMBO x4 +1 KB');
    expect(comboTextAt(show, 160, 1)).toBe('');
    expect(comboTextAt(null, 100, 1)).toBe('');
  });

  it('keeps the previous combo on frames without one and restarts the timer on a new one', () => {
    const first = latestCombo(null, [combo(3)], 10);
    expect(latestCombo(first, [], 20)).toBe(first);
    const next = latestCombo(first, [combo(4)], 50);
    expect(comboTextAt(next, 109, 1)).toBe('COMBO x4 +1 KB');
  });

  it('shows the longest chain when one frame holds several combo events', () => {
    expect(latestCombo(null, [combo(3), combo(5), combo(4)], 7)).toEqual({ count: 5, tick: 7 });
  });

  it('uses the bonus from the balance in use', () => {
    expect(comboTextAt({ count: 3, tick: 0 }, 0, 2)).toBe('COMBO x3 +2 KB');
  });
});
