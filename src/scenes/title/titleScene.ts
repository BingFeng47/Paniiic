/**
 * Title_Scene (title-and-endings Req 2, 3): the CRT power-on, the "PANIIIC" wordmark, the
 * Play_Button, the Hall of Fame button and the Options_Button over a night scene, with the Theme_Song on the
 * Music_Channel.
 *
 * Every Play, Options and tick goes through the pure `titleStep` model, and this module only
 * applies the effects it returns (design D2):
 * - `openOptions`: mount the Options_Dialog and make `.title-menu` inert (Req 2.5, 4.1);
 * - `closeOptions`: unmount the dialog, drop `inert`, focus Options (Req 4.6);
 * - `openHallOfFame` / `closeHallOfFame`: the same for the Hall_of_Fame window, focusing the
 *   Hall of Fame button on close (leaderboard Req 7.2);
 * - `startFade`: fade the theme over 600 ms and hand its Voice to the engine (Req 3.5, 3.6);
 * - `finish`: stop the loop and signal `play`, the only way out of this scene (Req 1.6).
 *
 * Theme passes are measured in fixed-loop ticks: one Voice per Theme_Pass, started at each pass
 * boundary while the menu, the Options_Dialog or the Hall_of_Fame is showing (Req 3.2, 4.7). The power button
 * stays inert because this scene never sets a power handler (Req 2.6). With audio unavailable
 * every `play` returns the no-op Voice and the scene works the same (Req 3.9).
 *
 * DOM follows the contract in src/styles/title.css. Text goes in through text nodes only
 * (Req 12.3).
 */
import type { AudioEngine, Voice } from '../../core/audio';
import { startFixedLoop } from '../../core/fixedLoop';
import { h } from '../../core/h';
import { createLeaderboardClient, type LeaderboardClient } from '../../core/leaderboard';
import type { Mountable, Scene } from '../../core/scene';
import type { SettingsStore } from '../../core/settings';
import type { LoopStarter } from '../../dialup/session';
import { createHallOfFame } from './hallOfFame';
import { createOptionsDialog } from './optionsDialog';
import { THEME_SCORE, passTicks, passesBetween } from './themeScore';
import { THEME_PASS_SEC, themeSong } from './themeSong';
import { TITLE_COPY } from './titleCopy';
import {
  INITIAL_TITLE,
  THEME_FADE_MS,
  titleStep,
  type TitleAction,
  type TitleEffect,
  type TitleModel,
} from './titleModel';

/**
 * The only signal the Title_Scene raises (Req 1.6). The director's `SignalFn` is assignable to
 * it, and the narrow type keeps any other signal out of this scene.
 */
export type TitleSignalFn = (signal: 'play') => void;

export interface TitleDeps {
  /**
   * `unlock`/`isUnlocked` are optional: when present and audio is still locked (the page opened
   * straight on this scene), the first click or key press unlocks it and restarts the theme.
   */
  readonly audio: Pick<AudioEngine, 'play'> & Partial<Pick<AudioEngine, 'unlock' | 'isUnlocked'>>;
  readonly settings: Pick<SettingsStore, 'get' | 'update'>;
  readonly signal: TitleSignalFn;
  /** Defaults to `startFixedLoop`. Tests pass a manual loop. */
  readonly startLoop?: LoopStarter;
  /**
   * Data for the Hall_of_Fame (leaderboard Req 7.2). The shell passes its shared client; the
   * default is the unconfigured client, which answers every call with `offline`.
   */
  readonly leaderboard?: Pick<LeaderboardClient, 'topToday' | 'topAllTime' | 'guestCount'>;
  /** The Day for today's list. Defaults to `utcDay(new Date())` inside the Hall_of_Fame. */
  readonly today?: () => string;
}

/** One Theme_Pass in ticks (1,440 = 24 s). */
const PASS_TICKS = passTicks(THEME_SCORE);

/** Pass Voices kept for stopping or fading: the current pass and the one that just ended. */
const KEPT_PASSES = 2;

