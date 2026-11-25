// Lane tuning values for connection-lane (Req 2). Lane_Systems get their balance through
// resolveLaneBalance, which merges overrides onto the defaults and validates the result (Req 2.5).

// types.ts and laneTypes.ts only import lane balance types as types, so these value imports
// create no runtime cycle.
import { TICK_RATE } from '../types';
import {
  ENEMY_KINDS,
  MELEE_KINDS,
  MOB_KINDS,
  type EnemyKind,
  type MeleeKind,
  type MobKind,
} from '../laneTypes';

export interface EnemyStats {
  /** Integer ≥ 1. */
  readonly hp: number;
  /** Lane_Units per second, > 0. */
  readonly speed: number;
  /** Modem damage per bite, ≥ 0. */
  readonly damage: number;
  /** Integer ≥ 0. */
  readonly dropKb: number;
  /** Hit_Box width in Lane_Units, > 0. */
  readonly width: number;
  /** Hit_Box height in Lane_Units, > 0. */
  readonly height: number;
}

export interface MeleeStats {
  /** Seconds between two Melee_Hits; rounds to >= 1 tick. */
  readonly hitEverySeconds: number;
}

export interface SpawnWave {
  readonly kind: MobKind;
  /** ≥ 0. */
  readonly startSecond: number;
  /** ≥ startSecond. */
  readonly endSecond: number;
  /** Rounds to ≥ 1 tick. */
  readonly everySeconds: number;
}

export interface LaneBalance {
  readonly laneLength: number;
  readonly hitPadding: number;
  readonly enemies: Readonly<Record<EnemyKind, EnemyStats>>;
  readonly melee: Readonly<Record<MeleeKind, MeleeStats>>;
  readonly hammer: { readonly damage: number; readonly cooldownSeconds: number };
  readonly ranged: {
    readonly stopX: number;
    readonly firstSpitSeconds: number;
    readonly spitEverySeconds: number;
  };
  readonly boss: {
    readonly thresholds: readonly number[];
    readonly summonCount: number;
    readonly summonSpacing: number;
  };
  readonly popupBurstCount: number;
  readonly spawns: readonly SpawnWave[];
}

/** Nested partials for the tables; `spawns` and `boss.thresholds` are replaced whole. */
export interface LaneBalanceOverrides {
  readonly laneLength?: number;
  readonly hitPadding?: number;
  readonly enemies?: { readonly [K in EnemyKind]?: Partial<EnemyStats> };
  readonly melee?: { readonly [K in MeleeKind]?: Partial<MeleeStats> };
  readonly hammer?: Partial<LaneBalance['hammer']>;
  readonly ranged?: Partial<LaneBalance['ranged']>;
  readonly boss?: Partial<LaneBalance['boss']>;
  readonly popupBurstCount?: number;
  readonly spawns?: readonly SpawnWave[];
}

/** Converts a balance duration to ticks (Req 2.4). */
export function secondsToTicks(seconds: number): number {
  return Math.round(seconds * TICK_RATE);
}

/** Attack_Point of a melee kind: half its Hit_Box width. */
export function attackPoint(balance: LaneBalance, kind: MeleeKind): number {
  return balance.enemies[kind].width / 2;
}

/**
 * Default tuning (Req 2.1–2.3, 3.3). Mob numbers come from docs/game-design.md section 5; the
 * crossing times in the comments assume laneLength 800.
 */
