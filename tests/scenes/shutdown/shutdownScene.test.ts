import fc from 'fast-check';
import { afterEach, describe, expect, it } from 'vitest';
import { TICK_MS } from '../../../src/core/fixedLoop';
import type { SceneSignal } from '../../../src/core/scene';
import { createShutdownScene } from '../../../src/scenes/shutdown/shutdownScene';
import {
  SHUTDOWN_COPY,
  shutdownFrameAt,
  type ShutdownFrame,
} from '../../../src/scenes/shutdown/shutdownScript';
import { fakeMonitor, trackListeners, type ListenerTracker } from '../../helpers/dom';
import { createManualLoop } from '../../helpers/loop';

/** 4,000 ms of shutdown at 60 ticks per second. */
const DONE_TICKS = 240;
const FRAME_ORDER: readonly ShutdownFrame[] = ['wait', 'safe', 'collapse', 'done'];

let trackers: ListenerTracker[] = [];
const hosts: HTMLElement[] = [];

/** Trackers wrap each other on shared targets, so restore the newest first. */
function teardown(): void {
  for (const t of trackers.reverse()) t.restore();
  trackers = [];
  for (const host of hosts.splice(0)) host.remove();
}

afterEach(teardown);

/**
 * Mounts the shutdown scene into a monitor Screen attached to `document.body`, so events bubble
 * to `document` and `window`. Listener tracking on document, window and the Screen starts before
 * mount.
 */
function setup() {
  const loop = createManualLoop();
  const root = fakeMonitor().screen;
  document.body.appendChild(root);
  hosts.push(root);
  const listeners = [trackListeners(document), trackListeners(window), trackListeners(root)];
  trackers.push(...listeners);

  const signals: SceneSignal[] = [];
  const scene = createShutdownScene({ signal: (s) => signals.push(s), startLoop: loop.start });
  scene.mount(root);
  return { loop, signals, scene, root, listeners };
}

/** What the DOM shows right now: message text, `.is-safe`, `.crt-collapse`. */
function view(root: HTMLElement) {
  const message = root.querySelector('.shutdown-message');
  return {
    text: message?.textContent ?? null,
    safe: message?.classList.contains('is-safe') ?? null,
    collapse: root.querySelector('.scene.scene-shutdown')?.classList.contains('crt-collapse') ?? null,
  };
}

/** What the DOM should show for a frame. The safe message stays up through the collapse. */
function expectedView(frame: ShutdownFrame) {
  const safe = frame !== 'wait';
  return {
    text: safe ? SHUTDOWN_COPY.safe : SHUTDOWN_COPY.wait,
    safe,
    collapse: frame === 'collapse' || frame === 'done',
  };
}

describe('shutdownFrameAt', () => {
  it('switches frames at 1,500, 3,500 and 4,000 ms', () => {
    // Req 13.1, 13.2, 13.3
    const at = [0, 1499, 1500, 3499, 3500, 3999, 4000].map(shutdownFrameAt);
    expect(at).toEqual(['wait', 'wait', 'safe', 'safe', 'collapse', 'collapse', 'done']);
  });

  it('treats NaN as 0', () => {
    // Req 13.1
    expect(shutdownFrameAt(Number.NaN)).toBe('wait');
    expect(shutdownFrameAt(Number.NaN)).toBe(shutdownFrameAt(0));
  });

  it('only moves forward as elapsed time grows', () => {
    // Req 13.1, 13.2, 13.3: for any t1 ≤ t2, the frame at t2 is no earlier than the frame at t1.
    // (Scene-level check for this task; not a numbered design property.)
    const ms = fc.oneof(
      fc.integer({ min: -1000, max: 5000 }),
      fc.double({ min: -1e6, max: 1e6, noNaN: true }),
      fc.constantFrom(-Infinity, Infinity, 1499.999, 1500, 3499.999, 3500, 3999.999, 4000),
    );
    fc.assert(
      fc.property(ms, ms, (a, b) => {
        const [t1, t2] = a <= b ? [a, b] : [b, a];
        const i1 = FRAME_ORDER.indexOf(shutdownFrameAt(t1));
        const i2 = FRAME_ORDER.indexOf(shutdownFrameAt(t2));
        expect(i1).toBeGreaterThanOrEqual(0);
        expect(i1).toBeLessThanOrEqual(i2);
      }),
      { numRuns: 300 },
    );
  });
});

