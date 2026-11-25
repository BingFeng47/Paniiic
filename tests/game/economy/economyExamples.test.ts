// Economy example tests (economy-weapons design, Testing Strategy): each Item, upgrade, slot
// order and reject reason, fake loss at a small wallet, pickup radius edge, packet expiry,
// flame cone, burn refresh, fuel latch, surge window edges and the blocker.
// Heavy head damage 2 at the same cooldown is covered in hooks.test.ts.
import { describe, expect, it } from 'vitest';
import { DEFAULT_AD_BALANCE } from '../../../src/game/balance/ads';
import { DEFAULT_ECONOMY_BALANCE } from '../../../src/game/balance/economy';
import { DEFAULT_LANE_BALANCE, secondsToTicks } from '../../../src/game/balance/lane';
import { initialAds } from '../../../src/game/ads/adSystems';
import { openAd } from '../../../src/game/ads/openAd';
import type { Ad } from '../../../src/game/ads/adTypes';
import type { System } from '../../../src/game/context';
import {
  PACKET_Y,
  buy,
  createEconomyState,
  inFlameCone,
  nextItem,
  slotStatus,
  switchWeapon,
  walletSystem,
  weaponSystem,
  type EconomyState,
  type ShopSlot,
} from '../../../src/game/economy';
import { createLaneSystems } from '../../../src/game/lane';
import type { MutableLaneState } from '../../../src/game/laneState';
import { step } from '../../../src/game/step';
import type { GameEvent, GameState, InputCommand } from '../../../src/game/types';
import { attackerAt, hitBoxCentre, laneWith, type EnemySpec } from '../../helpers/lane';

const B = DEFAULT_ECONOMY_BALANCE;
const P = B.prices;
const econ = (patch: Partial<EconomyState> = {}): EconomyState => ({ ...createEconomyState(), ...patch });

function withEconomy(enemies: readonly EnemySpec[], patch: Partial<EconomyState> = {}): GameState {
  return { ...laneWith(enemies), economy: econ(patch) };
}

function systems(extra: readonly System[] = []): readonly System[] {
  return [...createLaneSystems({ weapons: weaponSystem }), ...extra, walletSystem];
}

function run(
  state: GameState,
  ticks: number,
  inputs: (s: GameState) => readonly InputCommand[] = () => [],
  sys: readonly System[] = systems(),
) {
  const events: GameEvent[] = [];
  const perTick: GameEvent[][] = [];
  let s = state;
  for (let i = 0; i < ticks; i++) {
    const r = step(s, inputs(s), sys);
    s = r.state;
    perTick.push([...r.events]);
    events.push(...r.events);
  }
  return { final: s, events, perTick };
}

const ofType = <T extends GameEvent['type']>(events: readonly GameEvent[], type: T) =>
  events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type);

const pointer = (x: number, y: number, down: boolean): InputCommand => ({ type: 'lanePointer', x, y, down });

