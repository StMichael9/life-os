'use client';
import { useEffect, useRef } from 'react';
import type { ExecutionSnapshot, ScheduleBlock, FocusSession } from '@life-os/shared';
import { FocusWorkspace } from './focus-workspace';
export function WorkBlockWorkspace({
  block,
  data,
  error,
  now,
  busy,
  onClose,
  onStart,
  sessions,
  selected,
  next,
  onMore,
  onSelect,
  onNotes,
  onReview,
  onNew,
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
  onStart: (mode?: 'countdown' | 'stopwatch') => void;
  sessions: FocusSession[];
  selected: FocusSession | null;
  next: string | null;
  onMore: () => void;
  onSelect: (session: FocusSession) => void;
  onNotes: (session: FocusSession) => void;
  onReview?: ((session: FocusSession) => void) | undefined;
  onNew: () => void;
  onControl: (session: FocusSession) => void;
  onFinish: (session: FocusSession) => void;
  onEdit: () => void;
  onSeries: () => void;
  onRemove: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);

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
        <button className="button" aria-label="Close work block" onClick={onClose}>
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
      {sessions.length > 0 ? (
        <>
          {(!selected ||
            selected.objective !== (block.objective || block.title) ||
            selected.taskId !== block.taskId ||
            selected.projectId !== block.projectId) && (
            <button
              className="button button-primary block-start-another"
              disabled={busy}
              onClick={() => onStart()}
            >
              Start Focus
            </button>
          )}
          <FocusWorkspace
            sessions={sessions}
            selected={selected}
            now={now}
            busy={busy}
            settling={false}
            objective={null}
            next={next}
            onMore={onMore}
            onNew={onNew}
            onSelect={onSelect}
            onControl={onControl}
            onFinish={onFinish}
            onNotes={onNotes}
            onReview={onReview}
          />
        </>
      ) : (
        <div className="block-focus-intent">
          <p>{block.objective || block.title}</p>
          <p className="muted">
            {duration}-minute Focus intention{duration === 720 ? ' · capped at 12 hours' : ''}
          </p>
          <button className="button button-primary" disabled={busy} onClick={() => onStart()}>
            Start Focus
          </button>
        </div>
      )}
      {(!selected ||
        selected.timerMode !== 'stopwatch' ||
        selected.objective !== (block.objective || block.title) ||
        selected.taskId !== block.taskId ||
        selected.projectId !== block.projectId) && (
        <button
          className="button block-start-another"
          disabled={busy}
          onClick={() => onStart('stopwatch')}
        >
          Start work stopwatch
        </button>
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
