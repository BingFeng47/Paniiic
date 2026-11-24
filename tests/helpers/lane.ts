// Test helpers for the connection lane: lane states for example tests, a dense Spawn_Schedule,
// a fast-check arbitrary for whole lane runs and a runner that turns aimed actions into
// Hammer_Commands on the state the player would have seen (design: Testing Strategy).

import fc from 'fast-check';
import type { CoreBalance } from '../../src/game/balance/core';
import {
  attackPoint,
  resolveLaneBalance,
  type LaneBalanceOverrides,
  type SpawnWave,
} from '../../src/game/balance/lane';
import type { System } from '../../src/game/context';
import { hitBox } from '../../src/game/hammer';
import { createLaneSystems } from '../../src/game/lane';
import { MOB_KINDS, type Enemy, type HammerCommand, type MeleeKind } from '../../src/game/laneTypes';
import { enemyStats } from '../../src/game/mobs';
import { createRun } from '../../src/game/state';
import { step } from '../../src/game/step';
import type { GameEvent, GameState, InputCommand } from '../../src/game/types';

// ---------------------------------------------------------------------------------------------
// laneWith

/** One Enemy variant with only `kind` required; every other field gets a default. */
type Spec<E> = E extends Enemy ? Pick<E, 'kind'> & Partial<Omit<E, 'kind'>> : never;
export type EnemySpec = Spec<Enemy>;

/**
 * A fresh Run (seed 1, tick 0) with a Lane_State holding the given Enemies, for example tests.
 * Defaults: ids 1, 2, 3... in list order, `x = laneLength` (the Manhole), full HP, spawn tick 0,
 * never hit, a walking ranged Mob, a boss with no summons and a Glob from source 0. Enemies are
 * sorted by id and `nextId` is one above the highest id. `overrides` tune the lane balance.
 */
export function laneWith(
  enemies: readonly EnemySpec[],
  overrides: LaneBalanceOverrides = {},
): GameState {
  const balance = resolveLaneBalance(overrides);
  const filled = enemies.map((spec, i): Enemy => {
    const stats = balance.enemies[spec.kind];
    const base = {
      id: spec.id ?? i + 1,
      x: spec.x ?? balance.laneLength,
      hp: spec.hp ?? stats.hp,
      spawnTick: spec.spawnTick ?? 0,
      lastHitTick: spec.lastHitTick ?? null,
    };
    switch (spec.kind) {
      case 'default':
      case 'fast':
      case 'tank':
        return {
          ...base,
          kind: spec.kind,
          nextHitTick: spec.nextHitTick ?? null,
          lastMeleeTick: spec.lastMeleeTick ?? null,
        };
      case 'ranged':
        return {
          ...base,
          kind: 'ranged',
          nextSpitTick: spec.nextSpitTick ?? null,
          lastSpitTick: spec.lastSpitTick ?? null,
        };
      case 'boss':
        return {
          ...base,
          kind: 'boss',
          summonsDone: spec.summonsDone ?? 0,
          nextHitTick: spec.nextHitTick ?? null,
          lastMeleeTick: spec.lastMeleeTick ?? null,
        };
      case 'glob':
        return { ...base, kind: 'glob', sourceId: spec.sourceId ?? 0 };
    }
  });
  filled.sort((a, b) => a.id - b.id);
  const nextId = filled.reduce((max, e) => Math.max(max, e.id), 0) + 1;
  return {
    ...createRun({ seed: 1 }),
    lane: { balance, nextId, enemies: filled, hammerReadyTick: 0 },
  };
}

/** Fields of a melee Mob spec without `kind` or `x` (the Attacker always stands at its Attack_Point). */
export type AttackerSpec = Omit<Extract<EnemySpec, { kind: MeleeKind }>, 'kind' | 'x'>;

/**
 * A melee Enemy spec standing at its Attack_Point as an Attacker, for laneWith(). Defaults:
 * `nextHitTick` 1 (next Melee_Hit on the first step) and `lastMeleeTick` null; other fields as
 * in laneWith(). `overrides` must match the ones passed to laneWith() so `x` uses the same width.
 */
export function attackerAt(
  kind: MeleeKind,
  fields: AttackerSpec = {},
  overrides: LaneBalanceOverrides = {},
): EnemySpec {
  const balance = resolveLaneBalance(overrides);
  return {
    ...fields,
    kind,
    x: attackPoint(balance, kind),
    nextHitTick: fields.nextHitTick ?? 1,
    lastMeleeTick: fields.lastMeleeTick ?? null,
  } as EnemySpec;
}

