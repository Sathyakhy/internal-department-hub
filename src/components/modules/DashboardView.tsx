import React, { useMemo } from 'react';
import { AlertTriangle, ArrowRight, Calendar, Megaphone, Pin } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { ModuleId } from '../../types';
import { isTaskOverdue } from '../../utils/rbac';
import { PriorityBadge, TaskStatusBadge } from '../common/StatusBadge';
import { UserAvatar } from '../common/UserAvatar';

interface DashboardViewProps {
  onOpenTaskDrawer: (taskId: string) => void;
  onNavigateModule: (mod: ModuleId) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  onOpenTaskDrawer,
  onNavigateModule,
}) => {
  const { state, currentUser, canView } = useAppStore();

  const myTasks = useMemo(
    () =>
      state.tasks
        .filter((t) => t.assigneeId === currentUser.id && !t.archived)
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
    [state.tasks, currentUser.id]
  );

  const overdueCount = useMemo(() => myTasks.filter((t) => isTaskOverdue(t)).length, [myTasks]);

  const myProjectIds = useMemo(() => {
    const ids = new Set<string>();
    for (const p of state.projects) {
      if (p.isTemplate || p.archived) continue;
      const isOwner = p.ownerId === currentUser.id;
      const isPM = p.pms.some((pm) => pm.userId === currentUser.id);
      const isMember = p.memberIds.includes(currentUser.id);
      const hasTask = state.tasks.some((t) => t.projectId === p.id && t.assigneeId === currentUser.id);
      if (isOwner || isPM || isMember || hasTask) {
        ids.add(p.id);
      }
    }
    return ids;
  }, [state.projects, state.tasks, currentUser.id]);

  const recentProjectActivity = useMemo(() => {
    const taskEvents = state.tasks
      .filter((t) => myProjectIds.has(t.projectId))
      .map((t) => ({
        id: `evt-t-${t.id}`,
        timestamp: t.updatedAt,
        projectId: t.projectId,
        title: t.title,
        detail: `Task status: ${t.status}`,
        actorId: t.assigneeId,
        taskId: t.id,
      }));

    const updateEvents = state.projectUpdates
      .filter((u) => myProjectIds.has(u.projectId))
      .map((u) => ({
        id: `evt-u-${u.id}`,
        timestamp: u.createdAt,
        projectId: u.projectId,
        title: `Status Update (${u.healthStatus})`,
        detail: u.message,
        actorId: u.authorId,
        taskId: null as string | null,
      }));

    return [...updateEvents, ...taskEvents]
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .slice(0, 8);
  }, [state.tasks, state.projectUpdates, myProjectIds]);

  const pinnedAnnouncements = useMemo(
    () =>
      state.announcements
        .filter((a) => a.active && a.pinned)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [state.announcements]
  );

  const activeEnrollments = useMemo(
    () => state.enrollments.filter((e) => e.userId === currentUser.id),
    [state.enrollments, currentUser.id]
  );

  return (
    <div className="space-y-6">
      {/* Top KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="rounded-xl border border-neutral-200 dark:border-zinc-800 bg-white dark:bg-[#0A0A0C] p-4">
          <div className="text-xs font-medium text-neutral-500 dark:text-neutral-400">Assigned Tasks</div>
          <div className="mt-1.5 flex items-baseline justify-between">
            <span className="text-2xl font-display font-bold tabular-nums text-neutral-900 dark:text-neutral-100">
              {myTasks.filter((t) => t.status !== 'done').length}
            </span>
            <span className="text-xs text-neutral-500 dark:text-neutral-400 tabular-nums">
              {myTasks.filter((t) => t.status === 'done').length} completed
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-neutral-200 dark:border-zinc-800 bg-white dark:bg-[#0A0A0C] p-4">
          <div className="text-xs font-medium text-neutral-500 dark:text-neutral-400">Overdue Tasks</div>
          <div className="mt-1.5 flex items-baseline justify-between">
            <span
              className={`text-2xl font-display font-bold tabular-nums ${
                overdueCount > 0 ? 'text-red-600 dark:text-red-400' : 'text-neutral-900 dark:text-neutral-100'
              }`}
            >
              {overdueCount}
            </span>
            <span className="text-xs text-neutral-500 dark:text-neutral-400">Requires attention</span>
          </div>
        </div>

        <div className="rounded-xl border border-neutral-200 dark:border-zinc-800 bg-white dark:bg-[#0A0A0C] p-4">
          <div className="text-xs font-medium text-neutral-500 dark:text-neutral-400">Active Projects</div>
          <div className="mt-1.5 flex items-baseline justify-between">
            <span className="text-2xl font-display font-bold tabular-nums text-sky-600 dark:text-sky-400">
              {myProjectIds.size}
            </span>
            <span className="text-xs text-neutral-500 dark:text-neutral-400">Owned or member</span>
          </div>
        </div>

        <div className="rounded-xl border border-neutral-200 dark:border-zinc-800 bg-white dark:bg-[#0A0A0C] p-4">
          <div className="text-xs font-medium text-neutral-500 dark:text-neutral-400">LMS Certifications</div>
          <div className="mt-1.5 flex items-baseline justify-between">
            <span className="text-2xl font-display font-bold tabular-nums text-amber-600 dark:text-amber-400">
              {activeEnrollments.filter((e) => e.passed).length}
            </span>
            <span className="text-xs text-neutral-500 dark:text-neutral-400 tabular-nums">
              of {activeEnrollments.length} enrolled
            </span>
          </div>
        </div>
      </div>

      {/* Main Content Split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: My Project Tasks + Recent Project Activity */}
        <div className="lg:col-span-8 space-y-6">
          <section className="rounded-xl border border-neutral-200 dark:border-zinc-800 bg-white dark:bg-[#0A0A0C] overflow-hidden">
            <div className="px-5 py-4 border-b border-neutral-200 dark:border-zinc-800 flex items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-display font-semibold text-neutral-900 dark:text-neutral-100">
                  My Project Tasks
                </h2>
                <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                  Tasks assigned to {currentUser.fullName} across active projects
                </p>
              </div>
              {canView('tasks') && (
                <button
                  type="button"
                  onClick={() => onNavigateModule('tasks')}
                  className="inline-flex items-center gap-1 text-xs font-medium text-sky-600 dark:text-sky-400 hover:underline whitespace-nowrap"
                >
                  <span>View all tasks</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {myTasks.length > 0 ? (
              <div className="divide-y divide-neutral-100 dark:divide-zinc-800/80">
                {myTasks.map((task) => {
                  const project = state.projects.find((p) => p.id === task.projectId);
                  const overdue = isTaskOverdue(task);
                  return (
                    <button
                      key={task.id}
                      type="button"
                      onClick={() => onOpenTaskDrawer(task.id)}
                      className={`w-full text-left px-5 py-3.5 flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 transition-colors ${
                        overdue
                          ? 'bg-red-50/60 dark:bg-red-950/20 hover:bg-red-50 dark:hover:bg-red-950/35'
                          : 'hover:bg-neutral-50 dark:hover:bg-zinc-900/60'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          {overdue && <AlertTriangle className="h-3.5 w-3.5 text-red-600 dark:text-red-400 shrink-0" />}
                          <span
                            className={`text-sm font-medium truncate ${
                              overdue ? 'text-red-900 dark:text-red-200' : 'text-neutral-900 dark:text-neutral-100'
                            }`}
                          >
                            {task.title}
                          </span>
                        </div>
                        <div className="mt-1 flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
                          <span className="truncate">{project?.name ?? 'Project'}</span>
                          <span>·</span>
                          <span
                            className={`inline-flex items-center gap-1 font-mono-tabular ${
                              overdue ? 'text-red-600 dark:text-red-400 font-semibold' : ''
                            }`}
                          >
                            <Calendar className="h-3 w-3" />
                            Due {task.dueDate}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <PriorityBadge priority={task.priority} />
                        <TaskStatusBadge status={task.status} />
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="p-8 text-center space-y-2">
                <p className="text-sm text-neutral-500 dark:text-neutral-400">
                  No project tasks assigned yet.
                </p>
                {canView('projects') && (
                  <button
                    type="button"
                    onClick={() => onNavigateModule('projects')}
                    className="inline-flex items-center gap-1 text-xs font-medium text-sky-600 dark:text-sky-400 hover:underline"
                  >
                    Create your first project <ArrowRight className="h-3 w-3" />
                  </button>
                )}
              </div>
            )}
          </section>

          <section className="rounded-xl border border-neutral-200 dark:border-zinc-800 bg-white dark:bg-[#0A0A0C] overflow-hidden">
            <div className="px-5 py-4 border-b border-neutral-200 dark:border-zinc-800 flex items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-display font-semibold text-neutral-900 dark:text-neutral-100">
                  Recent Project Activity
                </h2>
                <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                  Scoped to projects you own, manage, or participate in
                </p>
              </div>
              {canView('projects') && (
                <button
                  type="button"
                  onClick={() => onNavigateModule('projects')}
                  className="inline-flex items-center gap-1 text-xs font-medium text-sky-600 dark:text-sky-400 hover:underline whitespace-nowrap"
                >
                  <span>Open Projects</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {recentProjectActivity.length > 0 ? (
              <div className="divide-y divide-neutral-100 dark:divide-zinc-800/80">
                {recentProjectActivity.map((evt) => {
                  const project = state.projects.find((p) => p.id === evt.projectId);
                  const actor = state.users.find((u) => u.id === evt.actorId);
                  return (
                    <div
                      key={evt.id}
                      onClick={() => evt.taskId && onOpenTaskDrawer(evt.taskId)}
                      className={`px-5 py-3.5 flex items-start gap-3 ${
                        evt.taskId ? 'hover:bg-neutral-50 dark:hover:bg-zinc-900/60 cursor-pointer' : ''
                      }`}
                    >
                      <UserAvatar
                        name={actor?.fullName ?? 'Team'}
                        avatarUrl={actor?.avatarUrl}
                        size="sm"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100 truncate">
                            {evt.title}
                          </span>
                          <span className="text-[11px] font-mono-tabular text-neutral-400 whitespace-nowrap shrink-0">
                            {evt.timestamp.slice(0, 10)}
                          </span>
                        </div>
                        <p className="text-xs text-neutral-600 dark:text-neutral-400 mt-0.5 line-clamp-2">
                          {evt.detail}
                        </p>
                        <div className="mt-1 text-[11px] text-neutral-400 dark:text-neutral-500">
                          {project?.name} · {actor?.fullName ?? 'Unassigned'}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-8 text-center text-sm text-neutral-500 dark:text-neutral-400">
                No recent updates across your projects.
              </div>
            )}
          </section>
        </div>

        {/* Right: Pinned Announcements Feed */}
        <section className="lg:col-span-4 rounded-xl border border-neutral-200 dark:border-zinc-800 bg-white dark:bg-[#0A0A0C] overflow-hidden">
          <div className="px-5 py-4 border-b border-neutral-200 dark:border-zinc-800 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Megaphone className="h-4 w-4 text-amber-500" />
              <h2 className="text-base font-display font-semibold text-neutral-900 dark:text-neutral-100">
                Pinned Announcements
              </h2>
            </div>
            {canView('announcements') && (
              <button
                type="button"
                onClick={() => onNavigateModule('announcements')}
                className="text-xs font-medium text-sky-600 dark:text-sky-400 hover:underline whitespace-nowrap"
              >
                Manage
              </button>
            )}
          </div>

          {pinnedAnnouncements.length > 0 ? (
            <div className="divide-y divide-neutral-100 dark:divide-zinc-800/80">
              {pinnedAnnouncements.map((ann) => {
                const author = state.users.find((u) => u.id === ann.authorId);
                return (
                  <article key={ann.id} className="p-5">
                    <div className="flex items-center justify-between gap-2 text-xs text-neutral-500 dark:text-neutral-400">
                      <span className="inline-flex items-center gap-1 font-medium text-amber-600 dark:text-amber-400">
                        <Pin className="h-3 w-3" />
                        {ann.category}
                      </span>
                      <span className="font-mono-tabular">{ann.createdAt.slice(0, 10)}</span>
                    </div>
                    <h3 className="mt-1.5 text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                      {ann.title}
                    </h3>
                    <p className="mt-1.5 text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed">
                      {ann.body}
                    </p>
                    <div className="mt-3 flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
                      <UserAvatar name={author?.fullName ?? 'Admin'} avatarUrl={author?.avatarUrl} size="xs" />
                      <span>{author?.fullName ?? 'Administrator'}</span>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="p-8 text-center space-y-2">
              <p className="text-sm text-neutral-500 dark:text-neutral-400">
                No pinned announcements yet.
              </p>
              {canView('announcements') && (
                <button
                  type="button"
                  onClick={() => onNavigateModule('announcements')}
                  className="text-xs font-medium text-sky-600 dark:text-sky-400 hover:underline"
                >
                  Post an announcement →
                </button>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
