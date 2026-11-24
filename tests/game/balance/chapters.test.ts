// Chapter_Table defaults and validation (cross-front-and-director Req 1, ad-pressure Req 4.2).
import { describe, expect, it } from 'vitest';
import {
  CHAPTER_IDS,
  ChapterTableError,
  DEFAULT_CHAPTER_TABLE,
  HATCH_KINDS,
  resolveChapterTable,
  type Chapter,
} from '../../../src/game/balance/chapters';

/** The default chapters with one field of one chapter replaced, possibly by a wrong value. */
function chaptersWith(index: number, patch: Record<string, unknown>): readonly Chapter[] {
  return DEFAULT_CHAPTER_TABLE.chapters.map((c, i) => (i === index ? ({ ...c, ...patch } as unknown as Chapter) : c));
}

function problemsOf(chapters: readonly Chapter[]): readonly string[] {
  try {
    resolveChapterTable({ chapters });
  } catch (e) {
    expect(e).toBeInstanceOf(ChapterTableError);
    return (e as ChapterTableError).problems;
  }
  throw new Error('expected resolveChapterTable to throw');
}

describe('DEFAULT_CHAPTER_TABLE', () => {
  it('lists the seven chapters in order', () => {
    expect(DEFAULT_CHAPTER_TABLE.chapters.map((c) => c.id)).toEqual(CHAPTER_IDS);
  });

  it('hatches nothing in Hook and Resolution, default zombies until Pinch 1, fast from Midpoint (ad-pressure Req 4.2)', () => {
    const byId = Object.fromEntries(DEFAULT_CHAPTER_TABLE.chapters.map((c) => [c.id, c.hatchKind]));
    expect(byId).toEqual({
      hook: null,
      plotTurn1: 'default',
      pinch1: 'default',
      midpoint: 'fast',
      pinch2: 'fast',
      plotTurn2: 'fast',
      resolution: null,
    });
  });

  it('puts clutter over the lane from Pinch 1 on (ad-pressure Req 6.3)', () => {
    const laneRows = Object.fromEntries(
      DEFAULT_CHAPTER_TABLE.chapters.map((c) => [c.id, c.ads.filter((r) => r.laneCover)]),
    );
    expect(laneRows.pinch1).toEqual([
      {
        kind: 'clutter', everySeconds: 16, endSecond: 35, startSecond: 4, laneCover: true,
        patterns: ['plain', 'decoy', 'hidden', 'swapped'],
      },
    ]);
    // Midpoint gains a Lane_Cover row (pacing-and-economy Req 2.2); Pinch 2 and Plot turn 2 keep theirs.
    expect(laneRows.midpoint?.map((r) => [r.kind, r.everySeconds])).toEqual([['clutter', 14]]);
    expect(laneRows.pinch2?.map((r) => [r.kind, r.everySeconds])).toEqual([['clutter', 6]]);
    expect(laneRows.plotTurn2?.map((r) => [r.kind, r.everySeconds])).toEqual([['clutter', 3.5]]);
    for (const id of ['hook', 'plotTurn1', 'resolution']) expect(laneRows[id]).toEqual([]);
  });

  it('starts the chapters at 0, 20, 55, 90, 115 and 145 s (pacing-and-economy Req 1.2)', () => {
    expect(DEFAULT_CHAPTER_TABLE.chapters.map((c) => c.startSecond)).toEqual([0, 20, 55, 90, 115, 145, -1]);
  });

  it('ramps the waves chapter by chapter (pacing-and-economy Req 2.1)', () => {
    const waves = Object.fromEntries(
      DEFAULT_CHAPTER_TABLE.chapters.map((c) => [c.id, c.waves.map((w) => [w.kind, w.everySeconds, w.offsetSeconds])]),
    );
    expect(waves).toEqual({
      hook: [['default', 10, 8]],
      plotTurn1: [['default', 9, 0]],
      pinch1: [['default', 8, 0], ['fast', 10, 4]],
      midpoint: [['default', 7, 0], ['fast', 9, 0], ['tank', 15, 3]],
      pinch2: [['default', 5, 0], ['fast', 7, 0], ['tank', 12, 0], ['ranged', 16, 2]],
      // Tuned in docs/balance/2026-11-24-late-income.md.
      plotTurn2: [['default', 2.5, 0], ['fast', 8, 0], ['tank', 16, 0], ['ranged', 20, 0]],
      resolution: [],
    });
  });

  it('uses the ad rows from pacing-and-economy Req 2.2', () => {
    const tricky = ['plain', 'decoy', 'hidden', 'swapped'];
    const allButRunaway = [...tricky, 'countdown', 'confirm'];
    const all = [...allButRunaway, 'runaway'];
    const rows = Object.fromEntries(
      DEFAULT_CHAPTER_TABLE.chapters.map((c) => [
        c.id,
        c.ads.map((r) => [r.kind, r.everySeconds, r.startSecond, r.endSecond, r.laneCover, r.patterns]),
      ]),
    );
    expect(rows).toEqual({
      hook: [],
      plotTurn1: [['clutter', 9, 13, 35, false, ['plain']]],
      pinch1: [
        ['clutter', 8, 0, 35, false, tricky],
        ['fake', 12, 5, 35, false, []],
        ['interrupter', 18, 10, 35, false, tricky],
        ['clutter', 16, 4, 35, true, tricky],
      ],
      midpoint: [
        ['clutter', 7, 0, 25, false, allButRunaway],
        ['interrupter', 18, 0, 25, false, allButRunaway],
        ['fake', 12, 0, 25, false, []],
        ['clutter', 14, 3, 25, true, allButRunaway],
      ],
      pinch2: [
        ['clutter', 6, 0, 30, true, allButRunaway],
        ['interrupter', 15, 0, 30, false, all],
        ['fake', 10, 0, 30, false, []],
      ],
      plotTurn2: [
        ['clutter', 3.5, 0, 90, true, allButRunaway],
        ['fake', 8, 0, 90, false, []],
      ],
      resolution: [],
    });
  });

  it('keeps the beat rules (pacing-and-economy Req 2.3)', () => {
    expect(DEFAULT_CHAPTER_TABLE.firstClutterAfterConnectSeconds).toBe(5);
    expect(DEFAULT_CHAPTER_TABLE.calmSeconds).toBe(2);
    expect(DEFAULT_CHAPTER_TABLE.clusterCount).toBe(4);
    expect(DEFAULT_CHAPTER_TABLE.lastInterrupterAt).toBe(90);
  });

  it('is what resolveChapterTable returns with no overrides', () => {
    expect(resolveChapterTable()).toEqual(DEFAULT_CHAPTER_TABLE);
    expect(resolveChapterTable({})).toEqual(DEFAULT_CHAPTER_TABLE);
  });

  // Tuned from 65% in docs/balance/2026-11-24-boss-threat.md.
  it('raises the boss at 75% with a 200 s fallback (pacing-and-economy Req 3.1)', () => {
    expect(DEFAULT_CHAPTER_TABLE.bossAtPercent).toBe(75);
    expect(DEFAULT_CHAPTER_TABLE.bossLatestSecond).toBe(200);
    expect('bossSecond' in DEFAULT_CHAPTER_TABLE).toBe(false);
  });
});

