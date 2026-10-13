import { describe, it, expect } from 'vitest';
import {
  recurringInstants,
  calendarWindow,
  blockPosition,
  shiftDate,
  focusCountdown,
} from './calendar';
describe('calendar and repeat integrity', () => {
  it('positions real durations and clips blocks crossing midnight', () => {
    const window = calendarWindow('2026-10-08', 'America/Los_Angeles');
    expect(blockPosition('2026-10-08T06:00Z', '2026-10-08T08:30Z', window)).toEqual({
      top: 0,
      height: 1.5,
    });
    expect(blockPosition('2026-10-08T16:00Z', '2026-10-08T17:30Z', window)).toEqual({
      top: 9,
      height: 1.5,
    });
    expect(blockPosition('2026-10-09T07:00Z', '2026-10-09T08:00Z', window)).toBeNull();
  });
  it('shows 23/25 actual hours and preserves local recurring time across DST', () => {
    expect(
      (calendarWindow('2026-03-08', 'America/Los_Angeles').end -
        calendarWindow('2026-03-08', 'America/Los_Angeles').start) /
        3600000,
    ).toBe(23);
    expect(
      (calendarWindow('2026-11-01', 'America/Los_Angeles').end -
        calendarWindow('2026-11-01', 'America/Los_Angeles').start) /
        3600000,
    ).toBe(25);
    const records = recurringInstants(
      {
        startsOn: '2026-03-07',
        endsOn: '2026-03-09',
        startTime: '09:00',
        endTime: '10:00',
        days: [0, 1, 2, 3, 4, 5, 6],
      },
      'America/Los_Angeles',
    );
    expect(records.map((r) => r.startsAt)).toEqual([
      '2026-03-07T17:00:00.000Z',
      '2026-03-08T16:00:00.000Z',
      '2026-03-09T16:00:00.000Z',
    ]);
    expect(() =>
      recurringInstants(
        {
          startsOn: '2026-03-08',
          endsOn: '2026-03-08',
          startTime: '02:30',
          endTime: '03:30',
          days: [0],
        },
        'America/Los_Angeles',
      ),
    ).toThrow('does not exist');
    expect(() =>
      recurringInstants(
        {
          startsOn: '2026-11-01',
          endsOn: '2026-11-01',
          startTime: '01:30',
          endTime: '03:30',
          days: [0],
        },
        'America/Los_Angeles',
      ),
    ).toThrow('repeats');
  });
  it('bounds repeat expansion and handles date/year transitions', () => {
    expect(shiftDate('2026-12-31', 1)).toBe('2027-01-01');
    expect(shiftDate('2028-03-01', -1)).toBe('2028-02-29');
    expect(
      recurringInstants(
        {
          startsOn: '2026-10-05',
          endsOn: '2026-10-11',
          startTime: '09:00',
          endTime: '10:00',
          days: [1, 3, 5],
        },
        'UTC',
      ),
    ).toHaveLength(3);
    expect(() =>
      recurringInstants(
        {
          startsOn: '2026-01-01',
          endsOn: '2028-01-01',
          startTime: '09:00',
          endTime: '10:00',
          days: [1],
        },
        'UTC',
      ),
    ).toThrow('one year');
  });
  it('counts down without discarding overtime', () => {
    expect(focusCountdown(65, 2)).toEqual({ remaining: 55, progress: 65 / 120, overtime: 0 });
    expect(focusCountdown(150, 2)).toEqual({ remaining: 0, progress: 1, overtime: 30 });
  });
});
