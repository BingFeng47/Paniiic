// Shop slots, buying, item effects and weapon switching (Req 4.2-4.4, 5.3, 9.1, 10.4).
// Pure: no DOM, no timers, no randomness.
import { DEFAULT_ECONOMY_BALANCE, type EconomyBalance } from '../balance/economy';
import { secondsToTicks } from '../balance/lane';
import type {
  EconomyEventBody,
  EconomyState,
  ItemId,
  ShopSlot,
  WeaponId,
} from './economyTypes';

export type SlotStatus = 'affordable' | 'tooExpensive' | 'owned' | 'held';

export interface ShopResult {
  readonly economy: EconomyState;
  readonly events: readonly EconomyEventBody[];
}

const WEAPON_ORDER: readonly WeaponId[] = ['hammer', 'saw', 'flamethrower'];

/** Starting economy: empty wallet, hammer active, nothing owned. */
export function createEconomyState(balance: EconomyBalance = DEFAULT_ECONOMY_BALANCE): EconomyState {
  return {
    balance,
    wallet: 0,
    gained: 0,
    spent: 0,
    lost: 0,
    packets: [],
    nextPacketId: 1,
    owned: [],
    active: 'hammer',
    pointer: null,
    sawTarget: null,
    sawCarry: 0,
    fuel: balance.fuelSeconds,
    flameLatched: false,
    flameCarry: {},
    burns: [],
    blockerUntilTick: null,
    surgeHeld: false,
    surgeUntilTick: null,
    comboCount: 0,
    lastKillTick: null,
    bestCombo: 0,
  };
}

/** Maximum flamethrower fuel in seconds, with the big tank if owned. */
export function maxFuel(e: EconomyState): number {
  return e.owned.includes('bigTank') ? e.balance.fuelSeconds * e.balance.bigTankFactor : e.balance.fuelSeconds;
}

/** The item a slot sells next, or null when everything in it is owned. */
export function nextItem(slot: ShopSlot, e: EconomyState): ItemId | null {
  const has = (item: ItemId): boolean => e.owned.includes(item);
  switch (slot) {
    case 1:
      return has('heavyHead') ? null : 'heavyHead';
    case 2:
      return !has('saw') ? 'saw' : has('highRpm') ? null : 'highRpm';
    case 3:
      return !has('flamethrower') ? 'flamethrower' : has('bigTank') ? null : 'bigTank';
    case 4:
      return 'blocker';
    case 5:
      return 'surge';
  }
}

export function slotStatus(slot: ShopSlot, e: EconomyState): SlotStatus {
  const item = nextItem(slot, e);
  if (item === null) return 'owned';
  if (item === 'surge' && e.surgeHeld) return 'held';
  return e.balance.prices[item] > e.wallet ? 'tooExpensive' : 'affordable';
}

/** Applies one Buy_Command at `tick`. */
export function buy(e: EconomyState, slot: ShopSlot, tick: number): ShopResult {
  const status = slotStatus(slot, e);
  const item = nextItem(slot, e);
  if (status !== 'affordable' || item === null) {
    return { economy: e, events: [{ type: 'buyRejected', slot, reason: status === 'affordable' ? 'owned' : status }] };
  }
  const price = e.balance.prices[item];
  const wallet = e.wallet - price;
  let next: EconomyState = { ...e, wallet, spent: e.spent + price };
  const events: EconomyEventBody[] = [
    { type: 'kbChanged', delta: -price, reason: 'purchase', wallet },
    { type: 'itemBought', item, price },
  ];
  if (item === 'blocker') {
    next = { ...next, blockerUntilTick: tick + secondsToTicks(e.balance.blockerSeconds) };
    events.push({ type: 'blockerStarted' });
  } else if (item === 'surge') {
    next = { ...next, surgeHeld: true };
  } else {
    next = { ...next, owned: [...e.owned, item] };
    if (item === 'saw' || item === 'flamethrower') {
      next = { ...next, active: item, sawTarget: null, sawCarry: 0 };
      if (item === 'flamethrower') next = { ...next, fuel: maxFuel(next), flameLatched: false };
      events.push({ type: 'weaponSwitched', weapon: item });
    }
  }
  return { economy: next, events };
}

/** Weapons the player can use, in cycle order. */
export function ownedWeapons(e: EconomyState): readonly WeaponId[] {
  return WEAPON_ORDER.filter((w) => w === 'hammer' || e.owned.includes(w));
}

/** Cycles the Active_Weapon over owned weapons, wrapping. Emits nothing with one weapon. */
export function switchWeapon(e: EconomyState, direction: 'next' | 'previous'): ShopResult {
  const weapons = ownedWeapons(e);
  if (weapons.length < 2) return { economy: e, events: [] };
  const i = Math.max(0, weapons.indexOf(e.active));
  const step = direction === 'next' ? 1 : -1;
  const weapon = weapons[(i + step + weapons.length) % weapons.length]!;
  return {
    economy: { ...e, active: weapon, sawTarget: null, sawCarry: 0 },
    events: [{ type: 'weaponSwitched', weapon }],
  };
}
