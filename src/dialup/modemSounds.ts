/**
 * Modem_Sounds: synthesized recipes for the dial-up call (Req 12.2, 12.3, 12.5).
 *
 * The call runs dial tone, DTMF digits, ringback, then the handshake: the answering modem's
 * 2100 Hz answer tone with phase-reversal dips, fast FSK chirps, the line-probe chord and the
 * band-passed noise "screech" of training. Everything is built from oscillators, filters and
 * noise generated in code; nothing is loaded from files (Req 12.7). The handshake is an original
 * synthesis compressed into the 10 s negotiating stage, not a recording of any real modem.
 *
 * Every recipe follows the same rules as `bootSounds.ts`:
 * - schedules everything inside `[at, at + durationSec]` and stops its own sources by the end,
 * - routes through one output gain that fades in from 0 and back to 0, so it starts and ends
 *   without a click, and keeps its summed peak well below 1,
 * - returns a stop function that stops every source now and disconnects every node. Calling it
 *   twice, or after the sound ended on its own, is safe.
 */
import type { SoundRecipe } from '../core/audio';
import {
  SILENT,
  createGraph,
  filter,
  hold,
  mulberry32,
  noiseSource as seededNoise,
  oscillator,
  outputGain,
  safeDuration,
  silentGain,
  type Graph,
} from '../core/soundKit';

// ---------------------------------------------------------------------------------------------
// Tables

export const DIAL_TONE_HZ = [350, 440] as const;
export const RINGBACK_HZ = [440, 480] as const;

/** DTMF row and column frequencies in Hz for each key of a phone keypad. */
export const DTMF: Readonly<Record<string, readonly [number, number]>> = Object.freeze({
  '1': [697, 1209],
  '2': [697, 1336],
  '3': [697, 1477],
  '4': [770, 1209],
  '5': [770, 1336],
  '6': [770, 1477],
  '7': [852, 1209],
  '8': [852, 1336],
  '9': [852, 1477],
  '*': [941, 1209],
  '0': [941, 1336],
  '#': [941, 1477],
});

/** The number the Dialer calls (555-0199). */
export const PHONE_DIGITS = '5550199';

/**
 * Natural length of each sound in seconds, matching the 20 s dial-up stages. Recipes fall back
 * to these when given a non-finite or non-positive duration.
 */
export const MODEM_SOUND_SEC = {
  dialTone: 1.5,
  dtmf: 1.5,
  ringback: 2,
  handshake: 10,
  relayClick: 0.015,
} as const;

export type ModemSoundId = keyof typeof MODEM_SOUND_SEC;

export interface HandshakeSegment {
  readonly kind: 'answerTone' | 'fsk' | 'probe' | 'training';
  readonly start: number;
  readonly end: number;
}

/** Where each handshake part ends, as a share of the whole handshake. */
const HANDSHAKE_SHARES = [
  { kind: 'answerTone', end: 0.25 },
  { kind: 'fsk', end: 0.45 },
  { kind: 'probe', end: 0.55 },
  { kind: 'training', end: 1 },
] as const;

/**
 * Pure: segment times in seconds for a handshake of `durationSec` (Req 12.3). Returns the four
 * parts in order, contiguous from 0 to exactly `durationSec`. A non-finite or non-positive
 * duration has no handshake, so the result is empty.
 */
export function handshakePlan(durationSec: number): readonly HandshakeSegment[] {
  if (!Number.isFinite(durationSec) || durationSec <= 0) return [];
  let start = 0;
  return HANDSHAKE_SHARES.map(({ kind, end: share }) => {
    const end = share === 1 ? durationSec : durationSec * share;
    const segment: HandshakeSegment = { kind, start, end };
    start = end;
    return segment;
  });
}

// ---------------------------------------------------------------------------------------------
// Helpers (shared building blocks live in src/core/soundKit.ts)

/** Seeds for the noise buffer and the FSK bit pattern, so every call (and test) is identical. */
const NOISE_SEED = 0x2545f491;
const FSK_SEED = 0x1b873593;

/** Seeded noise from `start` to `end`. */
function noiseSource(g: Graph, start: number, end: number): AudioBufferSourceNode {
  return seededNoise(g, start, end, NOISE_SEED);
}

