'use client';
import { useEffect, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { emptyReflection, dueInstant, wallTime } from '@life-os/shared';
import type {
  ExecutionSnapshot,
  ScheduleBlock,
  Routine,
  VaultItem,
  Reflection,
} from '@life-os/shared';
import { executionCommandSchema } from '@life-os/validation';
import type { ExecutionCommand } from '@life-os/validation';
export type ExecutionEditor =
  | { kind: 'plan'; workflow: 'save' | 'start' | 'close' }
  | { kind: 'schedule'; record?: ScheduleBlock }
  | { kind: 'focus'; taskId?: string; objective?: string; minutes?: number }
  | { kind: 'routine'; record?: Routine }
  | { kind: 'vault'; record?: VaultItem; source?: { id: string; body: string } }
  | { kind: 'focus-finish' }
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
  const [id] = useState(() => crypto.randomUUID());
  const title =
    editor.kind === 'plan'
      ? editor.workflow === 'start'
        ? 'Start Day'
        : editor.workflow === 'close'
          ? 'Close Day'
          : 'Daily priorities'
      : editor.kind === 'schedule'
        ? 'Time block'
        : editor.kind === 'focus'
          ? 'Start Focus'
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
      } else if (editor.kind === 'schedule')
        input = {
          ...base,
          action: 'schedule',
          id: editor.record?.id ?? id,
          version: editor.record?.version ?? 0,
          title: text(form, 'title'),
          kind: text(form, 'kind'),
          taskId: text(form, 'task') || null,
          startsAt: dueInstant(text(form, 'starts'), data.timeZone),
          endsAt: dueInstant(text(form, 'ends'), data.timeZone),
          remove: false,
        };
      else if (editor.kind === 'focus') {
        const parent = text(form, 'parent');
        input = {
          ...base,
          action: 'focus-start',
          id,
          objective: text(form, 'objective'),
          taskId: parent.startsWith('task:') ? parent.slice(5) : null,
          projectId: parent.startsWith('project:') ? parent.slice(8) : null,
          categoryId: text(form, 'category') || null,
          plannedMinutes: Number(text(form, 'minutes')),
        };
      } else if (editor.kind === 'focus-finish')
        input = {
          ...base,
          action: 'focus-control',
          id: data.focus!.id,
          version: data.focus!.version,
          operation: 'finish',
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
        {questions.map(([key, label]) => (
          <div key={key}>{note(label, key, r?.[key] ?? '')}</div>
        ))}
      </>
    );
  } else if (editor.kind === 'schedule') {
    fields = (
      <>
        {field('Block title', 'title', editor.record?.title ?? '', {
          required: true,
          maxLength: 500,
        })}
        <label className="direction-field">
          Block type
          <select name="kind" defaultValue={editor.record?.kind ?? 'task'}>
            {['task', 'focus', 'routine', 'meeting', 'training', 'custom'].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
        <label className="direction-field">
          Linked Task{taskSelect('task', editor.record?.taskId ?? '')}
        </label>
        <p className="muted">Times use {data.timeZone}. Overlapping blocks are rejected.</p>
        {field(
          'Starts',
          'starts',
          editor.record ? wallTime(editor.record.startsAt, data.timeZone) : `${data.date}T09:00:00`,
          { type: 'datetime-local', required: true, step: 1 },
        )}
        {field(
          'Ends',
          'ends',
          editor.record ? wallTime(editor.record.endsAt, data.timeZone) : `${data.date}T10:00:00`,
          { type: 'datetime-local', required: true, step: 1 },
        )}
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
        <p className="muted">
          Time continues across reloads while running. Pause before stepping away.
        </p>
      </>
    );
  else if (editor.kind === 'focus-finish')
    fields = (
      <>
        {note('What did you accomplish?', 'outcome')}
        {note('Focus notes', 'notes')}
        <p className="muted">
          Recorded time is added once to the linked Task. Finishing does not automatically complete
          the Task.
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
        <h2 id="execution-form-title">{title}</h2>
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
