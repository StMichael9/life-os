'use client';
import { elapsedFocus, focusCountdown } from '@life-os/shared';
import type { FocusSession } from '@life-os/shared';
import { FocusTimer } from './focus-timer';
export function FocusWorkspace({
  sessions,
  selected,
  now,
  busy,
  settling,
  objective,
  next,
  onMore,
  onNew,
  onSelect,
  onControl,
  onFinish,
  onNotes,
}: {
  sessions: FocusSession[];
  selected: FocusSession | null;
  now: number;
  busy: boolean;
  settling: boolean;
  objective?: string | null;
  next: string | null;
  onMore: () => void;
  onNew: () => void;
  onSelect: (session: FocusSession) => void;
  onControl: (session: FocusSession) => void;
  onFinish: (session: FocusSession) => void;
  onNotes: (session: FocusSession) => void;
}) {
  const others = sessions.filter((s) => s.id !== selected?.id);
  const format = (seconds: number) =>
    `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  return (
    <div className="focus-workspace">
      <div className="focus-workspace-heading">
        <div>
          <p className="eyebrow">One session at a time. Every intention saved.</p>
          <h2>Focus</h2>
        </div>
        <button className="button" disabled={busy || settling} onClick={onNew}>
          New Session
        </button>
      </div>
      {selected ? (
        <>
          <h3 className="selected-focus-title">{selected.objective}</h3>
          <FocusTimer
            elapsed={elapsedFocus(selected, new Date(now))}
            plannedMinutes={selected.plannedMinutes}
            running={!!selected.resumedAt}
          />
          <div className="focus-controls">
            <button
              className="button"
              disabled={busy || settling}
              onClick={() => onControl(selected)}
            >
              {selected.resumedAt ? 'Pause' : 'Resume'}
            </button>
            <button
              className="button button-primary"
              disabled={busy || settling}
              onClick={() => onFinish(selected)}
            >
              Finish Focus
            </button>
          </div>
          {objective && (
            <p className="focus-day-objective">
              <span className="eyebrow">Today's objective</span>
              {objective}
            </p>
          )}
          <div className="focus-linked-work">
            {selected.taskId && <a href={'/tasks?id=' + selected.taskId}>Linked Task →</a>}
            {selected.projectId && (
              <a href={'/direction?view=projects&id=' + selected.projectId}>Linked Project →</a>
            )}
          </div>
          <details className="focus-session-notes">
            <summary>Session notes</summary>
            <p className="preserve-lines">
              {selected.notes || 'Keep a thought here for your return.'}
            </p>
            <button
              className="button"
              disabled={busy || settling}
              onClick={() => onNotes(selected)}
            >
              Edit notes
            </button>
          </details>
        </>
      ) : (
        <div className="focus-empty">
          <p>A clear objective. A little protected time.</p>
          <button className="button button-primary" disabled={busy || settling} onClick={onNew}>
            Start Focus
          </button>
        </div>
      )}
      {settling && (
        <p role="status" className="focus-save-status">
          Loading saved Focus state…
        </p>
      )}
      {others.length > 0 && (
        <section className="unfinished-focus" aria-label="Other unfinished sessions">
          <p className="eyebrow">Return to an intention</p>
          <ul>
            {others.map((s) => {
              const remaining = focusCountdown(
                elapsedFocus(s, new Date(now)),
                s.plannedMinutes,
              ).remaining;
              return (
                <li key={s.id}>
                  <button
                    className="focus-session-switch"
                    disabled={busy || settling}
                    onClick={() => onSelect(s)}
                    aria-label={(s.resumedAt ? 'Select ' : 'Resume ') + s.objective}
                  >
                    <span className="session-name">{s.objective}</span>
                    <span className="session-remaining">
                      {format(remaining)} <small>remaining</small>
                    </span>
                    <span className={'session-status ' + (s.resumedAt ? 'running' : 'paused')}>
                      {s.resumedAt ? 'Running' : 'Paused'}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}
      {next && (
        <button className="button focus-more" disabled={busy || settling} onClick={onMore}>
          Load more sessions
        </button>
      )}
    </div>
  );
}
