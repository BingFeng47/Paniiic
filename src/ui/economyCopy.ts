// Shop tray and KB counter copy (Req 11.4). Dry late-90s OSD text; set only via textContent.
import type { ItemId, SlotStatus, WeaponId } from '../game/economy';

export const ECONOMY_COPY = {
  kbLabel: 'KB',
  priceSuffix: ' KB',
  soldOut: 'MAXED',
  fuelLabel: 'FUEL',
  blockerLabel: 'BLOCK',
  surgeLabel: 'SURGE',
  surgeHeld: 'ARMED',
  secondsSuffix: 's',
  items: {
    heavyHead: 'HEAVY HEAD',
    saw: 'E-SAW',
    highRpm: 'HIGH RPM',
    flamethrower: 'FLAMER',
    bigTank: 'BIG TANK',
    blocker: 'POPUP BLOCK',
    surge: 'SURGE PROT.',
  } satisfies Record<ItemId, string>,
  /** Slot names once everything in them is owned. */
  ownedSlotNames: { 1: 'HAMMER+', 2: 'E-SAW+', 3: 'FLAMER+' } as const,
  /** Weapon slot second line: the weapon in the hand, or an owned one a key press away. */
  inHand: 'IN HAND',
  stowed: 'READY',
  /** Short upgrade names for the weapon slot's upgrade button, after "UPG " and before the price. */
  upgrades: { heavyHead: 'HEAVY', highRpm: 'HI-RPM', bigTank: 'BIG TANK' } as const,
  upgradeMark: 'UPG ',
  /** Upgrade button tooltip: how to buy it from the keyboard. */
  upgradeTitle: (key: number): string => `Shift+${key} buys the upgrade`,
  /** Weapon button tooltip. */
  weaponTitle: (key: number): string => `${key} switches to this weapon`,
  weapons: { hammer: 'HAMMER', saw: 'E-SAW', flamethrower: 'FLAMER' } satisfies Record<WeaponId, string>,
  status: {
    affordable: 'READY',
    tooExpensive: 'NO KB',
    owned: 'OWNED',
    held: 'HELD',
    cooldown: 'WAIT',
  } satisfies Record<SlotStatus, string>,
  /** One-use item cooling down: "WAIT 12s". */
  cooldownText: (seconds: number): string => `WAIT ${seconds}s`,
} as const;

/** "KB 007": wallet zero-padded to 3 digits (Req 11.1). */
export function kbText(wallet: number): string {
  return `${ECONOMY_COPY.kbLabel} ${String(Math.max(0, Math.floor(wallet))).padStart(3, '0')}`;
}
