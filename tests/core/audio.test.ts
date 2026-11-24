import { afterEach, describe, expect, it } from 'vitest';
import { createAudioEngine, MASTER_GAIN, VOICE_CAP, type AudioEngine, type SoundRecipe } from '../../src/core/audio';
import { createFakeAudioContext, createFakeAudioEngine, type FakeAudioContext } from '../helpers/audio';
import { fakeVisibility, trackListeners, type ListenerTracker } from '../helpers/dom';
import fc from 'fast-check';
import { mixGains, type AudioMix } from '../../src/core/audio';
import { createFakeTimers } from '../helpers/timers';

const beep: SoundRecipe = (ac, out, at, durationSec) => {
  const osc = ac.createOscillator();
  osc.connect(out);
  osc.start(at);
  osc.stop(at + durationSec);
  return () => osc.stop();
};

/** Starts an oscillator without scheduling its end, so only the voice's stop function ends it. */
const hold: SoundRecipe = (ac, out, at) => {
  const osc = ac.createOscillator();
  osc.connect(out);
  osc.start(at);
  return () => osc.stop();
};

/** An engine on a fresh fake context and fake visibility source. */
function setup(options: Parameters<typeof createFakeAudioContext>[0] = {}) {
  const fake = createFakeAudioContext(options);
  const visibility = fakeVisibility();
  let created = 0;
  const engine = createAudioEngine({
    createContext: () => {
      created += 1;
      return fake.asAudioContext();
    },
    visibility,
  });
  return { fake, visibility, engine, created: () => created };
}

const masterGain = (fake: FakeAudioContext): number | undefined => fake.gains[0]?.gain.value;

