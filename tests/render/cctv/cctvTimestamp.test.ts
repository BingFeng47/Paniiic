import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { cameraTimestamp } from '../../../src/render/cctv/cctvTimestamp';

const FORMAT = /^(\d{2})-(\d{2})-98 (\d{2}):(\d{2}):(\d{2}) (AM|PM)$/;

describe('cameraTimestamp', () => {
  it('shows 11:59:07 PM at tick 420', () => {
    expect(cameraTimestamp(420)).toBe('11-23-98 11:59:07 PM');
  });

  it('rolls over to midnight on 11-24-98 at tick 3600', () => {
    expect(cameraTimestamp(3599)).toBe('11-23-98 11:59:59 PM');
    expect(cameraTimestamp(3600)).toBe('11-24-98 12:00:00 AM');
  });

  // Property 1: Req 2.3 timestamp counts from 11:59:00 PM
  it('Property 1: counts seconds from 23:59:00 on 11-23-98', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 300 * 60 }), (tick) => {
        const m = FORMAT.exec(cameraTimestamp(tick));
        expect(m).not.toBeNull();
        const [, mm, dd, hh, mi, ss, ampm] = m!;
        expect(mm).toBe('11');
        const h12 = Number(hh);
        expect(h12).toBeGreaterThanOrEqual(1);
        expect(h12).toBeLessThanOrEqual(12);
        const h24 = (h12 % 12) + (ampm === 'PM' ? 12 : 0);
        const day = Number(dd);
        const total = (day - 23) * 86_400 + h24 * 3600 + Number(mi) * 60 + Number(ss);
        expect(total).toBe(23 * 3600 + 59 * 60 + Math.floor(tick / 60));
        expect(dd).toBe(tick < 3600 ? '23' : '24');
      }),
    );
  });
});
