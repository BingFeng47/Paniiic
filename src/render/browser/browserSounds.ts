/**
 * Browser_Sounds: short synthesized cues for the browser front (browser-front Req 13.1, 13.2).
 *
 * Everything is built from oscillators, filters and seeded noise generated in code; nothing is
 * loaded from files. The recipes follow the `src/core/soundKit.ts` rules: schedule inside
 * `[at, at + durationSec]`, one output gain that fades in from 0 and back to 0, and a stop
 * function that is safe to call twice.
 */
import type { AudioEngine, SoundRecipe, Voice } from '../../core/audio';
import {
  createGraph,
  filter,
  hold,
  noiseSource,
  oscillator,
  outputGain,
  pluck,
  safeDuration,
  silentGain,
  type Graph,
} from '../../core/soundKit';
import type { GameEvent } from '../../game/types';

export type BrowserSoundId = 'adDing' | 'interrupterAlert' | 'adClose' | 'mistakeBuzz' | 'fakeBuzz' | 'closeSkitter' | 'hatch';

/** Natural length of each sound in seconds; pass these to `AudioEngine.play`. */
export const BROWSER_SOUND_SEC: Readonly<Record<BrowserSoundId, number>> = Object.freeze({
  adDing: 0.35,
  interrupterAlert: 0.45,
  adClose: 0.1,
  mistakeBuzz: 0.25,
  fakeBuzz: 0.4,
  closeSkitter: 0.15,
  hatch: 0.9,
});

const NOISE_SEED = 0x27d4eb2f;
const BROWSER_LEVEL = 0.45;

/** A tone plucked from `start` to `end` at `peak`, into `out`. */
function tone(g: Graph, osc: OscillatorNode, out: AudioNode, start: number, end: number, peak: number, attack: number): void {
  const env = silentGain(g);
  pluck(env.gain, start, end, peak, attack);
  osc.connect(env);
  env.connect(out);
}

/** Clutter ad bounces in: two sine partials (1320 and 1980 Hz), like a little bell. */
export const adDing: SoundRecipe = (ac, out, at, durationSec) => {
  const d = safeDuration(durationSec, BROWSER_SOUND_SEC.adDing);
  const end = at + d;
  const g = createGraph(ac);
  const master = outputGain(g, out, at, d, BROWSER_LEVEL, 0.02);
  const attack = Math.min(0.003, d / 50);
  tone(g, oscillator(g, 'sine', 1320, at, end), master, at, end, 0.4, attack);
  tone(g, oscillator(g, 'sine', 1980, at, at + d * 0.6), master, at, at + d * 0.6, 0.2, attack);
  return g.finish();
};

/** Interrupter opens: two descending square beeps (880 then 660 Hz) through a low-pass. */
export const interrupterAlert: SoundRecipe = (ac, out, at, durationSec) => {
  const d = safeDuration(durationSec, BROWSER_SOUND_SEC.interrupterAlert);
  const g = createGraph(ac);
  const master = outputGain(g, out, at, d, BROWSER_LEVEL, 0.02);
  const lowpass = filter(g, 'lowpass', 2500, 0.7, at);
  lowpass.connect(master);
  const half = d / 2;
  for (const [i, freq] of [
    [0, 880],
    [1, 660],
  ] as const) {
    const start = at + i * half;
    const stop = start + half * 0.9;
    tone(g, oscillator(g, 'square', freq, start, stop), lowpass, start, stop, 0.3, Math.min(0.004, half / 20));
  }
  return g.finish();
};

/** Ad closed: a short click, high-passed noise tick plus a 2 kHz blip. */
export const adClose: SoundRecipe = (ac, out, at, durationSec) => {
  const d = safeDuration(durationSec, BROWSER_SOUND_SEC.adClose);
  const end = at + d;
  const g = createGraph(ac);
  const master = outputGain(g, out, at, d, BROWSER_LEVEL, 0.01);
  const tickEnd = at + Math.min(0.03, d / 2);
  const noise = noiseSource(g, at, tickEnd, NOISE_SEED);
  const highpass = filter(g, 'highpass', 3000, 0.7, at);
  const env = silentGain(g);
  pluck(env.gain, at, tickEnd, 0.35, Math.min(0.002, d / 20));
  noise.connect(highpass);
  highpass.connect(env);
  env.connect(master);
  tone(g, oscillator(g, 'sine', 2000, at, end), master, at, end, 0.25, Math.min(0.002, d / 20));
  return g.finish();
};

/** Wrong control: a low sawtooth buzz at 110 Hz through a band-pass. */
export const mistakeBuzz: SoundRecipe = (ac, out, at, durationSec) => {
  const d = safeDuration(durationSec, BROWSER_SOUND_SEC.mistakeBuzz);
  const end = at + d;
  const g = createGraph(ac);
  const master = outputGain(g, out, at, d, BROWSER_LEVEL, 0.02);
  const bandpass = filter(g, 'bandpass', 400, 1.2, at);
  bandpass.connect(master);
  tone(g, oscillator(g, 'sawtooth', 110, at, end), bandpass, at, end, 0.5, Math.min(0.005, d / 20));
  return g.finish();
};

/** Fake button clicked: a harsh detuned square buzz falling 220 → 90 Hz. */
export const fakeBuzz: SoundRecipe = (ac, out, at, durationSec) => {
  const d = safeDuration(durationSec, BROWSER_SOUND_SEC.fakeBuzz);
  const end = at + d;
  const g = createGraph(ac);
  const master = outputGain(g, out, at, d, BROWSER_LEVEL, 0.03);
  const lowpass = filter(g, 'lowpass', 1800, 1, at);
  lowpass.connect(master);
  for (const freq of [220, 227]) {
    const osc = oscillator(g, 'square', freq, at, end);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.4, end);
    tone(g, osc, lowpass, at, end, 0.25, Math.min(0.005, d / 20));
  }
  return g.finish();
};

