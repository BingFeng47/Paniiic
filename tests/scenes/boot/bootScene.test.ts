import fc from 'fast-check';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TICK_MS } from '../../../src/core/fixedLoop';
import type { SceneSignal } from '../../../src/core/scene';
import { createBootScene } from '../../../src/scenes/boot/bootScene';
import { BOOT_SCRIPT, bootFrameAt } from '../../../src/scenes/boot/bootScript';
import { createFakeAudioEngine } from '../../helpers/audio';
import { fakeMonitor, trackListeners, type ListenerTracker } from '../../helpers/dom';
import { createManualLoop } from '../../helpers/loop';

/** 8,000 ms of boot at 60 ticks per second. */
const DONE_TICKS = 480;
const ALL_CUES = BOOT_SCRIPT.cues.map((c) => c.sound);

let trackers: ListenerTracker[] = [];
const hosts: HTMLElement[] = [];

/** Trackers wrap each other on shared targets, so restore the newest first. */
function teardown(): void {
  for (const t of trackers.reverse()) t.restore();
  trackers = [];
  for (const host of hosts.splice(0)) host.remove();
}

afterEach(() => {
  teardown();
  vi.unstubAllGlobals();
});

/**
 * Mounts the boot scene into a monitor Screen attached to `document.body`, so events bubble to
 * `document` and `window`. Listener tracking on document, window and the Screen starts before
 * mount.
 */
function setup() {
  const loop = createManualLoop();
  const audio = createFakeAudioEngine();
  const monitor = fakeMonitor();
  const root = monitor.screen;
  document.body.appendChild(root);
  hosts.push(root);
  const docTracker = trackListeners(document);
  const winTracker = trackListeners(window);
  const rootTracker = trackListeners(root);
  trackers.push(docTracker, winTracker, rootTracker);

  const signals: SceneSignal[] = [];
  const scene = createBootScene({ monitor, audio, signal: (s) => signals.push(s), startLoop: loop.start });
  scene.mount(root);
  return { loop, audio, signals, scene, root, listeners: [docTracker, winTracker, rootTracker] };
}

const biosLines = (root: HTMLElement): (string | null)[] =>
  [...root.querySelectorAll('.bios-line')].map((l) => l.textContent);

