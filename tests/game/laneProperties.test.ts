// Property-based tests for whole connection-lane runs (design: Correctness Properties 1–7 and 9).
// Every property drives runs through runLane() from tests/helpers/lane.ts: a seed, a Spawn_Schedule
// override, up to 1,200 ticks and a list of hammer actions (mostly aimed at Enemies, some raw and
// non-finite points). Each property is one fast-check test with at least 100 runs.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { secondsToTicks, type SpawnWave } from '../../src/game/balance/lane';
import { hitTest } from '../../src/game/hammer';
import { createLaneSystems } from '../../src/game/lane';
import { isAttacker, type Enemy, type EnemyKind, type LaneState, type MobKind } from '../../src/game/laneTypes';
import { scheduledSpawnsAt } from '../../src/game/spawner';
import { TICK_RATE, type GameEvent, type GameState } from '../../src/game/types';
import {
  arbLaneRun,
  laneRunSystems,
  runLane,
  type LaneRunResult,
} from '../helpers/lane';

const NUM_RUNS = 100;
/** Each property plays 100+ runs of up to 1,200 ticks; give it more than the 5 s default. */
const RUN_TIMEOUT_MS = 30_000;
/** Tolerance for movement: one float subtraction per tick. */
const MOVE_EPSILON = 1e-9;

// ---------------------------------------------------------------------------------------------
// Small readers

const enemiesOf = (state: GameState): readonly Enemy[] => state.lane?.enemies ?? [];

const byId = (state: GameState): Map<number, Enemy> =>
  new Map(enemiesOf(state).map((enemy) => [enemy.id, enemy]));

/** Ids and kinds announced on one tick, in event order (`mobSpawned` and `globSpat`). */
function announced(events: readonly GameEvent[]): { id: number; kind: EnemyKind }[] {
  const out: { id: number; kind: EnemyKind }[] = [];
  for (const e of events) {
    if (e.type === 'mobSpawned') out.push({ id: e.id, kind: e.kind });
    else if (e.type === 'globSpat') out.push({ id: e.id, kind: 'glob' });
  }
  return out;
}

/** The lane balance every run of `result` uses (from the first state that has a lane). */
function laneBalanceOf(result: LaneRunResult): LaneState['balance'] | null {
  return result.states.find((s) => s.lane !== undefined)?.lane?.balance ?? null;
}

/** Independent expansion of a Spawn_Schedule as (tick, kind) pairs on ticks 1..lastTick. */
function expandSchedule(
  spawns: readonly SpawnWave[],
  lastTick: number,
): { tick: number; kind: MobKind }[] {
  const pairs: { tick: number; kind: MobKind; wave: number }[] = [];
  spawns.forEach((wave, index) => {
    const start = Math.round(wave.startSecond * TICK_RATE);
    const end = Math.round(wave.endSecond * TICK_RATE);
    const every = Math.round(wave.everySeconds * TICK_RATE);
    for (let t = start; t <= end && t <= lastTick; t += every) {
      if (t >= 1) pairs.push({ tick: t, kind: wave.kind, wave: index });
    }
  });
  pairs.sort((a, b) => a.tick - b.tick || a.wave - b.wave);
  return pairs.map(({ tick, kind }) => ({ tick, kind }));
}

// ---------------------------------------------------------------------------------------------
// Properties

