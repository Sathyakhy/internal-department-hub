import React, { useMemo, useState } from 'react';
import { Award, CheckCircle2, Circle, Compass, FolderKanban, Plus, Trash2 } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { ModuleId } from '../../types';
import { downloadExcelTemplate } from '../../utils/excel';
import { hasJoinedOverMonths } from '../../utils/tenure';
import { ExcelImportActions } from '../common/ExcelImportActions';
import { UserAvatar } from '../common/UserAvatar';
import { TaskStatusBadge } from '../common/StatusBadge';

interface OnboardingHubViewProps {
  onOpenTaskDrawer: (taskId: string) => void;
  onNavigateModule: (mod: ModuleId) => void;
}

export const OnboardingHubView: React.FC<OnboardingHubViewProps> = ({
  onOpenTaskDrawer,
  onNavigateModule,
}) => {
  const {
    state,
    currentUser,
    canEdit,
    toggleOnboardingItem,
    createOnboardingItem,
    deleteOnboardingItem,
    importOnboardingItems,
    notify,
  } = useAppStore();

  const [selectedUserId, setSelectedUserId] = useState<string>(currentUser.id);
  const [newItemTitle, setNewItemTitle] = useState('');
  const [newItemCategory, setNewItemCategory] = useState<'IT & Access' | 'HR & Compliance' | 'Team & Tooling' | 'Architecture'>('Team & Tooling');

  const targetUser = useMemo(
    () => state.users.find((u) => u.id === selectedUserId) ?? currentUser,
    [state.users, selectedUserId, currentUser]
  );

  const editableChecklist = canEdit('onboarding');
  const canToggleForUser = editableChecklist || targetUser.id === currentUser.id;

  const sortedItems = useMemo(
    () => [...state.onboardingItems].sort((a, b) => a.order - b.order),
    [state.onboardingItems]
  );

  const completedCount = sortedItems.filter((item) =>
    targetUser.onboardingCompletedIds.includes(item.id)
  ).length;
  const checklistPct = sortedItems.length > 0 ? Math.round((completedCount / sortedItems.length) * 100) : 0;

  const assignedEnrollments = useMemo(
    () => state.enrollments.filter((e) => e.userId === targetUser.id),
    [state.enrollments, targetUser.id]
  );

  const initialTasks = useMemo(
    () => state.tasks.filter((t) => t.assigneeId === targetUser.id && !t.archived),
    [state.tasks, targetUser.id]
  );

  const mentor = state.users.find((u) => u.id === targetUser.mentorId);
  const manager = state.users.find((u) => u.id === targetUser.managerId);

  const handleAddChecklistItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editableChecklist || !newItemTitle.trim()) return;
    createOnboardingItem({
      title: newItemTitle.trim(),
      description: 'Required department onboarding step.',
      category: newItemCategory,
      order: state.onboardingItems.length + 1,
    });
    setNewItemTitle('');
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-neutral-200 dark:border-zinc-800 bg-white dark:bg-[#0A0A0C] p-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <UserAvatar name={targetUser.fullName} avatarUrl={targetUser.avatarUrl} size="lg" />
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-display font-bold text-neutral-900 dark:text-neutral-100">
                {targetUser.fullName} — Onboarding Hub
              </h2>
              {targetUser.isNewJoiner ? (
                <span className="text-xs font-medium text-sky-600 dark:text-sky-400">
                  · New Joiner Cohort
                </span>
              ) : (
                hasJoinedOverMonths(targetUser.startDate, 3) && (
                  <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                    · Auto-completed (3+ months tenure)
                  </span>
                )
              )}
            </div>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
              Start Date: <span className="font-mono-tabular">{targetUser.startDate}</span>
              {manager && <> · Manager: {manager.fullName}</>}
              {mentor && <> · Mentor: {mentor.fullName}</>}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-xs text-neutral-500 dark:text-neutral-400">Checklist Progress</div>
            <div className="text-lg font-display font-bold tabular-nums text-sky-600 dark:text-sky-400">
              {completedCount}/{sortedItems.length} ({checklistPct}%)
            </div>
          </div>
          {editableChecklist && (
            <select
              value={targetUser.id}
              onChange={(e) => setSelectedUserId(e.target.value)}
              className="rounded-lg border border-neutral-200 dark:border-zinc-800 bg-neutral-50 dark:bg-black px-3 py-2 text-xs font-medium text-neutral-800 dark:text-neutral-200"
              aria-label="Inspect staff onboarding"
            >
              {state.users
                .filter((u) => u.isActive)
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.fullName} {u.isNewJoiner ? '(New Joiner)' : ''}
                  </option>
                ))}
            </select>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Pillar 1: Onboarding Checklist */}
        <section className="lg:col-span-5 rounded-xl border border-neutral-200 dark:border-zinc-800 bg-white dark:bg-[#0A0A0C] overflow-hidden">
          <div className="px-5 py-4 border-b border-neutral-200 dark:border-zinc-800 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Compass className="h-4 w-4 text-sky-600 dark:text-sky-400" />
              <h3 className="text-sm font-display font-semibold text-neutral-900 dark:text-neutral-100">
                Onboarding Checklist
              </h3>
            </div>
            <div className="flex items-center gap-2.5">
              {editableChecklist && (
                <ExcelImportActions
                  compact
                  templateTitle="Download Onboarding Checklist Template (.xlsx)"
                  importTitle="Import Onboarding Steps from Excel (.xlsx / .csv)"
                  onDownloadTemplate={() =>
                    downloadExcelTemplate('onboarding-import-template.xlsx', 'Onboarding', [
                      { header: 'Title', example: 'Configure VPN & SSH Keys', width: 28 },
                      { header: 'Category', example: 'IT & Access', width: 18 },
                      { header: 'Description', example: 'Set up company VPN access and register hardware key.', width: 45 },
                      { header: 'Order', example: 1, width: 10 },
                    ])
                  }
                  onImportRows={importOnboardingItems}
                  onError={(msg) => notify(msg, 'error')}
                />
              )}
              <span className="text-xs font-mono-tabular text-neutral-500">{checklistPct}%</span>
            </div>
          </div>

          <div className="w-full h-1.5 bg-neutral-100 dark:bg-zinc-900">
            <div
              className="h-full bg-sky-600 transition-all duration-200"
              style={{ width: `${checklistPct}%` }}
            />
          </div>

          {sortedItems.length > 0 ? (
            <div className="divide-y divide-neutral-100 dark:divide-zinc-800/80">
              {sortedItems.map((item) => {
                const checked = targetUser.onboardingCompletedIds.includes(item.id);
                return (
                  <div key={item.id} className="p-4 flex items-start justify-between gap-3">
                    <button
                      type="button"
                      disabled={!canToggleForUser}
                      onClick={() => toggleOnboardingItem(targetUser.id, item.id)}
                      className="flex items-start gap-3 text-left flex-1 disabled:opacity-70"
                    >
                      {checked ? (
                        <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                      ) : (
                        <Circle className="h-5 w-5 text-neutral-300 dark:text-zinc-700 shrink-0 mt-0.5" />
                      )}
                      <div>
                        <div
                          className={`text-sm font-medium ${
                            checked
                              ? 'line-through text-neutral-400 dark:text-zinc-500'
                              : 'text-neutral-900 dark:text-neutral-100'
                          }`}
                        >
                          {item.title}
                        </div>
                        <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">{item.description}</p>
                        <span className="inline-block mt-1 text-[11px] text-neutral-400">{item.category}</span>
                      </div>
                    </button>
                    {editableChecklist && (
                      <button
                        type="button"
                        onClick={() => deleteOnboardingItem(item.id)}
                        className="text-neutral-400 hover:text-red-600 p-1"
                        aria-label="Delete checklist item"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-6 text-center text-xs text-neutral-500 dark:text-neutral-400">
              No onboarding checklist steps defined yet.
            </div>
          )}

          {editableChecklist && (
            <form
              onSubmit={handleAddChecklistItem}
              className="p-4 border-t border-neutral-200 dark:border-zinc-800 bg-neutral-50 dark:bg-black space-y-2"
            >
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newItemTitle}
                  onChange={(e) => setNewItemTitle(e.target.value)}
                  placeholder="Add new checklist step..."
                  className="flex-1 rounded-lg border border-neutral-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-3 py-1.5 text-xs text-neutral-900 dark:text-neutral-100"
                />
                <select
                  value={newItemCategory}
                  onChange={(e) => setNewItemCategory(e.target.value as typeof newItemCategory)}
                  className="rounded-lg border border-neutral-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-2 py-1.5 text-xs text-neutral-800 dark:text-neutral-200"
                >
                  <option value="IT & Access">IT & Access</option>
                  <option value="HR & Compliance">HR & Compliance</option>
                  <option value="Team & Tooling">Team & Tooling</option>
                  <option value="Architecture">Architecture</option>
                </select>
                <button
                  type="submit"
                  disabled={!newItemTitle.trim()}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-medium disabled:opacity-40"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add
                </button>
              </div>
            </form>
          )}
        </section>

        {/* Pillar 2: Auto-Assigned LMS Courses */}
        <section className="lg:col-span-4 rounded-xl border border-neutral-200 dark:border-zinc-800 bg-white dark:bg-[#0A0A0C] overflow-hidden">
          <div className="px-5 py-4 border-b border-neutral-200 dark:border-zinc-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Award className="h-4 w-4 text-amber-500" />
              <h3 className="text-sm font-display font-semibold text-neutral-900 dark:text-neutral-100">
                Auto-Assigned Training
              </h3>
            </div>
            <button
              type="button"
              onClick={() => onNavigateModule('learning')}
              className="text-xs font-medium text-sky-600 dark:text-sky-400 hover:underline"
            >
              Open LMS
            </button>
          </div>

          {assignedEnrollments.length > 0 ? (
            <div className="divide-y divide-neutral-100 dark:divide-zinc-800/80">
              {assignedEnrollments.map((enr) => {
                const course = state.courses.find((c) => c.id === enr.courseId);
                if (!course) return null;
                const totalLessons = course.modules.reduce((acc, m) => acc + m.lessons.length, 0);
                const lessonPct =
                  totalLessons > 0 ? Math.round((enr.completedLessonIds.length / totalLessons) * 100) : 0;
                return (
                  <div key={enr.id} className="p-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                          {course.title}
                        </div>
                        <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                          {course.category} · {course.autoAssignNewJoiners ? 'Auto-assigned' : 'Enrolled'}
                        </div>
                      </div>
                      <span
                        className={`text-xs font-medium whitespace-nowrap ${
                          enr.passed ? 'text-amber-600 dark:text-amber-400' : 'text-sky-600 dark:text-sky-400'
                        }`}
                      >
                        {enr.passed ? 'Certified' : `${lessonPct}%`}
                      </span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-neutral-100 dark:bg-zinc-900 overflow-hidden">
                      <div
                        className={`h-full ${enr.passed ? 'bg-amber-500' : 'bg-sky-600'}`}
                        style={{ width: `${enr.passed ? 100 : lessonPct}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-[11px] font-mono-tabular text-neutral-400">
                        {enr.completedLessonIds.length}/{totalLessons} lessons
                      </span>
                      <button
                        type="button"
                        onClick={() => onNavigateModule('learning')}
                        className="text-xs font-medium text-sky-600 dark:text-sky-400 hover:underline"
                      >
                        {enr.passed ? 'View Certificate' : 'Continue Course'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-6 text-center text-xs text-neutral-500 dark:text-neutral-400">
              No LMS courses assigned yet.
            </div>
          )}
        </section>

        {/* Pillar 3: Initial Project Assignments */}
        <section className="lg:col-span-3 rounded-xl border border-neutral-200 dark:border-zinc-800 bg-white dark:bg-[#0A0A0C] overflow-hidden">
          <div className="px-5 py-4 border-b border-neutral-200 dark:border-zinc-800 flex items-center gap-2">
            <FolderKanban className="h-4 w-4 text-sky-600 dark:text-sky-400" />
            <h3 className="text-sm font-display font-semibold text-neutral-900 dark:text-neutral-100">
              Starter Tasks ({initialTasks.length})
            </h3>
          </div>

          {initialTasks.length > 0 ? (
            <div className="divide-y divide-neutral-100 dark:divide-zinc-800/80">
              {initialTasks.map((t) => {
                const proj = state.projects.find((p) => p.id === t.projectId);
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => onOpenTaskDrawer(t.id)}
                    className="w-full text-left p-4 hover:bg-neutral-50 dark:hover:bg-zinc-900/60 transition-colors space-y-1.5"
                  >
                    <div className="text-sm font-medium text-neutral-900 dark:text-neutral-100 line-clamp-2">
                      {t.title}
                    </div>
                    <div className="text-xs text-neutral-500 dark:text-neutral-400 truncate">
                      {proj?.name}
                    </div>
                    <div className="flex items-center justify-between gap-2 pt-1">
                      <span className="text-[11px] font-mono-tabular text-neutral-400">Due {t.dueDate}</span>
                      <TaskStatusBadge status={t.status} />
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="p-6 text-center text-xs text-neutral-500 dark:text-neutral-400">
              No initial project tasks assigned yet.
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
