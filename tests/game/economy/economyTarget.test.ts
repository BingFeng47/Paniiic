// Requirement 13.4: the economy target. A player who kills every Mob and collects every packet
// has earned 60 KB (wallet + spent) by 70 s, so the saw is affordable before the tanks.
import { describe, expect, it } from 'vitest';
import { createAdSystems } from '../../../src/game/ads/adSystems';
import type { System } from '../../../src/game/context';
import { createDirector } from '../../../src/game/director';
import { createEconomySystems } from '../../../src/game/economy';
import { runHeadless } from '../../../src/game/headless';
import { createLaneSystems } from '../../../src/game/lane';
import { TICK_RATE, type GameEvent } from '../../../src/game/types';
import { killerBot, recordBot } from '../../helpers/bots';

const TARGET_KB = 60;
const TARGET_SECONDS = 70;
const KILL_WITHIN_TICKS = Math.round(0.5 * TICK_RATE);

/** The shipped wiring (src/dialup/sessionRegistry.ts), built fresh for each run. */
function shippedSystems(): readonly System[] {
  const director = createDirector();
  const economy = createEconomySystems();
  return [
    ...createLaneSystems({ spawner: director.laneSpawner, weapons: economy.weapons }),
    ...createAdSystems({ scheduler: director.adScheduler }),
    economy.wallet,
  ];
}

const ofType = <T extends GameEvent['type']>(events: readonly GameEvent[], type: T) =>
  events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type);

describe('economy target (Req 13.4)', () => {
  it.each([1, 2, 3])('seed %i: a killer and collector bot has wallet + spent >= 60 KB by 70 s', (seed) => {
    const bot = killerBot({ downloadAtSecond: 21, collectPackets: true });
    const script = recordBot(bot, { seed, systems: shippedSystems(), maxSeconds: TARGET_SECONDS });
    const run = runHeadless({ seed, script, systems: shippedSystems(), maxSeconds: TARGET_SECONDS });

    expect(run.final.tick).toBe(TARGET_SECONDS * TICK_RATE);
    expect(ofType(run.events, 'downloadStarted').map((e) => e.tick)).toEqual([21 * TICK_RATE]);

    // The bot plays as well as the target assumes: a lone Mob dies within 0.5 s of spawning
    // (Mobs that spawn together are killed one after another, as fast as the hammer allows),
    // nothing reaches the modem and every packet is collected.
    const spawned = ofType(run.events, 'mobSpawned');
    const killed = new Map(ofType(run.events, 'mobKilled').map((k) => [k.id, k.tick]));
    expect(spawned.length).toBeGreaterThan(0);
    const first = spawned[0]!;
    expect(killed.get(first.id)).toBeLessThanOrEqual(first.tick + KILL_WITHIN_TICKS);
    for (const s of spawned) {
      if (s.tick <= run.final.tick - KILL_WITHIN_TICKS * 4) expect(killed.has(s.id)).toBe(true);
    }
    expect(ofType(run.events, 'modemHit')).toHaveLength(0);
    expect(ofType(run.events, 'packetExpired')).toHaveLength(0);

    const e = run.final.economy!;
    expect(e.wallet + e.spent).toBeGreaterThanOrEqual(TARGET_KB);
  });
});
