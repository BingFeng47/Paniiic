import { describe, expect, it } from 'vitest';
import { balanceReport, checkTargets, median, TARGETS } from '../../../tools/mcp-sim/src/report';

describe('report helpers', () => {
  it('median handles empty, odd and even lists', () => {
    expect(median([])).toBeNull();
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
  });

  it('checkTargets passes in range and warns outside or on null', () => {
    const prices = { sawKb: 75, flameKb: 225, shopKb: 365 };
    const good = checkTargets({
      winRate: 0.6,
      medianWinSeconds: 185,
      medianSawKbSeconds: 88,
      medianFlameKbSeconds: 130,
      medianEarnedAtWin: 300,
      bossArrivedShare: 0.5,
      criticalShare: 0.5,
      ...prices,
    });
    expect(good.map((c) => c.result)).toEqual(TARGETS.map(() => 'pass'));
    const bad = checkTargets({
      winRate: 1,
      medianWinSeconds: null,
      medianSawKbSeconds: 96,
      medianFlameKbSeconds: 119,
      medianEarnedAtWin: 365,
      bossArrivedShare: null,
      criticalShare: 0.2,
      ...prices,
    });
    expect(bad.every((c) => c.result === 'warn')).toBe(true);
  });
});

describe('balanceReport', () => {
  it('reports stats per policy, baseline side by side, targets and elapsed time', () => {
    const r = balanceReport({ seeds: 2, policies: ['idle', 'competent'], baseline: {} });
    expect(Object.keys(r.proposal).sort()).toEqual(['competent', 'idle']);
    expect(r.baseline?.competent).toEqual(r.proposal.competent);
    expect(r.proposal.idle?.winRate).toBe(0);
    expect(r.targets).toHaveLength(TARGETS.length);
    expect(r.elapsedMs).toBeGreaterThanOrEqual(0);
  }, 60_000);
});

import fc from 'fast-check';
import { runBot } from '../../../tools/mcp-sim/src/runBot';
import { POLICY_NAMES, type PolicyName } from '../../../tools/mcp-sim/src/policies';

// Independent reference computations from individual runBot calls.
const refMedian = (xs: number[]): number | null => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};
const refStats = (policy: PolicyName, seeds: number[]) => {
  const runs = seeds.map((seed) => runBot({ seed, policy }));
  const wins = runs.filter((r) => r.outcome === 'won');
  const bossWins = wins.filter((r) => r.bossArrived).length;
  const at = (kb: number) =>
    runs.flatMap((r) => {
      const p = r.perSecond.find((x) => x.earned >= kb);
      return p ? [p.s] : [];
    });
  return {
    winRate: wins.length / runs.length,
    medianWinSeconds: refMedian(wins.map((r) => r.endSeconds)),
    // Default economy prices: saw 75, flamethrower 150, upgrades 30 + 50 + 60.
    medianSawKbSeconds: refMedian(at(75)),
    medianFlameKbSeconds: refMedian(at(75 + 150)),
    medianEarnedAtWin: refMedian(wins.map((r) => r.earnedAtEnd)),
    bossArrivedShare: wins.length === 0 ? null : bossWins / wins.length,
    criticalShare: runs.filter((r) => r.criticalInPlotTurn2).length / runs.length,
    sawKb: 75,
    flameKb: 225,
    shopKb: 365,
  };
};

// Reference pass rules, written out from Requirement 7.1 independently of TARGETS.
type RefStats = ReturnType<typeof refStats>;
const REF_TARGETS: readonly [string, (s: RefStats) => number | null, (m: number, s: RefStats) => boolean][] = [
  ['Winning run length', (s) => s.medianWinSeconds, (m) => m >= 170 && m <= 200],
  ['Saw affordable', (s) => s.medianSawKbSeconds, (m) => m >= 80 && m <= 95],
  ['Flamethrower affordable', (s) => s.medianFlameKbSeconds, (m) => m >= 120 && m <= 140],
  ['Shop choice', (s) => s.medianEarnedAtWin, (m, s) => m < s.shopKb],
  ['Critical in Plot turn 2', (s) => s.criticalShare, (m) => m >= 0.5],
  ['Boss arrives', (s) => s.bossArrivedShare, (m) => m >= 0.5],
  ['Winnable', (s) => s.winRate, (m) => m >= 0.4 && m <= 0.9],
];

describe('Property 4: report statistics match the runs', () => {
  // Property 4: Req 4.1–4.4 report statistics match the runs
  // **Validates: Requirements 4.1, 4.2, 4.3, 4.4**
  it('winRate, medians and Target_Checks match individual runBot calls', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 5 }),
        fc.integer({ min: 1, max: 1000 }),
        fc.uniqueArray(fc.constantFrom(...POLICY_NAMES), { minLength: 1, maxLength: 2 }),
        (seeds, firstSeed, policies) => {
          const seedList = Array.from({ length: seeds }, (_, i) => firstSeed + i);
          const r = balanceReport({ seeds, firstSeed, policies });
          expect(Object.keys(r.proposal).sort()).toEqual([...policies].sort());
          for (const p of policies) expect(r.proposal[p]).toEqual(refStats(p, seedList));
          const competent = r.proposal.competent ?? refStats('competent', seedList);
          expect(r.targets).toHaveLength(REF_TARGETS.length);
          REF_TARGETS.forEach(([target, measure, passes], i) => {
            const c = r.targets[i]!;
            const m = measure(competent);
            const ok = m !== null && passes(m, competent);
            expect(c.target).toBe(target);
            expect(c.measured).toBe(m);
            expect(c.result).toBe(ok ? 'pass' : 'warn');
          });
        },
      ),
      { numRuns: 4 },
    );
  }, 120_000);

  it('baseline is shown side by side with the proposal', () => {
    const baseline = { core: { downloadPercentPerSecond: 10 } };
    const r = balanceReport({ seeds: 1, policies: ['competent'], baseline });
    expect(r.proposal.competent).toEqual(refStats('competent', [1]));
    const base = runBot({ seed: 1, policy: 'competent', overrides: baseline });
    expect(r.baseline?.competent?.winRate).toBe(base.outcome === 'won' ? 1 : 0);
    expect(Object.keys(r.baseline ?? {})).toEqual(['competent']);
    expect(r.baseline?.competent?.medianWinSeconds).toBe(base.outcome === 'won' ? base.endSeconds : null);
  }, 60_000);
});

