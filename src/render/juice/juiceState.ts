// Pure juice state: screen shake, crack stages, corruption level and win fade (design "Juice
// state"). Plain data held in view closures, never in GameState. No DOM, timers or randomness.
import type { GameEvent, GameState } from '../../game/types';
import { JUICE_TUNING } from './juiceTuning';

export type CrackStage = 0 | 1 | 2 | 3;
export type CorruptionLevel = 0 | 1 | 2;

export interface JuiceState {
  readonly shakeStartTick: number | null;
  readonly shakeMax: number;               // px for the current shake
  readonly crackStage: CrackStage;
  readonly pendingCrackSound: boolean;     // play once this frame
  readonly corruption: CorruptionLevel;    // none, faint (pinch 2), strong (critical)
  /** Chapter-driven level (1 after pinch 2), restored when critical ends (Req 3.2). */
  readonly chapterCorruption: 0 | 1;
  readonly critical: boolean;
  readonly flashTicks: readonly number[];  // shared flash budget onsets (see Requirement 8.1)
  readonly fadeStartTick: number | null;   // win fade
}

export const EMPTY_JUICE: JuiceState = Object.freeze({
  shakeStartTick: null,
  shakeMax: 0,
  crackStage: 0,
  pendingCrackSound: false,
  corruption: 0,
  chapterCorruption: 0,
  critical: false,
  flashTicks: Object.freeze([]) as readonly number[],
  fadeStartTick: null,
});

/** Highest crack stage whose threshold integrity is at or below. */
export function crackStageFor(integrity: number): CrackStage {
  const [t1, t2, t3] = JUICE_TUNING.crackThresholds;
  if (integrity <= t3) return 3;
  if (integrity <= t2) return 2;
  if (integrity <= t1) return 1;
  return 0;
}

export function corruptionLevel(chapterLevel: 0 | 1, critical: boolean): CorruptionLevel {
  return critical ? 2 : chapterLevel;
}

/** Shake limit in px for a hit of `amount` (Req 1.1, 1.2). */
export function shakeLimit(amount: number, critical: boolean): number {
  const t = JUICE_TUNING.shake;
  const base = amount < t.heavyHitAmount ? t.lightMaxPx : t.heavyMaxPx;
  return base + (critical ? t.criticalBonusPx : 0);
}

export function applyJuiceEvents(
  s: JuiceState, events: readonly GameEvent[], state: GameState, shakeOn: boolean,
): JuiceState {
  const critical = state.integrity <= state.balance.criticalIntegrity;

  let maxHit: number | null = null;
  let chapterCorruption = s.chapterCorruption;
  let fadeStartTick = s.fadeStartTick;
  for (const e of events) {
    if (e.type === 'modemHit') maxHit = maxHit === null ? e.amount : Math.max(maxHit, e.amount);
    else if (e.type === 'chapterStarted' && e.id === 'pinch2') chapterCorruption = 1;
    else if (e.type === 'won' && fadeStartTick === null) fadeStartTick = e.tick;
  }

  let shakeStartTick = s.shakeStartTick;
  let shakeMax = s.shakeMax;
  if (!shakeOn) {
    shakeStartTick = null;
    shakeMax = 0;
  } else if (maxHit !== null) {
    shakeStartTick = state.tick;
    shakeMax = shakeLimit(maxHit, critical);
  }

  const crackStage = Math.max(s.crackStage, crackStageFor(state.integrity)) as CrackStage;

  return {
    shakeStartTick,
    shakeMax,
    crackStage,
    pendingCrackSound: crackStage > s.crackStage,
    corruption: corruptionLevel(chapterCorruption, critical),
    chapterCorruption,
    critical,
    flashTicks: s.flashTicks,
    fadeStartTick,
  };
}

/** Deterministic pseudo-random value in [-1, 1] from a tick and an axis salt. */
function sinHash(tick: number, salt: number): number {
  const x = Math.sin(tick * 12.9898 + salt * 78.233) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
}

export function shakeOffset(s: JuiceState, tick: number): { dx: number; dy: number } {
  if (s.shakeStartTick === null || s.shakeMax <= 0) return { dx: 0, dy: 0 };
  const age = tick - s.shakeStartTick;
  if (age < 0 || age >= JUICE_TUNING.shake.durationTicks) return { dx: 0, dy: 0 };
  const m = s.shakeMax;
  const clamp = (v: number): number => Math.max(-m, Math.min(m, v)) + 0; // +0 turns -0 into 0
  return { dx: clamp(Math.round(m * sinHash(tick, 1))), dy: clamp(Math.round(m * sinHash(tick, 2))) };
}

/** Win fade opacity 1 → 0 over the transition (Req 7). */
export function fadeOpacity(s: JuiceState, tick: number): number {
  if (s.fadeStartTick === null) return 1;
  const t = (tick - s.fadeStartTick) / JUICE_TUNING.transitionTicks;
  return Math.max(0, Math.min(1, 1 - t));
}
