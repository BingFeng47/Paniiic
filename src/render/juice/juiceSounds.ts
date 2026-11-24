/**
 * Juice_Sounds: synthesized cues for the juice-and-endings polish (Req 5.2, 5.3, 6.1–6.3, 6.6).
 *
 * Every sound is built from oscillators, filters and seeded noise; nothing is loaded from files
 * (Req 6.6). The recipes follow the `src/core/soundKit.ts` rules: schedule inside
 * `[at, at + durationSec]`, one output gain that fades in from 0 and back to 0, and a stop
 * function that is safe to call twice.
 *
 * Loops (`modemAlarm`, `bossRumble`) are played with a long duration such as `JUICE_LOOP_SEC`
 * and `{ keep: true }`, so the voice cap never steals them (Req 6.4); the caller stops the
 * returned Voice when the loop should end.
 */
import type { SoundRecipe } from '../../core/audio';
import {
  createGraph,
  filter,
  noiseSource,
  oscillator,
  outputGain,
  pluck,
  safeDuration,
  silentGain,
  type Graph,
} from '../../core/soundKit';
import type { MobKind } from '../../game/laneTypes';

export type JuiceSoundId = 'glassCrack' | 'modemAlarm' | 'chapterSting' | 'bossRumble' | 'bossRoar';

/** Natural length of each one-shot in seconds; pass these to `AudioEngine.play`. */
export const JUICE_SOUND_SEC: Readonly<Record<JuiceSoundId, number>> = Object.freeze({
  glassCrack: 0.45,
  modemAlarm: 600,
  chapterSting: 0.9,
  bossRumble: 600,
  bossRoar: 1.4,
});

/** Duration to pass for loops; long enough to outlast a run, stopped by the caller. */
export const JUICE_LOOP_SEC = 600;

/** Natural length of each kind's spawn groan. */
export const GROAN_SEC: Readonly<Record<MobKind, number>> = Object.freeze({
  default: 0.4,
  fast: 0.22,
  tank: 0.6,
  ranged: 0.45,
  boss: 0.8,
});

const NOISE_SEED = 0x27d4eb2f;
const LEVEL = 0.5;

function tone(g: Graph, osc: AudioNode, out: AudioNode, start: number, end: number, peak: number, attack: number): void {
  const env = silentGain(g);
  pluck(env.gain, start, end, peak, attack);
  osc.connect(env);
  env.connect(out);
}

function noiseBurst(g: Graph, shape: AudioNode, out: AudioNode, start: number, end: number, peak: number): void {
  const noise = noiseSource(g, start, end, NOISE_SEED);
  const env = silentGain(g);
  pluck(env.gain, start, end, peak, Math.min(0.003, (end - start) / 10));
  noise.connect(shape);
  shape.connect(env);
  env.connect(out);
}

/** Glass crack: a sharp high-passed noise snap followed by three short tinkles (Req 2.1). */
export const glassCrack: SoundRecipe = (ac, out, at, durationSec) => {
  const d = safeDuration(durationSec, JUICE_SOUND_SEC.glassCrack);
  const end = at + d;
  const g = createGraph(ac);
  const master = outputGain(g, out, at, d, LEVEL, 0.03);
  noiseBurst(g, filter(g, 'highpass', 3000, 0.7, at), master, at, at + Math.min(0.08, d / 3), 0.6);
  [3150, 4400, 5200].forEach((freq, i) => {
    const start = at + d * (0.08 + i * 0.12);
    const stop = Math.min(end, start + d * 0.35);
    tone(g, oscillator(g, 'triangle', freq, start, stop), master, start, stop, 0.15, 0.002);
  });
  return g.finish();
};

/**
 * Modem alarm loop: a square beep switching between two tones once a second (Req 6.2).
 * A 1 Hz square LFO swings the carrier between 660 and 990 Hz, so the loop needs no per-beep
 * scheduling however long it plays.
 */
export const modemAlarm: SoundRecipe = (ac, out, at, durationSec) => {
  const d = safeDuration(durationSec, JUICE_LOOP_SEC);
  const end = at + d;
  const g = createGraph(ac);
  const master = outputGain(g, out, at, d, LEVEL * 0.35, 0.05);
  const carrier = oscillator(g, 'square', 825, at, end);
  const lfo = oscillator(g, 'square', 1, at, end);
  const depth = g.node(ac.createGain());
  depth.gain.value = 165;
  lfo.connect(depth);
  depth.connect(carrier.frequency);
  const shape = filter(g, 'lowpass', 2500, 0.7, at);
  carrier.connect(shape);
  shape.connect(master);
  return g.finish();
};

