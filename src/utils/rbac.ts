import { ModuleId, ModulePermissions, PermissionLevel, Role, Task, User } from '../types';

export const ALL_MODULES: { id: ModuleId; label: string; group: 'Core' | 'Workspace' | 'People' | 'Administration' }[] = [
  { id: 'dashboard', label: 'Dashboard', group: 'Core' },
  { id: 'onboarding', label: 'Onboarding Hub', group: 'Core' },
  { id: 'projects', label: 'Projects', group: 'Workspace' },
  { id: 'tasks', label: 'My Tasks', group: 'Workspace' },
  { id: 'learning', label: 'Learning (LMS)', group: 'Workspace' },
  { id: 'announcements', label: 'Announcements', group: 'Workspace' },
  { id: 'staff', label: 'Staff Directory', group: 'People' },
  { id: 'positions', label: 'Positions Catalog', group: 'People' },
  { id: 'org-chart', label: 'Org Chart', group: 'People' },
  { id: 'profile', label: 'My Profile', group: 'People' },
  { id: 'project-config', label: 'Project Config', group: 'Administration' },
  { id: 'admin', label: 'RBAC & Audit Logs', group: 'Administration' },
  { id: 'settings', label: 'Settings', group: 'Administration' },
];

const LEVEL_RANK: Record<PermissionLevel, number> = {
  none: 0,
  view: 1,
  edit: 2,
};

export function createPermissions(overrides: Partial<ModulePermissions>, fallback: PermissionLevel = 'none'): ModulePermissions {
  const result = {} as ModulePermissions;
  for (const mod of ALL_MODULES) {
    result[mod.id] = overrides[mod.id] ?? fallback;
  }
  return result;
}

export function getEffectivePermission(user: User | undefined, roles: Role[], moduleId: ModuleId): PermissionLevel {
  if (!user) return 'none';
  let best: PermissionLevel = 'none';
  for (const roleId of user.roleIds) {
    const role = roles.find((r) => r.id === roleId);
    if (!role) continue;
    const perm = role.permissions[moduleId] ?? 'none';
    if (LEVEL_RANK[perm] > LEVEL_RANK[best]) {
      best = perm;
    }
  }
  return best;
}

export function canViewModule(user: User | undefined, roles: Role[], moduleId: ModuleId): boolean {
  return LEVEL_RANK[getEffectivePermission(user, roles, moduleId)] >= LEVEL_RANK.view;
}

export function canEditModule(user: User | undefined, roles: Role[], moduleId: ModuleId): boolean {
  return LEVEL_RANK[getEffectivePermission(user, roles, moduleId)] >= LEVEL_RANK.edit;
}

/**
 * Checks whether adding `candidatePredecessorId` as a predecessor of `taskId`
 * would introduce a circular dependency in the directed dependency graph.
 */
export function wouldCreateCircularDependency(
  tasks: Task[],
  taskId: string,
  candidatePredecessorId: string
): boolean {
  if (taskId === candidatePredecessorId) return true;
  // Build reverse adjacency: predecessor -> dependents (successors)
  // Adding candidatePredecessorId -> taskId creates a cycle iff taskId can already reach candidatePredecessorId
  const successorsMap = new Map<string, string[]>();
  for (const t of tasks) {
    for (const predId of t.predecessorIds) {
      const list = successorsMap.get(predId) ?? [];
      list.push(t.id);
      successorsMap.set(predId, list);
    }
  }

  const visited = new Set<string>();
  const queue: string[] = [taskId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current === candidatePredecessorId) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    const nexts = successorsMap.get(current) ?? [];
    for (const n of nexts) {
      if (!visited.has(n)) queue.push(n);
    }
  }
  return false;
}

export interface ScheduleConflict {
  predecessorId: string;
  predecessorTitle: string;
  predecessorDueDate: string;
  successorStartDate: string;
}

/**
 * Non-blocking schedule conflict detector:
 * Flags when a successor starts strictly before a predecessor finishes.
 */
export function getTaskScheduleConflicts(task: Task, allTasks: Task[]): ScheduleConflict[] {
  if (!task.predecessorIds.length || !task.startDate) return [];
  const conflicts: ScheduleConflict[] = [];
  for (const predId of task.predecessorIds) {
    const pred = allTasks.find((t) => t.id === predId);
    if (pred && pred.dueDate && task.startDate < pred.dueDate) {
      conflicts.push({
        predecessorId: pred.id,
        predecessorTitle: pred.title,
        predecessorDueDate: pred.dueDate,
        successorStartDate: task.startDate,
      });
    }
  }
  return conflicts;
}

export function isTaskOverdue(task: Task, todayStr = new Date().toISOString().slice(0, 10)): boolean {
  return task.status !== 'done' && !task.archived && Boolean(task.dueDate) && task.dueDate < todayStr;
}

export function downloadCsv(filename: string, headers: string[], rows: (string | number | boolean | null | undefined)[][]) {
  const escapeCell = (val: string | number | boolean | null | undefined) => {
    const str = val === null || val === undefined ? '' : String(val);
    if (/[",\n]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };
  const csvContent = [headers.map(escapeCell).join(','), ...rows.map((r) => r.map(escapeCell).join(','))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
