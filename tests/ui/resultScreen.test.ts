// Result_Screen examples (title-and-endings design "src/ui/resultScreen.ts" and "Testing
// Strategy"; Req 8.5, 8.6, 9.1, 9.2, 10.1, 10.2, 11.1, 11.2, 11.4, 12.2). The timeline maths is
// covered by Properties 12 and 13 in tests/ui/resultScript.test.ts; these tests check the DOM,
// sounds, focus and lifecycle on top of it.
import fc from 'fast-check';
import { afterEach, describe, expect, it } from 'vitest';
import { createLeaderboardClient } from '../../src/core/leaderboard';
import { scoreRun } from '../../src/game/score';
import type { GameState } from '../../src/game/types';
import { RESULT_COPY } from '../../src/ui/resultCopy';
import { createResultScreen, type ResultScreenDeps } from '../../src/ui/resultScreen';
import { SCORE_TABLE } from '../../src/game/balance/score';
import { GUESTBOOK_STORAGE_KEY, type StorageSource } from '../../src/ui/guestbook/guestbookName';
import { createFakeLeaderboard, flush } from '../helpers/leaderboard';
import { finalState } from '../helpers/score';
import { createFakeStorage } from '../helpers/storage';
import { RESULT_SOUND_SEC } from '../../src/ui/resultSounds';
import { createFakeAudioEngine } from '../helpers/audio';
import { trackListeners, type ListenerTracker } from '../helpers/dom';
import { fastSchedule, runLane } from '../helpers/lane';
import { createManualLoop } from '../helpers/loop';

/** Ticks until the reveal: 1,200 ms and 1,500 ms at 60 ticks per second. */
const WIN_REVEAL_TICKS = 72;
const LOSE_REVEAL_TICKS = 90;

/** A real Run's state after 300 ticks, used as the base for both endings. */
const BASE: GameState = runLane({ seed: 7, spawns: fastSchedule(), ticks: 300, actions: [] }).final;

/** Won at 2:31 with 37.2 integrity left (the HUD rounds up to 38%). */
const WON: GameState = { ...BASE, phase: 'won', tick: 9060, integrity: 37.2, download: 100 };
/** Lost at 1:30 (5,432 ticks) with the download frozen at 37.8 (shown as 37%). */
const LOST: GameState = { ...BASE, phase: 'lost', tick: 5432, integrity: 0, download: 37.8 };

interface GuestbookDeps {
  readonly leaderboard?: ResultScreenDeps['leaderboard'];
  readonly storage?: StorageSource;
}

let trackers: ListenerTracker[] = [];
const hosts: HTMLElement[] = [];
const cleanups: Array<() => void> = [];

afterEach(() => {
  for (const fn of cleanups.splice(0)) fn();
  for (const t of trackers.reverse()) t.restore();
  trackers = [];
  for (const host of hosts.splice(0)) host.remove();
});

/** Mounts a Result_Screen for `final` into a root attached to `document.body` (focus needs it). */
function setup(final: GameState, guestbook: GuestbookDeps = {}) {
  const doc = trackListeners(document);
  const win = trackListeners(window);
  trackers.push(doc, win);
  const root = document.createElement('div');
  document.body.appendChild(root);
  hosts.push(root);

  const audio = createFakeAudioEngine();
  const loop = createManualLoop();
  const calls: Array<'retry' | 'mainMenu'> = [];
  const screen = createResultScreen({
    final,
    audio,
    startLoop: loop.start,
    leaderboard: guestbook.leaderboard ?? createLeaderboardClient(null), // offline by default
    storage: guestbook.storage ?? (() => null),
    today: () => '2026-11-25',
    onRetry: () => {
      calls.push('retry');
    },
    onMainMenu: () => {
      calls.push('mainMenu');
    },
  });
  screen.mount(root);
  cleanups.push(() => screen.unmount());

  const q = <T extends Element = HTMLElement>(selector: string): T | null =>
    root.querySelector<T>(selector);
  const must = <T extends Element = HTMLElement>(selector: string): T => {
    const el = q<T>(selector);
    if (el === null) throw new Error(`missing ${selector}`);
    return el;
  };
  return {
    root,
    doc,
    win,
    audio,
    loop,
    screen,
    q,
    must,
    calls: () => [...calls],
    retries: () => calls.filter((c) => c === 'retry').length,
    mainMenus: () => calls.filter((c) => c === 'mainMenu').length,
  };
}

