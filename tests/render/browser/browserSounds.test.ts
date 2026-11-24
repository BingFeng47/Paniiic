import { describe, expect, it } from 'vitest';
import type { GameEvent } from '../../../src/game/types';
import { BROWSER_SOUND_SEC, browserSoundsFor, hatch } from '../../../src/render/browser/browserSounds';
import { createFakeAudioContext, FakeAudioParam, type FakeAudioContext } from '../../helpers/audio';

const AT = 2;

function times(ac: FakeAudioContext): number[] {
  const out: number[] = [];
  for (const s of ac.sources()) out.push(...s.startTimes, ...s.stopTimes);
  for (const n of ac.nodes) {
    for (const p of Object.values(n)) {
      if (p instanceof FakeAudioParam) for (const e of p.events) if ('time' in e) out.push(e.time);
    }
  }
  return out;
}

describe('browser sounds: hatch (ad-pressure Req 7.3)', () => {
  it('plays on adHatched', () => {
    const e: GameEvent = { type: 'adHatched', id: 4, mobId: 12, tick: 600 } as GameEvent;
    expect(browserSoundsFor([e])).toEqual(['hatch']);
  });

  it.each([BROWSER_SOUND_SEC.hatch, 0.01, 1.5])('is synthesized inside [at, at + %s] and stops cleanly', (d) => {
    const ac = createFakeAudioContext({ state: 'running', currentTime: AT });
    const stop = hatch(ac.asAudioContext(), ac.asDestination(), AT, d);
    // A creak oscillator and two groan oscillators, all sawtooth; no samples or buffers.
    expect(ac.oscillators.map((o) => o.type)).toEqual(['sawtooth', 'sawtooth', 'sawtooth']);
    expect(ac.sources().length).toBe(3);
    for (const t of times(ac)) {
      expect(t).toBeGreaterThanOrEqual(AT);
      expect(t).toBeLessThanOrEqual(AT + d + 1e-9);
    }
    for (const g of ac.gains) {
      for (const v of g.gain.valuesSet()) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
    stop();
    stop();
    expect(ac.unstopped()).toEqual([]);
    expect(ac.destination.inputs).toEqual([]);
  });
});
