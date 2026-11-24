import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DESKTOP_COPY } from '../../src/desktop/copy';
import { createStartMenu, type StartItemId } from '../../src/desktop/startMenu';
import { trackListeners, type ListenerTracker } from '../helpers/dom';

// jsdom has no PointerEvent; the menu only reads `target`, so a MouseEvent named 'pointerdown' works.
const pointerDown = (el: EventTarget) =>
  el.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true }));
const keyDown = (el: EventTarget, key: string) =>
  el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));

let docTracker: ListenerTracker;
let root: HTMLDivElement;

beforeEach(() => {
  docTracker = trackListeners(document);
  root = document.createElement('div');
  document.body.appendChild(root);
});

afterEach(() => {
  docTracker.restore();
  root.remove();
});

function setup() {
  const anchor = document.createElement('button');
  anchor.className = 'start-button';
  const anchorLabel = document.createElement('span');
  anchor.appendChild(anchorLabel);
  const outside = document.createElement('div');
  root.append(anchor, outside);
  const chosen: StartItemId[] = [];
  /** `isOpen()` as seen from inside each `onChoose` call. */
  const openWhenChosen: boolean[] = [];
  const changes: boolean[] = [];
  const menu = createStartMenu({
    anchor,
    onChoose: (id) => {
      chosen.push(id);
      openWhenChosen.push(menu.isOpen());
    },
    onOpenChange: (open) => changes.push(open),
  });
  menu.mount(root);
  const el = root.querySelector<HTMLElement>('.start-menu')!;
  const item = (id: StartItemId) => el.querySelector<HTMLButtonElement>(`[data-item-id="${id}"]`)!;
  return { anchor, anchorLabel, outside, menu, el, item, chosen, openWhenChosen, changes };
}

