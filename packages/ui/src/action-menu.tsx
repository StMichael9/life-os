'use client';
import * as Menu from '@radix-ui/react-dropdown-menu';
import type { ReactNode } from 'react';

export function ActionMenu({
  label,
  children,
  trigger,
  className = '',
  disabled = false,
}: {
  label: string;
  children: ReactNode;
  trigger?: ReactNode;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <Menu.Root modal={false}>
      <Menu.Trigger
        className={`button button-quiet menu-trigger ${className}`}
        aria-label={label}
        disabled={disabled}
      >
        {trigger ?? <span aria-hidden="true">•••</span>}
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content
          className="menu-content"
          sideOffset={6}
          align="end"
          collisionPadding={12}
          aria-label={label}
        >
          {children}
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}

// asChild retains the existing link/button and its handler; Radix manages focus,
// Escape, arrow keys and dismissal without changing any request behavior.
export function MenuItem({ children }: { children: ReactNode }) {
  return <Menu.Item asChild>{children}</Menu.Item>;
}