describe('shop items, upgrades and slot order', () => {
  it('slots sell their items in order', () => {
    let e = econ({ wallet: 10_000 });
    const bought: string[] = [];
    for (const slot of [1, 1, 2, 2, 2, 3, 3, 3] as ShopSlot[]) {
      const r = buy(e, slot, 1);
      e = r.economy;
      const ev = r.events.find((x) => x.type === 'itemBought' || x.type === 'buyRejected')!;
      bought.push(ev.type === 'itemBought' ? ev.item : `rejected:${ev.reason}`);
    }
    expect(bought).toEqual([
      'heavyHead', 'rejected:owned', 'saw', 'highRpm', 'rejected:owned',
      'flamethrower', 'bigTank', 'rejected:owned',
    ]);
    expect(nextItem(1, e)).toBeNull();
    expect(nextItem(4, e)).toBe('blocker');
    expect(nextItem(5, e)).toBe('surge');
    expect(e.spent).toBe(P.heavyHead + P.saw + P.highRpm + P.flamethrower + P.bigTank);
  });

  it('buying charges the price and emits kbChanged then itemBought', () => {
    const r = buy(econ({ wallet: P.heavyHead }), 1, 5);
    expect(r.events).toEqual([
      { type: 'kbChanged', delta: -P.heavyHead, reason: 'purchase', wallet: 0 },
      { type: 'itemBought', item: 'heavyHead', price: P.heavyHead },
    ]);
    expect(r.economy).toMatchObject({ wallet: 0, spent: P.heavyHead, owned: ['heavyHead'], active: 'hammer' });
  });

  it('a bought weapon becomes active; the flamethrower starts full', () => {
    const saw = buy(econ({ wallet: P.saw }), 2, 1);
    expect(saw.economy.active).toBe('saw');
    expect(saw.events).toContainEqual({ type: 'weaponSwitched', weapon: 'saw' });
    const flame = buy(econ({ wallet: P.flamethrower, fuel: 0 }), 3, 1);
    expect(flame.economy).toMatchObject({ active: 'flamethrower', fuel: B.fuelSeconds });
    const tank = buy(flame.economy, 3, 1);
    expect(tank.events.some((x) => x.type === 'buyRejected')).toBe(true);
    const tank2 = buy({ ...flame.economy, wallet: P.bigTank }, 3, 1);
    expect(tank2.economy.owned).toContain('bigTank');
    expect(tank2.economy.active).toBe('flamethrower');
  });

  it('the blocker starts its window and the surge is held; neither is owned', () => {
    const blocker = buy(econ({ wallet: P.blocker }), 4, 10);
    expect(blocker.economy.blockerUntilTick).toBe(10 + secondsToTicks(B.blockerSeconds));
    expect(blocker.events.map((x) => x.type)).toContain('blockerStarted');
    expect(blocker.economy.owned).toEqual([]);
    const surge = buy(econ({ wallet: P.surge }), 5, 10);
    expect(surge.economy).toMatchObject({ surgeHeld: true, owned: [], surgeUntilTick: null });
  });

  it('reject reasons: tooExpensive, owned, held', () => {
    const poor = buy(econ({ wallet: P.saw - 1 }), 2, 1);
    expect(poor.events).toEqual([{ type: 'buyRejected', slot: 2, reason: 'tooExpensive' }]);
    expect(poor.economy.wallet).toBe(P.saw - 1);
    const owned = buy(econ({ wallet: 999, owned: ['heavyHead'] }), 1, 1);
    expect(owned.events).toEqual([{ type: 'buyRejected', slot: 1, reason: 'owned' }]);
    const held = buy(econ({ wallet: 999, surgeHeld: true }), 5, 1);
    expect(held.events).toEqual([{ type: 'buyRejected', slot: 5, reason: 'held' }]);
    expect(slotStatus(5, econ({ wallet: 0, surgeHeld: true }))).toBe('held');
  });

  it('switching cycles owned weapons hammer → saw → flamethrower and wraps', () => {
    const e = econ({ owned: ['flamethrower', 'saw'], active: 'hammer' });
    const n1 = switchWeapon(e, 'next').economy;
    const n2 = switchWeapon(n1, 'next').economy;
    const n3 = switchWeapon(n2, 'next').economy;
    expect([n1.active, n2.active, n3.active]).toEqual(['saw', 'flamethrower', 'hammer']);
    expect(switchWeapon(e, 'previous').economy.active).toBe('flamethrower');
    expect(switchWeapon(econ(), 'next').events).toEqual([]);
  });
});

