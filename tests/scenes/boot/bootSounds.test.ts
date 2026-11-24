import { describe, expect, it } from 'vitest';
import type { SoundRecipe } from '../../../src/core/audio';
import { BOOT_SCRIPT } from '../../../src/scenes/boot/bootScript';
import {
  BOOT_SOUND_SEC,
  BOOT_SOUNDS,
  crtThunk,
  diskSeek,
  postBeep,
  startupChime,
} from '../../../src/scenes/boot/bootSounds';
import {
  createFakeAudioContext,
  FakeAudioParam,
  FakeBiquadFilterNode,
  FakeGainNode,
  FakeOscillatorNode,
  type FakeAudioContext,
  type FakeAudioNode,
  type FakeNodeKind,
} from '../../helpers/audio';

const AT = 1.25;

interface Case {
  readonly name: keyof typeof BOOT_SOUND_SEC;
  readonly recipe: SoundRecipe;
  readonly kinds: Partial<Record<FakeNodeKind, number>>;
}

const CASES: readonly Case[] = [
  { name: 'crtThunk', recipe: crtThunk, kinds: { bufferSource: 1, oscillator: 1, biquadFilter: 1, gain: 3 } },
  { name: 'postBeep', recipe: postBeep, kinds: { oscillator: 1, gain: 1 } },
  { name: 'diskSeek', recipe: diskSeek, kinds: { bufferSource: 1, biquadFilter: 1, gain: 2 } },
  { name: 'startupChime', recipe: startupChime, kinds: { oscillator: 7, biquadFilter: 1, gain: 6 } },
];

function play(recipe: SoundRecipe, durationSec: number, sampleRate = 44100) {
  const ac = createFakeAudioContext({ state: 'running', currentTime: AT, sampleRate });
  const stop = recipe(ac.asAudioContext(), ac.asDestination(), AT, durationSec);
  return { ac, stop };
}

