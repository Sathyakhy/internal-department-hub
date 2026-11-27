import React from 'react';
import { AlertCircle, CheckCircle2, Clock, PauseCircle } from 'lucide-react';
import { ProjectPriority, ProjectStatus, TaskPriority, TaskStatus } from '../../types';

export const TaskStatusBadge: React.FC<{ status: TaskStatus }> = ({ status }) => {
  const config: Record<TaskStatus, { label: string; cls: string; Icon: React.ElementType }> = {
    todo: {
      label: 'To Do',
      cls: 'bg-neutral-100 text-neutral-700 border-neutral-200 dark:bg-zinc-900 dark:text-neutral-300 dark:border-zinc-800',
      Icon: Clock,
    },
    'in progress': {
      label: 'In Progress',
      cls: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-900',
      Icon: Clock,
    },
    done: {
      label: 'Done',
      cls: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900',
      Icon: CheckCircle2,
    },
    blocked: {
      label: 'Blocked',
      cls: 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900',
      Icon: PauseCircle,
    },
  };
  const { label, cls, Icon } = config[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap ${cls}`}>
      <Icon className="h-3 w-3 shrink-0" />
      {label}
    </span>
  );
};

export const PriorityBadge: React.FC<{ priority: TaskPriority | ProjectPriority }> = ({ priority }) => {
  const styles: Record<TaskPriority, string> = {
    Low: 'text-neutral-600 dark:text-neutral-400 border-neutral-200 dark:border-zinc-800 bg-neutral-50 dark:bg-zinc-900',
    Medium: 'text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-900 bg-sky-50 dark:bg-sky-950/40',
    High: 'text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/40',
    Critical: 'text-red-700 dark:text-red-300 border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40',
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap ${styles[priority]}`}>
      {priority === 'Critical' && <AlertCircle className="h-3 w-3 shrink-0" />}
      {priority}
    </span>
  );
};

export const ProjectStatusBadge: React.FC<{ status: ProjectStatus }> = ({ status }) => {
  const styles: Record<ProjectStatus, string> = {
    Planning: 'bg-neutral-100 text-neutral-700 border-neutral-200 dark:bg-zinc-900 dark:text-neutral-300 dark:border-zinc-800',
    Active: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-900',
    'On Hold': 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900',
    Completed: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900',
  };
  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap ${styles[status]}`}>
      {status}
    </span>
  );
};
