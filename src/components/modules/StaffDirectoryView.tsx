import React, { useMemo, useState } from 'react';
import { Award, Briefcase, Edit2, Mail, Plus, Search, Trash2, UserPlus, X } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { PositionHistoryChangeType, PositionHistoryEntry, User } from '../../types';
import { downloadExcelTemplate } from '../../utils/excel';
import { sortPositionsByRank, sortUsersByRankAndJoinDate } from '../../utils/orgSort';
import { formatMonthYear, formatTenure, hasJoinedOverMonths } from '../../utils/tenure';
import { ExcelImportActions } from '../common/ExcelImportActions';
import { ImageUploadField } from '../common/ImageUploadField';
import { UserAvatar } from '../common/UserAvatar';

function sortHistoryNewestFirst(entries: PositionHistoryEntry[]): PositionHistoryEntry[] {
  return [...entries].sort((a, b) => {
    if (a.isCurrent !== b.isCurrent) return a.isCurrent ? -1 : 1;
    const startDiff = (b.startDate || '').localeCompare(a.startDate || '');
    if (startDiff !== 0) return startDiff;
    return (b.endDate || '').localeCompare(a.endDate || '');
  });
}

export const StaffDirectoryView: React.FC = () => {
  const { state, currentUser, canEdit, createStaff, updateStaff, deleteStaff, importStaff, notify } = useAppStore();
  const [query, setQuery] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);

  const [form, setForm] = useState({
    fullName: '',
    email: '',
    password: 'password123',
    avatarUrl: '',
    department: 'General',
    location: 'HQ',
    phone: '',
    bio: '',
    positionId: state.positions[0]?.id ?? '',
    managerId: '' as string,
    mentorId: '' as string,
    startDate: new Date().toISOString().slice(0, 10),
    isActive: true,
    isNewJoiner: true,
    roleIds: ['role-joiner'] as string[],
    positionHistory: [] as PositionHistoryEntry[],
  });

  const [historyFormOpen, setHistoryFormOpen] = useState(false);
  const [editingHistoryId, setEditingHistoryId] = useState<string | null>(null);
  const [historyDraft, setHistoryDraft] = useState<{
    positionId: string;
    title: string;
    department: string;
    changeType: PositionHistoryChangeType;
    startDate: string;
    endDate: string;
    isCurrent: boolean;
    notes: string;
    syncCurrentRole: boolean;
  }>({
    positionId: '',
    title: '',
    department: 'General',
    changeType: 'Promotion',
    startDate: new Date().toISOString().slice(0, 10),
    endDate: '',
    isCurrent: true,
    notes: '',
    syncCurrentRole: true,
  });

  const editable = canEdit('staff');

  const rankedPositions = useMemo(
    () => sortPositionsByRank(state.positions),
    [state.positions]
  );

  const rankedActiveUsers = useMemo(
    () => sortUsersByRankAndJoinDate(state.users.filter((u) => u.isActive), state.positions),
    [state.users, state.positions]
  );

  const filteredUsers = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matched = state.users
      .filter((u) => (showInactive ? true : u.isActive))
      .filter((u) => {
        if (!q) return true;
        const pos = state.positions.find((p) => p.id === u.positionId);
        return (
          u.fullName.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q) ||
          u.department.toLowerCase().includes(q) ||
          (pos?.title.toLowerCase().includes(q) ?? false)
        );
      });
    return sortUsersByRankAndJoinDate(matched, state.positions);
  }, [state.users, state.positions, showInactive, query]);

  const openCreateModal = () => {
    setEditingUser(null);
    setHistoryFormOpen(false);
    setEditingHistoryId(null);
    setForm({
      fullName: '',
      email: '',
      password: 'password123',
      avatarUrl: '',
      department: 'General',
      location: 'HQ',
      phone: '',
      bio: '',
      positionId: rankedPositions[rankedPositions.length - 1]?.id ?? rankedPositions[0]?.id ?? '',
      managerId: rankedActiveUsers[0]?.id ?? '',
      mentorId: '',
      startDate: new Date().toISOString().slice(0, 10),
      isActive: true,
      isNewJoiner: true,
      roleIds: ['role-joiner'],
      positionHistory: [],
    });
    setModalOpen(true);
  };

  const openEditModal = (user: User) => {
    setEditingUser(user);
    setHistoryFormOpen(false);
    setEditingHistoryId(null);
    setForm({
      fullName: user.fullName,
      email: user.email,
      password: user.password,
      avatarUrl: user.avatarUrl,
      department: user.department,
      location: user.location,
      phone: user.phone,
      bio: user.bio,
      positionId: user.positionId,
      managerId: user.managerId ?? '',
      mentorId: user.mentorId ?? '',
      startDate: user.startDate,
      isActive: user.isActive,
      isNewJoiner: user.isNewJoiner,
      roleIds: user.roleIds,
      positionHistory: sortHistoryNewestFirst(user.positionHistory ?? []),
    });
    setModalOpen(true);
  };

  const openNewHistoryEntry = (preset?: {
    positionId?: string;
    changeType?: PositionHistoryChangeType;
    startDate?: string;
    isCurrent?: boolean;
  }) => {
    const targetPosId = preset?.positionId ?? form.positionId;
    const matchedPos = state.positions.find((p) => p.id === targetPosId);
    setEditingHistoryId(null);
    setHistoryDraft({
      positionId: targetPosId,
      title: matchedPos?.title ?? '',
      department: form.department || 'General',
      changeType: preset?.changeType ?? (form.positionHistory.length === 0 ? 'Initial Role' : 'Promotion'),
      startDate: preset?.startDate ?? new Date().toISOString().slice(0, 10),
      endDate: '',
      isCurrent: preset?.isCurrent ?? true,
      notes: '',
      syncCurrentRole: true,
    });
    setHistoryFormOpen(true);
  };

  const openEditHistoryEntry = (entry: PositionHistoryEntry) => {
    setEditingHistoryId(entry.id);
    setHistoryDraft({
      positionId: entry.positionId ?? '',
      title: entry.title,
      department: entry.department,
      changeType: entry.changeType,
      startDate: entry.startDate,
      endDate: entry.endDate ?? '',
      isCurrent: entry.isCurrent,
      notes: entry.notes ?? '',
      syncCurrentRole: false,
    });
    setHistoryFormOpen(true);
  };

  const handleSeedInitialRole = () => {
    const matchedPos = state.positions.find((p) => p.id === form.positionId);
    const title =
      matchedPos?.title ??
      (form.roleIds.includes('role-admin') ? 'Administrator' : 'Staff Member');
    const seeded: PositionHistoryEntry = {
      id: `hist-${Date.now().toString(36)}`,
      positionId: form.positionId || undefined,
      title,
      department: form.department || 'General',
      changeType: 'Initial Role',
      startDate: form.startDate || new Date().toISOString().slice(0, 10),
      endDate: null,
      isCurrent: true,
      notes: '',
    };
    setForm((prev) => ({
      ...prev,
      positionHistory: sortHistoryNewestFirst([seeded, ...prev.positionHistory]),
    }));
  };

  const handleSaveHistoryEntry = () => {
    const resolvedTitle =
      historyDraft.title.trim() ||
      state.positions.find((p) => p.id === historyDraft.positionId)?.title ||
      '';
    if (!resolvedTitle || !historyDraft.startDate) return;

    const entryId = editingHistoryId ?? `hist-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`;
    const nextEntry: PositionHistoryEntry = {
      id: entryId,
      positionId: historyDraft.positionId || undefined,
      title: resolvedTitle,
      department: historyDraft.department.trim() || form.department || 'General',
      changeType: historyDraft.changeType,
      startDate: historyDraft.startDate,
      endDate: historyDraft.isCurrent ? null : historyDraft.endDate || null,
      isCurrent: historyDraft.isCurrent,
      notes: historyDraft.notes.trim() || undefined,
    };

    setForm((prev) => {
      const updatedList = prev.positionHistory
        .filter((item) => item.id !== entryId)
        .map((item) => {
          // Close previous active role when logging a new current role
          if (nextEntry.isCurrent && item.isCurrent) {
            return {
              ...item,
              isCurrent: false,
              endDate: item.endDate || nextEntry.startDate,
            };
          }
          return item;
        });

      const merged = sortHistoryNewestFirst([nextEntry, ...updatedList]);
      const shouldSync = historyDraft.syncCurrentRole && nextEntry.isCurrent;
      return {
        ...prev,
        positionId: shouldSync && nextEntry.positionId ? nextEntry.positionId : prev.positionId,
        department: shouldSync ? nextEntry.department : prev.department,
        positionHistory: merged,
      };
    });

    setHistoryFormOpen(false);
    setEditingHistoryId(null);
  };

  const handleDeleteHistoryEntry = (entryId: string) => {
    setForm((prev) => ({
      ...prev,
      positionHistory: prev.positionHistory.filter((item) => item.id !== entryId),
    }));
    if (editingHistoryId === entryId) {
      setHistoryFormOpen(false);
      setEditingHistoryId(null);
    }
  };

  const handleToggleRole = (roleId: string) => {
    setForm((prev) => ({
      ...prev,
      roleIds: prev.roleIds.includes(roleId)
        ? prev.roleIds.filter((r) => r !== roleId)
        : [...prev.roleIds, roleId],
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editable || !form.fullName.trim() || !form.email.trim()) return;
    let finalHistory = form.positionHistory;
    if (!editingUser && finalHistory.length === 0 && form.positionId) {
      const pos = state.positions.find((p) => p.id === form.positionId);
      if (pos) {
        finalHistory = [
          {
            id: `hist-${Date.now().toString(36)}`,
            positionId: pos.id,
            title: pos.title,
            department: form.department || 'General',
            changeType: 'Initial Role',
            startDate: form.startDate || new Date().toISOString().slice(0, 10),
            endDate: null,
            isCurrent: true,
          },
        ];
      }
    }
    const payload = {
      ...form,
      managerId: form.managerId || null,
      mentorId: form.mentorId || null,
      positionHistory: sortHistoryNewestFirst(finalHistory),
    };
    if (editingUser) {
      updateStaff(editingUser.id, payload);
    } else {
      createStaff(payload);
    }
    setModalOpen(false);
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="rounded-xl border border-neutral-200 dark:border-zinc-800 bg-white dark:bg-[#0A0A0C] p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 flex-1">
          <div className="relative flex-1 min-w-[220px] max-w-sm">
            <Search className="h-4 w-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, email, position..."
              className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-neutral-200 dark:border-zinc-800 bg-neutral-50 dark:bg-black text-neutral-900 dark:text-neutral-100"
            />
          </div>

          <label className="inline-flex items-center gap-2 text-xs text-neutral-600 dark:text-neutral-400 cursor-pointer">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
              className="rounded border-neutral-300 accent-sky-600"
            />
            <span>Include inactive profiles</span>
          </label>
        </div>

        {editable && (
          <div className="flex items-center gap-2">
            <ExcelImportActions
              templateTitle="Download Staff Excel Template (.xlsx)"
              importTitle="Import Staff from Excel (.xlsx / .csv)"
              onDownloadTemplate={() =>
                downloadExcelTemplate('staff-import-template.xlsx', 'Staff', [
                  { header: 'Full Name', example: 'Sokha Dara', width: 22 },
                  { header: 'Email', example: 'sokha.dara@ecamsolution.com', width: 30 },
                  { header: 'Position Title', example: 'Senior Engineer', width: 22 },
                  { header: 'Department', example: 'Engineering', width: 18 },
                  { header: 'Manager Email', example: 'chansathya.khy@ecamsolution.com', width: 30 },
                  { header: 'Mentor Email', example: '', width: 26 },
                  { header: 'Start Date', example: new Date().toISOString().slice(0, 10), width: 14 },
                  { header: 'Location', example: 'Phnom Penh HQ', width: 18 },
                  { header: 'Phone', example: '+855 12 345 678', width: 18 },
                  { header: 'Roles', example: 'Staff Member', width: 20 },
                  { header: 'Is Active', example: true, width: 12 },
                  { header: 'Is New Joiner', example: true, width: 14 },
                ])
              }
              onImportRows={importStaff}
              onError={(msg) => notify(msg, 'error')}
            />
            <button
              type="button"
              onClick={openCreateModal}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-medium whitespace-nowrap"
            >
              <UserPlus className="h-4 w-4" />
              <span>Add Staff Member</span>
            </button>
          </div>
        )}
      </div>

      {/* Staff Grid */}
      {filteredUsers.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredUsers.map((user) => {
            const pos = state.positions.find((p) => p.id === user.positionId);
            const mgr = state.users.find((u) => u.id === user.managerId);
            const mentor = state.users.find((u) => u.id === user.mentorId);
            const roleNames = user.roleIds
              .map((rid) => state.roles.find((r) => r.id === rid)?.name)
              .filter(Boolean)
              .join(', ');

            return (
              <div
                key={user.id}
                className={`rounded-xl border border-neutral-200 dark:border-zinc-800 bg-white dark:bg-[#0A0A0C] p-5 flex flex-col justify-between ${
                  !user.isActive ? 'opacity-65' : ''
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <UserAvatar name={user.fullName} avatarUrl={user.avatarUrl} size="lg" />
                      <div className="min-w-0">
                        <h3 className="text-sm font-display font-semibold text-neutral-900 dark:text-neutral-100 truncate">
                          {user.fullName}
                        </h3>
                        <p className="text-xs font-medium text-sky-600 dark:text-sky-400 truncate">
                          {pos?.title ?? (user.roleIds.includes('role-admin') ? 'Administrator' : 'Unassigned Position')}
                        </p>
                        <p className="text-[11px] text-neutral-500 dark:text-neutral-400 truncate mt-0.5">
                          {user.department} · {user.isActive ? 'Active' : 'Inactive'}
                        </p>
                      </div>
                    </div>

                    {editable && (
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => openEditModal(user)}
                          className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-zinc-900"
                          aria-label={`Edit ${user.fullName}`}
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                        {user.id !== currentUser.id && (
                          <button
                            type="button"
                            onClick={() => deleteStaff(user.id)}
                            className="p-1.5 rounded-lg text-neutral-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10"
                            aria-label={`Delete ${user.fullName}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="mt-4 space-y-1.5 text-xs text-neutral-600 dark:text-neutral-400">
                    <div className="flex items-center gap-2 truncate">
                      <Mail className="h-3.5 w-3.5 text-neutral-400 shrink-0" />
                      <span className="truncate">{user.email}</span>
                    </div>
                    <div>
                      Manager: <span className="text-neutral-800 dark:text-neutral-200">{mgr?.fullName ?? 'Root (None)'}</span>
                    </div>
                    {mentor && (
                      <div>
                        Mentor: <span className="text-amber-600 dark:text-amber-400">{mentor.fullName}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-neutral-100 dark:border-zinc-800 flex items-center justify-between gap-2 text-[11px] text-neutral-500 dark:text-neutral-400">
                  <span className="truncate">{roleNames || 'No roles'}</span>
                  <span className="font-mono-tabular shrink-0">
                    {user.startDate ? `${user.startDate} · ${formatTenure(user.startDate)}` : 'No start date'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-xl border border-neutral-200 dark:border-zinc-800 bg-white dark:bg-[#0A0A0C] p-10 text-center text-sm text-neutral-500 dark:text-neutral-400">
          No staff members match your search.
        </div>
      )}

      {/* Create/Edit Staff Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/65" onClick={() => setModalOpen(false)} />
          <div className="relative z-10 w-full max-w-2xl rounded-xl border border-neutral-200 dark:border-zinc-800 bg-white dark:bg-[#0A0A0C] shadow-2xl max-h-[90vh] flex flex-col">
            <div className="px-6 py-4 border-b border-neutral-200 dark:border-zinc-800 flex items-center justify-between">
              <h3 className="text-base font-display font-semibold text-neutral-900 dark:text-neutral-100">
                {editingUser ? `Edit ${editingUser.fullName}` : 'Add Staff Member (Auto-Enrolls in Onboarding LMS)'}
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-1 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4 text-sm">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1">Full Name</label>
                  <input
                    required
                    type="text"
                    value={form.fullName}
                    onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                    className="w-full rounded-lg border border-neutral-200 dark:border-zinc-800 bg-white dark:bg-black px-3 py-2 text-sm text-neutral-900 dark:text-neutral-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1">Email</label>
                  <input
                    required
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="w-full rounded-lg border border-neutral-200 dark:border-zinc-800 bg-white dark:bg-black px-3 py-2 text-sm text-neutral-900 dark:text-neutral-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1">Position</label>
                  <select
                    value={form.positionId}
                    onChange={(e) => setForm({ ...form, positionId: e.target.value })}
                    className="w-full rounded-lg border border-neutral-200 dark:border-zinc-800 bg-white dark:bg-black px-3 py-2 text-sm text-neutral-900 dark:text-neutral-100"
                  >
                    {rankedPositions.length === 0 ? (
                      <option value="">No positions defined yet</option>
                    ) : (
                      <>
                        <option value="">Unassigned</option>
                        {rankedPositions.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.title} ({p.level})
                          </option>
                        ))}
                      </>
                    )}
                  </select>
                  {editingUser && form.positionId !== editingUser.positionId && form.positionId && (
                    <div className="mt-1.5 flex items-center justify-between gap-2 rounded-lg border border-sky-200 dark:border-sky-500/30 bg-sky-50/70 dark:bg-sky-500/10 px-2.5 py-1.5 text-[11px] text-sky-700 dark:text-sky-300">
                      <span>Position changed</span>
                      <button
                        type="button"
                        onClick={() =>
                          openNewHistoryEntry({
                            positionId: form.positionId,
                            changeType: 'Promotion',
                            isCurrent: true,
                          })
                        }
                        className="font-semibold underline hover:no-underline whitespace-nowrap"
                      >
                        Log in Career History
                      </button>
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1">Start Date</label>
                  <input
                    type="date"
                    value={form.startDate}
                    onChange={(e) => {
                      const nextStartDate = e.target.value;
                      setForm((prev) => ({
                        ...prev,
                        startDate: nextStartDate,
                        isNewJoiner: hasJoinedOverMonths(nextStartDate, 3) ? false : prev.isNewJoiner,
                      }));
                    }}
                    className="w-full font-mono-tabular rounded-lg border border-neutral-200 dark:border-zinc-800 bg-white dark:bg-black px-3 py-2 text-sm text-neutral-900 dark:text-neutral-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1">Direct Manager</label>
                  <select
                    value={form.managerId}
                    onChange={(e) => setForm({ ...form, managerId: e.target.value })}
                    className="w-full rounded-lg border border-neutral-200 dark:border-zinc-800 bg-white dark:bg-black px-3 py-2 text-sm text-neutral-900 dark:text-neutral-100"
                  >
                    <option value="">None (Root Node)</option>
                    {rankedActiveUsers
                      .filter((u) => u.id !== editingUser?.id)
                      .map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.fullName}
                        </option>
                      ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1">Mentor (Optional)</label>
                  <select
                    value={form.mentorId}
                    onChange={(e) => setForm({ ...form, mentorId: e.target.value })}
                    className="w-full rounded-lg border border-neutral-200 dark:border-zinc-800 bg-white dark:bg-black px-3 py-2 text-sm text-neutral-900 dark:text-neutral-100"
                  >
                    <option value="">None</option>
                    {rankedActiveUsers
                      .filter((u) => u.id !== editingUser?.id)
                      .map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.fullName}
                        </option>
                      ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1">Department</label>
                  <input
                    type="text"
                    value={form.department}
                    onChange={(e) => setForm({ ...form, department: e.target.value })}
                    className="w-full rounded-lg border border-neutral-200 dark:border-zinc-800 bg-white dark:bg-black px-3 py-2 text-sm text-neutral-900 dark:text-neutral-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1">Location</label>
                  <input
                    type="text"
                    value={form.location}
                    onChange={(e) => setForm({ ...form, location: e.target.value })}
                    className="w-full rounded-lg border border-neutral-200 dark:border-zinc-800 bg-white dark:bg-black px-3 py-2 text-sm text-neutral-900 dark:text-neutral-100"
                  />
                </div>
                <div className="sm:col-span-2">
                  <ImageUploadField
                    label="Staff Photo (Optional)"
                    value={form.avatarUrl}
                    onChange={(avatarUrl) => setForm({ ...form, avatarUrl })}
                    emptyHint="Using colored initials avatar"
                    previewAspect="square"
                    optimizeOptions={{ maxWidth: 400, maxHeight: 400, quality: 0.85 }}
                    onError={(msg) => notify(msg, 'error')}
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-6 pt-2">
                <label className="inline-flex items-center gap-2 text-xs text-neutral-700 dark:text-neutral-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.isActive}
                    onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                    className="accent-sky-600"
                  />
                  <span>Active Staff Profile</span>
                </label>
                <label className="inline-flex items-center gap-2 text-xs text-neutral-700 dark:text-neutral-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={hasJoinedOverMonths(form.startDate, 3) ? false : form.isNewJoiner}
                    disabled={hasJoinedOverMonths(form.startDate, 3)}
                    onChange={(e) => setForm({ ...form, isNewJoiner: e.target.checked })}
                    className="accent-sky-600 disabled:opacity-50"
                  />
                  <span>New Joiner Cohort</span>
                </label>
                {hasJoinedOverMonths(form.startDate, 3) && (
                  <span className="text-[11px] text-emerald-600 dark:text-emerald-400">
                    Joined 3+ months ago — onboarding auto-completes
                  </span>
                )}
              </div>

              <div>
                <div className="text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-2">
                  Assigned System Roles (Union Permissions)
                </div>
                <div className="flex flex-wrap gap-2">
                  {state.roles.map((r) => {
                    const selected = form.roleIds.includes(r.id);
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => handleToggleRole(r.id)}
                        className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                          selected
                            ? 'bg-sky-600 border-sky-600 text-white'
                            : 'border-neutral-200 dark:border-zinc-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-zinc-900'
                        }`}
                      >
                        {r.name}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* LinkedIn-Style Promotion & Position History (Edit Staff Only) */}
              {editingUser && (
                <div className="pt-4 border-t border-neutral-200 dark:border-zinc-800 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2 text-xs font-semibold text-neutral-900 dark:text-neutral-100">
                        <Award className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" />
                        <span>Career & Promotion History</span>
                      </div>
                      <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5">
                        Private to staff edit view — not shown on directory cards.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {form.positionHistory.length === 0 && (
                        <button
                          type="button"
                          onClick={handleSeedInitialRole}
                          className="px-2.5 py-1.5 rounded-lg border border-neutral-200 dark:border-zinc-800 text-[11px] font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-zinc-900"
                        >
                          Seed Current Role
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => openNewHistoryEntry()}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-[11px] font-medium"
                      >
                        <Plus className="h-3 w-3" />
                        <span>Add Promotion / Role</span>
                      </button>
                    </div>
                  </div>

                  {historyFormOpen && (
                    <div className="rounded-xl border border-neutral-200 dark:border-zinc-800 bg-neutral-50 dark:bg-zinc-950 p-4 space-y-3">
                      <div className="text-xs font-semibold text-neutral-900 dark:text-neutral-100">
                        {editingHistoryId ? 'Edit Role Entry' : 'Add Promotion / Role Entry'}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[11px] font-medium text-neutral-600 dark:text-neutral-400 mb-1">
                            Catalog Position (Optional)
                          </label>
                          <select
                            value={historyDraft.positionId}
                            onChange={(e) => {
                              const posId = e.target.value;
                              const matched = state.positions.find((p) => p.id === posId);
                              setHistoryDraft((prev) => ({
                                ...prev,
                                positionId: posId,
                                title: matched ? matched.title : prev.title,
                              }));
                            }}
                            className="w-full rounded-lg border border-neutral-200 dark:border-zinc-800 bg-white dark:bg-black px-2.5 py-1.5 text-xs text-neutral-900 dark:text-neutral-100"
                          >
                            <option value="">Custom / Legacy Title</option>
                            {rankedPositions.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.title} ({p.level})
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-[11px] font-medium text-neutral-600 dark:text-neutral-400 mb-1">
                            Role Title
                          </label>
                          <input
                            type="text"
                            value={historyDraft.title}
                            onChange={(e) => setHistoryDraft((prev) => ({ ...prev, title: e.target.value }))}
                            placeholder="e.g. Senior Business Application Engineer"
                            className="w-full rounded-lg border border-neutral-200 dark:border-zinc-800 bg-white dark:bg-black px-2.5 py-1.5 text-xs text-neutral-900 dark:text-neutral-100"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-medium text-neutral-600 dark:text-neutral-400 mb-1">
                            Change Type
                          </label>
                          <select
                            value={historyDraft.changeType}
                            onChange={(e) =>
                              setHistoryDraft((prev) => ({
                                ...prev,
                                changeType: e.target.value as PositionHistoryChangeType,
                              }))
                            }
                            className="w-full rounded-lg border border-neutral-200 dark:border-zinc-800 bg-white dark:bg-black px-2.5 py-1.5 text-xs text-neutral-900 dark:text-neutral-100"
                          >
                            <option value="Promotion">Promotion</option>
                            <option value="Initial Role">Initial Role</option>
                            <option value="Role Change">Role Change</option>
                            <option value="Transfer">Transfer</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-[11px] font-medium text-neutral-600 dark:text-neutral-400 mb-1">
                            Department
                          </label>
                          <input
                            type="text"
                            value={historyDraft.department}
                            onChange={(e) =>
                              setHistoryDraft((prev) => ({ ...prev, department: e.target.value }))
                            }
                            className="w-full rounded-lg border border-neutral-200 dark:border-zinc-800 bg-white dark:bg-black px-2.5 py-1.5 text-xs text-neutral-900 dark:text-neutral-100"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-medium text-neutral-600 dark:text-neutral-400 mb-1">
                            Start Date
                          </label>
                          <input
                            type="date"
                            value={historyDraft.startDate}
                            onChange={(e) =>
                              setHistoryDraft((prev) => ({ ...prev, startDate: e.target.value }))
                            }
                            className="w-full font-mono-tabular rounded-lg border border-neutral-200 dark:border-zinc-800 bg-white dark:bg-black px-2.5 py-1.5 text-xs text-neutral-900 dark:text-neutral-100"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-medium text-neutral-600 dark:text-neutral-400 mb-1">
                            End Date
                          </label>
                          <input
                            type="date"
                            disabled={historyDraft.isCurrent}
                            value={historyDraft.isCurrent ? '' : historyDraft.endDate}
                            onChange={(e) =>
                              setHistoryDraft((prev) => ({ ...prev, endDate: e.target.value }))
                            }
                            className="w-full font-mono-tabular rounded-lg border border-neutral-200 dark:border-zinc-800 bg-white dark:bg-black px-2.5 py-1.5 text-xs text-neutral-900 dark:text-neutral-100 disabled:opacity-50"
                          />
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-5">
                        <label className="inline-flex items-center gap-2 text-xs text-neutral-700 dark:text-neutral-300 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={historyDraft.isCurrent}
                            onChange={(e) =>
                              setHistoryDraft((prev) => ({ ...prev, isCurrent: e.target.checked }))
                            }
                            className="accent-sky-600"
                          />
                          <span>Current role (Present)</span>
                        </label>
                        {!editingHistoryId && historyDraft.isCurrent && (
                          <label className="inline-flex items-center gap-2 text-xs text-neutral-700 dark:text-neutral-300 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={historyDraft.syncCurrentRole}
                              onChange={(e) =>
                                setHistoryDraft((prev) => ({
                                  ...prev,
                                  syncCurrentRole: e.target.checked,
                                }))
                              }
                              className="accent-sky-600"
                            />
                            <span>Update staff&apos;s active position to match</span>
                          </label>
                        )}
                      </div>

                      <div>
                        <label className="block text-[11px] font-medium text-neutral-600 dark:text-neutral-400 mb-1">
                          Notes (Optional)
                        </label>
                        <input
                          type="text"
                          value={historyDraft.notes}
                          onChange={(e) => setHistoryDraft((prev) => ({ ...prev, notes: e.target.value }))}
                          placeholder="Promotion context, milestone, or scope..."
                          className="w-full rounded-lg border border-neutral-200 dark:border-zinc-800 bg-white dark:bg-black px-2.5 py-1.5 text-xs text-neutral-900 dark:text-neutral-100"
                        />
                      </div>

                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setHistoryFormOpen(false);
                            setEditingHistoryId(null);
                          }}
                          className="px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-zinc-800 text-xs font-medium text-neutral-700 dark:text-neutral-300"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={handleSaveHistoryEntry}
                          className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-medium"
                        >
                          {editingHistoryId ? 'Update Entry' : 'Save Entry'}
                        </button>
                      </div>
                    </div>
                  )}

                  {form.positionHistory.length > 0 ? (
                    <div className="rounded-xl border border-neutral-200 dark:border-zinc-800 bg-white dark:bg-black/40 p-4 space-y-4">
                      {/* LinkedIn-style grouped organization header */}
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-lg border border-neutral-200 dark:border-zinc-800 bg-neutral-50 dark:bg-zinc-900 flex items-center justify-center shrink-0">
                          <Briefcase className="h-4 w-4 text-sky-600 dark:text-sky-400" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-neutral-900 dark:text-neutral-100 truncate">
                            {state.branding.appName || 'Company'}
                          </div>
                          <div className="text-[11px] text-neutral-500 dark:text-neutral-400 font-mono-tabular">
                            Total tenure: {formatTenure(form.startDate)}
                          </div>
                        </div>
                      </div>

                      {/* LinkedIn-style vertical progression timeline */}
                      <div className="relative ml-4 pl-6 space-y-4">
                        {form.positionHistory.map((entry, idx) => {
                          const isLast = idx === form.positionHistory.length - 1;
                          return (
                            <div key={entry.id} className="relative group">
                              {!isLast && (
                                <span
                                  aria-hidden="true"
                                  className="absolute -left-6 top-3 bottom-[-20px] w-px bg-neutral-200 dark:bg-zinc-800"
                                />
                              )}
                              <span
                                aria-hidden="true"
                                className={`absolute -left-[27px] top-1.5 h-2 w-2 rounded-full ${
                                  entry.isCurrent
                                    ? 'bg-sky-600 dark:bg-sky-400 ring-4 ring-sky-100 dark:ring-sky-500/20'
                                    : entry.changeType === 'Promotion'
                                    ? 'bg-amber-500 dark:bg-amber-400'
                                    : 'bg-neutral-400 dark:bg-zinc-600'
                                }`}
                              />

                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0 flex-1">
                                  <div className="text-xs font-semibold text-neutral-900 dark:text-neutral-100">
                                    {entry.title}
                                  </div>
                                  <div className="text-[11px] text-neutral-600 dark:text-neutral-300 mt-0.5">
                                    {entry.changeType} · {entry.department}
                                  </div>
                                  <div className="text-[11px] text-neutral-500 dark:text-neutral-400 font-mono-tabular mt-0.5">
                                    {formatMonthYear(entry.startDate)} –{' '}
                                    {entry.isCurrent ? 'Present' : formatMonthYear(entry.endDate)} ·{' '}
                                    {formatTenure(entry.startDate, entry.isCurrent ? null : entry.endDate)}
                                  </div>
                                  {entry.notes && (
                                    <p className="text-[11px] text-neutral-600 dark:text-neutral-400 mt-1 leading-relaxed">
                                      {entry.notes}
                                    </p>
                                  )}
                                </div>

                                <div className="flex items-center gap-1 shrink-0">
                                  <button
                                    type="button"
                                    onClick={() => openEditHistoryEntry(entry)}
                                    className="p-1 rounded text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
                                    aria-label={`Edit role ${entry.title}`}
                                  >
                                    <Edit2 className="h-3 w-3" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteHistoryEntry(entry.id)}
                                    className="p-1 rounded text-neutral-400 hover:text-red-600 dark:hover:text-red-400"
                                    aria-label={`Delete role ${entry.title}`}
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed border-neutral-200 dark:border-zinc-800 px-4 py-4 text-center text-xs text-neutral-500 dark:text-neutral-400">
                      No promotion or position history logged yet. Click &ldquo;Seed Current Role&rdquo; or &ldquo;Add Promotion / Role&rdquo; to build this staff member&apos;s career timeline.
                    </div>
                  )}
                </div>
              )}

              <div className="pt-4 border-t border-neutral-200 dark:border-zinc-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-neutral-200 dark:border-zinc-800 text-xs font-medium text-neutral-700 dark:text-neutral-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-medium"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>{editingUser ? 'Save Changes' : 'Create Staff Profile'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
