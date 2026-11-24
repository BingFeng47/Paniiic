/**
 * Result_Screen (title-and-endings Req 8–11): the full-Screen overlay the Desktop_Scene shows
 * when a Run ends.
 *
 * - `won`: a "Download Complete" window with a full bar plays the Handshake_Chime; at the win
 *   reveal time it adds the "Welcome to the Internet!" headline, `funny_cats_1998.avi`, the run
 *   statistics and the Result_Buttons (Req 9.1, 9.2).
 * - `lost`: the Modem_Screech and the Static_Hiss play under a static effect with a blinking
 *   "NO CARRIER" while the window stays hidden; at the lose reveal time the static goes away and
 *   the "Connection Terminated" window shows the message, a bar frozen at the final percentage,
 *   `SKELETON_DATING_SIM.EXE`, the statistics and the Result_Buttons (Req 10.1, 10.2).
 *
 * Elapsed time is counted in fixed-loop ticks (`ticks × TICK_MS`), so a hidden page holds the
 * ending (Req 8.5). The loop stops at the reveal; after that only CSS animates (design D14). The
 * Result_Buttons (Retry, then Main menu) appear at the reveal with focus on Retry (replay-flow
 * Req 1.1, 1.2). Only the first activation calls its action (Req 1.4); the Desktop_Scene then
 * unmounts this component, which stops the loop and every Voice and removes the elements
 * (Req 11.2, 11.4, 12.2). It adds no `document` or `window` listeners.
 *
 * DOM follows the contract in src/styles/result.css. Text goes in through text nodes only
 * (Req 12.3).
 */
import type { AudioEngine, Voice } from '../core/audio';
import { startFixedLoop, TICK_MS } from '../core/fixedLoop';
import { h } from '../core/h';
import type { Mountable } from '../core/scene';
import { iconEl } from '../desktop/iconArt';
import type { LoopStarter } from '../dialup/session';
import type { GameState } from '../game/types';
import { RESULT_COPY } from './resultCopy';
import {
  RESULT_SCRIPT,
  resultModel,
  resultStageAt,
  type ResultModel,
  type ResultScript,
} from './resultScript';
import { RESULT_SOUND_SEC, RESULT_SOUNDS, resultSoundsFor } from './resultSounds';

export interface ResultActions {
  readonly onRetry: () => void;
  readonly onMainMenu: () => void;
}

/** How the Desktop_Scene builds a Result_Screen for a Final_State (design D12). */
export type ResultScreenFactory = (final: GameState, actions: ResultActions) => Mountable;

export interface ResultScreenDeps extends ResultActions {
  readonly final: GameState;
  readonly audio: Pick<AudioEngine, 'play'>;
  /** Defaults to `startFixedLoop`. Tests pass a manual loop. */
  readonly startLoop?: LoopStarter;
  /** Defaults to `RESULT_SCRIPT`. */
  readonly script?: ResultScript;
}

/** A download bar: `div.result-bar > div.result-bar-fill + span.result-bar-text`. */
function downloadBar(percent: number, text: string): HTMLDivElement {
  const fill = h('div', { className: 'result-bar-fill' });
  fill.style.width = `${percent}%`;
  return h(
    'div',
    {
      className: 'result-bar',
      attrs: {
        role: 'progressbar',
        'aria-valuemin': '0',
        'aria-valuemax': '100',
        'aria-valuenow': String(percent),
      },
    },
    fill,
    h('span', { className: 'result-bar-text' }, text),
  );
}

/** The parts both outcomes add at the reveal: file, statistics and the Result_Buttons. */
function revealTail(
  model: ResultModel,
  buttons: readonly HTMLButtonElement[],
): readonly HTMLElement[] {
  const copy = model.outcome === 'won' ? RESULT_COPY.won : RESULT_COPY.lost;
  const stat = (label: string, value: string): readonly HTMLElement[] => [
    h('dt', null, label),
    h('dd', null, value),
  ];
  return [
    h(
      'div',
      { className: 'result-file' },
      iconEl('file'),
      h('span', { className: 'result-file-name' }, copy.file),
      h('span', { className: 'result-file-note' }, copy.fileNote),
    ),
    h(
      'dl',
      { className: 'result-stats' },
      ...stat(RESULT_COPY.stats.time, model.timeText),
      ...stat(RESULT_COPY.stats.integrity, model.integrityText),
      ...stat(RESULT_COPY.stats.download, model.downloadText),
    ),
    h('div', { className: 'result-buttons' }, ...buttons),
  ];
}