type Harness = ReturnType<typeof setup>;

/** The reveal-only parts that must not exist during the intro. */
const REVEAL_PARTS = [
  '.result-retry',
  '.result-main-menu', '.result-headline', '.result-file', '.result-stats', '.result-message'];

function expectNoRevealParts(h: Harness): void {
  for (const selector of REVEAL_PARTS) expect(h.q(selector), selector).toBeNull();
}

/** The three statistics as [label, value] pairs (Req 8.6). */
function stats(h: Harness): string[][] {
  const dl = h.must('.result-stats');
  const dts = [...dl.querySelectorAll('dt')].map((e) => e.textContent);
  const dds = [...dl.querySelectorAll('dd')].map((e) => e.textContent);
  return dts.map((label, i) => [label ?? '', dds[i] ?? '']);
}

describe('Result_Screen: win', () => {
  it('opens with a full "Download complete" bar and the handshake chime (Req 9.1)', () => {
    const h = setup(WON);
    const screen = h.must('.result-screen');
    expect(screen.classList.contains('is-won')).toBe(true);
    expect(screen.getAttribute('role')).toBe('dialog');
    expect(screen.getAttribute('aria-modal')).toBe('true');
    expect(h.q('.result-static')).toBeNull();

    const windowEl = h.must('.result-window');
    expect(windowEl.hasAttribute('hidden')).toBe(false);
    expect(h.must('#result-title').textContent).toBe(RESULT_COPY.won.windowTitle);
    expect(h.must('.result-status').textContent).toBe('Download complete');
    expect(h.must('.result-bar-fill').style.width).toBe('100%');
    expect(h.must('.result-bar-text').textContent).toBe('100%');
    expectNoRevealParts(h);

    expect(h.audio.played()).toEqual(['handshakeChime']);
    expect(h.audio.voices[0]!.channel).toBe('sfx');
    expect(h.audio.voices[0]!.durationSec).toBe(RESULT_SOUND_SEC.handshakeChime);
    expect(h.loop.isRunning()).toBe(true);
  });

  it('reveals the headline, file, stats and a focused Back button at 72 ticks, not 71 (Req 9.2, 11.1, 8.5)', () => {
    const h = setup(WON);
    h.loop.frame(WIN_REVEAL_TICKS - 1);
    expectNoRevealParts(h);
    expect(h.loop.isRunning()).toBe(true);

    h.loop.frame(1);
    expect(h.must('.result-headline').textContent).toBe('Welcome to the Internet!');
    expect(h.must('.result-file-name').textContent).toBe('funny_cats_1998.avi');
    expect(h.must('.result-file-note').textContent).toBe(RESULT_COPY.won.fileNote);
    expect(stats(h)).toEqual([
      [RESULT_COPY.stats.time, '2:31'],
      [RESULT_COPY.stats.integrity, '38%'],
      [RESULT_COPY.stats.download, '100%'],
    ]);
    const retry = h.must<HTMLButtonElement>('.result-retry');
    expect(retry.textContent).toBe('Retry');
    expect(h.must<HTMLButtonElement>('.result-main-menu').textContent).toBe('Main menu');
    expect(document.activeElement).toBe(retry);
    // The bar is still full and the loop has stopped (design D14).
    expect(h.root.querySelectorAll('.result-bar')).toHaveLength(1);
    expect(h.must('.result-bar-fill').style.width).toBe('100%');
    expect(h.loop.isRunning()).toBe(false);
    expect(h.loop.stopCount()).toBe(1);
  });
});

