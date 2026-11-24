/**
 * Theme_Song: the title screen's synthesized recipe, playing one pass of `THEME_SCORE`
 * (Req 3.1, 3.4, 3.8).
 *
 * Four instruments, all oscillators and filters built in code; no noise and no audio files:
 * - bass: triangle with a plucked decay to the note end,
 * - pad: two sawtooths detuned ±7 cents per chord tone, through one shared 900 Hz low-pass,
 * - bell: a sine plus a 2.76 × music-box partial, plucked,
 * - lead: a theremin-like sine with a 5.5 Hz vibrato.
 *
 * Recipe rules from `src/core/soundKit.ts`: every note comes from `themeSchedule(THEME_SCORE, d)`,
 * so it starts and ends inside `[at, at + d]`; everything routes through one output gain that
 * fades in from 0 and back to 0; the worst-case sum of the peaks is about 0.5; the recipe returns
 * `g.finish()`.
 */
import type { SoundRecipe } from '../../core/audio';
import {
  createGraph,
  filter,
  hold,
  oscillator,
  outputGain,
  pluck,
  safeDuration,
  silentGain,
  type Graph,
} from '../../core/soundKit';
import { TICK_RATE } from '../../game/types';
import { THEME_SCORE, passTicks, themeSchedule, type ScheduledNote } from './themeScore';

/** Length of one pass in seconds, measured in whole ticks: 1,440 / 60 = 24. */
export const THEME_PASS_SEC: number = passTicks(THEME_SCORE) / TICK_RATE;

const BASS_PEAK = 0.16;
const BASS_ATTACK = 0.01;

const PAD_PEAK = 0.03;
const PAD_DETUNE_CENTS = 7;
const PAD_FADE = 0.3;
const PAD_CUTOFF = 900;
const PAD_Q = 0.7;

const BELL_PEAK = 0.07;
const BELL_ATTACK = 0.003;
const BELL_PARTIAL_RATIO = 2.76;
const BELL_PARTIAL_LEVEL = 0.35;

const LEAD_PEAK = 0.08;
const LEAD_FADE = 0.08;
const LEAD_VIBRATO_HZ = 5.5;
const LEAD_VIBRATO_DEPTH = 0.006;

const OUTPUT_FADE = 0.02;

/** An attack that never takes more than a quarter of a (possibly clipped) note. */
function attackFor(start: number, end: number, attack: number): number {
  return Math.min(attack, (end - start) / 4);
}

function bass(g: Graph, master: AudioNode, hz: number, start: number, end: number): void {
  const osc = oscillator(g, 'triangle', hz, start, end);
  const env = silentGain(g);
  pluck(env.gain, start, end, BASS_PEAK, attackFor(start, end, BASS_ATTACK));
  osc.connect(env);
  env.connect(master);
}

function pad(g: Graph, padBus: AudioNode, hz: number, start: number, end: number): void {
  const env = silentGain(g);
  hold(env.gain, start, end, PAD_PEAK, PAD_FADE);
  for (const cents of [-PAD_DETUNE_CENTS, PAD_DETUNE_CENTS]) {
    const osc = oscillator(g, 'sawtooth', hz, start, end);
    osc.detune.setValueAtTime(cents, start);
    osc.connect(env);
  }
  env.connect(padBus);
}

function bell(g: Graph, master: AudioNode, hz: number, start: number, end: number): void {
  const env = silentGain(g);
  pluck(env.gain, start, end, BELL_PEAK, attackFor(start, end, BELL_ATTACK));

  const fundamental = oscillator(g, 'sine', hz, start, end);
  fundamental.connect(env);

  const partial = oscillator(g, 'sine', hz * BELL_PARTIAL_RATIO, start, end);
  const partialLevel = g.node(g.ac.createGain());
  partialLevel.gain.value = BELL_PARTIAL_LEVEL;
  partial.connect(partialLevel);
  partialLevel.connect(env);

  env.connect(master);
}

function lead(g: Graph, master: AudioNode, hz: number, start: number, end: number): void {
  const osc = oscillator(g, 'sine', hz, start, end);

  const lfo = oscillator(g, 'sine', LEAD_VIBRATO_HZ, start, end);
  const depth = g.node(g.ac.createGain());
  depth.gain.value = hz * LEAD_VIBRATO_DEPTH;
  lfo.connect(depth);
  depth.connect(osc.frequency);

  const env = silentGain(g);
  hold(env.gain, start, end, LEAD_PEAK, LEAD_FADE);
  osc.connect(env);
  env.connect(master);
}

function playNote(g: Graph, master: AudioNode, padBus: AudioNode, at: number, n: ScheduledNote): void {
  const start = at + n.start;
  const end = at + n.end;
  switch (n.instrument) {
    case 'bass':
      bass(g, master, n.hz, start, end);
      break;
    case 'pad':
      pad(g, padBus, n.hz, start, end);
      break;
    case 'bell':
      bell(g, master, n.hz, start, end);
      break;
    case 'lead':
      lead(g, master, n.hz, start, end);
      break;
  }
}

/** Plays themeSchedule(THEME_SCORE, d) into `out` (Req 3.1, 3.4, 3.8). */
export const themeSong: SoundRecipe = (ac, out, at, durationSec) => {
  const d = safeDuration(durationSec, THEME_PASS_SEC);
  const g = createGraph(ac);
  const master = outputGain(g, out, at, d, 1, OUTPUT_FADE);

  const padBus = filter(g, 'lowpass', PAD_CUTOFF, PAD_Q, at);
  padBus.connect(master);

  for (const n of themeSchedule(THEME_SCORE, d)) playNote(g, master, padBus, at, n);

  return g.finish();
};