// ---------------------------------------------------------------------------------------------
// Schedules and run specs

/**
 * A dense Spawn_Schedule override where every Mob kind appears within 20 s (1,200 ticks): defaults
 * from 0.5 s, fast from 2 s, ranged from 3 s (spitting from about 14 s), tank from 4 s and one boss
 * at 6 s. Some waves share ticks: fast and ranged at 660, fast and tank at 840, ranged and tank
 * at 1,140.
 */
export function fastSchedule(): readonly SpawnWave[] {
  return [
    { kind: 'default', startSecond: 0.5, endSecond: 20, everySeconds: 2 },
    { kind: 'fast', startSecond: 2, endSecond: 20, everySeconds: 3 },
    { kind: 'ranged', startSecond: 3, endSecond: 20, everySeconds: 4 },
    { kind: 'tank', startSecond: 4, endSecond: 20, everySeconds: 5 },
    { kind: 'boss', startSecond: 6, endSecond: 6, everySeconds: 1 },
  ];
}

/**
 * Shortened core tuning for lane runs: the dial-up ends after 2 s, so runs of at most 1,200 ticks
 * cover the `dialing`, `connected` and `downloading` phases.
 */
export const FAST_CORE: Partial<CoreBalance> = Object.freeze({ dialSeconds: 2 });

/** Where an action clicks: the Hit_Box centre of an Enemy, or a raw Lane_Unit point. */
export type LaneAim =
  | { readonly kind: 'enemy'; readonly index: number }
  | { readonly kind: 'point'; readonly x: number; readonly y: number };

/** A hammer click delivered on the step that produces `tick`. */
export interface LaneAction {
  readonly tick: number;
  readonly aim: LaneAim;
}

export interface LaneRunSpec {
  readonly seed: number;
  /** Spawn_Schedule override for the lane balance. */
  readonly spawns: readonly SpawnWave[];
  /** Number of steps to run (fewer if the Run ends first). */
  readonly ticks: number;
  readonly actions: readonly LaneAction[];
  /** Tick on which a `startDownload` command is sent before that tick's hammer commands. */
  readonly downloadTick?: number | null;
}

export const MAX_LANE_RUN_TICKS = 1200;

/** Lane systems for a spec: the default systems with the spec's Spawn_Schedule. */
export function laneRunSystems(spec: Pick<LaneRunSpec, 'spawns'>): readonly System[] {
  return createLaneSystems({ balance: { spawns: spec.spawns } });
}

// ---------------------------------------------------------------------------------------------
// Arbitraries

/** Half-second steps make waves that share ticks common. */
const halfSeconds = (min: number, max: number) =>
  fc.integer({ min: min * 2, max: max * 2 }).map((n) => n / 2);

/** A valid Spawn_Wave starting within 15 s, at most every 0.5 s and lasting up to 10 s. */
export function arbSpawnWave(): fc.Arbitrary<SpawnWave> {
  return fc
    .record({
      kind: fc.constantFrom(...MOB_KINDS),
      startSecond: halfSeconds(0, 15),
      length: halfSeconds(0, 10),
      everySeconds: halfSeconds(0.5, 4),
    })
    .map(({ kind, startSecond, length, everySeconds }) => ({
      kind,
      startSecond,
      endSecond: startSecond + length,
      everySeconds,
    }));
}

/** Either fastSchedule() or a short random valid schedule. */
export function arbSpawns(): fc.Arbitrary<readonly SpawnWave[]> {
  return fc.oneof(
    fc.constant(fastSchedule()),
    fc.array(arbSpawnWave(), { minLength: 1, maxLength: 4 }),
  );
}

/** A finite coordinate in [min, max] without -0, so events stay equal after a JSON round trip. */
const coordinate = (min: number, max: number) =>
  fc.double({ min, max, noNaN: true }).map((v) => v + 0);

/** A coordinate that is non-finite about one time in six. */
const rawCoordinate = (min: number, max: number) =>
  fc.oneof(
    { arbitrary: coordinate(min, max), weight: 5 },
    {
      arbitrary: fc.constantFrom(Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY),
      weight: 1,
    },
  );

/** Mostly aimed clicks (so hits and kills are common), some raw points around the lane. */
export function arbLaneAim(): fc.Arbitrary<LaneAim> {
  return fc.oneof(
    {
      arbitrary: fc.record({ kind: fc.constant('enemy' as const), index: fc.nat({ max: 40 }) }),
      weight: 4,
    },
    {
      arbitrary: fc.record({
        kind: fc.constant('point' as const),
        x: rawCoordinate(-60, 900),
        y: rawCoordinate(-20, 200),
      }),
      weight: 1,
    },
  );
}