/** Let the engine's `resume().catch(...)` handler run. */
async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('createAudioEngine', () => {
  let tracker: ListenerTracker | null = null;

  afterEach(() => {
    tracker?.restore();
    tracker = null;
  });

  it('creates the context and a 0.6 master gain inside unlock, then plays into it', () => {
    const fake = createFakeAudioContext();
    const engine = createAudioEngine({ createContext: () => fake.asAudioContext(), visibility: fakeVisibility() });

    expect(engine.unlock()).toBe(true);
    expect(fake.calls).toEqual(['resume']);
    const master = fake.gains[0];
    expect(master?.gain.value).toBe(MASTER_GAIN);
    expect(master?.reaches(fake.destination)).toBe(true);

    engine.play(beep, 1);
    expect(fake.oscillators[0]?.reaches(fake.destination)).toBe(true);
  });

  it('returns a no-op voice while locked and creates no context', () => {
    let created = 0;
    const engine = createAudioEngine({
      createContext: () => {
        created += 1;
        return createFakeAudioContext().asAudioContext();
      },
    });
    expect(() => engine.play(beep, 1).stop()).not.toThrow();
    expect(created).toBe(0);
  });

  it('goes silent when resume rejects', async () => {
    const fake = createFakeAudioContext({ resumeRejects: true });
    const engine = createAudioEngine({ createContext: () => fake.asAudioContext(), visibility: fakeVisibility() });
    engine.unlock();
    await Promise.resolve();
    await Promise.resolve();
    expect(engine.isUnlocked()).toBe(false);
    engine.play(beep, 1);
    expect(fake.oscillators).toHaveLength(0);
  });

  it('stays silent without Web Audio (jsdom has no AudioContext)', () => {
    const engine = createAudioEngine();
    expect(engine.unlock()).toBe(false);
    expect(engine.isUnlocked()).toBe(false);
  });

  it('accepts the fake engine where an AudioEngine is expected', () => {
    const engine: AudioEngine = createFakeAudioEngine();
    expect(engine.unlock()).toBe(true);
  });

  describe('locked and unavailable (Req 3.3, 3.4)', () => {
    it('creates no nodes for play, stopAll or setMuted before unlock', () => {
      const { fake, engine, created } = setup();
      engine.play(hold, 1);
      engine.stopAll();
      engine.setMuted(true);
      expect(created()).toBe(0);
      expect(fake.nodes).toHaveLength(0);
      expect(fake.calls).toEqual([]);
      expect(engine.isUnlocked()).toBe(false);
    });

    it('a throwing factory gives a silent engine that never retries the factory', () => {
      let attempts = 0;
      const visibility = fakeVisibility();
      const engine = createAudioEngine({
        createContext: () => {
          attempts += 1;
          throw new Error('Web Audio is not available');
        },
        visibility,
      });

      expect(engine.unlock()).toBe(false);
      expect(engine.isUnlocked()).toBe(false);
      expect(() => engine.play(hold, 1).stop()).not.toThrow();
      expect(engine.unlock()).toBe(false);
      expect(attempts).toBe(1);
      expect(visibility.listenerCount()).toBe(0);
    });

    it('closes the context when the master gain cannot be built', () => {
      const fake = createFakeAudioContext();
      fake.createGain = () => {
        throw new Error('createGain failed');
      };
      const engine = createAudioEngine({ createContext: () => fake.asAudioContext(), visibility: fakeVisibility() });

      expect(engine.unlock()).toBe(false);
      expect(fake.state).toBe('closed');
      engine.play(hold, 1);
      expect(fake.oscillators).toHaveLength(0);
    });

    it('a rejected resume stops voices already started, closes the context and drops the listener', async () => {
      const { fake, visibility, engine } = setup({ resumeRejects: true });
      expect(engine.unlock()).toBe(true);
      engine.play(hold, 1);
      expect(fake.unstopped()).toHaveLength(1);

      await settle();

      expect(engine.isUnlocked()).toBe(false);
      expect(fake.unstopped()).toHaveLength(0);
      expect(fake.calls).toContain('close');
      expect(fake.state).toBe('closed');
      expect(visibility.listenerCount()).toBe(0);
      expect(() => engine.play(hold, 1).stop()).not.toThrow();
      expect(fake.oscillators).toHaveLength(1);
      expect(engine.unlock()).toBe(false);
    });
  });

  describe('page visibility (Req 10.8, 10.9)', () => {
    it('suspends the context when the page is hidden and resumes it when visible', () => {
      const { fake, visibility, engine } = setup();
      engine.unlock();
      expect(fake.calls).toEqual(['resume']);

      visibility.setHidden(true);
      expect(fake.calls).toEqual(['resume', 'suspend']);
      expect(fake.state).toBe('suspended');

      visibility.setHidden(false);
      expect(fake.calls).toEqual(['resume', 'suspend', 'resume']);
      expect(fake.state).toBe('running');
    });

    it('adds its listener only once unlocked', () => {
      const { visibility, engine } = setup();
      expect(visibility.listenerCount()).toBe(0);
      engine.unlock();
      expect(visibility.listenerCount()).toBe(1);
    });
  });

  describe('mute (Req 7.8)', () => {
    it('sets the master gain to 0 and back to the master level', () => {
      const { fake, engine } = setup();
      engine.unlock();

      engine.setMuted(true);
      expect(engine.isMuted()).toBe(true);
      expect(masterGain(fake)).toBe(0);

      engine.setMuted(false);
      expect(engine.isMuted()).toBe(false);
      expect(masterGain(fake)).toBe(MASTER_GAIN);
    });

    it('applies a mute set before unlock once the context exists', () => {
      const { fake, engine } = setup();
      engine.setMuted(true);
      engine.unlock();
      expect(engine.isMuted()).toBe(true);
      expect(masterGain(fake)).toBe(0);
    });
  });

  describe('voices', () => {
    it('stopping a voice twice runs the recipe stop function once', () => {
      const { engine } = setup();
      engine.unlock();
      let stops = 0;
      const counted: SoundRecipe = (ac, out, at, d) => {
        const stop = hold(ac, out, at, d);
        return () => {
          stops += 1;
          stop();
        };
      };

      const voice = engine.play(counted, 1);
      voice.stop();
      expect(() => voice.stop()).not.toThrow();
      expect(stops).toBe(1);
    });

    it('stopAll stops every running voice and the engine keeps playing afterwards', () => {
      const { fake, engine } = setup();
      engine.unlock();
      engine.play(hold, 1);
      engine.play(hold, 2);
      expect(fake.unstopped()).toHaveLength(2);

      engine.stopAll();
      expect(fake.unstopped()).toHaveLength(0);
      expect(engine.isUnlocked()).toBe(true);

      engine.play(hold, 1);
      expect(fake.unstopped()).toHaveLength(1);
    });
  });

  describe('unmount (Req 14.2)', () => {
    it('stops voices, closes the context and removes the visibility listener', () => {
      const { fake, visibility, engine } = setup();
      engine.unlock();
      engine.play(hold, 1);
      engine.play(hold, 3);

      engine.unmount();

      expect(fake.unstopped()).toHaveLength(0);
      expect(fake.calls).toEqual(['resume', 'close']);
      expect(fake.state).toBe('closed');
      expect(visibility.listenerCount()).toBe(0);
      expect(engine.isUnlocked()).toBe(false);

      visibility.setHidden(true);
      expect(fake.calls).toEqual(['resume', 'close']);
    });

    it('play, unlock and unmount after unmount are no-ops', () => {
      const { fake, engine, created } = setup();
      engine.unlock();
      engine.unmount();

      expect(() => engine.play(hold, 1).stop()).not.toThrow();
      expect(fake.oscillators).toHaveLength(0);
      expect(engine.unlock()).toBe(false);
      expect(created()).toBe(1);
      expect(() => engine.unmount()).not.toThrow();
      expect(fake.calls).toEqual(['resume', 'close']);
    });

    it('removes its listener from document when no visibility source is injected', () => {
      tracker = trackListeners(document);
      const fake = createFakeAudioContext();
      const engine = createAudioEngine({ createContext: () => fake.asAudioContext() });

      engine.unlock();
      expect(tracker.count('visibilitychange')).toBe(1);
      engine.unmount();
      expect(tracker.count('visibilitychange')).toBe(0);
    });
  });
});

