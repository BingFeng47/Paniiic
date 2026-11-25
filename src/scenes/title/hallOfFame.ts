/**
 * Hall_of_Fame (leaderboard Req 7.2–7.4): a NetSurfer-style guestbook window on the Title_Scene
 * with a guest counter, today's top 10 and the all-time top 10.
 *
 *   div.hof-backdrop
 *     div.window.is-active.hof-dialog  role=dialog aria-modal aria-labelledby=hof-title
 *       div.title-bar > span.title-bar-text#hof-title
 *                     + div.title-bar-controls > button.title-bar-button.title-bar-close
 *       div.window-body
 *         div.hof-page
 *           div.hof-construction            static CSS stripe with its label
 *           h2.hof-heading
 *           div.hof-counter > span.hof-counter-label + span.hof-counter-digits > span.hof-digit…
 *           p.hof-status                    "Loading guestbook..." / failure text; hidden when loaded
 *           div.hof-lists                   hidden until loaded
 *             table.hof-table.hof-today     caption + thead + tbody (rows or one td.hof-empty)
 *             table.hof-table.hof-alltime
 *           p.hof-note
 *           p.hof-footer
 *         div.hof-buttons > button.btn.btn-default
 *
 * Data comes from the injected Leaderboard_Client; results that arrive after close or unmount are
 * dropped. ✕, the Close button and Escape call `onClose()`; the owner unmounts the window, like
 * the Options_Dialog. Names and all other text go in through text nodes only (Req 7.4). Nothing
 * here animates, so nothing flashes.
 */
import { utcDay } from '../../core/clock';
import { h } from '../../core/h';
import type { FailReason, LeaderboardClient, Result, ScoreRow } from '../../core/leaderboard';
import type { Mountable } from '../../core/scene';
import { HALL_OF_FAME_COPY as COPY } from './titleCopy';

export interface HallOfFameDeps {
  readonly leaderboard: Pick<LeaderboardClient, 'topToday' | 'topAllTime' | 'guestCount'>;
  /** ✕, Close or Escape (Req 7.2). */
  readonly onClose: () => void;
  /** The Day for today's list. Defaults to `utcDay(new Date())`. */
  readonly today?: () => string;
}

/** Title-bar close glyph (UI chrome, not game copy; matches the other windows). */
const CLOSE_GLYPH = '✕';
const TITLE_ID = 'hof-title';

/** The counter text: zero-padded to `counterDigits`, or blanks while unknown. */
export function counterText(count: number | null): string {
  if (count === null) return COPY.counterBlank.repeat(COPY.counterDigits);
  return String(count).padStart(COPY.counterDigits, '0');
}

function failText(reason: FailReason): string {
  return reason === 'offline' ? COPY.offline : COPY.busy;
}

function buildTable(className: string, caption: string, rows: readonly ScoreRow[]): HTMLElement {
  const head = h(
    'thead',
    null,
    h(
      'tr',
      null,
      h('th', { attrs: { scope: 'col' } }, COPY.colRank),
      h('th', { attrs: { scope: 'col' } }, COPY.colName),
      h('th', { attrs: { scope: 'col' } }, COPY.colScore),
      h('th', { attrs: { scope: 'col' } }, COPY.colOutcome),
    ),
  );
  const body =
    rows.length === 0
      ? h('tbody', null, h('tr', null, h('td', { className: 'hof-empty', attrs: { colspan: '4' } }, COPY.empty)))
      : h(
          'tbody',
          null,
          ...rows.map((row, i) =>
            h(
              'tr',
              { className: row.outcome === 'won' ? 'is-won' : 'is-lost' },
              h('td', { className: 'hof-rank' }, `${i + 1}.`),
              h('td', { className: 'hof-name' }, row.name),
              h('td', { className: 'hof-score' }, String(row.score)),
              h('td', { className: 'hof-outcome' }, row.outcome === 'won' ? COPY.won : COPY.lost),
            ),
          ),
        );
  return h('table', { className: `hof-table ${className}` }, h('caption', null, caption), head, body);
}