describe('createBootScene', () => {
  it('plays the first cues, shows BIOS then splash, and signals bootDone once at 8,000 ms', () => {
    // Req 4.1, 4.2, 4.3, 4.4, 4.5, 4.6
    const { loop, audio, signals, root } = setup();
    const sceneEl = root.querySelector('.scene.scene-boot.crt-on');
    const bios = root.querySelector<HTMLElement>('.bios');
    const splash = root.querySelector<HTMLElement>('.splash');
    expect(sceneEl).not.toBeNull();

    loop.frame(0);
    expect(audio.played()).toEqual([]);

    loop.frame(1);
    expect(audio.played()).toEqual(['crtThunk']);
    loop.frame(17); // 18 ticks = 300 ms
    expect(audio.played()).toEqual(['crtThunk', 'postBeep']);

    loop.frame(131); // 149 ticks ≈ 2,483 ms: header + memory line
    const lines = biosLines(root);
    expect(lines).toHaveLength(3);
    expect(lines[2]).toBe('Memory Test: 65536K OK');
    expect(bios?.hidden).toBe(false);
    expect(splash?.hidden).toBe(true);

    loop.frame(200); // ≈ 5,817 ms: splash
    expect(bios?.hidden).toBe(true);
    expect(splash?.hidden).toBe(false);
    expect(root.querySelector('.splash-wordmark')?.textContent).toBe('Phantom 98');
    expect(signals).toEqual([]);

    loop.frame(130); // 479 ticks
    expect(signals).toEqual([]);
    expect(loop.isRunning()).toBe(true);
    loop.frame(1); // 480 ticks = 8,000 ms
    expect(signals).toEqual(['bootDone']);
    expect(loop.isRunning()).toBe(false);
    expect(audio.played()).toEqual(ALL_CUES);

    loop.frame(60);
    expect(signals).toEqual(['bootDone']);
  });

  it('zero-tick frames change nothing, at the start and mid-boot', () => {
    // Req 4.7: elapsed time only moves with ticks.
    const { loop, audio, signals, root } = setup();
    const atMount = root.innerHTML;
    for (let i = 0; i < 50; i += 1) loop.frame(0);
    expect(root.innerHTML).toBe(atMount);
    expect(audio.played()).toEqual([]);

    loop.frame(100); // ≈ 1,667 ms, memory test counting
    const midBoot = root.innerHTML;
    const playedMid = audio.played();
    for (let i = 0; i < 50; i += 1) loop.frame(0);
    expect(root.innerHTML).toBe(midBoot);
    expect(audio.played()).toEqual(playedMid);
    expect(signals).toEqual([]);

    // The timeline resumes where it stopped: 380 more ticks finish the boot, 379 do not.
    loop.frame(DONE_TICKS - 100 - 1);
    expect(signals).toEqual([]);
    loop.frame(1);
    expect(signals).toEqual(['bootDone']);
  });

  it('signals bootDone after 480 ticks however the ticks are grouped', () => {
    // Req 4.6, 4.7
    const groupings: readonly (readonly number[])[] = [
      [480],
      [1000],
      Array.from({ length: 32 }, () => 15),
      [15, ...Array.from({ length: 465 }, () => 1)],
      [479, 0, 0, 1],
      [0, 7, 0, 300, 0, 0, 173],
    ];
    for (const frames of groupings) {
      const { loop, signals, audio, scene } = setup();
      frames.forEach((n) => loop.frame(n));
      expect(signals, `frames ${frames.length}`).toEqual(['bootDone']);
      expect(audio.played()).toEqual(ALL_CUES);
      expect(loop.isRunning()).toBe(false);
      scene.unmount();
      teardown();
    }
  });

  it('fires bootDone exactly once, never before tick 480, for any frame partition', () => {
    // Property: Req 4.6, 4.7 bootDone fires once, on the first frame whose cumulative ticks reach
    // 480; cues and BIOS lines match the elapsed ticks whatever the frame grouping.
    // (Scene-level check for this task; the timeline itself is design Properties 4 and 5.)
    const frameSize = fc.oneof(
      { weight: 2, arbitrary: fc.constant(0) },
      { weight: 5, arbitrary: fc.integer({ min: 1, max: 15 }) },
      { weight: 1, arbitrary: fc.integer({ min: 16, max: 600 }) },
    );
    fc.assert(
      fc.property(fc.array(frameSize, { minLength: 1, maxLength: 80 }), (frames) => {
        const { loop, signals, audio, root, scene } = setup();
        let cumulative = 0;
        for (const n of frames) {
          loop.frame(n);
          cumulative += n;
          const doneTicks = Math.min(cumulative, cumulativeAtDone(frames, cumulative));
          const nowMs = doneTicks * TICK_MS;
          expect(signals).toEqual(cumulative >= DONE_TICKS ? ['bootDone'] : []);
          expect(loop.isRunning()).toBe(cumulative < DONE_TICKS);
          // No tick yet means no time has passed, so not even the 0 ms cue is due.
          const dueCues = doneTicks > 0 ? BOOT_SCRIPT.cues.filter((c) => c.atMs <= nowMs) : [];
          expect(audio.played()).toEqual(dueCues.map((c) => c.sound));
          expect(biosLines(root)).toEqual(bootFrameAt(nowMs).lines);
        }
        // Finish any boot the partition left short, then check the end state once more.
        if (cumulative < DONE_TICKS) loop.frame(DONE_TICKS - cumulative);
        expect(signals).toEqual(['bootDone']);
        expect(audio.played()).toEqual(ALL_CUES);
        scene.unmount();
        teardown();
      }),
      { numRuns: 100 },
    );
  });

  it('ignores clicks and key presses on the scene, the Screen, document and window', () => {
    // Req 1.9
    const { loop, audio, signals, root } = setup();
    loop.frame(30); // 500 ms, crtThunk and postBeep played
    const sceneEl = root.querySelector<HTMLElement>('.scene-boot');
    expect(sceneEl).not.toBeNull();
    const html = root.innerHTML;
    const played = audio.played();

    const targets: EventTarget[] = [sceneEl as HTMLElement, root, document.body, document, window];
    for (const target of targets) {
      for (const type of ['pointerdown', 'mousedown', 'mouseup', 'click', 'dblclick', 'contextmenu']) {
        target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true }));
      }
      for (const key of ['Enter', 'Escape', ' ', 'F8', 'Delete', 'Tab']) {
        target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
        target.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true, cancelable: true }));
      }
    }

    expect(root.innerHTML).toBe(html);
    expect(audio.played()).toEqual(played);
    expect(signals).toEqual([]);
    expect(loop.isRunning()).toBe(true);

    // Input did not move the timeline: the boot still ends exactly at tick 480.
    loop.frame(DONE_TICKS - 30 - 1);
    expect(signals).toEqual([]);
    loop.frame(1);
    expect(signals).toEqual(['bootDone']);
  });

  it('attaches no listeners to document, window or the Screen while mounted', () => {
    // Req 1.9, 14.2
    const { loop, listeners } = setup();
    loop.frame(100);
    for (const t of listeners) expect(t.attached()).toEqual([]);
  });

  it('unmount stops the loop and voices, removes the scene and leaves no listeners', () => {
    // Req 14.2
    const { loop, audio, signals, scene, root, listeners } = setup();
    loop.frame(1);
    expect(audio.activeVoices()).toHaveLength(1);

    scene.unmount();
    expect(loop.isRunning()).toBe(false);
    expect(loop.stopCount()).toBe(1);
    expect(audio.activeVoices()).toHaveLength(0);
    expect(root.children).toHaveLength(0);
    for (const t of listeners) expect(t.attached()).toEqual([]);

    loop.frame(DONE_TICKS);
    expect(signals).toEqual([]);
    expect(audio.played()).toEqual(['crtThunk']);
  });

  it('with the default fixed loop, unmount cancels the frame and removes its visibility listener', () => {
    // Req 4.7, 14.2: the real loop listens for visibilitychange on document while it runs.
    const requestFrame = vi.fn(() => 7);
    const cancelFrame = vi.fn();
    vi.stubGlobal('requestAnimationFrame', requestFrame);
    vi.stubGlobal('cancelAnimationFrame', cancelFrame);
    const docTracker = trackListeners(document);
    const winTracker = trackListeners(window);
    trackers.push(docTracker, winTracker);

    const monitor = fakeMonitor();
    const scene = createBootScene({ monitor, audio: createFakeAudioEngine(), signal: () => {} });
    scene.mount(monitor.screen);
    expect(requestFrame).toHaveBeenCalledTimes(1);
    expect(docTracker.attached().map((l) => l.type)).toEqual(['visibilitychange']);

    scene.unmount();
    expect(cancelFrame).toHaveBeenCalledWith(7);
    expect(docTracker.attached()).toEqual([]);
    expect(winTracker.attached()).toEqual([]);
  });
});

/**
 * Ticks the scene has counted after `cumulative` ticks were delivered: the scene ignores frames
 * after bootDone, so its clock stops at the end of the frame that reached 480.
 */
function cumulativeAtDone(frames: readonly number[], cumulative: number): number {
  let sum = 0;
  for (const n of frames) {
    sum += n;
    if (sum >= DONE_TICKS) return sum;
  }
  return cumulative;
}
