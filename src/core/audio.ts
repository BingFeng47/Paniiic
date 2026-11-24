// The single Web Audio wrapper (Audio_Engine). One context per page, created lazily inside the
// power-on click so browser autoplay rules allow it (Req 3.2). Every sound is a synthesized
// `SoundRecipe`; nothing is loaded from files (Req 12.7).
//
// Mixing graph (title-and-endings, design D6):
//
//   recipe nodes ─▶ voice gain (1, fades to 0) ─▶ music gain (0 | 1) ─┐
//   recipe nodes ─▶ voice gain (1, fades to 0) ─▶ sfx gain   (0 | 1) ─┴─▶ master gain ─▶ limiter ─▶ destination
//
// Juice-and-endings: at most VOICE_CAP capped sfx voices play at once; the oldest is faded out
// over 20 ms to make room (Req 6.4). Music voices and `{ keep: true }` loops are exempt. The
// limiter is a DynamicsCompressorNode so many sounds at once don't clip (Req 6.5).
//
// The master gain is the first gain node created, so it keeps its 0.6 level at volume 100.
//
// Browser globals (`AudioContext`, `webkitAudioContext`, `document`, `setTimeout`) are resolved
// lazily, so importing this module in Node or jsdom is safe. All can be injected for tests.

/** Schedules nodes on `ac` into `out` starting at `at` for `durationSec`; returns a stop function. */
export type SoundRecipe = (ac: BaseAudioContext, out: AudioNode, at: number, durationSec: number) => () => void;

/** Which bus a Voice plays through (Req 6.1). */
export type Channel = 'music' | 'sfx';

export interface Voice {
  /** Stop the sound now. Safe to call more than once; cancels a pending fade (Req 6.8). */
  stop(): void;
  /** Ramp this voice's gain linearly to 0 over durationSec, then stop it (Req 6.7). */
  fadeOut(durationSec: number): void;
}

/** Player volume and channel switches, as the Settings_Store knows them. */
/** Options for `play`. `keep` exempts a loop from the voice cap (Req 6.4). */
export interface PlayOptions {
  readonly keep?: boolean;
}
/** Most capped sfx voices that play at once (Req 6.4). */
export const VOICE_CAP = 24;
/** Fade applied to the oldest voice when the cap is exceeded. */
export const VOICE_STEAL_FADE_SEC = 0.02;
/** Limiter settings on the master output (Req 6.5). */
export const LIMITER = Object.freeze({ threshold: -6, knee: 0, ratio: 20, attack: 0.003, release: 0.12 });
export interface AudioMix {
  /** 0..100. */
  readonly volume: number;
  readonly music: boolean;
  readonly sfx: boolean;
}

export const DEFAULT_MIX: AudioMix = Object.freeze({ volume: 100, music: true, sfx: true });

export interface Gains {
  readonly master: number;
  readonly music: number;
  readonly sfx: number;
}

export interface AudioEngine {
  /** Call synchronously inside a user-gesture handler (Req 3.2). Returns false if audio is unavailable. */
  unlock(): boolean;
  isUnlocked(): boolean;
  /** `channel` defaults to 'sfx' (Req 6.1). No-op Voice while locked or unavailable (Req 3.3, 3.4). */
  play(recipe: SoundRecipe, durationSec: number, channel?: Channel, options?: PlayOptions): Voice;
  /** Muting sets the master gain to 0 (Req 7.8, 6.3). */
  setMuted(muted: boolean): void;
  isMuted(): boolean;
  /** Stored at once, applied to the gains now or at unlock (Req 6.6). */
  setMix(mix: AudioMix): void;
  mix(): AudioMix;
  /** Stops every voice and cancels every pending fade. */
  stopAll(): void;
  /** Stops every voice, cancels every pending fade, removes the visibility listener and closes the context (Req 14.2, 6.9). */
  unmount(): void;
}

