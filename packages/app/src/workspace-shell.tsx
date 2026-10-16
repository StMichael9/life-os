'use client';
import type { ReactNode } from 'react';
import {
  CalendarDays,
  Compass,
  Sun,
  Search,
  Plus,
  Inbox,
  CheckSquare,
  Timer,
  Repeat2,
  Archive,
  Leaf,
} from 'lucide-react';
import { ActionMenu, MenuItem } from '@life-os/ui';
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
  const planning = active === 'calendar' || active === 'goals';
  const destinations = [
    ['Today', '/', Sun],
    ['Calendar', '/schedule', CalendarDays],
    ['Tasks', '/tasks', CheckSquare],
    ['Goals & Projects', '/direction', Compass],
    ['Inbox', '/inbox', Inbox],
    ['Vault & Not Now', '/vault', Archive],
    ['Routines', '/routines', Repeat2],
    ['Focus workspace', '/focus', Timer],
  ] as const;
  return (
    <div className={'app-shell canvas-shell ' + className}>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="canvas-header">
        <a className="brand" href="/" aria-label="Life OS home">
          <span className="brand-symbol">
            <Leaf size={18} aria-hidden="true" />
          </span>
          Life <strong>OS</strong>
        </a>
        <nav className="canvas-nav" aria-label="Main navigation">
          <a href="/" aria-current={active === 'today' ? 'page' : undefined}>
            Today
          </a>
          <a href="/schedule" aria-current={planning ? 'page' : undefined}>
            Plan
          </a>
          <ActionMenu
            label="Library"
            className={active === 'more' ? 'canvas-library active' : 'canvas-library'}
            trigger={
              <>
                Library <span aria-hidden="true">⌄</span>
              </>
            }
          >
            {destinations.slice(2).map(([label, href, Icon]) => (
              <MenuItem key={href}>
                <a href={href}>
                  <Icon size={16} aria-hidden="true" />
                  {label}
                </a>
              </MenuItem>
            ))}
          </ActionMenu>
        </nav>
        <div className="canvas-tools">
          <button
            className="button button-quiet canvas-search"
            onClick={() => open()}
            aria-label="Search and commands"
          >
            <Search size={16} aria-hidden="true" />
            <span>Search</span>
            <kbd>Ctrl K</kbd>
          </button>
          <button className="button button-primary" onClick={() => open(true)}>
            <Plus size={16} aria-hidden="true" />
            Capture
          </button>
          {actions && (
            <details className="canvas-account">
              <summary>Account</summary>
              <div className="canvas-account-actions">{actions}</div>
            </details>
          )}
        </div>
      </header>
      {active !== 'today' && (
        <nav className="canvas-local-nav" aria-label="Workspace navigation">
          {destinations.slice(1).map(([label, href]) => (
            <a
              key={href}
              href={href}
              aria-current={
                label === title ||
                (title === 'Goals' && href === '/direction') ||
                (title === 'Focus' && href === '/focus')
                  ? 'page'
                  : undefined
              }
            >
              {label}
            </a>
          ))}
        </nav>
      )}
      <div className="canvas-workspace">{children}</div>
    </div>
  );
}
