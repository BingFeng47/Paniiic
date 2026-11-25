/**
 * Guestbook_Form (leaderboard Req 5.1, 5.3–5.7): "Sign our Guestbook!" on the Result_Screen.
 *
 *   div.guestbook[data-state]                 idle | signing | done | failed | closed
 *     h3.guestbook-heading
 *     configured:
 *       form.guestbook-form
 *         label.guestbook-label + input.field-input.guestbook-name + button.btn.guestbook-sign
 *       p.guestbook-hint
 *       p.guestbook-status  role=status       "Signing..." / failure text; hidden when empty
 *       div.guestbook-board                   after `done`, hidden before
 *         p.guestbook-thanks + p.guestbook-rank
 *         table.guestbook-table > caption + thead + tbody, the new row is tr.is-you
 *     not configured:
 *       p.guestbook-status.is-closed          "Guestbook closed for maintenance." (Req 5.6)
 *
 * States: `idle → signing → done | failed(retryLeft)`. A failed submit (the client resolves
 * `busy` on a network error, a 5xx or its 5 s timeout) shows "Server busy. Try again later." and
 * allows one more try (Req 5.5). After a success the form never submits again (Req 5.4).
 *
 * The form never takes focus, so Retry keeps the initial focus (Req 5.7). Keydown in the name
 * field stops propagating, so the lane hotkeys on `document` never see it. Results that arrive
 * after unmount are dropped. Names go in through text nodes only.
 */
import { utcDay } from '../../core/clock';
import { h } from '../../core/h';
import type { LeaderboardClient, ScoreEntry, ScoreRow } from '../../core/leaderboard';
import type { Mountable } from '../../core/scene';
import { TICK_RATE, type GameState } from '../../game/types';
import { RESULT_COPY } from '../resultCopy';
import { loadName, normalizeName, saveName, type StorageSource } from './guestbookName';

const COPY = RESULT_COPY.guestbook;

/** Submits allowed per Result_Screen: the first try and one more after a failure (Req 5.5). */
const MAX_TRIES = 2;
const NAME_MAX_LENGTH = 12;
const INPUT_ID = 'guestbook-name';

export type GuestbookState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'signing' }
  | { readonly kind: 'done' }
  | { readonly kind: 'failed'; readonly retryLeft: number }
  | { readonly kind: 'closed' };

export interface GuestbookFormDeps {
  readonly leaderboard: Pick<LeaderboardClient, 'configured' | 'submit' | 'topToday' | 'rankToday'>;
  /** Where the last Player_Name is loaded from and saved to (Req 5.8). */
  readonly storage: StorageSource;
  /** The Run's entry without the name; see `runEntry`. */
  readonly run: Omit<ScoreEntry, 'name'>;
  /** The Day for the rank and today's list. Defaults to `utcDay(new Date())`. */
  readonly today?: () => string;
}

/**
 * The entry fields of a won or lost Final_State: the score total, the outcome, whole run seconds
 * (`floor(tick / TICK_RATE)`), the whole download percent and the kills.
 */
export function runEntry(final: GameState, total: number): Omit<ScoreEntry, 'name'> {
  const whole = (n: number, max: number): number =>
    Number.isFinite(n) ? Math.min(max, Math.max(0, Math.floor(n))) : 0;
  return {
    score: whole(total, Number.MAX_SAFE_INTEGER),
    outcome: final.phase === 'won' ? 'won' : 'lost',
    seconds: whole(final.tick / TICK_RATE, 3600),
    download: whole(final.download, 100),
    kills: whole(final.stats?.kills ?? 0, 2000),
  };
}

function boardTable(rows: readonly ScoreRow[], you: { name: string; score: number }): HTMLElement {
  const youIndex = rows.findIndex((r) => r.name === you.name && r.score === you.score);
  return h(
    'table',
    { className: 'guestbook-table' },
    h('caption', null, COPY.today),
    h(
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
    ),
    h(
      'tbody',
      null,
      ...rows.map((row, i) =>
        h(
          'tr',
          i === youIndex ? { className: 'is-you' } : null,
          h('td', { className: 'guestbook-pos' }, `${i + 1}.`),
          h('td', { className: 'guestbook-row-name' }, row.name),
          h('td', { className: 'guestbook-score' }, String(row.score)),
          h('td', { className: 'guestbook-outcome' }, row.outcome === 'won' ? COPY.won : COPY.lost),
        ),
      ),
    ),
  );
}

