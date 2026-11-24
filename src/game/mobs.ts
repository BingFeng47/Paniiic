// Mobs and Globs on the connection lane: adding them, damaging them and the per-tick mob system
// (movement, ranged arrival and spitting, melee arrival and repeated Melee_Hits, Glob impacts).
// Pure: every number comes from the
// Lane_State's balance (Req 1.4) and every duration goes through secondsToTicks (Req 2.4).
import { hitModem } from './economy/guard';
import { attackPoint, secondsToTicks, type EnemyStats } from './balance/lane';
import type { System, TickContext } from './context';
import { laneDraft, type MutableEnemy, type MutableLaneState } from './laneState';
import {
  isAttacker,
  isMeleeKind,
  type EnemyKind,
  type LaneState,
  type MobKind,
  type SpawnSource,
} from './laneTypes';
import { TICK_RATE } from './types';

/**
 * Tolerance for position thresholds (the Attack_Point, the Modem_Line for Globs and the ranged
 * stop point). Positions are
 * sums of float steps (40 / 60 per tick for a default Mob), so after the mathematically exact
 * number of ticks a Mob can sit about 1e-11 units short of the threshold. Treating anything
 * within 1e-9 as reaching it keeps arrivals and impacts on the expected tick (a default Mob from
 * x = 800 reaches its Attack_Point of 22 on tick 1,167; a ranged Mob stops at 400 after 600
 * ticks). One tick
 * of movement is far larger, so this never makes a Mob arrive a tick early. Same rule as the
 * download thresholds in step.ts.
 */
const POSITION_EPSILON = 1e-9;

/** The Enemy_Stats row for `kind` from the lane's own balance (Req 1.4). */
export function enemyStats(lane: LaneState, kind: EnemyKind): EnemyStats {
  return lane.balance.enemies[kind];
}

/**
 * Adds a Mob at `x` with the next id, full HP and the current tick as
 * its spawn tick, emits `mobSpawned` and returns the new id. A melee Mob's x is clamped
 * to [Attack_Point, Lane_Length] so it never starts left of where it will stand, and it starts
 * walking (`nextHitTick` and `lastMeleeTick` null). A ranged Mob is only capped to the
 * Lane_Length. Ids only grow, so
 * appending keeps the Enemy list sorted by id. Throws on a non-finite `x` or one at or left of
 * the Modem_Line: that is a bug in the caller (a spawner, the director or a boss summon).
 */
export function addMob(
  lane: MutableLaneState,
  ctx: TickContext,
  kind: MobKind,
  x: number,
  source: SpawnSource,
): number {
  if (!Number.isFinite(x) || x <= 0) {
    throw new Error(`addMob: x must be a finite number > 0, got ${x}`);
  }
  const id = lane.nextId;
  lane.nextId += 1;
  const base = {
    id,
    x: isMeleeKind(kind)
      ? Math.min(Math.max(x, attackPoint(lane.balance, kind)), lane.balance.laneLength)
      : Math.min(x, lane.balance.laneLength),
    hp: enemyStats(lane, kind).hp,
    spawnTick: ctx.tick,
    lastHitTick: null,
  };
  let enemy: MutableEnemy;
  switch (kind) {
    case 'default':
    case 'fast':
    case 'tank':
      enemy = { ...base, kind, nextHitTick: null, lastMeleeTick: null };
      break;
    case 'ranged':
      enemy = { ...base, kind, nextSpitTick: null, lastSpitTick: null };
      break;
    case 'boss':
      enemy = { ...base, kind, summonsDone: 0, nextHitTick: null, lastMeleeTick: null };
      break;
    default: {
      const unknown: never = kind;
      throw new Error(`addMob: unknown mob kind ${String(unknown)}`);
    }
  }
  lane.enemies.push(enemy);
  ctx.emit({ type: 'mobSpawned', id, kind, x: enemy.x, source });
  return id;
}

/**
 * Deals `amount` damage to Enemy `id` (Req 8.1): HP floors at 0, the tick becomes its last hit
 * tick and `mobHit` reports the HP actually removed. At 0 HP the Enemy is removed and
 * `mobKilled` carries its drop (Req 8.2); KB itself is left to the economy milestone (Req 8.4).
 * A boss that survives summons once per newly passed Boss_Threshold, in descending order
 * (Req 6.1, 6.2, 6.4); a killing hit summons nothing (Req 6.3).
 *
 * Unknown ids are a no-op (the target may have died earlier in the tick). A negative or
 * non-finite amount throws: a bug in a lane system, like the tick context's own checks.
 */
