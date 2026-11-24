// Chapter timeline for the Director (cross-front-and-director Req 1, 2.3, 3.3, 4.4). The whole
// scripted run from docs/game-design.md section 3 lives here as data; the Director only reads it.
import type { AdKind, ClosePattern } from '../ads/adTypes';
import { MOB_KINDS, type MobKind } from '../laneTypes';
import { TICK_RATE } from '../types';
import { AD_KINDS, CLOSE_PATTERNS, type AdRow } from './ads';
import { secondsToTicks } from './lane';

export type ChapterId =
  | 'hook' | 'plotTurn1' | 'pinch1' | 'midpoint' | 'pinch2' | 'plotTurn2' | 'resolution';

/** Chapter ids in table order. */
export const CHAPTER_IDS: readonly ChapterId[] = Object.freeze([
  'hook', 'plotTurn1', 'pinch1', 'midpoint', 'pinch2', 'plotTurn2', 'resolution',
]);

/** The Mob kinds a clutter Ad can hatch (ad-pressure Req 4.2). */
export type HatchKind = Extract<MobKind, 'default' | 'fast' | 'tank'>;
export const HATCH_KINDS: readonly HatchKind[] = Object.freeze(['default', 'fast', 'tank'] as const);

/** Spawns on Ticks `chapterStart + offset + k × every` while its Chapter is current. */
export interface ChapterWave {
  readonly kind: MobKind;
  readonly everySeconds: number;
  readonly offsetSeconds: number;
}

export interface Chapter {
  readonly id: ChapterId;
  /** 1..7 */
  readonly number: number;
  readonly name: string;
  /** Run seconds from dial start. Resolution has none (-1). */
  readonly startSecond: number;
  readonly waves: readonly ChapterWave[];
  /** AdRow from browser-front; startSecond / endSecond are relative to the Chapter start. */
  readonly ads: readonly AdRow[];
  /** The Mob a clutter Ad hatches while this Chapter is current; null means no hatching. */
  readonly hatchKind: HatchKind | null;
}

export interface ChapterTable {
  readonly chapters: readonly Chapter[];
  /** Boss_Rise download percent, in [0, 100] (pacing-and-economy Req 3.1). */
  readonly bossAtPercent: number;
  /** Boss_Rise clock fallback, Run seconds, >= 0: the boss rises by then at the latest. */
  readonly bossLatestSecond: number;
  /** Forced first plain clutter, seconds after connect. */
  readonly firstClutterAfterConnectSeconds: number;
  /** Midpoint_Calm length in seconds. */
  readonly calmSeconds: number;
  /** Midpoint_Cluster clutter count. */
  readonly clusterCount: number;
  /** Last_Interrupter download percent. */
  readonly lastInterrupterAt: number;
}

/** Scalars merge one by one; `chapters` is replaced whole. */
export interface ChapterTableOverrides {
  readonly chapters?: readonly Chapter[];
  readonly bossAtPercent?: number;
  readonly bossLatestSecond?: number;
  readonly firstClutterAfterConnectSeconds?: number;
  readonly calmSeconds?: number;
  readonly clusterCount?: number;
  readonly lastInterrupterAt?: number;
}

const TRICKY: readonly ClosePattern[] = ['plain', 'decoy', 'hidden', 'swapped'];
const ALL_BUT_RUNAWAY: readonly ClosePattern[] = [...TRICKY, 'countdown', 'confirm'];
const ALL: readonly ClosePattern[] = [...ALL_BUT_RUNAWAY, 'runaway'];

function wave(kind: MobKind, everySeconds: number, offsetSeconds = 0): ChapterWave {
  return { kind, everySeconds, offsetSeconds };
}

function row(
  kind: AdKind, everySeconds: number, endSecond: number, patterns: readonly ClosePattern[],
  opts: { startSecond?: number; laneCover?: boolean } = {},
): AdRow {
  return {
    kind, everySeconds, endSecond, patterns: [...patterns],
    startSecond: opts.startSecond ?? 0, laneCover: opts.laneCover ?? false,
  };
}

