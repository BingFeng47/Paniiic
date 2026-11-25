// equipWeapon: picking an owned weapon directly (keys 1–3, weapon slot clicks).
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createEconomyState, equipWeapon, ownedWeapons, type EconomyState, type ItemId, type WeaponId } from '../../../src/game/economy';
import { createEconomySystems } from '../../../src/game/economy';
import { createLaneSystems } from '../../../src/game/lane';
import { step } from '../../../src/game/step';
import type { GameState, InputCommand } from '../../../src/game/types';
import { laneWith } from '../../helpers/lane';

const WEAPONS: readonly WeaponId[] = ['hammer', 'saw', 'flamethrower'];
const noSpawns = () => {};

describe('equipWeapon', () => {
  it('switches to an owned weapon and emits weaponSwitched', () => {
    const e = { ...createEconomyState(), owned: ['saw', 'flamethrower'] as ItemId[], active: 'flamethrower' as const, sawTarget: 3, sawCarry: 0.4 };
    const r = equipWeapon(e, 'hammer');
    expect(r.economy).toMatchObject({ active: 'hammer', sawTarget: null, sawCarry: 0 });
    expect(r.events).toEqual([{ type: 'weaponSwitched', weapon: 'hammer' }]);
    expect(equipWeapon(r.economy, 'saw').economy.active).toBe('saw');
  });

  it('ignores a weapon that is not owned, or the one already in the hand', () => {
    const e = createEconomyState();
    expect(equipWeapon(e, 'saw')).toEqual({ economy: e, events: [] });
    expect(equipWeapon(e, 'flamethrower')).toEqual({ economy: e, events: [] });
    expect(equipWeapon(e, 'hammer')).toEqual({ economy: e, events: [] });
  });

  // Property: the active weapon is always an owned one, whatever equips arrive.
  it('Property: after any equip sequence the active weapon is owned and the last valid pick', () => {
    fc.assert(
      fc.property(
        fc.subarray(['saw', 'flamethrower'] as ItemId[]),
        fc.array(fc.constantFrom(...WEAPONS), { maxLength: 20 }),
        (owned, picks) => {
          let e: EconomyState = { ...createEconomyState(), owned };
          let expected: WeaponId = 'hammer';
          for (const w of picks) {
            e = equipWeapon(e, w).economy;
            if (ownedWeapons(e).includes(w)) expected = w;
          }
          expect(ownedWeapons(e)).toContain(e.active);
          expect(e.active).toBe(expected);
        },
      ),
    );
  });

  it('works through step() as an equipWeapon command', () => {
    const { weapons } = createEconomySystems();
    const systems = createLaneSystems({ weapons, spawner: noSpawns });
    const s: GameState = { ...laneWith([]), economy: { ...createEconomyState(), owned: ['saw'], active: 'saw' } };
    const cmd: InputCommand = { type: 'equipWeapon', weapon: 'hammer' };
    const r = step(s, [cmd], systems);
    expect(r.state.economy!.active).toBe('hammer');
    expect(r.events.filter((e) => e.type === 'weaponSwitched')).toEqual([
      expect.objectContaining({ type: 'weaponSwitched', weapon: 'hammer' }),
    ]);
  });
});
