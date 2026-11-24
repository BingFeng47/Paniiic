import { describe, expect, it } from 'vitest';
import { HINT_IDS, HINT_TABLE } from '../../../src/ui/hints/hintTable';

describe('HINT_TABLE', () => {
  it('lists the eight hints in priority order with unique ids', () => {
    // ad-pressure Req 8.2: `hatch` sits right after `clutter`.
    expect(HINT_IDS).toEqual(['lane', 'realLink', 'clutter', 'hatch', 'interrupter', 'packet', 'shop', 'critical']);
    expect(HINT_TABLE).toHaveLength(8);
    expect(new Set(HINT_IDS).size).toBe(HINT_TABLE.length);
  });
  it('maps each hint to its trigger', () => {
    const byId = Object.fromEntries(HINT_TABLE.map((r) => [r.id, r.trigger]));
    expect(byId.lane).toEqual({ type: 'sessionStart' });
    expect(byId.realLink).toEqual({ type: 'event', event: 'connected' });
    expect(byId.clutter).toEqual({ type: 'adOpened', kind: 'clutter' });
    expect(byId.hatch).toEqual({ type: 'event', event: 'adHatched' });
    expect(byId.interrupter).toEqual({ type: 'adOpened', kind: 'interrupter' });
    expect(byId.packet).toEqual({ type: 'event', event: 'packetDropped' });
    expect(byId.shop).toEqual({ type: 'canAfford' });
    expect(byId.critical).toEqual({ type: 'event', event: 'integrityCritical' });
  });
  it('anchors the hatch hint to the lane', () => {
    expect(HINT_TABLE.find((r) => r.id === 'hatch')?.anchor).toBe('lane');
  });

  it('is frozen', () => {
    expect(Object.isFrozen(HINT_TABLE)).toBe(true);
  });
});
