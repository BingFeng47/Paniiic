/**
 * Lane_Effects: render-only memory of short-lived lane effects (corpses, hammer swing, screen
 * shake, manhole rattle, modem hit). The Lane_View keeps one value in its closure and folds each
 * frame's events into it; it never lives in GameState (Req 11.4).
 *
 * Everything here is pure: `applyEvents` returns a new value and never changes its input, and
 * `shakeOffset` is a function of the tick only, so effects replay exactly like the simulation.
 */
import type { EnemyKind } from '../game/laneTypes';
import { TICK_RATE, type GameEvent } from '../game/types';
import { type AnimationName, type SpriteEntity } from './sprites/entities';
import { animationSpec, defaultSpec, type AnimationSpec } from './sprites/animationTable';

/** A killed Enemy still playing its `die` animation at its last Lane_X (Req 11.6). */
export interface Corpse {
  readonly id: number;
  readonly kind: EnemyKind;
  readonly x: number;
  readonly killTick: number;
}

export interface LaneEffects {
  /** In kill order. */
  readonly corpses: readonly Corpse[];
  /** Tick of the last `hammerSwing`, or null. */
  readonly swingTick: number | null;
  /** The lane drawing shakes while `tick < shakeUntilTick` (Req 11.7). */
  readonly shakeUntilTick: number;
  /** Tick of the last scheduled or hatched `mobSpawned` (the Manhole rattles), or null. */
  readonly rattleTick: number | null;
  /** Tick of the last `modemHit`, or null. */
  readonly modemHitTick: number | null;
  /** Enemy id → tick of its latest `mobHit`, kept for HIT_FLASH_DRAW_TICKS (juice Req 4.1). */
  readonly hitTicks: Readonly<Record<number, number>>;
  /** Kill_Pops still playing (juice Req 4.2). */
  readonly pops: readonly KillPop[];
  /** "+N KB" labels still rising (juice Req 4.3). */
  readonly kbLabels: readonly KbLabel[];
}

/** An expanding ring and debris where an Enemy died. */
export interface KillPop {
  readonly id: number;
  readonly x: number;
  readonly tick: number;
}

/** A "+N KB" label rising from a collected packet, at its Lane_Units position. */
export interface KbLabel {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly kb: number;
  readonly tick: number;
}

/** Ticks the sprite is drawn again additively after a hit (juice Req 4.1). */
export const HIT_FLASH_DRAW_TICKS = 4;
/** Ticks a Kill_Pop plays (juice Req 4.2). */
export const KILL_POP_TICKS = 18;
/** Ticks a "+N KB" label rises, and how far in canvas px (juice Req 4.3). */
export const KB_LABEL_TICKS = 30;
export const KB_LABEL_RISE_PX = 24;
/** Boss_Rumble length before the boss spawn time (juice Req 5.1), and its jitter limit. */
export const BOSS_RUMBLE_TICKS = 180;
export const RUMBLE_JITTER_PX = 2;

/** Position of a packet by id, from the state before it was collected. */
export type PacketLookup = (id: number) => { readonly x: number; readonly y: number } | null;

export const EMPTY_EFFECTS: LaneEffects = Object.freeze({
  corpses: Object.freeze([]) as readonly Corpse[],
  swingTick: null,
  shakeUntilTick: 0,
  rattleTick: null,
  modemHitTick: null,
  hitTicks: Object.freeze({}) as Readonly<Record<number, number>>,
  pops: Object.freeze([]) as readonly KillPop[],
  kbLabels: Object.freeze([]) as readonly KbLabel[],
});

/** Ticks the lane shakes after a `modemHit`. */
export const SHAKE_TICKS = 12;
/** Largest shake offset on each axis, in canvas px. */
export const MAX_SHAKE_PX = 3;

/**
 * Ticks a one-shot animation of `count` frames takes to play through: `ceil(count × 60 / fps)`.
 * A count below 1 counts as 1, so every animation lasts at least one frame's time.
 */
export function animationTicks(timing: AnimationSpec | AnimationName, count: number): number {
  const fps = (typeof timing === 'string' ? defaultSpec(timing) : timing).fps;
  const n = Number.isFinite(count) && count >= 1 ? Math.floor(count) : 1;
  return Math.ceil((n * TICK_RATE) / fps);
}

/** `dieTicks` for `applyEvents` from the atlas frame counts: each kind's full `die` length. */
export function dieTicksFrom(
  frameCount: (entity: SpriteEntity, animation: AnimationName) => number,
): (kind: EnemyKind) => number {
  return (kind) => animationTicks(animationSpec(kind, 'die'), frameCount(kind, 'die'));
}

/**
 * Pure: fold one frame's events in and drop corpses whose die animation finished by `tick`.
 * `mobKilled` adds a corpse at the event's x, `hammerSwing` sets the swing tick, `modemHit` sets
 * the modem hit tick and extends the shake window to `event.tick + SHAKE_TICKS`, and a
 * `mobSpawned` from the Spawn_Schedule or an ad Hatch (ad-pressure Req 7.3) sets the rattle tick. Event ticks are used as timestamps,
 * so a frame that folds several ticks of events keeps each effect's real start.
 */
