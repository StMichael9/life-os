'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Compass, ArrowUpRight, Flag, Layers3 } from 'lucide-react';
import { canonicalDecimal } from '@life-os/shared';
import type {
  Ancestor,
  Category,
  DirectionEntities,
  DirectionMeta,
  DirectionPage,
  DirectionResource,
  Goal,
  Milestone,
  Project,
  Season,
} from '@life-os/shared';
import { Button, Eyebrow, Panel } from '@life-os/ui';
import { postJson, requestJson, RequestFailed, type Profile } from './auth-client';
import {
  AllocationList,
  CategoryCreator,
  dateRange,
  DirectionEditor,
  directionLabels,
} from './direction-editor';
type Entity = DirectionEntities[DirectionResource];
type Pages = { [K in DirectionResource]: DirectionPage<DirectionEntities[K]> };
type Detail = { kind: DirectionResource; item: Entity; ancestors: Ancestor[] };
type Editor = {
  kind: DirectionResource;
  record: Entity | null;
  ancestors: Ancestor[];
  goalId?: string;
};
const emptyPages = (): Pages => ({
  seasons: { items: [], nextCursor: null },
  goals: { items: [], nextCursor: null },
  milestones: { items: [], nextCursor: null },
  projects: { items: [], nextCursor: null },
});
const resources: DirectionResource[] = ['seasons', 'goals', 'milestones', 'projects'];
const title = (item: Entity) => ('name' in item ? item.name : item.title);
export function Direction({
  initialResource = 'seasons',
  initialId,
}: {
  initialResource?: DirectionResource;
  initialId?: string | undefined;
}) {
  const [section, setSection] = useState<DirectionResource>(
    initialResource === 'milestones' ? 'goals' : initialResource,
  );
  const [profile, setProfile] = useState<Profile | null>(null);
  const [meta, setMeta] = useState<DirectionMeta | null>(null);
  const [pages, setPages] = useState<Pages>(emptyPages);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [goalMilestones, setGoalMilestones] = useState<DirectionPage<Milestone>>({
    items: [],
    nextCursor: null,
  });
  const [editor, setEditor] = useState<Editor | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [ended, setEnded] = useState(false);
  const [filter, setFilter] = useState('current');
  const identity = useRef<string | null>(null);
  const generation = useRef(0);
  const selectedGeneration = useRef(0);
  const refreshing = useRef(false);
  const inactive = useRef(false);
  const modalOpen = useRef(false);
  const selectedRef = useRef<{ kind: DirectionResource; id: string } | null>(null);
  const detailHeading = useRef<HTMLHeadingElement>(null);
  const fail = useCallback((error: unknown) => {
    if (error instanceof RequestFailed && error.status === 401) {
      inactive.current = true;
      generation.current++;
      selectedGeneration.current++;
      setProfile(null);
      setMeta(null);
      setPages(emptyPages());
      setDetail(null);
      setEditor(null);
      setGoalMilestones({ items: [], nextCursor: null });
      setEnded(true);
      setMessage('Your session ended or the account changed. Sign in again to continue.');
    } else
      setMessage(error instanceof Error ? error.message : 'Connection lost. Please try again.');
  }, []);
  const checkOwner = useCallback((ownerId: string) => {
    if (inactive.current || (identity.current && identity.current !== ownerId))
      throw new RequestFailed(401, 'The account changed.');
  }, []);
  const open = useCallback(
    async (kind: DirectionResource, id: string, focus = true) => {
      const selected = ++selectedGeneration.current;
      const current = generation.current;
      if (focus) {
        setDetailLoading(true);
        setMessage('');
      }
      try {
        const data = await requestJson<{ item: Entity; ancestors: Ancestor[]; ownerId: string }>(
          `/api/direction/${kind}/${id}`,
        );
        checkOwner(data.ownerId);
        const children =
          kind === 'goals'
            ? await requestJson<DirectionPage<Milestone> & { ownerId: string }>(
                `/api/direction/milestones?goalId=${id}`,
              )
            : null;
        if (children) checkOwner(children.ownerId);
        if (current !== generation.current || selected !== selectedGeneration.current) return;
        selectedRef.current = { kind, id };
        setDetail({ kind, item: data.item, ancestors: data.ancestors });
        setGoalMilestones(children ?? { items: [], nextCursor: null });
        if (focus) {
          window.history.replaceState(null, '', `/direction?view=${kind}&id=${id}`);
          setTimeout(() => detailHeading.current?.focus(), 0);
        }
      } catch (error) {
        if (current === generation.current && selected === selectedGeneration.current) fail(error);
      } finally {
        if (selected === selectedGeneration.current) setDetailLoading(false);
      }
    },
    [checkOwner, fail],
  );
  const refresh = useCallback(async () => {
    if (inactive.current || refreshing.current || modalOpen.current) return;
    refreshing.current = true;
    const current = generation.current;
    try {
      const { profile: user } = await requestJson<{ profile: Profile }>('/api/auth/session');
      checkOwner(user.id);
      identity.current = user.id;
      await postJson('/api/auth/refresh', {});
      const [metadata, ...lists] = await Promise.all([
        requestJson<DirectionMeta & { ownerId: string }>('/api/direction'),
        ...resources.map((kind) =>
          requestJson<DirectionPage<Entity> & { ownerId: string }>(`/api/direction/${kind}`),
        ),
      ]);
      const context = metadata as DirectionMeta & { ownerId: string };
      checkOwner(context.ownerId);
      for (const list of lists) checkOwner(list.ownerId);
      if (current !== generation.current) return;
      setProfile(user);
      setMeta(context);
      setPages({
        seasons: lists[0] as DirectionPage<Season>,
        goals: lists[1] as DirectionPage<Goal>,
        milestones: lists[2] as DirectionPage<Milestone>,
        projects: lists[3] as DirectionPage<Project>,
      });
      if (selectedRef.current && !modalOpen.current)
        await open(selectedRef.current.kind, selectedRef.current.id, false);
    } catch (error) {
      if (current === generation.current) fail(error);
    } finally {
      refreshing.current = false;
      setLoading(false);
    }
  }, [checkOwner, fail, open]);
  useEffect(() => {
    let disposed = false;
    const start = setTimeout(
      () =>
        void refresh().then(() => {
          if (!disposed && initialId && !inactive.current) void open(initialResource, initialId);
        }),
      0,
    );
    const foreground = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    window.addEventListener('focus', foreground);
    document.addEventListener('visibilitychange', foreground);
    const timer = setInterval(foreground, 60_000);
    return () => {
      disposed = true;
      clearTimeout(start);
      clearInterval(timer);
      window.removeEventListener('focus', foreground);
      document.removeEventListener('visibilitychange', foreground);
    };
  }, [refresh, open, initialId, initialResource]);
  useEffect(() => {
    modalOpen.current = !!editor;
  }, [editor]);
  async function mutate<T>(path: string, body: unknown, method: 'POST' | 'PATCH' = 'POST') {
    const current = generation.current;
    try {
      const { profile: user } = await requestJson<{ profile: Profile }>('/api/auth/session');
      checkOwner(user.id);
      const result = await postJson<T>(path, body, method, user.id);
      if (current !== generation.current) throw new RequestFailed(401, 'The account changed.');
      return result;
    } catch (error) {
      fail(error);
      throw error;
    }
  }
  async function vision(title: string, id: string) {
    const result = await mutate<{ item: { id: string; title: string } }>('/api/direction/visions', {
      id,
      title,
      description: null,
    });
    setMeta((prev) =>
      prev ? { ...prev, visions: [...prev.visions.filter((v) => v.id !== id), result.item] } : null,
    );
  }
  async function category(name: string, spiritual: boolean, id: string) {
    const result = await mutate<{ item: Category }>('/api/direction/categories', {
      name,
      spiritual,
      id,
    });
    setMeta((previous) =>
      previous
        ? {
            ...previous,
            categories: [
              ...previous.categories.filter((c) => c.id !== result.item.id),
              result.item,
            ].sort((a, b) => a.name.localeCompare(b.name)),
          }
        : null,
    );
  }
  async function more(kind: DirectionResource) {
    const cursor = pages[kind].nextCursor;
    if (!cursor) return;
    const data = await requestJson<DirectionPage<Entity> & { ownerId: string }>(
      `/api/direction/${kind}?before=${cursor}`,
    );
    checkOwner(data.ownerId);
    setPages((previous) => ({
      ...previous,
      [kind]: {
        items: [
          ...previous[kind].items,
          ...data.items.filter((item) => !previous[kind].items.some((old) => old.id === item.id)),
        ],
        nextCursor: data.nextCursor,
      },
    }));
  }
  async function save(body: unknown) {
    if (!editor) return;
    const { kind, record } = editor;
    const result = await mutate<{ item: Entity }>(
      `/api/direction/${kind}${record ? `/${record.id}` : ''}`,
      body,
      record ? 'PATCH' : 'POST',
    );
    modalOpen.current = false;
    setEditor(null);
    setMessage(`${directionLabels[kind]} saved.`);
    await refresh();
    await open(kind, result.item.id);
  }
  async function activate(season: Season) {
    if (busy) return;
    if (
      meta?.activeSeason &&
      meta.activeSeason.id !== season.id &&
      !window.confirm('Make this your active Season? The current Season will move back to planned.')
    )
      return;
    setBusy(true);
    try {
      await mutate(`/api/direction/seasons/${season.id}/activate`, { version: season.version });
      await refresh();
      await open('seasons', season.id);
    } catch {
      /* error feedback is handled by mutate */
    } finally {
      setBusy(false);
    }
  }
  async function milestoneComplete(milestone: Milestone) {
    if (busy) return;
    setBusy(true);
    try {
      await mutate(
        `/api/direction/milestones/${milestone.id}`,
        {
          id: milestone.id,
          version: milestone.version,
          title: milestone.title,
          goalId: milestone.goalId,
          targetDate: milestone.targetDate,
          completed: !milestone.completedAt,
        },
        'PATCH',
      );
      await refresh();
      await open('goals', milestone.goalId);
    } catch {
      /* keep current data and show the mutation failure */
    } finally {
      setBusy(false);
    }
  }
  async function moreChildren() {
    if (!detail || !goalMilestones.nextCursor) return;
    const selection = selectedGeneration.current;
    const currentGeneration = generation.current;
    try {
      const data = await requestJson<DirectionPage<Milestone> & { ownerId: string }>(
        `/api/direction/milestones?goalId=${detail.item.id}&before=${goalMilestones.nextCursor}`,
      );
      checkOwner(data.ownerId);
      if (selection !== selectedGeneration.current || currentGeneration !== generation.current)
        return;
      setGoalMilestones((previous) => ({
        items: [
          ...previous.items,
          ...data.items.filter((item) => !previous.items.some((old) => old.id === item.id)),
        ],
        nextCursor: data.nextCursor,
      }));
    } catch (error) {
      fail(error);
    }
  }
  async function logout() {
    if (busy) return;
    setBusy(true);
    inactive.current = true;
    generation.current++;
    try {
      await postJson('/api/auth/logout', {});
      window.location.replace('/login');
    } catch (error) {
      inactive.current = false;
      fail(error);
    } finally {
      setBusy(false);
    }
  }
  function sectionSelect(kind: DirectionResource) {
    setSection(kind);
    setFilter('current');
    selectedGeneration.current++;
    setDetail(null);
    selectedRef.current = null;
    setDetailLoading(false);
    window.history.replaceState(null, '', `/direction?view=${kind}`);
  }
  const visible = pages[section].items.filter(
    (item) =>
      filter === 'all' || !('status' in item) || !['archived', 'completed'].includes(item.status),
  );
  const active = meta?.activeSeason;
  const current = detail?.item;
  const areaName = (id: string | null) => meta?.categories.find((c) => c.id === id)?.name;
  return (
    <main className="direction-page" id="direction-main">
      <a className="skip-link" href="#direction-content">
        Skip to Direction
      </a>
      <header className="private-topbar">
        <a className="auth-brand" href="/">
          LIFE OS
        </a>
        <nav aria-label="Workspace navigation">
          <a href="/">Today</a>
          <a href="/inbox">Inbox</a>
          <a href="/tasks">Tasks</a>
          <a href="/direction" aria-current="page">
            Direction
          </a>
        </nav>
        {profile && (
          <div className="private-account">
            <span>{profile.displayName}</span>
            <Button onClick={() => void logout()} disabled={busy}>
              Sign out
            </Button>
          </div>
        )}
      </header>
      <div className="direction-intro" id="direction-content">
        <Eyebrow>DIRECTION / DELIBERATE LIVING</Eyebrow>
        <h1>
          Give your effort a direction<span>.</span>
        </h1>
        <p>Choose the season. Name the outcome. Make the next step meaningful.</p>
      </div>
      <p className="form-message" role="status">
        {message}
      </p>
      {ended && (
        <Panel className="session-notice">
          <h2>Return to your workspace.</h2>
          <p>Private records have been cleared from this view.</p>
          <a href="/login?next=/direction">Sign in again</a>
        </Panel>
      )}
      {loading ? (
        <Panel className="direction-loading">
          <Compass size={28} />
          <p>Opening your Direction workspace…</p>
        </Panel>
      ) : !profile || !meta ? (
        !ended && (
          <Panel>
            <p>Your workspace could not be opened.</p>
            <Button onClick={() => void refresh()}>Try again</Button>
            <a href="/login?next=/direction">Go to sign in</a>
          </Panel>
        )
      ) : (
        <>
          <Panel className="active-direction" aria-labelledby="active-direction-title">
            <div>
              <Eyebrow>YOUR ACTIVE SEASON</Eyebrow>
              <h2 id="active-direction-title">
                {active?.name ?? 'A little clarity changes everything.'}
              </h2>
              <p className="active-objective">
                {active?.objective ??
                  'Give your attention a home. Create a Season around what matters in this part of your life.'}
              </p>
              {active && <p className="small-muted">{dateRange(active.startsOn, active.endsOn)}</p>}
              <Button
                onClick={() =>
                  active
                    ? void open('seasons', active.id)
                    : setEditor({ kind: 'seasons', record: null, ancestors: [] })
                }
              >
                {active ? 'View Season' : 'Create a Season'} <ArrowUpRight size={14} />
              </Button>
            </div>
            {active ? (
              <AllocationList allocations={active.allocations} />
            ) : (
              <Compass
                className="direction-emblem"
                size={80}
                strokeWidth={0.7}
                aria-hidden="true"
              />
            )}
          </Panel>
          <div className="direction-toolbar">
            <nav aria-label="Direction sections">
              {(['seasons', 'goals', 'projects'] as const).map((kind) => (
                <button
                  key={kind}
                  type="button"
                  aria-pressed={section === kind}
                  onClick={() => sectionSelect(kind)}
                >
                  {kind[0]!.toUpperCase() + kind.slice(1)}
                </button>
              ))}
            </nav>
            <Button
              variant="primary"
              onClick={() => setEditor({ kind: section, record: null, ancestors: [] })}
            >
              New {directionLabels[section]}
            </Button>
          </div>
          <div className="direction-workspace">
            <section className="direction-list" aria-label={`${directionLabels[section]} list`}>
              <div className="list-tools">
                <h2>{section[0]!.toUpperCase() + section.slice(1)}</h2>
                <label>
                  <span className="sr-only">Show records</span>
                  <select value={filter} onChange={(e) => setFilter(e.target.value)}>
                    <option value="current">Current</option>
                    <option value="all">All records</option>
                  </select>
                </label>
                <Button variant="quiet" onClick={() => void refresh()} disabled={busy}>
                  Refresh
                </Button>
              </div>
              {!visible.length && (
                <div className="direction-empty">
                  <Flag size={30} strokeWidth={1} />
                  <h3>
                    {pages[section].items.length
                      ? 'A chapter well kept.'
                      : `Your first ${directionLabels[section].toLowerCase()} starts with intention.`}
                  </h3>
                  <p>
                    {pages[section].items.length
                      ? 'Include completed and archived records to revisit earlier direction.'
                      : section === 'seasons'
                        ? 'Choose a primary objective and a deliberate allocation of your attention.'
                        : section === 'goals'
                          ? 'Name an outcome worth working toward. Milestones give it shape.'
                          : 'A project is a focused piece of work that moves a Goal or Milestone forward.'}
                  </p>
                  <Button onClick={() => setEditor({ kind: section, record: null, ancestors: [] })}>
                    Create {directionLabels[section]}
                  </Button>
                </div>
              )}
              <ul className="direction-records">
                {visible.map((item) => (
                  <li key={item.id}>
                    <button
                      className={
                        detail?.item.id === item.id ? 'direction-row selected' : 'direction-row'
                      }
                      onClick={() => void open(section, item.id)}
                    >
                      <div>
                        <span className="record-status">
                          {'status' in item ? item.status : 'milestone'}
                        </span>
                        <h3>{title(item)}</h3>
                        {'objective' in item ? (
                          <p>{item.objective}</p>
                        ) : 'description' in item && item.description ? (
                          <p>{item.description}</p>
                        ) : null}
                        <span className="small-muted">
                          {'startsOn' in item
                            ? dateRange(
                                item.startsOn,
                                'endsOn' in item ? item.endsOn : item.targetDate,
                              )
                            : 'targetDate' in item
                              ? dateRange(null, item.targetDate)
                              : ''}
                        </span>
                      </div>
                      <ArrowUpRight size={18} aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
              {pages[section].nextCursor && (
                <Button onClick={() => void more(section).catch(fail)}>
                  Load earlier {section}
                </Button>
              )}
            </section>
            <Panel className="direction-detail" aria-labelledby="detail-heading">
              {detailLoading ? (
                <p>Opening the details…</p>
              ) : current && detail ? (
                <>
                  <div className="detail-top">
                    <Eyebrow>
                      {directionLabels[detail.kind].toUpperCase()} /{' '}
                      {'status' in current ? current.status.toUpperCase() : 'MILESTONE'}
                    </Eyebrow>
                    <Button
                      onClick={() =>
                        setEditor({
                          kind: detail.kind,
                          record: current,
                          ancestors: detail.ancestors,
                        })
                      }
                    >
                      Edit {directionLabels[detail.kind]}
                    </Button>
                  </div>
                  {!!detail.ancestors.length && (
                    <nav aria-label="Goal hierarchy" className="hierarchy-chain">
                      {detail.ancestors.map((parent) => (
                        <span key={parent.id}>
                          {parent.kind === 'vision' ? (
                            <span>{parent.title}</span>
                          ) : (
                            <a
                              href={`/direction?view=${parent.kind}s&id=${parent.id}`}
                              onClick={(e) => {
                                e.preventDefault();
                                setSection('goals');
                                void open(
                                  parent.kind === 'goal' ? 'goals' : 'milestones',
                                  parent.id,
                                );
                              }}
                            >
                              {parent.title}
                            </a>
                          )}
                          <span aria-hidden="true"> → </span>
                        </span>
                      ))}
                      <span>{title(current)}</span>
                    </nav>
                  )}
                  <h2 id="detail-heading" ref={detailHeading} tabIndex={-1}>
                    {title(current)}
                  </h2>
                  {(detail.kind === 'goals' || detail.kind === 'projects') && (
                    <a
                      className="direction-task-link"
                      href={`/tasks?${detail.kind === 'goals' ? 'goalId' : 'projectId'}=${current.id}`}
                    >
                      View directly linked Tasks
                    </a>
                  )}
                  {'objective' in current && (
                    <>
                      <Eyebrow>PRIMARY OBJECTIVE</Eyebrow>
                      <p className="detail-objective">{current.objective}</p>
                      <p className="small-muted">{dateRange(current.startsOn, current.endsOn)}</p>
                      {current.description && (
                        <p className="private-prose">{current.description}</p>
                      )}
                      <h3>Success criteria</h3>
                      <p className="private-prose">
                        {current.successCriteria ||
                          'Add the evidence that would make this Season successful.'}
                      </p>
                      <h3>Allocation strategy</h3>
                      <AllocationList allocations={current.allocations} />
                      {current.status !== 'active' && (
                        <Button onClick={() => void activate(current)} disabled={busy}>
                          Make active Season
                        </Button>
                      )}
                    </>
                  )}
                  {'title' in current && (
                    <>
                      {'notes' in current &&
                        current.notes?.startsWith(
                          'Full source context is preserved in Vault item ',
                        ) && (
                          <a
                            href={
                              '/vault?id=' +
                              current.notes.slice(
                                'Full source context is preserved in Vault item '.length,
                              )
                            }
                          >
                            Original Vault context →
                          </a>
                        )}
                      {'description' in current && current.description && (
                        <p className="private-prose">{current.description}</p>
                      )}
                      <dl className="direction-facts">
                        {'categoryId' in current && current.categoryId && (
                          <div>
                            <dt>Category</dt>
                            <dd>{areaName(current.categoryId) ?? 'Owned category'}</dd>
                          </div>
                        )}
                        {'taskProgress' in current && current.taskProgress && (
                          <div>
                            <dt>Linked Task progress</dt>
                            <dd>
                              {current.taskProgress.completed} of {current.taskProgress.total}{' '}
                              completed (cancelled Tasks excluded)
                            </dd>
                          </div>
                        )}
                        {'priority' in current && (
                          <div>
                            <dt>Priority</dt>
                            <dd>{current.priority} of 5</dd>
                          </div>
                        )}
                        {'targetDate' in current && current.targetDate && (
                          <div>
                            <dt>Target date</dt>
                            <dd>{dateRange(null, current.targetDate)}</dd>
                          </div>
                        )}
                        {'startsOn' in current && current.startsOn && (
                          <div>
                            <dt>Start date</dt>
                            <dd>{dateRange(current.startsOn, null)}</dd>
                          </div>
                        )}
                        {'completedAt' in current && (
                          <div>
                            <dt>Milestone</dt>
                            <dd>{current.completedAt ? 'Completed' : 'Open'}</dd>
                          </div>
                        )}
                      </dl>
                      {'targetValue' in current && current.targetValue !== null && (
                        <div className="measurement-display">
                          <Eyebrow>MEASURABLE OUTCOME</Eyebrow>
                          <p>
                            <strong>{canonicalDecimal(current.currentValue)}</strong> /{' '}
                            {canonicalDecimal(current.targetValue)} {current.unit}
                          </p>
                        </div>
                      )}
                      {'notes' in current && current.notes && (
                        <>
                          <h3>Notes</h3>
                          <p className="private-prose">{current.notes}</p>
                        </>
                      )}
                      {detail.kind === 'projects' && !detail.ancestors.length && (
                        <p className="quiet-note">
                          Independent project. Connect it to a Goal or Milestone when that
                          relationship becomes clear.
                        </p>
                      )}
                    </>
                  )}
                  {detail.kind === 'goals' && (
                    <section className="milestone-section" aria-labelledby="milestone-heading">
                      <div className="panel-heading">
                        <h3 id="milestone-heading">Milestones</h3>
                        <Button
                          onClick={() =>
                            setEditor({
                              kind: 'milestones',
                              record: null,
                              ancestors: [{ kind: 'goal', id: current.id, title: title(current) }],
                              goalId: current.id,
                            })
                          }
                        >
                          Add Milestone
                        </Button>
                      </div>
                      {!goalMilestones.items.length && (
                        <p className="quiet-note">Give this Goal a few meaningful checkpoints.</p>
                      )}
                      <ul className="milestone-list">
                        {goalMilestones.items.map((m) => (
                          <li key={m.id}>
                            <div>
                              <button
                                className="milestone-title"
                                onClick={() => void open('milestones', m.id)}
                              >
                                {m.title}
                              </button>
                              <span className="small-muted">
                                {m.completedAt
                                  ? 'Completed'
                                  : m.targetDate
                                    ? dateRange(null, m.targetDate)
                                    : 'No target date'}
                              </span>
                            </div>
                            <Button onClick={() => void milestoneComplete(m)} disabled={busy}>
                              {m.completedAt ? 'Reopen' : 'Complete'}
                            </Button>
                            <Button
                              variant="quiet"
                              onClick={() =>
                                setEditor({
                                  kind: 'milestones',
                                  record: m,
                                  ancestors: [
                                    { kind: 'goal', id: current.id, title: title(current) },
                                  ],
                                })
                              }
                            >
                              Edit
                            </Button>
                          </li>
                        ))}
                      </ul>
                      {goalMilestones.nextCursor && (
                        <Button onClick={() => void moreChildren()}>Load earlier Milestones</Button>
                      )}
                    </section>
                  )}
                </>
              ) : (
                <div className="detail-placeholder">
                  <Layers3 size={36} strokeWidth={1} />
                  <h2 id="detail-heading">Keep the why in view.</h2>
                  <p>
                    Choose a record to see its intention, details and place in the bigger picture.
                  </p>
                </div>
              )}
            </Panel>
          </div>
          <details className="workspace-categories">
            <summary>
              Your categories <span>{meta.categories.length} areas of focus</span>
            </summary>
            <ul>
              {meta.categories.map((c) => (
                <li key={c.id}>
                  {c.name}
                  {c.spiritual && <span>Faith / reflection</span>}
                </li>
              ))}
            </ul>
            <CategoryCreator onCreate={category} />
          </details>
        </>
      )}
      {editor && meta && (
        <DirectionEditor
          key={`${editor.kind}:${editor.record?.id ?? 'new'}`}
          resource={editor.kind}
          record={editor.record}
          ancestors={editor.ancestors}
          goalId={editor.goalId}
          meta={meta}
          goals={pages.goals.items}
          milestones={pages.milestones.items}
          onSave={save}
          onClose={() => setEditor(null)}
          onCategory={category}
          onVision={vision}
          onMoreGoals={pages.goals.nextCursor ? () => more('goals') : undefined}
          onMoreMilestones={pages.milestones.nextCursor ? () => more('milestones') : undefined}
        />
      )}
    </main>
  );
}