describe('resolveChapterTable: Boss_Trigger (pacing-and-economy Req 3.1)', () => {
  it('accepts the range ends and merges the keys one by one', () => {
    expect(resolveChapterTable({ bossAtPercent: 0 }).bossAtPercent).toBe(0);
    const t = resolveChapterTable({ bossAtPercent: 100, bossLatestSecond: 0 });
    expect(t.bossAtPercent).toBe(100);
    expect(t.bossLatestSecond).toBe(0);
    expect(resolveChapterTable({ bossLatestSecond: 30 }).bossAtPercent).toBe(75);
  });

  it('no longer ties the boss to the Plot turn 2 start', () => {
    expect(resolveChapterTable({ bossLatestSecond: 10 }).bossLatestSecond).toBe(10);
  });

  it('lists every out-of-range Boss_Trigger value', () => {
    let problems: readonly string[] = [];
    try {
      resolveChapterTable({ bossAtPercent: 100.5, bossLatestSecond: -1 });
    } catch (e) {
      expect(e).toBeInstanceOf(ChapterTableError);
      problems = (e as ChapterTableError).problems;
    }
    expect(problems).toEqual([
      'bossAtPercent must be in [0, 100], got 100.5',
      'bossLatestSecond must be >= 0, got -1',
    ]);
    expect(() => resolveChapterTable({ bossAtPercent: Number.NaN })).toThrow(
      'bossAtPercent must be a finite number, got NaN',
    );
  });
});

describe('resolveChapterTable: hatchKind (ad-pressure Req 4.2)', () => {
  it.each([...HATCH_KINDS, null])('accepts hatchKind %s', (hatchKind) => {
    const table = resolveChapterTable({ chapters: chaptersWith(2, { hatchKind }) });
    expect(table.chapters[2]?.hatchKind).toBe(hatchKind);
  });

  it('allows tank hatches, which the defaults leave unused', () => {
    expect(HATCH_KINDS).toEqual(['default', 'fast', 'tank']);
  });

  it.each([
    ['ranged', '"ranged"'],
    ['boss', '"boss"'],
    ['glob', '"glob"'],
    [undefined, 'undefined'],
    [0, '0'],
  ])('rejects hatchKind %s', (hatchKind, shown) => {
    expect(problemsOf(chaptersWith(3, { hatchKind }))).toEqual([
      `chapters[3].hatchKind must be one of default, fast, tank or null, got ${shown}`,
    ]);
  });

  it('lists every bad hatchKind alongside other problems', () => {
    const chapters = chaptersWith(0, { hatchKind: 'boss' }).map((c, i) =>
      i === 6 ? ({ ...c, hatchKind: 'ranged', name: '' } as unknown as Chapter) : c,
    );
    expect(problemsOf(chapters)).toEqual([
      'chapters[0].hatchKind must be one of default, fast, tank or null, got "boss"',
      'chapters[6].name must be a non-empty string, got ""',
      'chapters[6].hatchKind must be one of default, fast, tank or null, got "ranged"',
    ]);
  });
});
