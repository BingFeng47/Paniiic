import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ECONOMY_BALANCE,
  EconomyBalanceError,
  resolveEconomyBalance,
} from '../../../src/game/balance/economy';

describe('resolveEconomyBalance', () => {
  it('returns the design defaults (Req 4.1, 8.4)', () => {
    const b = resolveEconomyBalance();
    expect(b.prices).toEqual({
      heavyHead: 30, saw: 75, highRpm: 50, flamethrower: 150, bigTank: 60, blocker: 40, surge: 50,
    });
    expect(b.heavyHeadDamage).toBe(3);
    expect(b.sawDps).toBe(7);
    expect(b.flameDps).toBe(3);
    expect(b.bossFlameFactor).toBe(0.25);
    expect(b.blockerSeconds).toBe(6);
    expect(b.surgeSeconds).toBe(5);
    expect(b.fuelSeconds).toBe(6);
    expect(b.fuelSeconds * b.bigTankFactor).toBe(9);
    expect(Object.isFrozen(b.prices)).toBe(true);
  });

  it('requires bossFlameFactor in [0, 1]', () => {
    expect(() => resolveEconomyBalance({ bossFlameFactor: -0.1 })).toThrow(EconomyBalanceError);
    expect(() => resolveEconomyBalance({ bossFlameFactor: 1.5 })).toThrow(EconomyBalanceError);
    expect(resolveEconomyBalance({ bossFlameFactor: 0 }).bossFlameFactor).toBe(0);
    expect(resolveEconomyBalance({ bossFlameFactor: 1 }).bossFlameFactor).toBe(1);
  });
  it('defines the combo keys (Req 5.1)', () => {
    const b = resolveEconomyBalance();
    expect(b.comboWindowSeconds).toBe(2);
    expect(b.comboStart).toBe(3);
    expect(b.comboBonusKb).toBe(1);
  });

  it('rejects out-of-range combo keys (Req 5.1)', () => {
    try {
      resolveEconomyBalance({ comboWindowSeconds: 0.001, comboStart: 1, comboBonusKb: 0.5 });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(EconomyBalanceError);
      expect((e as EconomyBalanceError).problems).toHaveLength(3);
    }
    expect(() => resolveEconomyBalance({ comboStart: 2.5 })).toThrow(EconomyBalanceError);
    expect(resolveEconomyBalance({ comboWindowSeconds: 1 / 60, comboStart: 2, comboBonusKb: 0 }).comboStart).toBe(2);
  });

  it('merges overrides and drops unknown keys', () => {
    const b = resolveEconomyBalance({ prices: { saw: 10 }, sawDps: 9, extra: 1 } as never);
    expect(b.prices.saw).toBe(10);
    expect(b.prices.surge).toBe(DEFAULT_ECONOMY_BALANCE.prices.surge);
    expect(b.sawDps).toBe(9);
    expect('extra' in b).toBe(false);
  });

  it('rejects a non-positive heavy head damage', () => {
    expect(() => resolveEconomyBalance({ heavyHeadDamage: 0 })).toThrow(EconomyBalanceError);
  });
  it('lists every problem', () => {
    try {
      resolveEconomyBalance({ prices: { saw: 1.5, surge: -1 }, sawDps: NaN, flameHalfAngleDeg: 90 });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(EconomyBalanceError);
      expect((e as EconomyBalanceError).problems).toHaveLength(4);
    }
  });
});