export function createHallOfFame(deps: HallOfFameDeps): Mountable {
  const { leaderboard, onClose, today = () => utcDay(new Date()) } = deps;

  let mounted = false;
  /** Bumped on every mount and unmount, so a late result from an older load is dropped. */
  let generation = 0;

  const closeButton = h(
    'button',
    {
      className: 'title-bar-button title-bar-close',
      attrs: { type: 'button', 'aria-label': COPY.close },
      on: { click: () => close() },
    },
    CLOSE_GLYPH,
  );
  const okButton = h(
    'button',
    { className: 'btn btn-default', attrs: { type: 'button' }, on: { click: () => close() } },
    COPY.ok,
  );

  const digits = h('span', { className: 'hof-counter-digits' });
  const status = h('p', { className: 'hof-status', attrs: { role: 'status' } });
  const lists = h('div', { className: 'hof-lists' });

  const el = h(
    'div',
    { className: 'hof-backdrop' },
    h(
      'div',
      {
        className: 'window is-active hof-dialog',
        attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': TITLE_ID },
      },
      h(
        'div',
        { className: 'title-bar' },
        h('span', { className: 'title-bar-text', attrs: { id: TITLE_ID } }, COPY.title),
        h('div', { className: 'title-bar-controls' }, closeButton),
      ),
      h(
        'div',
        { className: 'window-body' },
        h(
          'div',
          { className: 'hof-page' },
          h('div', { className: 'hof-construction' }, h('span', null, COPY.construction)),
          h('h2', { className: 'hof-heading' }, COPY.heading),
          h('div', { className: 'hof-counter' }, h('span', { className: 'hof-counter-label' }, COPY.counterLabel), digits),
          status,
          lists,
          h('p', { className: 'hof-note' }, COPY.note),
          h('p', { className: 'hof-footer' }, COPY.footer),
        ),
        h('div', { className: 'hof-buttons' }, okButton),
      ),
    ),
  );

  function showCount(count: number | null): void {
    const text = counterText(count);
    digits.replaceChildren(...[...text].map((d) => h('span', { className: 'hof-digit' }, d)));
    digits.setAttribute('aria-label', count === null ? COPY.loading : String(count));
  }

  function showStatus(text: string): void {
    status.textContent = text;
    status.hidden = false;
    lists.hidden = true;
    lists.replaceChildren();
  }

  function showLists(todayRows: readonly ScoreRow[], allRows: readonly ScoreRow[]): void {
    status.hidden = true;
    status.textContent = '';
    lists.replaceChildren(
      buildTable('hof-today', COPY.today, todayRows),
      buildTable('hof-alltime', COPY.allTime, allRows),
    );
    lists.hidden = false;
  }

  function load(): void {
    const mine = generation;
    const live = (): boolean => mounted && mine === generation;
    showCount(null);
    showStatus(COPY.loading);
    let day: string;
    try {
      day = today();
    } catch {
      showStatus(COPY.busy);
      return;
    }
    // The real client never rejects; the catches keep a misbehaving one from leaving "Loading".
    leaderboard.guestCount().then(
      (r) => {
        if (live() && r.ok) showCount(r.value);
      },
      () => {},
    );
    const requests: [Promise<Result<readonly ScoreRow[]>>, Promise<Result<readonly ScoreRow[]>>] = [
      leaderboard.topToday(day),
      leaderboard.topAllTime(),
    ];
    Promise.all(requests).then(
      ([t, a]) => {
        if (!live()) return;
        if (!t.ok) showStatus(failText(t.reason));
        else if (!a.ok) showStatus(failText(a.reason));
        else showLists(t.value, a.value);
      },
      () => {
        if (live()) showStatus(COPY.busy);
      },
    );
  }

  function close(): void {
    if (!mounted) return;
    onClose();
  }

  const onDocKeyDown = (e: KeyboardEvent): void => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    close();
  };

  return {
    mount(root) {
      if (mounted) return;
      mounted = true;
      generation += 1;
      root.appendChild(el);
      document.addEventListener('keydown', onDocKeyDown);
      okButton.focus();
      load();
    },
    /** Removes the document listener and the elements without calling `onClose`. */
    unmount() {
      if (!mounted) return;
      mounted = false;
      generation += 1;
      document.removeEventListener('keydown', onDocKeyDown);
      el.remove();
    },
  };
}
