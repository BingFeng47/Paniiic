import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LANE_BALANCE,
  LaneBalanceError,
  resolveLaneBalance,
  secondsToTicks,
  type LaneBalance,
  type LaneBalanceOverrides,
  type SpawnWave,
} from '../../../src/game/balance/lane';

/** The defaults from docs/game-design.md section 5 and the connection-lane design. */
const EXPECTED_DEFAULTS: LaneBalance = {
  laneLength: 800,
  hitPadding: 6,
  enemies: {
    // Default, fast, tank and ranged HP and the hammer tuned in docs/balance/2026-11-25-weapon-roles.md.
    default: { hp: 5, speed: 40, damage: 4, dropKb: 3, width: 44, height: 72 },
    fast: { hp: 3, speed: 110, damage: 3, dropKb: 4, width: 34, height: 48 },
    tank: { hp: 6, speed: 24, damage: 10, dropKb: 12, width: 72, height: 96 },
    ranged: { hp: 4, speed: 40, damage: 0, dropKb: 8, width: 48, height: 76 },
    // Boss HP, speed and drop tuned in docs/balance/2026-11-24-boss-threat.md and
    // docs/balance/2026-11-24-late-income.md.
    boss: { hp: 150, speed: 38, damage: 20, dropKb: 30, width: 112, height: 150 },
    glob: { hp: 1, speed: 150, damage: 5, dropKb: 0, width: 22, height: 22 },
  },
  melee: {
    default: { hitEverySeconds: 1.5 },
    fast: { hitEverySeconds: 1 },
    tank: { hitEverySeconds: 2 },
    boss: { hitEverySeconds: 2 },
  },
  hammer: { damage: 2, cooldownSeconds: 0.38 },
  ranged: { stopX: 400, firstSpitSeconds: 1, spitEverySeconds: 3 },
  boss: { thresholds: [0.75, 0.5, 0.25], summonCount: 2, summonSpacing: 36 },
  popupBurstCount: 3,
  spawns: [
    { kind: 'default', startSecond: 8, endSecond: 150, everySeconds: 6 },
    { kind: 'fast', startSecond: 45, endSecond: 150, everySeconds: 7 },
    { kind: 'tank', startSecond: 70, endSecond: 150, everySeconds: 12 },
    { kind: 'ranged', startSecond: 90, endSecond: 150, everySeconds: 15 },
    { kind: 'boss', startSecond: 160, endSecond: 160, everySeconds: 1 },
  ],
};

/** Calls resolveLaneBalance and returns the LaneBalanceError problems. Fails if it doesn't throw. */
function problemsFor(overrides: LaneBalanceOverrides): readonly string[] {
  try {
    resolveLaneBalance(overrides);
  } catch (error) {
    expect(error).toBeInstanceOf(LaneBalanceError);
    return (error as LaneBalanceError).problems;
  }
  throw new Error(`expected LaneBalanceError for ${JSON.stringify(overrides)}`);
}

/** Overrides as untyped runtime input (headless tools, JSON). */
function loose(value: unknown): LaneBalanceOverrides {
  return value as LaneBalanceOverrides;
}

function wave(overrides: Partial<SpawnWave> = {}): SpawnWave {
  return { kind: 'default', startSecond: 0, endSecond: 10, everySeconds: 1, ...overrides };
}

function expectDeepFrozen(value: unknown, path = 'balance'): void {
  if (typeof value !== 'object' || value === null) return;
  expect(Object.isFrozen(value), `${path} is frozen`).toBe(true);
  for (const [key, child] of Object.entries(value)) expectDeepFrozen(child, `${path}.${key}`);
}

