'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ExecutionCommand } from '@life-os/validation';
import { emptyReflection, elapsedFocus, wallTime } from '@life-os/shared';
import type { ExecutionSnapshot, VaultItem } from '@life-os/shared';
import { requestJson, postJson, RequestFailed } from './auth-client';
import type { Profile, InboxItem } from './auth-client';
import { ExecutionForm } from './execution-editor';
import type { ExecutionEditor } from './execution-editor';
import { taskEditCommand } from './task-editor';
const uuid = () => crypto.randomUUID();
export function Execution({
  section = 'today',
}: {
  section?: 'today' | 'schedule' | 'focus' | 'routines' | 'vault';
}) {
  const [data, setData] = useState<ExecutionSnapshot | null>(null),
    [profile, setProfile] = useState<Profile | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true);
  const [date, setDate] = useState(''),
    [minutes, setMinutes] = useState(90),
    [energy, setEnergy] = useState('medium'),
    [editor, setEditor] = useState<ExecutionEditor | null>(null);
  const [vault, setVault] = useState<VaultItem[]>([]),
    [next, setNext] = useState<string | null>(null),
    [kind, setKind] = useState(''),
    [archived, setArchived] = useState(false);
  const [capture, setCapture] = useState(''),
    [clock, setClock] = useState(() => Date.now()),
    [clockOffset, setClockOffset] = useState(0),
    [message, setMessage] = useState('');
  const account = useRef<string | null>(null),
    generation = useRef(0),
    editing = useRef(false),
    captureRetry = useRef<{ text: string; id: string } | null>(null),
    inflight = useRef(false),
    needsReload = useRef(false);
  const currentRefresh = useRef<() => Promise<void>>(async () => {}),
    mutating = useRef(false);
  function forget() {
    generation.current++;
    account.current = null;
    setData(null);
    setProfile(null);
    setVault([]);
    setEditor(null);
    setCapture('');
    captureRetry.current = null;
    setError('Your session or account changed. Sign in or reload to continue.');
  }
  const reload = useCallback(async () => {
    if (inflight.current) {
      needsReload.current = true;
      return;
    }
    inflight.current = true;
    const epoch = generation.current;
    try {
      const { profile: p } = await requestJson<{ profile: Profile }>('/api/auth/session');
      if (epoch !== generation.current) return;
      if (account.current && account.current !== p.id) {
        forget();
        return;
      }
      account.current = p.id;
      setProfile(p);
      await postJson('/api/auth/refresh', {});
      if (editing.current) return;
      const query = new URLSearchParams({
        availableMinutes: String(minutes),
        energy,
        ...(date ? { date } : {}),
      });
      const snapshot = await requestJson<ExecutionSnapshot>('/api/execution/today?' + query);
      if (epoch !== generation.current || snapshot.ownerId !== account.current) return;
      setData(snapshot);
      setClockOffset(Date.parse(snapshot.serverNow) - Date.now());
      if (section === 'vault') {
        const q = new URLSearchParams({ archived: String(archived), ...(kind ? { kind } : {}) });
        const result = await requestJson<{
          items: VaultItem[];
          next: string | null;
          ownerId: string;
        }>('/api/execution/vault?' + q);
        if (epoch !== generation.current || result.ownerId !== account.current) return;
        let items = result.items;
        const target = new URLSearchParams(location.search).get('id');
        if (target) {
          const detail = await requestJson<{ item: VaultItem; ownerId: string }>(
            '/api/execution/vault/' + encodeURIComponent(target),
          );
          if (detail.ownerId !== account.current || epoch !== generation.current) return;
          items = [detail.item, ...items.filter((i) => i.id !== target)];
          setTimeout(
            () => document.getElementById('vault-' + target)?.scrollIntoView({ block: 'center' }),
            0,
          );
        }
        setVault(items);
        setNext(result.next);
      }
      setError('');
    } catch (e) {
      if (epoch !== generation.current) return;
      if (e instanceof RequestFailed && e.status === 401) forget();
      else setError(e instanceof Error ? e.message : 'Could not refresh your workspace.');
    } finally {
      inflight.current = false;
      setLoading(false);
      if (needsReload.current) {
        needsReload.current = false;
        void currentRefresh.current();
      }
    }
  }, [date, minutes, energy, section, kind, archived]);
  useEffect(() => {
    currentRefresh.current = reload;
    const timer = setTimeout(() => void reload(), 0);
    return () => clearTimeout(timer);
  }, [reload]);
  const initialized = useRef(false);
  useEffect(() => {
    if (!data || initialized.current) return;
    initialized.current = true;
    const timer = setTimeout(() => {
      const params = new URLSearchParams(location.search);
      if (section === 'focus' && params.get('start') === '1' && !data.focus)
        setEditor({ kind: 'focus' });
      if (section === 'vault' && params.get('kind')) setKind(params.get('kind')!);
    }, 0);
    return () => clearTimeout(timer);
  }, [data, section]);
  useEffect(() => {
    editing.current = !!editor;
  }, [editor]);
  useEffect(() => {
    const tick = setInterval(() => setClock(Date.now()), 1000);
    const refresh = () => {
      if (document.visibilityState === 'visible') void currentRefresh.current();
    };
    const timer = setInterval(refresh, 60000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      clearInterval(tick);
      clearInterval(timer);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (capture.trim()) {
        e.preventDefault();
      }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [capture]);
  async function logout() {
    if (busy || !confirm('Sign out? Unsent drafts will be discarded.')) return;
    setBusy(true);
    try {
      await postJson('/api/auth/logout', {});
      location.assign('/login');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign out failed. Try again.');
    } finally {
      setBusy(false);
    }
  }
  async function checkAccount() {
    const { profile: p } = await requestJson<{ profile: Profile }>('/api/auth/session');
    if (!account.current || p.id !== account.current) {
      forget();
      throw new Error('Account changed. Sign in again.');
    }
    return p.id;
  }
  async function mutate(command: ExecutionCommand) {
    if (mutating.current) throw new Error('Wait for the previous save to finish.');
    mutating.current = true;
    setBusy(true);
    try {
      const owner = await checkAccount();
      await postJson('/api/execution', command, 'POST', owner);
      setMessage('Saved.');
    } catch (e) {
      if (e instanceof RequestFailed && e.status === 401) forget();
      throw e;
    } finally {
      mutating.current = false;
      setBusy(false);
    }
  }
  async function action(c: ExecutionCommand) {
    try {
      await mutate(c);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed.');
    }
  }
  async function optimisticAction(c: ExecutionCommand, next: ExecutionSnapshot) {
    const previous = data,
      epoch = generation.current;
    setData(next);
    try {
      await mutate(c);
      await reload();
    } catch (e) {
      if (epoch === generation.current) setData(previous);
      setError(e instanceof Error ? e.message : 'Save failed.');
    }
  }
  function outcomeCheck(index: number, completed: boolean) {
    if (!data?.plan || busy) return;
    const c = planCommand('save');
    if (c.action !== 'plan') return;
    c.outcomes[index]!.completed = completed;
    void optimisticAction(c, {
      ...data,
      plan: {
        ...data.plan,
        outcomes: data.plan.outcomes.map((o, i) =>
          i === index ? { ...o, completedAt: completed ? new Date().toISOString() : null } : o,
        ),
      },
    });
  }
  function routineCheck(id: string, completed: boolean) {
    if (!data || busy) return;
    const r = data.routines.find((r) => r.id === id)!;
    void optimisticAction(
      {
        action: 'routine-check',
        requestId: uuid(),
        id,
        date: data.date,
        completed,
        notes: r.completionNotes ?? '',
      },
      { ...data, routines: data.routines.map((r) => (r.id === id ? { ...r, completed } : r)) },
    );
  }
  function closeEditor() {
    editing.current = false;
    setEditor(null);
    void reload();
  }
  async function saveCapture() {
    if (!capture.trim() || busy) return;
    setBusy(true);
    try {
      const owner = await checkAccount();
      if (captureRetry.current?.text !== capture.trim())
        captureRetry.current = { text: capture.trim(), id: uuid() };
      await postJson(
        '/api/inbox',
        {
          body: captureRetry.current.text,
          requestId: captureRetry.current.id,
        },
        'POST',
        owner,
      );
      setCapture('');
      captureRetry.current = null;
      setMessage('Captured in Inbox.');
      await reload();
    } catch (e) {
      if (e instanceof RequestFailed && e.status === 401) forget();
      else
        setError(
          e instanceof Error ? e.message : 'Capture failed. Retry to preserve this thought.',
        );
    } finally {
      setBusy(false);
    }
  }
  async function saveContent(type: 'scripture' | 'thought') {
    if (!data) return;
    const c = data.content;
    await action({
      action: 'vault',
      requestId: uuid(),
      id: uuid(),
      version: 0,
      title:
        type === 'scripture'
          ? `${c.scripture.book} ${c.scripture.chapter}:${c.scripture.verse} (KJV)`
          : 'Thought for ' + data.date,
      body: type === 'scripture' ? c.scripture.text : c.thought.text,
      kind: type,
      archived: false,
      sourceInboxId: null,
    });
  }
  async function completeTask(id: string) {
    const task = data?.tasks.find((t) => t.id === id);
    if (!task) return;
    setBusy(true);
    try {
      const owner = await checkAccount();
      await postJson(
        '/api/tasks/' + id,
        { ...taskEditCommand(task), status: 'completed' },
        'PATCH',
        owner,
      );
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not complete this Task.');
    } finally {
      setBusy(false);
    }
  }
  function promoteVault(v: VaultItem, target: 'goal' | 'project') {
    if (confirm('Turn this idea into a ' + target + '? Full source context stays in Vault.'))
      void action({
        action: 'vault-promote',
        requestId: uuid(),
        id: v.id,
        version: v.version,
        target,
        targetId: uuid(),
      });
  }
  async function moreVault() {
    if (!next) return;
    try {
      const q = new URLSearchParams({
          before: next,
          archived: String(archived),
          ...(kind ? { kind } : {}),
        }),
        epoch = generation.current;
      const result = await requestJson<{
        items: VaultItem[];
        next: string | null;
        ownerId: string;
      }>('/api/execution/vault?' + q);
      if (result.ownerId === account.current && epoch === generation.current) {
        setVault((prev) => [...prev, ...result.items]);
        setNext(result.next);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load older items.');
    }
  }
  async function processCapture(source: string) {
    try {
      const result = await requestJson<{
        capture: InboxItem;
        convertedTaskId: string | null;
        ownerId: string;
      }>('/api/tasks/from-inbox/' + encodeURIComponent(source));
      if (result.ownerId !== account.current) return;
      setEditor({ kind: 'vault', source: result.capture });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open that capture.');
    }
  }
  useEffect(() => {
    if (
      section === 'vault' &&
      data &&
      !editing.current &&
      new URLSearchParams(location.search).has('fromInbox')
    ) {
      const source = new URLSearchParams(location.search).get('fromInbox')!;
      history.replaceState(null, '', '/vault');
      void processCapture(source);
    }
  }, [section, data]);
  if (!data)
    return (
      <main className="private-page">
        <a href="/">Life OS</a>
        <h1>{loading ? 'Opening your workspace…' : 'Your private workspace'}</h1>
        {error && <p role="alert">{error}</p>}
        {!loading && (
          <a
            className="button"
            href={'/login?next=' + encodeURIComponent(section === 'today' ? '/' : '/' + section)}
          >
            Sign in
          </a>
        )}
      </main>
    );
  const session = data.focus,
    elapsed = session ? elapsedFocus(session, new Date(clock + clockOffset)) : 0;
  const time = (iso: string) =>
    new Intl.DateTimeFormat('en-US', {
      timeZone: data.timeZone,
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(iso));
  const selectedTitle =
    section === 'today'
      ? 'Today'
      : section === 'vault'
        ? 'Vault'
        : section === 'schedule'
          ? 'Schedule'
          : section === 'focus'
            ? 'Focus'
            : 'Routines';
  const planCommand = (workflow: 'save' | 'reopen'): ExecutionCommand => ({
    action: 'plan',
    requestId: uuid(),
    date: data.date,
    version: data.plan?.version ?? 0,
    oneThing: data.plan?.oneThing ?? null,
    outcomes:
      data.plan?.outcomes.map((o) => ({
        outcome: o.outcome,
        taskId: o.taskId,
        completed: !!o.completedAt,
      })) ?? [],
    workflow,
    reflection: emptyReflection,
  });
  const scheduledMinutes = data.snapshot.scheduledMinutes;
  return (
    <div
      className={
        'app-shell execution-shell' + (section === 'focus' && session ? ' focused-workspace' : '')
      }
    >
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <aside className="sidebar" aria-label="Life OS">
        <a className="brand" href="/">
          LIFE <strong>OS</strong>
        </a>
        <p className="workspace-label">{profile?.displayName} · Private workspace</p>
        <nav aria-label="Main navigation">
          {[
            ['Today', '/'],
            ['Schedule', '/schedule'],
            ['Focus', '/focus'],
            ['Inbox', '/inbox'],
            ['Direction', '/direction'],
            ['Tasks', '/tasks'],
            ['Routines', '/routines'],
            ['Vault', '/vault'],
          ].map(([name, path]) => (
            <a
              key={path}
              className={'nav-link' + (selectedTitle === name ? ' active' : '')}
              aria-current={selectedTitle === name ? 'page' : undefined}
              href={path}
            >
              {name}
            </a>
          ))}
        </nav>
        <p className="muted">Ctrl / ⌘ K to find or capture</p>
      </aside>
      <main id="main" className="execution-main">
        <header className="execution-top">
          <div>
            <p className="eyebrow">Make room for what matters</p>
            <h1>{selectedTitle}</h1>
          </div>
          <div className="execution-actions">
            <button className="button" onClick={() => void reload()} disabled={busy}>
              Refresh
            </button>
            <button className="button" disabled={busy} onClick={() => void logout()}>
              Sign out
            </button>
          </div>
        </header>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <p className="sr-only" role="status">
          {message}
        </p>
        {section !== 'vault' && (
          <div className="day-toolbar">
            <label>
              Selected day
              <input
                aria-label="Selected day"
                type="date"
                value={date || data.date}
                onChange={(e) => setDate(e.target.value)}
              />
            </label>
            <button className="button" onClick={() => setDate('')}>
              Today
            </button>
            <time dateTime={data.date}>{data.date}</time>
            <span className="muted">{data.timeZone}</span>
            <span className="day-state">
              {data.plan?.closedAt
                ? 'Day closed'
                : data.plan?.startedAt
                  ? 'Day started'
                  : 'Ready to plan'}
            </span>
          </div>
        )}
        {section === 'today' && (
          <>
            <section className="season-banner" aria-labelledby="season-heading">
              <p className="eyebrow">YOUR WORKSPACE</p>
              {data.activeSeason ? (
                <>
                  <h2 id="season-heading">{data.activeSeason.name}</h2>
                  <p>{data.activeSeason.objective}</p>
                  <p className="muted">
                    {data.activeSeason.startsOn} — {data.activeSeason.endsOn}
                  </p>
                  <div className="allocation-pills">
                    {data.activeSeason.allocations.map((a) => (
                      <span key={a.categoryId}>
                        {a.name} {a.percent}%
                      </span>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <h2 id="season-heading">Choose what deserves your focus.</h2>
                  <p>No active Season yet. Give your daily work a direction.</p>
                </>
              )}
              <a
                href={
                  data.activeSeason
                    ? '/direction?resource=seasons&id=' + data.activeSeason.id
                    : '/direction'
                }
              >
                {data.activeSeason ? 'View your Season' : 'Choose a Season'} →
              </a>
            </section>
            <div className="execution-grid">
              <section className="execution-card priority-card">
                <p className="eyebrow">If only one thing happens</p>
                <h2>The One Thing</h2>
                <p className="one-thing">
                  {data.plan?.oneThing ??
                    'Choose the outcome that would move your life forward most.'}
                </p>
                <div className="execution-actions">
                  <button
                    className="button button-primary"
                    disabled={busy || !!data.plan?.closedAt}
                    onClick={() => setEditor({ kind: 'plan', workflow: 'save' })}
                  >
                    Edit priorities
                  </button>
                  {!data.plan?.startedAt && (
                    <button
                      className="button"
                      disabled={busy}
                      onClick={() => setEditor({ kind: 'plan', workflow: 'start' })}
                    >
                      Start Day
                    </button>
                  )}
                  {data.plan?.startedAt && !data.plan.closedAt && (
                    <button
                      className="button"
                      disabled={busy}
                      onClick={() => setEditor({ kind: 'plan', workflow: 'close' })}
                    >
                      Close Day
                    </button>
                  )}
                  {data.plan?.closedAt && (
                    <button
                      className="button"
                      disabled={busy}
                      onClick={() => {
                        if (confirm('Reopen this day for changes?'))
                          void action(planCommand('reopen'));
                      }}
                    >
                      Reopen Day
                    </button>
                  )}
                </div>
              </section>
              <section className="execution-card">
                <p className="eyebrow">A successful day, deliberately chosen</p>
                <h2>Today’s Big 3</h2>
                {data.plan?.outcomes.length ? (
                  <ol className="big-three-list">
                    {data.plan.outcomes.map((o, i) => (
                      <li key={i}>
                        <label>
                          <input
                            type="checkbox"
                            disabled={busy || !!data.plan?.closedAt}
                            checked={!!o.completedAt}
                            onChange={(e) => outcomeCheck(i, e.target.checked)}
                          />
                          <span>{o.outcome}</span>
                        </label>
                        {o.taskId && <a href={'/tasks?id=' + o.taskId}>Linked Task →</a>}
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="muted">
                    Choose up to three outcomes that would make today successful.
                  </p>
                )}
              </section>
            </div>
            <section className="daily-snapshot" aria-label="Recorded daily snapshot">
              <div>
                <strong>{data.snapshot.completedTasks}</strong>
                <span>Tasks completed</span>
              </div>
              <div>
                <strong>{Math.round(data.snapshot.focusSeconds / 60)}</strong>
                <span>Recorded Focus minutes</span>
              </div>
              <div>
                <strong>
                  {data.plan?.outcomes.filter((o) => o.completedAt).length ?? 0}/
                  {data.plan?.outcomes.length ?? 0}
                </strong>
                <span>Chosen outcomes complete</span>
              </div>
              <div>
                <strong>{Math.round(scheduledMinutes)}</strong>
                <span>Scheduled minutes</span>
              </div>
            </section>
          </>
        )}
        {(section === 'today' || section === 'schedule') && (
          <section className="execution-card" id="schedule">
            <div className="card-heading">
              <div>
                <p className="eyebrow">Protect your attention</p>
                <h2>Your timeline</h2>
              </div>
              <button
                className="button"
                disabled={busy}
                onClick={() => setEditor({ kind: 'schedule' })}
              >
                Add block
              </button>
            </div>
            {data.schedule.length ? (
              <ol className="timeline">
                {data.schedule.map((b) => (
                  <li key={b.id}>
                    <div className="timeline-time">
                      <time dateTime={b.startsAt}>{time(b.startsAt)}</time>
                      <span>— {time(b.endsAt)}</span>
                    </div>
                    <div>
                      <strong>{b.title}</strong>
                      <p className="muted">
                        {b.kind}
                        {wallTime(b.startsAt, data.timeZone).slice(0, 10) !== data.date
                          ? ' · starts ' + wallTime(b.startsAt, data.timeZone).slice(0, 10)
                          : ''}
                        {wallTime(b.endsAt, data.timeZone).slice(0, 10) !== data.date
                          ? ' · ends ' + wallTime(b.endsAt, data.timeZone).slice(0, 10)
                          : ''}
                      </p>
                      {b.taskId && <a href={'/tasks?id=' + b.taskId}>Open Task</a>}
                    </div>
                    <div className="execution-actions">
                      <button
                        className="button"
                        disabled={busy}
                        onClick={() => setEditor({ kind: 'schedule', record: b })}
                      >
                        Edit
                      </button>
                      <button
                        className="button"
                        disabled={busy}
                        onClick={() => {
                          if (confirm('Remove this time block? The linked Task is kept.'))
                            void action({
                              action: 'schedule',
                              requestId: uuid(),
                              id: b.id,
                              version: b.version,
                              title: b.title,
                              taskId: b.taskId,
                              startsAt: b.startsAt,
                              endsAt: b.endsAt,
                              kind: b.kind as 'task',
                              remove: true,
                            });
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="muted">
                Leave space, then protect time for the work that matters. Add your first block.
              </p>
            )}
            {data.limits.schedule && <p>Showing the first 100 blocks. Use a more focused day.</p>}
          </section>
        )}
        {(section === 'today' || section === 'focus') && (
          <section className="execution-card focus-card" id="focus">
            <div className="card-heading">
              <div>
                <p className="eyebrow">One objective. Undivided attention.</p>
                <h2>Focus</h2>
              </div>
              {!session && (
                <button
                  className="button button-primary"
                  disabled={busy}
                  onClick={() => setEditor({ kind: 'focus' })}
                >
                  Start Focus
                </button>
              )}
            </div>
            {session ? (
              <>
                <h3>{session.objective}</h3>
                <div className="focus-clock" role="timer" aria-label="Elapsed Focus time">
                  {String(Math.floor(elapsed / 60)).padStart(2, '0')}:
                  {String(elapsed % 60).padStart(2, '0')}
                </div>
                <p>
                  {session.resumedAt ? 'Running' : 'Paused'} ·{' '}
                  {Math.max(0, Math.ceil((session.plannedMinutes * 60 - elapsed) / 60))} minutes
                  remaining of {session.plannedMinutes}-minute intention
                  {elapsed >= session.plannedMinutes * 60
                    ? ' · Intention reached. Finish when ready.'
                    : ''}
                </p>
                {session.taskId && (
                  <a href={'/tasks?id=' + session.taskId}>Why this work matters →</a>
                )}
                {session.projectId && (
                  <a href={'/direction?resource=projects&id=' + session.projectId}>
                    Linked Project →
                  </a>
                )}
                <div className="execution-actions">
                  <button
                    className="button"
                    disabled={busy}
                    onClick={() =>
                      void action({
                        action: 'focus-control',
                        requestId: uuid(),
                        id: session.id,
                        version: session.version,
                        operation: session.resumedAt ? 'pause' : 'resume',
                        outcome: '',
                        notes: '',
                      })
                    }
                  >
                    {session.resumedAt ? 'Pause' : 'Resume'}
                  </button>
                  <button
                    className="button button-primary"
                    disabled={busy}
                    onClick={() => setEditor({ kind: 'focus-finish' })}
                  >
                    Finish Focus
                  </button>
                  <a className="button" href="/focus">
                    Focus mode
                  </a>
                </div>
              </>
            ) : (
              <p className="muted">
                Start with a clear objective. Your timer and linked work persist across reloads.
              </p>
            )}
            {section === 'focus' && data.focusHistory.length > 0 && (
              <details>
                <summary>Recorded sessions on {data.date}</summary>
                <ul>
                  {data.focusHistory.map((f) => (
                    <li key={f.id}>
                      {f.objective} · {Math.round(f.activeSeconds / 60)} minutes
                      {f.outcome && <p>{f.outcome}</p>}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </section>
        )}
        {(section === 'today' || section === 'routines') && (
          <section className="execution-card" id="routines">
            <div className="card-heading">
              <div>
                <p className="eyebrow">Steady practices</p>
                <h2>Routines</h2>
              </div>
              <button
                className="button"
                disabled={busy}
                onClick={() => setEditor({ kind: 'routine' })}
              >
                Add routine
              </button>
            </div>
            {data.routines.filter((r) => section === 'routines' || r.scheduled || r.completed)
              .length ? (
              <ul className="routine-list">
                {data.routines
                  .filter((r) => section === 'routines' || r.scheduled || r.completed)
                  .map((r) => (
                    <li key={r.id} id={'routine-' + r.id}>
                      <label>
                        <input
                          type="checkbox"
                          checked={r.completed}
                          disabled={busy || !r.scheduled}
                          onChange={(e) => routineCheck(r.id, e.target.checked)}
                        />
                        <span>
                          {r.title}
                          {r.archived && <small>Archived · completion preserved</small>}
                          {r.completionNotes && <small>{r.completionNotes}</small>}
                          {!r.scheduled && <small>Not scheduled on this day</small>}
                          {r.spiritual && <small>Reflective · never scored</small>}
                        </span>
                      </label>
                      <div className="execution-actions">
                        {r.completed && !r.archived && (
                          <button
                            className="button"
                            disabled={busy}
                            onClick={() => setEditor({ kind: 'routine-note', record: r })}
                          >
                            Day note
                          </button>
                        )}
                        <button
                          className="button"
                          disabled={busy || r.archived}
                          onClick={() => setEditor({ kind: 'routine', record: r })}
                        >
                          Edit
                        </button>
                        <button
                          className="button"
                          disabled={busy}
                          onClick={() => {
                            if (
                              confirm(
                                r.archived
                                  ? 'Restore this routine?'
                                  : 'Archive this routine? Past completions are kept.',
                              )
                            )
                              void action({
                                action: 'routine',
                                requestId: uuid(),
                                id: r.id,
                                version: r.version,
                                title: r.title,
                                days: r.days,
                                spiritual: r.spiritual,
                                notes: r.notes ?? '',
                                archived: !r.archived,
                              });
                          }}
                        >
                          {r.archived ? 'Restore' : 'Archive'}
                        </button>
                      </div>
                    </li>
                  ))}
              </ul>
            ) : (
              <p className="muted">
                No routines scheduled for this day. Add a simple practice you want to repeat.
              </p>
            )}
          </section>
        )}
        {section === 'today' && (
          <>
            <section className="execution-card">
              <p className="eyebrow">An explainable next step</p>
              <h2>Recommended next action</h2>
              <div className="recommendation-controls">
                <label>
                  Available minutes
                  <input
                    type="number"
                    min={1}
                    max={720}
                    value={minutes}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      if (n >= 1 && n <= 720) setMinutes(n);
                    }}
                  />
                </label>
                <label>
                  Current energy
                  <select value={energy} onChange={(e) => setEnergy(e.target.value)}>
                    {['low', 'medium', 'high'].map((x) => (
                      <option key={x}>{x}</option>
                    ))}
                  </select>
                </label>
              </div>
              {data.recommendations.length ? (
                <ul className="recommendation-list">
                  {data.recommendations.map((r) => {
                    const t = data.tasks.find((t) => t.id === r.id)!;
                    return (
                      <li key={r.id} id={'routine-' + r.id}>
                        <h3>
                          <a href={'/tasks?id=' + r.id}>{t.title}</a>
                        </h3>
                        <p>
                          {t.estimateMinutes} minutes · Priority heuristic {r.score}
                        </p>
                        <ul>
                          {r.reasons.map((reason) => (
                            <li key={reason}>{reason}</li>
                          ))}
                        </ul>
                        {!session && (
                          <button
                            className="button button-primary"
                            disabled={busy}
                            onClick={() =>
                              setEditor({
                                kind: 'focus',
                                taskId: t.id,
                                objective: t.title,
                                minutes: Math.min(720, t.estimateMinutes ?? 50),
                              })
                            }
                          >
                            Focus on Task
                          </button>
                        )}
                        <button
                          className="button"
                          disabled={busy}
                          onClick={() => void completeTask(t.id)}
                        >
                          Complete Task
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="muted">
                  No planned Task with a recorded estimate fits this window and energy. Plan a Task
                  or adjust your context.
                </p>
              )}
              <p className="muted">
                This transparent ranking is guidance. Reflective work is excluded.{' '}
                {data.limits.tasks
                  ? 'Ranking considers the first 200 Tasks by manual priority and deadline.'
                  : ''}
              </p>
            </section>
            {data.insights.length > 0 && (
              <section className="execution-card">
                <h2>Insights</h2>
                {data.insights.map((i) => (
                  <article key={i.title}>
                    <h3>{i.title}</h3>
                    <p>{i.explanation}</p>
                    <p className="muted">{i.action}</p>
                  </article>
                ))}
              </section>
            )}
            <div className="execution-grid">
              <section className="execution-card">
                <p className="eyebrow">Daily Scripture · KJV</p>
                <h2>
                  {data.content.scripture.book} {data.content.scripture.chapter}:
                  {data.content.scripture.verse}
                </h2>
                <blockquote>{data.content.scripture.text}</blockquote>
                <button
                  className="button"
                  disabled={busy}
                  onClick={() => void saveContent('scripture')}
                >
                  Save Scripture
                </button>
                <a href="/vault?kind=scripture">Saved Scripture →</a>
              </section>
              <section className="execution-card">
                <p className="eyebrow">Thought for Today</p>
                <blockquote>{data.content.thought.text}</blockquote>
                <p className="muted">Life OS · original thought</p>
                <button
                  className="button"
                  disabled={busy}
                  onClick={() => void saveContent('thought')}
                >
                  Save thought
                </button>
              </section>
            </div>
            {data.plan?.closedAt && (
              <section className="execution-card">
                <h2>Day reflection</h2>
                {Object.entries(data.plan.evening)
                  .filter(([, v]) => v)
                  .map(([k, v]) => (
                    <p key={k}>
                      <strong>{k}: </strong>
                      {v}
                    </p>
                  ))}
              </section>
            )}
          </>
        )}
        {section === 'vault' && (
          <section className="execution-card">
            <div className="card-heading">
              <div>
                <p className="eyebrow">Capture possibility. Protect the present.</p>
                <h2>Vault & Not Now</h2>
              </div>
              <button
                className="button button-primary"
                onClick={() => setEditor({ kind: 'vault' })}
              >
                Add Vault item
              </button>
            </div>
            <div className="execution-actions">
              <label>
                Collection
                <select value={kind} onChange={(e) => setKind(e.target.value)}>
                  <option value="">All collections</option>
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
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={archived}
                  onChange={(e) => setArchived(e.target.checked)}
                />
                Show archived
              </label>
            </div>
            {vault.length ? (
              <ul className="vault-list">
                {vault.map((v) => (
                  <li key={v.id} id={'vault-' + v.id}>
                    <p className="eyebrow">{v.kind.replace('_', ' ')}</p>
                    <h3>{v.title}</h3>
                    <p className="preserve-lines">{v.body}</p>
                    <div className="execution-actions">
                      <button
                        className="button"
                        disabled={busy}
                        onClick={() => setEditor({ kind: 'vault', record: v })}
                      >
                        Edit
                      </button>
                      {v.convertedGoalId ? (
                        <a href={'/direction?resource=goals&id=' + v.convertedGoalId}>
                          Converted Goal →
                        </a>
                      ) : v.convertedProjectId ? (
                        <a href={'/direction?resource=projects&id=' + v.convertedProjectId}>
                          Converted Project →
                        </a>
                      ) : v.convertedTaskId ? (
                        <a href={'/tasks?id=' + v.convertedTaskId}>Converted Task →</a>
                      ) : (
                        <button
                          className="button"
                          disabled={busy}
                          onClick={() => {
                            if (
                              confirm(
                                'Turn this idea into a planned Task and archive the Vault item?',
                              )
                            )
                              void action({
                                action: 'vault-task',
                                requestId: uuid(),
                                id: v.id,
                                version: v.version,
                                taskId: uuid(),
                              });
                          }}
                        >
                          Turn into Task
                        </button>
                      )}
                      {!v.convertedTaskId && !v.convertedGoalId && !v.convertedProjectId && (
                        <>
                          <button
                            className="button"
                            disabled={busy}
                            onClick={() => promoteVault(v, 'goal')}
                          >
                            Turn into Goal
                          </button>
                          <button
                            className="button"
                            disabled={busy}
                            onClick={() => promoteVault(v, 'project')}
                          >
                            Turn into Project
                          </button>
                        </>
                      )}
                      <button
                        className="button"
                        disabled={busy}
                        onClick={() => {
                          if (confirm(v.archived ? 'Restore this item?' : 'Archive this item?'))
                            void action({
                              action: 'vault',
                              requestId: uuid(),
                              id: v.id,
                              version: v.version,
                              title: v.title,
                              body: v.body,
                              kind: v.kind as 'idea',
                              archived: !v.archived,
                              sourceInboxId: v.sourceInboxId,
                            });
                        }}
                      >
                        {v.archived ? 'Restore' : 'Archive'}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">
                Keep an idea without making it a commitment. Not Now gives your current priorities
                room.
              </p>
            )}
            {next && (
              <button className="button" onClick={() => void moreVault()}>
                Load earlier items
              </button>
            )}
          </section>
        )}
        <section className="execution-card capture-card">
          <div>
            <p className="eyebrow">
              {section === 'focus' ? 'Later capture' : 'Capture first. Organize later.'}
            </p>
            <h2>{section === 'focus' ? 'Park a distraction' : 'Inbox'}</h2>
          </div>
          <label className="direction-field">
            What’s on your mind?
            <textarea
              rows={2}
              value={capture}
              maxLength={10000}
              onChange={(e) => setCapture(e.target.value)}
            />
          </label>
          <div className="execution-actions">
            <button
              className="button button-primary"
              disabled={busy || !capture.trim()}
              onClick={() => void saveCapture()}
            >
              Capture
            </button>
            <a href="/inbox">Process Inbox ({data.snapshot.inboxCount}) →</a>
          </div>
        </section>
        <footer className="muted">
          Online-first · Your drafts stay in memory. Save before leaving.
        </footer>
      </main>
      {editor && (
        <ExecutionForm
          key={editor.kind + ('record' in editor ? (editor.record?.id ?? 'new') : 'new')}
          editor={editor}
          data={data}
          onSave={mutate}
          onClose={closeEditor}
        />
      )}
    </div>
  );
}
