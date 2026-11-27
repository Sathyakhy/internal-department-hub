import React from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';

export const ToastContainer: React.FC = () => {
  const { toasts, dismissToast } = useAppStore();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none px-4 sm:px-0">
      {toasts.map((toast) => {
        const iconMap = {
          success: <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />,
          info: <Info className="h-4 w-4 text-sky-600 dark:text-sky-400 shrink-0" />,
          warning: <AlertCircle className="h-4 w-4 text-amber-500 dark:text-amber-400 shrink-0" />,
          error: <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400 shrink-0" />,
        };
        return (
          <div
            key={toast.id}
            role="status"
            className="pointer-events-auto flex items-center justify-between gap-3 rounded-lg border border-neutral-200 dark:border-zinc-800 bg-white dark:bg-[#0A0A0C] px-4 py-3 text-sm text-neutral-900 dark:text-neutral-100 shadow-lg"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              {iconMap[toast.type]}
              <span className="truncate font-medium">{toast.title}</span>
            </div>
            <button
              onClick={() => dismissToast(toast.id)}
              className="text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 p-0.5 rounded"
              aria-label="Dismiss notification"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
