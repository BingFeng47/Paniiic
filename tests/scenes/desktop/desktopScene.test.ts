// Integration tests for the Desktop_Scene: apps, Start_Menu, and a Session driven by a manual
// loop with fake audio, seed 1 and the default balance (Req 5.1, 5.7, 5.8, 8.3, 8.5, 9.2, 10.6,
// 10.7, 10.10, 10.11, 10.13, 11.1, 11.4, 14.2).
import fc from 'fast-check';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { AudioEngine } from '../../../src/core/audio';
import type { SceneSignal, Scene } from '../../../src/core/scene';
import { DESKTOP_COPY } from '../../../src/desktop/copy';
import { GUIDE_COPY } from '../../../src/ui/guideCopy';
import { DIALER_COPY } from '../../../src/dialup/dialScript';
import {
  DEFAULT_VIEW_PREFS,
  type SessionContext,
  type SessionView,
  type ViewPrefs,
} from '../../../src/dialup/session';
import type { System } from '../../../src/game/context';
import type { GameEvent, GameState } from '../../../src/game/types';
import { createDesktopScene } from '../../../src/scenes/desktop/desktopScene';
import { createResultScreen, type ResultActions } from '../../../src/ui/resultScreen';
import { createFakeAudioEngine, type FakeAudioEngine } from '../../helpers/audio';
import { fakeMonitor, trackListeners, type ListenerTracker } from '../../helpers/dom';
import { scheduledDamage } from '../../helpers/game';
import { createManualLoop, type ManualLoop } from '../../helpers/loop';

/** The real loop never hands over more than 15 ticks per frame; deliver ticks the same way. */
const MAX_FRAME_TICKS = 15;

interface LaneRecord {
  readonly contexts: SessionContext[];
  readonly states: GameState[];
  readonly events: GameEvent[];
  unmounts: number;
}

interface Harness {
  readonly scene: Scene;
  readonly root: HTMLElement;
  readonly audio: FakeAudioEngine;
  readonly loop: ManualLoop;
  /** Drives the Result_Screen only, so `loop` keeps counting Session loops alone. */
  readonly resultLoop: ManualLoop;
  readonly signals: SceneSignal[];
  readonly lane: LaneRecord;
  /** Run `n` ticks in frames of at most 15. */
  deliver(n: number): void;
}

let doc: ListenerTracker;
let win: ListenerTracker;
let mounted: Scene[] = [];

beforeEach(() => {
  document.body.replaceChildren();
  doc = trackListeners(document);
  win = trackListeners(window);
  mounted = [];
});

afterEach(() => {
  for (const scene of mounted) scene.unmount();
  doc.restore();
  win.restore();
  document.body.replaceChildren();
});

interface SetupOptions {
  /** Passed to the Desktop_Scene as its `viewPrefs` dep; omitted when absent. */
  readonly viewPrefs?: () => ViewPrefs;
  /**
   * Omit the `resultScreen` dep, so the Desktop_Scene builds the real Result_Screen itself on its
   * own `startLoop` (`loop`), as it ships (title-and-endings D12). `resultLoop` then stays unused.
   */
  readonly defaultResultScreen?: boolean;
  /** Seed source for each Session; defaults to `() => 1`. */
  readonly seedSource?: () => number;
  /** Extra registry views, after the lane recorder. */
  readonly extraViews?: readonly (() => SessionView)[];
}

function setup(systems: readonly System[] = [], monitorScale = 1, options: SetupOptions = {}): Harness {
  const audio = createFakeAudioEngine();
  const loop = createManualLoop();
  const resultLoop = createManualLoop();
  const signals: SceneSignal[] = [];
  const lane: LaneRecord = { contexts: [], states: [], events: [], unmounts: 0 };
  const laneView = (): SessionView => ({
    mount: (ctx) => {
      lane.contexts.push(ctx);
    },
    update: (state, events) => {
      lane.states.push(state);
      lane.events.push(...events);
    },
    unmount: () => {
      lane.unmounts += 1;
    },
  });
  const scene = createDesktopScene({
    monitor: fakeMonitor(monitorScale),
    audio: audio as unknown as AudioEngine,
    signal: (s) => signals.push(s),
    startLoop: loop.start,
    seedSource: options.seedSource ?? (() => 1),
    registry: { views: [laneView, ...(options.extraViews ?? [])], systems },
    ...(options.defaultResultScreen
      ? {}
      : {
          resultScreen: (final: GameState, actions: ResultActions) =>
            createResultScreen({ final, audio, startLoop: resultLoop.start, ...actions }),
        }),
    ...(options.viewPrefs === undefined ? {} : { viewPrefs: options.viewPrefs }),
  });
  scene.mount(document.body);
  mounted.push(scene);
  const root = document.querySelector<HTMLElement>('.scene.scene-desktop')!;
  const deliver = (n: number): void => {
    for (let left = n; left > 0; left -= MAX_FRAME_TICKS) loop.frame(Math.min(MAX_FRAME_TICKS, left));
  };
  return { scene, root, audio, loop, resultLoop, signals, lane, deliver };
}