describe('Result_Screen: loss', () => {
  it('opens with the static, "NO CARRIER", both sounds and a hidden window (Req 10.1)', () => {
    const h = setup(LOST);
    expect(h.must('.result-screen').classList.contains('is-lost')).toBe(true);

    const staticEl = h.must('.result-static');
    expect(staticEl.hasAttribute('hidden')).toBe(false);
    expect(staticEl.getAttribute('aria-hidden')).toBe('true');
    expect(h.must('.result-static-text').textContent).toBe('NO CARRIER');
    expect(h.must('.result-window').hasAttribute('hidden')).toBe(true);
    expect(h.must('#result-title').textContent).toBe(RESULT_COPY.lost.windowTitle);
    expect(h.q('.result-bar')).toBeNull();
    expectNoRevealParts(h);

    expect(h.audio.played()).toEqual(['modemScreech', 'staticHiss']);
    expect(h.audio.voices.map((v) => v.channel)).toEqual(['sfx', 'sfx']);
    expect(h.audio.activeVoices()).toHaveLength(2);
    expect(h.loop.isRunning()).toBe(true);
  });

  it('ends the static and shows the termination dialog at 90 ticks, not 89 (Req 10.2, 11.1, 8.5)', () => {
    const h = setup(LOST);
    h.loop.frame(LOSE_REVEAL_TICKS - 1);
    expectNoRevealParts(h);
    expect(h.must('.result-static').hasAttribute('hidden')).toBe(false);
    expect(h.must('.result-window').hasAttribute('hidden')).toBe(true);

    h.loop.frame(1);
    expect(h.must('.result-static').hasAttribute('hidden')).toBe(true);
    expect(h.must('.result-window').hasAttribute('hidden')).toBe(false);
    expect(h.must('.result-message').textContent).toBe(
      'The connection was terminated by the remote computer.',
    );
    expect(h.must('.result-bar-fill').style.width).toBe('37%');
    expect(h.must('.result-bar-text').textContent).toBe('37%');
    expect(h.must('.result-bar').getAttribute('aria-valuenow')).toBe('37');
    expect(h.must('.result-file-name').textContent).toBe('SKELETON_DATING_SIM.EXE');
    expect(h.q('.result-headline')).toBeNull();
    expect(stats(h)).toEqual([
      [RESULT_COPY.stats.time, '1:30'],
      [RESULT_COPY.stats.integrity, '0%'],
      [RESULT_COPY.stats.download, '37%'],
    ]);
    expect(document.activeElement).toBe(h.must('.result-retry'));
    expect(h.loop.isRunning()).toBe(false);
  });
});

describe('Result_Screen: timeline', () => {
  it.each([
    ['won', WON, WIN_REVEAL_TICKS],
    ['lost', LOST, LOSE_REVEAL_TICKS],
  ] as const)('zero-tick frames change nothing (%s, Req 8.5)', (_name, final, revealTicks) => {
    const h = setup(final);
    const before = h.root.innerHTML;
    for (let i = 0; i < 500; i++) h.loop.frame(0);
    expect(h.root.innerHTML).toBe(before);
    expect(h.loop.isRunning()).toBe(true);

    // Single-tick frames still reveal on exactly the script's tick.
    for (let i = 0; i < revealTicks - 1; i++) h.loop.frame(1);
    expectNoRevealParts(h);
    h.loop.frame(0);
    expectNoRevealParts(h);
    h.loop.frame(1);
    expect(h.q('.result-retry')).not.toBeNull();

    // Frames after the reveal do nothing either.
    const revealed = h.root.innerHTML;
    h.loop.frame(0);
    h.loop.frame(500);
    expect(h.root.innerHTML).toBe(revealed);
    expect(h.root.querySelectorAll('.result-retry')).toHaveLength(1);
  });
});

