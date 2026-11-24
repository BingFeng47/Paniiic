import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { compareHitPriority, hitTest } from '../../src/game/hammer';
import { createLaneSystems } from '../../src/game/lane';
import { isAttacker, type Enemy } from '../../src/game/laneTypes';
import { enemyStats } from '../../src/game/mobs';
import { createRun } from '../../src/game/state';
import { step } from '../../src/game/step';
import type { GameEvent, GameState } from '../../src/game/types';
import { attackerOffset, buildDrawList, type DrawItem } from '../../src/render/laneDrawList';
import {
  EMPTY_EFFECTS,
  SHAKE_TICKS,
  applyEvents,
  dieTicksFrom,
  laneShake,
  type LaneEffects,
} from '../../src/render/laneEffects';
import {
  LANE_CANVAS_H,
  LANE_CANVAS_W,
  MODEM_AREA_W,
  createLaneLayout,
  laneToCanvas,
  type LaneLayout,
} from '../../src/render/laneLayout';
import {
  ATTACK_TICKS,
  ENTITY_LOOKS,
  type AnimationName,
  type SpriteEntity,
} from '../../src/render/sprites/entities';
import { arbLaneRun, hitBoxCentre, laneWith, runLane } from '../helpers/lane';

type FrameCount = (entity: SpriteEntity, animation: AnimationName) => number;

const ONE_FRAME: FrameCount = () => 1;
const LAYOUT = createLaneLayout(LANE_CANVAS_W, LANE_CANVAS_H, 800);

/** Effects after folding every step's events of a run up to `states[upTo]`. */
function effectsUpTo(
  tickEvents: readonly (readonly GameEvent[])[],
  states: readonly GameState[],
  upTo: number,
  frameCount: FrameCount,
): LaneEffects {
  const dieTicks = dieTicksFrom(frameCount);
  let fx = EMPTY_EFFECTS;
  for (let i = 0; i < upTo; i++) fx = applyEvents(fx, tickEvents[i], states[i + 1].tick, dieTicks);
  return fx;
}

function expectItemMatchesEnemy(item: DrawItem, enemy: Enemy, state: GameState, layout: LaneLayout) {
  const lane = state.lane!;
  const offset = isAttacker(enemy) ? attackerOffset(enemy.id, lane.balance.hitPadding) : 0;
  expect(Math.abs(offset)).toBeLessThanOrEqual(lane.balance.hitPadding);
  const feet = laneToCanvas({ x: enemy.x + offset, y: 0 }, layout);
  expect(item.entity).toBe(enemy.kind);
  expect(item.feet.x).toBe(feet.x);
  expect(item.feet.y).toBe(feet.y);
  expect(item.height).toBe(enemyStats(lane, enemy.kind).height * layout.scale);
}

