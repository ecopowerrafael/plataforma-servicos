interface BotCobraStatusBadgeProps {
  status: string;
  label: string;
}

const statusStyles: Record<string, { bg: string; text: string; border: string }> = {
  OPEN: { bg: 'bg-red-50 dark:bg-red-950/30', text: 'text-red-700 dark:text-red-400', border: 'border-red-200 dark:border-red-800' },
  PAUSED: { bg: 'bg-gray-50 dark:bg-gray-900', text: 'text-gray-700 dark:text-gray-400', border: 'border-gray-200 dark:border-gray-700' },
  PROMISE_SCHEDULED: { bg: 'bg-blue-50 dark:bg-blue-950/30', text: 'text-blue-700 dark:text-blue-400', border: 'border-blue-200 dark:border-blue-800' },
  HUMAN_SUPPORT: { bg: 'bg-purple-50 dark:bg-purple-950/30', text: 'text-purple-700 dark:text-purple-400', border: 'border-purple-200 dark:border-purple-800' },
  DISPUTED: { bg: 'bg-orange-50 dark:bg-orange-950/30', text: 'text-orange-700 dark:text-orange-400', border: 'border-orange-200 dark:border-orange-800' },
  PAID: { bg: 'bg-green-50 dark:bg-green-950/30', text: 'text-green-700 dark:text-green-400', border: 'border-green-200 dark:border-green-800' },
  CANCELED: { bg: 'bg-gray-100 dark:bg-gray-800', text: 'text-gray-600 dark:text-gray-500', border: 'border-gray-300 dark:border-gray-700' },
};

export function BotCobraStatusBadge({ status, label }: BotCobraStatusBadgeProps) {
  const style = statusStyles[status] || statusStyles.OPEN;
  return (
    <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium border ${style.bg} ${style.text} ${style.border}`}>
      {label}
    </span>
  );
}