export const DEFAULT_LANE_BALANCE: LaneBalance = deepFreeze({
  laneLength: 800,
  hitPadding: 6,
  enemies: {
    default: { hp: 5, speed: 40, damage: 4, dropKb: 3, width: 44, height: 72 }, // 20 s
    fast: { hp: 3, speed: 110, damage: 3, dropKb: 4, width: 34, height: 48 }, // 7.3 s
    tank: { hp: 6, speed: 24, damage: 10, dropKb: 12, width: 72, height: 96 }, // 33 s
    ranged: { hp: 4, speed: 40, damage: 0, dropKb: 8, width: 48, height: 76 }, // stops at 400
    // Boss HP and speed: docs/balance/2026-11-24-boss-threat.md; drop: 2026-11-24-late-income.md.
    boss: { hp: 150, speed: 38, damage: 20, dropKb: 30, width: 112, height: 150 }, // 21 s
    glob: { hp: 1, speed: 150, damage: 5, dropKb: 0, width: 22, height: 22 }, // 2.7 s from 400
  },
  // Seconds between Melee_Hits at the modem (docs/game-design.md section 5).
  melee: {
    default: { hitEverySeconds: 1.5 },
    fast: { hitEverySeconds: 1 },
    tank: { hitEverySeconds: 2 },
    boss: { hitEverySeconds: 2 },
  },
  hammer: { damage: 2, cooldownSeconds: 0.38 }, // docs/balance/2026-11-25-weapon-roles.md
  ranged: { stopX: 400, firstSpitSeconds: 1, spitEverySeconds: 3 },
  boss: { thresholds: [0.75, 0.5, 0.25], summonCount: 2, summonSpacing: 36 },
  popupBurstCount: 3,
  // Placeholder Spawn_Schedule; the chapter director replaces it in milestone 5.
  spawns: [
    { kind: 'default', startSecond: 8, endSecond: 150, everySeconds: 6 }, // Hook: 0:08
    { kind: 'fast', startSecond: 45, endSecond: 150, everySeconds: 7 }, // Pinch 1
    { kind: 'tank', startSecond: 70, endSecond: 150, everySeconds: 12 }, // Midpoint
    { kind: 'ranged', startSecond: 90, endSecond: 150, everySeconds: 15 }, // Pinch 2
    { kind: 'boss', startSecond: 160, endSecond: 160, everySeconds: 1 }, // placeholder; the Director uses bossAtPercent
  ],
} satisfies LaneBalance);

/** Thrown when a lane balance config is invalid. `problems` lists every problem found. */
export class LaneBalanceError extends Error {
  readonly problems: readonly string[];

  constructor(problems: readonly string[]) {
    super(`Invalid lane balance: ${problems.join('; ')}`);
    this.name = 'LaneBalanceError';
    this.problems = Object.freeze([...problems]);
  }
}

/**
 * Merge overrides onto the defaults and validate. `enemies`, `melee`, `hammer`, `ranged` and `boss` merge
 * field by field; `spawns` and `boss.thresholds` are replaced whole. Overrides set to
 * `undefined` keep the default and keys that are not part of LaneBalance are dropped, so the
 * result is always plain, deep-frozen data. Throws LaneBalanceError listing every problem.
 */
export function resolveLaneBalance(overrides: LaneBalanceOverrides = {}): LaneBalance {
  const problems: string[] = [];
  const d = DEFAULT_LANE_BALANCE;
  const o: Loose = isRecord(overrides) ? overrides : {};

  const enemiesOverride = section(o, 'enemies', problems);
  const enemies = {} as Record<EnemyKind, EnemyStats>;
  for (const kind of ENEMY_KINDS) {
    const stats = section(enemiesOverride, kind, problems, `enemies.${kind}`);
    enemies[kind] = pick(d.enemies[kind], stats, STAT_KEYS);
  }

  const meleeOverride = section(o, 'melee', problems);
  const melee = {} as Record<MeleeKind, MeleeStats>;
  for (const kind of MELEE_KINDS) {
    const stats = section(meleeOverride, kind, problems, `melee.${kind}`);
    melee[kind] = pick(d.melee[kind], stats, ['hitEverySeconds']);
  }

  const bossOverride = section(o, 'boss', problems);
  const boss = pick(d.boss, bossOverride, ['summonCount', 'summonSpacing']);
  const thresholds = listOverride(bossOverride, 'thresholds', 'boss.thresholds', problems);

  const spawnsOverride = listOverride(o, 'spawns', 'spawns', problems);

  const merged: LaneBalance = {
    laneLength: pickOne(d.laneLength, o.laneLength),
    hitPadding: pickOne(d.hitPadding, o.hitPadding),
    enemies,
    melee,
    hammer: pick(d.hammer, section(o, 'hammer', problems), ['damage', 'cooldownSeconds']),
    ranged: pick(d.ranged, section(o, 'ranged', problems), [
      'stopX',
      'firstSpitSeconds',
      'spitEverySeconds',
    ]),
    // A non-number threshold is kept as-is here and reported by validation.
    boss: { ...boss, thresholds: thresholds ? ([...thresholds] as number[]) : [...d.boss.thresholds] },
    popupBurstCount: pickOne(d.popupBurstCount, o.popupBurstCount),
    spawns: spawnsOverride
      ? spawnsOverride.map((wave, i) => copyWave(wave, i, problems))
      : d.spawns.map((wave) => ({ ...wave })),
  };

  problems.push(...validateLaneBalance(merged));
  if (problems.length > 0) throw new LaneBalanceError(problems);
  return deepFreeze(merged);
}