/* ---- DOM helpers ------------------------------------------------------------------------------ */

const q = <T extends HTMLElement = HTMLElement>(root: ParentNode, selector: string): T => {
  const el = root.querySelector<T>(selector);
  if (!el) throw new Error(`no element matches ${selector}`);
  return el;
};
const icon = (root: HTMLElement, app: string) => q(root, `.desktop-icon[data-app="${app}"]`);
const dblclick = (el: HTMLElement) => el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
const windowEl = (root: HTMLElement, id: string) => root.querySelector<HTMLElement>(`.window[data-window-id="${id}"]`);
const windowTitle = (root: HTMLElement, id: string) => windowEl(root, id)?.querySelector('.title-bar-text')?.textContent;
const startButton = (root: HTMLElement) => q(root, '.start-button');
const menuItem = (root: HTMLElement, id: string) => q(root, `.start-menu [data-item-id="${id}"]`);
const chooseFromStart = (root: HTMLElement, id: string) => {
  startButton(root).click();
  menuItem(root, id).click();
};
const connectButton = (root: HTMLElement) => q<HTMLButtonElement>(root, '.dialer-form .btn-default');
const dialerStatus = (root: HTMLElement) => root.querySelector('.dialer-status')?.textContent;
const trayLamp = (root: HTMLElement) => q(root, '.tray-modem').dataset.state;
const laneDock = (root: HTMLElement) => q(root, '.lane-dock');

function pointer(el: EventTarget, type: string, x: number, y: number): void {
  el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 }));
}

/** Drag a window by its title bar by (dx, dy) Screen px (the fake monitor has scale 1). */
function dragBy(root: HTMLElement, id: string, dx: number, dy: number): void {
  const bar = q(windowEl(root, id)!, '.title-bar');
  pointer(bar, 'pointerdown', 200, 10);
  pointer(bar, 'pointermove', 200 + dx, 10 + dy);
  pointer(bar, 'pointerup', 200 + dx, 10 + dy);
}

const top = (root: HTMLElement, id: string) => windowEl(root, id)!.style.top;

/**
 * Close the Result_Screen as the player does: wait for the lose reveal (90 ticks = 1,500 ms),
 * then click Retry, which dials again at once (replay-flow Req 2.1).
 */
function retryResult(root: HTMLElement, resultLoop: ManualLoop): void {
  resultLoop.frame(90);
  q<HTMLButtonElement>(root, '.result-screen .result-retry').click();
}

/** Same, but click Main menu (replay-flow Req 3.1). */
function mainMenuResult(root: HTMLElement, resultLoop: ManualLoop): void {
  resultLoop.frame(90);
  q<HTMLButtonElement>(root, '.result-screen .result-main-menu').click();
}

/** Dialer icon → Connect, as the player does it. */
function connectFromIcon(root: HTMLElement): void {
  dblclick(icon(root, 'dialer'));
  connectButton(root).click();
}

// Vitest stubs CSS imports, so desktop.css is read from disk (repo has no @types/node).
let DESKTOP_CSS = '';
beforeAll(async () => {
  const fs = (await import('node:fs' as string)) as { readFileSync(p: string, e: 'utf8'): string };
  DESKTOP_CSS = fs.readFileSync('src/styles/desktop.css', 'utf8');
});
/* ---- Tests ------------------------------------------------------------------------------------ */

