/**
 * Building blocks shared by the synthesized sound recipes (`bootSounds.ts`, `modemSounds.ts`,
 * `laneSounds.ts`). Nothing here loads audio files; noise is generated in code from a seed so
 * every burst, and every test run, is identical.
 *
 * Recipe rules every user follows:
 * - schedule everything inside `[at, at + durationSec]` and stop its own sources by the end,
 * - route through one `outputGain` that fades in from 0 and back to 0, so the sound starts and
 *   ends without a click, and keep the summed peak well below 1,
 * - return `graph.finish()`, a stop function that stops every source now and disconnects every
 *   node. Calling it twice, or after the sound ended on its own, is safe.
 */

/** Exponential ramps cannot reach 0, so decays run between this floor and their peak. */
export const SILENT = 0.0001;

/** Noise buffers longer than this loop instead of growing. */
export const MAX_NOISE_SEC = 2;

/** Tiny deterministic PRNG (mulberry32), returning values in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Mono white-noise buffer in [-1, 1) long enough for `seconds` (looped past `MAX_NOISE_SEC`). */
export function noiseBuffer(ac: BaseAudioContext, seconds: number, seed: number): AudioBuffer {
  const length = Math.max(1, Math.ceil(ac.sampleRate * Math.min(seconds, MAX_NOISE_SEC)));
  const buffer = ac.createBuffer(1, length, ac.sampleRate);
  const data = buffer.getChannelData(0);
  const next = mulberry32(seed);
  for (let i = 0; i < length; i += 1) data[i] = next() * 2 - 1;
  return buffer;
}

/** A usable duration: the engine passes a positive number, but guard against non-finite input. */
export function safeDuration(durationSec: number, fallback: number): number {
  return Number.isFinite(durationSec) && durationSec > 0 ? durationSec : fallback;
}

/** Collects a recipe's nodes so they can be stopped and disconnected together. */
export interface Graph {
  readonly ac: BaseAudioContext;
  node<T extends AudioNode>(node: T): T;
  source<T extends AudioScheduledSourceNode>(node: T): T;
  /** Wires up natural-end cleanup and returns the recipe's stop function. */
  finish(): () => void;
}

export function createGraph(ac: BaseAudioContext): Graph {
  const nodes: AudioNode[] = [];
  const sources: AudioScheduledSourceNode[] = [];
  let released = false;
  let stopped = false;

  const release = (): void => {
    if (released) return;
    released = true;
    for (const n of nodes) n.disconnect();
  };

  return {
    ac,
    node(node) {
      nodes.push(node);
      return node;
    },
    source(node) {
      nodes.push(node);
      sources.push(node);
      return node;
    },
    finish() {
      // Once every source has played out, drop the connections so the graph can be collected.
      let running = sources.length;
      for (const s of sources) {
        s.addEventListener('ended', () => {
          running -= 1;
          if (running === 0) release();
        });
      }
      return () => {
        if (stopped) return;
        stopped = true;
        const now = Math.max(0, ac.currentTime);
        for (const s of sources) {
          try {
            s.stop(now);
          } catch {
            // Already stopped in a browser that rejects repeated stop(); it is silent either way.
          }
        }
        release();
      };
    },
  };
}

/** A gain node that starts silent; envelopes are scheduled on it afterwards. */
export function silentGain(g: Graph): GainNode {
  const gain = g.node(g.ac.createGain());
  gain.gain.value = 0;
  return gain;
}

/** Fast attack from silence to `peak`, then exponential decay back to silence at `end`. */
export function pluck(param: AudioParam, start: number, end: number, peak: number, attack: number): void {
  param.setValueAtTime(SILENT, start);
  param.linearRampToValueAtTime(peak, start + attack);
  param.exponentialRampToValueAtTime(SILENT, end);
  param.setValueAtTime(0, end);
}

/** Linear fade from 0 up to `level` at `start`, hold, and linear fade back to 0 at `end`. */
export function hold(param: AudioParam, start: number, end: number, level: number, fade: number): void {
  const f = Math.min(fade, (end - start) / 4);
  param.setValueAtTime(0, start);
  param.linearRampToValueAtTime(level, start + f);
  param.setValueAtTime(level, end - f);
  param.linearRampToValueAtTime(0, end);
}

/**
 * The gain every recipe ends in: linear fade from 0 up to `level`, hold, linear fade back to 0
 * at `at + d`. Linear fades are used because they may start and end at exactly 0.
 */
export function outputGain(g: Graph, out: AudioNode, at: number, d: number, level: number, fadeOut: number): GainNode {
  const gain = silentGain(g);
  const fadeIn = Math.min(0.004, d / 10);
  const release = Math.min(fadeOut, d / 4);
  gain.gain.setValueAtTime(0, at);
  gain.gain.linearRampToValueAtTime(level, at + fadeIn);
  gain.gain.setValueAtTime(level, at + d - release);
  gain.gain.linearRampToValueAtTime(0, at + d);
  gain.connect(out);
  return gain;
}

export function oscillator(g: Graph, type: OscillatorType, freq: number, start: number, end: number): OscillatorNode {
  const osc = g.source(g.ac.createOscillator());
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  osc.start(start);
  osc.stop(end);
  return osc;
}

/**
 * Seeded noise that plays from `start` to `end`, looping past `MAX_NOISE_SEC`. `d` sizes the
 * buffer and defaults to `end - start`; pass it when the caller already has the exact length.
 */
export function noiseSource(
  g: Graph,
  start: number,
  end: number,
  seed: number,
  d: number = end - start,
): AudioBufferSourceNode {
  const src = g.source(g.ac.createBufferSource());
  src.buffer = noiseBuffer(g.ac, d, seed);
  src.loop = d > MAX_NOISE_SEC;
  src.start(start);
  src.stop(end);
  return src;
}

export function filter(g: Graph, type: BiquadFilterType, freq: number, q: number, at: number): BiquadFilterNode {
  const f = g.node(g.ac.createBiquadFilter());
  f.type = type;
  f.Q.value = q;
  f.frequency.setValueAtTime(freq, at);
  return f;
}
