import { describe, expect, it } from 'vitest';
import { dailyContent, localDate } from './daily';

describe('local daily boundaries', () => {
  it('uses the selected timezone across UTC midnight', () => {
    expect(localDate(new Date('2026-10-07T06:00:00Z'), 'America/Los_Angeles')).toBe('2026-10-06');
    expect(localDate(new Date('2026-10-07T06:00:00Z'), 'Asia/Tokyo')).toBe('2026-10-07');
  });
  it('is stable across a 25-hour DST day and changes on local midnight', () => {
    const start = dailyContent(new Date('2026-11-01T07:00:00Z'), 'America/Los_Angeles');
    const end = dailyContent(new Date('2026-11-02T07:59:59Z'), 'America/Los_Angeles');
    expect(start).toEqual(end);
    expect(dailyContent(new Date('2026-11-02T08:00:00Z'), 'America/Los_Angeles').date).toBe(
      '2026-11-02',
    );
  });
  it('handles the spring DST jump without skipping a date', () => {
    expect(localDate(new Date('2026-03-08T09:59:59Z'), 'America/Los_Angeles')).toBe('2026-03-08');
    expect(localDate(new Date('2026-03-08T10:00:00Z'), 'America/Los_Angeles')).toBe('2026-03-08');
  });
  it('rejects invalid input rather than silently using server UTC', () => {
    expect(() => localDate(new Date(), 'Not/AZone')).toThrow();
    expect(() => localDate(new Date('bad'), 'UTC')).toThrow();
  });
  it('returns attributed bundled content, including before the epoch', () => {
    expect(dailyContent(new Date('1960-01-01Z'), 'UTC').scripture.text.length).toBeGreaterThan(20);
    expect(dailyContent(new Date('2026-10-06Z'), 'UTC').thought.author).toBe('Life OS');
  });
});
