import { describe, expect, it } from 'vitest';
import { startFixedLoop } from '../../src/core/fixedLoop';
import {
  createFakeAudioContext,
  createFakeAudioEngine,
  FakeAudioBufferSourceNode,
  FakeOscillatorNode,
  type FakeSoundRecipe,
} from './audio';
import { fakeVisibility } from './dom';

/** A small recipe written against the real Web Audio types, as production recipes will be. */
const beep: FakeSoundRecipe = (ac, out, at, durationSec) => {
  const osc = ac.createOscillator();
  osc.type = 'square';
  osc.frequency.setValueAtTime(1000, at);
  const gain = ac.createGain();
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(0.3, at + 0.01);
  gain.gain.linearRampToValueAtTime(0, at + durationSec);
  osc.connect(gain).connect(out);
  osc.start(at);
  osc.stop(at + durationSec);
  return () => {
    osc.stop();
    osc.disconnect();
    gain.disconnect();
  };
};

const noise: FakeSoundRecipe = (ac, out, at, durationSec) => {
  const buffer = ac.createBuffer(1, Math.ceil(ac.sampleRate * durationSec), ac.sampleRate);
  buffer.getChannelData(0).fill(0.5);
  const src = ac.createBufferSource();
  src.buffer = buffer;
  const filter = ac.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 1800;
  filter.frequency.setTargetAtTime(2400, at, 0.5);
  src.connect(filter).connect(out);
  src.start(at);
  return () => src.stop();
};

describe('createFakeAudioContext', () => {
  it('records oscillators, gains, params, connections and start/stop of a recipe', () => {
    const fake = createFakeAudioContext({ currentTime: 2 });
    const stop = beep(fake.asAudioContext(), fake.asDestination(), fake.currentTime, 0.15);

    expect(fake.oscillators).toHaveLength(1);
    const [osc] = fake.oscillators;
    expect(osc?.type).toBe('square');
    expect(osc?.frequency.valuesSet()).toEqual([1000]);
    expect(osc?.startTimes).toEqual([2]);
    expect(osc?.stopTimes).toEqual([2.15]);
    const gain = fake.gains[0];
    expect(gain?.gain.events.map((e) => e.type)).toEqual([
      'setValueAtTime',
      'exponentialRampToValueAtTime',
      'linearRampToValueAtTime',
    ]);
    expect(gain?.gain.value).toBe(0);
    expect(osc?.reaches(fake.destination)).toBe(true);
    expect(fake.unstopped()).toEqual([]);

    stop();
    expect(osc?.outputs).toEqual([]);
    expect(fake.destination.inputs).toEqual([]);
    expect(gain?.disconnectCount).toBe(1);
  });

  it('records buffers, buffer sources and filters, and lists unstopped sources', () => {
    const fake = createFakeAudioContext();
    const stop = noise(fake.asAudioContext(), fake.asDestination(), 0, 0.3);
    expect(fake.buffers[0]?.length).toBe(Math.ceil(44100 * 0.3));
    const src = fake.bufferSources[0];
    expect(src?.buffer).toBe(fake.buffers[0]);
    const filter = fake.filters[0];
    expect(filter?.type).toBe('bandpass');
    expect(filter?.frequency.valuesSet()).toEqual([1800, 2400]);
    expect(fake.unstopped()).toEqual([src]);
    stop();
    expect(fake.unstopped()).toEqual([]);
    expect(fake.sources().every((s) => s instanceof FakeAudioBufferSourceNode)).toBe(true);
  });

  it('throws where a browser would', () => {
    const fake = createFakeAudioContext();
    const osc = fake.createOscillator();
    expect(() => osc.stop()).toThrow(/before start/);
    osc.start();
    expect(() => osc.start()).toThrow(/twice/);
    expect(() => osc.frequency.exponentialRampToValueAtTime(0, 1)).toThrow(RangeError);
    expect(() => osc.frequency.setValueAtTime(Number.NaN, 0)).toThrow(TypeError);
    expect(() => osc.frequency.setValueAtTime(1, -1)).toThrow(RangeError);
    expect(() => osc.connect(createFakeAudioContext().destination)).toThrow(/another context/);
    expect(() => fake.createGain().disconnect(fake.destination)).toThrow(/not connected/);
    expect(() => fake.createBuffer(1, 0, 44100)).toThrow();
  });

  it('fires ended through onended and addEventListener', () => {
    const fake = createFakeAudioContext();
    const osc = fake.createOscillator();
    const seen: string[] = [];
    osc.onended = () => seen.push('prop');
    osc.addEventListener('ended', () => seen.push('listener'));
    osc.end();
    expect(seen).toEqual(['prop', 'listener']);
    expect(osc).toBeInstanceOf(FakeOscillatorNode);
  });

  it('records suspend/resume/close and follows the context state rules', async () => {
    const fake = createFakeAudioContext();
    expect(fake.state).toBe('suspended');
    await fake.resume();
    expect(fake.state).toBe('running');
    await fake.suspend();
    expect(fake.state).toBe('suspended');
    await fake.close();
    expect(fake.state).toBe('closed');
    await expect(fake.resume()).rejects.toThrow(/closed/);
    expect(fake.calls).toEqual(['resume', 'suspend', 'close', 'resume']);
  });

  it('can make resume() reject', async () => {
    const fake = createFakeAudioContext({ resumeRejects: true });
    await expect(fake.resume()).rejects.toThrow();
    expect(fake.state).toBe('suspended');
  });

  it('keeps a clock tests can move', () => {
    const fake = createFakeAudioContext();
    fake.advance(1.5);
    expect(fake.currentTime).toBe(1.5);
  });
});