/** Default timeline (docs/game-design.md section 3). Ad row times are relative to chapter start. */
export const DEFAULT_CHAPTER_TABLE: ChapterTable = deepFreeze({
  chapters: [
    // No ads are open before connect, so the Hook never hatches. A quiet start: zombies at
    // about 0:08 and 0:18 (pacing-and-economy Req 2.1).
    { id: 'hook', number: 1, name: 'Hook', startSecond: 0, waves: [wave('default', 10, 8)], ads: [], hatchKind: null },
    {
      id: 'plotTurn1', number: 2, name: 'Plot turn 1', startSecond: 20,
      waves: [wave('default', 9)],
      // The forced first clutter at connect + 5 s comes on top of this row (Req 3.4).
      ads: [row('clutter', 9, 35, ['plain'], { startSecond: 13 })],
      hatchKind: 'default',
    },
    {
      id: 'pinch1', number: 3, name: 'Pinch 1', startSecond: 55,
      waves: [wave('default', 8), wave('fast', 10, 4)],
      ads: [
        row('clutter', 8, 35, TRICKY),
        row('fake', 12, 35, [], { startSecond: 5 }),
        row('interrupter', 18, 35, TRICKY, { startSecond: 10 }),
        // The first clutter over the lane (ad-pressure Req 6.3, docs/game-design.md section 3).
        row('clutter', 16, 35, TRICKY, { startSecond: 4, laneCover: true }),
      ],
      hatchKind: 'default',
    },
    {
      id: 'midpoint', number: 4, name: 'Midpoint', startSecond: 90,
      waves: [wave('default', 7), wave('fast', 9), wave('tank', 15, 3)],
      ads: [
        row('clutter', 7, 25, ALL_BUT_RUNAWAY),
        row('interrupter', 18, 25, ALL_BUT_RUNAWAY),
        row('fake', 12, 25, []),
        row('clutter', 14, 25, ALL_BUT_RUNAWAY, { startSecond: 3, laneCover: true }),
      ],
      // Ads let out fast zombies from the midpoint on (docs/game-design.md section 3).
      hatchKind: 'fast',
    },
    {
      id: 'pinch2', number: 5, name: 'Pinch 2', startSecond: 115,
      waves: [wave('default', 5), wave('fast', 7), wave('tank', 12), wave('ranged', 16, 2)],
      ads: [
        row('clutter', 6, 30, ALL_BUT_RUNAWAY, { laneCover: true }),
        row('interrupter', 15, 30, ALL),
        row('fake', 10, 30, []),
      ],
      hatchKind: 'fast',
    },
    {
      id: 'plotTurn2', number: 6, name: 'Plot turn 2', startSecond: 145,
      // The default flood stays at 2.5 s; the richer kinds come half as often to cut the late KB
      // (docs/balance/2026-11-24-late-income.md).
      waves: [wave('default', 2.5), wave('fast', 8), wave('tank', 16), wave('ranged', 20)],
      // No interrupter row: its one interrupter is the Last_Interrupter Beat.
      ads: [
        row('clutter', 3.5, 90, ALL_BUT_RUNAWAY, { laneCover: true }),
        row('fake', 8, 90, []),
      ],
      hatchKind: 'fast',
    },
    { id: 'resolution', number: 7, name: 'Resolution', startSecond: -1, waves: [], ads: [], hatchKind: null },
  ],
  // The boss rises when the download reaches 75%, or at 200 s at the latest
  // (pacing-and-economy Req 3.1, 3.2; tuned in docs/balance/2026-11-24-boss-threat.md).
  bossAtPercent: 75,
  bossLatestSecond: 200,
  firstClutterAfterConnectSeconds: 5,
  calmSeconds: 2,
  clusterCount: 4,
  lastInterrupterAt: 90,
} satisfies ChapterTable);

/** Thrown when a Chapter_Table is invalid. `problems` lists every problem found (Req 1.5). */
export class ChapterTableError extends Error {
  readonly problems: readonly string[];
  constructor(problems: readonly string[]) {
    super(`Invalid chapter table: ${problems.join('; ')}`);
    this.name = 'ChapterTableError';
    this.problems = Object.freeze([...problems]);
  }
}

const SCALAR_KEYS = [
  'bossAtPercent', 'bossLatestSecond', 'firstClutterAfterConnectSeconds', 'calmSeconds', 'clusterCount', 'lastInterrupterAt',
] as const;

