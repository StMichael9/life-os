'use client';
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { dueInstant, wallTime, taskStatusLabels } from '@life-os/shared';
import type { Task, Goal, Project, Category, TaskDetail, TaskStatus } from '@life-os/shared';
import { taskCommandSchema } from '@life-os/validation';
import type { TaskCommand } from '@life-os/validation';
import { Button, Eyebrow } from '@life-os/ui';
export function taskEditCommand(task: Task): TaskCommand {
  const {
    createdAt: _created,
    updatedAt: _updated,
    completedAt: _completed,
    sourceInboxId: _source,
    ...command
  } = task;
  void _created;
  void _updated;
  void _completed;
  void _source;
  return command;
}
export function TaskEditor({
  record,
  capture,
  goals,
  projects,
  categories,
  ancestors,
  timeZone,
  onSave,
  onClose,
  onMoreGoals,
  onMoreProjects,
}: {
  record: Task | null;
  capture: { id: string; body: string } | null;
  goals: Goal[];
  projects: Project[];
  categories: Category[];
  ancestors: TaskDetail['ancestors'];
  timeZone: string;
  onSave: (command: TaskCommand) => Promise<void>;
  onClose: () => void;
  onMoreGoals: (() => Promise<void>) | undefined;
  onMoreProjects: (() => Promise<void>) | undefined;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    dirty = useRef(false);
  const [id] = useState(record?.id ?? crypto.randomUUID());
  const [values, setValues] = useState<Record<string, string>>({
    title: record?.title ?? capture?.body.split('\n')[0]?.slice(0, 200) ?? '',
    description: record?.description ?? capture?.body ?? '',
    notes: record?.notes ?? '',
    parent: record?.projectId
      ? `project:${record.projectId}`
      : record?.goalId
        ? `goal:${record.goalId}`
        : '',
    categoryId: record?.categoryId ?? '',
    status: record?.status ?? 'planned',
    priority: String(record?.priority ?? 3),
    dueAt: record?.dueAt ? wallTime(record.dueAt, timeZone) : '',
    estimateMinutes: String(record?.estimateMinutes ?? ''),
    actualMinutes: String(record?.actualMinutes ?? ''),
    energy: record?.energy ?? 'medium',
    impact: String(record?.impact ?? 0),
    urgency: String(record?.urgency ?? 0),
    opportunity: String(record?.opportunity ?? 0),
    goalAlignment: String(record?.goalAlignment ?? 0),
  });
  const [errors, setErrors] = useState<string[]>([]),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    dialog.current?.showModal();
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty.current) event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);
  function close() {
    if (busy || (dirty.current && !window.confirm('Discard your unsaved Task changes?'))) return;
    onClose();
  }
  function set(name: string, value: string) {
    dirty.current = true;
    setValues((old) => ({ ...old, [name]: value }));
  }
  function field(
    name: string,
    label: string,
    options: {
      type?: string;
      max?: number;
      min?: number;
      multiline?: boolean;
      required?: boolean;
    } = {},
  ) {
    const props = {
      id: `task-${name}`,
      value: values[name] ?? '',
      onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        set(name, event.target.value),
      required: options.required ?? false,
      maxLength: options.max ?? 200,
    };
    return (
      <div className={options.multiline ? 'field field-wide' : 'field'}>
        <label htmlFor={props.id}>{label}</label>
        {options.multiline ? (
          <textarea {...props} rows={4} />
        ) : (
          <input
            {...props}
            type={options.type ?? 'text'}
            min={options.min}
            max={options.type === 'number' ? options.max : undefined}
            step={options.type === 'datetime-local' ? 1 : undefined}
            autoFocus={name === 'title'}
          />
        )}
      </div>
    );
  }
  function select(name: string, label: string, children: ReactNode) {
    return (
      <div className="field">
        <label htmlFor={`task-${name}`}>{label}</label>
        <select
          id={`task-${name}`}
          value={values[name] ?? ''}
          onChange={(e) => set(name, e.target.value)}
        >
          {children}
        </select>
      </div>
    );
  }
  async function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    try {
      const [kind, parentId] = (values.parent ?? '').split(':');
      const number = (name: string) => (values[name] ? Number(values[name]) : null);
      const command = taskCommandSchema.parse({
        id,
        version: record?.version ?? 0,
        title: values.title,
        description: values.description?.trim() || null,
        notes: values.notes?.trim() || null,
        goalId: kind === 'goal' ? parentId : null,
        projectId: kind === 'project' ? parentId : null,
        categoryId: values.categoryId || null,
        status: values.status,
        priority: Number(values.priority),
        dueAt: values.dueAt ? dueInstant(values.dueAt, timeZone) : null,
        estimateMinutes: number('estimateMinutes'),
        actualMinutes: number('actualMinutes'),
        impact: Number(values.impact),
        urgency: Number(values.urgency),
        opportunity: Number(values.opportunity),
        goalAlignment: Number(values.goalAlignment),
        energy: values.energy,
      });
      if (
        command.status === 'cancelled' &&
        record?.status !== 'cancelled' &&
        !window.confirm('Cancel this Task? It will remain in your records and can be reopened.')
      )
        return;
      setBusy(true);
      setErrors([]);
      await onSave(command);
      dirty.current = false;
    } catch (error) {
      setErrors(
        error && typeof error === 'object' && 'issues' in error
          ? (error.issues as { message: string }[]).map((issue) => issue.message)
          : [
              error instanceof Error
                ? error.message
                : 'Could not save. Your changes are still here.',
            ],
      );
    } finally {
      setBusy(false);
    }
  }
  const parents = [
    ...goals.map((g) => ({ kind: 'goal', ...g })),
    ...projects.map((p) => ({ kind: 'project', ...p })),
    ...ancestors.filter(
      (a) =>
        (a.kind === 'goal' || a.kind === 'project') &&
        !goals.some((g) => g.id === a.id) &&
        !projects.some((p) => p.id === a.id),
    ),
  ];
  return (
    <dialog
      ref={dialog}
      className="direction-dialog"
      aria-labelledby="task-editor-title"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
    >
      <form onSubmit={submit}>
        <div className="editor-heading">
          <div>
            <Eyebrow>
              {capture ? 'GIVE YOUR CAPTURE A NEXT ACTION' : 'MAKE THE NEXT ACTION CLEAR'}
            </Eyebrow>
            <h2 id="task-editor-title">
              {capture ? 'Turn into Task' : record ? 'Edit Task' : 'New Task'}
            </h2>
          </div>
          <Button type="button" onClick={close} disabled={busy}>
            Close
          </Button>
        </div>
        {capture && (
          <p className="quiet-note">
            The original capture is preserved. It leaves your Inbox only after the Task is saved.
          </p>
        )}
        <fieldset disabled={busy} className="direction-fields">
          {field('title', 'Title', { required: true })}
          {field('description', 'Description', { multiline: true, max: 10_000 })}
          {select(
            'status',
            'Status',
            Object.entries(taskStatusLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            )),
          )}
          {select(
            'priority',
            'Priority',
            [1, 2, 3, 4, 5].map((value) => (
              <option key={value} value={value}>
                {value}
                {value === 1 ? ' · Highest' : value === 5 ? ' · Lowest' : ''}
              </option>
            )),
          )}
          {select(
            'parent',
            'Connected to',
            <>
              <option value="">Independent Task</option>
              {parents.map((parent) => (
                <option key={`${parent.kind}:${parent.id}`} value={`${parent.kind}:${parent.id}`}>
                  {parent.kind === 'goal' ? 'Goal' : 'Project'} · {parent.title}
                </option>
              ))}
            </>,
          )}
          {select(
            'categoryId',
            'Category',
            <>
              <option value="">No category</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </>,
          )}
          {(onMoreGoals || onMoreProjects) && (
            <div className="field field-wide parent-more">
              {onMoreGoals && (
                <Button
                  type="button"
                  onClick={() =>
                    void onMoreGoals().catch((error) =>
                      setErrors([error instanceof Error ? error.message : 'Could not load Goals.']),
                    )
                  }
                >
                  Load more Goals
                </Button>
              )}
              {onMoreProjects && (
                <Button
                  type="button"
                  onClick={() =>
                    void onMoreProjects().catch((error) =>
                      setErrors([
                        error instanceof Error ? error.message : 'Could not load Projects.',
                      ]),
                    )
                  }
                >
                  Load more Projects
                </Button>
              )}
            </div>
          )}
          {field('dueAt', `Due date and time (${timeZone})`, { type: 'datetime-local' })}
          {field('estimateMinutes', 'Estimate (minutes)', { type: 'number', min: 1, max: 1440 })}
          {field('actualMinutes', 'Actual duration (minutes)', {
            type: 'number',
            min: 0,
            max: 1_000_000,
          })}
          {select(
            'energy',
            'Energy needed',
            ['low', 'medium', 'high'].map((value) => (
              <option key={value} value={value}>
                {value[0]!.toUpperCase() + value.slice(1)}
              </option>
            )),
          )}
          <details className="task-ratings field-wide">
            <summary>Optional decision ratings</summary>
            <p className="quiet-note">
              Rate 0–5 only where useful. These are your assessments; no score or ranking is
              generated here.
            </p>
            <div className="direction-fields">
              {field('impact', 'Impact', { type: 'number', min: 0, max: 5 })}
              {field('urgency', 'Urgency', { type: 'number', min: 0, max: 5 })}
              {field('opportunity', 'Opportunity value', { type: 'number', min: 0, max: 5 })}
              {field('goalAlignment', 'Goal alignment', { type: 'number', min: 0, max: 5 })}
            </div>
          </details>
          {field('notes', 'Notes', { multiline: true, max: 4000 })}
        </fieldset>
        {errors.length > 0 && (
          <div role="alert" className="editor-errors">
            {errors.map((error, index) => (
              <p key={index}>{error}</p>
            ))}
          </div>
        )}
        <div className="editor-footer">
          <Button type="button" onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? 'Saving…' : capture ? 'Create Task' : 'Save Task'}
          </Button>
        </div>
      </form>
    </dialog>
  );
}
export function taskStatus(command: TaskCommand, status: TaskStatus): TaskCommand {
  return { ...command, status };
}