export function applyEvents(
  effects: LaneEffects,
  events: readonly GameEvent[],
  tick: number,
  dieTicks: (kind: EnemyKind) => number,
  packetAt: PacketLookup = () => null,
): LaneEffects {
  let corpses: readonly Corpse[] = effects.corpses;
  let { swingTick, shakeUntilTick, rattleTick, modemHitTick } = effects;
  const added: Corpse[] = [];
  let hitTicks = effects.hitTicks;
  const newHits: Record<number, number> = {};
  let anyHit = false;
  const newPops: KillPop[] = [];
  const newLabels: KbLabel[] = [];

  for (const event of events) {
    switch (event.type) {
      case 'mobKilled':
        added.push({ id: event.id, kind: event.kind, x: event.x, killTick: event.tick });
        newPops.push({ id: event.id, x: event.x, tick: event.tick });
        break;
      case 'mobHit':
        newHits[event.id] = event.tick;
        anyHit = true;
        break;
      case 'packetCollected': {
        const at = packetAt(event.id);
        if (at !== null) newLabels.push({ id: event.id, x: at.x, y: at.y, kb: event.kb, tick: event.tick });
        break;
      }
      case 'hammerSwing':
        swingTick = event.tick;
        break;
      case 'modemHit':
        modemHitTick = event.tick;
        shakeUntilTick = Math.max(shakeUntilTick, event.tick + SHAKE_TICKS);
        break;
      case 'mobSpawned':
        if (event.source === 'schedule' || event.source === 'adHatch') rattleTick = event.tick;
        break;
      default:
        break;
    }
  }

  if (added.length > 0) corpses = [...corpses, ...added];
  const alive = corpses.filter((c) => tick - c.killTick < dieTicks(c.kind));
  if (alive.length !== corpses.length) corpses = alive;

  const hitKeys = Object.keys(hitTicks);
  const keptHits = hitKeys.filter((k) => tick - (hitTicks[Number(k)] as number) < HIT_FLASH_DRAW_TICKS);
  if (anyHit || keptHits.length !== hitKeys.length) {
    const next: Record<number, number> = {};
    for (const k of keptHits) next[Number(k)] = hitTicks[Number(k)] as number;
    for (const [k, v] of Object.entries(newHits)) {
      if (tick - v < HIT_FLASH_DRAW_TICKS) next[Number(k)] = v;
    }
    hitTicks = next;
  }
  const pops = keepRecent(effects.pops, newPops, tick, KILL_POP_TICKS);
  const kbLabels = keepRecent(effects.kbLabels, newLabels, tick, KB_LABEL_TICKS);

  if (
    hitTicks === effects.hitTicks &&
    pops === effects.pops &&
    kbLabels === effects.kbLabels &&
    corpses === effects.corpses &&
    swingTick === effects.swingTick &&
    shakeUntilTick === effects.shakeUntilTick &&
    rattleTick === effects.rattleTick &&
    modemHitTick === effects.modemHitTick
  ) {
    return effects;
  }
  return { corpses, swingTick, shakeUntilTick, rattleTick, modemHitTick, hitTicks, pops, kbLabels };
}

/** Old plus new entries whose age at `tick` is below `window`; the same array when unchanged. */
function keepRecent<T extends { readonly tick: number }>(
  old: readonly T[],
  added: readonly T[],
  tick: number,
  window: number,
): readonly T[] {
  const all = added.length > 0 ? [...old, ...added] : old;
  const kept = all.filter((e) => tick - e.tick < window);
  return kept.length === old.length && added.length === 0 ? old : kept;
}

/** True when `id` was hit within the last HIT_FLASH_DRAW_TICKS at `tick`. */
export function hitFlashActive(effects: LaneEffects, id: number, tick: number): boolean {
  const at = effects.hitTicks[id];
  return at !== undefined && tick - at >= 0 && tick - at < HIT_FLASH_DRAW_TICKS;
}

/**
 * Boss_Rumble window (juice Req 5.1): true for the BOSS_RUMBLE_TICKS before `bossTick` while
 * the boss has not spawned. With no boss tick (no director) never.
 */
export function bossRumbleActive(tick: number, bossTick: number | null, bossDone: boolean): boolean {
  if (bossTick === null || bossDone) return false;
  return tick >= bossTick - BOSS_RUMBLE_TICKS && tick < bossTick;
}

/** Deterministic manhole jitter, whole px, |dx|, |dy| ≤ RUMBLE_JITTER_PX. */
export function rumbleJitter(tick: number): { dx: number; dy: number } {
  return { dx: px(RUMBLE_JITTER_PX * Math.sin(tick * 3.1)), dy: px(RUMBLE_JITTER_PX * 0.5 * Math.cos(tick * 4.7)) };
}

/** Rounds to a whole pixel and turns -0 into 0. */
function px(v: number): number {
  return Math.round(v) || 0;
}

/**
 * Deterministic offset with |dx|, |dy| ≤ MAX_SHAKE_PX while `tick < shakeUntilTick`, else 0
 * (Req 11.7). Whole pixels from two sines of the tick, fading out over the last SHAKE_TICKS.
 */
export function shakeOffset(tick: number, shakeUntilTick: number): { dx: number; dy: number } {
  const remaining = shakeUntilTick - tick;
  if (!Number.isFinite(remaining) || remaining <= 0) return { dx: 0, dy: 0 };
  const amp = MAX_SHAKE_PX * Math.min(1, remaining / SHAKE_TICKS);
  return { dx: px(amp * Math.sin(tick * 2.3)), dy: px(amp * Math.cos(tick * 1.7)) };
}

/**
 * Pure (title-and-endings Req 7.2, 7.3): the lane's draw offset. `shakeOffset(tick,
 * shakeUntilTick)` while screen shake is enabled, else zero on both axes. Only the canvas
 * transform changes; Lane_Effects still record every `modemHit` (design D11).
 */
export function laneShake(enabled: boolean, tick: number, shakeUntilTick: number): { dx: number; dy: number } {
  return enabled ? shakeOffset(tick, shakeUntilTick) : { dx: 0, dy: 0 };
}
