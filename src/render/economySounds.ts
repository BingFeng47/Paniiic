/**
 * Economy_Sounds: synthesized cues for KB, the shop and the weapons (economy-weapons Req 12).
 *
 * Six one-shots play once per frame each when their event shows up (Req 12.1). The saw and the
 * flamethrower get looping sounds that start when firing starts and fade when it stops
 * (Req 12.2). Everything is oscillators, filters and seeded noise; no audio files (Req 12.3).
 * The recipes follow the rules in `src/core/soundKit.ts`.
 */
import type { AudioEngine, SoundRecipe, Voice } from '../core/audio';
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

export type EconomySoundId = 'coinBlip' | 'buyChime' | 'rejectBuzz' | 'surgeHum' | 'zap' | 'blockerSweep';
export type EconomyLoopId = 'sawWhine' | 'flameRoar';

/** Natural length of each one-shot in seconds; pass these to `AudioEngine.play`. */
export const ECONOMY_SOUND_SEC: Readonly<Record<EconomySoundId, number>> = Object.freeze({
  coinBlip: 0.09,
  buyChime: 0.35,
  rejectBuzz: 0.2,
  surgeHum: 0.5,
  zap: 0.15,
  blockerSweep: 0.4,
});

/**
 * Scheduled length of a loop voice. Loops are stopped with a fade long before this; the length
 * only bounds a voice that was somehow never stopped.
 */
export const LOOP_SEC = 600;
/** Fade applied when a loop stops, so it ends without a click. */
export const LOOP_FADE_SEC = 0.06;

const NOISE_SEED = 0x27d4eb2f;
const LEVEL = 0.45;
/** Loops play under the one-shots, since they run for seconds at a time. */
const LOOP_LEVEL = 0.25;

function tone(g: Graph, osc: OscillatorNode, out: AudioNode, start: number, end: number, peak: number, attack: number): void {
  const env = silentGain(g);
  pluck(env.gain, start, end, peak, attack);
  osc.connect(env);
  env.connect(out);
}

// ---------------------------------------------------------------------------------------------
// One-shots

/** Packet grabbed: two quick square blips, 988 then 1319 Hz. */
export const coinBlip: SoundRecipe = (ac, out, at, durationSec) => {
  const d = safeDuration(durationSec, ECONOMY_SOUND_SEC.coinBlip);
  const end = at + d;
  const g = createGraph(ac);
  const master = outputGain(g, out, at, d, LEVEL, 0.01);
  const lp = filter(g, 'lowpass', 3000, 0.7, at);
  lp.connect(master);
  const mid = at + d * 0.35;
  tone(g, oscillator(g, 'square', 988, at, mid), lp, at, mid, 0.3, 0.002);
  tone(g, oscillator(g, 'square', 1319, mid, end), lp, mid, end, 0.3, 0.002);
  return g.finish();
};

/** Item bought: a rising C–E–G triangle arpeggio. */
export const buyChime: SoundRecipe = (ac, out, at, durationSec) => {
  const d = safeDuration(durationSec, ECONOMY_SOUND_SEC.buyChime);
  const end = at + d;
  const g = createGraph(ac);
  const master = outputGain(g, out, at, d, LEVEL, 0.03);
  const notes = [523, 659, 784] as const;
  notes.forEach((freq, i) => {
    const start = at + (i * d) / 5;
    tone(g, oscillator(g, 'triangle', freq, start, end), master, start, end, 0.25, 0.004);
  });
  return g.finish();
};

/** Buy rejected: a low detuned square buzz through a band-pass. */
export const rejectBuzz: SoundRecipe = (ac, out, at, durationSec) => {
  const d = safeDuration(durationSec, ECONOMY_SOUND_SEC.rejectBuzz);
  const end = at + d;
  const g = createGraph(ac);
  const master = outputGain(g, out, at, d, LEVEL, 0.02);
  const bp = filter(g, 'bandpass', 400, 1, at);
  bp.connect(master);
  tone(g, oscillator(g, 'square', 110, at, end), bp, at, end, 0.35, 0.005);
  tone(g, oscillator(g, 'square', 116, at, end), bp, at, end, 0.3, 0.005);
  return g.finish();
};

