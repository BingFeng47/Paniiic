import { describe, expect, it } from 'vitest';
import { DEFAULT_CORE_BALANCE } from '../../src/game/balance/core';
import { DEFAULT_MAX_SECONDS, runHeadless, type ScriptedInput } from '../../src/game/headless';
import { TICK_RATE, type Phase } from '../../src/game/types';
import { scheduledDamage, scheduledPenalty } from '../helpers/game';

const START_AT_1201: readonly ScriptedInput[] = [{ tick: 1201, command: { type: 'startDownload' } }];

/** [type, tick] pairs for compact event-log assertions. */
function timeline(events: readonly { type: string; tick: number }[]): [string, number][] {
  return events.map((e) => [e.type, e.tick]);
}

describe('runHeadless: perfect run (Req 7.1, 7.2)', () => {
  const result = runHeadless({ seed: 7, script: START_AT_1201 });

  it('wins at tick 9,300 (155 s) with the expected events', () => {
    expect(result.endedBy).toBe('won');
    expect(result.final.tick).toBe(9300);
    expect(result.final.phase).toBe('won');
    expect(result.final.download).toBe(100);
    expect(result.final.integrity).toBe(100);
    expect(timeline(result.events)).toEqual([
      ['connected', 1200],
      ['downloadStarted', 1201],
      ['downloadHalfway', 5250],
      ['won', 9300],
    ]);
  });

  it('samples every second from 0 to 155 with phases and download in order', () => {
    const { samples } = result;
    expect(samples.map((s) => s.second)).toEqual(Array.from({ length: 156 }, (_, i) => i));
    expect(samples.every((s) => s.integrity === 100)).toBe(true);

    const expectedPhase = (second: number): Phase =>
      second < 20 ? 'dialing' : second === 20 ? 'connected' : second < 155 ? 'downloading' : 'won';
    expect(samples.map((s) => s.phase)).toEqual(samples.map((s) => expectedPhase(s.second)));

    for (let i = 1; i < samples.length; i++) {
      expect(samples[i]!.download).toBeGreaterThanOrEqual(samples[i - 1]!.download);
    }
    expect(samples.filter((s) => s.second <= 20).every((s) => s.download === 0)).toBe(true);
    expect(samples[101]!.download).toBeCloseTo(60, 9); // 81 s of progress at 100/135 %/s
    expect(samples[155]!.download).toBe(100);
  });

  it('never delivers script entries for ticks after the run ended', () => {
    const late = runHeadless({
      seed: 7,
      script: [...START_AT_1201, { tick: 10000, command: { type: 'startDownload' } }],
    });
    expect(late).toStrictEqual(result);
  });
});

describe('runHeadless: timeout (Req 7.2)', () => {
  it('times out at the default 300 s when startDownload never arrives', () => {
    const result = runHeadless({ seed: 3 });
    expect(DEFAULT_MAX_SECONDS).toBe(300);
    expect(result.endedBy).toBe('timeout');
    expect(result.final.tick).toBe(18000);
    expect(result.final.phase).toBe('connected');
    expect(result.final.download).toBe(0);
    expect(timeline(result.events)).toEqual([['connected', 1200]]);
    expect(result.samples).toHaveLength(301);
    expect(result.samples.at(-1)).toEqual({
      second: 300,
      phase: 'connected',
      integrity: 100,
      download: 0,
    });
  });

  it('honours a custom maxSeconds, including one that cuts off mid-download', () => {
    const idle = runHeadless({ seed: 3, maxSeconds: 30 });
    expect(idle.endedBy).toBe('timeout');
    expect(idle.final.tick).toBe(1800);
    expect(idle.final.phase).toBe('connected');

    const cut = runHeadless({ seed: 3, script: START_AT_1201, maxSeconds: 60 });
    expect(cut.endedBy).toBe('timeout');
    expect(cut.final.tick).toBe(3600);
    expect(cut.final.phase).toBe('downloading');
    expect(cut.final.download).toBeGreaterThan(0);
    expect(cut.final.download).toBeLessThan(50);
  });

  it('ends by won, not timeout, when the win lands on the last allowed tick', () => {
    const result = runHeadless({ seed: 3, script: START_AT_1201, maxSeconds: 155 });
    expect(result.endedBy).toBe('won');
    expect(result.final.tick).toBe(9300);
  });
});

