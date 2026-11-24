/**
 * Taskbar (retro-shell design, "src/desktop/taskbar.ts"; Req 7, 14.2).
 *
 * Start button, one button per open window in open order and the Tray (modem lamp, speaker,
 * clock). Window buttons are rebuilt from the Window_Manager's stack on every notification; the
 * Focused_Window's button gets the pressed style (Req 7.1, 7.4) and a click goes to
 * `windows.taskbarClick(id)`, which minimizes the focused window or focuses another (Req 7.2, 7.3).
 *
 * DOM follows the contract in src/styles/desktop.css:
 *   div.taskbar
 *     > button.start-button > span.icon + span.start-button-label
 *     > div.taskbar-buttons > button.taskbar-button > span.icon + span.taskbar-button-label
 *     > div.tray > span.tray-modem[data-state] + button.tray-speaker > span.icon + span.tray-clock
 *
 * All listeners sit on the taskbar's own elements, so unmount only has to unsubscribe from the
 * Window_Manager and remove the root element (Req 14.2). All text goes in through text nodes.
 */
import type { AudioEngine } from '../core/audio';
import { h } from '../core/h';
import type { Mountable } from '../core/scene';
import { DESKTOP_COPY } from './copy';
import { iconEl } from './iconArt';
import type { WindowManager } from './windowManager';
import type { WindowStack } from './windowStack';

export type ModemLamp = 'off' | 'blink' | 'on';

export interface Taskbar extends Mountable {
  /** Pressed look while the Start_Menu is open. */
  setStartPressed(pressed: boolean): void;
  /** Tray modem lamp: `blink` while dialing, `on` once connected (Req 7.6, 7.7). */
  setModem(state: ModemLamp): void;
  /** Anchor for the Start_Menu. */
  readonly startButton: HTMLButtonElement;
}

export interface TaskbarDeps {
  readonly windows: WindowManager;
  readonly audio: Pick<AudioEngine, 'setMuted' | 'isMuted'>;
  readonly onStart: () => void;
}

/** Accessible name of the Tray speaker (UI chrome, not game copy). */
const SPEAKER_LABEL = 'Mute sound';

export function createTaskbar(deps: TaskbarDeps): Taskbar {
  const { windows, audio } = deps;

  const startButton = h(
    'button',
    {
      className: 'start-button',
      attrs: { type: 'button', 'aria-haspopup': 'menu', 'aria-expanded': 'false' },
      on: { click: () => deps.onStart() },
    },
    iconEl('start'),
    h('span', { className: 'start-button-label' }, DESKTOP_COPY.start),
  );

  const buttons = h('div', { className: 'taskbar-buttons' });

  const modem = h('span', { className: 'tray-modem', attrs: { 'data-state': 'off' } });

  const speaker = h('button', {
    className: 'tray-speaker',
    attrs: { type: 'button', 'aria-label': SPEAKER_LABEL },
    on: {
      click: () => {
        audio.setMuted(!audio.isMuted());
        renderSpeaker();
      },
    },
  });

  const clock = h('span', { className: 'tray-clock' }, DESKTOP_COPY.clock);

  const root = h(
    'div',
    { className: 'taskbar' },
    startButton,
    buttons,
    h('div', { className: 'tray' }, modem, speaker, clock),
  );

  let unsubscribe: (() => void) | null = null;

  /** Icon and aria-pressed follow the Audio_Engine's mute flag (Req 7.8). */
  function renderSpeaker(): void {
    const muted = audio.isMuted();
    speaker.setAttribute('aria-pressed', String(muted));
    speaker.replaceChildren(iconEl(muted ? 'speakerMuted' : 'speaker'));
  }

  function windowButton(id: string, focused: boolean): HTMLButtonElement {
    // Read from the Window_Manager, so windows opened before mount get their title and icon too.
    const info = windows.info(id);
    const button = h(
      'button',
      {
        className: focused ? 'taskbar-button is-pressed' : 'taskbar-button',
        attrs: { type: 'button', 'data-window-id': id, 'aria-pressed': String(focused) },
        on: { click: () => windows.taskbarClick(id) },
      },
      info ? iconEl(info.icon) : null,
      h('span', { className: 'taskbar-button-label' }, info?.title ?? ''),
    );
    return button;
  }

  /** Req 7.1, 7.4: one button per open window in open order, pressed on the focused one. */
  function renderButtons(stack: WindowStack): void {
    buttons.replaceChildren(...stack.opened.map((id) => windowButton(id, id === stack.focused)));
  }

  return {
    startButton,

    mount(target) {
      if (unsubscribe) return;
      unsubscribe = windows.subscribe((stack) => renderButtons(stack));
      // `subscribe` does not call back right away, so draw the current stack now.
      renderButtons(windows.stack());
      renderSpeaker();
      target.appendChild(root);
    },

    unmount() {
      unsubscribe?.();
      unsubscribe = null;
      buttons.replaceChildren();
      root.remove();
    },

    setStartPressed(pressed) {
      startButton.classList.toggle('is-pressed', pressed);
      startButton.setAttribute('aria-expanded', String(pressed));
    },

    setModem(state) {
      modem.dataset.state = state;
    },
  };
}
