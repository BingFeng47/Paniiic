import { describe, expect, it } from 'vitest';
import type { AdState } from '../../../src/game/ads/adTypes';
import { openAd } from '../../../src/game/ads/openAd';
import { DEFAULT_AD_BALANCE as B } from '../../../src/game/balance/ads';
import { DEFAULT_CHAPTER_TABLE as T } from '../../../src/game/balance/chapters';
import type { TickContext } from '../../../src/game/context';
import { createDirectorAds } from '../../../src/game/director/directorAds';
import { initialDirectorState } from '../../../src/game/director/directorLane';
import type { DirectorState } from '../../../src/game/director/directorTypes';
import { createRun } from '../../../src/game/state';
import type { GameEventBody, MutableGameState } from '../../../src/game/types';

/** Far past every Chapter row's endSecond, so only the Last_Interrupter can open an Ad. */
const TICK = 1_000_000;

function fakeCtx(tick = TICK) {
  const events: GameEventBody[] = [];
  const pauses: string[] = [];
  let s = 7;
  const ctx = {
    tick, inputs: [], emit: (e: GameEventBody) => events.push(e), eventsSoFar: () => [],
    random: () => {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 2 ** 32;
    },
    damageModem: () => {}, penalizeDownload: () => {},
    addPauseSource: (id: string) => pauses.push(id), removePauseSource: () => {},
  } as unknown as TickContext;
  return { ctx, events, pauses };
}

/** An Ad_State with the clutter cap full. */
function fullClutter(): AdState {
  const { ctx } = fakeCtx();
  let s: AdState = { balance: B, nextId: 1, ads: [], connectedTick: 0, openedFirstClutter: false };
  for (let i = 0; i < B.cap; i++) s = openAd(s, ctx, 'clutter', ['plain'], false);
  return s;
}

function plotTurn2Draft(lastInterrupter: DirectorState['lastInterrupter'], download: number): MutableGameState {
  const run = createRun({ seed: 1 });
  return {
    ...run,
    pauseSources: [],
    tick: TICK - 1,
    phase: 'downloading',
    download,
    ads: fullClutter(),
    director: { ...initialDirectorState(T), chapter: 'plotTurn2', chapterStartTick: 0, lastInterrupter },
  };
}

describe('directorAds Last_Interrupter (ad-pressure Req 5.3)', () => {
  // Was: with the Ad_Cap full the Last_Interrupter stayed `pending` and did not open.
  it('opens on the Tick it becomes due with the clutter cap full', () => {
    const draft = plotTurn2Draft('waiting', T.lastInterrupterAt);
    const { ctx, events, pauses } = fakeCtx();
    createDirectorAds(T)(draft, ctx);
    const id = B.cap + 1;
    expect(events).toEqual([
      { type: 'adOpened', id, kind: 'interrupter', pattern: 'runaway', laneCover: false },
      { type: 'beat', name: 'lastInterrupter' },
    ]);
    expect(pauses).toEqual([`ad:${id}`]);
    expect(draft.ads?.ads).toHaveLength(B.cap + 1);
    expect(draft.director?.lastInterrupter).toBe('done');
  });

  it('still opens from a `pending` state kept for compatibility', () => {
    const draft = plotTurn2Draft('pending', T.lastInterrupterAt);
    const { ctx, events } = fakeCtx();
    createDirectorAds(T)(draft, ctx);
    expect(events.map((e) => e.type)).toEqual(['adOpened', 'beat']);
    expect(draft.director?.lastInterrupter).toBe('done');
  });

  it('waits below lastInterrupterAt', () => {
    const draft = plotTurn2Draft('waiting', T.lastInterrupterAt - 1);
    const { ctx, events } = fakeCtx();
    createDirectorAds(T)(draft, ctx);
    expect(events).toEqual([]);
    expect(draft.director?.lastInterrupter).toBe('waiting');
  });
});