describe('wallet', () => {
  it('a fake button at a wallet of 3 loses only 3', () => {
    const fake: System = (_d, ctx) => {
      if (ctx.tick === 1) ctx.emit({ type: 'fakeButtonClicked', id: 9, penalty: 20 });
    };
    const { final, events } = run(withEconomy([], { wallet: 3, gained: 3 }), 1, () => [], systems([fake]));
    expect(ofType(events, 'kbChanged')).toEqual([expect.objectContaining({ type: 'kbChanged', delta: -3, reason: 'fakeButton', wallet: 0 })]);
    expect(final.economy).toMatchObject({ wallet: 0, lost: 3 });
  });

  it('a kill drops a packet at the mob', () => {
    // A fast mob: one heavy-head hit kills it.
    const start = withEconomy([{ kind: 'fast', x: 400 }], { owned: ['heavyHead'] });
    const { x, y } = hitBoxCentre(start, start.lane!.enemies[0]);
    const { final, events } = run(start, 1, () => [{ type: 'hammer', x, y }]);
    const killed = ofType(events, 'mobKilled')[0];
    expect(ofType(events, 'packetDropped')).toEqual([expect.objectContaining({ type: 'packetDropped', id: 1, x: killed.x, kb: DEFAULT_LANE_BALANCE.enemies.fast.dropKb })]);
    expect(final.economy!.packets).toEqual([{ id: 1, x: killed.x, kb: killed.dropKb, dropTick: 1 }]);
  });

  it('a killed Glob drops no packet because its drop is 0 (pacing-and-economy Req 4.4)', () => {
    expect(DEFAULT_LANE_BALANCE.enemies.glob.dropKb).toBe(0);
    const start = withEconomy([{ kind: 'glob', x: 300, sourceId: 7 }]);
    const { x, y } = hitBoxCentre(start, start.lane!.enemies[0]);
    const { final, events } = run(start, 1, () => [{ type: 'hammer', x, y }]);
    expect(ofType(events, 'mobKilled')).toEqual([expect.objectContaining({ kind: 'glob', dropKb: 0 })]);
    expect(ofType(events, 'packetDropped')).toHaveLength(0);
    expect(final.economy).toMatchObject({ packets: [], wallet: 0, gained: 0 });
  });

  const packet = { packets: [{ id: 1, x: 300, kb: 5, dropTick: 0 }], nextPacketId: 2 };

  it('collects a packet exactly at the pickup radius and not just past it', () => {
    const edge = run(withEconomy([], packet), 1, () => [pointer(300 + B.pickupRadius, PACKET_Y, false)]);
    expect(ofType(edge.events, 'packetCollected')).toEqual([expect.objectContaining({ type: 'packetCollected', id: 1, kb: 5 })]);
    expect(edge.final.economy).toMatchObject({ wallet: 5, gained: 5, packets: [] });
    const past = run(withEconomy([], packet), 1, () => [pointer(300, PACKET_Y + B.pickupRadius + 0.01, false)]);
    expect(ofType(past.events, 'packetCollected')).toHaveLength(0);
    expect(past.final.economy!.packets).toHaveLength(1);
  });

  it('a packet expires exactly 180 ticks (3 s) after its drop', () => {
    const life = secondsToTicks(B.packetLifetimeSeconds);
    expect(life).toBe(180);
    const { perTick, final } = run(withEconomy([], packet), life);
    expect(perTick.slice(0, life - 1).flat().some((e) => e.type === 'packetExpired')).toBe(false);
    expect(ofType(perTick[life - 1], 'packetExpired')).toEqual([expect.objectContaining({ type: 'packetExpired', id: 1 })]);
    expect(final.tick).toBe(180);
    expect(final.economy!.packets).toEqual([]);
  });
});

