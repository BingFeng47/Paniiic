// Run creation for game-core (Req 3.1). The returned state is plain data (Req 6.2).

import { resolveCoreBalance, type CoreBalance } from './balance/core';
import type { GameState } from './types';

export interface NewRunOptions {
  readonly seed: number;
  readonly balance?: Partial<CoreBalance>;
}

/**
 * Create the initial state of a run: phase `dialing`, full integrity, no download progress.
 * The seed is normalized to an unsigned 32-bit integer and also becomes the starting RNG state.
 * Throws BalanceError if the balance overrides are invalid, so no run is created (Req 8.2).
 */
export function createRun(options: NewRunOptions): GameState {
  const balance = resolveCoreBalance(options.balance);
  const seed = options.seed >>> 0;
  return {
    seed,
    tick: 0,
    rng: seed,
    phase: 'dialing',
    phaseStartTick: 0,
    integrity: balance.maxIntegrity,
    download: 0,
    pauseSources: [],
    // True when the run already starts at/below critical (criticalIntegrity === maxIntegrity):
    // there is no crossing to report, so the first hit must not emit integrityCritical (Req 4.3).
    criticalLatched: balance.maxIntegrity <= balance.criticalIntegrity,
    halfwayReached: false,
    balance,
  };
}
