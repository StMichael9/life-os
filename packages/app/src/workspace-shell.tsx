'use client';
import type { ReactNode } from 'react';
import { CalendarDays, Compass, Sun, Search, Plus, MoreHorizontal } from 'lucide-react';
export function WorkspaceShell({
  title,
  className = '',
  active,
  actions,
  children,
}: {
  title: string;
  className?: string;
  active: 'today' | 'calendar' | 'goals' | 'more';
  actions?: ReactNode;
  children: ReactNode;
}) {
  const open = (capture = false) =>
    window.dispatchEvent(new CustomEvent('life-os:command', { detail: { capture } }));
  return (
    <div className={'app-shell unified-shell ' + className}>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <aside className="sidebar" aria-label="Life OS">
        <a className="brand" href="/">
          LIFE <strong>OS</strong>
        </a>
        <p className="workspace-label">A little space for what matters.</p>
        <nav aria-label="Main navigation">
          {(
            [
              { key: 'today', title: 'Today', href: '/', Icon: Sun },
              { key: 'calendar', title: 'Calendar', href: '/schedule', Icon: CalendarDays },
              { key: 'goals', title: 'Goals', href: '/direction', Icon: Compass },
            ] as const
          ).map(({ key, title: label, href, Icon }) => (
            <a
              key={key}
              className={'nav-link' + (active === key ? ' active' : '')}
              aria-current={active === key ? 'page' : undefined}
              href={href}
            >
              <Icon size={18} />
              {label}
            </a>
          ))}
          <details className={'nav-more' + (active === 'more' ? ' active' : '')}>
            <summary className="nav-link">
              <MoreHorizontal size={18} />
              More
            </summary>
            <div className="more-links">
              {[
                ['Inbox', '/inbox'],
                ['Tasks', '/tasks'],
                ['Focus', '/focus'],
                ['Routines', '/routines'],
                ['Vault & Not Now', '/vault'],
              ].map(([label, href]) => (
                <a key={href} href={href}>
                  {label}
                </a>
              ))}
            </div>
          </details>
        </nav>
        <div className="shell-tools">
          <button className="button" onClick={() => open()}>
            <Search size={16} />
            Search <kbd>⌘ / Ctrl K</kbd>
          </button>
          <button className="button" onClick={() => open(true)}>
            <Plus size={16} />
            Quick capture
          </button>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <span className="breadcrumb">
            Life OS <span>/</span> <strong>{title}</strong>
          </span>
          <div className="execution-actions">{actions}</div>
        </header>
        {children}
      </div>
    </div>
  );
}
