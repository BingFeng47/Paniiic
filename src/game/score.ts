// Run score (leaderboard Req 3). Pure: a function of the Final_State only, so the result screen,
// the guestbook submit and the tests all agree. Tuning lives in `balance/score.ts`.
import { SCORE_TABLE, SCORE_VERSION } from './balance/score';
import { TICK_RATE, type GameState } from './types';

export interface ScoreLine {
  readonly id: 'download' | 'kills' | 'boss' | 'ads' | 'combo' | 'win' | 'integrity' | 'speed';
  readonly points: number;
}

export interface ScoreBreakdown {
  readonly lines: readonly ScoreLine[];
  readonly total: number;
  readonly version: number;
}

/** A whole count ≥ 0. Non-finite or negative values count as 0. */
function count(n: number): number {
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/**
 * Score a finished Run (Req 3.2). Throws unless `final.phase` is `won` or `lost` (Req 3.3).
 * Missing `stats` or `economy` count as zeros. Every line, and so the total, is a whole
 * number ≥ 0 (Req 3.4). Lines are always listed in the same order; the win lines appear only
 * for a win.
 */
export function scoreRun(final: GameState): ScoreBreakdown {
  if (final.phase !== 'won' && final.phase !== 'lost') {
    throw new Error(`scoreRun: run is not finished (phase ${final.phase})`);
  }
  const t = SCORE_TABLE;
  const stats = final.stats;
  const download = Math.min(100, count(final.download));
  const bestCombo = count(final.economy?.bestCombo ?? 0);

  const lines: ScoreLine[] = [
    { id: 'download', points: download * t.perPercent },
    { id: 'kills', points: count(stats?.kills ?? 0) * t.perKill },
    { id: 'boss', points: stats?.bossKilled === true ? t.boss : 0 },
    { id: 'ads', points: count(stats?.adsClosed ?? 0) * t.perAd },
    { id: 'combo', points: bestCombo >= t.comboMin ? bestCombo * t.perCombo : 0 },
  ];

  if (final.phase === 'won') {
    const integrity = Number.isFinite(final.integrity) && final.integrity > 0 ? Math.ceil(final.integrity) : 0;
    const seconds = count(final.tick / TICK_RATE);
    lines.push(
      { id: 'win', points: t.winBase },
      { id: 'integrity', points: integrity * t.perIntegrity },
      { id: 'speed', points: Math.max(0, t.parSeconds - seconds) * t.perSecondUnder },
    );
  }

  const total = lines.reduce((sum, line) => sum + line.points, 0);
  return { lines, total, version: SCORE_VERSION };
}
