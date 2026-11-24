import { describe, expect, it } from 'vitest';
import { DESKTOP_COPY } from '../../src/desktop/copy';
import {
  createIconGrid,
  DESKTOP_ICONS,
  type AppId,
  type DesktopIconSpec,
} from '../../src/desktop/icons';

function setup(icons: readonly DesktopIconSpec[] = DESKTOP_ICONS) {
  const root = document.createElement('div');
  const opened: AppId[] = [];
  const grid = createIconGrid({ icons, onOpen: (id) => opened.push(id) });
  grid.mount(root);
  const buttons = [...root.querySelectorAll<HTMLButtonElement>('.icon-grid > button.desktop-icon')];
  return { root, grid, opened, buttons };
}

const labelOf = (b: HTMLButtonElement) => b.querySelector('.desktop-icon-label')?.textContent;
const selectedFlags = (buttons: HTMLButtonElement[]) =>
  buttons.map((b) => b.classList.contains('is-selected'));
const press = (el: HTMLElement, key: string) =>
  el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
const dblclick = (el: HTMLElement) =>
  el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));

describe('createIconGrid', () => {
  // Req 5.2
  it('lays out the copy labels in one column from (16, 16), 80 px apart', () => {
    const { buttons } = setup();
    expect(buttons).toHaveLength(3);
    expect(buttons.map(labelOf)).toEqual(DESKTOP_COPY.icons.map((i) => i.label));
    expect(buttons.map(labelOf)).toEqual(['Connect to MidnightNet', 'README.TXT', 'Wastebasket']);
    expect(buttons.map((b) => b.dataset.app)).toEqual(DESKTOP_COPY.icons.map((i) => i.id));
    expect(buttons.map((b) => [b.style.left, b.style.top])).toEqual([
      ['16px', '16px'],
      ['16px', '96px'],
      ['16px', '176px'],
    ]);
    const ys = buttons.map((b) => parseFloat(b.style.top));
    expect(ys.every((y, i) => i === 0 || y > ys[i - 1]!)).toBe(true);
    expect(buttons.every((b) => b.querySelector(':scope > span.icon') !== null)).toBe(true);
    expect(buttons.every((b) => b.type === 'button')).toBe(true);
  });

  it('DESKTOP_ICONS mirrors DESKTOP_COPY.icons in order', () => {
    expect(DESKTOP_ICONS.map((i) => [i.id, i.label])).toEqual(
      DESKTOP_COPY.icons.map((i) => [i.id, i.label]),
    );
  });

  it('starts with nothing selected', () => {
    const { grid, buttons } = setup();
    expect(grid.selected()).toBeNull();
    expect(selectedFlags(buttons)).toEqual([false, false, false]);
  });

  // Req 5.3
  it('a click selects that icon and deselects every other one', () => {
    const { grid, buttons, opened } = setup();
    const ids = DESKTOP_COPY.icons.map((i) => i.id);
    for (const [i, b] of buttons.entries()) {
      b.click();
      expect(grid.selected()).toBe(ids[i]);
      expect(selectedFlags(buttons)).toEqual(buttons.map((_, j) => j === i));
    }
    buttons[0]!.click();
    expect(grid.selected()).toBe('dialer');
    expect(selectedFlags(buttons)).toEqual([true, false, false]);
    expect(opened).toEqual([]);
  });

  // Req 5.6 (the desktop scene calls clearSelection on a wallpaper click)
  it('clearSelection deselects every icon and is safe when nothing is selected', () => {
    const { grid, buttons } = setup();
    grid.clearSelection();
    expect(grid.selected()).toBeNull();
    buttons[1]!.click();
    grid.clearSelection();
    expect(grid.selected()).toBeNull();
    expect(buttons.some((b) => b.classList.contains('is-selected'))).toBe(false);
  });

  // Req 5.4
  it('dblclick opens that icon and selects it', () => {
    const { grid, opened, buttons } = setup();
    buttons[0]!.click();
    dblclick(buttons[2]!);
    expect(opened).toEqual(['wastebasket']);
    expect(grid.selected()).toBe('wastebasket');
    expect(selectedFlags(buttons)).toEqual([false, false, true]);
  });

  // Req 5.5
  it('Enter opens the focused icon once and selects it', () => {
    const { grid, opened, buttons } = setup();
    buttons[1]!.focus();
    press(buttons[1]!, 'Enter');
    expect(opened).toEqual(['readme']);
    expect(grid.selected()).toBe('readme');
    expect(selectedFlags(buttons)).toEqual([false, true, false]);
  });

  it('other keys neither open nor change the selection', () => {
    const { grid, opened, buttons } = setup();
    buttons[0]!.click();
    for (const key of ['a', ' ', 'Escape', 'Tab', 'ArrowDown']) press(buttons[2]!, key);
    expect(opened).toEqual([]);
    expect(grid.selected()).toBe('dialer');
  });

  it('opens each icon with its own id', () => {
    const { opened, buttons } = setup();
    dblclick(buttons[1]!);
    press(buttons[0]!, 'Enter');
    dblclick(buttons[0]!);
    press(buttons[2]!, 'Enter');
    expect(opened).toEqual(['readme', 'dialer', 'dialer', 'wastebasket']);
  });

  // Req 14.4: labels are text, never markup
  it('shows markup-like labels literally', () => {
    const label = '<img src=x onerror="alert(1)"><b>&amp;</b>';
    const { buttons } = setup([{ id: 'readme', label, icon: 'text' }]);
    const el = buttons[0]!.querySelector('.desktop-icon-label')!;
    expect(el.textContent).toBe(label);
    expect(el.children).toHaveLength(0);
    expect(buttons[0]!.querySelector('img, b')).toBeNull();
  });

  it('removes the grid on unmount and clears the selection', () => {
    const { root, grid, buttons } = setup();
    buttons[0]!.click();
    grid.unmount();
    expect(root.querySelector('.icon-grid')).toBeNull();
    expect(grid.selected()).toBeNull();
  });
});
