import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { SoundRecipe } from '../../src/core/audio';
import { DIAL_STAGES, type DialSoundId } from '../../src/dialup/dialScript';
import {
  dialTone,
  dtmf,
  handshake,
  handshakePlan,
  MODEM_SOUND_SEC,
  MODEM_SOUNDS,
  ringback,
} from '../../src/dialup/modemSounds';
import {
  createFakeAudioContext,
  FakeAudioParam,
  type FakeAudioContext,
  type FakeAudioNode,
  type FakeOscillatorNode,
} from '../helpers/audio';

type ModemSoundKey = keyof typeof MODEM_SOUNDS;

// Type-level: MODEM_SOUNDS has exactly the dial stage sound ids plus 'relayClick'.
type ExpectedKey = Exclude<DialSoundId, null> | 'relayClick';
const keysMatch: [ExpectedKey] extends [ModemSoundKey]
  ? [ModemSoundKey] extends [ExpectedKey]
    ? true
    : false
  : false = true;

const AT = 1.25;
const SOUND_IDS = Object.keys(MODEM_SOUNDS) as ModemSoundKey[];

function play(recipe: SoundRecipe, durationSec: number) {
  const ac = createFakeAudioContext({ state: 'running', currentTime: AT });
  const stop = recipe(ac.asAudioContext(), ac.asDestination(), AT, durationSec);
  return { ac, stop };
}

function params(node: FakeAudioNode): FakeAudioParam[] {
  return Object.values(node).filter((v): v is FakeAudioParam => v instanceof FakeAudioParam);
}

/** Every time used by any start, stop or automation call. */
function scheduledTimes(ac: FakeAudioContext): number[] {
  const times: number[] = [];
  for (const s of ac.sources()) times.push(...s.startTimes, ...s.stopTimes);
  for (const n of ac.nodes) {
    for (const p of params(n)) {
      for (const e of p.events) if ('time' in e) times.push(e.time);
    }
  }
  return times;
}

/** The first frequency each oscillator was given, in creation order. */
function firstFrequencies(oscillators: readonly FakeOscillatorNode[]): number[] {
  return oscillators.map((o) => o.frequency.valuesSet()[0] ?? Number.NaN);
}

