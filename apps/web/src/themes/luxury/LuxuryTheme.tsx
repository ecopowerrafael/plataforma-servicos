import { type ReactNode } from 'react';

export function LuxuryTheme({ children }: { children: ReactNode }) {
  return <main className="public-theme public-theme-luxury">{children}</main>;
}
