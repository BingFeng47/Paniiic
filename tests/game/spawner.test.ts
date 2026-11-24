// Spawner tests for src/game/spawner.ts: the placeholder Spawn_Schedule timings (Req 3.3), the
// wave rule for waves starting at second 0 (Req 3.2) and same-tick waves in schedule order
// (Req 3.7). Folds in the former spawner smoke tests.
import { describe, expect, it } from 'vitest';
import { DEFAULT_LANE_BALANCE, type SpawnWave } from '../../src/game/balance/lane';
import { createLaneSystems } from '../../src/game/lane';
import type { MobKind } from '../../src/game/laneTypes';
import { scheduledSpawnsAt } from '../../src/game/spawner';
import { createRun } from '../../src/game/state';
import { step } from '../../src/game/step';
import type { GameEvent } from '../../src/game/types';
import { stepN } from '../helpers/game';

type SpawnedEvent = Extract<GameEvent, { type: 'mobSpawned' }>;

const spawnedOf = (events: readonly GameEvent[]): SpawnedEvent[] =>
  events.filter((e): e is SpawnedEvent => e.type === 'mobSpawned');

/** The first tick in 1..maxTick on which each kind is scheduled, and how often it is. */
function firstSpawns(spawns: readonly SpawnWave[], maxTick: number) {
  const first = new Map<MobKind, number>();
  const counts = new Map<MobKind, number>();
  for (let tick = 1; tick <= maxTick; tick++) {
    for (const kind of scheduledSpawnsAt(tick, spawns)) {
      if (!first.has(kind)) first.set(kind, tick);
      counts.set(kind, (counts.get(kind) ?? 0) + 1);
    }
  }
  return { first, counts };
}

describe('scheduledSpawnsAt', () => {
  it('the default schedule first spawns each kind on the expected tick, and exactly one boss', () => {
    const { first, counts } = firstSpawns(DEFAULT_LANE_BALANCE.spawns, 60 * 200);
    expect(Object.fromEntries(first)).toEqual({
      default: 480,
      fast: 2700,
      tank: 4200,
      ranged: 5400,
      boss: 9600,
    });
    expect(counts.get('boss')).toBe(1);
    expect(scheduledSpawnsAt(9600, DEFAULT_LANE_BALANCE.spawns)).toContain('boss');
  });

  it('a wave starting at second 0 first spawns on its interval tick', () => {
    const wave: SpawnWave = { kind: 'fast', startSecond: 0, endSecond: 10, everySeconds: 2 };
    expect(firstSpawns([wave], 600).first.get('fast')).toBe(120);

    // Tick 0 is never stepped, so the running spawner agrees.
    const systems = createLaneSystems({ balance: { spawns: [wave] } });
    const { events } = stepN(step, createRun({ seed: 1 }), 120, { systems });
    expect(spawnedOf(events).map((e) => e.tick)).toEqual([120]);
  });

  it('same-tick waves are listed in schedule order', () => {
    const spawns: SpawnWave[] = [
      { kind: 'tank', startSecond: 1, endSecond: 1, everySeconds: 1 },
      { kind: 'default', startSecond: 1, endSecond: 1, everySeconds: 1 },
    ];
    expect(scheduledSpawnsAt(60, spawns)).toEqual(['tank', 'default']);
    expect(scheduledSpawnsAt(60, [...spawns].reverse())).toEqual(['default', 'tank']);
  });
});

describe('scheduleSpawner', () => {
  it('adds the first default Mob at the Manhole on tick 480, during dialing', () => {
    const systems = createLaneSystems();
    const before = stepN(step, createRun({ seed: 1 }), 479, { systems });
    expect(before.events.filter((e) => e.type === 'mobSpawned')).toEqual([]);

    const { state, events } = step(before.state, [], systems);
    expect(state.phase).toBe('dialing');
    expect(events.filter((e) => e.type === 'mobSpawned')).toEqual([
      { type: 'mobSpawned', id: 1, kind: 'default', x: 800, source: 'schedule', tick: 480 },
    ]);
    expect(state.lane?.enemies[0]).toMatchObject({ id: 1, kind: 'default', x: 800, spawnTick: 480 });
  });

  it('adds Mobs of same-tick waves in schedule order with consecutive ids', () => {
    const spawns: SpawnWave[] = [
      { kind: 'tank', startSecond: 1, endSecond: 1, everySeconds: 1 },
      { kind: 'fast', startSecond: 1, endSecond: 1, everySeconds: 1 },
      { kind: 'default', startSecond: 1, endSecond: 1, everySeconds: 1 },
    ];
    const systems = createLaneSystems({ balance: { spawns } });
    const { state, events } = stepN(step, createRun({ seed: 1 }), 60, { systems });

    const spawned = spawnedOf(events);
    expect(spawned.map((e) => [e.id, e.kind, e.tick])).toEqual([
      [1, 'tank', 60],
      [2, 'fast', 60],
      [3, 'default', 60],
    ]);
    expect(state.lane?.enemies.map((e) => e.kind)).toEqual(['tank', 'fast', 'default']);
    expect(state.lane?.nextId).toBe(4);
  });
});
