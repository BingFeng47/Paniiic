// createEconomySystems wiring (economy-weapons Req 13.5).
import { describe, expect, it } from 'vitest';
import { EconomyBalanceError } from '../../../src/game/balance/economy';
import { createEconomySystems, createEconomyState } from '../../../src/game/economy';
import { createLaneSystems } from '../../../src/game/lane';
import { step } from '../../../src/game/step';
import { laneWith } from '../../helpers/lane';

describe('createEconomySystems', () => {
  it('creates the EconomyState on the first tick from the resolved balance', () => {
    const { weapons, wallet } = createEconomySystems({ balance: { surgeSeconds: 7 } });
    const state = laneWith([]);
    expect(state.economy).toBeUndefined();
    const next = step(state, [], [...createLaneSystems({ weapons }), wallet]).state;
    expect(next.economy?.balance.surgeSeconds).toBe(7);
    expect(next.economy?.wallet).toBe(createEconomyState().wallet);
  });

  it('never replaces an existing EconomyState', () => {
    const { weapons, wallet } = createEconomySystems({ balance: { surgeSeconds: 7 } });
    const state = { ...laneWith([]), economy: createEconomyState() };
    const next = step(state, [], [...createLaneSystems({ weapons }), wallet]).state;
    expect(next.economy?.balance.surgeSeconds).toBe(state.economy.balance.surgeSeconds);
  });

  it('throws EconomyBalanceError for invalid overrides at build time', () => {
    expect(() => createEconomySystems({ balance: { surgeSeconds: -1 } })).toThrow(EconomyBalanceError);
  });
});