describe('desktop scene: idle desktop', () => {
  it('builds the desktop in order and plays the startup chime (Req 5.1)', () => {
    const { root, audio } = setup();
    expect([...root.children].map((c) => c.className)).toEqual([
      'wallpaper', 'icon-grid', 'window-layer', 'lane-dock', 'taskbar', 'start-menu',
    ]);
    expect([...root.querySelectorAll('.desktop-icon-label')].map((l) => l.textContent)).toEqual(
      DESKTOP_COPY.icons.map((i) => i.label),
    );
    expect(audio.played()).toEqual(['startupChime']);
    expect(root.classList.contains('is-session')).toBe(false);
  });

  it('shows the Mission_Note inside the wallpaper, below the window layer (player-guide Req 1.1, 1.3)', () => {
    const { root } = setup();
    const note = root.querySelector('.wallpaper > .mission-note');
    expect(note?.textContent).toBe(
      "Get online. Download HOMEWORK.ZIP before midnight. Don't let anything eat the modem.",
    );
    expect(root.querySelector('.window-layer .mission-note')).toBeNull();
  });

  it('shows the GUIDE_COPY mission text and stays out of the window layer and icon grid (player-guide Req 1.1, 1.3)', () => {
    const { root } = setup();
    const notes = root.querySelectorAll('.mission-note');
    expect(notes.length).toBe(1);
    expect(notes[0]!.querySelector('.mission-note-text')?.textContent).toBe(GUIDE_COPY.missionNote);
    // The wallpaper comes before the window layer, so every window paints above the note.
    const children = [...root.children];
    expect(children.indexOf(q(root, '.wallpaper'))).toBeLessThan(children.indexOf(q(root, '.window-layer')));
    expect(root.querySelector('.icon-grid .mission-note')).toBeNull();
  });
  it('keeps the Mission_Note on the wallpaper after a window opens (player-guide Req 1.3)', () => {
    const { root } = setup();
    dblclick(icon(root, 'readme'));
    expect(root.querySelector('.wallpaper > .mission-note')).not.toBeNull();
    expect(root.querySelector('.window-layer .mission-note')).toBeNull();
  });
  it('styles the Mission_Note top-right and ignores pointer input (player-guide Req 1.2, 1.3)', () => {
    const rule = /\.mission-note\s*\{([^}]*)\}/.exec(DESKTOP_CSS)?.[1] ?? '';
    expect(rule).toMatch(/pointer-events:\s*none/);
    expect(rule).toMatch(/position:\s*absolute/);
    const left = Number(/left:\s*(\d+)px/.exec(rule)?.[1]);
    const top = Number(/top:\s*(\d+)px/.exec(rule)?.[1]);
    const width = Number(/width:\s*(\d+)px/.exec(rule)?.[1]);
    // Right half of the 1024 px desktop, near the top, clear of the left-hand icon column.
    expect(left).toBeGreaterThanOrEqual(512);
    expect(left + width).toBeLessThanOrEqual(1024);
    expect(top).toBeLessThan(100);
  });
  it('README.TXT states the objective and the three controls (player-guide Req 1.4)', () => {
    const { root } = setup();
    dblclick(icon(root, 'readme'));
    const text = q(windowEl(root, 'readme')!, 'pre.text-doc').textContent ?? '';
    expect(text).toContain('download HOMEWORK.ZIP before midnight');
    expect(text).toContain("Don't let anything eat the modem.");
    expect(text).toContain('Click zombies on the phone line to smash them.');
    expect(text).toContain('Close pop-ups to keep the page clear.');
    expect(text).toContain('Click the small grey link to start the download.');
  });
  it('selects one icon on click and clears the selection on a wallpaper click (Req 5.3, 5.6)', () => {
    const { root } = setup();
    icon(root, 'readme').click();
    icon(root, 'wastebasket').click();
    expect([...root.querySelectorAll('.desktop-icon.is-selected')]).toEqual([icon(root, 'wastebasket')]);
    q(root, '.wallpaper').click();
    expect(root.querySelector('.desktop-icon.is-selected')).toBeNull();
  });

  it('opens README from its icon and focuses it on a second open (Req 5.7, 5.9)', () => {
    const { root } = setup();
    dblclick(icon(root, 'readme'));
    dblclick(icon(root, 'readme'));
    expect(root.querySelectorAll('.window').length).toBe(1);
    expect(windowTitle(root, 'readme')).toBe('README.TXT - Jotter');
    expect(q(windowEl(root, 'readme')!, 'pre.text-doc').textContent).toBe(DESKTOP_COPY.readme);
  });

  it('opens the Wastebasket from its icon with the files and "4 object(s)" (Req 5.8)', () => {
    const { root } = setup();
    dblclick(icon(root, 'wastebasket'));
    const w = windowEl(root, 'wastebasket')!;
    expect(windowTitle(root, 'wastebasket')).toBe('Wastebasket');
    expect([...w.querySelectorAll('.file-name')].map((f) => f.textContent)).toEqual(
      DESKTOP_COPY.wastebasket.files,
    );
    expect(q(w, '.status-bar-field').textContent).toBe('4 object(s)');
  });

  it('opens README and the Wastebasket from the Start_Menu and closes the menu (Req 8.3)', () => {
    const { root } = setup();
    const menu = q(root, '.start-menu');
    startButton(root).click();
    expect(menu.hidden).toBe(false);
    expect(startButton(root).classList.contains('is-pressed')).toBe(true);
    menuItem(root, 'readme').click();
    expect(menu.hidden).toBe(true);
    expect(startButton(root).classList.contains('is-pressed')).toBe(false);
    chooseFromStart(root, 'wastebasket');
    expect(windowTitle(root, 'readme')).toBe('README.TXT - Jotter');
    expect(windowTitle(root, 'wastebasket')).toBe('Wastebasket');
    expect(q(windowEl(root, 'wastebasket')!, '.status-bar-field').textContent).toBe('4 object(s)');
    // Reopening from the menu focuses the existing window.
    chooseFromStart(root, 'readme');
    expect(root.querySelectorAll('.window').length).toBe(2);
    expect(windowEl(root, 'readme')!.classList.contains('is-active')).toBe(true);
  });

  it('signals shutDown when "Shut Down..." is chosen while idle (Req 1.4)', () => {
    const { root, signals } = setup();
    chooseFromStart(root, 'shutDown');
    expect(signals).toEqual(['shutDown']);
  });
});

