/**
 * Dialer App: the "Connect To" window and its Session_View (Req 9.1–9.4, 10.11, 11, 12.1,
 * 12.4–12.6).
 *
 * Idle, the "dialer" window shows the connection form; Connect calls `onConnect` and Cancel or ✕
 * close the window. During a Session the window shows the dial progress view instead and refuses
 * to close: Cancel and ✕ show the hang-up message for 180 Run ticks.
 *
 * Everything the progress view shows comes from the Run's state through `dialStatusOf`, never
 * from a timer of its own, so the dialog can't drift from the connect tick in `step()`. The
 * hang-up message also counts Run ticks. UI-only values (`connectedAtTick`, `hangUpUntilTick`,
 * the current voice) live in this closure, never in `GameState`.
 *
 * DOM follows the contract in src/styles/dialup.css. All text goes through `textContent`.
 */
import type { AudioEngine, Voice } from '../core/audio';
import { h } from '../core/h';
import { iconEl } from '../desktop/iconArt';
import type { Size } from '../desktop/layout';
import type { WindowManager } from '../desktop/windowManager';
import type { GameEvent, GameState } from '../game/types';
import type { DialStageId } from './dialScript';
import { DIALER_COPY, dialStatusOf, formatDuration, stageTimeLeftSeconds } from './dialScript';
import { MODEM_SOUNDS, MODEM_SOUND_SEC } from './modemSounds';
import type { SessionView } from './session';

export const DIALER_WINDOW_ID = 'dialer';
export const DIALER_WINDOW_SIZE: Size = { w: 340, h: 248 };
/** How long the hang-up message stays up, in Run ticks (Req 11.7). */
export const HANG_UP_MESSAGE_TICKS = 180;

export interface DialerDeps {
  readonly windows: WindowManager;
  readonly audio: AudioEngine;
  /** Called when the player clicks Connect (Req 9.2). The Desktop_Scene starts the Session. */
  readonly onConnect: () => void;
}

export interface DialerApp {
  /** Opens or focuses the "dialer" window, showing whichever view is current. */
  open(): void;
  readonly sessionView: SessionView;
  /** Stops every Dialer sound and closes the window. */
  unmount(): void;
}

function setText(el: HTMLElement, text: string): void {
  if (el.textContent !== text) el.textContent = text;
}

/* ---- Views ------------------------------------------------------------------------------------ */

function field(id: string, label: string, value: string, type: 'text' | 'password'): HTMLElement {
  const labelEl = h('label', { className: 'field-label', attrs: { for: id } });
  labelEl.textContent = label;
  const input = h('input', {
    className: 'field-input',
    attrs: { id, type, readonly: '', spellcheck: 'false', autocomplete: 'off' },
  });
  input.value = value;
  return h('div', { className: 'field-row' }, labelEl, input);
}

function button(label: string, isDefault: boolean, onClick: () => void): HTMLButtonElement {
  const el = h('button', {
    className: isDefault ? 'btn btn-default' : 'btn',
    attrs: { type: 'button' },
    on: { click: onClick },
  });
  el.textContent = label;
  return el;
}

/** The "Connect To" form (Req 9.1). The password value in DIALER_COPY is already masked. */
function buildForm(onConnect: () => void, onCancel: () => void): HTMLElement {
  const copy = DIALER_COPY.form;
  const name = h('span', { className: 'dialer-name' });
  name.textContent = copy.connectionName;
  return h(
    'div',
    { className: 'dialer-form' },
    h('div', { className: 'dialer-header' }, iconEl('dialer'), name),
    h(
      'div',
      { className: 'dialer-fields' },
      field('dialer-user-name', copy.userNameLabel, copy.userName, 'text'),
      field('dialer-password', copy.passwordLabel, copy.password, 'password'),
      field('dialer-phone-number', copy.phoneNumberLabel, copy.phoneNumber, 'text'),
    ),
    h(
      'div',
      { className: 'dialer-buttons' },
      button(DIALER_COPY.buttons.connect, true, onConnect),
      button(DIALER_COPY.buttons.cancel, false, onCancel),
    ),
  );
}

interface ProgressView {
  readonly root: HTMLElement;
  readonly status: HTMLElement;
  readonly detail: HTMLElement;
}

/** The dial progress view (Req 9.4): computer, phone line, computer, status and detail lines. */
function buildProgress(onCancel: () => void): ProgressView {
  const status = h('div', { className: 'dialer-status', attrs: { 'aria-live': 'polite' } });
  const detail = h('div', { className: 'dialer-detail' });
  const root = h(
    'div',
    { className: 'dialer-progress' },
    h(
      'div',
      { className: 'dialer-link' },
      iconEl('computer'),
      h('span', { className: 'dialer-line' }),
      iconEl('computer'),
    ),
    status,
    detail,
    h('div', { className: 'dialer-buttons' }, button(DIALER_COPY.buttons.cancel, false, onCancel)),
  );
  return { root, status, detail };
}

/* ---- App -------------------------------------------------------------------------------------- */