describe('flamethrower', () => {
  it('the cone hits an Enemy ahead and misses one behind or off-angle', () => {
    const state = laneWith([{ kind: 'boss', x: 400 }]);
    const lane = state.lane as MutableLaneState;
    const enemy = lane.enemies[0];
    const c = hitBoxCentre(state, enemy);
    const reach = B.flameReach;
    const half = B.flameHalfAngleDeg;
    expect(inFlameCone(enemy, lane, c.x - 100, c.y, reach, half)).toBe(true);
    expect(inFlameCone(enemy, lane, c.x + 300, c.y, reach, half)).toBe(false);
    expect(inFlameCone(enemy, lane, c.x - 1000, c.y, reach, half)).toBe(false);
    expect(inFlameCone(enemy, lane, c.x - 100, c.y + 500, reach, half)).toBe(false);
  });

  const flameOn = { owned: ['flamethrower'] as const, active: 'flamethrower' as const };

  it('firing refreshes the Burn, which keeps ticking after release and then ends', () => {
    // A tank, not the boss: the boss takes only bossFlameFactor of flame and burn damage.
    const start = withEconomy([{ kind: 'tank', x: 600 }], { ...flameOn, owned: ['flamethrower'] });
    const c = hitBoxCentre(start, start.lane!.enemies[0]);
    const burnTicks = secondsToTicks(B.burnSeconds);
    const firing = run(start, 30, () => [pointer(c.x - 50, c.y, true)]);
    expect(firing.final.economy!.burns).toEqual([
      expect.objectContaining({ enemyId: 1, untilTick: 30 + burnTicks }),
    ]);
    const hpAtRelease = firing.final.lane!.enemies[0].hp;
    const after = run(firing.final, burnTicks, () => [pointer(c.x - 50, c.y, false)]);
    expect(after.final.economy!.burns).toEqual([]);
    // Burn deals 1 per second for 2 s after the last flame tick: about 2 more damage.
    const burnDamage = hpAtRelease - after.final.lane!.enemies[0].hp;
    expect(burnDamage).toBeGreaterThanOrEqual(1);
    expect(burnDamage).toBeLessThanOrEqual(3);
  });

  it('the boss takes bossFlameFactor of flame and burn damage (weapon roles)', () => {
    const damageOver = (kind: 'boss' | 'tank', ticks: number): number => {
      const start = withEconomy([{ kind, x: 600 }], { ...flameOn, owned: ['flamethrower'] });
      const c = hitBoxCentre(start, start.lane!.enemies[0]);
      const fired = run(start, ticks, () => [pointer(c.x - 50, c.y, true)]);
      return start.lane!.enemies[0].hp - (fired.final.lane!.enemies[0]?.hp ?? 0);
    };
    // 1 s of flame: 4 to a tank (plus burn), a quarter of that to the boss.
    const tank = damageOver('tank', 60);
    const boss = damageOver('boss', 60);
    expect(tank).toBeGreaterThanOrEqual(B.flameDps);
    expect(boss).toBeLessThanOrEqual(Math.ceil((B.flameDps + B.burnDps) * B.bossFlameFactor));
    expect(boss).toBeLessThan(tank);
  });

  it('latches at empty fuel until a release, then fires again', () => {
    const start = withEconomy([{ kind: 'boss', x: 600 }], { ...flameOn, owned: ['flamethrower'], fuel: 1 / 60 });
    const c = hitBoxCentre(start, start.lane!.enemies[0]);
    const hold = () => [pointer(c.x - 50, c.y, true)];
    const first = run(start, 1, hold);
    expect(first.final.economy).toMatchObject({ fuel: 0, flameLatched: true });
    const held = run(first.final, 10, hold);
    expect(held.final.economy!.flameLatched).toBe(true);
    expect(held.final.economy!.fuel).toBeGreaterThan(0); // refills while not firing
    expect(held.final.economy!.flameCarry['1']).toBe(first.final.economy!.flameCarry['1']);
    const released = run(held.final, 1, () => [pointer(c.x - 50, c.y, false)]);
    expect(released.final.economy!.flameLatched).toBe(false);
    const fuelBefore = released.final.economy!.fuel;
    const again = run(released.final, 1, hold);
    expect(again.final.economy!.fuel).toBeLessThan(fuelBefore);
  });
});

