// Ad balance defaults and validation (browser-front Req 2.1–2.3, ad-pressure Req 2.1, 4.1).
import { describe, expect, it } from 'vitest';
import {
  AdBalanceError,
  DEFAULT_AD_BALANCE,
  resolveAdBalance,
  type AdBalanceOverrides,
} from '../../../src/game/balance/ads';
import { desktopArea, LANE_DOCK_H } from '../../../src/desktop/layout';

/** Pass a deliberately wrong value through the typed override API. */
const loose = (o: Record<string, unknown>): AdBalanceOverrides => o as AdBalanceOverrides;

function problemsOf(overrides: AdBalanceOverrides): readonly string[] {
  try {
    resolveAdBalance(overrides);
  } catch (e) {
    expect(e).toBeInstanceOf(AdBalanceError);
    return (e as AdBalanceError).problems;
  }
  throw new Error('expected resolveAdBalance to throw');
}

describe('DEFAULT_AD_BALANCE', () => {
  it('has the design scalars, including bandwidth and hatch timing (ad-pressure Req 2.1, 4.1)', () => {
    const b = DEFAULT_AD_BALANCE;
    expect({
      fakePenalty: b.fakePenalty,
      fakeLifetimeSeconds: b.fakeLifetimeSeconds,
      fakeRange: b.fakeRange,
      rewardKb: b.rewardKb,
      countdownSeconds: b.countdownSeconds,
      runawayJumps: b.runawayJumps,
      cap: b.cap,
      mistakeExtras: b.mistakeExtras,
      firstClutterDelaySeconds: b.firstClutterDelaySeconds,
      bandwidthPerClutter: b.bandwidthPerClutter,
      bandwidthFloor: b.bandwidthFloor,
      hatchSeconds: b.hatchSeconds,
      hatchWarningSeconds: b.hatchWarningSeconds,
    }).toEqual({
      fakePenalty: 20,
      fakeLifetimeSeconds: 8,
      fakeRange: 120,
      rewardKb: 3,
      countdownSeconds: 3,
      runawayJumps: 3,
      cap: 8,
      mistakeExtras: 1,
      firstClutterDelaySeconds: 5,
      bandwidthPerClutter: 0.15,
      bandwidthFloor: 0.4,
      hatchSeconds: 10,
      hatchWarningSeconds: 3,
    });
  });

  it('has laneArea over the Lane_Dock (ad-pressure Req 6.1)', () => {
    expect(DEFAULT_AD_BALANCE.laneArea).toEqual({ x: 0, y: 480, w: 1024, h: 260 });
  });

  it('keeps laneArea equal to the Lane_Dock rect from src/desktop/layout.ts', () => {
    // The Lane_Dock sits right under the session Desktop_Area and is LANE_DOCK_H tall.
    const area = desktopArea(true);
    expect(DEFAULT_AD_BALANCE.laneArea).toEqual({ x: 0, y: area.h, w: area.w, h: LANE_DOCK_H });
  });

  it('is what resolveAdBalance returns with no overrides', () => {
    expect(resolveAdBalance()).toEqual(DEFAULT_AD_BALANCE);
    expect(resolveAdBalance({})).toEqual(DEFAULT_AD_BALANCE);
    expect(Object.isFrozen(resolveAdBalance())).toBe(true);
  });
});

describe('resolveAdBalance: bandwidth keys (ad-pressure Req 2.1)', () => {
  it('merges the bandwidth keys like the other scalars', () => {
    const b = resolveAdBalance({ bandwidthPerClutter: 0.2, bandwidthFloor: 0.5 });
    expect(b).toEqual({ ...DEFAULT_AD_BALANCE, bandwidthPerClutter: 0.2, bandwidthFloor: 0.5 });
  });

  it('accepts both ends of [0, 1]', () => {
    expect(resolveAdBalance({ bandwidthPerClutter: 0, bandwidthFloor: 1 })).toMatchObject({
      bandwidthPerClutter: 0,
      bandwidthFloor: 1,
    });
    expect(resolveAdBalance({ bandwidthPerClutter: 1, bandwidthFloor: 0 })).toMatchObject({
      bandwidthPerClutter: 1,
      bandwidthFloor: 0,
    });
  });

  it('rejects values outside [0, 1]', () => {
    expect(problemsOf({ bandwidthPerClutter: -0.01 })).toEqual(['bandwidthPerClutter must be in [0, 1], got -0.01']);
    expect(problemsOf({ bandwidthFloor: 1.5 })).toEqual(['bandwidthFloor must be in [0, 1], got 1.5']);
  });

  it('rejects non-numbers and lists every problem at once', () => {
    expect(problemsOf(loose({ bandwidthPerClutter: '0.15', bandwidthFloor: Number.POSITIVE_INFINITY, cap: 0 }))).toEqual([
      'cap must be an integer >= 1, got 0',
      'bandwidthPerClutter must be a finite number, got "0.15"',
      'bandwidthFloor must be a finite number, got Infinity',
    ]);
  });
});

