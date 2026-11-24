// Mob tests for src/game/mobs.ts (task 2.7): addMob and damageEnemy, movement and bites, the
// ranged Mob and its Globs, boss summons (Property 10). Run-level invariants over whole lane
// runs live in tests/game/laneProperties.test.ts.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { LaneBalanceOverrides } from '../../src/game/balance/lane';
import { createTickContext } from '../../src/game/context';
import { createLaneSystems } from '../../src/game/lane';
import { laneDraft } from '../../src/game/laneState';
import type { Enemy, MobKind } from '../../src/game/laneTypes';
import { addMob, damageEnemy } from '../../src/game/mobs';
import { step } from '../../src/game/step';
import type {
  GameEvent,
  GameState,
  InputCommand,
  MutableGameState,
} from '../../src/game/types';
import { attackerAt, hitBoxCentre, laneWith, type EnemySpec } from '../helpers/lane';

/** No scheduled spawns, so example runs only contain the Enemies a test puts on the lane. */
const NO_SPAWNS: LaneBalanceOverrides = { spawns: [] };
const SYSTEMS = createLaneSystems({ balance: NO_SPAWNS });

function lane(enemies: readonly EnemySpec[], overrides: LaneBalanceOverrides = {}): GameState {
  return laneWith(enemies, { ...NO_SPAWNS, ...overrides });
}

/** Runs `fn` on a draft of `state` with a fresh tick context and returns the draft and events. */
function onDraft(
  state: GameState,
  fn: (draft: MutableGameState, events: GameEvent[]) => void,
): { draft: MutableGameState; events: GameEvent[] } {
  const draft: MutableGameState = { ...structuredClone(state), pauseSources: [...state.pauseSources] };
  const events: GameEvent[] = [];
  fn(draft, events);
  return { draft, events };
}

/** Calls damageEnemy once on a draft of `state`. */
function hit(state: GameState, id: number, amount: number) {
  return onDraft(state, (d, ev) => damageEnemy(laneDraft(d), createTickContext(d, ev), id, amount));
}

/** Steps `ticks` times with the lane systems; `inputs[t]` is sent on the step producing tick t. */
function run(
  state: GameState,
  ticks: number,
  inputs: Readonly<Record<number, readonly InputCommand[]>> = {},
) {
  let s = state;
  const perTick: GameEvent[][] = [];
  for (let i = 0; i < ticks; i++) {
    const r = step(s, inputs[s.tick + 1] ?? [], SYSTEMS);
    s = r.state;
    perTick.push([...r.events]);
  }
  return { state: s, perTick, events: perTick.flat() };
}

const types = (events: readonly GameEvent[]) => events.map((e) => e.type);
const enemies = (state: GameState): readonly Enemy[] => state.lane?.enemies ?? [];
const byId = (state: GameState, id: number) => enemies(state).find((e) => e.id === id);

function clickOn(state: GameState, id: number): InputCommand {
  const { x, y } = hitBoxCentre(state, byId(state, id)!);
  return { type: 'hammer', x, y };
}

// ---------------------------------------------------------------------------------------------
// addMob and damageEnemy

