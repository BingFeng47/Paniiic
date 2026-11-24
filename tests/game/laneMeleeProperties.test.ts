// Property-based tests for Mobs that stay at the modem and keep hitting it (lane-melee design:
// Correctness Properties 1, 2, 3, 6 and 7). Runs use a short lane (120–300 Lane_Units, ranged
// stop point at half of it) and random Hit_Intervals, so melee Mobs reach their Attack_Point and
// become Attackers within a few hundred ticks. Each property is one fast-check test, 100 runs.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  attackPoint,
  secondsToTicks,
  type LaneBalance,
  type LaneBalanceOverrides,
} from '../../src/game/balance/lane';
import { createLaneSystems } from '../../src/game/lane';
import { isMeleeKind, type EnemyKind, type MeleeKind } from '../../src/game/laneTypes';
import type { GameEvent } from '../../src/game/types';
import { arbLaneRun, runLane, type LaneRunResult, type LaneRunSpec } from '../helpers/lane';

const NUM_RUNS = 100;
const RUN_TIMEOUT_MS = 30_000;
const MAX_TICKS = 900;

interface MeleeRunSpec {
  readonly run: LaneRunSpec;
  readonly overrides: LaneBalanceOverrides;
}

/** Hit_Interval in seconds: 1 tick up to 2.5 s, in sixtieths. */
const arbInterval = fc.integer({ min: 1, max: 150 }).map((t) => t / 60);

/** A lane run on a short lane so melee Mobs reach the modem and Attackers appear. */
function arbMeleeRun(): fc.Arbitrary<MeleeRunSpec> {
  return fc
    .record({
      run: arbLaneRun(MAX_TICKS),
      laneLength: fc.integer({ min: 120, max: 300 }),
      default: arbInterval,
      fast: arbInterval,
      tank: arbInterval,
      boss: arbInterval,
    })
    .map(({ run, laneLength, ...hits }) => ({
      run,
      overrides: {
        spawns: run.spawns,
        laneLength,
        ranged: { stopX: laneLength / 2 },
        melee: {
          default: { hitEverySeconds: hits.default },
          fast: { hitEverySeconds: hits.fast },
          tank: { hitEverySeconds: hits.tank },
          boss: { hitEverySeconds: hits.boss },
        },
      },
    }));
}

function play(spec: MeleeRunSpec): LaneRunResult {
  return runLane(spec.run, createLaneSystems({ balance: spec.overrides }));
}

function balanceOf(result: LaneRunResult): LaneBalance | null {
  return result.states.find((s) => s.lane !== undefined)?.lane?.balance ?? null;
}

/** Per Enemy id: kind, arrival tick, `mobBit` ticks and `mobKilled` tick. */
interface Track {
  kind: EnemyKind;
  arrived: number | null;
  bits: number[];
  killed: number | null;
}

function track(result: LaneRunResult): Map<number, Track> {
  const out = new Map<number, Track>();
  const get = (id: number, kind: EnemyKind): Track => {
    let t = out.get(id);
    if (t === undefined) {
      t = { kind, arrived: null, bits: [], killed: null };
      out.set(id, t);
    }
    return t;
  };
  result.tickEvents.forEach((events, i) => {
    const tick = result.states[i + 1].tick;
    for (const e of events) {
      if (e.type === 'mobSpawned') get(e.id, e.kind);
      else if (e.type === 'globSpat') get(e.id, 'glob');
      else if (e.type === 'mobArrived') get(e.id, e.kind).arrived = tick;
      else if (e.type === 'mobBit') get(e.id, e.kind).bits.push(tick);
      else if (e.type === 'mobKilled') get(e.id, e.kind).killed = tick;
    }
  });
  return out;
}

