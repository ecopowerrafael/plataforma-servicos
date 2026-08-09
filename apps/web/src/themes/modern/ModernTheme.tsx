import { type ReactNode } from 'react';

export function ModernTheme({ children }: { children: ReactNode }) {
  return <main className="public-theme public-theme-modern">{children}</main>;
}
