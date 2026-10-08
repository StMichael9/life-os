import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import '@life-os/ui/styles.css';
import { CommandPalette } from '@life-os/app';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Today · Life OS',
  description: 'A private command center for a deliberate life.',
  robots: { index: false, follow: false },
};
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <CommandPalette />
      </body>
    </html>
  );
}
