import { ReactNode } from 'react';
import { IconInbox } from '@tabler/icons-react';

interface BotCobraEmptyStateProps {
  icon?: ReactNode;
  title: string;
  message?: string;
  action?: ReactNode;
}

export function BotCobraEmptyState({ icon, title, message, action }: BotCobraEmptyStateProps) {
  return (
    <div className="py-12 px-4 text-center">
      <div className="flex justify-center mb-4">
        {icon ? (
          <div className="text-4xl text-gray-400 dark:text-gray-600">{icon}</div>
        ) : (
          <IconInbox className="w-12 h-12 text-gray-400 dark:text-gray-600" />
        )}
      </div>
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">{title}</h3>
      {message && <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">{message}</p>}
      {action && <div>{action}</div>}
    </div>
  );
}
