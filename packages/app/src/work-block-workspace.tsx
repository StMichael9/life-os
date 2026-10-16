'use client';
import { useEffect, useRef, useState } from 'react';
import { requestJson } from './auth-client';
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
  selected: globalSelected,
  onSelect,
  onNotes,
  onReview,
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
  selected: FocusSession | null;
  onSelect: (session: FocusSession) => void;
  onNotes: (session: FocusSession) => void;
  onReview?: ((session: FocusSession) => void) | undefined;
  onControl: (session: FocusSession) => void;
  onFinish: (session: FocusSession) => void;
  onEdit: () => void;
  onSeries: () => void;
  onRemove: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [page, setPage] = useState<{
    items: FocusSession[];
    next: string | null;
    stamp: string;
  } | null>(null);
  const [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const epoch = useRef(0);
  useEffect(() => {
    const generation = ++epoch.current;
    let disposed = false;
    void requestJson<{ items: FocusSession[]; next: string | null; ownerId: string }>(
      '/api/execution/focus?scheduleBlockId=' + block.id,
    )
      .then((result) => {
        if (disposed) return;
        if (result.ownerId !== data.ownerId) throw new Error('Account changed. Reopen this block.');
        setPage({ ...result, stamp: data.serverNow });
        setLoadError('');
      })
      .catch((e) => {
        if (!disposed) {
          setPage(null);
          setLoadError(e instanceof Error ? e.message : 'Unable to load block sessions.');
        }
      })
      .finally(() => {
        if (!disposed && generation === epoch.current) setLoading(false);
      });
    return () => {
      disposed = true;
      epoch.current = generation + 1;
    };
  }, [block.id, data.ownerId, data.serverNow, refresh]);
  async function more() {
    if (!page?.next || loading) return;
    const generation = epoch.current;
    setLoading(true);
    try {
      const result = await requestJson<{
        items: FocusSession[];
        next: string | null;
        ownerId: string;
      }>('/api/execution/focus?scheduleBlockId=' + block.id + '&before=' + page.next);
      if (generation !== epoch.current) return;
      if (result.ownerId !== data.ownerId) throw new Error('Account changed. Reopen this block.');
      setPage((prior) => ({
        items: [
          ...(prior?.items ?? []),
          ...result.items.filter((s) => !prior?.items.some((p) => p.id === s.id)),
        ],
        next: result.next,
        stamp: data.serverNow,
      }));
    } catch (e) {
      if (generation === epoch.current)
        setLoadError(e instanceof Error ? e.message : 'Unable to load sessions.');
    } finally {
      if (generation === epoch.current) setLoading(false);
    }
  }
  const sessions = (page?.items ?? []).filter((s) => s.scheduleBlockId === block.id);
  // The selected/running session may lie beyond the first page. Only exact owned
  // occurrence links qualify; global work is never inferred from a parent/title.
  for (const extra of [data.focus, globalSelected]) {
    if (
      extra &&
      !extra.endedAt &&
      extra.scheduleBlockId === block.id &&
      !sessions.some((s) => s.id === extra.id)
    )
      sessions.push(extra);
  }
  const selected =
    sessions.find((s) => s.id === globalSelected?.id) ??
    sessions.find((s) => s.resumedAt) ??
    sessions[0] ??
    null;
  const unavailable = busy || loading || !page || page.stamp !== data.serverNow;

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
      {data.focus?.resumedAt && data.focus.scheduleBlockId !== block.id && (
        <p className="muted" role="status">
          Running elsewhere: {data.focus.objective}. Starting or resuming here pauses it
          automatically.
        </p>
      )}
      {loadError && (
        <p role="alert">
          {loadError}{' '}
          <button
            className="button"
            onClick={() => {
              setLoading(true);
              setRefresh((n) => n + 1);
            }}
          >
            Retry sessions
          </button>
        </p>
      )}
      {loading && !page ? (
        <p role="status">Loading this occurrence’s sessions…</p>
      ) : sessions.length > 0 ? (
        <FocusWorkspace
          sessions={sessions}
          selected={selected}
          now={now}
          busy={unavailable}
          settling={loading || page?.stamp !== data.serverNow}
          objective={null}
          next={page?.next ?? null}
          onMore={() => void more()}
          onNew={() => onStart(selected?.timerMode ?? 'countdown')}
          newLabel="New Session / Restart"
          onSelect={onSelect}
          onControl={onControl}
          onFinish={onFinish}
          onNotes={onNotes}
          onReview={onReview}
        />
      ) : (
        <div className="block-focus-intent">
          <p>No saved session for this occurrence.</p>
          <p>{block.objective || block.title}</p>
          <p className="muted">
            {duration}-minute Focus intention{duration === 720 ? ' · capped at 12 hours' : ''}
          </p>
          <button
            className="button button-primary"
            disabled={unavailable}
            onClick={() => onStart()}
          >
            Start Focus
          </button>
        </div>
      )}
      <button
        className="button block-start-another"
        disabled={unavailable}
        onClick={() => onStart('stopwatch')}
      >
        Start work stopwatch
      </button>
      <p className="muted">
        New Session / Restart starts fresh and preserves earlier sessions and their recorded work.
      </p>
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
