// Leaderboard client tests (leaderboard Req 6.1, 6.2, 6.5) with a fake fetch.
// Keys are placeholders; none matches the secret-key scan in tests/docs/secrets.test.ts.
import fc from 'fast-check';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  LEADERBOARD_TIMEOUT_MS,
  createLeaderboardClient,
  type LeaderboardClient,
  type ScoreEntry,
} from '../../src/core/leaderboard';
import type { LeaderboardConfig } from '../../src/core/leaderboardConfig';
import { SCORE_VERSION } from '../../src/game/balance/score';

const CONFIG: LeaderboardConfig = {
  url: 'https://abc.supabase.co',
  key: 'sb_publishable_placeholder',
};
const ENDPOINT = 'https://abc.supabase.co/rest/v1/scores';
const SELECT = 'name,score,outcome,seconds,download,kills,created_at';

const ENTRY: ScoreEntry = {
  name: 'Bing_47',
  score: 3210,
  outcome: 'won',
  seconds: 196,
  download: 100,
  kills: 58,
};

const ROW = {
  name: 'Calvin',
  score: 4000,
  outcome: 'won',
  seconds: 190,
  download: 100,
  kills: 60,
  created_at: '2026-11-24T10:00:00Z',
};

interface Call {
  readonly url: string;
  readonly init: RequestInit;
}

/** A fake fetch that records every call and answers with `respond()`. */
function fakeFetch(respond: () => Response | Promise<Response>): {
  fetchFn: typeof fetch;
  calls: Call[];
} {
  const calls: Call[] = [];
  const fetchFn = ((input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} });
    return Promise.resolve().then(respond);
  }) as typeof fetch;
  return { fetchFn, calls };
}

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
const counted = (range: string | null, status = 206): Response =>
  new Response(null, { status, headers: range === null ? {} : { 'Content-Range': range } });

function headersOf(init: RequestInit): Record<string, string> {
  const out: Record<string, string> = {};
  new Headers(init.headers).forEach((v, k) => {
    out[k] = v;
  });
  return out;
}

afterEach(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------------------------
// Property 5: client never throws.
// ---------------------------------------------------------------------------------------------

type Outcome =
  | { readonly kind: 'throw'; readonly value: unknown; readonly sync: boolean }
  | { readonly kind: 'hang' }
  | {
      readonly kind: 'respond';
      readonly status: number;
      readonly body: unknown;
      readonly badJson: boolean;
      readonly range: string | null;
    };

const outcomeArb: fc.Arbitrary<Outcome> = fc.oneof(
  fc.record({ kind: fc.constant('throw' as const), value: fc.anything(), sync: fc.boolean() }),
  fc.constant({ kind: 'hang' as const }),
  fc.record({
    kind: fc.constant('respond' as const),
    status: fc.oneof(fc.integer({ min: 0, max: 999 }), fc.constantFrom(200, 201, 204, 206, 400, 401, 404, 409, 500, 503)),
    body: fc.oneof(
      fc.jsonValue(),
      fc.array(fc.record({ name: fc.string(), score: fc.anything(), created_at: fc.anything() })),
      fc.array(fc.constant(ROW)),
      fc.anything(),
    ),
    badJson: fc.boolean(),
    range: fc.option(
      fc.oneof(
        fc.string(),
        fc.constantFrom('0-9/42', '*/0', '0-0/*', '*/abc', '0-9/99999999999999999999', '/5', ''),
      ),
      { nil: null },
    ),
  }),
);

/** Builds a fetch for one outcome. A hanging fetch rejects on abort, as the real fetch does. */
function fetchFor(outcome: Outcome): typeof fetch {
  return ((_input: RequestInfo | URL, init?: RequestInit) => {
    if (outcome.kind === 'throw') {
      // Mix synchronous throws with rejected promises.
      if (outcome.sync) throw outcome.value;
      return Promise.reject(outcome.value);
    }
    if (outcome.kind === 'hang') {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(new DOMException('The operation was aborted.', 'AbortError')),
        );
      });
    }
    const res = {
      status: outcome.status,
      ok: outcome.status >= 200 && outcome.status < 300,
      headers: new Headers(outcome.range === null ? {} : { 'Content-Range': outcome.range }),
      json: () =>
        outcome.badJson ? Promise.reject(new SyntaxError('Unexpected token')) : Promise.resolve(outcome.body),
    } as unknown as Response;
    return Promise.resolve(res);
  }) as typeof fetch;
}

