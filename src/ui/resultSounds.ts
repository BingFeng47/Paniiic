/**
 * Result_Sounds: synthesized cues for the result screen (Req 9.1, 10.1, 12.6).
 *
 * - `handshakeChime` plays when the download completes: the "carrier locked" blips, then an
 *   original rising D-major arpeggio written for this game. It imitates no real OS sound.
 * - `modemScreech` and `staticHiss` play together when the modem dies.
 *
 * Everything is built from oscillators, filters, gains and seeded noise generated in code;
 * nothing is loaded from files and nothing calls `Math.random`. The recipes follow the rules in
 * `src/core/soundKit.ts`: schedule inside `[at, at + durationSec]`, one output gain that fades in
 * from 0 and back to 0, and a stop function that is safe to call twice. Timings are written for
 * the natural length in `RESULT_SOUND_SEC` and scaled to the duration actually passed in, so a
 * shorter or longer play still stays inside its window.
 */
import type { SoundRecipe } from '../core/audio';
import {
  createGraph,
  filter,
  mulberry32,
  noiseSource,
  oscillator,
  outputGain,
  pluck,
  safeDuration,
  silentGain,
  type Graph,
} from '../core/soundKit';
import type { Outcome } from './resultScript';

export type ResultSoundId = 'handshakeChime' | 'modemScreech' | 'staticHiss';

/** Natural length of each sound in seconds; pass these to `AudioEngine.play`. */
export const RESULT_SOUND_SEC: Readonly<Record<ResultSoundId, number>> = Object.freeze({
  handshakeChime: 1.6,
  modemScreech: 1.2,
  // Same as the lose reveal (1,500 ms), so the hiss ends with the static effect.
  staticHiss: 1.5,
});

/** Seed for the screech's noise layer. */
const SCREECH_NOISE_SEED = 0x27d4eb2f;
/** Seed for the hiss's noise buffer. */
const HISS_NOISE_SEED = 0x165667b1;
/** Seed for the hiss's crackle levels, so every run (and every test) schedules the same values. */
const HISS_CRACKLE_SEED = 0xd3a2646c;

// ---------------------------------------------------------------------------------------------
// handshakeChime

/** The "carrier locked" beep: two short sine blips, onsets and lengths in seconds at 1.6 s. */
const CHIME_BLIPS = [
  { hz: 1200, at: 0, len: 0.07 },
  { hz: 2400, at: 0.09, len: 0.07 },
] as const;

/** D5, F♯5, A5, D6 in Hz. */
const CHIME_ARPEGGIO_HZ = [587.33, 739.99, 880.0, 1174.66] as const;
/** When the arpeggio starts and the gap between its notes, in seconds at 1.6 s. */
const CHIME_ARPEGGIO_START = 0.24;
const CHIME_NOTE_GAP = 0.11;
/** Ratio of the bell-like upper partial on each arpeggio note. */
const CHIME_PARTIAL = 2.76;

/** `osc` through its own plucked envelope from `start` to `end` at `peak`, into `out`. */
function plucked(g: Graph, osc: OscillatorNode, out: AudioNode, start: number, end: number, peak: number, attack: number): void {
  const env = silentGain(g);
  pluck(env.gain, start, end, peak, attack);
  osc.connect(env);
  env.connect(out);
}

/** Download complete: two carrier blips, then a rising D-major arpeggio with a long decay. */
export const handshakeChime: SoundRecipe = (ac, out, at, durationSec) => {
  const d = safeDuration(durationSec, RESULT_SOUND_SEC.handshakeChime);
  const scale = d / RESULT_SOUND_SEC.handshakeChime;
  const end = at + d;
  const g = createGraph(ac);
  const master = outputGain(g, out, at, d, 0.6, 0.1);

  for (const blip of CHIME_BLIPS) {
    const start = at + blip.at * scale;
    const stop = start + blip.len * scale;
    plucked(g, oscillator(g, 'sine', blip.hz, start, stop), master, start, stop, 0.18, Math.min(0.005, d / 100));
  }

  CHIME_ARPEGGIO_HZ.forEach((hz, i) => {
    const start = at + (CHIME_ARPEGGIO_START + i * CHIME_NOTE_GAP) * scale;
    const attack = Math.min(0.008, d / 100);
    plucked(g, oscillator(g, 'sine', hz, start, end), master, start, end, 0.12, attack);
    // The partial is quieter and dies sooner, like a struck bell.
    const partialEnd = start + (end - start) * 0.6;
    plucked(g, oscillator(g, 'sine', hz * CHIME_PARTIAL, start, partialEnd), master, start, partialEnd, 0.035, attack);
  });

  return g.finish();
};

