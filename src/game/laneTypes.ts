// Plain-data types for the connection lane (milestone 3). Like types.ts, everything here must
// survive a JSON round trip unchanged.

// balance/lane.ts imports values from this module, so this import must stay type-only to keep
// the module graph free of runtime cycles.
import type { LaneBalance } from './balance/lane';

export type MobKind = 'default' | 'fast' | 'tank' | 'ranged' | 'boss';
/** A Mob or a Glob (a ranged Mob's projectile). */
export type EnemyKind = MobKind | 'glob';

export const MOB_KINDS: readonly MobKind[] = Object.freeze([
  'default',
  'fast',
  'tank',
  'ranged',
  'boss',
] as const);
export const ENEMY_KINDS: readonly EnemyKind[] = Object.freeze([...MOB_KINDS, 'glob'] as const);
/** Mobs that walk to their Attack_Point and hit the modem there. */
export type MeleeKind = 'default' | 'fast' | 'tank' | 'boss';
export const MELEE_KINDS: readonly MeleeKind[] = Object.freeze([
  'default',
  'fast',
  'tank',
  'boss',
] as const);
export function isMeleeKind(kind: EnemyKind): kind is MeleeKind {
  return kind === 'default' || kind === 'fast' || kind === 'tank' || kind === 'boss';
}

interface EnemyBase {
  readonly id: number;
  /** Lane_X, 0 < x ≤ laneLength. */
  readonly x: number;
  /** 1..maxHp. */
  readonly hp: number;
  readonly spawnTick: number;
  readonly lastHitTick: number | null;
}

interface MeleeFields {
  /** null while walking; the Tick of the next Melee_Hit while an Attacker. */
  readonly nextHitTick: number | null;
  /** Tick of the latest Melee_Hit, or null before the first. */
  readonly lastMeleeTick: number | null;
}
export type Enemy =
  | (EnemyBase & MeleeFields & { readonly kind: 'default' | 'fast' | 'tank' })
  | (EnemyBase & {
      readonly kind: 'ranged';
      /** null while walking. */
      readonly nextSpitTick: number | null;
      readonly lastSpitTick: number | null;
    })
  /** summonsDone: how many Boss_Thresholds have been passed. */
  | (EnemyBase & MeleeFields & { readonly kind: 'boss'; readonly summonsDone: number })
  | (EnemyBase & { readonly kind: 'glob'; readonly sourceId: number });
/** True for a melee Mob standing at its Attack_Point. */
export function isAttacker(enemy: Enemy): boolean {
  return isMeleeKind(enemy.kind) && 'nextHitTick' in enemy && enemy.nextHitTick !== null;
}

export interface LaneState {
  readonly balance: LaneBalance;
  /** Starts at 1. */
  readonly nextId: number;
  /** Sorted by ascending id. */
  readonly enemies: readonly Enemy[];
  /** Starts at 0. */
  readonly hammerReadyTick: number;
}

/** A hammer click at a point in Lane_Units. */
export type HammerCommand = { readonly type: 'hammer'; readonly x: number; readonly y: number };

/** Open for later milestones to extend (for example a `fakeButton` source in milestone 5). */
export type SpawnSource = 'schedule' | 'bossSummon' | 'fakeButton' | 'adHatch';
export type BurstCause = 'tankBite' | 'bossBite' | 'bossSummon';

export type LaneEventBody =
  | {
      readonly type: 'mobSpawned';
      readonly id: number;
      readonly kind: MobKind;
      readonly x: number;
      readonly source: SpawnSource;
    }
  | { readonly type: 'mobArrived'; readonly id: number; readonly kind: MeleeKind }
  | { readonly type: 'globSpat'; readonly id: number; readonly sourceId: number; readonly x: number }
  | {
      readonly type: 'hammerSwing';
      readonly x: number;
      readonly y: number;
      readonly targetId: number | null;
    }
  | {
      readonly type: 'mobHit';
      readonly id: number;
      readonly kind: EnemyKind;
      readonly damage: number;
      readonly hp: number;
    }
  | {
      readonly type: 'mobKilled';
      readonly id: number;
      readonly kind: EnemyKind;
      readonly x: number;
      readonly dropKb: number;
    }
  | { readonly type: 'mobBit'; readonly id: number; readonly kind: EnemyKind; readonly damage: number }
  | {
      readonly type: 'bossSummon';
      readonly id: number;
      readonly threshold: number;
      readonly spawnedIds: readonly number[];
    }
  | { readonly type: 'popupBurst'; readonly count: number; readonly cause: BurstCause };
