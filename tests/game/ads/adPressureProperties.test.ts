// Property tests for ad-pressure (design: Correctness Properties 5–7). Whole Runs are played with
// the shared Game_Systems from createGameSystems and the script bots from tests/helpers/bots.ts.
// A dense test-only Chapter_Table (chapters every 2 s, ads every fraction of a second) and short
// Runs keep the file fast while the idle and ad-ignoring policies still pile clutter up to the cap.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { AdControl, Rect } from '../../../src/game/ads/adTypes';
import { clutterCount } from '../../../src/game/ads/openAd';
import { contains } from '../../../src/game/ads/placement';
import { DEFAULT_AD_BALANCE as B, type AdRow } from '../../../src/game/balance/ads';
import { DEFAULT_CHAPTER_TABLE as TABLE, type Chapter, type ChapterTableOverrides } from '../../../src/game/balance/chapters';
import { createRun } from '../../../src/game/state';
import { step } from '../../../src/game/step';
import { createGameSystems, type GameSystemOverrides } from '../../../src/game/systems';
import type { GameEvent, GameState, InputCommand } from '../../../src/game/types';
import { killerBot, type Bot } from '../../helpers/bots';
import { FAST_CORE } from '../../helpers/lane';

// ---------------------------------------------------------------------------------------------
// Dense Chapter_Table (test data only, not tuning)

function adRow(
  kind: AdRow['kind'], everySeconds: number, patterns: AdRow['patterns'], laneCover = false, startSecond = 0,
): AdRow {
  return { kind, startSecond, endSecond: 600, everySeconds, patterns, laneCover };
}

const TRICKY = ['plain', 'decoy', 'hidden', 'swapped'] as const;
const ALL_BUT_RUNAWAY = [...TRICKY, 'countdown', 'confirm'] as const;

/** Start second and ad rows per Chapter; the Hook and Resolution keep their defaults. */
const DENSE: Readonly<Record<string, { readonly start: number; readonly ads: readonly AdRow[] }>> = {
  plotTurn1: { start: 1, ads: [adRow('clutter', 0.5, ['plain'])] },
  pinch1: {
    start: 3,
    ads: [
      adRow('clutter', 0.5, TRICKY),
      adRow('clutter', 0.75, TRICKY, true, 0.25),
      adRow('fake', 1, []),
      adRow('interrupter', 1.5, TRICKY, false, 0.5),
    ],
  },
  midpoint: {
    start: 5,
    ads: [adRow('clutter', 0.5, ALL_BUT_RUNAWAY), adRow('interrupter', 1, ALL_BUT_RUNAWAY), adRow('fake', 0.8, [])],
  },
  pinch2: {
    start: 7,
    ads: [
      adRow('clutter', 0.4, ALL_BUT_RUNAWAY, true),
      adRow('interrupter', 1.2, [...ALL_BUT_RUNAWAY, 'runaway']),
      adRow('fake', 0.8, []),
    ],
  },
  plotTurn2: {
    start: 9,
    ads: [adRow('clutter', 0.3, ALL_BUT_RUNAWAY, true), adRow('fake', 0.7, []), adRow('interrupter', 1.3, ['runaway', 'plain'])],
  },
};

const DENSE_CHAPTERS: ChapterTableOverrides = {
  chapters: TABLE.chapters.map((c): Chapter => {
    const d = DENSE[c.id];
    return d === undefined ? { ...c } : { ...c, startSecond: d.start, ads: [...d.ads] };
  }),
  bossAtPercent: 100,
  bossLatestSecond: 12,
  firstClutterAfterConnectSeconds: 0.5,
};

// ---------------------------------------------------------------------------------------------
// Runs

type Policy = 'idle' | 'killer' | 'clicker';

const CONTROLS: readonly AdControl[] = [
  'close', 'bigClose', 'tinyClose', 'ok', 'cancel', 'noThanks', 'skip', 'confirmYes', 'confirmNo', 'fakeButton', 'body',
];

interface Click {
  readonly tick: number;
  readonly index: number;
  readonly control: AdControl;
}

interface RunSpec {
  readonly seed: number;
  readonly ticks: number;
  readonly policy: Policy;
  /** Clicker only: Ad clicks on the step that produces `tick`. */
  readonly clicks: readonly Click[];
  readonly cap: number;
  readonly laneArea: Rect;
}