describe('addMob', () => {
  it('gives the next id, full HP and the current tick, caps x and emits mobSpawned', () => {
    const { draft, events } = onDraft(lane([]), (d, ev) => {
      const ctx = createTickContext(d, ev);
      expect(addMob(laneDraft(d), ctx, 'tank', 5000, 'schedule')).toBe(1);
      expect(addMob(laneDraft(d), ctx, 'ranged', 300, 'bossSummon')).toBe(2);
    });
    expect(draft.lane?.enemies).toEqual([
      {
        id: 1,
        kind: 'tank',
        x: 800,
        hp: 4,
        spawnTick: 0,
        lastHitTick: null,
        nextHitTick: null,
        lastMeleeTick: null,
      },
      {
        id: 2,
        kind: 'ranged',
        x: 300,
        hp: 3,
        spawnTick: 0,
        lastHitTick: null,
        nextSpitTick: null,
        lastSpitTick: null,
      },
    ]);
    expect(draft.lane?.nextId).toBe(3);
    expect(events).toEqual([
      { tick: 0, type: 'mobSpawned', id: 1, kind: 'tank', x: 800, source: 'schedule' },
      { tick: 0, type: 'mobSpawned', id: 2, kind: 'ranged', x: 300, source: 'bossSummon' },
    ]);
  });

  it('throws on a non-finite x or one at or left of the Modem_Line', () => {
    onDraft(lane([]), (d, ev) => {
      const ctx = createTickContext(d, ev);
      for (const x of [Number.NaN, Number.POSITIVE_INFINITY, 0, -1]) {
        expect(() => addMob(laneDraft(d), ctx, 'default', x, 'schedule')).toThrow();
      }
      expect(d.lane?.enemies).toEqual([]);
      expect(d.lane?.nextId).toBe(1);
      expect(ev).toEqual([]);
    });
  });
});

