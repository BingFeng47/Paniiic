import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { Enemy } from '../../../src/game/laneTypes';
import { TICK_RATE } from '../../../src/game/types';
import {
  ANIMATION_FPS,
  ATTACK_TICKS,
  ENTITY_LOOKS,
  HIT_FLASH_TICKS,
  LOOPING,
  type AnimationName,
} from '../../../src/render/sprites/entities';
import { enemyAnimation, frameIndex } from '../../../src/render/sprites/frames';
import { laneWith, type EnemySpec } from '../../helpers/lane';

describe('frameIndex edge cases', () => {
  it('returns 0 for counts of 0 and 1 and for non-finite counts', () => {
    expect(frameIndex('walk', 100, 0)).toBe(0);
    expect(frameIndex('die', 100, 1)).toBe(0);
    expect(frameIndex('walk', 100, Number.NaN)).toBe(0);
  });

  it('treats negative and non-finite ages as 0', () => {
    expect(frameIndex('walk', -30, 4)).toBe(0);
    expect(frameIndex('die', Number.NaN, 4)).toBe(0);
    expect(frameIndex('die', Number.POSITIVE_INFINITY, 4)).toBe(0);
  });

  it('loops walk and holds die on the last frame', () => {
    // walk is 8 fps: 30 ticks → floor(4) → 4 mod 4 = 0; die is 10 fps: 60 ticks → 10 → held at 3.
    expect(frameIndex('walk', 30, 4)).toBe(0);
    expect(frameIndex('walk', 8, 4)).toBe(1);
    expect(frameIndex('die', 60, 4)).toBe(3);
  });

  it('floors a fractional count', () => {
    // walk at 8 fps: 23 ticks → floor(3.07) = 3; 3 mod floor(3.9) = 0.
    expect(frameIndex('walk', 23, 3.9)).toBe(0);
    expect(frameIndex('die', 600, 3.9)).toBe(2);
  });
});

const ANIMATIONS = Object.keys(ANIMATION_FPS) as AnimationName[];
const arbAnimation = fc.constantFrom(...ANIMATIONS);

/** Ages of at least 0 Ticks: whole ticks, fractional ticks and very large values. */
const arbValidAge = fc.oneof(
  fc.integer({ min: 0, max: 100_000 }),
  fc.double({ min: 0, max: 1e6, noNaN: true }).map((v) => v + 0),
  fc.constantFrom(0, Number.MAX_SAFE_INTEGER, Number.MAX_VALUE),
);

/** Any age, including negative and non-finite ones. */
const arbAnyAge = fc.oneof(
  { arbitrary: arbValidAge, weight: 4 },
  { arbitrary: fc.double({ noNaN: false }), weight: 1 },
  {
    arbitrary: fc.constantFrom(
      -1,
      -0,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      -Number.MAX_VALUE,
    ),
    weight: 1,
  },
);

/** Any count, including 0, fractional, negative and non-finite ones. */
const arbAnyCount = fc.oneof(
  { arbitrary: fc.integer({ min: 0, max: 64 }), weight: 4 },
  { arbitrary: fc.double({ min: 0, max: 64, noNaN: true }), weight: 2 },
  {
    arbitrary: fc.constantFrom(
      -3,
      -0,
      0.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
    ),
    weight: 1,
  },
);

/** The number of frames frameIndex can index into: floor(count) when finite and at least 1. */
function usableCount(count: number): number {
  return Number.isFinite(count) && count >= 1 ? Math.floor(count) : 1;
}