/** Steady tones summed at `levelEach`, through one gain that fades in and out. */
function steadyTones(
  g: Graph,
  master: AudioNode,
  freqs: readonly number[],
  start: number,
  end: number,
  levelEach: number,
): void {
  const env = silentGain(g);
  hold(env.gain, start, end, levelEach, 0.015);
  for (const hz of freqs) oscillator(g, 'sine', hz, start, end).connect(env);
  env.connect(master);
}

// ---------------------------------------------------------------------------------------------
// Call progress recipes

/** Dial tone: 350 + 440 Hz sines at gain 0.12 each, for the whole stage. */
export const dialTone: SoundRecipe = (ac, out, at, durationSec) => {
  const d = safeDuration(durationSec, MODEM_SOUND_SEC.dialTone);
  const g = createGraph(ac);
  const master = outputGain(g, out, at, d, 1, 0.02);
  steadyTones(g, master, DIAL_TONE_HZ, at, at + d, 0.12);
  return g.finish();
};

/**
 * DTMF dialing of `PHONE_DIGITS`: each digit gets an equal slot of the stage and sounds its row
 * and column sines for `min(0.1, d / 7 × 0.55)` s at the start of that slot. The column tone is
 * a little louder than the row tone, as on a real phone line ("twist").
 */
export const dtmf: SoundRecipe = (ac, out, at, durationSec) => {
  const d = safeDuration(durationSec, MODEM_SOUND_SEC.dtmf);
  const g = createGraph(ac);
  const master = outputGain(g, out, at, d, 1, 0.005);
  const slot = d / PHONE_DIGITS.length;
  const toneLen = Math.min(0.1, slot * 0.55);
  [...PHONE_DIGITS].forEach((digit, i) => {
    const pair = DTMF[digit];
    if (!pair) return;
    const start = at + i * slot;
    const end = start + toneLen;
    const [row, column] = pair;
    for (const [hz, level] of [
      [row, 0.09],
      [column, 0.11],
    ] as const) {
      const env = silentGain(g);
      hold(env.gain, start, end, level, 0.004);
      oscillator(g, 'sine', hz, start, end).connect(env);
      env.connect(master);
    }
  });
  return g.finish();
};

/** Ringback: 440 + 480 Hz sines, on for `min(1.6, 0.8 d)` s, then silence. */
export const ringback: SoundRecipe = (ac, out, at, durationSec) => {
  const d = safeDuration(durationSec, MODEM_SOUND_SEC.ringback);
  const on = Math.min(1.6, 0.8 * d);
  const g = createGraph(ac);
  const master = outputGain(g, out, at, on, 1, 0.02);
  steadyTones(g, master, RINGBACK_HZ, at, at + on, 0.1);
  return g.finish();
};

/** Relay click on connect: a 15 ms noise burst through a high-pass filter (Req 12.5). */
export const relayClick: SoundRecipe = (ac, out, at, durationSec) => {
  const len = Math.min(MODEM_SOUND_SEC.relayClick, safeDuration(durationSec, MODEM_SOUND_SEC.relayClick));
  const end = at + len;
  const g = createGraph(ac);
  const master = outputGain(g, out, at, len, 1, len / 4);
  const noise = noiseSource(g, at, end);
  const highpass = filter(g, 'highpass', 2500, 0.7, at);
  const env = silentGain(g);
  env.gain.setValueAtTime(SILENT, at);
  env.gain.linearRampToValueAtTime(0.5, at + len / 30);
  env.gain.exponentialRampToValueAtTime(SILENT, end);
  env.gain.setValueAtTime(0, end);
  noise.connect(highpass);
  highpass.connect(env);
  env.connect(master);
  return g.finish();
};

// ---------------------------------------------------------------------------------------------
// Handshake

/** Answer tone (ANSam): 2100 Hz with a 15 Hz wobble and a phase reversal every 450 ms. */
const ANSWER_HZ = 2100;
const ANSWER_LEVEL = 0.14;
const ANSWER_AM_HZ = 15;
const ANSWER_AM_DEPTH = 0.2;
const REVERSAL_SEC = 0.45;

/** V.21 FSK channels as [mark, space] in Hz: the calling and the answering modem. */
const FSK_CHANNELS = [
  [980, 1180],
  [1650, 1850],
] as const;
const FSK_LEVEL = 0.08;