function kindCounts(ac: FakeAudioContext): Partial<Record<FakeNodeKind, number>> {
  const counts: Partial<Record<FakeNodeKind, number>> = {};
  for (const n of ac.nodes) counts[n.kind] = (counts[n.kind] ?? 0) + 1;
  return counts;
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

/** The single gain the recipe connects to its `out` node. */
function outputGain(ac: FakeAudioContext): FakeGainNode {
  const outs = ac.nodes.filter((n) => n.outputs.includes(ac.destination));
  expect(outs).toHaveLength(1);
  expect(outs[0]).toBeInstanceOf(FakeGainNode);
  return outs[0] as FakeGainNode;
}

describe.each(CASES)('$name', ({ name, recipe, kinds }) => {
  const d = BOOT_SOUND_SEC[name];

  it('creates the expected node types and routes every source to the output', () => {
    const { ac } = play(recipe, d);
    expect(kindCounts(ac)).toEqual(kinds);
    for (const s of ac.sources()) {
      expect(s.startTimes).toHaveLength(1);
      expect(s.reaches(ac.destination)).toBe(true);
    }
  });

  it.each([d, 0.05, 4])('schedules everything inside [at, at + %s]', (duration) => {
    const { ac } = play(recipe, duration);
    const times = scheduledTimes(ac);
    expect(times.length).toBeGreaterThan(0);
    for (const t of times) {
      expect(t).toBeGreaterThanOrEqual(AT);
      expect(t).toBeLessThanOrEqual(AT + duration + 1e-9);
    }
    // Sources end on their own at the end of the window.
    for (const s of ac.sources()) expect(s.stopTimes).toEqual([AT + duration]);
  });

  it('fades the output in from 0 and back to 0 at the end, with gains within [0, 1]', () => {
    const { ac } = play(recipe, d);
    const events = outputGain(ac).gain.events.filter((e) => 'time' in e);
    const first = events[0];
    const last = events[events.length - 1];
    expect(first).toMatchObject({ value: 0, time: AT });
    expect(last).toMatchObject({ value: 0, time: AT + d });
    for (const gain of ac.gains) {
      for (const v of gain.gain.valuesSet()) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });

  it('returns a stop function that stops and disconnects every node, and is safe to repeat', () => {
    const { ac, stop } = play(recipe, d);
    ac.advance(d / 3);
    stop();
    expect(ac.unstopped()).toEqual([]);
    for (const s of ac.sources()) expect(s.stopTimes[s.stopTimes.length - 1]).toBe(ac.currentTime);
    for (const n of ac.nodes) {
      expect(n.outputs).toEqual([]);
      expect(n.disconnectCount).toBeGreaterThan(0);
    }
    expect(ac.destination.inputs).toEqual([]);
    expect(() => stop()).not.toThrow();
  });

  it('disconnects its nodes once every source has ended on its own', () => {
    const { ac, stop } = play(recipe, d);
    const sources = ac.sources();
    sources.slice(0, -1).forEach((s) => s.end());
    expect(ac.destination.inputs).toHaveLength(1);
    sources[sources.length - 1]?.end();
    for (const n of ac.nodes) expect(n.outputs).toEqual([]);
    expect(() => stop()).not.toThrow();
  });

  it('falls back to its natural length for a non-finite duration', () => {
    const { ac } = play(recipe, Number.POSITIVE_INFINITY);
    for (const s of ac.sources()) expect(s.stopTimes).toEqual([AT + d]);
  });
});

describe('noise', () => {
  it('is generated in code, deterministic and within [-1, 1)', () => {
    const a = play(crtThunk, BOOT_SOUND_SEC.crtThunk).ac;
    const b = play(crtThunk, BOOT_SOUND_SEC.crtThunk).ac;
    const data = a.buffers[0]?.getChannelData(0);
    expect(data).toBeDefined();
    expect(data?.length).toBe(Math.ceil(44100 * BOOT_SOUND_SEC.crtThunk));
    expect(Array.from(data ?? [])).toEqual(Array.from(b.buffers[0]?.getChannelData(0) ?? []));
    let min = Infinity;
    let max = -Infinity;
    for (const v of data ?? []) {
      min = Math.min(min, v);
      max = Math.max(max, v);
    }
    expect(min).toBeGreaterThanOrEqual(-1);
    expect(max).toBeLessThan(1);
    expect(max - min).toBeGreaterThan(1.5);
    expect(a.bufferSources[0]?.buffer).toBe(a.buffers[0]);
  });

  it('loops a capped buffer for long sounds and follows the context sample rate', () => {
    const { ac } = play(diskSeek, 5, 22050);
    expect(ac.buffers[0]?.length).toBe(22050 * 2);
    expect(ac.bufferSources[0]?.loop).toBe(true);
  });
});

describe('timbre', () => {
  it('crtThunk low-passes the noise and sweeps it down', () => {
    const { ac } = play(crtThunk, BOOT_SOUND_SEC.crtThunk);
    const filter = ac.filters[0] as FakeBiquadFilterNode;
    expect(filter.type).toBe('lowpass');
    const hz = filter.frequency.valuesSet();
    expect(hz[0]).toBeGreaterThan(hz[hz.length - 1] ?? Infinity);
  });

  it('postBeep is a 1000 Hz square wave', () => {
    const { ac } = play(postBeep, BOOT_SOUND_SEC.postBeep);
    const osc = ac.oscillators[0] as FakeOscillatorNode;
    expect(osc.type).toBe('square');
    expect(osc.frequency.valuesSet()).toEqual([1000]);
  });

  it('diskSeek band-passes noise into three clicks', () => {
    const { ac } = play(diskSeek, BOOT_SOUND_SEC.diskSeek);
    expect((ac.filters[0] as FakeBiquadFilterNode).type).toBe('bandpass');
    const clickGain = ac.gains.find((g) => g.inputs.includes(ac.filters[0] as FakeBiquadFilterNode));
    const peaks = clickGain?.gain.events.filter((e) => e.type === 'linearRampToValueAtTime') ?? [];
    expect(peaks).toHaveLength(3);
  });

  it('startupChime plays four A-minor notes in order on triangles over a detuned triangle pad', () => {
    const { ac } = play(startupChime, BOOT_SOUND_SEC.startupChime);
    expect(ac.oscillators.every((o) => o.type === 'triangle')).toBe(true);
    const melody = ac.oscillators.filter((o) => o.detune.events.length === 0);
    const pad = ac.oscillators.filter((o) => o.detune.events.length > 0);
    expect(melody).toHaveLength(4);
    expect(pad.length).toBeGreaterThanOrEqual(2);
    expect(pad.every((o) => o.detune.value !== 0)).toBe(true);

    // Every pitch is an A, C or E (pitch classes 9, 0, 4 with C = 0).
    for (const o of ac.oscillators) {
      const hz = o.frequency.valuesSet()[0] ?? 0;
      const pitchClass = (((Math.round(12 * Math.log2(hz / 440)) + 9) % 12) + 12) % 12;
      expect([9, 0, 4]).toContain(pitchClass);
    }
    const onsets = melody.map((o) => o.startTimes[0] ?? 0);
    expect(onsets).toEqual([...onsets].sort((a, b) => a - b));
    expect(new Set(onsets).size).toBe(4);
  });
});

describe('BOOT_SOUNDS', () => {
  it('has a named recipe for every boot cue', () => {
    for (const cue of BOOT_SCRIPT.cues) {
      const recipe = BOOT_SOUNDS[cue.sound];
      expect(recipe.name).toBe(cue.sound);
      expect(BOOT_SOUND_SEC[cue.sound]).toBeGreaterThan(0);
    }
  });
});
