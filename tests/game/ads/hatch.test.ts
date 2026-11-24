// Hatching (ad-pressure Req 4, design "Hatching" and Correctness Property 4): `hatchView` and
// `hatchesNow` from src/game/ads/hatch.ts, the Director's hatch path in directorAds, and the
// hatch cadence over whole Runs played with the shared Game_Systems.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { Ad, AdKind } from '../../../src/game/ads/adTypes';
import { hatchesNow, hatchView } from '../../../src/game/ads/hatch';
import { DEFAULT_AD_BALANCE as B, resolveAdBalance, type AdBalance } from '../../../src/game/balance/ads';
import {
  DEFAULT_CHAPTER_TABLE as TABLE,
  type Chapter,
  type ChapterId,
  type HatchKind,
} from '../../../src/game/balance/chapters';
import { secondsToTicks } from '../../../src/game/balance/lane';
import { createTickContext } from '../../../src/game/context';
import { createDirectorAds } from '../../../src/game/director/directorAds';
import { initialDirectorState } from '../../../src/game/director/directorLane';
import { createRun } from '../../../src/game/state';
import { step } from '../../../src/game/step';
import { createGameSystems, type GameSystemOverrides } from '../../../src/game/systems';
import type { GameEvent, GameState, InputCommand, MutableGameState } from '../../../src/game/types';
import { killerBot, type Bot } from '../../helpers/bots';
import { FAST_CORE, laneWith } from '../../helpers/lane';

/** Default Hatch period in Ticks (10 s). */
const P = secondsToTicks(B.hatchSeconds);
/** Default Hatch_Warning in Ticks (3 s). */
const W = secondsToTicks(B.hatchWarningSeconds);

/** A small Ad for unit tests; `openTick` is the only timing field the hatch rules read. */
function adAt(id: number, openTick: number, kind: AdKind = 'clutter'): Ad {
  return {
    id, kind, pattern: kind === 'fake' ? null : 'plain', rect: { x: 40, y: 40, w: 240, h: 160 },
    openTick, copy: 0, laneCover: false, stage: 'main', corner: null,
    closeAt: kind === 'interrupter' ? { x: 220, y: 4 } : null, jumps: 0,
  };
}

// ---------------------------------------------------------------------------------------------
// hatchView / hatchesNow

describe('hatchView (Req 4.7)', () => {
  it('is null for interrupters and fake buttons', () => {
    expect(hatchView(adAt(1, 0, 'interrupter'), P, B)).toBeNull();
    expect(hatchView(adAt(1, 0, 'fake'), P, B)).toBeNull();
  });

  it('counts down the seconds to the next Hatch', () => {
    const ad = adAt(1, 500);
    expect(hatchView(ad, 500, B)?.secondsLeft).toBe(B.hatchSeconds); // at open
    expect(hatchView(ad, 500 + P - 1, B)?.secondsLeft).toBeCloseTo(1 / 60, 12); // just before
    expect(hatchView(ad, 500 + P, B)?.secondsLeft).toBe(B.hatchSeconds); // on the Hatch Tick
    expect(hatchView(ad, 500 + P + 1, B)?.secondsLeft).toBeCloseTo((P - 1) / 60, 12); // just after
  });

  it('turns the Hatch_Warning on for the last hatchWarningSeconds of each period', () => {
    const ad = adAt(1, 0);
    expect(hatchView(ad, 0, B)?.warning).toBe(false);
    expect(hatchView(ad, P - W - 1, B)?.warning).toBe(false);
    expect(hatchView(ad, P - W, B)?.warning).toBe(true);
    expect(hatchView(ad, P - 1, B)?.warning).toBe(true);
    expect(hatchView(ad, P, B)?.warning).toBe(false);
    expect(hatchView(ad, 2 * P - W - 1, B)?.warning).toBe(false);
    expect(hatchView(ad, 2 * P - W, B)?.warning).toBe(true);
  });

  it('never warns with hatchWarningSeconds 0 and always warns with it equal to hatchSeconds', () => {
    const none = resolveAdBalance({ hatchWarningSeconds: 0 });
    const always = resolveAdBalance({ hatchWarningSeconds: B.hatchSeconds });
    const ad = adAt(1, 0);
    for (const tick of [0, 1, P - W, P - 1, P, P + 1, 2 * P - 1]) {
      expect(hatchView(ad, tick, none)?.warning).toBe(false);
      expect(hatchView(ad, tick, always)?.warning).toBe(true);
    }
  });
});

