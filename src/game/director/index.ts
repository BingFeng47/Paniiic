// The Director (cross-front-and-director design). It resolves the Chapter_Table once and builds
// the lane half (Spawner slot) and the ads half (Ad_Scheduler slot) from it (Req 2.1, 3.1).
import { resolveChapterTable, type ChapterTableOverrides } from '../balance/chapters';
import type { System } from '../context';
import { createDirectorAds } from './directorAds';
import { createDirectorLane } from './directorLane';

export interface Director {
  readonly laneSpawner: System;
  readonly adScheduler: System;
}

/** Builds the Director. Throws ChapterTableError when the overrides make an invalid table. */
export function createDirector(overrides?: ChapterTableOverrides): Director {
  const table = resolveChapterTable(overrides);
  return { laneSpawner: createDirectorLane(table), adScheduler: createDirectorAds(table) };
}

export { currentChapter } from './directorTypes';
export type { DirectorState, DirectorEventBody } from './directorTypes';
export { ChapterTableError } from '../balance/chapters';
export type { ChapterId, ChapterTable, ChapterTableOverrides } from '../balance/chapters';