/** The download starts 0.5 s after the FAST_CORE connect (2 s). */
const DOWNLOAD_AT_SECOND = 2.5;

/**
 * `idle` only starts the download; `killer` also hammers the lane but never touches an Ad;
 * `clicker` is the killer plus scripted Ad clicks, right or wrong, so closes, mistakes and the
 * extra clutter from mistakes happen too.
 */
function botFor(spec: RunSpec): Bot {
  const killer = killerBot({ downloadAtSecond: DOWNLOAD_AT_SECOND, collectPackets: true });
  if (spec.policy === 'idle') {
    const downloadTick = Math.round(DOWNLOAD_AT_SECOND * 60);
    return (s) => (s.tick + 1 === downloadTick ? [{ type: 'startDownload' }] : []);
  }
  if (spec.policy === 'killer') return killer;
  const byTick = new Map<number, Click[]>();
  for (const c of spec.clicks) byTick.set(c.tick, [...(byTick.get(c.tick) ?? []), c]);
  return (s) => {
    const cmds: InputCommand[] = [...killer(s)];
    const ads = s.ads?.ads ?? [];
    for (const c of byTick.get(s.tick + 1) ?? []) {
      if (ads.length > 0) cmds.push({ type: 'adClick', adId: ads[c.index % ads.length].id, control: c.control });
    }
    return cmds;
  };
}

function overridesFor(spec: RunSpec): GameSystemOverrides {
  // A 2 s Hatch period so hatching (and its Mobs) happens inside these short Runs.
  return {
    ads: { cap: spec.cap, laneArea: spec.laneArea, hatchSeconds: 2, hatchWarningSeconds: 0.5 },
    chapters: DENSE_CHAPTERS,
  };
}

interface Trace {
  /** `states[i]` has tick i; `tickEvents[i]` and `inputs[i]` belong to the step from `states[i]`. */
  readonly states: readonly GameState[];
  readonly inputs: readonly (readonly InputCommand[])[];
  readonly tickEvents: readonly (readonly GameEvent[])[];
}

/** Steps a fresh FAST_CORE Run with fresh Game_Systems; `inputsAt(i, state)` gives step i's inputs. */
function trace(
  spec: RunSpec,
  inputsAt: (i: number, state: GameState) => readonly InputCommand[] | undefined,
): Trace {
  const systems = createGameSystems(overridesFor(spec));
  let state = createRun({ seed: spec.seed, balance: FAST_CORE });
  const states: GameState[] = [state];
  const inputs: (readonly InputCommand[])[] = [];
  const tickEvents: (readonly GameEvent[])[] = [];
  for (let i = 0; i < spec.ticks; i++) {
    const cmds = inputsAt(i, state);
    if (cmds === undefined || state.phase === 'won' || state.phase === 'lost') break;
    const r = step(state, cmds, systems);
    state = r.state;
    states.push(state);
    inputs.push(cmds);
    tickEvents.push(r.events);
  }
  return { states, inputs, tickEvents };
}

const playBot = (spec: RunSpec): Trace => {
  const bot = botFor(spec);
  return trace(spec, (_i, s) => bot(s));
};

const replay = (spec: RunSpec, inputs: Trace['inputs']): Trace => trace(spec, (i) => inputs[i]);

// ---------------------------------------------------------------------------------------------
// Arbitraries

const { clutter } = B.sizes;
const F = B.field;

/** Any integer Lane_Area inside the field that fits a clutter Ad, plus the default one. */
const arbLaneArea: fc.Arbitrary<Rect> = fc.oneof(
  fc.constant(B.laneArea),
  fc.record({
    x: fc.integer({ min: F.x, max: F.x + F.w - clutter.w }),
    y: fc.integer({ min: F.y, max: F.y + F.h - clutter.h }),
  }).chain(({ x, y }) =>
    fc.record({
      x: fc.constant(x),
      y: fc.constant(y),
      w: fc.integer({ min: clutter.w, max: F.x + F.w - x }),
      h: fc.integer({ min: clutter.h, max: F.y + F.h - y }),
    })),
);

const arbRun = (minTicks: number, maxTicks: number): fc.Arbitrary<RunSpec> =>
  fc.integer({ min: minTicks, max: maxTicks }).chain((ticks) =>
    fc.record({
      seed: fc.nat(),
      ticks: fc.constant(ticks),
      policy: fc.constantFrom<Policy>('idle', 'killer', 'clicker'),
      clicks: fc.array(
        fc.record({ tick: fc.integer({ min: 1, max: ticks }), index: fc.nat(20), control: fc.constantFrom(...CONTROLS) }),
        { maxLength: 60 },
      ),
      cap: fc.integer({ min: 1, max: B.cap }),
      laneArea: arbLaneArea,
    }));

