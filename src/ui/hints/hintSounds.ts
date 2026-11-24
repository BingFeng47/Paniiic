/**
 * Hint_Sounds: the synthesized `balloonPop` played when a Hint_Balloon opens (player-guide 3.3).
 *
 * A soft tray-balloon "pop": a short sine blip that slides up from 660 to 990 Hz, plus a quiet
 * 1480 Hz partial. Built from oscillators and gains only; it follows the `src/core/soundKit.ts`
 * rules (schedule inside `[at, at + durationSec]`, one output gain from 0 back to 0, a stop
 * function that is safe to call twice).
 */
import type { SoundRecipe } from '../../core/audio';
import { createGraph, oscillator, outputGain, pluck, safeDuration, silentGain } from '../../core/soundKit';

/** Natural length in seconds; pass this to `AudioEngine.play`. */
export const BALLOON_POP_SEC = 0.18;

const LEVEL = 0.35;

export const balloonPop: SoundRecipe = (ac, out, at, durationSec) => {
  const d = safeDuration(durationSec, BALLOON_POP_SEC);
  const end = at + d;
  const g = createGraph(ac);
  const master = outputGain(g, out, at, d, LEVEL, 0.02);
  const attack = Math.min(0.004, d / 40);

  const body = oscillator(g, 'sine', 660, at, end);
  body.frequency.exponentialRampToValueAtTime(990, at + d * 0.4);
  const bodyEnv = silentGain(g);
  pluck(bodyEnv.gain, at, end, 0.5, attack);
  body.connect(bodyEnv);
  bodyEnv.connect(master);

  const top = oscillator(g, 'sine', 1480, at, at + d * 0.5);
  const topEnv = silentGain(g);
  pluck(topEnv.gain, at, at + d * 0.5, 0.15, attack);
  top.connect(topEnv);
  topEnv.connect(master);

  return g.finish();
};
