// Economy and weapon tuning values for economy-weapons (Req 4.1, 8.4). Economy systems get
// their balance through resolveEconomyBalance, which merges overrides onto the defaults and
// validates the result the same way resolveLaneBalance does.

import { TICK_RATE } from '../types';
import { secondsToTicks } from './lane';

export const SHOP_ITEMS = [
  'heavyHead',
  'saw',
  'highRpm',
  'flamethrower',
  'bigTank',
  'blocker',
  'surge',
] as const;
export type ShopItem = (typeof SHOP_ITEMS)[number];

export interface EconomyBalance {
  /** KB price per item, whole numbers >= 0 (docs/game-design.md section 6). */
  readonly prices: Readonly<Record<ShopItem, number>>;
  /** Seconds a packet stays on the lane, > 0. It fades in the last second. */
  readonly packetLifetimeSeconds: number;
  /** Lane_Units from the packet at (x, 12), > 0. */
  readonly pickupRadius: number;
  /** Hammer damage per hit with the heavy head, > 0 (Req 6.1). */
  readonly heavyHeadDamage: number;
  /** Saw damage per second, > 0. */
  readonly sawDps: number;
  /** High RPM multiplier on sawDps, >= 1. */
  readonly highRpmFactor: number;
  /** Flame cone damage per second, > 0. */
  readonly flameDps: number;
  /** Burn damage per second, >= 0. */
  readonly burnDps: number;
  /** Burn duration, >= 0. */
  readonly burnSeconds: number;
  /** Cone reach in Lane_Units, > 0. */
  readonly flameReach: number;
  /** Cone half angle, in (0, 90). */
  readonly flameHalfAngleDeg: number;
  /** Maximum Fuel in seconds, > 0. */
  readonly fuelSeconds: number;
  /** Big tank multiplier on fuelSeconds, >= 1. */
  readonly bigTankFactor: number;
  /** Fuel seconds regained per second while not firing, >= 0. */
  readonly fuelRefillPerSecond: number;
  /** Pop-up blocker duration, > 0. */
  readonly blockerSeconds: number;
  /** Surge protector window, > 0. */
  readonly surgeSeconds: number;
  /** Seconds after buying a pop-up blocker before another can be bought, >= 0. */
  readonly blockerCooldownSeconds: number;
  /** Seconds after buying a surge protector before another can be bought, >= 0. */
  readonly surgeCooldownSeconds: number;
  /** KB lost on a fake-button click, whole number >= 0. */
  readonly fakeLossKb: number;
  /** Most seconds between two non-glob kills that keeps a combo chain going, >= 1 Tick (Req 5.1). */
  readonly comboWindowSeconds: number;
  /** Chain length at which kills start to pay the combo bonus, whole number >= 2. */
  readonly comboStart: number;
  /** KB added for each kill in a chain at or past comboStart, whole number >= 0. */
  readonly comboBonusKb: number;
  /** Share of flame and burn damage the boss takes, in [0, 1]. The flamer is a crowd weapon. */
  readonly bossFlameFactor: number;
}

type ScalarKey = Exclude<keyof EconomyBalance, 'prices'>;

export interface EconomyBalanceOverrides extends Partial<Omit<EconomyBalance, 'prices'>> {
  readonly prices?: Partial<Record<ShopItem, number>>;
}

/** Default tuning (docs/game-design.md section 6, design.md "Balance"). */
export const DEFAULT_ECONOMY_BALANCE: EconomyBalance = deepFreeze({
  prices: {
    heavyHead: 30,
    saw: 75,
    highRpm: 50,
    flamethrower: 150,
    bigTank: 60,
    blocker: 40,
    surge: 50,
  },
  packetLifetimeSeconds: 3,
  pickupRadius: 28,
  heavyHeadDamage: 3,
  sawDps: 7,
  highRpmFactor: 1.5,
  flameDps: 3,
  burnDps: 1,
  burnSeconds: 2,
  flameReach: 220,
  flameHalfAngleDeg: 18,
  fuelSeconds: 6, // 9 s with the big tank (Req 8.4)
  bigTankFactor: 1.5,
  fuelRefillPerSecond: 1.5,
  blockerSeconds: 6,
  surgeSeconds: 5,
  blockerCooldownSeconds: 20,
  surgeCooldownSeconds: 20,
  fakeLossKb: 5,
  comboWindowSeconds: 2,
  comboStart: 3,
  comboBonusKb: 1,
  bossFlameFactor: 0.25,
} satisfies EconomyBalance);

