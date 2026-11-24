// Ad tuning for browser-front (Req 2, 3). Ad_Systems get their balance through resolveAdBalance,
// which merges overrides onto the defaults and validates the result (Req 2.3).

// adTypes.ts only imports AdBalance as a type, so these imports create no runtime cycle.
import type { AdKind, ClosePattern, Rect } from '../ads/adTypes';
import { TICK_RATE } from '../types';
import { secondsToTicks } from './lane';

export interface AdRow {
  readonly kind: AdKind;
  /** Run seconds from dial start. */
  readonly startSecond: number;
  readonly endSecond: number;
  readonly everySeconds: number;
  /** Empty for fake rows. */
  readonly patterns: readonly ClosePattern[];
  readonly laneCover: boolean;
}

export interface AdBalance {
  readonly field: Rect;
  readonly desktop: Rect;
  /**
   * Where Lane_Cover clutter lands: the Screen rect over the Lane_Dock (ad-pressure Req 6.1).
   * Matches `desktopArea(true)` and `LANE_DOCK_H` in src/desktop/layout.ts.
   */
  readonly laneArea: Rect;
  readonly page: Rect;
  readonly realLink: Rect;
  readonly sizes: Readonly<Record<AdKind, { readonly w: number; readonly h: number }>>;
  readonly fakePenalty: number;
  readonly fakeLifetimeSeconds: number;
  readonly fakeRange: number;
  readonly rewardKb: number;
  readonly countdownSeconds: number;
  readonly runawayJumps: number;
  readonly cap: number;
  readonly mistakeExtras: number;
  /** Seconds after connectedTick. */
  readonly firstClutterDelaySeconds: number;
  /** Share of full download speed each open clutter Ad takes, in [0, 1] (ad-pressure Req 2.1). */
  readonly bandwidthPerClutter: number;
  /** The lowest Bandwidth_Factor open clutter can push the download to, in [0, 1] (Req 2.1). */
  readonly bandwidthFloor: number;
  /** A clutter Ad hatches a Mob every this many seconds it stays open (ad-pressure Req 4.1). */
  readonly hatchSeconds: number;
  /** The Hatch_Warning: the last this many seconds before each Hatch, in [0, hatchSeconds]. */
  readonly hatchWarningSeconds: number;
  readonly schedule: readonly AdRow[];
}

/** Runtime lists of the ad unions, used by validation and by tests. */
export const AD_KINDS: readonly AdKind[] = Object.freeze(['clutter', 'fake', 'interrupter']);
export const CLOSE_PATTERNS: readonly ClosePattern[] = Object.freeze([
  'plain', 'decoy', 'hidden', 'swapped', 'countdown', 'confirm', 'runaway',
]);

const TRICKY: readonly ClosePattern[] = ['plain', 'decoy', 'hidden', 'swapped'];
const ALL_BUT_RUNAWAY: readonly ClosePattern[] = [...TRICKY, 'countdown', 'confirm'];

/**
 * Default tuning (Req 2.1, 2.2). Geometry is Screen pixels on the 1024 × 768 Screen; the
 * Browser_View places the page body and the Real_Link at exactly these rectangles.
 */
