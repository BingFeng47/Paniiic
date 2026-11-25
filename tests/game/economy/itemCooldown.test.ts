// One-use item cooldowns: after buying a pop-up blocker or a surge protector, that slot can't be
// bought again for blockerCooldownSeconds / surgeCooldownSeconds (20 s by default).
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DEFAULT_ECONOMY_BALANCE } from '../../../src/game/balance/economy';
import { secondsToTicks } from '../../../src/game/balance/lane';
import { buy, createEconomyState, slotStatus, type EconomyState } from '../../../src/game/economy';

const B = DEFAULT_ECONOMY_BALANCE;
const rich = (): EconomyState => ({ ...createEconomyState(), wallet: 10_000 });
const BLOCKER_CD = secondsToTicks(B.blockerCooldownSeconds);
const SURGE_CD = secondsToTicks(B.surgeCooldownSeconds);

describe('item cooldowns', () => {
  it('defaults to 20 s for both items', () => {
    expect(B.blockerCooldownSeconds).toBe(20);
    expect(B.surgeCooldownSeconds).toBe(20);
  });

  it('a blocker bought at tick T can be bought again at T + 20 s, not before', () => {
    const first = buy(rich(), 4, 100).economy;
    expect(first.blockerReadyTick).toBe(100 + BLOCKER_CD);
    expect(slotStatus(4, first, 100 + BLOCKER_CD - 1)).toBe('cooldown');
    const early = buy(first, 4, 100 + BLOCKER_CD - 1);
    expect(early.economy).toBe(first);
    expect(early.events).toEqual([{ type: 'buyRejected', slot: 4, reason: 'cooldown' }]);
    expect(slotStatus(4, first, 100 + BLOCKER_CD)).toBe('affordable');
    const again = buy(first, 4, 100 + BLOCKER_CD);
    expect(again.events.map((e) => e.type)).toEqual(['kbChanged', 'itemBought', 'blockerStarted']);
  });

  it('a surge protector starts its cooldown when bought, even after it is used up', () => {
    const bought = buy(rich(), 5, 50).economy;
    expect(bought.surgeReadyTick).toBe(50 + SURGE_CD);
    // Used up (no longer held) but still cooling down.
    const used: EconomyState = { ...bought, surgeHeld: false };
    expect(slotStatus(5, used, 50 + SURGE_CD - 1)).toBe('cooldown');
    expect(buy(used, 5, 50 + SURGE_CD - 1).events).toEqual([{ type: 'buyRejected', slot: 5, reason: 'cooldown' }]);
    expect(slotStatus(5, used, 50 + SURGE_CD)).toBe('affordable');
  });

  it('the two cooldowns are independent and weapons have none', () => {
    const e = buy(rich(), 4, 10).economy;
    expect(slotStatus(5, e, 11)).toBe('affordable');
    expect(slotStatus(2, e, 11)).toBe('affordable');
  });

  it('a slot status without a tick ignores the cooldown (affordability checks)', () => {
    const e = buy(rich(), 4, 10).economy;
    expect(slotStatus(4, e)).toBe('affordable');
  });

  // Property: two successful blocker or surge purchases are never closer than the cooldown.
  it('Property: purchases of the same item are always at least its cooldown apart', () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({ gap: fc.integer({ min: 0, max: 2000 }), slot: fc.constantFrom(4 as const, 5 as const) }), { maxLength: 30 }),
        (presses) => {
          let e = rich();
          let tick = 0;
          const last: Record<4 | 5, number | null> = { 4: null, 5: null };
          for (const p of presses) {
            tick += p.gap;
            // The surge is used up between presses, so only the cooldown can block it.
            e = { ...e, surgeHeld: false };
            const r = buy(e, p.slot, tick);
            if (r.events.some((ev) => ev.type === 'itemBought')) {
              const prev = last[p.slot];
              if (prev !== null) expect(tick - prev).toBeGreaterThanOrEqual(p.slot === 4 ? BLOCKER_CD : SURGE_CD);
              last[p.slot] = tick;
            }
            e = r.economy;
          }
        },
      ),
    );
  });
});
