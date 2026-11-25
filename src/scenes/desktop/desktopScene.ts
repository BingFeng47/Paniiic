/**
 * Desktop_Scene: wallpaper, icons, windows, Lane_Dock, Taskbar and Start_Menu, plus the Session
 * that the Dialer's Connect button starts (Req 5, 8.3, 8.5, 9.2, 10.1, 10.6, 10.7, 10.10–10.13).
 *
 * DOM follows the contract in src/styles/desktop.css:
 *   div.scene.scene-desktop(.is-session)
 *     > div.wallpaper (> div.mission-note) + div.icon-grid + div.window-layer + div.lane-dock + div.session-overlay (Session only) + div.taskbar
 *       + div.start-menu
 *
 * The Lane_Dock is always in the DOM and is shown only by `.is-session` on the scene root, so its
 * 300 ms slide can run (no `hidden` attribute). At most one Session exists at a time; Connect
 * while one is active does nothing (Req 10.13). When the Run ends the Session has already stopped
 * and unmounted its views (the Dialer is back on its form); the desktop ends the Session (Lane_Dock
 * hidden, full Desktop_Area, "Shut Down..." enabled, Req 10.11) and always shows the
 * Result_Screen for the Outcome over the whole Screen (title-and-endings Req 8.1, design D12).
 * While it is shown every other child of the scene root is `inert`, the Start_Menu is closed, and
 * Connect and "Shut Down..." do nothing (Req 8.3, 8.4, D13). The desktop is idle again once the
 * player picks Retry, which dials again at once, or Main menu, which signals `mainMenu`
 * (replay-flow Req 2, 3).
 *
 * Components are created on mount, so every mount starts from a clean desktop. Unmount closes a
 * shown Result_Screen and ends the Session first, then unmounts every component and stops the
 * startup chime (Req 14.2, title-and-endings Req 11.4).
 */
import type { AudioEngine, Voice } from '../../core/audio';
import { utcDay } from '../../core/clock';
import { h } from '../../core/h';
import type { Monitor } from '../../core/monitor';
import type { Mountable, Scene, SignalFn } from '../../core/scene';
import { createIconGrid, DESKTOP_ICONS, type AppId, type IconGrid } from '../../desktop/icons';
import { DESKTOP_COPY } from '../../desktop/copy';
import { createMissionNote } from '../../desktop/missionNote';
import { desktopArea, type Size } from '../../desktop/layout';
import { createStartMenu, type StartItemId, type StartMenu } from '../../desktop/startMenu';
import { createTaskbar, type Taskbar } from '../../desktop/taskbar';
import { readmeContent, wastebasketContent } from '../../desktop/textWindow';
import { createWindowManager, type WindowManager } from '../../desktop/windowManager';
import { createDialerApp, type DialerApp } from '../../dialup/dialer';
import {
  createSession,
  DEFAULT_VIEW_PREFS,
  type LoopStarter,
  type Session,
  type SessionRegistry,
  type ViewPrefs,
} from '../../dialup/session';
import { SESSION_REGISTRY } from '../../dialup/sessionRegistry';
import { trayModemView } from '../../dialup/trayModemView';
import { dailySeed } from '../../game/dailySeed';
import type { GameState } from '../../game/types';
import { JUICE_TUNING } from '../../render/juice/juiceTuning';
import { createResultScreen, type ResultScreenFactory } from '../../ui/resultScreen';
import { browserStorage, type StorageSource } from '../../ui/guestbook/guestbookName';
import { createLeaderboardClient, type LeaderboardClient } from '../../core/leaderboard';
import { resultModel } from '../../ui/resultScript';
import { BOOT_SOUND_SEC, startupChime } from '../boot/bootSounds';

export type { AppId };

export interface DesktopDeps {
  readonly monitor: Pick<Monitor, 'toScreenPoint'>;
  readonly audio: AudioEngine;
  readonly signal: SignalFn;
  /** Defaults to `startFixedLoop` (through `createSession`). Tests pass a manual loop. */
  readonly startLoop?: LoopStarter;
  /**
   * Seed for each Session's Run. Defaults to the daily seed of the current UTC Day, so Retry on
   * the same Day replays the same Run (leaderboard Req 1.3). Tests inject their own (Req 1.4).
   */
  readonly seedSource?: () => number;
  /** Defaults to `SESSION_REGISTRY`. */
  readonly registry?: SessionRegistry;
  /**
   * View_Prefs for the Session_Views, read once per Session start (title-and-endings Req 7.1).
   * Defaults to `() => DEFAULT_VIEW_PREFS`.
   */
  readonly viewPrefs?: () => ViewPrefs;
  /**
   * The shared Leaderboard_Client for the Result_Screen's Guestbook_Form (leaderboard Req 5).
   * The shell passes the one it builds; defaults to an unconfigured client (every call `offline`).
   */
  readonly leaderboard?: LeaderboardClient;
  /** Where the Guestbook_Form keeps the last Player_Name. Defaults to `browserStorage`. */
  readonly guestbookStorage?: StorageSource;
  /**
   * Test seam only (title-and-endings D12). Defaults to the real Result_Screen:
   * (final, actions) => createResultScreen({ final, audio, startLoop: deps.startLoop,
   * leaderboard, storage, ...actions }).
   */
  readonly resultScreen?: ResultScreenFactory;
}

