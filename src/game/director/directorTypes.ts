// Plain-data director state and events. Everything here survives a JSON round trip (Req 7.3).
import type { ChapterId, ChapterTable } from '../balance/chapters';
import type { GameState } from '../types';

export interface DirectorState {
  readonly table: ChapterTable;
  /** The current scripted chapter, `hook` .. `plotTurn2`. Never moves backward. */
  readonly chapter: ChapterId;
  readonly chapterStartTick: number;
  /** Midpoint_Calm runs while `tick < calmUntilTick`. */
  readonly calmUntilTick: number | null;
  readonly calmDone: boolean;
  readonly clusterDone: boolean;
  readonly bossDone: boolean;
  readonly lastInterrupter: 'waiting' | 'pending' | 'done';
}

export type DirectorEventBody =
  | {
      readonly type: 'chapterStarted';
      readonly number: number;
      readonly name: string;
      readonly id: ChapterId;
    }
  | {
      readonly type: 'beat';
      readonly name: 'midpointCalm' | 'midpointCluster' | 'bossRise' | 'lastInterrupter';
    };

/**
 * The Current_Chapter as a selector (Req 1.3): `resolution` once the run is won or lost,
 * otherwise the director's chapter, or `hook` before the director has run.
 */
export function currentChapter(state: GameState): ChapterId {
  if (state.phase === 'won' || state.phase === 'lost') return 'resolution';
  return state.director?.chapter ?? 'hook';
}
