// Leaderboard client for the Supabase REST API (leaderboard Req 6.1, 6.2, 6.5, 6.6).
// Plain fetch, no SDK. Every method resolves to a Result and never throws or rejects.
// Only `<url>/rest/v1/scores` is called, and the publishable key goes in the `apikey` header only.
import { SCORE_VERSION } from '../game/balance/score';
import type { LeaderboardConfig } from './leaderboardConfig';

export interface ScoreEntry {
  readonly name: string;
  readonly score: number;
  readonly outcome: 'won' | 'lost';
  readonly seconds: number;
  readonly download: number;
  readonly kills: number;
}

export interface ScoreRow extends ScoreEntry {
  readonly createdAt: string;
}

export type FailReason = 'offline' | 'busy' | 'rejected';

export type Result<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly reason: FailReason };

export interface LeaderboardClient {
  /**
   * False when the client was built without a configuration, so every call answers `offline`.
   * The Guestbook_Form reads it to show the maintenance text with no field (Req 5.6).
   */
  readonly configured: boolean;
  submit(entry: ScoreEntry): Promise<Result<void>>;
  topToday(day: string): Promise<Result<readonly ScoreRow[]>>;
  topAllTime(): Promise<Result<readonly ScoreRow[]>>;
  rankToday(day: string, score: number): Promise<Result<number>>;
  guestCount(): Promise<Result<number>>;
}

export const LEADERBOARD_TIMEOUT_MS = 5000;
const TOP_LIMIT = 10;
const ROW_SELECT = 'name,score,outcome,seconds,download,kills,created_at';
const DAY = /^\d{4}-\d{2}-\d{2}$/;
/** Same rule as the `name` check in docs/leaderboard.sql. */
const NAME = /^[A-Za-z0-9 _-]{3,12}$/;

// Ranges match the column checks in docs/leaderboard.sql.
const LIMITS = {
  score: [0, 20000],
  seconds: [0, 3600],
  download: [0, 100],
  kills: [0, 2000],
} as const;

function inRange(v: unknown, [min, max]: readonly [number, number]): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
}

function validName(v: unknown): v is string {
  return typeof v === 'string' && NAME.test(v) && v === v.trim();
}

function validEntry(e: ScoreEntry): boolean {
  return (
    validName(e.name) &&
    (e.outcome === 'won' || e.outcome === 'lost') &&
    inRange(e.score, LIMITS.score) &&
    inRange(e.seconds, LIMITS.seconds) &&
    inRange(e.download, LIMITS.download) &&
    inRange(e.kills, LIMITS.kills)
  );
}

/** Returns a clean row, or null for a row with a missing or out-of-range field. */
function toRow(raw: unknown): ScoreRow | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (
    !validName(r.name) ||
    (r.outcome !== 'won' && r.outcome !== 'lost') ||
    !inRange(r.score, LIMITS.score) ||
    !inRange(r.seconds, LIMITS.seconds) ||
    !inRange(r.download, LIMITS.download) ||
    !inRange(r.kills, LIMITS.kills) ||
    typeof r.created_at !== 'string'
  ) {
    return null;
  }
  return {
    name: r.name,
    score: r.score,
    outcome: r.outcome,
    seconds: r.seconds,
    download: r.download,
    kills: r.kills,
    createdAt: r.created_at,
  };
}

/** Reads the total from a PostgREST `Content-Range` header such as `0-9/42` or `*\/0`. */
function parseCount(header: string | null): number | null {
  if (header === null) return null;
  const m = /\/(\d+)\s*$/.exec(header);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isSafeInteger(n) ? n : null;
}

const fail = (reason: FailReason): Result<never> => ({ ok: false, reason });
const offline = (): Promise<Result<never>> => Promise.resolve(fail('offline'));

export function createLeaderboardClient(
  config: LeaderboardConfig | null,
  fetchFn: typeof fetch = (input, init) => fetch(input, init),
  timeoutMs: number = LEADERBOARD_TIMEOUT_MS,
): LeaderboardClient {
  if (config === null) {
    return {
      configured: false,
      submit: offline,
      topToday: offline,
      topAllTime: offline,
      rankToday: offline,
      guestCount: offline,
    };
  }
  const endpoint = `${config.url}/rest/v1/scores`;

  /**
   * Sends one request with a per-request timeout and maps the outcome:
   * network error or timeout or 5xx → busy, other non-2xx → rejected, 2xx → `read(response)`.
   * `read` returning null (bad body) counts as busy.
   */
  async function request<T>(
    method: 'GET' | 'HEAD' | 'POST',
    params: URLSearchParams | null,
    extraHeaders: Readonly<Record<string, string>>,
    body: string | undefined,
    read: (res: Response) => Promise<T | null>,
  ): Promise<Result<T>> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const url = params ? `${endpoint}?${params.toString()}` : endpoint;
      const res = await fetchFn(url, {
        method,
        headers: { apikey: config!.key, ...extraHeaders },
        body,
        signal: controller.signal,
      });
      if (res.status >= 500) return fail('busy');
      if (res.status < 200 || res.status >= 300) return fail('rejected');
      const value = await read(res);
      return value === null ? fail('busy') : { ok: true, value };
    } catch {
      return fail('busy');
    } finally {
      clearTimeout(timer);
    }
  }

  async function readRows(res: Response): Promise<readonly ScoreRow[] | null> {
    const data: unknown = await res.json();
    if (!Array.isArray(data)) return null;
    const rows: ScoreRow[] = [];
    for (const raw of data) {
      const row = toRow(raw);
      if (row) rows.push(row);
    }
    return rows.slice(0, TOP_LIMIT);
  }

  const readCount = (res: Response): Promise<number | null> =>
    Promise.resolve(parseCount(res.headers.get('Content-Range')));

  function topParams(day: string | null): URLSearchParams {
    const p = new URLSearchParams();
    p.set('select', ROW_SELECT);
    if (day !== null) p.set('day', `eq.${day}`);
    p.set('order', 'score.desc,created_at.asc');
    p.set('limit', String(TOP_LIMIT));
    return p;
  }

  const countHeaders = { Prefer: 'count=exact' } as const;

  return {
    configured: true,
    submit(entry) {
      if (typeof entry !== 'object' || entry === null || !validEntry(entry)) {
        return Promise.resolve(fail('rejected'));
      }
      // Exactly the seven insertable columns; the database sets id, created_at and day.
      const body = JSON.stringify({
        name: entry.name,
        score: entry.score,
        outcome: entry.outcome,
        seconds: entry.seconds,
        download: entry.download,
        kills: entry.kills,
        version: SCORE_VERSION,
      });
      return request<void>(
        'POST',
        null,
        { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body,
        () => Promise.resolve(undefined),
      );
    },

    topToday(day) {
      if (typeof day !== 'string' || !DAY.test(day)) return Promise.resolve(fail('rejected'));
      return request('GET', topParams(day), {}, undefined, readRows);
    },

    topAllTime() {
      return request('GET', topParams(null), {}, undefined, readRows);
    },

    async rankToday(day, score) {
      if (typeof day !== 'string' || !DAY.test(day) || !inRange(score, LIMITS.score)) {
        return fail('rejected');
      }
      const p = new URLSearchParams();
      p.set('select', 'id');
      p.set('day', `eq.${day}`);
      p.set('score', `gt.${score}`);
      const above = await request('HEAD', p, countHeaders, undefined, readCount);
      return above.ok ? { ok: true, value: above.value + 1 } : above;
    },

    guestCount() {
      const p = new URLSearchParams();
      p.set('select', 'id');
      return request('HEAD', p, countHeaders, undefined, readCount);
    },
  };
}
