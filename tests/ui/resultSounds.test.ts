// Result_Sounds recipes on the fake Web Audio context (Req 9.1, 10.1, 12.6).
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  RESULT_SOUND_SEC,
  RESULT_SOUNDS,
  resultSoundsFor,
  staticHiss,
  type ResultSoundId,
} from '../../src/ui/resultSounds';
import { createFakeAudioContext } from '../helpers/audio';

const AT = 2;
const EPS = 1e-9;
const IDS = Object.keys(RESULT_SOUNDS) as ResultSoundId[];

function play(id: ResultSoundId, durationSec: number = RESULT_SOUND_SEC[id]) {
  const ac = createFakeAudioContext({ state: 'running', currentTime: AT });
  const stop = RESULT_SOUNDS[id](ac.asAudioContext(), ac.asDestination(), AT, durationSec);
  return { ac, stop };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('resultSoundsFor', () => {
  it('plays the handshake chime for a win (Req 9.1)', () => {
    expect(resultSoundsFor('won')).toEqual(['handshakeChime']);
  });

  it('plays the modem screech and the static hiss for a loss (Req 10.1)', () => {
    expect(resultSoundsFor('lost')).toEqual(['modemScreech', 'staticHiss']);
  });

  it('only names recipes that exist', () => {
    for (const id of [...resultSoundsFor('won'), ...resultSoundsFor('lost')]) {
      expect(typeof RESULT_SOUNDS[id]).toBe('function');
    }
  });

  it('gives the natural lengths 1.6, 1.2 and 1.5 s', () => {
    expect(RESULT_SOUND_SEC).toEqual({ handshakeChime: 1.6, modemScreech: 1.2, staticHiss: 1.5 });
  });
});

describe.each(IDS)('%s', (id) => {
  it.each([RESULT_SOUND_SEC[id], 0.5])('creates nodes and stops every source by at + d for d = %s', (d) => {
    const { ac } = play(id, d);
    expect(ac.nodes.length).toBeGreaterThan(0);
    expect(ac.sources().length).toBeGreaterThan(0);
    for (const s of ac.sources()) {
      expect(s.startTimes).toHaveLength(1);
      expect(s.stopTimes).toHaveLength(1);
      expect(s.startTimes[0]).toBeGreaterThanOrEqual(AT);
      expect(s.startTimes[0]).toBeLessThan(AT + d);
      expect(s.stopTimes[0]).toBeLessThanOrEqual(AT + d + EPS);
    }
  });

  it('survives a double stop and leaves nothing playing or connected', () => {
    const { ac, stop } = play(id);
    stop();
    expect(ac.unstopped()).toEqual([]);
    const disconnects = ac.nodes.map((n) => n.disconnectCount);
    expect(disconnects.every((c) => c > 0)).toBe(true);
    expect(() => stop()).not.toThrow();
    expect(ac.nodes.map((n) => n.disconnectCount)).toEqual(disconnects);
    expect(ac.destination.inputs).toEqual([]);
  });

  it('is synthesized in code without Math.random (Req 12.6)', () => {
    const random = vi.spyOn(Math, 'random');
    play(id);
    expect(random).not.toHaveBeenCalled();
  });
});

describe('staticHiss', () => {
  it('is seeded: two runs schedule the same gain values and the same noise', () => {
    const a = play('staticHiss').ac;
    const b = play('staticHiss').ac;
    expect(a.gains.length).toBeGreaterThan(0);
    expect(a.gains.map((g) => g.gain.events)).toEqual(b.gains.map((g) => g.gain.events));
    expect(a.buffers.length).toBeGreaterThan(0);
    expect(a.buffers.map((buf) => Array.from(buf.getChannelData(0)))).toEqual(
      b.buffers.map((buf) => Array.from(buf.getChannelData(0))),
    );
  });

  it('jumps its crackle level every 30 ms inside its window', () => {
    const ac = createFakeAudioContext({ state: 'running', currentTime: AT });
    const d = RESULT_SOUND_SEC.staticHiss;
    staticHiss(ac.asAudioContext(), ac.asDestination(), AT, d);
    // The crackle gain is the one with many level jumps.
    const crackle = ac.gains.reduce((best, g) => (g.gain.events.length > best.gain.events.length ? g : best));
    const jumps = crackle.gain.events.filter((e) => e.type === 'setValueAtTime');
    expect(jumps.length).toBeGreaterThan(d / 0.03 - 1);
    const levels = new Set(jumps.slice(0, -1).map((e) => ('value' in e ? e.value : NaN)));
    expect(levels.size).toBeGreaterThan(1);
    for (const e of jumps) {
      if (!('time' in e)) continue;
      expect(e.time).toBeGreaterThanOrEqual(AT);
      expect(e.time).toBeLessThanOrEqual(AT + d + EPS);
    }
  });
});
