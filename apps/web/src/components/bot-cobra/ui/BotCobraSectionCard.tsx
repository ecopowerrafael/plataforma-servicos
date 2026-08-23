import { ReactNode } from 'react';
import { BotCobraCard } from './BotCobraCard.js';

interface BotCobraSectionCardProps {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function BotCobraSectionCard({ title, subtitle, action, children, className = '' }: BotCobraSectionCardProps) {
  return (
    <BotCobraCard className={className}>
      <div className="mb-6">
        <div className="flex items-start justify-between mb-1">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h3>
          {action && <div className="flex-shrink-0">{action}</div>}
        </div>
        {subtitle && <p className="text-sm text-gray-600 dark:text-gray-400">{subtitle}</p>}
      </div>
      {children}
    </BotCobraCard>
  );
}