describe('createShutdownScene', () => {
  it('shows both messages, collapses, and signals shutdownDone once after 240 ticks', () => {
    // Req 1.5, 13.1, 13.2, 13.3, 14.2
    const { loop, signals, scene, root } = setup();
    expect(root.querySelector('.scene.scene-shutdown')).not.toBeNull();
    expect(view(root)).toEqual(expectedView('wait'));

    loop.frame(0); // zero-tick frame changes nothing
    loop.frame(89); // 1,483 ms
    expect(view(root)).toEqual(expectedView('wait'));
    loop.frame(1); // 90 ticks = 1,500 ms
    expect(view(root)).toEqual(expectedView('safe'));

    loop.frame(119); // 209 ticks ≈ 3,483 ms
    expect(view(root)).toEqual(expectedView('safe'));
    loop.frame(1); // 210 ticks = 3,500 ms
    expect(view(root)).toEqual(expectedView('collapse'));

    loop.frame(29); // 239 ticks
    expect(signals).toEqual([]);
    expect(loop.isRunning()).toBe(true);
    loop.frame(1); // 240 ticks = 4,000 ms
    expect(signals).toEqual(['shutdownDone']);
    expect(loop.isRunning()).toBe(false);
    expect(view(root)).toEqual(expectedView('done'));

    loop.frame(60);
    expect(signals).toEqual(['shutdownDone']);

    scene.unmount();
    expect(root.childElementCount).toBe(0);
  });

  it('zero-tick frames change nothing, at the start and mid-shutdown', () => {
    // Req 13.1, 13.2: elapsed time only moves with ticks.
    const { loop, signals, root } = setup();
    const atMount = root.innerHTML;
    for (let i = 0; i < 50; i += 1) loop.frame(0);
    expect(root.innerHTML).toBe(atMount);

    loop.frame(100); // ≈ 1,667 ms, safe message
    const mid = root.innerHTML;
    for (let i = 0; i < 50; i += 1) loop.frame(0);
    expect(root.innerHTML).toBe(mid);
    expect(signals).toEqual([]);

    // The timeline resumes where it stopped: 140 more ticks finish the shutdown, 139 do not.
    loop.frame(DONE_TICKS - 100 - 1);
    expect(signals).toEqual([]);
    loop.frame(1);
    expect(signals).toEqual(['shutdownDone']);
  });

  it('signals shutdownDone after 240 ticks however the ticks are grouped', () => {
    // Req 13.3
    const groupings: readonly (readonly number[])[] = [
      [240],
      [1000],
      Array.from({ length: 16 }, () => 15),
      [15, ...Array.from({ length: 225 }, () => 1)],
      [239, 0, 0, 1],
      [0, 89, 0, 1, 0, 0, 120, 30],
    ];
    for (const frames of groupings) {
      const { loop, signals, root, scene } = setup();
      frames.forEach((n) => loop.frame(n));
      expect(signals, `frames ${frames.join(',')}`).toEqual(['shutdownDone']);
      expect(view(root)).toEqual(expectedView('done'));
      expect(loop.isRunning()).toBe(false);
      scene.unmount();
      teardown();
    }
  });

  it('fires shutdownDone exactly once, never before tick 240, for any frame partition', () => {
    // Req 13.1, 13.2, 13.3: shutdownDone fires once, on the first frame whose cumulative ticks
    // reach 240; message and classes match shutdownFrameAt after every frame.
    // (Scene-level check for this task; not a numbered design property.)
    const frameSize = fc.oneof(
      { weight: 2, arbitrary: fc.constant(0) },
      { weight: 5, arbitrary: fc.integer({ min: 1, max: 15 }) },
      { weight: 1, arbitrary: fc.integer({ min: 16, max: 300 }) },
    );
    fc.assert(
      fc.property(fc.array(frameSize, { minLength: 1, maxLength: 60 }), (frames) => {
        const { loop, signals, root, scene } = setup();
        let cumulative = 0;
        for (const n of frames) {
          loop.frame(n);
          cumulative += n;
          expect(signals).toEqual(cumulative >= DONE_TICKS ? ['shutdownDone'] : []);
          expect(loop.isRunning()).toBe(cumulative < DONE_TICKS);
          expect(view(root)).toEqual(expectedView(shutdownFrameAt(cumulative * TICK_MS)));
        }
        // Finish any shutdown the partition left short, then check the end state once more.
        if (cumulative < DONE_TICKS) loop.frame(DONE_TICKS - cumulative);
        expect(signals).toEqual(['shutdownDone']);
        expect(view(root)).toEqual(expectedView('done'));
        scene.unmount();
        teardown();
      }),
      { numRuns: 100 },
    );
  });

  it('ignores clicks and key presses and attaches no listeners to document, window or the Screen', () => {
    // Req 13.1, 13.2, 13.3, 14.2: the shutdown runs on ticks alone.
    const { loop, signals, root, listeners } = setup();
    loop.frame(30); // 500 ms
    for (const t of listeners) expect(t.attached()).toEqual([]);

    const html = root.innerHTML;
    const sceneEl = root.querySelector<HTMLElement>('.scene-shutdown');
    const targets: EventTarget[] = [sceneEl as HTMLElement, root, document.body, document, window];
    for (const target of targets) {
      for (const type of ['pointerdown', 'mousedown', 'mouseup', 'click', 'dblclick', 'contextmenu']) {
        target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true }));
      }
      for (const key of ['Enter', 'Escape', ' ', 'Delete']) {
        target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
      }
    }
    expect(root.innerHTML).toBe(html);
    expect(signals).toEqual([]);

    loop.frame(DONE_TICKS - 30 - 1);
    expect(signals).toEqual([]);
    loop.frame(1);
    expect(signals).toEqual(['shutdownDone']);
    for (const t of listeners) expect(t.attached()).toEqual([]);
  });

  it('unmount stops the loop, removes the scene and leaves no listeners', () => {
    // Req 14.2
    const { loop, signals, scene, root, listeners } = setup();
    loop.frame(100);
    scene.unmount();
    expect(loop.isRunning()).toBe(false);
    expect(loop.stopCount()).toBe(1);
    expect(root.childElementCount).toBe(0);
    for (const t of listeners) expect(t.attached()).toEqual([]);

    loop.frame(DONE_TICKS);
    expect(signals).toEqual([]);
  });

  it('frames delivered after unmount do nothing, even from a loop that ignores stop', () => {
    // Req 14.2: the scene guards itself, not only the loop.
    let onTicks: ((n: number) => void) | null = null;
    const signals: SceneSignal[] = [];
    const root = document.createElement('div');
    const scene = createShutdownScene({
      signal: (s) => signals.push(s),
      startLoop: (fn) => {
        onTicks = fn;
        return () => undefined; // a leaky loop that keeps calling after stop
      },
    });
    scene.mount(root);
    const deliver = (n: number): void => (onTicks as ((n: number) => void) | null)?.(n);
    deliver(10);
    scene.unmount();

    deliver(DONE_TICKS);
    deliver(1000);
    expect(signals).toEqual([]);
    expect(root.childElementCount).toBe(0);
  });
});
