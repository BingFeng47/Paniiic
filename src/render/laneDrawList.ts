/**
 * Lane draw list: what the Lane_View draws this frame, in back-to-front order, as plain data
 * (Req 11.2, 11.3, 11.6). Pure: reads the state and effects, never changes them, so it can be
 * tested without a canvas.
 *
 * Positions are feet (the bottom-centre anchor of every sprite, see sprites.md) in canvas px.
 */
import type { Point } from '../core/monitor';
import { DEFAULT_LANE_BALANCE, secondsToTicks, type LaneBalance } from '../game/balance/lane';
import { compareHitPriority } from '../game/hammer';
import { laneOf } from '../game/laneState';
import { isAttacker, type Enemy } from '../game/laneTypes';
import type { GameState } from '../game/types';
import { animationTicks, hitFlashActive, rumbleJitter, SHAKE_TICKS, type LaneEffects } from './laneEffects';
import { laneToCanvas, MODEM_AREA_W, type LaneLayout } from './laneLayout';
import { ATTACK_TICKS, ENTITY_LOOKS, HIT_FLASH_TICKS, type AnimationName, type SpriteEntity } from './sprites/entities';
import { animationSpec } from './sprites/animationTable';
import { enemyAnimation, frameIndex, type EnemyAnimation } from './sprites/frames';

export interface DrawItem {
  readonly entity: SpriteEntity;
  readonly animation: AnimationName;
  readonly frame: number;
  /** Bottom-centre anchor, canvas px. */
  readonly feet: Point;
  /** Drawn height, canvas px. */
  readonly height: number;
  /** Draw the sprite once more additively: the hit flash (juice Req 4.1). Absent when off. */
  readonly flash?: true;
}

type FrameCount = (entity: SpriteEntity, animation: AnimationName) => number;

/** Ticks since `since` when that falls in [0, window), else null. */
function ageWithin(tick: number, since: number | null, window: number): number | null {
  if (since === null) return null;
  const age = tick - since;
  return age >= 0 && age < window ? age : null;
}

/**
 * The animation to draw for `entity`: `wanted` when the entity lists it in ENTITY_LOOKS, else
 * `walk` when listed, else its first animation. Keeps tuned-up Globs (more than 1 HP, so they can
 * show `hit`) on an animation the atlas has.
 */
function drawable(entity: SpriteEntity, wanted: AnimationName): AnimationName {
  const list = ENTITY_LOOKS[entity].animations;
  if (list.includes(wanted)) return wanted;
  return list.includes('walk') ? 'walk' : (list[0] ?? wanted);
}

/** -p, 0 or +p by id, so up to three overlapping Attackers read as separate bodies (Req 7.2). */
export function attackerOffset(id: number, hitPadding: number): number {
  return ((id % 3) - 1) * hitPadding;
}

/**
 * Enemy animation with the Attacker branch (Req 7.1): `hit` for HIT_FLASH_TICKS after the last hit
 * Tick, then `attack` for ATTACK_TICKS after each Melee_Hit, then `idle` aged from the latest hit
 * or the arrival. Walking Mobs, ranged Mobs and Globs use `enemyAnimation` unchanged.
 */
function animationFor(enemy: Enemy, tick: number, balance: LaneBalance): EnemyAnimation {
  if (!isAttacker(enemy) || !('nextHitTick' in enemy) || enemy.nextHitTick === null) {
    return enemyAnimation(enemy, tick);
  }
  const hitAge = ageWithin(tick, enemy.lastHitTick, HIT_FLASH_TICKS);
  if (hitAge !== null) return { animation: 'hit', age: hitAge };
  const attackAge = ageWithin(tick, enemy.lastMeleeTick, ATTACK_TICKS);
  if (attackAge !== null) return { animation: 'attack', age: attackAge };
  const interval = secondsToTicks(balance.melee[enemy.kind].hitEverySeconds);
  return { animation: 'idle', age: Math.max(0, tick - (enemy.nextHitTick - interval)) };
}