export const DEFAULT_AD_BALANCE: AdBalance = deepFreeze({
  field: { x: 0, y: 0, w: 1024, h: 740 },
  desktop: { x: 0, y: 0, w: 1024, h: 480 },
  // 480 = 768 Screen − 28 Taskbar − 260 Lane_Dock.
  laneArea: { x: 0, y: 480, w: 1024, h: 260 },
  page: { x: 8, y: 92, w: 1008, h: 360 },
  realLink: { x: 412, y: 300, w: 200, h: 16 },
  sizes: {
    clutter: { w: 300, h: 180 },
    fake: { w: 220, h: 64 },
    interrupter: { w: 420, h: 240 },
  },
  fakePenalty: 20,
  fakeLifetimeSeconds: 8,
  fakeRange: 120,
  rewardKb: 3,
  countdownSeconds: 3,
  runawayJumps: 3,
  cap: 8,
  mistakeExtras: 1,
  firstClutterDelaySeconds: 5,
  bandwidthPerClutter: 0.15,
  bandwidthFloor: 0.4,
  hatchSeconds: 10,
  hatchWarningSeconds: 3,
  // Placeholder Ad_Schedule (Req 3.2), Run seconds from dial start; connect is at 20 s. The
  // forced first plain clutter at connect + firstClutterDelaySeconds comes on top of these rows.
  schedule: [
    { kind: 'clutter', startSecond: 33, endSecond: 44, everySeconds: 8, patterns: ['plain'], laneCover: false },
    { kind: 'clutter', startSecond: 45, endSecond: 89, everySeconds: 7, patterns: [...TRICKY], laneCover: false }, // Pinch 1
    { kind: 'fake', startSecond: 45, endSecond: 150, everySeconds: 12, patterns: [], laneCover: false },
    { kind: 'interrupter', startSecond: 55, endSecond: 89, everySeconds: 18, patterns: [...TRICKY], laneCover: false },
    { kind: 'clutter', startSecond: 70, endSecond: 89, everySeconds: 7, patterns: ['countdown', 'confirm'], laneCover: false }, // Midpoint
    { kind: 'interrupter', startSecond: 70, endSecond: 89, everySeconds: 18, patterns: ['countdown', 'confirm'], laneCover: false },
    { kind: 'clutter', startSecond: 90, endSecond: 114, everySeconds: 6, patterns: [...ALL_BUT_RUNAWAY], laneCover: true }, // Pinch 2
    { kind: 'interrupter', startSecond: 90, endSecond: 150, everySeconds: 15, patterns: ['runaway'], laneCover: false },
    { kind: 'clutter', startSecond: 115, endSecond: 150, everySeconds: 3, patterns: [...ALL_BUT_RUNAWAY], laneCover: true }, // Plot turn 2: double rate
  ],
} satisfies AdBalance);

type Size = { readonly w: number; readonly h: number };

/** Nested partials for rects and sizes; `schedule` is replaced whole. */
export interface AdBalanceOverrides {
  readonly field?: Partial<Rect>;
  readonly desktop?: Partial<Rect>;
  readonly laneArea?: Partial<Rect>;
  readonly page?: Partial<Rect>;
  readonly realLink?: Partial<Rect>;
  readonly sizes?: { readonly [K in AdKind]?: Partial<Size> };
  readonly fakePenalty?: number;
  readonly fakeLifetimeSeconds?: number;
  readonly fakeRange?: number;
  readonly rewardKb?: number;
  readonly countdownSeconds?: number;
  readonly runawayJumps?: number;
  readonly cap?: number;
  readonly mistakeExtras?: number;
  readonly firstClutterDelaySeconds?: number;
  readonly bandwidthPerClutter?: number;
  readonly bandwidthFloor?: number;
  readonly hatchSeconds?: number;
  readonly hatchWarningSeconds?: number;
  readonly schedule?: readonly AdRow[];
}

/** Thrown when an ad balance config is invalid. `problems` lists every problem found. */
export class AdBalanceError extends Error {
  readonly problems: readonly string[];

  constructor(problems: readonly string[]) {
    super(`Invalid ad balance: ${problems.join('; ')}`);
    this.name = 'AdBalanceError';
    this.problems = Object.freeze([...problems]);
  }
}

const RECT_KEYS = ['x', 'y', 'w', 'h'] as const;
const RECT_NAMES = ['field', 'desktop', 'laneArea', 'page', 'realLink'] as const;
const SCALAR_KEYS = [
  'fakePenalty', 'fakeLifetimeSeconds', 'fakeRange', 'rewardKb', 'countdownSeconds',
  'runawayJumps', 'cap', 'mistakeExtras', 'firstClutterDelaySeconds',
  'bandwidthPerClutter', 'bandwidthFloor', 'hatchSeconds', 'hatchWarningSeconds',
] as const;
const ROW_KEYS = ['kind', 'startSecond', 'endSecond', 'everySeconds', 'patterns', 'laneCover'] as const;

/**
 * Merge overrides onto the defaults and validate, like resolveLaneBalance (Req 2.3). Rects and
 * sizes merge field by field; `schedule` and each row's `patterns` are replaced whole. Unknown
 * keys are dropped and the result is deep-frozen plain data. Throws AdBalanceError listing
 * every problem.
 */