/**
 * Merge overrides onto the defaults and validate. Returns deep-frozen plain data. Throws
 * ChapterTableError listing every problem.
 */
export function resolveChapterTable(overrides: ChapterTableOverrides = {}): ChapterTable {
  const problems: string[] = [];
  const o: Loose = isRecord(overrides) ? overrides : {};
  const d = DEFAULT_CHAPTER_TABLE;
  let chapters: unknown[];
  if (o.chapters === undefined) {
    chapters = d.chapters as unknown[];
  } else if (Array.isArray(o.chapters)) {
    chapters = o.chapters;
  } else {
    problems.push(`chapters must be an array, got ${describe(o.chapters)}`);
    chapters = d.chapters as unknown[];
  }
  const merged: Loose = { chapters: structuredCloneData(chapters) };
  for (const key of SCALAR_KEYS) merged[key] = o[key] === undefined ? d[key] : o[key];
  problems.push(...validate(merged));
  if (problems.length > 0) throw new ChapterTableError(problems);
  return deepFreeze(merged as unknown as ChapterTable);
}

// ---------------------------------------------------------------------------------------------
// Validation

type Loose = { [key: string]: unknown };

function isRecord(value: unknown): value is Loose {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

const TICK_TEXT = `at least 1 tick after Math.round(seconds × ${TICK_RATE})`;

function num(problems: string[], path: string, value: unknown, test: (v: number) => boolean, text: string): boolean {
  if (!isFiniteNumber(value)) {
    problems.push(`${path} must be a finite number, got ${describe(value)}`);
    return false;
  }
  if (!test(value)) {
    problems.push(`${path} must be ${text}, got ${value}`);
    return false;
  }
  return true;
}

const atLeastOneTick = (v: number): boolean => secondsToTicks(v) >= 1;
const nonNegative = (v: number): boolean => v >= 0;

function validate(t: Loose): string[] {
  const problems: string[] = [];
  const chapters = t.chapters as unknown[];
  if (chapters.length !== CHAPTER_IDS.length) {
    problems.push(`chapters must list ${CHAPTER_IDS.length} chapters, got ${chapters.length}`);
  }
  let prevStart: number | null = null;
  chapters.forEach((c, i) => {
    const path = `chapters[${i}]`;
    if (!isRecord(c)) {
      problems.push(`${path} must be an object, got ${describe(c)}`);
      return;
    }
    const expectedId = CHAPTER_IDS[i];
    if (c.id !== expectedId) problems.push(`${path}.id must be ${describe(expectedId)}, got ${describe(c.id)}`);
    if (c.number !== i + 1) problems.push(`${path}.number must be ${i + 1}, got ${describe(c.number)}`);
    if (typeof c.name !== 'string' || c.name.length === 0) {
      problems.push(`${path}.name must be a non-empty string, got ${describe(c.name)}`);
    }
    if (expectedId === 'resolution') {
      if (c.startSecond !== -1) problems.push(`${path}.startSecond must be -1 for resolution, got ${describe(c.startSecond)}`);
    } else if (num(problems, `${path}.startSecond`, c.startSecond, nonNegative, '>= 0')) {
      const start = c.startSecond as number;
      if (i === 0 && start !== 0) problems.push(`${path}.startSecond must be 0 for the first chapter, got ${start}`);
      if (prevStart !== null && start <= prevStart) {
        problems.push(`${path}.startSecond must be greater than the previous chapter's (${prevStart}), got ${start}`);
      }
      prevStart = start;
    }
    validateWaves(problems, path, c.waves);
    validateAds(problems, path, c.ads);
    if (c.hatchKind !== null && !(HATCH_KINDS as readonly unknown[]).includes(c.hatchKind)) {
      problems.push(`${path}.hatchKind must be one of ${HATCH_KINDS.join(', ')} or null, got ${describe(c.hatchKind)}`);
    }
  });

  num(problems, 'bossAtPercent', t.bossAtPercent, (v) => v >= 0 && v <= 100, 'in [0, 100]');
  num(problems, 'bossLatestSecond', t.bossLatestSecond, nonNegative, '>= 0');
  num(problems, 'firstClutterAfterConnectSeconds', t.firstClutterAfterConnectSeconds, nonNegative, '>= 0');
  num(problems, 'calmSeconds', t.calmSeconds, atLeastOneTick, TICK_TEXT);
  num(problems, 'clusterCount', t.clusterCount, (v) => Number.isInteger(v) && v >= 0, 'an integer >= 0');
  num(problems, 'lastInterrupterAt', t.lastInterrupterAt, (v) => v >= 0 && v <= 100, 'in [0, 100]');
  return problems;
}

function validateWaves(problems: string[], chapterPath: string, waves: unknown): void {
  if (!Array.isArray(waves)) {
    problems.push(`${chapterPath}.waves must be an array, got ${describe(waves)}`);
    return;
  }
  waves.forEach((w: unknown, j: number) => {
    const path = `${chapterPath}.waves[${j}]`;
    if (!isRecord(w)) {
      problems.push(`${path} must be an object, got ${describe(w)}`);
      return;
    }
    if (!(MOB_KINDS as readonly unknown[]).includes(w.kind)) {
      problems.push(`${path}.kind must be one of ${MOB_KINDS.join(', ')}, got ${describe(w.kind)}`);
    }
    num(problems, `${path}.everySeconds`, w.everySeconds, atLeastOneTick, TICK_TEXT);
    num(problems, `${path}.offsetSeconds`, w.offsetSeconds, nonNegative, '>= 0');
  });
}

function validateAds(problems: string[], chapterPath: string, ads: unknown): void {
  if (!Array.isArray(ads)) {
    problems.push(`${chapterPath}.ads must be an array, got ${describe(ads)}`);
    return;
  }
  ads.forEach((r: unknown, j: number) => {
    const path = `${chapterPath}.ads[${j}]`;
    if (!isRecord(r)) {
      problems.push(`${path} must be an object, got ${describe(r)}`);
      return;
    }
    const kindOk = (AD_KINDS as readonly unknown[]).includes(r.kind);
    if (!kindOk) problems.push(`${path}.kind must be one of ${AD_KINDS.join(', ')}, got ${describe(r.kind)}`);
    const startOk = num(problems, `${path}.startSecond`, r.startSecond, nonNegative, '>= 0');
    const endOk = num(problems, `${path}.endSecond`, r.endSecond, () => true, 'finite');
    if (startOk && endOk && (r.endSecond as number) < (r.startSecond as number)) {
      problems.push(`${path}.endSecond must be >= startSecond (${r.startSecond}), got ${r.endSecond}`);
    }
    num(problems, `${path}.everySeconds`, r.everySeconds, atLeastOneTick, TICK_TEXT);
    if (typeof r.laneCover !== 'boolean') problems.push(`${path}.laneCover must be a boolean, got ${describe(r.laneCover)}`);
    if (!Array.isArray(r.patterns)) {
      problems.push(`${path}.patterns must be an array, got ${describe(r.patterns)}`);
      return;
    }
    r.patterns.forEach((p: unknown, k: number) => {
      if (!(CLOSE_PATTERNS as readonly unknown[]).includes(p)) {
        problems.push(`${path}.patterns[${k}] must be one of ${CLOSE_PATTERNS.join(', ')}, got ${describe(p)}`);
      } else if (p === 'runaway' && kindOk && r.kind !== 'interrupter') {
        problems.push(`${path}.patterns[${k}] runaway is only allowed on interrupter rows`);
      }
    });
    if (kindOk && r.kind === 'fake' && r.patterns.length > 0) problems.push(`${path}.patterns must be empty for fake rows`);
    if (kindOk && r.kind !== 'fake' && r.patterns.length === 0) {
      problems.push(`${path}.patterns must not be empty for ${String(r.kind)} rows`);
    }
  });
}

// ---------------------------------------------------------------------------------------------
// Helpers

/** Copy plain data so callers' objects are never frozen or shared. */
function structuredCloneData<T>(value: T): T {
  if (Array.isArray(value)) return value.map((v) => structuredCloneData(v)) as unknown as T;
  if (isRecord(value)) {
    const out: Loose = {};
    for (const [k, v] of Object.entries(value)) out[k] = structuredCloneData(v);
    return out as T;
  }
  return value;
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
