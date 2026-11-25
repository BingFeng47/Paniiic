// Plain-data economy types: KB wallet, packets, shop, weapons, items. Everything here must
// survive a JSON round trip (Req 13.1).

import type { EconomyBalance } from '../balance/economy';
import type { EnemyKind } from '../laneTypes';

export type WeaponId = 'hammer' | 'saw' | 'flamethrower';
export type ItemId =
  | 'heavyHead' | 'saw' | 'highRpm' | 'flamethrower' | 'bigTank' | 'blocker' | 'surge';
export type ShopSlot = 1 | 2 | 3 | 4 | 5;

export interface Packet {
  readonly id: number;
  readonly x: number;
  readonly kb: number;
  readonly dropTick: number;
}

export interface Burn {
  readonly enemyId: number;
  readonly untilTick: number;
  readonly carry: number;
}

export interface LanePointer {
  readonly x: number;
  readonly y: number;
  readonly down: boolean;
}

export interface EconomyState {
  readonly balance: EconomyBalance;
  readonly wallet: number;
  readonly gained: number;
  readonly spent: number;
  readonly lost: number;
  readonly packets: readonly Packet[];
  readonly nextPacketId: number;
  /** Weapons and upgrades bought, in buy order. The blocker and surge never appear here. */
  readonly owned: readonly ItemId[];
  readonly active: WeaponId;
  readonly pointer: LanePointer | null;
  readonly sawTarget: number | null;
  readonly sawCarry: number;
  /** Flamethrower fuel in seconds. */
  readonly fuel: number;
  /** Fuel ran out; no flame until a release arrives. */
  readonly flameLatched: boolean;
  /** Enemy id → fractional flame damage. */
  readonly flameCarry: Readonly<Record<string, number>>;
  readonly burns: readonly Burn[];
  readonly blockerUntilTick: number | null;
  readonly surgeHeld: boolean;
  readonly surgeUntilTick: number | null;
  /** First Tick a pop-up blocker can be bought again (cooldown after a purchase). */
  readonly blockerReadyTick: number;
  /** First Tick a surge protector can be bought again (cooldown after a purchase). */
  readonly surgeReadyTick: number;
  /** Current chain of non-glob kills (Req 5.4). 0 before the first kill. */
  readonly comboCount: number;
  /** Tick of the last non-glob kill, or null before the first one. */
  readonly lastKillTick: number | null;
  /** Longest chain reached this run. */
  readonly bestCombo: number;
}

export type LanePointerCommand = {
  readonly type: 'lanePointer';
  readonly x: number;
  readonly y: number;
  readonly down: boolean;
};
export type BuyCommand = { readonly type: 'buy'; readonly slot: ShopSlot };
export type SwitchCommand = { readonly type: 'switchWeapon'; readonly direction: 'next' | 'previous' };
/** Picks an owned weapon directly (keys 1–3, clicking a weapon slot). Unowned weapons are ignored. */
export type EquipCommand = { readonly type: 'equipWeapon'; readonly weapon: WeaponId };
export type EconomyCommand = LanePointerCommand | BuyCommand | SwitchCommand | EquipCommand;

export type KbReason = 'packet' | 'adClosed' | 'fakeButton' | 'purchase' | 'combo';
export type BuyRejectReason = 'tooExpensive' | 'owned' | 'held' | 'cooldown';

export type EconomyEventBody =
  | { readonly type: 'kbChanged'; readonly delta: number; readonly reason: KbReason; readonly wallet: number }
  | { readonly type: 'packetDropped'; readonly id: number; readonly x: number; readonly kb: number }
  | { readonly type: 'packetCollected'; readonly id: number; readonly kb: number }
  | { readonly type: 'packetExpired'; readonly id: number }
  | { readonly type: 'itemBought'; readonly item: ItemId; readonly price: number }
  | { readonly type: 'buyRejected'; readonly slot: ShopSlot; readonly reason: BuyRejectReason }
  | { readonly type: 'weaponSwitched'; readonly weapon: WeaponId }
  | { readonly type: 'blockerStarted' }
  | { readonly type: 'blockerEnded' }
  | { readonly type: 'adBlocked'; readonly id: number }
  | { readonly type: 'surgeStarted' }
  | { readonly type: 'surgeEnded' }
  | { readonly type: 'modemHitBlocked'; readonly kind: EnemyKind; readonly amount: number }
  | { readonly type: 'combo'; readonly count: number };