export function resolveAdBalance(overrides: AdBalanceOverrides = {}): AdBalance {
  const problems: string[] = [];
  const d = DEFAULT_AD_BALANCE;
  const o: Loose = isRecord(overrides) ? overrides : {};

  const rects = {} as Record<(typeof RECT_NAMES)[number], Rect>;
  for (const name of RECT_NAMES) rects[name] = pick(d[name], section(o, name, problems), RECT_KEYS);

  const sizesOverride = section(o, 'sizes', problems);
  const sizes = {} as Record<AdKind, Size>;
  for (const kind of AD_KINDS) {
    sizes[kind] = pick(d.sizes[kind], section(sizesOverride, kind, problems, `sizes.${kind}`), ['w', 'h']);
  }

  const scalars = pick(d, o, SCALAR_KEYS);
  const scheduleOverride = listOverride(o, 'schedule', problems);

  const merged: AdBalance = {
    ...rects,
    sizes,
    ...scalars,
    schedule: scheduleOverride
      ? scheduleOverride.map((row, i) => copyRow(row, i, problems))
      : d.schedule.map((row) => ({ ...row, patterns: [...row.patterns] })),
  };

  problems.push(...validateAdBalance(merged));
  if (problems.length > 0) throw new AdBalanceError(problems);
  return deepFreeze(merged);
}

// ---------------------------------------------------------------------------------------------
// Merging

type Loose = { readonly [key: string]: unknown };

