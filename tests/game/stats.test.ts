// Property 2 (leaderboard design: Correctness Properties): for random bot runs, `state.stats`
// equals a fold over every event emitted across all ticks. Whole Runs use the shared
// Game_Systems from createGameSystems. A dense test-only Chapter_Table (every kind of Mob and
// Ad within a few seconds, fast mobs, a weak boss, a free pop-up blocker) keeps the Runs short
// while kills, glob kills, boss kills, correct closes, mistakes and blocked ads all happen.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { Ad, AdControl } from '../../src/game/ads/adTypes';
import { rowFor } from '../../src/game/ads/closePatterns';
import type { AdRow } from '../../src/game/balance/ads';
import { DEFAULT_CHAPTER_TABLE as TABLE, type Chapter, type ChapterTableOverrides } from '../../src/game/balance/chapters';
import { createRun } from '../../src/game/state';
import type { RunStats } from '../../src/game/stats';
import { step } from '../../src/game/step';
import { createGameSystems, type GameSystemOverrides } from '../../src/game/systems';
import type { GameEvent, GameState, InputCommand } from '../../src/game/types';
import { killerBot } from '../helpers/bots';
import { FAST_CORE } from '../helpers/lane';

// ---------------------------------------------------------------------------------------------
// Dense test-only tables (test data, not tuning)

function adRow(kind: AdRow['kind'], everySeconds: number, patterns: AdRow['patterns'], startSecond = 0): AdRow {
  return { kind, startSecond, endSecond: 600, everySeconds, patterns, laneCover: false };
}
const PATTERNS = ['plain', 'decoy', 'hidden', 'swapped', 'countdown', 'confirm'] as const;
const WAVES: Chapter['waves'] = [
  { kind: 'default', everySeconds: 0.8, offsetSeconds: 0 },
  { kind: 'fast', everySeconds: 1.2, offsetSeconds: 0.3 },
  { kind: 'ranged', everySeconds: 2, offsetSeconds: 0.1 },
  { kind: 'tank', everySeconds: 3, offsetSeconds: 0.5 },
];
const STARTS: Readonly<Record<string, number>> = { plotTurn1: 1, pinch1: 2, midpoint: 3, pinch2: 4, plotTurn2: 5 };
const DENSE_CHAPTERS: ChapterTableOverrides = {
  chapters: TABLE.chapters.map((c): Chapter => {
    const start = STARTS[c.id];
    if (start === undefined) return { ...c };
    return {
      ...c,
      startSecond: start,
      waves: WAVES,
      ads: [
        adRow('clutter', 0.5, PATTERNS),
        adRow('interrupter', 1.5, ['plain', 'confirm', 'runaway'], 0.25),
        adRow('fake', 1.1, []),
      ],
    };
  }),
  bossAtPercent: 100,
  bossLatestSecond: 3,
  firstClutterAfterConnectSeconds: 0.5,
};
const OVERRIDES: GameSystemOverrides = {
  chapters: DENSE_CHAPTERS,
  lane: {
    enemies: {
      // No modem damage, so the dense Runs last long enough to see every event kind.
      default: { speed: 160, damage: 0 },
      fast: { speed: 300, damage: 0 },
      tank: { speed: 120, damage: 0 },
      ranged: { speed: 400, hp: 15 },
      boss: { hp: 6, speed: 150, damage: 0 },
      glob: { damage: 0 },
    },
    // 1 damage keeps the 15 HP ranged alive long enough to spit globs for the bot to kill.
    hammer: { damage: 1, cooldownSeconds: 0.05 },
    ranged: { firstSpitSeconds: 0.2, spitEverySeconds: 0.6 },
  },
  ads: { hatchSeconds: 2, hatchWarningSeconds: 0.5 },
  economy: { prices: { blocker: 0 }, blockerSeconds: 0.5 },
};

// ---------------------------------------------------------------------------------------------
// Bot

interface BotSpec {
  readonly seed: number;
  readonly ticks: number;
  /** Look at the top Ad every this many ticks. */
  readonly adEvery: number;
  /** Cycled per Ad decision: true clicks a wrong control (or the fake button). */
  readonly mistakes: readonly boolean[];
  /** Ticks (of the step that produces them) on which the bot buys the pop-up blocker. */
  readonly blockerTicks: readonly number[];
}

const DOWNLOAD_AT_SECOND = 2.5;

function adCommand(ad: Ad, mistake: boolean): InputCommand | null {
  const row = rowFor(ad);
  let control: AdControl | null;
  if (mistake) control = row.wrong[0] ?? null;
  else if (row.correct !== null) control = row.correct;
  else if (ad.pattern === 'confirm') control = 'close'; // opens the confirm stage
  else control = null; // fake button: ignore it
  return control === null ? null : { type: 'adClick', adId: ad.id, control };
}

function botFor(spec: BotSpec): (s: GameState) => readonly InputCommand[] {
  const killer = killerBot({ downloadAtSecond: DOWNLOAD_AT_SECOND, collectPackets: true });
  const blockers = new Set(spec.blockerTicks);
  let decision = 0;
  return (s) => {
    const cmds: InputCommand[] = [...killer(s)];
    const next = s.tick + 1;
    const ads = s.ads?.ads ?? [];
    if (next % spec.adEvery === 0 && ads.length > 0) {
      const mistake = spec.mistakes.length > 0 && spec.mistakes[decision % spec.mistakes.length];
      decision += 1;
      const cmd = adCommand(ads[ads.length - 1], mistake);
      if (cmd !== null) cmds.push(cmd);
    }
    if (blockers.has(next)) cmds.push({ type: 'buy', slot: 4 });
    return cmds;
  };
}

