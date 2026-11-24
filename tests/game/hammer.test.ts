// Hammer tests: hit boxes, Hit_Priority, hit testing and the hammer system (Req 7.2–7.5).
// Property 9 (the cooldown model over whole lane runs) lives with the run properties.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DEFAULT_LANE_BALANCE, secondsToTicks } from '../../src/game/balance/lane';
import { compareHitPriority, hitBox, hitTest } from '../../src/game/hammer';
import { createLaneSystems } from '../../src/game/lane';
import { ENEMY_KINDS, type Enemy, type LaneState } from '../../src/game/laneTypes';
import { step } from '../../src/game/step';
import type { GameEvent, GameState, InputCommand } from '../../src/game/types';
import { laneWith, type EnemySpec } from '../helpers/lane';

// The default schedule first spawns on tick 480, so these short runs only hold the given Enemies.
const systems = createLaneSystems();
const COOLDOWN_TICKS = secondsToTicks(DEFAULT_LANE_BALANCE.hammer.cooldownSeconds);

const hammer = (x: number, y: number): InputCommand => ({ type: 'hammer', x, y });

/**
 * Steps `ticks` times from `state`. `clicks` maps a tick (the tick the step produces) to the
 * commands sent on that step. Returns every state and event.
 */
function run(
  state: GameState,
  ticks: number,
  clicks: Readonly<Record<number, readonly InputCommand[]>> = {},
) {
  const states: GameState[] = [state];
  const events: GameEvent[] = [];
  let s = state;
  for (let i = 0; i < ticks; i++) {
    const r = step(s, clicks[s.tick + 1] ?? [], systems);
    s = r.state;
    states.push(s);
    events.push(...r.events);
  }
  return { states, events, final: s };
}

const swings = (events: readonly GameEvent[]) => events.filter((e) => e.type === 'hammerSwing');
const lane = (state: GameState): LaneState => state.lane!;

describe('hitBox', () => {
  it('is anchored at the feet and padded on every side', () => {
    const enemy = lane(laneWith([{ kind: 'default', x: 400 }])).enemies[0];
    // Default Mob: 44 wide, 72 high.
    expect(hitBox(enemy, DEFAULT_LANE_BALANCE.enemies.default, 6)).toEqual({
      left: 372,
      right: 428,
      bottom: -6,
      top: 78,
    });
    expect(hitBox(enemy, DEFAULT_LANE_BALANCE.enemies.default, 0)).toEqual({
      left: 378,
      right: 422,
      bottom: 0,
      top: 72,
    });
  });
});

describe('hitTest', () => {
  // Default hitPadding is 6, so the default Mob at x 400 has the padded box [372, 428] × [-6, 78].
  const single = lane(laneWith([{ kind: 'default', x: 400 }]));

  it('hits on every padded edge and corner', () => {
    for (const [x, y] of [
      [372, -6],
      [428, -6],
      [372, 78],
      [428, 78],
      [372, 30],
      [428, 30],
      [400, -6],
      [400, 78],
    ] as const) {
      expect(hitTest(single, x, y)?.id, `(${x}, ${y})`).toBe(1);
    }
  });

  it('misses just outside the padded box and in empty space', () => {
    for (const [x, y] of [
      [371.99, 30],
      [428.01, 30],
      [400, -6.01],
      [400, 78.01],
      [100, 30],
    ] as const) {
      expect(hitTest(single, x, y), `(${x}, ${y})`).toBeNull();
    }
    expect(hitTest(lane(laneWith([])), 400, 30)).toBeNull();
  });

  it('prefers lower x over lower id among overlapping Enemies', () => {
    const overlap = lane(
      laneWith([
        { kind: 'default', x: 400, id: 1 },
        { kind: 'default', x: 390, id: 3 },
      ]),
    );
    expect(hitTest(overlap, 400, 30)?.id).toBe(3); // both contain the point; x 390 beats 400
    expect(hitTest(overlap, 425, 30)?.id).toBe(1); // only the Mob at 400 reaches 425 (418 < 425)
  });

  it('breaks a tie on x with the lower id', () => {
    const tied = lane(
      laneWith([
        { kind: 'default', x: 390, id: 3 },
        { kind: 'tank', x: 390, id: 2 },
        { kind: 'default', x: 390, id: 5 },
      ]),
    );
    expect(hitTest(tied, 390, 30)?.id).toBe(2);
    // Above the default Mobs (top 78) only the tank (96 high, top 102) remains.
    expect(hitTest(tied, 390, 90)?.id).toBe(2);
    const defaults = lane(
      laneWith([
        { kind: 'default', x: 390, id: 5 },
        { kind: 'default', x: 390, id: 3 },
      ]),
    );
    expect(hitTest(defaults, 390, 30)?.id).toBe(3);
  });

  it('compareHitPriority orders by x, then id', () => {
    const [a, b, c] = lane(
      laneWith([
        { kind: 'default', x: 400, id: 1 },
        { kind: 'default', x: 390, id: 2 },
        { kind: 'fast', x: 390, id: 3 },
      ]),
    ).enemies;
    expect(compareHitPriority(b, a)).toBeLessThan(0);
    expect(compareHitPriority(a, b)).toBeGreaterThan(0);
    expect(compareHitPriority(b, c)).toBeLessThan(0);
    expect(compareHitPriority(c, c)).toBe(0);
  });
});

