/**
 * Boot_Sounds: synthesized recipes for the boot and desktop scenes (Req 4.1, 4.4, 5.1).
 *
 * Every sound is built from oscillators, filters and noise generated in code; nothing is loaded
 * from files (Req 12.7). Each recipe:
 * - schedules everything inside `[at, at + durationSec]` and stops its own sources at the end,
 * - routes through one output gain that fades in from silence and back to 0, so it starts and
 *   ends without a click, and keeps its summed peak below 1,
 * - returns a stop function that stops every source now and disconnects every node. Calling it
 *   twice, or after the sound ended on its own, is safe.
 *
 * The startup chime is an original A-minor figure written for this game (A3, E4, C5, falling
 * back to A4 over a detuned A/E pad). It does not imitate any real operating system's sound.
 */
import type { SoundRecipe } from '../../core/audio';
import {
  SILENT,
  createGraph,
  noiseSource as seededNoise,
  oscillator,
  outputGain,
  pluck,
  safeDuration,
  type Graph,
} from '../../core/soundKit';
import type { BootSoundId } from './bootScript';

/** Natural length of each sound in seconds; pass these to `AudioEngine.play`. */
export const BOOT_SOUND_SEC = {
  crtThunk: 0.3,
  postBeep: 0.15,
  diskSeek: 0.32,
  startupChime: 2.5,
} as const;

/** Seed for the noise generator, so every burst (and every test run) is identical. */
const NOISE_SEED = 0x9e3779b9;

// Helpers live in `src/core/soundKit.ts`, shared with the modem and lane sounds.

/** Seeded noise from `at` for `d` seconds. */
function noiseSource(g: Graph, at: number, d: number): AudioBufferSourceNode {
  return seededNoise(g, at, at + d, NOISE_SEED, d);
}

// ---------------------------------------------------------------------------------------------
// Recipes

/** CRT power-on thunk: a low-passed noise burst sweeping down, with a short low sine body. */
export const crtThunk: SoundRecipe = (ac, out, at, durationSec) => {
  const d = safeDuration(durationSec, BOOT_SOUND_SEC.crtThunk);
  const end = at + d;
  const g = createGraph(ac);
  const master = outputGain(g, out, at, d, 1, 0.01);

  const noise = noiseSource(g, at, d);
  const lowpass = g.node(ac.createBiquadFilter());
  lowpass.type = 'lowpass';
  lowpass.Q.value = 0.8;
  lowpass.frequency.setValueAtTime(900, at);
  lowpass.frequency.exponentialRampToValueAtTime(80, end);
  const noiseGain = g.node(ac.createGain());
  noiseGain.gain.value = 0;
  pluck(noiseGain.gain, at, end, 0.55, Math.min(0.004, d / 20));
  noise.connect(lowpass);
  lowpass.connect(noiseGain);
  noiseGain.connect(master);

  const body = oscillator(g, 'sine', 70, at, end);
  body.frequency.exponentialRampToValueAtTime(38, at + d * 0.8);
  const bodyGain = g.node(ac.createGain());
  bodyGain.gain.value = 0;
  pluck(bodyGain.gain, at, end, 0.4, Math.min(0.008, d / 10));
  body.connect(bodyGain);
  bodyGain.connect(master);

  return g.finish();
};

/** POST beep: a plain 1000 Hz square wave, like a PC speaker. */
export const postBeep: SoundRecipe = (ac, out, at, durationSec) => {
  const d = safeDuration(durationSec, BOOT_SOUND_SEC.postBeep);
  const g = createGraph(ac);
  const master = outputGain(g, out, at, d, 0.2, 0.01);
  const osc = oscillator(g, 'square', 1000, at, at + d);
  osc.connect(master);
  return g.finish();
};

/** Hard-disk seek: three band-passed noise clicks, the head landing at a new spot each time. */
export const diskSeek: SoundRecipe = (ac, out, at, durationSec) => {
  const d = safeDuration(durationSec, BOOT_SOUND_SEC.diskSeek);
  const g = createGraph(ac);
  const master = outputGain(g, out, at, d, 1, 0.005);

  const noise = noiseSource(g, at, d);
  const bandpass = g.node(ac.createBiquadFilter());
  bandpass.type = 'bandpass';
  bandpass.Q.value = 3;
  const clicks = g.node(ac.createGain());
  clicks.gain.value = 0;
  clicks.gain.setValueAtTime(0, at);

  const clickLen = Math.min(0.035, d / 4);
  const attack = clickLen / 15;
  const plan = [
    { at: 0, freq: 3200, peak: 0.8 },
    { at: 0.34, freq: 2600, peak: 0.55 },
    { at: 0.7, freq: 3600, peak: 0.9 },
  ] as const;
  for (const click of plan) {
    const t = at + click.at * d;
    bandpass.frequency.setValueAtTime(click.freq, t);
    pluck(clicks.gain, t, t + clickLen, click.peak, attack);
  }
  noise.connect(bandpass);
  bandpass.connect(clicks);
  clicks.connect(master);

  return g.finish();
};

/** Melody of the startup chime: A3, E4, C5, then down to A4 (A minor), with onsets as a share of the length. */
const CHIME_NOTES = [
  { hz: 220.0, at: 0 },
  { hz: 329.63, at: 0.1 },
  { hz: 523.25, at: 0.2 },
  { hz: 440.0, at: 0.32 },
] as const;

/** Pad voices: A2, E3 and A3, each slightly detuned so they beat against the melody. */
const CHIME_PAD = [
  { hz: 110.0, cents: -9 },
  { hz: 164.81, cents: 7 },
  { hz: 220.0, cents: 12 },
] as const;

/** Desktop startup chime: original four-note A-minor arpeggio on triangles over a detuned pad. */
export const startupChime: SoundRecipe = (ac, out, at, durationSec) => {
  const d = safeDuration(durationSec, BOOT_SOUND_SEC.startupChime);
  const end = at + d;
  const g = createGraph(ac);
  const master = outputGain(g, out, at, d, 1, 0.08);

  for (const note of CHIME_NOTES) {
    const start = at + note.at * d;
    const osc = oscillator(g, 'triangle', note.hz, start, end);
    const env = g.node(ac.createGain());
    env.gain.value = 0;
    pluck(env.gain, start, end, 0.18, Math.min(0.01, d / 50));
    osc.connect(env);
    env.connect(master);
  }

  const padFilter = g.node(ac.createBiquadFilter());
  padFilter.type = 'lowpass';
  padFilter.Q.value = 0.7;
  padFilter.frequency.setValueAtTime(900, at);
  const padGain = g.node(ac.createGain());
  padGain.gain.value = 0;
  padGain.gain.setValueAtTime(SILENT, at);
  padGain.gain.linearRampToValueAtTime(0.07, at + d * 0.35);
  padGain.gain.exponentialRampToValueAtTime(SILENT, end);
  padGain.gain.setValueAtTime(0, end);
  for (const voice of CHIME_PAD) {
    const osc = oscillator(g, 'triangle', voice.hz, at, end);
    osc.detune.setValueAtTime(voice.cents, at);
    osc.connect(padFilter);
  }
  padFilter.connect(padGain);
  padGain.connect(master);

  return g.finish();
};

/** Recipes for the boot cues, keyed by `BootSoundId`, for the Boot_Scene's cue lookup (Req 4.4). */
export const BOOT_SOUNDS: Readonly<Record<BootSoundId, SoundRecipe>> = {
  crtThunk,
  postBeep,
  diskSeek,
};
