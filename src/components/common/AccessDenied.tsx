import React from 'react';
import { ShieldAlert } from 'lucide-react';

interface AccessDeniedProps {
  moduleLabel: string;
  onBackToDashboard?: () => void;
}

export const AccessDenied: React.FC<AccessDeniedProps> = ({ moduleLabel, onBackToDashboard }) => {
  return (
    <div className="flex flex-col items-center justify-center min-h-[380px] rounded-xl border border-neutral-200 dark:border-zinc-800 bg-white dark:bg-[#0A0A0C] p-8 text-center">
      <div className="h-12 w-12 rounded-full bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 flex items-center justify-center text-red-600 dark:text-red-400 mb-4">
        <ShieldAlert className="h-6 w-6" />
      </div>
      <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">Access Restricted</h2>
      <p className="mt-1.5 max-w-md text-sm text-neutral-500 dark:text-neutral-400">
        Your assigned roles currently have <span className="font-mono-tabular font-medium text-neutral-700 dark:text-neutral-300">none</span> access for{' '}
        <span className="font-medium text-neutral-800 dark:text-neutral-200">{moduleLabel}</span>. Contact an Administrator to request access.
      </p>
      {onBackToDashboard && (
        <button
          onClick={onBackToDashboard}
          className="mt-5 px-4 py-2 text-sm font-medium rounded-lg bg-sky-600 text-white hover:bg-sky-500 transition-colors"
        >
          Return to Dashboard
        </button>
      )}
    </div>
  );
};
