/**
 * Lane_Sounds: short synthesized cues for the connection lane (Req 14.1–14.3).
 *
 * Hits, kills and bites repeat many times a run, so every cue is short (120–300 ms), quiet and
 * rounded off. Everything is built from oscillators, filters and seeded noise generated in code;
 * nothing is loaded from files (Req 14.3). The recipes follow the `modemSounds.ts` rules (see
 * `src/core/soundKit.ts`): schedule inside `[at, at + durationSec]`, one output gain that fades
 * in from 0 and back to 0, and a stop function that is safe to call twice.
 */
import type { SoundRecipe } from '../core/audio';
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
} from '../core/soundKit';
import type { GameEvent } from '../game/types';

export type LaneSoundId = 'hammerThud' | 'hammerWhiff' | 'mobSplat' | 'modemCrunch' | 'globSpit' | 'manholeClank' | 'zombieGroan';

/** Natural length of each sound in seconds; pass these to `AudioEngine.play`. */
export const LANE_SOUND_SEC: Readonly<Record<LaneSoundId, number>> = Object.freeze({
  hammerThud: 0.12,
  hammerWhiff: 0.12,
  mobSplat: 0.2,
  modemCrunch: 0.25,
  globSpit: 0.15,
  manholeClank: 0.3,
  zombieGroan: 0.4,
});

/** Seed for the lane noise buffers, so every burst (and every test run) is identical. */
const NOISE_SEED = 0x85ebca6b;

/**
 * Output level of every lane cue. The engine's master gain sits on top, and each recipe keeps
 * its summed inner peaks at or below about 0.7, so a cue peaks well under full scale.
 */
const LANE_LEVEL = 0.5;

/** A noise burst through `shape`, plucked from `start` to `end` at `peak`, into `out`. */
function noiseBurst(g: Graph, shape: AudioNode, out: AudioNode, start: number, end: number, peak: number): void {
  const noise = noiseSource(g, start, end, NOISE_SEED);
  const env = silentGain(g);
  pluck(env.gain, start, end, peak, Math.min(0.003, (end - start) / 10));
  noise.connect(shape);
  shape.connect(env);
  env.connect(out);
}

/** A tone plucked from `start` to `end` at `peak`, into `out`. */
function tone(g: Graph, osc: OscillatorNode, out: AudioNode, start: number, end: number, peak: number, attack: number): void {
  const env = silentGain(g);
  pluck(env.gain, start, end, peak, attack);
  osc.connect(env);
  env.connect(out);
}

// ---------------------------------------------------------------------------------------------
// Recipes

/** Hammer lands on a mob: a sine dropping 140 → 50 Hz plus a short low-passed noise tick. */
export const hammerThud: SoundRecipe = (ac, out, at, durationSec) => {
  const d = safeDuration(durationSec, LANE_SOUND_SEC.hammerThud);
  const end = at + d;
  const g = createGraph(ac);
  const master = outputGain(g, out, at, d, LANE_LEVEL, 0.01);

  const body = oscillator(g, 'sine', 140, at, end);
  body.frequency.exponentialRampToValueAtTime(50, at + d * 0.8);
  tone(g, body, master, at, end, 0.6, Math.min(0.003, d / 20));

  const tickEnd = at + Math.min(0.02, d / 4);
  noiseBurst(g, filter(g, 'lowpass', 1200, 0.7, at), master, at, tickEnd, 0.3);

  return g.finish();
};

/** Hammer misses: band-passed noise sweeping 2000 → 600 Hz, swelling then fading. */
export const hammerWhiff: SoundRecipe = (ac, out, at, durationSec) => {
  const d = safeDuration(durationSec, LANE_SOUND_SEC.hammerWhiff);
  const end = at + d;
  const g = createGraph(ac);
  const master = outputGain(g, out, at, d, LANE_LEVEL, 0.01);

  const noise = noiseSource(g, at, end, NOISE_SEED);
  const bandpass = filter(g, 'bandpass', 2000, 1.2, at);
  bandpass.frequency.exponentialRampToValueAtTime(600, end);
  const env = silentGain(g);
  pluck(env.gain, at, end, 0.45, d * 0.35);
  noise.connect(bandpass);
  bandpass.connect(env);
  env.connect(master);

  return g.finish();
};

/** Mob dies: a low-passed noise burst closing down plus a 90 Hz sine thump. */
export const mobSplat: SoundRecipe = (ac, out, at, durationSec) => {
  const d = safeDuration(durationSec, LANE_SOUND_SEC.mobSplat);
  const end = at + d;
  const g = createGraph(ac);
  const master = outputGain(g, out, at, d, LANE_LEVEL, 0.015);

  const lowpass = filter(g, 'lowpass', 1600, 1.5, at);
  lowpass.frequency.exponentialRampToValueAtTime(250, end);
  noiseBurst(g, lowpass, master, at, end, 0.35);

  const thump = oscillator(g, 'sine', 90, at, end);
  thump.frequency.exponentialRampToValueAtTime(55, end);
  tone(g, thump, master, at, at + d * 0.7, 0.35, Math.min(0.005, d / 20));

  return g.finish();
};