export function createGuestbookForm(deps: GuestbookFormDeps): Mountable & { state(): GuestbookState } {
  const { leaderboard, storage, run, today = () => utcDay(new Date()) } = deps;
  let el: HTMLElement | null = null;
  let input: HTMLInputElement | null = null;
  let signButton: HTMLButtonElement | null = null;
  let status: HTMLElement | null = null;
  let board: HTMLElement | null = null;
  let state: GuestbookState = leaderboard.configured ? { kind: 'idle' } : { kind: 'closed' };
  let tries = 0;
  /** Bumped on unmount, so a result that arrives later is dropped. */
  let generation = 0;

  const canSubmit = (): boolean =>
    (state.kind === 'idle' || (state.kind === 'failed' && state.retryLeft > 0)) &&
    input !== null &&
    normalizeName(input.value) !== null;

  function render(): void {
    if (!el) return;
    el.dataset.state = state.kind;
    if (!input || !signButton || !status) return;
    const busy = state.kind === 'signing' || state.kind === 'done';
    const spent = state.kind === 'failed' && state.retryLeft === 0;
    input.disabled = busy || spent;
    signButton.disabled = !canSubmit();
    const text =
      state.kind === 'signing' ? COPY.signing : state.kind === 'failed' ? COPY.busy : '';
    status.textContent = text;
    status.hidden = text === '';
  }

  function setState(next: GuestbookState): void {
    state = next;
    render();
  }

  async function sign(): Promise<void> {
    if (!input || !canSubmit()) return;
    const name = normalizeName(input.value);
    if (name === null) return;
    const gen = generation;
    tries += 1;
    setState({ kind: 'signing' });
    const sent = await leaderboard.submit({ name, ...run });
    if (gen !== generation) return;
    if (!sent.ok) {
      setState({ kind: 'failed', retryLeft: MAX_TRIES - tries });
      return;
    }
    setState({ kind: 'done' });
    saveName(storage, name);
    const day = today();
    const [rank, top] = await Promise.all([
      leaderboard.rankToday(day, run.score),
      leaderboard.topToday(day),
    ]);
    if (gen !== generation || !board) return;
    board.append(h('p', { className: 'guestbook-thanks' }, COPY.thanks));
    if (rank.ok) board.append(h('p', { className: 'guestbook-rank' }, `${COPY.rankPrefix}${rank.value}`));
    if (top.ok) board.append(boardTable(top.value, { name, score: run.score }));
    if (!rank.ok || !top.ok) board.append(h('p', { className: 'guestbook-list-busy' }, COPY.listBusy));
    board.hidden = false;
  }

  return {
    state: () => state,
    mount(root) {
      if (el) return;
      const heading = h('h3', { className: 'guestbook-heading' }, COPY.heading);
      if (state.kind === 'closed') {
        // Req 5.6: no configuration, so no field.
        status = null;
        el = h(
          'div',
          { className: 'guestbook' },
          heading,
          h('p', { className: 'guestbook-status is-closed' }, COPY.closed),
        );
        root.appendChild(el);
        render();
        return;
      }
      input = h('input', {
        className: 'field-input guestbook-name',
        attrs: {
          id: INPUT_ID,
          type: 'text',
          maxlength: String(NAME_MAX_LENGTH),
          autocomplete: 'nickname',
          spellcheck: 'false',
        },
        on: {
          input: () => render(),
          // Keys typed here are for the field only (Req 5.7). Enter still submits the form.
          keydown: (e) => e.stopPropagation(),
        },
      });
      input.value = loadName(storage) ?? '';
      signButton = h('button', { className: 'btn guestbook-sign', attrs: { type: 'submit' } }, COPY.sign);
      status = h('p', { className: 'guestbook-status', attrs: { role: 'status' } });
      board = h('div', { className: 'guestbook-board' });
      board.hidden = true;
      const form = h(
        'form',
        {
          className: 'guestbook-form',
          attrs: { novalidate: '' },
          on: {
            submit: (e) => {
              e.preventDefault();
              void sign();
            },
          },
        },
        h('label', { className: 'guestbook-label', attrs: { for: INPUT_ID } }, COPY.nameLabel),
        input,
        signButton,
      );
      el = h(
        'div',
        { className: 'guestbook' },
        heading,
        form,
        h('p', { className: 'guestbook-hint' }, COPY.nameHint),
        status,
        board,
      );
      root.appendChild(el);
      render();
    },
    unmount() {
      if (!el) return;
      generation += 1;
      el.remove();
      el = input = signButton = status = board = null;
    },
  };
}
