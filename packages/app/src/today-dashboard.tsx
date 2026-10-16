'use client';
import { useState } from 'react';
import type { ReactNode } from 'react';
import type { ExecutionSnapshot, FocusSession, ScheduleBlock } from '@life-os/shared';
import { localDate, workDuration } from '@life-os/shared';
import { ArrowUpRight, Plus } from 'lucide-react';

export function TodayDashboard({
  data,
  now,
  disabled,
  focus,
  work,
  onPlan,
  onReopen,
  onOutcome,
  onRoutine,
  onNewRoutine,
  onBlock,
  onNewBlock,
  onStartTask,
}: {
  data: ExecutionSnapshot;
  now: number;
  disabled: boolean;
  focus: ReactNode;
  work: ReactNode;
  onPlan: (workflow: 'save' | 'start' | 'close') => void;
  onReopen: () => void;
  onOutcome: (index: number, completed: boolean) => void;
  onRoutine: (id: string, completed: boolean) => void;
  onNewRoutine: () => void;
  onBlock: (block: ScheduleBlock) => void;
  onNewBlock: () => void;
  onStartTask: (id: string, title: string, minutes: number) => void;
}) {
  const [allBlocks, setAllBlocks] = useState(false);
  const [allRoutines, setAllRoutines] = useState(false);
  const realDate = localDate(new Date(now), data.timeZone);
  const historical = data.date !== realDate;
  const running: FocusSession | undefined = data.focusSessions.find((s) => s.resumedAt);
  const sorted = [...data.schedule].sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  const upcoming = sorted.filter((b) => Date.parse(b.endsAt) > now);
  const currentBlock = upcoming.find((b) => Date.parse(b.startsAt) <= now);
  const recommendation = data.recommendations[0];
  const task = data.tasks.find((t) => t.id === recommendation?.id);
  const nextBlock = upcoming[0];
  const blocks = historical || allBlocks ? sorted : upcoming.slice(0, 3);
  const routines = data.routines.filter((r) => r.scheduled || r.completed);
  const due = data.tasks
    .filter(
      (t) =>
        (running || currentBlock || t.id !== task?.id) &&
        t.status !== 'completed' &&
        t.status !== 'cancelled' &&
        t.dueAt &&
        Date.parse(t.dueAt) <= now,
    )
    .slice(0, 3);
  const time = new Intl.DateTimeFormat('en-US', {
    timeZone: data.timeZone,
    hour: 'numeric',
    minute: '2-digit',
  });
  const title = running?.objective ?? currentBlock?.title ?? task?.title ?? nextBlock?.title;
  const nextLabel = running
    ? 'Working on it now'
    : currentBlock
      ? 'Scheduled now'
      : task
        ? 'Recommended next'
        : 'Coming up';
  return (
    <>
      <div className="today-season-line">
        <span>Your season</span>{' '}
        <a
          href={
            data.activeSeason
              ? '/direction?view=seasons&id=' + data.activeSeason.id
              : '/direction?view=seasons'
          }
        >
          {data.activeSeason?.name ?? 'Choose a direction'}{' '}
          <ArrowUpRight size={13} aria-hidden="true" />
        </a>
      </div>
      <div className="today-bento">
        <section className="execution-card today-agenda" aria-labelledby="daily-agenda-heading">
          <div className="card-heading">
            <h2 id="daily-agenda-heading">Daily Agenda</h2>
            <button
              className="button button-quiet"
              disabled={disabled || !!data.plan?.closedAt}
              onClick={() => onPlan('save')}
            >
              Edit priorities <ArrowUpRight size={13} aria-hidden="true" />
            </button>
          </div>
          <p className="eyebrow">The One Thing</p>
          <p className="today-one-thing">
            {data.plan?.oneThing ?? 'Choose one meaningful outcome for today.'}
          </p>
          <h3 className="eyebrow">Your Big 3</h3>
          {data.plan?.outcomes.length ? (
            <ol className="today-outcomes">
              {data.plan.outcomes.map((o, index) => (
                <li key={index}>
                  <label>
                    <input
                      type="checkbox"
                      disabled={disabled || !!data.plan?.closedAt}
                      checked={!!o.completedAt}
                      onChange={(e) => onOutcome(index, e.target.checked)}
                    />
                    <span>{o.outcome}</span>
                  </label>
                  {o.taskId && (
                    <a
                      href={'/tasks?id=' + o.taskId}
                      aria-label={'Open linked Task for ' + o.outcome}
                    >
                      <ArrowUpRight size={16} aria-hidden="true" />
                    </a>
                  )}
                </li>
              ))}
            </ol>
          ) : (
            <p className="muted today-empty-note">
              Choose up to three outcomes that would make today successful.
            </p>
          )}
          <div className="today-day-actions">
            {data.plan?.closedAt ? (
              <button className="button" disabled={disabled} onClick={onReopen}>
                Reopen Day
              </button>
            ) : (
              <button
                className="button"
                disabled={disabled}
                onClick={() => onPlan(data.plan?.startedAt ? 'close' : 'start')}
              >
                {data.plan?.startedAt ? 'Close Day' : 'Start Day'}
              </button>
            )}
          </div>
          {!historical && (
            <div className="today-next-action">
              <span className="status-dot" aria-hidden="true" />
              <div>
                <p className="eyebrow">{title ? nextLabel : 'A little space to begin'}</p>
                <h3>{title ?? 'Choose work or capture a thought.'}</h3>
                <p className="muted">
                  {running
                    ? 'Your active session is in Core Focus.'
                    : currentBlock
                      ? 'Planned time counts only when you start working.'
                      : task
                        ? 'A suggestion based on your saved priorities.'
                        : 'One meaningful step at a time.'}
                </p>
              </div>
              {running ? (
                <a href="#core-focus" aria-label="Go to current session">
                  <ArrowUpRight size={18} aria-hidden="true" />
                </a>
              ) : currentBlock || (!task && nextBlock) ? (
                <button
                  className="button button-quiet"
                  disabled={disabled}
                  onClick={() => onBlock((currentBlock ?? nextBlock)!)}
                >
                  Open
                </button>
              ) : task ? (
                <button
                  className="button button-quiet"
                  disabled={disabled}
                  onClick={() => onStartTask(task.id, task.title, task.estimateMinutes ?? 50)}
                >
                  Start
                </button>
              ) : (
                <a href="/tasks">Choose work</a>
              )}
            </div>
          )}
          <div className="card-heading today-agenda-heading">
            <h3>{historical ? 'This day’s schedule' : 'The rest of your day'}</h3>
            <a href="/schedule">
              Calendar <ArrowUpRight size={13} aria-hidden="true" />
            </a>
          </div>
          {blocks.length ? (
            <ul className="today-agenda-list">
              {blocks.map((b) => (
                <li key={b.id}>
                  <time dateTime={b.startsAt}>{time.format(new Date(b.startsAt))}</time>
                  <div>
                    <h3>{b.title}</h3>
                    <p>
                      {time.format(new Date(b.endsAt))} ·{' '}
                      {Math.round((Date.parse(b.endsAt) - Date.parse(b.startsAt)) / 60000)} min ·{' '}
                      {b.kind}
                    </p>
                  </div>
                  <button
                    className="button button-quiet"
                    disabled={disabled}
                    onClick={() => onBlock(b)}
                    aria-label={'Open block ' + b.title}
                  >
                    <ArrowUpRight size={16} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted today-empty-note">
              {sorted.length
                ? 'Your planned blocks have ended. Open the full day to review them.'
                : 'Your day has open space. Add a block when it helps.'}
            </p>
          )}
          <div className="today-agenda-tools">
            {sorted.length > blocks.length && (
              <button className="button button-quiet" onClick={() => setAllBlocks(true)}>
                Show full day ({sorted.length})
              </button>
            )}
            <button className="button button-quiet" disabled={disabled} onClick={onNewBlock}>
              <Plus size={13} aria-hidden="true" /> Add block
            </button>
          </div>
          {!historical && due.length > 0 && (
            <details className="today-attention">
              <summary>
                Needs attention · {due.length}
                {data.limits.tasks ? '+' : ''}
              </summary>
              <ul>
                {due.map((t) => (
                  <li key={t.id}>
                    <a href={'/tasks?id=' + t.id}>{t.title}</a>
                    <span className="muted">Due {time.format(new Date(t.dueAt!))}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
          {data.limits.tasks && (
            <p className="quiet-note">
              Showing a bounded set of work. <a href="/tasks">Browse all Tasks →</a>
            </p>
          )}
          {data.limits.schedule && (
            <p className="quiet-note">
              Calendar display limit reached. Open Calendar for more context.
            </p>
          )}
          <div className="today-work-evidence">
            {work}
            <p className="quiet-note">
              Pauses excluded · Planned calendar time:{' '}
              {workDuration(data.snapshot.scheduledMinutes * 60)}
            </p>
          </div>
        </section>
        <section
          className="execution-card today-core-focus"
          id="core-focus"
          aria-label="Core Focus"
        >
          {focus}
        </section>
        <section
          className="execution-card today-micro-habits"
          aria-labelledby="micro-habits-heading"
        >
          <div className="card-heading">
            <h2 id="micro-habits-heading">Micro-Habits</h2>
            <span className="muted">
              {routines.filter((r) => r.completed).length} of {routines.length}
            </span>
          </div>
          {routines.length ? (
            <ul className="today-habit-list">
              {routines.slice(0, allRoutines ? routines.length : 5).map((r) => (
                <li key={r.id}>
                  <label>
                    <input
                      type="checkbox"
                      checked={r.completed}
                      disabled={disabled || !r.scheduled}
                      onChange={(e) => onRoutine(r.id, e.target.checked)}
                    />
                    <span>
                      {r.title}
                      {r.archived && <small>Archived · completion preserved</small>}
                      {r.completionNotes && <small>{r.completionNotes}</small>}
                      {r.spiritual && <small>Reflective · never scored</small>}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted today-empty-note">Add a small practice you want to return to.</p>
          )}
          <div className="today-agenda-tools">
            {routines.length > 5 && (
              <button className="button button-quiet" onClick={() => setAllRoutines(!allRoutines)}>
                {allRoutines ? 'Show fewer' : 'Show all routines'}
              </button>
            )}
            <a href="/routines">All routines ↗</a>
            {!routines.length && (
              <button className="button" disabled={disabled} onClick={onNewRoutine}>
                Add routine
              </button>
            )}
          </div>
          {data.limits.routines && <p className="quiet-note">Routine display limit reached.</p>}
        </section>
      </div>
    </>
  );
}