describe('hatchesNow (Req 4.3)', () => {
  it('is false at age 0, true at whole multiples of the period and false otherwise', () => {
    const ad = adAt(1, 300);
    expect(hatchesNow(ad, 300, B)).toBe(false);
    for (const k of [1, 2, 3, 7]) expect(hatchesNow(ad, 300 + k * P, B)).toBe(true);
    for (const tick of [301, 300 + P - 1, 300 + P + 1, 300 + 2 * P - 1]) expect(hatchesNow(ad, tick, B)).toBe(false);
  });

  it('is false for interrupters and fake buttons', () => {
    expect(hatchesNow(adAt(1, 0, 'interrupter'), P, B)).toBe(false);
    expect(hatchesNow(adAt(1, 0, 'fake'), P, B)).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------
// The Director's hatch path, on a controlled draft

/** Far past every Chapter row's endSecond, so the scheduler opens nothing on its own. */
const T = 100_000;

interface DraftOptions {
  readonly chapter: ChapterId;
  readonly ads: readonly Ad[];
  readonly balance?: AdBalance;
  readonly calmUntilTick?: number | null;
}

/**
 * A downloading Run at Tick T with an empty lane, the given Ads and the Director in `chapter`.
 * The download is below the Last_Interrupter and the forced first clutter is long past.
 */
function directorDraft(o: DraftOptions): MutableGameState {
  const base = laneWith([]);
  return {
    ...base,
    pauseSources: [],
    tick: T,
    phase: 'downloading',
    download: 10,
    ads: {
      balance: o.balance ?? B,
      nextId: o.ads.reduce((m, a) => Math.max(m, a.id), 0) + 1,
      ads: o.ads,
      connectedTick: 0,
      openedFirstClutter: true,
    },
    director: { ...initialDirectorState(TABLE), chapter: o.chapter, chapterStartTick: 0, calmUntilTick: o.calmUntilTick ?? null },
  };
}

/** Runs the Ad_Scheduler once on `draft` at `tick` with a real Tick context; returns its events. */
function runDirectorAds(draft: MutableGameState, tick = draft.tick): GameEvent[] {
  draft.tick = tick;
  const events: GameEvent[] = [];
  createDirectorAds(TABLE)(draft, createTickContext(draft, events));
  return events;
}

function hatchKindOf(id: ChapterId): HatchKind | null {
  return TABLE.chapters.find((c) => c.id === id)!.hatchKind;
}

describe('directorAds hatching (Req 4.3–4.6)', () => {
  it.each(['plotTurn1', 'pinch1', 'midpoint', 'pinch2', 'plotTurn2'] as const)(
    'in %s spawns one Mob of the hatchKind at the Manhole, then emits adHatched',
    (chapter) => {
      const draft = directorDraft({ chapter, ads: [adAt(4, T - P)] });
      const laneLength = draft.lane!.balance.laneLength;
      const events = runDirectorAds(draft);
      const kind = hatchKindOf(chapter);
      expect(kind).not.toBeNull();
      expect(events).toEqual([
        { type: 'mobSpawned', id: 1, kind, x: laneLength, source: 'adHatch', tick: T },
        { type: 'adHatched', id: 4, mobId: 1, tick: T },
      ]);
      expect(draft.lane!.enemies).toHaveLength(1);
      expect(draft.lane!.enemies[0]).toMatchObject({ id: 1, kind, x: laneLength, spawnTick: T });
    },
  );

  it('does not hatch while the hatchKind is null (the Hook)', () => {
    expect(hatchKindOf('hook')).toBeNull();
    const draft = directorDraft({ chapter: 'hook', ads: [adAt(1, T - P), adAt(2, T - 2 * P)] });
    expect(runDirectorAds(draft)).toEqual([]);
    expect(draft.lane!.enemies).toEqual([]);
  });

  it('hatches during the Midpoint_Calm (Req 4.4)', () => {
    const draft = directorDraft({ chapter: 'midpoint', ads: [adAt(1, T - P)], calmUntilTick: T + 60 });
    const events = runDirectorAds(draft);
    expect(events.map((e) => e.type)).toEqual(['mobSpawned', 'adHatched']);
    expect(events[0]).toMatchObject({ kind: 'fast', source: 'adHatch' });
    expect(draft.director!.calmUntilTick).toBe(T + 60);
  });

  it('hatches each due clutter Ad in id order and skips interrupters and fake buttons', () => {
    const ads = [adAt(1, T - P, 'interrupter'), adAt(2, T - P), adAt(3, T - P, 'fake'), adAt(5, T - 3 * P), adAt(6, T - P + 1)];
    const events = runDirectorAds(directorDraft({ chapter: 'pinch1', ads }));
    expect(events.filter((e) => e.type === 'adHatched')).toEqual([
      { type: 'adHatched', id: 2, mobId: 1, tick: T },
      { type: 'adHatched', id: 5, mobId: 2, tick: T },
    ]);
  });

  it('does not close, move or reset the Ad, and hatches again every period (Req 4.5)', () => {
    const ad = adAt(3, T - P);
    const draft = directorDraft({ chapter: 'pinch1', ads: [ad] });
    const hatchTicks: number[] = [];
    for (let tick = T; tick <= T + 2 * P; tick++) {
      for (const e of runDirectorAds(draft, tick)) if (e.type === 'adHatched') hatchTicks.push(e.tick);
      expect(draft.ads!.ads).toEqual([ad]);
    }
    expect(hatchTicks).toEqual([T, T + P, T + 2 * P]);
    expect(draft.lane!.enemies.map((e) => e.id)).toEqual([1, 2, 3]);
  });

  it('draws no random numbers on a hatch Tick (Req 9.1)', () => {
    const hatching = directorDraft({ chapter: 'pinch2', ads: [adAt(1, T - P), adAt(2, T - 2 * P)] });
    const quiet = directorDraft({ chapter: 'pinch2', ads: [adAt(1, T - P + 1), adAt(2, T - 2 * P + 1)] });
    const before = hatching.rng;
    expect(quiet.rng).toBe(before);
    expect(runDirectorAds(hatching).filter((e) => e.type === 'adHatched')).toHaveLength(2);
    expect(runDirectorAds(quiet)).toEqual([]);
    expect(hatching.rng).toBe(before);
    expect(quiet.rng).toBe(before);
  });
});

// ---------------------------------------------------------------------------------------------
// Whole Runs with the shared Game_Systems

interface Played {
  /** `states[i]` has tick i; `tickEvents[i]` are the events of the step from `states[i]`. */
  readonly states: readonly GameState[];
  readonly tickEvents: readonly (readonly GameEvent[])[];
}

/**
 * Plays `bot` from a FAST_CORE Run (connected after 2 s) for up to `ticks` steps or until the Run
 * ends. `extra` adds commands for the step that produces a Tick; `edit` may change the state
 * before that step (test setup only, for example filling the wallet).
 */
function play(
  bot: Bot,
  systems: ReturnType<typeof createGameSystems>,
  ticks: number,
  seed = 1,
  extra: (state: GameState) => readonly InputCommand[] = () => [],
  edit: (state: GameState) => GameState = (s) => s,
): Played {
  let state = createRun({ seed, balance: FAST_CORE });
  const states: GameState[] = [state];
  const tickEvents: GameEvent[][] = [];
  for (let i = 0; i < ticks && state.phase !== 'won' && state.phase !== 'lost'; i++) {
    state = edit(state);
    states[states.length - 1] = state;
    const result = step(state, [...bot(state), ...extra(state)], systems);
    state = result.state;
    states.push(state);
    tickEvents.push([...result.events]);
  }
  return { states, tickEvents };
}

const allEvents = (p: Played): GameEvent[] => p.tickEvents.flat();

/** Default chapters with new start seconds and hatch kinds (resolution keeps -1 and null). */
function chaptersWith(starts: readonly number[], kinds: readonly (HatchKind | null)[]): Chapter[] {
  return TABLE.chapters.map((c, i) =>
    c.id === 'resolution' ? { ...c } : { ...c, startSecond: starts[i], hatchKind: kinds[i] });
}

describe('hatching in whole Runs (Req 4.3, 4.5)', () => {
  // The ad systems first see `connected` on Tick 121 (the dial ends in stage 5 of Tick 120), so
  // the forced first plain clutter opens at Tick 121 + 5 s = 421 while the Hook is current. These
  // Runs let the Hook hatch default zombies; Plot turn 1 starts at 20 s, after the test.
  const OPEN = 421;
  const HATCH = 60;
  const overrides: GameSystemOverrides = {
    ads: { hatchSeconds: HATCH / 60, hatchWarningSeconds: 0.5 },
    chapters: { chapters: chaptersWith([0, 20, 45, 70, 90, 115], ['default', 'default', 'default', 'fast', 'fast', 'fast']) },
  };
  const bot = killerBot({ downloadAtSecond: 3 });

  function firstClutter(p: Played): { id: number; tick: number } {
    const e = allEvents(p).find((x) => x.type === 'adOpened' && x.kind === 'clutter');
    if (e === undefined || e.type !== 'adOpened') throw new Error('no clutter Ad opened');
    return { id: e.id, tick: e.tick };
  }

  function hatchTicksOf(p: Played, id: number): number[] {
    return allEvents(p).filter((e) => e.type === 'adHatched' && e.id === id).map((e) => e.tick);
  }

  it('an open Ad hatches every period with mobSpawned source adHatch first', () => {
    const p = play(bot, createGameSystems(overrides), OPEN + 3 * HATCH);
    const ad = firstClutter(p);
    expect(ad.tick).toBe(OPEN);
    expect(hatchTicksOf(p, ad.id)).toEqual([ad.tick + HATCH, ad.tick + 2 * HATCH, ad.tick + 3 * HATCH]);
    for (const events of p.tickEvents) {
      events.forEach((e, i) => {
        if (e.type !== 'adHatched') return;
        expect(events[i - 1]).toMatchObject({ type: 'mobSpawned', id: e.mobId, kind: 'default', source: 'adHatch' });
      });
    }
  });

  it('a closed Ad stops hatching, even when closed on a hatch Tick', () => {
    const closeTick = OPEN + 2 * HATCH;
    const p = play(bot, createGameSystems(overrides), OPEN + 5 * HATCH, 1, (s) => {
      if (s.tick + 1 !== closeTick) return [];
      const ad = s.ads!.ads.find((a) => a.kind === 'clutter')!;
      return [{ type: 'adClick', adId: ad.id, control: 'close' }];
    });
    const ad = firstClutter(p);
    expect(allEvents(p).find((e) => e.type === 'adClosed')).toMatchObject({ id: ad.id, tick: closeTick });
    expect(hatchTicksOf(p, ad.id)).toEqual([ad.tick + HATCH]);
  });

  it('a blocked Ad stops hatching', () => {
    const buyTick = OPEN + HATCH + 30;
    const p = play(
      bot, createGameSystems(overrides), OPEN + 5 * HATCH, 1,
      (s) => (s.tick + 1 === buyTick ? [{ type: 'buy', slot: 4 }] : []),
      (s) => (s.tick + 1 === buyTick ? { ...s, economy: { ...s.economy!, wallet: 100 } } : s),
    );
    const ad = firstClutter(p);
    expect(allEvents(p).find((e) => e.type === 'adBlocked')).toMatchObject({ id: ad.id, tick: buyTick });
    expect(hatchTicksOf(p, ad.id)).toEqual([ad.tick + HATCH]);
  });
});

// ---------------------------------------------------------------------------------------------
// Property 4

const KINDS: readonly (HatchKind | null)[] = [null, 'default', 'fast', 'tank'];

interface CadenceSpec {
  readonly seed: number;
  /** Hatch period in Ticks. */
  readonly hatchTicks: number;
  /** hatchKind of the six scripted Chapters, which start every 2 s from 0. */
  readonly kinds: readonly (HatchKind | null)[];
  readonly ticks: number;
}

const arbCadence: fc.Arbitrary<CadenceSpec> = fc.record({
  seed: fc.nat(),
  hatchTicks: fc.integer({ min: 1, max: 120 }),
  kinds: fc.array(fc.constantFrom(...KINDS), { minLength: 6, maxLength: 6 }),
  ticks: fc.integer({ min: 300, max: 900 }),
});

describe('Property 4', () => {
  // Property: Req 4.3, 4.5 a clutter Ad left open for k × hatchSeconds has hatched exactly k
  // times while its Chapter's hatchKind was non-null
  // Feature: ad-pressure, Property 4: Hatch cadence
  it('Property 4: hatch cadence', () => {
    let totalHatches = 0;
    fc.assert(
      fc.property(arbCadence, (spec) => {
        const P4 = spec.hatchTicks;
        const starts = [0, 2, 4, 6, 8, 10];
        const systems = createGameSystems({
          ads: { hatchSeconds: P4 / 60, hatchWarningSeconds: 0 },
          chapters: { chapters: chaptersWith(starts, spec.kinds), bossAtPercent: 100, bossLatestSecond: 60 },
        });
        // The bot never clicks an Ad and buys nothing, so clutter Ads stay open.
        const p = play(killerBot({ downloadAtSecond: 2.5 }), systems, spec.ticks, spec.seed);
        const kindOf = new Map<ChapterId, HatchKind | null>(
          chaptersWith(starts, spec.kinds).map((c) => [c.id, c.hatchKind]));
        const opened = new Map<number, number>();
        const hatched = new Map<number, number>();
        p.tickEvents.forEach((events, i) => {
          const tick = p.states[i + 1].tick;
          // directorLane advances the Chapter before directorAds runs, so the state after the
          // step holds the Chapter this Tick's hatches used.
          const kind = kindOf.get(p.states[i + 1].director!.chapter) ?? null;
          const due = (p.states[i].ads?.ads ?? [])
            .filter((a) => a.kind === 'clutter' && tick - a.openTick > 0 && (tick - a.openTick) % P4 === 0)
            .map((a) => a.id);
          const got = events.filter((e) => e.type === 'adHatched');
          expect(got.map((e) => e.type === 'adHatched' && e.id)).toEqual(kind === null ? [] : due);
          events.forEach((e, j) => {
            if (e.type === 'adOpened' && e.kind === 'clutter') opened.set(e.id, tick);
            if (e.type === 'adClosed' || e.type === 'adBlocked') throw new Error('the bot never closes Ads');
            if (e.type !== 'adHatched') return;
            hatched.set(e.id, (hatched.get(e.id) ?? 0) + 1);
            totalHatches++;
            expect(events[j - 1]).toMatchObject({ type: 'mobSpawned', id: e.mobId, kind, source: 'adHatch' });
          });
        });
        // k = whole periods each clutter Ad stayed open, counted on Ticks with a non-null hatchKind.
        const end = p.states[p.states.length - 1].tick;
        for (const [id, openTick] of opened) {
          let k = 0;
          for (let t = openTick + P4; t <= end; t += P4) {
            if ((kindOf.get(p.states[t].director!.chapter) ?? null) !== null) k++;
          }
          expect(hatched.get(id) ?? 0).toBe(k);
        }
      }),
      { numRuns: 100 },
    );
    // Guard against a vacuous pass: the generated Runs must actually hatch.
    expect(totalHatches).toBeGreaterThan(0);
  }, 60_000);
});
