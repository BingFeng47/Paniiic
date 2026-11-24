// Result script tests (title-and-endings design, "src/ui/resultScript.ts"; Req 8.2, 8.5, 8.6,
// 9.2, 9.3, 10.2, 10.3). Properties 12 and 13 plus the design's examples. The copy-table scan for
// RESULT_COPY lives in tests/copy.test.ts.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { TICK_MS } from '../../src/core/fixedLoop';
import { createRun } from '../../src/game/state';
import { TICK_RATE, type GameState, type Phase } from '../../src/game/types';
import { integrityView } from '../../src/ui/laneHud';
import { RESULT_COPY } from '../../src/ui/resultCopy';
import {
  RESULT_SCRIPT,
  formatRunTime,
  resultModel,
  resultStageAt,
  type Outcome,
} from '../../src/ui/resultScript';
import { arbLaneRun, runLane } from '../helpers/lane';

const PHASES: readonly Phase[] = ['dialing', 'connected', 'downloading', 'won', 'lost'];
const OUTCOMES: readonly Outcome[] = ['won', 'lost'];

/** The fields Property 12 randomizes on top of a real Run's final state. */
interface Overrides {
  readonly phase: Phase;
  readonly tick: number;
  readonly integrity: number;
  readonly download: number;
}

/** `final` with the given phase, tick, integrity and download. */
function withOverrides(final: GameState, o: Overrides): GameState {
  return { ...final, phase: o.phase, tick: o.tick, integrity: o.integrity, download: o.download };
}

/** Integrity in 0..max with extra weight on both ends and on whole numbers. */
const arbIntegrity = (max: number): fc.Arbitrary<number> =>
  fc.oneof(
    { weight: 1, arbitrary: fc.constant(0) },
    { weight: 1, arbitrary: fc.constant(max) },
    { weight: 2, arbitrary: fc.integer({ min: 0, max: Math.floor(max) }) },
    { weight: 4, arbitrary: fc.double({ min: 0, max, noNaN: true, noDefaultInfinity: true }) },
  );

/** Download in 0..100 with extra weight on both ends, whole numbers and values just below them. */
const arbDownload: fc.Arbitrary<number> = fc.oneof(
  { weight: 1, arbitrary: fc.constantFrom(0, 100, 99.999, 49.5) },
  { weight: 2, arbitrary: fc.integer({ min: 0, max: 100 }) },
  { weight: 4, arbitrary: fc.double({ min: 0, max: 100, noNaN: true, noDefaultInfinity: true }) },
);

/** Ticks up to about 10 minutes, with minute and second boundaries common. */
const arbTick: fc.Arbitrary<number> = fc.oneof(
  { weight: 1, arbitrary: fc.constantFrom(0, 59, 60, 61, 3599, 3600, 9060) },
  { weight: 4, arbitrary: fc.integer({ min: 0, max: 36_000 }) },
);

const arbOverrides = (max: number): fc.Arbitrary<Overrides> =>
  fc.record({
    phase: fc.constantFrom(...PHASES),
    tick: arbTick,
    integrity: arbIntegrity(max),
    download: arbDownload,
  });

/** A real Run's final state, plus two override sets that share a phase. */
const arbFinalCase = arbLaneRun(300).chain((spec) => {
  const { final } = runLane(spec);
  const max = final.balance.maxIntegrity;
  return fc
    .tuple(arbOverrides(max), arbOverrides(max))
    .map(([a, b]) => ({ final, a, b: { ...b, phase: a.phase } }));
});

describe('RESULT_SCRIPT', () => {
  it('reveals the win at 1,200 ms and the loss at 1,500 ms (Req 9.3, 10.3)', () => {
    expect(RESULT_SCRIPT).toEqual({ won: { revealMs: 1200 }, lost: { revealMs: 1500 } });
    expect(Object.isFrozen(RESULT_SCRIPT)).toBe(true);
    expect(Object.isFrozen(RESULT_SCRIPT.won)).toBe(true);
    expect(Object.isFrozen(RESULT_SCRIPT.lost)).toBe(true);
  });
});

describe('formatRunTime', () => {
  it('formats ticks as m:ss', () => {
    expect(formatRunTime(0)).toBe('0:00');
    expect(formatRunTime(9060)).toBe('2:31');
    expect(formatRunTime(-5)).toBe('0:00');
  });
});

describe('resultModel', () => {
  it('is null for a downloading state', () => {
    expect(resultModel({ ...createRun({ seed: 1 }), phase: 'downloading' })).toBeNull();
  });

  // Property: Req 8.2, 8.6 the outcome comes only from the final phase, and the statistics are
  // the run time as m:ss, the HUD's integrity percentage and the floored download percentage
  // Feature: title-and-endings, Property 12: The result screen reads its outcome and statistics from the final state
  it('Property 12: outcome and statistics follow the final state', () => {
    fc.assert(
      fc.property(arbFinalCase, ({ final, a, b }) => {
        const stateA = withOverrides(final, a);
        const model = resultModel(stateA);

        if (a.phase !== 'won' && a.phase !== 'lost') {
          expect(model).toBeNull();
          expect(resultModel(withOverrides(final, b))).toBeNull();
          return;
        }

        expect(model).not.toBeNull();
        expect(model!.outcome).toBe(a.phase);
        // Changing every other field keeps the outcome.
        expect(resultModel(withOverrides(final, b))!.outcome).toBe(a.phase);

        const match = /^(\d+):(\d{2})$/.exec(model!.timeText);
        expect(match).not.toBeNull();
        const minutes = Number(match![1]);
        const seconds = Number(match![2]);
        expect(seconds).toBeLessThan(60);
        expect(minutes * 60 + seconds).toBe(Math.floor(a.tick / TICK_RATE));

        expect(model!.integrityText).toBe(integrityView(stateA).percentText);

        expect(Number.isInteger(model!.downloadPercent)).toBe(true);
        expect(model!.downloadPercent).toBeGreaterThanOrEqual(0);
        expect(model!.downloadPercent).toBeLessThanOrEqual(100);
        expect(model!.downloadPercent).toBe(Math.floor(a.download));
        expect(model!.downloadText).toBe(`${model!.downloadPercent}${RESULT_COPY.percentSuffix}`);
      }),
      { numRuns: 60 },
    );
  });
});

describe('resultStageAt', () => {
  // Property: Req 8.5, 9.2, 10.2 counted in ticks, the ending stays in the intro until its
  // script time, then reveals and never goes back
  // Feature: title-and-endings, Property 13: The ending reveals once, at its script time, and never goes back
  it('Property 13: intro until the reveal time, then reveal only', () => {
    const arbCounts = fc
      .array(fc.integer({ min: 0, max: 200 }), { minLength: 1, maxLength: 60 })
      .map((counts) => [...counts].sort((x, y) => x - y));

    fc.assert(
      fc.property(fc.constantFrom(...OUTCOMES), arbCounts, (outcome, counts) => {
        const stages = counts.map((t) => resultStageAt(outcome, t * TICK_MS));
        const firstReveal = stages.indexOf('reveal');

        if (firstReveal === -1) {
          expect(stages.every((s) => s === 'intro')).toBe(true);
        } else {
          expect(stages.slice(0, firstReveal).every((s) => s === 'intro')).toBe(true);
          expect(stages.slice(firstReveal).every((s) => s === 'reveal')).toBe(true);
        }

        const expectedFirst = counts.findIndex(
          (t) => t * TICK_MS >= RESULT_SCRIPT[outcome].revealMs,
        );
        expect(firstReveal).toBe(expectedFirst);
      }),
      { numRuns: 300 },
    );
  });
});
