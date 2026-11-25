// Guestbook_Form examples (leaderboard Req 5.1–5.8, design "Result_Screen"). The form runs
// against a fake configured Leaderboard_Client whose calls stay pending until the test
// resolves them; the timeout path uses the real client with a fetch that never answers.
import { afterEach, describe, expect, it } from 'vitest';
import { createLeaderboardClient, type ScoreEntry } from '../../../src/core/leaderboard';
import { scoreRun } from '../../../src/game/score';
import { createGuestbookForm, runEntry } from '../../../src/ui/guestbook/guestbookForm';
import { GUESTBOOK_STORAGE_KEY, type StorageSource } from '../../../src/ui/guestbook/guestbookName';
import { RESULT_COPY } from '../../../src/ui/resultCopy';
import { createFakeLeaderboard, flush, row, type FakeLeaderboard } from '../../helpers/leaderboard';
import { finalState } from '../../helpers/score';
import { createFakeStorage, type FakeStorageMode } from '../../helpers/storage';

const COPY = RESULT_COPY.guestbook;
const DAY = '2026-11-25';
const RUN: Omit<ScoreEntry, 'name'> = { score: 1234, outcome: 'lost', seconds: 90, download: 37, kills: 6 };
const stored = (name: string): string => JSON.stringify({ v: 1, name });

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const fn of cleanups.splice(0)) fn();
});

interface SetupOptions {
  readonly fake?: FakeLeaderboard;
  readonly client?: Parameters<typeof createGuestbookForm>[0]['leaderboard'];
  readonly storage?: StorageSource;
  readonly initialName?: string | null;
  readonly mode?: FakeStorageMode;
}

function setup(opts: SetupOptions = {}) {
  const fake = opts.fake ?? createFakeLeaderboard();
  const store = createFakeStorage({
    mode: opts.mode ?? 'ok',
    key: GUESTBOOK_STORAGE_KEY,
    initial: opts.initialName === undefined ? null : opts.initialName === null ? null : stored(opts.initialName),
  });
  const root = document.createElement('div');
  document.body.appendChild(root);
  const form = createGuestbookForm({
    leaderboard: opts.client ?? fake.client,
    storage: opts.storage ?? store.getter,
    run: RUN,
    today: () => DAY,
  });
  form.mount(root);
  cleanups.push(() => {
    form.unmount();
    root.remove();
  });
  const q = <T extends Element = HTMLElement>(sel: string): T | null => root.querySelector<T>(sel);
  const must = <T extends Element = HTMLElement>(sel: string): T => {
    const el = q<T>(sel);
    if (el === null) throw new Error(`missing ${sel}`);
    return el;
  };
  const input = () => must<HTMLInputElement>('.guestbook-name');
  const sign = () => must<HTMLButtonElement>('.guestbook-sign');
  const type = (value: string): void => {
    input().value = value;
    input().dispatchEvent(new Event('input', { bubbles: true }));
  };
  /** Enter in the field: the key event, then the implicit submission a browser performs. */
  const pressEnter = (): void => {
    input().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    must<HTMLFormElement>('.guestbook-form').requestSubmit();
  };
  const status = () => must('.guestbook-status');
  return { fake, store, root, form, q, must, input, sign, type, pressEnter, status };
}

