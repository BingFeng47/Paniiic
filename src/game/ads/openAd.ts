// Opens one ad: cap check, pattern and copy choice, placement, pause source, adOpened
// (Requirements 1.4, 3.4, 4, 7.1, 8.1, 9.1). Every random draw goes through ctx.random().
import type { TickContext } from '../context';
import { RUNAWAY_CLOSE_SIZE } from './closePatterns';
import type { Ad, AdKind, AdState, ClosePattern, Corner } from './adTypes';
import { placeAd } from './placement';

/** Copy variants per kind. The strings live in src/ui/browserCopy.ts and must match these counts. */
export const AD_COPY_COUNTS: Readonly<Record<AdKind, number>> = Object.freeze({
  clutter: 4,
  interrupter: 3,
  fake: 2,
});

export const CORNERS: readonly Corner[] = Object.freeze(['tl', 'tr', 'bl', 'br']);
/** Inset of the title-bar ✕ from the ad's top-right corner. */
export const TITLE_CLOSE_INSET = 4;

export function pauseSourceId(id: number): string {
  return `ad:${id}`;
}

function pickIndex(count: number, random: () => number): number {
  return Math.min(count - 1, Math.floor(random() * count));
}

/** Open clutter Ads; only these count toward the Ad_Cap (ad-pressure Req 5.1). */
export function clutterCount(state: AdState): number {
  let n = 0;
  for (const ad of state.ads) if (ad.kind === 'clutter') n++;
  return n;
}

/**
 * Returns the next Ad_State. A clutter Ad asked for while `cap` clutter Ads are open emits
 * `adSkipped` and returns `state` unchanged. Interrupters and fake buttons always open
 * (ad-pressure Req 5.1, 5.2).
 * `patterns` must be non-empty for clutter and interrupters and is ignored for fake buttons.
 */
export function openAd(
  state: AdState,
  ctx: TickContext,
  kind: AdKind,
  patterns: readonly ClosePattern[],
  laneCover: boolean,
): AdState {
  const b = state.balance;
  if (kind === 'clutter' && clutterCount(state) >= b.cap) {
    ctx.emit({ type: 'adSkipped', kind });
    return state;
  }
  const random = () => ctx.random();
  let pattern: ClosePattern | null = null;
  if (kind !== 'fake') {
    if (patterns.length === 0) throw new Error(`openAd: no patterns for ${kind}`);
    pattern = patterns[pickIndex(patterns.length, random)];
  }
  const copy = pickIndex(AD_COPY_COUNTS[kind], random);
  const cover = kind === 'clutter' && laneCover;
  const firstClutter = kind === 'clutter' && !state.openedFirstClutter;
  const rect = placeAd(kind, b, { laneCover: cover, firstClutter }, random);
  const corner = pattern === 'hidden' ? CORNERS[pickIndex(CORNERS.length, random)] : null;
  const closeAt = pattern === 'runaway'
    ? { x: Math.max(0, rect.w - RUNAWAY_CLOSE_SIZE - TITLE_CLOSE_INSET), y: TITLE_CLOSE_INSET }
    : null;
  const id = state.nextId;
  const ad: Ad = {
    id, kind, pattern, rect, openTick: ctx.tick, copy, laneCover: cover,
    stage: 'main', corner, closeAt, jumps: 0,
  };
  if (kind === 'interrupter') ctx.addPauseSource(pauseSourceId(id));
  ctx.emit({ type: 'adOpened', id, kind, pattern, laneCover: cover });
  return {
    ...state,
    nextId: id + 1,
    ads: [...state.ads, ad],
    openedFirstClutter: state.openedFirstClutter || kind === 'clutter',
  };
}
