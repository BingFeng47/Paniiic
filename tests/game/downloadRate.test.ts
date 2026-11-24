// Download rate (ad-pressure Req 2.4, 2.5, 3.1–3.4, 9.2; design "Core balance and step",
// "Bandwidth system" and Correctness Properties 2 and 3): `lineQuality` and `downloadRate` from
// src/game/downloadRate.ts, how step() stage 6 uses them, and whole Runs played with the shared
// Game_Systems. Property 1 (bandwidth bounds) lives in tests/game/ads/bandwidth.test.ts.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { initialAds } from '../../src/game/ads/adSystems';
import { bandwidthSystem } from '../../src/game/ads/bandwidth';
import { controlsFor } from '../../src/game/ads/closePatterns';
import { DEFAULT_AD_BALANCE } from '../../src/game/balance/ads';
import { DEFAULT_CHAPTER_TABLE, type Chapter } from '../../src/game/balance/chapters';
import { DEFAULT_CORE_BALANCE, resolveCoreBalance, type CoreBalance } from '../../src/game/balance/core';
import type { System } from '../../src/game/context';
import { downloadRate, lineQuality } from '../../src/game/downloadRate';
import { nextRandom } from '../../src/game/rng';
import { createRun } from '../../src/game/state';
import { step } from '../../src/game/step';
import { createGameSystems } from '../../src/game/systems';
import { TICK_RATE, type GameEvent, type GameState, type InputCommand } from '../../src/game/types';
import { killerBot, type Bot } from '../helpers/bots';
import { scheduledDamage, stepN } from '../helpers/game';
import { FAST_CORE } from '../helpers/lane';
/** step()'s threshold tolerance (src/game/step.ts): the final Tick may snap up to 100 by this much. */
const EPSILON = 1e-9;
const START = { tick: 1201, command: { type: 'startDownload' } } as const;
/** A core-only Run on its first downloading Tick (default balance: dial ends on Tick 1200). */
function downloadingRun(): GameState {
  return stepN(step, createRun({ seed: 1 }), 1201, { inputs: [START] }).state;
}
/** The Pick<> shape both helpers read, with any core balance. */
function rateState(integrity: number, balance: Partial<CoreBalance> = {}, bandwidth?: number) {
  return { integrity, balance: resolveCoreBalance(balance), bandwidth };
}
// ---------------------------------------------------------------------------------------------
// lineQuality
describe('lineQuality (Req 3.1, 3.3)', () => {
  it('is exactly 1 at maxIntegrity for every floor in [0, 1]', () => {
    for (let i = 0; i <= 1000; i++) {
      const lineQualityFloor = i / 1000;
      expect(lineQuality(rateState(100, { lineQualityFloor }))).toBe(1);
    }
    expect(lineQuality(rateState(250, { maxIntegrity: 250, lineQualityFloor: 1 / 3 }))).toBe(1);
    expect(lineQuality(rateState(7, { maxIntegrity: 7, criticalIntegrity: 1, lineQualityFloor: 0.07 }))).toBe(1);
  });
  it('is the floor at 0 integrity', () => {
    expect(lineQuality(rateState(0))).toBe(DEFAULT_CORE_BALANCE.lineQualityFloor);
    expect(lineQuality(rateState(0, { lineQualityFloor: 0 }))).toBe(0);
    expect(lineQuality(rateState(0, { lineQualityFloor: 0.25 }))).toBe(0.25);
    expect(lineQuality(rateState(0, { lineQualityFloor: 1 }))).toBe(1);
  });
  it('is linear in between: 0.68 at the default critical 20, 0.8 at half', () => {
    expect(lineQuality(rateState(20))).toBeCloseTo(0.68, 12);
    expect(lineQuality(rateState(50))).toBeCloseTo(0.8, 12);
    expect(lineQuality(rateState(75))).toBeCloseTo(0.9, 12);
    const f = 0.3;
    for (let integrity = 0; integrity <= 100; integrity += 5) {
      expect(lineQuality(rateState(integrity, { lineQualityFloor: f }))).toBeCloseTo(f + (1 - f) * (integrity / 100), 12);
    }
    // Equal integrity steps give equal quality steps.
    const q = (i: number) => lineQuality(rateState(i, { maxIntegrity: 40, criticalIntegrity: 8 }));
    expect(q(30) - q(20)).toBeCloseTo(q(20) - q(10), 12);
  });
  it('clamps integrity outside [0, maxIntegrity]', () => {
    expect(lineQuality(rateState(-1))).toBe(DEFAULT_CORE_BALANCE.lineQualityFloor);
    expect(lineQuality(rateState(-500))).toBe(DEFAULT_CORE_BALANCE.lineQualityFloor);
    expect(lineQuality(rateState(100.5))).toBe(1);
    expect(lineQuality(rateState(1e9))).toBe(1);
  });
});
// ---------------------------------------------------------------------------------------------
// downloadRate
describe('downloadRate (Req 2.4, 2.5, 3.4)', () => {
  const full = DEFAULT_CORE_BALANCE.downloadPercentPerSecond;
  it('is downloadPercentPerSecond × bandwidth × lineQuality', () => {
    expect(downloadRate(rateState(100, {}, 0.55))).toBeCloseTo(full * 0.55, 12);
    expect(downloadRate(rateState(50, {}, 1))).toBeCloseTo(full * 0.8, 12);
    expect(downloadRate(rateState(20, {}, 0.4))).toBeCloseTo(full * 0.4 * 0.68, 12);
    expect(downloadRate(rateState(0, { downloadPercentPerSecond: 2, lineQualityFloor: 0.5 }, 0.7))).toBeCloseTo(0.7, 12);
    for (const [integrity, bandwidth] of [[100, 1], [80, 0.85], [33, 0.7], [0, 0.4]] as const) {
      const s = rateState(integrity, {}, bandwidth);
      expect(downloadRate(s)).toBeCloseTo(full * bandwidth * lineQuality(s), 12);
    }
  });
  it('treats a missing bandwidth as 1', () => {
    expect(downloadRate(rateState(100))).toBe(full);
    expect(downloadRate({ integrity: 100, balance: DEFAULT_CORE_BALANCE })).toBe(full);
    expect(downloadRate(rateState(50))).toBe(downloadRate(rateState(50, {}, 1)));
    expect(downloadRate(rateState(0))).toBeCloseTo(full * 0.6, 12);
  });
  it('is 0 at a zero bandwidth or a zero floor at 0 integrity', () => {
    expect(downloadRate(rateState(100, {}, 0))).toBe(0);
    expect(downloadRate(rateState(0, { lineQualityFloor: 0 }))).toBe(0);
  });
});
// ---------------------------------------------------------------------------------------------
// step() stage 6
describe('step: the download step uses downloadRate (Req 2.4, 3.2)', () => {
  const full = DEFAULT_CORE_BALANCE.downloadPercentPerSecond;
  it('advances a healthy core-only Run by exactly downloadPercentPerSecond / TICK_RATE', () => {
    const before = downloadingRun();
    const after = step(before, []).state;
    expect(after.download).toBe(before.download + full / TICK_RATE);
    expect(after.bandwidth).toBeUndefined();
  });
  it('uses the integrity at the start of the download stage, after this Tick\'s modem hits', () => {
    const before = downloadingRun();
    const tick = before.tick + 1;
    const after = step(before, [], [scheduledDamage([{ tick, amount: 50 }])]).state;
    expect(after.integrity).toBe(50);
    expect(after.download - before.download).toBeCloseTo((full * 0.8) / TICK_RATE, 12);
  });
  it('keeps using a lower integrity from earlier Ticks', () => {
    const before = { ...downloadingRun(), integrity: 20 };
    const after = step(before, []).state;
    expect(after.download - before.download).toBeCloseTo((full * 0.68) / TICK_RATE, 12);
  });
  it('uses the bandwidth a system wrote this Tick, times the line quality', () => {
    const halfBandwidth: System = (draft) => {
      draft.bandwidth = 0.5;
    };
    const before = downloadingRun();
    const tick = before.tick + 1;
    const after = step(before, [], [halfBandwidth, scheduledDamage([{ tick, amount: 25 }])]).state;
    expect(after.bandwidth).toBe(0.5);
    expect(after.download - before.download).toBeCloseTo((full * 0.5 * 0.9) / TICK_RATE, 12);
  });
  it('does not advance while a pause source is active, whatever the rate', () => {
    const pause: System = (draft, ctx) => {
      draft.bandwidth = 0.4;
      ctx.addPauseSource('ad');
    };
    const before = { ...downloadingRun(), integrity: 30 };
    const { state } = stepN(step, before, 120, { systems: [pause] });
    expect(state.phase).toBe('downloading');
    expect(state.download).toBe(before.download);
  });
  it('does not advance while dialing or connected, even with a bandwidth and damage', () => {
    const lowered: System = (draft) => {
      draft.bandwidth = 0.85;
    };
    const dialing = stepN(step, { ...createRun({ seed: 1 }), integrity: 60 }, 600, { systems: [lowered] }).state;
    expect(dialing.phase).toBe('dialing');
    expect(dialing.download).toBe(0);
    const connected = stepN(step, dialing, 1200, { systems: [lowered] }).state;
    expect(connected.phase).toBe('connected');
    expect(connected.download).toBe(0);
  });
});
// ---------------------------------------------------------------------------------------------
// Property 2
interface BotRunSpec {
  readonly seed: number;
  readonly botSeed: number;
  readonly downloadPercentPerSecond: number;
  readonly lineQualityFloor: number;
  readonly bandwidthPerClutter: number;
  readonly bandwidthFloor: number;
  /** Second the bot clicks the real link (the FAST_CORE dial ends at 2 s). */
  readonly downloadAtSecond: number;
  /** Share of Ticks on which the bot's hammer command goes through; low values let mobs bite. */
  readonly hammerChance: number;
  /** Per-Tick chance of clicking a random control of a random open Ad, fakes included. */
  readonly clickChance: number;
  readonly collectPackets: boolean;
}
const arbBotRun: fc.Arbitrary<BotRunSpec> = fc.record({
  seed: fc.nat(),
  botSeed: fc.nat(),
  downloadPercentPerSecond: fc.double({ min: 2.5, max: 6, noNaN: true }),
  lineQualityFloor: fc.double({ min: 0, max: 1, noNaN: true }),
  bandwidthPerClutter: fc.double({ min: 0, max: 1, noNaN: true }),
  bandwidthFloor: fc.double({ min: 0, max: 1, noNaN: true }),
  downloadAtSecond: fc.double({ min: 2.1, max: 8, noNaN: true }),
  hammerChance: fc.double({ min: 0, max: 0.3, noNaN: true }),
  clickChance: fc.double({ min: 0, max: 0.03, noNaN: true }),
  collectPackets: fc.boolean(),
});
/**
 * killerBot from tests/helpers/bots.ts with a seeded random filter: it drops most hammer swings,
 * so mobs reach the modem, and now and then clicks a random control of a random open Ad.
 */
