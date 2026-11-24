// Theme_Song recipe on the fake Web Audio context (Req 3.4, 3.8).
import { describe, expect, it } from 'vitest';
import { THEME_PASS_SEC, themeSong } from '../../../src/scenes/title/themeSong';
import { THEME_SCORE, themeSchedule, type ThemeInstrument } from '../../../src/scenes/title/themeScore';
import { createFakeAudioContext } from '../../helpers/audio';

const AT = 3;
const EPS = 1e-9;

function play(durationSec: number) {
  const ac = createFakeAudioContext({ state: 'running', currentTime: AT });
  const stop = themeSong(ac.asAudioContext(), ac.asDestination(), AT, durationSec);
  return { ac, stop };
}

/** Oscillators each instrument creates per note, in creation order, from the synthesis table. */
const OSCILLATORS: Readonly<Record<ThemeInstrument, readonly OscillatorType[]>> = {
  bass: ['triangle'],
  pad: ['sawtooth', 'sawtooth'],
  bell: ['sine', 'sine'], // fundamental, 2.76 × partial
  lead: ['sine', 'sine'], // voice, vibrato LFO
};

describe('themeSong', () => {
  it('plays one 24 s pass by default', () => {
    expect(THEME_PASS_SEC).toBe(24);
  });

  it('creates nodes and stops every source by at + d', () => {
    const d = THEME_PASS_SEC;
    const { ac } = play(d);
    expect(ac.nodes.length).toBeGreaterThan(0);
    expect(ac.sources().length).toBeGreaterThan(0);
    for (const s of ac.sources()) {
      expect(s.startTimes).toHaveLength(1);
      expect(s.stopTimes).toHaveLength(1);
      expect(s.startTimes[0]).toBeGreaterThanOrEqual(AT);
      expect(s.stopTimes[0]).toBeLessThanOrEqual(AT + d + EPS);
    }
  });

  it('with d = 5 starts no source at or after at + 5 and stops every source by then', () => {
    const d = 5;
    const { ac } = play(d);
    expect(ac.sources().length).toBeGreaterThan(0);
    expect(ac.sources().length).toBeLessThan(play(THEME_PASS_SEC).ac.sources().length);
    for (const s of ac.sources()) {
      expect(s.startTimes[0]).toBeGreaterThanOrEqual(AT);
      expect(s.startTimes[0]).toBeLessThan(AT + d);
      expect(s.stopTimes[0]).toBeLessThanOrEqual(AT + d + EPS);
    }
  });

  it('survives a double stop and leaves nothing playing or connected', () => {
    const { ac, stop } = play(THEME_PASS_SEC);
    stop();
    expect(ac.unstopped()).toEqual([]);
    const disconnects = ac.nodes.map((n) => n.disconnectCount);
    expect(disconnects.every((c) => c > 0)).toBe(true);
    expect(() => stop()).not.toThrow();
    expect(ac.nodes.map((n) => n.disconnectCount)).toEqual(disconnects);
    expect(ac.destination.inputs).toEqual([]);
  });

  it.each([THEME_PASS_SEC, 5])('uses triangle, sawtooth and sine oscillators per instrument for d = %s', (d) => {
    const { ac } = play(d);
    const notes = themeSchedule(THEME_SCORE, d);
    const expected = notes.flatMap((n) => OSCILLATORS[n.instrument]);
    expect(ac.oscillators.map((o) => o.type)).toEqual(expected);
    expect(new Set(ac.oscillators.map((o) => o.type))).toEqual(
      new Set<OscillatorType>(['triangle', 'sawtooth', 'sine']),
    );

    // The first oscillator of every note sounds the note's pitch from the note's start.
    let i = 0;
    for (const n of notes) {
      const first = ac.oscillators[i];
      expect(first?.frequency.valuesSet()[0]).toBeCloseTo(n.hz, 6);
      expect(first?.startTimes[0]).toBeCloseTo(AT + n.start, 9);
      i += OSCILLATORS[n.instrument].length;
    }
  });

  it('synthesizes everything from oscillators, with no noise buffers (Req 3.8)', () => {
    const { ac } = play(THEME_PASS_SEC);
    expect(ac.bufferSources).toEqual([]);
    expect(ac.buffers).toEqual([]);
  });
});