export interface Timers {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface AudioDeps {
  readonly createContext: () => AudioContext;
  readonly visibility: {
    readonly hidden: boolean;
    addEventListener(t: 'visibilitychange', f: () => void): void;
    removeEventListener(t: 'visibilitychange', f: () => void): void;
  };
  /** Defaults to globalThis.setTimeout / clearTimeout. Tests inject fakes. */
  readonly timers: Timers;
}

/** Master output level while unmuted at volume 100. */
export const MASTER_GAIN = 0.6;

/** Pure (Req 6.2–6.5). Volume is clamped to 0..100; a non-finite volume counts as 100. */
export function mixGains(mix: AudioMix, muted: boolean): Gains {
  const raw = Number.isFinite(mix.volume) ? mix.volume : 100;
  const volume = Math.min(100, Math.max(0, raw));
  return {
    master: muted ? 0 : MASTER_GAIN * (volume / 100),
    music: mix.music ? 1 : 0,
    sfx: mix.sfx ? 1 : 0,
  };
}

const NOOP_VOICE: Voice = Object.freeze({ stop: () => {}, fadeOut: () => {} });

const ignore = (): void => {};

/** Resolves the global timer functions at call time, so test fake timers installed later still apply. */
const DEFAULT_TIMERS: Timers = {
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof globalThis.setTimeout>),
};

type AudioContextCtor = new () => AudioContext;

function defaultCreateContext(): AudioContext {
  const g = globalThis as { AudioContext?: AudioContextCtor; webkitAudioContext?: AudioContextCtor };
  const Ctor = g.AudioContext ?? g.webkitAudioContext;
  if (!Ctor) throw new Error('Web Audio is not available');
  return new Ctor();
}

interface ActiveVoice extends Voice {
  /** Context time at which the recipe's own schedule ends. */
  readonly endsAt: number;
  /** Counts toward VOICE_CAP: an sfx voice not started with `keep`. */
  readonly capped: boolean;
}

