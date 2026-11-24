// DOM tests for the taskbar (retro-shell design, "src/desktop/taskbar.ts"; Req 7, 14.2).
// Uses a real Window_Manager and the fake Audio_Engine from tests/helpers/audio.ts.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DESKTOP_COPY } from '../../src/desktop/copy';
import type { Taskbar } from '../../src/desktop/taskbar';
import { createTaskbar } from '../../src/desktop/taskbar';
import type { WindowManager, WindowSpec } from '../../src/desktop/windowManager';
import { createWindowManager } from '../../src/desktop/windowManager';
import type { FakeAudioEngine } from '../helpers/audio';
import { createFakeAudioEngine } from '../helpers/audio';
import type { ListenerTracker } from '../helpers/dom';
import { fakeMonitor, trackListeners } from '../helpers/dom';

const spec = (id: string, extra: Partial<WindowSpec> = {}): WindowSpec => ({
  id,
  title: `Window ${id}`,
  icon: 'text',
  content: document.createElement('div'),
  size: { w: 300, h: 200 },
  ...extra,
});

let root: HTMLDivElement;
let docListeners: ListenerTracker;
let winListeners: ListenerTracker;
let wm: WindowManager;
let audio: FakeAudioEngine;
let starts: number;
/** Subscriptions made on `wm` that have not been unsubscribed. */
let liveSubscriptions: number;
let bar: Taskbar;

const makeBar = (): Taskbar => createTaskbar({ windows: wm, audio, onStart: () => starts++ });

const taskbarEl = () => root.querySelector<HTMLElement>('.taskbar');
const btns = () => [...root.querySelectorAll<HTMLButtonElement>('.taskbar-buttons > .taskbar-button')];
const btn = (id: string): HTMLButtonElement => {
  const el = btns().find((b) => b.dataset.windowId === id);
  if (!el) throw new Error(`no taskbar button for ${id}`);
  return el;
};
const ids = () => btns().map((b) => b.dataset.windowId);
const labels = () => btns().map((b) => b.querySelector('.taskbar-button-label')?.textContent);
const iconOf = (el: Element) => el.querySelector<HTMLElement>('.icon')?.dataset.icon;
const pressedIds = () => btns().filter((b) => b.classList.contains('is-pressed')).map((b) => b.dataset.windowId);
const speaker = () => root.querySelector<HTMLButtonElement>('.tray > button.tray-speaker')!;
const modem = () => root.querySelector<HTMLElement>('.tray > .tray-modem')!;

/** Req 7.4: exactly the Focused_Window's button is pressed, by class and by aria-pressed. */
const expectPressedMatchesFocus = (): void => {
  const { focused } = wm.stack();
  expect(pressedIds()).toEqual(focused === null ? [] : [focused]);
  for (const b of btns()) {
    expect(b.getAttribute('aria-pressed')).toBe(String(b.dataset.windowId === focused));
  }
};

beforeEach(() => {
  docListeners = trackListeners(document);
  winListeners = trackListeners(window);
  root = document.createElement('div');
  document.body.appendChild(root);
  wm = createWindowManager({ toScreenPoint: fakeMonitor(1).toScreenPoint, area: { w: 1024, h: 740 } });
  wm.mount(root);
  liveSubscriptions = 0;
  const subscribe = wm.subscribe.bind(wm);
  vi.spyOn(wm, 'subscribe').mockImplementation((listener) => {
    liveSubscriptions++;
    const off = subscribe(listener);
    let done = false;
    return () => {
      if (!done) liveSubscriptions--;
      done = true;
      off();
    };
  });
  audio = createFakeAudioEngine();
  starts = 0;
  bar = makeBar();
});

afterEach(() => {
  bar.unmount();
  wm.unmount();
  docListeners.restore();
  winListeners.restore();
  root.remove();
  vi.restoreAllMocks();
});

describe('taskbar layout', () => {
  it('shows the Start button, the window buttons and the Tray in that order (Req 7.1)', () => {
    bar.mount(root);
    const children = [...taskbarEl()!.children];
    expect(children.map((c) => c.className)).toEqual(['start-button', 'taskbar-buttons', 'tray']);
    expect(bar.startButton).toBe(children[0]);
    expect(iconOf(bar.startButton)).toBe('start');
    expect(bar.startButton.querySelector('.start-button-label')!.textContent).toBe(DESKTOP_COPY.start);
    expect(btns()).toEqual([]);
  });

  it('shows the clock text "11:59 PM" (Req 7.5)', () => {
    bar.mount(root);
    expect(root.querySelector('.tray > .tray-clock')!.textContent).toBe('11:59 PM');
  });
});

