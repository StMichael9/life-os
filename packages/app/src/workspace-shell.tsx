'use client';
import type { ReactNode } from 'react';
import {
  CalendarDays,
  Compass,
  Sun,
  Search,
  Plus,
  MoreHorizontal,
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
  return (
    <div className={'app-shell unified-shell ' + className}>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <aside className="sidebar" aria-label="Life OS">
        <a className="brand" href="/">
          <span className="brand-symbol">
            <Leaf size={18} />
          </span>
          Life <strong>OS</strong>
        </a>
        <p className="workspace-label">Your personal workspace</p>
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
              <Icon size={18} aria-hidden="true" />
              {label}
            </a>
          ))}
          <ActionMenu
            label="More"
            className={'nav-link nav-more' + (active === 'more' ? ' active' : '')}
            trigger={
              <>
                <MoreHorizontal size={18} aria-hidden="true" />
                More
              </>
            }
          >
            {(
              [
                ['Inbox', '/inbox', Inbox],
                ['Tasks', '/tasks', CheckSquare],
                ['Focus', '/focus', Timer],
                ['Routines', '/routines', Repeat2],
                ['Vault & Not Now', '/vault', Archive],
              ] as const
            ).map(([label, href, Icon]) => (
              <MenuItem key={href}>
                <a href={href} aria-current={label === title ? 'page' : undefined}>
                  <Icon size={16} aria-hidden="true" />
                  {label}
                </a>
              </MenuItem>
            ))}
          </ActionMenu>
        </nav>
        <div className="shell-tools">
          <button className="button button-quiet" onClick={() => open()}>
            <Search size={16} aria-hidden="true" />
            Search <kbd>Ctrl K</kbd>
          </button>
          <button className="button button-primary" onClick={() => open(true)}>
            <Plus size={16} aria-hidden="true" />
            Quick capture
          </button>
        </div>
        <div className="sidebar-footer">
          <span className="status-dot" />
          Make space for what matters.
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <span className="breadcrumb">
            Workspace <span>/</span> <strong>{title}</strong>
          </span>
          <div className="execution-actions">{actions}</div>
        </header>
        {children}
      </div>
    </div>
  );
}