/** Surge protector switches on: a 60 Hz sawtooth hum swelling up through a rising low-pass. */
export const surgeHum: SoundRecipe = (ac, out, at, durationSec) => {
  const d = safeDuration(durationSec, ECONOMY_SOUND_SEC.surgeHum);
  const end = at + d;
  const g = createGraph(ac);
  const master = outputGain(g, out, at, d, LEVEL, 0.05);
  const lp = filter(g, 'lowpass', 200, 2, at);
  lp.frequency.exponentialRampToValueAtTime(1800, at + d * 0.6);
  lp.connect(master);
  tone(g, oscillator(g, 'sawtooth', 60, at, end), lp, at, end, 0.4, d * 0.3);
  tone(g, oscillator(g, 'sawtooth', 120, at, end), lp, at, end, 0.2, d * 0.3);
  return g.finish();
};

/** A modem hit blocked by the shield: high-passed noise crack plus a falling square. */
export const zap: SoundRecipe = (ac, out, at, durationSec) => {
  const d = safeDuration(durationSec, ECONOMY_SOUND_SEC.zap);
  const end = at + d;
  const g = createGraph(ac);
  const master = outputGain(g, out, at, d, LEVEL, 0.01);
  const hp = filter(g, 'highpass', 2500, 0.8, at);
  const env = silentGain(g);
  pluck(env.gain, at, end, 0.35, 0.002);
  noiseSource(g, at, end, NOISE_SEED).connect(hp);
  hp.connect(env);
  env.connect(master);
  const sq = oscillator(g, 'square', 1800, at, end);
  sq.frequency.exponentialRampToValueAtTime(300, end);
  tone(g, sq, master, at, end, 0.2, 0.002);
  return g.finish();
};

/** Pop-up blocker starts: band-passed noise sweeping 400 → 4000 Hz, like a broom. */
export const blockerSweep: SoundRecipe = (ac, out, at, durationSec) => {
  const d = safeDuration(durationSec, ECONOMY_SOUND_SEC.blockerSweep);
  const end = at + d;
  const g = createGraph(ac);
  const master = outputGain(g, out, at, d, LEVEL, 0.03);
  const bp = filter(g, 'bandpass', 400, 2, at);
  bp.frequency.exponentialRampToValueAtTime(4000, end);
  const env = silentGain(g);
  pluck(env.gain, at, end, 0.5, d * 0.4);
  noiseSource(g, at, end, NOISE_SEED + 1).connect(bp);
  bp.connect(env);
  env.connect(master);
  return g.finish();
};

// ---------------------------------------------------------------------------------------------
// Combo blip (pacing-and-economy Req 5.5)

/** Length of one combo blip in seconds. */
export const COMBO_BLIP_SEC = 0.08;
/** Chain length at which the blip stops rising. */
export const COMBO_PITCH_CAP = 10;

/** Blip pitch for a chain of `count`: 440 × 2^(min(N, 10) / 12) Hz, one semitone per kill. */
export function comboBlipHz(count: number): number {
  return 440 * 2 ** (Math.min(count, COMBO_PITCH_CAP) / 12);
}

/** A short square blip at `comboBlipHz(count)`, softened by a low-pass. */
export function comboBlip(count: number): SoundRecipe {
  const freq = comboBlipHz(count);
  const comboBlipRecipe: SoundRecipe = (ac, out, at, durationSec) => {
    const d = safeDuration(durationSec, COMBO_BLIP_SEC);
    const end = at + d;
    const g = createGraph(ac);
    const master = outputGain(g, out, at, d, LEVEL, 0.01);
    const lp = filter(g, 'lowpass', 3000, 0.7, at);
    lp.connect(master);
    tone(g, oscillator(g, 'square', freq, at, end), lp, at, end, 0.3, 0.002);
    return g.finish();
  };
  return comboBlipRecipe;
}

/** The longest chain among this frame's `combo` events, or null: one blip per frame. */
export function comboBlipCount(events: readonly GameEvent[]): number | null {
  let best: number | null = null;
  for (const e of events) if (e.type === 'combo' && (best === null || e.count > best)) best = e.count;
  return best;
}

