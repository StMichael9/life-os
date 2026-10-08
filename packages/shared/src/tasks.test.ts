import { describe, it, expect } from 'vitest';
import { dueInstant, wallTime } from './tasks';
describe('Task due instants', () => {
  it('uses the account timezone, including fractional offsets and date boundaries', () => {
    expect(dueInstant('2026-10-07T08:30', 'America/Los_Angeles')).toBe('2026-10-07T15:30:00.000Z');
    expect(dueInstant('2026-10-07T00:15', 'Asia/Kathmandu')).toBe('2026-10-06T18:30:00.000Z');
    expect(wallTime('2026-10-07T15:30:45Z', 'America/Los_Angeles')).toBe('2026-10-07T08:30:45');
  });
  it('rejects skipped and repeated DST times instead of silently moving the deadline', () => {
    expect(() => dueInstant('2026-03-08T02:30', 'America/Los_Angeles')).toThrow('does not exist');
    expect(() => dueInstant('2026-11-01T01:30', 'America/Los_Angeles')).toThrow('repeats');
    expect(() => dueInstant('2026-02-30T12:00', 'UTC')).toThrow('valid');
    expect(() => dueInstant('invalid', 'UTC')).toThrow('valid');
  });
});