function sloppyBot(spec: BotRunSpec): Bot {
  const base = killerBot({ downloadAtSecond: spec.downloadAtSecond, collectPackets: spec.collectPackets });
  let rng = spec.botSeed >>> 0;
  const random = (): number => {
    const r = nextRandom(rng);
    rng = r.next;
    return r.value;
  };
  return (state) => {
    const cmds: InputCommand[] = base(state).filter((c) => c.type !== 'hammer' || random() < spec.hammerChance);
    const ads = state.ads?.ads ?? [];
    if (ads.length > 0 && random() < spec.clickChance) {
      const ad = ads[Math.floor(random() * ads.length)];
      const controls = controlsFor(ad);
      cmds.push({ type: 'adClick', adId: ad.id, control: controls[Math.floor(random() * controls.length)] });
    }
    return cmds;
  };
}
/** Download after this Tick's penalties (stage 4), i.e. the value stage 6 starts from. */
function downloadBeforeStage6(before: GameState, events: readonly GameEvent[]): number {
  let download = before.download;
  for (const e of events) if (e.type === 'downloadPenalty') download = e.download;
  return download;
}
/**
 * The default Chapter_Table with a dense Hook wave: a default zombie every 2 s from second 0.
 * Property 2's runs are short (2.5–6 %/s, 17–40 s), and the quiet default Hook (first zombie at
 * 8 s, then every 10 s; pacing-and-economy Req 2.1) plus a 20 s lane crossing let many of them
 * finish before any zombie reaches the modem, so the `damagedTicks > 0` guard failed on about
 * 1 run in 3. With this wave, zombies reach the modem from about 20 s, inside most runs. Only
 * this test uses it; the game defaults are unchanged.
 */