describe('surge window edges', () => {
  it('blocks a hit on the last tick of the window, not on its end tick, and ends with surgeEnded', () => {
    const base = withEconomy(
      [attackerAt('default', { nextHitTick: 299 })],
      { surgeUntilTick: 300 },
    );
    const start = { ...base, tick: 298 };
    const t299 = run(start, 1);
    expect(ofType(t299.events, 'modemHitBlocked')).toHaveLength(1);
    expect(ofType(t299.events, 'surgeEnded')).toHaveLength(0);
    expect(t299.final.integrity).toBe(100);

    const late = { ...withEconomy([attackerAt('default', { nextHitTick: 300 })], { surgeUntilTick: 300 }), tick: 299 };
    const t300 = run(late, 1);
    expect(ofType(t300.events, 'modemHitBlocked')).toHaveLength(0);
    expect(ofType(t300.events, 'modemHit')).toHaveLength(1);
    expect(ofType(t300.events, 'surgeEnded')).toHaveLength(1);
    expect(t300.final.economy!.surgeUntilTick).toBeNull();
    expect(t300.final.integrity).toBe(100 - DEFAULT_LANE_BALANCE.enemies.default.damage);
  });

  it('a held surge switches on at a hit that lands on the old window end tick', () => {
    const start = {
      ...withEconomy([attackerAt('default', { nextHitTick: 300 })], { surgeUntilTick: 300, surgeHeld: true }),
      tick: 299,
    };
    const t300 = run(start, 1);
    expect(ofType(t300.events, 'surgeEnded')).toHaveLength(1);
    expect(ofType(t300.events, 'surgeStarted')).toHaveLength(1);
    expect(ofType(t300.events, 'modemHitBlocked')).toHaveLength(1);
    expect(ofType(t300.events, 'modemHit')).toHaveLength(0);
    expect(t300.final.economy).toMatchObject({ surgeHeld: false, surgeUntilTick: 300 + secondsToTicks(B.surgeSeconds) });
    expect(t300.final.integrity).toBe(100);
  });
});

describe('pop-up blocker', () => {
  function withAds(patch: Partial<EconomyState>): GameState {
    const s = withEconomy([], patch);
    const ad = (id: number, kind: Ad['kind']): Ad => ({
      id, kind, pattern: kind === 'fake' ? null : 'plain', rect: { x: 0, y: 0, w: 100, h: 80 },
      openTick: 0, copy: 0, laneCover: false, stage: 'main', corner: null, closeAt: null, jumps: 0,
    });
    return { ...s, ads: { ...initialAds(DEFAULT_AD_BALANCE), nextId: 3, ads: [ad(1, 'clutter'), ad(2, 'fake')] } };
  }

  it('clears an existing clutter Ad with no reward and leaves the fake button', () => {
    const { final, events } = run(withAds({ blockerUntilTick: 100 }), 1);
    expect(ofType(events, 'adBlocked')).toEqual([expect.objectContaining({ type: 'adBlocked', id: 1 })]);
    expect(ofType(events, 'adClosed')).toHaveLength(0);
    expect(ofType(events, 'kbChanged')).toHaveLength(0);
    expect(final.ads!.ads.map((a) => a.id)).toEqual([2]);
  });

  it('clears a clutter Ad opened during the window on the same tick', () => {
    const opener: System = (draft, ctx) => {
      if (ctx.tick === 2) draft.ads = openAd(draft.ads!, ctx, 'clutter', ['plain'], false);
    };
    const { final, perTick } = run(withAds({ blockerUntilTick: 100 }), 2, () => [], systems([opener]));
    expect(ofType(perTick[1], 'adOpened')).toEqual([expect.objectContaining({ id: 3, kind: 'clutter' })]);
    expect(ofType(perTick[1], 'adBlocked')).toEqual([expect.objectContaining({ type: 'adBlocked', id: 3 })]);
    expect(final.ads!.ads.map((a) => a.id)).toEqual([2]);
  });

  it('ends with blockerEnded and stops clearing', () => {
    const opener: System = (draft, ctx) => {
      if (ctx.tick === 2) draft.ads = openAd(draft.ads!, ctx, 'clutter', ['plain'], false);
    };
    const { final, perTick } = run(withAds({ blockerUntilTick: 2 }), 2, () => [], systems([opener]));
    expect(ofType(perTick[1], 'blockerEnded')).toHaveLength(1);
    expect(ofType(perTick[1], 'adBlocked')).toHaveLength(0);
    expect(final.economy!.blockerUntilTick).toBeNull();
    expect(final.ads!.ads.map((a) => a.id)).toEqual([2, 3]);
  });
});
