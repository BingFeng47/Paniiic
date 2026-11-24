// The bot run loop for the zombie-sim MCP server (design "Run loop (runBot.ts)").
// Plays one Run over the real `createRun` and `step` with the same systems the Session_Registry
// uses, built from this Run's overrides: state → policy.decide → commands → step (Req 2.1, 3.1).
// Pure apart from building the systems: no DOM, timers, wall clock or Math.random.
import type { CoreBalance } from '../../../src/game/balance/core';
import type { System } from '../../../src/game/context';
import { DEFAULT_MAX_SECONDS } from '../../../src/game/headless';
import { createRun } from '../../../src/game/state';
import { step } from '../../../src/game/step';
import { createGameSystems, type GameSystemOverrides } from '../../../src/game/systems';
import { TICK_RATE, type GameState } from '../../../src/game/types';
import { createBotMemory, createBotRng, getPolicy, type PolicyName } from './policies';

/** Per-Run balance overrides, one entry per balance table. `core` goes to `createRun`. */
export interface BalanceOverrides extends GameSystemOverrides {
  readonly core?: Partial<CoreBalance>;
}

export interface BotRunInput {
  readonly seed: number;
  readonly policy: PolicyName;
  readonly overrides?: BalanceOverrides;
  /** Default 300. */
  readonly maxSeconds?: number;
}

export interface SecondSample {
  readonly s: number;
  readonly integrity: number;
  readonly download: number;
  readonly wallet: number;
  /** Wallet plus KB spent. */
  readonly earned: number;
}

export interface RunSummary {
  readonly seed: number;
  readonly policy: PolicyName;
  readonly outcome: 'won' | 'lost' | 'timeout';
  readonly endSeconds: number;
  readonly perSecond: readonly SecondSample[];
  readonly chapterStarts: Readonly<Record<string, number>>;
  readonly purchases: readonly { item: string; s: number }[];
  readonly adMistakes: number;
  readonly fakeClicks: number;
  readonly criticalInPlotTurn2: boolean;
  /** True once a boss `mobArrived` event fired (the boss reached the modem). */
  readonly bossArrived: boolean;
  /** KB earned (wallet plus KB spent) on the last Tick of the Run. */
  readonly earnedAtEnd: number;
}

/** A Run error that carries the seed (Req 1.4). */
export class BotRunError extends Error {
  readonly seed: number;
  constructor(seed: number, message: string, options?: { cause?: unknown }) {
    super(`seed ${seed}: ${message}`, options);
    this.name = 'BotRunError';
    this.seed = seed;
  }
}

/**
 * The Session_Registry's game systems from the shared `createGameSystems` list, built fresh from
 * this Run's overrides so they never leak into another Run (Req 3.2; ad-pressure Req 1.2).
 */
export function buildSystems(overrides: BalanceOverrides = {}): readonly System[] {
  return createGameSystems(overrides);
}

function secondSample(state: GameState): SecondSample {
  const wallet = state.economy?.wallet ?? 0;
  return {
    s: state.tick / TICK_RATE,
    integrity: state.integrity,
    download: state.download,
    wallet,
    earned: wallet + (state.economy?.spent ?? 0),
  };
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Play one bot Run until it is won or lost, or until `maxSeconds` have passed (Req 3.1). */
export function runBot(input: BotRunInput): RunSummary {
  const { seed } = input;
  const maxSeconds = input.maxSeconds ?? DEFAULT_MAX_SECONDS;
  if (!Number.isFinite(maxSeconds) || maxSeconds <= 0) {
    throw new BotRunError(seed, `maxSeconds must be finite and > 0, got ${maxSeconds}`);
  }
  const maxTicks = Math.max(1, Math.round(maxSeconds * TICK_RATE));

  let state: GameState;
  let systems: readonly System[];
  try {
    // Invalid overrides throw the game's own balance errors; the message comes back unchanged.
    state = createRun({ seed, balance: input.overrides?.core });
    systems = buildSystems(input.overrides);
  } catch (error) {
    throw new BotRunError(seed, message(error), { cause: error });
  }

  const policy = getPolicy(input.policy);
  const memory = createBotMemory();
  const rng = createBotRng(seed);

  const perSecond: SecondSample[] = [secondSample(state)];
  const chapterStarts: Record<string, number> = {};
  const purchases: { item: string; s: number }[] = [];
  let adMistakes = 0;
  let fakeClicks = 0;
  let criticalInPlotTurn2 = false;
  let bossArrived = false;

  while (state.phase !== 'won' && state.phase !== 'lost' && state.tick < maxTicks) {
    let result: ReturnType<typeof step>;
    try {
      result = step(state, policy.decide(state, memory, rng), systems);
    } catch (error) {
      throw new BotRunError(seed, `tick ${state.tick + 1}: ${message(error)}`, { cause: error });
    }
    state = result.state;
    const s = state.tick / TICK_RATE;
    for (const event of result.events) {
      switch (event.type) {
        case 'chapterStarted':
          if (!(event.id in chapterStarts)) chapterStarts[event.id] = s;
          break;
        case 'itemBought':
          purchases.push({ item: event.item, s });
          break;
        case 'adMistake':
          adMistakes += 1;
          break;
        case 'fakeButtonClicked':
          fakeClicks += 1;
          break;
        case 'mobArrived':
          if (event.kind === 'boss') bossArrived = true;
          break;
        default:
          break;
      }
    }
    // The director's chapter stays `plotTurn2` on a losing tick, so a hit that jumps straight
    // to 0 still counts as critical in Plot turn 2.
    if (!criticalInPlotTurn2 && state.criticalLatched && state.director?.chapter === 'plotTurn2') {
      criticalInPlotTurn2 = true;
    }
    if (state.tick % TICK_RATE === 0) perSecond.push(secondSample(state));
  }
  if (state.tick % TICK_RATE !== 0) perSecond.push(secondSample(state));

  return {
    seed,
    policy: input.policy,
    outcome: state.phase === 'won' || state.phase === 'lost' ? state.phase : 'timeout',
    endSeconds: state.tick / TICK_RATE,
    perSecond,
    chapterStarts,
    purchases,
    adMistakes,
    fakeClicks,
    criticalInPlotTurn2,
    bossArrived,
    earnedAtEnd: secondSample(state).earned,
  };
}