/**
 * A lane run: `{ seed, spawns, ticks, actions, downloadTick }` with 1..maxTicks ticks and up to
 * 150 actions on ticks 1..ticks (several may share a tick).
 */
export function arbLaneRun(maxTicks = MAX_LANE_RUN_TICKS): fc.Arbitrary<LaneRunSpec> {
  return fc.integer({ min: 1, max: maxTicks }).chain((ticks) =>
    fc.record({
      seed: fc.nat(),
      spawns: arbSpawns(),
      ticks: fc.constant(ticks),
      actions: fc.array(
        fc.record({ tick: fc.integer({ min: 1, max: ticks }), aim: arbLaneAim() }),
        { maxLength: 150 },
      ),
      downloadTick: fc.option(fc.integer({ min: 1, max: ticks }), { nil: null }),
    }),
  );
}

// ---------------------------------------------------------------------------------------------
// runLane

/** An input command and the tick of the step it was sent to. */
export interface SentCommand {
  readonly tick: number;
  readonly command: InputCommand;
}

export interface LaneRunResult {
  /** `states[0]` is the new Run; `states[i]` is the state after the i-th step. */
  readonly states: readonly GameState[];
  /** `tickEvents[i]` are the events of the step from `states[i]` to `states[i + 1]`. */
  readonly tickEvents: readonly (readonly GameEvent[])[];
  /** Every event of the run, in order. */
  readonly events: readonly GameEvent[];
  /** Every command sent, in order, including `startDownload`. */
  readonly commands: readonly SentCommand[];
  readonly final: GameState;
}

/** The point at the centre of an Enemy's Hit_Box (padding does not move the centre). */
export function hitBoxCentre(state: GameState, enemy: Enemy): { x: number; y: number } {
  const lane = state.lane!;
  const box = hitBox(enemy, enemyStats(lane, enemy.kind), lane.balance.hitPadding);
  return { x: (box.left + box.right) / 2, y: (box.bottom + box.top) / 2 };
}

/**
 * The Hammer_Command for an aim on `state`: an enemy aim picks Enemy `index mod count` in id order
 * and clicks its Hit_Box centre; it sends nothing when the state has no Enemies. A point aim is
 * sent as is, non-finite coordinates included.
 */
export function commandFor(aim: LaneAim, state: GameState): HammerCommand | null {
  if (aim.kind === 'point') return { type: 'hammer', x: aim.x, y: aim.y };
  const enemies = state.lane?.enemies ?? [];
  if (enemies.length === 0) return null;
  const { x, y } = hitBoxCentre(state, enemies[aim.index % enemies.length]);
  return { type: 'hammer', x, y };
}

/**
 * Runs `spec` from `createRun({ seed, balance: FAST_CORE })` one step at a time with `systems`
 * (default: laneRunSystems(spec)). Actions for tick T are turned into commands on the state the
 * step producing T starts from, in action order. Stops after `spec.ticks` steps or when the Run
 * is won or lost.
 */
export function runLane(
  spec: LaneRunSpec,
  systems: readonly System[] = laneRunSystems(spec),
): LaneRunResult {
  const actionsByTick = new Map<number, LaneAction[]>();
  for (const action of spec.actions) {
    const list = actionsByTick.get(action.tick);
    if (list) list.push(action);
    else actionsByTick.set(action.tick, [action]);
  }

  let state = createRun({ seed: spec.seed, balance: FAST_CORE });
  const states: GameState[] = [state];
  const tickEvents: GameEvent[][] = [];
  const events: GameEvent[] = [];
  const commands: SentCommand[] = [];

  for (let i = 0; i < spec.ticks; i++) {
    if (state.phase === 'won' || state.phase === 'lost') break;
    const tick = state.tick + 1;
    const inputs: InputCommand[] = [];
    if (spec.downloadTick === tick) inputs.push({ type: 'startDownload' });
    for (const action of actionsByTick.get(tick) ?? []) {
      const command = commandFor(action.aim, state);
      if (command !== null) inputs.push(command);
    }
    for (const command of inputs) commands.push({ tick, command });

    const result = step(state, inputs, systems);
    state = result.state;
    states.push(state);
    tickEvents.push([...result.events]);
    events.push(...result.events);
  }

  return { states, tickEvents, events, commands, final: state };
}