// pacing-and-economy Req 7: the new Balance_Targets and price-driven KB thresholds.
import { firstEarnedSecond, kbThresholds, type PolicyStats } from '../../../tools/mcp-sim/src/report';
import { resolveEconomyBalance } from '../../../src/game/balance/economy';

describe('Req 7.1 Balance_Targets boundaries', () => {
  const base: PolicyStats = {
    winRate: 0.6,
    medianWinSeconds: 185,
    medianSawKbSeconds: 88,
    medianFlameKbSeconds: 130,
    medianEarnedAtWin: 300,
    bossArrivedShare: 0.6,
    criticalShare: 0.6,
    sawKb: 75,
    flameKb: 225,
    shopKb: 365,
  };
  const resultOf = (target: string, patch: Partial<PolicyStats>) =>
    checkTargets({ ...base, ...patch }).find((c) => c.target === target)!.result;

  it('lists the 7 targets in order', () => {
    expect(TARGETS.map((t) => t.target)).toEqual([
      'Winning run length',
      'Saw affordable',
      'Flamethrower affordable',
      'Shop choice',
      'Critical in Plot turn 2',
      'Boss arrives',
      'Winnable',
    ]);
  });

  const ranges: readonly [string, keyof PolicyStats, number, number, number][] = [
    // target, field, min, max, step just outside
    ['Winning run length', 'medianWinSeconds', 170, 200, 0.5],
    ['Saw affordable', 'medianSawKbSeconds', 80, 95, 0.5],
    ['Flamethrower affordable', 'medianFlameKbSeconds', 120, 140, 0.5],
    ['Winnable', 'winRate', 0.4, 0.9, 0.01],
  ];
  it.each(ranges)('%s passes on the inclusive range and warns just outside', (target, field, min, max, eps) => {
    expect(resultOf(target, { [field]: min })).toBe('pass');
    expect(resultOf(target, { [field]: max })).toBe('pass');
    expect(resultOf(target, { [field]: min - eps })).toBe('warn');
    expect(resultOf(target, { [field]: max + eps })).toBe('warn');
  });

  it('Shop choice needs strictly less than the shop total', () => {
    expect(resultOf('Shop choice', { medianEarnedAtWin: 364 })).toBe('pass');
    expect(resultOf('Shop choice', { medianEarnedAtWin: 365 })).toBe('warn');
    expect(resultOf('Shop choice', { medianEarnedAtWin: 300, shopKb: 300 })).toBe('warn');
    expect(resultOf('Shop choice', { medianEarnedAtWin: null })).toBe('warn');
  });

  it.each([
    ['Critical in Plot turn 2', 'criticalShare'],
    ['Boss arrives', 'bossArrivedShare'],
  ] as const)('%s passes at a share of 0.5 or more', (target, field) => {
    expect(resultOf(target, { [field]: 0.5 })).toBe('pass');
    expect(resultOf(target, { [field]: 1 })).toBe('pass');
    expect(resultOf(target, { [field]: 0.49 })).toBe('warn');
  });

  it('a null measurement warns', () => {
    expect(resultOf('Boss arrives', { bossArrivedShare: null })).toBe('warn');
    expect(resultOf('Winning run length', { medianWinSeconds: null })).toBe('warn');
  });

  it('goal text quotes the prices in use', () => {
    const goals = checkTargets({ ...base, sawKb: 100, flameKb: 300, shopKb: 440 }).map((c) => c.goal);
    expect(goals[1]).toContain('100 KB');
    expect(goals[2]).toContain('300 KB');
    expect(goals[3]).toContain('440');
  });
});

describe('Req 7.2 price overrides move the KB thresholds', () => {
  const overrides = { economy: { prices: { saw: 100, flamethrower: 200 } } };

  it('kbThresholds reads the economy balance in use', () => {
    expect(kbThresholds()).toEqual({ sawKb: 75, flameKb: 225, shopKb: 365 });
    expect(kbThresholds(resolveEconomyBalance(overrides.economy))).toEqual({ sawKb: 100, flameKb: 300, shopKb: 440 });
  });

  it('balanceReport measures the saw and flamethrower times at the overridden prices', () => {
    const seeds = [1, 2];
    const r = balanceReport({ seeds: seeds.length, policies: ['competent'], overrides });
    const stats = r.proposal.competent!;
    expect(stats).toMatchObject({ sawKb: 100, flameKb: 300, shopKb: 440 });
    const runs = seeds.map((seed) => runBot({ seed, policy: 'competent', overrides }));
    const times = (kb: number) =>
      median(runs.map((run) => firstEarnedSecond(run, kb)).filter((s): s is number => s !== null));
    expect(stats.medianSawKbSeconds).toBe(times(100));
    expect(stats.medianFlameKbSeconds).toBe(times(300));
    expect(r.targets.find((t) => t.target === 'Saw affordable')!.goal).toContain('100 KB');
    expect(r.targets.find((t) => t.target === 'Shop choice')!.goal).toContain('440');
  }, 120_000);
});