describe('desktop scene: Session', () => {
  it('starts a Session from the dialer icon and Connect (Req 9.2, 10.10, 8.5)', () => {
    const { root, loop, lane, signals } = setup();
    connectFromIcon(root);

    expect(loop.startCount()).toBe(1);
    expect(loop.isRunning()).toBe(true);
    expect(root.classList.contains('is-session')).toBe(true);
    expect(laneDock(root).hidden).toBe(false);
    expect(lane.contexts.map((c) => c.laneHost)).toEqual([laneDock(root)]);
    // Seed 1 from the seed source reaches the Run.
    expect(lane.states[0]?.seed).toBe(1);
    expect(lane.states[0]?.phase).toBe('dialing');

    // "Shut Down..." is disabled and choosing it does nothing.
    const shutDown = menuItem(root, 'shutDown');
    expect(shutDown.getAttribute('aria-disabled')).toBe('true');
    startButton(root).click();
    shutDown.click();
    expect(signals).toEqual([]);
  });

  it('follows the dial stages and connects at 1,200 ticks (Req 11.1, 11.4, 7.6, 7.7)', () => {
    const { root, lane, deliver } = setup();
    connectFromIcon(root);
    expect(trayLamp(root)).toBe('blink');

    deliver(300);
    expect(lane.states.at(-1)?.tick).toBe(300);
    expect(dialerStatus(root)).toBe('Negotiating with the remote computer...');
    expect(trayLamp(root)).toBe('blink');

    deliver(900);
    expect(lane.states.at(-1)?.tick).toBe(1200);
    expect(dialerStatus(root)).toBe('Connected at 28,800 bps.');
    expect(windowTitle(root, 'dialer')).toBe(DIALER_COPY.titles.connected);
    expect(trayLamp(root)).toBe('on');
    expect(lane.events.filter((e) => e.type === 'connected')).toHaveLength(1);
  });

  it("gives views the Monitor's toScreenPoint (Req 9.6)", () => {
    const { root, lane } = setup([], 2);
    connectFromIcon(root);
    const ctx = lane.contexts[0]!;
    const monitor = fakeMonitor(2);
    for (const [x, y] of [[0, 0], [200, 100], [1024, 768], [37, 513]] as const) {
      expect(ctx.toScreenPoint(x, y)).toEqual(monitor.toScreenPoint(x, y));
    }
    expect(ctx.toScreenPoint(200, 100)).toEqual({ x: 100, y: 50 });
  });

  it('starts only one Session however often the Connect path runs (Req 10.13)', () => {
    const { root, loop, lane, deliver } = setup();
    dblclick(icon(root, 'dialer'));
    const connect = connectButton(root);
    connect.click();
    connect.click();
    deliver(30);
    // Again through the Start_Menu: the dialer window is focused and shows the progress view.
    chooseFromStart(root, 'dialer');
    expect(root.querySelector('.dialer-form')).toBeNull();
    connect.click();
    expect(loop.startCount()).toBe(1);
    expect(lane.contexts).toHaveLength(1);
    expect(root.querySelectorAll('.window[data-window-id="dialer"]').length).toBe(1);
  });

  it('shrinks the window area during a Session and grows it back after (Req 10.10, 6.8)', () => {
    const { root, deliver } = setup([scheduledDamage([{ tick: 600, amount: 100 }])]);
    dblclick(icon(root, 'readme'));
    dragBy(root, 'readme', 0, 700 - 32); // cascade slot 0 is y = 32
    expect(top(root, 'readme')).toBe('700px');

    connectFromIcon(root);
    // 768 − 28 − 260 = 480 px of Desktop_Area; the title bar must fit: y ≤ 460.
    expect(top(root, 'readme')).toBe('460px');
    dragBy(root, 'readme', 0, 200);
    expect(top(root, 'readme')).toBe('460px');

    deliver(600); // damage at tick 600 → lost → Session ends
    deliver(30); // juice-and-endings End_Transition
    expect(root.classList.contains('is-session')).toBe(false);
    dragBy(root, 'readme', 0, 240);
    expect(top(root, 'readme')).toBe('700px');
  });

  it('ends the Session when a registry system deals 100 damage at tick 5 (Req 10.6, 10.7, 10.11)', () => {
    const { root, loop, resultLoop, lane, signals, deliver } = setup([scheduledDamage([{ tick: 5, amount: 100 }])]);
    connectFromIcon(root);
    deliver(MAX_FRAME_TICKS);
    deliver(30); // juice-and-endings End_Transition

    expect(lane.states.at(-1)?.phase).toBe('lost');
    expect(lane.states.at(-1)?.tick).toBe(5);
    expect(loop.isRunning()).toBe(false);
    expect(lane.unmounts).toBe(1);
    expect(root.classList.contains('is-session')).toBe(false);
    expect(trayLamp(root)).toBe('off');
    // The Dialer is back on its form.
    expect(windowTitle(root, 'dialer')).toBe(DIALER_COPY.titles.form);
    expect(root.querySelector('.dialer-form')).not.toBeNull();
    expect(root.querySelector('.dialer-progress')).toBeNull();

    // No further ticks run.
    const seen = lane.states.length;
    deliver(30);
    expect(lane.states.length).toBe(seen);

    // "Shut Down..." is enabled again once the Session ended.
    const shutDown = menuItem(root, 'shutDown');
    expect(shutDown.hasAttribute('aria-disabled')).toBe(false);

    // Retry starts the next Session, which disables "Shut Down..." again.
    retryResult(root, resultLoop);
    expect(loop.startCount()).toBe(2);
    expect(root.classList.contains('is-session')).toBe(true);
    expect(shutDown.getAttribute('aria-disabled')).toBe('true');
    chooseFromStart(root, 'shutDown');
    expect(signals).toEqual([]);
  });

  it('can start a new Session after one ends', () => {
    const { root, loop, resultLoop, lane, deliver } = setup([scheduledDamage([{ tick: 5, amount: 100 }])]);
    connectFromIcon(root);
    deliver(MAX_FRAME_TICKS);
    deliver(30); // juice-and-endings End_Transition
    expect(loop.isRunning()).toBe(false);
    retryResult(root, resultLoop);
    expect(loop.startCount()).toBe(2);
    expect(loop.isRunning()).toBe(true);
    expect(lane.contexts).toHaveLength(2);
    expect(root.classList.contains('is-session')).toBe(true);
  });

  it('unmount mid-Session stops the loop and leaves no listeners (Req 10.7, 14.2)', () => {
    const { scene, root, audio, loop, lane, deliver } = setup();
    dblclick(icon(root, 'readme'));
    connectFromIcon(root);
    deliver(300);
    expect(audio.activeVoices().length).toBeGreaterThan(0); // the handshake is playing
    startButton(root).click(); // the open menu holds document listeners

    scene.unmount();
    expect(loop.isRunning()).toBe(false);
    expect(lane.unmounts).toBe(1);
    expect(document.querySelector('.scene-desktop')).toBeNull();
    expect(audio.activeVoices()).toEqual([]);
    expect(doc.attached()).toEqual([]);
    expect(win.attached()).toEqual([]);

    // Further frames change nothing.
    const seen = lane.states.length;
    deliver(30);
    expect(lane.states.length).toBe(seen);
  });
});