export function createAudioEngine(deps: Partial<AudioDeps> = {}): AudioEngine {
  // 'locked' until the first unlock; 'unavailable' after a failure; 'closed' after unmount.
  let status: 'locked' | 'unlocked' | 'unavailable' | 'closed' = 'locked';
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let buses: Record<Channel, GainNode> | null = null;
  let visibility: AudioDeps['visibility'] | null = null;
  let muted = false;
  let currentMix: AudioMix = DEFAULT_MIX;
  const timers = deps.timers ?? DEFAULT_TIMERS;
  const voices = new Set<ActiveVoice>();
  /** Pending fade timers by voice. A voice in here is fading and is never pruned. */
  const fades = new Map<ActiveVoice, unknown>();

  const applyGains = (): void => {
    if (!master || !buses) return;
    const g = mixGains(currentMix, muted);
    master.gain.value = g.master;
    buses.music.gain.value = g.music;
    buses.sfx.gain.value = g.sfx;
  };

  const stopAll = (): void => {
    for (const voice of [...voices, ...fades.keys()]) voice.stop();
  };

  const onVisibilityChange = (): void => {
    if (status !== 'unlocked' || !ctx || !visibility) return;
    // Scheduled sounds follow the context clock, so they pause and resume with it (Req 10.8, 10.9).
    if (visibility.hidden) ctx.suspend().catch(ignore);
    else ctx.resume().catch(ignore);
  };

  /** Drop the context and the listener. `next` is the status the engine ends in. */
  const shutDown = (next: 'unavailable' | 'closed'): void => {
    stopAll();
    visibility?.removeEventListener('visibilitychange', onVisibilityChange);
    visibility = null;
    const closing = ctx;
    ctx = null;
    master = null;
    buses = null;
    status = next;
    if (closing && closing.state !== 'closed') {
      try {
        closing.close().catch(ignore);
      } catch {
        // Some browsers throw synchronously on close; the context is unusable either way.
      }
    }
  };

  const unlock = (): boolean => {
    if (status === 'unlocked') {
      // A browser may suspend the context on its own; a later gesture can wake it up again.
      if (ctx && ctx.state === 'suspended' && !visibility?.hidden) ctx.resume().catch(ignore);
      return true;
    }
    if (status !== 'locked') return false;
    let created: AudioContext | null = null;
    try {
      const context = (deps.createContext ?? defaultCreateContext)();
      created = context;
      // resume() must be called inside the gesture handler, so no await before it.
      context.resume().catch(() => {
        // Req 3.3: if this context is still ours, go silent and let the boot continue.
        if (ctx === context && status === 'unlocked') shutDown('unavailable');
      });
      // Master first, so it stays the first gain node of the context.
      const gain = context.createGain();
      if (typeof context.createDynamicsCompressor === 'function') {
        const limiter = context.createDynamicsCompressor();
        limiter.threshold.value = LIMITER.threshold;
        limiter.knee.value = LIMITER.knee;
        limiter.ratio.value = LIMITER.ratio;
        limiter.attack.value = LIMITER.attack;
        limiter.release.value = LIMITER.release;
        gain.connect(limiter);
        limiter.connect(context.destination);
      } else {
        gain.connect(context.destination);
      }
      const music = context.createGain();
      music.connect(gain);
      const sfx = context.createGain();
      sfx.connect(gain);
      ctx = context;
      master = gain;
      buses = { music, sfx };
    } catch {
      // Constructor missing or throwing, or the graph could not be built (Req 3.3).
      ctx = created;
      shutDown('unavailable');
      return false;
    }
    status = 'unlocked';
    applyGains(); // Req 6.6: the mix and mute set before unlocking.
    visibility = deps.visibility ?? (typeof document === 'undefined' ? null : document);
    visibility?.addEventListener('visibilitychange', onVisibilityChange);
    return true;
  };

  const play = (recipe: SoundRecipe, durationSec: number, channel: Channel = 'sfx', options: PlayOptions = {}): Voice => {
    if (status !== 'unlocked' || !ctx || !buses || !(durationSec > 0)) return NOOP_VOICE;
    const context = ctx;
    const at = context.currentTime;
    // Forget voices whose schedule already ran out, so the set doesn't grow over a long run.
    // A fading voice stays, so its timer is always reachable from stopAll().
    for (const v of voices) if (v.endsAt <= at && !fades.has(v)) voices.delete(v);
    const capped = channel === 'sfx' && options.keep !== true;
    if (capped) {
      // Fading voices are already on their way out, so they don't count (Req 6.4).
      const live = [...voices].filter((v) => v.capped && !fades.has(v));
      for (let i = 0; i <= live.length - VOICE_CAP; i++) live[i]?.fadeOut(VOICE_STEAL_FADE_SEC);
    }
    let voiceGain: GainNode;
    let stopRecipe: () => void;
    try {
      voiceGain = context.createGain();
      voiceGain.connect(buses[channel]);
    } catch (error) {
      console.error('Voice gain failed', recipe.name || '(anonymous)', error);
      return NOOP_VOICE;
    }
    const disconnect = (): void => {
      try {
        voiceGain.disconnect();
      } catch {
        // Already disconnected, or the context is gone.
      }
    };
    try {
      stopRecipe = recipe(context, voiceGain, at, durationSec);
    } catch (error) {
      console.error('Sound recipe failed', recipe.name || '(anonymous)', error);
      disconnect();
      return NOOP_VOICE;
    }
    let stopped = false;
    const voice: ActiveVoice = {
      endsAt: at + durationSec,
      capped,
      stop() {
        if (stopped) return;
        stopped = true;
        voices.delete(voice);
        if (fades.has(voice)) {
          timers.clearTimeout(fades.get(voice));
          fades.delete(voice);
        }
        try {
          stopRecipe();
        } catch (error) {
          console.error('Sound stop failed', recipe.name || '(anonymous)', error);
        }
        disconnect();
      },
      fadeOut(fadeSec) {
        if (stopped || fades.has(voice)) return;
        // A bad duration, or an engine that is no longer running, ends the voice at once.
        if (!(Number.isFinite(fadeSec) && fadeSec > 0) || status !== 'unlocked') {
          voice.stop();
          return;
        }
        try {
          const g = voiceGain.gain;
          const now = context.currentTime;
          // Cancel, anchor, ramp: a ramp starts at the previous event, so anchor it at now.
          g.cancelScheduledValues(now);
          g.setValueAtTime(g.value, now);
          g.linearRampToValueAtTime(0, now + fadeSec);
        } catch (error) {
          console.error('Sound fade failed', recipe.name || '(anonymous)', error);
          voice.stop();
          return;
        }
        const handle = timers.setTimeout(() => {
          fades.delete(voice);
          voice.stop();
        }, fadeSec * 1000);
        fades.set(voice, handle);
      },
    };
    voices.add(voice);
    return voice;
  };

  return {
    unlock,
    isUnlocked: () => status === 'unlocked',
    play,
    setMuted(value) {
      muted = value;
      applyGains();
    },
    isMuted: () => muted,
    setMix(mix) {
      currentMix = Object.freeze({ volume: mix.volume, music: mix.music, sfx: mix.sfx });
      applyGains();
    },
    mix: () => currentMix,
    stopAll,
    unmount() {
      if (status === 'closed') return;
      shutDown('closed');
    },
  };
}
