/**
 * Desktop icon grid (Req 5.2–5.6). Icons are `<button>`s in one column from (16, 16), 80 px
 * apart. A click selects one icon and deselects the rest; a double-click or Enter on the focused
 * icon calls `onOpen`. The desktop scene clears the selection when the wallpaper is clicked.
 *
 * DOM (see the header comment in src/styles/desktop.css):
 *   div.icon-grid > button.desktop-icon(.is-selected) > span.icon + span.desktop-icon-label
 */

import { h } from '../core/h';
import type { Mountable } from '../core/scene';
import { DESKTOP_COPY } from './copy';
import { iconEl, type IconName } from './iconArt';

/** Apps a desktop icon can open. Same union as `AppId` in the desktop scene. */
export type AppId = (typeof DESKTOP_COPY.icons)[number]['id'];

export interface DesktopIconSpec {
  readonly id: AppId;
  readonly label: string;
  readonly icon: IconName;
}

export interface IconGrid extends Mountable {
  clearSelection(): void;
  selected(): AppId | null;
}

export interface IconGridDeps {
  readonly icons: readonly DesktopIconSpec[];
  readonly onOpen: (id: AppId) => void;
}

/** Column layout in px (Req 5.2). */
export const ICON_GRID_ORIGIN = { x: 16, y: 16 } as const;
export const ICON_GRID_STEP = 80;

const ICON_ART: Readonly<Record<AppId, IconName>> = {
  dialer: 'dialer',
  readme: 'text',
  wastebasket: 'wastebasket',
};

/** The three desktop icons, in column order, from DESKTOP_COPY (Req 5.2). */
export const DESKTOP_ICONS: readonly DesktopIconSpec[] = DESKTOP_COPY.icons.map((icon) => ({
  id: icon.id,
  label: icon.label,
  icon: ICON_ART[icon.id],
}));

export function createIconGrid(deps: IconGridDeps): IconGrid {
  let grid: HTMLDivElement | null = null;
  let buttons: { readonly id: AppId; readonly el: HTMLButtonElement }[] = [];
  let selectedId: AppId | null = null;

  function select(id: AppId | null): void {
    selectedId = id;
    for (const b of buttons) b.el.classList.toggle('is-selected', b.id === id);
  }

  function buildButton(spec: DesktopIconSpec, index: number): HTMLButtonElement {
    const label = h('span', { className: 'desktop-icon-label' });
    label.textContent = spec.label;

    const el = h(
      'button',
      {
        className: 'desktop-icon',
        attrs: { type: 'button', 'data-app': spec.id },
        on: {
          click: () => select(spec.id),
          dblclick: () => {
            select(spec.id);
            deps.onOpen(spec.id);
          },
          keydown: (e) => {
            if (e.key !== 'Enter') return;
            // Stop the button's own Enter → click activation; opening is the whole action.
            e.preventDefault();
            select(spec.id);
            deps.onOpen(spec.id);
          },
        },
      },
      iconEl(spec.icon),
      label,
    );
    el.style.left = `${ICON_GRID_ORIGIN.x}px`;
    el.style.top = `${ICON_GRID_ORIGIN.y + index * ICON_GRID_STEP}px`;
    return el;
  }

  return {
    mount(root) {
      if (grid) return;
      buttons = deps.icons.map((spec, i) => ({ id: spec.id, el: buildButton(spec, i) }));
      grid = h('div', { className: 'icon-grid' }, ...buttons.map((b) => b.el));
      root.appendChild(grid);
    },
    unmount() {
      // Listeners live on the buttons, so removing the grid removes them too.
      grid?.remove();
      grid = null;
      buttons = [];
      selectedId = null;
    },
    clearSelection: () => select(null),
    selected: () => selectedId,
  };
}
