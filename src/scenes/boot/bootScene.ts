/**
 * Boot_Scene: CRT power-on, the BIOS screen and the "Phantom 98" splash (Req 4.1–4.7).
 *
 * Elapsed boot time is counted in fixed-loop ticks (`ticks × TICK_MS`), so a hidden tab holds
 * the timeline (Req 4.7). Each frame plays the cues passed since the previous frame and renders
 * `bootFrameAt(now)`, touching only the DOM that changed. At the `done` stage the loop stops and
 * `bootDone` is signalled once (Req 1.3, 4.6). No input listeners are attached, so keys and
 * clicks do nothing during the boot (Req 1.9). DOM follows the contract in src/styles/boot.css.
 */
import type { AudioEngine, Voice } from '../../core/audio';
import { startFixedLoop, TICK_MS } from '../../core/fixedLoop';
import { h } from '../../core/h';
import type { Monitor } from '../../core/monitor';
import type { Scene, SignalFn } from '../../core/scene';
import type { LoopStarter } from '../../dialup/session';
import { BOOT_SCRIPT, bootFrameAt, cuesBetween, type BootFrame } from './bootScript';
import { BOOT_SOUND_SEC, BOOT_SOUNDS } from './bootSounds';

// Re-exported so existing imports of `LoopStarter` from this module keep working.
export type { LoopStarter };

export interface BootDeps {
  readonly monitor: Pick<Monitor, 'setLed'>;
  readonly audio: Pick<AudioEngine, 'play'>;
  readonly signal: SignalFn;
  /** Defaults to `startFixedLoop`. Tests pass a manual loop. */
  readonly startLoop?: LoopStarter;
}

type Stage = BootFrame['stage'];

export function createBootScene({
  monitor,
  audio,
  signal,
  startLoop = startFixedLoop,
}: BootDeps): Scene {
  let el: HTMLElement | null = null;
  let stopLoop: (() => void) | null = null;
  const voices = new Set<Voice>();

  let ticks = 0;
  let prevMs = -1; // so the 0 ms cue fires on the first frame (Req 4.1)
  let signalled = false;

  // Rendered state, so each frame only writes what changed.
  let linesEl: HTMLElement | null = null;
  let biosEl: HTMLElement | null = null;
  let splashEl: HTMLElement | null = null;
  let progressEl: HTMLElement | null = null;
  const lineEls: HTMLElement[] = [];
  const lineTexts: string[] = [];
  let shownStage: Stage | null = null;
  let shownProgress = -1;

  const stopVoices = (): void => {
    for (const voice of voices) voice.stop();
    voices.clear();
  };

  const halt = (): void => {
    const stop = stopLoop;
    stopLoop = null;
    stop?.();
  };

  function render(frame: BootFrame): void {
    if (!linesEl || !biosEl || !splashEl || !progressEl) return;

    for (let i = 0; i < frame.lines.length; i += 1) {
      const text = frame.lines[i] ?? '';
      const existing = lineEls[i];
      if (!existing) {
        const line = h('div', { className: 'bios-line' }, text);
        lineEls.push(line);
        lineTexts.push(text);
        linesEl.appendChild(line);
      } else if (lineTexts[i] !== text) {
        existing.textContent = text; // only the memory line changes in place
        lineTexts[i] = text;
      }
    }
    while (lineEls.length > frame.lines.length) {
      lineEls.pop()?.remove();
      lineTexts.pop();
    }

    if (frame.stage !== shownStage) {
      shownStage = frame.stage;
      biosEl.hidden = frame.stage !== 'bios';
      splashEl.hidden = frame.stage === 'bios';
    }

    if (frame.splashProgress !== shownProgress) {
      shownProgress = frame.splashProgress;
      progressEl.style.setProperty('--progress', String(frame.splashProgress));
    }
  }

  function onTicks(n: number): void {
    // Zero-tick frames (and frames after unmount or the end) change nothing (Req 4.7).
    if (!el || signalled || !(n > 0)) return;
    ticks += n;
    const nowMs = ticks * TICK_MS;

    for (const cue of cuesBetween(prevMs, nowMs)) {
      voices.add(audio.play(BOOT_SOUNDS[cue.sound], BOOT_SOUND_SEC[cue.sound]));
    }
    prevMs = nowMs;

    const frame = bootFrameAt(nowMs);
    render(frame);

    if (frame.stage === 'done') {
      signalled = true;
      halt();
      // The director may unmount this scene synchronously, so nothing runs after this call.
      signal('bootDone');
    }
  }

  return {
    mount(root) {
      if (el) return;
      ticks = 0;
      prevMs = -1;
      signalled = false;
      lineEls.length = 0;
      lineTexts.length = 0;
      shownStage = null;
      shownProgress = -1;

      linesEl = h('div', { className: 'bios-lines' });
      biosEl = h(
        'div',
        { className: 'bios' },
        linesEl,
        h('div', { className: 'bios-footer' }, BOOT_SCRIPT.footer),
      );
      progressEl = h(
        'div',
        { className: 'splash-progress', attrs: { 'aria-hidden': 'true' } },
        h('div', { className: 'splash-progress-fill' }),
      );
      splashEl = h(
        'div',
        { className: 'splash' },
        h('div', { className: 'splash-logo', attrs: { 'aria-hidden': 'true' } }),
        h('div', { className: 'splash-wordmark' }, BOOT_SCRIPT.splash.wordmark),
        h('div', { className: 'splash-copyright' }, BOOT_SCRIPT.splash.copyright),
        progressEl,
      );
      el = h('div', { className: 'scene scene-boot crt-on' }, biosEl, splashEl);

      render(bootFrameAt(0));
      root.appendChild(el);
      monitor.setLed('on');
      stopLoop = startLoop(onTicks);
    },
    unmount() {
      if (!el) return;
      halt();
      stopVoices();
      el.remove();
      el = null;
      linesEl = biosEl = splashEl = progressEl = null;
      lineEls.length = 0;
      lineTexts.length = 0;
    },
  };
}
