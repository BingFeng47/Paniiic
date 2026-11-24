import { describe, expect, it } from 'vitest';
import {
  BalanceError,
  DEFAULT_CORE_BALANCE,
  dialTicks,
  resolveCoreBalance,
  type CoreBalance,
} from '../../../src/game/balance/core';

/** Calls resolveCoreBalance and returns the BalanceError it throws. Fails if it doesn't throw. */
function problemsFor(overrides: Partial<CoreBalance>): readonly string[] {
  try {
    resolveCoreBalance(overrides);
  } catch (error) {
    expect(error).toBeInstanceOf(BalanceError);
    return (error as BalanceError).problems;
  }
  throw new Error(`expected BalanceError for ${JSON.stringify(overrides)}`);
}

describe('DEFAULT_CORE_BALANCE', () => {
  it('has the values from the design decisions', () => {
    expect(DEFAULT_CORE_BALANCE).toEqual({
      dialSeconds: 20,
      downloadPercentPerSecond: 100 / 135,
      maxIntegrity: 100,
      criticalIntegrity: 20,
      lineQualityFloor: 0.6,
    });
  });
});

describe('dialTicks', () => {
  it('turns the default 20 s dial into 1,200 ticks', () => {
    expect(dialTicks(DEFAULT_CORE_BALANCE)).toBe(1200);
  });
});

describe('resolveCoreBalance', () => {
  it('returns the defaults when given no overrides', () => {
    expect(resolveCoreBalance()).toEqual(DEFAULT_CORE_BALANCE);
    expect(resolveCoreBalance({})).toEqual(DEFAULT_CORE_BALANCE);
  });

  it('merges overrides onto the defaults without changing the defaults', () => {
    const balance = resolveCoreBalance({ dialSeconds: 5, criticalIntegrity: 0 });
    expect(balance).toEqual({ ...DEFAULT_CORE_BALANCE, dialSeconds: 5, criticalIntegrity: 0 });
    expect(DEFAULT_CORE_BALANCE.dialSeconds).toBe(20);
  });

  it('keeps the default for overrides set to undefined', () => {
    expect(resolveCoreBalance({ dialSeconds: undefined })).toEqual(DEFAULT_CORE_BALANCE);
  });

  it('drops keys that are not part of CoreBalance', () => {
    const overrides = { dialSeconds: 3, extra: 1 } as Partial<CoreBalance>;
    expect(Object.keys(resolveCoreBalance(overrides)).sort()).toEqual(
      [
        'criticalIntegrity',
        'dialSeconds',
        'downloadPercentPerSecond',
        'lineQualityFloor',
        'maxIntegrity',
      ],
    );
  });

  it('accepts criticalIntegrity at both ends of its range', () => {
    expect(resolveCoreBalance({ criticalIntegrity: 0 }).criticalIntegrity).toBe(0);
    expect(resolveCoreBalance({ criticalIntegrity: 100 }).criticalIntegrity).toBe(100);
  });

  it('survives a JSON round trip', () => {
    const balance = resolveCoreBalance({ maxIntegrity: 50, criticalIntegrity: 10 });
    expect(JSON.parse(JSON.stringify(balance))).toEqual(balance);
  });

  describe('validation', () => {
    it.each([
      ['dialSeconds', Number.NaN],
      ['dialSeconds', Number.POSITIVE_INFINITY],
      ['downloadPercentPerSecond', Number.NaN],
      ['maxIntegrity', Number.POSITIVE_INFINITY],
      ['criticalIntegrity', Number.NEGATIVE_INFINITY],
    ] as const)('rejects non-finite %s = %s', (key, value) => {
      expect(problemsFor({ [key]: value })).toEqual([
        `${key} must be a finite number, got ${String(value)}`,
      ]);
    });

    it('rejects a non-number value from untyped input', () => {
      const overrides = { dialSeconds: '20' } as unknown as Partial<CoreBalance>;
      expect(problemsFor(overrides)).toEqual(['dialSeconds must be a finite number, got 20']);
    });

    it.each([
      ['dialSeconds', 0],
      ['dialSeconds', -1],
      ['downloadPercentPerSecond', 0],
      ['downloadPercentPerSecond', -0.5],
    ] as const)('rejects %s = %s (must be > 0)', (key, value) => {
      expect(problemsFor({ [key]: value })).toEqual([`${key} must be > 0, got ${value}`]);
    });

    it('rejects maxIntegrity = 0 (must be > 0)', () => {
      // criticalIntegrity must also drop to 0 so only the maxIntegrity rule fails.
      expect(problemsFor({ maxIntegrity: 0, criticalIntegrity: 0 })).toEqual([
        'maxIntegrity must be > 0, got 0',
      ]);
    });

    it('rejects a negative criticalIntegrity', () => {
      expect(problemsFor({ criticalIntegrity: -1 })).toEqual([
        'criticalIntegrity must be >= 0, got -1',
      ]);
    });

    it('rejects criticalIntegrity above maxIntegrity', () => {
      expect(problemsFor({ criticalIntegrity: 101 })).toEqual([
        'criticalIntegrity must be <= maxIntegrity (100), got 101',
      ]);
    });

    it('accepts lineQualityFloor at both ends of [0, 1]', () => {
      expect(resolveCoreBalance({ lineQualityFloor: 0 }).lineQualityFloor).toBe(0);
      expect(resolveCoreBalance({ lineQualityFloor: 1 }).lineQualityFloor).toBe(1);
    });

    it.each([-0.01, 1.01, -1, 2])('rejects lineQualityFloor = %s (must be in [0, 1])', (value) => {
      expect(problemsFor({ lineQualityFloor: value })).toEqual([
        `lineQualityFloor must be in [0, 1], got ${value}`,
      ]);
    });

    it('rejects a non-finite lineQualityFloor', () => {
      expect(problemsFor({ lineQualityFloor: Number.NaN })).toEqual([
        'lineQualityFloor must be a finite number, got NaN',
      ]);
    });

    it('lists a lineQualityFloor problem together with the others', () => {
      expect(problemsFor({ dialSeconds: 0, lineQualityFloor: 1.5 })).toEqual([
        'dialSeconds must be > 0, got 0',
        'lineQualityFloor must be in [0, 1], got 1.5',
      ]);
    });

    it('lists every problem, not just the first', () => {
      const problems = problemsFor({
        dialSeconds: -5,
        downloadPercentPerSecond: Number.NaN,
        maxIntegrity: 10,
        criticalIntegrity: 30,
      });
      expect(problems).toEqual([
        'downloadPercentPerSecond must be a finite number, got NaN',
        'dialSeconds must be > 0, got -5',
        'criticalIntegrity must be <= maxIntegrity (10), got 30',
      ]);
    });

    it('puts every problem in the error message', () => {
      expect(() => resolveCoreBalance({ dialSeconds: 0, criticalIntegrity: -1 })).toThrow(
        'Invalid core balance: dialSeconds must be > 0, got 0; criticalIntegrity must be >= 0, got -1',
      );
    });

    it('is an Error named BalanceError', () => {
      const error = new BalanceError(['x']);
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('BalanceError');
      expect(error.problems).toEqual(['x']);
    });
  });
});
