'use client';
import { useEffect, useRef } from 'react';
import type { ExecutionSnapshot, ScheduleBlock } from '@life-os/shared';
import { elapsedFocus } from '@life-os/shared';
import { FocusTimer } from './focus-timer';
export function WorkBlockWorkspace({
  block,
  data,
  error,
  now,
  busy,
  onClose,
  onStart,
  onControl,
  onFinish,
  onEdit,
  onSeries,
  onRemove,
}: {
  block: ScheduleBlock;
  data: ExecutionSnapshot;
  error: string;
  now: number;
  busy: boolean;
  onClose: () => void;
  onStart: () => void;
  onControl: () => void;
  onFinish: () => void;
  onEdit: () => void;
  onSeries: () => void;
  onRemove: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  const session = data.focus;
  const format = new Intl.DateTimeFormat('en-US', {
    timeZone: data.timeZone,
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
  const duration = Math.min(
    720,
    Math.max(1, Math.ceil((Date.parse(block.endsAt) - Date.parse(block.startsAt)) / 60000)),
  );
  return (
    <dialog
      className="direction-dialog block-workspace"
      ref={dialog}
      aria-labelledby="block-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div className="dialog-heading">
        <div>
          <p className="eyebrow">Your work block</p>
          <h2 id="block-title">{block.title}</h2>
        </div>
        <button className="button" aria-label="Close work block" disabled={busy} onClick={onClose}>
          ×
        </button>
      </div>
      <p className="muted">
        {format.format(new Date(block.startsAt))} — {format.format(new Date(block.endsAt))}
      </p>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {session ? (
        <>
          <h3>{session.objective}</h3>
          <FocusTimer
            elapsed={elapsedFocus(session, new Date(now))}
            plannedMinutes={session.plannedMinutes}
            running={!!session.resumedAt}
          />
          <div className="focus-controls">
            <button className="button" disabled={busy} onClick={onControl}>
              {session.resumedAt ? 'Pause' : 'Resume'}
            </button>
            <button className="button button-primary" disabled={busy} onClick={onFinish}>
              Finish Focus
            </button>
          </div>
        </>
      ) : (
        <div className="block-focus-intent">
          <p>{block.objective || block.title}</p>
          <p className="muted">
            {duration}-minute Focus intention{duration === 720 ? ' · capped at 12 hours' : ''}
          </p>
          <button className="button button-primary" disabled={busy} onClick={onStart}>
            Start Focus
          </button>
        </div>
      )}
      {data.plan?.oneThing && (
        <p className="block-objective">
          <span className="eyebrow">Today's objective</span>
          {data.plan.oneThing}
        </p>
      )}
      {block.taskId && (
        <a className="context-link" href={'/tasks?id=' + block.taskId}>
          Open linked Task →
        </a>
      )}
      {block.projectId && (
        <a className="context-link" href={'/direction?view=projects&id=' + block.projectId}>
          Open linked Project →
        </a>
      )}
      <details className="block-details">
        <summary>Block details</summary>
        <div className="execution-actions">
          <button className="button" disabled={busy} onClick={onEdit}>
            {block.seriesId ? 'Edit this occurrence' : 'Edit block'}
          </button>
          {block.seriesId && (
            <button className="button" disabled={busy} onClick={onSeries}>
              Edit recurring series
            </button>
          )}
          <button className="button" disabled={busy} onClick={onRemove}>
            {block.seriesId ? 'Skip this occurrence' : 'Remove block'}
          </button>
        </div>
      </details>
      <p className="muted">
        Focus is saved by the server. Closing this workspace keeps the session running.
      </p>
    </dialog>
  );
}