describe('createStartMenu', () => {
  // Req 8.2
  it('lists the items in order with a separator before "Shut Down..." beside the banner', () => {
    const { el } = setup();
    const rows = [...el.querySelectorAll('.start-menu-items > li')].map((li) =>
      li.classList.contains('start-menu-separator') ? '---' : li.textContent,
    );
    expect(rows).toEqual(['Connect to MidnightNet', 'README.TXT', 'Wastebasket', '---', 'Shut Down...']);
    expect(rows.filter((r) => r !== '---')).toEqual(DESKTOP_COPY.startMenu.items.map((i) => i.label));
    const ids = [...el.querySelectorAll('[data-item-id]')].map((b) => b.getAttribute('data-item-id'));
    expect(ids).toEqual(['dialer', 'readme', 'wastebasket', 'shutDown']);
    expect(el.querySelector('.start-menu-separator')!.getAttribute('role')).toBe('separator');
    expect(el.firstElementChild!.classList.contains('start-menu-banner')).toBe(true);
    expect(el.querySelector('.start-menu-banner > .start-menu-banner-text')!.textContent).toBe('Phantom 98');
  });

  // Req 8.1
  it('starts closed and toggle opens and closes it', () => {
    const { menu, el, changes } = setup();
    expect([menu.isOpen(), el.hidden]).toEqual([false, true]);
    menu.toggle();
    expect([menu.isOpen(), el.hidden]).toEqual([true, false]);
    menu.toggle();
    expect([menu.isOpen(), el.hidden]).toEqual([false, true]);
    expect(changes).toEqual([true, false]);
  });

  it('fires onOpenChange only on real changes', () => {
    const { menu, changes } = setup();
    menu.close();
    menu.open();
    menu.open();
    menu.close();
    menu.close();
    menu.toggle();
    menu.toggle();
    expect(changes).toEqual([true, false, true, false]);
  });

  // Req 8.3
  it.each(['dialer', 'readme', 'wastebasket', 'shutDown'] as const)(
    'choosing %s closes the menu and then calls onChoose',
    (id) => {
      const { menu, el, item, chosen, openWhenChosen, changes } = setup();
      menu.open();
      item(id).click();
      expect([menu.isOpen(), el.hidden]).toEqual([false, true]);
      expect(chosen).toEqual([id]);
      expect(openWhenChosen).toEqual([false]);
      expect(changes).toEqual([true, false]);
    },
  );

  it('ignores item clicks while closed', () => {
    const { item, chosen, changes } = setup();
    item('readme').click();
    expect(chosen).toEqual([]);
    expect(changes).toEqual([]);
  });

  // Req 8.4
  it('closes on Escape and returns focus to the anchor', () => {
    const { menu, anchor, item, changes } = setup();
    menu.open();
    item('readme').focus();
    keyDown(item('readme'), 'Escape');
    expect(menu.isOpen()).toBe(false);
    expect(document.activeElement).toBe(anchor);
    expect(changes).toEqual([true, false]);
  });

  it('stays open on other keys', () => {
    const { menu } = setup();
    menu.open();
    for (const key of ['Enter', 'a', 'ArrowDown', 'Tab', ' ']) keyDown(document, key);
    expect(menu.isOpen()).toBe(true);
  });

  // Req 8.4
  it('closes on a pointer press outside the menu and the Start button', () => {
    const { menu, outside, changes } = setup();
    menu.open();
    pointerDown(outside);
    expect(menu.isOpen()).toBe(false);
    menu.open();
    pointerDown(document.body);
    expect(menu.isOpen()).toBe(false);
    expect(changes).toEqual([true, false, true, false]);
  });

  it('ignores pointer presses on the Start button, its children and inside the menu', () => {
    const { menu, anchor, anchorLabel, el, item } = setup();
    menu.open();
    pointerDown(anchor);
    pointerDown(anchorLabel);
    pointerDown(el);
    pointerDown(item('wastebasket'));
    pointerDown(el.querySelector('.start-menu-banner-text')!);
    expect(menu.isOpen()).toBe(true);
  });

  it('closes on an outside press even if a handler stops propagation', () => {
    const { menu, outside } = setup();
    outside.addEventListener('pointerdown', (e) => e.stopPropagation());
    menu.open();
    pointerDown(outside);
    expect(menu.isOpen()).toBe(false);
  });

  // Req 14.2
  it('has document listeners only while open', () => {
    const { menu, outside, item } = setup();
    expect(docTracker.count()).toBe(0);
    menu.open();
    expect(docTracker.count('pointerdown')).toBe(1);
    expect(docTracker.count('keydown')).toBe(1);
    expect(docTracker.count()).toBe(2);
    menu.close();
    expect(docTracker.count()).toBe(0);
    menu.toggle();
    pointerDown(outside);
    expect(docTracker.count()).toBe(0);
    menu.open();
    keyDown(document, 'Escape');
    expect(docTracker.count()).toBe(0);
    menu.open();
    item('readme').click();
    expect(docTracker.count()).toBe(0);
  });

  // Req 14.2
  it('unmount removes the element and the document listeners without calling back', () => {
    const { menu, outside, item, chosen, changes } = setup();
    menu.open();
    expect(docTracker.count()).toBe(2);
    menu.unmount();
    expect(docTracker.count()).toBe(0);
    expect(root.querySelector('.start-menu')).toBeNull();
    expect(menu.isOpen()).toBe(false);
    expect(changes).toEqual([true]);

    // Nothing reacts after unmount.
    menu.open();
    menu.toggle();
    pointerDown(outside);
    item('readme').click();
    expect(menu.isOpen()).toBe(false);
    expect(docTracker.count()).toBe(0);
    expect(chosen).toEqual([]);
    expect(changes).toEqual([true]);
    menu.unmount();
  });

  it('unmount while closed leaves no document listeners', () => {
    const { menu } = setup();
    menu.unmount();
    expect(docTracker.count()).toBe(0);
    expect(root.querySelector('.start-menu')).toBeNull();
  });

  // Req 8.5
  it('shows a disabled "Shut Down..." and ignores choosing it', () => {
    const { menu, item, chosen, changes } = setup();
    menu.setDisabled('shutDown', true);
    expect(item('shutDown').getAttribute('aria-disabled')).toBe('true');
    expect(item('readme').hasAttribute('aria-disabled')).toBe(false);
    menu.open();
    item('shutDown').click();
    expect(menu.isOpen()).toBe(true);
    expect(chosen).toEqual([]);
    expect(changes).toEqual([true]);
    item('dialer').click();
    expect(chosen).toEqual(['dialer']);
  });

  it('re-enabling "Shut Down..." makes it choosable again', () => {
    const { menu, item, chosen } = setup();
    menu.setDisabled('shutDown', true);
    menu.setDisabled('shutDown', false);
    expect(item('shutDown').hasAttribute('aria-disabled')).toBe(false);
    menu.open();
    item('shutDown').click();
    expect(menu.isOpen()).toBe(false);
    expect(chosen).toEqual(['shutDown']);
  });
});
