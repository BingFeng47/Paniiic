import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createRun } from '../../../src/game/state';
import { step } from '../../../src/game/step';
import { TICK_RATE, type GameState } from '../../../src/game/types';
import { createBotMemory, createBotRng, getPolicy, type PolicyName } from '../../../tools/mcp-sim/src/policies';
import { buildSystems, runBot, type BalanceOverrides } from '../../../tools/mcp-sim/src/runBot';

const seedArb = fc.integer({ min: 0, max: 0xffffffff });
const policyArb = fc.constantFrom<PolicyName>('idle', 'casual', 'competent', 'perfect');
const overridesArb: fc.Arbitrary<BalanceOverrides> = fc.oneof(
  fc.constant({}),
  fc.record({
    core: fc.record({
      downloadPercentPerSecond: fc.double({ min: 0.5, max: 3, noNaN: true }),
      maxIntegrity: fc.integer({ min: 40, max: 200 }),
    }),
  }),
);

const PLAYER_TYPES = new Set(['startDownload', 'hammer', 'adClick', 'adHover', 'lanePointer', 'buy', 'switchWeapon']);

describe('runBot', () => {
  it('Property 1: bot runs are deterministic', () => {
    // Feature: zombie-sim-mcp, Property 1: Bot runs are deterministic
    // **Validates: Requirements 2.5, 3.1**
    fc.assert(
      fc.property(seedArb, policyArb, overridesArb, (seed, policy, overrides) => {
        const a = runBot({ seed, policy, overrides, maxSeconds: 150 });
        const b = runBot({ seed, policy, overrides, maxSeconds: 150 });
        expect(b).toEqual(a);
      }),
      { numRuns: 5 },
    );
  });

  it('Property 2: bots only send player commands and never change state', () => {
    // Feature: zombie-sim-mcp, Property 2: Bots only send player commands and never change state
    // **Validates: Requirements 2.1, 2.2**
    // Replays runBot's own loop (same systems via buildSystems, same policy, memory and RNG),
    // checks every decide() call, and confirms the replay ends where runBot ends.
    fc.assert(
      fc.property(seedArb, fc.constantFrom<PolicyName>('casual', 'competent', 'perfect'), (seed, name) => {
        const maxSeconds = 90;
        const systems = buildSystems();
        const policy = getPolicy(name);
        const memory = createBotMemory();
        const rng = createBotRng(seed);
        let state: GameState = createRun({ seed });
        while (state.phase !== 'won' && state.phase !== 'lost' && state.tick < maxSeconds * TICK_RATE) {
          const before = JSON.stringify(state);
          const cmds = policy.decide(state, memory, rng);
          expect(JSON.stringify(state)).toBe(before);
          for (const c of cmds) expect(PLAYER_TYPES.has(c.type)).toBe(true);
          state = step(state, cmds, systems).state;
        }
        const summary = runBot({ seed, policy: name, maxSeconds });
        expect(summary.endSeconds).toBe(state.tick / TICK_RATE);
        expect(summary.perSecond.at(-1)).toMatchObject({ integrity: state.integrity, download: state.download });
      }),
      { numRuns: 4 },
    );
  });

  it('Property 3: overrides apply to one Run only', () => {
    // Feature: zombie-sim-mcp, Property 3: Overrides apply to one Run only
    // **Validates: Requirements 3.2**
    fc.assert(
      fc.property(seedArb, seedArb, policyArb, overridesArb, (seedA, seedB, policy, overrides) => {
        const alone = runBot({ seed: seedB, policy, maxSeconds: 120 });
        runBot({ seed: seedA, policy, overrides, maxSeconds: 120 });
        const after = runBot({ seed: seedB, policy, maxSeconds: 120 });
        expect(after).toEqual(alone);
      }),
      { numRuns: 4 },
    );
  });

  it('idle loses before 120 s', () => {
    const summary = runBot({ seed: 1, policy: 'idle' });
    expect(summary.outcome).toBe('lost');
    expect(summary.endSeconds).toBeLessThan(120);
  });

  it('perfect wins with a short-download override', () => {
    const summary = runBot({ seed: 7, policy: 'perfect', overrides: { core: { downloadPercentPerSecond: 5 } } });
    expect(summary.outcome).toBe('won');
    expect(summary.endSeconds).toBeLessThan(60);
  });
});
