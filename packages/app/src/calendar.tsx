'use client';
import { useEffect, useRef, useMemo } from 'react';
import type { CSSProperties } from 'react';
import { calendarWindow, blockPosition, shiftDate, localDate } from '@life-os/shared';
import type { ExecutionSnapshot, ScheduleBlock } from '@life-os/shared';
const hourHeight = 64;
export function WorkCalendar({
  data,
  selectedDate,
  days,
  now,
  disabled,
  onDate,
  onDays,
  onOpen,
  onCreate,
}: {
  data: ExecutionSnapshot;
  selectedDate: string;
  days: 1 | 7;
  now: number;
  disabled: boolean;
  onDate: (date: string) => void;
  onDays: (days: 1 | 7) => void;
  onOpen: (block: ScheduleBlock) => void;
  onCreate: (date: string, instant?: string) => void;
}) {
  const scroll = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (scroll.current) scroll.current.scrollTop = 7 * hourHeight;
  }, []);
  const resolved = useMemo(() => {
    try {
      return {
        windows: Array.from({ length: days }, (_, i) => {
          const date = shiftDate(data.date, i);
          return { date, ...calendarWindow(date, data.timeZone) };
        }),
        error: '',
      };
    } catch (error) {
      return {
        windows: [],
        error: error instanceof Error ? error.message : 'Calendar time could not be resolved.',
      };
    }
  }, [data.date, data.timeZone, days]);
  const formatter = useMemo(
    () =>
      new Intl.DateTimeFormat('en-US', {
        timeZone: data.timeZone,
        hour: 'numeric',
        minute: '2-digit',
        timeZoneName: 'short',
      }),
    [data.timeZone],
  );
  if (resolved.error) return <p role="alert">{resolved.error}</p>;
  const windows = resolved.windows;
  const dateLabel = (date: string) =>
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'UTC',
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    }).format(new Date(date + 'T12:00Z'));
  const today = localDate(new Date(now), data.timeZone);
  const monday = shiftDate(
    selectedDate,
    -((new Date(selectedDate + 'T12:00Z').getUTCDay() + 6) % 7),
  );
  return (
    <section className="work-calendar" aria-label="Work calendar" aria-busy={disabled}>
      <div className="calendar-toolbar">
        <div>
          <p className="eyebrow">Your time</p>
          <h2>{dateLabel(selectedDate)}</h2>
        </div>
        <div className="execution-actions">
          <div className="calendar-view" role="group" aria-label="Calendar view">
            {([1, 7] as const).map((n) => (
              <button
                key={n}
                className="button"
                aria-pressed={days === n}
                onClick={() => onDays(n)}
              >
                {n === 1 ? 'Day' : 'Week'}
              </button>
            ))}
          </div>
          <button
            className="button button-primary"
            disabled={disabled}
            onClick={() => onCreate(selectedDate)}
          >
            Add block
          </button>
        </div>
      </div>
      <div className="week-selector" aria-label="Choose a day">
        <button
          className="button"
          aria-label="Previous week"
          onClick={() => onDate(shiftDate(selectedDate, -7))}
        >
          ←
        </button>
        {Array.from({ length: 7 }, (_, i) => {
          const date = shiftDate(monday, i);
          return (
            <button
              key={date}
              className={date === selectedDate ? 'selected' : ''}
              aria-pressed={date === selectedDate}
              aria-label={dateLabel(date)}
              onClick={() => onDate(date)}
            >
              <span>
                {new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short' }).format(
                  new Date(date + 'T12:00Z'),
                )}
              </span>
              <strong>{Number(date.slice(-2))}</strong>
              {date === today && <span className="date-today-dot" />}
            </button>
          );
        })}
        <button
          className="button"
          aria-label="Next week"
          onClick={() => onDate(shiftDate(selectedDate, 7))}
        >
          →
        </button>
      </div>
      {!data.schedule.length && (
        <p className="calendar-empty">
          Your calendar has room. Select an hour to protect time for meaningful work.
        </p>
      )}
      {disabled && <p role="status">Loading calendar…</p>}
      <div className="calendar-scroll" ref={scroll}>
        <div className={'calendar-columns' + (days === 7 ? ' calendar-week' : '')}>
          {windows.map((window) => {
            const hours = (window.end - window.start) / 3600000;
            const blocks = data.schedule.flatMap((b) => {
              const p = blockPosition(b.startsAt, b.endsAt, window);
              return p ? [{ b, p }] : [];
            });
            return (
              <div
                className="calendar-day"
                key={window.date}
                style={{ height: hours * hourHeight + 38 }}
              >
                <div className="calendar-day-heading">{dateLabel(window.date)}</div>
                <div className="calendar-hours" style={{ height: hours * hourHeight }}>
                  {Array.from({ length: Math.ceil(hours) }, (_, hour) => {
                    const instant = new Date(window.start + hour * 3600000).toISOString();
                    return (
                      <div
                        className="calendar-hour"
                        key={hour}
                        style={{
                          top: hour * hourHeight,
                          height: Math.min(1, hours - hour) * hourHeight,
                        }}
                      >
                        <time>{formatter.format(new Date(instant))}</time>
                        <button
                          className="calendar-slot"
                          disabled={disabled}
                          onClick={() => onCreate(window.date, instant)}
                          aria-label={
                            'Add block on ' +
                            window.date +
                            ' at ' +
                            formatter.format(new Date(instant))
                          }
                        />
                      </div>
                    );
                  })}
                  {blocks.map(({ b, p }) => {
                    const category =
                      b.categoryId ?? (b.taskId ? data.rankingCategories[b.taskId] : null);
                    const color = category
                      ? [...category].reduce((n, c) => n + c.charCodeAt(0), 0) % 5
                      : ['task', 'focus', 'routine', 'meeting', 'training'].indexOf(b.kind);
                    return (
                      <button
                        key={b.id}
                        className={'calendar-event event-color-' + Math.max(0, color)}
                        style={
                          {
                            top: p.top * hourHeight,
                            height: p.height * hourHeight,
                          } as CSSProperties
                        }
                        disabled={disabled}
                        onClick={() => onOpen(b)}
                        aria-label={
                          b.title +
                          ', ' +
                          formatter.format(new Date(b.startsAt)) +
                          ' to ' +
                          formatter.format(new Date(b.endsAt))
                        }
                      >
                        <strong>{b.title}</strong>
                        <small>
                          {formatter.format(new Date(b.startsAt))}
                          {b.seriesId ? ' · Repeats' : ''}
                        </small>
                      </button>
                    );
                  })}
                  {now >= window.start && now < window.end && (
                    <div
                      className="current-time-line"
                      style={{ top: ((now - window.start) / 3600000) * hourHeight }}
                      role="img"
                      aria-label="Current time"
                    >
                      <span />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <p className="calendar-caption">
        {data.timeZone} · Select an hour to add a block. Select a block to work on it.
        {data.limits.schedule ? ' Some blocks exceed the display limit; switch to Day.' : ''}
      </p>
    </section>
  );
}
