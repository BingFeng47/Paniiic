// Hint_Table (player-guide Req 2.1): every Hint, its trigger and its anchor, in display
// priority order. Pure data; the text for each id lives in src/ui/guideCopy.ts.

export type HintId =
  | 'lane' | 'realLink' | 'clutter' | 'hatch' | 'interrupter' | 'packet' | 'shop' | 'weapons' | 'critical';

/** What makes a Hint due. */
export type HintTrigger =
  | { readonly type: 'sessionStart' }
  | { readonly type: 'event'; readonly event: 'connected' | 'adHatched' | 'packetDropped' | 'integrityCritical' }
  | { readonly type: 'adOpened'; readonly kind: 'clutter' | 'interrupter' }
  | { readonly type: 'canAfford' }
  /** The first saw or flamethrower bought: the player now has a weapon to switch to. */
  | { readonly type: 'weaponBought' };

/** The kind of thing a Hint_Balloon's tail points at. */
export type AnchorKind = 'lane' | 'realLink' | 'ad' | 'packet' | 'shop' | 'integrity';

/** A resolved anchor: the kind plus the ad id for `ad` anchors and the Lane_X for `packet`. */
export type Anchor =
  | { readonly kind: 'lane' | 'realLink' | 'shop' | 'integrity' }
  | { readonly kind: 'ad'; readonly adId: number }
  | { readonly kind: 'packet'; readonly x: number };

export interface HintRow {
  readonly id: HintId;
  readonly trigger: HintTrigger;
  readonly anchor: AnchorKind;
}

export const HINT_TABLE: readonly HintRow[] = Object.freeze([
  { id: 'lane', trigger: { type: 'sessionStart' }, anchor: 'lane' },
  { id: 'realLink', trigger: { type: 'event', event: 'connected' }, anchor: 'realLink' },
  { id: 'clutter', trigger: { type: 'adOpened', kind: 'clutter' }, anchor: 'ad' },
  // ad-pressure Req 8.2: the first clutter Ad that lets a zombie out of the Manhole.
  { id: 'hatch', trigger: { type: 'event', event: 'adHatched' }, anchor: 'lane' },
  { id: 'interrupter', trigger: { type: 'adOpened', kind: 'interrupter' }, anchor: 'ad' },
  // The tail points at the dropped packet (its Lane_X comes from the packetDropped event).
  { id: 'packet', trigger: { type: 'event', event: 'packetDropped' }, anchor: 'packet' },
  { id: 'shop', trigger: { type: 'canAfford' }, anchor: 'shop' },
  { id: 'weapons', trigger: { type: 'weaponBought' }, anchor: 'shop' },
  { id: 'critical', trigger: { type: 'event', event: 'integrityCritical' }, anchor: 'integrity' },
] as const satisfies readonly HintRow[]);

export const HINT_IDS: readonly HintId[] = Object.freeze(HINT_TABLE.map((r) => r.id));
