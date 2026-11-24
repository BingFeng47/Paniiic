/**
 * Power_Confirm dialog: shown when the monitor's power button is pressed during the boot or the
 * desktop. It dims the whole Screen and asks whether to go back to the title screen.
 *
 *   div.power-confirm            role=dialog, covers the whole Screen (taskbar included)
 *     div.window.is-active.power-confirm-window
 *       div.title-bar > span.title-bar-text#power-confirm-title
 *       div.window-body
 *         p.power-confirm-message
 *         div.power-confirm-buttons > button.btn.power-confirm-yes + button.btn.btn-default.power-confirm-no
 *
 * Escape counts as No. Text goes in through text nodes only.
 */
import { h } from '../core/h';
import type { Mountable } from '../core/scene';

export const POWER_CONFIRM_COPY = Object.freeze({
  title: 'Power Management',
  message:
    'Turning off the power now will drop the connection. Anything still on the line stays there. Return to the main menu?',
  yes: 'Yes',
  no: 'No',
});

export interface PowerConfirmDeps {
  readonly onYes: () => void;
  readonly onNo: () => void;
}

export function createPowerConfirm({ onYes, onNo }: PowerConfirmDeps): Mountable {
  let el: HTMLElement | null = null;
  const onKey = (e: KeyboardEvent): void => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    e.stopPropagation();
    onNo();
  };
  return {
    mount(root) {
      if (el) return;
      const no = h(
        'button',
        { className: 'btn btn-default power-confirm-no', attrs: { type: 'button' }, on: { click: () => onNo() } },
        POWER_CONFIRM_COPY.no,
      );
      const yes = h(
        'button',
        { className: 'btn power-confirm-yes', attrs: { type: 'button' }, on: { click: () => onYes() } },
        POWER_CONFIRM_COPY.yes,
      );
      el = h(
        'div',
        {
          className: 'power-confirm',
          attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'power-confirm-title' },
          on: { keydown: onKey },
        },
        h(
          'div',
          { className: 'window is-active power-confirm-window' },
          h(
            'div',
            { className: 'title-bar' },
            h('span', { className: 'title-bar-text', attrs: { id: 'power-confirm-title' } }, POWER_CONFIRM_COPY.title),
          ),
          h(
            'div',
            { className: 'window-body' },
            h('p', { className: 'power-confirm-message' }, POWER_CONFIRM_COPY.message),
            h('div', { className: 'power-confirm-buttons' }, yes, no),
          ),
        ),
      );
      root.appendChild(el);
      no.focus();
    },
    unmount() {
      if (!el) return;
      el.remove();
      el = null;
    },
  };
}