describe('Result_Screen: Result_Buttons (replay-flow Req 1.1-1.4)', () => {
  const BUTTONS = { retry: '.result-retry', mainMenu: '.result-main-menu' } as const;
  type Choice = keyof typeof BUTTONS;
  type How = 'click' | 'Enter' | ' ';

  /**
   * Activates a Result_Button. Enter and Space are sent as real key events first; a browser then
   * activates a focused <button> with a click event, which jsdom does not synthesise, so the
   * click is dispatched after the key events.
   */
  function activate(h: Harness, which: Choice, how: How): void {
    const btn = h.must<HTMLButtonElement>(BUTTONS[which]);
    btn.focus();
    if (how !== 'click') {
      btn.dispatchEvent(new KeyboardEvent('keydown', { key: how, bubbles: true }));
      btn.dispatchEvent(new KeyboardEvent('keyup', { key: how, bubbles: true }));
    }
    btn.click();
  }

  it('shows Retry then Main menu as real buttons and no Back button (Req 1.1)', () => {
    const h = setup(WON);
    h.loop.frame(WIN_REVEAL_TICKS);
    const buttons = [...h.must('.result-buttons').querySelectorAll('button')];
    expect(buttons.map((b) => b.textContent)).toEqual(['Retry', 'Main menu']);
    for (const b of buttons) expect(b.type).toBe('button');
    expect(h.q('.result-back')).toBeNull();
  });

  it.each([
    ['retry', 'click'],
    ['retry', 'Enter'],
    ['retry', ' '],
    ['mainMenu', 'click'],
    ['mainMenu', 'Enter'],
    ['mainMenu', ' '],
  ] as const)('calls only the %s action on %j (Req 1.3)', (which, how) => {
    const h = setup(LOST);
    h.loop.frame(LOSE_REVEAL_TICKS);
    expect(h.calls()).toEqual([]);
    activate(h, which, how);
    expect(h.calls()).toEqual([which]);
  });

  it('ignores a second activation (Req 1.4)', () => {
    const h = setup(LOST);
    h.loop.frame(LOSE_REVEAL_TICKS);
    h.must<HTMLButtonElement>('.result-retry').click();
    h.must<HTMLButtonElement>('.result-retry').click();
    h.must<HTMLButtonElement>('.result-main-menu').click();
    expect(h.retries()).toBe(1);
    expect(h.mainMenus()).toBe(0);
  });

  // Property 3: replay-flow Req 1.3, 1.4 one activation per Result_Screen.
  // **Validates: Requirements 1.3, 1.4**
  it('Property 3: any activation sequence calls exactly one action, the first one', () => {
    const step = fc.record({
      which: fc.constantFrom<Choice>('retry', 'mainMenu'),
      how: fc.constantFrom<How>('click', 'Enter', ' '),
    });
    fc.assert(
      fc.property(fc.constantFrom(WON, LOST), fc.array(step, { minLength: 1, maxLength: 12 }), (final, seq) => {
        const h = setup(final);
        try {
          h.loop.frame(final.phase === 'won' ? WIN_REVEAL_TICKS : LOSE_REVEAL_TICKS);
          for (const s of seq) activate(h, s.which, s.how);
          expect(h.calls()).toEqual([seq[0]!.which]);
        } finally {
          h.screen.unmount();
          h.root.remove();
        }
      }),
      { numRuns: 100 },
    );
  });
});

describe('Result_Screen: unmount', () => {

  it.each([
    ['during the intro', 0],
    ['after the reveal', LOSE_REVEAL_TICKS],
  ] as const)(
    'unmount %s stops the loop and every Voice, removes the elements and leaves no listeners (Req 11.4, 12.2)',
    (_name, ticks) => {
      const h = setup(LOST);
      if (ticks > 0) h.loop.frame(ticks);
      expect(h.audio.voices).toHaveLength(2);

      h.screen.unmount();
      expect(h.loop.isRunning()).toBe(false);
      expect(h.audio.voices.every((v) => v.stopped())).toBe(true);
      expect(h.root.childElementCount).toBe(0);
      expect(h.doc.count()).toBe(0);
      expect(h.win.count()).toBe(0);

      // A second unmount is harmless and plays or stops nothing new.
      const logLength = h.audio.log.length;
      h.screen.unmount();
      expect(h.audio.log).toHaveLength(logLength);
    },
  );

  it('unmount after a win stops the chime and removes the overlay (Req 11.2, 11.4)', () => {
    const h = setup(WON);
    h.loop.frame(WIN_REVEAL_TICKS);
    h.must<HTMLButtonElement>('.result-retry').click();
    h.screen.unmount();
    expect(h.audio.activeVoices()).toHaveLength(0);
    expect(h.root.querySelector('.result-screen')).toBeNull();
    expect(h.doc.count()).toBe(0);
    expect(h.win.count()).toBe(0);
  });
});

// Smoke check for the Receipt (leaderboard Req 4.1, 4.2). Full receipt tests are task 5.4.
describe('Result_Screen: receipt smoke', () => {
  it.each([
    ['won', WON, WIN_REVEAL_TICKS],
    ['lost', LOST, LOSE_REVEAL_TICKS],
  ] as const)('shows the bill below the stats and above the guestbook mount (%s)', (_name, final, ticks) => {
    const h = setup(final);
    expect(h.q('.result-receipt')).toBeNull();
    h.loop.frame(ticks);
    const receipt = h.must('.result-receipt');
    expect(h.must('.result-receipt-from').textContent).toBe('NetSurfer Billing Dept.');
    const score = scoreRun(final);
    const shown = [...receipt.querySelectorAll<HTMLElement>('.result-receipt-line')].map((e) => e.dataset.line);
    expect(shown).toEqual(score.lines.filter((l) => l.points !== 0).map((l) => l.id));
    expect(h.must('.result-receipt-total .result-receipt-points').textContent).toContain(
      String(score.total).replace(/\B(?=(\d{3})+(?!\d))/g, ','),
    );
    const order = [...h.must('.result-window .window-body').children].map((e) => e.className);
    const at = (c: string) => order.findIndex((name) => name.split(' ').includes(c));
    expect(at('result-stats')).toBeLessThan(at('result-receipt'));
    expect(at('result-receipt')).toBeLessThan(at('result-guestbook'));
    expect(at('result-guestbook')).toBeLessThan(at('result-buttons'));
    expect(document.activeElement).toBe(h.must('.result-retry'));
  });
});

