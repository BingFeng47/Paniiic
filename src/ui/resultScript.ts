// Pure timing and numbers for the Result_Screen (Req 8.2, 8.5, 8.6, 9.3, 10.3). No DOM, no
// timers: the Result_Screen feeds it the Session's Final_State and its own fixed-loop tick count.

import { TICK_RATE, type GameState } from '../game/types';
import { integrityView } from './laneHud';
import { RESULT_COPY } from './resultCopy';

export type Outcome = 'won' | 'lost';
export type ResultStage = 'intro' | 'reveal';

export interface ResultScript {
  readonly won: { readonly revealMs: number };
  readonly lost: { readonly revealMs: number };
}

/** Intro length before the ending is revealed: won 1,200 ms, lost 1,500 ms (Req 9.3, 10.3). */
export const RESULT_SCRIPT: ResultScript = Object.freeze({
  won: Object.freeze({ revealMs: 1200 }),
  lost: Object.freeze({ revealMs: 1500 }),
});

export interface ResultModel {
  readonly outcome: Outcome;
  /** Run time as "m:ss", e.g. "2:31". */
  readonly timeText: string;
  /** integrityView(final).percentText, so the result and the Lane_HUD agree, e.g. "0%". */
  readonly integrityText: string;
  /** Integer 0..100; 100 only for a finished download. */
  readonly downloadPercent: number;
  /** downloadPercent plus suffix, e.g. "37%". */
  readonly downloadText: string;
}

/** "m:ss" from floor(ticks / TICK_RATE) seconds; negative or non-finite → "0:00". */
export function formatRunTime(ticks: number): string {
  const totalSeconds = Number.isFinite(ticks) && ticks > 0 ? Math.floor(ticks / TICK_RATE) : 0;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/** Floor of the download clamped to 0..100; a non-finite value counts as 0. */
function downloadPercentOf(download: number): number {
  if (!Number.isFinite(download)) return 0;
  return Math.floor(Math.min(Math.max(download, 0), 100));
}

/** Pure (Req 8.2, 8.6). Outcome from final.phase only; null unless the phase is won or lost. */
export function resultModel(final: GameState): ResultModel | null {
  if (final.phase !== 'won' && final.phase !== 'lost') return null;
  const downloadPercent = downloadPercentOf(final.download);
  return {
    outcome: final.phase,
    timeText: formatRunTime(final.tick),
    integrityText: integrityView(final).percentText,
    downloadPercent,
    downloadText: `${downloadPercent}${RESULT_COPY.percentSuffix}`,
  };
}

/** 'reveal' exactly when elapsedMs ≥ script[outcome].revealMs (Req 9.2, 10.2). */
export function resultStageAt(
  outcome: Outcome,
  elapsedMs: number,
  script: ResultScript = RESULT_SCRIPT,
): ResultStage {
  return elapsedMs >= script[outcome].revealMs ? 'reveal' : 'intro';
}