describe('handshakePlan', () => {
  it('splits 10 s into answer tone, FSK, probe and training', () => {
    expect(handshakePlan(10)).toEqual([
      { kind: 'answerTone', start: 0, end: 2.5 },
      { kind: 'fsk', start: 2.5, end: 4.5 },
      { kind: 'probe', start: 4.5, end: 5.5 },
      { kind: 'training', start: 5.5, end: 10 },
    ]);
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'returns no segments for a duration of %s',
    (d) => {
      expect(handshakePlan(d)).toEqual([]);
    },
  );

  // Feature: retro-shell, Property 12: The handshake plan covers its duration in order
  // Property: Req 12.3 answer tone, FSK, probe and training are contiguous from 0 to the duration
  it('covers any duration in order with contiguous segments', () => {
    fc.assert(
      fc.property(fc.double({ min: 0.001, max: 60, noNaN: true }), (d) => {
        const plan = handshakePlan(d);
        expect(plan.map((s) => s.kind)).toEqual(['answerTone', 'fsk', 'probe', 'training']);
        expect(plan[0]?.start).toBe(0);
        expect(plan[plan.length - 1]?.end).toBe(d);
        plan.forEach((segment, i) => {
          expect(segment.start).toBeLessThan(segment.end);
          const next = plan[i + 1];
          if (next) expect(segment.end).toBe(next.start);
        });
      }),
      { numRuns: 200 },
    );
  });
});

describe('MODEM_SOUNDS', () => {
  it('has a recipe for every dial stage sound plus the relay click', () => {
    expect(keysMatch).toBe(true);
    const stageSounds = DIAL_STAGES.map((s) => s.sound).filter((s): s is Exclude<DialSoundId, null> => s !== null);
    for (const id of stageSounds) expect(MODEM_SOUNDS[id]).toBeTypeOf('function');
    expect(SOUND_IDS.sort()).toEqual([...new Set([...stageSounds, 'relayClick'])].sort());
  });

  it.each(SOUND_IDS)('%s schedules valid nodes and its stop function stops every started source', (id) => {
    const fake = createFakeAudioContext({ state: 'running', currentTime: 1 });
    const stop = MODEM_SOUNDS[id](fake.asAudioContext(), fake.asDestination(), 1, MODEM_SOUND_SEC[id]);
    expect(fake.sources().length).toBeGreaterThan(0);
    // A source is heard directly, or modulates a gain that is heard (the answer tone's wobble).
    const heardGains = fake.gains.filter((gain) => gain.reaches(fake.destination));
    const heard = (s: FakeAudioNode): boolean =>
      s.reaches(fake.destination) || heardGains.some((gain) => s.reaches(gain.gain));
    expect(fake.sources().every(heard)).toBe(true);
    stop();
    stop();
    expect(fake.nodes.every((n) => n.outputs.length === 0)).toBe(true);
  });

  describe.each(SOUND_IDS)('%s', (id) => {
    const recipe = MODEM_SOUNDS[id];
    const durations = [0.001, MODEM_SOUND_SEC[id], 60];

    it.each(durations)('keeps every scheduled time inside [at, at + %s s]', (d) => {
      const { ac } = play(recipe, d);
      const times = scheduledTimes(ac);
      expect(times.length).toBeGreaterThan(0);
      for (const t of times) {
        expect(t).toBeGreaterThanOrEqual(AT);
        expect(t).toBeLessThanOrEqual(AT + d);
      }
      // Every source starts and is scheduled to stop by the end.
      for (const s of ac.sources()) {
        expect(s.startTimes).toHaveLength(1);
        expect(s.stopTimes).toHaveLength(1);
      }
    });

    it.each(durations)('keeps every gain value within [0, 1] for %s s', (d) => {
      const { ac } = play(recipe, d);
      for (const g of ac.gains) {
        for (const v of g.gain.valuesSet()) {
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThanOrEqual(1);
        }
      }
    });

    it('stops every started source now, and a second stop does nothing', () => {
      const { ac, stop } = play(recipe, MODEM_SOUND_SEC[id]);
      ac.currentTime = AT + MODEM_SOUND_SEC[id] / 3;
      stop();
      for (const s of ac.sources()) {
        expect(s.started).toBe(true);
        expect(s.stopTimes[s.stopTimes.length - 1]).toBe(ac.currentTime);
      }
      expect(ac.nodes.every((n) => n.outputs.length === 0)).toBe(true);
      const stopCounts = ac.sources().map((s) => s.stopTimes.length);
      const disconnects = ac.nodes.map((n) => n.disconnectCount);
      stop();
      expect(ac.sources().map((s) => s.stopTimes.length)).toEqual(stopCounts);
      expect(ac.nodes.map((n) => n.disconnectCount)).toEqual(disconnects);
    });

    it('disconnects its graph once every source has ended on its own', () => {
      const { ac, stop } = play(recipe, MODEM_SOUND_SEC[id]);
      const sources = ac.sources();
      sources.slice(0, -1).forEach((s) => s.end());
      expect(ac.destination.inputs.length).toBe(1);
      sources[sources.length - 1]?.end();
      expect(ac.nodes.every((n) => n.outputs.length === 0)).toBe(true);
      // Stopping after the natural end is safe and does not disconnect again.
      const disconnects = ac.nodes.map((n) => n.disconnectCount);
      expect(() => stop()).not.toThrow();
      expect(ac.nodes.map((n) => n.disconnectCount)).toEqual(disconnects);
    });
  });
});

describe('call progress recipes (Req 12.2)', () => {
  it('dialTone plays 350 and 440 Hz sines', () => {
    const { ac } = play(dialTone, MODEM_SOUND_SEC.dialTone);
    expect(firstFrequencies(ac.oscillators).sort((a, b) => a - b)).toEqual([350, 440]);
    expect(ac.oscillators.every((o) => o.type === 'sine')).toBe(true);
  });

  it('dtmf plays the row and column pair of each digit of 5550199, in order', () => {
    const d = MODEM_SOUND_SEC.dtmf;
    const { ac } = play(dtmf, d);
    const pairs: ReadonlyArray<readonly [number, number]> = [
      [770, 1336], // 5
      [770, 1336], // 5
      [770, 1336], // 5
      [941, 1336], // 0
      [697, 1209], // 1
      [852, 1477], // 9
      [852, 1477], // 9
    ];
    expect(firstFrequencies(ac.oscillators)).toEqual(pairs.flat());
    // Each digit's two tones start together, and the digits are spread across the stage.
    const starts = ac.oscillators.map((o) => o.startTimes[0] ?? Number.NaN);
    for (let i = 0; i < pairs.length; i += 1) {
      expect(starts[2 * i]).toBe(starts[2 * i + 1]);
      if (i > 0) expect(starts[2 * i]).toBeGreaterThan(starts[2 * i - 2] ?? Infinity);
    }
    expect(starts[starts.length - 1]).toBeGreaterThan(AT + d / 2);
  });

  it('ringback plays 440 and 480 Hz sines', () => {
    const { ac } = play(ringback, MODEM_SOUND_SEC.ringback);
    expect(firstFrequencies(ac.oscillators).sort((a, b) => a - b)).toEqual([440, 480]);
    expect(ac.oscillators.every((o) => o.type === 'sine')).toBe(true);
  });
});

describe('handshake recipe (Req 12.3)', () => {
  const d = MODEM_SOUND_SEC.handshake;

  it('starts with a 2100 Hz answer tone that dips for phase reversals', () => {
    const { ac } = play(handshake, d);
    const answer = ac.oscillators.find((o) => o.frequency.valuesSet()[0] === 2100);
    expect(answer).toBeDefined();
    expect(answer?.startTimes).toEqual([AT]);
    // A gain on the answer tone's path drops below full level several times.
    const dipGain = ac.gains.find((g) => answer?.reaches(g) && g.gain.valuesSet().some((v) => v > 0 && v < 0.5));
    const dips = dipGain?.gain.valuesSet().filter((v) => v > 0 && v < 0.5) ?? [];
    expect(dips.length).toBeGreaterThanOrEqual(3);
  });

  it('plays FSK chirps, then the probe chord, then band-passed noise training', () => {
    const { ac } = play(handshake, d);
    const plan = handshakePlan(d);
    const at = (kind: string): number => AT + (plan.find((s) => s.kind === kind)?.start ?? Number.NaN);

    const fsk = ac.oscillators.find((o) => o.type === 'square');
    expect(fsk?.startTimes).toEqual([at('fsk')]);
    const fskHz = new Set(fsk?.frequency.valuesSet());
    expect([...fskHz].sort((a, b) => a - b)).toEqual([980, 1180, 1650, 1850]);

    const probe = ac.oscillators.filter((o) => o.startTimes[0] === at('probe'));
    expect(firstFrequencies(probe)).toEqual(Array.from({ length: 25 }, (_, i) => 150 * (i + 1)));

    const noise = ac.bufferSources.find((s) => s.startTimes[0] === at('training'));
    const bandpass = ac.filters.find((f) => f.type === 'bandpass');
    if (!noise || !bandpass) throw new Error('training needs a noise source and a band-pass filter');
    expect(bandpass.frequency.valuesSet()[0]).toBe(1800);
    expect(noise.reaches(bandpass)).toBe(true);
    expect(bandpass.reaches(ac.destination)).toBe(true);
  });
});
