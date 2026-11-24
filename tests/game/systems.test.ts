// ad-pressure Req 1.1, 1.3: the shared Game_Systems list. The order is pinned two ways: by the
// slots and names of the returned systems, and by playing bot runs through `createGameSystems()`
// and through the list the Session_Registry built inline before task 1.1, which must agree on
// every state and event. Task 2.3 appended bandwidthSystem to both lists.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { SESSION_REGISTRY } from '../../src/dialup/sessionRegistry';
import { adExpirySystem, adInputSystem, createAdSystems } from '../../src/game/ads/adSystems';
import { bandwidthSystem } from '../../src/game/ads/bandwidth';
import { AdBalanceError, resolveAdBalance } from '../../src/game/balance/ads';
import { ChapterTableError, resolveChapterTable } from '../../src/game/balance/chapters';
import { EconomyBalanceError, resolveEconomyBalance } from '../../src/game/balance/economy';
import { LaneBalanceError, resolveLaneBalance } from '../../src/game/balance/lane';
import type { System } from '../../src/game/context';
import { createDirector } from '../../src/game/director';
import { createEconomySystems } from '../../src/game/economy';
import { hammerSystem } from '../../src/game/hammer';
import { createLaneSystems } from '../../src/game/lane';
import { mobSystem } from '../../src/game/mobs';
import { createRun } from '../../src/game/state';
import { step } from '../../src/game/step';
import { createGameSystems, type GameSystemOverrides } from '../../src/game/systems';
import { TICK_RATE, type GameEvent, type GameState } from '../../src/game/types';
import { createBotMemory, createBotRng, getPolicy, type PolicyName } from '../../tools/mcp-sim/src/policies';

/**
 * The list `src/dialup/sessionRegistry.ts` built inline before it called `createGameSystems`,
 * plus bandwidthSystem last (ad-pressure Req 2.2).
 */
function registryInlineSystems(o: GameSystemOverrides = {}): readonly System[] {
  const director = createDirector(o.chapters);
  const economy = createEconomySystems({ balance: o.economy });
  const lane = createLaneSystems({ balance: o.lane, spawner: director.laneSpawner, weapons: economy.weapons });
  const ads = createAdSystems({ balance: o.ads, scheduler: director.adScheduler });
  return [...lane, ...ads, economy.wallet, bandwidthSystem];
}

interface Played {
  readonly state: GameState;
  readonly events: readonly GameEvent[];
}

/**
 * Plays one bot against two system lists in lockstep: the bot decides from run A and both runs
 * get the same commands, so any difference between the lists shows up in the states or events.
 */
function playBoth(
  seed: number,
  policyName: PolicyName,
  a: readonly System[],
  b: readonly System[],
  maxSeconds: number,
): readonly [Played, Played] {
  const policy = getPolicy(policyName);
  const memory = createBotMemory();
  const rng = createBotRng(seed);
  let stateA = createRun({ seed });
  let stateB = createRun({ seed });
  const eventsA: GameEvent[] = [];
  const eventsB: GameEvent[] = [];
  const maxTicks = maxSeconds * TICK_RATE;
  while (stateA.phase !== 'won' && stateA.phase !== 'lost' && stateA.tick < maxTicks) {
    const cmds = policy.decide(stateA, memory, rng);
    const ra = step(stateA, cmds, a);
    const rb = step(stateB, cmds, b);
    stateA = ra.state;
    stateB = rb.state;
    eventsA.push(...ra.events);
    eventsB.push(...rb.events);
  }
  return [
    { state: stateA, events: eventsA },
    { state: stateB, events: eventsB },
  ];
}

