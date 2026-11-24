// Core tuning values for game-core (Req 8.1). Runs get their balance through
// resolveCoreBalance, which merges overrides onto the defaults and validates the result (Req 8.2).

// types.ts only imports CoreBalance as a type, so this value import creates no runtime cycle.
import { TICK_RATE } from '../types';

export interface CoreBalance {
  readonly dialSeconds: number; // 20
  readonly downloadPercentPerSecond: number; // 100 / 135
  readonly maxIntegrity: number; // 100
  readonly criticalIntegrity: number; // 20
  /** Line_Quality at 0 integrity; it rises linearly to 1 at maxIntegrity. In [0, 1]. */
  readonly lineQualityFloor: number; // 0.6
}

/** Default tuning. Reasons are recorded in docs/game-design.md, section 9. */
export const DEFAULT_CORE_BALANCE: CoreBalance = Object.freeze({
  dialSeconds: 20,
  // 135 s of full-speed progress, so a winning run lasts about 3:00 (pacing-and-economy Req 1.1).
  downloadPercentPerSecond: 100 / 135,
  maxIntegrity: 100,
  criticalIntegrity: 20,
  lineQualityFloor: 0.6,
});

/**
 * Length of the dial-up phase in ticks. step() connects after this many ticks and the dialer
 * derives its stages from it, so both share one rounding rule.
 */
export function dialTicks(balance: CoreBalance): number {
  return Math.round(balance.dialSeconds * TICK_RATE);
}

const BALANCE_KEYS: readonly (keyof CoreBalance)[] = [
  'dialSeconds',
  'downloadPercentPerSecond',
  'maxIntegrity',
  'criticalIntegrity',
  'lineQualityFloor',
];

/** Thrown when a balance config is invalid. `problems` lists every problem found. */
export class BalanceError extends Error {
  readonly problems: readonly string[];

  constructor(problems: readonly string[]) {
    super(`Invalid core balance: ${problems.join('; ')}`);
    this.name = 'BalanceError';
    this.problems = Object.freeze([...problems]);
  }
}

/**
 * Merge overrides onto the defaults and validate. Overrides set to `undefined` keep the default,
 * and keys that are not part of CoreBalance are dropped, so the result is always plain data.
 * Throws BalanceError listing every problem.
 */
export function resolveCoreBalance(overrides: Partial<CoreBalance> = {}): CoreBalance {
  const merged: MutableCoreBalance = { ...DEFAULT_CORE_BALANCE };
  for (const key of BALANCE_KEYS) {
    const value = overrides[key];
    if (value !== undefined) merged[key] = value;
  }

  const problems = validateCoreBalance(merged);
  if (problems.length > 0) throw new BalanceError(problems);
  return Object.freeze(merged);
}

type MutableCoreBalance = { -readonly [K in keyof CoreBalance]: CoreBalance[K] };

function validateCoreBalance(b: CoreBalance): string[] {
  const problems: string[] = [];
  const finite = new Set<keyof CoreBalance>();

  for (const key of BALANCE_KEYS) {
    const value: unknown = b[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      finite.add(key);
    } else {
      problems.push(`${key} must be a finite number, got ${String(value)}`);
    }
  }

  for (const key of ['dialSeconds', 'downloadPercentPerSecond', 'maxIntegrity'] as const) {
    if (finite.has(key) && b[key] <= 0) problems.push(`${key} must be > 0, got ${b[key]}`);
  }

  if (finite.has('criticalIntegrity')) {
    if (b.criticalIntegrity < 0) {
      problems.push(`criticalIntegrity must be >= 0, got ${b.criticalIntegrity}`);
    }
    if (finite.has('maxIntegrity') && b.criticalIntegrity > b.maxIntegrity) {
      problems.push(
        `criticalIntegrity must be <= maxIntegrity (${b.maxIntegrity}), got ${b.criticalIntegrity}`,
      );
    }
  }

  if (finite.has('lineQualityFloor') && (b.lineQualityFloor < 0 || b.lineQualityFloor > 1)) {
    problems.push(`lineQualityFloor must be in [0, 1], got ${b.lineQualityFloor}`);
  }

  return problems;
}
