// Combo blip (pacing-and-economy Req 5.5).
import { describe, expect, it } from 'vitest';
import { COMBO_BLIP_SEC, comboBlip, comboBlipCount, comboBlipHz } from '../../src/render/economySounds';
import type { GameEvent } from '../../src/game/types';
import { createFakeAudioContext } from '../helpers/audio';

describe('combo blip', () => {
  it('rises one semitone per kill from 440 Hz and stops rising at N = 10', () => {
    expect(comboBlipHz(0)).toBe(440);
    expect(comboBlipHz(3)).toBeCloseTo(440 * 2 ** (3 / 12), 9);
    expect(comboBlipHz(10)).toBeCloseTo(440 * 2 ** (10 / 12), 9);
    expect(comboBlipHz(11)).toBe(comboBlipHz(10));
    expect(comboBlipHz(50)).toBe(comboBlipHz(10));
  });

  it('is a single square oscillator at the pitch for N', () => {
    const ac = createFakeAudioContext({ state: 'running', currentTime: 1 });
    comboBlip(4)(ac.asAudioContext(), ac.asDestination(), 1, COMBO_BLIP_SEC);
    expect(ac.oscillators.map((o) => [o.type, o.frequency.valuesSet()[0]])).toEqual([['square', comboBlipHz(4)]]);
  });

  it('picks the longest chain of the frame, or null without a combo', () => {
    const events: GameEvent[] = [
      { type: 'combo', count: 3, tick: 0 },
      { type: 'combo', count: 6, tick: 0 },
    ];
    expect(comboBlipCount(events)).toBe(6);
    expect(comboBlipCount([])).toBeNull();
  });
});
