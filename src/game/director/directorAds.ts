// directorAds: the Director's ad scheduler slot (cross-front-and-director design "directorAds").
// Runs after adInputSystem, so it sees this Tick's fakeButtonClicked and popupBurst events.
// Every Ad opens through browser-front's openAd, so the clutter-only Ad_Cap holds (Req 3.5,
// ad-pressure Req 5). All randomness
// goes through ctx.random() inside openAd (Req 7.1); hatching draws none (ad-pressure Req 9.1).
import type { ChapterTable } from '../balance/chapters';
import { secondsToTicks } from '../balance/lane';
import type { AdState, ClosePattern } from '../ads/adTypes';
import { hatchesNow } from '../ads/hatch';
import { openAd } from '../ads/openAd';
import type { System, TickContext } from '../context';
import { laneDraft } from '../laneState';
import { addMob } from '../mobs';
import type { MutableGameState } from '../types';
import type { DirectorState } from './directorTypes';

/** Clutter patterns of the current Chapter's clutter rows, in row order; plain if it has none. */
export function chapterClutterPatterns(table: ChapterTable, chapter: DirectorState['chapter']): readonly ClosePattern[] {
  const found = table.chapters.find((c) => c.id === chapter);
  const patterns: ClosePattern[] = [];
  for (const row of found?.ads ?? []) {
    if (row.kind !== 'clutter') continue;
    for (const p of row.patterns) if (!patterns.includes(p)) patterns.push(p);
  }
  return patterns.length > 0 ? patterns : ['plain'];
}

function openClutter(state: AdState, ctx: TickContext, count: number, patterns: readonly ClosePattern[]): AdState {
  let next = state;
  for (let i = 0; i < count; i++) next = openAd(next, ctx, 'clutter', patterns, false);
  return next;
}

/** Fake_Spawn: one fast Mob at the Manhole per fakeButtonClicked this Tick, calm or not (Req 6.1, 6.3). */
function fakeSpawns(draft: MutableGameState, ctx: TickContext): void {
  const clicks = ctx.eventsSoFar().filter((e) => e.type === 'fakeButtonClicked').length;
  if (clicks === 0) return;
  const lane = laneDraft(draft);
  for (let i = 0; i < clicks; i++) addMob(lane, ctx, 'fast', lane.balance.laneLength, 'fakeButton');
}

/**
 * Hatching (ad-pressure Req 4.3–4.5): one Mob of the Current_Chapter's `hatchKind` at the Manhole
 * per clutter Ad whose age hits a multiple of `hatchSeconds`, calm or not. It iterates the Ad list
 * from before this Tick's new Ads and never closes, moves or resets an Ad. No random numbers.
 */
function hatchSpawns(draft: MutableGameState, ctx: TickContext, table: ChapterTable): void {
  const director = draft.director;
  const ads = draft.ads;
  if (director === undefined || ads === undefined) return;
  const t = director.table ?? table;
  const kind = t.chapters.find((c) => c.id === director.chapter)?.hatchKind ?? null;
  if (kind === null) return;
  let lane: ReturnType<typeof laneDraft> | null = null;
  for (const ad of ads.ads) {
    if (!hatchesNow(ad, ctx.tick, ads.balance)) continue;
    lane ??= laneDraft(draft);
    const mobId = addMob(lane, ctx, kind, lane.balance.laneLength, 'adHatch');
    ctx.emit({ type: 'adHatched', id: ad.id, mobId });
  }
}
/**
 * Builds the ad scheduler for a resolved Chapter_Table. The table in `draft.director` wins when
 * present, so a Run keeps the table it started with; `table` is the fallback.
 */
export function createDirectorAds(table: ChapterTable): System {
  return (draft, ctx) => {
    fakeSpawns(draft, ctx);
    // Before the calm check and the scheduler, so hatches happen during the Midpoint_Calm too
    // (Req 4.4) and only Ads opened before this Tick can hatch.
    hatchSpawns(draft, ctx, table);
    if (draft.phase === 'dialing') return;
    const director = draft.director;
    const ads = draft.ads;
    // directorLane creates the state and ensureAds the Ad_State; without them there is nothing
    // to schedule yet.
    if (director === undefined || ads === undefined) return;

    const t = director.table ?? table;
    const tick = ctx.tick;
    let state = ads;
    let dir: DirectorState = director;
    const clutterPatterns = chapterClutterPatterns(t, dir.chapter);

    // Calm end → Midpoint_Cluster (Req 4.3).
    if (dir.calmUntilTick !== null && tick >= dir.calmUntilTick && !dir.clusterDone) {
      state = openClutter(state, ctx, t.clusterCount, clutterPatterns);
      ctx.emit({ type: 'beat', name: 'midpointCluster' });
      dir = { ...dir, calmDone: true, clusterDone: true };
    }
    const calmActive = dir.calmUntilTick !== null && tick < dir.calmUntilTick;

    // Forced first plain clutter at connect + 5 s (Req 3.4).
    if (state.connectedTick !== null && tick === state.connectedTick + secondsToTicks(t.firstClutterAfterConnectSeconds)) {
      state = openAd(state, ctx, 'clutter', ['plain'], false);
    }

    if (!calmActive) {
      // Current Chapter's rows, times relative to its start (Req 3.2, 4.2).
      const chapter = t.chapters.find((c) => c.id === dir.chapter);
      const rel = tick - dir.chapterStartTick;
      for (const row of chapter?.ads ?? []) {
        const start = secondsToTicks(row.startSecond);
        const end = secondsToTicks(row.endSecond);
        const every = secondsToTicks(row.everySeconds);
        if (rel >= start && rel <= end && (rel - start) % every === 0) {
          state = openAd(state, ctx, row.kind, row.patterns, row.laneCover);
        }
      }
      // Popup bursts emitted earlier this Tick.
      for (const event of ctx.eventsSoFar()) {
        if (event.type === 'popupBurst') state = openClutter(state, ctx, event.count, clutterPatterns);
      }
    }

    // Last_Interrupter (Req 5.1–5.3): interrupters are never capped (ad-pressure Req 5.2, 5.3),
    // so it opens on the Tick it becomes due. `pending` stays as a state for compatibility.
    if (dir.lastInterrupter === 'waiting' && dir.chapter === 'plotTurn2'
      && draft.phase === 'downloading' && draft.download >= t.lastInterrupterAt) {
      dir = { ...dir, lastInterrupter: 'pending' };
    }
    if (dir.lastInterrupter === 'pending' && draft.phase === 'downloading') {
      state = openAd(state, ctx, 'interrupter', ['runaway'], false);
      ctx.emit({ type: 'beat', name: 'lastInterrupter' });
      dir = { ...dir, lastInterrupter: 'done' };
    }

    draft.ads = state;
    if (dir !== director) draft.director = dir;
  };
}
