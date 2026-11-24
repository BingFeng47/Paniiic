import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { createFlashBudget, FLASH_WINDOW_TICKS } from '../../src/render/flashBudget';

describe('flashBudget', () => {
  it('grants 3 full per 60 ticks, then dim, then full again after the window', () => {
    const b = createFlashBudget();
    expect([0, 1, 2, 3].map((t) => b.requestFlash(t))).toEqual(['full', 'full', 'full', 'dim']);
    expect(b.requestFlash(59)).toBe('dim');
    expect(b.requestFlash(60)).toBe('full');
  });

  // Property 4: Flash budget holds across both fronts. **Validates: Requirements 8.1**
  it('Property 4: at most 3 full grants in any 60-tick window across all requesters', () => {
    const req = fc.record({ dt: fc.integer({ min: 0, max: 20 }), who: fc.constantFrom('juice', 'lane', 'browser') });
    fc.assert(
      fc.property(fc.array(req, { maxLength: 200 }), (reqs) => {
        const b = createFlashBudget();
        let tick = 0;
        const full: number[] = [];
        for (const r of reqs) {
          tick += r.dt;
          if (b.requestFlash(tick) === 'full') full.push(tick);
        }
        for (const t of full) {
          expect(full.filter((u) => u > t - FLASH_WINDOW_TICKS && u <= t).length).toBeLessThanOrEqual(3);
        }
      }),
    );
  });
});