const EARLY_HOOK_CHAPTERS: readonly Chapter[] = DEFAULT_CHAPTER_TABLE.chapters.map((c) =>
  c.id === 'hook' ? { ...c, waves: [{ kind: 'default', everySeconds: 2, offsetSeconds: 0 }] } : c,
);
describe('Property 2', () => {
  // Property: Req 2.4, 3.2 each Tick's download step is >= 0 and never faster than full speed
  // Feature: ad-pressure, Property 2: Download never runs faster than full speed
  it('Property 2: download never runs faster than full speed', () => {
    const MAX_TICKS = 40 * TICK_RATE;
    let slowTicks = 0;
    let damagedTicks = 0;
    fc.assert(
      fc.property(arbBotRun, (spec) => {
        const systems = createGameSystems({
          ads: { bandwidthPerClutter: spec.bandwidthPerClutter, bandwidthFloor: spec.bandwidthFloor },
          chapters: { chapters: EARLY_HOOK_CHAPTERS },
        });
        const bot = sloppyBot(spec);
        let state = createRun({
          seed: spec.seed,
          balance: { ...FAST_CORE, downloadPercentPerSecond: spec.downloadPercentPerSecond, lineQualityFloor: spec.lineQualityFloor },
        });
        const maxStep = state.balance.downloadPercentPerSecond / TICK_RATE;
        while (state.phase !== 'won' && state.phase !== 'lost' && state.tick < MAX_TICKS) {
          const result = step(state, bot(state), systems);
          const base = downloadBeforeStage6(state, result.events);
          const moved = result.state.download - base;
          expect(moved).toBeGreaterThanOrEqual(0);
          expect(moved).toBeLessThanOrEqual(maxStep + EPSILON);
          if (result.state.phase === 'downloading' && moved > 0) {
            if ((result.state.bandwidth ?? 1) < 1) slowTicks++;
            if (result.state.integrity < result.state.balance.maxIntegrity) damagedTicks++;
          }
          state = result.state;
        }
      }),
      {
        numRuns: 25,
        // fast-check often draws 0 or 1 for bandwidthPerClutter / bandwidthFloor, and at those
        // values no Tick is slowed, so `slowTicks > 0` failed on some seeds. The counters add up
        // across runs, so this one fixed mid-range run (the default 15-point step and 40% floor,
        // no ad clicks, so clutter stays open) makes the guard hold. fast-check runs it first and
        // counts it toward numRuns, so 24 random runs follow.
        examples: [
          [
            {
              seed: 1,
              botSeed: 1,
              downloadPercentPerSecond: 3,
              lineQualityFloor: 0.6,
              bandwidthPerClutter: 0.15,
              bandwidthFloor: 0.4,
              downloadAtSecond: 3,
              hammerChance: 0.1,
              clickChance: 0,
              collectPackets: true,
            },
          ],
        ],
      },
    );
    // Guard against a vacuous pass: clutter and modem damage must actually slow some Ticks.
    expect(slowTicks).toBeGreaterThan(0);
    expect(damagedTicks).toBeGreaterThan(0);
  }, 60_000);
});
// ---------------------------------------------------------------------------------------------
// Property 3
/** Ticks a full download took under the pre-ad-pressure rule: `+= downloadPercentPerSecond / TICK_RATE`. */
function oldDownloadTicks(downloadPercentPerSecond: number): number {
  const perTick = downloadPercentPerSecond / TICK_RATE;
  let download = 0;
  let ticks = 0;
  while (download < 100 - EPSILON) {
    download += perTick;
    ticks++;
  }
  return ticks;
}
/** Gives the draft an empty Ad_State, so bandwidthSystem writes an explicit Bandwidth_Factor of 1. */
const noAds: System = (draft) => {
  draft.ads ??= initialAds(DEFAULT_AD_BALANCE);
};
describe('Property 3', () => {
  it('the default download is 8,100 un-paused Ticks (pacing-and-economy Req 1.1)', () => {
    expect(oldDownloadTicks(DEFAULT_CORE_BALANCE.downloadPercentPerSecond)).toBe(8100);
  });
  // Property: Req 2.5, 3.3 with no ads and no damage the download takes the same Tick count as before
  // Feature: ad-pressure, Property 3: Full health, no clutter = old timing
  it('Property 3: full health, no clutter = old timing', () => {
    fc.assert(
      fc.property(
        fc.record({
          seed: fc.nat(),
          downloadPercentPerSecond: fc.double({ min: 2, max: 20, noNaN: true }),
          lineQualityFloor: fc.double({ min: 0, max: 1, noNaN: true }),
          withBandwidthSystem: fc.boolean(),
        }),
        ({ seed, downloadPercentPerSecond, lineQualityFloor, withBandwidthSystem }) => {
          const expected = oldDownloadTicks(downloadPercentPerSecond);
          const systems = withBandwidthSystem ? [noAds, bandwidthSystem] : [];
          const run = createRun({ seed, balance: { ...FAST_CORE, downloadPercentPerSecond, lineQualityFloor } });
          let state = stepN(step, run, 121, { inputs: [{ tick: 121, command: { type: 'startDownload' } }], systems }).state;
          expect(state.phase).toBe('downloading');
          const startTick = state.tick;
          while (state.phase === 'downloading') state = step(state, [], systems).state;
          expect(state.phase).toBe('won');
          expect(state.download).toBe(100);
          expect(state.bandwidth).toBe(withBandwidthSystem ? 1 : undefined);
          // The first downloading Tick (121) already advances, so the win lands on Tick start + n - 1.
          expect(state.tick - startTick + 1).toBe(expected);
        },
      ),
      { numRuns: 40 },
    );
  }, 30_000);
});
// ---------------------------------------------------------------------------------------------
// Req 9.2
describe('GameState.bandwidth in a real Run (Req 9.2)', () => {
  it('survives a JSON round trip and the round-tripped Run keeps the same rate', () => {
    const systems = createGameSystems();
    const bot = killerBot({ downloadAtSecond: 2.5 });
    let state = createRun({ seed: 7, balance: FAST_CORE });
    // The forced first plain clutter opens at Tick 421 (FAST_CORE: ads first see `connected` on 121).
    while (state.tick < 480) state = step(state, bot(state), systems).state;
    expect(state.phase).toBe('downloading');
    expect(state.bandwidth).toBeDefined();
    expect(state.bandwidth!).toBeLessThan(1);
    const copy = JSON.parse(JSON.stringify(state)) as GameState;
    expect(copy.bandwidth).toBe(state.bandwidth);
    expect(downloadRate(copy)).toBe(downloadRate(state));
    const fromCopy = step(copy, [], createGameSystems()).state;
    const fromOriginal = step(state, [], createGameSystems()).state;
    expect(fromCopy.bandwidth).toBe(fromOriginal.bandwidth);
    expect(fromCopy.download).toBe(fromOriginal.download);
  });
});
