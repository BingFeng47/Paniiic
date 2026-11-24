/**
 * Mission_Note (player-guide Req 1): a static yellow sticky note on the wallpaper, top-right of
 * the Desktop_Area. It sits inside div.wallpaper, so it is always below the window layer, and it
 * has `pointer-events: none` (desktop.css), so it never captures input.
 *
 *   div.mission-note
 *     span.mission-note-pin
 *     p.mission-note-text      GUIDE_COPY.missionNote via textContent
 */
import { h } from '../core/h';
import { GUIDE_COPY } from '../ui/guideCopy';

export function createMissionNote(): HTMLElement {
  const pin = h('span', { className: 'mission-note-pin' });
  pin.setAttribute('aria-hidden', 'true');
  const text = h('p', { className: 'mission-note-text' });
  text.textContent = GUIDE_COPY.missionNote;
  const note = h('div', { className: 'mission-note' }, pin, text);
  note.setAttribute('role', 'note');
  return note;
}