function isResult(r: unknown): boolean {
  if (typeof r !== 'object' || r === null) return false;
  const v = r as { ok?: unknown; reason?: unknown };
  if (v.ok === true) return 'value' in v;
  return v.ok === false && (v.reason === 'offline' || v.reason === 'busy' || v.reason === 'rejected');
}

function callAll(client: LeaderboardClient, day: string, score: number): Promise<unknown>[] {
  return [
    client.submit(ENTRY),
    client.topToday(day),
    client.topAllTime(),
    client.rankToday(day, score),
    client.guestCount(),
  ];
}

describe('Property 5: client never throws', () => {
  // Property: Req 6.1 every method resolves to a Result for any fetch outcome
  // **Validates: Requirements 6.1**
  it('resolves every method to a Result for any fetch outcome', async () => {
    await fc.assert(
      fc.asyncProperty(
        outcomeArb,
        fc.oneof(fc.constant('2026-11-24'), fc.string()),
        fc.oneof(fc.integer({ min: 0, max: 20000 }), fc.double()),
        async (outcome, day, score) => {
          const client = createLeaderboardClient(CONFIG, fetchFor(outcome), 5);
          const results = await Promise.allSettled(callAll(client, day, score));
          for (const r of results) {
            expect(r.status).toBe('fulfilled');
            if (r.status === 'fulfilled') expect(isResult(r.value)).toBe(true);
          }
        },
      ),
      { numRuns: 150 },
    );
  });

  // Property: Req 6.1 any input to the methods resolves to a Result, even with bad types
  // **Validates: Requirements 6.1**
  it('resolves to a Result for malformed arguments', async () => {
    const { fetchFn } = fakeFetch(() => json([]));
    const client = createLeaderboardClient(CONFIG, fetchFn, 5);
    await fc.assert(
      fc.asyncProperty(fc.anything(), fc.anything(), async (a, b) => {
        const results = await Promise.allSettled([
          client.submit(a as ScoreEntry),
          client.topToday(a as string),
          client.rankToday(a as string, b as number),
        ]);
        for (const r of results) {
          expect(r.status).toBe('fulfilled');
          if (r.status === 'fulfilled') expect(isResult(r.value)).toBe(true);
        }
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------------------------
// Request shapes (Req 6.2, 6.5).
// ---------------------------------------------------------------------------------------------

describe('request shapes', () => {
  it('submit POSTs exactly the seven columns with the score version', async () => {
    const { fetchFn, calls } = fakeFetch(() => new Response(null, { status: 201 }));
    const r = await createLeaderboardClient(CONFIG, fetchFn).submit(ENTRY);
    expect(r).toEqual({ ok: true, value: undefined });
    expect(calls).toHaveLength(1);
    const [call] = calls;
    expect(call!.url).toBe(ENDPOINT);
    expect(call!.init.method).toBe('POST');
    expect(headersOf(call!.init)).toEqual({
      apikey: CONFIG.key,
      'content-type': 'application/json',
      prefer: 'return=minimal',
    });
    const body = JSON.parse(String(call!.init.body)) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(
      ['download', 'kills', 'name', 'outcome', 'score', 'seconds', 'version'].sort(),
    );
    expect(body).toEqual({ ...ENTRY, version: SCORE_VERSION });
  });

  it('submit drops extra fields from the entry', async () => {
    const { fetchFn, calls } = fakeFetch(() => new Response(null, { status: 201 }));
    const sneaky = { ...ENTRY, id: 1, day: '2000-01-01', created_at: 'x' } as ScoreEntry;
    await createLeaderboardClient(CONFIG, fetchFn).submit(sneaky);
    const body = JSON.parse(String(calls[0]!.init.body)) as Record<string, unknown>;
    expect(body).not.toHaveProperty('id');
    expect(body).not.toHaveProperty('day');
    expect(body).not.toHaveProperty('created_at');
  });

  it('topToday GETs the day filter, order and limit', async () => {
    const { fetchFn, calls } = fakeFetch(() => json([ROW]));
    await createLeaderboardClient(CONFIG, fetchFn).topToday('2026-11-24');
    const url = new URL(calls[0]!.url);
    expect(`${url.origin}${url.pathname}`).toBe(ENDPOINT);
    expect([...url.searchParams]).toEqual([
      ['select', SELECT],
      ['day', 'eq.2026-11-24'],
      ['order', 'score.desc,created_at.asc'],
      ['limit', '10'],
    ]);
    expect(calls[0]!.init.method).toBe('GET');
    expect(headersOf(calls[0]!.init)).toEqual({ apikey: CONFIG.key });
  });

  it('topAllTime GETs the same query without a day', async () => {
    const { fetchFn, calls } = fakeFetch(() => json([]));
    await createLeaderboardClient(CONFIG, fetchFn).topAllTime();
    const url = new URL(calls[0]!.url);
    expect(`${url.origin}${url.pathname}`).toBe(ENDPOINT);
    expect([...url.searchParams]).toEqual([
      ['select', SELECT],
      ['order', 'score.desc,created_at.asc'],
      ['limit', '10'],
    ]);
    expect(calls[0]!.init.method).toBe('GET');
  });

  it('rankToday HEADs a count of higher scores and adds 1', async () => {
    const { fetchFn, calls } = fakeFetch(() => counted('*/6'));
    const r = await createLeaderboardClient(CONFIG, fetchFn).rankToday('2026-11-24', 3210);
    expect(r).toEqual({ ok: true, value: 7 });
    const url = new URL(calls[0]!.url);
    expect(`${url.origin}${url.pathname}`).toBe(ENDPOINT);
    expect([...url.searchParams]).toEqual([
      ['select', 'id'],
      ['day', 'eq.2026-11-24'],
      ['score', 'gt.3210'],
    ]);
    expect(calls[0]!.init.method).toBe('HEAD');
    expect(headersOf(calls[0]!.init)).toEqual({ apikey: CONFIG.key, prefer: 'count=exact' });
  });

  it('rankToday is 1 when nobody scored higher', async () => {
    const { fetchFn } = fakeFetch(() => counted('*/0'));
    expect(await createLeaderboardClient(CONFIG, fetchFn).rankToday('2026-11-24', 0)).toEqual({
      ok: true,
      value: 1,
    });
  });

  it('guestCount HEADs select=id and reads the Content-Range total', async () => {
    const { fetchFn, calls } = fakeFetch(() => counted('0-0/417'));
    const r = await createLeaderboardClient(CONFIG, fetchFn).guestCount();
    expect(r).toEqual({ ok: true, value: 417 });
    expect(calls[0]!.url).toBe(`${ENDPOINT}?select=id`);
    expect(calls[0]!.init.method).toBe('HEAD');
    expect(headersOf(calls[0]!.init)).toEqual({ apikey: CONFIG.key, prefer: 'count=exact' });
  });

  it.each([null, '', '0-9/*', '*/abc', '0-9/99999999999999999999'])(
    'a missing or unreadable Content-Range (%s) is busy',
    async (range) => {
      const { fetchFn } = fakeFetch(() => counted(range));
      const client = createLeaderboardClient(CONFIG, fetchFn);
      expect(await client.guestCount()).toEqual({ ok: false, reason: 'busy' });
      expect(await client.rankToday('2026-11-24', 10)).toEqual({ ok: false, reason: 'busy' });
    },
  );

  // Property: Req 6.2 only the scores endpoint, key in apikey only, never Authorization
  // **Validates: Requirements 6.2**
  it('every request goes to the scores endpoint with apikey and no Authorization', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.date({ min: new Date('2000-01-01'), max: new Date('2099-12-31'), noInvalidDate: true }),
        fc.integer({ min: 0, max: 20000 }),
        async (date, score) => {
          const day = date.toISOString().slice(0, 10);
          const { fetchFn, calls } = fakeFetch(() => json([]));
          const client = createLeaderboardClient(CONFIG, fetchFn);
          await Promise.all(callAll(client, day, score));
          expect(calls).toHaveLength(5);
          for (const c of calls) {
            const url = new URL(c.url);
            expect(`${url.origin}${url.pathname}`).toBe(ENDPOINT);
            const h = headersOf(c.init);
            expect(h.apikey).toBe(CONFIG.key);
            expect(h).not.toHaveProperty('authorization');
            // The key never travels in the URL or body.
            expect(c.url).not.toContain(CONFIG.key);
            expect(String(c.init.body ?? '')).not.toContain(CONFIG.key);
          }
        },
      ),
      { numRuns: 50 },
    );
  });

  it('encodes query values', async () => {
    const { fetchFn, calls } = fakeFetch(() => json([]));
    await createLeaderboardClient(CONFIG, fetchFn).topToday('2026-11-24');
    // Commas in select and order are percent-encoded by URLSearchParams.
    expect(calls[0]!.url).toBe(
      `${ENDPOINT}?select=name%2Cscore%2Coutcome%2Cseconds%2Cdownload%2Ckills%2Ccreated_at` +
        '&day=eq.2026-11-24&order=score.desc%2Ccreated_at.asc&limit=10',
    );
  });

  it.each([
    '2026-11-24&score=gt.0',
    '2026-11-24,or=(id.gt.0)',
    '2026-1-24',
    '24-11-2026',
    ' 2026-11-24',
    '2026-11-24\n',
    '',
  ])('rejects an odd day without sending a request (%j)', async (day) => {
    const { fetchFn, calls } = fakeFetch(() => json([]));
    const client = createLeaderboardClient(CONFIG, fetchFn);
    expect(await client.topToday(day)).toEqual({ ok: false, reason: 'rejected' });
    expect(await client.rankToday(day, 10)).toEqual({ ok: false, reason: 'rejected' });
    expect(calls).toHaveLength(0);
  });

  it.each([-1, 20001, 1.5, Number.NaN, Number.POSITIVE_INFINITY, '10&x=1' as unknown as number])(
    'rejects an odd score without sending a request (%j)',
    async (score) => {
      const { fetchFn, calls } = fakeFetch(() => counted('*/0'));
      const r = await createLeaderboardClient(CONFIG, fetchFn).rankToday('2026-11-24', score);
      expect(r).toEqual({ ok: false, reason: 'rejected' });
      expect(calls).toHaveLength(0);
    },
  );

  it.each([
    { name: 'ab' },
    { name: 'thirteen_char' },
    { name: '<script>' },
    { name: ' Bing' },
    { score: -1 },
    { score: 20001 },
    { download: 101 },
    { seconds: 3601 },
    { kills: 2001 },
    { kills: 1.5 },
    { outcome: 'draw' },
  ])('rejects an out-of-range entry without sending a request (%j)', async (patch) => {
    const { fetchFn, calls } = fakeFetch(() => new Response(null, { status: 201 }));
    const r = await createLeaderboardClient(CONFIG, fetchFn).submit({
      ...ENTRY,
      ...patch,
    } as ScoreEntry);
    expect(r).toEqual({ ok: false, reason: 'rejected' });
    expect(calls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------------------------
// Error mapping and row validation (Req 6.1).
// ---------------------------------------------------------------------------------------------

describe('error mapping', () => {
  it('null config is offline for every method and never calls fetch', async () => {
    const fetchFn = vi.fn() as unknown as typeof fetch;
    const client = createLeaderboardClient(null, fetchFn);
    for (const r of await Promise.all(callAll(client, '2026-11-24', 10))) {
      expect(r).toEqual({ ok: false, reason: 'offline' });
    }
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('a network error is busy', async () => {
    const fetchFn = (() => Promise.reject(new TypeError('Failed to fetch'))) as typeof fetch;
    const client = createLeaderboardClient(CONFIG, fetchFn);
    for (const r of await Promise.all(callAll(client, '2026-11-24', 10))) {
      expect(r).toEqual({ ok: false, reason: 'busy' });
    }
  });

  it.each([500, 502, 503, 504])('status %i is busy', async (status) => {
    const { fetchFn } = fakeFetch(() => json({ message: 'down' }, status));
    const client = createLeaderboardClient(CONFIG, fetchFn);
    for (const r of await Promise.all(callAll(client, '2026-11-24', 10))) {
      expect(r).toEqual({ ok: false, reason: 'busy' });
    }
  });

  it.each([400, 401, 403, 404, 409, 422])('status %i is rejected', async (status) => {
    const { fetchFn } = fakeFetch(() => json({ message: 'no' }, status));
    const client = createLeaderboardClient(CONFIG, fetchFn);
    for (const r of await Promise.all(callAll(client, '2026-11-24', 10))) {
      expect(r).toEqual({ ok: false, reason: 'rejected' });
    }
  });

  it('a body that is not JSON or not an array is busy', async () => {
    const client1 = createLeaderboardClient(
      CONFIG,
      fakeFetch(() => new Response('<html>oops</html>', { status: 200 })).fetchFn,
    );
    expect(await client1.topAllTime()).toEqual({ ok: false, reason: 'busy' });
    const client2 = createLeaderboardClient(CONFIG, fakeFetch(() => json({ rows: [] })).fetchFn);
    expect(await client2.topToday('2026-11-24')).toEqual({ ok: false, reason: 'busy' });
  });

  it('aborts after the default 5 s timeout and reports busy', async () => {
    vi.useFakeTimers();
    expect(LEADERBOARD_TIMEOUT_MS).toBe(5000);
    let signal: AbortSignal | undefined;
    const fetchFn = ((_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        signal = init?.signal ?? undefined;
        signal?.addEventListener('abort', () =>
          reject(new DOMException('The operation was aborted.', 'AbortError')),
        );
      })) as typeof fetch;
    const pending = createLeaderboardClient(CONFIG, fetchFn).guestCount();
    await vi.advanceTimersByTimeAsync(4999);
    expect(signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(signal?.aborted).toBe(true);
    expect(await pending).toEqual({ ok: false, reason: 'busy' });
  });
});

describe('row validation', () => {
  it('keeps good rows and maps created_at to createdAt', async () => {
    const { fetchFn } = fakeFetch(() => json([ROW]));
    const r = await createLeaderboardClient(CONFIG, fetchFn).topToday('2026-11-24');
    expect(r).toEqual({
      ok: true,
      value: [
        {
          name: 'Calvin',
          score: 4000,
          outcome: 'won',
          seconds: 190,
          download: 100,
          kills: 60,
          createdAt: '2026-11-24T10:00:00Z',
        },
      ],
    });
  });

  it('drops bad rows and keeps the rest in order', async () => {
    const bad = [
      null,
      42,
      'row',
      [],
      { ...ROW, name: '<b>hi</b>' },
      { ...ROW, name: 'ab' },
      { ...ROW, score: -5 },
      { ...ROW, score: '4000' },
      { ...ROW, score: 1.5 },
      { ...ROW, outcome: 'draw' },
      { ...ROW, seconds: 99999 },
      { ...ROW, download: 101 },
      { ...ROW, kills: -1 },
      { ...ROW, created_at: 123 },
      { name: ROW.name },
    ];
    const second = { ...ROW, name: 'Bing', score: 3000 };
    const { fetchFn } = fakeFetch(() => json([ROW, ...bad, second]));
    const r = await createLeaderboardClient(CONFIG, fetchFn).topAllTime();
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.map((row) => row.name)).toEqual(['Calvin', 'Bing']);
  });

  it('returns at most 10 rows', async () => {
    const rows = Array.from({ length: 15 }, (_, i) => ({ ...ROW, score: 1000 - i }));
    const { fetchFn } = fakeFetch(() => json(rows));
    const r = await createLeaderboardClient(CONFIG, fetchFn).topAllTime();
    expect(r.ok && r.value.length).toBe(10);
  });
});
