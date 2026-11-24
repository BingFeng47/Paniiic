// Animation_Table: frame rate, loop rule and suggested frame count for every entity and
// animation the Lane_View draws (final-art Req 1.1, 1.2). Pure data, no DOM.
//
// Mob and Glob walks store a `stride` (Lane_Units covered per walk loop) instead of a fixed fps;
// their fps is derived from the lane balance speed, `fps = speed × frames / stride`, so a speed
// change in src/game/balance/ keeps the feet planted (Req 4.1). The starting strides are chosen
// so every derived fps equals today's ANIMATION_FPS.walk, so nothing moves until the art lands.
import { DEFAULT_LANE_BALANCE } from '../../game/balance/lane';
import type { EnemyKind } from '../../game/laneTypes';
import { ANIMATION_FPS, ENTITY_LOOKS, LOOPING, type AnimationName, type SpriteEntity } from './entities';

export interface AnimationSpec {
  readonly fps: number;
  /** idle, walk and use loop; attack, hit and die hold the last frame. */
  readonly loop: boolean;
  readonly suggestedFrames: number;
  /** Walks only: Lane_Units covered per loop of `suggestedFrames` frames. */
  readonly stride?: number;
}

/** Suggested frame counts per animation name. */
const SUGGESTED_FRAMES: Readonly<Record<AnimationName, number>> = Object.freeze({
  idle: 2,
  walk: 4,
  attack: 3,
  hit: 2,
  die: 4,
  use: 3,
});

/** Lane_Units per walk loop. Starting values: speed × 4 frames / 8 fps. */
export const WALK_STRIDE: Readonly<Record<EnemyKind, number>> = Object.freeze({
  default: 20,
  fast: 55,
  tank: 12,
  ranged: 20,
  boss: 13,
  glob: 75,
});

/** Walk fps that covers `stride` Lane_Units per `frames`-frame loop at `speed` Lane_Units/s. */
export function walkFps(speed: number, frames: number, stride: number): number {
  return (speed * frames) / stride;
}

function isEnemyKind(entity: SpriteEntity): entity is EnemyKind {
  return entity in DEFAULT_LANE_BALANCE.enemies;
}

function spec(entity: SpriteEntity, animation: AnimationName): AnimationSpec {
  const suggestedFrames = SUGGESTED_FRAMES[animation];
  const loop = LOOPING.has(animation);
  if (animation === 'walk' && isEnemyKind(entity)) {
    const stride = WALK_STRIDE[entity];
    const speed = DEFAULT_LANE_BALANCE.enemies[entity].speed;
    return Object.freeze({ fps: walkFps(speed, suggestedFrames, stride), loop, suggestedFrames, stride });
  }
  return Object.freeze({ fps: ANIMATION_FPS[animation], loop, suggestedFrames });
}

function buildTable(): Readonly<Record<SpriteEntity, Partial<Record<AnimationName, AnimationSpec>>>> {
  const table = {} as Record<SpriteEntity, Partial<Record<AnimationName, AnimationSpec>>>;
  for (const entity of Object.keys(ENTITY_LOOKS) as SpriteEntity[]) {
    const row: Partial<Record<AnimationName, AnimationSpec>> = {};
    for (const animation of ENTITY_LOOKS[entity].animations) row[animation] = spec(entity, animation);
    table[entity] = Object.freeze(row);
  }
  return Object.freeze(table);
}

export const ANIMATION_TABLE = buildTable();

/** The spec for an entity and animation; falls back to the animation name's defaults. */
export function animationSpec(entity: SpriteEntity, animation: AnimationName): AnimationSpec {
  return ANIMATION_TABLE[entity][animation] ?? spec(entity, animation);
}

/** Back-compat: the default spec for an animation name alone (non-walk defaults). */
export function defaultSpec(animation: AnimationName): AnimationSpec {
  return Object.freeze({ fps: ANIMATION_FPS[animation], loop: LOOPING.has(animation), suggestedFrames: SUGGESTED_FRAMES[animation] });
}
