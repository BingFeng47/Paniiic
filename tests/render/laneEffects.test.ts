import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { GameEvent } from '../../src/game/types';
import {
  EMPTY_EFFECTS,
  MAX_SHAKE_PX,
  SHAKE_TICKS,
  animationTicks,
  applyEvents,
  dieTicksFrom,
  laneShake,
  shakeOffset,
  type LaneEffects,
} from '../../src/render/laneEffects';
import { fastSchedule, runLane, type LaneRunSpec } from '../helpers/lane';

/** Every die animation lasts 24 ticks: 4 frames at 10 fps. */
const DIE_4 = dieTicksFrom(() => 4);

function killed(tick: number, id = 1, x = 300): GameEvent {
  return { type: 'mobKilled', id, kind: 'default', x, dropKb: 5, tick };
}

function jsonClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

describe('animationTicks and dieTicksFrom', () => {
  it('rounds a one-shot animation up to whole ticks and counts fewer than 1 frame as 1', () => {
    expect(animationTicks('die', 4)).toBe(24);
    expect(animationTicks('hit', 1)).toBe(5); // ceil(60 / 12)
    expect(animationTicks('die', 0)).toBe(6);
    expect(animationTicks('die', Number.NaN)).toBe(6);
    expect(DIE_4('tank')).toBe(24);
  });
});

describe('applyEvents', () => {
  it('adds a corpse on mobKilled at its last x and drops it once its die animation has played', () => {
    // Property: Req 11.6 a killed Enemy plays `die` at its last Lane_X for the animation's length
    const added = applyEvents(EMPTY_EFFECTS, [killed(10, 7, 321.5)], 10, DIE_4);
    expect(added.corpses).toEqual([{ id: 7, kind: 'default', x: 321.5, killTick: 10 }]);

    const lastTick = applyEvents(added, [], 10 + 23, DIE_4);
    expect(lastTick.corpses).toBe(added.corpses);
    expect(applyEvents(added, [], 10 + 24, DIE_4).corpses).toEqual([]);
  });

  it('keeps corpses in kill order and expires each on its own kill tick', () => {
    let fx = applyEvents(EMPTY_EFFECTS, [killed(0, 1), killed(0, 2)], 0, DIE_4);
    fx = applyEvents(fx, [killed(10, 3)], 10, DIE_4);
    expect(fx.corpses.map((c) => c.id)).toEqual([1, 2, 3]);
    fx = applyEvents(fx, [], 24, DIE_4);
    expect(fx.corpses.map((c) => c.id)).toEqual([3]);
  });

  it('uses event ticks as timestamps when one frame folds several ticks', () => {
    const fx = applyEvents(EMPTY_EFFECTS, [killed(5, 1), killed(30, 2)], 30, DIE_4);
    expect(fx.corpses.map((c) => c.id)).toEqual([2]);
  });

  it('records the tick of the last hammer swing', () => {
    const swing = (tick: number): GameEvent => ({
      type: 'hammerSwing',
      x: 10,
      y: 20,
      targetId: null,
      tick,
    });
    const fx = applyEvents(EMPTY_EFFECTS, [swing(40)], 40, DIE_4);
    expect(fx.swingTick).toBe(40);
    expect(applyEvents(fx, [swing(58), swing(59)], 59, DIE_4).swingTick).toBe(59);
  });

  it('opens a 12-tick shake window and records the modem hit tick on modemHit', () => {
    const hit: GameEvent = { type: 'modemHit', amount: 10, integrity: 90, tick: 100 };
    const fx = applyEvents(EMPTY_EFFECTS, [hit], 100, DIE_4);
    expect(fx.modemHitTick).toBe(100);
    expect(fx.shakeUntilTick).toBe(100 + SHAKE_TICKS);
    // An earlier hit folded later never shortens the window.
    const earlier: GameEvent = { ...hit, tick: 95 };
    expect(applyEvents(fx, [earlier], 100, DIE_4).shakeUntilTick).toBe(112);
  });

  it('rattles the manhole on a scheduled or hatched spawn but not on a boss summon', () => {
    const spawn = (source: 'schedule' | 'bossSummon' | 'adHatch', tick: number): GameEvent => ({
      type: 'mobSpawned',
      id: 1,
      kind: 'default',
      x: 800,
      source,
      tick,
    });
    expect(applyEvents(EMPTY_EFFECTS, [spawn('bossSummon', 5)], 5, DIE_4)).toBe(EMPTY_EFFECTS);
    expect(applyEvents(EMPTY_EFFECTS, [spawn('schedule', 5)], 5, DIE_4).rattleTick).toBe(5);
    expect(applyEvents(EMPTY_EFFECTS, [spawn('adHatch', 7)], 7, DIE_4).rattleTick).toBe(7);
  });

  it('returns the same object when nothing changes', () => {
    const unrelated: GameEvent[] = [
      { type: 'connected', tick: 3 },
    ];
    expect(applyEvents(EMPTY_EFFECTS, [], 0, DIE_4)).toBe(EMPTY_EFFECTS);
    expect(applyEvents(EMPTY_EFFECTS, unrelated, 3, DIE_4)).toBe(EMPTY_EFFECTS);
  });

  it('never changes deep-frozen effects or events across a whole lane run', () => {
    const spec: LaneRunSpec = {
      seed: 42,
      spawns: fastSchedule(),
      ticks: 1200,
      actions: Array.from({ length: 300 }, (_, i) => ({
        tick: 1 + i * 4,
        aim: { kind: 'enemy' as const, index: i },
      })),
      downloadTick: 150,
    };
    const run = runLane(spec);
    const types = new Set(run.events.map((e) => e.type));
    expect(types).toContain('mobKilled');
    expect(types).toContain('hammerSwing');
    expect(types).toContain('mobSpawned');

    let fx: LaneEffects = EMPTY_EFFECTS;
    let corpsesSeen = 0;
    run.tickEvents.forEach((events, i) => {
      const frozenFx = deepFreeze(jsonClone(fx));
      const frozenEvents = deepFreeze(jsonClone(events));
      const before = JSON.stringify(frozenFx);
      const next = applyEvents(frozenFx, frozenEvents, run.states[i + 1].tick, DIE_4);
      expect(JSON.stringify(frozenFx)).toBe(before);
      expect(next).toEqual(applyEvents(fx, events, run.states[i + 1].tick, DIE_4));
      corpsesSeen = Math.max(corpsesSeen, next.corpses.length);
      fx = next;
    });
    expect(corpsesSeen).toBeGreaterThan(0);
  });
});

