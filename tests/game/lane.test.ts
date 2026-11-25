// Wiring tests for src/game/lane.ts: createLaneSystems() order and setup (Req 1.1, 1.4), the
// replaceable Spawner (Req 3.4), lane ticks in every live phase (Req 1.7), overrides that stay
// with their system set (Req 2.6) and headless lane runs (Req 9.7). Folds in the former lane
// smoke tests.
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LANE_BALANCE,
  LaneBalanceError,
  resolveLaneBalance,
  type LaneBalanceOverrides,
} from '../../src/game/balance/lane';
import type { System } from '../../src/game/context';
import { hammerSystem } from '../../src/game/hammer';
import { runHeadless } from '../../src/game/headless';
import { createLaneSystems } from '../../src/game/lane';
import { initialLane, laneDraft } from '../../src/game/laneState';
import { addMob, mobSystem } from '../../src/game/mobs';
import { scheduleSpawner } from '../../src/game/spawner';
import { createRun } from '../../src/game/state';
import { step } from '../../src/game/step';
import type { GameEvent, Phase } from '../../src/game/types';
import { stepN } from '../helpers/game';
import { FAST_CORE, hitBoxCentre } from '../helpers/lane';

type EventOf<T extends GameEvent['type']> = Extract<GameEvent, { type: T }>;

function eventsOf<T extends GameEvent['type']>(events: readonly GameEvent[], type: T): EventOf<T>[] {
  return events.filter((e): e is EventOf<T> => e.type === type);
}

describe('createLaneSystems', () => {
  it('returns [ensureLane, hammer, mobs, spawner], with the spawner replaceable', () => {
    const systems = createLaneSystems();
    expect(systems).toHaveLength(4);
    expect(systems.slice(1)).toEqual([hammerSystem, mobSystem, scheduleSpawner]);

    const custom: System = () => {};
    expect(createLaneSystems({ spawner: custom })[3]).toBe(custom);
  });

  it('throws LaneBalanceError for invalid overrides', () => {
    expect(() => createLaneSystems({ balance: { laneLength: -1 } })).toThrow(LaneBalanceError);
  });
});

describe('lane setup', () => {
  it('the first step adds initialLane(balance) and later steps keep the Run’s own lane', () => {
    const overrides = { enemies: { tank: { hp: 6 } } };
    const first = step(createRun({ seed: 1 }), [], createLaneSystems({ balance: overrides })).state;
    expect(first.lane).toEqual(initialLane(resolveLaneBalance(overrides)));
    expect(first.lane).toMatchObject({ enemies: [], nextId: 1, hammerReadyTick: 0 });

    const next = step(first, [], createLaneSystems()).state;
    expect(next.lane?.balance.enemies.tank.hp).toBe(6);
  });

  it('the Hammer is ready on the first lane tick', () => {
    const { state, events } = step(
      createRun({ seed: 1 }),
      [{ type: 'hammer', x: 400, y: 10 }],
      createLaneSystems(),
    );
    expect(eventsOf(events, 'hammerSwing')).toEqual([
      { type: 'hammerSwing', x: 400, y: 10, targetId: null, tick: 1 },
    ]);
    expect(state.lane?.hammerReadyTick).toBe(1 + 23);
  });

  it('a state built with balance A and continued with systems of balance B behaves per A', () => {
    const a: LaneBalanceOverrides = {
      spawns: [{ kind: 'default', startSecond: 1, endSecond: 1, everySeconds: 1 }],
      enemies: { default: { speed: 120 } },
    };
    const started = step(createRun({ seed: 1 }), [], createLaneSystems({ balance: a })).state;
    const b = createLaneSystems();

    // A's schedule: one default at tick 60, moving 2 units per tick at A's speed.
    const at60 = stepN(step, started, 59, { systems: b });
    expect(eventsOf(at60.events, 'mobSpawned').map((e) => [e.kind, e.tick])).toEqual([
      ['default', 60],
    ]);
    const at61 = step(at60.state, [], b).state;
    expect(at61.lane?.enemies[0].x).toBeCloseTo(798, 9);

    // B's schedule (first default at 480) never applies to this Run.
    const at480 = stepN(step, at61, 480 - 61, { systems: b });
    expect(eventsOf(at480.events, 'mobSpawned')).toEqual([]);
    expect(at480.state.lane?.balance).toEqual(resolveLaneBalance(a));
  });

  it('overrides do not leak between system sets', () => {
    const custom = createLaneSystems({
      balance: { laneLength: 600, enemies: { default: { hp: 5 } } },
    });
    const plain = createLaneSystems();
    const run = createRun({ seed: 1 });

    const withCustom = step(run, [], custom).state;
    const withPlain = step(run, [], plain).state;
    expect(withCustom.lane?.balance.laneLength).toBe(600);
    expect(withCustom.lane?.balance.enemies.default.hp).toBe(5);
    expect(withPlain.lane?.balance).toEqual(DEFAULT_LANE_BALANCE);

    // A set created later does not change an earlier one either.
    createLaneSystems({ balance: { laneLength: 1000 } });
    expect(step(run, [], plain).state.lane?.balance).toEqual(DEFAULT_LANE_BALANCE);
    expect(step(run, [], custom).state.lane?.balance.laneLength).toBe(600);
    expect(DEFAULT_LANE_BALANCE.laneLength).toBe(800);
    expect(DEFAULT_LANE_BALANCE.enemies.default.hp).toBe(5);
  });
});