describe('desktop scene: View_Prefs (title-and-endings Req 7.1)', () => {
  it('gives registry views ctx.prefs from viewPrefs, read once per Session start', () => {
    const shakeOff: ViewPrefs = { screenShake: false };
    const shakeOn: ViewPrefs = { screenShake: true };
    let current = shakeOff;
    let reads = 0;
    const viewPrefs = (): ViewPrefs => {
      reads += 1;
      return current;
    };
    const { root, resultLoop, lane, deliver } = setup([scheduledDamage([{ tick: 30, amount: 100 }])], 1, { viewPrefs });
    expect(reads).toBe(0);

    connectFromIcon(root);
    expect(lane.contexts[0]?.prefs).toBe(shakeOff);
    deliver(15);
    expect(reads).toBe(1);

    // The setting changes between Sessions: the next Session gets the new value.
    current = shakeOn;
    deliver(15); // damage at tick 30 → lost → Session ends
    deliver(30); // juice-and-endings End_Transition
    expect(root.classList.contains('is-session')).toBe(false);
    retryResult(root, resultLoop);
    expect(lane.contexts[1]?.prefs).toBe(shakeOn);
    expect(reads).toBe(2);
  });

  it('gives registry views DEFAULT_VIEW_PREFS without viewPrefs', () => {
    const { root, lane } = setup();
    connectFromIcon(root);
    expect(lane.contexts[0]?.prefs).toBe(DEFAULT_VIEW_PREFS);
    expect(DEFAULT_VIEW_PREFS).toEqual({ screenShake: true, hintsEnabled: true });
  });
});

