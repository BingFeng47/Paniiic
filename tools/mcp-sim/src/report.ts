// balance_report handler for the zombie-sim MCP server (design "balanceReport (report.ts)").
// Plays one bot Run per seed per policy and sums them up into win rates, median timings and
// Target_Checks for the `competent` proposal (Req 4.1–4.4;
// pacing-and-economy Req 7). Only reads; never writes files.
import { resolveEconomyBalance, type EconomyBalance, type ShopItem } from '../../../src/game/balance/economy';
import type { PolicyName } from './policies';
import { runBot, type BalanceOverrides, type RunSummary } from './runBot';

export interface ReportInput {
  readonly seeds: number;
  /** Default 1. */
  readonly firstSeed?: number;
  readonly policies: readonly PolicyName[];
  readonly overrides?: BalanceOverrides;
  readonly baseline?: BalanceOverrides;
}

export interface PolicyStats {
  readonly winRate: number;
  readonly medianWinSeconds: number | null;
  /** Median first second at which KB earned ≥ `sawKb` (runs that never get there are left out). */
  readonly medianSawKbSeconds: number | null;
  /** Median first second at which KB earned ≥ `flameKb`. */
  readonly medianFlameKbSeconds: number | null;
  /** Median KB earned (wallet plus spent) at the end of a won Run; null without wins. */
  readonly medianEarnedAtWin: number | null;
  /** Share of won Runs in which the boss reached the modem; null without wins. */
  readonly bossArrivedShare: number | null;
  readonly criticalShare: number;
  /** Saw price in the economy balance in use. */
  readonly sawKb: number;
  /** Saw plus flamethrower price in the economy balance in use. */
  readonly flameKb: number;
  /** Sum of every weapon and upgrade price in the economy balance in use. */
  readonly shopKb: number;
}

export interface TargetCheck {
  readonly target: string;
  readonly measured: number | null;
  readonly goal: string;
  readonly result: 'pass' | 'warn';
}

export type PolicyStatsTable = Readonly<Partial<Record<PolicyName, PolicyStats>>>;

export interface ReportResult {
  readonly proposal: PolicyStatsTable;
  readonly baseline?: PolicyStatsTable;
  /** Checks for the `competent` policy under the proposal overrides. */
  readonly targets: readonly TargetCheck[];
  /** Wall time the handler took (Req 4.5). */
  readonly elapsedMs: number;
}

export interface Target {
  readonly target: string;
  /** Goal text; may quote the prices in use. */
  readonly goal: (s: PolicyStats) => string;
  readonly measure: (s: PolicyStats) => number | null;
  /** Pass test for a non-null measurement. */
  readonly passes: (measured: number, s: PolicyStats) => boolean;
}

const within = (min: number, max: number) => (m: number) => m >= min && m <= max;

/** Balance_Targets from `.kiro/steering/game-balance.md`, checked on `competent` (Req 7.1). */
export const TARGETS: readonly Target[] = [
  {
    target: 'Winning run length',
    goal: () => 'median win 170–200 s',
    measure: (s) => s.medianWinSeconds,
    passes: within(170, 200),
  },
  {
    target: 'Saw affordable',
    goal: (s) => `median ${s.sawKb} KB time 80–95 s`,
    measure: (s) => s.medianSawKbSeconds,
    passes: within(80, 95),
  },
  {
    target: 'Flamethrower affordable',
    goal: (s) => `median ${s.flameKb} KB time 120–140 s`,
    measure: (s) => s.medianFlameKbSeconds,
    passes: within(120, 140),
  },
  {
    target: 'Shop choice',
    goal: (s) => `median KB earned at win < ${s.shopKb}`,
    measure: (s) => s.medianEarnedAtWin,
    passes: (m, s) => m < s.shopKb,
  },
  {
    target: 'Critical in Plot turn 2',
    goal: () => 'share ≥ 0.5',
    measure: (s) => s.criticalShare,
    passes: (m) => m >= 0.5,
  },
  {
    target: 'Boss arrives',
    goal: () => 'share of wins ≥ 0.5',
    measure: (s) => s.bossArrivedShare,
    passes: (m) => m >= 0.5,
  },
  {
    target: 'Winnable',
    goal: () => 'win rate 0.4–0.9',
    measure: (s) => s.winRate,
    passes: within(0.4, 0.9),
  },
];

