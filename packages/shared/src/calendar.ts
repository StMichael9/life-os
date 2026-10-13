import { dueInstant } from './tasks';
export function shiftDate(date: string, days: number) {
  const instant = new Date(date + 'T12:00:00Z');
  instant.setUTCDate(instant.getUTCDate() + days);
  return instant.toISOString().slice(0, 10);
}
/** Bound recurrence before allocating records. Never silently shift a DST gap/fold. */
export function recurringInstants(
  input: { startsOn: string; endsOn: string; startTime: string; endTime: string; days: number[] },
  timeZone: string,
) {
  const span = (Date.parse(input.endsOn) - Date.parse(input.startsOn)) / 86400000;
  if (!Number.isInteger(span) || span < 0 || span > 365)
    throw new Error('Choose a repeat range of at most one year.');
  const result: { date: string; startsAt: string; endsAt: string }[] = [];
  for (let offset = 0; offset <= span; offset++) {
    const date = shiftDate(input.startsOn, offset);
    if (!input.days.includes(new Date(date + 'T12:00:00Z').getUTCDay())) continue;
    const startsAt = dueInstant(date + 'T' + input.startTime, timeZone);
    const endsAt = dueInstant(date + 'T' + input.endTime, timeZone);
    if (Date.parse(endsAt) <= Date.parse(startsAt))
      throw new Error('Repeated blocks must end later on the same day.');
    result.push({ date, startsAt, endsAt });
  }
  if (!result.length) throw new Error('No selected weekday occurs in this repeat range.');
  return result;
}
export function calendarWindow(date: string, timeZone: string) {
  return {
    start: Date.parse(dueInstant(date + 'T00:00', timeZone)),
    end: Date.parse(dueInstant(shiftDate(date, 1) + 'T00:00', timeZone)),
  };
}
export function blockPosition(
  startsAt: string,
  endsAt: string,
  window: { start: number; end: number },
) {
  const start = Math.max(window.start, Date.parse(startsAt));
  const end = Math.min(window.end, Date.parse(endsAt));
  return end <= start
    ? null
    : { top: (start - window.start) / 3600000, height: (end - start) / 3600000 };
}
export function focusCountdown(elapsedSeconds: number, plannedMinutes: number) {
  const duration = plannedMinutes * 60;
  return {
    remaining: Math.max(0, duration - elapsedSeconds),
    progress: Math.min(1, Math.max(0, elapsedSeconds / duration)),
    overtime: Math.max(0, elapsedSeconds - duration),
  };
}
