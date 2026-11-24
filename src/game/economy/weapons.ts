// weaponSystem: shop and switch commands, the latest lane pointer, the saw, the flamethrower and
// Burns (economy-weapons Req 4.7, 5.3, 7.1, 7.2, 8.1-8.3, 8.5). Runs after hammerSystem and before
// mobSystem. Pure: every number comes from the EconomyState's balance. Without an EconomyState
// or a lane it does nothing.
import type { System, TickContext } from '../context';
import { compareHitPriority, hitBox, hitTest } from '../hammer';
import { secondsToTicks } from '../balance/lane';
import type { MutableLaneState } from '../laneState';
import type { Enemy } from '../laneTypes';
import { damageEnemy, enemyStats } from '../mobs';
import { TICK_RATE } from '../types';
import type { Burn, EconomyState } from './economyTypes';
import { buy, maxFuel, switchWeapon } from './shop';

const EPSILON = 1e-9;

/** Applies buy, switchWeapon and lanePointer commands in arrival order (Req 4.7, 5.3). */
function applyInputs(e: EconomyState, ctx: TickContext): EconomyState {
  let next = e;
  for (const command of ctx.inputs) {
    if (command.type === 'buy') {
      const result = buy(next, command.slot, ctx.tick);
      next = result.economy;
      result.events.forEach(ctx.emit);
    } else if (command.type === 'switchWeapon') {
      const result = switchWeapon(next, command.direction);
      next = result.economy;
      result.events.forEach(ctx.emit);
    } else if (command.type === 'lanePointer') {
      const { x, y, down } = command;
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      next = { ...next, pointer: { x, y, down } };
    }
  }
  return next;
}

/** True when the Enemy's padded Hit_Box overlaps the flame cone from (px, py) toward +x. */
export function inFlameCone(
  enemy: Enemy,
  lane: MutableLaneState,
  px: number,
  py: number,
  reach: number,
  halfAngleDeg: number,
): boolean {
  const box = hitBox(enemy, enemyStats(lane, enemy.kind), lane.balance.hitPadding);
  const nx = Math.min(Math.max(px, box.left), box.right);
  const ny = Math.min(Math.max(py, box.bottom), box.top);
  const dx = nx - px;
  const dy = ny - py;
  if (dx === 0 && dy === 0) return true; // pointer inside the box
  if (dx * dx + dy * dy > reach * reach) return false;
  if (dx <= 0) return false;
  return Math.abs(Math.atan2(dy, dx)) <= (halfAngleDeg * Math.PI) / 180;
}

/** Adds `dps / TICK_RATE` to a carry and applies the whole points. Returns the remainder. */
function applyCarry(lane: MutableLaneState, ctx: TickContext, id: number, carry: number, dps: number): number {
  const total = carry + dps / TICK_RATE;
  const whole = Math.floor(total + EPSILON);
  if (whole > 0) damageEnemy(lane, ctx, id, whole);
  return Math.max(0, total - whole);
}

const alive = (lane: MutableLaneState, id: number): boolean => lane.enemies.some((en) => en.id === id);

export const weaponSystem: System = (draft, ctx) => {
  if (draft.economy === undefined || draft.lane === undefined) return;
  const lane = draft.lane as MutableLaneState;
  let e = applyInputs(draft.economy, ctx);
  const b = e.balance;
  const pointer = e.pointer;
  const down = pointer !== null && pointer.down;

  // Saw (Req 7.1, 7.2).
  if (e.active === 'saw' && down) {
    const target = hitTest(lane, pointer.x, pointer.y);
    if (target === null) {
      e = { ...e, sawTarget: null, sawCarry: 0 };
    } else {
      const carry = target.id === e.sawTarget ? e.sawCarry : 0;
      const dps = e.owned.includes('highRpm') ? b.sawDps * b.highRpmFactor : b.sawDps;
      const rest = applyCarry(lane, ctx, target.id, carry, dps);
      e = alive(lane, target.id)
        ? { ...e, sawTarget: target.id, sawCarry: rest }
        : { ...e, sawTarget: null, sawCarry: 0 };
    }
  } else if (e.sawTarget !== null || e.sawCarry !== 0) {
    e = { ...e, sawTarget: null, sawCarry: 0 };
  }

  // Flamethrower: latch release, firing, fuel (Req 8.1, 8.3, 8.5).
  let latched = e.flameLatched && down;
  const firing = e.active === 'flamethrower' && down && e.fuel > 0 && !latched;
  let fuel = e.fuel;
  const flameCarry: Record<string, number> = {};
  let burns: Burn[] = e.burns.slice();
  if (firing) {
    const untilTick = ctx.tick + secondsToTicks(b.burnSeconds);
    const hits = lane.enemies
      .filter((en) => inFlameCone(en, lane, pointer.x, pointer.y, b.flameReach, b.flameHalfAngleDeg))
      .sort(compareHitPriority)
      .map((en) => en.id);
    for (const id of hits) {
      if (!alive(lane, id)) continue;
      const rest = applyCarry(lane, ctx, id, e.flameCarry[String(id)] ?? 0, b.flameDps);
      if (!alive(lane, id)) continue;
      flameCarry[String(id)] = rest;
      // Burn starts or restarts for burnSeconds (Req 8.2).
      const i = burns.findIndex((burn) => burn.enemyId === id);
      if (i >= 0) burns[i] = { ...burns[i]!, untilTick };
      else burns.push({ enemyId: id, untilTick, carry: 0 });
    }
    fuel = Math.max(0, fuel - 1 / TICK_RATE);
    if (fuel < EPSILON) {
      fuel = 0;
      latched = true;
    }
  } else {
    for (const [id, carry] of Object.entries(e.flameCarry)) {
      if (alive(lane, Number(id))) flameCarry[id] = carry;
    }
    fuel = Math.min(maxFuel(e), fuel + b.fuelRefillPerSecond / TICK_RATE);
  }

  // Burns: tick, then drop expired ones and ones on dead Enemies.
  const kept: Burn[] = [];
  for (const burn of burns) {
    if (ctx.tick >= burn.untilTick || !alive(lane, burn.enemyId)) continue;
    const carry = applyCarry(lane, ctx, burn.enemyId, burn.carry, b.burnDps);
    if (alive(lane, burn.enemyId)) kept.push({ ...burn, carry });
  }
  burns = kept;
  for (const id of Object.keys(flameCarry)) {
    if (!alive(lane, Number(id))) delete flameCarry[id];
  }

  draft.economy = { ...e, fuel, flameLatched: latched, flameCarry, burns };
};
