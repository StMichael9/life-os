'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type {
  Ancestor,
  DirectionEntities,
  DirectionMeta,
  DirectionResource,
  Goal,
  Milestone,
} from '@life-os/shared';
import {
  seasonCommandSchema,
  goalCommandSchema,
  milestoneCommandSchema,
  projectCommandSchema,
} from '@life-os/validation';
import { Button, Eyebrow } from '@life-os/ui';
export const directionLabels = {
  seasons: 'Season',
  goals: 'Goal',
  milestones: 'Milestone',
  projects: 'Project',
};
type Entity = DirectionEntities[DirectionResource];
const nullable = (value: string | undefined) => value?.trim() || null;
export function CategoryCreator({
  onCreate,
  prefix = 'area',
}: {
  onCreate: (name: string, spiritual: boolean, id: string) => Promise<void>;
  prefix?: string;
}) {
  const [name, setName] = useState('');
  const [spiritual, setSpiritual] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = useRef<{ id: string; name: string; spiritual: boolean } | null>(null);
  async function create() {
    if (!name.trim() || busy) return;
    setBusy(true);
    setError('');
    if (
      !pending.current ||
      pending.current.name !== name.trim() ||
      pending.current.spiritual !== spiritual
    )
      pending.current = { id: crypto.randomUUID(), name: name.trim(), spiritual };
    try {
      await onCreate(pending.current.name, spiritual, pending.current.id);
      pending.current = null;
      setName('');
      setSpiritual(false);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not add the category.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="category-creator">
      <label htmlFor={`${prefix}-name`}>Category name</label>
      <div className="category-input">
        <input
          id={`${prefix}-name`}
          value={name}
          maxLength={100}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void create();
            }
          }}
          disabled={busy}
          placeholder="Education, practice, personal…"
        />
        <Button type="button" onClick={() => void create()} disabled={busy || !name.trim()}>
          {busy ? 'Adding…' : 'Add category'}
        </Button>
      </div>
      <label className="check-label">
        <input
          type="checkbox"
          checked={spiritual}
          onChange={(e) => setSpiritual(e.target.checked)}
          disabled={busy}
        />{' '}
        Faith / reflection
      </label>
      {error && (
        <p role="alert" className="form-message">
          {error}
        </p>
      )}
    </div>
  );
}
export function DirectionEditor({
  resource,
  record,
  meta,
  goals,
  milestones,
  ancestors,
  goalId,
  onSave,
  onClose,
  onCategory,
  onMoreGoals,
  onMoreMilestones,
}: {
  resource: DirectionResource;
  record: Entity | null;
  meta: DirectionMeta;
  goals: Goal[];
  milestones: Milestone[];
  ancestors: Ancestor[];
  goalId?: string | undefined;
  onSave: (body: unknown) => Promise<void>;
  onClose: () => void;
  onCategory: (name: string, spiritual: boolean, id: string) => Promise<void>;
  onMoreGoals?: (() => Promise<void>) | undefined;
  onMoreMilestones?: (() => Promise<void>) | undefined;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const dirty = useRef(false);
  const [id] = useState(() => record?.id ?? crypto.randomUUID());
  const [values, setValues] = useState<Record<string, string>>(() => {
    const result: Record<string, string> = {
      status: 'planned',
      priority: '3',
      goalId: goalId ?? '',
      completed: 'false',
      parent: '',
    };
    if (record)
      for (const [key, value] of Object.entries(record))
        if (typeof value === 'string' || typeof value === 'number') result[key] = String(value);
    if (record && 'completedAt' in record) result.completed = String(!!record.completedAt);
    if (record && 'milestoneId' in record)
      result.parent = record.milestoneId
        ? `milestone:${record.milestoneId}`
        : record.goalId
          ? `goal:${record.goalId}`
          : '';
    return result;
  });
  const [allocations, setAllocations] = useState<Record<string, string>>(() =>
    record && 'allocations' in record
      ? Object.fromEntries(record.allocations.map((a) => [a.categoryId, String(a.percent)]))
      : {},
  );
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  useEffect(() => {
    dialog.current?.showModal();
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty.current) event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);
  function close() {
    if (busy || (dirty.current && !window.confirm('Discard your unsaved changes?'))) return;
    onClose();
  }
  const set = (field: string, value: string) => {
    dirty.current = true;
    setValues((previous) => ({ ...previous, [field]: value }));
  };
  function field(
    name: string,
    label: string,
    options: { type?: string; required?: boolean; max?: number; multiline?: boolean } = {},
  ) {
    const input = {
      id: `edit-${name}`,
      name,
      value: values[name] ?? '',
      onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        set(name, event.target.value),
      required: options.required ?? false,
      autoFocus: !!options.required && (name === 'title' || name === 'name'),
      maxLength: options.max ?? 200,
    };
    return (
      <div className={options.multiline ? 'field field-wide' : 'field'}>
        <label htmlFor={input.id}>{label}</label>
        {options.multiline ? (
          <textarea {...input} rows={3} />
        ) : (
          <input {...input} type={options.type ?? 'text'} />
        )}
      </div>
    );
  }
  function select(name: string, label: string, children: ReactNode) {
    return (
      <div className="field">
        <label htmlFor={`edit-${name}`}>{label}</label>
        <select
          id={`edit-${name}`}
          name={name}
          value={values[name] ?? ''}
          onChange={(e) => set(name, e.target.value)}
        >
          {children}
        </select>
      </div>
    );
  }
  const statuses = (
    <>
      {['planned', 'active', 'completed', 'archived'].map((s) => (
        <option key={s} value={s}>
          {s[0]!.toUpperCase() + s.slice(1)}
        </option>
      ))}
    </>
  );
  const goalOptions = [
    ...goals.map((g) => ({ id: g.id, title: g.title })),
    ...ancestors.filter((a) => a.kind === 'goal' && !goals.some((g) => g.id === a.id)),
  ];
  const milestoneOptions = [
    ...milestones.map((m) => ({ id: m.id, title: m.title })),
    ...ancestors.filter((a) => a.kind === 'milestone' && !milestones.some((m) => m.id === a.id)),
  ];
  async function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const base = { id, version: record?.version ?? 0 };
    const common = {
      title: values.title ?? '',
      description: nullable(values.description),
      notes: nullable(values.notes),
      categoryId: nullable(values.categoryId),
      status: values.status,
    };
    let body: unknown;
    if (resource === 'seasons')
      body = {
        ...base,
        name: values.name ?? '',
        description: nullable(values.description),
        objective: values.objective ?? '',
        successCriteria: nullable(values.successCriteria),
        startsOn: values.startsOn ?? '',
        endsOn: values.endsOn ?? '',
        status: values.status,
        allocations: meta.categories
          .filter((c) => Number(allocations[c.id]) > 0)
          .map((c) => ({ categoryId: c.id, percent: Number(allocations[c.id]) })),
      };
    if (resource === 'goals')
      body = {
        ...base,
        ...common,
        visionId: nullable(values.visionId),
        targetDate: nullable(values.targetDate),
        priority: Number(values.priority),
        targetValue: nullable(values.targetValue),
        currentValue: nullable(values.currentValue),
        unit: nullable(values.unit),
      };
    if (resource === 'milestones')
      body = {
        ...base,
        title: values.title ?? '',
        goalId: values.goalId ?? '',
        targetDate: nullable(values.targetDate),
        completed: values.completed === 'true',
      };
    if (resource === 'projects')
      body = {
        ...base,
        ...common,
        startsOn: nullable(values.startsOn),
        targetDate: nullable(values.targetDate),
        goalId: values.parent?.startsWith('goal:') ? values.parent.slice(5) : null,
        milestoneId: values.parent?.startsWith('milestone:') ? values.parent.slice(10) : null,
      };
    const parsed = {
      seasons: seasonCommandSchema,
      goals: goalCommandSchema,
      milestones: milestoneCommandSchema,
      projects: projectCommandSchema,
    }[resource].safeParse(body);
    if (!parsed.success) {
      setErrors([...new Set(parsed.error.issues.map((issue) => issue.message))]);
      return;
    }
    if (
      record &&
      'status' in record &&
      record.status !== values.status &&
      values.status === 'archived' &&
      !window.confirm(
        `Archive this ${directionLabels[resource].toLowerCase()}? Its records and links will be kept.`,
      )
    )
      return;
    if (
      resource === 'seasons' &&
      values.status === 'active' &&
      meta.activeSeason &&
      meta.activeSeason.id !== id &&
      !window.confirm('Make this your active Season? The current Season will move back to planned.')
    )
      return;
    setBusy(true);
    setErrors([]);
    try {
      await onSave(parsed.data);
      dirty.current = false;
    } catch (error) {
      setErrors([
        error instanceof Error ? error.message : 'Could not save. Your changes are still here.',
      ]);
    } finally {
      setBusy(false);
    }
  }
  const total = meta.categories.reduce((sum, c) => sum + (Number(allocations[c.id]) || 0), 0);
  return (
    <dialog
      ref={dialog}
      className="direction-dialog"
      aria-labelledby="editor-title"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
    >
      <div className="editor-heading">
        <div>
          <Eyebrow>MAKE THE INTENTION CLEAR</Eyebrow>
          <h2 id="editor-title">
            {record ? 'Edit' : 'New'} {directionLabels[resource]}
          </h2>
        </div>
        <Button type="button" onClick={close} disabled={busy}>
          Cancel
        </Button>
      </div>
      <form onSubmit={submit}>
        <fieldset disabled={busy} className="direction-fields">
          {resource === 'seasons' ? (
            <>
              {field('name', 'Season name', { required: true, max: 120 })}
              {select('status', 'Status', statuses)}
              {field('objective', 'Primary objective', {
                required: true,
                max: 500,
                multiline: true,
              })}
              {field('startsOn', 'Start date', { type: 'date', required: true })}
              {field('endsOn', 'End date', { type: 'date', required: true })}
              {field('successCriteria', 'Success criteria', { max: 2000, multiline: true })}
            </>
          ) : (
            <>
              {field('title', 'Title', { required: true })}
              {resource !== 'milestones' && select('status', 'Status', statuses)}
            </>
          )}
          {resource !== 'milestones' &&
            field('description', 'Description', { max: 2000, multiline: true })}
          {resource !== 'seasons' &&
            resource !== 'milestones' &&
            select(
              'categoryId',
              'Category',
              <>
                <option value="">No category</option>
                {meta.categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </>,
            )}
          {resource === 'goals' && (
            <>
              {select(
                'priority',
                'Priority',
                <>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>
                      {n}
                      {n === 5 ? ' — Highest' : n === 1 ? ' — Lowest' : ''}
                    </option>
                  ))}
                </>,
              )}
              {select(
                'visionId',
                'Parent Vision',
                <>
                  <option value="">No Vision link</option>
                  {meta.visions.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.title}
                    </option>
                  ))}
                </>,
              )}
              {!meta.visions.length && (
                <p className="quiet-note field-wide">
                  Vision links are optional. No Visions exist in this account yet.
                </p>
              )}
              {field('targetDate', 'Target date', { type: 'date' })}
              <div className="measurement-fields field-wide">
                <h3>
                  Measurable outcome <span className="small-muted">Optional</span>
                </h3>
                <div className="direction-fields">
                  {field('targetValue', 'Target value', { max: 20 })}
                  {field('currentValue', 'Current value', { max: 20 })}
                  {field('unit', 'Unit', { max: 60 })}
                </div>
                <p className="quiet-note">
                  Use a target, current value and unit together. A written outcome can stand on its
                  own.
                </p>
              </div>
            </>
          )}
          {resource === 'projects' && (
            <>
              {select(
                'parent',
                'Connected to',
                <>
                  <option value="">Independent project</option>
                  <optgroup label="Goals">
                    {goalOptions.map((g) => (
                      <option key={g.id} value={`goal:${g.id}`}>
                        {g.title}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Milestones">
                    {milestoneOptions.map((m) => (
                      <option key={m.id} value={`milestone:${m.id}`}>
                        {m.title}
                      </option>
                    ))}
                  </optgroup>
                </>,
              )}
              {field('startsOn', 'Start date', { type: 'date' })}
              {field('targetDate', 'Target date', { type: 'date' })}
            </>
          )}
          {resource === 'milestones' && (
            <>
              {select(
                'goalId',
                'Goal',
                <>
                  <option value="">Choose a Goal</option>
                  {goalOptions.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.title}
                    </option>
                  ))}
                </>,
              )}
              {field('targetDate', 'Target date', { type: 'date' })}
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={values.completed === 'true'}
                  onChange={(e) => set('completed', String(e.target.checked))}
                />{' '}
                Completed
              </label>
            </>
          )}
          {(resource === 'milestones' || resource === 'projects') &&
            (onMoreGoals || onMoreMilestones) && (
              <div className="field-wide parent-load">
                {onMoreGoals && (
                  <Button
                    type="button"
                    onClick={() => void onMoreGoals().catch((error) => setErrors([error.message]))}
                  >
                    Load more Goals
                  </Button>
                )}
                {resource === 'projects' && onMoreMilestones && (
                  <Button
                    type="button"
                    onClick={() =>
                      void onMoreMilestones().catch((error) => setErrors([error.message]))
                    }
                  >
                    Load more Milestones
                  </Button>
                )}
              </div>
            )}
          {resource === 'seasons' && (
            <div className="field-wide allocation-editor">
              <div className="panel-heading">
                <h3>Category allocations</h3>
                <span
                  className={total === 100 ? 'allocation-total' : 'allocation-total incomplete'}
                  aria-live="polite"
                >
                  {total}% / 100%
                </span>
              </div>
              <p className="quiet-note">
                Give each area a deliberate share. The complete allocation must total 100%.
              </p>
              {!meta.categories.length && <p>Add your first category below to begin.</p>}
              {meta.categories.map((c) => (
                <div className="allocation-input" key={c.id}>
                  <label htmlFor={`allocation-${c.id}`}>{c.name}</label>
                  <div>
                    <input
                      id={`allocation-${c.id}`}
                      type="number"
                      min={0}
                      max={100}
                      step={1}
                      value={allocations[c.id] ?? '0'}
                      onChange={(e) => {
                        dirty.current = true;
                        setAllocations((previous) => ({ ...previous, [c.id]: e.target.value }));
                      }}
                    />
                    <span>%</span>
                  </div>
                </div>
              ))}
            </div>
          )}
          {resource !== 'milestones' && (
            <details className="field-wide add-category">
              <summary>Add a category</summary>
              <CategoryCreator prefix="editor-area" onCreate={onCategory} />
            </details>
          )}
          {(resource === 'goals' || resource === 'projects') &&
            field('notes', 'Notes', { max: 4000, multiline: true })}
        </fieldset>
        {errors.length > 0 && (
          <div className="form-message validation-feedback" role="alert">
            <ul>
              {errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          </div>
        )}
        <div className="editor-footer">
          <p className="quiet-note">
            {busy ? 'Saving your changes…' : 'Changes stay in this tab until saved.'}
          </p>
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? 'Saving…' : `Save ${directionLabels[resource]}`}
          </Button>
        </div>
      </form>
    </dialog>
  );
}
export function dateRange(start: string | null, end: string | null) {
  const format = (date: string) =>
    new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(new Date(`${date}T12:00:00Z`));
  return [start && format(start), end && format(end)].filter(Boolean).join(' — ');
}
export function AllocationList({
  allocations,
}: {
  allocations: { categoryId: string; name: string; percent: number }[];
}) {
  return (
    <ul className="allocation-list">
      {allocations.map((a) => (
        <li key={a.categoryId}>
          <div>
            <span>{a.name}</span>
            <strong>{a.percent}%</strong>
          </div>
          <div className="allocation-track" aria-hidden="true">
            <span style={{ width: `${a.percent}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
