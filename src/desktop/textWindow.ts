/**
 * Window contents for the README and Wastebasket apps (Req 5.7, 5.8). Titles and window chrome
 * come from the Window_Manager; these functions only build the body. All text is set through
 * `textContent` (Req 14.4).
 *
 * DOM (see the header comment in src/styles/desktop.css):
 *   pre.text-doc
 *   div.file-view > ul.file-list > li.file-row > span.icon + span.file-name
 *                 > div.status-bar > span.status-bar-field
 */

import { h } from '../core/h';
import { DESKTOP_COPY } from './copy';
import { iconEl } from './iconArt';

/** README.TXT body: a `<pre>` with the README text (Req 5.7). */
export function readmeContent(): HTMLElement {
  const pre = h('pre', { className: 'text-doc' });
  pre.textContent = DESKTOP_COPY.readme;
  return pre;
}

/** Wastebasket body: one row per file and the "4 object(s)" status bar (Req 5.8). */
export function wastebasketContent(): HTMLElement {
  const rows = DESKTOP_COPY.wastebasket.files.map((file) => {
    const name = h('span', { className: 'file-name' });
    name.textContent = file;
    return h('li', { className: 'file-row' }, iconEl('file'), name);
  });

  const status = h('span', { className: 'status-bar-field' });
  status.textContent = DESKTOP_COPY.wastebasket.status;

  return h(
    'div',
    { className: 'file-view' },
    h('ul', { className: 'file-list' }, ...rows),
    h('div', { className: 'status-bar' }, status),
  );
}