/** Runaway ✕ jumps: three quick rising triangle chirps. */
export const closeSkitter: SoundRecipe = (ac, out, at, durationSec) => {
  const d = safeDuration(durationSec, BROWSER_SOUND_SEC.closeSkitter);
  const g = createGraph(ac);
  const master = outputGain(g, out, at, d, BROWSER_LEVEL, 0.01);
  const step = d / 3;
  for (let i = 0; i < 3; i += 1) {
    const start = at + i * step;
    const stop = start + step * 0.8;
    const osc = oscillator(g, 'triangle', 1200 + i * 300, start, stop);
    osc.frequency.exponentialRampToValueAtTime(2400 + i * 300, stop);
    tone(g, osc, master, start, stop, 0.35, Math.min(0.002, step / 10));
  }
  return g.finish();
};

/**
 * A clutter Ad hatches a zombie (ad-pressure Req 7.3): a wood creak, then a low groan under it.
 * - Creak, first 55%: a sawtooth stick-slip pulse train that wavers 38 → 58 → 42 → 72 Hz. A
 *   high-pass at 250 Hz drops the buzz and a resonant low-pass sweeping 800 → 1400 Hz gives the
 *   wood its ring.
 * - Groan, from 30% to the end: two detuned sawtooths (92 and 95.5 Hz) falling by a third
 *   through a 520 Hz low-pass.
 */
export const hatch: SoundRecipe = (ac, out, at, durationSec) => {
  const d = safeDuration(durationSec, BROWSER_SOUND_SEC.hatch);
  const end = at + d;
  const g = createGraph(ac);
  const master = outputGain(g, out, at, d, BROWSER_LEVEL, 0.08);

  const creakEnd = at + d * 0.55;
  const highpass = filter(g, 'highpass', 250, 0.7, at);
  const ring = filter(g, 'lowpass', 800, 14, at);
  ring.frequency.exponentialRampToValueAtTime(1400, creakEnd);
  highpass.connect(ring);
  const creakEnv = silentGain(g);
  hold(creakEnv.gain, at, creakEnd, 0.8, 0.03);
  ring.connect(creakEnv);
  creakEnv.connect(master);
  const creak = oscillator(g, 'sawtooth', 38, at, creakEnd);
  creak.frequency.exponentialRampToValueAtTime(58, at + d * 0.2);
  creak.frequency.exponentialRampToValueAtTime(42, at + d * 0.38);
  creak.frequency.exponentialRampToValueAtTime(72, creakEnd);
  creak.connect(highpass);

  const groanStart = at + d * 0.3;
  const lowpass = filter(g, 'lowpass', 520, 1.5, at);
  lowpass.connect(master);
  for (const freq of [92, 95.5]) {
    const osc = oscillator(g, 'sawtooth', freq, groanStart, end);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.68, end);
    const env = silentGain(g);
    hold(env.gain, groanStart, end, 0.35, 0.12);
    osc.connect(env);
    env.connect(lowpass);
  }
  return g.finish();
};

/** Recipes keyed by `BrowserSoundId`, played with `BROWSER_SOUND_SEC[id]`. */
export const BROWSER_SOUNDS: Readonly<Record<BrowserSoundId, SoundRecipe>> = Object.freeze({
  adDing,
  interrupterAlert,
  adClose,
  mistakeBuzz,
  fakeBuzz,
  closeSkitter,
  hatch,
});

function soundFor(event: GameEvent): BrowserSoundId | null {
  switch (event.type) {
    case 'adOpened':
      return event.kind === 'interrupter' ? 'interrupterAlert' : 'adDing';
    case 'adClosed':
      return 'adClose';
    case 'adMistake':
      return 'mistakeBuzz';
    case 'fakeButtonClicked':
      return 'fakeBuzz';
    case 'adCloseJumped':
      return 'closeSkitter';
    case 'adHatched':
      return 'hatch';
    default:
      return null;
  }
}

/** One id per matching sound, in order of first occurrence (Req 13.1, 13.2). */
export function browserSoundsFor(events: readonly GameEvent[]): readonly BrowserSoundId[] {
  const ids: BrowserSoundId[] = [];
  for (const event of events) {
    const id = soundFor(event);
    if (id !== null && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

export interface BrowserSoundPlayer {
  /** Plays each matching recipe once for this frame's events. */
  play(events: readonly GameEvent[]): void;
  /** Stops every voice this player started (for unmount). Safe to call more than once. */
  stopAll(): void;
}

/** Tracks the voices it starts so the Browser_View can stop them on unmount. */
export function createBrowserSoundPlayer(audio: Pick<AudioEngine, 'play'>): BrowserSoundPlayer {
  let voices: Voice[] = [];
  return {
    play(events) {
      for (const id of browserSoundsFor(events)) {
        voices.push(audio.play(BROWSER_SOUNDS[id], BROWSER_SOUND_SEC[id], 'sfx'));
      }
      // Keep the list short over a long run. Only the oldest references are dropped; every cue is
      // at most 0.9 s long, so a dropped voice has almost always ended and otherwise ends by itself.
      if (voices.length > 256) voices = voices.slice(-256);
    },
    stopAll() {
      for (const v of voices) v.stop();
      voices = [];
    },
  };
}