describe('desktop scene: Result_Screen (title-and-endings Req 8.1, 8.3, 8.4, 11.2–11.4)', () => {
  const resultScreenEl = (root: HTMLElement) => root.querySelector<HTMLElement>('.result-screen');
  const inertChildren = (root: HTMLElement) =>
    [...root.children].filter((c) => c.hasAttribute('inert')).map((c) => c.className);
  const RESULT_SOUND_NAMES = ['modemScreech', 'staticHiss'];
  const activeResultSounds = (audio: FakeAudioEngine) =>
    audio.activeVoices().map((v) => v.name).filter((name) => RESULT_SOUND_NAMES.includes(name));

  it('shows the lose screen over an inert desktop and blocks Connect and "Shut Down..." until Back', () => {
    const { root, audio, loop, resultLoop, lane, signals, deliver } = setup([
      scheduledDamage([{ tick: 5, amount: 100 }]),
    ]);
    connectFromIcon(root);
    // The Start_Menu is open when the Run ends.
    startButton(root).click();
    expect(q(root, '.start-menu').hidden).toBe(false);
    deliver(MAX_FRAME_TICKS);
    deliver(30); // juice-and-endings End_Transition
    expect(lane.states.at(-1)?.phase).toBe('lost');

    // Req 8.1: Session ended, Lane_Dock hidden, the overlay is the last child of the scene root.
    expect(root.classList.contains('is-session')).toBe(false);
    expect(loop.isRunning()).toBe(false);
    const overlay = resultScreenEl(root)!;
    expect(overlay).not.toBeNull();
    expect(overlay.classList.contains('is-lost')).toBe(true);
    expect(root.lastElementChild).toBe(overlay);
    expect(resultLoop.startCount()).toBe(1);
    expect(resultLoop.isRunning()).toBe(true);
    expect(activeResultSounds(audio)).toEqual(RESULT_SOUND_NAMES);

    // Req 8.3 (D13): every other child is inert, the overlay is not, the Start_Menu is closed.
    expect(inertChildren(root)).toEqual([
      'wallpaper', 'icon-grid', 'window-layer', 'lane-dock', 'taskbar', 'start-menu',
    ]);
    expect(overlay.hasAttribute('inert')).toBe(false);
    expect(q(root, '.start-menu').hidden).toBe(true);
    expect(startButton(root).classList.contains('is-pressed')).toBe(false);

    // Req 8.4: Connect starts no Session while the overlay is shown.
    connectButton(root).click();
    expect(loop.startCount()).toBe(1);
    expect(lane.contexts).toHaveLength(1);
    expect(root.classList.contains('is-session')).toBe(false);

    // "Shut Down..." signals nothing while the overlay is shown.
    chooseFromStart(root, 'shutDown');
    expect(signals).toEqual([]);
    expect(resultScreenEl(root)).toBe(overlay);

    // Retry removes the overlay, its sounds and every inert attribute.
    retryResult(root, resultLoop);
    expect(resultScreenEl(root)).toBeNull();
    expect(inertChildren(root)).toEqual([]);
    expect(resultLoop.isRunning()).toBe(false);
    expect(activeResultSounds(audio)).toEqual([]);

    // Retry dialed again.
    expect(loop.startCount()).toBe(2);
    expect(loop.isRunning()).toBe(true);
    expect(lane.contexts).toHaveLength(2);
    expect(root.classList.contains('is-session')).toBe(true);
  });

  it('unmount while the Result_Screen is shown stops its loop and sounds (Req 11.4)', () => {
    const { scene, root, audio, resultLoop, deliver } = setup([scheduledDamage([{ tick: 5, amount: 100 }])]);
    connectFromIcon(root);
    deliver(MAX_FRAME_TICKS);
    deliver(30); // juice-and-endings End_Transition
    expect(resultScreenEl(root)).not.toBeNull();
    expect(resultLoop.isRunning()).toBe(true);
    expect(activeResultSounds(audio)).toEqual(RESULT_SOUND_NAMES);

    scene.unmount();
    expect(resultLoop.isRunning()).toBe(false);
    expect(audio.activeVoices()).toEqual([]);
    expect(document.querySelector('.result-screen')).toBeNull();
    expect(document.querySelector('.scene-desktop')).toBeNull();
    expect(doc.attached()).toEqual([]);
    expect(win.attached()).toEqual([]);

    // Later frames reveal nothing.
    resultLoop.frame(90);
    expect(document.querySelector('.result-retry')).toBeNull();
  });

  it('shows the real Result_Screen on its own startLoop without a resultScreen dep (D12)', () => {
    const { root, audio, loop, resultLoop, lane, signals, deliver } = setup(
      [scheduledDamage([{ tick: 5, amount: 100 }])],
      1,
      { defaultResultScreen: true },
    );
    connectFromIcon(root);
    deliver(MAX_FRAME_TICKS);
    deliver(30); // juice-and-endings End_Transition
    expect(lane.states.at(-1)?.phase).toBe('lost');

    const overlay = q(root, '.result-screen.is-lost');
    expect(root.lastElementChild).toBe(overlay);
    // The Session's loop and then the Result_Screen's loop, both on the desktop's startLoop.
    expect(loop.startCount()).toBe(2);
    expect(loop.isRunning()).toBe(true);
    expect(resultLoop.startCount()).toBe(0);
    expect(activeResultSounds(audio)).toEqual(RESULT_SOUND_NAMES);

    // The lose reveal comes at 90 ticks, not 89.
    deliver(89);
    expect(root.querySelector('.result-retry')).toBeNull();
    loop.frame(1);
    const retry = q<HTMLButtonElement>(root, '.result-screen .result-retry');
    expect(document.activeElement).toBe(retry);
    expect(loop.isRunning()).toBe(false);

    retry.click();
    // No overlay, no inert, result sounds gone, no signal; Retry started the next Session.
    expect(root.querySelector('.result-screen')).toBeNull();
    expect(inertChildren(root)).toEqual([]);
    expect(activeResultSounds(audio)).toEqual([]);
    expect(signals).toEqual([]);
    expect(loop.startCount()).toBe(3);
    expect(lane.contexts).toHaveLength(2);
    expect(root.classList.contains('is-session')).toBe(true);
  });
});