interface Trace {
  readonly states: readonly GameState[];
  readonly events: readonly GameEvent[];
}

function play(spec: BotSpec): Trace {
  const systems = createGameSystems(OVERRIDES);
  const bot = botFor(spec);
  let state = createRun({ seed: spec.seed, balance: FAST_CORE });
  const states: GameState[] = [state];
  const events: GameEvent[] = [];
  for (let i = 0; i < spec.ticks && state.phase !== 'won' && state.phase !== 'lost'; i++) {
    const r = step(state, bot(state), systems);
    state = r.state;
    states.push(state);
    events.push(...r.events);
  }
  return { states, events };
}

/** The reference fold: what `stats` must be after these events. */
function foldStats(events: readonly GameEvent[]): RunStats {
  let kills = 0;
  let bossKilled = false;
  let adsClosed = 0;
  for (const ev of events) {
    if (ev.type === 'mobKilled') {
      if (ev.kind !== 'glob') kills += 1;
      if (ev.kind === 'boss') bossKilled = true;
    } else if (ev.type === 'adClosed') adsClosed += 1;
  }
  return { kills, bossKilled, adsClosed };
}

const count = (events: readonly GameEvent[], pred: (e: GameEvent) => boolean) => events.filter(pred).length;

const arbSpec: fc.Arbitrary<BotSpec> = fc.integer({ min: 300, max: 600 }).chain((ticks) =>
  fc.record({
    seed: fc.nat(),
    ticks: fc.constant(ticks),
    adEvery: fc.integer({ min: 4, max: 40 }),
    mistakes: fc.array(fc.boolean(), { maxLength: 8 }),
    blockerTicks: fc.array(fc.integer({ min: 1, max: ticks }), { maxLength: 4 }),
  }));

// ---------------------------------------------------------------------------------------------

describe('Property 2: stats match events', () => {
  /** **Validates: Requirements 2.1, 2.2** */
  // Property: Req 2.1 stats equal a fold over every emitted event; Req 2.2 absent until first run
  it('after every tick of a random bot run, stats equal the fold over all events so far', () => {
    fc.assert(
      fc.property(arbSpec, (spec) => {
        const systems = createGameSystems(OVERRIDES);
        const bot = botFor(spec);
        let state = createRun({ seed: spec.seed, balance: FAST_CORE });
        expect(state.stats).toBeUndefined();
        const events: GameEvent[] = [];
        for (let i = 0; i < spec.ticks && state.phase !== 'won' && state.phase !== 'lost'; i++) {
          const r = step(state, bot(state), systems);
          state = r.state;
          events.push(...r.events);
          expect(state.stats).toEqual(foldStats(events));
        }
        // Survives a JSON round trip (Req 2.2).
        expect(JSON.parse(JSON.stringify(state.stats))).toEqual(state.stats);
      }),
      { numRuns: 12 },
    );
  });

  it('a fixed dense run covers glob kills, boss kills, closes and blocked ads', () => {
    const spec: BotSpec = { seed: 7, ticks: 900, adEvery: 8, mistakes: [false, false, true], blockerTicks: [400, 700] };
    const { states, events } = play(spec);
    const final = states[states.length - 1];
    const globKills = count(events, (e) => e.type === 'mobKilled' && e.kind === 'glob');
    const allKills = count(events, (e) => e.type === 'mobKilled');
    const blocked = count(events, (e) => e.type === 'adBlocked');
    const closed = count(events, (e) => e.type === 'adClosed');

    // The run is not vacuous: each kind of event the stats must count or skip happened.
    expect(globKills).toBeGreaterThan(0);
    expect(blocked).toBeGreaterThan(0);
    expect(closed).toBeGreaterThan(0);
    expect(count(events, (e) => e.type === 'mobKilled' && e.kind === 'boss')).toBeGreaterThan(0);

    // Globs don't count as kills; blocked ads don't count as closes.
    expect(final.stats).toEqual({ kills: allKills - globKills, bossKilled: true, adsClosed: closed });
  });
});

describe('stats lifecycle', () => {
  it('is absent on a new run and present after the first step with the Game_Systems', () => {
    const run = createRun({ seed: 1 });
    expect(run.stats).toBeUndefined();
    expect(step(run, [], []).state.stats).toBeUndefined();
    expect(step(run, [], createGameSystems()).state.stats).toEqual({ kills: 0, bossKilled: false, adsClosed: 0 });
  });

  it('survives a JSON round trip of the whole state', () => {
    const { states } = play({ seed: 3, ticks: 600, adEvery: 10, mistakes: [], blockerTicks: [] });
    const final = states[states.length - 1];
    const copy = JSON.parse(JSON.stringify(final)) as GameState;
    expect(copy.stats).toEqual(final.stats);
    expect(final.stats?.kills).toBeGreaterThan(0);
  });
});