/** Chapter sting: a falling minor stab (A4, F4, D4) over a low thump (Req 6.3). */
export const chapterSting: SoundRecipe = (ac, out, at, durationSec) => {
  const d = safeDuration(durationSec, JUICE_SOUND_SEC.chapterSting);
  const end = at + d;
  const g = createGraph(ac);
  const master = outputGain(g, out, at, d, LEVEL, 0.08);
  const thump = oscillator(g, 'sine', 90, at, end);
  thump.frequency.exponentialRampToValueAtTime(40, at + d * 0.5);
  tone(g, thump, master, at, at + d * 0.5, 0.4, 0.003);
  const shape = filter(g, 'lowpass', 1800, 0.7, at);
  shape.connect(master);
  for (const freq of [440, 349.23, 293.66]) {
    const saw = oscillator(g, 'sawtooth', freq, at, end);
    saw.frequency.exponentialRampToValueAtTime(freq * 0.94, end);
    tone(g, saw, shape, at, end, 0.12, 0.01);
  }
  return g.finish();
};

/** Boss rumble loop: low sawtooths and low-passed noise with a slow 3 Hz tremble (Req 5.2). */
export const bossRumble: SoundRecipe = (ac, out, at, durationSec) => {
  const d = safeDuration(durationSec, JUICE_LOOP_SEC);
  const end = at + d;
  const g = createGraph(ac);
  const master = outputGain(g, out, at, d, LEVEL, 0.3);
  const body = g.node(ac.createGain());
  body.gain.value = 0.6;
  const lfo = oscillator(g, 'sine', 3, at, end);
  const depth = g.node(ac.createGain());
  depth.gain.value = 0.3;
  lfo.connect(depth);
  depth.connect(body.gain);
  body.connect(master);
  const low = filter(g, 'lowpass', 140, 1, at);
  low.connect(body);
  for (const freq of [38, 41]) oscillator(g, 'sawtooth', freq, at, end).connect(low);
  const noise = noiseSource(g, at, end, NOISE_SEED, d);
  const noiseLow = filter(g, 'lowpass', 200, 0.7, at);
  const noiseGain = g.node(ac.createGain());
  noiseGain.gain.value = 0.5;
  noise.connect(noiseLow);
  noiseLow.connect(noiseGain);
  noiseGain.connect(body);
  return g.finish();
};

/** Boss roar: detuned low sawtooths sweeping up then down, with breathy noise (Req 5.3). */
export const bossRoar: SoundRecipe = (ac, out, at, durationSec) => {
  const d = safeDuration(durationSec, JUICE_SOUND_SEC.bossRoar);
  const end = at + d;
  const g = createGraph(ac);
  const master = outputGain(g, out, at, d, LEVEL, 0.2);
  const shape = filter(g, 'bandpass', 400, 1.2, at);
  shape.frequency.linearRampToValueAtTime(900, at + d * 0.3);
  shape.frequency.linearRampToValueAtTime(300, end);
  shape.connect(master);
  for (const base of [70, 73.5, 105]) {
    const saw = oscillator(g, 'sawtooth', base, at, end);
    saw.frequency.linearRampToValueAtTime(base * 1.4, at + d * 0.3);
    saw.frequency.exponentialRampToValueAtTime(base * 0.7, end);
    tone(g, saw, shape, at, end, 0.22, d * 0.15);
  }
  noiseBurst(g, filter(g, 'bandpass', 1200, 0.8, at), master, at, end, 0.15);
  return g.finish();
};

/** One groan per kind, differing in pitch, filter and fall (Req 6.1). */
function groan(base: number, low: number, band: number, type: OscillatorType, peak: number, fallback: number): SoundRecipe {
  return (ac, out, at, durationSec) => {
    const d = safeDuration(durationSec, fallback);
    const end = at + d;
    const g = createGraph(ac);
    const master = outputGain(g, out, at, d, LEVEL, 0.03);
    const shape = filter(g, 'bandpass', band, 2, at);
    shape.connect(master);
    for (const detune of [1, 1.03]) {
      const osc = oscillator(g, type, base * detune, at, end);
      osc.frequency.exponentialRampToValueAtTime(low * detune, end);
      tone(g, osc, shape, at, end, peak, d * 0.25);
    }
    return g.finish();
  };
}

export const kindGroans: Readonly<Record<MobKind, SoundRecipe>> = Object.freeze({
  default: groan(110, 70, 500, 'sawtooth', 0.3, GROAN_SEC.default),
  fast: groan(220, 160, 900, 'sawtooth', 0.25, GROAN_SEC.fast),
  tank: groan(65, 40, 300, 'sawtooth', 0.35, GROAN_SEC.tank),
  ranged: groan(150, 230, 700, 'square', 0.18, GROAN_SEC.ranged),
  boss: groan(50, 30, 250, 'sawtooth', 0.35, GROAN_SEC.boss),
});

export const JUICE_SOUNDS: Readonly<Record<JuiceSoundId, SoundRecipe>> = Object.freeze({
  glassCrack,
  modemAlarm,
  chapterSting,
  bossRumble,
  bossRoar,
});