/** Thrown when an economy balance config is invalid. `problems` lists every problem found. */
export class EconomyBalanceError extends Error {
  readonly problems: readonly string[];
  constructor(problems: readonly string[]) {
    super(`Invalid economy balance: ${problems.join('; ')}`);
    this.name = 'EconomyBalanceError';
    this.problems = Object.freeze([...problems]);
  }
}

interface Rule {
  readonly test: (value: number) => boolean;
  readonly text: string;
}
const POSITIVE: Rule = { test: (v) => v > 0, text: '> 0' };
const NON_NEGATIVE: Rule = { test: (v) => v >= 0, text: '>= 0' };
const AT_LEAST_ONE: Rule = { test: (v) => v >= 1, text: '>= 1' };
const INT_NON_NEGATIVE: Rule = {
  test: (v) => Number.isInteger(v) && v >= 0,
  text: 'a whole number >= 0',
};
const INT_AT_LEAST_TWO: Rule = {
  test: (v) => Number.isInteger(v) && v >= 2,
  text: 'a whole number >= 2',
};
const AT_LEAST_ONE_TICK: Rule = {
  test: (v) => secondsToTicks(v) >= 1,
  text: `at least 1 tick after Math.round(seconds × ${TICK_RATE})`,
};
const SHARE: Rule = { test: (v) => v >= 0 && v <= 1, text: 'in [0, 1]' };
const HALF_ANGLE: Rule = { test: (v) => v > 0 && v < 90, text: 'in (0, 90)' };

const SCALAR_RULES: Readonly<Record<ScalarKey, Rule>> = {
  packetLifetimeSeconds: POSITIVE,
  pickupRadius: POSITIVE,
  heavyHeadDamage: POSITIVE,
  sawDps: POSITIVE,
  highRpmFactor: AT_LEAST_ONE,
  flameDps: POSITIVE,
  burnDps: NON_NEGATIVE,
  burnSeconds: NON_NEGATIVE,
  flameReach: POSITIVE,
  flameHalfAngleDeg: HALF_ANGLE,
  fuelSeconds: POSITIVE,
  bigTankFactor: AT_LEAST_ONE,
  fuelRefillPerSecond: NON_NEGATIVE,
  blockerSeconds: POSITIVE,
  surgeSeconds: POSITIVE,
  blockerCooldownSeconds: NON_NEGATIVE,
  surgeCooldownSeconds: NON_NEGATIVE,
  fakeLossKb: INT_NON_NEGATIVE,
  comboWindowSeconds: AT_LEAST_ONE_TICK,
  comboStart: INT_AT_LEAST_TWO,
  comboBonusKb: INT_NON_NEGATIVE,
  bossFlameFactor: SHARE,
};
const SCALAR_KEYS = Object.keys(SCALAR_RULES) as ScalarKey[];

type Loose = { readonly [key: string]: unknown };

function isRecord(value: unknown): value is Loose {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Merge overrides onto the defaults and validate. `prices` merges item by item. Overrides set
 * to `undefined` keep the default and unknown keys are dropped, so the result is always plain,
 * deep-frozen data. Throws EconomyBalanceError listing every problem.
 */
export function resolveEconomyBalance(overrides: EconomyBalanceOverrides = {}): EconomyBalance {
  const problems: string[] = [];
  const d = DEFAULT_ECONOMY_BALANCE;
  const o: Loose = isRecord(overrides) ? overrides : {};

  let pricesOverride: Loose = {};
  if (o.prices !== undefined) {
    if (isRecord(o.prices)) pricesOverride = o.prices;
    else problems.push(`prices must be an object, got ${describe(o.prices)}`);
  }

  const prices = {} as Record<ShopItem, number>;
  for (const item of SHOP_ITEMS) {
    const v = pricesOverride[item];
    prices[item] = v === undefined ? d.prices[item] : (v as number);
    check(problems, `prices.${item}`, prices[item], INT_NON_NEGATIVE);
  }

  const merged = { prices } as { -readonly [K in keyof EconomyBalance]: EconomyBalance[K] };
  for (const key of SCALAR_KEYS) {
    const v = o[key];
    merged[key] = v === undefined ? d[key] : (v as number);
    check(problems, key, merged[key], SCALAR_RULES[key]);
  }

  if (problems.length > 0) throw new EconomyBalanceError(problems);
  return deepFreeze(merged);
}

function check(problems: string[], path: string, value: unknown, rule: Rule): void {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    problems.push(`${path} must be a finite number, got ${describe(value)}`);
  } else if (!rule.test(value)) {
    problems.push(`${path} must be ${rule.text}, got ${value}`);
  }
}

function describe(value: unknown): string {
  return typeof value === 'string' ? JSON.stringify(value) : String(value);
}

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
