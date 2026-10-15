'use client';
import { PageHeading, ActionMenu, MenuItem, EmptyState, LoadingState } from '@life-os/ui';
import { WorkspaceShell } from './workspace-shell';
import { WorkTracker } from './work-tracker';
import { WorkTimeEditor } from './work-time-editor';
import { WorkCalendar } from './calendar';
import { WorkBlockWorkspace } from './work-block-workspace';
import { FocusWorkspace } from './focus-workspace';
import { useCallback, useEffect, useRef, useState } from 'react';
import { executionQuerySchema } from '@life-os/validation';
import type { ExecutionCommand } from '@life-os/validation';
import { emptyReflection } from '@life-os/shared';
import type {
  ExecutionSnapshot,
  VaultItem,
  ScheduleBlock,
  FocusSession,
  WorkSessionDetail,
} from '@life-os/shared';
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
  const [workReview, setWorkReview] = useState<{ id: string | null } | null>(null);
  const [reviewRunning, setReviewRunning] = useState<string | null>(null);
  const restored = useRef(false);
  const hiddenAt = useRef<number | null>(null);
  const clockAnchor = useRef({ server: 0, monotonic: 0 });
  const [data, setData] = useState<ExecutionSnapshot | null>(null),
    [profile, setProfile] = useState<Profile | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [focusSettling, setFocusSettling] = useState(false),
    [loading, setLoading] = useState(true);
  const [date, setDate] = useState(''),
    [loadedDate, setLoadedDate] = useState<string | null>(null),
    [minutes, setMinutes] = useState(90),
    [energy, setEnergy] = useState('medium'),
    [editor, setEditor] = useState<ExecutionEditor | null>(null);
  const [calendarDays, setCalendarDays] = useState<1 | 7>(1),
    [loadedDays, setLoadedDays] = useState(1),
    [block, setBlock] = useState<ScheduleBlock | null>(null);
  const [selectedFocusId, setSelectedFocusId] = useState<string | null>(() => {
      if (typeof window === 'undefined') return null;
      const value = new URLSearchParams(window.location.search).get('focus');
      return value && executionQuerySchema.safeParse({ focusId: value }).success ? value : null;
    }),
    [sessions, setSessions] = useState<FocusSession[]>([]),
    [focusNext, setFocusNext] = useState<string | null>(null);
  useEffect(() => {
    const url = new URL(location.href);
    if (selectedFocusId) url.searchParams.set('focus', selectedFocusId);
    else url.searchParams.delete('focus');
    if (url.href !== location.href) history.replaceState(null, '', url.href);
  }, [selectedFocusId]);
  const focusStartRetry = useRef<{ body: string; id: string; requestId: string } | null>(null);
  const dayReady = data !== null && loadedDate === date && loadedDays === calendarDays;
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
  const pendingFocus = useRef<{ id: string; version: number; finish: boolean } | null>(null);
  function forget() {
    generation.current++;
    account.current = null;
    setData(null);
    setWorkReview(null);
    setReviewRunning(null);
    restored.current = false;
    setLoadedDate(null);
    pendingFocus.current = null;
    setFocusSettling(false);
    setProfile(null);
    setVault([]);
    setEditor(null);
    setBlock(null);
    setSelectedFocusId(null);
    setSessions([]);
    setFocusNext(null);
    focusStartRetry.current = null;
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
        calendarDays: String(calendarDays),
        ...(selectedFocusId ? { focusId: selectedFocusId } : {}),
        availableMinutes: String(minutes),
        energy,
        ...(date ? { date } : {}),
      });
      const snapshot = await requestJson<ExecutionSnapshot>('/api/execution/today?' + query);
      if (epoch !== generation.current || snapshot.ownerId !== account.current) return;
      if (
        pendingFocus.current &&
        (((pendingFocus.current.finish || selectedFocusId === pendingFocus.current.id) &&
          !snapshot.focusSessions.some((s) => s.id === pendingFocus.current!.id)) ||
          snapshot.focusSessions.some(
            (s) => s.id === pendingFocus.current!.id && s.version > pendingFocus.current!.version,
          ))
      ) {
        pendingFocus.current = null;
        setFocusSettling(false);
      }
      if (!restored.current) {
        restored.current = true;
        setReviewRunning(snapshot.focusSessions.find((s) => s.resumedAt)?.id ?? null);
      }
      clockAnchor.current = {
        server: Date.parse(snapshot.serverNow),
        monotonic: performance.now(),
      };
      setClock(Date.parse(snapshot.serverNow));
      setData(snapshot);
      setSessions(snapshot.focusSessions);
      setFocusNext(snapshot.focusNext);
      if (selectedFocusId && !snapshot.focusSessions.some((s) => s.id === selectedFocusId))
        setSelectedFocusId((current) => (current === selectedFocusId ? null : current));
      setLoadedDate(date);
      setLoadedDays(calendarDays);
      setBlock((current) =>
        current ? (snapshot.schedule.find((b) => b.id === current.id) ?? null) : null,
      );
      setClockOffset(0);
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
  }, [date, calendarDays, minutes, energy, section, kind, archived, selectedFocusId]);
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
      if (section === 'focus' && params.get('start') === '1') setEditor({ kind: 'focus' });
      if (section === 'vault' && params.get('kind')) setKind(params.get('kind')!);
    }, 0);
    return () => clearTimeout(timer);
  }, [data, section]);
  useEffect(() => {
    editing.current = !!editor || !!workReview;
  }, [editor, workReview]);
  useEffect(() => {
    const tick = setInterval(
      () =>
        setClock(clockAnchor.current.server + performance.now() - clockAnchor.current.monotonic),
      1000,
    );
    const refresh = () => {
      if (document.visibilityState === 'visible') void currentRefresh.current();
    };
    const timer = setInterval(refresh, 60000);
    window.addEventListener('focus', refresh);
    const visibility = () => {
      if (document.visibilityState === 'hidden') hiddenAt.current = performance.now();
      else {
        if (hiddenAt.current !== null && performance.now() - hiddenAt.current > 300000)
          restored.current = false;
        hiddenAt.current = null;
        refresh();
      }
    };
    document.addEventListener('visibilitychange', visibility);
    return () => {
      clearInterval(tick);
      clearInterval(timer);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', visibility);
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
    if (
      ['plan', 'schedule', 'schedule-series', 'routine-check'].includes(command.action) &&
      !dayReady
    )
      throw new Error('Wait for the selected day to load before saving.');
    if (mutating.current) throw new Error('Wait for the previous save to finish.');
    if (
      ['focus-control', 'focus-start', 'focus-notes', 'work-adjust'].includes(command.action) &&
      pendingFocus.current
    )
      throw new Error('Wait for the saved Focus state to load before changing it again.');
    mutating.current = true;
    setBusy(true);
    if (
      command.action === 'focus-control' ||
      command.action === 'focus-start' ||
      command.action === 'focus-notes' ||
      command.action === 'work-adjust'
    ) {
      pendingFocus.current = {
        id: command.id,
        version: command.action === 'focus-start' ? 0 : command.version,
        finish:
          (command.action === 'focus-control' && command.operation === 'finish') ||
          (command.action === 'work-adjust' &&
            (command.operation === 'discard' || !sessions.some((s) => s.id === command.id))),
      };
      setFocusSettling(true);
    }
    try {
      const owner = await checkAccount();
      await postJson('/api/execution', command, 'POST', owner);
      if (
        command.action === 'focus-start' ||
        (command.action === 'focus-control' && command.operation === 'finish')
      )
        focusStartRetry.current = null;
      if (
        command.action === 'focus-start' ||
        command.action === 'focus-notes' ||
        (command.action === 'focus-control' && command.operation !== 'finish')
      )
        setSelectedFocusId(command.id);
      if (command.action === 'focus-control' && command.operation === 'finish')
        setSelectedFocusId(null);
      setMessage('Saved.');
    } catch (e) {
      if (
        command.action === 'focus-control' ||
        command.action === 'focus-start' ||
        command.action === 'focus-notes' ||
        command.action === 'work-adjust'
      ) {
        pendingFocus.current = null;
        setFocusSettling(false);
      }
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
  async function startBlockFocus(
    b: ScheduleBlock,
    timerMode: 'countdown' | 'stopwatch' = 'countdown',
  ) {
    if (!dayReady || busy || focusSettling) return;
    const fields = {
      objective: b.objective || b.title,
      timerMode,
      notes: '',
      taskId: b.taskId,
      projectId: b.projectId,
      categoryId: b.categoryId,
      plannedMinutes: Math.min(
        720,
        Math.max(1, Math.ceil((Date.parse(b.endsAt) - Date.parse(b.startsAt)) / 60000)),
      ),
    };
    const body = JSON.stringify(fields);
    if (!focusStartRetry.current || focusStartRetry.current.body !== body)
      focusStartRetry.current = { body, id: uuid(), requestId: uuid() };
    await action({
      action: 'focus-start',
      ...fields,
      id: focusStartRetry.current.id,
      requestId: focusStartRetry.current.requestId,
    });
  }
  function controlFocus(
    session: FocusSession,
    operation: 'pause' | 'resume' = session.resumedAt ? 'pause' : 'resume',
  ) {
    if (busy || focusSettling) return;
    void action({
      action: 'focus-control',
      requestId: uuid(),
      id: session.id,
      version: session.version,
      operation,
      completeTask: false,
      outcome: '',
      notes: '',
    });
  }
  async function prepareFinish(record: FocusSession) {
    if (mutating.current || pendingFocus.current) return;
    if (record.timerMode !== 'stopwatch' || !record.resumedAt) {
      setEditor({ kind: 'focus-finish', record });
      return;
    }
    try {
      // Stop actual-work recording at the click, before the accomplishment form.
      await mutate({
        action: 'focus-control',
        requestId: uuid(),
        id: record.id,
        version: record.version,
        operation: 'pause',
        completeTask: false,
        outcome: '',
        notes: '',
      });
      const d = await requestJson<WorkSessionDetail>('/api/execution/work-session/' + record.id);
      if (d.ownerId !== account.current) {
        forget();
        return;
      }
      if (d.session.resumedAt || d.session.endedAt)
        throw new Error('This session changed. Reload before finishing.');
      pendingFocus.current = null;
      setFocusSettling(false);
      setEditor({ kind: 'focus-finish', record: d.session });
    } catch (e) {
      pendingFocus.current = null;
      setFocusSettling(false);
      setError(e instanceof Error ? e.message : 'Could not pause before finishing.');
      void reload();
    }
  }
  function selectFocus(session: FocusSession) {
    if (busy || focusSettling) return;
    if (session.resumedAt) setSelectedFocusId(session.id);
    else controlFocus(session, 'resume');
  }
  async function moreFocus() {
    if (!focusNext || busy || focusSettling) return;
    const epoch = generation.current;
    setBusy(true);
    try {
      const result = await requestJson<{
        items: FocusSession[];
        next: string | null;
        ownerId: string;
      }>('/api/execution/focus?before=' + encodeURIComponent(focusNext));
      if (epoch !== generation.current || result.ownerId !== account.current) return;
      setSessions((prior) => [
        ...prior,
        ...result.items.filter((s) => !prior.some((p) => p.id === s.id)),
      ]);
      setFocusNext(result.next);
    } catch (error) {
      if (epoch === generation.current)
        setError(error instanceof Error ? error.message : 'Could not load saved sessions.');
    } finally {
      setBusy(false);
    }
  }
  function removeBlock(b: ScheduleBlock) {
    if (
      !dayReady ||
      !confirm(
        b.seriesId
          ? 'Skip only this occurrence? The recurring series and linked work are kept.'
          : 'Remove this work block? Linked work is kept.',
      )
    )
      return;
    setBlock(null);
    void action({
      action: 'schedule',
      requestId: uuid(),
      id: b.id,
      version: b.version,
      title: b.title,
      kind: b.kind as 'task',
      taskId: b.taskId,
      projectId: b.projectId,
      categoryId: b.categoryId,
      objective: b.objective,
      startsAt: b.startsAt,
      endsAt: b.endsAt,
      remove: true,
    });
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
    if (!data?.plan || busy || !dayReady) return;
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
    if (!data || busy || !dayReady) return;
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
    if (!data || !dayReady) return;
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
  const selectedTitle =
    section === 'today'
      ? 'Today'
      : section === 'vault'
        ? 'Vault & Not Now'
        : section === 'schedule'
          ? 'Calendar'
          : section === 'focus'
            ? 'Focus'
            : 'Routines';
  if (!data)
    return (
      <WorkspaceShell
        title={selectedTitle}
        active={section === 'today' ? 'today' : section === 'schedule' ? 'calendar' : 'more'}
      >
        <main id="main" className="execution-main">
          <PageHeading title={selectedTitle} />
          {loading ? (
            <LoadingState />
          ) : (
            <EmptyState
              title="Return to your workspace."
              action={
                <a
                  className="button button-primary"
                  href={
                    '/login?next=' + encodeURIComponent(section === 'today' ? '/' : '/' + section)
                  }
                >
                  Sign in
                </a>
              }
            >
              {error || 'Sign in to see your private records.'}
            </EmptyState>
          )}
        </main>
      </WorkspaceShell>
    );
  const session = selectedFocusId
    ? (sessions.find((s) => s.id === selectedFocusId) ?? null)
    : data.focus;
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
    <WorkspaceShell
      className={'execution-shell' + (section === 'focus' ? ' focused-workspace' : '')}
      title={selectedTitle}
      active={section === 'today' ? 'today' : section === 'schedule' ? 'calendar' : 'more'}
      actions={
        <>
          <span className="muted">{profile?.displayName}</span>
          <button className="button" disabled={busy} onClick={() => void logout()}>
            Sign out
          </button>
        </>
      }
    >
      <main id="main" className="execution-main">
        <PageHeading
          title={
            section === 'today'
              ? new Intl.DateTimeFormat('en-US', {
                  timeZone: 'UTC',
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric',
                }).format(new Date((date || data.date) + 'T12:00Z'))
              : selectedTitle
          }
          eyebrow={section === 'today' ? 'Today / A deliberate day' : 'Your workspace'}
          description={
            section === 'schedule'
              ? 'Protect time for what matters.'
              : section === 'focus'
                ? 'One intention in view. Every session saved.'
                : section === 'routines'
                  ? 'Small practices. A steady rhythm.'
                  : section === 'vault'
                    ? 'Keep the possibility. Release the pressure.'
                    : undefined
          }
          actions={
            <button className="button button-quiet" onClick={() => void reload()} disabled={busy}>
              Refresh
            </button>
          }
        />
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <p className="form-message" role="status">
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
            <time className="sr-only" dateTime={data.date}>
              {data.date}
            </time>
            {!dayReady && <span role="status">Loading selected day…</span>}
            <span className="muted">{data.timeZone}</span>
            {section === 'today' && (
              <span className="day-state">
                {data.plan?.closedAt
                  ? 'Day closed'
                  : data.plan?.startedAt
                    ? 'Day started'
                    : 'Ready to plan'}
              </span>
            )}
          </div>
        )}
        {section === 'today' && (
          <>
            {reviewRunning && sessions.some((s) => s.id === reviewRunning && s.resumedAt) && (
              <aside className="work-reconciliation" role="status">
                <p>
                  A timer was already running when you returned. It keeps counting outside Life OS;
                  review any break before relying on these totals.
                </p>
                <button
                  className="button"
                  disabled={busy || focusSettling}
                  onClick={() => setWorkReview({ id: reviewRunning })}
                >
                  Review running time
                </button>
              </aside>
            )}
            <section className="season-banner" aria-labelledby="season-heading">
              <p className="eyebrow">Active Season</p>
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
                    ? '/direction?view=seasons&id=' + data.activeSeason.id
                    : '/direction'
                }
              >
                {data.activeSeason ? 'View your Season' : 'Choose a Season'} →
              </a>
            </section>
            <WorkTracker
              data={data}
              sessions={sessions}
              now={clock + clockOffset}
              disabled={busy || focusSettling || !dayReady}
              onNew={() => setEditor({ kind: 'focus', timerMode: 'stopwatch' })}
              onControl={controlFocus}
              onSelect={selectFocus}
              onOpen={() => {
                const d = document.querySelector<HTMLDetailsElement>('#focus > details');
                if (d) {
                  d.open = true;
                  d.scrollIntoView({ behavior: 'instant', block: 'start' });
                }
              }}
              onReview={(id) => setWorkReview({ id })}
              onTarget={() => setWorkReview({ id: null })}
            />
            <div className="execution-grid">
              <section className="execution-card priority-card">
                <p className="eyebrow">If only one thing happens</p>
                <h2>The One Thing</h2>
                <p className="one-thing">
                  {data.plan?.oneThing ?? 'Choose one meaningful outcome.'}
                </p>
                <div className="execution-actions">
                  <button
                    className="button"
                    disabled={busy || !dayReady || !!data.plan?.closedAt}
                    onClick={() => setEditor({ kind: 'plan', workflow: 'save' })}
                  >
                    Edit priorities
                  </button>
                  {!data.plan?.startedAt && (
                    <button
                      className="button button-primary"
                      disabled={busy || !dayReady}
                      onClick={() => setEditor({ kind: 'plan', workflow: 'start' })}
                    >
                      Start Day
                    </button>
                  )}
                  {data.plan?.startedAt && !data.plan.closedAt && (
                    <button
                      className="button button-primary"
                      disabled={busy || !dayReady}
                      onClick={() => setEditor({ kind: 'plan', workflow: 'close' })}
                    >
                      Close Day
                    </button>
                  )}
                  {data.plan?.closedAt && (
                    <button
                      className="button"
                      disabled={busy || !dayReady}
                      onClick={() => {
                        if (confirm('Reopen this day for changes?'))
                          void action(planCommand('reopen'));
                      }}
                    >
                      Reopen Day
                    </button>
                  )}
                </div>
                {data.recommendations[0] && (
                  <a className="next-action" href={'/tasks?id=' + data.recommendations[0].id}>
                    <span>Recommended next</span>
                    {data.tasks.find((t) => t.id === data.recommendations[0]!.id)?.title}{' '}
                    <span aria-hidden="true">↗</span>
                  </a>
                )}
              </section>
              <section className="execution-card">
                <p className="eyebrow">Three meaningful outcomes</p>
                <h2>Today’s Big 3</h2>
                {data.plan?.outcomes.length ? (
                  <ol className="big-three-list">
                    {data.plan.outcomes.map((o, i) => (
                      <li key={i}>
                        <label>
                          <input
                            type="checkbox"
                            disabled={busy || !dayReady || !!data.plan?.closedAt}
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
          </>
        )}
        {(section === 'today' || section === 'schedule') && (
          <WorkCalendar
            data={data}
            selectedDate={date || data.date}
            days={calendarDays}
            now={clock + clockOffset}
            disabled={busy || !dayReady}
            onDate={setDate}
            onDays={setCalendarDays}
            onOpen={(b) => {
              setBlock(b);
              const matching = sessions.find(
                (s) =>
                  s.objective === (b.objective || b.title) &&
                  s.taskId === b.taskId &&
                  s.projectId === b.projectId,
              );
              if (matching) setSelectedFocusId(matching.id);
            }}
            onCreate={(day, instant) => {
              setEditor({ kind: 'schedule', date: day, ...(instant ? { startsAt: instant } : {}) });
            }}
          />
        )}
        {section === 'today' && (
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
        )}
        {((section === 'today' && sessions.length > 0) || section === 'focus') && (
          <section className="execution-card focus-card" id="focus">
            <details className="focus-disclosure" open={section === 'focus'}>
              <summary>
                Focus <span>{session?.objective ?? 'Saved intentions'}</span>
                <span className="session-status">
                  {session?.resumedAt ? 'Running' : 'Paused'} · {sessions.length} unfinished
                </span>
              </summary>
              <FocusWorkspace
                sessions={sessions}
                selected={session}
                now={clock + clockOffset}
                busy={busy}
                settling={focusSettling}
                objective={data.plan?.oneThing ?? null}
                next={focusNext}
                onMore={() => void moreFocus()}
                onNew={() => setEditor({ kind: 'focus' })}
                onSelect={selectFocus}
                onControl={controlFocus}
                onFinish={(record) => void prepareFinish(record)}
                onNotes={(record) => setEditor({ kind: 'focus-notes', record })}
                onReview={(record) => setWorkReview({ id: record.id })}
              />
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
            </details>
          </section>
        )}
        {(section === 'today' || section === 'routines') && (
          <details
            className="execution-card compact-details"
            id="routines"
            open={section === 'routines'}
          >
            <summary>
              Routines · {data.routines.filter((r) => r.completed).length} completed
            </summary>
            <section>
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
                            disabled={busy || !dayReady || !r.scheduled}
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
                              disabled={busy || !dayReady}
                              onClick={() => setEditor({ kind: 'routine-note', record: r })}
                            >
                              Day note
                            </button>
                          )}
                          <ActionMenu label={'Actions for ' + r.title} disabled={busy}>
                            <MenuItem>
                              <button
                                className="button"
                                disabled={busy || r.archived}
                                onClick={() => setEditor({ kind: 'routine', record: r })}
                              >
                                Edit
                              </button>
                            </MenuItem>
                            <MenuItem>
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
                            </MenuItem>
                          </ActionMenu>
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
          </details>
        )}
        {section === 'today' && (
          <>
            <details className="execution-card compact-details">
              <summary>Recommendations</summary>
              <section>
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
                          <details className="recommendation-reasons">
                            <summary>Why this Task?</summary>
                            <ul>
                              {r.reasons.map((reason) => (
                                <li key={reason}>{reason}</li>
                              ))}
                            </ul>
                          </details>
                          {
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
                          }
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
                    No planned Task with a recorded estimate fits this window and energy. Plan a
                    Task or adjust your context.
                  </p>
                )}
                <p className="muted">
                  This transparent ranking is guidance. Reflective work is excluded.{' '}
                  {data.limits.tasks
                    ? 'Ranking considers the first 200 Tasks by manual priority and deadline.'
                    : ''}
                </p>
              </section>
            </details>
            {data.insights.length > 0 && (
              <details className="execution-card compact-details">
                <summary>Insights · {data.insights.length}</summary>
                <section>
                  {data.insights.map((i) => (
                    <article key={i.title}>
                      <h3>{i.title}</h3>
                      <p>{i.explanation}</p>
                      <p className="muted">{i.action}</p>
                    </article>
                  ))}
                </section>
              </details>
            )}
            <div className="execution-grid daily-content-compact">
              <section className="execution-card">
                <p className="eyebrow">Daily Scripture · KJV</p>
                <h2>
                  {data.content.scripture.book} {data.content.scripture.chapter}:
                  {data.content.scripture.verse}
                </h2>
                <blockquote>{data.content.scripture.text}</blockquote>
                <button
                  className="button"
                  disabled={busy || !dayReady}
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
                  disabled={busy || !dayReady}
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
                <h2>Saved for later</h2>
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
                    {v.body && (
                      <details className="vault-body">
                        <summary>Context & notes</summary>
                        <p className="preserve-lines">{v.body}</p>
                      </details>
                    )}
                    <div className="execution-actions">
                      {v.convertedGoalId ? (
                        <a href={'/direction?view=goals&id=' + v.convertedGoalId}>
                          Converted Goal →
                        </a>
                      ) : v.convertedProjectId ? (
                        <a href={'/direction?view=projects&id=' + v.convertedProjectId}>
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
                      <ActionMenu label={'Actions for ' + v.title} disabled={busy}>
                        <MenuItem>
                          <button
                            className="button"
                            disabled={busy}
                            onClick={() => setEditor({ kind: 'vault', record: v })}
                          >
                            Edit
                          </button>
                        </MenuItem>
                        {!v.convertedTaskId && !v.convertedGoalId && !v.convertedProjectId && (
                          <>
                            <MenuItem>
                              <button
                                className="button"
                                disabled={busy}
                                onClick={() => promoteVault(v, 'goal')}
                              >
                                Turn into Goal
                              </button>
                            </MenuItem>
                            <MenuItem>
                              <button
                                className="button"
                                disabled={busy}
                                onClick={() => promoteVault(v, 'project')}
                              >
                                Turn into Project
                              </button>
                            </MenuItem>
                          </>
                        )}
                        <MenuItem>
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
                        </MenuItem>
                      </ActionMenu>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="Room for another season.">
                Save ideas and possibilities here without adding them to today’s commitments.
              </EmptyState>
            )}
            {next && (
              <button className="button" onClick={() => void moreVault()}>
                Load earlier items
              </button>
            )}
          </section>
        )}
        <details className="execution-card compact-details capture-section">
          <summary>{section === 'focus' ? 'Park a distraction' : 'Quick capture & Inbox'}</summary>
          <section className="capture-card">
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
        </details>
        <footer className="muted">Your drafts stay in memory. Save before leaving.</footer>
      </main>
      {workReview && profile && (
        <WorkTimeEditor
          key={workReview.id ?? 'target'}
          id={workReview.id}
          ownerId={profile.id}
          zone={data.timeZone}
          target={{ minutes: data.workTime.targetMinutes, version: data.workTime.targetVersion }}
          onClose={() => {
            editing.current = false;
            setWorkReview(null);
            void reload();
          }}
          onSave={async (c) => {
            await mutate(c);
            if (c.action === 'work-adjust' && c.id === reviewRunning) setReviewRunning(null);
          }}
        />
      )}

      {block && !editor && !workReview && (
        <WorkBlockWorkspace
          block={block}
          data={data}
          error={error}
          now={clock + clockOffset}
          busy={busy || focusSettling || !dayReady}
          onClose={() => setBlock(null)}
          onStart={(mode) => void startBlockFocus(block, mode)}
          sessions={sessions}
          selected={session}
          next={focusNext}
          onMore={() => void moreFocus()}
          onSelect={selectFocus}
          onControl={controlFocus}
          onFinish={(record) => void prepareFinish(record)}
          onNotes={(record) => setEditor({ kind: 'focus-notes', record })}
          onReview={(record) => setWorkReview({ id: record.id })}
          onNew={() => setEditor({ kind: 'focus' })}
          onEdit={() => setEditor({ kind: 'schedule', record: block })}
          onSeries={() => {
            const record = data.scheduleSeries.find((s) => s.id === block.seriesId);
            if (record) setEditor({ kind: 'schedule-series', record });
            else setError('Reload the calendar to edit this series.');
          }}
          onRemove={() => removeBlock(block)}
        />
      )}
      {editor && (
        <ExecutionForm
          key={editor.kind + ('record' in editor ? (editor.record?.id ?? 'new') : 'new')}
          editor={editor}
          data={data}
          onSave={mutate}
          onClose={closeEditor}
        />
      )}
    </WorkspaceShell>
  );
}