// ---------------------------------------------------------------------------------------------
// modemScreech

const SCREECH_FROM_HZ = 3200;
const SCREECH_TO_HZ = 400;
const SCREECH_DETUNE_CENTS = 9;
const SCREECH_LFO_HZ = 23;
/** How far the square LFO pushes the sawtooth frequency, in Hz either way. */
const SCREECH_LFO_DEPTH_HZ = 120;

/** Modem dies: two detuned sawtooths sweeping 3,200 → 400 Hz with a 23 Hz warble, plus noise. */
export const modemScreech: SoundRecipe = (ac, out, at, durationSec) => {
  const d = safeDuration(durationSec, RESULT_SOUND_SEC.modemScreech);
  const end = at + d;
  const g = createGraph(ac);
  const master = outputGain(g, out, at, d, 0.5, 0.08);

  const bandpass = filter(g, 'bandpass', 1800, 2, at);
  bandpass.connect(master);

  const lfo = oscillator(g, 'square', SCREECH_LFO_HZ, at, end);
  const lfoDepth = g.node(ac.createGain());
  lfoDepth.gain.value = SCREECH_LFO_DEPTH_HZ;
  lfo.connect(lfoDepth);

  const sawGain = g.node(ac.createGain());
  sawGain.gain.value = 0.25;
  sawGain.connect(bandpass);
  for (const cents of [0, SCREECH_DETUNE_CENTS]) {
    const saw = oscillator(g, 'sawtooth', SCREECH_FROM_HZ, at, end);
    saw.detune.setValueAtTime(cents, at);
    saw.frequency.exponentialRampToValueAtTime(SCREECH_TO_HZ, end);
    lfoDepth.connect(saw.frequency);
    saw.connect(sawGain);
  }

  const noise = noiseSource(g, at, end, SCREECH_NOISE_SEED);
  const noiseGain = g.node(ac.createGain());
  noiseGain.gain.value = 0.3;
  noise.connect(noiseGain);
  noiseGain.connect(bandpass);

  return g.finish();
};

// ---------------------------------------------------------------------------------------------
// staticHiss

/** How often the crackle level jumps, in seconds. */
const HISS_STEP_SEC = 0.03;
/** Crackle levels fall in `[HISS_MIN, HISS_MIN + HISS_RANGE)`. */
const HISS_MIN = 0.15;
const HISS_RANGE = 0.6;

/** Line static: high-passed seeded noise whose level jumps every 30 ms for crackle. */
export const staticHiss: SoundRecipe = (ac, out, at, durationSec) => {
  const d = safeDuration(durationSec, RESULT_SOUND_SEC.staticHiss);
  const end = at + d;
  const g = createGraph(ac);
  const master = outputGain(g, out, at, d, 0.5, 0.1);

  const noise = noiseSource(g, at, end, HISS_NOISE_SEED);
  const highpass = filter(g, 'highpass', 1500, 0.7, at);
  const crackle = g.node(ac.createGain());
  crackle.gain.value = 0;

  const next = mulberry32(HISS_CRACKLE_SEED);
  const steps = Math.ceil(d / HISS_STEP_SEC);
  for (let i = 0; i < steps; i += 1) {
    crackle.gain.setValueAtTime(HISS_MIN + next() * HISS_RANGE, at + i * HISS_STEP_SEC);
  }
  crackle.gain.setValueAtTime(0, end);

  noise.connect(highpass);
  highpass.connect(crackle);
  crackle.connect(master);

  return g.finish();
};

// ---------------------------------------------------------------------------------------------
// Lookup

/** Recipes keyed by `ResultSoundId`, played with `RESULT_SOUND_SEC[id]`. */
export const RESULT_SOUNDS: Readonly<Record<ResultSoundId, SoundRecipe>> = Object.freeze({
  handshakeChime,
  modemScreech,
  staticHiss,
});

const WON_SOUNDS: readonly ResultSoundId[] = Object.freeze(['handshakeChime']);
const LOST_SOUNDS: readonly ResultSoundId[] = Object.freeze(['modemScreech', 'staticHiss']);

/** won → ['handshakeChime']; lost → ['modemScreech', 'staticHiss'] (Req 9.1, 10.1). */
export function resultSoundsFor(outcome: Outcome): readonly ResultSoundId[] {
  return outcome === 'won' ? WON_SOUNDS : LOST_SOUNDS;
}