describe('window buttons', () => {
  it('adds one button per open window in open order, with icon and plain-text title (Req 7.1)', () => {
    bar.mount(root);
    wm.open(spec('a', { title: '<i>a</i>' }));
    wm.open(spec('b', { icon: 'dialer' }));
    wm.open(spec('c'));
    expect(ids()).toEqual(['a', 'b', 'c']);
    expect(labels()).toEqual(['<i>a</i>', 'Window b', 'Window c']);
    expect(btn('a').querySelector('.taskbar-button-label')!.children.length).toBe(0);
    expect(btns().map(iconOf)).toEqual(['text', 'dialer', 'text']);
  });

  it('keeps open order when focus changes and drops the button of a closed window (Req 7.1)', () => {
    bar.mount(root);
    for (const id of ['a', 'b', 'c']) wm.open(spec(id));
    wm.focus('a');
    wm.open(spec('b')); // reopening focuses, it does not reorder
    expect(ids()).toEqual(['a', 'b', 'c']);
    wm.close('b');
    expect(ids()).toEqual(['a', 'c']);
  });

  it('shows titles and icons of windows opened before the taskbar mounted (Req 7.1)', () => {
    wm.open(spec('a', { icon: 'wastebasket' }));
    wm.open(spec('b'));
    bar.mount(root);
    expect(ids()).toEqual(['a', 'b']);
    expect(labels()).toEqual(['Window a', 'Window b']);
    expect(btns().map(iconOf)).toEqual(['wastebasket', 'text']);
    expectPressedMatchesFocus();
  });

  it('follows title changes', () => {
    bar.mount(root);
    wm.open(spec('a'));
    wm.open(spec('b'));
    wm.setTitle('a', 'Connecting...');
    expect(labels()).toEqual(['Connecting...', 'Window b']);
  });

  it('presses only the Focused_Window button as focus moves (Req 7.4)', () => {
    bar.mount(root);
    wm.open(spec('a'));
    expectPressedMatchesFocus();
    wm.open(spec('b'));
    expect(pressedIds()).toEqual(['b']);
    expectPressedMatchesFocus();
    wm.focus('a');
    expect(pressedIds()).toEqual(['a']);
    expectPressedMatchesFocus();
    wm.minimize('a');
    expectPressedMatchesFocus();
    wm.close('b');
    expectPressedMatchesFocus();
  });

  it('minimizes the Focused_Window when its button is clicked (Req 7.2)', () => {
    bar.mount(root);
    wm.open(spec('a'));
    wm.open(spec('b'));
    btn('b').click();
    expect(wm.stack().minimized).toEqual(['b']);
    expect(wm.stack().focused).not.toBe('b');
    expect(root.querySelector<HTMLElement>('.window[data-window-id="b"]')!.hidden).toBe(true);
    expect(btn('b').classList.contains('is-pressed')).toBe(false);
    expectPressedMatchesFocus();
  });

  it('restores a minimized window and focuses another one on click (Req 7.3)', () => {
    bar.mount(root);
    wm.open(spec('a'));
    wm.open(spec('b'));
    btn('b').click(); // minimize b
    btn('b').click(); // restore b
    expect(wm.stack().minimized).toEqual([]);
    expect(wm.stack().focused).toBe('b');
    expect(root.querySelector<HTMLElement>('.window[data-window-id="b"]')!.hidden).toBe(false);
    btn('a').click(); // not focused, not minimized: just focus
    expect(wm.stack().focused).toBe('a');
    expect(wm.stack().minimized).toEqual([]);
    expectPressedMatchesFocus();
  });
});

describe('Start button', () => {
  it('calls onStart on click and shows the pressed state from setStartPressed', () => {
    bar.mount(root);
    bar.startButton.click();
    expect(starts).toBe(1);
    expect(bar.startButton.classList.contains('is-pressed')).toBe(false);

    bar.setStartPressed(true);
    expect(bar.startButton.classList.contains('is-pressed')).toBe(true);
    expect(bar.startButton.getAttribute('aria-expanded')).toBe('true');

    bar.setStartPressed(false);
    expect(bar.startButton.classList.contains('is-pressed')).toBe(false);
    expect(bar.startButton.getAttribute('aria-expanded')).toBe('false');
  });
});

describe('Tray', () => {
  it('sets the modem lamp data-state, starting off (Req 7.6, 7.7)', () => {
    bar.mount(root);
    expect(modem().dataset.state).toBe('off');
    bar.setModem('blink');
    expect(modem().dataset.state).toBe('blink');
    bar.setModem('on');
    expect(modem().dataset.state).toBe('on');
    bar.setModem('off');
    expect(modem().dataset.state).toBe('off');
  });

  it('toggles mute and swaps the speaker icon on each click (Req 7.8)', () => {
    bar.mount(root);
    expect(iconOf(speaker())).toBe('speaker');
    expect(speaker().getAttribute('aria-pressed')).toBe('false');

    speaker().click();
    expect(audio.isMuted()).toBe(true);
    expect(iconOf(speaker())).toBe('speakerMuted');
    expect(speaker().getAttribute('aria-pressed')).toBe('true');

    speaker().click();
    expect(audio.isMuted()).toBe(false);
    expect(iconOf(speaker())).toBe('speaker');
    expect(speaker().getAttribute('aria-pressed')).toBe('false');

    expect(audio.log.filter((e) => e.type === 'setMuted')).toEqual([
      { type: 'setMuted', muted: true },
      { type: 'setMuted', muted: false },
    ]);
  });

  it('shows the muted icon at mount when audio is already muted (Req 7.8)', () => {
    audio.setMuted(true);
    bar.mount(root);
    expect(iconOf(speaker())).toBe('speakerMuted');
    expect(speaker().getAttribute('aria-pressed')).toBe('true');
  });
});

describe('unmount', () => {
  it('unsubscribes, removes its element and leaves no document or window listeners (Req 14.2)', () => {
    bar.mount(root);
    expect(liveSubscriptions).toBe(1);
    wm.open(spec('a'));
    const detached = taskbarEl()!;

    bar.unmount();
    expect(liveSubscriptions).toBe(0);
    expect(taskbarEl()).toBeNull();
    wm.open(spec('b'));
    wm.setTitle('a', 'changed');
    expect(detached.querySelectorAll('.taskbar-button')).toHaveLength(0);
    expect(docListeners.count()).toBe(0);
    expect(winListeners.count()).toBe(0);
  });

  it('is safe to call twice and can mount again with the current windows', () => {
    bar.mount(root);
    bar.mount(root); // second mount is a no-op
    expect(liveSubscriptions).toBe(1);
    bar.unmount();
    bar.unmount();
    expect(liveSubscriptions).toBe(0);

    wm.open(spec('a'));
    bar.mount(root);
    expect(liveSubscriptions).toBe(1);
    expect(ids()).toEqual(['a']);
    expect(labels()).toEqual(['Window a']);
  });
});