describe('replacement spawner', () => {
  it('replaces the schedule while the hammer still works', () => {
    const spawner: System = (draft, ctx) => {
      if (ctx.tick === 1) addMob(laneDraft(draft), ctx, 'default', 300, 'schedule');
    };
    const systems = createLaneSystems({ spawner });

    const first = step(createRun({ seed: 1 }), [], systems);
    expect(eventsOf(first.events, 'mobSpawned')).toEqual([
      { type: 'mobSpawned', id: 1, kind: 'default', x: 300, source: 'schedule', tick: 1 },
    ]);

    const target = first.state.lane!.enemies[0];
    const { x, y } = hitBoxCentre(first.state, target);
    const second = step(first.state, [{ type: 'hammer', x, y }], systems);
    expect(eventsOf(second.events, 'hammerSwing')).toEqual([
      { type: 'hammerSwing', x, y, targetId: 1, tick: 2 },
    ]);
    expect(eventsOf(second.events, 'mobHit')).toMatchObject([{ id: 1, damage: 2, hp: 3 }]);

    // The default schedule's first Mob (tick 480) never appears.
    const later = stepN(step, second.state, 480 - 2, { systems });
    expect(eventsOf(later.events, 'mobSpawned')).toEqual([]);
  });
});

describe('lane ticks in every live phase', () => {
  it('Mobs move in dialing, connected and downloading', () => {
    // A lone tank from tick 30 (24 units per second, so it stays on the lane), 2 s dial-up.
    const spawns = [{ kind: 'tank' as const, startSecond: 0.5, endSecond: 0.5, everySeconds: 1 }];
    const seen: { phase: Phase; x: number | undefined }[] = [];
    const probe: System = (draft) => {
      seen.push({ phase: draft.phase, x: draft.lane?.enemies[0]?.x });
    };
    const systems = [...createLaneSystems({ balance: { spawns } }), probe];

    const { state } = stepN(step, createRun({ seed: 1, balance: FAST_CORE }), 300, {
      systems,
      inputs: [{ tick: 200, command: { type: 'startDownload' } }],
    });
    expect(state.phase).toBe('downloading');

    const perTick = 24 / 60;
    const movedIn = new Set<Phase>();
    for (let i = 1; i < seen.length; i++) {
      const [prev, cur] = [seen[i - 1], seen[i]];
      if (prev.x === undefined || cur.x === undefined) continue;
      expect(prev.x - cur.x).toBeCloseTo(perTick, 9);
      movedIn.add(cur.phase);
    }
    expect([...movedIn].sort()).toEqual(['connected', 'dialing', 'downloading']);
  });
});

describe('headless lane runs', () => {
  it('runHeadless with lane systems and no input ends lost, and the lane then stays frozen', () => {
    const result = runHeadless({ seed: 1, systems: createLaneSystems() });
    expect(result.endedBy).toBe('lost');
    expect(result.final.tick).toBe(2727);
    expect(eventsOf(result.events, 'mobBit').length).toBeGreaterThan(0);

    const after = step(result.final, [{ type: 'hammer', x: 400, y: 10 }], createLaneSystems());
    expect(after.state).toBe(result.final);
    expect(after.events).toEqual([]);
  });

  it('an idle run ends lost from Melee_Hits, every modemHit right after a mobBit (Req 6.4)', () => {
    const result = runHeadless({ seed: 1, systems: createLaneSystems() });
    expect(result.endedBy).toBe('lost');
    const hits = result.events.filter((e) => e.type === 'modemHit');
    expect(hits.length).toBeGreaterThan(0);
    result.events.forEach((e, i) => {
      if (e.type !== 'modemHit') return;
      const prev = result.events[i - 1];
      expect(prev?.type).toBe('mobBit');
      if (prev?.type === 'mobBit') expect(prev.damage).toBe(e.amount);
    });
  });

  it('a hammer script records hammerSwing events', () => {
    const systems = createLaneSystems();
    // Aim at the first default Mob as it stands when tick 500 starts (it spawned on tick 480).
    const before = stepN(step, createRun({ seed: 1 }), 499, { systems }).state;
    const { x, y } = hitBoxCentre(before, before.lane!.enemies[0]);

    const result = runHeadless({
      seed: 1,
      systems,
      maxSeconds: 10,
      script: [
        { tick: 10, command: { type: 'hammer', x: 400, y: 10 } },
        { tick: 500, command: { type: 'hammer', x, y } },
      ],
    });
    expect(eventsOf(result.events, 'hammerSwing')).toEqual([
      { type: 'hammerSwing', x: 400, y: 10, targetId: null, tick: 10 },
      { type: 'hammerSwing', x, y, targetId: 1, tick: 500 },
    ]);
    expect(eventsOf(result.events, 'mobHit')).toMatchObject([{ id: 1, damage: 2, hp: 3, tick: 500 }]);
  });
});
