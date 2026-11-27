import React, { useMemo, useState } from 'react';
import { AlertTriangle, Search } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { TaskStatus } from '../../types';
import { isTaskOverdue } from '../../utils/rbac';
import { PriorityBadge, TaskStatusBadge } from '../common/StatusBadge';

interface MyTasksViewProps {
  onOpenTaskDrawer: (taskId: string) => void;
}

export const MyTasksView: React.FC<MyTasksViewProps> = ({ onOpenTaskDrawer }) => {
  const { state, currentUser, canEdit, updateTask } = useAppStore();
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<TaskStatus | 'all'>('all');
  const [overdueOnly, setOverdueOnly] = useState(false);

  const editable = canEdit('tasks') || canEdit('projects');

  const tasks = useMemo(() => {
    return state.tasks
      .filter((t) => t.assigneeId === currentUser.id && !t.archived)
      .filter((t) => (statusFilter === 'all' ? true : t.status === statusFilter))
      .filter((t) => (overdueOnly ? isTaskOverdue(t) : true))
      .filter((t) => t.title.toLowerCase().includes(query.trim().toLowerCase()))
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  }, [state.tasks, currentUser.id, statusFilter, overdueOnly, query]);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-neutral-200 dark:border-zinc-800 bg-white dark:bg-[#0A0A0C] p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search className="h-4 w-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search your tasks..."
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-neutral-200 dark:border-zinc-800 bg-neutral-50 dark:bg-black text-neutral-900 dark:text-neutral-100"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 p-1 bg-neutral-100 dark:bg-zinc-900 rounded-lg">
            {(['all', 'todo', 'in progress', 'blocked', 'done'] as const).map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md capitalize whitespace-nowrap transition-colors ${
                  statusFilter === st
                    ? 'bg-white dark:bg-zinc-800 text-neutral-900 dark:text-neutral-100 shadow-sm'
                    : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100'
                }`}
              >
                {st === 'all' ? 'All' : st}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setOverdueOnly((v) => !v)}
            className={`px-3 py-1.5 rounded-lg border text-xs font-medium whitespace-nowrap transition-colors ${
              overdueOnly
                ? 'border-red-600 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300'
                : 'border-neutral-200 dark:border-zinc-800 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-zinc-900'
            }`}
          >
            Overdue Only
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-neutral-200 dark:border-zinc-800 bg-white dark:bg-[#0A0A0C] overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-neutral-200 dark:border-zinc-800 text-xs font-medium text-neutral-500 dark:text-neutral-400">
              <th className="py-3 px-4">Task</th>
              <th className="py-3 px-4">Project</th>
              <th className="py-3 px-4">Priority</th>
              <th className="py-3 px-4">Due Date</th>
              <th className="py-3 px-4">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 dark:divide-zinc-800/80 text-sm">
            {tasks.length > 0 ? (
              tasks.map((task) => {
                const project = state.projects.find((p) => p.id === task.projectId);
                const overdue = isTaskOverdue(task);
                return (
                  <tr
                    key={task.id}
                    className={
                      overdue
                        ? 'bg-red-50/50 dark:bg-red-950/20 hover:bg-red-50 dark:hover:bg-red-950/35'
                        : 'hover:bg-neutral-50 dark:hover:bg-zinc-900/50'
                    }
                  >
                    <td className="py-3 px-4">
                      <button
                        type="button"
                        onClick={() => onOpenTaskDrawer(task.id)}
                        className="font-medium text-neutral-900 dark:text-neutral-100 hover:text-sky-600 dark:hover:text-sky-400 text-left flex items-center gap-2"
                      >
                        {overdue && <AlertTriangle className="h-3.5 w-3.5 text-red-600 shrink-0" />}
                        <span>{task.title}</span>
                      </button>
                    </td>
                    <td className="py-3 px-4 text-xs text-neutral-500 dark:text-neutral-400 whitespace-nowrap">
                      {project?.name}
                    </td>
                    <td className="py-3 px-4">
                      <PriorityBadge priority={task.priority} />
                    </td>
                    <td
                      className={`py-3 px-4 text-xs font-mono-tabular whitespace-nowrap ${
                        overdue ? 'text-red-600 dark:text-red-400 font-semibold' : 'text-neutral-600 dark:text-neutral-400'
                      }`}
                    >
                      {task.dueDate}
                    </td>
                    <td className="py-3 px-4">
                      {editable ? (
                        <select
                          value={task.status}
                          onChange={(e) => updateTask(task.id, { status: e.target.value as TaskStatus })}
                          className="rounded-md border border-neutral-200 dark:border-zinc-800 bg-neutral-50 dark:bg-black px-2 py-1 text-xs text-neutral-800 dark:text-neutral-200"
                        >
                          <option value="todo">To Do</option>
                          <option value="in progress">In Progress</option>
                          <option value="done">Done</option>
                          <option value="blocked">Blocked</option>
                        </select>
                      ) : (
                        <TaskStatusBadge status={task.status} />
                      )}
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={5} className="py-10 text-center text-sm text-neutral-500 dark:text-neutral-400">
                  No tasks found. Create tasks inside a Project to see your assignments here.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
