/**
 * Session: hosts one game-core Run in the browser (Req 10.1–10.8, 10.12).
 *
 * The fixed loop reports how many ticks each frame needs; the Session runs them with `step`,
 * handing queued input commands to the first tick of a non-empty frame (Req 10.2, 10.3). After
 * every frame each Session_View gets the latest state and all of that frame's events in order
 * (Req 10.4). Views only read state; the `send` function on their context is their one way to
 * change the Run (Req 10.12). Once the Run is won or lost the Session stops the loop, unmounts
 * the views and reports the final state through `onEnd` (Req 10.6, 10.7). Hidden-tab pausing
 * comes from `startFixedLoop` (Req 10.8).
 */
import type { AudioEngine } from '../core/audio';
import { startFixedLoop } from '../core/fixedLoop';
import type { WindowManager } from '../desktop/windowManager';
import type { CoreBalance } from '../game/balance/core';
import type { System } from '../game/context';
import { createRun } from '../game/state';
import { step } from '../game/step';
import type { GameEvent, GameState, InputCommand } from '../game/types';

/** Read-only display preferences, fixed for the length of one Session (title-and-endings Req 7.1). */
export interface ViewPrefs {
  readonly screenShake: boolean;
  /** Show hint balloons (player-guide Req 4.6). Missing means true. */
  readonly hintsEnabled?: boolean;
}

/** Used when the host gives no View_Prefs (design D10). */
export const DEFAULT_VIEW_PREFS: ViewPrefs = Object.freeze({ screenShake: true, hintsEnabled: true });

/** Everything a Session_View may use to affect the game (Req 10.12). */
export interface SessionContext {
  readonly laneHost: HTMLElement;
  /** Over the Desktop_Area and Lane_Dock, below the Result_Screen; the Ad_Layer mounts here (browser-front Req 12.1). */
  readonly overlayHost: HTMLElement;
  readonly windows: WindowManager;
  readonly audio: AudioEngine;
  /** Client → Screen pixels: the Monitor's `toScreenPoint` (Req 9.6). */
  readonly toScreenPoint: (clientX: number, clientY: number) => { x: number; y: number };
  /**
   * Always set by `createSession` (from the host, else DEFAULT_VIEW_PREFS); optional so fixtures
   * that build a context literally still compile. The Session itself never reads it, so the Run
   * cannot depend on it (title-and-endings Req 7.4).
   */
  readonly prefs?: ViewPrefs;
  /** Queues a command for the next tick the Session runs (Req 10.3). */
  send(command: InputCommand): void;
}

export interface SessionView {
  mount(ctx: SessionContext): void;
  update(state: GameState, events: readonly GameEvent[]): void;
  /**
   * Removes everything the view added. It must close every window this view opened through
   * `ctx.windows`, so a new Session (Retry, replay-flow Req 4) can open them again cleanly.
   */
  unmount(): void;
  /**
   * juice-and-endings End_Transition (Req 7.3): called once per frame tick `t` (1..N) after the
   * Run ended, while the view is still mounted and no `step` runs. Optional.
   */
  endFrame?(final: GameState, t: number): void;
}

export type SessionViewFactory = () => SessionView;

export interface SessionRegistry {
  readonly views: readonly SessionViewFactory[];
  readonly systems: readonly System[];
}

/** Starts a loop that calls `onTicks(n)` once per frame; returns a stop function. */
export type LoopStarter = (onTicks: (n: number) => void) => () => void;

export interface AdvanceResult {
  readonly state: GameState;
  readonly events: readonly GameEvent[];
}

function isOver(state: GameState): boolean {
  return state.phase === 'won' || state.phase === 'lost';
}

/**
 * Pure: run up to `n` steps, passing `inputs` on the first step only and `[]` after that. Stops
 * early once the phase is `won` or `lost`, so no tick runs past the end (Req 10.2, 10.6). The
 * result equals calling `step` tick by tick. With `n <= 0` nothing runs and `inputs` are unused.
 */
export function advanceTicks(
  state: GameState,
  n: number,
  inputs: readonly InputCommand[],
  systems: readonly System[],
): AdvanceResult {
  let current = state;
  const events: GameEvent[] = [];
  for (let i = 0; i < n && !isOver(current); i += 1) {
    const result = step(current, i === 0 ? inputs : [], systems);
    current = result.state;
    events.push(...result.events);
  }
  return { state: current, events };
}

