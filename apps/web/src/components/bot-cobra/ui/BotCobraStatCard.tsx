import { ReactNode } from 'react';

interface BotCobraStatCardProps {
  icon?: ReactNode;
  label: string;
  value: string | number;
  subtext?: string;
  color?: 'blue' | 'green' | 'red' | 'amber' | 'purple' | 'gray';
}

const colorClasses = {
  blue: 'text-blue-600 dark:text-blue-400',
  green: 'text-green-600 dark:text-green-400',
  red: 'text-red-600 dark:text-red-400',
  amber: 'text-amber-600 dark:text-amber-400',
  purple: 'text-purple-600 dark:text-purple-400',
  gray: 'text-gray-600 dark:text-gray-400',
};

export function BotCobraStatCard({ icon, label, value, subtext, color = 'gray' }: BotCobraStatCardProps) {
  return (
    <div className="bg-white dark:bg-slate-950 border border-gray-200 dark:border-slate-800 rounded-xl p-6 shadow-sm">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">{label}</div>
          <div className={`text-3xl font-bold ${colorClasses[color]}`}>{value}</div>
          {subtext && <div className="text-xs text-gray-500 dark:text-gray-500 mt-1">{subtext}</div>}
        </div>
        {icon && <div className={`text-2xl ${colorClasses[color]}`}>{icon}</div>}
      </div>
    </div>
  );
}
