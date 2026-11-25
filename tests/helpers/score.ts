// Test helpers for the leaderboard score: a Final_State built from a real Run (so `economy` has
// every field) with the parts `scoreRun` reads set directly.
import { createRun } from '../../src/game/state';
import type { RunStats } from '../../src/game/stats';
import { step } from '../../src/game/step';
import { createGameSystems } from '../../src/game/systems';
import type { GameState, Phase } from '../../src/game/types';

export interface FinalSpec {
  readonly phase?: Phase;
  readonly download?: number;
  readonly integrity?: number;
  readonly tick?: number;
  readonly stats?: RunStats | null;
  /** null drops `economy`; a number sets `economy.bestCombo`. */
  readonly bestCombo?: number | null;
}

let template: GameState | undefined;

/** One step of a fresh Run with the shipped Game_Systems: it has `economy` and `stats`. */
function base(): GameState {
  template ??= step(createRun({ seed: 1 }), [], createGameSystems()).state;
  return template;
}

/** Defaults: lost, 0% download, integrity 100, tick 0, zero stats, bestCombo 0. */
export function finalState(spec: FinalSpec = {}): GameState {
  const b = base();
  const { economy: _economy, stats: _stats, ...rest } = b;
  const stats = spec.stats === null ? undefined : (spec.stats ?? { kills: 0, bossKilled: false, adsClosed: 0 });
  const economy = spec.bestCombo === null || b.economy === undefined
    ? undefined
    : { ...b.economy, bestCombo: spec.bestCombo ?? 0 };
  return {
    ...rest,
    phase: spec.phase ?? 'lost',
    download: spec.download ?? 0,
    integrity: spec.integrity ?? 100,
    tick: spec.tick ?? 0,
    ...(stats === undefined ? {} : { stats }),
    ...(economy === undefined ? {} : { economy }),
  };
}
