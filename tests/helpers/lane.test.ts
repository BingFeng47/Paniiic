import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { resolveLaneBalance } from '../../src/game/balance/lane';
import type { GameState } from '../../src/game/types';
import {
  arbLaneRun,
  fastSchedule,
  laneWith,
  MAX_LANE_RUN_TICKS,
  runLane,
  type LaneRunSpec,
} from './lane';

const spec = (overrides: Partial<LaneRunSpec>): LaneRunSpec => ({
  seed: 1,
  spawns: fastSchedule(),
  ticks: 40,
  actions: [],
  ...overrides,
});

const enemiesOf = (state: GameState) => state.lane?.enemies ?? [];

describe('runLane', () => {
  it('turns an aimed action into a click at the Enemy’s Hit_Box centre on the state before the tick', () => {
    // fastSchedule() spawns the first default Mob (72 high) on tick 30.
    const result = runLane(spec({ actions: [{ tick: 40, aim: { kind: 'enemy', index: 0 } }] }));
    const seen = enemiesOf(result.states[39]);
    expect(seen).toHaveLength(1);
    expect(result.commands).toEqual([
      { tick: 40, command: { type: 'hammer', x: seen[0].x, y: 36 } },
    ]);
    expect(result.events.filter((e) => e.type === 'hammerSwing')).toEqual([
      { type: 'hammerSwing', x: seen[0].x, y: 36, targetId: seen[0].id, tick: 40 },
    ]);
  });

  it('wraps the Enemy index and aims at the chosen Enemy, not the first one', () => {
    // Ticks 30 and 120 spawn a default Mob (id 1) and a fast Mob (id 2, 48 high).
    const result = runLane(
      spec({ ticks: 130, actions: [{ tick: 130, aim: { kind: 'enemy', index: 3 } }] }),
    );
    const seen = enemiesOf(result.states[129]);
    expect(seen.map((e) => e.kind)).toEqual(['default', 'fast']);
    expect(result.commands).toEqual([
      { tick: 130, command: { type: 'hammer', x: seen[1].x, y: 24 } },
    ]);
    const swing = result.events.find((e) => e.type === 'hammerSwing');
    expect(swing).toMatchObject({ targetId: 2 });
  });

  it('sends raw points as they are, sends nothing for an aim with no Enemies, and keeps action order', () => {
    const result = runLane(
      spec({
        ticks: 5,
        downloadTick: 3,
        actions: [
          { tick: 3, aim: { kind: 'point', x: Number.NaN, y: 10 } },
          { tick: 2, aim: { kind: 'enemy', index: 0 } },
          { tick: 3, aim: { kind: 'point', x: 100, y: 10 } },
        ],
      }),
    );
    expect(result.commands).toEqual([
      { tick: 3, command: { type: 'startDownload' } },
      { tick: 3, command: { type: 'hammer', x: Number.NaN, y: 10 } },
      { tick: 3, command: { type: 'hammer', x: 100, y: 10 } },
    ]);
    expect(result.events.filter((e) => e.type === 'hammerSwing')).toEqual([
      { type: 'hammerSwing', x: 100, y: 10, targetId: null, tick: 3 },
    ]);
  });

  it('records every state and every tick’s events and returns the final state', () => {
    const result = runLane(spec({ ticks: 35 }));
    expect(result.states).toHaveLength(36);
    expect(result.states.map((s) => s.tick)).toEqual(Array.from({ length: 36 }, (_, i) => i));
    expect(result.tickEvents).toHaveLength(35);
    expect(result.tickEvents.flat()).toEqual(result.events);
    expect(result.tickEvents[29].map((e) => e.type)).toEqual(['mobSpawned']);
    expect(result.final).toBe(result.states[35]);
  });
});

describe('laneWith', () => {
  it('fills Enemy defaults, sorts by id and sets nextId above the highest id', () => {
    const state = laneWith([{ kind: 'boss', id: 7, x: 300 }, { kind: 'ranged' }], {
      hitPadding: 0,
    });
    expect(state.lane).toEqual({
      balance: resolveLaneBalance({ hitPadding: 0 }),
      nextId: 8,
      hammerReadyTick: 0,
      enemies: [
        {
          id: 2,
          kind: 'ranged',
          x: 800,
          hp: 3,
          spawnTick: 0,
          lastHitTick: null,
          nextSpitTick: null,
          lastSpitTick: null,
        },
        {
          id: 7,
          kind: 'boss',
          x: 300,
          hp: 150,
          spawnTick: 0,
          lastHitTick: null,
          summonsDone: 0,
          nextHitTick: null,
          lastMeleeTick: null,
        },
      ],
    });
  });
});

describe('arbLaneRun', () => {
  it('generates runs within the tick limit whose actions lead to hits, kills and misses', () => {
    const specs = fc.sample(arbLaneRun(), { numRuns: 100, seed: 2026 });
    const counts = { kills: 0, hits: 0, misses: 0, nonFinite: 0 };
    for (const s of specs) {
      expect(s.ticks).toBeGreaterThanOrEqual(1);
      expect(s.ticks).toBeLessThanOrEqual(MAX_LANE_RUN_TICKS);
      for (const a of s.actions) expect(a.tick).toBeLessThanOrEqual(s.ticks);
      const { events, commands } = runLane(s);
      counts.kills += events.filter((e) => e.type === 'mobKilled').length;
      counts.hits += events.filter((e) => e.type === 'hammerSwing' && e.targetId !== null).length;
      counts.misses += events.filter((e) => e.type === 'hammerSwing' && e.targetId === null).length;
      counts.nonFinite += commands.filter(
        (c) => c.command.type === 'hammer' && !Number.isFinite(c.command.x + c.command.y),
      ).length;
    }
    expect(counts.kills).toBeGreaterThan(0);
    expect(counts.hits).toBeGreaterThan(counts.misses);
    expect(counts.misses).toBeGreaterThan(0);
    expect(counts.nonFinite).toBeGreaterThan(0);
  });
});
