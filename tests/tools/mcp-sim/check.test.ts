import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_LINES,
  RESOLVERS,
  formatCheck,
  formatProblems,
  main,
  validateBalances,
  type Resolvers,
} from '../../../tools/mcp-sim/src/check';
import type { PolicyStats, TargetCheck } from '../../../tools/mcp-sim/src/report';

const stats: PolicyStats = {
  winRate: 0.85,
  medianWinSeconds: 142.5,
  medianSawKbSeconds: 60,
  medianFlameKbSeconds: null,
  medianEarnedAtWin: 300,
  bossArrivedShare: 0.4,
  criticalShare: 0.1,
  sawKb: 75,
  flameKb: 225,
  shopKb: 365,
};
const targets: TargetCheck[] = [
  { target: 'competent win rate', measured: 0.85, goal: '0.6–0.9', result: 'pass' },
  { target: 'median 180 KB time', measured: null, goal: '≤ 95 s', result: 'warn' },
];

const badResolvers: Resolvers = [
  ...RESOLVERS,
  ['lane', () => { throw new Error('lane.mobs.tank.hp must be > 0\nsecond line'); }],
];

afterEach(() => vi.restoreAllMocks());

describe('formatCheck (Req 7.2)', () => {
  it('prints win rate, median win time and one PASS/WARN line per target', () => {
    const lines = formatCheck(stats, targets);
    expect(lines).toHaveLength(2 + targets.length);
    expect(lines[0]).toContain('win rate 85%');
    expect(lines[1]).toBe('median win time: 142.50 s');
    expect(lines[2]).toMatch(/^PASS competent win rate: 0.85/);
    expect(lines[3]).toMatch(/^WARN median 180 KB time: n\/a/);
  });

  it('never exceeds MAX_LINES', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ ...targets[0]!, target: `t${i}` }));
    expect(formatCheck(stats, many).length).toBeLessThanOrEqual(MAX_LINES);
  });
});

describe('bad balance (Req 7.3)', () => {
  it('the real balance tables validate cleanly', () => {
    expect(validateBalances()).toEqual([]);
  });

  it('validateBalances reports a throwing resolver by name', () => {
    const problems = validateBalances(badResolvers);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/^lane: lane\.mobs\.tank\.hp must be > 0/);
  });

  it('formatProblems keeps only first lines and caps at MAX_LINES', () => {
    expect(formatProblems(['a: x\ny'])).toEqual(['Balance check FAILED: 1 validation problem(s)', '  a: x']);
    const lines = formatProblems(Array.from({ length: 15 }, (_, i) => `p${i}`));
    expect(lines).toHaveLength(MAX_LINES);
    expect(lines.at(-1)).toContain('...and 7 more');
  });

  it('main prints problems instead of a report and returns 1', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    expect(main(badResolvers)).toBe(1);
    expect(log).toHaveBeenCalledTimes(1);
    const out = String(log.mock.calls[0]![0]);
    expect(out).toContain('Balance check FAILED: 1 validation problem(s)');
    expect(out).toContain('lane: lane.mobs.tank.hp must be > 0');
    expect(out).not.toMatch(/win rate|PASS|WARN/);
    expect(out.split('\n').length).toBeLessThanOrEqual(MAX_LINES);
  });

  it('main with real balances prints a report of at most MAX_LINES lines', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    expect(main()).toBe(0);
    const lines = String(log.mock.calls[0]![0]).split('\n');
    expect(lines.length).toBeLessThanOrEqual(MAX_LINES);
    expect(lines[0]).toMatch(/win rate \d+%/);
    expect(lines[1]).toMatch(/^median win time: /);
    expect(lines.slice(2).every((l) => /^(PASS|WARN) /.test(l))).toBe(true);
  }, 60_000);
});
