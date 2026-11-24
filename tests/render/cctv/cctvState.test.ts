import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import type { GameEvent } from '../../../src/game/types';
import {
  EMPTY_CCTV,
  applyCctvEvents,
  dropoutActive,
  grainFrame,
  recOn,
  startupActive,
  tearActive,
  type CctvState,
} from '../../../src/render/cctv/cctvState';

const hit = (tick: number): GameEvent =>
  ({ type: 'modemHit', amount: 4, integrity: 50, tick }) as GameEvent;
const spawn = (id: number, tick: number): GameEvent =>
  ({ type: 'mobSpawned', id, kind: 'default', x: 100, source: 'schedule', tick }) as GameEvent;

interface Frame {
  readonly hit: boolean;
  readonly toggle: boolean;
}

/** Hits are frequent enough to stress the flash budget; critical toggles rarely. */
const frames = fc.array(
  fc.record({
    hit: fc.integer({ min: 0, max: 7 }).map((n) => n === 0),
    toggle: fc.integer({ min: 0, max: 199 }).map((n) => n === 0),
  }),
  { minLength: 1, maxLength: 1500 },
);

interface Trace {
  readonly states: CctvState[];
  readonly critical: boolean[];
  readonly onsets: number[];
}

function run(fs: readonly Frame[], startCritical: boolean, start = 0): Trace {
  let s = EMPTY_CCTV;
  let crit = startCritical;
  const states: CctvState[] = [];
  const critical: boolean[] = [];
  const onsets: number[] = [];
  fs.forEach((f, i) => {
    const tick = start + i;
    if (f.toggle) crit = !crit;
    const prev = s.flashTicks;
    s = applyCctvEvents(s, f.hit ? [hit(tick)] : [], tick, crit);
    for (const t of s.flashTicks) if (!prev.includes(t)) onsets.push(t);
    states.push(s);
    critical.push(crit);
  });
  return { states, critical, onsets };
}

describe('cctvState examples', () => {
  it('startup lasts 36 ticks from the first update', () => {
    const s = applyCctvEvents(EMPTY_CCTV, [], 100, false);
    expect(startupActive(s, 100)).toBe(true);
    expect(startupActive(s, 135)).toBe(true);
    expect(startupActive(s, 136)).toBe(false);
  });

  it('REC blinks: on for 30 ticks, off for 30', () => {
    expect(recOn(0)).toBe(true);
    expect(recOn(29)).toBe(true);
    expect(recOn(30)).toBe(false);
    expect(recOn(59)).toBe(false);
    expect(recOn(60)).toBe(true);
  });

  it('a hit during a tear restarts it without a new flash onset', () => {
    let s = applyCctvEvents(EMPTY_CCTV, [], 0, false);
    s = applyCctvEvents(s, [hit(100)], 100, false);
    const onsets = s.flashTicks.length;
    s = applyCctvEvents(s, [hit(105)], 105, false);
    expect(s.flashTicks.length).toBe(onsets);
    expect(tearActive(s, 114)).toBe(true);
    expect(tearActive(s, 115)).toBe(false);
  });
});

describe('cctvState properties', () => {
  // Property 2: Req 8.1, 8.3 at most 3 flashes per second
  it('Property 2: at most 3 flash onsets in any 60-tick window', () => {
    fc.assert(
      fc.property(frames, fc.boolean(), (fs, c0) => {
        const { onsets } = run(fs, c0);
        const sorted = [...onsets].sort((a, b) => a - b);
        for (let i = 0; i + 3 < sorted.length; i++) {
          expect(sorted[i + 3] - sorted[i]).toBeGreaterThanOrEqual(60);
        }
      }),
    );
  });

  // Property 3: Req 5.1, 5.2, 5.4 dropouts are short, spaced and only at critical
  it('Property 3: dropouts last <= 9 ticks, start >= 120 apart, only at critical', () => {
    fc.assert(
      fc.property(frames, fc.boolean(), (fs, c0) => {
        const { states, critical } = run(fs, c0);
        let runLen = 0;
        let lastStart: number | null = null;
        states.forEach((s, tick) => {
          const on = dropoutActive(s, tick);
          if (!critical[tick] || startupActive(s, tick)) expect(on).toBe(false);
          if (on) {
            if (runLen === 0) {
              if (lastStart !== null) expect(tick - lastStart).toBeGreaterThanOrEqual(120);
              lastStart = tick;
            }
            runLen++;
            expect(runLen).toBeLessThanOrEqual(9);
          } else {
            runLen = 0;
          }
        });
      }),
    );
  });

  // Property 4: Req 4.1, 4.3 tears follow modem hits
  it('Property 4: tear shows exactly within 10 ticks of the latest hit', () => {
    fc.assert(
      fc.property(frames, (fs) => {
        const { states } = run(fs, false);
        let lastHit: number | null = null;
        states.forEach((s, tick) => {
          if (fs[tick].hit) lastHit = tick;
          const expected = lastHit !== null && tick < lastHit + 10;
          expect(tearActive(s, tick)).toBe(expected);
        });
      }),
    );
  });

  // Property 5: Req 6.1, 6.2 motion boxes live 60 ticks and follow their Mob
  it('Property 5: a box exists only for live mobs within 60 ticks of spawn', () => {
    const steps = fc.array(
      fc.record({
        spawn: fc.integer({ min: 0, max: 9 }).map((n) => n === 0),
        kill: fc.option(fc.nat(), { nil: null, freq: 8 }),
      }),
      { minLength: 1, maxLength: 600 },
    );
    fc.assert(
      fc.property(steps, (ss) => {
        let s = EMPTY_CCTV;
        let nextId = 1;
        const live = new Map<number, number>(); // id -> spawn tick
        ss.forEach((step, tick) => {
          if (step.kill !== null && live.size > 0) {
            const ids = [...live.keys()];
            live.delete(ids[step.kill % ids.length]);
          }
          const events: GameEvent[] = [];
          if (step.spawn) {
            live.set(nextId, tick);
            events.push(spawn(nextId, tick));
            nextId++;
          }
          s = applyCctvEvents(s, events, tick, false, [...live.keys()]);
          const boxed = new Set(s.motionBoxes.map((b) => b.id));
          for (let id = 1; id < nextId; id++) {
            const at = live.get(id);
            const expected = at !== undefined && tick >= at && tick < at + 60;
            expect(boxed.has(id)).toBe(expected);
          }
        });
      }),
    );
  });

  // Property 6: Req 1.2 grain moves at least 15 times per second
  it('Property 6: grain changes every 4 ticks and holds within a step', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 100_000 }), (n) => {
        const a = grainFrame(4 * n);
        expect(grainFrame(4 * n + 4)).not.toEqual(a);
        for (let k = 1; k < 4; k++) expect(grainFrame(4 * n + k)).toEqual(a);
      }),
    );
  });
});
