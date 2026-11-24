// The Director's lane half (cross-front-and-director design, "directorLane"). It takes the
// connection-lane Spawner slot: it advances the Current_Chapter, starts the Midpoint_Calm, runs
// the Boss_Rise and spawns Mobs from the current Chapter's waves. It reads only the Run state, the
// Tick and the Chapter_Table, so Runs stay deterministic (Req 7.1).
import { secondsToTicks } from '../balance/lane';
import type { Chapter, ChapterTable } from '../balance/chapters';
import type { System, TickContext } from '../context';
import { laneDraft } from '../laneState';
import type { MobKind } from '../laneTypes';
import { addMob } from '../mobs';
import type { MutableGameState } from '../types';
import type { DirectorState } from './directorTypes';

/** Initial Director state: chapter `hook`, starting at Tick 0. */
export function initialDirectorState(table: ChapterTable): DirectorState {
  return {
    table,
    chapter: 'hook',
    chapterStartTick: 0,
    calmUntilTick: null,
    calmDone: false,
    clusterDone: false,
    bossDone: false,
    lastInterrupter: 'waiting',
  };
}

/** Whether the Midpoint_Calm holds scheduled spawns and Ads on `tick` (Req 4.2). */
export function calmActive(director: DirectorState, tick: number): boolean {
  return director.calmUntilTick !== null && tick < director.calmUntilTick;
}

/** The scripted chapter after `current`, or null once Plot turn 2 is current. */
function nextScripted(table: ChapterTable, current: Chapter): Chapter | null {
  const next = table.chapters[current.number];
  return next !== undefined && next.id !== 'resolution' ? next : null;
}

function chapterOf(table: ChapterTable, director: DirectorState): Chapter {
  const chapter = table.chapters.find((c) => c.id === director.chapter);
  if (chapter === undefined) throw new Error(`directorLane: unknown chapter ${director.chapter}`);
  return chapter;
}

/**
 * Kinds of the chapter's waves due on `tick`, in table order. A wave spawns on Ticks
 * `chapterStart + offset + k × every`, k ≥ 0.
 */
export function chapterWavesAt(chapter: Chapter, chapterStartTick: number, tick: number): MobKind[] {
  const kinds: MobKind[] = [];
  for (const wave of chapter.waves) {
    const first = chapterStartTick + secondsToTicks(wave.offsetSeconds);
    const every = secondsToTicks(wave.everySeconds);
    if (tick >= first && (tick - first) % every === 0) kinds.push(wave.kind);
  }
  return kinds;
}

/** Build the lane Spawner slot over a resolved Chapter_Table (Req 2.1). */
export function createDirectorLane(table: ChapterTable): System {
  return (draft: MutableGameState, ctx: TickContext) => {
    // 1. Ensure state. A Run keeps the table it started with (Req 1.4).
    let director: DirectorState = draft.director ?? initialDirectorState(table);
    const t = director.table;
    const tick = ctx.tick;

    // 2. Chapter advance, emitting chapterStarted for each (Req 1.2).
    let chapter = chapterOf(t, director);
    for (let next = nextScripted(t, chapter); next !== null; next = nextScripted(t, chapter)) {
      const startTick = secondsToTicks(next.startSecond);
      if (startTick > tick) break;
      chapter = next;
      director = { ...director, chapter: next.id, chapterStartTick: startTick };
      ctx.emit({ type: 'chapterStarted', number: next.number, name: next.name, id: next.id });
    }

    // 3. Calm start on the first Tick the Director sees halfwayReached (Req 4.1).
    if (draft.halfwayReached && !director.calmDone && director.calmUntilTick === null) {
      director = { ...director, calmUntilTick: tick + secondsToTicks(t.calmSeconds) };
      ctx.emit({ type: 'beat', name: 'midpointCalm' });
    }

    const lane = laneDraft(draft);
    const { laneLength } = lane.balance;

    // 4. Boss_Rise, once: when the download reaches bossAtPercent or the Run reaches
    // bossLatestSecond, whichever comes first (pacing-and-economy Req 3.2). This stage runs before
    // the download stage, so it sees last Tick's download and the boss rises on the Tick after
    // the bar crosses. Scripted, so the calm does not hold it (Req 2.4; pacing-and-economy 3.4).
    const bossDue = draft.download >= t.bossAtPercent - 1e-9 || tick >= secondsToTicks(t.bossLatestSecond);
    if (!director.bossDone && bossDue) {
      addMob(lane, ctx, 'boss', laneLength, 'schedule');
      ctx.emit({ type: 'beat', name: 'bossRise' });
      director = { ...director, bossDone: true };
    }

    // 5. Current chapter's waves unless the calm is active (Req 2.2, 2.5, 4.2).
    if (!calmActive(director, tick)) {
      for (const kind of chapterWavesAt(chapter, director.chapterStartTick, tick)) {
        addMob(lane, ctx, kind, laneLength, 'schedule');
      }
    }

    draft.director = director;
  };
}