describe('lane-melee run properties', () => {
  // Property: Req 1.1, 1.3, 1.4 Attackers stand at their Attack_Point, walkers stay right of it
  // Feature: lane-melee, Property 1: Attackers stand still at their Attack_Point
  // **Validates: Requirements 1.1, 1.3, 1.4**
  it('Property 1: Attackers stand still at their Attack_Point', () => {
    fc.assert(
      fc.property(arbMeleeRun(), (spec) => {
        const { states } = play(spec);
        for (const state of states) {
          const lane = state.lane;
          if (lane === undefined) continue;
          for (const enemy of lane.enemies) {
            expect(enemy.x).toBeGreaterThan(0);
            expect(enemy.x).toBeLessThanOrEqual(lane.balance.laneLength);
            if (!isMeleeKind(enemy.kind) || !('nextHitTick' in enemy)) continue;
            const point = attackPoint(lane.balance, enemy.kind);
            if (enemy.nextHitTick !== null) expect(enemy.x).toBe(point);
            else expect(enemy.x).toBeGreaterThan(point);
          }
        }
      }),
      { numRuns: NUM_RUNS },
    );
  }, RUN_TIMEOUT_MS);

  // Property: Req 1.2, 2.1, 2.4, 2.5 Melee_Hits land on arrival plus whole Hit_Intervals
  // Feature: lane-melee, Property 2: Hits follow the Hit_Interval
  // **Validates: Requirements 1.2, 2.1, 2.4, 2.5**
  it('Property 2: hits follow the Hit_Interval', () => {
    fc.assert(
      fc.property(arbMeleeRun(), (spec) => {
        const result = play(spec);
        const balance = balanceOf(result);
        if (balance === null) return;
        const lastTick = result.final.tick;
        for (const t of track(result).values()) {
          if (!isMeleeKind(t.kind)) continue;
          if (t.arrived === null) {
            expect(t.bits).toEqual([]);
            continue;
          }
          const every = secondsToTicks(balance.melee[t.kind as MeleeKind].hitEverySeconds);
          // Alive through lastTick, or through the tick before its kill.
          const end = t.killed === null ? lastTick : t.killed - 1;
          const n = end - t.arrived;
          const expected: number[] = [];
          for (let k = 0; t.arrived + k * every <= end; k++) expected.push(t.arrived + k * every);
          expect(t.bits).toEqual(expected);
          expect(t.bits.length).toBe(Math.floor(n / every) + 1);
        }
      }),
      { numRuns: NUM_RUNS },
    );
  }, RUN_TIMEOUT_MS);

  // Property: Req 3.1, 3.2, 3.3 no hit on or after the kill tick, melee Mobs leave only by kill
  // Feature: lane-melee, Property 3: Killed Attackers stop hitting
  // **Validates: Requirements 3.1, 3.2, 3.3**
  it('Property 3: killed Attackers stop hitting', () => {
    fc.assert(
      fc.property(arbMeleeRun(), (spec) => {
        const result = play(spec);
        const tracks = track(result);
        for (const t of tracks.values()) {
          if (t.killed !== null) {
            for (const tick of t.bits) expect(tick).toBeLessThan(t.killed);
          }
        }
        // Melee Mobs leave the lane only through mobKilled.
        for (let i = 1; i < result.states.length; i++) {
          const now = new Set((result.states[i].lane?.enemies ?? []).map((e) => e.id));
          const killedNow = new Set(
            result.tickEvents[i - 1].flatMap((e) => (e.type === 'mobKilled' ? [e.id] : [])),
          );
          for (const enemy of result.states[i - 1].lane?.enemies ?? []) {
            if (!isMeleeKind(enemy.kind)) continue;
            expect(now.has(enemy.id) || killedNow.has(enemy.id)).toBe(true);
            if (killedNow.has(enemy.id)) expect(now.has(enemy.id)).toBe(false);
          }
        }
      }),
      { numRuns: NUM_RUNS },
    );
  }, RUN_TIMEOUT_MS);

  // Property: Req 4.1, 4.2, 4.3 a tank or boss bursts on its first hit only
  // Feature: lane-melee, Property 6: One burst per tank or boss arrival
  // **Validates: Requirements 4.1, 4.2, 4.3**
  it('Property 6: one burst per tank or boss arrival', () => {
    fc.assert(
      fc.property(arbMeleeRun(), (spec) => {
        const result = play(spec);
        const events: readonly GameEvent[] = result.events;
        const firstHitSeen = new Set<number>();
        let bursts = 0;
        let arrivalsWithHit = 0;
        for (let i = 0; i < events.length; i++) {
          const e = events[i];
          if (e.type === 'popupBurst' && (e.cause === 'tankBite' || e.cause === 'bossBite')) {
            bursts += 1;
          }
          if (e.type !== 'mobBit' || (e.kind !== 'tank' && e.kind !== 'boss')) continue;
          const first = !firstHitSeen.has(e.id);
          firstHitSeen.add(e.id);
          if (first) arrivalsWithHit += 1;
          // The modemHit of this hit, then (optionally) its own integrityCritical.
          expect(events[i + 1]?.type).toBe('modemHit');
          let j = i + 2;
          if (events[j]?.type === 'integrityCritical') j += 1;
          const next = events[j];
          const isBiteBurst =
            next?.type === 'popupBurst' && (next.cause === 'tankBite' || next.cause === 'bossBite');
          if (first) {
            // step() stamps events with a tick, so match the burst fields only.
            expect(next).toMatchObject({
              type: 'popupBurst',
              count: balanceOf(result)!.popupBurstCount,
              cause: e.kind === 'tank' ? 'tankBite' : 'bossBite',
            });
          } else {
            expect(isBiteBurst).toBe(false);
          }
        }
        // Every tank/boss with a first hit also arrived.
        const arrived = new Set(
          events.flatMap((e) =>
            e.type === 'mobArrived' && (e.kind === 'tank' || e.kind === 'boss') ? [e.id] : [],
          ),
        );
        for (const id of firstHitSeen) expect(arrived.has(id)).toBe(true);
        expect(bursts).toBe(arrivalsWithHit);
      }),
      { numRuns: NUM_RUNS },
    );
  }, RUN_TIMEOUT_MS);

  // Property: Req 2.3 same-tick hits are in ascending id order
  // Feature: lane-melee, Property 7: Same-Tick hits resolve in id order
  // **Validates: Requirements 2.3**
  it('Property 7: same-Tick hits resolve in id order', () => {
    fc.assert(
      fc.property(arbMeleeRun(), (spec) => {
        const result = play(spec);
        for (const events of result.tickEvents) {
          const ids = events.flatMap((e) => (e.type === 'mobBit' ? [e.id] : []));
          for (let k = 1; k < ids.length; k++) expect(ids[k]).toBeGreaterThan(ids[k - 1]);
        }
      }),
      { numRuns: NUM_RUNS },
    );
  }, RUN_TIMEOUT_MS);
});