/** Mob bites the modem: an 80 Hz square and three noise grains through a 600 Hz band-pass. */
export const modemCrunch: SoundRecipe = (ac, out, at, durationSec) => {
  const d = safeDuration(durationSec, LANE_SOUND_SEC.modemCrunch);
  const end = at + d;
  const g = createGraph(ac);
  const master = outputGain(g, out, at, d, LANE_LEVEL, 0.02);

  const bandpass = filter(g, 'bandpass', 600, 1.5, at);
  const shaped = g.node(ac.createGain());
  shaped.gain.value = 1;
  bandpass.connect(shaped);
  shaped.connect(master);

  const buzz = oscillator(g, 'square', 80, at, end);
  tone(g, buzz, bandpass, at, end, 0.4, Math.min(0.005, d / 20));

  // The crunch: three short grains, the second and third a little softer.
  const noise = noiseSource(g, at, end, NOISE_SEED);
  const grains = silentGain(g);
  grains.gain.setValueAtTime(0, at);
  const grainLen = Math.min(0.05, d / 5);
  for (const [share, peak] of [
    [0, 0.3],
    [0.3, 0.22],
    [0.6, 0.18],
  ] as const) {
    const t = at + share * d;
    pluck(grains.gain, t, t + grainLen, peak, grainLen / 10);
  }
  noise.connect(grains);
  grains.connect(bandpass);

  return g.finish();
};

/** Ranged mob spits a glob: a sine blip rising 300 → 900 Hz. */
export const globSpit: SoundRecipe = (ac, out, at, durationSec) => {
  const d = safeDuration(durationSec, LANE_SOUND_SEC.globSpit);
  const end = at + d;
  const g = createGraph(ac);
  const master = outputGain(g, out, at, d, LANE_LEVEL, 0.015);

  const blip = oscillator(g, 'sine', 300, at, end);
  blip.frequency.exponentialRampToValueAtTime(900, at + d * 0.7);
  tone(g, blip, master, at, end, 0.4, Math.min(0.01, d / 10));

  return g.finish();
};

/** Manhole lid as a zombie climbs out: triangle partials at 420 and 637 Hz, decaying fast. */
export const manholeClank: SoundRecipe = (ac, out, at, durationSec) => {
  const d = safeDuration(durationSec, LANE_SOUND_SEC.manholeClank);
  const end = at + d;
  const g = createGraph(ac);
  const master = outputGain(g, out, at, d, LANE_LEVEL, 0.02);
  const attack = Math.min(0.002, d / 50);

  tone(g, oscillator(g, 'triangle', 420, at, end), master, at, end, 0.35, attack);
  // The higher partial dies first, like struck metal.
  const highEnd = at + d * 0.6;
  tone(g, oscillator(g, 'triangle', 637, at, highEnd), master, at, highEnd, 0.25, attack);

  return g.finish();
};

/**
 * Melee mob reaches the modem: two detuned sawtooths (110 and 113 Hz) falling to about 70 Hz,
 * through a 500 Hz band-pass, swelling in and fading out (lane-melee Req 7.3).
 */
export const zombieGroan: SoundRecipe = (ac, out, at, durationSec) => {
  const d = safeDuration(durationSec, LANE_SOUND_SEC.zombieGroan);
  const end = at + d;
  const g = createGraph(ac);
  const master = outputGain(g, out, at, d, LANE_LEVEL, 0.03);
  const bandpass = filter(g, 'bandpass', 500, 2, at);
  bandpass.connect(master);
  for (const [freq, low] of [
    [110, 70],
    [113, 72],
  ] as const) {
    const saw = oscillator(g, 'sawtooth', freq, at, end);
    saw.frequency.exponentialRampToValueAtTime(low, end);
    tone(g, saw, bandpass, at, end, 0.3, d * 0.25);
  }
  return g.finish();
};

/** Recipes keyed by `LaneSoundId`, played with `LANE_SOUND_SEC[id]`. */
export const LANE_SOUNDS: Readonly<Record<LaneSoundId, SoundRecipe>> = Object.freeze({
  hammerThud,
  hammerWhiff,
  mobSplat,
  modemCrunch,
  globSpit,
  manholeClank,
  zombieGroan,
});

/** The lane sound for one event, or null if the event has none (Req 14.1). */
function soundFor(event: GameEvent): LaneSoundId | null {
  switch (event.type) {
    case 'hammerSwing':
      return event.targetId === null ? 'hammerWhiff' : 'hammerThud';
    case 'mobKilled':
      return 'mobSplat';
    case 'mobBit':
      return 'modemCrunch';
    case 'mobArrived':
      return 'zombieGroan';
    case 'globSpat':
      return 'globSpit';
    case 'mobSpawned':
      return event.source === 'schedule' ? 'manholeClank' : null;
    default:
      return null;
  }
}

/** One id per matching sound, in order of first occurrence (Req 14.1, 14.2). */
export function laneSoundsFor(events: readonly GameEvent[]): readonly LaneSoundId[] {
  const ids: LaneSoundId[] = [];
  for (const event of events) {
    const id = soundFor(event);
    if (id !== null && !ids.includes(id)) ids.push(id);
  }
  return ids;
}