/** Window sizes for the text apps, in Screen px. */
export const README_WINDOW_SIZE: Size = { w: 420, h: 300 };
export const WASTEBASKET_WINDOW_SIZE: Size = { w: 340, h: 240 };

/** A fresh 32-bit seed from the browser's crypto source. Kept for tests that want a random Run. */
export function cryptoSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0];
}

interface Mounted {
  readonly el: HTMLElement;
  readonly laneDock: HTMLElement;
  readonly overlay: HTMLElement;
  readonly icons: IconGrid;
  readonly windows: WindowManager;
  readonly taskbar: Taskbar;
  readonly startMenu: StartMenu;
  readonly dialer: DialerApp;
}

export function createDesktopScene(deps: DesktopDeps): Scene {
  const { monitor, audio, signal } = deps;
  const registry = deps.registry ?? SESSION_REGISTRY;
  const seedSource = deps.seedSource ?? (() => dailySeed(utcDay(new Date())));
  const viewPrefs = deps.viewPrefs ?? (() => DEFAULT_VIEW_PREFS);
  // Resolved once, so every Run that ends shows a Result_Screen (D12).
  const leaderboard = deps.leaderboard ?? createLeaderboardClient(null);
  const storage = deps.guestbookStorage ?? browserStorage;
  const resultScreen: ResultScreenFactory =
    deps.resultScreen ??
    ((final, actions) =>
      createResultScreen({ final, audio, startLoop: deps.startLoop, leaderboard, storage, ...actions }));

  let m: Mounted | null = null;
  let session: Session | null = null;
  let chime: Voice | null = null;
  /** Receives the held Session's frame ticks during the End_Transition, or null. */
  let transitionTicks: ((n: number) => void) | null = null;
  /** The shown Result_Screen and the children made `inert` for it, or null. */
  let result: { readonly screen: Mountable; readonly inerted: readonly Element[] } | null = null;

  /** Req 5.7–5.9, 9.1: open the app's window, or focus it if it is already open. */
  function openApp(id: AppId): void {
    if (!m) return;
    switch (id) {
      case 'dialer':
        m.dialer.open();
        return;
      case 'readme':
        m.windows.open({
          id: 'readme',
          title: DESKTOP_COPY.titles.readme,
          icon: 'text',
          content: readmeContent(),
          size: README_WINDOW_SIZE,
        });
        return;
      case 'wastebasket':
        m.windows.open({
          id: 'wastebasket',
          title: DESKTOP_COPY.titles.wastebasket,
          icon: 'wastebasket',
          content: wastebasketContent(),
          size: WASTEBASKET_WINDOW_SIZE,
        });
        return;
    }
  }

  function onChoose(id: StartItemId): void {
    if (id === 'shutDown') {
      // The Start_Menu already ignores the disabled item; this guards the same rule (Req 8.5).
      if (session || result) return; // also blocked while the Result_Screen is shown
      // The director may unmount this scene synchronously, so nothing runs after this call.
      signal('shutDown'); // Req 1.4
      return;
    }
    openApp(id);
  }

  /** Req 9.2, 10.1, 10.10, 10.12, 10.13. */
  function startSession(): void {
    // One Session at a time (Req 10.13), and none while the Result_Screen is shown (Req 8.4).
    if (!m || session || result) return;
    const { el, laneDock, overlay, windows, taskbar, startMenu, dialer } = m;
    el.classList.add('is-session');
    // Only in the DOM during a Session, so the idle desktop's children are unchanged (Req 14.3).
    laneDock.after(overlay);
    windows.setArea(desktopArea(true));
    startMenu.setDisabled('shutDown', true); // Req 8.5
    const s = createSession({
      seed: seedSource(),
      systems: registry.systems,
      views: [dialer.sessionView, trayModemView(taskbar), ...registry.views.map((make) => make())],
      startLoop: deps.startLoop,
      onEnd: (final) => onRunEnd(final),
      // juice-and-endings End_Transition (Req 7.3): the views stay mounted on the same loop.
      holdViewsOnEnd: true,
      onHeldTicks: (n) => transitionTicks?.(n),
    });
    // Set before start, so a Connect fired from inside a view's mount is still a no-op.
    session = s;
    try {
      s.start({
        laneHost: laneDock,
        overlayHost: overlay, // browser-front Req 12.1
        windows,
        audio,
        toScreenPoint: (x, y) => monitor.toScreenPoint(x, y),
        prefs: viewPrefs(), // Req 7.1
      });
    } catch (error) {
      // A view failed to mount or the balance is invalid: go back to idle and fail loudly.
      endSession();
      throw error;
    }
  }

  /** Req 10.6, 10.7, 10.11: stop the Session and return the desktop to idle. Idempotent. */
  function endSession(): void {
    transitionTicks = null;
    const s = session;
    if (!s) return;
    session = null;
    s.stop();
    if (!m) return;
    m.el.classList.remove('is-session');
    m.overlay.remove();
    m.windows.setArea(desktopArea(false));
    m.startMenu.setDisabled('shutDown', false);
  }

  /** Req 8.1: end the Session, then show the ending for its Outcome. */
  function onRunEnd(final: GameState): void {
    const s = session;
    if (!s) return;
    // juice-and-endings End_Transition (Req 7.3): the views stay mounted for a fixed number of
    // frame ticks and get `endFrame`; no `step` runs. Then the same Final_State is shown.
    const total = JUICE_TUNING.transitionTicks;
    let t = 0;
    let done = false;
    const finish = (): void => {
      if (done) return;
      done = true;
      endSession(); // also stops this loop and unmounts the views
      // Only a Session that reports a phase other than won or lost has no ending to show.
      if (resultModel(final) !== null) showResult(final);
    };
    // The held Session's loop keeps running, so the tab being hidden pauses this like any
    // other fixed loop.
    transitionTicks = (n) => {
      if (done) return;
      for (let i = 0; i < n && t < total; i += 1) {
        t += 1;
        try {
          s.endFrame(final, t);
        } catch (error) {
          console.error('Desktop: endFrame threw, showing the result at once', error);
          finish();
          return;
        }
      }
      if (t >= total) finish();
    };
  }

  /** Req 8.1, 8.3 (D13): close the Start_Menu, make the desktop inert, mount the overlay last. */
  function showResult(final: GameState): void {
    if (!m || result) return;
    m.startMenu.close();
    const inerted = [...m.el.children];
    for (const child of inerted) child.setAttribute('inert', '');
    const screen = resultScreen(final, { onRetry: retry, onMainMenu: mainMenu });
    result = { screen, inerted };
    screen.mount(m.el);
  }

  /** replay-flow Req 2.1–2.5: close the ending and dial again at once. */
  function retry(): void {
    if (!result) return;
    closeResult(); // unmounts the overlay, stops its sounds, wakes the desktop
    openApp('dialer'); // the "Connect To" window, focused
    startSession(); // same path as Connect: fresh seed, Lane_Dock, current View_Prefs
  }

  /** replay-flow Req 3.1: close the ending and go back to the Title_Scene. */
  function mainMenu(): void {
    if (!result) return;
    closeResult();
    // The director may unmount this scene synchronously, so nothing runs after this call.
    signal('mainMenu');
  }

  /** Req 11.2, 11.3: unmount the Result_Screen (stops its sounds) and wake the desktop. */
  function closeResult(): void {
    const r = result;
    if (!r) return;
    result = null;
    r.screen.unmount();
    for (const child of r.inerted) child.removeAttribute('inert');
  }

  return {
    mount(root) {
      if (m) return;
      const icons = createIconGrid({ icons: DESKTOP_ICONS, onOpen: openApp });
      const wallpaper = h('div', {
        className: 'wallpaper',
        on: { click: () => icons.clearSelection() }, // Req 5.6
      });
      // player-guide Req 1.1-1.3: the note lives in the wallpaper, below every window.
      wallpaper.appendChild(createMissionNote());
      const windows = createWindowManager({
        toScreenPoint: (x, y) => monitor.toScreenPoint(x, y),
        area: desktopArea(false),
      });
      const laneDock = h('div', { className: 'lane-dock' });
      // browser-front Req 12.1: Ads float over the Desktop_Area and the Lane_Dock, below the Result_Screen.
      const overlay = h('div', { className: 'session-overlay' });
      // The taskbar's Start button anchors the menu, and the menu sets the button's pressed look.
      let startMenu: StartMenu | null = null;
      const taskbar = createTaskbar({ windows, audio, onStart: () => startMenu?.toggle() });
      const menu = createStartMenu({
        anchor: taskbar.startButton,
        onChoose,
        onOpenChange: (open) => taskbar.setStartPressed(open),
      });
      startMenu = menu;
      const dialer = createDialerApp({ windows, audio, onConnect: startSession });

      const el = h('div', { className: 'scene scene-desktop' }, wallpaper);
      icons.mount(el);
      windows.mount(el);
      el.appendChild(laneDock);
      taskbar.mount(el);
      menu.mount(el);

      m = { el, laneDock, overlay, icons, windows, taskbar, startMenu: menu, dialer };
      root.appendChild(el);
      chime = audio.play(startupChime, BOOT_SOUND_SEC.startupChime); // Req 5.1
    },
    unmount() {
      if (!m) return;
      closeResult(); // title-and-endings Req 11.4
      endSession(); // Req 10.7
      const { el, icons, windows, taskbar, startMenu, dialer } = m;
      m = null;
      dialer.unmount();
      startMenu.unmount();
      taskbar.unmount();
      windows.unmount();
      icons.unmount();
      chime?.stop();
      chime = null;
      el.remove();
    },
  };
}