describe('connection-lane run properties', () => {
  // Property: Req 1.5, 1.6 same seed, schedule and inputs give identical states and events, and
  // reused Lane_Systems behave like fresh ones
  // Feature: connection-lane, Property 1: Lane runs are deterministic and lane systems hold no hidden state
  it('Property 1: lane runs are deterministic and lane systems hold no hidden state', () => {
    fc.assert(
      // Three full runs per case, so this property uses shorter runs than the others.
      fc.property(arbLaneRun(600), arbLaneRun(200), (spec, other) => {
        // Two fresh system sets: identical states and events on every tick.
        const first = runLane(spec, laneRunSystems(spec));
        const shared = laneRunSystems(spec);
        const second = runLane(spec, shared);
        expect(second.states).toEqual(first.states);
        expect(second.tickEvents).toEqual(first.tickEvents);

        // Reuse the second set after an unrelated run (other seed, ticks and actions).
        runLane(other, shared);
        const again = runLane(spec, shared);
        expect(again.states).toEqual(first.states);
        expect(again.tickEvents).toEqual(first.tickEvents);
      }),
      { numRuns: NUM_RUNS },
    );
  }, RUN_TIMEOUT_MS);

  // Property: Req 1.3 lane states and events are plain JSON data
  // Feature: connection-lane, Property 2: Lane states and events survive a JSON round trip
  it('Property 2: lane states and events survive a JSON round trip', () => {
    fc.assert(
      fc.property(arbLaneRun(), (spec) => {
        const { states, events } = runLane(spec);
        for (const state of states) {
          expect(JSON.parse(JSON.stringify(state))).toStrictEqual(state);
        }
        for (const event of events) {
          expect(JSON.parse(JSON.stringify(event))).toStrictEqual(event);
        }
      }),
      { numRuns: NUM_RUNS },
    );
  }, RUN_TIMEOUT_MS);

  // Property: Req 4.1, 4.3, 5.1, 5.5 Enemies move left by speed / 60 per tick, stay in
  // (0, laneLength], and a ranged Mob stops at the stop point and stays there
  // Feature: connection-lane, Property 3: Enemies only move left, at their speed, and stay on the lane
  it('Property 3: Enemies only move left, at their speed, and stay on the lane', () => {
    fc.assert(
      fc.property(arbLaneRun(), (spec) => {
        const { states } = runLane(spec);
        for (let i = 0; i < states.length; i++) {
          const lane = states[i].lane;
          if (lane === undefined) continue;
          const { laneLength, ranged } = lane.balance;
          for (const enemy of lane.enemies) {
            expect(enemy.x).toBeGreaterThan(0);
            expect(enemy.x).toBeLessThanOrEqual(laneLength);
            if (enemy.kind === 'ranged') {
              expect(enemy.x).toBeGreaterThanOrEqual(ranged.stopX);
              if (enemy.nextSpitTick !== null) expect(enemy.x).toBe(ranged.stopX);
            }
          }
          if (i === 0) continue;
          const previous = byId(states[i - 1]);
          for (const enemy of lane.enemies) {
            const before = previous.get(enemy.id);
            if (before === undefined) continue; // entered this tick (Manhole, summon or spit)
            // Attackers stand at the Modem (lane-melee); this property covers walking Enemies.
            if (isAttacker(before) || isAttacker(enemy)) continue;
            const moved = before.x - lane.balance.enemies[enemy.kind].speed / TICK_RATE;
            if (before.kind === 'ranged' && enemy.kind === 'ranged') {
              if (before.nextSpitTick !== null) {
                // Stopped: never moves again.
                expect(enemy.x).toBe(ranged.stopX);
                expect(enemy.nextSpitTick).not.toBeNull();
              } else if (enemy.nextSpitTick !== null) {
                // Arrived this tick: the move reached the stop point, and it was clamped there.
                expect(moved).toBeLessThanOrEqual(ranged.stopX + MOVE_EPSILON);
                expect(enemy.x).toBe(ranged.stopX);
              } else {
                expect(Math.abs(enemy.x - moved)).toBeLessThanOrEqual(MOVE_EPSILON);
                expect(enemy.x).toBeGreaterThan(ranged.stopX);
              }
            } else {
              expect(enemy.kind).toBe(before.kind);
              expect(Math.abs(enemy.x - moved)).toBeLessThanOrEqual(MOVE_EPSILON);
            }
          }
        }
      }),
      { numRuns: NUM_RUNS },
    );
  }, RUN_TIMEOUT_MS);

  // Property: Req 3.5, 4.2, 8.2 ids are handed out 1, 2, 3...; each Enemy starts at full HP and
  // leaves the lane exactly once: Mobs only by mobKilled, Globs by mobKilled or one mobBit
  // Feature: lane-melee, Property 4: Every Enemy enters once and leaves once (Req 1.5, 3.2, 6.2, 8.1, 8.2)
  it('Property 4: every Enemy enters once and leaves once', () => {
    fc.assert(
      fc.property(arbLaneRun(), (spec) => {
        const result = runLane(spec);
        const { states, tickEvents } = result;
        const balance = laneBalanceOf(result);
        let expectedId = 1;
        const kinds = new Map<number, EnemyKind>();

        for (let i = 1; i < states.length; i++) {
          const state = states[i];
          const events = tickEvents[i - 1];
          const current = byId(state);

          // Entries: consecutive ids, full HP and the spawn tick, of the announced kind.
          const entered = announced(events);
          for (const { id, kind } of entered) {
            expect(id).toBe(expectedId);
            expectedId += 1;
            kinds.set(id, kind);
            const enemy = current.get(id);
            if (enemy !== undefined) {
              expect(enemy.kind).toBe(kind);
              expect(enemy.hp).toBe(balance!.enemies[kind].hp);
              expect(enemy.spawnTick).toBe(state.tick);
            }
          }
          if (state.lane !== undefined) expect(state.lane.nextId).toBe(expectedId);

          // No Enemy appears without being announced on this tick.
          const candidates = new Set([...byId(states[i - 1]).keys(), ...entered.map((e) => e.id)]);
          for (const id of current.keys()) expect(candidates.has(id)).toBe(true);

          // Exits: exactly one mobKilled, or one mobBit for a Glob, for each id that left, and
          // nothing else. A Mob's mobBit (an Attacker's hit) never removes it.
          const left = [...candidates].filter((id) => !current.has(id)).sort((a, b) => a - b);
          for (const e of events) {
            if (e.type === 'mobBit' && e.kind !== 'glob') expect(current.has(e.id)).toBe(true);
          }
          const exits = events
            .filter(
              (e): e is Extract<GameEvent, { type: 'mobKilled' | 'mobBit' }> =>
                e.type === 'mobKilled' || (e.type === 'mobBit' && e.kind === 'glob'),
            )
            .map((e) => e.id)
            .sort((a, b) => a - b);
          expect(exits).toEqual(left);

          for (const e of events) {
            if (e.type !== 'mobKilled' && e.type !== 'mobBit') continue;
            expect(e.kind).toBe(kinds.get(e.id));
            if (e.type === 'mobKilled') expect(e.dropKb).toBe(balance!.enemies[e.kind].dropKb);
          }
        }
      }),
      { numRuns: NUM_RUNS },
    );
  }, RUN_TIMEOUT_MS);

  // Property: Req 4.2, 4.5 every mobBit is immediately followed by its modemHit, and integrity is
  // the maximum minus every bite so far, floored at 0
  // Feature: connection-lane, Property 5: Modem damage equals the sum of bites
  it('Property 5: modem damage equals the sum of bites', () => {
    fc.assert(
      fc.property(arbLaneRun(), (spec) => {
        const { states, tickEvents } = runLane(spec);
        const max = states[0].balance.maxIntegrity;
        let bitten = 0;
        for (let i = 1; i < states.length; i++) {
          const events = tickEvents[i - 1];
          events.forEach((e, k) => {
            if (e.type === 'mobBit') {
              const next = events[k + 1];
              expect(next).toMatchObject({ type: 'modemHit', amount: e.damage });
              bitten += e.damage;
            }
            if (e.type === 'modemHit') {
              expect(events[k - 1]?.type).toBe('mobBit');
              expect(e.integrity).toBe(Math.max(0, max - bitten));
            }
          });
          expect(states[i].integrity).toBe(Math.max(0, max - bitten));
        }
      }),
      { numRuns: NUM_RUNS },
    );
  }, RUN_TIMEOUT_MS);

  // Property: Req 8.1, 8.3 Enemy HP stays in [1, maxHp] and every mobHit reports the HP removed
  // Feature: connection-lane, Property 6: HP stays in range and hits account for every point removed
  it('Property 6: HP stays in range and hits account for every point removed', () => {
    fc.assert(
      fc.property(arbLaneRun(), (spec) => {
        const result = runLane(spec);
        const { states, tickEvents } = result;
        const balance = laneBalanceOf(result);
        for (let i = 1; i < states.length; i++) {
          // HP as the tick goes along: the previous state, then entries and hits in event order.
          const hp = new Map([...byId(states[i - 1])].map(([id, e]) => [id, e.hp]));
          for (const e of tickEvents[i - 1]) {
            if (e.type === 'mobSpawned') hp.set(e.id, balance!.enemies[e.kind].hp);
            else if (e.type === 'globSpat') hp.set(e.id, balance!.enemies.glob.hp);
            else if (e.type === 'mobHit') {
              const before = hp.get(e.id);
              expect(before).toBeDefined();
              expect(e.hp).toBeGreaterThanOrEqual(0);
              expect(e.damage).toBe(before! - e.hp);
              hp.set(e.id, e.hp);
            }
          }
          for (const enemy of enemiesOf(states[i])) {
            expect(enemy.hp).toBeGreaterThanOrEqual(1);
            expect(enemy.hp).toBeLessThanOrEqual(balance!.enemies[enemy.kind].hp);
            expect(enemy.hp).toBe(hp.get(enemy.id));
          }
        }
      }),
      { numRuns: NUM_RUNS },
    );
  }, RUN_TIMEOUT_MS);

  // Property: Req 3.2, 3.6, 3.7 scheduled spawns are the schedule's expansion in schedule order,
  // at the Manhole, whatever the player does
  // Feature: connection-lane, Property 7: Scheduled spawns follow the schedule and ignore the player
  it('Property 7: scheduled spawns follow the schedule and ignore the player', () => {
    const scheduled = (result: LaneRunResult) =>
      result.events.flatMap((e) =>
        e.type === 'mobSpawned' && e.source === 'schedule' ? [{ tick: e.tick, kind: e.kind, x: e.x }] : [],
      );
    fc.assert(
      fc.property(arbLaneRun(), (spec) => {
        const played = runLane(spec);
        const idle = runLane({ ...spec, actions: [], downloadTick: null });
        const laneLength = laneBalanceOf(played)?.laneLength ?? 0;

        for (const run of [played, idle]) {
          const last = run.final.tick;
          const spawns = scheduled(run);
          for (const s of spawns) expect(s.x).toBe(laneLength);
          const pairs = spawns.map(({ tick, kind }) => ({ tick, kind }));
          expect(pairs).toEqual(expandSchedule(spec.spawns, last));
          const viaRule: { tick: number; kind: MobKind }[] = [];
          for (let t = 1; t <= last; t++) {
            for (const kind of scheduledSpawnsAt(t, spec.spawns)) viaRule.push({ tick: t, kind });
          }
          expect(pairs).toEqual(viaRule);
        }

        // Up to the tick both runs reached, the player's actions changed nothing.
        const common = Math.min(played.final.tick, idle.final.tick);
        const upTo = (run: LaneRunResult) => scheduled(run).filter((s) => s.tick <= common);
        expect(upTo(played)).toEqual(upTo(idle));
      }),
      { numRuns: NUM_RUNS },
    );
  }, RUN_TIMEOUT_MS);

  // Property: Req 7.3, 7.4, 7.5, 7.6 swings match a cooldown model over the commands in arrival
  // order, and each swing targets what hitTest finds on the state the tick started from
  // Feature: connection-lane, Property 9: The hammer obeys its cooldown
  it('Property 9: the hammer obeys its cooldown', () => {
    const arbCase = fc.record({
      spec: arbLaneRun(),
      cooldownTicks: fc.integer({ min: 1, max: 30 }),
    });
    fc.assert(
      fc.property(arbCase, ({ spec, cooldownTicks }) => {
        const systems = createLaneSystems({
          balance: { spawns: spec.spawns, hammer: { cooldownSeconds: cooldownTicks / TICK_RATE } },
        });
        expect(secondsToTicks(cooldownTicks / TICK_RATE)).toBe(cooldownTicks);
        const { states, events, commands, final } = runLane(spec, systems);

        let ready = 0;
        const expected: GameEvent[] = [];
        for (const { tick, command } of commands) {
          if (command.type !== 'hammer') continue;
          if (!Number.isFinite(command.x) || !Number.isFinite(command.y)) continue;
          if (tick < ready) continue;
          ready = tick + cooldownTicks;
          const lane = states[tick - 1].lane;
          const target = lane === undefined ? null : hitTest(lane, command.x, command.y);
          expected.push({
            type: 'hammerSwing',
            x: command.x,
            y: command.y,
            targetId: target?.id ?? null,
            tick,
          });
        }
        expect(events.filter((e) => e.type === 'hammerSwing')).toEqual(expected);
        if (final.lane !== undefined) expect(final.lane.hammerReadyTick).toBe(ready);
      }),
      { numRuns: NUM_RUNS },
    );
  }, RUN_TIMEOUT_MS);
});
