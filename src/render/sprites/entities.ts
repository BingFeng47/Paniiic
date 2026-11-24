// What the Lane_View can draw: entity names, animation names, placeholder looks and animation
// timing. Pure data, no DOM. The canvas colours live only in ENTITY_LOOKS so every placeholder
// and loading box takes its colour from this one table.

import type { EnemyKind } from '../../game/laneTypes';

/** Mob animations are idle/walk/attack/hit/die; weapons use idle/use (see sprites.md). */
export type AnimationName = 'idle' | 'walk' | 'attack' | 'hit' | 'die' | 'use';

/** Folder names under `assets/sprites/` that the Lane_View asks for. */
export type SpriteEntity = EnemyKind | 'hammer' | 'saw' | 'flamethrower' | 'modem' | 'manhole' | 'drop';

export interface EntityLook {
  /** Placeholder and loading box colour. */
  readonly colour: string;
  /** Placeholder viewBox size; feet at the bottom centre. */
  readonly box: { readonly w: number; readonly h: number };
  /** The animations the Lane_View asks for. */
  readonly animations: readonly AnimationName[];
}

const MOB_ANIMATIONS: readonly AnimationName[] = Object.freeze([
  'idle',
  'walk',
  'attack',
  'hit',
  'die',
] as const);

function look(colour: string, w: number, h: number, animations: readonly AnimationName[]): EntityLook {
  return Object.freeze({
    colour,
    box: Object.freeze({ w, h }),
    animations: Object.freeze([...animations]),
  });
}

export const ENTITY_LOOKS: Readonly<Record<SpriteEntity, EntityLook>> = Object.freeze({
  default: look('#6b8e23', 44, 72, MOB_ANIMATIONS),
  fast: look('#d4c21a', 34, 48, MOB_ANIMATIONS),
  tank: look('#6a3d9a', 72, 96, MOB_ANIMATIONS),
  ranged: look('#e07b22', 48, 76, MOB_ANIMATIONS),
  boss: look('#b3122e', 112, 150, MOB_ANIMATIONS),
  glob: look('#9be22e', 22, 22, ['walk', 'die']),
  hammer: look('#8b5a2b', 40, 40, ['idle', 'use']),
  saw: look('#c0c4c8', 48, 40, ['idle', 'use']),
  flamethrower: look('#c8452a', 56, 36, ['idle', 'use']),
  drop: look('#29d3ff', 20, 20, ['idle']),
  modem: look('#d8cfb4', 96, 64, ['idle', 'hit']),
  manhole: look('#4a4a4a', 88, 24, ['idle', 'attack']),
});

/** Frames per second of each animation. */
export const ANIMATION_FPS: Readonly<Record<AnimationName, number>> = Object.freeze({
  idle: 4,
  walk: 8,
  attack: 10,
  hit: 12,
  die: 10,
  use: 20,
});

/** Animations that wrap around; the others hold their last frame. */
export const LOOPING: ReadonlySet<AnimationName> = new Set<AnimationName>(['idle', 'walk', 'use']);

/** Ticks an Enemy shows `hit` after its last hit Tick. */
export const HIT_FLASH_TICKS = 6;
/** Ticks a ranged Mob shows `attack` after its last spit. */
export const ATTACK_TICKS = 12;
/** Ticks the hammer cursor shows `use` after a swing. */
export const SWING_TICKS = 12;