const RUNS = 12;
const jsonRoundTrip = <T>(value: T): unknown => JSON.parse(JSON.stringify(value));

// ---------------------------------------------------------------------------------------------
// Properties

describe('ad-pressure properties', () => {
  // Property 5: Req 5.1, 5.2 the Ad_Cap counts clutter only
  // Feature: ad-pressure, Property 5: cap is clutter-only
  // **Validates: Requirements 5.1, 5.2**
  it('Property 5: open clutter never exceeds the cap, and interrupters and fakes are never skipped', () => {
    let openedWhileFull = 0;
    let clutterSkipped = 0;
    fc.assert(
      fc.property(arbRun(500, 800), (spec) => {
        const { states, tickEvents } = playBot(spec);
        tickEvents.forEach((events, i) => {
          const before = states[i].ads;
          const after = states[i + 1].ads;
          if (after !== undefined) expect(clutterCount(after)).toBeLessThanOrEqual(spec.cap);
          for (const e of events) {
            if (e.type === 'adSkipped') {
              expect(e.kind).toBe('clutter');
              clutterSkipped++;
            }
            // Non-vacuity: interrupters and fakes still open on Ticks that start with the cap full.
            if (e.type === 'adOpened' && e.kind !== 'clutter' && before !== undefined && clutterCount(before) >= spec.cap) {
              openedWhileFull++;
            }
          }
        });
      }),
      { numRuns: RUNS },
    );
    expect(clutterSkipped).toBeGreaterThan(0);
    expect(openedWhileFull).toBeGreaterThan(0);
  }, 30_000);

  // Property 6: Req 6.2 Lane_Cover clutter lands inside the Lane_Area
  // Feature: ad-pressure, Property 6: lane cover placement
  // **Validates: Requirements 6.2**
  it('Property 6: every Lane_Cover clutter rect lies inside laneArea on every Tick', () => {
    let laneCoverSeen = 0;
    fc.assert(
      fc.property(arbRun(500, 800), (spec) => {
        const { states } = playBot(spec);
        for (const s of states) {
          for (const ad of s.ads?.ads ?? []) {
            if (!ad.laneCover) continue;
            laneCoverSeen++;
            expect(ad.kind).toBe('clutter');
            expect(contains(spec.laneArea, ad.rect)).toBe(true);
            expect(ad.rect).toMatchObject({ w: clutter.w, h: clutter.h });
          }
        }
      }),
      { numRuns: RUNS },
    );
    expect(laneCoverSeen).toBeGreaterThan(0);
  }, 30_000);

  // Property 7: Req 9.1, 9.2, 9.3 same seed and inputs give the same Run, and it is plain data
  // Feature: ad-pressure, Property 7: determinism
  // **Validates: Requirements 9.1, 9.2, 9.3**
  it('Property 7: two Runs from the same seed and inputs match on every Tick and survive JSON', () => {
    let bandwidthTicks = 0;
    let hatches = 0;
    fc.assert(
      fc.property(arbRun(300, 600), (spec) => {
        const a = playBot(spec);
        const b = replay(spec, a.inputs);
        expect(b.states).toHaveLength(a.states.length);
        for (let i = 0; i < a.states.length; i++) {
          expect(b.states[i]).toStrictEqual(a.states[i]);
          expect(jsonRoundTrip(a.states[i])).toStrictEqual(a.states[i]);
          if (a.states[i].ads !== undefined) {
            expect(typeof a.states[i].bandwidth).toBe('number');
            bandwidthTicks++;
          }
        }
        for (let i = 0; i < a.tickEvents.length; i++) {
          expect(b.tickEvents[i]).toStrictEqual(a.tickEvents[i]);
          expect(jsonRoundTrip(a.tickEvents[i])).toStrictEqual(a.tickEvents[i]);
          hatches += a.tickEvents[i].filter((e) => e.type === 'adHatched').length;
        }
      }),
      { numRuns: 8 },
    );
    expect(bandwidthTicks).toBeGreaterThan(0);
    expect(hatches).toBeGreaterThan(0);
  }, 30_000);
});
