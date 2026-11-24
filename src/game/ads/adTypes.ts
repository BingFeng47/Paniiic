// Plain-data types for the browser-front ad systems. Everything must survive a JSON round trip.
import type { AdBalance } from '../balance/ads';

export type AdKind = 'clutter' | 'fake' | 'interrupter';
export type ClosePattern =
  | 'plain' | 'decoy' | 'hidden' | 'swapped' | 'countdown' | 'confirm' | 'runaway';
export type AdControl =
  | 'close' | 'bigClose' | 'tinyClose' | 'ok' | 'cancel' | 'noThanks'
  | 'skip' | 'confirmYes' | 'confirmNo' | 'fakeButton' | 'body';
export type Rect = { readonly x: number; readonly y: number; readonly w: number; readonly h: number };
export type Corner = 'tl' | 'tr' | 'bl' | 'br';

export interface Ad {
  readonly id: number;
  readonly kind: AdKind;
  /** null for fake buttons. */
  readonly pattern: ClosePattern | null;
  /** Screen pixels. */
  readonly rect: Rect;
  readonly openTick: number;
  /** Index into the copy variants of its kind. */
  readonly copy: number;
  readonly laneCover: boolean;
  /** 'confirm' only for the confirm pattern. */
  readonly stage: 'main' | 'confirm';
  /** Hidden pattern: where the tiny ✕ sits. */
  readonly corner: Corner | null;
  /** Runaway ✕ position, relative to the ad. */
  readonly closeAt: { readonly x: number; readonly y: number } | null;
  /** Runaway jumps so far. */
  readonly jumps: number;
}

export interface AdState {
  readonly balance: AdBalance;
  readonly nextId: number;
  /** Ascending id; later ads are drawn on top. */
  readonly ads: readonly Ad[];
  /** First tick the ad systems saw a non-dialing phase. */
  readonly connectedTick: number | null;
  readonly openedFirstClutter: boolean;
}

export type AdClickCommand = { readonly type: 'adClick'; readonly adId: number; readonly control: AdControl };
export type AdHoverCommand = { readonly type: 'adHover'; readonly adId: number };

export type AdEventBody =
  | { readonly type: 'adOpened'; readonly id: number; readonly kind: AdKind; readonly pattern: ClosePattern | null; readonly laneCover: boolean }
  | { readonly type: 'adClosed'; readonly id: number; readonly kind: AdKind; readonly rewardKb: number }
  | { readonly type: 'adMistake'; readonly id: number; readonly control: AdControl }
  | { readonly type: 'adStage'; readonly id: number; readonly stage: 'main' | 'confirm' }
  | { readonly type: 'adCloseJumped'; readonly id: number; readonly jumps: number }
  | { readonly type: 'adExpired'; readonly id: number }
  | { readonly type: 'adSkipped'; readonly kind: AdKind }
  | { readonly type: 'fakeButtonClicked'; readonly id: number; readonly penalty: number }
  /** A clutter Ad let Mob `mobId` out of the Manhole (ad-pressure Req 4.3). The Ad stays open. */
  | { readonly type: 'adHatched'; readonly id: number; readonly mobId: number };