describe('Guestbook_Form: idle (Req 5.1, 5.2, 5.8)', () => {
  it('shows the heading, a field prefilled with the stored name and a Sign button', () => {
    const g = setup({ initialName: 'Calvin' });
    expect(g.must('.guestbook-heading').textContent).toBe('Sign our Guestbook!');
    expect(g.input().value).toBe('Calvin');
    expect(g.input().maxLength).toBe(12);
    expect(g.input().getAttribute('autocomplete')).toBe('nickname');
    expect(g.sign().textContent).toBe(COPY.sign);
    expect(g.sign().type).toBe('submit');
    expect(g.sign().disabled).toBe(false);
    expect(g.status().hidden).toBe(true);
    expect(g.must('.guestbook-board').hidden).toBe(true);
    expect(g.form.state().kind).toBe('idle');
  });

  it('starts empty with Sign disabled when nothing is stored', () => {
    const g = setup();
    expect(g.input().value).toBe('');
    expect(g.sign().disabled).toBe(true);
  });

  it('keeps Sign disabled while the name is invalid', () => {
    const g = setup();
    for (const bad of ['', 'ab', '  ab  ', 'a!b', 'bad<name>', 'x'.repeat(13)]) {
      g.type(bad);
      expect(g.sign().disabled, JSON.stringify(bad)).toBe(true);
    }
    g.type('  Bing  Feng ');
    expect(g.sign().disabled).toBe(false);
    g.type('no');
    expect(g.sign().disabled).toBe(true);
  });

  it('does not submit an invalid name by Enter', async () => {
    const g = setup();
    g.type('ab');
    g.pressEnter();
    await flush();
    expect(g.fake.submits).toHaveLength(0);
    expect(g.form.state().kind).toBe('idle');
  });

  it.each(['nullGetter', 'getterThrows', 'readThrows'] as const)(
    'falls back to an empty field without errors when storage is %s',
    (mode) => {
      const g = setup({ mode, initialName: 'Calvin' });
      expect(g.input().value).toBe('');
      expect(g.sign().disabled).toBe(true);
    },
  );

  it('ignores a bad stored value', () => {
    const store = createFakeStorage({ key: GUESTBOOK_STORAGE_KEY, initial: '{not json' });
    const g = setup({ storage: store.getter });
    expect(g.input().value).toBe('');
  });
});

describe('Guestbook_Form: signing (Req 5.3, 5.4, 5.8)', () => {
  it.each(['click', 'Enter'] as const)('submits once by %s, shows "Signing...", then rank and top 10', async (how) => {
    const g = setup({ initialName: 'Bing' });
    g.type(' Bing   Feng ');
    if (how === 'click') g.sign().click();
    else g.pressEnter();

    expect(g.fake.submits).toEqual([{ name: 'Bing Feng', ...RUN }]);
    expect(g.form.state().kind).toBe('signing');
    expect(g.status().hidden).toBe(false);
    expect(g.status().textContent).toBe('Signing...');
    expect(g.sign().disabled).toBe(true);
    expect(g.input().disabled).toBe(true);

    g.fake.resolveSubmit({ ok: true, value: undefined });
    await flush();
    expect(g.form.state().kind).toBe('done');
    expect(g.status().hidden).toBe(true);
    expect(g.fake.rankCalls).toEqual([{ day: DAY, score: RUN.score }]);
    expect(g.fake.topCalls).toEqual([DAY]);
    expect(JSON.parse(g.store.stored(GUESTBOOK_STORAGE_KEY) ?? 'null')).toEqual({ v: 1, name: 'Bing Feng' });

    g.fake.resolveRank({ ok: true, value: 3 });
    g.fake.resolveTop({
      ok: true,
      value: [row('Ace', 5000, 'won'), row('Bing Feng', 999), row('Bing Feng', 1234), row('Bing Feng', 1234), row('Zed', 10)],
    });
    await flush();
    const board = g.must('.guestbook-board');
    expect(board.hidden).toBe(false);
    expect(g.must('.guestbook-thanks').textContent).toBe(COPY.thanks);
    expect(g.must('.guestbook-rank').textContent).toBe('Your rank today: #3');
    expect(g.must('.guestbook-table caption').textContent).toBe("Today's top 10");
    const rows = [...g.root.querySelectorAll('tbody tr')];
    expect(rows.map((r) => [...r.querySelectorAll('td')].map((td) => td.textContent))).toEqual([
      ['1.', 'Ace', '5000', COPY.won],
      ['2.', 'Bing Feng', '999', COPY.lost],
      ['3.', 'Bing Feng', '1234', COPY.lost],
      ['4.', 'Bing Feng', '1234', COPY.lost],
      ['5.', 'Zed', '10', COPY.lost],
    ]);
    // Only the first name + score match is the new row.
    expect(rows.map((r) => r.classList.contains('is-you'))).toEqual([false, false, true, false, false]);
    expect(g.q('.guestbook-list-busy')).toBeNull();
  });

  it('a double click, repeated Enter and a sign after success still submit once (Req 5.4)', async () => {
    const g = setup({ initialName: 'Calvin' });
    g.sign().click();
    g.sign().click();
    g.pressEnter();
    g.pressEnter();
    expect(g.fake.submits).toHaveLength(1);

    g.fake.resolveSubmit({ ok: true, value: undefined });
    await flush();
    g.sign().click();
    g.pressEnter();
    g.type('Other');
    g.pressEnter();
    await flush();
    expect(g.fake.submits).toHaveLength(1);
    expect(g.sign().disabled).toBe(true);
  });

  it('says the entry was saved when the list fails after a sign', async () => {
    const g = setup({ initialName: 'Calvin' });
    g.sign().click();
    g.fake.resolveSubmit({ ok: true, value: undefined });
    await flush();
    g.fake.resolveRank({ ok: false, reason: 'busy' });
    g.fake.resolveTop({ ok: false, reason: 'busy' });
    await flush();
    expect(g.form.state().kind).toBe('done');
    expect(g.q('.guestbook-rank')).toBeNull();
    expect(g.q('.guestbook-table')).toBeNull();
    expect(g.must('.guestbook-list-busy').textContent).toBe(
      'Your entry was saved, but the list could not be loaded.',
    );
  });

  it('signs without errors when storage writes throw', async () => {
    const g = setup({ mode: 'writeThrows' });
    g.type('Calvin');
    g.sign().click();
    g.fake.resolveSubmit({ ok: true, value: undefined });
    await flush();
    expect(g.form.state().kind).toBe('done');
    expect(g.store.writes).toHaveLength(1);
    expect(g.store.writes[0]!.threw).toBe(true);
  });

  it('puts names in as text, never as markup', async () => {
    const g = setup({ initialName: 'Calvin' });
    g.sign().click();
    g.fake.resolveSubmit({ ok: true, value: undefined });
    await flush();
    const evil = '<img src=x onerror=alert(1)>';
    g.fake.resolveRank({ ok: true, value: 1 });
    g.fake.resolveTop({ ok: true, value: [row(evil, 50), row('Calvin', 1234)] });
    await flush();
    expect(g.root.querySelector('img')).toBeNull();
    expect(g.must('tbody tr .guestbook-row-name').textContent).toBe(evil);
  });
});

