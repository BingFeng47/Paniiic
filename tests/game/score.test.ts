// Property 3 (leaderboard design: Correctness Properties) and unit checks of each score line
// against SCORE_TABLE (leaderboard Req 3.1–3.4).
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { SCORE_TABLE as T, SCORE_VERSION } from '../../src/game/balance/score';
import { scoreRun, type ScoreLine } from '../../src/game/score';
import { TICK_RATE, type Phase } from '../../src/game/types';
import { finalState } from '../helpers/score';

const points = (lines: readonly ScoreLine[], id: ScoreLine['id']) => lines.find((l) => l.id === id)?.points;

const arbFinal = (phase?: 'won' | 'lost') =>
  fc.record({
    phase: phase === undefined ? fc.constantFrom<Phase>('won', 'lost') : fc.constant<Phase>(phase),
    download: fc.double({ min: 0, max: 100, noNaN: true }),
    integrity: fc.double({ min: 0, max: 100, noNaN: true }),
    tick: fc.nat(400 * TICK_RATE),
    stats: fc.record({ kills: fc.nat(500), bossKilled: fc.boolean(), adsClosed: fc.nat(200) }),
    bestCombo: fc.nat(60),
  });

describe('Property 3: score bounds', () => {
  /** **Validates: Requirements 3.1, 3.2, 3.3, 3.4** */
  // Property: Req 3.4 the score is a whole number >= 0, and the total is the sum of the lines
  it('is a whole number >= 0 for any finished run', () => {
    fc.assert(
      fc.property(arbFinal(), (spec) => {
        const s = scoreRun(finalState(spec));
        expect(Number.isInteger(s.total)).toBe(true);
        expect(s.total).toBeGreaterThanOrEqual(0);
        for (const line of s.lines) {
          expect(Number.isInteger(line.points)).toBe(true);
          expect(line.points).toBeGreaterThanOrEqual(0);
        }
        expect(s.total).toBe(s.lines.reduce((a, l) => a + l.points, 0));
        expect(s.version).toBe(SCORE_VERSION);
      }),
      { numRuns: 200 },
    );
  });

  // Property: Req 3.1 the score never drops when download, kills, ads or best combo grow
  it('is monotonic in download, kills, ads and combo', () => {
    fc.assert(
      fc.property(
        arbFinal(),
        fc.double({ min: 0, max: 100, noNaN: true }),
        fc.nat(100),
        fc.nat(100),
        fc.nat(30),
        (spec, dDownload, dKills, dAds, dCombo) => {
          const before = scoreRun(finalState(spec)).total;
          const more = (patch: Partial<typeof spec>) => scoreRun(finalState({ ...spec, ...patch })).total;
          expect(more({ download: Math.min(100, spec.download + dDownload) })).toBeGreaterThanOrEqual(before);
          expect(more({ stats: { ...spec.stats, kills: spec.stats.kills + dKills } })).toBeGreaterThanOrEqual(before);
          expect(more({ stats: { ...spec.stats, adsClosed: spec.stats.adsClosed + dAds } })).toBeGreaterThanOrEqual(before);
          expect(more({ bestCombo: spec.bestCombo + dCombo })).toBeGreaterThanOrEqual(before);
        },
      ),
      { numRuns: 200 },
    );
  });

  // Property: Req 3.4 a won Final_State scores more than the same state marked lost
  it('scores a win above the same state marked lost', () => {
    fc.assert(
      fc.property(arbFinal(), (spec) => {
        const won = scoreRun(finalState({ ...spec, phase: 'won' })).total;
        const lost = scoreRun(finalState({ ...spec, phase: 'lost' })).total;
        expect(won).toBeGreaterThan(lost);
      }),
      { numRuns: 200 },
    );
  });

  // Property: Req 3.3 scoreRun throws unless the run is won or lost
  it('throws for every non-terminal phase', () => {
    fc.assert(
      fc.property(arbFinal(), fc.constantFrom<Phase>('dialing', 'connected', 'downloading'), (spec, phase) => {
        expect(() => scoreRun(finalState({ ...spec, phase }))).toThrow();
      }),
      { numRuns: 50 },
    );
  });
});

describe('scoreRun lines (Req 3.1, 3.2)', () => {
  it('lists every lost-run line in order, zeros included, and no win lines', () => {
    const s = scoreRun(finalState({ phase: 'lost' }));
    expect(s.lines).toEqual([
      { id: 'download', points: 0 },
      { id: 'kills', points: 0 },
      { id: 'boss', points: 0 },
      { id: 'ads', points: 0 },
      { id: 'combo', points: 0 },
    ]);
    expect(s.total).toBe(0);
  });

  it('scores each part from SCORE_TABLE', () => {
    const s = scoreRun(finalState({
      phase: 'lost',
      download: 57.9,
      stats: { kills: 13, bossKilled: true, adsClosed: 7 },
      bestCombo: 4,
    }));
    expect(points(s.lines, 'download')).toBe(57 * T.perPercent);
    expect(points(s.lines, 'kills')).toBe(13 * T.perKill);
    expect(points(s.lines, 'boss')).toBe(T.boss);
    expect(points(s.lines, 'ads')).toBe(7 * T.perAd);
    expect(points(s.lines, 'combo')).toBe(4 * T.perCombo);
    expect(s.total).toBe(570 + 130 + 200 + 140 + 100);
  });

  it('pays the combo only from comboMin', () => {
    const combo = (bestCombo: number) => points(scoreRun(finalState({ bestCombo })).lines, 'combo');
    expect(combo(T.comboMin - 1)).toBe(0);
    expect(combo(T.comboMin)).toBe(T.comboMin * T.perCombo);
  });

  it('adds the win, integrity (rounded up) and speed lines for a win', () => {
    const s = scoreRun(finalState({ phase: 'won', download: 100, integrity: 42.1, tick: 180 * TICK_RATE + 59 }));
    expect(s.lines.map((l) => l.id)).toEqual(['download', 'kills', 'boss', 'ads', 'combo', 'win', 'integrity', 'speed']);
    expect(points(s.lines, 'download')).toBe(1000);
    expect(points(s.lines, 'win')).toBe(T.winBase);
    expect(points(s.lines, 'integrity')).toBe(43 * T.perIntegrity);
    // speed = 5 × max(0, 240 − floor(tick / TICK_RATE)); 180.98 s counts as 180.
    expect(points(s.lines, 'speed')).toBe(T.perSecondUnder * (T.parSeconds - 180));
  });

  it('gives no speed points at or past the par time', () => {
    const speed = (seconds: number) =>
      points(scoreRun(finalState({ phase: 'won', tick: seconds * TICK_RATE })).lines, 'speed');
    expect(speed(T.parSeconds)).toBe(0);
    expect(speed(T.parSeconds + 100)).toBe(0);
    expect(speed(T.parSeconds - 1)).toBe(T.perSecondUnder);
  });

  it('counts missing stats and economy as zeros', () => {
    const s = scoreRun(finalState({ phase: 'lost', download: 10, stats: null, bestCombo: null }));
    expect(s.total).toBe(10 * T.perPercent);
    expect(points(s.lines, 'kills')).toBe(0);
    expect(points(s.lines, 'combo')).toBe(0);
  });
});
