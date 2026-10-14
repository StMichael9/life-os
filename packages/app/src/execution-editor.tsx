'use client';
import { useEffect, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { emptyReflection, dueInstant, wallTime, shiftDate } from '@life-os/shared';
import type {
  ExecutionSnapshot,
  ScheduleBlock,
  ScheduleSeries,
  FocusSession,
  Routine,
  VaultItem,
  Reflection,
} from '@life-os/shared';
import { executionCommandSchema } from '@life-os/validation';
import type { ExecutionCommand } from '@life-os/validation';
export type ExecutionEditor =
  | { kind: 'plan'; workflow: 'save' | 'start' | 'close' }
  | { kind: 'schedule'; record?: ScheduleBlock; date?: string; startsAt?: string }
  | { kind: 'schedule-series'; record: ScheduleSeries }
  | { kind: 'focus'; taskId?: string; objective?: string; minutes?: number }
  | { kind: 'routine'; record?: Routine }
  | { kind: 'vault'; record?: VaultItem; source?: { id: string; body: string } }
  | { kind: 'focus-finish'; record: FocusSession }
  | { kind: 'focus-notes'; record: FocusSession }
  | { kind: 'routine-note'; record: Routine };
const text = (f: FormData, name: string) => String(f.get(name) ?? '').trim();
export function ExecutionForm({
  editor,
  data,
  onSave,
  onClose,
}: {
  editor: ExecutionEditor;
  data: ExecutionSnapshot;
  onSave: (c: ExecutionCommand) => Promise<void>;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    dirty = useRef(false),
    request = useRef<{ body: string; id: string } | null>(null);
  const [error, setError] = useState(''),
    [saving, setSaving] = useState(false);
  const [repeat, setRepeat] = useState(editor.kind === 'schedule-series' ? 'weekdays' : 'once');
  const [id] = useState(() => crypto.randomUUID());
  const title =
    editor.kind === 'plan'
      ? editor.workflow === 'start'
        ? 'Start Day'
        : editor.workflow === 'close'
          ? 'Close Day'
          : 'Daily priorities'
      : editor.kind === 'schedule' || editor.kind === 'schedule-series'
        ? editor.kind === 'schedule-series'
          ? 'Edit recurring series'
          : 'Work block'
        : editor.kind === 'focus'
          ? 'Start Focus'
          : editor.kind === 'focus-notes'
            ? 'Session notes'
            : editor.kind === 'focus-finish'
              ? 'Finish Focus'
              : editor.kind === 'routine'
                ? 'Routine'
                : editor.kind === 'routine-note'
                  ? 'Routine day note'
                  : 'Vault item';
  function close() {
    if (!saving && (!dirty.current || confirm('Discard these unsaved changes?'))) onClose();
  }
  useEffect(() => {
    dialog.current?.showModal();
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty.current) {
        e.preventDefault();
      }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setError('');
    try {
      const base = { requestId: id };
      let input: unknown;
      if (editor.kind === 'plan') {
        const outcomes = [0, 1, 2].flatMap((i) =>
          text(form, `outcome${i}`)
            ? [
                {
                  outcome: text(form, `outcome${i}`),
                  taskId: text(form, `task${i}`) || null,
                  completed: form.has(`complete${i}`),
                },
              ]
            : [],
        );
        const reflection = { ...emptyReflection };
        for (const k of Object.keys(reflection) as (keyof Reflection)[])
          reflection[k] = text(form, k);
        input = {
          ...base,
          action: 'plan',
          date: data.date,
          version: data.plan?.version ?? 0,
          oneThing: text(form, 'oneThing') || null,
          outcomes,
          workflow: editor.workflow,
          reflection,
        };
      } else if (editor.kind === 'schedule' || editor.kind === 'schedule-series') {
        const parent = text(form, 'parent');
        const work = {
          title: text(form, 'title'),
          kind: text(form, 'kind'),
          taskId: parent.startsWith('task:') ? parent.slice(5) : null,
          projectId: parent.startsWith('project:') ? parent.slice(8) : null,
          categoryId: text(form, 'category') || null,
          objective: text(form, 'objective'),
        };
        if (repeat !== 'once')
          input = {
            ...base,
            ...work,
            action: 'schedule-series',
            id: editor.record?.id ?? id,
            version: editor.record?.version ?? 0,
            startsOn: text(form, 'startsOn'),
            endsOn: text(form, 'endsOn'),
            startTime: text(form, 'startTime'),
            endTime: text(form, 'endTime'),
            days: repeat === 'daily' ? [0, 1, 2, 3, 4, 5, 6] : form.getAll('days').map(Number),
          };
        else
          input = {
            ...base,
            ...work,
            action: 'schedule',
            id: editor.record?.id ?? id,
            version: editor.record?.version ?? 0,
            startsAt: dueInstant(text(form, 'starts'), data.timeZone),
            endsAt: dueInstant(text(form, 'ends'), data.timeZone),
            remove: false,
          };
      } else if (editor.kind === 'focus') {
        const parent = text(form, 'parent');
        input = {
          ...base,
          action: 'focus-start',
          id,
          objective: text(form, 'objective'),
          notes: text(form, 'notes'),
          taskId: parent.startsWith('task:') ? parent.slice(5) : null,
          projectId: parent.startsWith('project:') ? parent.slice(8) : null,
          categoryId: text(form, 'category') || null,
          plannedMinutes: Number(text(form, 'minutes')),
        };
      } else if (editor.kind === 'focus-notes')
        input = {
          ...base,
          action: 'focus-notes',
          id: editor.record.id,
          version: editor.record.version,
          notes: text(form, 'notes'),
        };
      else if (editor.kind === 'focus-finish')
        input = {
          ...base,
          action: 'focus-control',
          id: editor.record.id,
          version: editor.record.version,
          operation: 'finish',
          completeTask: form.has('completeTask'),
          outcome: text(form, 'outcome'),
          notes: text(form, 'notes'),
        };
      else if (editor.kind === 'routine')
        input = {
          ...base,
          action: 'routine',
          id: editor.record?.id ?? id,
          version: editor.record?.version ?? 0,
          title: text(form, 'title'),
          notes: text(form, 'notes'),
          days: form.getAll('days').map(Number),
          spiritual: form.has('spiritual'),
          archived: false,
        };
      else if (editor.kind === 'routine-note')
        input = {
          ...base,
          action: 'routine-check',
          id: editor.record.id,
          date: data.date,
          completed: true,
          notes: text(form, 'notes'),
        };
      else
        input = {
          ...base,
          action: 'vault',
          id: editor.record?.id ?? id,
          version: editor.record?.version ?? 0,
          title: text(form, 'title'),
          body: text(form, 'body'),
          kind: text(form, 'kind'),
          archived: editor.record?.archived ?? false,
          sourceInboxId: editor.record?.sourceInboxId ?? editor.source?.id ?? null,
        };
      const validated = executionCommandSchema.safeParse(input);
      if (!validated.success)
        throw new Error(
          validated.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(' · '),
        );
      const parsed = validated.data,
        body = JSON.stringify({ ...parsed, requestId: undefined });
      if (!request.current || request.current.body !== body)
        request.current = { body, id: crypto.randomUUID() };
      setSaving(true);
      await onSave({ ...parsed, requestId: request.current.id });
      dirty.current = false;
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed. Try again.');
    } finally {
      setSaving(false);
    }
  }
  function field(label: string, name: string, value = '', props: Record<string, unknown> = {}) {
    return (
      <label className="direction-field">
        {label}
        <input name={name} defaultValue={value} {...props} />
      </label>
    );
  }
  function note(label: string, name: string, value = '') {
    return (
      <label className="direction-field">
        {label}
        <textarea name={name} defaultValue={value} maxLength={2000} rows={3} />
      </label>
    );
  }
  function taskSelect(name: string, value = '') {
    return (
      <select name={name} defaultValue={value}>
        <option value="">Independent outcome</option>
        {data.tasks.map((t) => (
          <option key={t.id} value={t.id}>
            {t.title}
          </option>
        ))}
      </select>
    );
  }
  let fields: ReactNode;
  if (editor.kind === 'plan') {
    const r = editor.workflow === 'close' ? data.plan?.evening : data.plan?.morning;
    const questions: [keyof Reflection, string][] =
      editor.workflow === 'start'
        ? [
            ['gratitude', 'What am I grateful for?'],
            ['success', 'What must happen for today to be successful?'],
            ['mind', 'What is occupying my mind?'],
          ]
        : editor.workflow === 'close'
          ? [
              ['accomplished', 'What did I accomplish?'],
              ['wasted', 'Where did I waste time?'],
              ['learned', 'What did I learn?'],
              ['gratitude', 'What am I grateful for?'],
              ['prayer', 'What do I want to pray about?'],
              ['tomorrow', 'What should change tomorrow?'],
            ]
          : [];
    fields = (
      <>
        <p className="muted">
          {data.date} · {data.timeZone}. Reflection is optional and never scored.
        </p>
        {editor.workflow === 'close' && (
          <p>
            {data.snapshot.completedTasks} Tasks completed ·{' '}
            {Math.round(data.snapshot.focusSeconds / 60)} recorded Focus minutes ·{' '}
            {data.routines.filter((x) => x.completed).length} routines checked.
          </p>
        )}
        {field('The One Thing', 'oneThing', data.plan?.oneThing ?? '', { maxLength: 500 })}
        <p className="muted">Choose up to three meaningful outcomes. Task links are optional.</p>
        {[0, 1, 2].map((i) => {
          const o = data.plan?.outcomes[i];
          return (
            <fieldset key={i} className="outcome-editor">
              <legend>Outcome {i + 1}</legend>
              {field(`Outcome ${i + 1}`, 'outcome' + i, o?.outcome ?? '', { maxLength: 500 })}
              <label className="direction-field">
                Linked Task {i + 1}
                {taskSelect('task' + i, o?.taskId ?? '')}
              </label>
              <label className="check-label">
                <input type="checkbox" name={'complete' + i} defaultChecked={!!o?.completedAt} />
                Outcome complete
              </label>
            </fieldset>
          );
        })}
        {questions.length > 0 && (
          <details className="form-disclosure" open={editor.workflow === 'close'}>
            <summary>Optional reflection</summary>
            <div>
              {questions.map(([key, label]) => (
                <div key={key}>{note(label, key, r?.[key] ?? '')}</div>
              ))}
            </div>
          </details>
        )}
      </>
    );
  } else if (editor.kind === 'schedule' || editor.kind === 'schedule-series') {
    const record = editor.record;
    const series = editor.kind === 'schedule-series' ? editor.record : null;
    const block = editor.kind === 'schedule' ? editor.record : null;
    const date =
      series?.startsOn ?? (editor.kind === 'schedule' ? editor.date : undefined) ?? data.date;
    const starts = block?.startsAt ?? (editor.kind === 'schedule' ? editor.startsAt : undefined);
    const parent = record?.taskId
      ? 'task:' + record.taskId
      : record?.projectId
        ? 'project:' + record.projectId
        : '';
    fields = (
      <>
        {field('Block title', 'title', record?.title ?? '', { required: true, maxLength: 500 })}
        {field('Objective (optional)', 'objective', record?.objective ?? '', { maxLength: 500 })}
        <div className="form-two-columns">
          <label className="direction-field">
            Block type
            <select name="kind" defaultValue={record?.kind ?? 'focus'}>
              {['task', 'focus', 'routine', 'meeting', 'training', 'custom'].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
          <label className="direction-field">
            Category
            <select name="category" defaultValue={record?.categoryId ?? ''}>
              <option value="">Uncategorized</option>
              {data.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="direction-field">
          Linked work
          <select name="parent" defaultValue={parent}>
            <option value="">Independent block</option>
            <optgroup label="Tasks">
              {data.tasks.map((t) => (
                <option key={t.id} value={'task:' + t.id}>
                  {t.title}
                </option>
              ))}
              {record?.taskId && !data.tasks.some((t) => t.id === record.taskId) && (
                <option value={parent}>Current linked Task</option>
              )}
            </optgroup>
            <optgroup label="Projects">
              {data.projects.map((p) => (
                <option key={p.id} value={'project:' + p.id}>
                  {p.title}
                </option>
              ))}
              {record?.projectId && !data.projects.some((p) => p.id === record.projectId) && (
                <option value={parent}>Current linked Project</option>
              )}
            </optgroup>
          </select>
        </label>
        {(!block || series) && (
          <label className="direction-field">
            Repeat
            <select value={repeat} onChange={(e) => setRepeat(e.target.value)}>
              <option value="once" disabled={!!series}>
                One time
              </option>
              <option value="daily">Daily</option>
              <option value="weekdays">Selected weekdays</option>
            </select>
          </label>
        )}
        {repeat === 'once' ? (
          <div className="form-two-columns">
            {field(
              'Starts',
              'starts',
              starts ? wallTime(starts, data.timeZone) : date + 'T09:00:00',
              { type: 'datetime-local', required: true, step: 1 },
            )}
            {field(
              'Ends',
              'ends',
              block
                ? wallTime(block.endsAt, data.timeZone)
                : starts
                  ? wallTime(new Date(Date.parse(starts) + 3600000).toISOString(), data.timeZone)
                  : date + 'T10:00:00',
              { type: 'datetime-local', required: true, step: 1 },
            )}
          </div>
        ) : (
          <>
            <div className="form-two-columns">
              {field('Repeat from', 'startsOn', series?.startsOn ?? date, {
                type: 'date',
                required: true,
              })}
              {field('Repeat through', 'endsOn', series?.endsOn ?? shiftDate(date, 90), {
                type: 'date',
                required: true,
              })}
              {field(
                'Start time',
                'startTime',
                series?.startTime ??
                  (starts ? wallTime(starts, data.timeZone).slice(11, 16) : '09:00'),
                { type: 'time', required: true },
              )}
              {field(
                'End time',
                'endTime',
                series?.endTime ??
                  (starts
                    ? wallTime(
                        new Date(Date.parse(starts) + 3600000).toISOString(),
                        data.timeZone,
                      ).slice(11, 16)
                    : '10:00'),
                { type: 'time', required: true },
              )}
            </div>
            {repeat === 'weekdays' && (
              <fieldset>
                <legend>Repeat on</legend>
                <div className="weekday-options">
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, i) => (
                    <label key={day}>
                      <input
                        type="checkbox"
                        name="days"
                        value={i}
                        defaultChecked={series?.days.includes(i) ?? (i > 0 && i < 6)}
                      />
                      {day}
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
            <p className="muted">
              Up to one year, using {series?.timeZone ?? data.timeZone}. Every occurrence is saved
              together; any overlap or ambiguous daylight-saving time rejects the whole change.
              Edited and skipped occurrences are preserved when editing a series.
            </p>
          </>
        )}
        <p className="muted">
          {block?.seriesId ? 'Only this occurrence changes. ' : ''}Times use{' '}
          {series?.timeZone ?? data.timeZone}. Overlapping blocks are rejected.
        </p>
      </>
    );
  } else if (editor.kind === 'focus')
    fields = (
      <>
        {field('Focus objective', 'objective', editor.objective ?? '', {
          required: true,
          maxLength: 500,
        })}
        <label className="direction-field">
          Linked work
          <select name="parent" defaultValue={editor.taskId ? 'task:' + editor.taskId : ''}>
            <option value="">Custom activity</option>
            <optgroup label="Tasks">
              {data.tasks.map((t) => (
                <option key={t.id} value={'task:' + t.id}>
                  {t.title}
                </option>
              ))}
            </optgroup>
            <optgroup label="Projects">
              {data.projects.map((p) => (
                <option key={p.id} value={'project:' + p.id}>
                  {p.title}
                </option>
              ))}
            </optgroup>
          </select>
        </label>
        <label className="direction-field">
          Category
          <select name="category">
            <option value="">Uncategorized</option>
            {data.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="direction-field">
          Duration preset
          <select
            onChange={(e) => {
              const input = dialog.current?.querySelector<HTMLInputElement>('[name=minutes]');
              if (input && e.target.value !== 'custom') input.value = e.target.value;
            }}
            defaultValue={
              [25, 50, 90].includes(editor.minutes ?? 50) ? String(editor.minutes ?? 50) : 'custom'
            }
          >
            {[25, 50, 90].map((m) => (
              <option key={m}>{m}</option>
            ))}
            <option value="custom">Custom</option>
          </select>
        </label>
        {field('Planned minutes', 'minutes', String(editor.minutes ?? 50), {
          type: 'number',
          min: 1,
          max: 720,
          required: true,
        })}
        <details>
          <summary>Session notes (optional)</summary>
          {note('Focus notes', 'notes')}
        </details>
        <p className="muted">
          Starting this session automatically pauses the running one. Every paused session stays
          saved.
        </p>
      </>
    );
  else if (editor.kind === 'focus-notes')
    fields = (
      <>
        {note('Focus notes', 'notes', editor.record.notes ?? '')}
        <p className="muted">
          Notes belong to {editor.record.objective}. Saving them does not change the timer.
        </p>
      </>
    );
  else if (editor.kind === 'focus-finish')
    fields = (
      <>
        {note('What did you accomplish?', 'outcome')}
        <details>
          <summary>Session notes</summary>
          {note('Focus notes', 'notes', editor.record.notes ?? '')}
        </details>
        {editor.record.taskId && (
          <label className="check-label">
            <input type="checkbox" name="completeTask" />
            Also mark the linked Task complete
          </label>
        )}
        <p className="muted">
          All active time, including overtime, is recorded once. Task completion is optional.
        </p>
      </>
    );
  else if (editor.kind === 'routine')
    fields = (
      <>
        {field('Routine name', 'title', editor.record?.title ?? '', {
          required: true,
          maxLength: 500,
        })}
        {note('Routine notes', 'notes', editor.record?.notes ?? '')}
        <fieldset>
          <legend>Repeat on</legend>
          <div className="weekday-options">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, i) => (
              <label key={day}>
                <input
                  type="checkbox"
                  name="days"
                  value={i}
                  defaultChecked={editor.record?.days.includes(i) ?? true}
                />
                {day}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="check-label">
          <input
            name="spiritual"
            type="checkbox"
            defaultChecked={editor.record?.spiritual ?? false}
          />
          Reflective / faith practice — excluded from productivity measures
        </label>
      </>
    );
  else if (editor.kind === 'routine-note')
    fields = note('Notes for this day', 'notes', editor.record.completionNotes ?? '');
  else
    fields = (
      <>
        {field(
          'Vault title',
          'title',
          editor.record?.title ?? editor.source?.body.split('\n')[0]?.slice(0, 200) ?? '',
          { required: true, maxLength: 200 },
        )}
        <label className="direction-field">
          Collection
          <select name="kind" defaultValue={editor.record?.kind ?? 'not_now'}>
            {[
              'idea',
              'someday',
              'not_now',
              'research',
              'career',
              'business',
              'personal',
              'scripture',
              'thought',
            ].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
        <label className="direction-field">
          Keep the context
          <textarea
            name="body"
            required
            maxLength={10000}
            rows={6}
            defaultValue={editor.record?.body ?? editor.source?.body ?? ''}
          />
        </label>
      </>
    );
  return (
    <dialog
      ref={dialog}
      className="direction-dialog execution-dialog"
      aria-labelledby="execution-form-title"
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
    >
      <form
        onSubmit={submit}
        onChange={() => {
          dirty.current = true;
        }}
      >
        <div className="editor-heading">
          <div>
            <p className="eyebrow">Make the intention clear</p>
            <h2 id="execution-form-title">{title}</h2>
          </div>
          <button
            type="button"
            className="button button-quiet"
            disabled={saving}
            onClick={close}
            aria-label="Close editor"
          >
            ✕
          </button>
        </div>
        {fields}
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <button type="button" className="button" disabled={saving} onClick={close}>
            Cancel
          </button>
          <button className="button button-primary" disabled={saving}>
            {saving
              ? 'Saving…'
              : editor.kind === 'plan' && editor.workflow !== 'save'
                ? title
                : editor.kind === 'focus-finish'
                  ? 'Finish Focus'
                  : 'Save'}
          </button>
        </div>
      </form>
    </dialog>
  );
}