function item(
  entity: SpriteEntity,
  animation: AnimationName,
  age: number,
  feet: Point,
  height: number,
  frameCount: FrameCount,
): DrawItem {
  return { entity, animation, frame: frameIndex(animationSpec(entity, animation), age, frameCount(entity, animation)), feet, height };
}

/**
 * Pure: modem, Manhole, then corpses, then Enemies in reverse Hit_Priority, so the Enemy a click
 * would hit is drawn last, on top (Req 11.2, 11.3, 11.6).
 *
 * - Modem: centred in the modem area left of Lane_X 0, box height (fixed scenery px). Shows `hit`
 *   for at least SHAKE_TICKS after a bite, longer if its `hit` animation is longer, else `idle`.
 * - Manhole: centred on Lane_Length, box height. Shows `attack` (the rattle) for at least
 *   ATTACK_TICKS after a scheduled spawn, longer if its `attack` animation is longer, else `idle`.
 * - Corpses: `die` aged from the kill tick, at the kill Lane_X.
 * - Enemies: feet at `laneToCanvas({ x, y: 0 })`, height `stats.height × layout.scale`, animation
 *   from `enemyAnimation` (plus the Attacker branch). Attackers' feet shift by `attackerOffset`.
 *
 * Works when `state.lane` is absent (core-only runs, or before the first lane tick): the modem and
 * Manhole use the default balance and there are no Enemies.
 */
export function buildDrawList(
  state: GameState,
  effects: LaneEffects,
  layout: LaneLayout,
  frameCount: FrameCount,
  rumble = false,
): readonly DrawItem[] {
  const tick = state.tick;
  const lane = laneOf(state);
  const balance = lane?.balance ?? DEFAULT_LANE_BALANCE;
  const items: DrawItem[] = [];

  const modemHitAge = ageWithin(
    tick,
    effects.modemHitTick,
    Math.max(SHAKE_TICKS, animationTicks(animationSpec('modem', 'hit'), frameCount('modem', 'hit'))),
  );
  items.push(
    item(
      'modem',
      modemHitAge === null ? 'idle' : 'hit',
      modemHitAge ?? tick,
      { x: layout.originX - MODEM_AREA_W / 2, y: layout.lineY },
      ENTITY_LOOKS.modem.box.h,
      frameCount,
    ),
  );

  const rattleAge = ageWithin(
    tick,
    effects.rattleTick,
    Math.max(ATTACK_TICKS, animationTicks(animationSpec('manhole', 'attack'), frameCount('manhole', 'attack'))),
  );
  const manholeFeet = laneToCanvas({ x: balance.laneLength, y: 0 }, layout);
  // Boss_Rumble: the cover jitters by up to RUMBLE_JITTER_PX (juice Req 5.1).
  const jitter = rumble ? rumbleJitter(tick) : { dx: 0, dy: 0 };
  items.push(
    item(
      'manhole',
      rumble || rattleAge !== null ? 'attack' : 'idle',
      rattleAge ?? tick,
      { x: manholeFeet.x + jitter.dx, y: manholeFeet.y + jitter.dy },
      ENTITY_LOOKS.manhole.box.h,
      frameCount,
    ),
  );

  for (const corpse of effects.corpses) {
    items.push(
      item(
        corpse.kind,
        'die',
        tick - corpse.killTick,
        laneToCanvas({ x: corpse.x, y: 0 }, layout),
        balance.enemies[corpse.kind].height * layout.scale,
        frameCount,
      ),
    );
  }

  if (lane !== null) {
    const ordered: Enemy[] = [...lane.enemies].sort((a, b) => compareHitPriority(b, a));
    for (const enemy of ordered) {
      const { animation, age } = animationFor(enemy, tick, balance);
      const offset = isAttacker(enemy) ? attackerOffset(enemy.id, balance.hitPadding) : 0;
      const drawn = item(
        enemy.kind,
        drawable(enemy.kind, animation),
        age,
        laneToCanvas({ x: enemy.x + offset, y: 0 }, layout),
        balance.enemies[enemy.kind].height * layout.scale,
        frameCount,
      );
      items.push(hitFlashActive(effects, enemy.id, tick) ? { ...drawn, flash: true } : drawn);
    }
  }

  return items;
}