describe('damageEnemy', () => {
  it('ignores unknown ids and rejects negative or non-finite amounts', () => {
    const state = lane([{ kind: 'default' }]);
    expect(hit(state, 99, 1).events).toEqual([]);
    expect(() => hit(state, 1, -1)).toThrow();
    expect(() => hit(state, 1, Number.NaN)).toThrow();
    expect(() => hit(state, 1, Number.POSITIVE_INFINITY)).toThrow();
  });

  it('reports the HP actually removed and floors HP at 0', () => {
    const { draft, events } = hit(lane([{ kind: 'tank', x: 500 }]), 1, 9);
    expect(events).toEqual([
      { tick: 0, type: 'mobHit', id: 1, kind: 'tank', damage: 4, hp: 0 },
      { tick: 0, type: 'mobKilled', id: 1, kind: 'tank', x: 500, dropKb: 12 },
    ]);
    expect(draft.lane?.enemies).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
// Movement and bites

describe('movement and Melee_Hits', () => {
  it('walks a default Mob 40 / 60 per tick, arrives at x 22 on tick 1,167, hits for 4 and stays', () => {
    const first = run(lane([{ kind: 'default' }]), 1);
    expect(byId(first.state, 1)?.x).toBe(800 - 40 / 60);

    const before = run(first.state, 1165);
    expect(byId(before.state, 1)).toMatchObject({ nextHitTick: null, lastMeleeTick: null });
    expect(byId(before.state, 1)!.x).toBeGreaterThan(22);
    expect(before.events).toEqual([]);

    const arrived = run(before.state, 1);
    expect(arrived.state.tick).toBe(1167);
    expect(arrived.events).toEqual([
      { tick: 1167, type: 'mobArrived', id: 1, kind: 'default' },
      { tick: 1167, type: 'mobBit', id: 1, kind: 'default', damage: 4 },
      { tick: 1167, type: 'modemHit', amount: 4, integrity: 96 },
    ]);
    expect(byId(arrived.state, 1)).toMatchObject({ x: 22, nextHitTick: 1257, lastMeleeTick: 1167 });
  });

  it('lands the second hit 90 ticks later and keeps the Attacker at x 22', () => {
    const state = lane([attackerAt('default')]);
    const r = run(state, 91);
    const bites = r.events.filter((e) => e.type === 'mobBit');
    expect(bites.map((e) => e.tick)).toEqual([1, 91]);
    expect(r.events.filter((e) => e.type === 'mobArrived')).toEqual([]);
    expect(r.state.integrity).toBe(92);
    for (const tickEvents of r.perTick.slice(1, 90)) expect(tickEvents).toEqual([]);
    expect(byId(r.state, 1)).toMatchObject({ x: 22, nextHitTick: 181, lastMeleeTick: 91 });
  });

  it.each([
    { kind: 'tank' as const, damage: 10, interval: 120, cause: 'tankBite' },
    { kind: 'boss' as const, damage: 20, interval: 120, cause: 'bossBite' },
  ])('requests a $cause burst after the first modem hit of a $kind only', ({ kind, damage, interval, cause }) => {
    const first = run(lane([attackerAt(kind)]), 1);
    expect(first.events).toEqual([
      { tick: 1, type: 'mobBit', id: 1, kind, damage },
      { tick: 1, type: 'modemHit', amount: damage, integrity: 100 - damage },
      { tick: 1, type: 'popupBurst', count: 3, cause },
    ]);
    expect(enemies(first.state)).toHaveLength(1);

    const second = run(first.state, interval);
    expect(second.events).toEqual([
      { tick: 1 + interval, type: 'mobBit', id: 1, kind, damage },
      { tick: 1 + interval, type: 'modemHit', amount: damage, integrity: 100 - 2 * damage },
    ]);
  });

  it('requests no pop-up burst on a default Mob\'s first hit', () => {
    const { events } = run(lane([attackerAt('default')]), 1);
    expect(types(events)).toEqual(['mobBit', 'modemHit']);
  });

  it('cancels the scheduled hit when the hammer kills the Attacker on that tick', () => {
    const state = lane([attackerAt('default', { hp: 1 })]);
    const { events, state: after } = run(state, 1, { 1: [clickOn(state, 1)] });
    expect(types(events)).toEqual(['hammerSwing', 'mobHit', 'mobKilled']);
    expect(events[2]).toMatchObject({ id: 1, kind: 'default', x: 22, dropKb: 3 });
    expect(enemies(after)).toEqual([]);
    expect(after.integrity).toBe(100);
  });

  it('resolves same-tick hits of Attackers 1 and 3 and Glob 2 in ascending id order', () => {
    const state = lane([
      attackerAt('tank', { id: 3 }),
      attackerAt('default', { id: 1 }),
      { kind: 'glob', id: 2, x: 0.2 },
    ]);
    const { events, state: after } = run(state, 1);
    expect(events).toEqual([
      { tick: 1, type: 'mobBit', id: 1, kind: 'default', damage: 4 },
      { tick: 1, type: 'modemHit', amount: 4, integrity: 96 },
      { tick: 1, type: 'mobBit', id: 2, kind: 'glob', damage: 5 },
      { tick: 1, type: 'modemHit', amount: 5, integrity: 91 },
      { tick: 1, type: 'mobBit', id: 3, kind: 'tank', damage: 10 },
      { tick: 1, type: 'modemHit', amount: 10, integrity: 81 },
      { tick: 1, type: 'popupBurst', count: 3, cause: 'tankBite' },
    ]);
    expect(enemies(after).map((e) => e.id)).toEqual([1, 3]);
  });
});

// ---------------------------------------------------------------------------------------------
// Ranged Mob and Globs

describe('ranged Mob and Globs', () => {
  it('stops at 400 after 600 ticks and spits at +60, +240 and +420', () => {
    const walking = run(lane([{ kind: 'ranged' }]), 599);
    expect(byId(walking.state, 1)).toMatchObject({ nextSpitTick: null });
    expect(byId(walking.state, 1)!.x).toBeGreaterThan(400);

    const arrived = run(walking.state, 1);
    expect(arrived.state.tick).toBe(600);
    expect(byId(arrived.state, 1)).toMatchObject({ x: 400, nextSpitTick: 660, lastSpitTick: null });
    expect(arrived.events).toEqual([]);

    const spitting = run(arrived.state, 420);
    const spits = spitting.events.filter((e) => e.type === 'globSpat');
    expect(spits).toEqual([
      { tick: 660, type: 'globSpat', id: 2, sourceId: 1, x: 400 },
      { tick: 840, type: 'globSpat', id: 3, sourceId: 1, x: 400 },
      { tick: 1020, type: 'globSpat', id: 4, sourceId: 1, x: 400 },
    ]);
    expect(byId(spitting.state, 1)).toMatchObject({ x: 400, lastSpitTick: 1020, nextSpitTick: 1200 });
    // A Glob spat this tick sits at the ranged Mob's x and starts moving on the next tick.
    expect(byId(spitting.state, 4)).toMatchObject({ kind: 'glob', x: 400, hp: 1, sourceId: 1 });
  });

  it('kills a Glob with one hammer hit and drops 0 KB', () => {
    const state = lane([{ kind: 'glob', x: 300, sourceId: 7 }]);
    const { events, state: after } = run(state, 1, { 1: [clickOn(state, 1)] });
    expect(types(events)).toEqual(['hammerSwing', 'mobHit', 'mobKilled']);
    expect(events[0]).toMatchObject({ targetId: 1 });
    expect(events[1]).toMatchObject({ id: 1, kind: 'glob', damage: 1, hp: 0 });
    expect(events[2]).toMatchObject({ id: 1, kind: 'glob', x: 300, dropKb: 0 });
    expect(enemies(after)).toEqual([]);
  });

  it('still impacts with a Glob for 5 and removes it', () => {
    const { events, state } = run(lane([{ kind: 'glob', x: 1 }]), 1); // 150 / 60 = 2.5 per tick
    expect(events).toEqual([
      { tick: 1, type: 'mobBit', id: 1, kind: 'glob', damage: 5 },
      { tick: 1, type: 'modemHit', amount: 5, integrity: 95 },
    ]);
    expect(state.integrity).toBe(95);
    expect(enemies(state)).toEqual([]);
  });

  it('keeps the Globs of a ranged Mob on the lane after it dies', () => {
    const state = lane([
      { kind: 'ranged', x: 400, hp: 1, nextSpitTick: 1000 },
      { kind: 'glob', x: 340, sourceId: 1 },
      { kind: 'glob', x: 200, sourceId: 1 },
    ]);
    const killed = run(state, 1, { 1: [clickOn(state, 1)] });
    expect(types(killed.events)).toEqual(['hammerSwing', 'mobHit', 'mobKilled']);
    expect(killed.events[2]).toMatchObject({ id: 1, kind: 'ranged', dropKb: 8 });
    expect(enemies(killed.state).map((e) => [e.id, e.kind])).toEqual([
      [2, 'glob'],
      [3, 'glob'],
    ]);

    const later = run(killed.state, 10);
    expect(byId(later.state, 2)).toMatchObject({ kind: 'glob', sourceId: 1 });
    expect(byId(later.state, 2)!.x).toBeCloseTo(340 - 11 * 2.5, 9);
    expect(byId(later.state, 3)!.x).toBeCloseTo(200 - 11 * 2.5, 9);
  });
});

// ---------------------------------------------------------------------------------------------
// Boss summons

// Default boss: 150 HP, 30 KB drop (docs/balance/2026-11-24-boss-threat.md, 2026-11-24-late-income.md).
describe('boss summons', () => {
  it('summons nothing when one 150-damage hit kills the boss', () => {
    const { draft, events } = hit(lane([{ kind: 'boss', x: 600 }]), 1, 150);
    expect(events).toEqual([
      { tick: 0, type: 'mobHit', id: 1, kind: 'boss', damage: 150, hp: 0 },
      { tick: 0, type: 'mobKilled', id: 1, kind: 'boss', x: 600, dropKb: 30 },
    ]);
    expect(draft.lane?.enemies).toEqual([]);
    expect(draft.lane?.nextId).toBe(2);
  });

  it('runs one summon per passed threshold in descending order, then none on the kill', () => {
    const { draft, events } = hit(lane([{ kind: 'boss' }]), 1, 76); // 150 → 74: passes 0.75, 0.5
    expect(types(events)).toEqual([
      'mobHit',
      'mobSpawned',
      'mobSpawned',
      'bossSummon',
      'popupBurst',
      'mobSpawned',
      'mobSpawned',
      'bossSummon',
      'popupBurst',
    ]);
    expect(events.filter((e) => e.type === 'bossSummon')).toEqual([
      { tick: 0, type: 'bossSummon', id: 1, threshold: 0.75, spawnedIds: [2, 3] },
      { tick: 0, type: 'bossSummon', id: 1, threshold: 0.5, spawnedIds: [4, 5] },
    ]);
    expect(byId(draft, 1)).toMatchObject({ kind: 'boss', hp: 74, summonsDone: 2 });

    const killed = hit(draft, 1, 150);
    expect(killed.events).toEqual([
      { tick: 0, type: 'mobHit', id: 1, kind: 'boss', damage: 74, hp: 0 },
      { tick: 0, type: 'mobKilled', id: 1, kind: 'boss', x: 800, dropKb: 30 },
    ]);
  });

  it.each([
    { x: 700, summonCount: 2, expected: [700, 736] },
    { x: 790, summonCount: 2, expected: [790, 800] },
    { x: 750, summonCount: 4, expected: [750, 786, 800, 800] },
  ])(
    'places $summonCount summons of a boss at x $x at boss x + k × 36 capped at 800',
    ({ x, summonCount, expected }) => {
      const { draft, events } = hit(lane([{ kind: 'boss', x }], { boss: { summonCount } }), 1, 38); // 150 → 112: passes 0.75
      const spawned = events.filter((e) => e.type === 'mobSpawned');
      expect(spawned.map((e) => e.x)).toEqual(expected);
      for (const e of spawned) expect(e).toMatchObject({ kind: 'default', source: 'bossSummon' });
      expect(enemies(draft).slice(1)).toEqual(
        expected.map((ex, k) => ({
          id: 2 + k,
          kind: 'default',
          x: ex,
          hp: 2,
          spawnTick: 0,
          lastHitTick: null,
          nextHitTick: null,
          lastMeleeTick: null,
        })),
      );
    },
  );
});

// ---------------------------------------------------------------------------------------------
// Property 10

/** Strictly decreasing shares in (0, 1), possibly none. */
const thresholdsArb = fc
  .uniqueArray(fc.integer({ min: 1, max: 99 }), { maxLength: 4 })
  .map((list) => [...list].sort((a, b) => b - a).map((n) => n / 100));

/** Zero hits, small whole and fractional hits and hits far above any boss HP. */
const amountArb = fc.oneof(
  fc.constant(0),
  fc.integer({ min: 0, max: 40 }),
  fc.double({ min: 0, max: 40, noNaN: true }),
  fc.constant(1e9),
);

const bossCaseArb = fc.record({
  maxHp: fc.integer({ min: 1, max: 60 }),
  thresholds: thresholdsArb,
  summonCount: fc.integer({ min: 0, max: 3 }),
  summonSpacing: fc.double({ min: 0, max: 100, noNaN: true }),
  popupBurstCount: fc.integer({ min: 0, max: 5 }),
  bossX: fc.double({ min: 1, max: 800, noNaN: true }),
  hits: fc.array(amountArb, { minLength: 1, maxLength: 25 }),
});

describe('Property 10', () => {
  it('summons once per newly passed threshold, in order, and never on the killing hit', () => {
    // Property: Req 6.1 a surviving boss summons at each Boss_Threshold it newly passes
    // Property: Req 6.2 one summon per passed threshold, descending, each at most once
    // Property: Req 6.3 the killing hit summons nothing
    // Feature: connection-lane, Property 10: Boss summons follow the thresholds
    fc.assert(
      fc.property(bossCaseArb, (c) => {
        const laneLength = 800;
        let state = lane([{ kind: 'boss', x: c.bossX }], {
          enemies: { boss: { hp: c.maxHp } },
          boss: { thresholds: c.thresholds, summonCount: c.summonCount, summonSpacing: c.summonSpacing },
          popupBurstCount: c.popupBurstCount,
        });
        let hp = c.maxHp;
        let done = 0;
        let alive = true;
        const summoned: number[] = [];

        for (const amount of c.hits) {
          const nextId = state.lane!.nextId;
          const { draft, events } = hit(state, 1, amount);
          state = draft;

          if (!alive) {
            expect(events).toEqual([]);
            continue;
          }

          const newHp = Math.max(0, hp - amount);
          const mobHit = { tick: 0, type: 'mobHit', id: 1, kind: 'boss', damage: hp - newHp, hp: newHp };
          if (newHp === 0) {
            expect(events).toEqual([
              mobHit,
              { tick: 0, type: 'mobKilled', id: 1, kind: 'boss', x: c.bossX, dropKb: 30 },
            ]);
            expect(byId(state, 1)).toBeUndefined();
            expect(state.lane!.nextId).toBe(nextId);
            alive = false;
            continue;
          }

          const passed = c.thresholds.filter((t) => newHp <= t * c.maxHp).length;
          const expected: unknown[] = [mobHit];
          let id = nextId;
          for (const threshold of c.thresholds.slice(done, passed)) {
            const spawnedIds: number[] = [];
            for (let k = 0; k < c.summonCount; k++) {
              // Summons are clamped to the default Mob's Attack_Point (22), then capped at the Manhole.
              const x = Math.min(laneLength, Math.max(22, c.bossX + k * c.summonSpacing));
              expected.push({ tick: 0, type: 'mobSpawned', id, kind: 'default', x, source: 'bossSummon' });
              spawnedIds.push(id);
              id += 1;
            }
            expected.push({ tick: 0, type: 'bossSummon', id: 1, threshold, spawnedIds });
            expected.push({ tick: 0, type: 'popupBurst', count: c.popupBurstCount, cause: 'bossSummon' });
            summoned.push(threshold);
          }
          expect(events).toEqual(expected);
          expect(byId(state, 1)).toMatchObject({ kind: 'boss', hp: newHp, summonsDone: passed });
          hp = newHp;
          done = passed;
        }

        // Across the whole fight: descending thresholds, each at most once.
        for (let i = 1; i < summoned.length; i++) expect(summoned[i]).toBeLessThan(summoned[i - 1]);
        expect(summoned).toEqual(c.thresholds.slice(0, summoned.length));
      }),
      { numRuns: 200 },
    );
  });
});

describe('addMob covers every Mob kind', () => {
  it.each<MobKind>(['default', 'fast', 'tank', 'ranged', 'boss'])('adds a %s Mob at full HP', (kind) => {
    const { draft } = onDraft(lane([]), (d, ev) => {
      addMob(laneDraft(d), createTickContext(d, ev), kind, 640, 'schedule');
    });
    const added = draft.lane!.enemies[0];
    expect(added).toMatchObject({ id: 1, kind, x: 640, hp: draft.lane!.balance.enemies[kind].hp });
  });
});

describe('addMob clamps melee Mobs to their Attack_Point', () => {
  it('places melee Mobs at or right of their Attack_Point and leaves ranged Mobs alone', () => {
    const { draft } = onDraft(lane([]), (d, ev) => {
      const ctx = createTickContext(d, ev);
      addMob(laneDraft(d), ctx, 'default', 5, 'schedule');
      addMob(laneDraft(d), ctx, 'tank', 10, 'schedule');
      addMob(laneDraft(d), ctx, 'boss', 100, 'schedule');
      addMob(laneDraft(d), ctx, 'ranged', 5, 'schedule');
    });
    expect(draft.lane!.enemies.map((e) => e.x)).toEqual([22, 36, 100, 5]);
  });
});

describe('ranged Mobs never become Attackers', () => {
  it('stays at its stop point, spits, and never emits mobArrived or bites itself', () => {
    const { events, state } = run(lane([{ kind: 'ranged' }]), 1300);
    expect(events.some((e) => e.type === 'mobArrived')).toBe(false);
    expect(events.filter((e) => e.type === 'mobBit').every((e) => e.kind === 'glob')).toBe(true);
    const ranged = byId(state, 1)!;
    expect(ranged).toMatchObject({ kind: 'ranged', x: 400 });
    expect(ranged).not.toHaveProperty('nextHitTick');
  });
});
