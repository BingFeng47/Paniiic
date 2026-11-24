/**
 * Shutdown_Scene: "Please wait...", then "It is now safe to switch off your computer.", then the
 * CRT collapse (Req 13.1–13.3).
 *
 * Elapsed time is counted in fixed-loop ticks (`ticks × TICK_MS`), like the Boot_Scene, so a
 * hidden tab holds the timeline. Each frame renders `shutdownFrameAt(now)`, touching only the DOM
 * that changed. At the `done` frame the loop stops and `shutdownDone` is signalled once (Req 1.5).
 * DOM follows the contract in src/styles/boot.css.
 */
import { startFixedLoop, TICK_MS } from '../../core/fixedLoop';
import { h } from '../../core/h';
import type { Scene, SignalFn } from '../../core/scene';
import type { LoopStarter } from '../../dialup/session';
import { SHUTDOWN_COPY, shutdownFrameAt, type ShutdownFrame } from './shutdownScript';

export interface ShutdownDeps {
  readonly signal: SignalFn;
  /** Defaults to `startFixedLoop`. Tests pass a manual loop. */
  readonly startLoop?: LoopStarter;
}

export function createShutdownScene({ signal, startLoop = startFixedLoop }: ShutdownDeps): Scene {
  let el: HTMLElement | null = null;
  let messageEl: HTMLElement | null = null;
  let stopLoop: (() => void) | null = null;

  let ticks = 0;
  let signalled = false;
  let shownFrame: ShutdownFrame | null = null;

  const halt = (): void => {
    const stop = stopLoop;
    stopLoop = null;
    stop?.();
  };

  function render(frame: ShutdownFrame): void {
    if (!el || !messageEl || frame === shownFrame) return;
    shownFrame = frame;
    const safe = frame !== 'wait'; // the safe message stays up through the collapse
    const text = safe ? SHUTDOWN_COPY.safe : SHUTDOWN_COPY.wait;
    if (messageEl.textContent !== text) messageEl.textContent = text;
    messageEl.classList.toggle('is-safe', safe);
    el.classList.toggle('crt-collapse', frame === 'collapse' || frame === 'done');
  }

  function onTicks(n: number): void {
    // Zero-tick frames (and frames after unmount or the end) change nothing.
    if (!el || signalled || !(n > 0)) return;
    ticks += n;
    const frame = shutdownFrameAt(ticks * TICK_MS);
    render(frame);

    if (frame === 'done') {
      signalled = true;
      halt();
      // The director may unmount this scene synchronously, so nothing runs after this call.
      signal('shutdownDone');
    }
  }

  return {
    mount(root) {
      if (el) return;
      ticks = 0;
      signalled = false;
      shownFrame = null;

      messageEl = h('div', { className: 'shutdown-message' });
      el = h('div', { className: 'scene scene-shutdown' }, messageEl);

      render(shutdownFrameAt(0));
      root.appendChild(el);
      stopLoop = startLoop(onTicks);
    },
    unmount() {
      if (!el) return;
      halt();
      el.remove();
      el = messageEl = null;
    },
  };
}