describe('hammerSystem', () => {
  it('a click on a Mob deals 1 damage and emits hammerSwing with its id', () => {
    const { final, events } = run(laneWith([{ kind: 'default', x: 400 }]), 1, {
      1: [hammer(400, 30)],
    });
    expect(events).toEqual([
      { type: 'hammerSwing', x: 400, y: 30, targetId: 1, tick: 1 },
      { type: 'mobHit', id: 1, kind: 'default', damage: 1, hp: 1, tick: 1 },
    ]);
    expect(lane(final).enemies[0].hp).toBe(1);
    expect(lane(final).hammerReadyTick).toBe(1 + COOLDOWN_TICKS);
  });

  it('the cooldown is 18 ticks: a click 17 ticks after a swing is ignored, one 18 ticks after is accepted', () => {
    expect(COOLDOWN_TICKS).toBe(18);
    const start = laneWith([{ kind: 'tank', x: 400 }]);

    // A second click on the same tick is ignored too (Req 7.3).
    const early = run(start, 18, { 1: [hammer(400, 30), hammer(400, 30)], 18: [hammer(400, 30)] });
    expect(swings(early.events)).toEqual([
      { type: 'hammerSwing', x: 400, y: 30, targetId: 1, tick: 1 },
    ]);
    expect(early.events.filter((e) => e.tick === 18)).toEqual([]);
    expect(lane(early.final).enemies[0].hp).toBe(3);
    expect(lane(early.final).hammerReadyTick).toBe(19);

    const onTime = run(start, 19, { 1: [hammer(400, 30)], 19: [hammer(400, 30)] });
    expect(swings(onTime.events).map((e) => e.tick)).toEqual([1, 19]);
    expect(lane(onTime.final).enemies[0].hp).toBe(2);
    expect(lane(onTime.final).hammerReadyTick).toBe(37);
  });

  it('a miss emits hammerSwing with a null target and starts the cooldown', () => {
    const start = laneWith([{ kind: 'tank', x: 400 }]);
    const { events, final } = run(start, 19, {
      1: [hammer(100, 10)],
      18: [hammer(400, 30)],
      19: [hammer(400, 30)],
    });
    expect(swings(events)).toEqual([
      { type: 'hammerSwing', x: 100, y: 10, targetId: null, tick: 1 },
      { type: 'hammerSwing', x: 400, y: 30, targetId: 1, tick: 19 },
    ]);
    expect(lane(final).enemies[0].hp).toBe(3);
  });

  it('a non-finite point neither swings nor starts the cooldown', () => {
    const start = laneWith([{ kind: 'tank', x: 400 }]);
    const nonFinite = run(start, 1, {
      1: [
        hammer(Number.NaN, 30),
        hammer(400, Number.NaN),
        hammer(Number.POSITIVE_INFINITY, 30),
        hammer(400, Number.NEGATIVE_INFINITY),
      ],
    });
    expect(nonFinite.events).toEqual([]);
    expect(lane(nonFinite.final).hammerReadyTick).toBe(0);
    expect(lane(nonFinite.final).enemies[0].hp).toBe(4);

    // A finite click after a NaN on the same tick is still accepted.
    const after = run(start, 1, { 1: [hammer(Number.NaN, 30), hammer(400, 30)] });
    expect(swings(after.events)).toEqual([
      { type: 'hammerSwing', x: 400, y: 30, targetId: 1, tick: 1 },
    ]);
    expect(lane(after.final).hammerReadyTick).toBe(19);
  });

  it('a click on a padded edge hits', () => {
    // The hammer runs before Mobs move, so the Mob is still at x 400 on tick 1.
    const { events } = run(laneWith([{ kind: 'default', x: 400 }]), 1, { 1: [hammer(428, 78)] });
    expect(swings(events)).toEqual([
      { type: 'hammerSwing', x: 428, y: 78, targetId: 1, tick: 1 },
    ]);
    expect(events.map((e) => e.type)).toContain('mobHit');
  });

  it('overlapping Enemies: the swing hits the lower x, then the lower id', () => {
    const start = laneWith([
      { kind: 'default', x: 400, id: 1 },
      { kind: 'default', x: 390, id: 3 },
      { kind: 'default', x: 390, id: 2 },
    ]);
    const { events, final } = run(start, 1, { 1: [hammer(400, 30)] });
    expect(swings(events)).toEqual([
      { type: 'hammerSwing', x: 400, y: 30, targetId: 2, tick: 1 },
    ]);
    expect(lane(final).enemies.map((e) => [e.id, e.hp])).toEqual([
      [1, 2],
      [2, 1],
      [3, 2],
    ]);
  });
});

