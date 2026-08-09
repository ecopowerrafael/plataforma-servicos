import { type ReactNode } from 'react';

export function ClassicTheme({ children }: { children: ReactNode }) {
  return <main className="public-theme public-theme-classic">{children}</main>;
}
