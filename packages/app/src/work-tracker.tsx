'use client';
import { useState } from 'react';
import type { ExecutionSnapshot, FocusSession } from '@life-os/shared';
import { elapsedFocus, stopwatchTime, workDuration } from '@life-os/shared';
export function WorkTracker({
  data,
  sessions,
  now,
  disabled,
  onNew,
  onControl,
  onOpen,
  onSelect,
  onReview,
  onTarget,
  compact = false,
}: {
  data: ExecutionSnapshot;
  sessions: FocusSession[];
  now: number;
  disabled: boolean;
  onNew: () => void;
  onControl: (session: FocusSession) => void;
  onOpen: () => void;
  onSelect: (session: FocusSession) => void;
  onReview: (id: string) => void;
  onTarget: () => void;
  compact?: boolean;
}) {
  const [range, setRange] = useState<7 | 30>(7);
  const w = data.workTime,
    runner = sessions.find((s) => s.resumedAt),
    target = w.targetMinutes * 60;
  const extra = runner
    ? Math.max(
        0,
        Math.floor(
          (Math.min(now, Date.parse(w.dayEnd)) -
            Math.max(
              Date.parse(data.serverNow),
              Date.parse(w.dayStart),
              Date.parse(runner.resumedAt!),
            )) /
            1000,
        ),
      )
    : 0;
  const seconds = w.seconds + extra;
  const days = w.days
    .slice(-range)
    .map((d) => ({ ...d, seconds: d.seconds + (d.date === w.date ? extra : 0) }));
  const total = days.reduce((n, d) => n + d.seconds, 0),
    maximum = Math.max(target, ...days.map((d) => d.seconds));
  return (
    <section
      className={'work-tracker' + (compact ? ' work-tracker-compact' : ' execution-card')}
      aria-labelledby="actual-work-title"
    >
      {compact ? (
        <h3 id="actual-work-title">Actual work today</h3>
      ) : (
        <div className="card-heading">
          <div>
            <p className="eyebrow">Only the time you track</p>
            <h2 id="actual-work-title">Actual work</h2>
          </div>
          <button className="button button-primary" disabled={disabled} onClick={onNew}>
            New work session
          </button>
        </div>
      )}
      <div className="work-total">
        <strong data-testid="actual-work-total">{workDuration(seconds)}</strong>
        <span>/ {workDuration(target)}</span>
        <button className="button button-quiet" disabled={disabled} onClick={onTarget}>
          Edit daily target
        </button>
      </div>
      <progress
        aria-label="Daily actual-work target"
        max={target}
        value={Math.min(target, seconds)}
      />
      {!compact && (
        <div className="work-current">
          <div>
            <span className={'session-status ' + (runner ? 'running' : 'paused')}>
              {runner ? 'Running' : sessions.length ? 'Paused' : 'Idle'}
            </span>
            <span>{runner?.objective ?? 'No activity is counting time.'}</span>
            {runner && <strong>{stopwatchTime(elapsedFocus(runner, new Date(now)))}</strong>}
          </div>
          <div className="execution-actions">
            {runner && (
              <button className="button" disabled={disabled} onClick={() => onControl(runner)}>
                Pause work
              </button>
            )}
            {sessions.length > 0 && (
              <button className="button" disabled={disabled} onClick={onOpen}>
                Open timer
              </button>
            )}
          </div>
        </div>
      )}
      <details className="work-breakdown">
        <summary>
          {compact ? 'View activity breakdown & saved sessions' : 'Activities & saved sessions'}
        </summary>
        {w.activities.length ? (
          <ul className="work-activity-list">
            {w.activities.map((a) => (
              <li key={a.key}>
                <span>
                  {a.objective}
                  <small>
                    {a.category} · {a.running ? 'Running' : a.paused ? 'Paused' : 'Recorded'}
                  </small>
                </span>
                <strong>{workDuration(a.seconds + (a.running ? extra : 0))}</strong>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">
            No tracked intervals on this day. Calendar plans never count as work.
          </p>
        )}
        {sessions.length > 0 && (
          <>
            <p className="eyebrow">Unfinished sessions · accumulated across days</p>
            <ul className="work-activity-list">
              {sessions.map((s) => (
                <li key={s.id}>
                  <button
                    className="button button-quiet"
                    disabled={disabled}
                    onClick={() => onSelect(s)}
                    aria-label={(s.resumedAt ? 'Select ' : 'Resume ') + s.objective}
                  >
                    {s.objective}
                  </button>
                  <span>
                    {stopwatchTime(elapsedFocus(s, new Date(now)))} ·{' '}
                    {s.resumedAt ? 'Running' : 'Paused'}
                  </span>
                  <button
                    className="button button-quiet"
                    disabled={disabled}
                    onClick={() => onReview(s.id)}
                  >
                    Review time
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
        {data.focusNext && (
          <button className="button" onClick={onOpen}>
            More saved sessions
          </button>
        )}
      </details>
      <details className="work-breakdown">
        <summary>Work history & trends</summary>
        <div className="execution-actions" role="group" aria-label="Work history range">
          {([7, 30] as const).map((n) => (
            <button
              className="button"
              key={n}
              aria-pressed={range === n}
              onClick={() => setRange(n)}
            >
              Last {n} days
            </button>
          ))}
        </div>
        <p className="work-history-summary">
          {workDuration(total)} tracked · {workDuration(total / range)} daily average ·{' '}
          {days.filter((d) => d.seconds >= target).length}/{range} target days
        </p>
        <div className="work-day-bars" aria-label="Daily actual work">
          {days.map((d) => (
            <div key={d.date} title={d.date + ': ' + workDuration(d.seconds)}>
              <span className="sr-only">
                {d.date}: {workDuration(d.seconds)}
              </span>
              <i
                aria-hidden="true"
                style={{ height: d.seconds > 0 ? Math.max(2, (d.seconds / maximum) * 80) : 0 }}
              />
              <small aria-hidden="true">{Number(d.date.slice(-2))}</small>
            </div>
          ))}
        </div>
        <details>
          <summary>Daily totals</summary>
          <ul className="work-activity-list">
            {days.map((d) => (
              <li key={d.date}>
                <time>{d.date}</time>
                <span>
                  {workDuration(d.seconds)} / {workDuration(target)}
                </span>
              </li>
            ))}
          </ul>
        </details>
        <h3>Categories · last 30 days</h3>
        <ul className="work-activity-list">
          {w.categories.map((c) => (
            <li key={c.name}>
              <span>{c.name}</span>
              <strong>{workDuration(c.seconds)}</strong>
            </li>
          ))}
        </ul>
        <p className="quiet-note">
          Targets use your current setting. Category history uses the latest server snapshot and
          current work links. Duration measures tracked time, not quality or accomplishment.
        </p>
        <h3>Recent sessions</h3>
        <ul className="work-activity-list">
          {w.history.map((s) => (
            <li key={s.id}>
              <span>
                {s.objective}
                <small>
                  {s.discardedAt
                    ? 'Discarded'
                    : s.endedAt
                      ? 'Finished'
                      : s.resumedAt
                        ? 'Running'
                        : 'Paused'}{' '}
                  · {workDuration(elapsedFocus(s, new Date(now)))}
                </small>
              </span>
              <button
                className="button button-quiet"
                disabled={disabled}
                onClick={() => onReview(s.id)}
              >
                Review time
              </button>
            </li>
          ))}
        </ul>
        {w.historyLimited && (
          <p className="quiet-note">
            Showing 20 recent sessions; totals include every recorded interval.
          </p>
        )}
      </details>
    </section>
  );
}
