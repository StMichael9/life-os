'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Eyebrow, Panel } from '@life-os/ui';
import {
  postJson,
  requestJson,
  RequestFailed,
  type Profile,
  type InboxItem,
  type Cursor,
} from './auth-client';

export function Inbox() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [items, setItems] = useState<InboxItem[]>([]);
  const [cursor, setCursor] = useState<Cursor | null>(null);
  const [draft, setDraft] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [signedOut, setSignedOut] = useState(false);
  const pending = useRef<{ body: string; requestId: string } | null>(null);
  const identity = useRef<string | null>(null);
  const generation = useRef(0);
  const leaving = useRef(false);
  const signedOutRef = useRef(false);
  const listLoading = useRef(false);
  const [uncertain, setUncertain] = useState(false);
  const fail = useCallback((error: unknown) => {
    if (error instanceof RequestFailed && error.status === 401) {
      signedOutRef.current = true;
      generation.current++;
      setItems([]);
      setProfile(null);
      setSignedOut(true);
      setMessage('Your session ended. Sign in again to continue.');
    } else {
      setMessage(error instanceof Error ? error.message : 'Connection lost. Please try again.');
    }
  }, []);
  const refresh = useCallback(async () => {
    if (leaving.current || signedOutRef.current || listLoading.current) return;
    listLoading.current = true;
    const activeGeneration = generation.current;
    try {
      const current = await requestJson<{ profile: Profile }>('/api/auth/session');
      if (leaving.current || generation.current !== activeGeneration) return;
      if (identity.current && identity.current !== current.profile.id) {
        // Cross-tab account switching must never submit an earlier user's draft.
        generation.current++;
        signedOutRef.current = true;
        setItems([]);
        setProfile(null);
        setSignedOut(true);
        setMessage(
          'The signed-in account changed. Reload to continue; your unsaved text is still below.',
        );
        return;
      }
      identity.current = current.profile.id;
      setProfile(current.profile);
      await postJson('/api/auth/refresh', {});
      const data = await requestJson<{
        items: InboxItem[];
        nextCursor: Cursor | null;
        ownerId: string;
      }>('/api/inbox');
      const target = new URLSearchParams(location.search).get('id');
      if (target) {
        const detail = await requestJson<{
          capture: InboxItem;
          processed: boolean;
          convertedTaskId: string | null;
          ownerId: string;
        }>('/api/tasks/from-inbox/' + encodeURIComponent(target));
        if (detail.ownerId !== identity.current) throw new RequestFailed(401, 'Account changed.');
        data.items = [
          {
            ...detail.capture,
            processed: detail.processed,
            convertedTaskId: detail.convertedTaskId,
          },
          ...data.items.filter((i) => i.id !== target),
        ];
      }
      if (data.ownerId !== identity.current)
        throw new RequestFailed(401, 'The account changed. Reload before continuing.');
      if (!leaving.current && generation.current === activeGeneration) {
        setItems(data.items);
        setCursor(data.nextCursor);
      }
    } catch (error) {
      if (!leaving.current && generation.current === activeGeneration) fail(error);
    } finally {
      listLoading.current = false;
      setLoading(false);
    }
  }, [fail]);
  useEffect(() => {
    const initial = setTimeout(() => void refresh(), 0);
    const foreground = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    window.addEventListener('focus', foreground);
    document.addEventListener('visibilitychange', foreground);
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, 60_000);
    return () => {
      clearTimeout(initial);
      clearInterval(timer);
      window.removeEventListener('focus', foreground);
      document.removeEventListener('visibilitychange', foreground);
    };
  }, [refresh]);
  async function capture(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !profile || signedOutRef.current) return;
    const body = draft.trim();
    if (!body) return;
    setBusy(true);
    setMessage('');
    const activeGeneration = generation.current;
    pending.current ??= { body, requestId: crypto.randomUUID() };
    try {
      // Confirm identity immediately before submission, including after a failed request.
      const current = await requestJson<{ profile: Profile }>('/api/auth/session');
      if (current.profile.id !== identity.current) {
        generation.current++;
        signedOutRef.current = true;
        setSignedOut(true);
        setProfile(null);
        setItems([]);
        throw new Error('The account changed. Reload before capturing.');
      }
      if (leaving.current || generation.current !== activeGeneration) return;
      const { item } = await postJson<{ item: InboxItem }>(
        '/api/inbox',
        pending.current,
        'POST',
        current.profile.id,
      );
      if (leaving.current || generation.current !== activeGeneration) return;
      setItems((previous) => [item, ...previous.filter((existing) => existing.id !== item.id)]);
      pending.current = null;
      setDraft('');
      setUncertain(false);
      setMessage('Captured. You can organize it later.');
    } catch (error) {
      const definitive = error instanceof RequestFailed && [400, 413].includes(error.status);
      if (definitive) pending.current = null;
      setUncertain(!definitive);
      fail(error);
      // Keep the exact payload/key and text in memory until the outcome is known.
    } finally {
      setBusy(false);
    }
  }
  async function loadMore() {
    if (!cursor || busy) return;
    setBusy(true);
    setMessage('');
    const activeGeneration = generation.current;
    try {
      const data = await requestJson<{
        items: InboxItem[];
        nextCursor: Cursor | null;
        ownerId: string;
      }>(`/api/inbox?cursor=${encodeURIComponent(JSON.stringify(cursor))}`);
      if (leaving.current || activeGeneration !== generation.current) return;
      if (data.ownerId !== identity.current)
        throw new RequestFailed(401, 'The account changed. Reload before continuing.');
      setItems((previous) => [
        ...previous,
        ...data.items.filter((item) => !previous.some((existing) => existing.id === item.id)),
      ]);
      setCursor(data.nextCursor);
    } catch (error) {
      fail(error);
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    if (busy) return;
    if (draft && !window.confirm('Discard your unsaved capture and sign out?')) return;
    setBusy(true);
    setMessage('');
    leaving.current = true;
    generation.current++;
    try {
      await postJson('/api/auth/logout', {});
      setItems([]);
      setDraft('');
      pending.current = null;
      window.location.replace('/login');
    } catch (error) {
      leaving.current = false;
      setMessage(error instanceof Error ? error.message : 'Sign-out failed. Please retry.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="inbox-page">
      <header className="inbox-top">
        <a className="auth-brand" href="/">
          LIFE OS
        </a>
        <nav aria-label="Workspace navigation">
          <a href="/">Today</a>
          <a href="/direction">Direction</a>
          <a href="/tasks">Tasks</a>
        </nav>
        <div>
          {profile && <span>{profile.displayName}</span>}
          {profile && (
            <Button onClick={() => void logout()} disabled={busy}>
              Sign out
            </Button>
          )}
        </div>
      </header>
      <div className="inbox-heading">
        <Eyebrow>CAPTURE FIRST. ORGANIZE LATER.</Eyebrow>
        <h1>Make room in your mind.</h1>
        <p>Tasks, ideas, reminders, prayers. Start with a thought.</p>
      </div>
      {signedOut && (
        <Panel className="session-notice">
          <p>{message}</p>
          <a
            href="/login"
            onClick={(event) => {
              if (draft && !window.confirm('Discard your unsaved text and go to sign in?'))
                event.preventDefault();
            }}
          >
            Sign in again
          </a>
        </Panel>
      )}
      <Panel className="capture-panel">
        <form onSubmit={capture}>
          <label htmlFor="capture">What’s on your mind?</label>
          <textarea
            id="capture"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            maxLength={10_000}
            rows={4}
            readOnly={busy || uncertain}
            placeholder="Capture something worth remembering…"
          />
          <div className="capture-actions">
            <p className="quiet-note">
              {uncertain
                ? 'Retry uses the same request so your capture is saved once.'
                : 'Your capture stays here until saving succeeds.'}
            </p>
            <Button
              type="submit"
              variant="primary"
              disabled={busy || !profile || signedOut || !draft.trim()}
            >
              {busy ? 'Saving…' : uncertain ? 'Retry capture' : 'Capture'}
            </Button>
          </div>
        </form>
      </Panel>
      {!signedOut && (
        <p className="form-message" role="status">
          {message}
        </p>
      )}
      <section aria-labelledby="captured-heading" className="captured-section">
        <div className="panel-heading">
          <h2 id="captured-heading">Your Inbox</h2>
          <Button onClick={() => void refresh()} disabled={busy || signedOut}>
            Refresh
          </Button>
        </div>
        {loading ? (
          <p className="card-description">Opening your Inbox…</p>
        ) : profile && !items.length ? (
          <p className="card-description">Give a thought a place to land. Capture it above.</p>
        ) : null}
        <ul className="capture-list">
          {items.map((item) => (
            <li key={item.id}>
              <p>{item.body}</p>
              <time dateTime={item.createdAt}>
                {new Intl.DateTimeFormat('en-US', {
                  timeZone: profile?.timeZone ?? 'UTC',
                  month: 'short',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                }).format(new Date(item.createdAt))}
              </time>
              {item.processed && (
                <p className="muted">
                  Processed capture · original text preserved.{' '}
                  {item.convertedTaskId && (
                    <a href={'/tasks?id=' + item.convertedTaskId}>Open linked Task →</a>
                  )}
                </p>
              )}
              {profile && !item.processed && (
                <>
                  <a className="capture-convert" href={`/tasks?fromInbox=${item.id}`}>
                    Turn into Task
                  </a>
                  <a className="button" href={'/vault?fromInbox=' + item.id}>
                    Keep in Vault / Not Now
                  </a>
                  <button
                    className="button"
                    disabled={busy}
                    onClick={async () => {
                      if (!profile || !confirm('Archive this capture? The original text is kept.'))
                        return;
                      setBusy(true);
                      try {
                        await postJson(
                          '/api/execution',
                          { action: 'inbox-dismiss', requestId: crypto.randomUUID(), id: item.id },
                          'POST',
                          profile.id,
                        );
                        await refresh();
                      } catch (e) {
                        fail(e);
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    Archive capture
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
        {cursor && (
          <Button onClick={() => void loadMore()} disabled={busy || signedOut}>
            Load earlier captures
          </Button>
        )}
        {!profile && !signedOut && !loading && <a href="/login">Go to sign in</a>}
      </section>
    </main>
  );
}
