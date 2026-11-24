import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { HINT_IDS, type HintId } from '../../../src/ui/hints/hintTable';
import {
  HINT_TIMEOUT_TICKS, MAX_QUEUED, createHintQueue, dismiss, pushDue, tickQueue, type HintQueue,
} from '../../../src/ui/hints/hintQueue';
import type { DueHint } from '../../../src/ui/hints/hintTriggers';

const due = (id: HintId): DueHint => ({ id, anchor: { kind: 'lane' } });

type Op = { readonly t: 'push'; readonly ids: HintId[] } | { readonly t: 'tick' } | { readonly t: 'dismiss' };
const opArb: fc.Arbitrary<Op> = fc.oneof(
  fc.record({ t: fc.constant('push' as const), ids: fc.array(fc.constantFrom(...HINT_IDS), { maxLength: 4 }) }),
  fc.constant({ t: 'tick' as const }),
  fc.constant({ t: 'dismiss' as const }),
);
// Each op advances time by a random number of ticks, so timeouts actually happen.
const runArb = fc.array(fc.tuple(opArb, fc.integer({ min: 0, max: 400 })), { maxLength: 60 });

describe('hintQueue unit', () => {
  it('shows the first due hint at once and queues the rest', () => {
    const q = pushDue(createHintQueue(), [due('lane'), due('realLink')], 5);
    expect(q.current).toEqual({ id: 'lane', sinceTick: 5, anchor: { kind: 'lane' } });
    expect(q.queued.map((d) => d.id)).toEqual(['realLink']);
  });
  it('drops the oldest queued hint over the limit', () => {
    const q = pushDue(createHintQueue(), [due('lane'), due('realLink'), due('clutter'), due('packet')], 0);
    expect(q.queued.map((d) => d.id)).toEqual(['clutter', 'packet']);
  });
  it('closes after 360 ticks and promotes the next', () => {
    let q = pushDue(createHintQueue(), [due('lane'), due('shop')], 10);
    expect(tickQueue(q, 10 + HINT_TIMEOUT_TICKS - 1).current?.id).toBe('lane');
    q = tickQueue(q, 10 + HINT_TIMEOUT_TICKS);
    expect(q.current).toEqual({ id: 'shop', sinceTick: 370, anchor: { kind: 'lane' } });
    expect(tickQueue(q, 370 + HINT_TIMEOUT_TICKS).current).toBeNull();
  });
  it('dismiss closes the current hint and does not re-show it', () => {
    let q = dismiss(pushDue(createHintQueue(), [due('lane')], 0), 3);
    expect(q.current).toBeNull();
    q = pushDue(q, [due('lane')], 4);
    expect(q.current).toBeNull();
  });
});

describe('hintQueue properties', () => {
  // Feature: player-guide, Property 1. **Validates: Requirements 2.2, 2.3**
  it('Property 1: each Hint becomes current at most once per Run', () => {
    fc.assert(
      fc.property(runArb, (run) => {
        let q: HintQueue = createHintQueue();
        let tick = 0;
        const becameCurrent: HintId[] = [];
        for (const [op, dt] of run) {
          tick += dt;
          const before = q.current;
          const shownBefore = q.shown;
          q = op.t === 'push' ? pushDue(q, op.ids.map(due), tick) : op.t === 'tick' ? tickQueue(q, tick) : dismiss(q, tick);
          if (q.current && q.current !== before) {
            expect(shownBefore).not.toContain(q.current.id);
            becameCurrent.push(q.current.id);
          }
        }
        expect(new Set(becameCurrent).size).toBe(becameCurrent.length);
        expect(new Set(q.shown).size).toBe(q.shown.length);
      }),
    );
  });

  // Feature: player-guide, Property 2. **Validates: Requirements 2.4, 2.5**
  it('Property 2: queue limit, oldest dropped, timeout at exactly 360 ticks', () => {
    fc.assert(
      fc.property(runArb, (run) => {
        let q: HintQueue = createHintQueue();
        let tick = 0;
        for (const [op, dt] of run) {
          // Step tick by tick so the timeout can be checked exactly.
          for (let i = 0; i < dt; i++) {
            tick += 1;
            const cur = q.current;
            q = tickQueue(q, tick);
            if (cur) {
              const age = tick - cur.sinceTick;
              if (age < HINT_TIMEOUT_TICKS) expect(q.current).toBe(cur);
              else expect(age).toBe(HINT_TIMEOUT_TICKS), expect(q.current?.id).not.toBe(cur.id);
            }
          }
          if (op.t === 'push') {
            // Reference model applied item by item: append, then drop the oldest over the limit.
            let queued = q.queued.map((d) => d.id);
            let current = q.current?.id ?? null;
            const shown = [...q.shown];
            for (const id of op.ids) {
              if (shown.includes(id) || current === id || queued.includes(id)) continue;
              if (current === null) (current = id), shown.push(id);
              else queued = [...queued, id].slice(-MAX_QUEUED);
            }
            q = pushDue(q, op.ids.map(due), tick);
            expect(q.queued.map((d) => d.id)).toEqual(queued);
            expect(q.current?.id ?? null).toBe(current);
          } else if (op.t === 'dismiss') {
            q = dismiss(q, tick);
          }
          expect(q.queued.length).toBeLessThanOrEqual(MAX_QUEUED);
        }
      }),
    );
  });
});