/** Weapons and their upgrades; one-use items (blocker, surge) are not part of the shop total. */
export const WEAPON_AND_UPGRADE_ITEMS = ['heavyHead', 'saw', 'highRpm', 'flamethrower', 'bigTank'] as const satisfies readonly ShopItem[];

export interface KbThresholds {
  readonly sawKb: number;
  readonly flameKb: number;
  readonly shopKb: number;
}

/** KB thresholds from the economy prices in use, so a price override moves them (Req 7.2). */
export function kbThresholds(economy: EconomyBalance = resolveEconomyBalance()): KbThresholds {
  const p = economy.prices;
  return {
    sawKb: p.saw,
    flameKb: p.saw + p.flamethrower,
    shopKb: WEAPON_AND_UPGRADE_ITEMS.reduce((sum, item) => sum + p[item], 0),
  };
}

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** First second at which `earned` reaches `kb`, or null if it never does. */
export function firstEarnedSecond(run: RunSummary, kb: number): number | null {
  const hit = run.perSecond.find((p) => p.earned >= kb);
  return hit ? hit.s : null;
}

export function summarise(runs: readonly RunSummary[], thresholds: KbThresholds = kbThresholds()): PolicyStats {
  const n = runs.length;
  const wins = runs.filter((r) => r.outcome === 'won');
  const times = (kb: number) =>
    runs.map((r) => firstEarnedSecond(r, kb)).filter((s): s is number => s !== null);
  return {
    winRate: n === 0 ? 0 : wins.length / n,
    medianWinSeconds: median(wins.map((r) => r.endSeconds)),
    medianSawKbSeconds: median(times(thresholds.sawKb)),
    medianFlameKbSeconds: median(times(thresholds.flameKb)),
    medianEarnedAtWin: median(wins.map((r) => r.earnedAtEnd)),
    bossArrivedShare: wins.length === 0 ? null : wins.filter((r) => r.bossArrived).length / wins.length,
    criticalShare: n === 0 ? 0 : runs.filter((r) => r.criticalInPlotTurn2).length / n,
    ...thresholds,
  };
}

export function checkTargets(stats: PolicyStats): TargetCheck[] {
  return TARGETS.map((t) => {
    const measured = t.measure(stats);
    const ok = measured !== null && t.passes(measured, stats);
    return { target: t.target, measured, goal: t.goal(stats), result: ok ? 'pass' : 'warn' };
  });
}

function playPolicy(policy: PolicyName, seedList: readonly number[], overrides?: BalanceOverrides): PolicyStats {
  const runs = seedList.map((seed) => runBot({ seed, policy, overrides }));
  // Runs succeeded, so the economy overrides are valid and resolve without throwing.
  return summarise(runs, kbThresholds(resolveEconomyBalance(overrides?.economy)));
}

function playAll(
  policies: readonly PolicyName[],
  seedList: readonly number[],
  overrides?: BalanceOverrides,
): Partial<Record<PolicyName, PolicyStats>> {
  const table: Partial<Record<PolicyName, PolicyStats>> = {};
  for (const policy of policies) table[policy] ??= playPolicy(policy, seedList, overrides);
  return table;
}

export function balanceReport(input: ReportInput): ReportResult {
  const started = performance.now();
  const firstSeed = input.firstSeed ?? 1;
  if (!Number.isInteger(input.seeds) || input.seeds < 1) {
    throw new Error(`seeds must be a positive integer, got ${input.seeds}`);
  }
  if (!Number.isInteger(firstSeed)) throw new Error(`firstSeed must be an integer, got ${firstSeed}`);
  const seedList = Array.from({ length: input.seeds }, (_, i) => firstSeed + i);

  const proposal = playAll(input.policies, seedList, input.overrides);
  // Targets are always for competent; play it even when the caller did not list it.
  const competent = proposal.competent ?? playPolicy('competent', seedList, input.overrides);
  const baseline = input.baseline ? playAll(input.policies, seedList, input.baseline) : undefined;

  return {
    proposal,
    ...(baseline ? { baseline } : {}),
    targets: checkTargets(competent),
    elapsedMs: performance.now() - started,
  };
}
