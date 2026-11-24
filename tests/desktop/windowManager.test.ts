// DOM tests for the window manager (retro-shell design, "src/desktop/windowManager.ts").
// jsdom has no PointerEvent, so pointer events are MouseEvents with pointer event names.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Size } from '../../src/desktop/layout';
import type { WindowInfo, WindowManager, WindowSpec } from '../../src/desktop/windowManager';
import { createWindowManager } from '../../src/desktop/windowManager';
import type { WindowStack } from '../../src/desktop/windowStack';
import type { ListenerTracker } from '../helpers/dom';
import { fakeMonitor, trackListeners } from '../helpers/dom';

const AREA: Size = { w: 1024, h: 740 };
const SIZE: Size = { w: 300, h: 200 };

const spec = (id: string, extra: Partial<WindowSpec> = {}): WindowSpec => ({
  id,
  title: `Window ${id}`,
  icon: 'text',
  content: document.createElement('div'),
  size: SIZE,
  ...extra,
});

const fire = (target: EventTarget, type: string, x = 0, y = 0, button = 0): void => {
  target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button }));
};

let root: HTMLDivElement;
let docListeners: ListenerTracker;
let wm: WindowManager;

const winEl = (id: string): HTMLElement => {
  const el = root.querySelector<HTMLElement>(`.window[data-window-id="${id}"]`);
  if (!el) throw new Error(`no window element for ${id}`);
  return el;
};
const part = <T extends HTMLElement>(id: string, selector: string): T => {
  const el = winEl(id).querySelector<T>(selector);
  if (!el) throw new Error(`no ${selector} in window ${id}`);
  return el;
};
const titleBar = (id: string) => part<HTMLDivElement>(id, '.title-bar');
const closeBtn = (id: string) => part<HTMLButtonElement>(id, '.title-bar-close');
const minimizeBtn = (id: string) => part<HTMLButtonElement>(id, '.title-bar-minimize');
const pos = (id: string) => ({ left: winEl(id).style.left, top: winEl(id).style.top });
const activeIds = () =>
  [...root.querySelectorAll<HTMLElement>('.window.is-active')].map((el) => el.dataset.windowId);

/** z-index and `.is-active` agree with the stack (Req 6.1, 6.9). */
const expectDomMatchesStack = (): void => {
  const { order, focused, minimized } = wm.stack();
  const z = order.map((id) => Number(winEl(id).style.zIndex));
  expect(z).toEqual([...z].sort((a, b) => a - b));
  expect(new Set(z).size).toBe(z.length);
  expect(activeIds()).toEqual(focused === null ? [] : [focused]);
  for (const id of order) expect(winEl(id).hidden).toBe(minimized.includes(id));
};

beforeEach(() => {
  docListeners = trackListeners(document);
  root = document.createElement('div');
  document.body.appendChild(root);
  wm = createWindowManager({ toScreenPoint: fakeMonitor(1).toScreenPoint, area: AREA });
  wm.mount(root);
});

afterEach(() => {
  wm.unmount();
  docListeners.restore();
  root.remove();
});