export const ECONOMY_SOUNDS: Readonly<Record<EconomySoundId, SoundRecipe>> = Object.freeze({
  coinBlip,
  buyChime,
  rejectBuzz,
  surgeHum,
  zap,
  blockerSweep,
});

const EVENT_SOUND: Readonly<Partial<Record<GameEvent['type'], EconomySoundId>>> = Object.freeze({
  packetCollected: 'coinBlip',
  itemBought: 'buyChime',
  buyRejected: 'rejectBuzz',
  surgeStarted: 'surgeHum',
  modemHitBlocked: 'zap',
  blockerStarted: 'blockerSweep',
});

/** One id per matching sound, in order of first occurrence (Req 12.1). */
export function economySoundsFor(events: readonly GameEvent[]): readonly EconomySoundId[] {
  const ids: EconomySoundId[] = [];
  for (const event of events) {
    const id = Object.prototype.hasOwnProperty.call(EVENT_SOUND, event.type) ? EVENT_SOUND[event.type] : undefined;
    if (id !== undefined && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

// ---------------------------------------------------------------------------------------------
// Loops

/** Saw firing: a 180 Hz sawtooth with a fast 22 Hz wobble, through a resonant band-pass. */
export const sawWhine: SoundRecipe = (ac, out, at, durationSec) => {
  const d = safeDuration(durationSec, LOOP_SEC);
  const end = at + d;
  const g = createGraph(ac);
  const master = outputGain(g, out, at, d, LOOP_LEVEL, 0.02);
  const bp = filter(g, 'bandpass', 1400, 3, at);
  bp.connect(master);
  const saw = oscillator(g, 'sawtooth', 180, at, end);
  const lfo = oscillator(g, 'sine', 22, at, end);
  const depth = g.node(ac.createGain());
  depth.gain.value = 12;
  lfo.connect(depth);
  depth.connect(saw.frequency);
  const level = g.node(ac.createGain());
  level.gain.value = 0.6;
  saw.connect(level);
  level.connect(bp);
  return g.finish();
};

/** Flamethrower firing: low-passed noise with a slow 7 Hz flutter on its level. */
export const flameRoar: SoundRecipe = (ac, out, at, durationSec) => {
  const d = safeDuration(durationSec, LOOP_SEC);
  const end = at + d;
  const g = createGraph(ac);
  const master = outputGain(g, out, at, d, LOOP_LEVEL, 0.02);
  const lp = filter(g, 'lowpass', 700, 1, at);
  const body = g.node(ac.createGain());
  body.gain.value = 0.5;
  noiseSource(g, at, end, NOISE_SEED + 2, d).connect(lp);
  lp.connect(body);
  body.connect(master);
  const lfo = oscillator(g, 'sine', 7, at, end);
  const depth = g.node(ac.createGain());
  depth.gain.value = 0.15;
  lfo.connect(depth);
  depth.connect(body.gain);
  return g.finish();
};

export const ECONOMY_LOOPS: Readonly<Record<EconomyLoopId, SoundRecipe>> = Object.freeze({ sawWhine, flameRoar });

export interface EconomyLoops {
  /** Start or stop each loop to match what is firing this frame (Req 12.2). */
  update(firing: Readonly<Record<EconomyLoopId, boolean>>): void;
  /** Stop every loop now. Safe to call twice. */
  stopAll(): void;
}

/** Keeps at most one voice per loop and fades it out when firing stops. */
export function createEconomyLoops(engine: Pick<AudioEngine, 'play'>): EconomyLoops {
  const voices: Partial<Record<EconomyLoopId, Voice>> = {};
  const ids: readonly EconomyLoopId[] = ['sawWhine', 'flameRoar'];
  return {
    update(firing) {
      for (const id of ids) {
        const voice = voices[id];
        if (firing[id] && voice === undefined) {
          voices[id] = engine.play(ECONOMY_LOOPS[id], LOOP_SEC);
        } else if (!firing[id] && voice !== undefined) {
          voice.fadeOut(LOOP_FADE_SEC);
          delete voices[id];
        }
      }
    },
    stopAll() {
      for (const id of ids) {
        voices[id]?.stop();
        delete voices[id];
      }
    },
  };
}
