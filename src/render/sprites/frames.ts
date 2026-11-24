// Frame selection: which animation an Enemy shows and which frame of it. Pure functions of the
// state and the tick, so animation timing is as repeatable as the simulation.

import type { Enemy } from '../../game/laneTypes';
import { TICK_RATE } from '../../game/types';
import { defaultSpec, type AnimationSpec } from './animationTable';
import {
  ATTACK_TICKS,
  HIT_FLASH_TICKS,
  type AnimationName,
} from './entities';

/**
 * Frame index for an animation of `count` frames shown for `ageTicks` (Req 13.8).
 * Looping animations wrap; one-shot animations hold their last frame. Negative or non-finite
 * ages count as 0. A count below 1 (or non-finite) gives 0, so callers can index safely once
 * they have at least one frame.
 */
/** A spec from the Animation_Table, or an animation name for its default spec. */
export type AnimationTiming = AnimationSpec | AnimationName;

export function frameIndex(timing: AnimationTiming, ageTicks: number, count: number): number {
  const n = Number.isFinite(count) ? Math.floor(count) : 0;
  if (n <= 1) return 0;
  const age = Number.isFinite(ageTicks) && ageTicks > 0 ? ageTicks : 0;
  const spec = typeof timing === 'string' ? defaultSpec(timing) : timing;
  const fps = spec.fps;
  // Multiply first so whole-tick ages stay exact; divide first only when that would overflow.
  const scaled = (age * fps) / TICK_RATE;
  const raw = Math.floor(Number.isFinite(scaled) ? scaled : (age / TICK_RATE) * fps);
  return spec.loop ? raw % n : Math.min(raw, n - 1);
}

export interface EnemyAnimation {
  readonly animation: AnimationName;
  /** Ticks since the animation started. */
  readonly age: number;
}

/** Ticks since `since` when that falls in [0, window), else null (also when `since` is unset). */
function ageSince(tick: number, since: number | null, window: number): number | null {
  if (since === null) return null;
  const age = tick - since;
  return age >= 0 && age < window ? age : null;
}

/**
 * The animation an Enemy shows on `tick` (Req 13.9): `hit` for HIT_FLASH_TICKS after its last
 * hit, then for a ranged Mob `attack` for ATTACK_TICKS after its last spit and `idle` while
 * stopped, otherwise `walk` aged from its spawn tick. A stopped ranged Mob's idle also ages from
 * its spawn tick, since it loops and the state does not record the stop tick.
 */
export function enemyAnimation(enemy: Enemy, tick: number): EnemyAnimation {
  const hitAge = ageSince(tick, enemy.lastHitTick, HIT_FLASH_TICKS);
  if (hitAge !== null) return { animation: 'hit', age: hitAge };

  const sinceSpawn = tick - enemy.spawnTick;
  if (enemy.kind === 'ranged') {
    const spitAge = ageSince(tick, enemy.lastSpitTick, ATTACK_TICKS);
    if (spitAge !== null) return { animation: 'attack', age: spitAge };
    if (enemy.nextSpitTick !== null) return { animation: 'idle', age: sinceSpawn };
  }
  return { animation: 'walk', age: sinceSpawn };
}
