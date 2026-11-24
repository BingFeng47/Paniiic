// Boss_Trigger (pacing-and-economy Req 3.1–3.4, 9.1; design "Boss_Trigger" and Correctness
// Property 1). `directorLane` runs the Boss_Rise once, when the download it sees (last Tick's,
// because it runs before the download stage) reaches `bossAtPercent`, or when the Run reaches
// `bossLatestSecond`, whichever comes first. The Midpoint_Calm does not hold it.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { rowFor, countdownReadyTick } from '../../../src/game/ads/closePatterns';
import { DEFAULT_CHAPTER_TABLE as T, type ChapterTableOverrides } from '../../../src/game/balance/chapters';
import type { CoreBalance } from '../../../src/game/balance/core';
import { attackPoint, DEFAULT_LANE_BALANCE, secondsToTicks } from '../../../src/game/balance/lane';
import { calmActive } from '../../../src/game/director/directorLane';
import { createRun } from '../../../src/game/state';
import { step } from '../../../src/game/step';
import { createGameSystems, type GameSystemOverrides } from '../../../src/game/systems';
import { TICK_RATE, type GameEvent, type GameState, type InputCommand } from '../../../src/game/types';
import { killerBot, type Bot } from '../../helpers/bots';

/** A modem that can't die, so a Run lives long enough to reach every Boss_Trigger. */
const UNKILLABLE: Partial<CoreBalance> = { maxIntegrity: 1_000_000 };

/** Only clicks the real link on the step that produces `downloadTick` (never, if null). */
function idleBot(downloadTick: number | null): Bot {
  return (s) => (downloadTick !== null && s.tick + 1 === downloadTick ? [{ type: 'startDownload' }] : []);
}

/**
 * The killer bot plus one correct Ad answer per Tick: it hovers a runaway ✕ until it stops,
 * waits out countdowns, clicks ✕ then Yes on confirms and never clicks a fake button. Without
 * this the first interrupter would pause the download for good.
 */
function closerBot(downloadAtSecond = 21): Bot {
  const killer = killerBot({ downloadAtSecond, collectPackets: true });
  return (s) => {
    const cmds: InputCommand[] = [...killer(s)];
    const ads = s.ads;
    if (ads === undefined) return cmds;
    const ordered = [...ads.ads].sort((a, b) => (a.kind === 'interrupter' ? 0 : 1) - (b.kind === 'interrupter' ? 0 : 1));
    for (const ad of ordered) {
      if (ad.kind === 'fake') continue;
      if (ad.pattern === 'runaway' && ad.jumps < ads.balance.runawayJumps) {
        cmds.push({ type: 'adHover', adId: ad.id });
        break;
      }
      if (ad.pattern === 'countdown' && s.tick + 1 < countdownReadyTick(ad, ads.balance)) continue;
      const control = ad.pattern === 'confirm' && ad.stage === 'main' ? 'close' : rowFor(ad).correct;
      if (control === null) continue;
      cmds.push({ type: 'adClick', adId: ad.id, control });
      break;
    }
    return cmds;
  };
}

interface Trace {
  /** `downloads[i]` is the download of the state with tick i. */
  readonly downloads: readonly number[];
  readonly events: readonly GameEvent[];
  readonly final: GameState;
}

function play(
  bot: Bot,
  opts: { seed: number; core?: Partial<CoreBalance>; overrides?: GameSystemOverrides; maxSeconds: number },
): Trace {
  const systems = createGameSystems(opts.overrides);
  let state = createRun({ seed: opts.seed, balance: opts.core });
  const downloads: number[] = [state.download];
  const events: GameEvent[] = [];
  const maxTicks = secondsToTicks(opts.maxSeconds);
  while (state.phase !== 'won' && state.phase !== 'lost' && state.tick < maxTicks) {
    const r = step(state, bot(state), systems);
    state = r.state;
    downloads.push(state.download);
    events.push(...r.events);
  }
  return { downloads, events, final: state };
}

const bossRises = (events: readonly GameEvent[]): number[] =>
  events.flatMap((e) => (e.type === 'beat' && e.name === 'bossRise' ? [e.tick] : []));

