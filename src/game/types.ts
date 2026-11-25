// Plain-data types for the pure game-core simulation. Everything here must survive a JSON round
// trip unchanged: no Map, Set, class instances, undefined fields or NaN (Req 6.2).

import type { CoreBalance } from './balance/core';
// Type-only so laneTypes.ts (which imports from balance/lane.ts) adds no runtime edges here.
import type { HammerCommand, LaneEventBody, LaneState } from './laneTypes';
import type { AdClickCommand, AdEventBody, AdHoverCommand, AdState } from './ads/adTypes';
import type { DirectorEventBody, DirectorState } from './director/directorTypes';
import type { EconomyCommand, EconomyEventBody, EconomyState } from './economy/economyTypes';
import type { RunStats } from './stats';

/** Simulation ticks per second. One tick is 1/60 s. */
export const TICK_RATE = 60;

export type Phase = 'dialing' | 'connected' | 'downloading' | 'won' | 'lost';

/** A plain-data instruction from the player, delivered to `step()` for one tick. */
export type InputCommand = { readonly type: 'startDownload' } | HammerCommand
  | AdClickCommand
  | AdHoverCommand
  | EconomyCommand;

/** An event as emitted by the simulation, before it is tagged with its tick. */
export type GameEventBody =
  | { readonly type: 'connected' }
  | { readonly type: 'downloadStarted' }
  | { readonly type: 'downloadPenalty'; readonly amount: number; readonly download: number }
  | { readonly type: 'downloadHalfway' }
  | { readonly type: 'modemHit'; readonly amount: number; readonly integrity: number }
  | { readonly type: 'integrityCritical'; readonly integrity: number }
  | { readonly type: 'won' }
  | { readonly type: 'lost' }
  | LaneEventBody
  | AdEventBody
  | DirectorEventBody
  | EconomyEventBody;

/** An event tagged with the tick it happened on (Req 6.1). */
export type GameEvent = GameEventBody & { readonly tick: number };

export interface GameState {
  readonly seed: number;
  readonly tick: number;
  /** Mulberry32 state: one unsigned 32-bit integer (Req 1.3). */
  readonly rng: number;
  readonly phase: Phase;
  readonly phaseStartTick: number;
  readonly integrity: number;
  /** Download progress, 0..100. */
  readonly download: number;
  /** Active pause source ids, sorted and unique. */
  readonly pauseSources: readonly string[];
  /** True while integrity is at or below the critical threshold. */
  readonly criticalLatched: boolean;
  readonly halfwayReached: boolean;
  /** The run's own tuning, so headless runs with overrides and replays are self-contained. */
  readonly balance: CoreBalance;
  /**
   * Connection-lane state. Absent until the lane's `ensureLane` system first runs, so core-only
   * runs never carry the key (an `undefined` value would not survive a JSON round trip).
   */
  readonly lane?: LaneState;
  /** Browser-front ad state. Absent until the `ensureAds` system first runs. */
  readonly ads?: AdState;
  /** Chapter director state. Absent until `directorLane` first runs. */
  readonly director?: DirectorState;
  /** KB, shop and weapon state. Absent until the economy systems first run. */
  readonly economy?: EconomyState;
  /**
   * Bandwidth_Factor in [bandwidthFloor, 1]: the share of full download speed left after open
   * clutter ads. Absent means 1. Set by the bandwidth system; `createRun` never sets it, so
   * core-only runs keep their shape and survive a JSON round trip.
   */
  readonly bandwidth?: number;
  /** Kills, boss kill and ads closed for the score. Absent until `statsSystem` first runs. */
  readonly stats?: RunStats;
}

/**
 * The draft state that `step()` and systems change inside one tick. Top-level fields are
 * writable; `balance` stays read-only because tuning never changes during a run. The mapped
 * type keeps `lane` optional, so lane systems can assign `draft.lane = ...`.
 */
export type MutableGameState = {
  -readonly [K in keyof GameState]: K extends 'pauseSources' ? string[] : GameState[K];
};
