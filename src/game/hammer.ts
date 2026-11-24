// The Hammer: hit boxes, Hit_Priority, hit testing and the hammer system that turns Hammer_Commands
// into swings (Req 7.2–7.6). Pure: every number comes from the Lane_State's balance (Req 1.4).
//
// The hammer system runs before mobSystem (design D4), so it tests each click against the
// Enemy positions at the start of the tick, which is the state the player last saw (design D2).
import { secondsToTicks, type EnemyStats } from './balance/lane';
import type { System } from './context';
import { laneDraft } from './laneState';
import type { Enemy, LaneState } from './laneTypes';
import { damageEnemy, enemyStats } from './mobs';

/** An axis-aligned rectangle in Lane_Units. Y grows upward from the line (feet at y = 0). */
export interface Box {
  readonly left: number;
  readonly right: number;
  readonly bottom: number;
  readonly top: number;
}

/**
 * Padded Hit_Box in Lane_Units: anchored at the feet (x, 0), Lane_X ± width / 2 and Lane_Y from 0
 * to height, grown on every side by `padding`.
 */
export function hitBox(enemy: Enemy, stats: EnemyStats, padding: number): Box {
  const half = stats.width / 2;
  return {
    left: enemy.x - half - padding,
    right: enemy.x + half + padding,
    bottom: 0 - padding, // not -padding, which gives -0 when padding is 0
    top: stats.height + padding,
  };
}

/** Negative when `a` comes first in Hit_Priority: lower Lane_X first, then lower id (design D8). */
export function compareHitPriority(a: Enemy, b: Enemy): number {
  if (a.x !== b.x) return a.x < b.x ? -1 : 1;
  return a.id - b.id;
}

function contains(box: Box, x: number, y: number): boolean {
  return x >= box.left && x <= box.right && y >= box.bottom && y <= box.top;
}

/**
 * The first Enemy in Hit_Priority whose padded Hit_Box contains (x, y), edges included; or null
 * (Req 7.2).
 */
export function hitTest(lane: LaneState, x: number, y: number): Enemy | null {
  const padding = lane.balance.hitPadding;
  let best: Enemy | null = null;
  for (const enemy of lane.enemies) {
    if (!contains(hitBox(enemy, enemyStats(lane, enemy.kind), padding), x, y)) continue;
    if (best === null || compareHitPriority(enemy, best) < 0) best = enemy;
  }
  return best;
}

/**
 * For each command in `ctx.inputs`, in arrival order (Req 7.6): skip anything that is not a
 * Hammer_Command, skip non-finite points without starting the cooldown (Req 7.5) and skip while
 * the Hammer is not ready (Req 7.3). An accepted Swing starts the cooldown for hits and misses
 * alike, emits `hammerSwing` and then deals Hammer damage to the target (Req 7.2, 7.4). With a
 * cooldown of at least 1 tick, at most one command per tick is accepted.
 */
export const hammerSystem: System = (draft, ctx) => {
  const lane = laneDraft(draft);
  const { cooldownSeconds } = lane.balance.hammer;
  // Economy hooks (economy-weapons Req 6.1, 6.2): with an EconomyState the hammer only swings
  // while it is the Active_Weapon, and the heavy head sets its damage. The cooldown never changes.
  const economy = draft.economy;
  if (economy !== undefined && economy.active !== 'hammer') return;
  const damage = economy?.owned.includes('heavyHead')
    ? economy.balance.heavyHeadDamage
    : lane.balance.hammer.damage;
  for (const command of ctx.inputs) {
    if (command.type !== 'hammer') continue;
    const { x, y } = command;
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    if (ctx.tick < lane.hammerReadyTick) continue;
    lane.hammerReadyTick = ctx.tick + secondsToTicks(cooldownSeconds);
    const target = hitTest(lane, x, y);
    ctx.emit({ type: 'hammerSwing', x, y, targetId: target?.id ?? null });
    if (target !== null) damageEnemy(lane, ctx, target.id, damage);
  }
};
