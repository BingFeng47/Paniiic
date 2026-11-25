// utcDay (leaderboard Req 1.3).
import { describe, expect, it } from 'vitest';
import { utcDay } from '../../src/core/clock';

describe('utcDay', () => {
  it('returns the UTC Day as YYYY-MM-DD', () => {
    expect(utcDay(new Date(Date.UTC(2026, 10, 24, 12, 0, 0)))).toBe('2026-11-24');
    expect(utcDay(new Date(Date.UTC(1998, 0, 5)))).toBe('1998-01-05');
  });

  it('uses UTC, not the local time zone, at the Day boundary', () => {
    // 23:30 at UTC-5 is already the next Day in UTC.
    expect(utcDay(new Date('2026-11-30T23:30:00-05:00'))).toBe('2026-12-01');
    expect(utcDay(new Date('2026-12-01T00:30:00+05:00'))).toBe('2026-11-30');
    expect(utcDay(new Date('2026-11-24T23:59:59.999Z'))).toBe('2026-11-24');
  });
});
