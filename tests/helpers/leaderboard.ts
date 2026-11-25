// A fake configured Leaderboard_Client for Guestbook_Form and Result_Screen tests (leaderboard
// Req 5). Every call is recorded and stays pending until the test resolves it, so the form's
// "Signing..." state, double submits and late results can be checked step by step.
import type { LeaderboardClient, Result, ScoreEntry, ScoreRow } from '../../src/core/leaderboard';

type Pending<T> = { readonly resolve: (r: Result<T>) => void };

export interface FakeLeaderboard {
  readonly client: Pick<LeaderboardClient, 'configured' | 'submit' | 'topToday' | 'rankToday'>;
  readonly submits: ScoreEntry[];
  readonly rankCalls: Array<{ day: string; score: number }>;
  readonly topCalls: string[];
  /** Resolves the oldest pending submit. */
  resolveSubmit(result: Result<void>): void;
  resolveRank(result: Result<number>): void;
  resolveTop(result: Result<readonly ScoreRow[]>): void;
}

export function createFakeLeaderboard(): FakeLeaderboard {
  const submits: ScoreEntry[] = [];
  const rankCalls: Array<{ day: string; score: number }> = [];
  const topCalls: string[] = [];
  const submitQ: Array<Pending<void>> = [];
  const rankQ: Array<Pending<number>> = [];
  const topQ: Array<Pending<readonly ScoreRow[]>> = [];
  const take = <T>(q: Array<Pending<T>>, what: string): Pending<T> => {
    const p = q.shift();
    if (!p) throw new Error(`no pending ${what}`);
    return p;
  };
  return {
    client: {
      configured: true,
      submit(entry) {
        submits.push(entry);
        return new Promise((resolve) => submitQ.push({ resolve }));
      },
      rankToday(day, score) {
        rankCalls.push({ day, score });
        return new Promise((resolve) => rankQ.push({ resolve }));
      },
      topToday(day) {
        topCalls.push(day);
        return new Promise((resolve) => topQ.push({ resolve }));
      },
    },
    submits,
    rankCalls,
    topCalls,
    resolveSubmit: (r) => take(submitQ, 'submit').resolve(r),
    resolveRank: (r) => take(rankQ, 'rankToday').resolve(r),
    resolveTop: (r) => take(topQ, 'topToday').resolve(r),
  };
}

/** Lets pending promise callbacks run. */
export const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

/** A valid row for today's list. */
export function row(name: string, score: number, outcome: 'won' | 'lost' = 'lost'): ScoreRow {
  return { name, score, outcome, seconds: 90, download: 37, kills: 3, createdAt: '2026-11-25T10:00:00Z' };
}
