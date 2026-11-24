// The placeholder Spawner: adds the Mobs of the Lane_Balance's Spawn_Schedule at the Manhole.
// Stateless: which Mobs spawn on a tick follows from the tick and the schedule alone, so player
// input and the Run's phase never change it (Req 3.6). Milestone 5's director replaces this
// system as a unit and reuses addMob() (Req 3.4).
import { secondsToTicks, type SpawnWave } from './balance/lane';
import type { System } from './context';
import { laneDraft } from './laneState';
import type { MobKind } from './laneTypes';
import { addMob } from './mobs';

/**
 * Kinds scheduled on `tick`, in Spawn_Schedule order (Req 3.2, 3.7). A wave spawns when
 * `s ≤ tick ≤ e` and `(tick − s) mod n = 0`, with `s`, `e` and `n` its start, end and interval in
 * ticks. Ticks count from the start of the Run (dial start). Tick 0 is never stepped, so a wave
 * starting at second 0 first spawns on tick `n`. Depends on `tick` and `spawns` only (Req 3.6).
 */
export function scheduledSpawnsAt(tick: number, spawns: readonly SpawnWave[]): readonly MobKind[] {
  const kinds: MobKind[] = [];
  for (const wave of spawns) {
    const start = secondsToTicks(wave.startSecond);
    const end = secondsToTicks(wave.endSecond);
    const every = secondsToTicks(wave.everySeconds);
    if (tick >= start && tick <= end && (tick - start) % every === 0) kinds.push(wave.kind);
  }
  return kinds;
}

/**
 * Adds each kind scheduled on this tick at `x = laneLength` with source `schedule`, in
 * Spawn_Schedule order (Req 3.2, 3.7). Uses the Run's own Lane_Balance, so a Run keeps the
 * schedule it started with.
 */
export const scheduleSpawner: System = (draft, ctx) => {
  const lane = laneDraft(draft);
  const { laneLength, spawns } = lane.balance;
  for (const kind of scheduledSpawnsAt(ctx.tick, spawns)) {
    addMob(lane, ctx, kind, laneLength, 'schedule');
  }
};