// ---------------------------------------------------------------------------------------------
// Merging

/** Overrides as they may arrive at runtime (headless tools, JSON), before validation. */
type Loose = { readonly [key: string]: unknown };

const STAT_KEYS: readonly (keyof EnemyStats)[] = [
  'hp',
  'speed',
  'damage',
  'dropKb',
  'width',
  'height',
];
const WAVE_KEYS = ['kind', 'startSecond', 'endSecond', 'everySeconds'] as const;

function isRecord(value: unknown): value is Loose {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The nested override object at `key`, or an empty one. Reports a non-object value. */
function section(parent: Loose, key: string, problems: string[], path = key): Loose {
  const value = parent[key];
  if (value === undefined) return {};
  if (isRecord(value)) return value;
  problems.push(`${path} must be an object, got ${describe(value)}`);
  return {};
}

/** The array override at `key`, or null to keep the default. Reports a non-array value. */
function listOverride(
  parent: Loose,
  key: string,
  path: string,
  problems: string[],
): readonly unknown[] | null {
  const value = parent[key];
  if (value === undefined) return null;
  if (Array.isArray(value)) return value;
  problems.push(`${path} must be an array, got ${describe(value)}`);
  return null;
}

function pickOne<T>(fallback: T, value: unknown): T {
  // A wrong type is kept as-is here and reported by validation.
  return value === undefined ? fallback : (value as T);
}

/** Copies `keys` from the defaults, replaced by any defined override value. */
function pick<T extends object, K extends keyof T>(
  defaults: T,
  override: Loose,
  keys: readonly K[],
): Pick<T, K> {
  const out = {} as Pick<T, K>;
  for (const key of keys) out[key] = pickOne(defaults[key], override[String(key)]);
  return out;
}

function copyWave(wave: unknown, index: number, problems: string[]): SpawnWave {
  if (!isRecord(wave)) {
    problems.push(`spawns[${index}] must be an object, got ${describe(wave)}`);
    return { kind: 'default', startSecond: 0, endSecond: 0, everySeconds: 1 };
  }
  const out: Record<string, unknown> = {};
  for (const key of WAVE_KEYS) out[key] = wave[key];
  return out as unknown as SpawnWave;
}

// ---------------------------------------------------------------------------------------------
// Validation

interface Rule {
  readonly test: (value: number) => boolean;
  readonly text: string;
}

const POSITIVE: Rule = { test: (v) => v > 0, text: '> 0' };
const NON_NEGATIVE: Rule = { test: (v) => v >= 0, text: '>= 0' };
const INT_AT_LEAST_1: Rule = { test: (v) => Number.isInteger(v) && v >= 1, text: 'an integer >= 1' };
const INT_NON_NEGATIVE: Rule = { test: (v) => Number.isInteger(v) && v >= 0, text: 'an integer >= 0' };
const AT_LEAST_ONE_TICK: Rule = {
  test: (v) => secondsToTicks(v) >= 1,
  text: `at least 1 tick after Math.round(seconds × ${TICK_RATE})`,
};
/** Finite is all that is required; cross-field checks follow. */
const ANY: Rule = { test: () => true, text: 'finite' };
const SHARE: Rule = { test: (v) => v > 0 && v < 1, text: 'in (0, 1)' };

const STAT_RULES: Readonly<Record<keyof EnemyStats, Rule>> = {
  hp: INT_AT_LEAST_1,
  speed: POSITIVE,
  damage: NON_NEGATIVE,
  dropKb: INT_NON_NEGATIVE,
  width: POSITIVE,
  height: POSITIVE,
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Reports a non-finite value or a value that breaks `rule`. Returns true when the value is a
 * finite number, so callers can run cross-field checks on it.
 */
function check(problems: string[], path: string, value: unknown, rule: Rule): value is number {
  if (!isFiniteNumber(value)) {
    problems.push(`${path} must be a finite number, got ${describe(value)}`);
    return false;
  }
  if (!rule.test(value)) problems.push(`${path} must be ${rule.text}, got ${value}`);
  return true;
}

function validateLaneBalance(b: LaneBalance): string[] {
  const problems: string[] = [];

  const laneLengthOk = check(problems, 'laneLength', b.laneLength, POSITIVE) && b.laneLength > 0;
  check(problems, 'hitPadding', b.hitPadding, NON_NEGATIVE);

  for (const kind of ENEMY_KINDS) {
    for (const key of STAT_KEYS) {
      check(problems, `enemies.${kind}.${key}`, b.enemies[kind][key], STAT_RULES[key]);
    }
  }

  for (const kind of MELEE_KINDS) {
    const path = `melee.${kind}.hitEverySeconds`;
    const v = b.melee[kind].hitEverySeconds;
    if (!isFiniteNumber(v)) problems.push(`${path} must be a finite number, got ${describe(v)}`);
    else if (secondsToTicks(v) < 1) problems.push(`${path} must round to at least 1 tick, got ${v}`);
  }

  check(problems, 'hammer.damage', b.hammer.damage, POSITIVE);
  check(problems, 'hammer.cooldownSeconds', b.hammer.cooldownSeconds, NON_NEGATIVE);

  const { stopX } = b.ranged;
  if (check(problems, 'ranged.stopX', stopX, POSITIVE) && laneLengthOk && stopX >= b.laneLength) {
    problems.push(`ranged.stopX must be < laneLength (${b.laneLength}), got ${stopX}`);
  }
  check(problems, 'ranged.firstSpitSeconds', b.ranged.firstSpitSeconds, NON_NEGATIVE);
  check(problems, 'ranged.spitEverySeconds', b.ranged.spitEverySeconds, AT_LEAST_ONE_TICK);

  const thresholds = b.boss.thresholds;
  let decreasing = true;
  thresholds.forEach((t, i) => {
    if (!check(problems, `boss.thresholds[${i}]`, t, SHARE)) return;
    const prev = thresholds[i - 1];
    if (i > 0 && isFiniteNumber(prev) && t >= prev) decreasing = false;
  });
  if (!decreasing) {
    problems.push(`boss.thresholds must be strictly decreasing, got [${thresholds.join(', ')}]`);
  }
  check(problems, 'boss.summonCount', b.boss.summonCount, INT_NON_NEGATIVE);
  check(problems, 'boss.summonSpacing', b.boss.summonSpacing, NON_NEGATIVE);

  check(problems, 'popupBurstCount', b.popupBurstCount, INT_NON_NEGATIVE);

  b.spawns.forEach((wave, i) => {
    const path = `spawns[${i}]`;
    if (!(MOB_KINDS as readonly unknown[]).includes(wave.kind)) {
      problems.push(
        `${path}.kind must be one of ${MOB_KINDS.join(', ')}, got ${describe(wave.kind)}`,
      );
    }
    const startOk = check(problems, `${path}.startSecond`, wave.startSecond, NON_NEGATIVE);
    const endOk = check(problems, `${path}.endSecond`, wave.endSecond, ANY);
    if (startOk && endOk && wave.endSecond < wave.startSecond) {
      problems.push(
        `${path}.endSecond must be >= startSecond (${wave.startSecond}), got ${wave.endSecond}`,
      );
    }
    check(problems, `${path}.everySeconds`, wave.everySeconds, AT_LEAST_ONE_TICK);
  });

  return problems;
}

function describe(value: unknown): string {
  return typeof value === 'string' ? JSON.stringify(value) : String(value);
}

/** Freezes an object and every object or array inside it. */
function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
