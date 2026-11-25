// Weapon and shop controls (docs/game-design.md section 6). Pure: maps a shop slot, plus whether
// the player asked for the upgrade (Shift, or the tray's upgrade button), to the one command to
// send. The lane view's keys and the shop tray's clicks both go through here.
//
// - 1 / 2 / 3: equip the hammer / saw / flamethrower when owned; otherwise buy it (a bought
//   weapon is equipped at once by the shop).
// - Shift + 1 / 2 / 3: buy that slot's next item: the weapon, then its upgrade.
// - 4 / 5: buy the pop-up blocker / surge protector.
import type { EconomyCommand, EconomyState, ShopSlot, WeaponId } from '../game/economy';
import { ownedWeapons } from '../game/economy';

/** The weapon each of the first three slots holds. */
export const SLOT_WEAPON: Readonly<Record<1 | 2 | 3, WeaponId>> = Object.freeze({
  1: 'hammer',
  2: 'saw',
  3: 'flamethrower',
});

export function isWeaponSlot(slot: ShopSlot): slot is 1 | 2 | 3 {
  return slot === 1 || slot === 2 || slot === 3;
}

/** The command for pressing a slot. `upgrade` is Shift on the keyboard or the upgrade button. */
export function commandForSlot(slot: ShopSlot, e: EconomyState | undefined, upgrade: boolean): EconomyCommand {
  if (!upgrade && isWeaponSlot(slot) && e !== undefined) {
    const weapon = SLOT_WEAPON[slot];
    if (ownedWeapons(e).includes(weapon)) return { type: 'equipWeapon', weapon };
  }
  return { type: 'buy', slot };
}

/** Shop slot for a `KeyboardEvent.code` (`Digit1`–`Digit5`, `Numpad1`–`Numpad5`), else null. */
export function slotForCode(code: string): ShopSlot | null {
  const m = /^(?:Digit|Numpad)([1-5])$/.exec(code);
  return m === null ? null : (Number(m[1]) as ShopSlot);
}