describe('runHeadless: systems', () => {
  it('ends by lost when scheduled damage drains the modem during dialing', () => {
    const result = runHeadless({
      seed: 5,
      systems: [scheduledDamage([{ tick: 300, amount: 60 }, { tick: 630, amount: 40 }])],
    });
    expect(result.endedBy).toBe('lost');
    expect(result.final.tick).toBe(630);
    expect(result.final.integrity).toBe(0);
    expect(timeline(result.events)).toEqual([
      ['modemHit', 300],
      ['modemHit', 630],
      ['integrityCritical', 630],
      ['lost', 630],
    ]);
    // Whole seconds 0..10, then the fractional final tick at 10.5 s.
    expect(result.samples.map((s) => s.second)).toEqual([...Array.from({ length: 11 }, (_, i) => i), 10.5]);
    expect(result.samples[5]!.integrity).toBe(40);
    expect(result.samples.at(-1)).toEqual({ second: 10.5, phase: 'lost', integrity: 0, download: 0 });
  });

  it('a download penalty delays the win', () => {
    // 10% of 100/135 %/s is 13.5 s of extra download time: 810 ticks.
    const result = runHeadless({
      seed: 5,
      script: START_AT_1201,
      systems: [scheduledPenalty([{ tick: 3000, amount: 10 }])],
    });
    expect(result.endedBy).toBe('won');
    expect(result.final.tick).toBeGreaterThanOrEqual(9300 + 809);
    expect(result.final.tick).toBeLessThanOrEqual(9300 + 811);
  });
});

describe('runHeadless: balance overrides (Req 7.3)', () => {
  it('uses overrides for that run only', () => {
    const before = { ...DEFAULT_CORE_BALANCE };

    // 5 s dial (connected at tick 300), 10 %/s download (600 ticks): won at tick 900.
    const fast = runHeadless({
      seed: 9,
      balance: { dialSeconds: 5, downloadPercentPerSecond: 10 },
      script: [{ tick: 301, command: { type: 'startDownload' } }],
    });
    expect(fast.endedBy).toBe('won');
    expect(fast.final.balance.dialSeconds).toBe(5);
    expect(fast.final.balance.downloadPercentPerSecond).toBe(10);
    expect(fast.final.tick).toBe(900);
    expect(timeline(fast.events)).toEqual([
      ['connected', 300],
      ['downloadStarted', 301],
      ['downloadHalfway', 600],
      ['won', 900],
    ]);

    // The next run without overrides is back on the defaults.
    const plain = runHeadless({ seed: 9, script: START_AT_1201 });
    expect(plain.final.balance).toStrictEqual(DEFAULT_CORE_BALANCE);
    expect(plain.events.find((e) => e.type === 'connected')?.tick).toBe(1200);
    expect(plain.final.tick).toBe(9300);
    expect({ ...DEFAULT_CORE_BALANCE }).toStrictEqual(before);
  });

  it('rejects invalid overrides before running', () => {
    expect(() => runHeadless({ seed: 1, balance: { dialSeconds: -1 } })).toThrow(/dialSeconds/);
  });
});

describe('runHeadless: determinism (Req 1.2, 7.1)', () => {
  it('gives identical results for identical options', () => {
    const options = {
      seed: 42,
      script: START_AT_1201,
      systems: [scheduledDamage([{ tick: 2000, amount: 85 }]), scheduledPenalty([{ tick: 2500, amount: 5 }])],
    };
    const a = runHeadless(options);
    const b = runHeadless(options);
    expect(a).toStrictEqual(b);
    expect(a.endedBy).toBe('won');
    expect(a.final.integrity).toBe(15);
  });
});

describe('runHeadless (smoke)', () => {
  it('samples second 0, every whole second, and a fractional final tick without duplicates', () => {
    const result = runHeadless({ seed: 1, maxSeconds: 2.5 });
    expect(result.endedBy).toBe('timeout');
    expect(result.final.tick).toBe(2.5 * TICK_RATE);
    expect(result.samples.map((s) => s.second)).toEqual([0, 1, 2, 2.5]);
    expect(result.samples[0]).toEqual({ second: 0, phase: 'dialing', integrity: 100, download: 0 });
  });

  it('does not duplicate the final sample when the run stops on a whole second', () => {
    const result = runHeadless({ seed: 1, maxSeconds: 3 });
    expect(result.samples.map((s) => s.second)).toEqual([0, 1, 2, 3]);
  });

  it('rejects invalid maxSeconds and script ticks', () => {
    for (const maxSeconds of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => runHeadless({ seed: 1, maxSeconds })).toThrow(/maxSeconds/);
    }
    for (const tick of [0, -3, 1.5, Number.NaN]) {
      expect(() =>
        runHeadless({ seed: 1, maxSeconds: 1, script: [{ tick, command: { type: 'startDownload' } }] }),
      ).toThrow(/script ticks/);
    }
  });
});