export function createDialerApp(deps: DialerDeps): DialerApp {
  const { windows, audio, onConnect } = deps;

  const requestClose = (): void => windows.requestClose(DIALER_WINDOW_ID);
  const form = buildForm(() => {
    if (!progress) onConnect();
  }, requestClose);

  // Session state: only set between sessionView.mount and sessionView.unmount.
  let progress: ProgressView | null = null;
  let lastState: GameState | null = null;
  let stageId: DialStageId | null = null;
  let stageVoice: Voice | null = null;
  let relayVoice: Voice | null = null;
  let connectedAtTick: number | null = null;
  let hangUpUntilTick = -1;

  const currentContent = (): HTMLElement => progress?.root ?? form;
  const currentTitle = (): string => {
    if (!progress) return DIALER_COPY.titles.form;
    return lastState !== null && dialStatusOf(lastState).kind === 'connected'
      ? DIALER_COPY.titles.connected
      : DIALER_COPY.titles.dialing;
  };

  /** Req 9.3 while idle; Req 11.7 during a Session (the window and the Session stay). */
  const onCloseRequest = (): boolean => {
    if (!progress) return true;
    hangUpUntilTick = (lastState?.tick ?? 0) + HANG_UP_MESSAGE_TICKS;
    if (lastState) render(lastState);
    return false;
  };

  const open = (): void => {
    windows.open({
      id: DIALER_WINDOW_ID,
      title: currentTitle(),
      icon: 'dialer',
      content: currentContent(),
      size: DIALER_WINDOW_SIZE,
      onCloseRequest,
    });
  };

  const stopVoices = (): void => {
    stageVoice?.stop();
    stageVoice = null;
    relayVoice?.stop();
    relayVoice = null;
  };

  /** Req 12.1, 12.4: switch voices only when the stage changes; each ends with its stage. */
  const switchStageVoice = (state: GameState): void => {
    const status = dialStatusOf(state);
    const nextId = status.kind === 'dialing' ? status.stage.id : null;
    if (nextId === stageId) return;
    stageId = nextId;
    stageVoice?.stop();
    stageVoice = null;
    if (status.kind !== 'dialing' || status.stage.sound === null) return;
    const seconds = stageTimeLeftSeconds(state);
    if (seconds > 0) stageVoice = audio.play(MODEM_SOUNDS[status.stage.sound], seconds);
  };

  /** Writes the progress view and the title for `state`. Safe to call again with the same state. */
  const render = (state: GameState): void => {
    const view = progress;
    if (!view) return;
    const status = dialStatusOf(state);
    let statusText: string;
    let detailText = '';
    if (status.kind === 'dialing') {
      statusText = status.stage.status; // Req 11.1
    } else if (status.kind === 'connected') {
      statusText = DIALER_COPY.connected; // Req 11.4, 11.5
      const since = connectedAtTick ?? state.tick;
      detailText = DIALER_COPY.duration + formatDuration(state.tick - since);
    } else {
      statusText = DIALER_COPY.terminated; // Req 11.6
    }
    const hangingUp = state.tick < hangUpUntilTick; // Req 11.7
    if (hangingUp) detailText = DIALER_COPY.hangUp;

    setText(view.status, statusText);
    setText(view.detail, detailText);
    view.status.classList.toggle('is-alert', status.kind === 'terminated');
    view.detail.classList.toggle('is-alert', hangingUp);
    view.root.classList.toggle('is-connected', status.kind === 'connected');
    view.root.classList.toggle('is-terminated', status.kind === 'terminated');
    if (status.kind !== 'terminated') windows.setTitle(DIALER_WINDOW_ID, currentTitle());
  };

  const sessionView: SessionView = {
    mount() {
      stopVoices();
      progress = buildProgress(requestClose);
      lastState = null;
      stageId = null;
      connectedAtTick = null;
      hangUpUntilTick = -1;
      // Req 9.4: the progress view replaces the form (the window opens if it was closed).
      if (windows.isOpen(DIALER_WINDOW_ID)) {
        windows.setContent(DIALER_WINDOW_ID, progress.root);
        windows.setTitle(DIALER_WINDOW_ID, DIALER_COPY.titles.dialing);
      } else {
        open();
      }
    },

    update(state: GameState, events: readonly GameEvent[]) {
      if (!progress) return;
      lastState = state;
      switchStageVoice(state);
      const connected = events.find((e) => e.type === 'connected');
      if (connected) {
        connectedAtTick = connected.tick;
        relayVoice?.stop();
        relayVoice = audio.play(MODEM_SOUNDS.relayClick, MODEM_SOUND_SEC.relayClick); // Req 12.5
      }
      // A Run that is already connected without us seeing the event still gets a duration.
      if (connectedAtTick === null && dialStatusOf(state).kind === 'connected') {
        connectedAtTick = state.tick;
      }
      render(state);
    },

    /** Req 10.11, 12.6: stop every Dialer sound and go back to the form. */
    unmount() {
      stopVoices();
      if (!progress) return;
      progress = null;
      lastState = null;
      stageId = null;
      connectedAtTick = null;
      hangUpUntilTick = -1;
      if (windows.isOpen(DIALER_WINDOW_ID)) {
        windows.setContent(DIALER_WINDOW_ID, form);
        windows.setTitle(DIALER_WINDOW_ID, DIALER_COPY.titles.form);
      }
    },
  };

  return {
    open,
    sessionView,
    unmount() {
      sessionView.unmount();
      windows.close(DIALER_WINDOW_ID);
    },
  };
}