/** Line probe: sines every 150 Hz from 150 to 3750 Hz, first loud (L1), then quieter (L2). */
const PROBE_HZ: readonly number[] = Array.from({ length: 25 }, (_, i) => 150 * (i + 1));
const PROBE_L1_LEVEL = 0.014;
const PROBE_L2_LEVEL = 0.008;

/** Training: band-passed noise around 1800 Hz plus a quiet sawtooth screech. */
const TRAINING_HZ = 1800;
const TRAINING_LEVEL = 0.55;
const SCREECH_LEVEL = 0.025;

/** 2100 Hz sine with a 15 Hz amplitude wobble and a short gain dip at every phase reversal. */
function answerTone(g: Graph, line: AudioNode, start: number, end: number): void {
  const { ac } = g;
  const tone = oscillator(g, 'sine', ANSWER_HZ, start, end);

  const wobble = g.node(ac.createGain());
  wobble.gain.value = 1;
  const lfo = oscillator(g, 'sine', ANSWER_AM_HZ, start, end);
  const lfoDepth = g.node(ac.createGain());
  lfoDepth.gain.value = ANSWER_AM_DEPTH;
  lfo.connect(lfoDepth);
  lfoDepth.connect(wobble.gain);

  const dips = g.node(ac.createGain());
  dips.gain.value = 1;
  dips.gain.setValueAtTime(1, start);
  const halfDip = 0.012;
  for (let t = start + REVERSAL_SEC; t + halfDip < end - 0.02; t += REVERSAL_SEC) {
    dips.gain.setValueAtTime(1, t - halfDip);
    dips.gain.linearRampToValueAtTime(0.1, t);
    dips.gain.linearRampToValueAtTime(1, t + halfDip);
  }

  const env = silentGain(g);
  hold(env.gain, start, end, ANSWER_LEVEL, 0.02);
  tone.connect(wobble);
  wobble.connect(dips);
  dips.connect(env);
  env.connect(line);
}

/**
 * FSK exchange: one square oscillator, low-passed, in short bursts that alternate between the
 * calling and the answering channel. Inside a burst it jumps between the channel's mark and
 * space frequency every 20–40 ms on a seeded bit pattern.
 */
function fskChirps(g: Graph, line: AudioNode, start: number, end: number): void {
  const rand = mulberry32(FSK_SEED);
  const len = end - start;
  const fade = Math.min(0.005, len / 40);
  const lead = Math.min(0.05, len / 10);
  const lastEnd = end - lead;

  const osc = oscillator(g, 'square', FSK_CHANNELS[0][0], start, end);
  const lowpass = filter(g, 'lowpass', 2600, 0.7, start);
  const env = silentGain(g);
  env.gain.setValueAtTime(0, start);

  let t = start + lead;
  let channel = 0;
  while (t + 4 * fade < lastEnd) {
    const burstEnd = Math.min(t + 0.12 + rand() * 0.14, lastEnd);
    const pair = FSK_CHANNELS[channel] ?? FSK_CHANNELS[0];
    for (let hop = t; hop < burstEnd; hop += 0.02 + rand() * 0.02) {
      osc.frequency.setValueAtTime(rand() < 0.5 ? pair[0] : pair[1], hop);
    }
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(FSK_LEVEL, t + fade);
    env.gain.setValueAtTime(FSK_LEVEL, burstEnd - fade);
    env.gain.linearRampToValueAtTime(0, burstEnd);
    t = burstEnd + 0.015 + rand() * 0.025;
    channel = 1 - channel;
  }

  osc.connect(lowpass);
  lowpass.connect(env);
  env.connect(line);
}

/** Line probe chord: every 150 Hz harmonic up to 3750 Hz, loud for the first quarter, then softer. */
function probeChord(g: Graph, line: AudioNode, start: number, end: number): void {
  const len = end - start;
  const fade = Math.min(0.01, len / 10);
  const l1End = start + len * 0.25;
  const env = silentGain(g);
  env.gain.setValueAtTime(0, start);
  env.gain.linearRampToValueAtTime(PROBE_L1_LEVEL, start + fade);
  env.gain.setValueAtTime(PROBE_L1_LEVEL, l1End);
  env.gain.linearRampToValueAtTime(PROBE_L2_LEVEL, l1End + fade);
  env.gain.setValueAtTime(PROBE_L2_LEVEL, end - fade);
  env.gain.linearRampToValueAtTime(0, end);
  for (const hz of PROBE_HZ) oscillator(g, 'sine', hz, start, end).connect(env);
  env.connect(line);
}

