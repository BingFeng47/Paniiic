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
 * Both outcomes also show the Receipt (`scoreRun(final)`) below the statistics, then the
 * Guestbook_Form in `div.result-guestbook` (leaderboard Req 4, 5). The form never takes focus, so
 * Retry keeps it, and it is unmounted with this component, so late network results are dropped.
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
import { scoreRun, type ScoreBreakdown } from '../game/score';
import type { GameState } from '../game/types';
import type { LeaderboardClient } from '../core/leaderboard';
import { createGuestbookForm, runEntry } from './guestbook/guestbookForm';
import type { StorageSource } from './guestbook/guestbookName';
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
  /** The shared Leaderboard_Client for the Guestbook_Form (leaderboard Req 5). */
  readonly leaderboard: Pick<LeaderboardClient, 'configured' | 'submit' | 'topToday' | 'rankToday'>;
  /** Where the Guestbook_Form keeps the last Player_Name (leaderboard Req 5.8). */
  readonly storage: StorageSource;
  /** The Day for the Guestbook_Form's rank and list. Defaults to the current UTC Day. */
  readonly today?: () => string;
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

/** `12345` → `"12,345"`, locale-independent so every player's receipt reads the same. */
function groupDigits(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * The Receipt (leaderboard Req 4.1–4.3): a monospace bill with one line per non-zero part of
 * the Score_Breakdown and the total. Text goes in through text nodes only.
 */
function receipt(score: ScoreBreakdown): HTMLElement {
  const copy = RESULT_COPY.receipt;
  const points = (n: number): string => `${groupDigits(n)}${copy.pointsSuffix}`;
  const row = (className: string, label: string, value: string): HTMLElement =>
    h(
      'div',
      { className },
      h('span', { className: 'result-receipt-label' }, label),
      h('span', { className: 'result-receipt-points' }, value),
    );
  return h(
    'div',
    { className: 'result-receipt', attrs: { role: 'group', 'aria-label': copy.from } },
    h('p', { className: 'result-receipt-from' }, copy.from),
    h('p', { className: 'result-receipt-title' }, copy.title),
    h(
      'div',
      { className: 'result-receipt-lines' },
      ...score.lines
        .filter((line) => line.points !== 0)
        .map((line) => {
          const el = row('result-receipt-line', copy.lines[line.id], points(line.points));
          el.dataset.line = line.id;
          return el;
        }),
    ),
    row('result-receipt-total', copy.total, points(score.total)),
    h('p', { className: 'result-receipt-footer' }, copy.footer),
  );
}

/**
 * The parts both outcomes add at the reveal: file, statistics, the Receipt, the Guestbook_Form
 * mount point and the Result_Buttons.
 */
function revealTail(
  model: ResultModel,
  score: ScoreBreakdown,
  buttons: readonly HTMLButtonElement[],
  guestbook: HTMLElement,
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
    receipt(score), // Req 4.2: below the statistics, above the Guestbook_Form
    guestbook, // div.result-guestbook, the Guestbook_Form mount point (leaderboard Req 5.1)
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
  leaderboard,
  storage,
  today,
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
  let guestbook: Mountable | null = null;
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
    // `model` exists only for a won or lost Final_State, so scoreRun never throws here.
    const score = scoreRun(final);
    const guestbookEl = h('div', { className: 'result-guestbook' });
    guestbook = createGuestbookForm({ leaderboard, storage, today, run: runEntry(final, score.total) });
    guestbook.mount(guestbookEl);

    if (model.outcome === 'won') {
      bodyEl.append(
        h('h2', { className: 'result-headline' }, RESULT_COPY.won.headline),
        ...revealTail(model, score, buttons, guestbookEl),
      );
    } else {
      bodyEl.append(
        h('p', { className: 'result-message' }, RESULT_COPY.lost.message),
        downloadBar(model.downloadPercent, model.downloadText),
        ...revealTail(model, score, buttons, guestbookEl),
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
      guestbook?.unmount(); // drops late Leaderboard_Client results
      guestbook = null;
      for (const voice of voices) voice.stop(); // Req 11.2, 11.4
      voices.length = 0;
      el.remove();
      el = staticEl = windowEl = bodyEl = retryButton = mainMenuButton = null;
      model = null;
    },
  };
}
