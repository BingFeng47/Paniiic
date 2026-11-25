/**
 * Shell wiring: the five scene factories the Scene_Director switches between (Req 1.1–1.5;
 * title-and-endings Req 1.1–1.8).
 *
 * `buildSceneFactories` only builds closures; nothing runs until the director calls a factory.
 * `main.ts` passes the real Monitor, Audio_Engine and Settings_Store; tests pass fakes, a manual
 * loop, a fixed seed and their own registry to run the whole power off → title → boot → desktop
 * → shutdown flow. It never binds the settings to the audio: `main.ts` does that (design D9).
 */
import type { AudioEngine } from '../core/audio';
import { createLeaderboardClient, type LeaderboardClient } from '../core/leaderboard';
import { readLeaderboardConfig } from '../core/leaderboardConfig';
import type { Monitor } from '../core/monitor';
import type { Mountable, Scene, SceneFactories, SignalFn } from '../core/scene';
import { createSettingsStore, type SettingsStore } from '../core/settings';
import { startFixedLoop } from '../core/fixedLoop';
import type { LoopStarter, SessionRegistry } from '../dialup/session';
import { createPowerConfirm } from '../ui/powerConfirm';
import { createBootScene } from './boot/bootScene';
import { createDesktopScene } from './desktop/desktopScene';
import { createPowerOffScene } from './powerOffScene';
import { createShutdownScene } from './shutdown/shutdownScene';
import { createTitleScene } from './title/titleScene';

export interface ShellDeps {
  readonly monitor: Monitor;
  readonly audio: AudioEngine;
  /** Defaults to `startFixedLoop` in each scene. Tests pass a manual loop. */
  readonly startLoop?: LoopStarter;
  /** Seed for each Session's Run. Defaults to the daily seed of the current UTC Day. */
  readonly seedSource?: () => number;
  /** Defaults to `SESSION_REGISTRY`. */
  readonly registry?: SessionRegistry;
  /** Defaults to a memory-only store (storage getter returns null). main.ts passes the real one. */
  readonly settings?: SettingsStore;
  /**
   * The one Leaderboard_Client shared by the Title_Scene's Hall_of_Fame and the Result_Screen's
   * Guestbook_Form. Defaults to `createLeaderboardClient(readLeaderboardConfig())`; with no
   * configuration every call answers `offline`. The client only sends requests when called.
   */
  readonly leaderboard?: LeaderboardClient;
}

/** A store that never touches storage and stays quiet about it (no console warning). */
function memorySettingsStore(): SettingsStore {
  return createSettingsStore({ storage: () => null, warn: () => {} });
}

/** The five scene factories for createSceneDirector. Side-effect free, so tests can use it. */
export function buildSceneFactories(deps: ShellDeps): SceneFactories {
  const { monitor, audio, seedSource, registry } = deps;
  const settings = deps.settings ?? memorySettingsStore();
  const leaderboard = deps.leaderboard ?? createLeaderboardClient(readLeaderboardConfig());
  const baseLoop = deps.startLoop ?? startFixedLoop;
  // While the Power_Confirm dialog is open every scene loop gets no ticks, so the boot, the
  // dial-up and the Run all hold still until the player answers.
  let paused = false;
  const startLoop: LoopStarter = (onTicks) => baseLoop((n) => {
    if (!paused) onTicks(n);
  });
  /** Boot and desktop: the power button asks whether to go back to the title screen. */
  const withPowerMenu = (make: (signal: SignalFn) => Scene) => (signal: SignalFn): Scene => {
    const scene = make(signal);
    let dialog: Mountable | null = null;
    let inerted: Element[] = [];
    const close = (): void => {
      const d = dialog;
      dialog = null;
      d?.unmount();
      for (const el of inerted) el.removeAttribute('inert');
      inerted = [];
      paused = false;
    };
    const open = (): void => {
      if (dialog) return;
      paused = true;
      inerted = [...monitor.screen.children].filter((el) => !el.hasAttribute('inert'));
      for (const el of inerted) el.setAttribute('inert', '');
      dialog = createPowerConfirm({
        onNo: close,
        onYes: () => {
          close();
          // The director may unmount this scene synchronously, so nothing runs after this call.
          signal('mainMenu');
        },
      });
      dialog.mount(monitor.screen);
    };
    return {
      mount(root) {
        scene.mount(root);
        monitor.setPowerHandler(open);
      },
      unmount() {
        monitor.setPowerHandler(null);
        close();
        scene.unmount();
      },
    };
  };
  return {
    powerOff: (signal) => createPowerOffScene({ monitor, audio, signal }),
    title: (signal) => createTitleScene({ audio, settings, signal, startLoop, leaderboard }),
    boot: withPowerMenu((signal) => createBootScene({ monitor, audio, signal, startLoop })),
    desktop: withPowerMenu((signal) =>
      createDesktopScene({
        monitor,
        audio,
        signal,
        startLoop,
        seedSource,
        registry,
        leaderboard, // the same client as the Hall_of_Fame (leaderboard Req 5)
        viewPrefs: () => {
          const s = settings.get();
          return { screenShake: s.screenShake, hintsEnabled: s.hintsEnabled }; // Req 7.1, player-guide 4.6
        },
      }),
    ),
    shutdown: (signal) => createShutdownScene({ signal, startLoop }),
  };
}
