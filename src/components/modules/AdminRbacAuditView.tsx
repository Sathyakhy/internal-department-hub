import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Plus, Search, Shield, Trash2, X } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { ModuleId, PermissionLevel } from '../../types';
import { ALL_MODULES, createPermissions } from '../../utils/rbac';
import { UserAvatar } from '../common/UserAvatar';

type AdminTab = 'rbac' | 'audit';

export const AdminRbacAuditView: React.FC = () => {
  const { state, canEdit, createRole, updateRole, deleteRole, updateStaff } = useAppStore();
  const editable = canEdit('admin');

  const [tab, setTab] = useState<AdminTab>('rbac');
  const [selectedRoleId, setSelectedRoleId] = useState<string>(state.roles[0]?.id ?? '');
  const [roleModalOpen, setRoleModalOpen] = useState(false);
  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleDesc, setNewRoleDesc] = useState('');

  // Audit Log Filters & Diff Expand
  const [auditQuery, setAuditQuery] = useState('');
  const [actionFilter, setActionFilter] = useState<'ALL' | 'CREATE' | 'UPDATE' | 'DELETE'>('ALL');
  const [moduleFilter, setModuleFilter] = useState<ModuleId | 'all'>('all');
  const [expandedLogIds, setExpandedLogIds] = useState<Set<string>>(new Set());

  const selectedRole = state.roles.find((r) => r.id === selectedRoleId) ?? state.roles[0];

  const filteredLogs = useMemo(() => {
    const q = auditQuery.trim().toLowerCase();
    return state.auditLogs
      .filter((l) => (actionFilter === 'ALL' ? true : l.action === actionFilter))
      .filter((l) => (moduleFilter === 'all' ? true : l.module === moduleFilter))
      .filter((l) => {
        if (!q) return true;
        return (
          l.actorName.toLowerCase().includes(q) ||
          l.summary.toLowerCase().includes(q) ||
          l.recordId.toLowerCase().includes(q) ||
          l.table.toLowerCase().includes(q)
        );
      });
  }, [state.auditLogs, actionFilter, moduleFilter, auditQuery]);

  const toggleExpandLog = (id: string) => {
    setExpandedLogIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handlePermissionChange = (modId: ModuleId, level: PermissionLevel) => {
    if (!editable || !selectedRole) return;
    updateRole(selectedRole.id, {
      permissions: {
        ...selectedRole.permissions,
        [modId]: level,
      },
    });
  };

  const handleToggleUserRole = (userId: string, roleId: string) => {
    if (!editable) return;
    const u = state.users.find((usr) => usr.id === userId);
    if (!u) return;
    const has = u.roleIds.includes(roleId);
    const next = has ? u.roleIds.filter((r) => r !== roleId) : [...u.roleIds, roleId];
    updateStaff(userId, { roleIds: next });
  };

  return (
    <div className="space-y-5">
      {/* Sub-Tabs */}
      <div className="rounded-xl border border-neutral-200 dark:border-zinc-800 bg-white dark:bg-[#0A0A0C] p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 p-1 bg-neutral-100 dark:bg-zinc-900 rounded-lg">
          <button
            type="button"
            onClick={() => setTab('rbac')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              tab === 'rbac'
                ? 'bg-white dark:bg-black text-neutral-900 dark:text-neutral-100 shadow-sm'
                : 'text-neutral-600 dark:text-neutral-400'
            }`}
          >
            RBAC Roles & Matrix
          </button>
          <button
            type="button"
            onClick={() => setTab('audit')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              tab === 'audit'
                ? 'bg-white dark:bg-black text-neutral-900 dark:text-neutral-100 shadow-sm'
                : 'text-neutral-600 dark:text-neutral-400'
            }`}
          >
            Audit Logs ({state.auditLogs.length})
          </button>
        </div>

        {tab === 'rbac' && editable && (
          <button
            type="button"
            onClick={() => setRoleModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-medium"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Create Custom Role</span>
          </button>
        )}
      </div>

      {/* TAB 1: RBAC ROLES MATRIX */}
      {tab === 'rbac' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Role List */}
          <div className="lg:col-span-4 rounded-xl border border-neutral-200 dark:border-zinc-800 bg-white dark:bg-[#0A0A0C] divide-y divide-neutral-100 dark:divide-zinc-800 overflow-hidden">
            {state.roles.map((role) => {
              const isSelected = selectedRole?.id === role.id;
              const holderCount = state.users.filter((u) => u.roleIds.includes(role.id)).length;
              return (
                <div
                  key={role.id}
                  onClick={() => setSelectedRoleId(role.id)}
                  className={`p-4 cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-sky-50/60 dark:bg-sky-500/10'
                      : 'hover:bg-neutral-50 dark:hover:bg-zinc-900/60'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Shield className={`h-4 w-4 ${isSelected ? 'text-sky-600 dark:text-sky-400' : 'text-neutral-400'}`} />
                      <span className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                        {role.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono-tabular text-neutral-500">{holderCount} users</span>
                      {editable && !role.isSystem && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteRole(role.id);
                          }}
                          className="text-neutral-400 hover:text-red-600 dark:hover:text-red-400 p-0.5"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                  <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed">
                    {role.description}
                  </p>
                </div>
              );
            })}
          </div>

          {/* Right: 13-Module Permission Matrix + User Role Assignments */}
          {selectedRole && (
            <div className="lg:col-span-8 space-y-6">
              <div className="rounded-xl border border-neutral-200 dark:border-zinc-800 bg-white dark:bg-[#0A0A0C] overflow-hidden">
                <div className="px-5 py-4 border-b border-neutral-200 dark:border-zinc-800 flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-display font-semibold text-neutral-900 dark:text-neutral-100">
                      Module Permissions — {selectedRole.name}
                    </h3>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400">
                      Users with multiple roles inherit the union (highest privilege across roles).
                    </p>
                  </div>
                </div>

                <div className="divide-y divide-neutral-100 dark:divide-zinc-800">
                  {ALL_MODULES.map((mod) => {
                    const currentLevel = selectedRole.permissions[mod.id] ?? 'none';
                    return (
                      <div
                        key={mod.id}
                        className="px-5 py-3 flex flex-wrap items-center justify-between gap-3 text-sm"
                      >
                        <div>
                          <div className="font-medium text-neutral-900 dark:text-neutral-100">{mod.label}</div>
                          <div className="text-[11px] font-mono-tabular text-neutral-400">{mod.id}</div>
                        </div>

                        <div className="flex items-center gap-1 p-1 bg-neutral-100 dark:bg-zinc-900 rounded-lg">
                          {(['none', 'view', 'edit'] as PermissionLevel[]).map((lvl) => (
                            <button
                              key={lvl}
                              type="button"
                              disabled={!editable}
                              onClick={() => handlePermissionChange(mod.id, lvl)}
                              className={`px-3 py-1 rounded-md text-xs font-medium capitalize transition-colors disabled:opacity-60 ${
                                currentLevel === lvl
                                  ? lvl === 'edit'
                                    ? 'bg-sky-600 text-white'
                                    : lvl === 'view'
                                      ? 'bg-white dark:bg-black text-neutral-900 dark:text-neutral-100 shadow-sm'
                                      : 'bg-neutral-700 dark:bg-zinc-700 text-white'
                                  : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200'
                              }`}
                            >
                              {lvl}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Staff Role Assignment */}
              <div className="rounded-xl border border-neutral-200 dark:border-zinc-800 bg-white dark:bg-[#0A0A0C] p-5 space-y-3">
                <h4 className="text-sm font-display font-semibold text-neutral-900 dark:text-neutral-100">
                  Staff Assigned to &ldquo;{selectedRole.name}&rdquo;
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {state.users
                    .filter((u) => u.isActive)
                    .map((u) => {
                      const checked = u.roleIds.includes(selectedRole.id);
                      return (
                        <label
                          key={u.id}
                          className="flex items-center justify-between gap-2 rounded-lg border border-neutral-200 dark:border-zinc-800 px-3 py-2 text-xs cursor-pointer hover:bg-neutral-50 dark:hover:bg-zinc-900/60"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <UserAvatar name={u.fullName} avatarUrl={u.avatarUrl} size="xs" />
                            <span className="truncate font-medium text-neutral-800 dark:text-neutral-200">
                              {u.fullName}
                            </span>
                          </div>
                          <input
                            type="checkbox"
                            disabled={!editable}
                            checked={checked}
                            onChange={() => handleToggleUserRole(u.id, selectedRole.id)}
                            className="accent-sky-600"
                          />
                        </label>
                      );
                    })}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: AUDIT LOGS (/audit-logs) */}
      {tab === 'audit' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-neutral-200 dark:border-zinc-800 bg-white dark:bg-[#0A0A0C] p-4 flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="h-4 w-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={auditQuery}
                onChange={(e) => setAuditQuery(e.target.value)}
                placeholder="Search actor, summary, table, record ID..."
                className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-neutral-200 dark:border-zinc-800 bg-neutral-50 dark:bg-black text-neutral-900 dark:text-neutral-100"
              />
            </div>

            <select
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value as typeof actionFilter)}
              className="rounded-lg border border-neutral-200 dark:border-zinc-800 bg-white dark:bg-black px-3 py-2 text-xs text-neutral-900 dark:text-neutral-100"
            >
              <option value="ALL">All Actions</option>
              <option value="CREATE">CREATE</option>
              <option value="UPDATE">UPDATE</option>
              <option value="DELETE">DELETE</option>
            </select>

            <select
              value={moduleFilter}
              onChange={(e) => setModuleFilter(e.target.value as ModuleId | 'all')}
              className="rounded-lg border border-neutral-200 dark:border-zinc-800 bg-white dark:bg-black px-3 py-2 text-xs text-neutral-900 dark:text-neutral-100"
            >
              <option value="all">All Modules</option>
              {ALL_MODULES.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>

          <div className="rounded-xl border border-neutral-200 dark:border-zinc-800 bg-white dark:bg-[#0A0A0C] divide-y divide-neutral-100 dark:divide-zinc-800">
            {filteredLogs.map((log) => {
              const expanded = expandedLogIds.has(log.id);
              const actionCls =
                log.action === 'CREATE'
                  ? 'text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-400 dark:bg-amber-500/10 dark:border-amber-500/30'
                  : log.action === 'UPDATE'
                    ? 'text-sky-700 bg-sky-50 border-sky-200 dark:text-sky-400 dark:bg-sky-500/10 dark:border-sky-500/30'
                    : 'text-red-700 bg-red-50 border-red-200 dark:text-red-400 dark:bg-red-500/10 dark:border-red-500/30';

              return (
                <div key={log.id} className="p-4">
                  <button
                    type="button"
                    onClick={() => toggleExpandLog(log.id)}
                    className="w-full text-left flex flex-wrap items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {expanded ? (
                        <ChevronDown className="h-4 w-4 text-neutral-400 shrink-0" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-neutral-400 shrink-0" />
                      )}
                      <span className={`rounded border px-2 py-0.5 text-[11px] font-mono-tabular font-semibold ${actionCls}`}>
                        {log.action}
                      </span>
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-neutral-900 dark:text-neutral-100 truncate">
                          {log.summary}
                        </div>
                        <div className="text-xs text-neutral-500 dark:text-neutral-400">
                          Actor: <strong className="font-medium text-neutral-700 dark:text-neutral-300">{log.actorName}</strong> · Module:{' '}
                          <span className="font-mono-tabular">{log.module}</span> · Table:{' '}
                          <span className="font-mono-tabular">{log.table}</span> · ID:{' '}
                          <span className="font-mono-tabular">{log.recordId}</span>
                        </div>
                      </div>
                    </div>

                    <span className="text-xs font-mono-tabular text-neutral-400 shrink-0">
                      {log.timestamp.replace('T', ' ').slice(0, 19)}
                    </span>
                  </button>

                  {expanded && (
                    <div className="mt-3 pt-3 border-t border-neutral-100 dark:border-zinc-800 grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="rounded-lg border border-neutral-200 dark:border-zinc-800 bg-neutral-50 dark:bg-black p-3">
                        <div className="text-[11px] font-mono-tabular font-semibold text-neutral-500 mb-1.5">
                          BEFORE STATE
                        </div>
                        <pre className="text-[11px] font-mono-tabular text-neutral-700 dark:text-neutral-300 overflow-x-auto max-h-60">
                          {log.before ? JSON.stringify(log.before, null, 2) : 'null'}
                        </pre>
                      </div>
                      <div className="rounded-lg border border-neutral-200 dark:border-zinc-800 bg-neutral-50 dark:bg-black p-3">
                        <div className="text-[11px] font-mono-tabular font-semibold text-neutral-500 mb-1.5">
                          AFTER STATE
                        </div>
                        <pre className="text-[11px] font-mono-tabular text-neutral-700 dark:text-neutral-300 overflow-x-auto max-h-60">
                          {log.after ? JSON.stringify(log.after, null, 2) : 'null'}
                        </pre>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {filteredLogs.length === 0 && (
              <div className="p-10 text-center text-sm text-neutral-500 dark:text-neutral-400">
                {state.auditLogs.length === 0
                  ? 'No audit activity recorded yet. Changes across the workspace will appear here.'
                  : 'No audit log entries match your filters.'}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Create Role Modal */}
      {roleModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/65" onClick={() => setRoleModalOpen(false)} />
          <div className="relative z-10 w-full max-w-md rounded-xl border border-neutral-200 dark:border-zinc-800 bg-white dark:bg-[#0A0A0C] p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-display font-semibold text-neutral-900 dark:text-neutral-100">
                Create Custom RBAC Role
              </h3>
              <button type="button" onClick={() => setRoleModalOpen(false)} className="text-neutral-400 hover:text-neutral-200">
                <X className="h-4 w-4" />
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!newRoleName.trim()) return;
                createRole({
                  name: newRoleName.trim(),
                  description: newRoleDesc.trim() || 'Custom department role',
                  permissions: createPermissions({ dashboard: 'view', profile: 'edit' }, 'none'),
                });
                setNewRoleName('');
                setNewRoleDesc('');
                setRoleModalOpen(false);
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1">Role Name</label>
                <input
                  required
                  type="text"
                  value={newRoleName}
                  onChange={(e) => setNewRoleName(e.target.value)}
                  placeholder="e.g. Compliance Auditor"
                  className="w-full rounded-lg border border-neutral-200 dark:border-zinc-800 bg-white dark:bg-black px-3 py-2 text-sm text-neutral-900 dark:text-neutral-100"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1">Description</label>
                <textarea
                  rows={2}
                  value={newRoleDesc}
                  onChange={(e) => setNewRoleDesc(e.target.value)}
                  className="w-full rounded-lg border border-neutral-200 dark:border-zinc-800 bg-white dark:bg-black px-3 py-2 text-sm text-neutral-900 dark:text-neutral-100"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setRoleModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-neutral-200 dark:border-zinc-800 text-xs font-medium text-neutral-700 dark:text-neutral-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-medium"
                >
                  Create Role
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