describe('shakeOffset', () => {
  it('stays within ±3 whole px on every tick of the window and is exactly 0 after it', () => {
    // Property: Req 11.7 a modemHit offsets the lane by at most 3 canvas px for 12 Ticks
    for (const hitTick of [0, 1, 7, 100, 1234, 99_999]) {
      const until = hitTick + SHAKE_TICKS;
      let moved = false;
      for (let tick = hitTick; tick < until; tick++) {
        const { dx, dy } = shakeOffset(tick, until);
        expect(Number.isInteger(dx) && Number.isInteger(dy)).toBe(true);
        expect(Math.abs(dx)).toBeLessThanOrEqual(MAX_SHAKE_PX);
        expect(Math.abs(dy)).toBeLessThanOrEqual(MAX_SHAKE_PX);
        if (dx !== 0 || dy !== 0) moved = true;
      }
      expect(moved).toBe(true);
      for (let tick = until; tick < until + 60; tick++) {
        const { dx, dy } = shakeOffset(tick, until);
        expect(Object.is(dx, 0) && Object.is(dy, 0)).toBe(true);
      }
    }
  });

  it('is 0 with no shake window and for non-finite inputs', () => {
    expect(shakeOffset(50, EMPTY_EFFECTS.shakeUntilTick)).toEqual({ dx: 0, dy: 0 });
    expect(shakeOffset(Number.NaN, 10)).toEqual({ dx: 0, dy: 0 });
    expect(shakeOffset(5, Number.POSITIVE_INFINITY)).toEqual({ dx: 0, dy: 0 });
  });

  it('is a function of the tick only', () => {
    expect(shakeOffset(103, 112)).toEqual(shakeOffset(103, 112));
  });
});

