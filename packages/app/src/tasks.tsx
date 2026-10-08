'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  Task,
  TaskDetail,
  TaskStatus,
  Category,
  Goal,
  Project,
  DirectionPage,
} from '@life-os/shared';
import { taskStatusLabels } from '@life-os/shared';
import type { TaskCommand } from '@life-os/validation';
import { Button, Eyebrow, Panel } from '@life-os/ui';
import { postJson, requestJson, RequestFailed, type Profile } from './auth-client';
import { TaskEditor, taskEditCommand } from './task-editor';
type Owned<T> = T & { ownerId: string };
type Conversion = {
  capture: { id: string; body: string };
  convertedTaskId: string | null;
  processed: boolean;
};
type Choices = {
  categories: Category[];
  goals: DirectionPage<Goal>;
  projects: DirectionPage<Project>;
};
const empty = () => ({ items: [], nextCursor: null });
export function Tasks({
  initialId,
  fromInbox,
  initialGoalId,
  initialProjectId,
}: {
  initialId?: string | undefined;
  fromInbox?: string | undefined;
  initialGoalId?: string | undefined;
  initialProjectId?: string | undefined;
}) {
  const [profile, setProfile] = useState<Profile | null>(null),
    [page, setPage] = useState<DirectionPage<Task>>(empty),
    [detail, setDetail] = useState<TaskDetail | null>(null);
  const [choices, setChoices] = useState<Choices>({
    categories: [],
    goals: empty(),
    projects: empty(),
  });
  const [editor, setEditor] = useState<{
    record: Task | null;
    capture: Conversion['capture'] | null;
  } | null>(null);
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [detailLoading, setDetailLoading] = useState(false),
    [ended, setEnded] = useState(false),
    [message, setMessage] = useState('');
  const [status, setStatus] = useState(''),
    [parent, setParent] = useState(
      initialProjectId
        ? `project:${initialProjectId}`
        : initialGoalId
          ? `goal:${initialGoalId}`
          : '',
    );
  const bootstrapped = useRef(false),
    refreshAgain = useRef(false),
    latestRefresh = useRef<(() => Promise<void>) | null>(null);
  const identity = useRef<string | null>(null),
    generation = useRef(0),
    selection = useRef(0),
    inactive = useRef(false),
    refreshing = useRef(false),
    modal = useRef(false),
    selectedId = useRef<string | null>(null),
    heading = useRef<HTMLHeadingElement>(null);
  const fail = useCallback((error: unknown) => {
    if (error instanceof RequestFailed && error.status === 401) {
      inactive.current = true;
      generation.current++;
      selection.current++;
      modal.current = false;
      setProfile(null);
      setPage(empty());
      setChoices({ categories: [], goals: empty(), projects: empty() });
      setDetail(null);
      setEditor(null);
      setEnded(true);
      setMessage('Your session ended or the account changed. Sign in again to continue.');
    } else setMessage(error instanceof Error ? error.message : 'Connection lost. Please retry.');
  }, []);
  const check = useCallback((ownerId: string) => {
    if (inactive.current || (identity.current && ownerId !== identity.current))
      throw new RequestFailed(401, 'The account changed.');
  }, []);
  const open = useCallback(
    async (id: string, focus = true) => {
      const active = generation.current,
        selected = ++selection.current;
      setDetailLoading(true);
      try {
        const data = await requestJson<Owned<TaskDetail>>(`/api/tasks/${id}`);
        check(data.ownerId);
        if (active !== generation.current || selected !== selection.current) return;
        selectedId.current = id;
        setDetail(data);
        if (focus) {
          window.history.replaceState(null, '', `/tasks?id=${id}`);
          setTimeout(() => heading.current?.focus(), 0);
        }
      } catch (error) {
        if (active === generation.current && selected === selection.current) fail(error);
      } finally {
        if (selected === selection.current) setDetailLoading(false);
      }
    },
    [check, fail],
  );
  const query = useCallback(
    (cursor?: string) => {
      const params = new URLSearchParams();
      if (status) params.set('status', status);
      const [kind, id] = parent.split(':');
      if (id) params.set(kind === 'project' ? 'projectId' : 'goalId', id);
      if (cursor) params.set('before', cursor);
      return `/api/tasks${params.size ? `?${params}` : ''}`;
    },
    [status, parent],
  );
  const refresh = useCallback(async () => {
    if (inactive.current || modal.current) return;
    if (refreshing.current) {
      refreshAgain.current = true;
      return;
    }
    refreshing.current = true;
    setLoading(true);
    const active = generation.current;
    try {
      const { profile: user } = await requestJson<{ profile: Profile }>('/api/auth/session');
      check(user.id);
      identity.current = user.id;
      await postJson('/api/auth/refresh', {});
      const [list, metadata, goals, projects] = await Promise.all([
        requestJson<Owned<DirectionPage<Task>>>(query()),
        requestJson<Owned<{ categories: Category[] }>>('/api/direction'),
        requestJson<Owned<DirectionPage<Goal>>>('/api/direction/goals'),
        requestJson<Owned<DirectionPage<Project>>>('/api/direction/projects'),
      ]);
      for (const data of [list, metadata, goals, projects]) check(data.ownerId);
      if (active !== generation.current) return;
      setProfile(user);
      setPage(list);
      setChoices({ categories: metadata.categories, goals, projects });
      if (selectedId.current) await open(selectedId.current, false);
    } catch (error) {
      if (active === generation.current) fail(error);
    } finally {
      refreshing.current = false;
      setLoading(false);
      if (refreshAgain.current) {
        refreshAgain.current = false;
        setTimeout(() => void latestRefresh.current?.(), 0);
      }
    }
  }, [check, fail, open, query]);
  const readyAccount = profile?.id;
  useEffect(() => {
    if (!readyAccount || bootstrapped.current || inactive.current) return;
    bootstrapped.current = true;
    if (new URLSearchParams(location.search).get('new') === '1')
      setTimeout(() => {
        modal.current = true;
        setEditor({ record: null, capture: null });
      }, 0);
    let disposed = false;
    void (async () => {
      if (initialId) await open(initialId);
      if (fromInbox) {
        try {
          const data = await requestJson<Owned<Conversion>>(`/api/tasks/from-inbox/${fromInbox}`);
          check(data.ownerId);
          if (disposed || inactive.current) return;
          if (data.convertedTaskId) {
            setMessage('This capture already became a Task.');
            await open(data.convertedTaskId);
          } else if (data.processed) setMessage('This capture has already been processed.');
          else {
            modal.current = true;
            setEditor({ record: null, capture: data.capture });
          }
        } catch (error) {
          if (!disposed) fail(error);
        }
      }
    })();
    return () => {
      disposed = true;
    };
  }, [readyAccount, initialId, fromInbox, check, fail, open]);
  useEffect(() => {
    latestRefresh.current = refresh;
    const timer = setTimeout(() => void refresh(), 0);
    const foreground = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    window.addEventListener('focus', foreground);
    document.addEventListener('visibilitychange', foreground);
    const poll = setInterval(foreground, 60_000);
    return () => {
      clearTimeout(timer);
      clearInterval(poll);
      window.removeEventListener('focus', foreground);
      document.removeEventListener('visibilitychange', foreground);
    };
  }, [refresh]);
  async function mutate(command: TaskCommand, sourceId?: string) {
    const active = generation.current;
    try {
      const { profile: user } = await requestJson<{ profile: Profile }>('/api/auth/session');
      check(user.id);
      const result = await postJson<{ item: Task }>(
        sourceId
          ? `/api/tasks/from-inbox/${sourceId}`
          : `/api/tasks${command.version ? `/${command.id}` : ''}`,
        command,
        sourceId || !command.version ? 'POST' : 'PATCH',
        identity.current ?? undefined,
      );
      if (active !== generation.current || inactive.current)
        throw new RequestFailed(401, 'Session ended.');
      return result.item;
    } catch (error) {
      fail(error);
      throw error;
    }
  }
  async function save(command: TaskCommand) {
    const item = await mutate(command, editor?.capture?.id);
    modal.current = false;
    setEditor(null);
    setMessage(editor?.capture ? 'Capture turned into a Task.' : 'Task saved.');
    await refresh();
    await open(item.id);
  }
  async function changeStatus(task: Task, next: TaskStatus) {
    if (busy) return;
    setBusy(true);
    try {
      await mutate({ ...taskEditCommand(task), status: next });
      await refresh();
      await open(task.id, false);
      setMessage(next === 'completed' ? 'Task completed.' : 'Task reopened.');
    } catch {
      /* Form-independent failure is visible in the workspace. */
    } finally {
      setBusy(false);
    }
  }
  async function moreParents(kind: 'goals' | 'projects') {
    const cursor = choices[kind].nextCursor;
    if (!cursor) return;
    const active = generation.current;
    try {
      const data = await requestJson<Owned<DirectionPage<Goal | Project>>>(
        `/api/direction/${kind}?before=${cursor}`,
      );
      check(data.ownerId);
      if (active !== generation.current) return;
      setChoices((old) => ({
        ...old,
        [kind]: {
          items: [
            ...old[kind].items,
            ...data.items.filter(
              (item) => !old[kind].items.some((existing) => existing.id === item.id),
            ),
          ],
          nextCursor: data.nextCursor,
        },
      }));
    } catch (error) {
      fail(error);
      throw error;
    }
  }
  async function more() {
    if (!page.nextCursor || busy) return;
    setBusy(true);
    const active = generation.current;
    try {
      const data = await requestJson<Owned<DirectionPage<Task>>>(query(page.nextCursor));
      check(data.ownerId);
      if (active !== generation.current) return;
      setPage((old) => ({
        items: [
          ...old.items,
          ...data.items.filter((item) => !old.items.some((existing) => existing.id === item.id)),
        ],
        nextCursor: data.nextCursor,
      }));
    } catch (error) {
      fail(error);
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    if (busy || !window.confirm('Sign out of Life OS?')) return;
    setBusy(true);
    inactive.current = true;
    generation.current++;
    try {
      await postJson('/api/auth/logout', {});
      window.location.replace('/login?next=/tasks');
    } catch (error) {
      inactive.current = false;
      fail(error);
    } finally {
      setBusy(false);
    }
  }
  function start(record: Task | null) {
    modal.current = true;
    setEditor({ record, capture: null });
  }
  function close() {
    modal.current = false;
    setEditor(null);
    if (fromInbox)
      window.history.replaceState(
        null,
        '',
        selectedId.current ? `/tasks?id=${selectedId.current}` : '/tasks',
      );
    void refresh();
  }
  const task = detail?.item;
  const date = (value: string) =>
    new Intl.DateTimeFormat('en-US', {
      timeZone: profile?.timeZone ?? 'UTC',
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value));
  return (
    <main className="direction-page tasks-page">
      <a className="skip-link" href="#tasks-heading">
        Skip to Tasks
      </a>
      <header className="private-topbar">
        <a href="/" className="auth-brand">
          LIFE OS
        </a>
        <nav aria-label="Workspace navigation">
          <a href="/">Today</a>
          <a href="/inbox">Inbox</a>
          <a href="/direction">Direction</a>
          <a href="/tasks" aria-current="page">
            Tasks
          </a>
        </nav>
        <div className="private-account">
          {profile && <span>{profile.displayName}</span>}
          {profile && (
            <Button onClick={() => void logout()} disabled={busy}>
              Sign out
            </Button>
          )}
        </div>
      </header>
      <section className="direction-intro task-intro">
        <div>
          <Eyebrow>CLARITY BECOMES ACTION</Eyebrow>
          <h1 id="tasks-heading">A deliberate next step.</h1>
          <p>Keep the work small enough to start, and connected to what matters.</p>
        </div>
        {profile && (
          <Button variant="primary" onClick={() => start(null)} disabled={busy}>
            New Task
          </Button>
        )}
      </section>
      {message && (
        <p role={ended ? 'alert' : 'status'} className="form-message">
          {message}
        </p>
      )}
      {ended && (
        <Panel>
          <h2>Return to your work.</h2>
          <p>Your private Tasks and drafts have been cleared from this view.</p>
          <a href="/login?next=/tasks">Sign in again</a>
        </Panel>
      )}
      {loading && <p role="status">{profile ? 'Refreshing your Tasks…' : 'Opening your Tasks…'}</p>}
      {!loading && !profile && !ended && (
        <Panel>
          <p>Sign in to see your Tasks.</p>
          <a href="/login?next=/tasks">Sign in</a>
          <Button onClick={() => void refresh()}>Retry</Button>
        </Panel>
      )}
      {profile && (
        <>
          <div className="task-filters">
            <div className="task-filter">
              <label htmlFor="task-status-filter">Status</label>
              <select
                id="task-status-filter"
                disabled={busy}
                value={status}
                onChange={(e) => {
                  generation.current++;
                  setStatus(e.target.value);
                  setPage(empty());
                }}
              >
                <option value="">All statuses</option>
                {Object.entries(taskStatusLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="task-filter">
              <label htmlFor="task-parent-filter">Connection</label>
              <select
                id="task-parent-filter"
                disabled={busy}
                value={parent}
                onChange={(e) => {
                  generation.current++;
                  setParent(e.target.value);
                  setPage(empty());
                }}
              >
                <option value="">All connections</option>
                {choices.goals.items.map((goal) => (
                  <option key={goal.id} value={`goal:${goal.id}`}>
                    Goal · {goal.title}
                  </option>
                ))}
                {choices.projects.items.map((project) => (
                  <option key={project.id} value={`project:${project.id}`}>
                    Project · {project.title}
                  </option>
                ))}
                {parent &&
                  ![
                    ...choices.goals.items.map((g) => `goal:${g.id}`),
                    ...choices.projects.items.map((p) => `project:${p.id}`),
                  ].includes(parent) && <option value={parent}>Selected connection</option>}
              </select>
            </div>
            <Button onClick={() => void refresh()} disabled={busy}>
              Refresh
            </Button>
          </div>
          <div className="direction-workspace">
            <Panel className="direction-list">
              <div className="panel-heading">
                <h2>Your Tasks</h2>
                <span className="small-muted">
                  {page.items.length}
                  {page.nextCursor ? '+' : ''} loaded
                </span>
              </div>
              {!page.items.length && !loading && (
                <div className="direction-empty">
                  <h3>
                    {status || parent ? 'No Tasks match yet.' : 'Make space for meaningful work.'}
                  </h3>
                  <p>
                    {status || parent
                      ? 'Choose another filter or add a new Task.'
                      : 'Create a clear next action, or turn a thought from your Inbox into a Task.'}
                  </p>
                  <a href="/inbox">Open Inbox</a>
                </div>
              )}
              <ul className="direction-records">
                {page.items.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      aria-pressed={task?.id === item.id}
                      className={`direction-row task-row${task?.id === item.id ? ' selected' : ''}`}
                      onClick={() => void open(item.id)}
                    >
                      <span className="record-title">{item.title}</span>
                      <span className="record-summary">
                        {taskStatusLabels[item.status]} · Priority {item.priority}
                        {item.dueAt ? ` · Due ${date(item.dueAt)}` : ''}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              {page.nextCursor && (
                <Button disabled={busy} onClick={() => void more()}>
                  Load earlier Tasks
                </Button>
              )}
            </Panel>
            <Panel className="direction-detail">
              {detailLoading && <p role="status">Opening Task…</p>}
              {!task && !detailLoading && (
                <div className="direction-empty">
                  <Eyebrow>ONE CLEAR ACTION</Eyebrow>
                  <h2>Choose a Task to see its details.</h2>
                  <p>
                    A useful Task has a clear outcome. Add context and a connection when they help.
                  </p>
                </div>
              )}
              {task && (
                <>
                  <div className="detail-top">
                    <div>
                      <Eyebrow>{taskStatusLabels[task.status]}</Eyebrow>
                      <h2 ref={heading} tabIndex={-1}>
                        {task.title}
                      </h2>
                    </div>
                    <Button disabled={busy || detailLoading} onClick={() => start(task)}>
                      Edit Task
                    </Button>
                  </div>
                  {detail!.ancestors.length > 0 && (
                    <nav aria-label="Task hierarchy" className="hierarchy-chain">
                      {detail!.ancestors.map((ancestor) =>
                        ancestor.kind === 'vision' ? (
                          <span key={ancestor.id}>{ancestor.title}</span>
                        ) : (
                          <a
                            key={ancestor.id}
                            href={`/direction?view=${ancestor.kind === 'goal' ? 'goals' : ancestor.kind === 'project' ? 'projects' : 'milestones'}&id=${ancestor.id}`}
                          >
                            {ancestor.title}
                          </a>
                        ),
                      )}
                      <span>{task.title}</span>
                    </nav>
                  )}
                  {task.description && <p className="private-prose">{task.description}</p>}
                  <dl className="direction-facts">
                    <div>
                      <dt>Priority</dt>
                      <dd>
                        {task.priority}{' '}
                        {task.priority === 1 ? '· Highest' : task.priority === 5 ? '· Lowest' : ''}
                      </dd>
                    </div>
                    <div>
                      <dt>Category</dt>
                      <dd>
                        {choices.categories.find((c) => c.id === task.categoryId)?.name ??
                          'No category'}
                      </dd>
                    </div>
                    <div>
                      <dt>Due</dt>
                      <dd>{task.dueAt ? date(task.dueAt) : 'No deadline'}</dd>
                    </div>
                    <div>
                      <dt>Energy needed</dt>
                      <dd>{task.energy}</dd>
                    </div>
                    <div>
                      <dt>Estimate</dt>
                      <dd>
                        {task.estimateMinutes === null
                          ? 'Not set'
                          : `${task.estimateMinutes} minutes`}
                      </dd>
                    </div>
                    <div>
                      <dt>Actual duration</dt>
                      <dd>
                        {task.actualMinutes === null
                          ? 'Not recorded'
                          : `${task.actualMinutes} minutes`}
                      </dd>
                    </div>
                    {task.status === 'completed' && (
                      <div>
                        <dt>Completed</dt>
                        <dd>{task.completedAt ? date(task.completedAt) : 'Time not recorded'}</dd>
                      </div>
                    )}
                  </dl>
                  {task.notes && (
                    <section className="detail-section">
                      <h3>Notes</h3>
                      <p className="private-prose">{task.notes}</p>
                    </section>
                  )}
                  {task.sourceInboxId && (
                    <p className="quiet-note">
                      Created from your Inbox. The original capture is preserved.
                    </p>
                  )}
                  <div className="detail-actions">
                    <Button
                      disabled={busy || detailLoading}
                      variant="primary"
                      onClick={() =>
                        void changeStatus(
                          task,
                          task.status === 'completed' ? 'planned' : 'completed',
                        )
                      }
                    >
                      {task.status === 'completed' ? 'Reopen Task' : 'Complete Task'}
                    </Button>
                  </div>
                </>
              )}
            </Panel>
          </div>
        </>
      )}
      {editor && profile && (
        <TaskEditor
          key={editor.record?.id ?? editor.capture?.id ?? 'new'}
          record={editor.record}
          capture={editor.capture}
          goals={choices.goals.items}
          projects={choices.projects.items}
          categories={choices.categories}
          ancestors={editor.record && detail?.item.id === editor.record.id ? detail.ancestors : []}
          timeZone={profile.timeZone}
          onSave={save}
          onClose={close}
          onMoreGoals={choices.goals.nextCursor ? () => moreParents('goals') : undefined}
          onMoreProjects={choices.projects.nextCursor ? () => moreParents('projects') : undefined}
        />
      )}
    </main>
  );
}