describe('window manager DOM', () => {
  it('builds a window with icon, plain-text title, minimize and close buttons and the content', () => {
    const content = document.createElement('p');
    wm.open(spec('a', { title: '<b>a</b>', content }));

    expect(root.querySelector('.window-layer > .window[data-window-id="a"]')).not.toBeNull();
    expect(part('a', '.title-bar-text').textContent).toBe('<b>a</b>');
    expect(part('a', '.title-bar-text').children.length).toBe(0);
    expect(titleBar('a').firstElementChild).not.toBeNull();
    expect(minimizeBtn('a').getAttribute('aria-label')).toBe('Minimize');
    expect(closeBtn('a').getAttribute('aria-label')).toBe('Close');
    expect(part('a', '.window-body').firstChild).toBe(content);
    expect(winEl('a').style.width).toBe('300px');
    expect(winEl('a').style.height).toBe('200px');
  });

  it('places windows without a position in cascade slots 0, 1, 2 (Req 6.12)', () => {
    wm.open(spec('a'));
    wm.open(spec('b'));
    wm.open(spec('c'));
    wm.open(spec('d', { position: { x: 400, y: 300 } }));
    expect(pos('a')).toEqual({ left: '120px', top: '32px' });
    expect(pos('b')).toEqual({ left: '144px', top: '56px' });
    expect(pos('c')).toEqual({ left: '168px', top: '80px' });
    expect(pos('d')).toEqual({ left: '400px', top: '300px' });
  });

  it('z-index order and .is-active follow the stack (Req 6.1, 6.9)', () => {
    wm.open(spec('a'));
    expectDomMatchesStack();
    wm.open(spec('b'));
    wm.open(spec('c'));
    expect(wm.stack().order).toEqual(['a', 'b', 'c']);
    expect(activeIds()).toEqual(['c']);
    expectDomMatchesStack();

    wm.focus('a');
    expect(wm.stack().order).toEqual(['b', 'c', 'a']);
    expect(Number(winEl('a').style.zIndex)).toBeGreaterThan(Number(winEl('c').style.zIndex));
    expectDomMatchesStack();

    wm.minimize('a');
    expect(activeIds()).toEqual(['c']);
    expectDomMatchesStack();

    wm.close('c');
    expect(activeIds()).toEqual(['b']);
    expectDomMatchesStack();

    wm.minimize('b');
    expect(activeIds()).toEqual([]);
    expectDomMatchesStack();

    wm.taskbarClick('a');
    expect(activeIds()).toEqual(['a']);
    expectDomMatchesStack();
  });

  it('pointerdown anywhere in a window raises and focuses it (Req 6.2)', () => {
    wm.open(spec('a'));
    wm.open(spec('b'));
    wm.open(spec('c'));

    fire(part('a', '.window-body'), 'pointerdown');
    expect(wm.stack().focused).toBe('a');
    expect(wm.stack().order.at(-1)).toBe('a');
    expectDomMatchesStack();

    // Content that stops propagation still focuses its window (capture phase).
    const stubborn = document.createElement('button');
    stubborn.addEventListener('pointerdown', (e) => e.stopPropagation());
    wm.setContent('b', stubborn);
    fire(stubborn, 'pointerdown');
    expect(wm.stack().focused).toBe('b');
    expectDomMatchesStack();

    fire(titleBar('c'), 'pointerdown', 5, 5);
    fire(titleBar('c'), 'pointerup', 5, 5);
    expect(wm.stack().focused).toBe('c');
    expectDomMatchesStack();
  });

  describe('dragging (Req 6.6)', () => {
    beforeEach(() => {
      wm.unmount();
      wm = createWindowManager({ toScreenPoint: fakeMonitor(2).toScreenPoint, area: AREA });
      wm.mount(root);
      wm.open(spec('a')); // slot 0: (120, 32)
    });

    it('moves by half the client delta with a scale-2 toScreenPoint', () => {
      fire(titleBar('a'), 'pointerdown', 10, 10);
      fire(titleBar('a'), 'pointermove', 50, 30);
      expect(pos('a')).toEqual({ left: '140px', top: '42px' });
      fire(titleBar('a'), 'pointermove', 0, 0);
      expect(pos('a')).toEqual({ left: '115px', top: '27px' });
      fire(titleBar('a'), 'pointerup', 0, 0);

      // The drag is over; further moves do nothing.
      fire(titleBar('a'), 'pointermove', 400, 400);
      expect(pos('a')).toEqual({ left: '115px', top: '27px' });
    });

    it('keeps following moves that land outside the title bar', () => {
      fire(titleBar('a'), 'pointerdown', 10, 10);
      fire(document.body, 'pointermove', 210, 110);
      expect(pos('a')).toEqual({ left: '220px', top: '82px' });
      fire(document.body, 'pointerup', 210, 110);
      fire(document.body, 'pointermove', 0, 0);
      expect(pos('a')).toEqual({ left: '220px', top: '82px' });
    });

    it('clamps the dragged window so the title bar stays reachable (Req 6.7)', () => {
      fire(titleBar('a'), 'pointerdown', 0, 0);
      fire(titleBar('a'), 'pointermove', -4000, -4000);
      // v = 48: x ≥ 48 − 300, y ≥ 0.
      expect(pos('a')).toEqual({ left: '-252px', top: '0px' });
      fire(titleBar('a'), 'pointermove', 4000, 4000);
      // x ≤ 1024 − 48, y ≤ 740 − 20.
      expect(pos('a')).toEqual({ left: '976px', top: '720px' });
      fire(titleBar('a'), 'pointerup', 4000, 4000);
    });

    it('adds document listeners only while dragging and removes them on pointerup', () => {
      expect(docListeners.count()).toBe(0);
      fire(titleBar('a'), 'pointerdown', 10, 10);
      expect(docListeners.count()).toBeGreaterThan(0);
      fire(titleBar('a'), 'pointermove', 20, 20);
      fire(titleBar('a'), 'pointerup', 20, 20);
      expect(docListeners.attached()).toEqual([]);
    });

    it('pointercancel also ends the drag', () => {
      fire(titleBar('a'), 'pointerdown', 10, 10);
      fire(titleBar('a'), 'pointercancel', 10, 10);
      expect(docListeners.attached()).toEqual([]);
      fire(titleBar('a'), 'pointermove', 100, 100);
      expect(pos('a')).toEqual({ left: '120px', top: '32px' });
    });

    it('does not start a drag from the title-bar buttons or a non-primary button', () => {
      fire(minimizeBtn('a'), 'pointerdown', 10, 10);
      fire(closeBtn('a'), 'pointerdown', 10, 10);
      fire(titleBar('a'), 'pointerdown', 10, 10, 2);
      expect(docListeners.count()).toBe(0);
      fire(titleBar('a'), 'pointermove', 100, 100);
      expect(pos('a')).toEqual({ left: '120px', top: '32px' });
    });

    it('removes document listeners when the window closes or minimizes mid-drag', () => {
      fire(titleBar('a'), 'pointerdown', 10, 10);
      wm.minimize('a');
      expect(docListeners.attached()).toEqual([]);

      wm.focus('a');
      fire(titleBar('a'), 'pointerdown', 10, 10);
      wm.close('a');
      expect(docListeners.attached()).toEqual([]);
    });
  });

  it('setArea pulls a low window up so its title bar stays inside (Req 6.8)', () => {
    wm.open(spec('low', { position: { x: 100, y: 600 } }));
    wm.open(spec('high', { position: { x: 100, y: 100 } }));
    expect(pos('low')).toEqual({ left: '100px', top: '600px' });

    wm.setArea({ w: 1024, h: 480 });
    expect(pos('low')).toEqual({ left: '100px', top: '460px' });
    expect(pos('high')).toEqual({ left: '100px', top: '100px' });

    // Growing the area back does not push windows down again.
    wm.setArea(AREA);
    expect(pos('low')).toEqual({ left: '100px', top: '460px' });
  });

  describe('close button (Req 6.10, 6.11)', () => {
    it('asks the owner and keeps the window on a false answer', () => {
      const onCloseRequest = vi.fn(() => false);
      const onClosed = vi.fn();
      wm.open(spec('a', { onCloseRequest, onClosed }));

      closeBtn('a').click();
      expect(onCloseRequest).toHaveBeenCalledTimes(1);
      expect(wm.isOpen('a')).toBe(true);
      expect(root.querySelector('[data-window-id="a"]')).not.toBeNull();
      expect(wm.stack().opened).toEqual(['a']);
      expect(onClosed).not.toHaveBeenCalled();
    });

    it('closes on a true answer, removes the element and calls onClosed once', () => {
      const onCloseRequest = vi.fn(() => true);
      const onClosed = vi.fn();
      wm.open(spec('a'));
      wm.open(spec('b', { onCloseRequest, onClosed }));

      closeBtn('b').click();
      expect(onCloseRequest).toHaveBeenCalledTimes(1);
      expect(onClosed).toHaveBeenCalledTimes(1);
      expect(wm.isOpen('b')).toBe(false);
      expect(root.querySelector('[data-window-id="b"]')).toBeNull();
      expect(wm.stack().order).toEqual(['a']);
      expectDomMatchesStack();
    });

    it('closes when the owner gives no onCloseRequest', () => {
      wm.open(spec('a'));
      closeBtn('a').click();
      expect(wm.isOpen('a')).toBe(false);
    });

    it('close() skips the question', () => {
      const onCloseRequest = vi.fn(() => false);
      const onClosed = vi.fn();
      wm.open(spec('a', { onCloseRequest, onClosed }));
      wm.close('a');
      expect(onCloseRequest).not.toHaveBeenCalled();
      expect(onClosed).toHaveBeenCalledTimes(1);
      expect(wm.isOpen('a')).toBe(false);
    });
  });

  it('the minimize button hides the window and focuses the next one (Req 6.5)', () => {
    wm.open(spec('a'));
    wm.open(spec('b'));
    fire(minimizeBtn('b'), 'pointerdown');
    minimizeBtn('b').click();

    expect(winEl('b').hidden).toBe(true);
    expect(wm.isOpen('b')).toBe(true);
    expect(wm.stack().minimized).toEqual(['b']);
    expect(wm.stack().opened).toEqual(['a', 'b']);
    expect(wm.stack().focused).toBe('a');
    expectDomMatchesStack();
  });

  it('reopening an open id focuses it instead of adding a second window (Req 5.9)', () => {
    const first = spec('a');
    wm.open(first);
    wm.open(spec('b'));
    const el = winEl('a');

    wm.open(spec('a', { title: 'Other title', content: document.createElement('section') }));
    expect(root.querySelectorAll('[data-window-id="a"]').length).toBe(1);
    expect(winEl('a')).toBe(el);
    expect(part('a', '.window-body').firstChild).toBe(first.content);
    expect(wm.stack().opened).toEqual(['a', 'b']);
    expect(wm.stack().focused).toBe('a');
    expectDomMatchesStack();

    // A minimized window is restored by reopening it.
    wm.minimize('a');
    wm.open(spec('a'));
    expect(winEl('a').hidden).toBe(false);
    expect(wm.stack().focused).toBe('a');
    expectDomMatchesStack();
  });

  it('info returns the current title and icon of an open window only', () => {
    expect(wm.info('a')).toBeUndefined();
    wm.open(spec('a', { icon: 'dialer' }));
    expect(wm.info('a')).toEqual({ id: 'a', title: 'Window a', icon: 'dialer' });
    wm.setTitle('a', 'Connecting...');
    expect(wm.info('a')?.title).toBe('Connecting...');
    wm.close('a');
    expect(wm.info('a')).toBeUndefined();
  });

  it('setTitle and setContent update the window', () => {
    wm.open(spec('a'));
    wm.setTitle('a', 'Connecting...');
    expect(part('a', '.title-bar-text').textContent).toBe('Connecting...');
    const next = document.createElement('div');
    wm.setContent('a', next);
    expect(part('a', '.window-body').childNodes.length).toBe(1);
    expect(part('a', '.window-body').firstChild).toBe(next);
  });

  describe('subscribers', () => {
    type Call = { stack: WindowStack; windows: ReadonlyMap<string, WindowInfo> };

    it('get no initial call, then every update, and stop after unsubscribe', () => {
      const calls: Call[] = [];
      const off = wm.subscribe((stack, windows) => calls.push({ stack, windows }));
      expect(calls).toEqual([]);

      wm.open(spec('a', { icon: 'dialer' }));
      expect(calls).toHaveLength(1);
      expect(calls[0]?.stack).toBe(wm.stack());
      expect([...(calls[0]?.windows.values() ?? [])]).toEqual([{ id: 'a', title: 'Window a', icon: 'dialer' }]);

      wm.open(spec('b'));
      wm.focus('a');
      wm.minimize('a');
      expect(calls).toHaveLength(4);
      expect(calls.at(-1)?.stack.minimized).toEqual(['a']);

      wm.setTitle('b', 'Renamed');
      expect(calls).toHaveLength(5);
      expect(calls.at(-1)?.windows.get('b')?.title).toBe('Renamed');

      // No-op ops do not notify.
      wm.focus('missing');
      wm.minimize('a');
      wm.setTitle('b', 'Renamed');
      expect(calls).toHaveLength(5);

      wm.close('b');
      expect(calls).toHaveLength(6);
      expect([...(calls.at(-1)?.windows.keys() ?? [])]).toEqual(['a']);

      off();
      wm.open(spec('c'));
      wm.focus('a');
      wm.close('c');
      expect(calls).toHaveLength(6);
    });

    it('unsubscribing one listener leaves the others', () => {
      const a = vi.fn();
      const b = vi.fn();
      const offA = wm.subscribe(a);
      wm.subscribe(b);
      offA();
      wm.open(spec('x'));
      expect(a).not.toHaveBeenCalled();
      expect(b).toHaveBeenCalledTimes(1);
    });
  });

  it('unmount removes every window and listener without calling onClosed or notifying', () => {
    const onClosed = vi.fn();
    const listener = vi.fn();
    wm.open(spec('a', { onClosed }));
    wm.open(spec('b'));
    wm.subscribe(listener);
    fire(titleBar('a'), 'pointerdown', 10, 10);
    expect(docListeners.count()).toBeGreaterThan(0);
    listener.mockClear();

    wm.unmount();
    expect(docListeners.attached()).toEqual([]);
    expect(root.children.length).toBe(0);
    expect(onClosed).not.toHaveBeenCalled();
    expect(listener).not.toHaveBeenCalled();
    expect(wm.isOpen('a')).toBe(false);

    // A second unmount and later calls are harmless.
    wm.unmount();
    wm.open(spec('c'));
    expect(root.children.length).toBe(0);
  });
});
