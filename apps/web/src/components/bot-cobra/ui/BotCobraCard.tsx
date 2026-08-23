import { ReactNode } from 'react';

interface BotCobraCardProps {
  children: ReactNode;
  className?: string;
}

export function BotCobraCard({ children, className = '' }: BotCobraCardProps) {
  return (
    <div className={`bg-white dark:bg-slate-950 border border-gray-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow ${className}`}>
      {children}
    </div>
  );
}
