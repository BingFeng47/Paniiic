/**
 * Camera sounds for the CCTV lane feed (lane-cctv Req 9.1, 9.3).
 *
 * Both recipes are built from Web Audio nodes only (oscillators, filters and seeded noise made in
 * code) and follow the `src/core/soundKit.ts` rules: everything is scheduled inside
 * `[at, at + durationSec]`, one output gain fades in from 0 and back to 0, and the returned stop
 * function is safe to call twice. Play them through the Sfx_Channel:
 * `engine.play(cameraHum, CCTV_SOUND_SEC.cameraHum, 'sfx')`.
 */
import type { SoundRecipe } from '../../core/audio';
import { createGraph, filter, hold, noiseSource, oscillator, outputGain, safeDuration, silentGain } from '../../core/soundKit';
import { CCTV_TUNING } from './cctvTuning';

export type CctvSoundId = 'cameraHum' | 'cameraStatic';

/** Natural length of each sound in seconds. The hum outlasts any Run; stop its Voice on unmount. */
export const CCTV_SOUND_SEC: Readonly<Record<CctvSoundId, number>> = Object.freeze({
  cameraHum: 600,
  cameraStatic: 0.25,
});

/** Seed for the camera noise buffers, so every burst (and every test run) is identical. */
const NOISE_SEED = 0x27d4eb2f;

/** Mains hum: 60 Hz and 120 Hz sines plus faint band-passed noise, at `humLevel`. */
export const cameraHum: SoundRecipe = (ac, out, at, durationSec) => {
  const d = safeDuration(durationSec, CCTV_SOUND_SEC.cameraHum);
  const end = at + d;
  const g = createGraph(ac);
  const master = outputGain(g, out, at, d, CCTV_TUNING.humLevel, 0.2);
  for (const [freq, level] of [
    [60, 0.6],
    [120, 0.3],
  ] as const) {
    const env = silentGain(g);
    hold(env.gain, at, end, level, 0.2);
    oscillator(g, 'sine', freq, at, end).connect(env);
    env.connect(master);
  }
  const bandpass = filter(g, 'bandpass', 3000, 0.8, at);
  const hiss = silentGain(g);
  hold(hiss.gain, at, end, 0.1, 0.2);
  noiseSource(g, at, end, NOISE_SEED).connect(bandpass);
  bandpass.connect(hiss);
  hiss.connect(master);
  return g.finish();
};

/** Camera static burst: 250 ms of band-passed white noise at `staticLevel`. */
export const cameraStatic: SoundRecipe = (ac, out, at, durationSec) => {
  const d = safeDuration(durationSec, CCTV_SOUND_SEC.cameraStatic);
  const end = at + d;
  const g = createGraph(ac);
  const master = outputGain(g, out, at, d, CCTV_TUNING.staticLevel, 0.04);
  const bandpass = filter(g, 'bandpass', 2500, 0.7, at);
  noiseSource(g, at, end, NOISE_SEED).connect(bandpass);
  bandpass.connect(master);
  return g.finish();
};

/** Recipes keyed by `CctvSoundId`, played with `CCTV_SOUND_SEC[id]` on the 'sfx' channel. */
export const CCTV_SOUNDS: Readonly<Record<CctvSoundId, SoundRecipe>> = Object.freeze({ cameraHum, cameraStatic });
