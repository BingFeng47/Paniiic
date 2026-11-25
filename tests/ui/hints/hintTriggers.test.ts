import { describe, expect, it } from 'vitest';
import { createRun } from '../../../src/game/state';
import { createEconomyState } from '../../../src/game/economy/shop';
import type { GameEvent, GameState } from '../../../src/game/types';
import { canAffordAny, dueHints } from '../../../src/ui/hints/hintTriggers';

const base = (): GameState => createRun({ seed: 1 });
const ids = (prev: GameState | null, s: GameState, ev: readonly GameEvent[]) => dueHints(prev, s, ev).map((d) => d.id);
const ev = (e: object): GameEvent => ({ tick: 1, ...e }) as unknown as GameEvent;

describe('dueHints', () => {
  it('fires lane on the first dialing frame only', () => {
    const s = base();
    expect(dueHints(null, s, [])).toEqual([{ id: 'lane', anchor: { kind: 'lane' } }]);
    expect(ids(s, s, [])).toEqual([]);
    expect(ids(null, { ...s, phase: 'connected' }, [])).toEqual([]);
  });
  it('fires realLink on connected', () => {
    const s = base();
    expect(dueHints(s, s, [ev({ type: 'connected' })])).toEqual([{ id: 'realLink', anchor: { kind: 'realLink' } }]);
  });
  it('fires clutter and interrupter on adOpened with the ad id as anchor', () => {
    const s = base();
    const open = (id: number, kind: string) => ev({ type: 'adOpened', id, kind, pattern: 'plain', laneCover: false });
    expect(dueHints(s, s, [open(4, 'clutter')])).toEqual([{ id: 'clutter', anchor: { kind: 'ad', adId: 4 } }]);
    expect(dueHints(s, s, [open(7, 'interrupter')])).toEqual([{ id: 'interrupter', anchor: { kind: 'ad', adId: 7 } }]);
    expect(ids(s, s, [open(2, 'fake')])).toEqual([]);
  });
  it('fires hatch on adHatched with a lane anchor (ad-pressure Req 8.2)', () => {
    const s = base();
    expect(dueHints(s, s, [ev({ type: 'adHatched', id: 4, mobId: 9 })])).toEqual([
      { id: 'hatch', anchor: { kind: 'lane' } },
    ]);
  });

  it('fires weapons when a saw or flamethrower is bought, not for upgrades or items', () => {
    const s = base();
    const bought = (item: string) => ev({ type: 'itemBought', item, price: 1 });
    expect(dueHints(s, s, [bought('saw')])).toEqual([{ id: 'weapons', anchor: { kind: 'shop' } }]);
    expect(ids(s, s, [bought('flamethrower')])).toEqual(['weapons']);
    for (const item of ['heavyHead', 'highRpm', 'bigTank', 'blocker', 'surge']) {
      expect(ids(s, s, [bought(item)])).toEqual([]);
    }
  });
  it('fires packet and critical on their events', () => {
    const s = base();
    expect(ids(s, s, [ev({ type: 'packetDropped', id: 1, x: 10, kb: 5 })])).toEqual(['packet']);
    expect(dueHints(s, s, [ev({ type: 'packetDropped', id: 1, x: 10, kb: 5 })])).toEqual([
      { id: 'packet', anchor: { kind: 'packet', x: 10 } },
    ]);
    expect(dueHints(s, s, [ev({ type: 'integrityCritical', integrity: 20 })])).toEqual([
      { id: 'critical', anchor: { kind: 'integrity' } },
    ]);
  });
  it('fires shop when the wallet covers the cheapest slot', () => {
    const s = base();
    const economy = createEconomyState();
    const cheapest = Math.min(...Object.values(economy.balance.prices));
    expect(ids(s, { ...s, economy: { ...economy, wallet: cheapest - 1 } }, [])).toEqual([]);
    expect(ids(s, { ...s, economy: { ...economy, wallet: cheapest } }, [])).toEqual(['shop']);
  });
  it('returns hints in table order', () => {
    const s = { ...base(), economy: { ...createEconomyState(), wallet: 9999 } };
    expect(ids(null, s, [ev({ type: 'integrityCritical', integrity: 1 }), ev({ type: 'connected' })])).toEqual([
      'lane', 'realLink', 'shop', 'critical',
    ]);
  });
});

describe('missing state never fires', () => {
  it('no ads state: no ad events means no ad hints, and nothing throws', () => {
    const s = base();
    expect(s.ads).toBeUndefined();
    expect(ids(s, s, [])).toEqual([]);
  });
  it('no economy or broken economy: canAfford is false', () => {
    const s = base();
    expect(canAffordAny(s)).toBe(false);
    const broken = { ...s, economy: { ...createEconomyState(), balance: undefined } } as unknown as GameState;
    expect(canAffordAny(broken)).toBe(false);
    const noPrices = { ...s, economy: { ...createEconomyState(), wallet: 999, balance: {} } } as unknown as GameState;
    expect(canAffordAny(noPrices)).toBe(false);
    expect(ids(s, broken, [])).toEqual([]);
  });
});