describe('DEFAULT_LANE_BALANCE', () => {
  it('has the values from the design', () => {
    expect(DEFAULT_LANE_BALANCE).toEqual(EXPECTED_DEFAULTS);
  });

  it('uses the section 5 mob table for HP, modem damage and KB drops', () => {
    const { default: base, fast, tank, ranged, boss, glob } = DEFAULT_LANE_BALANCE.enemies;
    expect([base.hp, fast.hp, tank.hp, ranged.hp, boss.hp, glob.hp]).toEqual([5, 3, 6, 4, 150, 1]);
    expect([base.damage, fast.damage, tank.damage, boss.damage, ranged.damage, glob.damage]).toEqual(
      [4, 3, 10, 20, 0, 5],
    );
    expect([base.dropKb, fast.dropKb, tank.dropKb, ranged.dropKb, boss.dropKb, glob.dropKb]).toEqual(
      [3, 4, 12, 8, 30, 0],
    );
  });

  it('uses the section 5 "hit every" times for melee mobs', () => {
    const { melee } = DEFAULT_LANE_BALANCE;
    expect([
      melee.default.hitEverySeconds,
      melee.fast.hitEverySeconds,
      melee.tank.hitEverySeconds,
      melee.boss.hitEverySeconds,
    ]).toEqual([1.5, 1, 2, 2]);
    expect(Object.keys(melee).sort()).toEqual(['boss', 'default', 'fast', 'tank']);
  });
  it('orders speeds: fast above default, ranged equal to default, tank and boss below', () => {
    const { enemies } = DEFAULT_LANE_BALANCE;
    expect(enemies.fast.speed).toBeGreaterThan(enemies.default.speed);
    expect(enemies.ranged.speed).toBe(enemies.default.speed);
    expect(enemies.tank.speed).toBeLessThan(enemies.default.speed);
    expect(enemies.boss.speed).toBeLessThan(enemies.default.speed);
  });

  it('sets the hammer, ranged, boss and burst defaults', () => {
    const b = DEFAULT_LANE_BALANCE;
    expect(b.hammer).toEqual({ damage: 2, cooldownSeconds: 0.38 });
    expect(b.ranged.stopX).toBe(b.laneLength / 2);
    expect(b.ranged.spitEverySeconds).toBe(3);
    expect(b.boss.thresholds).toEqual([0.75, 0.5, 0.25]);
    expect(b.boss.summonCount).toBe(2);
    expect(b.popupBurstCount).toBe(3);
  });

  it('is deep-frozen', () => {
    expectDeepFrozen(DEFAULT_LANE_BALANCE);
  });

  it('passes its own validation', () => {
    expect(resolveLaneBalance()).toEqual(DEFAULT_LANE_BALANCE);
  });
});

describe('secondsToTicks', () => {
  it('rounds seconds × 60', () => {
    expect(secondsToTicks(0.3)).toBe(18);
    expect(secondsToTicks(8)).toBe(480);
    expect(secondsToTicks(0)).toBe(0);
    expect(secondsToTicks(1 / 120)).toBe(1); // 0.5 rounds up
    expect(secondsToTicks(0.008)).toBe(0); // 0.48 rounds down
  });
});

