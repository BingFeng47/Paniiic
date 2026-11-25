// Hall_of_Fame window examples (leaderboard Req 7.2–7.4): loading and failure text, the two
// tables with names as literal text, the zero-padded guest counter, close via ✕ / Close / Escape,
// late results dropped after unmount, and no fast animation in its styles.
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createLeaderboardClient, type LeaderboardClient, type Result, type ScoreRow } from '../../../src/core/leaderboard';
import type { Mountable } from '../../../src/core/scene';
import { counterText, createHallOfFame } from '../../../src/scenes/title/hallOfFame';
import { HALL_OF_FAME_COPY as COPY } from '../../../src/scenes/title/titleCopy';
import { trackListeners, type ListenerTracker } from '../../helpers/dom';
import { loadRepoFiles, stripComments, type RepoFiles } from '../../helpers/repo';

type HofClient = Pick<LeaderboardClient, 'topToday' | 'topAllTime' | 'guestCount'>;
type Rows = Result<readonly ScoreRow[]>;

interface Deferred<T> {
  readonly promise: Promise<T>;
  resolve(value: T): void;
  reject(reason: unknown): void;
}
function deferred<T>(): Deferred<T> {
  let resolve!: (v: T) => void;
  let reject!: (r: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** A fake client whose three answers the test settles by hand, recording the requested days. */
function createFakeClient() {
  const today = deferred<Rows>();
  const allTime = deferred<Rows>();
  const count = deferred<Result<number>>();
  const days: string[] = [];
  const client: HofClient = {
    topToday: (day) => {
      days.push(day);
      return today.promise;
    },
    topAllTime: () => allTime.promise,
    guestCount: () => count.promise,
  };
  return { client, today, allTime, count, days };
}

const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

const row = (name: string, score: number, outcome: 'won' | 'lost' = 'won'): ScoreRow => ({
  name,
  score,
  outcome,
  seconds: 190,
  download: outcome === 'won' ? 100 : 40,
  kills: 30,
  createdAt: '2026-11-25T10:00:00Z',
});

let trackers: ListenerTracker[] = [];
const hosts: HTMLElement[] = [];
const windows: Mountable[] = [];

afterEach(() => {
  for (const w of windows.splice(0)) w.unmount();
  for (const t of trackers.reverse()) t.restore();
  trackers = [];
  for (const host of hosts.splice(0)) host.remove();
});

function setup(client: HofClient, today: () => string = () => '2026-11-25') {
  const doc = trackListeners(document);
  trackers.push(doc);
  const root = document.createElement('div');
  document.body.appendChild(root);
  hosts.push(root);
  let closes = 0;
  const hof = createHallOfFame({ leaderboard: client, today, onClose: () => (closes += 1) });
  hof.mount(root);
  windows.push(hof);
  const q = <T extends Element>(selector: string): T => {
    const el = root.querySelector<T>(selector);
    if (el === null) throw new Error(`missing ${selector}`);
    return el;
  };
  return { root, doc, hof, q, closes: () => closes };
}

const statusOf = (t: ReturnType<typeof setup>) => t.q<HTMLElement>('.hof-status');
const listsOf = (t: ReturnType<typeof setup>) => t.q<HTMLElement>('.hof-lists');
const digitsOf = (t: ReturnType<typeof setup>) => t.q<HTMLElement>('.hof-counter-digits').textContent;

describe('Hall_of_Fame window', () => {
  it('opens as a modal NetSurfer window with focus on Close and "Loading guestbook..." (Req 7.2, 7.3)', () => {
    const f = createFakeClient();
    const t = setup(f.client);
    const dialog = t.q<HTMLElement>('.hof-dialog');
    expect(dialog.getAttribute('role')).toBe('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(t.q('#hof-title').textContent).toBe(COPY.title);
    expect(document.activeElement).toBe(t.q('.hof-buttons button'));

    expect(statusOf(t).hidden).toBe(false);
    expect(statusOf(t).textContent).toBe(COPY.loading);
    expect(listsOf(t).hidden).toBe(true);
    expect(digitsOf(t)).toBe('------');
    expect(f.days).toEqual(['2026-11-25']);
  });

  it('renders both top lists with names as literal text and a zero-padded counter (Req 7.2, 7.4)', async () => {
    const f = createFakeClient();
    const t = setup(f.client);
    const sneaky = '<b>x</b>';
    f.today.resolve({ ok: true, value: [row('BingFeng47', 4200), row(sneaky, 900, 'lost')] });
    f.allTime.resolve({ ok: true, value: [row('Calvin', 5100)] });
    f.count.resolve({ ok: true, value: 42 });
    await flush();

    expect(statusOf(t).hidden).toBe(true);
    expect(listsOf(t).hidden).toBe(false);
    expect(digitsOf(t)).toBe('000042');
    expect(t.q('.hof-counter-digits').querySelectorAll('.hof-digit')).toHaveLength(6);

    const todayTable = t.q<HTMLTableElement>('.hof-today');
    expect(todayTable.caption?.textContent).toBe(COPY.today);
    const cells = [...todayTable.tBodies[0]!.rows].map((r) => [...r.cells].map((c) => c.textContent));
    expect(cells).toEqual([
      ['1.', 'BingFeng47', '4200', COPY.won],
      ['2.', sneaky, '900', COPY.lost],
    ]);
    // The HTML-looking name stays text: no <b> element was created.
    expect(todayTable.querySelector('b')).toBeNull();

    const allTable = t.q<HTMLTableElement>('.hof-alltime');
    expect(allTable.caption?.textContent).toBe(COPY.allTime);
    expect(allTable.querySelector('.hof-name')?.textContent).toBe('Calvin');
  });

  it('shows the empty line for an empty list', async () => {
    const f = createFakeClient();
    const t = setup(f.client);
    f.today.resolve({ ok: true, value: [] });
    f.allTime.resolve({ ok: true, value: [row('Calvin', 5100)] });
    await flush();
    expect(t.q('.hof-today .hof-empty').textContent).toBe(COPY.empty);
  });

  it('shows counts wider than the counter in full', () => {
    expect(counterText(0)).toBe('000000');
    expect(counterText(1234567)).toBe('1234567');
    expect(counterText(null)).toBe('------');
  });

  it('shows "Server busy. Try again later." when a list request fails (Req 7.3)', async () => {
    for (const fail of ['today', 'allTime'] as const) {
      const f = createFakeClient();
      const t = setup(f.client);
      f[fail].resolve({ ok: false, reason: 'busy' });
      const other = fail === 'today' ? f.allTime : f.today;
      other.resolve({ ok: true, value: [row('Calvin', 5100)] });
      await flush();
      expect(statusOf(t).hidden).toBe(false);
      expect(statusOf(t).textContent).toBe(COPY.busy);
      expect(listsOf(t).hidden).toBe(true);
      expect(t.root.querySelector('.hof-table')).toBeNull();
      t.hof.unmount();
    }
  });

  it('shows the busy text for a rejected request and a client that rejects', async () => {
    const rejected = createFakeClient();
    const a = setup(rejected.client);
    rejected.today.resolve({ ok: false, reason: 'rejected' });
    rejected.allTime.resolve({ ok: true, value: [] });
    await flush();
    expect(statusOf(a).textContent).toBe(COPY.busy);
    a.hof.unmount();

    const throwing = createFakeClient();
    const b = setup(throwing.client);
    throwing.today.reject(new Error('boom'));
    throwing.allTime.resolve({ ok: true, value: [] });
    throwing.count.reject(new Error('boom'));
    await flush();
    expect(statusOf(b).textContent).toBe(COPY.busy);
    expect(digitsOf(b)).toBe('------');
  });

  it('shows the maintenance text with the unconfigured (offline) client', async () => {
    const t = setup(createLeaderboardClient(null));
    await flush();
    expect(statusOf(t).textContent).toBe(COPY.offline);
    expect(COPY.offline).toBe('Guestbook closed for maintenance.');
    expect(digitsOf(t)).toBe('------');
  });

  it('calls onClose from ✕, Close and Escape, and ignores other keys (Req 7.2)', () => {
    const t = setup(createFakeClient().client);
    t.q<HTMLButtonElement>('.title-bar-close').click();
    expect(t.closes()).toBe(1);
    t.q<HTMLButtonElement>('.hof-buttons button').click();
    expect(t.closes()).toBe(2);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(t.closes()).toBe(2);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(t.closes()).toBe(3);
  });

  it('removes its elements and the Escape listener on unmount, without calling onClose', () => {
    const t = setup(createFakeClient().client);
    expect(t.doc.count('keydown')).toBe(1);
    t.hof.unmount();
    expect(t.doc.count()).toBe(0);
    expect(t.root.children).toHaveLength(0);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(t.closes()).toBe(0);
  });

  it('drops results that arrive after unmount, and a remount loads afresh', async () => {
    const first = createFakeClient();
    let client: HofClient = first.client;
    const proxy: HofClient = {
      topToday: (d) => client.topToday(d),
      topAllTime: () => client.topAllTime(),
      guestCount: () => client.guestCount(),
    };
    const t = setup(proxy);
    const status = statusOf(t);
    const lists = listsOf(t);
    const digits = t.q<HTMLElement>('.hof-counter-digits');
    t.hof.unmount();
    first.today.resolve({ ok: true, value: [row('Late', 10)] });
    first.allTime.resolve({ ok: true, value: [] });
    first.count.resolve({ ok: true, value: 7 });
    await flush();
    expect(status.textContent).toBe(COPY.loading);
    expect(lists.childElementCount).toBe(0);
    expect(digits.textContent).toBe('------');

    // Remount with a fresh, still-pending client: the old results must not show up either.
    const second = createFakeClient();
    client = second.client;
    t.hof.mount(t.root);
    await flush();
    expect(statusOf(t).textContent).toBe(COPY.loading);
    expect(digitsOf(t)).toBe('------');
    second.today.resolve({ ok: true, value: [row('Fresh', 20)] });
    second.allTime.resolve({ ok: true, value: [] });
    await flush();
    expect(t.q('.hof-today .hof-name').textContent).toBe('Fresh');
  });
});

describe('Hall_of_Fame styles', () => {
  let repo: RepoFiles;
  beforeAll(async () => {
    repo = await loadRepoFiles();
  });

  // Req 7.4: nothing in the window may flash more than 3 times per second. The window has no
  // animation at all, so any `animation` on a `.hof-` rule other than `none` fails this check.
  it('gives no .hof- rule an animation or a blink', () => {
    const css = stripComments(repo.read('src/styles/title.css'), 'css');
    const hofRules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter((m) => m[1]!.includes('hof'));
    expect(hofRules.length).toBeGreaterThan(0);
    for (const [, selector, body] of hofRules) {
      const animations = [...body!.matchAll(/animation[-\w]*\s*:\s*([^;]+)/g)].map((m) => m[1]!.trim());
      expect(animations.filter((v) => v !== 'none'), selector!.trim()).toEqual([]);
      expect(body, selector!.trim()).not.toMatch(/text-decoration[^;]*blink/);
    }
  });
});