// title-and-endings: channels, volume and fades (Req 6.1–6.9).

/** An engine on a fresh fake context with fake timers. Gain nodes: 0 master, 1 music, 2 sfx, then one per Voice. */
function setupMixed(options: Parameters<typeof createFakeAudioContext>[0] = {}) {
  const fake = createFakeAudioContext(options);
  const timers = createFakeTimers();
  const engine = createAudioEngine({ createContext: () => fake.asAudioContext(), visibility: fakeVisibility(), timers });
  return { fake, timers, engine };
}

const buses = (fake: FakeAudioContext) => {
  const [master, music, sfx] = fake.gains;
  if (!master || !music || !sfx) throw new Error('engine graph not built');
  return { master, music, sfx };
};

describe('createAudioEngine channels, mix and fades (title-and-endings)', () => {
  it('Property 9: engine gains follow the mix and the mute, before and after unlock', () => {
    // Property: Req 6.2–6.6 master = muted ? 0 : 0.6 × clamp(volume) / 100, buses 1 or 0, also for values set before unlock
    // Feature: title-and-endings, Property 9: Engine gains follow the mix and the mute, before and after unlock
    const arbVolume = fc.oneof(
      fc.integer({ min: -50, max: 150 }),
      fc.double({ min: -1000, max: 1000, noNaN: true }),
      fc.constantFrom(Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY),
    );
    const arbMix = fc.record({ volume: arbVolume, music: fc.boolean(), sfx: fc.boolean() });
    const arbOp = fc.oneof(
      arbMix.map((mix) => ({ type: 'setMix' as const, mix })),
      fc.boolean().map((muted) => ({ type: 'setMuted' as const, muted })),
    );
    const arbScript = fc
      .array(arbOp, { maxLength: 12 })
      .chain((ops) => fc.tuple(fc.constant(ops), fc.integer({ min: 0, max: ops.length })));

    /** Independent statement of the rule, not a call to mixGains. */
    const expected = (mix: AudioMix, muted: boolean) => {
      const v = Number.isFinite(mix.volume) ? Math.min(100, Math.max(0, mix.volume)) : 100;
      return { master: muted ? 0 : (MASTER_GAIN * v) / 100, music: mix.music ? 1 : 0, sfx: mix.sfx ? 1 : 0 };
    };

    fc.assert(
      fc.property(arbScript, ([ops, unlockAt]) => {
        const { fake, engine } = setupMixed();
        let lastMix: AudioMix = { volume: 100, music: true, sfx: true };
        let lastMuted = false;

        const check = (): void => {
          const want = expected(lastMix, lastMuted);
          const pure = mixGains(lastMix, lastMuted);
          expect(pure.master).toBeCloseTo(want.master, 12);
          expect(pure.music).toBe(want.music);
          expect(pure.sfx).toBe(want.sfx);
          const { master, music, sfx } = buses(fake);
          expect(master.gain.value).toBeCloseTo(want.master, 12);
          expect(music.gain.value).toBe(want.music);
          expect(sfx.gain.value).toBe(want.sfx);
        };

        const script = [...ops.slice(0, unlockAt), { type: 'unlock' as const }, ...ops.slice(unlockAt)];
        let unlocked = false;
        for (const op of script) {
          if (op.type === 'unlock') {
            expect(fake.gains).toHaveLength(0);
            expect(engine.unlock()).toBe(true);
            unlocked = true;
          } else if (op.type === 'setMix') {
            engine.setMix(op.mix);
            lastMix = op.mix;
          } else {
            engine.setMuted(op.muted);
            lastMuted = op.muted;
          }
          expect(engine.mix()).toEqual(lastMix);
          expect(engine.isMuted()).toBe(lastMuted);
          if (unlocked) check();
        }
      }),
      { numRuns: 100 },
    );
  });

  describe('routing (Req 6.1)', () => {
    it('plays on the sfx bus when no channel is given and on the music bus for "music"', () => {
      const { fake, engine } = setupMixed();
      engine.unlock();
      const { master, music, sfx } = buses(fake);

      engine.play(hold, 1);
      const sfxOsc = fake.oscillators[0];
      expect(sfxOsc?.reaches(sfx)).toBe(true);
      expect(sfxOsc?.reaches(music)).toBe(false);
      expect(sfxOsc?.reaches(master)).toBe(true);
      expect(sfxOsc?.reaches(fake.destination)).toBe(true);

      engine.play(hold, 1, 'music');
      const musicOsc = fake.oscillators[1];
      expect(musicOsc?.reaches(music)).toBe(true);
      expect(musicOsc?.reaches(sfx)).toBe(false);
      expect(musicOsc?.reaches(fake.destination)).toBe(true);
    });

    it('keeps the master as gains[0] at 0.6 with the default mix, buses at 1 into it', () => {
      const { fake, engine } = setupMixed();
      engine.unlock();
      const { master, music, sfx } = buses(fake);
      expect(master.gain.value).toBe(MASTER_GAIN);
      expect(master.reaches(fake.destination)).toBe(true);
      expect(music.gain.value).toBe(1);
      expect(sfx.gain.value).toBe(1);
      expect(music.outputs).toEqual([master]);
      expect(sfx.outputs).toEqual([master]);
    });
  });

  describe('fadeOut (Req 6.7, 6.8, 6.9)', () => {
    it('ramps the voice gain linearly from 1 to 0 and stops the voice when the timer reaches 600 ms', () => {
      const { fake, timers, engine } = setupMixed({ currentTime: 2 });
      engine.unlock();
      const voice = engine.play(hold, 30, 'music');
      const voiceGain = fake.gains[3];
      expect(voiceGain?.reaches(buses(fake).music)).toBe(true);

      voice.fadeOut(0.6);
      expect(voiceGain?.gain.events).toEqual([
        { type: 'cancelScheduledValues', time: 2 },
        { type: 'setValueAtTime', value: 1, time: 2 },
        { type: 'linearRampToValueAtTime', value: 0, time: 2 + 0.6 },
      ]);
      expect(timers.pending()).toBe(1);

      timers.advance(599);
      expect(fake.unstopped()).toHaveLength(1);

      timers.advance(1);
      expect(fake.unstopped()).toHaveLength(0);
      expect(timers.pending()).toBe(0);
      expect(voiceGain?.outputs).toHaveLength(0);
    });

    it('stop() during a fade stops at once and clears the timer', () => {
      const { fake, timers, engine } = setupMixed();
      engine.unlock();
      let stops = 0;
      const counted: SoundRecipe = (ac, out, at, d) => {
        const stop = hold(ac, out, at, d);
        return () => {
          stops += 1;
          stop();
        };
      };
      const voice = engine.play(counted, 30);
      voice.fadeOut(0.6);
      timers.advance(300);

      voice.stop();
      expect(fake.unstopped()).toHaveLength(0);
      expect(timers.pending()).toBe(0);

      timers.advance(1000);
      expect(stops).toBe(1);
    });

    it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])('fadeOut(%s) stops the voice at once without a timer', (d) => {
      const { fake, timers, engine } = setupMixed();
      engine.unlock();
      const voice = engine.play(hold, 30);
      voice.fadeOut(d);
      expect(fake.unstopped()).toHaveLength(0);
      expect(timers.pending()).toBe(0);
    });

    it('unmount() with two pending fades stops both voices and leaves no pending timers', () => {
      const { fake, timers, engine } = setupMixed();
      engine.unlock();
      engine.play(hold, 30, 'music').fadeOut(0.6);
      engine.play(hold, 30).fadeOut(1);
      expect(timers.pending()).toBe(2);

      engine.unmount();
      expect(timers.pending()).toBe(0);
      expect(fake.unstopped()).toHaveLength(0);
      expect(() => timers.advance(2000)).not.toThrow();
    });

    it('the no-op Voice of a locked engine accepts fadeOut and schedules nothing', () => {
      let created = 0;
      const timers = createFakeTimers();
      const engine = createAudioEngine({
        createContext: () => {
          created += 1;
          return createFakeAudioContext().asAudioContext();
        },
        visibility: fakeVisibility(),
        timers,
      });
      const voice = engine.play(hold, 1, 'music');
      expect(() => voice.fadeOut(0.6)).not.toThrow();
      expect(() => voice.stop()).not.toThrow();
      expect(timers.pending()).toBe(0);
      expect(created).toBe(0);
    });
  });
});