// ---------------------------------------------------------------------------------------------
// Property 8

/** Brute-force oracle: every Enemy whose padded box contains the point, sorted by (x, id). */
function oracle(l: LaneState, x: number, y: number): Enemy | null {
  const p = l.balance.hitPadding;
  const containing = l.enemies.filter((e) => {
    const { width, height } = l.balance.enemies[e.kind];
    const left = e.x - width / 2 - p;
    const right = e.x + width / 2 + p;
    return x >= left && x <= right && y >= -p && y <= height + p;
  });
  containing.sort((a, b) => (a.x !== b.x ? a.x - b.x : a.id - b.id));
  return containing[0] ?? null;
}

/** Lane_X values: a few shared values make ties on x common. */
const arbX = fc.oneof(
  fc.constantFrom(100, 390, 400, 410),
  fc.double({ min: 0, max: 800, noNaN: true }).map((v) => v + 0),
);

const arbEnemies: fc.Arbitrary<EnemySpec[]> = fc
  .array(fc.record({ kind: fc.constantFrom(...ENEMY_KINDS), x: arbX }), { maxLength: 8 })
  .chain((specs) =>
    fc
      .uniqueArray(fc.integer({ min: 1, max: 40 }), {
        minLength: specs.length,
        maxLength: specs.length,
      })
      .map((ids) => specs.map((s, i): EnemySpec => ({ ...s, id: ids[i] }))),
  );

/** A point: raw, near an Enemy, or exactly on a padded edge of an Enemy. */
type PointAim =
  | { readonly kind: 'raw'; readonly x: number; readonly y: number }
  | { readonly kind: 'near'; readonly index: number; readonly dx: number; readonly y: number }
  | {
      readonly kind: 'edge';
      readonly index: number;
      readonly side: 'left' | 'right' | 'bottom' | 'top';
      readonly t: number;
    };

const arbPoint: fc.Arbitrary<PointAim> = fc.oneof(
  fc.record({
    kind: fc.constant('raw' as const),
    x: fc.double({ min: -100, max: 900, noNaN: true }),
    y: fc.double({ min: -40, max: 200, noNaN: true }),
  }),
  fc.record({
    kind: fc.constant('near' as const),
    index: fc.nat(),
    dx: fc.double({ min: -90, max: 90, noNaN: true }),
    y: fc.double({ min: -30, max: 190, noNaN: true }),
  }),
  fc.record({
    kind: fc.constant('edge' as const),
    index: fc.nat(),
    side: fc.constantFrom('left' as const, 'right' as const, 'bottom' as const, 'top' as const),
    t: fc.double({ min: 0, max: 1, noNaN: true }),
  }),
);

function pointFor(aim: PointAim, l: LaneState): { x: number; y: number } {
  if (aim.kind === 'raw' || l.enemies.length === 0) {
    return aim.kind === 'raw' ? { x: aim.x, y: aim.y } : { x: 400, y: 30 };
  }
  const enemy = l.enemies[aim.index % l.enemies.length];
  if (aim.kind === 'near') return { x: enemy.x + aim.dx, y: aim.y };
  const box = hitBox(enemy, l.balance.enemies[enemy.kind], l.balance.hitPadding);
  const along = (a: number, b: number) => a + (b - a) * aim.t;
  switch (aim.side) {
    case 'left':
      return { x: box.left, y: along(box.bottom, box.top) };
    case 'right':
      return { x: box.right, y: along(box.bottom, box.top) };
    case 'bottom':
      return { x: along(box.left, box.right), y: box.bottom };
    case 'top':
      return { x: along(box.left, box.right), y: box.top };
  }
}

describe('Property 8', () => {
  it('the hammer hits the first Enemy in Hit_Priority under the point', () => {
    // Feature: connection-lane, Property 8: The hammer hits the first Enemy in Hit_Priority under the point
    // Property: Req 7.2 a swing damages the first Enemy in Hit_Priority whose padded Hit_Box contains the point
    fc.assert(
      fc.property(
        arbEnemies,
        fc.integer({ min: 0, max: 20 }),
        arbPoint,
        (enemies, hitPadding, aim) => {
          const state = laneWith(enemies, { hitPadding });
          const l = lane(state);
          const { x, y } = pointFor(aim, l);
          const expected = oracle(l, x, y);

          const got = hitTest(l, x, y);
          expect(got).toEqual(expected);

          // The hammer system on a ready Hammer swings at the same Enemy and damages only it.
          const r = step(state, [hammer(x, y)], systems);
          const swing = r.events.filter((e) => e.type === 'hammerSwing');
          expect(swing).toEqual([
            { type: 'hammerSwing', x, y, targetId: expected?.id ?? null, tick: 1 },
          ]);
          const hits = r.events.flatMap((e) => (e.type === 'mobHit' ? [e.id] : []));
          expect(hits).toEqual(expected === null ? [] : [expected.id]);
        },
      ),
      { numRuns: 200 },
    );
  });
});