describe('createFakeAudioEngine', () => {
  it('logs plays and voice stops by recipe name', () => {
    const engine = createFakeAudioEngine();
    const a = engine.play(beep, 0.15);
    engine.play(noise, 0.3);
    a.stop();
    a.stop();
    expect(engine.played()).toEqual(['beep', 'noise']);
    expect(engine.log.filter((e) => e.type === 'stop')).toEqual([
      { type: 'stop', id: 0, name: 'beep' },
      { type: 'stop', id: 0, name: 'beep' },
    ]);
    expect(engine.activeVoices().map((v) => v.name)).toEqual(['noise']);
    expect(engine.voices[1]?.durationSec).toBe(0.3);
  });

  it('stopAll and unmount stop every active voice', () => {
    const engine = createFakeAudioEngine();
    engine.play(beep, 1);
    engine.play(noise, 1);
    engine.stopAll();
    expect(engine.activeVoices()).toEqual([]);
    engine.play(beep, 1);
    engine.unmount();
    expect(engine.activeVoices()).toEqual([]);
    expect(engine.log.map((e) => e.type)).toEqual([
      'play', 'play', 'stopAll', 'stop', 'stop', 'play', 'unmount', 'stop',
    ]);
  });

  it('tracks lock, availability and mute state', () => {
    const locked = createFakeAudioEngine({ unlocked: false });
    expect(locked.isUnlocked()).toBe(false);
    expect(locked.play(beep, 1).unlocked).toBe(false);
    expect(locked.unlock()).toBe(true);
    expect(locked.isUnlocked()).toBe(true);

    const silent = createFakeAudioEngine({ unlocked: false, available: false });
    expect(silent.unlock()).toBe(false);
    expect(silent.isUnlocked()).toBe(false);

    locked.setMuted(true);
    expect(locked.isMuted()).toBe(true);
    expect(locked.log.at(-1)).toEqual({ type: 'setMuted', muted: true });
  });
});

describe('helpers fit existing dependency shapes', () => {
  it('fakeVisibility works as the fixed loop visibility source', () => {
    const vis = fakeVisibility();
    const frames: Array<(t: number) => void> = [];
    const stop = startFixedLoop(() => {}, {
      now: () => 0,
      requestFrame: (cb) => frames.push(cb),
      cancelFrame: () => {},
      visibility: vis,
    });
    expect(vis.listenerCount()).toBe(1);
    stop();
    expect(vis.listenerCount()).toBe(0);
  });
});