describe('buildDrawList', () => {
  it('shows every Enemy where it stands, target on top', () => {
    // Feature: lane-melee, Property 8: Draw list keeps Attackers on their Hit_Box (amends connection-lane Property 13)
    // **Validates: Requirements 7.2**
    // Property: Req 11.2 every Enemy is drawn with its feet at its Lane_X on the line and its Hit_Box height
    // Property: Req 11.3 Enemies are drawn in reverse Hit_Priority so the hammer's target is on top
    fc.assert(
      fc.property(
        arbLaneRun(600),
        fc.nat(),
        fc.integer({ min: 400, max: 2048 }),
        fc.integer({ min: 120, max: 520 }),
        fc.func(fc.integer({ min: 1, max: 12 })),
        fc.nat(),
        (spec, pick, canvasW, canvasH, rawFrameCount, aimPick) => {
          const frameCount: FrameCount = (entity, animation) => rawFrameCount(entity, animation);
          const run = runLane(spec);
          const index = pick % run.states.length;
          const state = run.states[index];
          const effects = effectsUpTo(run.tickEvents, run.states, index, frameCount);
          const laneLength = state.lane?.balance.laneLength ?? 800;
          const layout = createLaneLayout(canvasW, canvasH, laneLength);

          const items = buildDrawList(state, effects, layout, frameCount);

          // Modem and Manhole first, then one item per corpse, then one per Enemy.
          const enemies = state.lane?.enemies ?? [];
          const corpses = effects.corpses.length;
          expect(items.length).toBe(2 + corpses + enemies.length);
          expect(items[0].entity).toBe('modem');
          expect(items[1].entity).toBe('manhole');
          expect(items[1].feet).toEqual(laneToCanvas({ x: laneLength, y: 0 }, layout));
          items.slice(2, 2 + corpses).forEach((item, i) => {
            expect(item.entity).toBe(effects.corpses[i].kind);
            expect(item.animation).toBe('die');
          });

          // Enemy items, in draw order, are the Enemies in reverse Hit_Priority, each exactly once.
          const enemyItems = items.slice(2 + corpses);
          const drawOrder = [...enemies].sort((a, b) => compareHitPriority(b, a));
          drawOrder.forEach((enemy, i) => expectItemMatchesEnemy(enemyItems[i], enemy, state, layout));

          if (enemies.length > 0) {
            // The last Enemy drawn is the first in Hit_Priority...
            const first = [...enemies].sort(compareHitPriority)[0];
            expectItemMatchesEnemy(enemyItems[enemyItems.length - 1], first, state, layout);
            // ...and at any Hit_Box centre, the topmost Enemy whose box holds it is hitTest's pick.
            const lane = state.lane!;
            const aimed = enemies[aimPick % enemies.length];
            const point = hitBoxCentre(state, aimed);
            const target = hitTest(lane, point.x, point.y);
            expect(target).not.toBeNull();
            let topmost: Enemy | null = null;
            for (const enemy of drawOrder) {
              if (hitTest({ ...lane, enemies: [enemy] }, point.x, point.y) !== null) topmost = enemy;
            }
            expect(topmost).toBe(target);
          }

          // Every frame is a whole index into an animation the entity has.
          for (const item of items) {
            expect(ENTITY_LOOKS[item.entity].animations).toContain(item.animation);
            expect(Number.isInteger(item.frame)).toBe(true);
            expect(item.frame).toBeGreaterThanOrEqual(0);
            expect(item.frame).toBeLessThan(frameCount(item.entity, item.animation));
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it('draws only the modem and the Manhole when the state has no lane', () => {
    const items = buildDrawList(createRun({ seed: 1 }), EMPTY_EFFECTS, LAYOUT, ONE_FRAME);
    expect(items.map((i) => [i.entity, i.animation])).toEqual([
      ['modem', 'idle'],
      ['manhole', 'idle'],
    ]);
    expect(items[0].feet).toEqual({ x: LAYOUT.originX - MODEM_AREA_W / 2, y: LAYOUT.lineY });
    expect(items[0].height).toBe(ENTITY_LOOKS.modem.box.h);
    expect(items[1].feet).toEqual({ x: 912, y: 232 });
    expect(items[1].height).toBe(ENTITY_LOOKS.manhole.box.h);
  });

  it('puts the Enemy a click would hit on top when two overlap', () => {
    // Ids 1 and 2 stand at x 300 and 290; id 3 shares x 290 with a higher id.
    const state = laneWith([
      { kind: 'tank', id: 1, x: 300 },
      { kind: 'default', id: 2, x: 290 },
      { kind: 'fast', id: 3, x: 290 },
    ]);
    const items = buildDrawList(state, EMPTY_EFFECTS, LAYOUT, ONE_FRAME);
    expect(items.slice(2).map((i) => i.entity)).toEqual(['tank', 'fast', 'default']);
    expect(hitTest(state.lane!, 295, 10)?.id).toBe(2);
  });

  it('shows the modem `hit` after every Melee_Hit, then `idle` again', () => {
    // Property: Req 11.7 / lane-melee 7.5 every modemHit is shown on the modem and shakes the lane
    const systems = createLaneSystems();
    let state = laneWith([{ kind: 'fast', x: 1 }]);
    let fx = EMPTY_EFFECTS;
    const dieTicks = dieTicksFrom(ONE_FRAME);
    const hitTicks: number[] = [];
    const modemAt: AnimationName[] = [];
    const shakeOn: boolean[] = [];
    const shakeOff: boolean[] = [];
    for (let i = 0; i < 150; i++) {
      const result = step(state, [], systems);
      state = result.state;
      fx = applyEvents(fx, result.events, state.tick, dieTicks);
      if (result.events.some((e) => e.type === 'modemHit')) hitTicks.push(state.tick);
      modemAt[state.tick] = buildDrawList(state, fx, LAYOUT, ONE_FRAME)[0].animation;
      shakeOn[state.tick] = state.tick < fx.shakeUntilTick;
      const off = laneShake(false, state.tick, fx.shakeUntilTick);
      shakeOff[state.tick] = off.dx !== 0 || off.dy !== 0;
    }
    // The fast Mob stays as an Attacker and hits once a second (60 Ticks).
    expect(state.lane!.enemies).toHaveLength(1);
    expect(isAttacker(state.lane!.enemies[0])).toBe(true);
    expect(hitTicks.length).toBeGreaterThanOrEqual(2);
    expect(hitTicks[1] - hitTicks[0]).toBe(60);
    for (let t = 1; t < hitTicks[0]; t++) expect(modemAt[t]).toBe('idle');
    for (const hit of hitTicks) {
      for (let t = hit; t < hit + SHAKE_TICKS && t < modemAt.length; t++) {
        expect(modemAt[t]).toBe('hit');
        expect(shakeOn[t]).toBe(true);
      }
      if (hit + SHAKE_TICKS < modemAt.length) expect(modemAt[hit + SHAKE_TICKS]).toBe('idle');
    }
    // Screen_Shake off: no offset at all.
    expect(shakeOff.some(Boolean)).toBe(false);
  });

  it('animates an Attacker: `hit`, then `attack` for 12 Ticks after each hit, then `idle`', () => {
    // Property: lane-melee Req 7.1
    const systems = createLaneSystems();
    let state = laneWith([{ kind: 'default', id: 1, x: 23 }]);
    const animAt: AnimationName[] = [];
    const melee: number[] = [];
    for (let i = 0; i < 200; i++) {
      const result = step(state, [], systems);
      state = result.state;
      if (result.events.some((e) => e.type === 'mobBit')) melee.push(state.tick);
      const enemyItems = buildDrawList(state, EMPTY_EFFECTS, LAYOUT, ONE_FRAME).slice(2);
      animAt[state.tick] = enemyItems[0].animation;
    }
    expect(melee.length).toBeGreaterThanOrEqual(2);
    for (const m of melee) {
      for (let t = m; t < m + ATTACK_TICKS; t++) expect(animAt[t]).toBe('attack');
      expect(animAt[m + ATTACK_TICKS]).toBe('idle');
    }
    // A hammer hit shows `hit` over `attack`.
    const attacker = state.lane!.enemies[0];
    const hitState = {
      ...state,
      lane: { ...state.lane!, enemies: [{ ...attacker, lastHitTick: state.tick }] },
    } as GameState;
    expect(buildDrawList(hitState, EMPTY_EFFECTS, LAYOUT, ONE_FRAME)[2].animation).toBe('hit');
  });

  it('spreads Attackers by -6, 0 and +6 px of Lane_X by id', () => {
    // Property: lane-melee Req 7.2
    expect(attackerOffset(3, 6)).toBe(-6);
    expect(attackerOffset(4, 6)).toBe(0);
    expect(attackerOffset(5, 6)).toBe(6);
    const state = laneWith([
      { kind: 'default', id: 3, x: 22, nextHitTick: 90, lastMeleeTick: 0 },
      { kind: 'default', id: 4, x: 22, nextHitTick: 90, lastMeleeTick: 0 },
      { kind: 'default', id: 5, x: 22, nextHitTick: 90, lastMeleeTick: 0 },
      { kind: 'default', id: 6, x: 300 },
    ]);
    const items = buildDrawList(state, EMPTY_EFFECTS, LAYOUT, ONE_FRAME).slice(2);
    const xs = items.map((i) => i.feet.x);
    // Draw order is reverse Hit_Priority: walker 6, then 5, 4, 3.
    expect(xs).toEqual([
      laneToCanvas({ x: 300, y: 0 }, LAYOUT).x,
      laneToCanvas({ x: 28, y: 0 }, LAYOUT).x,
      laneToCanvas({ x: 22, y: 0 }, LAYOUT).x,
      laneToCanvas({ x: 16, y: 0 }, LAYOUT).x,
    ]);
  });

  it('rattles the Manhole after a scheduled spawn but not after a boss summon', () => {
    const state = { ...createRun({ seed: 1 }), tick: 50 };
    const spawn = (source: 'schedule' | 'bossSummon'): GameEvent => ({
      type: 'mobSpawned',
      id: 9,
      kind: 'default',
      x: 800,
      source,
      tick: 50,
    });
    const dieTicks = dieTicksFrom(ONE_FRAME);
    const summoned = applyEvents(EMPTY_EFFECTS, [spawn('bossSummon')], 50, dieTicks);
    expect(buildDrawList(state, summoned, LAYOUT, ONE_FRAME)[1].animation).toBe('idle');

    const scheduled = applyEvents(EMPTY_EFFECTS, [spawn('schedule')], 50, dieTicks);
    const manholeAt = (tick: number) =>
      buildDrawList({ ...state, tick }, scheduled, LAYOUT, ONE_FRAME)[1].animation;
    expect(manholeAt(50)).toBe('attack');
    expect(manholeAt(50 + ATTACK_TICKS - 1)).toBe('attack');
    expect(manholeAt(50 + ATTACK_TICKS)).toBe('idle');
  });

  it('draws a corpse with `die` at the kill x until its animation ends', () => {
    // Property: Req 11.6 a killed Enemy plays `die` at its last Lane_X
    const frameCount: FrameCount = (_e, animation) => (animation === 'die' ? 4 : 1);
    const dieTicks = dieTicksFrom(frameCount); // 24 ticks
    const kill: GameEvent = { type: 'mobKilled', id: 4, kind: 'tank', x: 250, dropKb: 20, tick: 10 };
    const base = { ...createRun({ seed: 1 }), tick: 10 };
    let fx = applyEvents(EMPTY_EFFECTS, [kill], 10, dieTicks);

    const at10 = buildDrawList(base, fx, LAYOUT, frameCount);
    expect(at10[2]).toEqual({
      entity: 'tank',
      animation: 'die',
      frame: 0,
      feet: laneToCanvas({ x: 250, y: 0 }, LAYOUT),
      height: 96 * LAYOUT.scale,
    });
    fx = applyEvents(fx, [], 33, dieTicks);
    expect(buildDrawList({ ...base, tick: 33 }, fx, LAYOUT, frameCount)[2].frame).toBe(3);
    fx = applyEvents(fx, [], 34, dieTicks);
    expect(buildDrawList({ ...base, tick: 34 }, fx, LAYOUT, frameCount)).toHaveLength(2);
  });

  it('falls back to `walk` when an Enemy has no sprite for its animation', () => {
    // A tuned-up Glob (2 HP) can be hit, but globs have only walk and die.
    const state = { ...laneWith([{ kind: 'glob', x: 400, hp: 2, lastHitTick: 0 }]), tick: 1 };
    const [glob] = buildDrawList(state, EMPTY_EFFECTS, LAYOUT, ONE_FRAME).slice(2);
    expect(glob.entity).toBe('glob');
    expect(glob.animation).toBe('walk');
  });
});