/**
 * Training screech: white noise through a broad 1800 Hz band-pass that sweeps slowly, with a
 * short dip where the modems change phase, plus a quiet sawtooth sweeping up and back down.
 */
function trainingScreech(g: Graph, line: AudioNode, start: number, end: number): void {
  const len = end - start;
  const fade = Math.min(0.02, len / 10);

  const noise = noiseSource(g, start, end);
  const bandpass = filter(g, 'bandpass', TRAINING_HZ, 0.9, start);
  bandpass.frequency.linearRampToValueAtTime(1500, start + len * 0.35);
  bandpass.frequency.linearRampToValueAtTime(2200, start + len * 0.8);
  bandpass.frequency.linearRampToValueAtTime(1900, end);
  const noiseEnv = silentGain(g);
  const dipAt = start + len * 0.35;
  const dipHalf = Math.min(0.04, len / 20);
  noiseEnv.gain.setValueAtTime(0, start);
  noiseEnv.gain.linearRampToValueAtTime(TRAINING_LEVEL * 0.75, start + fade);
  noiseEnv.gain.setValueAtTime(TRAINING_LEVEL * 0.75, dipAt - dipHalf);
  noiseEnv.gain.linearRampToValueAtTime(TRAINING_LEVEL * 0.15, dipAt);
  noiseEnv.gain.linearRampToValueAtTime(TRAINING_LEVEL, dipAt + dipHalf);
  noiseEnv.gain.setValueAtTime(TRAINING_LEVEL, end - fade);
  noiseEnv.gain.linearRampToValueAtTime(0, end);
  noise.connect(bandpass);
  bandpass.connect(noiseEnv);
  noiseEnv.connect(line);

  const saw = oscillator(g, 'sawtooth', 900, start, end);
  saw.frequency.exponentialRampToValueAtTime(2600, start + len * 0.6);
  saw.frequency.exponentialRampToValueAtTime(1700, end);
  const sawFilter = filter(g, 'lowpass', 3000, 0.7, start);
  const sawEnv = silentGain(g);
  hold(sawEnv.gain, start, end, SCREECH_LEVEL, fade);
  saw.connect(sawFilter);
  sawFilter.connect(sawEnv);
  sawEnv.connect(line);
}

const HANDSHAKE_PARTS: Readonly<
  Record<HandshakeSegment['kind'], (g: Graph, line: AudioNode, start: number, end: number) => void>
> = {
  answerTone,
  fsk: fskChirps,
  probe: probeChord,
  training: trainingScreech,
};

/**
 * Handshake in the four parts of `handshakePlan(d)` (Req 12.3), all through a telephone-band
 * filter (200–3600 Hz) so it sounds like a small modem speaker on a phone line.
 */
export const handshake: SoundRecipe = (ac, out, at, durationSec) => {
  const d = safeDuration(durationSec, MODEM_SOUND_SEC.handshake);
  const g = createGraph(ac);
  const master = outputGain(g, out, at, d, 1, 0.03);
  const highpass = filter(g, 'highpass', 200, 0.7, at);
  const lowpass = filter(g, 'lowpass', 3600, 0.7, at);
  highpass.connect(lowpass);
  lowpass.connect(master);
  for (const segment of handshakePlan(d)) {
    HANDSHAKE_PARTS[segment.kind](g, highpass, at + segment.start, at + segment.end);
  }
  return g.finish();
};

/**
 * Recipes keyed by the dial stage's sound id plus `relayClick` (Req 12.2, 12.5). The keys match
 * `Exclude<DialSoundId, null> | 'relayClick'` from `dialScript.ts`.
 */
export const MODEM_SOUNDS: Readonly<Record<ModemSoundId, SoundRecipe>> = {
  dialTone,
  dtmf,
  ringback,
  handshake,
  relayClick,
};
