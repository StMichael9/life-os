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
  const captureValue = useRef('');
  const [captureOnly, setCaptureOnly] = useState(false);
  const [uncertain, setUncertain] = useState(false);
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
        if (account.current && account.current !== profile.id) {
          captureValue.current = '';
          setCapture('');
          retry.current = null;
          setUncertain(false);
        }
        account.current = profile.id;
        setCaptureOnly(captureFirst);
        setOpen(true);
        setQuery('');
        setItems([]);
        setError('');
        dialog.current?.showModal();
        setTimeout(() => {
          if (captureFirst) dialog.current?.querySelector<HTMLTextAreaElement>('textarea')?.focus();
          else dialog.current?.querySelector<HTMLInputElement>('input')?.focus();
        }, 0);
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
        } else void show(e.shiftKey);
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
    const warn = (e: BeforeUnloadEvent) => {
      if (captureValue.current) e.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
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
          captureValue.current = '';
          retry.current = null;
          setUncertain(false);
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
        if (profile.id !== account.current) {
          setCapture('');
          captureValue.current = '';
          retry.current = null;
          setUncertain(false);
          dialog.current?.close();
        }
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
    if (!capture.trim() || busy) return;
    setBusy(true);
    try {
      const { profile } = await requestJson<{ profile: Profile }>('/api/auth/session');
      if (profile.id !== account.current) {
        setCapture('');
        captureValue.current = '';
        retry.current = null;
        setUncertain(false);
        throw new Error('Account changed. Reopen the palette.');
      }
      if (retry.current?.body !== capture.trim())
        retry.current = { body: capture.trim(), id: crypto.randomUUID() };
      if (
        new TextEncoder().encode(
          JSON.stringify({ body: retry.current.body, requestId: retry.current.id }),
        ).byteLength > 16384
      ) {
        retry.current = null;
        throw new Error('This capture exceeds the delivery size limit. Shorten it before saving.');
      }
      await postJson(
        '/api/inbox',
        { body: retry.current.body, requestId: retry.current.id },
        'POST',
        profile.id,
      );
      setCapture('');
      captureValue.current = '';
      retry.current = null;
      setUncertain(false);
      setError('Captured in Inbox.');
    } catch (e) {
      if (e instanceof RequestFailed && e.status === 401) {
        setCapture('');
        captureValue.current = '';
        retry.current = null;
        setUncertain(false);
        dialog.current?.close();
      } else {
        setUncertain(!!retry.current);
        setError(e instanceof Error ? e.message : 'Could not capture. Retry the same capture.');
      }
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
          if (busy) e.preventDefault();
        }}
        onClose={() => {
          generation.current++;
          setOpen(false);
          setItems([]);
          setQuery('');
        }}
      >
        <div className="editor-heading">
          <div>
            <p className="eyebrow">
              {captureOnly ? 'Capture first. Organize later.' : 'Search & commands'}
            </p>
            <h2 id="command-title">{captureOnly ? 'Capture a thought' : 'Find your next step'}</h2>
          </div>
          <kbd>Esc</kbd>
        </div>
        <label className="direction-field" hidden={captureOnly}>
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
        {!captureOnly && query.trim() && !loading && items.length === 0 && (
          <p className="muted">No matching items yet.</p>
        )}
        <ul
          className="command-results"
          hidden={captureOnly}
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
        <nav aria-label="Quick commands" className="command-links" hidden={captureOnly}>
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
            readOnly={busy || uncertain}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                void captureThought();
              }
            }}
            onChange={(e) => {
              captureValue.current = e.target.value;
              setCapture(e.target.value);
            }}
          />
        </label>
        <p className="quiet-note">
          {uncertain
            ? 'Delivery is uncertain. Retry this exact capture before changing its text.'
            : 'Unsent text stays in memory when you close this panel. Save before reloading or quitting.'}
        </p>
        <div className="dialog-actions">
          <button
            className="button"
            disabled={busy}
            onClick={() => {
              dialog.current?.close();
            }}
          >
            Keep & close
          </button>
          <button
            className="button button-primary"
            disabled={busy || !capture.trim()}
            onClick={() => void captureThought()}
          >
            {uncertain ? 'Retry same capture' : 'Capture to Inbox'}
          </button>
          {capture && !uncertain && (
            <button
              className="button button-quiet"
              disabled={busy}
              onClick={() => {
                if (confirm('Discard this unsent capture?')) {
                  setCapture('');
                  captureValue.current = '';
                  retry.current = null;
                }
              }}
            >
              Discard draft
            </button>
          )}
        </div>
      </dialog>
    </>
  );
}
