import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ChevronRight,
  Copy,
  FileText,
  FolderKanban,
  Link2,
  Paperclip,
  Plus,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { Task, TaskAttachment, TaskPriority, TaskStatus } from '../../types';
import { getTaskScheduleConflicts, isTaskOverdue, wouldCreateCircularDependency } from '../../utils/rbac';
import { PriorityBadge, TaskStatusBadge } from '../common/StatusBadge';
import { UserAvatar } from '../common/UserAvatar';

interface TaskDetailDrawerProps {
  taskId: string | null;
  onClose: () => void;
  onSelectTask: (taskId: string) => void;
}

export const TaskDetailDrawer: React.FC<TaskDetailDrawerProps> = ({
  taskId,
  onClose,
  onSelectTask,
}) => {
  const {
    state,
    canEdit,
    currentUser,
    updateTask,
    createTask,
    duplicateTask,
    deleteTask,
    notify,
  } = useAppStore();

  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [selectedPredToAdd, setSelectedPredToAdd] = useState('');

  const task = useMemo(
    () => (taskId ? state.tasks.find((t) => t.id === taskId) : undefined),
    [state.tasks, taskId]
  );

  const project = useMemo(
    () => (task ? state.projects.find((p) => p.id === task.projectId) : undefined),
    [state.projects, task]
  );

  const breadcrumbs = useMemo(() => {
    if (!task) return [];
    const chain: Task[] = [];
    const visited = new Set<string>();
    let curr: Task | undefined = task;
    while (curr && !visited.has(curr.id)) {
      visited.add(curr.id);
      chain.unshift(curr);
      curr = curr.parentId ? state.tasks.find((t) => t.id === curr!.parentId) : undefined;
    }
    return chain;
  }, [task, state.tasks]);

  const subtasks = useMemo(
    () => (task ? state.tasks.filter((t) => t.parentId === task.id && !t.archived).sort((a, b) => a.order - b.order) : []),
    [state.tasks, task]
  );

  const projectTasks = useMemo(
    () => (task ? state.tasks.filter((t) => t.projectId === task.projectId && !t.archived && t.id !== task.id) : []),
    [state.tasks, task]
  );

  if (!taskId || !task) return null;

  const editable = canEdit('projects') || (canEdit('tasks') && task.assigneeId === currentUser.id);
  const overdue = isTaskOverdue(task);
  const conflicts = getTaskScheduleConflicts(task, state.tasks);
  const activeUsers = state.users.filter((u) => u.isActive);

  const handleAddSubtask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editable || !newSubtaskTitle.trim()) return;
    const created = createTask({
      projectId: task.projectId,
      parentId: task.id,
      title: newSubtaskTitle.trim(),
      description: '',
      assigneeId: task.assigneeId,
      startDate: task.startDate,
      dueDate: task.dueDate,
      status: 'todo',
      priority: task.priority,
      predecessorIds: [],
      attachments: [],
      archived: false,
      order: subtasks.length + 1,
    });
    setNewSubtaskTitle('');
    onSelectTask(created.id);
  };

  const handleAddPredecessor = () => {
    if (!editable || !selectedPredToAdd) return;
    if (task.predecessorIds.includes(selectedPredToAdd)) return;
    if (wouldCreateCircularDependency(state.tasks, task.id, selectedPredToAdd)) {
      notify('Blocked: Adding that predecessor would create a circular dependency.', 'error');
      return;
    }
    updateTask(task.id, { predecessorIds: [...task.predecessorIds, selectedPredToAdd] });
    setSelectedPredToAdd('');
    notify('Dependency added');
  };

  const handleRemovePredecessor = (predId: string) => {
    if (!editable) return;
    updateTask(task.id, { predecessorIds: task.predecessorIds.filter((id) => id !== predId) });
    notify('Dependency removed', 'info');
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!editable) return;
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const att: TaskAttachment = {
        id: `att-${Date.now().toString(36)}`,
        name: file.name,
        size: `${Math.max(1, Math.round(file.size / 1024))} KB`,
        type: file.type || 'application/octet-stream',
        url: typeof reader.result === 'string' ? reader.result : '#',
        uploadedAt: new Date().toISOString().slice(0, 10),
      };
      updateTask(task.id, { attachments: [...task.attachments, att] });
      notify(`Attached "${file.name}"`);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleDeleteAttachment = (attId: string) => {
    if (!editable) return;
    updateTask(task.id, { attachments: task.attachments.filter((a) => a.id !== attId) });
    notify('Attachment removed', 'info');
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="fixed inset-0 bg-black/60" onClick={onClose} />
      <div className="relative z-10 w-full max-w-2xl bg-white dark:bg-[#0A0A0C] border-l border-neutral-200 dark:border-zinc-800 h-full flex flex-col shadow-2xl">
        <div className="px-6 py-4 border-b border-neutral-200 dark:border-zinc-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-400 min-w-0 overflow-x-auto">
            <FolderKanban className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400 shrink-0" />
            <span className="font-medium text-neutral-700 dark:text-neutral-300 whitespace-nowrap">
              {project?.name ?? 'Project'}
            </span>
            {breadcrumbs.map((crumb, index) => {
              const isLast = index === breadcrumbs.length - 1;
              return (
                <React.Fragment key={crumb.id}>
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-neutral-400" />
                  <button
                    type="button"
                    onClick={() => onSelectTask(crumb.id)}
                    className={`truncate max-w-[160px] whitespace-nowrap ${
                      isLast
                        ? 'font-semibold text-neutral-900 dark:text-neutral-100'
                        : 'hover:text-sky-600 dark:hover:text-sky-400'
                    }`}
                  >
                    {crumb.title}
                  </button>
                </React.Fragment>
              );
            })}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {canEdit('projects') && (
              <>
                <button
                  type="button"
                  onClick={() => duplicateTask(task.id)}
                  title="Duplicate task and subtasks"
                  className="p-1.5 rounded-lg text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-zinc-900"
                >
                  <Copy className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    deleteTask(task.id);
                    onClose();
                  }}
                  title="Delete task"
                  className="p-1.5 rounded-lg text-neutral-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-zinc-900"
              aria-label="Close task drawer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {(overdue || conflicts.length > 0) && (
            <div className="space-y-2">
              {overdue && (
                <div className="flex items-center gap-2 rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 px-3.5 py-2.5 text-xs text-red-700 dark:text-red-300">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>
                    Overdue: Due date <span className="font-mono-tabular font-semibold">{task.dueDate}</span> has passed.
                  </span>
                </div>
              )}
              {conflicts.map((c) => (
                <div
                  key={c.predecessorId}
                  className="flex items-center gap-2 rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/40 px-3.5 py-2.5 text-xs text-amber-800 dark:text-amber-300"
                >
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>
                    Schedule conflict: Starts <span className="font-mono-tabular font-semibold">{c.successorStartDate}</span> before predecessor{' '}
                    <button
                      type="button"
                      onClick={() => onSelectTask(c.predecessorId)}
                      className="underline font-medium"
                    >
                      {c.predecessorTitle}
                    </button>{' '}
                    finishes (<span className="font-mono-tabular">{c.predecessorDueDate}</span>).
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="space-y-3">
            <input
              type="text"
              disabled={!editable}
              value={task.title}
              onChange={(e) => updateTask(task.id, { title: e.target.value })}
              className="w-full text-xl font-display font-bold bg-transparent text-neutral-900 dark:text-neutral-100 border border-transparent focus:border-neutral-200 dark:focus:border-zinc-800 rounded-lg px-2 py-1 -mx-2 focus:outline-none disabled:opacity-80"
            />
            <textarea
              rows={3}
              disabled={!editable}
              value={task.description}
              onChange={(e) => updateTask(task.id, { description: e.target.value })}
              placeholder="Add task scope, acceptance criteria, or notes..."
              className="w-full text-sm rounded-lg border border-neutral-200 dark:border-zinc-800 bg-neutral-50 dark:bg-black text-neutral-800 dark:text-neutral-200 p-3 focus:outline-none focus:ring-2 focus:ring-sky-500 disabled:opacity-80"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-neutral-100 dark:border-zinc-800">
            <div>
              <label className="block text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-1">
                Status
              </label>
              <select
                disabled={!editable}
                value={task.status}
                onChange={(e) => updateTask(task.id, { status: e.target.value as TaskStatus })}
                className="w-full rounded-lg border border-neutral-200 dark:border-zinc-800 bg-neutral-50 dark:bg-black px-3 py-2 text-sm text-neutral-900 dark:text-neutral-100 disabled:opacity-70"
              >
                <option value="todo">To Do</option>
                <option value="in progress">In Progress</option>
                <option value="done">Done</option>
                <option value="blocked">Blocked</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-1">
                Priority
              </label>
              <select
                disabled={!editable}
                value={task.priority}
                onChange={(e) => updateTask(task.id, { priority: e.target.value as TaskPriority })}
                className="w-full rounded-lg border border-neutral-200 dark:border-zinc-800 bg-neutral-50 dark:bg-black px-3 py-2 text-sm text-neutral-900 dark:text-neutral-100 disabled:opacity-70"
              >
                <option value="Low">Low</option>
                <option value="Medium">Medium</option>
                <option value="High">High</option>
                <option value="Critical">Critical</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-1">
                Assignee (PIC)
              </label>
              <select
                disabled={!editable}
                value={task.assigneeId ?? ''}
                onChange={(e) => updateTask(task.id, { assigneeId: e.target.value || null })}
                className="w-full rounded-lg border border-neutral-200 dark:border-zinc-800 bg-neutral-50 dark:bg-black px-3 py-2 text-sm text-neutral-900 dark:text-neutral-100 disabled:opacity-70"
              >
                <option value="">Unassigned</option>
                {activeUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.fullName}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-1">
                  Start Date
                </label>
                <input
                  type="date"
                  disabled={!editable}
                  value={task.startDate}
                  onChange={(e) => updateTask(task.id, { startDate: e.target.value })}
                  className="w-full font-mono-tabular rounded-lg border border-neutral-200 dark:border-zinc-800 bg-neutral-50 dark:bg-black px-2.5 py-2 text-xs text-neutral-900 dark:text-neutral-100 disabled:opacity-70"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-1">
                  Due Date
                </label>
                <input
                  type="date"
                  disabled={!editable}
                  value={task.dueDate}
                  onChange={(e) => updateTask(task.id, { dueDate: e.target.value })}
                  className={`w-full font-mono-tabular rounded-lg border px-2.5 py-2 text-xs bg-neutral-50 dark:bg-black disabled:opacity-70 ${
                    overdue
                      ? 'border-red-500 text-red-700 dark:text-red-300'
                      : 'border-neutral-200 dark:border-zinc-800 text-neutral-900 dark:text-neutral-100'
                  }`}
                />
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-neutral-100 dark:border-zinc-800">
            <div className="flex items-center justify-between mb-2.5">
              <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
                <Link2 className="h-4 w-4 text-neutral-400" />
                Predecessor Dependencies
              </h3>
            </div>

            {task.predecessorIds.length > 0 ? (
              <div className="space-y-1.5 mb-3">
                {task.predecessorIds.map((pid) => {
                  const pred = state.tasks.find((t) => t.id === pid);
                  if (!pred) return null;
                  return (
                    <div
                      key={pid}
                      className="flex items-center justify-between gap-2 rounded-lg border border-neutral-200 dark:border-zinc-800 px-3 py-2 text-xs"
                    >
                      <button
                        type="button"
                        onClick={() => onSelectTask(pred.id)}
                        className="font-medium text-neutral-800 dark:text-neutral-200 hover:text-sky-600 truncate text-left"
                      >
                        {pred.title}
                      </button>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="font-mono-tabular text-neutral-500">{pred.dueDate}</span>
                        <TaskStatusBadge status={pred.status} />
                        {editable && (
                          <button
                            type="button"
                            onClick={() => handleRemovePredecessor(pid)}
                            className="text-neutral-400 hover:text-red-600 p-0.5"
                            aria-label="Remove predecessor"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-3">No predecessor tasks linked.</p>
            )}

            {editable && (
              <div className="flex items-center gap-2">
                <select
                  value={selectedPredToAdd}
                  onChange={(e) => setSelectedPredToAdd(e.target.value)}
                  className="flex-1 rounded-lg border border-neutral-200 dark:border-zinc-800 bg-neutral-50 dark:bg-black px-3 py-1.5 text-xs text-neutral-900 dark:text-neutral-100"
                >
                  <option value="">Select predecessor task...</option>
                  {projectTasks
                    .filter((pt) => !task.predecessorIds.includes(pt.id))
                    .map((pt) => (
                      <option key={pt.id} value={pt.id}>
                        {pt.title} (Due {pt.dueDate})
                      </option>
                    ))}
                </select>
                <button
                  type="button"
                  onClick={handleAddPredecessor}
                  disabled={!selectedPredToAdd}
                  className="px-3 py-1.5 rounded-lg bg-zinc-900 dark:bg-sky-600 text-white text-xs font-medium disabled:opacity-40 whitespace-nowrap"
                >
                  Link Predecessor
                </button>
              </div>
            )}
          </div>

          <div className="pt-4 border-t border-neutral-100 dark:border-zinc-800">
            <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 mb-2.5">
              Subtasks ({subtasks.length})
            </h3>
            {subtasks.length > 0 ? (
              <div className="space-y-1.5 mb-3">
                {subtasks.map((sub) => {
                  const subUser = state.users.find((u) => u.id === sub.assigneeId);
                  return (
                    <div
                      key={sub.id}
                      onClick={() => onSelectTask(sub.id)}
                      className="flex items-center justify-between gap-2 rounded-lg border border-neutral-200 dark:border-zinc-800 px-3 py-2 hover:bg-neutral-50 dark:hover:bg-zinc-900/60 cursor-pointer transition-colors"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-xs font-medium text-neutral-800 dark:text-neutral-200 truncate">
                          {sub.title}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {subUser && <UserAvatar name={subUser.fullName} avatarUrl={subUser.avatarUrl} size="xs" />}
                        <PriorityBadge priority={sub.priority} />
                        <TaskStatusBadge status={sub.status} />
                        <ChevronRight className="h-3.5 w-3.5 text-neutral-400" />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-3">No child subtasks yet.</p>
            )}

            {editable && (
              <form onSubmit={handleAddSubtask} className="flex items-center gap-2">
                <input
                  type="text"
                  value={newSubtaskTitle}
                  onChange={(e) => setNewSubtaskTitle(e.target.value)}
                  placeholder="Add nested subtask..."
                  className="flex-1 rounded-lg border border-neutral-200 dark:border-zinc-800 bg-neutral-50 dark:bg-black px-3 py-1.5 text-xs text-neutral-900 dark:text-neutral-100"
                />
                <button
                  type="submit"
                  disabled={!newSubtaskTitle.trim()}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-medium disabled:opacity-40 whitespace-nowrap"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Subtask
                </button>
              </form>
            )}
          </div>

          <div className="pt-4 border-t border-neutral-100 dark:border-zinc-800">
            <div className="flex items-center justify-between mb-2.5">
              <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
                <Paperclip className="h-4 w-4 text-neutral-400" />
                Attachments ({task.attachments.length})
              </h3>
              {editable && (
                <label className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-neutral-200 dark:border-zinc-800 text-xs font-medium text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-zinc-900 cursor-pointer">
                  <Upload className="h-3.5 w-3.5" />
                  <span>Attach File</span>
                  <input type="file" className="hidden" onChange={handleFileUpload} />
                </label>
              )}
            </div>

            {task.attachments.length > 0 ? (
              <div className="space-y-1.5">
                {task.attachments.map((att) => (
                  <div
                    key={att.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-neutral-200 dark:border-zinc-800 px-3 py-2 text-xs"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="h-4 w-4 text-sky-600 dark:text-sky-400 shrink-0" />
                      <span className="font-medium text-neutral-800 dark:text-neutral-200 truncate">{att.name}</span>
                      <span className="text-neutral-400 font-mono-tabular shrink-0">{att.size}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {att.url && att.url !== '#' && (
                        <a
                          href={att.url}
                          download={att.name}
                          className="text-sky-600 dark:text-sky-400 hover:underline font-medium"
                        >
                          Download
                        </a>
                      )}
                      {editable && (
                        <button
                          type="button"
                          onClick={() => handleDeleteAttachment(att.id)}
                          className="text-neutral-400 hover:text-red-600"
                          aria-label="Remove attachment"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-neutral-500 dark:text-neutral-400">No files attached.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