export function damageEnemy(
  lane: MutableLaneState,
  ctx: TickContext,
  id: number,
  amount: number,
): void {
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error(`damageEnemy: amount must be a finite number >= 0, got ${amount}`);
  }
  const index = lane.enemies.findIndex((enemy) => enemy.id === id);
  if (index < 0) return;
  const enemy = lane.enemies[index];
  const newHp = Math.max(0, enemy.hp - amount);
  const removed = enemy.hp - newHp;
  enemy.hp = newHp;
  enemy.lastHitTick = ctx.tick;
  ctx.emit({ type: 'mobHit', id, kind: enemy.kind, damage: removed, hp: newHp });

  if (newHp === 0) {
    lane.enemies.splice(index, 1);
    ctx.emit({
      type: 'mobKilled',
      id,
      kind: enemy.kind,
      x: enemy.x,
      dropKb: enemyStats(lane, enemy.kind).dropKb,
    });
    return;
  }

  if (enemy.kind !== 'boss') return;
  const { thresholds, summonCount, summonSpacing } = lane.balance.boss;
  const maxHp = enemyStats(lane, 'boss').hp;
  while (enemy.summonsDone < thresholds.length && newHp <= thresholds[enemy.summonsDone] * maxHp) {
    const threshold = thresholds[enemy.summonsDone];
    // Event order per summon: the mobSpawned events, then bossSummon, then popupBurst.
    const spawnedIds: number[] = [];
    for (let k = 0; k < summonCount; k++) {
      const x = Math.min(lane.balance.laneLength, enemy.x + k * summonSpacing);
      spawnedIds.push(addMob(lane, ctx, 'default', x, 'bossSummon'));
    }
    ctx.emit({ type: 'bossSummon', id, threshold, spawnedIds });
    ctx.emit({ type: 'popupBurst', count: lane.balance.popupBurstCount, cause: 'bossSummon' });
    enemy.summonsDone += 1;
  }
}

/**
 * Per tick, for each Enemy in ascending id order (a snapshot of the list): move it left by its
 * speed unless it is a stopped ranged Mob or an Attacker, stop a ranged Mob at the stop point and
 * let it spit, turn a walking melee Mob that reaches its Attack_Point into an Attacker (x set to
 * the Attack_Point, first hit due this tick, `mobArrived`), and let an Attacker whose hit is due
 * land one Melee_Hit: `mobBit`, then `modemHit` (and `integrityCritical`) from damageModem, then
 * a pop-up burst on the first hit of a tank or boss only. The next hit is due one Hit_Interval
 * later, so the k-th hit lands at arrivalTick + k × interval. Attackers stay on the lane until
 * killed. A Glob that reaches the Modem_Line hits once and is removed. Each Enemy lands at most
 * one hit per tick, so same-tick hits resolve in id order. Globs spat
 * this tick are appended after the loop, so they start moving on the next tick (Req 5.3). A
 * ranged Mob's death never touches its Globs (Req 5.4).
 */
export const mobSystem: System = (draft, ctx) => {
  const lane = laneDraft(draft);
  const { balance } = lane;
  const tick = ctx.tick;
  const survivors: MutableEnemy[] = [];
  const spat: MutableEnemy[] = [];

  for (const enemy of lane.enemies) {
    const stats = enemyStats(lane, enemy.kind);
    const stopped = (enemy.kind === 'ranged' && enemy.nextSpitTick !== null) || isAttacker(enemy);

    // 1. Move.
    if (!stopped) enemy.x -= stats.speed / TICK_RATE;

    if (enemy.kind === 'ranged') {
      // 2. Arrival: a walking ranged Mob that reaches the stop point stays there.
      if (enemy.nextSpitTick === null && enemy.x <= balance.ranged.stopX + POSITION_EPSILON) {
        enemy.x = balance.ranged.stopX;
        enemy.nextSpitTick = tick + secondsToTicks(balance.ranged.firstSpitSeconds);
      }
      // 3. Spit. The id is taken now so globSpat can name it; ids only grow, so the Globs
      //    appended after the loop keep the list sorted.
      if (enemy.nextSpitTick !== null && tick >= enemy.nextSpitTick) {
        const id = lane.nextId;
        lane.nextId += 1;
        spat.push({
          id,
          kind: 'glob',
          x: enemy.x,
          hp: enemyStats(lane, 'glob').hp,
          spawnTick: tick,
          lastHitTick: null,
          sourceId: enemy.id,
        });
        ctx.emit({ type: 'globSpat', id, sourceId: enemy.id, x: enemy.x });
        enemy.lastSpitTick = tick;
        enemy.nextSpitTick += secondsToTicks(balance.ranged.spitEverySeconds);
      }
    }

    // 4. Melee arrival and Melee_Hit, in the same pass so the arrival tick lands the first hit.
    if ('nextHitTick' in enemy) {
      const kind = enemy.kind;
      const point = attackPoint(balance, kind);
      if (enemy.nextHitTick === null && enemy.x <= point + POSITION_EPSILON) {
        enemy.x = point;
        enemy.nextHitTick = tick;
        ctx.emit({ type: 'mobArrived', id: enemy.id, kind });
      }
      if (enemy.nextHitTick !== null && tick >= enemy.nextHitTick) {
        const first = enemy.lastMeleeTick === null;
        ctx.emit({ type: 'mobBit', id: enemy.id, kind, damage: stats.damage });
        hitModem(draft, ctx, kind, stats.damage);
        if (first && (kind === 'tank' || kind === 'boss')) {
          ctx.emit({
            type: 'popupBurst',
            count: balance.popupBurstCount,
            cause: kind === 'tank' ? 'tankBite' : 'bossBite',
          });
        }
        enemy.lastMeleeTick = tick;
        enemy.nextHitTick += secondsToTicks(balance.melee[kind].hitEverySeconds);
      }
      survivors.push(enemy);
      continue;
    }

    // 5. Glob_Impact: mobBit, then modemHit from damageModem; the Glob is gone. Ranged Mobs
    //    never get here, their x stays at stopX > 0.
    if (enemy.x <= POSITION_EPSILON) {
      ctx.emit({ type: 'mobBit', id: enemy.id, kind: enemy.kind, damage: stats.damage });
      hitModem(draft, ctx, enemy.kind, stats.damage);
      continue;
    }

    survivors.push(enemy);
  }

  lane.enemies = [...survivors, ...spat];
};
