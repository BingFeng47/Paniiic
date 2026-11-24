import { describe, expect, it } from 'vitest';
import { createTickContext } from '../../src/game/context';
import { nextRandom } from '../../src/game/rng';
import { createRun } from '../../src/game/state';
import type { GameEvent, MutableGameState } from '../../src/game/types';

function setup(overrides: Partial<MutableGameState> = {}) {
  const run = createRun({ seed: 42 });
  const draft: MutableGameState = { ...run, pauseSources: [...run.pauseSources], ...overrides };
  const events: GameEvent[] = [];
  const ctx = createTickContext(draft, events);
  return { draft, events, ctx };
}

describe('createTickContext', () => {
  it('exposes the draft tick and tags emitted events with it, in order', () => {
    const { draft, events, ctx } = setup({ tick: 7 });
    expect(ctx.tick).toBe(7);
    ctx.emit({ type: 'connected' });
    ctx.emit({ type: 'downloadStarted' });
    draft.tick = 8;
    ctx.emit({ type: 'won' });
    expect(events).toEqual([
      { type: 'connected', tick: 7 },
      { type: 'downloadStarted', tick: 7 },
      { type: 'won', tick: 8 },
    ]);
  });

  it('random() draws from the seeded generator and advances draft.rng', () => {
    const { draft, ctx } = setup();
    const first = nextRandom(draft.rng);
    const second = nextRandom(first.next);
    expect(ctx.random()).toBe(first.value);
    expect(draft.rng).toBe(first.next);
    expect(ctx.random()).toBe(second.value);
    expect(draft.rng).toBe(second.next);
  });

  describe('damageModem', () => {
    it('reduces integrity and emits modemHit with the amount and remaining integrity', () => {
      const { draft, events, ctx } = setup();
      ctx.damageModem(30);
      expect(draft.integrity).toBe(70);
      expect(events).toEqual([{ type: 'modemHit', amount: 30, integrity: 70, tick: 0 }]);
    });

    it('floors integrity at 0', () => {
      const { draft, events, ctx } = setup({ integrity: 10, criticalLatched: true });
      ctx.damageModem(25);
      expect(draft.integrity).toBe(0);
      expect(events).toEqual([{ type: 'modemHit', amount: 25, integrity: 0, tick: 0 }]);
    });

    it('emits integrityCritical once when crossing to or below the threshold', () => {
      const { draft, events, ctx } = setup();
      ctx.damageModem(80); // exactly 20 = critical
      ctx.damageModem(5);
      ctx.damageModem(5);
      expect(draft.criticalLatched).toBe(true);
      expect(events.filter((e) => e.type === 'integrityCritical')).toEqual([
        { type: 'integrityCritical', integrity: 20, tick: 0 },
      ]);
      // modemHit comes before integrityCritical for the crossing hit.
      expect(events.slice(0, 2).map((e) => e.type)).toEqual(['modemHit', 'integrityCritical']);
    });

    it('fires again when a hit drops integrity from above critical while still latched', () => {
      // E.g. after a repair: integrity is back above critical but no hit has cleared the latch.
      const { events, ctx } = setup({ integrity: 50, criticalLatched: true });
      ctx.damageModem(40);
      expect(events.filter((e) => e.type === 'integrityCritical')).toEqual([
        { type: 'integrityCritical', integrity: 10, tick: 0 },
      ]);
    });

    it('clears the latch when integrity is above critical so a later crossing fires again', () => {
      const { draft, events, ctx } = setup({ integrity: 50, criticalLatched: true });
      ctx.damageModem(0);
      expect(draft.criticalLatched).toBe(false);
      ctx.damageModem(40);
      expect(events.filter((e) => e.type === 'integrityCritical')).toHaveLength(1);
    });
  });

  describe('penalizeDownload', () => {
    it('reduces download and emits downloadPenalty', () => {
      const { draft, events, ctx } = setup({ download: 40 });
      ctx.penalizeDownload(15);
      expect(draft.download).toBe(25);
      expect(events).toEqual([{ type: 'downloadPenalty', amount: 15, download: 25, tick: 0 }]);
    });

    it('floors download at 0', () => {
      const { draft, events, ctx } = setup({ download: 5 });
      ctx.penalizeDownload(10);
      expect(draft.download).toBe(0);
      expect(events).toEqual([{ type: 'downloadPenalty', amount: 10, download: 0, tick: 0 }]);
    });
  });

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'throws on invalid amount %s and leaves the draft unchanged',
    (amount) => {
      const { draft, events, ctx } = setup({ download: 50 });
      expect(() => ctx.damageModem(amount)).toThrow(Error);
      expect(() => ctx.penalizeDownload(amount)).toThrow(Error);
      expect(draft.integrity).toBe(100);
      expect(draft.download).toBe(50);
      expect(events).toEqual([]);
    },
  );

  describe('pause sources', () => {
    it('keeps ids sorted and unique', () => {
      const { draft, ctx } = setup();
      ctx.addPauseSource('popup');
      ctx.addPauseSource('ad');
      ctx.addPauseSource('popup');
      expect(draft.pauseSources).toEqual(['ad', 'popup']);
    });

    it('gives the same array regardless of add order', () => {
      const a = setup();
      const b = setup();
      for (const id of ['c', 'a', 'b']) a.ctx.addPauseSource(id);
      for (const id of ['b', 'c', 'a']) b.ctx.addPauseSource(id);
      expect(a.draft.pauseSources).toEqual(b.draft.pauseSources);
    });

    it('removes an id, and removing an absent id is a no-op', () => {
      const { draft, ctx } = setup();
      ctx.addPauseSource('ad');
      ctx.addPauseSource('popup');
      ctx.removePauseSource('ad');
      ctx.removePauseSource('missing');
      expect(draft.pauseSources).toEqual(['popup']);
      ctx.removePauseSource('popup');
      expect(draft.pauseSources).toEqual([]);
    });

    it('does not emit events', () => {
      const { events, ctx } = setup();
      ctx.addPauseSource('ad');
      ctx.removePauseSource('ad');
      expect(events).toEqual([]);
    });
  });
});

describe('eventsSoFar', () => {
  it('returns this tick\'s events in order as a frozen copy', () => {
    const { events, ctx } = setup({ tick: 3 });
    expect(ctx.eventsSoFar()).toEqual([]);
    ctx.emit({ type: 'connected' });
    ctx.emit({ type: 'downloadStarted' });
    const seen = ctx.eventsSoFar();
    expect(seen).toEqual([
      { type: 'connected', tick: 3 },
      { type: 'downloadStarted', tick: 3 },
    ]);
    expect(Object.isFrozen(seen)).toBe(true);
    expect(seen).not.toBe(events);
    ctx.emit({ type: 'won' });
    expect(seen).toHaveLength(2);
    expect(ctx.eventsSoFar()).toHaveLength(3);
  });
});