export interface SessionOptions {
  readonly seed: number;
  readonly balance?: Partial<CoreBalance>;
  readonly systems: readonly System[];
  readonly views: readonly SessionView[];
  /** Defaults to `startFixedLoop`. Tests pass a manual loop. */
  readonly startLoop?: LoopStarter;
  /** Called once with the final state when the Run is won or lost. */
  readonly onEnd?: (final: GameState) => void;
  /**
   * When true, the Session keeps its views mounted and its loop running after the Run ends,
   * until `stop()`. No `step` runs and sends are ignored; each later frame's tick count goes to
   * `onHeldTicks`, so the owner can run the End_Transition through `endFrame` (Req 7.3).
   */
  readonly holdViewsOnEnd?: boolean;
  readonly onHeldTicks?: (n: number) => void;
}

export interface Session {
  start(host: Omit<SessionContext, 'send'>): void;
  /** Stops the loop and unmounts the views in reverse order. Idempotent. */
  stop(): void;
  /** Current Run state. Throws before `start`. */
  state(): GameState;
  isActive(): boolean;
  /**
   * Calls `endFrame(final, t)` on held views that have it. Rethrows the first error so the
   * owner can skip the rest of the End_Transition. No-op once the views are unmounted.
   */
  endFrame(final: GameState, t: number): void;
}

export function createSession(options: SessionOptions): Session {
  const { seed, balance, systems, views, onEnd } = options;
  const startLoop = options.startLoop ?? ((onTicks) => startFixedLoop(onTicks));

  let current: GameState | null = null;
  let started = false;
  let active = false;
  let stopLoop: (() => void) | null = null;
  let mounted: SessionView[] = [];
  let queue: InputCommand[] = [];

  const send = (command: InputCommand): void => {
    if (active) queue.push(command);
  };

  const updateViews = (state: GameState, events: readonly GameEvent[]): void => {
    // Snapshot: a view may stop the Session from inside `update`.
    for (const [index, view] of [...mounted].entries()) {
      try {
        view.update(state, events);
      } catch (error) {
        // One broken view must not freeze the others or the Run.
        console.error(`Session: view ${index} threw in update`, error);
      }
    }
  };

  let held = false;
  const stop = (): void => {
    if (!active && !held) return;
    active = false;
    held = false;
    const stopFn = stopLoop;
    stopLoop = null;
    stopFn?.();
    const toUnmount = mounted;
    mounted = [];
    queue = [];
    for (let i = toUnmount.length - 1; i >= 0; i -= 1) {
      try {
        toUnmount[i].unmount();
      } catch (error) {
        console.error(`Session: view ${i} threw in unmount`, error);
      }
    }
  };

  const onTicks = (n: number): void => {
    if (held) {
      options.onHeldTicks?.(n);
      return;
    }
    if (!active || current === null) return;
    let events: readonly GameEvent[] = [];
    if (n > 0) {
      const inputs = queue;
      queue = [];
      const result = advanceTicks(current, n, inputs, systems);
      current = result.state;
      events = result.events;
    }
    const state = current;
    updateViews(state, events);
    // Report only if this frame ended the Run and nothing (e.g. a view) stopped it already.
    if (isOver(state) && active) {
      if (options.holdViewsOnEnd) {
        active = false;
        held = true;
        queue = [];
      } else stop();
      onEnd?.(state);
    }
  };

  return {
    start(host) {
      if (started) return;
      // Throws BalanceError on invalid overrides before anything is mounted.
      const initial = createRun({ seed, balance });
      started = true;
      current = initial;
      active = true;
      const ctx: SessionContext = {
        laneHost: host.laneHost,
        overlayHost: host.overlayHost,
        windows: host.windows,
        audio: host.audio,
        toScreenPoint: host.toScreenPoint,
        prefs: host.prefs ?? DEFAULT_VIEW_PREFS,
        send,
      };
      for (const view of views) {
        try {
          view.mount(ctx);
        } catch (error) {
          // A view that cannot mount is a bug: clean up what is mounted and fail loudly.
          stop();
          throw error;
        }
        mounted.push(view);
      }
      // Show the initial state at once (the Dialer's "Initializing modem...").
      updateViews(initial, []);
      // A view may have stopped the Session during the initial update.
      if (!active) return;
      const stopFn = startLoop(onTicks);
      if (active) stopLoop = stopFn;
      else stopFn();
    },
    stop,
    state() {
      if (current === null) throw new Error('Session: state() called before start()');
      return current;
    },
    isActive: () => active,
    endFrame(final, t) {
      if (!held) return;
      for (const view of [...mounted]) view.endFrame?.(final, t);
    },
  };
}