describe('resolveLaneBalance', () => {
  it('returns the defaults when given no overrides', () => {
    expect(resolveLaneBalance()).toEqual(DEFAULT_LANE_BALANCE);
    expect(resolveLaneBalance({})).toEqual(DEFAULT_LANE_BALANCE);
  });

  it('changes only the overridden value for a nested enemy override', () => {
    const balance = resolveLaneBalance({ enemies: { tank: { hp: 9 } } });
    expect(balance).toEqual({
      ...EXPECTED_DEFAULTS,
      enemies: { ...EXPECTED_DEFAULTS.enemies, tank: { ...EXPECTED_DEFAULTS.enemies.tank, hp: 9 } },
    });
  });

  it('merges hammer, ranged and boss field by field', () => {
    const balance = resolveLaneBalance({
      hammer: { damage: 5 },
      ranged: { firstSpitSeconds: 0 },
      boss: { summonCount: 4 },
    });
    expect(balance.hammer).toEqual({ damage: 5, cooldownSeconds: 0.38 });
    expect(balance.ranged).toEqual({ stopX: 400, firstSpitSeconds: 0, spitEverySeconds: 3 });
    expect(balance.boss).toEqual({ thresholds: [0.75, 0.5, 0.25], summonCount: 4, summonSpacing: 36 });
  });

  it('merges melee field by field and drops unknown melee keys', () => {
    const balance = resolveLaneBalance(
      loose({ melee: { tank: { hitEverySeconds: 3 }, ranged: { hitEverySeconds: 1 } } }),
    );
    expect(balance.melee).toEqual({ ...EXPECTED_DEFAULTS.melee, tank: { hitEverySeconds: 3 } });
    expect(resolveLaneBalance({ melee: { fast: {} } }).melee).toEqual(EXPECTED_DEFAULTS.melee);
  });
  it('replaces spawns whole instead of merging by index', () => {
    const spawns = [wave({ kind: 'boss', startSecond: 1, endSecond: 1 })];
    expect(resolveLaneBalance({ spawns }).spawns).toEqual(spawns);
    expect(resolveLaneBalance({ spawns: [] }).spawns).toEqual([]);
  });

  it('replaces boss.thresholds whole instead of merging by index', () => {
    expect(resolveLaneBalance({ boss: { thresholds: [0.9] } }).boss.thresholds).toEqual([0.9]);
    expect(resolveLaneBalance({ boss: { thresholds: [] } }).boss.thresholds).toEqual([]);
  });

  it('does not change DEFAULT_LANE_BALANCE when resolving overrides', () => {
    resolveLaneBalance({
      laneLength: 1000,
      enemies: { tank: { hp: 9 }, glob: { speed: 1 } },
      hammer: { cooldownSeconds: 1 },
      boss: { thresholds: [0.5] },
      spawns: [wave()],
    });
    expect(DEFAULT_LANE_BALANCE).toEqual(EXPECTED_DEFAULTS);
  });

  it('copies override objects instead of keeping or freezing them', () => {
    const spawns = [wave()];
    const thresholds = [0.5];
    const tank = { hp: 6 };
    const balance = resolveLaneBalance({ enemies: { tank }, boss: { thresholds }, spawns });
    expect(Object.isFrozen(spawns)).toBe(false);
    expect(Object.isFrozen(spawns[0])).toBe(false);
    expect(Object.isFrozen(thresholds)).toBe(false);
    expect(Object.isFrozen(tank)).toBe(false);
    spawns.push(wave({ kind: 'fast' }));
    thresholds.push(0.25);
    tank.hp = 9;
    expect(balance.spawns).toHaveLength(1);
    expect(balance.boss.thresholds).toEqual([0.5]);
    expect(balance.enemies.tank.hp).toBe(6);
  });

  it('keeps the default for overrides set to undefined', () => {
    const overrides: LaneBalanceOverrides = {
      laneLength: undefined,
      enemies: { tank: { hp: undefined } },
      boss: { thresholds: undefined },
      spawns: undefined,
    };
    expect(resolveLaneBalance(overrides)).toEqual(DEFAULT_LANE_BALANCE);
  });

  it('drops keys that are not part of LaneBalance', () => {
    const balance = resolveLaneBalance(
      loose({
        extra: 1,
        enemies: { zombie: { hp: 3 }, tank: { hp: 5, armour: 2 } },
        hammer: { colour: 'red' },
        spawns: [{ ...wave(), note: 'x' }],
      }),
    );
    expect(balance).toEqual({
      ...EXPECTED_DEFAULTS,
      enemies: { ...EXPECTED_DEFAULTS.enemies, tank: { ...EXPECTED_DEFAULTS.enemies.tank, hp: 5 } },
      spawns: [wave()],
    });
  });

  it('returns a deep-frozen result', () => {
    expectDeepFrozen(resolveLaneBalance({ enemies: { tank: { hp: 9 } }, spawns: [wave()] }));
  });

  it('survives a JSON round trip', () => {
    const balance = resolveLaneBalance({ boss: { thresholds: [0.6, 0.3] }, spawns: [wave()] });
    expect(JSON.parse(JSON.stringify(balance))).toEqual(balance);
    expect(JSON.parse(JSON.stringify(DEFAULT_LANE_BALANCE))).toEqual(DEFAULT_LANE_BALANCE);
  });

  describe('validation', () => {
    it.each([
      ['laneLength', { laneLength: Number.NaN }, 'laneLength must be a finite number, got NaN'],
      [
        'enemies.boss.speed',
        { enemies: { boss: { speed: Number.POSITIVE_INFINITY } } },
        'enemies.boss.speed must be a finite number, got Infinity',
      ],
      [
        'boss.thresholds[1]',
        { boss: { thresholds: [0.75, Number.NaN] } },
        'boss.thresholds[1] must be a finite number, got NaN',
      ],
      [
        'spawns[0].everySeconds',
        { spawns: [wave({ everySeconds: Number.NEGATIVE_INFINITY })] },
        'spawns[0].everySeconds must be a finite number, got -Infinity',
      ],
    ] as const)('rejects non-finite %s', (_name, overrides, problem) => {
      expect(problemsFor(overrides)).toEqual([problem]);
    });

    it('rejects a non-finite melee hitEverySeconds', () => {
      expect(problemsFor({ melee: { boss: { hitEverySeconds: Number.NaN } } })).toEqual([
        'melee.boss.hitEverySeconds must be a finite number, got NaN',
      ]);
    });
    it('rejects a melee hitEverySeconds that rounds to 0 ticks', () => {
      expect(problemsFor({ melee: { fast: { hitEverySeconds: 0.008 } } })).toEqual([
        'melee.fast.hitEverySeconds must round to at least 1 tick, got 0.008',
      ]);
      expect(resolveLaneBalance({ melee: { fast: { hitEverySeconds: 1 / 120 } } }).melee.fast).toEqual({
        hitEverySeconds: 1 / 120,
      });
    });
    it('lists a melee problem together with another problem', () => {
      expect(
        problemsFor({
          enemies: { tank: { damage: -1 } },
          melee: { default: { hitEverySeconds: 0 } },
        }),
      ).toEqual([
        'enemies.tank.damage must be >= 0, got -1',
        'melee.default.hitEverySeconds must round to at least 1 tick, got 0',
      ]);
    });
    it('rejects a non-number value from untyped input', () => {
      expect(problemsFor(loose({ hitPadding: '6' }))).toEqual([
        'hitPadding must be a finite number, got "6"',
      ]);
    });

    it.each([
      // laneLength also drops below stopX here; that comparison is skipped for an invalid length.
      [{ laneLength: 0 }, 'laneLength must be > 0, got 0'],
      [{ hitPadding: -1 }, 'hitPadding must be >= 0, got -1'],
      [{ enemies: { tank: { hp: 0 } } }, 'enemies.tank.hp must be an integer >= 1, got 0'],
      [{ enemies: { tank: { hp: 1.5 } } }, 'enemies.tank.hp must be an integer >= 1, got 1.5'],
      [{ enemies: { fast: { speed: 0 } } }, 'enemies.fast.speed must be > 0, got 0'],
      [{ enemies: { glob: { damage: -1 } } }, 'enemies.glob.damage must be >= 0, got -1'],
      [{ enemies: { boss: { dropKb: -1 } } }, 'enemies.boss.dropKb must be an integer >= 0, got -1'],
      [{ enemies: { boss: { dropKb: 2.5 } } }, 'enemies.boss.dropKb must be an integer >= 0, got 2.5'],
      [{ enemies: { default: { width: 0 } } }, 'enemies.default.width must be > 0, got 0'],
      [{ enemies: { ranged: { height: -2 } } }, 'enemies.ranged.height must be > 0, got -2'],
      [{ hammer: { damage: 0 } }, 'hammer.damage must be > 0, got 0'],
      [{ hammer: { cooldownSeconds: -0.1 } }, 'hammer.cooldownSeconds must be >= 0, got -0.1'],
      [{ ranged: { stopX: 0 } }, 'ranged.stopX must be > 0, got 0'],
      [{ ranged: { stopX: 800 } }, 'ranged.stopX must be < laneLength (800), got 800'],
      [{ laneLength: 300 }, 'ranged.stopX must be < laneLength (300), got 400'],
      [{ ranged: { firstSpitSeconds: -1 } }, 'ranged.firstSpitSeconds must be >= 0, got -1'],
      [
        { ranged: { spitEverySeconds: 0.008 } },
        'ranged.spitEverySeconds must be at least 1 tick after Math.round(seconds × 60), got 0.008',
      ],
      [{ boss: { thresholds: [1, 0.5] } }, 'boss.thresholds[0] must be in (0, 1), got 1'],
      [{ boss: { thresholds: [0.5, 0] } }, 'boss.thresholds[1] must be in (0, 1), got 0'],
      [
        { boss: { thresholds: [0.5, 0.75] } },
        'boss.thresholds must be strictly decreasing, got [0.5, 0.75]',
      ],
      [
        { boss: { thresholds: [0.5, 0.5] } },
        'boss.thresholds must be strictly decreasing, got [0.5, 0.5]',
      ],
      [{ boss: { summonCount: -1 } }, 'boss.summonCount must be an integer >= 0, got -1'],
      [{ boss: { summonCount: 1.5 } }, 'boss.summonCount must be an integer >= 0, got 1.5'],
      [{ boss: { summonSpacing: -1 } }, 'boss.summonSpacing must be >= 0, got -1'],
      [{ popupBurstCount: 2.5 }, 'popupBurstCount must be an integer >= 0, got 2.5'],
      [{ spawns: [wave({ startSecond: -1 })] }, 'spawns[0].startSecond must be >= 0, got -1'],
      [
        { spawns: [wave(), wave({ startSecond: 10, endSecond: 5 })] },
        'spawns[1].endSecond must be >= startSecond (10), got 5',
      ],
      [
        { spawns: [wave({ everySeconds: 0 })] },
        'spawns[0].everySeconds must be at least 1 tick after Math.round(seconds × 60), got 0',
      ],
    ] as const)('rejects %j', (overrides, problem) => {
      expect(problemsFor(overrides as LaneBalanceOverrides)).toEqual([problem]);
    });

    it('accepts values on the edge of their ranges', () => {
      const balance = resolveLaneBalance({
        hitPadding: 0,
        enemies: { fast: { hp: 1, damage: 0, dropKb: 0 } },
        hammer: { cooldownSeconds: 0 },
        ranged: { stopX: 799, firstSpitSeconds: 0, spitEverySeconds: 1 / 120 },
        boss: { summonCount: 0, summonSpacing: 0 },
        popupBurstCount: 0,
        spawns: [wave({ startSecond: 5, endSecond: 5, everySeconds: 1 / 60 })],
      });
      expect(balance.ranged.stopX).toBe(799);
    });

    it('reports an unknown spawn kind', () => {
      const spawns = [wave({ kind: 'zombie' as never })];
      expect(problemsFor({ spawns })).toEqual([
        'spawns[0].kind must be one of default, fast, tank, ranged, boss, got "zombie"',
      ]);
    });

    it('reports a glob as an unknown spawn kind (globs only come from ranged mobs)', () => {
      expect(problemsFor({ spawns: [wave({ kind: 'glob' as never })] })).toEqual([
        'spawns[0].kind must be one of default, fast, tank, ranged, boss, got "glob"',
      ]);
    });

    it('reports a wave with a missing field', () => {
      expect(problemsFor(loose({ spawns: [{ kind: 'fast', startSecond: 0, endSecond: 5 }] }))).toEqual([
        'spawns[0].everySeconds must be a finite number, got undefined',
      ]);
    });

    it('reports sections of the wrong shape', () => {
      expect(
        problemsFor(
          loose({
            enemies: 5,
            hammer: [1],
            boss: { thresholds: 0.5 },
            spawns: { kind: 'default' },
          }),
        ),
      ).toEqual([
        'enemies must be an object, got 5',
        'boss.thresholds must be an array, got 0.5',
        'spawns must be an array, got [object Object]',
        'hammer must be an object, got 1',
      ]);
      expect(problemsFor(loose({ enemies: { tank: null }, spawns: [null] }))).toEqual([
        'enemies.tank must be an object, got null',
        'spawns[0] must be an object, got null',
      ]);
    });

    it('skips comparison checks when a field is already invalid', () => {
      expect(problemsFor({ ranged: { stopX: Number.NaN } })).toEqual([
        'ranged.stopX must be a finite number, got NaN',
      ]);
      expect(problemsFor({ laneLength: Number.NaN })).toEqual([
        'laneLength must be a finite number, got NaN',
      ]);
      expect(problemsFor({ spawns: [wave({ startSecond: Number.NaN, endSecond: 5 })] })).toEqual([
        'spawns[0].startSecond must be a finite number, got NaN',
      ]);
    });

    it('lists both problems when two fields are invalid', () => {
      expect(
        problemsFor({ laneLength: -1, enemies: { fast: { speed: Number.POSITIVE_INFINITY } } }),
      ).toEqual([
        'laneLength must be > 0, got -1',
        'enemies.fast.speed must be a finite number, got Infinity',
      ]);
    });

    it('puts every problem in the error message', () => {
      expect(() => resolveLaneBalance({ hitPadding: -1, popupBurstCount: -1 })).toThrow(
        'Invalid lane balance: hitPadding must be >= 0, got -1; popupBurstCount must be an integer >= 0, got -1',
      );
    });

    it('is an Error named LaneBalanceError with frozen problems', () => {
      const source = ['x'];
      const error = new LaneBalanceError(source);
      source.push('y');
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('LaneBalanceError');
      expect(error.problems).toEqual(['x']);
      expect(Object.isFrozen(error.problems)).toBe(true);
    });
  });
});