describe('Guestbook_Form: failure (Req 5.5)', () => {
  it('shows the busy text and allows exactly one more try', async () => {
    const g = setup({ initialName: 'Calvin' });
    g.sign().click();
    g.fake.resolveSubmit({ ok: false, reason: 'busy' });
    await flush();
    expect(g.form.state()).toEqual({ kind: 'failed', retryLeft: 1 });
    expect(g.status().hidden).toBe(false);
    expect(g.status().textContent).toBe('Server busy. Try again later.');
    expect(g.sign().disabled).toBe(false);
    expect(g.input().disabled).toBe(false);
    expect(g.store.writes).toHaveLength(0);

    g.pressEnter();
    expect(g.fake.submits).toHaveLength(2);
    expect(g.status().textContent).toBe('Signing...');
    g.fake.resolveSubmit({ ok: false, reason: 'rejected' });
    await flush();
    expect(g.form.state()).toEqual({ kind: 'failed', retryLeft: 0 });
    expect(g.status().textContent).toBe('Server busy. Try again later.');
    expect(g.sign().disabled).toBe(true);
    expect(g.input().disabled).toBe(true);

    g.sign().click();
    g.pressEnter();
    await flush();
    expect(g.fake.submits).toHaveLength(2);
    expect(g.fake.rankCalls).toHaveLength(0);
  });

  it('a retry that succeeds shows the board', async () => {
    const g = setup({ initialName: 'Calvin' });
    g.sign().click();
    g.fake.resolveSubmit({ ok: false, reason: 'offline' });
    await flush();
    g.sign().click();
    g.fake.resolveSubmit({ ok: true, value: undefined });
    await flush();
    expect(g.form.state().kind).toBe('done');
    expect(g.fake.submits).toHaveLength(2);
  });

  it('shows the busy text when the request times out', async () => {
    // A fetch that never answers; it only rejects when the client aborts it.
    const hanging: typeof fetch = (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      });
    const client = createLeaderboardClient({ url: 'https://example.supabase.co', key: 'sb_publishable_test' }, hanging, 10);
    const g = setup({ client, initialName: 'Calvin' });
    g.sign().click();
    expect(g.status().textContent).toBe('Signing...');
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(g.form.state()).toEqual({ kind: 'failed', retryLeft: 1 });
    expect(g.status().textContent).toBe('Server busy. Try again later.');
  });
});

