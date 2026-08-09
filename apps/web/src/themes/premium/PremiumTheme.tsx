import { type ReactNode } from 'react';

export function PremiumTheme({ children }: { children: ReactNode }) {
  return <main className="public-theme public-theme-premium">{children}</main>;
}