describe('desktop scene: Retry and Main menu (replay-flow Req 2, 3, 4)', () => {
  const RESULT_SOUND_NAMES = ['modemScreech', 'staticHiss'];
  const activeResultSounds = (audio: FakeAudioEngine) =>
    audio.activeVoices().map((v) => v.name).filter((name) => RESULT_SOUND_NAMES.includes(name));

  /** A test-only Session_View that opens a Session_Window on mount and closes it on unmount (Req 4.1). */
  function windowView(record: { opens: number }): () => SessionView {
    return () => {
      let ctx: SessionContext | null = null;
      return {
        mount: (c) => {
          ctx = c;
          record.opens += 1;
          c.windows.open({
            id: 'test-ad',
            title: 'Test ad',
            icon: 'text',
            content: document.createElement('div'),
            size: { w: 200, h: 100 },
          });
        },
        update: () => {},
        unmount: () => {
          ctx?.windows.close('test-ad');
          ctx = null;
        },
      };
    };
  }

  it('Retry closes the overlay, stops its voices and starts a Session like Connect (Req 2.1–2.5, 4.1)', () => {
    const seeds = [11, 22];
    let next = 0;
    const prefsA: ViewPrefs = { screenShake: true };
    const prefsB: ViewPrefs = { screenShake: false };
    let prefs = prefsA;
    const opened = { opens: 0 };
    const { root, audio, loop, resultLoop, lane, signals, deliver } = setup(
      [scheduledDamage([{ tick: 5, amount: 100 }])],
      1,
      { seedSource: () => seeds[next++]!, viewPrefs: () => prefs, extraViews: [windowView(opened)] },
    );
    connectFromIcon(root);
    expect(windowEl(root, 'test-ad')).not.toBeNull();
    deliver(MAX_FRAME_TICKS);
    deliver(30); // juice-and-endings End_Transition
    expect(root.querySelector('.result-screen')).not.toBeNull();
    // Req 2.4: the previous Session's window closed when it ended.
    expect(windowEl(root, 'test-ad')).toBeNull();
    expect(activeResultSounds(audio)).toEqual(RESULT_SOUND_NAMES);

    prefs = prefsB;
    const statesBefore = lane.states.length;
    retryResult(root, resultLoop);
    expect(root.querySelector('.result-screen')).toBeNull();
    expect(resultLoop.isRunning()).toBe(false);
    expect(activeResultSounds(audio)).toEqual([]);
    // Req 2.3: Dialer in progress view, Lane_Dock shown.
    expect(windowEl(root, 'dialer')).not.toBeNull();
    expect(root.querySelector('.dialer-progress')).not.toBeNull();
    expect(root.querySelector('.dialer-form')).toBeNull();
    expect(root.classList.contains('is-session')).toBe(true);
    // Req 2.1, 2.2, 2.5.
    expect(loop.startCount()).toBe(2);
    expect(loop.isRunning()).toBe(true);
    expect(lane.contexts).toHaveLength(2);
    expect(lane.contexts[1]?.prefs).toBe(prefsB);
    expect(opened.opens).toBe(2);
    expect(root.querySelectorAll('.window[data-window-id="test-ad"]').length).toBe(1);
    deliver(1);
    const first = lane.states[statesBefore]!;
    expect(first.seed).toBe(22);
    expect(first.phase).toBe('dialing');
    expect(signals).toEqual([]);
  });

  it('Main menu closes the overlay and sends mainMenu exactly once (Req 3.1)', () => {
    const { root, audio, loop, resultLoop, signals, deliver } = setup([scheduledDamage([{ tick: 5, amount: 100 }])]);
    connectFromIcon(root);
    deliver(MAX_FRAME_TICKS);
    deliver(30); // juice-and-endings End_Transition
    resultLoop.frame(90);
    const mm = q<HTMLButtonElement>(root, '.result-screen .result-main-menu');
    mainMenuResult(root, resultLoop);
    mm.click();
    expect(root.querySelector('.result-screen')).toBeNull();
    expect(activeResultSounds(audio)).toEqual([]);
    expect(signals).toEqual(['mainMenu']);
    expect(loop.startCount()).toBe(1);
  });

  it('both actions do nothing without a Result_Screen', () => {
    let actions: ResultActions | null = null;
    const audio = createFakeAudioEngine();
    const loop = createManualLoop();
    const resultLoop = createManualLoop();
    const signals: SceneSignal[] = [];
    const scene = createDesktopScene({
      monitor: fakeMonitor(1),
      audio: audio as unknown as AudioEngine,
      signal: (s) => signals.push(s),
      startLoop: loop.start,
      seedSource: () => 1,
      registry: { views: [], systems: [scheduledDamage([{ tick: 5, amount: 100 }])] },
      resultScreen: (final, a) => {
        actions = a;
        return createResultScreen({ final, audio, startLoop: resultLoop.start, ...a });
      },
    });
    scene.mount(document.body);
    mounted.push(scene);
    const root = q(document.body, '.scene-desktop');
    connectFromIcon(root);
    for (let i = 0; i < 1; i++) loop.frame(MAX_FRAME_TICKS);
    loop.frame(30); // juice-and-endings End_Transition
    const a = actions!;
    a.onRetry(); // closes the result and starts Session 2
    expect(loop.startCount()).toBe(2);
    a.onRetry();
    a.onMainMenu();
    expect(loop.startCount()).toBe(2);
    expect(signals).toEqual([]);
    expect(root.querySelector('.result-screen')).toBeNull();
  });

  // Property 2: Req 2.1, 2.2, 4.3 Retry never stacks Sessions or Result_Screens
  it('Property 2: Retry never stacks Sessions or Result_Screens', () => {
    /** **Validates: Requirements 2.1, 2.2, 4.3** */
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 5 }), fc.integer({ min: 0, max: 1000 }), (n, base) => {
        let drawn = 0;
        const h = setup([scheduledDamage([{ tick: 5, amount: 100 }])], 1, {
          seedSource: () => base + drawn++,
        });
        let resultMounts = 0;
        let hadResult = false;
        const check = (): void => {
          const live = h.lane.contexts.length - h.lane.unmounts;
          expect(live).toBeGreaterThanOrEqual(0);
          expect(live).toBeLessThanOrEqual(1);
          const shown = h.root.querySelectorAll('.result-screen').length;
          expect(shown).toBeLessThanOrEqual(1);
          if (shown === 1 && !hadResult) resultMounts += 1;
          hadResult = shown === 1;
          if (shown === 1) expect(live).toBe(0);
        };
        const sessionSeeds: number[] = [];
        const recordSeed = (from: number): void => {
          h.deliver(1);
          sessionSeeds.push(h.lane.states[from]!.seed);
        };
        let from = h.lane.states.length;
        connectFromIcon(h.root);
        check();
        recordSeed(from);
        for (let run = 0; run < n; run++) {
          h.deliver(MAX_FRAME_TICKS);
          h.deliver(30); // juice-and-endings End_Transition
          check();
          expect(resultMounts).toBe(run + 1);
          h.resultLoop.frame(90);
          check();
          from = h.lane.states.length;
          q<HTMLButtonElement>(h.root, '.result-screen .result-retry').click();
          check();
          recordSeed(from);
          check();
        }
        expect(resultMounts).toBe(n);
        expect(sessionSeeds).toEqual(Array.from({ length: n + 1 }, (_, i) => base + i));
        expect(drawn).toBe(n + 1);
        h.scene.unmount();
        mounted = mounted.filter((s) => s !== h.scene);
        document.body.replaceChildren();
      }),
      { numRuns: 25 },
    );
  });
});