describe('Guestbook_Form: no configuration (Req 5.6)', () => {
  it('shows the maintenance text and no field', () => {
    const g = setup({ client: createLeaderboardClient(null), initialName: 'Calvin' });
    expect(g.must('.guestbook-heading').textContent).toBe('Sign our Guestbook!');
    expect(g.must('.guestbook-status.is-closed').textContent).toBe('Guestbook closed for maintenance.');
    expect(g.q('input')).toBeNull();
    expect(g.q('form')).toBeNull();
    expect(g.q('button')).toBeNull();
    expect(g.form.state().kind).toBe('closed');
  });
});

describe('Guestbook_Form: keys and lifecycle (Req 5.7)', () => {
  it('keys typed in the field never reach document or window listeners', () => {
    const g = setup();
    const seen: string[] = [];
    const onKey = (e: KeyboardEvent): void => {
      seen.push(e.key);
    };
    document.addEventListener('keydown', onKey);
    window.addEventListener('keydown', onKey);
    try {
      for (const key of ['1', '2', '3', '4', '5', 'q', 'Q', 'e', 'E', 'Escape', 'Enter', ' ']) {
        g.input().dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
      }
      expect(seen).toEqual([]);
      // Keys elsewhere still reach them.
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: '1', bubbles: true }));
      expect(seen).toEqual(['1', '1']);
    } finally {
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('keydown', onKey);
    }
  });

  it('never takes focus', () => {
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    outside.focus();
    setup({ initialName: 'Calvin' });
    expect(document.activeElement).toBe(outside);
    outside.remove();
  });

  it('drops a submit result that arrives after unmount', async () => {
    const g = setup({ initialName: 'Calvin' });
    g.sign().click();
    g.form.unmount();
    expect(g.root.childElementCount).toBe(0);
    g.fake.resolveSubmit({ ok: true, value: undefined });
    await flush();
    expect(g.fake.rankCalls).toHaveLength(0);
    expect(g.fake.topCalls).toHaveLength(0);
    expect(g.store.writes).toHaveLength(0);
    expect(g.root.childElementCount).toBe(0);
  });

  it('drops a list result that arrives after unmount', async () => {
    const g = setup({ initialName: 'Calvin' });
    g.sign().click();
    g.fake.resolveSubmit({ ok: true, value: undefined });
    await flush();
    g.form.unmount();
    g.fake.resolveRank({ ok: true, value: 1 });
    g.fake.resolveTop({ ok: true, value: [row('Calvin', 1234)] });
    await flush();
    expect(g.root.childElementCount).toBe(0);
  });
});

describe('runEntry', () => {
  it('takes the score, outcome, whole seconds, whole download and kills from the Final_State', () => {
    const lost = finalState({ phase: 'lost', tick: 5432, download: 37.8, integrity: 0, stats: { kills: 6, bossKilled: false, adsClosed: 2 } });
    expect(runEntry(lost, scoreRun(lost).total)).toEqual({
      score: scoreRun(lost).total,
      outcome: 'lost',
      seconds: 90,
      download: 37,
      kills: 6,
    });
    const won = finalState({ phase: 'won', tick: 9060, download: 100, integrity: 40, stats: null });
    expect(runEntry(won, 2000)).toEqual({ score: 2000, outcome: 'won', seconds: 151, download: 100, kills: 0 });
  });
});
