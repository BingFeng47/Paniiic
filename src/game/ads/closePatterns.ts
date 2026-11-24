// Pure close pattern rules shared by the ad systems and the Ad_Layer view.
import type { AdBalance } from '../balance/ads';
import { TICK_RATE } from '../types';
import type { Ad, AdControl, ClosePattern } from './adTypes';

export interface PatternRow {
  /** Controls the ad has in this stage, in drawing order. */
  readonly controls: readonly AdControl[];
  /** The one control that closes the ad, or null (fake button, confirm main stage). */
  readonly correct: AdControl | null;
  readonly wrong: readonly AdControl[];
}

type StageKey = `${ClosePattern}:${'main' | 'confirm'}` | 'fake';

export const CLOSE_PATTERN_TABLE: Readonly<Partial<Record<StageKey, PatternRow>>> = {
  'plain:main': { controls: ['close', 'body'], correct: 'close', wrong: ['body'] },
  'decoy:main': { controls: ['close', 'bigClose', 'body'], correct: 'close', wrong: ['bigClose', 'body'] },
  'hidden:main': { controls: ['tinyClose', 'body'], correct: 'tinyClose', wrong: ['body'] },
  'swapped:main': {
    controls: ['ok', 'cancel', 'noThanks', 'body'],
    correct: 'noThanks',
    wrong: ['ok', 'cancel', 'body'],
  },
  'countdown:main': { controls: ['skip', 'body'], correct: 'skip', wrong: ['body'] },
  'confirm:main': { controls: ['close', 'body'], correct: null, wrong: ['body'] },
  'confirm:confirm': { controls: ['confirmYes', 'confirmNo', 'body'], correct: 'confirmYes', wrong: ['body'] },
  'runaway:main': { controls: ['close', 'body'], correct: 'close', wrong: ['body'] },
  fake: { controls: ['fakeButton', 'body'], correct: null, wrong: ['fakeButton', 'body'] },
};

/** Size in pixels of the runaway ✕ button; `closeAt` is its top-left corner. */
export const RUNAWAY_CLOSE_SIZE = 16;
/** Minimum distance a runaway ✕ moves per jump. */
export const RUNAWAY_MIN_JUMP = 60;

/** Top-left of the runaway ✕ relative to the ad: `closeAt`, or 4 px in from the top-right corner. */
export function runawayCloseAt(ad: Ad): { readonly x: number; readonly y: number } {
  return ad.closeAt ?? { x: ad.rect.w - RUNAWAY_CLOSE_SIZE - 4, y: 4 };
}
export function rowFor(ad: Ad): PatternRow {
  const key: StageKey = ad.pattern === null ? 'fake' : `${ad.pattern}:${ad.stage}`;
  const row = CLOSE_PATTERN_TABLE[key];
  if (!row) throw new Error(`No close pattern row for ${key}`);
  return row;
}

export function controlsFor(ad: Ad): readonly AdControl[] {
  return rowFor(ad).controls;
}

/** First tick on which a countdown ad's Skip works. */
export function countdownReadyTick(ad: Ad, balance: AdBalance): number {
  return ad.openTick + Math.round(balance.countdownSeconds * TICK_RATE);
}

export type ClickOutcome =
  | { readonly kind: 'close' }
  | { readonly kind: 'mistake' }
  | { readonly kind: 'stage'; readonly stage: 'main' | 'confirm' }
  | { readonly kind: 'fakeHit' }
  | { readonly kind: 'ignore' };

export function resolveClick(ad: Ad, control: AdControl, tick: number, balance: AdBalance): ClickOutcome {
  const row = rowFor(ad);
  if (!row.controls.includes(control)) return { kind: 'ignore' };
  if (ad.pattern === null) return { kind: 'fakeHit' };
  if (ad.pattern === 'confirm') {
    if (ad.stage === 'main' && control === 'close') return { kind: 'stage', stage: 'confirm' };
    if (ad.stage === 'confirm' && control === 'confirmNo') return { kind: 'stage', stage: 'main' };
  }
  if (control === row.correct) {
    if (ad.pattern === 'countdown' && tick < countdownReadyTick(ad, balance)) return { kind: 'ignore' };
    return { kind: 'close' };
  }
  if (row.wrong.includes(control)) return { kind: 'mistake' };
  return { kind: 'ignore' };
}

/**
 * Hover on a runaway ✕: returns the ad with the ✕ moved, or null when nothing happens.
 * `random` returns numbers in [0, 1).
 */
export function resolveHover(ad: Ad, balance: AdBalance, random: () => number): Ad | null {
  if (ad.kind !== 'interrupter' || ad.pattern !== 'runaway' || ad.closeAt === null) return null;
  if (ad.jumps >= balance.runawayJumps) return null;
  const maxX = Math.max(0, ad.rect.w - RUNAWAY_CLOSE_SIZE);
  const maxY = Math.max(0, ad.rect.h - RUNAWAY_CLOSE_SIZE);
  const old = ad.closeAt;
  const far = (p: { x: number; y: number }) => Math.hypot(p.x - old.x, p.y - old.y) >= RUNAWAY_MIN_JUMP;
  let next: { x: number; y: number } | null = null;
  for (let i = 0; i < 8 && next === null; i++) {
    const p = { x: Math.floor(random() * (maxX + 1)), y: Math.floor(random() * (maxY + 1)) };
    if (far(p)) next = p;
  }
  if (next === null) {
    // Fallback: the corner farthest from the old spot.
    const corners = [
      { x: 0, y: 0 }, { x: maxX, y: 0 }, { x: 0, y: maxY }, { x: maxX, y: maxY },
    ];
    next = corners.reduce((a, b) =>
      Math.hypot(b.x - old.x, b.y - old.y) > Math.hypot(a.x - old.x, a.y - old.y) ? b : a);
  }
  return { ...ad, closeAt: next, jumps: ad.jumps + 1 };
}
