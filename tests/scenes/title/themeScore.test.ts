import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  THEME_SCORE,
  midiHz,
  passSeconds,
  passTicks,
  passesBetween,
  themeSchedule,
} from '../../../src/scenes/title/themeScore';

const EPS = 1e-9;
const SEC_PER_BEAT = 60 / THEME_SCORE.bpm;

/** Frame tick counts starting at 0 with non-decreasing steps: idle frames, single ticks, catch-up bursts. */
const frameTicks = fc
  .array(
    fc.oneof(
      fc.constant(0),
      fc.integer({ min: 1, max: 5 }),
      fc.integer({ min: 0, max: 3000 }),
    ),
    { maxLength: 80 },
  )
  .map((steps) => {
    const ticks = [0];
    for (const step of steps) ticks.push(ticks[ticks.length - 1] + step);
    return ticks;
  });

/** Pass lengths: tiny ones (many passes per frame), mid-size ones and the real 1,440-tick pass. */
const passLength = fc.oneof(
  fc.integer({ min: 1, max: 10 }),
  fc.integer({ min: 11, max: 2000 }),
  fc.constant(passTicks(THEME_SCORE)),
);

/** Durations in (0, 120] s: arbitrary doubles plus the pass length and exact beat boundaries. */
const duration = fc.oneof(
  fc.double({ min: 0, max: 120, minExcluded: true, noNaN: true }),
  fc.constant(passSeconds(THEME_SCORE)),
  fc.integer({ min: 1, max: 160 }).map((beat) => beat * SEC_PER_BEAT),
);

describe('THEME_SCORE', () => {
  it('lasts 24 s, 1,440 ticks, inside the 16–32 s range (Req 3.3)', () => {
    expect(passSeconds(THEME_SCORE)).toBe(24);
    expect(passTicks(THEME_SCORE)).toBe(1440);
    expect(passSeconds(THEME_SCORE)).toBeGreaterThanOrEqual(16);
    expect(passSeconds(THEME_SCORE)).toBeLessThanOrEqual(32);
  });

  it('holds 85 notes, each inside the 32-beat pass with a positive length', () => {
    expect(THEME_SCORE.passBeats).toBe(32);
    expect(THEME_SCORE.notes).toHaveLength(85);
    for (const n of THEME_SCORE.notes) {
      expect(n.beats).toBeGreaterThan(0);
      expect(n.beat).toBeGreaterThanOrEqual(0);
      expect(n.beat + n.beats).toBeLessThanOrEqual(THEME_SCORE.passBeats);
    }
  });

  it('tunes MIDI 69 to 440 Hz', () => {
    expect(midiHz(69)).toBe(440);
  });

  it('schedules nothing for non-positive or non-finite durations', () => {
    for (const d of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(themeSchedule(THEME_SCORE, d)).toEqual([]);
    }
  });
});

describe('passesBetween', () => {
  it('starts pass 1 on the frame that reaches the 1,440th tick', () => {
    expect(passesBetween(1439, 1440, 1440)).toEqual([1]);
    expect(passesBetween(1440, 1441, 1440)).toEqual([]);
  });

  it('starts every pass once, on the first frame that reaches its boundary', () => {
    // Property: Req 3.2 the next theme pass starts when the current one ends, in ticks
    // Feature: title-and-endings, Property 3: Every theme pass starts once, at its boundary
    fc.assert(
      fc.property(passLength, frameTicks, (p, ticks) => {
        const started: number[] = [];
        const frameOf = new Map<number, number>();
        for (let i = 1; i < ticks.length; i++) {
          for (const k of passesBetween(ticks[i - 1], ticks[i], p)) {
            started.push(k);
            frameOf.set(k, i);
          }
        }
        const last = ticks[ticks.length - 1];
        const expected = Array.from({ length: Math.floor(last / p) }, (_, j) => j + 1);
        expect(started).toEqual(expected);
        for (const j of expected) {
          const firstFrame = ticks.findIndex((t) => t >= j * p);
          expect(frameOf.get(j)).toBe(firstFrame);
        }
      }),
      { numRuns: 200 },
    );
  });
});

describe('themeSchedule', () => {
  it('keeps every note inside the played duration', () => {
    // Property: Req 3.4 every scheduled note starts and ends inside the played duration
    // Feature: title-and-endings, Property 4: The theme schedule stays inside its duration
    fc.assert(
      fc.property(duration, (d) => {
        const schedule = themeSchedule(THEME_SCORE, d);
        for (const n of schedule) {
          expect(n.start).toBeGreaterThanOrEqual(0);
          expect(n.start).toBeLessThan(n.end);
          expect(n.end).toBeLessThanOrEqual(d);
          expect(Number.isFinite(n.hz)).toBe(true);
          expect(n.hz).toBeGreaterThan(0);
        }
        if (d >= passSeconds(THEME_SCORE)) {
          expect(schedule).toHaveLength(THEME_SCORE.notes.length);
          THEME_SCORE.notes.forEach((note, i) => {
            const got = schedule[i];
            expect(got.instrument).toBe(note.instrument);
            expect(got.hz).toBe(midiHz(note.midi));
            expect(Math.abs(got.start - (note.beat * 60) / THEME_SCORE.bpm)).toBeLessThan(EPS);
            expect(
              Math.abs(got.end - ((note.beat + note.beats) * 60) / THEME_SCORE.bpm),
            ).toBeLessThan(EPS);
          });
        }
      }),
      { numRuns: 200 },
    );
  });
});
