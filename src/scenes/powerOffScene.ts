/**
 * Power_Off_Scene: the dark glass shown before power-on and after shutdown (Req 3.1). The
 * monitor's power button is live only while this scene is mounted (Req 3.5). Pressing it unlocks
 * audio inside the click handler, before anything else, so browser autoplay rules allow sound
 * (Req 3.2), and then signals `powerOn`, which leads to the title screen (title-and-endings
 * Req 1.1; the title's theme can start because audio is already unlocked).
 */
import type { AudioEngine } from '../core/audio';
import { h } from '../core/h';
import type { Monitor } from '../core/monitor';
import type { Scene, SignalFn } from '../core/scene';

export interface PowerOffDeps {
  readonly monitor: Pick<Monitor, 'setLed' | 'setPowerHandler'>;
  readonly audio: Pick<AudioEngine, 'unlock'>;
  readonly signal: SignalFn;
}

export function createPowerOffScene({ monitor, audio, signal }: PowerOffDeps): Scene {
  let el: HTMLElement | null = null;

  return {
    mount(root) {
      if (el) return;
      // The faint glass reflection is drawn by `.scene-power-off` in monitor.css.
      el = h('div', { className: 'scene scene-power-off', attrs: { 'aria-hidden': 'true' } });
      root.appendChild(el);
      monitor.setLed('standby');
      monitor.setPowerHandler(() => {
        // unlock() returns false when audio is unavailable; the boot goes on silently (Req 3.3).
        audio.unlock();
        signal('powerOn');
      });
    },
    unmount() {
      if (!el) return;
      monitor.setPowerHandler(null);
      monitor.setLed('on');
      el.remove();
      el = null;
    },
  };
}