describe('laneShake', () => {
  it('Property 10: turning screen shake off removes the offset and nothing else', () => {
    // Property: Req 7.2, 7.3 shake off draws with a zero offset, shake on with the shake rule
    // Feature: title-and-endings, Property 10: Turning screen shake off removes the offset and nothing else
    const arbCase = fc.oneof(
      // Ticks around a shake window: before it opens, inside it and after it closes.
      fc.integer({ min: 0, max: 100_000 }).chain((tick) =>
        fc.record({
          tick: fc.constant(tick),
          until: fc.integer({ min: tick - 2 * SHAKE_TICKS, max: tick + 2 * SHAKE_TICKS }),
        }),
      ),
      fc.record({ tick: fc.integer(), until: fc.integer() }),
    );
    fc.assert(
      fc.property(arbCase, ({ tick, until }) => {
        const off = laneShake(false, tick, until);
        expect(Object.is(off.dx, 0) && Object.is(off.dy, 0)).toBe(true);
        expect(laneShake(true, tick, until)).toEqual(shakeOffset(tick, until));
      }),
      { numRuns: 200 },
    );
  });
});

describe('juice lane effects (juice-and-endings Req 4, 5.1)', () => {
  it('keeps a hit flash for 4 Ticks, a Kill_Pop for 18 and a "+N KB" label for 30', async () => {
    const { hitFlashActive, KB_LABEL_TICKS, KILL_POP_TICKS } = await import('../../src/render/laneEffects');
    const hit: GameEvent = { type: 'mobHit', id: 3, kind: 'tank', damage: 1, hp: 3, tick: 10 };
    const fx = applyEvents(EMPTY_EFFECTS, [hit, killed(10, 7, 50), { type: 'packetCollected', id: 9, kb: 5, tick: 10 }], 10, DIE_4, (id) =>
      id === 9 ? { x: 100, y: 20 } : null,
    );
    expect(hitFlashActive(fx, 3, 13)).toBe(true);
    expect(hitFlashActive(fx, 3, 14)).toBe(false);
    expect(fx.pops).toEqual([{ id: 7, x: 50, tick: 10 }]);
    expect(fx.kbLabels).toEqual([{ id: 9, x: 100, y: 20, kb: 5, tick: 10 }]);
    expect(applyEvents(fx, [], 10 + KILL_POP_TICKS - 1, DIE_4).pops).toHaveLength(1);
    expect(applyEvents(fx, [], 10 + KILL_POP_TICKS, DIE_4).pops).toHaveLength(0);
    expect(applyEvents(fx, [], 10 + KB_LABEL_TICKS - 1, DIE_4).kbLabels).toHaveLength(1);
    expect(applyEvents(fx, [], 10 + KB_LABEL_TICKS, DIE_4).kbLabels).toHaveLength(0);
  });

  it('rumbles for the 180 Ticks before the boss and never without a boss tick', async () => {
    const { bossRumbleActive, rumbleJitter } = await import('../../src/render/laneEffects');
    expect(bossRumbleActive(819, 1000, false)).toBe(false);
    expect(bossRumbleActive(820, 1000, false)).toBe(true);
    expect(bossRumbleActive(999, 1000, false)).toBe(true);
    expect(bossRumbleActive(1000, 1000, false)).toBe(false);
    expect(bossRumbleActive(900, 1000, true)).toBe(false);
    expect(bossRumbleActive(900, null, false)).toBe(false);
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 100000 }), (t) => {
        const j = rumbleJitter(t);
        return Math.abs(j.dx) <= 2 && Math.abs(j.dy) <= 2;
      }),
    );
  });
});
