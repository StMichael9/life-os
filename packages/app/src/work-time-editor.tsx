'use client';
import { useEffect, useRef, useState } from 'react';
import type { ExecutionCommand } from '@life-os/validation';
import type { WorkSessionDetail, FocusSession } from '@life-os/shared';
import { wallTime, dueInstant, workDuration, elapsedFocus } from '@life-os/shared';
import { requestJson } from './auth-client';
function auditTime(change: WorkSessionDetail['changes'][number], zone: string) {
  const before = JSON.parse(change.before) as {
    session: FocusSession;
    interval?: { startsAt?: string; endsAt?: string | null } | unknown[];
  };
  const after = JSON.parse(change.after) as {
    session: Partial<FocusSession>;
    interval?: { startsAt?: string; endsAt?: string | null };
  };
  const now = new Date(change.createdAt),
    result = { ...before.session, ...after.session };
  const intervalBefore = Array.isArray(before.interval) ? null : before.interval;
  const at = (value: string) => new Date(value).toLocaleString('en-US', { timeZone: zone });
  return (
    <div>
      <p>
        Before: {workDuration(elapsedFocus(before.session, now))} ·{' '}
        {before.session.resumedAt ? 'Running' : before.session.endedAt ? 'Finished' : 'Paused'}
      </p>
      <p>
        After: {workDuration(elapsedFocus(result, now))} ·{' '}
        {result.discardedAt
          ? 'Discarded'
          : result.resumedAt
            ? 'Running'
            : result.endedAt
              ? 'Finished'
              : 'Paused'}
      </p>
      {intervalBefore?.startsAt && (
        <p>
          Recorded interval: {at(intervalBefore.startsAt)} →{' '}
          {intervalBefore.endsAt ? at(intervalBefore.endsAt) : 'Running at review'}
        </p>
      )}
      {after.interval?.startsAt && (
        <p>
          Corrected interval: {at(after.interval.startsAt)} →{' '}
          {after.interval.endsAt ? at(after.interval.endsAt) : 'Running'}
        </p>
      )}
      {Array.isArray(before.interval) && (
        <p>All prior intervals retained and excluded from totals.</p>
      )}
    </div>
  );
}
const normalizedWall = (value: string) => (value.length === 16 ? value + ':00' : value);
export function WorkTimeEditor({
  id,
  ownerId,
  zone,
  target,
  onSave,
  onClose,
}: {
  id: string | null;
  ownerId: string;
  zone: string;
  target: { minutes: number; version: number };
  onSave: (c: ExecutionCommand) => Promise<void>;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    dirty = useRef(false),
    retry = useRef<{ body: string; id: string } | null>(null);
  const [detail, setDetail] = useState<WorkSessionDetail | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [selected, setSelected] = useState('');
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  useEffect(() => {
    let disposed = false;
    if (id)
      void requestJson<WorkSessionDetail>('/api/execution/work-session/' + id)
        .then((d) => {
          if (disposed) return;
          if (d.ownerId !== ownerId) throw new Error('Account changed. Close and reopen review.');
          setDetail(d);
          setSelected(d.intervals.find((i) => !i.excluded)?.id ?? '');
        })
        .catch((e) => {
          if (!disposed) setError(e instanceof Error ? e.message : 'Unable to load session.');
        });
    return () => {
      disposed = true;
    };
  }, [id, ownerId]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty.current) e.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);
  function close() {
    if (!busy && (!dirty.current || confirm('Discard these unsaved time changes?'))) onClose();
  }
  async function save(
    c:
      | Omit<Extract<ExecutionCommand, { action: 'work-adjust' }>, 'requestId'>
      | Omit<Extract<ExecutionCommand, { action: 'work-target' }>, 'requestId'>,
  ) {
    setBusy(true);
    setError('');
    const body = JSON.stringify(c);
    if (retry.current?.body !== body) retry.current = { body, id: crypto.randomUUID() };
    try {
      await onSave({ ...c, requestId: retry.current.id });
      dirty.current = false;
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save. Retry uses the same request.');
    } finally {
      setBusy(false);
    }
  }
  async function more() {
    if (!detail?.next || !id) return;
    setBusy(true);
    try {
      const d = await requestJson<WorkSessionDetail>(
        '/api/execution/work-session/' + id + '?before=' + detail.next,
      );
      if (d.ownerId !== ownerId) throw new Error('Account changed. Reopen review.');
      setDetail({ ...d, intervals: [...detail.intervals, ...d.intervals] });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load intervals.');
    } finally {
      setBusy(false);
    }
  }
  const interval = detail?.intervals.find((i) => i.id === selected);
  function adjust(operation: 'confirm' | 'reset' | 'discard') {
    if (!detail) return;
    if (
      operation !== 'confirm' &&
      !confirm(
        operation === 'reset'
          ? 'Reset this unfinished session to zero and pause it? Original intervals and the reason remain recorded.'
          : 'Discard this session’s time? Other sessions are unchanged. Original records remain in the audit trail.',
      )
    )
      return;
    const form = dialog.current?.querySelector('form');
    const reason = form ? String(new FormData(form).get('reason') ?? '').trim() : '';
    if (!reason) {
      setError('Add a reason for this change.');
      return;
    }
    void save({
      action: 'work-adjust',
      id: detail.session.id,
      version: detail.session.version,
      operation,
      intervalId: null,
      startsAt: null,
      endsAt: null,
      reason,
    });
  }
  return (
    <dialog
      ref={dialog}
      className="direction-dialog execution-dialog"
      aria-labelledby="work-review-title"
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
    >
      <form
        onChange={() => {
          dirty.current = true;
        }}
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          if (!id) {
            void save({
              action: 'work-target',
              version: target.version,
              minutes: Number(f.get('minutes')),
            });
            return;
          }
          if (!detail || !interval) return;
          try {
            void save({
              action: 'work-adjust',
              id,
              version: detail.session.version,
              operation: 'correct',
              intervalId: interval.id,
              startsAt:
                String(f.get('exactStarts') ?? '').trim() ||
                (normalizedWall(String(f.get('starts'))) === wallTime(interval.startsAt, zone)
                  ? interval.startsAt
                  : dueInstant(String(f.get('starts')), zone)),
              endsAt:
                String(f.get('exactEnds') ?? '').trim() ||
                (interval.endsAt &&
                normalizedWall(String(f.get('ends'))) === wallTime(interval.endsAt, zone)
                  ? interval.endsAt
                  : dueInstant(String(f.get('ends')), zone)),
              reason: String(f.get('reason') ?? '').trim(),
            });
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Invalid times.');
          }
        }}
      >
        <div className="editor-heading">
          <div>
            <p className="eyebrow">Recorded work, kept honest</p>
            <h2 id="work-review-title">{id ? 'Review work time' : 'Daily work target'}</h2>
          </div>
          <button className="button button-quiet" type="button" onClick={close} disabled={busy}>
            Close
          </button>
        </div>
        {!id ? (
          <label className="direction-field">
            Daily target (minutes)
            <input
              name="minutes"
              type="number"
              min={1}
              max={1440}
              required
              defaultValue={target.minutes}
            />
          </label>
        ) : detail ? (
          <>
            <h3>{detail.session.objective}</h3>
            <p className="muted">
              {workDuration(elapsedFocus(detail.session, new Date()))} ·{' '}
              {detail.session.discardedAt
                ? 'Discarded'
                : detail.session.endedAt
                  ? 'Finished'
                  : detail.session.resumedAt
                    ? 'Running'
                    : 'Paused'}
            </p>
            <p className="quiet-note">
              Only trim time that was recorded. Correcting an open interval pauses this session. All
              changes retain before/after records. Times use {zone}; ambiguous daylight-saving times
              must be resolved explicitly.
            </p>
            <label className="direction-field">
              Recorded interval
              <select value={selected} onChange={(e) => setSelected(e.target.value)}>
                {detail.intervals
                  .filter((i) => !i.excluded)
                  .map((i) => (
                    <option key={i.id} value={i.id}>
                      {wallTime(i.startsAt, zone)} →{' '}
                      {i.endsAt ? wallTime(i.endsAt, zone) : 'Running'}
                    </option>
                  ))}
              </select>
            </label>
            {detail.next && (
              <button className="button" type="button" onClick={() => void more()} disabled={busy}>
                Load earlier intervals
              </button>
            )}
            {interval && !interval.excluded && (
              <div className="form-two-columns" key={interval.id}>
                <label className="direction-field">
                  Corrected start
                  <input
                    name="starts"
                    type="datetime-local"
                    step="1"
                    required
                    defaultValue={wallTime(interval.startsAt, zone)}
                  />
                </label>
                <label className="direction-field">
                  Corrected end
                  <input
                    name="ends"
                    type="datetime-local"
                    step="1"
                    required
                    defaultValue={wallTime(interval.endsAt ?? new Date().toISOString(), zone)}
                  />
                </label>
              </div>
            )}
            <details>
              <summary>Exact instants for daylight-saving ambiguity</summary>
              <div className="direction-fields">
                <label className="direction-field">
                  Exact start (ISO with offset)
                  <input name="exactStarts" placeholder="2026-11-01T01:30:00-07:00" />
                </label>
                <label className="direction-field">
                  Exact end (ISO with offset)
                  <input name="exactEnds" placeholder="2026-11-01T01:45:00-07:00" />
                </label>
              </div>
            </details>
            {!detail.session.discardedAt && (
              <label className="direction-field">
                Reason for change
                <input
                  name="reason"
                  required
                  maxLength={500}
                  placeholder="For example: forgot to pause for lunch"
                />
              </label>
            )}
            <div className="execution-actions">
              {!detail.session.endedAt && (
                <>
                  <button
                    className="button"
                    type="button"
                    disabled={busy}
                    onClick={() => adjust('reset')}
                  >
                    Reset to Zero
                  </button>
                  {detail.session.resumedAt && (
                    <button
                      className="button"
                      type="button"
                      disabled={busy}
                      onClick={() => adjust('confirm')}
                    >
                      Confirm I kept working
                    </button>
                  )}
                </>
              )}
              {!detail.session.discardedAt && (
                <button
                  className="button"
                  type="button"
                  disabled={busy}
                  onClick={() => adjust('discard')}
                >
                  Discard session
                </button>
              )}
            </div>
            <details>
              <summary>
                Change history · {detail.changes.length}
                {detail.changesLimited ? '+' : ''}
              </summary>
              {detail.changes.map((c) => (
                <article className="work-audit" key={c.id}>
                  <strong>{c.kind}</strong>
                  <p>{c.reason}</p>
                  <time>{new Date(c.createdAt).toLocaleString('en-US', { timeZone: zone })}</time>
                  <details>
                    <summary>Recorded before / after</summary>
                    {auditTime(c, zone)}
                  </details>
                </article>
              ))}
              {!detail.changes.length && <p className="muted">No corrections recorded.</p>}
              {detail.changesLimited && (
                <p className="quiet-note">
                  Showing the latest 100 changes. Older audit records remain stored.
                </p>
              )}
            </details>
          </>
        ) : (
          <p role="status">Loading recorded intervals…</p>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <button className="button" type="button" onClick={close} disabled={busy}>
            Cancel
          </button>
          {(!id || (interval && !interval.excluded && !detail?.session.discardedAt)) && (
            <button className="button button-primary" disabled={busy}>
              {busy ? 'Saving…' : id ? 'Save correction' : 'Save target'}
            </button>
          )}
        </div>
      </form>
    </dialog>
  );
}