describe('resolveAdBalance: hatch timing (ad-pressure Req 4.1)', () => {
  it('merges the hatch keys like the other scalars', () => {
    const b = resolveAdBalance({ hatchSeconds: 6, hatchWarningSeconds: 2 });
    expect(b).toEqual({ ...DEFAULT_AD_BALANCE, hatchSeconds: 6, hatchWarningSeconds: 2 });
    expect(DEFAULT_AD_BALANCE.hatchSeconds).toBe(10);
  });

  it('accepts the bounds: one Tick, a zero warning and a warning equal to hatchSeconds', () => {
    expect(resolveAdBalance({ hatchSeconds: 1 / 60, hatchWarningSeconds: 0 }).hatchSeconds).toBe(1 / 60);
    expect(resolveAdBalance({ hatchSeconds: 4, hatchWarningSeconds: 4 }).hatchWarningSeconds).toBe(4);
  });

  it.each([
    ['zero', 0],
    ['under half a Tick', 0.008],
    ['negative', -5],
  ])('rejects a hatchSeconds that rounds to less than 1 Tick (%s)', (_label, hatchSeconds) => {
    // The default warning (3 s) is not checked against an invalid hatchSeconds.
    expect(problemsOf({ hatchSeconds })).toEqual([
      `hatchSeconds must be at least 1 tick after Math.round(seconds × 60), got ${hatchSeconds}`,
    ]);
  });

  it('rejects a negative hatchWarningSeconds', () => {
    expect(problemsOf({ hatchWarningSeconds: -1 })).toEqual(['hatchWarningSeconds must be >= 0, got -1']);
  });

  it('rejects a hatchWarningSeconds above hatchSeconds, including the default warning', () => {
    expect(problemsOf({ hatchWarningSeconds: 10.5 })).toEqual([
      'hatchWarningSeconds must be in [0, hatchSeconds (10)], got 10.5',
    ]);
    expect(problemsOf({ hatchSeconds: 2 })).toEqual(['hatchWarningSeconds must be in [0, hatchSeconds (2)], got 3']);
  });

  it('rejects non-numbers and lists every problem at once', () => {
    expect(problemsOf(loose({ hatchSeconds: '10', hatchWarningSeconds: Number.NaN, cap: 0 }))).toEqual([
      'cap must be an integer >= 1, got 0',
      'hatchSeconds must be a finite number, got "10"',
      'hatchWarningSeconds must be a finite number, got NaN',
    ]);
  });
});

describe('resolveAdBalance: laneArea (ad-pressure Req 6.1)', () => {
  it('merges laneArea field by field like the other rects', () => {
    const b = resolveAdBalance({ laneArea: { y: 500, h: 200 } });
    expect(b.laneArea).toEqual({ x: 0, y: 500, w: 1024, h: 200 });
    expect(b).toEqual({ ...DEFAULT_AD_BALANCE, laneArea: { x: 0, y: 500, w: 1024, h: 200 } });
  });

  it('accepts a laneArea exactly the clutter size, touching the field edge', () => {
    const laneArea = { x: 1024 - 300, y: 740 - 180, w: 300, h: 180 };
    expect(resolveAdBalance({ laneArea }).laneArea).toEqual(laneArea);
  });

  it('rejects non-integer and non-positive values', () => {
    expect(problemsOf({ laneArea: { x: 0.5, w: 0 } })).toEqual([
      'laneArea.x must be an integer, got 0.5',
      'laneArea.w must be an integer >= 1, got 0',
    ]);
    expect(problemsOf(loose({ laneArea: { y: '480' } }))).toEqual(['laneArea.y must be a finite number, got "480"']);
    expect(problemsOf(loose({ laneArea: 7 }))).toEqual(['laneArea must be an object, got 7']);
  });

  it('rejects a laneArea outside the field', () => {
    expect(problemsOf({ laneArea: { y: 600 } })).toEqual(['laneArea must lie inside field']);
    expect(problemsOf({ field: { h: 700 } })).toEqual(['laneArea must lie inside field']);
  });

  it('rejects a laneArea that a clutter Ad does not fit in', () => {
    expect(problemsOf({ laneArea: { h: 179 } })).toEqual(['laneArea (1024 × 179) must fit sizes.clutter (300 × 180)']);
    expect(problemsOf({ sizes: { clutter: { w: 1024, h: 261 } } })).toEqual([
      'laneArea (1024 × 260) must fit sizes.clutter (1024 × 261)',
    ]);
  });

  it('lists every laneArea problem at once', () => {
    expect(problemsOf({ laneArea: { x: 900, w: 200, h: 100 } })).toEqual([
      'laneArea must lie inside field',
      'laneArea (200 × 100) must fit sizes.clutter (300 × 180)',
    ]);
  });
});
