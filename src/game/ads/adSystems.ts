// Ad wiring and rules: builds the four browser-front systems in tick order (design "Systems").
//
// Like the lane, the balance is resolved once here, so invalid overrides throw AdBalanceError
// before any Run starts (Req 2.4). ensureAds copies it into the Ad_State on the first ad tick;
// every other system reads draft.ads.balance, so a Run keeps the balance it started with.
//
// Terminal phases need no handling: step() returns before running any system once a Run is won
// or lost, so the Ad_State freezes with the Run (Req 1.6).
import { resolveAdBalance, type AdBalance, type AdBalanceOverrides } from '../balance/ads';
import { secondsToTicks } from '../balance/lane';
import type { System, TickContext } from '../context';
import type { MutableGameState } from '../types';
import type { Ad, AdState, ClosePattern } from './adTypes';
import { resolveClick, resolveHover } from './closePatterns';
import { openAd, pauseSourceId } from './openAd';

export interface AdSystemOptions {
  readonly balance?: AdBalanceOverrides;
  /** Replaces the scheduled ad spawner (milestone 5 director) (Req 3.3). */
  readonly scheduler?: System;
}

export function initialAds(balance: AdBalance): AdState {
  return { balance, nextId: 1, ads: [], connectedTick: null, openedFirstClutter: false };
}

function adsOf(draft: MutableGameState): AdState {
  if (draft.ads === undefined) throw new Error('ad systems: ensureAds must run first');
  return draft.ads;
}

/**
 * Clutter patterns of the newest clutter row that has started by `tick` (latest startSecond,
 * later rows win ties). Before any row has started, plain only.
 */
export function currentClutterPatterns(tick: number, balance: AdBalance): readonly ClosePattern[] {
  let best: { start: number; patterns: readonly ClosePattern[] } | null = null;
  for (const row of balance.schedule) {
    if (row.kind !== 'clutter') continue;
    const start = secondsToTicks(row.startSecond);
    if (start <= tick && (best === null || start >= best.start)) best = { start, patterns: row.patterns };
  }
  return best?.patterns ?? ['plain'];
}

/** Opens `count` clutter ads with the current patterns, not covering the lane. */
function openClutter(state: AdState, ctx: TickContext, count: number): AdState {
  const patterns = currentClutterPatterns(ctx.tick, state.balance);
  let next = state;
  for (let i = 0; i < count; i++) next = openAd(next, ctx, 'clutter', patterns, false);
  return next;
}

export function removeAd(state: AdState, id: number): AdState {
  return { ...state, ads: state.ads.filter((a) => a.id !== id) };
}

function replaceAd(state: AdState, ad: Ad): AdState {
  return { ...state, ads: state.ads.map((a) => (a.id === ad.id ? ad : a)) };
}

/** Adds the Ad_State once and records the first non-dialing tick (Req 1.1, 1.5). */
function makeEnsureAds(balance: AdBalance): System {
  return (draft) => {
    if (draft.ads === undefined) draft.ads = initialAds(balance);
    if (draft.ads.connectedTick === null && draft.phase !== 'dialing') {
      draft.ads = { ...draft.ads, connectedTick: draft.tick };
    }
  };
}

/** Applies adClick / adHover in input order; stale ids or missing controls do nothing (Req 11.2). */
export const adInputSystem: System = (draft, ctx) => {
  let state = adsOf(draft);
  for (const cmd of ctx.inputs) {
    if (cmd.type !== 'adClick' && cmd.type !== 'adHover') continue;
    const ad = state.ads.find((a) => a.id === cmd.adId);
    if (ad === undefined) continue;
    if (cmd.type === 'adHover') {
      const moved = resolveHover(ad, state.balance, () => ctx.random());
      if (moved !== null) {
        state = replaceAd(state, moved);
        ctx.emit({ type: 'adCloseJumped', id: ad.id, jumps: moved.jumps });
      }
      continue;
    }
    const outcome = resolveClick(ad, cmd.control, ctx.tick, state.balance);
    switch (outcome.kind) {
      case 'close':
        state = removeAd(state, ad.id);
        if (ad.kind === 'interrupter') ctx.removePauseSource(pauseSourceId(ad.id));
        ctx.emit({ type: 'adClosed', id: ad.id, kind: ad.kind, rewardKb: state.balance.rewardKb });
        break;
      case 'mistake':
        ctx.emit({ type: 'adMistake', id: ad.id, control: cmd.control });
        state = openClutter(state, ctx, state.balance.mistakeExtras);
        break;
      case 'stage':
        state = replaceAd(state, { ...ad, stage: outcome.stage });
        ctx.emit({ type: 'adStage', id: ad.id, stage: outcome.stage });
        break;
      case 'fakeHit':
        ctx.penalizeDownload(state.balance.fakePenalty);
        ctx.emit({ type: 'fakeButtonClicked', id: ad.id, penalty: state.balance.fakePenalty });
        state = removeAd(state, ad.id);
        break;
      case 'ignore':
        break;
    }
  }
  draft.ads = state;
};

/**
 * Forced first clutter, then schedule rows in row order, then one burst per popupBurst emitted
 * earlier this tick (Req 3.2, 7.3, 7.4). Skipped while dialing.
 */
export const scheduleAds: System = (draft, ctx) => {
  if (draft.phase === 'dialing') return;
  let state = adsOf(draft);
  const b = state.balance;
  const tick = ctx.tick;
  if (state.connectedTick !== null && tick === state.connectedTick + secondsToTicks(b.firstClutterDelaySeconds)) {
    state = openAd(state, ctx, 'clutter', ['plain'], false);
  }
  for (const row of b.schedule) {
    const start = secondsToTicks(row.startSecond);
    const end = secondsToTicks(row.endSecond);
    const every = secondsToTicks(row.everySeconds);
    if (tick >= start && tick <= end && (tick - start) % every === 0) {
      state = openAd(state, ctx, row.kind, row.patterns, row.laneCover);
    }
  }
  for (const event of ctx.eventsSoFar()) {
    if (event.type === 'popupBurst') state = openClutter(state, ctx, event.count);
  }
  draft.ads = state;
};

/** Removes fake buttons older than their lifetime (Req 8.3). */
export const adExpirySystem: System = (draft, ctx) => {
  const state = adsOf(draft);
  const life = secondsToTicks(state.balance.fakeLifetimeSeconds);
  const expired = state.ads.filter((a) => a.kind === 'fake' && ctx.tick - a.openTick >= life);
  if (expired.length === 0) return;
  for (const ad of expired) ctx.emit({ type: 'adExpired', id: ad.id });
  draft.ads = { ...state, ads: state.ads.filter((a) => !expired.includes(a)) };
};

/**
 * Resolves the balance now (throws AdBalanceError) and returns
 * `[ensureAds, adInputSystem, scheduler ?? scheduleAds, adExpirySystem]` (Req 1.1, 2.4, 3.3).
 */
export function createAdSystems(options: AdSystemOptions = {}): readonly System[] {
  const balance = resolveAdBalance(options.balance);
  return [makeEnsureAds(balance), adInputSystem, options.scheduler ?? scheduleAds, adExpirySystem];
}