export function createTitleScene({
  audio,
  settings,
  signal,
  startLoop = startFixedLoop,
  leaderboard = createLeaderboardClient(null),
  today,
}: TitleDeps): Scene {
  let el: HTMLElement | null = null;
  let menuEl: HTMLElement | null = null;
  let optionsButton: HTMLButtonElement | null = null;
  let hallButton: HTMLButtonElement | null = null;
  let dialog: Mountable | null = null;
  let stopLoop: (() => void) | null = null;

  let model: TitleModel = INITIAL_TITLE;
  let ticks = 0;
  let finished = false;
  /** Theme Voices this scene still owns; emptied when they are handed off to a fade. */
  const themeVoices: Voice[] = [];

  const halt = (): void => {
    const stop = stopLoop;
    stopLoop = null;
    stop?.();
  };

  function startPass(): void {
    themeVoices.push(audio.play(themeSong, THEME_PASS_SEC, 'music'));
    // An older pass ended long ago; stopping it again is safe and frees the reference.
    while (themeVoices.length > KEPT_PASSES) themeVoices.shift()?.stop();
  }

  function stopTheme(): void {
    for (const voice of themeVoices) voice.stop();
    themeVoices.length = 0;
  }

  function openOptions(): void {
    if (!el || !menuEl || dialog) return;
    menuEl.setAttribute('inert', ''); // Req 2.5, on top of the model rule
    const next = createOptionsDialog({
      settings,
      onClose: () => dispatch({ type: 'closeOptions' }),
    });
    dialog = next;
    next.mount(el); // focuses the Volume_Slider (Req 4.2)
  }

  function closeOptions(): void {
    const open = dialog;
    dialog = null;
    open?.unmount();
    menuEl?.removeAttribute('inert');
    optionsButton?.focus(); // Req 4.6
  }

  function openHallOfFame(): void {
    if (!el || !menuEl || dialog) return;
    menuEl.setAttribute('inert', ''); // leaderboard Req 7.2, on top of the model rule (Req 7.5)
    const next = createHallOfFame({
      leaderboard,
      today,
      onClose: () => dispatch({ type: 'closeHallOfFame' }),
    });
    dialog = next;
    next.mount(el); // focuses its Close button
  }

  function closeHallOfFame(): void {
    const open = dialog;
    dialog = null;
    open?.unmount();
    menuEl?.removeAttribute('inert');
    hallButton?.focus();
  }

  function startFade(): void {
    // The engine ramps each Voice to silence and stops it by timer (Req 3.5, 3.6); from here on
    // the Voices belong to the engine, so unmount leaves them alone (Req 12.2).
    for (const voice of themeVoices) voice.fadeOut(THEME_FADE_MS / 1000);
    themeVoices.length = 0;
  }

  function finish(): void {
    finished = true;
    halt();
    // The director may unmount this scene synchronously, so nothing runs after this call.
    signal('play');
  }

  function apply(effect: TitleEffect): void {
    switch (effect) {
      case 'openOptions':
        openOptions();
        break;
      case 'closeOptions':
        closeOptions();
        break;
      case 'openHallOfFame':
        openHallOfFame();
        break;
      case 'closeHallOfFame':
        closeHallOfFame();
        break;
      case 'startFade':
        startFade();
        break;
      case 'finish':
        finish();
        break;
    }
  }

  function dispatch(action: TitleAction): void {
    if (!el || finished) return;
    const result = titleStep(model, action);
    model = result.model;
    for (const effect of result.effects) {
      apply(effect);
      if (finished) return;
    }
  }

  function onTicks(n: number): void {
    // Zero-tick frames (and frames after unmount or the end) change nothing.
    if (!el || finished || !(n > 0) || !Number.isFinite(n)) return;
    const prev = ticks;
    ticks += n;
    // New passes only while the theme is still wanted (Req 3.2, 4.7); none once Play is pressed.
    if (themeWanted()) {
      const newPasses = passesBetween(prev, ticks, PASS_TICKS).length;
      for (let i = 0; i < newPasses; i += 1) startPass();
    }
    dispatch({ type: 'ticks', n });
  }

  /** Modes in which the Theme_Song keeps playing pass after pass (Req 3.2, 4.7). */
  const themeWanted = (): boolean =>
    model.mode === 'menu' || model.mode === 'options' || model.mode === 'hallOfFame';

  /** First gesture while audio is locked: unlock it inside the handler and start the theme over. */
  const onGesture = (): void => {
    removeGesture();
    if (!el || finished || !audio.unlock || audio.isUnlocked?.()) return;
    if (!audio.unlock()) return;
    if (!themeWanted()) return;
    stopTheme();
    ticks = 0; // pass boundaries count from this new pass 0
    startPass();
  };
  let gestureBound = false;
  function removeGesture(): void {
    if (!gestureBound) return;
    gestureBound = false;
    document.removeEventListener('pointerdown', onGesture, true);
    document.removeEventListener('keydown', onGesture, true);
  }
  return {
    mount(root) {
      if (el) return;
      model = INITIAL_TITLE;
      ticks = 0;
      finished = false;

      const playButton = h(
        'button',
        {
          className: 'btn title-button title-play',
          attrs: { type: 'button' },
          on: { click: () => dispatch({ type: 'play' }) },
        },
        TITLE_COPY.play,
      );
      optionsButton = h(
        'button',
        {
          className: 'btn title-button title-options',
          attrs: { type: 'button' },
          on: { click: () => dispatch({ type: 'openOptions' }) },
        },
        TITLE_COPY.options,
      );
      hallButton = h(
        'button',
        {
          className: 'btn title-button title-hof',
          attrs: { type: 'button' },
          on: { click: () => dispatch({ type: 'openHallOfFame' }) },
        },
        TITLE_COPY.hallOfFame,
      );
      // Play game, Hall of Fame, Options (leaderboard Req 7.1).
      menuEl = h('div', { className: 'title-menu' }, playButton, hallButton, optionsButton);

      el = h(
        'div',
        { className: 'scene scene-title crt-on' },
        // Moon, poles and wires are drawn by CSS on this element (title.css).
        h('div', { className: 'title-night', attrs: { 'aria-hidden': 'true' } }),
        h(
          'div',
          { className: 'title-card' },
          h(
            'h1',
            { className: 'title-wordmark', attrs: { 'data-text': TITLE_COPY.wordmark } },
            TITLE_COPY.wordmark,
          ),
          h('p', { className: 'title-subtitle' }, TITLE_COPY.subtitle),
          menuEl,
          h('p', { className: 'title-hint' }, TITLE_COPY.hint),
          h('p', { className: 'title-copyright' }, TITLE_COPY.copyright),
        ),
      );

      root.appendChild(el);
      playButton.focus(); // Req 2.2
      startPass(); // pass 0 (Req 3.1)
      if (audio.unlock && audio.isUnlocked && !audio.isUnlocked()) {
        gestureBound = true;
        document.addEventListener('pointerdown', onGesture, true);
        document.addEventListener('keydown', onGesture, true);
      }
      stopLoop = startLoop(onTicks);
    },
    unmount() {
      if (!el) return;
      removeGesture();
      halt();
      const open = dialog;
      dialog = null;
      open?.unmount();
      stopTheme(); // empty when the Voices were handed off to a fade (Req 3.7)
      el.remove();
      el = menuEl = optionsButton = hallButton = null;
    },
  };
}