function isRecord(value: unknown): value is Loose {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function section(parent: Loose, key: string, problems: string[], path = key): Loose {
  const value = parent[key];
  if (value === undefined) return {};
  if (isRecord(value)) return value;
  problems.push(`${path} must be an object, got ${describe(value)}`);
  return {};
}

function listOverride(parent: Loose, key: string, problems: string[]): readonly unknown[] | null {
  const value = parent[key];
  if (value === undefined) return null;
  if (Array.isArray(value)) return value;
  problems.push(`${key} must be an array, got ${describe(value)}`);
  return null;
}

function pick<T extends object, K extends keyof T>(defaults: T, override: Loose, keys: readonly K[]): Pick<T, K> {
  const out = {} as Pick<T, K>;
  for (const key of keys) {
    const value = override[String(key)];
    // A wrong type is kept as-is here and reported by validation.
    out[key] = value === undefined ? defaults[key] : (value as T[K]);
  }
  return out;
}

function copyRow(row: unknown, index: number, problems: string[]): AdRow {
  if (!isRecord(row)) {
    problems.push(`schedule[${index}] must be an object, got ${describe(row)}`);
    return { kind: 'clutter', startSecond: 0, endSecond: 0, everySeconds: 1, patterns: ['plain'], laneCover: false };
  }
  const out: Record<string, unknown> = {};
  for (const key of ROW_KEYS) out[key] = row[key];
  if (Array.isArray(out.patterns)) out.patterns = [...(out.patterns as unknown[])];
  return out as unknown as AdRow;
}

// ---------------------------------------------------------------------------------------------
// Validation

interface Rule {
  readonly test: (value: number) => boolean;
  readonly text: string;
}

const ANY: Rule = { test: () => true, text: 'finite' };
const POSITIVE: Rule = { test: (v) => v > 0, text: '> 0' };
const NON_NEGATIVE: Rule = { test: (v) => v >= 0, text: '>= 0' };
const INT: Rule = { test: (v) => Number.isInteger(v), text: 'an integer' };
const INT_POSITIVE: Rule = { test: (v) => Number.isInteger(v) && v >= 1, text: 'an integer >= 1' };
const INT_NON_NEGATIVE: Rule = { test: (v) => Number.isInteger(v) && v >= 0, text: 'an integer >= 0' };
const PERCENT: Rule = { test: (v) => v >= 0 && v <= 100, text: 'in [0, 100]' };
const UNIT: Rule = { test: (v) => v >= 0 && v <= 1, text: 'in [0, 1]' };
const AT_LEAST_ONE_TICK: Rule = {
  test: (v) => secondsToTicks(v) >= 1,
  text: `at least 1 tick after Math.round(seconds × ${TICK_RATE})`,
};

const SCALAR_RULES: Readonly<Record<(typeof SCALAR_KEYS)[number], Rule>> = {
  fakePenalty: PERCENT,
  fakeLifetimeSeconds: AT_LEAST_ONE_TICK,
  fakeRange: POSITIVE,
  rewardKb: INT_NON_NEGATIVE,
  countdownSeconds: NON_NEGATIVE,
  runawayJumps: INT_NON_NEGATIVE,
  cap: INT_POSITIVE,
  mistakeExtras: INT_NON_NEGATIVE,
  firstClutterDelaySeconds: NON_NEGATIVE,
  bandwidthPerClutter: UNIT,
  bandwidthFloor: UNIT,
  hatchSeconds: AT_LEAST_ONE_TICK,
  // The upper bound (<= hatchSeconds) is checked in validateAdBalance.
  hatchWarningSeconds: NON_NEGATIVE,
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function check(problems: string[], path: string, value: unknown, rule: Rule): value is number {
  if (!isFiniteNumber(value)) {
    problems.push(`${path} must be a finite number, got ${describe(value)}`);
    return false;
  }
  if (!rule.test(value)) {
    problems.push(`${path} must be ${rule.text}, got ${value}`);
    return false;
  }
  return true;
}

function inside(inner: Rect, outer: Rect): boolean {
  return inner.x >= outer.x && inner.y >= outer.y &&
    inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h;
}

function validateAdBalance(b: AdBalance): string[] {
  const problems: string[] = [];

  const rectOk = {} as Record<(typeof RECT_NAMES)[number], boolean>;
  for (const name of RECT_NAMES) {
    let ok = true;
    for (const key of RECT_KEYS) {
      ok = check(problems, `${name}.${key}`, b[name][key], key === 'w' || key === 'h' ? INT_POSITIVE : INT) && ok;
    }
    rectOk[name] = ok;
  }
  if (rectOk.field) {
    for (const name of ['desktop', 'laneArea', 'page', 'realLink'] as const) {
      if (rectOk[name] && !inside(b[name], b.field)) problems.push(`${name} must lie inside field`);
    }
  }

  for (const kind of AD_KINDS) {
    const size = b.sizes[kind];
    const wOk = check(problems, `sizes.${kind}.w`, size.w, INT_POSITIVE);
    const hOk = check(problems, `sizes.${kind}.h`, size.h, INT_POSITIVE);
    if (wOk && hOk && rectOk.field && (size.w > b.field.w || size.h > b.field.h)) {
      problems.push(`sizes.${kind} must fit inside field (${b.field.w} × ${b.field.h}), got ${size.w} × ${size.h}`);
    }
    // Lane_Cover clutter is placed fully inside laneArea (ad-pressure Req 6.1, 6.2).
    if (kind === 'clutter' && wOk && hOk && rectOk.laneArea && (size.w > b.laneArea.w || size.h > b.laneArea.h)) {
      problems.push(`laneArea (${b.laneArea.w} × ${b.laneArea.h}) must fit sizes.clutter (${size.w} × ${size.h})`);
    }
  }

  const scalarOk = {} as Record<(typeof SCALAR_KEYS)[number], boolean>;
  for (const key of SCALAR_KEYS) scalarOk[key] = check(problems, key, b[key], SCALAR_RULES[key]);
  if (scalarOk.hatchSeconds && scalarOk.hatchWarningSeconds && b.hatchWarningSeconds > b.hatchSeconds) {
    problems.push(`hatchWarningSeconds must be in [0, hatchSeconds (${b.hatchSeconds})], got ${b.hatchWarningSeconds}`);
  }

  b.schedule.forEach((row, i) => {
    const path = `schedule[${i}]`;
    const kindOk = (AD_KINDS as readonly unknown[]).includes(row.kind);
    if (!kindOk) problems.push(`${path}.kind must be one of ${AD_KINDS.join(', ')}, got ${describe(row.kind)}`);
    const startOk = check(problems, `${path}.startSecond`, row.startSecond, NON_NEGATIVE);
    const endOk = check(problems, `${path}.endSecond`, row.endSecond, ANY);
    if (startOk && endOk && row.endSecond < row.startSecond) {
      problems.push(`${path}.endSecond must be >= startSecond (${row.startSecond}), got ${row.endSecond}`);
    }
    check(problems, `${path}.everySeconds`, row.everySeconds, AT_LEAST_ONE_TICK);
    if (typeof row.laneCover !== 'boolean') {
      problems.push(`${path}.laneCover must be a boolean, got ${describe(row.laneCover)}`);
    }

    if (!Array.isArray(row.patterns)) {
      problems.push(`${path}.patterns must be an array, got ${describe(row.patterns)}`);
      return;
    }
    row.patterns.forEach((p: unknown, j: number) => {
      if (!(CLOSE_PATTERNS as readonly unknown[]).includes(p)) {
        problems.push(`${path}.patterns[${j}] must be one of ${CLOSE_PATTERNS.join(', ')}, got ${describe(p)}`);
      } else if (p === 'runaway' && kindOk && row.kind !== 'interrupter') {
        problems.push(`${path}.patterns[${j}] runaway is only allowed on interrupter rows`);
      }
    });
    if (kindOk && row.kind === 'fake' && row.patterns.length > 0) {
      problems.push(`${path}.patterns must be empty for fake rows`);
    }
    if (kindOk && row.kind !== 'fake' && row.patterns.length === 0) {
      problems.push(`${path}.patterns must not be empty for ${row.kind} rows`);
    }
  });

  return problems;
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
