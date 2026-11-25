// Key and click mapping for weapons and the shop (docs/game-design.md section 6).
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createEconomyState, type ItemId, type ShopSlot } from '../../src/game/economy';
import { commandForSlot, slotForCode } from '../../src/ui/weaponControls';

const withOwned = (owned: ItemId[]) => ({ ...createEconomyState(), owned });

describe('commandForSlot', () => {
  it('1–3 equip an owned weapon', () => {
    const e = withOwned(['saw', 'flamethrower']);
    expect(commandForSlot(1, e, false)).toEqual({ type: 'equipWeapon', weapon: 'hammer' });
    expect(commandForSlot(2, e, false)).toEqual({ type: 'equipWeapon', weapon: 'saw' });
    expect(commandForSlot(3, e, false)).toEqual({ type: 'equipWeapon', weapon: 'flamethrower' });
  });

  it('1–3 buy a weapon that is not owned yet', () => {
    const e = withOwned([]);
    expect(commandForSlot(2, e, false)).toEqual({ type: 'buy', slot: 2 });
    expect(commandForSlot(3, e, false)).toEqual({ type: 'buy', slot: 3 });
  });

  it('the upgrade flag (Shift, upgrade button) always buys the slot', () => {
    const e = withOwned(['saw', 'flamethrower']);
    for (const slot of [1, 2, 3, 4, 5] as ShopSlot[]) {
      expect(commandForSlot(slot, e, true)).toEqual({ type: 'buy', slot });
    }
  });

  it('4–5 always buy; without an economy every slot buys', () => {
    const e = withOwned(['saw']);
    expect(commandForSlot(4, e, false)).toEqual({ type: 'buy', slot: 4 });
    expect(commandForSlot(5, e, false)).toEqual({ type: 'buy', slot: 5 });
    expect(commandForSlot(1, undefined, false)).toEqual({ type: 'buy', slot: 1 });
  });

  // Property: pressing a weapon key never spends KB on that weapon's upgrade.
  it('Property: without the upgrade flag, an owned weapon slot never sends buy', () => {
    fc.assert(
      fc.property(fc.subarray(['saw', 'flamethrower', 'heavyHead', 'highRpm', 'bigTank'] as ItemId[]), fc.constantFrom(1, 2, 3) as fc.Arbitrary<1 | 2 | 3>, (owned, slot) => {
        const e = withOwned(owned);
        const weaponOwned = slot === 1 || owned.includes(slot === 2 ? 'saw' : 'flamethrower');
        expect(commandForSlot(slot, e, false).type).toBe(weaponOwned ? 'equipWeapon' : 'buy');
      }),
    );
  });
});

describe('slotForCode', () => {
  it('reads Digit and Numpad 1–5, so Shift + 1 still maps to slot 1', () => {
    expect(slotForCode('Digit1')).toBe(1);
    expect(slotForCode('Numpad5')).toBe(5);
    expect(slotForCode('Digit6')).toBeNull();
    expect(slotForCode('KeyQ')).toBeNull();
    expect(slotForCode('')).toBeNull();
  });
});
