import { describe, expect, it } from 'vitest';
import { DEFAULT_LANE_BALANCE, resolveLaneBalance } from '../../src/game/balance/lane';
import type { System } from '../../src/game/context';
import { initialLane, laneDraft, laneOf } from '../../src/game/laneState';
import { createRun } from '../../src/game/state';
import { step } from '../../src/game/step';
import type { MutableGameState } from '../../src/game/types';

describe('initialLane', () => {
  it('has no Enemies, next id 1 and the hammer ready from tick 0 (Req 1.1)', () => {
    const balance = resolveLaneBalance({ laneLength: 500 });
    expect(initialLane(balance)).toEqual({ balance, nextId: 1, enemies: [], hammerReadyTick: 0 });
  });

  it('is plain data that survives a JSON round trip (Req 1.3)', () => {
    const lane = initialLane(DEFAULT_LANE_BALANCE);
    expect(JSON.parse(JSON.stringify(lane))).toEqual(lane);
  });

  it('gives every lane its own enemies array', () => {
    expect(initialLane(DEFAULT_LANE_BALANCE).enemies).not.toBe(
      initialLane(DEFAULT_LANE_BALANCE).enemies,
    );
  });
});

describe('laneOf', () => {
  it('returns null for a run without a lane and the lane once it exists', () => {
    const run = createRun({ seed: 1 });
    expect(laneOf(run)).toBeNull();
    const lane = initialLane(DEFAULT_LANE_BALANCE);
    expect(laneOf({ ...run, lane })).toBe(lane);
  });
});

describe('laneDraft', () => {
  it('throws when draft.lane is absent (ensureLane did not run)', () => {
    const draft: MutableGameState = { ...createRun({ seed: 1 }), pauseSources: [] };
    expect(() => laneDraft(draft)).toThrow(/ensureLane/);
  });

  it('gives a writable view whose edits land in the next state without touching the input', () => {
    const ensure: System = (draft) => {
      draft.lane ??= initialLane(DEFAULT_LANE_BALANCE);
    };
    const edit: System = (draft, ctx) => {
      const lane = laneDraft(draft);
      lane.enemies.push({
        kind: 'default',
        nextHitTick: null,
        lastMeleeTick: null,
        id: lane.nextId,
        x: 800,
        hp: 2,
        spawnTick: ctx.tick,
        lastHitTick: null,
      });
      lane.nextId += 1;
      lane.hammerReadyTick = ctx.tick + 18;
    };

    const first = step(createRun({ seed: 1 }), [], [ensure, edit]).state;
    const snapshot = structuredClone(first);
    const second = step(first, [], [ensure, edit]).state;

    expect(first).toEqual(snapshot);
    expect(laneOf(first)?.enemies.map((e) => e.id)).toEqual([1]);
    expect(laneOf(second)).toMatchObject({ nextId: 3, hammerReadyTick: 20 });
    expect(laneOf(second)?.enemies.map((e) => e.id)).toEqual([1, 2]);
    expect(JSON.parse(JSON.stringify(second))).toEqual(second);
  });
});
