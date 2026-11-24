// Balance-check CLI for the `balance-check` hook (design "Balance hook", Req 7).
// Validates every balance table first; if all pass, plays 20 seeds with `competent` and prints
// a report of at most 10 lines. Run with `npm run sim:check`.
import { resolveAdBalance } from '../../../src/game/balance/ads';
import { resolveChapterTable } from '../../../src/game/balance/chapters';
import { resolveCoreBalance } from '../../../src/game/balance/core';
import { resolveEconomyBalance } from '../../../src/game/balance/economy';
import { resolveLaneBalance } from '../../../src/game/balance/lane';
import { balanceReport, type PolicyStats, type TargetCheck } from './report';

export const CHECK_SEEDS = 20;
export const MAX_LINES = 10;

export type Resolvers = readonly (readonly [string, () => unknown])[];

export const RESOLVERS: readonly (readonly [string, () => unknown])[] = [
  ['core', () => resolveCoreBalance()],
  ['lane', () => resolveLaneBalance()],
  ['economy', () => resolveEconomyBalance()],
  ['ads', () => resolveAdBalance()],
  ['chapters', () => resolveChapterTable()],
];

/** Runs every balance resolver and returns one problem string per resolver that throws. */
export function validateBalances(resolvers: Resolvers = RESOLVERS): string[] {
  const problems: string[] = [];
  for (const [name, resolve] of resolvers) {
    try {
      resolve();
    } catch (err) {
      problems.push(`${name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return problems;
}

function fmt(value: number | null): string {
  if (value === null) return 'n/a';
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

/** Pure formatting of validation problems (Req 7.3). Never more than MAX_LINES lines. */
export function formatProblems(problems: readonly string[]): string[] {
  const head = `Balance check FAILED: ${problems.length} validation problem(s)`;
  const room = MAX_LINES - 1;
  const lines = problems.length > room
    ? [...problems.slice(0, room - 1), `...and ${problems.length - (room - 1)} more`]
    : [...problems];
  return [head, ...lines.map((p) => `  ${p.split('\n')[0]}`)];
}

/** Pure formatting of the report (Req 7.2): win rate, median win time, one line per check. */
export function formatCheck(stats: PolicyStats, targets: readonly TargetCheck[], seeds = CHECK_SEEDS): string[] {
  const lines = [
    `competent x${seeds} seeds: win rate ${(stats.winRate * 100).toFixed(0)}%`,
    `median win time: ${stats.medianWinSeconds === null ? 'n/a' : `${fmt(stats.medianWinSeconds)} s`}`,
    ...targets.map((t) => `${t.result === 'pass' ? 'PASS' : 'WARN'} ${t.target}: ${fmt(t.measured)} (${t.goal})`),
  ];
  return lines.slice(0, MAX_LINES);
}

/** `resolvers` is a test seam; the CLI always uses the real RESOLVERS. */
export function main(resolvers: Resolvers = RESOLVERS): number {
  const problems = validateBalances(resolvers);
  if (problems.length > 0) {
    console.log(formatProblems(problems).join('\n'));
    return 1;
  }
  const report = balanceReport({ seeds: CHECK_SEEDS, policies: ['competent'] });
  const stats = report.proposal.competent;
  if (!stats) throw new Error('balanceReport returned no competent stats');
  console.log(formatCheck(stats, report.targets).join('\n'));
  return 0;
}

// The repo has no @types/node: node modules are imported dynamically with minimal local types
// (same approach as ./sprites.ts) and `process` is read through globalThis.
interface NodeFs { realpathSync(path: string): string }
interface NodeUrl { fileURLToPath(url: string): string }
interface NodeProcess { readonly argv: readonly string[]; exitCode?: number }

async function isEntry(proc: NodeProcess): Promise<boolean> {
  const arg = proc.argv[1];
  if (!arg) return false;
  try {
    const fsName = 'node:fs';
    const urlName = 'node:url';
    const { realpathSync } = (await import(/* @vite-ignore */ fsName)) as NodeFs;
    const { fileURLToPath } = (await import(/* @vite-ignore */ urlName)) as NodeUrl;
    return realpathSync(arg) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

const proc = (globalThis as { process?: NodeProcess }).process;
if (proc && (await isEntry(proc))) {
  proc.exitCode = main();
}
