// Pure Hint_Trigger detection (player-guide Req 2.1). Reads optional state (ads, economy)
// defensively: a missing piece means that Hint never fires.
import type { GameEvent, GameState } from '../../game/types';
import { slotStatus } from '../../game/economy/shop';
import type { ShopSlot } from '../../game/economy/economyTypes';
import { HINT_TABLE, type Anchor, type HintId, type HintRow } from './hintTable';

export interface DueHint {
  readonly id: HintId;
  readonly anchor: Anchor;
}

const SLOTS: readonly ShopSlot[] = [1, 2, 3, 4, 5];

/** True when the Wallet covers the cheapest Shop_Slot's next item. */
export function canAffordAny(state: GameState): boolean {
  const economy = state.economy;
  if (!economy || !economy.balance || !economy.balance.prices) return false;
  return SLOTS.some((slot) => slotStatus(slot, economy) === 'affordable');
}

function match(row: HintRow, prev: GameState | null, state: GameState, events: readonly GameEvent[]): Anchor | null {
  const t = row.trigger;
  switch (t.type) {
    case 'sessionStart':
      return prev === null && state.phase === 'dialing' ? { kind: 'lane' } : null;
    case 'event': {
      const e = events.find((ev) => ev.type === t.event);
      if (!e) return null;
      if (e.type === 'packetDropped') return { kind: 'packet', x: typeof e.x === 'number' ? e.x : 0 };
      return { kind: row.anchor as 'lane' | 'realLink' | 'integrity' };
    }
    case 'adOpened': {
      for (const e of events) {
        if (e.type === 'adOpened' && e.kind === t.kind) return { kind: 'ad', adId: e.id };
      }
      return null;
    }
    case 'canAfford':
      return canAffordAny(state) ? { kind: 'shop' } : null;
  }
}

/**
 * Hints whose trigger happens on this frame, in Hint_Table order. `prev` is null on the first
 * frame of the Session. Callers drop ids already shown (see hintQueue.pushDue).
 */
export function dueHints(prev: GameState | null, state: GameState, events: readonly GameEvent[]): DueHint[] {
  const out: DueHint[] = [];
  for (const row of HINT_TABLE) {
    const anchor = match(row, prev, state, events);
    if (anchor) out.push({ id: row.id, anchor });
  }
  return out;
}
