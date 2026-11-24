// Economy wiring: builds the two economy systems (Req 13.5). Wiring only; the rules live in
// shop.ts, weapons.ts, wallet.ts and guard.ts.
//
// The balance is resolved once, here, so invalid overrides throw EconomyBalanceError before any
// Run starts. Like ensureLane, the Economy_State is created on the first economy tick and never
// replaced; from then on every system reads draft.economy.balance.
//
// Slots:
//   weapons → createLaneSystems({ weapons }), runs between hammerSystem and mobSystem.
//   wallet  → runs after the ad systems, so it sees this tick's mobKilled and adClosed events.
import { resolveEconomyBalance, type EconomyBalanceOverrides } from '../balance/economy';
import type { System } from '../context';
import { createEconomyState } from './shop';
import { walletSystem } from './wallet';
import { weaponSystem } from './weapons';

export interface EconomyOptions {
  readonly balance?: EconomyBalanceOverrides;
}

export interface EconomySystems {
  readonly weapons: System;
  readonly wallet: System;
}

/** Resolves the balance now (throws EconomyBalanceError) and returns both system slots. */
export function createEconomySystems(options: EconomyOptions = {}): EconomySystems {
  const balance = resolveEconomyBalance(options.balance);
  /** Adds the Economy_State on the first economy tick; never replaces an existing one. */
  const ensure = (draft: Parameters<System>[0]): void => {
    if (draft.economy === undefined) draft.economy = createEconomyState(balance);
  };
  const weapons: System = (draft, ctx) => {
    ensure(draft);
    weaponSystem(draft, ctx);
  };
  const wallet: System = (draft, ctx) => {
    ensure(draft);
    walletSystem(draft, ctx);
  };
  return { weapons, wallet };
}

export * from './economyTypes';
export * from './shop';
export { hitModem } from './guard';
export { inFlameCone, weaponSystem } from './weapons';
export { PACKET_Y, walletSystem } from './wallet';
export {
  DEFAULT_ECONOMY_BALANCE,
  EconomyBalanceError,
  SHOP_ITEMS,
  resolveEconomyBalance,
  type EconomyBalance,
  type EconomyBalanceOverrides,
  type ShopItem,
} from '../balance/economy';