// Receipt (leaderboard Req 4.1, 4.2): every line's points from SCORE_TABLE, worked out by hand.
describe('Result_Screen: receipt', () => {
  const T = SCORE_TABLE;
  const RECEIPT_WON = finalState({
    phase: 'won',
    tick: 9060, // 151 s
    download: 100,
    integrity: 37.2, // counts as 38
    stats: { kills: 7, bossKilled: true, adsClosed: 4 },
    bestCombo: 5,
  });
  const RECEIPT_LOST = finalState({
    phase: 'lost',
    tick: 5432,
    download: 37.8, // counts as 37
    integrity: 0,
    stats: { kills: 3, bossKilled: false, adsClosed: 0 },
    bestCombo: 2, // below comboMin
  });
  const L = RESULT_COPY.receipt.lines;
  const pts = (n: number): string => `${String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',')} pts`;

  function lines(h: Harness): Array<[string, string, string]> {
    return [...h.root.querySelectorAll<HTMLElement>('.result-receipt-line')].map((e) => [
      e.dataset.line ?? '',
      e.querySelector('.result-receipt-label')?.textContent ?? '',
      e.querySelector('.result-receipt-points')?.textContent ?? '',
    ]);
  }

  it('prints every part of a win with its points and the total', () => {
    const h = setup(RECEIPT_WON);
    h.loop.frame(WIN_REVEAL_TICKS);
    const expected: Array<[string, number]> = [
      ['download', 100 * T.perPercent],
      ['kills', 7 * T.perKill],
      ['boss', T.boss],
      ['ads', 4 * T.perAd],
      ['combo', 5 * T.perCombo],
      ['win', T.winBase],
      ['integrity', 38 * T.perIntegrity],
      ['speed', (T.parSeconds - 151) * T.perSecondUnder],
    ];
    expect(lines(h)).toEqual(expected.map(([id, p]) => [id, L[id as keyof typeof L], pts(p)]));
    const total = expected.reduce((s, [, p]) => s + p, 0);
    expect(total).toBe(3300);
    expect(h.must('.result-receipt-total .result-receipt-label').textContent).toBe(RESULT_COPY.receipt.total);
    expect(h.must('.result-receipt-total .result-receipt-points').textContent).toBe('3,300 pts');
  });

  it('leaves out the zero parts of a loss', () => {
    const h = setup(RECEIPT_LOST);
    h.loop.frame(LOSE_REVEAL_TICKS);
    expect(lines(h)).toEqual([
      ['download', L.download, pts(37 * T.perPercent)],
      ['kills', L.kills, pts(3 * T.perKill)],
    ]);
    expect(h.must('.result-receipt-total .result-receipt-points').textContent).toBe(pts(400));
    expect(h.must('.result-receipt-from').textContent).toBe('NetSurfer Billing Dept.');
  });

  it.each([
    ['won', RECEIPT_WON, WIN_REVEAL_TICKS],
    ['lost', RECEIPT_LOST, LOSE_REVEAL_TICKS],
  ] as const)('orders stats, receipt, guestbook, buttons (%s)', (_name, final, ticks) => {
    const h = setup(final, { leaderboard: createFakeLeaderboard().client });
    h.loop.frame(ticks);
    const order = [...h.must('.result-window .window-body').children].map((e) => e.className);
    const at = (c: string) => order.findIndex((name) => name.split(' ').includes(c));
    expect(at('result-stats')).toBeGreaterThanOrEqual(0);
    expect(at('result-stats')).toBeLessThan(at('result-receipt'));
    expect(at('result-receipt')).toBeLessThan(at('result-guestbook'));
    expect(at('result-guestbook')).toBeLessThan(at('result-buttons'));
    expect(h.must('.result-guestbook .guestbook-heading').textContent).toBe('Sign our Guestbook!');
  });
});