export function createResultScreen({
  final,
  audio,
  onRetry,
  onMainMenu,
  startLoop = startFixedLoop,
  script = RESULT_SCRIPT,
}: ResultScreenDeps): Mountable {
  let el: HTMLElement | null = null;
  let staticEl: HTMLElement | null = null;
  let windowEl: HTMLElement | null = null;
  let bodyEl: HTMLElement | null = null;
  let retryButton: HTMLButtonElement | null = null;
  let mainMenuButton: HTMLButtonElement | null = null;
  let chosen = false;
  let stopLoop: (() => void) | null = null;

  let model: ResultModel | null = null;
  let ticks = 0;
  let revealed = false;
  const voices: Voice[] = [];

  const halt = (): void => {
    const stop = stopLoop;
    stopLoop = null;
    stop?.();
  };

  function reveal(): void {
    if (!model || !bodyEl || !windowEl || !retryButton || !mainMenuButton || revealed) return;
    const buttons = [retryButton, mainMenuButton];
    revealed = true;
    halt();

    if (model.outcome === 'won') {
      bodyEl.append(
        h('h2', { className: 'result-headline' }, RESULT_COPY.won.headline),
        ...revealTail(model, buttons),
      );
    } else {
      bodyEl.append(
        h('p', { className: 'result-message' }, RESULT_COPY.lost.message),
        downloadBar(model.downloadPercent, model.downloadText),
        ...revealTail(model, buttons),
      );
      staticEl?.setAttribute('hidden', ''); // Req 10.2: the static effect ends
      windowEl.removeAttribute('hidden');
    }
    retryButton.focus(); // replay-flow Req 1.2
  }

  function onTicks(n: number): void {
    // Zero-tick frames (and frames after unmount or the reveal) change nothing.
    if (!el || !model || revealed || !(n > 0) || !Number.isFinite(n)) return;
    ticks += n;
    if (resultStageAt(model.outcome, ticks * TICK_MS, script) === 'reveal') reveal();
  }

  return {
    mount(root) {
      if (el) return;
      // The Outcome comes only from the Final_State phase (Req 8.2). A state that is neither won
      // nor lost has no ending to show; the Desktop_Scene never mounts one.
      model = resultModel(final);
      if (!model) return;
      ticks = 0;
      revealed = false;
      const won = model.outcome === 'won';

      chosen = false;
      // replay-flow Req 1.3, 1.4: real buttons (click, Enter, Space); the first activation wins.
      const choose = (action: () => void) => (): void => {
        if (chosen) return;
        chosen = true;
        action();
      };
      retryButton = h(
        'button',
        {
          className: 'btn btn-default result-retry',
          attrs: { type: 'button' },
          on: { click: choose(() => onRetry()) },
        },
        RESULT_COPY.retry,
      );
      mainMenuButton = h(
        'button',
        {
          className: 'btn result-main-menu',
          attrs: { type: 'button' },
          on: { click: choose(() => onMainMenu()) },
        },
        RESULT_COPY.mainMenu,
      );

      bodyEl = won
        ? h(
            'div',
            { className: 'window-body' },
            h('p', { className: 'result-status' }, RESULT_COPY.won.status),
            downloadBar(100, `100${RESULT_COPY.percentSuffix}`), // Req 9.1: a full bar
            h('p', { className: 'result-detail' }, RESULT_COPY.won.savedTo),
          )
        : h('div', { className: 'window-body' });

      windowEl = h(
        'div',
        { className: 'window is-active result-window' },
        h(
          'div',
          { className: 'title-bar' },
          h(
            'span',
            { className: 'title-bar-text', attrs: { id: 'result-title' } },
            won ? RESULT_COPY.won.windowTitle : RESULT_COPY.lost.windowTitle,
          ),
        ),
        bodyEl,
      );

      staticEl = won
        ? null
        : h(
            'div',
            { className: 'result-static', attrs: { 'aria-hidden': 'true' } },
            h('span', { className: 'result-static-text' }, RESULT_COPY.lost.staticText),
          );
      // Req 10.1: during the lose intro only the static shows.
      if (!won) windowEl.setAttribute('hidden', '');

      el = h(
        'div',
        {
          className: `result-screen ${won ? 'is-won' : 'is-lost'}`,
          attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'result-title' },
        },
        staticEl,
        windowEl,
      );
      root.appendChild(el);

      // Req 9.1, 10.1: the ending's sounds, on the Sfx_Channel.
      for (const id of resultSoundsFor(model.outcome)) {
        voices.push(audio.play(RESULT_SOUNDS[id], RESULT_SOUND_SEC[id], 'sfx'));
      }
      stopLoop = startLoop(onTicks);
    },
    unmount() {
      if (!el) return;
      halt();
      for (const voice of voices) voice.stop(); // Req 11.2, 11.4
      voices.length = 0;
      el.remove();
      el = staticEl = windowEl = bodyEl = retryButton = mainMenuButton = null;
      model = null;
    },
  };
}
