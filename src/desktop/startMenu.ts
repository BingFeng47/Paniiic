/**
 * Start_Menu (Req 8): the Phantom 98 banner beside the items from `DESKTOP_COPY.startMenu`, with a
 * separator before "Shut Down...". The Start button (`anchor`) belongs to the taskbar; the
 * desktop scene wires its click to `toggle()` and uses `onOpenChange` to set its pressed style.
 *
 * While open, the menu listens for `pointerdown` and `keydown` on `document` to close on an
 * outside press or Escape (Req 8.4). Those listeners exist only while the menu is open and are
 * removed on close and on unmount (Req 14.2). jsdom has no `PointerEvent`, so the listener is
 * registered by event name and only reads `target`.
 */
import type { Mountable } from '../core/scene';
import { h } from '../core/h';
import { DESKTOP_COPY } from './copy';
import { iconEl, type IconName } from './iconArt';

export type StartItemId = 'dialer' | 'readme' | 'wastebasket' | 'shutDown';

export interface StartMenu extends Mountable {
  toggle(): void;
  open(): void;
  close(): void;
  isOpen(): boolean;
  /** Disabled items show the disabled style and ignore choosing (Req 8.5). */
  setDisabled(id: StartItemId, disabled: boolean): void;
}

export interface StartMenuDeps {
  /** The Start button. Presses on it are left to `toggle()` (Req 8.1). */
  readonly anchor: HTMLElement;
  /** Called after the menu closes for a chosen, enabled item (Req 8.3). */
  readonly onChoose: (id: StartItemId) => void;
  /** Called whenever the open state changes through open/close/toggle/choose. */
  readonly onOpenChange: (open: boolean) => void;
}

const ITEM_ICON: Readonly<Record<StartItemId, IconName>> = {
  dialer: 'dialer',
  readme: 'text',
  wastebasket: 'wastebasket',
  shutDown: 'computer',
};

/** The separator goes right before this item (Req 8.2). */
const SEPARATOR_BEFORE: StartItemId = 'shutDown';

export function createStartMenu(deps: StartMenuDeps): StartMenu {
  const { anchor, onChoose, onOpenChange } = deps;
  const copy = DESKTOP_COPY.startMenu;

  let opened = false;
  let disposed = false;
  const disabled = new Set<StartItemId>();
  const buttons = new Map<StartItemId, HTMLButtonElement>();

  const list = h('ul', { className: 'start-menu-items', attrs: { role: 'menu' } });
  for (const item of copy.items) {
    const id: StartItemId = item.id;
    if (id === SEPARATOR_BEFORE) {
      list.appendChild(h('li', { className: 'start-menu-separator', attrs: { role: 'separator' } }));
    }
    const button = h(
      'button',
      {
        className: 'start-menu-item',
        attrs: { type: 'button', role: 'menuitem', 'data-item-id': id },
        on: { click: () => choose(id) },
      },
      iconEl(ITEM_ICON[id]),
      h('span', { className: 'start-menu-item-label' }, item.label),
    );
    buttons.set(id, button);
    list.appendChild(h('li', { attrs: { role: 'none' } }, button));
  }

  const el = h(
    'div',
    { className: 'start-menu' },
    h('div', { className: 'start-menu-banner' }, h('span', { className: 'start-menu-banner-text' }, copy.banner)),
    list,
  );
  el.hidden = true;

  const onDocPointerDown = (e: Event): void => {
    const target = e.target;
    if (target instanceof Node && (el.contains(target) || anchor.contains(target))) return;
    close();
  };

  const onDocKeyDown = (e: KeyboardEvent): void => {
    if (e.key !== 'Escape') return;
    close();
    anchor.focus();
  };

  function addDocListeners(): void {
    // Capture phase, so a component that stops propagation can't keep the menu open.
    document.addEventListener('pointerdown', onDocPointerDown, true);
    document.addEventListener('keydown', onDocKeyDown);
  }

  function removeDocListeners(): void {
    document.removeEventListener('pointerdown', onDocPointerDown, true);
    document.removeEventListener('keydown', onDocKeyDown);
  }

  function open(): void {
    if (disposed || opened) return;
    opened = true;
    el.hidden = false;
    addDocListeners();
    onOpenChange(true);
  }

  function close(): void {
    if (disposed || !opened) return;
    opened = false;
    el.hidden = true;
    removeDocListeners();
    onOpenChange(false);
  }

  function choose(id: StartItemId): void {
    if (disposed || !opened || disabled.has(id)) return;
    close();
    onChoose(id);
  }

  return {
    mount(root) {
      if (disposed) return;
      root.appendChild(el);
    },
    /** Removes listeners and the element without calling the callbacks. */
    unmount() {
      if (disposed) return;
      disposed = true;
      opened = false;
      removeDocListeners();
      el.remove();
    },
    toggle() {
      if (opened) close();
      else open();
    },
    open,
    close,
    isOpen: () => opened,
    setDisabled(id, value) {
      const button = buttons.get(id);
      if (!button) return;
      if (value) {
        disabled.add(id);
        button.setAttribute('aria-disabled', 'true');
      } else {
        disabled.delete(id);
        button.removeAttribute('aria-disabled');
      }
    },
  };
}
