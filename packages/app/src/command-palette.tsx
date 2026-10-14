'use client';
import { useEffect, useRef, useState } from 'react';
import { postJson, requestJson, RequestFailed } from './auth-client';
import type { Profile } from './auth-client';
import type { SearchHit } from '@life-os/shared';
export function CommandPalette() {
  const dialog = useRef<HTMLDialogElement>(null),
    account = useRef<string | null>(null),
    generation = useRef(0),
    retry = useRef<{ body: string; id: string } | null>(null);
  const [open, setOpen] = useState(false),
    [query, setQuery] = useState(''),
    [items, setItems] = useState<SearchHit[]>([]),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(false),
    [capture, setCapture] = useState(''),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    async function show(captureFirst = false) {
      if (dialog.current?.open) {
        if (captureFirst) dialog.current.querySelector<HTMLTextAreaElement>('textarea')?.focus();
        return;
      }
      try {
        const { profile } = await requestJson<{ profile: Profile }>('/api/auth/session');
        account.current = profile.id;
        setOpen(true);
        setQuery('');
        setItems([]);
        setCapture('');
        setError('');
        dialog.current?.showModal();
        if (captureFirst)
          setTimeout(
            () => dialog.current?.querySelector<HTMLTextAreaElement>('textarea')?.focus(),
            0,
          );
      } catch {
        location.assign('/login');
      }
    }
    function shortcut(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (dialog.current?.open) {
          // Follow the same busy/discard guard as native Escape.
          if (dialog.current.dispatchEvent(new Event('cancel', { cancelable: true })))
            dialog.current.close();
        } else void show();
      }
    }
    const requested = (event: Event) =>
      void show((event as CustomEvent<{ capture?: boolean }>).detail?.capture ?? false);
    window.addEventListener('keydown', shortcut);
    window.addEventListener('life-os:command', requested);
    return () => {
      window.removeEventListener('keydown', shortcut);
      window.removeEventListener('life-os:command', requested);
    };
  }, []);
  useEffect(() => {
    const epoch = ++generation.current;
    if (!open || !query.trim()) return;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const data = await requestJson<{ items: SearchHit[]; ownerId: string }>(
          '/api/execution/search?q=' + encodeURIComponent(query.trim()),
        );
        if (epoch !== generation.current) return;
        if (data.ownerId !== account.current) {
          setItems([]);
          setCapture('');
          setError('Account changed. Close and reopen search.');
          return;
        }
        setItems(data.items);
        setError('');
      } catch (e) {
        if (epoch === generation.current) {
          setItems([]);
          setError(e instanceof Error ? e.message : 'Search failed.');
        }
      } finally {
        if (epoch === generation.current) setLoading(false);
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [query, open]);
  useEffect(() => {
    if (!open) return;
    const verify = async () => {
      try {
        const { profile } = await requestJson<{ profile: Profile }>('/api/auth/session');
        if (profile.id !== account.current) dialog.current?.close();
      } catch {
        dialog.current?.close();
      }
    };
    const foreground = () => void verify(),
      timer = setInterval(() => {
        if (document.visibilityState === 'visible') void verify();
      }, 60000);
    window.addEventListener('focus', foreground);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', foreground);
    };
  }, [open]);
  async function captureThought() {
    if (!capture.trim()) return;
    setBusy(true);
    try {
      const { profile } = await requestJson<{ profile: Profile }>('/api/auth/session');
      if (profile.id !== account.current) {
        setCapture('');
        throw new Error('Account changed. Reopen the palette.');
      }
      if (retry.current?.body !== capture.trim())
        retry.current = { body: capture.trim(), id: crypto.randomUUID() };
      await postJson(
        '/api/inbox',
        { body: retry.current.body, requestId: retry.current.id },
        'POST',
        profile.id,
      );
      setCapture('');
      retry.current = null;
      setError('Captured in Inbox.');
    } catch (e) {
      if (e instanceof RequestFailed && e.status === 401) dialog.current?.close();
      else setError(e instanceof Error ? e.message : 'Could not capture. Try again.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button
        className="palette-launch"
        aria-label="Open command palette"
        onClick={() => {
          window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }));
        }}
      >
        Search <kbd>⌘ K</kbd>
      </button>
      <dialog
        ref={dialog}
        className="direction-dialog command-dialog"
        aria-labelledby="command-title"
        onCancel={(e) => {
          if (busy || (capture && !confirm('Discard this unsent capture?'))) e.preventDefault();
        }}
        onClose={() => {
          generation.current++;
          setOpen(false);
          setItems([]);
          setQuery('');
          setCapture('');
          retry.current = null;
          account.current = null;
        }}
      >
        <div className="editor-heading">
          <div>
            <p className="eyebrow">Search & commands</p>
            <h2 id="command-title">Find your next step</h2>
          </div>
          <kbd>Esc</kbd>
        </div>
        <label className="direction-field">
          Search your workspace
          <input
            autoFocus
            onKeyDown={(e) => {
              if (['ArrowDown', 'ArrowUp'].includes(e.key)) {
                const links =
                  dialog.current?.querySelectorAll<HTMLAnchorElement>('.command-results a');
                if (links?.length) {
                  e.preventDefault();
                  links[e.key === 'ArrowDown' ? 0 : links.length - 1]?.focus();
                }
              }
            }}
            value={query}
            maxLength={100}
            onChange={(e) => {
              setQuery(e.target.value);
              setItems([]);
            }}
            placeholder="Tasks, Goals, Projects and Vault…"
          />
        </label>
        {error && <p role="status">{error}</p>}
        {loading && <p role="status">Searching…</p>}
        {query.trim() && !loading && items.length === 0 && (
          <p className="muted">No matching items yet.</p>
        )}
        <ul
          className="command-results"
          onKeyDown={(e) => {
            if (['ArrowDown', 'ArrowUp'].includes(e.key)) {
              const links = Array.from(e.currentTarget.querySelectorAll<HTMLAnchorElement>('a')),
                index = links.findIndex((a) => a === document.activeElement);
              if (links.length) {
                e.preventDefault();
                links[
                  (index + (e.key === 'ArrowDown' ? 1 : -1) + links.length) % links.length
                ]?.focus();
              }
            }
          }}
        >
          {items.map((i) => (
            <li key={i.area + i.id}>
              <a href={i.href}>
                {i.title}
                <small>{i.area}</small>
              </a>
            </li>
          ))}
        </ul>
        <nav aria-label="Quick commands" className="command-links">
          {[
            ['Today', '/'],
            ['Create Task', '/tasks?new=1'],
            ['Start Focus', '/focus?start=1'],
            ['Open Inbox', '/inbox'],
            ['Open Goals', '/direction?view=goals'],
            ['Open Projects', '/direction?view=projects'],
            ['Open Not Now', '/vault?kind=not_now'],
            ['Calendar', '/schedule'],
            ['Routines', '/routines'],
          ].map(([label, path]) => (
            <a key={path} href={path}>
              {label}
            </a>
          ))}
        </nav>
        <label className="direction-field">
          Quick Inbox capture
          <textarea
            rows={2}
            maxLength={10000}
            value={capture}
            onChange={(e) => setCapture(e.target.value)}
          />
        </label>
        <div className="dialog-actions">
          <button
            className="button"
            disabled={busy}
            onClick={() => {
              if (!capture || confirm('Discard this unsent capture?')) dialog.current?.close();
            }}
          >
            Close
          </button>
          <button
            className="button button-primary"
            disabled={busy || !capture.trim()}
            onClick={() => void captureThought()}
          >
            Capture to Inbox
          </button>
        </div>
      </dialog>
    </>
  );
}
