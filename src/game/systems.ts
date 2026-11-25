/**
 * The one shared Game_Systems list (ad-pressure Req 1). The Session_Registry and the zombie-sim
 * bot loop both build their systems here, so a rule added for players is also measured by the bots.
 *
 * Every factory resolves its balance table at once, so an invalid override throws that table's
 * own balance error from `createGameSystems` (Req 1.3).
 */
import type { AdBalanceOverrides } from './balance/ads';
import type { ChapterTableOverrides } from './balance/chapters';
import type { EconomyBalanceOverrides } from './balance/economy';
import type { LaneBalanceOverrides } from './balance/lane';
import { createAdSystems } from './ads/adSystems';
import { bandwidthSystem } from './ads/bandwidth';
import type { System } from './context';
import { createDirector } from './director';
import { createEconomySystems } from './economy';
import { createLaneSystems } from './lane';
import { statsSystem } from './stats';

/** Per-Run overrides for the balance tables the Game_Systems read. */
export interface GameSystemOverrides {
  readonly lane?: LaneBalanceOverrides;
  readonly ads?: AdBalanceOverrides;
  readonly chapters?: ChapterTableOverrides;
  readonly economy?: EconomyBalanceOverrides;
}

/**
 * Builds a fresh set of Game_Systems in Session_Registry order: lane systems (with the Director's
 * spawner and the Weapon_System), ad systems (with the Director's Ad_Scheduler), then the
 * Wallet_System, and last the bandwidth system, so it counts clutter after this Tick's closes,
 * openings and blocks (ad-pressure Req 2.2). Later specs append their systems at the end:
 * `statsSystem` comes last so it sees every event of the Tick (leaderboard Req 2.1).
 */
export function createGameSystems(o: GameSystemOverrides = {}): readonly System[] {
  const director = createDirector(o.chapters);
  const economy = createEconomySystems({ balance: o.economy });
  return [
    ...createLaneSystems({ balance: o.lane, spawner: director.laneSpawner, weapons: economy.weapons }),
    ...createAdSystems({ balance: o.ads, scheduler: director.adScheduler }),
    economy.wallet,
    bandwidthSystem,
    statsSystem,
  ];
}