describe('Property 14', () => {
  it('frame selection stays in range and loops or holds', () => {
    // Feature: connection-lane, Property 14: Frame selection stays in range and loops or holds
    // Property: Req 13.8 for any animation, age and count the index is an integer in [0, max(count, 1) − 1]
    fc.assert(
      fc.property(arbAnimation, arbAnyAge, arbAnyCount, (animation, age, count) => {
        const index = frameIndex(animation, age, count);
        expect(Number.isInteger(index)).toBe(true);
        expect(index).toBeGreaterThanOrEqual(0);
        expect(index).toBeLessThanOrEqual(usableCount(count) - 1);
      }),
      { numRuns: 300 },
    );

    // Property: Req 13.8 for a count of at least 1 and an age of at least 0, idle/walk/use give
    // floor(age × fps / 60) mod count and attack/hit/die give min(floor(age × fps / 60), count − 1)
    fc.assert(
      fc.property(
        arbAnimation,
        fc.integer({ min: 0, max: 100_000 }),
        fc.integer({ min: 1, max: 64 }),
        (animation, age, count) => {
          const raw = Math.floor((age * ANIMATION_FPS[animation]) / TICK_RATE);
          const expected = LOOPING.has(animation) ? raw % count : Math.min(raw, count - 1);
          expect(frameIndex(animation, age, count)).toBe(expected);
        },
      ),
      { numRuns: 200 },
    );

    // Property: Req 13.8 a looping animation shows the same frame one full cycle later
    fc.assert(
      fc.property(
        fc.constantFrom(...ANIMATIONS.filter((a) => LOOPING.has(a))),
        fc.integer({ min: 0, max: 100_000 }),
        fc.integer({ min: 1, max: 64 }),
        (animation, age, count) => {
          // One cycle is count × 60 / fps ticks; count × 60 whole ticks is a whole number of cycles.
          const later = age + count * TICK_RATE;
          expect(frameIndex(animation, later, count)).toBe(frameIndex(animation, age, count));
        },
      ),
      { numRuns: 100 },
    );

    // Property: Req 13.8 a one-shot animation never steps back as it ages and holds its last frame
    fc.assert(
      fc.property(
        fc.constantFrom(...ANIMATIONS.filter((a) => !LOOPING.has(a))),
        arbValidAge,
        arbValidAge,
        fc.integer({ min: 1, max: 64 }),
        (animation, a, b, count) => {
          const [younger, older] = a <= b ? [a, b] : [b, a];
          expect(frameIndex(animation, younger, count)).toBeLessThanOrEqual(
            frameIndex(animation, older, count),
          );
          // At count × 60 ticks every fps (≥ 1) has passed count frames, so the last one is held.
          const done = count * TICK_RATE + younger;
          expect(frameIndex(animation, done, count)).toBe(count - 1);
        },
      ),
      { numRuns: 200 },
    );
  });
});

function enemy(spec: EnemySpec): Enemy {
  return laneWith([spec]).lane!.enemies[0];
}

describe('enemyAnimation', () => {
  it('shows hit for HIT_FLASH_TICKS (6) after a hit, then walk aged from spawn', () => {
    expect(HIT_FLASH_TICKS).toBe(6);
    const mob = enemy({ kind: 'default', spawnTick: 4, lastHitTick: 10 });
    expect(enemyAnimation(mob, 10)).toEqual({ animation: 'hit', age: 0 });
    expect(enemyAnimation(mob, 15)).toEqual({ animation: 'hit', age: 5 });
    expect(enemyAnimation(mob, 16)).toEqual({ animation: 'walk', age: 12 });
  });

  it('shows walk before a recorded hit tick and when never hit', () => {
    expect(enemyAnimation(enemy({ kind: 'tank', lastHitTick: 10 }), 9)).toEqual({
      animation: 'walk',
      age: 9,
    });
    expect(enemyAnimation(enemy({ kind: 'boss', spawnTick: 30 }), 50)).toEqual({
      animation: 'walk',
      age: 20,
    });
  });

  it('shows attack for ATTACK_TICKS (12) after a ranged spit, then idle while stopped', () => {
    expect(ATTACK_TICKS).toBe(12);
    const ranged = enemy({ kind: 'ranged', spawnTick: 20, lastSpitTick: 100, nextSpitTick: 280 });
    expect(enemyAnimation(ranged, 100)).toEqual({ animation: 'attack', age: 0 });
    expect(enemyAnimation(ranged, 111)).toEqual({ animation: 'attack', age: 11 });
    expect(enemyAnimation(ranged, 112)).toEqual({ animation: 'idle', age: 92 });
  });

  it('shows idle for a stopped ranged Mob that has not spat yet', () => {
    const ranged = enemy({ kind: 'ranged', nextSpitTick: 200, lastSpitTick: null });
    expect(enemyAnimation(ranged, 150)).toEqual({ animation: 'idle', age: 150 });
  });

  it('shows walk for a ranged Mob before it arrives at its stop', () => {
    const ranged = enemy({ kind: 'ranged', spawnTick: 5, nextSpitTick: null, lastSpitTick: null });
    expect(enemyAnimation(ranged, 40)).toEqual({ animation: 'walk', age: 35 });
  });

  it('lets hit win over attack', () => {
    const ranged = enemy({ kind: 'ranged', lastSpitTick: 100, nextSpitTick: 280, lastHitTick: 105 });
    expect(enemyAnimation(ranged, 107)).toEqual({ animation: 'hit', age: 2 });
    expect(enemyAnimation(ranged, 111)).toEqual({ animation: 'attack', age: 11 });
  });
});

describe('ENTITY_LOOKS', () => {
  it('gives every entity its own colour', () => {
    const colours = Object.values(ENTITY_LOOKS).map((l) => l.colour);
    expect(new Set(colours).size).toBe(colours.length);
  });
});