// Guestbook_Form inside the Result_Screen (leaderboard Req 5.1, 5.3, 5.6, 5.7).
describe('Result_Screen: guestbook', () => {
  const FINAL = finalState({
    phase: 'lost',
    tick: 5432,
    download: 37.8,
    integrity: 0,
    stats: { kills: 3, bossKilled: false, adsClosed: 1 },
  });

  function signed(storageName: string | null = 'Calvin') {
    const fake = createFakeLeaderboard();
    const store = createFakeStorage({
      key: GUESTBOOK_STORAGE_KEY,
      initial: storageName === null ? null : JSON.stringify({ v: 1, name: storageName }),
    });
    const h = setup(FINAL, { leaderboard: fake.client, storage: store.getter });
    return { h, fake, store };
  }

  it('is absent before the reveal and shows a prefilled field after it, with Retry focused', () => {
    const { h } = signed();
    expect(h.q('.guestbook')).toBeNull();
    h.loop.frame(LOSE_REVEAL_TICKS);
    expect(h.must<HTMLInputElement>('.guestbook-name').value).toBe('Calvin');
    expect(h.must<HTMLButtonElement>('.guestbook-sign').disabled).toBe(false);
    expect(document.activeElement).toBe(h.must('.result-retry'));
  });

  it('submits the run entry once with the score from scoreRun', async () => {
    const { h, fake } = signed();
    h.loop.frame(LOSE_REVEAL_TICKS);
    h.must<HTMLButtonElement>('.guestbook-sign').click();
    h.must<HTMLButtonElement>('.guestbook-sign').click();
    expect(fake.submits).toEqual([
      { name: 'Calvin', score: scoreRun(FINAL).total, outcome: 'lost', seconds: 90, download: 37, kills: 3 },
    ]);
    fake.resolveSubmit({ ok: true, value: undefined });
    await flush();
    expect(fake.rankCalls).toEqual([{ day: '2026-11-25', score: scoreRun(FINAL).total }]);
  });

  it.each(['retry', 'mainMenu'] as const)('%s still works while signing', (which) => {
    const { h, fake } = signed();
    h.loop.frame(LOSE_REVEAL_TICKS);
    h.must<HTMLButtonElement>('.guestbook-sign').click();
    expect(h.must('.guestbook-status').textContent).toBe('Signing...');
    h.must<HTMLButtonElement>(which === 'retry' ? '.result-retry' : '.result-main-menu').click();
    expect(h.calls()).toEqual([which]);
    expect(fake.submits).toHaveLength(1);
  });

  it('keys typed in the name field never reach document-level hotkey listeners', () => {
    const { h } = signed(null);
    h.loop.frame(LOSE_REVEAL_TICKS);
    const seen: string[] = [];
    const onKey = (e: KeyboardEvent): void => {
      seen.push(e.key);
    };
    document.addEventListener('keydown', onKey);
    cleanups.push(() => document.removeEventListener('keydown', onKey));
    const input = h.must<HTMLInputElement>('.guestbook-name');
    input.focus();
    for (const key of ['1', '2', '3', '4', '5', 'q', 'e', 'Q', 'E', 'Escape']) {
      input.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    }
    expect(seen).toEqual([]);
    expect(h.calls()).toEqual([]);
  });

  it('unmount mid-request ignores the late result', async () => {
    const { h, fake, store } = signed();
    h.loop.frame(LOSE_REVEAL_TICKS);
    h.must<HTMLButtonElement>('.guestbook-sign').click();
    h.screen.unmount();
    fake.resolveSubmit({ ok: true, value: undefined });
    await flush();
    expect(fake.rankCalls).toHaveLength(0);
    expect(store.writes).toHaveLength(0);
    expect(h.root.childElementCount).toBe(0);
  });

  it('shows the maintenance text and no field without a configuration', () => {
    const h = setup(FINAL);
    h.loop.frame(LOSE_REVEAL_TICKS);
    expect(h.must('.result-guestbook .guestbook-status').textContent).toBe('Guestbook closed for maintenance.');
    expect(h.q('.result-guestbook input')).toBeNull();
    expect(document.activeElement).toBe(h.must('.result-retry'));
  });
});