/**
 * The reference trigger: the step that produces tick `t` is due when the download of state
 * `t - 1` (what the Director sees) is >= bossAtPercent, or when `t >= bossLatestSecond` in Ticks.
 * Returns the first due tick the Run played, or null.
 */
function expectedRiseTick(downloads: readonly number[], atPercent: number, latestSecond: number): number | null {
  const latest = secondsToTicks(latestSecond);
  for (let t = 1; t < downloads.length; t++) {
    if (downloads[t - 1]! >= atPercent - 1e-9 || t >= latest) return t;
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// Examples

describe('Boss_Trigger examples (Req 3.1–3.4, 9.1)', () => {
  // Tuned values: docs/balance/2026-11-24-boss-threat.md.
  it('defaults to 75% with a 200 s fallback, and the boss crosses the lane at speed 38 in about 21 s', () => {
    expect(T.bossAtPercent).toBe(75);
    expect(T.bossLatestSecond).toBe(200);
    expect(DEFAULT_LANE_BALANCE.enemies.boss.speed).toBe(38);
    expect(DEFAULT_LANE_BALANCE.laneLength / DEFAULT_LANE_BALANCE.enemies.boss.speed).toBeCloseTo(800 / 38, 9);
  });

  // Req 9.1: a Boss_Rise at 75% for a killer bot on the default timeline.
  it('rises on progress at 75%, on the Tick after the bar crosses, for a killer bot', () => {
    const { downloads, events } = play(closerBot(), { seed: 1, core: UNKILLABLE, maxSeconds: 260 });
    const rises = bossRises(events);
    expect(rises).toHaveLength(1);
    const tick = rises[0]!;
    expect(tick).toBeLessThan(secondsToTicks(T.bossLatestSecond));
    expect(downloads[tick - 1]).toBeGreaterThanOrEqual(75 - 1e-9);
    expect(downloads[tick - 2]).toBeLessThan(75 - 1e-9);
    // The boss Mob enters the lane on the same Tick.
    expect(events.some((e) => e.tick === tick && e.type === 'mobSpawned' && e.kind === 'boss')).toBe(true);
  });

  it('rises on the clock fallback at bossLatestSecond when the download never starts', () => {
    const { downloads, events } = play(idleBot(null), { seed: 2, core: UNKILLABLE, maxSeconds: 205 });
    expect(downloads.every((d) => d === 0)).toBe(true);
    expect(bossRises(events)).toEqual([secondsToTicks(T.bossLatestSecond)]);
  });

  it('rises on the clock fallback when the download is stuck below bossAtPercent', () => {
    // The download starts but an unanswered interrupter (from Pinch 1) pauses it for good.
    const overrides: GameSystemOverrides = { chapters: { bossLatestSecond: 120 } };
    const { downloads, events } = play(idleBot(secondsToTicks(21)), { seed: 3, core: UNKILLABLE, overrides, maxSeconds: 125 });
    expect(Math.max(...downloads)).toBeLessThan(65);
    expect(downloads[downloads.length - 1]).toBeGreaterThan(0);
    expect(bossRises(events)).toEqual([secondsToTicks(120)]);
  });

  it('rises only once, even when progress and the clock are both due', () => {
    // A fast download passes bossAtPercent long before the fallback, and the Run keeps going past it.
    const core = { ...UNKILLABLE, dialSeconds: 2, downloadPercentPerSecond: 2 };
    const chapters: ChapterTableOverrides = { bossAtPercent: 20, bossLatestSecond: 30 };
    const { events, final } = play(closerBot(2.5), { seed: 4, core, overrides: { chapters }, maxSeconds: 45 });
    expect(final.tick).toBeGreaterThan(secondsToTicks(30));
    expect(bossRises(events)).toHaveLength(1);
    expect(events.filter((e) => e.type === 'mobSpawned' && e.kind === 'boss' && e.source === 'schedule')).toHaveLength(1);
  });

  it('is not held by the Midpoint_Calm (Req 3.4)', () => {
    // At 50% the calm and the Boss_Rise become due on the same Tick; a 30 s calm would hold any
    // scheduled spawn, but the boss still rises.
    const core = { ...UNKILLABLE, dialSeconds: 2, downloadPercentPerSecond: 2 };
    const chapters: ChapterTableOverrides = { bossAtPercent: 50, calmSeconds: 30 };
    const systems = createGameSystems({ chapters });
    let state = createRun({ seed: 5, balance: core });
    const bot = closerBot(2.5);
    let riseTick: number | null = null;
    let calmTick: number | null = null;
    let calmHeldAtRise = false;
    while (riseTick === null && state.tick < secondsToTicks(60)) {
      const r = step(state, bot(state), systems);
      state = r.state;
      for (const e of r.events) {
        if (e.type === 'beat' && e.name === 'midpointCalm') calmTick = e.tick;
        if (e.type === 'beat' && e.name === 'bossRise') {
          riseTick = e.tick;
          calmHeldAtRise = state.director !== undefined && calmActive(state.director, e.tick);
        }
      }
    }
    expect(riseTick).not.toBeNull();
    expect(calmTick).toBe(riseTick);
    expect(calmHeldAtRise).toBe(true);
  });

  it('the boss reaches the modem about 25 s after it rises', () => {
    const chapters: ChapterTableOverrides = { bossLatestSecond: 5 };
    const { events } = play(idleBot(null), { seed: 6, core: UNKILLABLE, overrides: { chapters }, maxSeconds: 40 });
    const spawn = events.find((e) => e.type === 'mobSpawned' && e.kind === 'boss');
    const arrive = events.find((e) => e.type === 'mobArrived' && e.kind === 'boss');
    expect(spawn).toBeDefined();
    expect(arrive).toBeDefined();
    const b = DEFAULT_LANE_BALANCE;
    // The boss walks from laneLength to its attack point (half its width from the modem).
    const expectedTicks = ((b.laneLength - attackPoint(b, 'boss')) / b.enemies.boss.speed) * TICK_RATE;
    expect(Math.abs(arrive!.tick - spawn!.tick - expectedTicks)).toBeLessThanOrEqual(1);
    expect((arrive!.tick - spawn!.tick) / TICK_RATE).toBeLessThanOrEqual(25);
  });
});

// ---------------------------------------------------------------------------------------------
// Property 1

describe('Boss_Trigger property', () => {
  // Property 1: Req 3.1, 3.2, 3.4 — in any bot run there is at most one Boss_Rise, and it happens
  // on the first Tick whose Director-seen download is >= bossAtPercent, or at bossLatestSecond,
  // whichever is first.
  it('Property 1: boss once, on progress or clock', () => {
    fc.assert(
      fc.property(
        fc.record({
          seed: fc.integer({ min: 0, max: 0xffffffff }),
          bot: fc.constantFrom('idle', 'killer', 'closer'),
          downloadAtSecond: fc.option(fc.integer({ min: 3, max: 10 }), { nil: null }),
          downloadPercentPerSecond: fc.double({ min: 1, max: 8, noNaN: true }),
          maxIntegrity: fc.constantFrom(40, 100, 1_000_000),
          bossAtPercent: fc.oneof(fc.constantFrom(0, 50, 65, 100), fc.double({ min: 0, max: 100, noNaN: true })),
          bossLatestSecond: fc.oneof(fc.constant(0), fc.double({ min: 0, max: 40, noNaN: true })),
        }),
        (spec) => {
          const downloadAt = spec.downloadAtSecond ?? 21;
          const bot =
            spec.bot === 'closer' ? closerBot(downloadAt)
            : spec.bot === 'killer' ? killerBot({ downloadAtSecond: downloadAt, collectPackets: true })
            : idleBot(spec.downloadAtSecond === null ? null : secondsToTicks(downloadAt));
          const core: Partial<CoreBalance> = {
            dialSeconds: 2,
            maxIntegrity: spec.maxIntegrity,
            downloadPercentPerSecond: spec.downloadPercentPerSecond,
          };
          const chapters: ChapterTableOverrides = { bossAtPercent: spec.bossAtPercent, bossLatestSecond: spec.bossLatestSecond };
          const { downloads, events } = play(bot, { seed: spec.seed, core, overrides: { chapters }, maxSeconds: 45 });
          const expected = expectedRiseTick(downloads, spec.bossAtPercent, spec.bossLatestSecond);
          expect(bossRises(events)).toEqual(expected === null ? [] : [expected]);
        },
      ),
      { numRuns: 40 },
    );
  });
});