describe('voice cap and limiter (juice-and-endings)', () => {
  function unlocked() {
    const fake = createFakeAudioContext();
    const timers = createFakeTimers();
    const engine = createAudioEngine({ createContext: () => fake.asAudioContext(), visibility: fakeVisibility(), timers });
    engine.unlock();
    return { fake, engine };
  }

  it('puts a limiter between the master gain and the destination', () => {
    const { fake } = unlocked();
    const limiter = fake.compressors[0];
    const master = fake.gains[0];
    expect(limiter).toBeDefined();
    expect(master?.outputs).toEqual([limiter]);
    expect(limiter?.outputs).toEqual([fake.destination]);
    expect(limiter?.threshold.value).toBe(-6);
    expect(limiter?.knee.value).toBe(0);
    expect(limiter?.ratio.value).toBe(20);
    expect(limiter?.attack.value).toBe(0.003);
    expect(limiter?.release.value).toBe(0.12);
  });

  it('does not cap music voices or keep loops', () => {
    const { fake, engine } = unlocked();
    engine.play(hold, 10, 'music');
    engine.play(hold, 10, 'sfx', { keep: true });
    for (let i = 0; i < 40; i++) engine.play(hold, 10);
    // The first two voice gains (after master, music, sfx) belong to the exempt voices.
    expect(fake.gains[3]?.gain.valuesSet()).not.toContain(0);
    expect(fake.gains[4]?.gain.valuesSet()).not.toContain(0);
  });

  // Property: Req 6.4 voice cap drops the oldest
  it('never holds more than VOICE_CAP capped sfx voices and fades the oldest', () => {
    fc.assert(
      fc.property(fc.array(fc.constantFrom<'sfx' | 'music' | 'keep'>('sfx', 'music', 'keep'), { maxLength: 80 }), (kinds) => {
        const { fake, engine } = unlocked();
        const capped: number[] = []; // gain indices of capped voices, in play order
        kinds.forEach((k) => {
          const index = fake.gains.length;
          if (k === 'music') engine.play(hold, 10, 'music');
          else if (k === 'keep') engine.play(hold, 10, 'sfx', { keep: true });
          else {
            engine.play(hold, 10);
            capped.push(index);
          }
        });
        const faded = (i: number) => fake.gains[i]?.gain.valuesSet().includes(0) ?? false;
        const live = capped.filter((i) => !faded(i));
        expect(live.length).toBeLessThanOrEqual(VOICE_CAP);
        // The faded voices are exactly the oldest ones.
        const dropped = Math.max(0, capped.length - VOICE_CAP);
        capped.forEach((i, n) => expect(faded(i)).toBe(n < dropped));
        fake.gains.forEach((g, i) => {
          if (!capped.includes(i)) expect(g.gain.valuesSet()).not.toContain(0);
        });
      }),
    );
  });
});