describe('createGameSystems order (Req 1.1)', () => {
  it('returns lane systems, ad systems, the wallet, then bandwidth, 11 in all', () => {
    const systems = createGameSystems();
    const reference = registryInlineSystems();
    expect(systems).toHaveLength(11);
    expect(systems.map((s) => s.name)).toEqual(reference.map((s) => s.name));
    // Shared module-level systems sit in their Session_Registry slots.
    expect(systems[1]).toBe(hammerSystem);
    expect(systems[2]?.name).toBe('weapons');
    expect(systems[3]).toBe(mobSystem);
    expect(systems[6]).toBe(adInputSystem);
    expect(systems[8]).toBe(adExpirySystem);
    expect(systems[9]?.name).toBe('wallet');
    // Last, after the wallet's blocks (ad-pressure Req 2.2).
    expect(systems[10]).toBe(bandwidthSystem);
  });

  it('is the list the Session_Registry runs', () => {
    const systems = createGameSystems();
    expect(SESSION_REGISTRY.systems.map((s) => s.name)).toEqual(systems.map((s) => s.name));
    expect(SESSION_REGISTRY.systems[1]).toBe(hammerSystem);
    expect(SESSION_REGISTRY.systems[3]).toBe(mobSystem);
    expect(SESSION_REGISTRY.systems[6]).toBe(adInputSystem);
    expect(SESSION_REGISTRY.systems[8]).toBe(adExpirySystem);
    expect(SESSION_REGISTRY.systems[10]).toBe(bandwidthSystem);
  });

  it('builds fresh closures on every call', () => {
    const first = createGameSystems();
    const second = createGameSystems();
    expect(first[0]).not.toBe(second[0]);
    expect(first[9]).not.toBe(second[9]);
  });

  it('plays a competent run exactly like the old inline registry list', () => {
    const [ours, old] = playBoth(1, 'competent', createGameSystems(), registryInlineSystems(), 240);
    expect(ours.state.phase === 'won' || ours.state.phase === 'lost').toBe(true);
    expect(ours.events.some((e) => e.type === 'adClosed')).toBe(true);
    expect(ours.events.some((e) => e.type === 'mobKilled')).toBe(true);
    expect(ours.state).toStrictEqual(old.state);
    expect(ours.events).toStrictEqual(old.events);
  });

  it('the lockstep check notices a reordered list', () => {
    const old = registryInlineSystems();
    // Wallet moved in front of the ad systems: it no longer sees this tick's adClosed events.
    const reordered = [...old.slice(0, 5), old[9]!, ...old.slice(5, 9), old[10]!];
    const [, moved] = playBoth(1, 'competent', registryInlineSystems(), reordered, 240);
    const [ours] = playBoth(1, 'competent', createGameSystems(), registryInlineSystems(), 240);
    expect(moved.events).not.toStrictEqual(ours.events);
  });

  // Property: Req 1.1 createGameSystems() plays any seed and policy like the old registry list
  // **Validates: Requirements 1.1**
  it('Property: any seed and policy plays the same as the old inline registry list', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 0xffffffff }),
        fc.constantFrom<PolicyName>('idle', 'casual', 'competent', 'perfect'),
        (seed, policy) => {
          const [ours, old] = playBoth(seed, policy, createGameSystems(), registryInlineSystems(), 90);
          expect(ours.state).toStrictEqual(old.state);
          expect(ours.events).toStrictEqual(old.events);
        },
      ),
      { numRuns: 6 },
    );
  });
});

/** The error `fn` throws, so a test can expect the exact same class and message elsewhere. */
function thrownBy(fn: () => unknown): Error {
  try {
    fn();
  } catch (err) {
    return err as Error;
  }
  throw new Error('expected the resolver to throw');
}

/** Negative, NaN or infinite: every key below rejects all of these. */
const badNumber = fc.oneof(
  fc.double({ min: -1e9, max: -1e-6, noNaN: true }),
  fc.constantFrom(Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY),
);

const CASES = [
  {
    table: 'lane',
    errorClass: LaneBalanceError,
    overrides: (v: number): GameSystemOverrides => ({ lane: { laneLength: v } }),
    resolve: (v: number) => resolveLaneBalance({ laneLength: v }),
  },
  {
    table: 'ads',
    errorClass: AdBalanceError,
    overrides: (v: number): GameSystemOverrides => ({ ads: { fakeLifetimeSeconds: v } }),
    resolve: (v: number) => resolveAdBalance({ fakeLifetimeSeconds: v }),
  },
  {
    table: 'chapters',
    errorClass: ChapterTableError,
    overrides: (v: number): GameSystemOverrides => ({ chapters: { calmSeconds: v } }),
    resolve: (v: number) => resolveChapterTable({ calmSeconds: v }),
  },
  {
    table: 'economy',
    errorClass: EconomyBalanceError,
    overrides: (v: number): GameSystemOverrides => ({ economy: { fuelSeconds: v } }),
    resolve: (v: number) => resolveEconomyBalance({ fuelSeconds: v }),
  },
] as const;

describe('createGameSystems invalid overrides (Req 1.3)', () => {
  it('builds with valid and empty overrides', () => {
    expect(() => createGameSystems()).not.toThrow();
    expect(() => createGameSystems({ lane: {}, ads: {}, chapters: {}, economy: {} })).not.toThrow();
  });

  for (const c of CASES) {
    it(`an invalid ${c.table} override throws ${c.errorClass.name}`, () => {
      const expected = thrownBy(() => c.resolve(-1));
      expect(expected).toBeInstanceOf(c.errorClass);
      expect(() => createGameSystems(c.overrides(-1))).toThrow(c.errorClass);
      expect(() => createGameSystems(c.overrides(-1))).toThrow(expected.message);
    });
  }

  // Property: Req 1.3 an invalid override throws the same error as that table's resolver
  // **Validates: Requirements 1.3**
  it('Property: an invalid value throws the same error as that table resolver', () => {
    fc.assert(
      fc.property(fc.constantFrom(...CASES), badNumber, (c, v) => {
        const expected = thrownBy(() => c.resolve(v));
        const actual = thrownBy(() => createGameSystems(c.overrides(v)));
        expect(actual).toBeInstanceOf(c.errorClass);
        expect(actual.constructor).toBe(expected.constructor);
        expect(actual.message).toBe(expected.message);
      }),
      { numRuns: 100 },
    );
  });
});
