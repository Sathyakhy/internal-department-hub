import React, { useMemo, useState } from 'react';
import { Edit2, Mail, Plus, Search, Trash2, UserPlus, X } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { User } from '../../types';
import { downloadExcelTemplate } from '../../utils/excel';
import { ExcelImportActions } from '../common/ExcelImportActions';
import { ImageUploadField } from '../common/ImageUploadField';
import { UserAvatar } from '../common/UserAvatar';

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
  });

  const editable = canEdit('staff');

  const filteredUsers = useMemo(() => {
    const q = query.trim().toLowerCase();
    return state.users
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
  }, [state.users, state.positions, showInactive, query]);

  const openCreateModal = () => {
    setEditingUser(null);
    setForm({
      fullName: '',
      email: '',
      password: 'password123',
      avatarUrl: '',
      department: 'General',
      location: 'HQ',
      phone: '',
      bio: '',
      positionId: state.positions[state.positions.length - 1]?.id ?? state.positions[0]?.id ?? '',
      managerId: state.users[0]?.id ?? '',
      mentorId: '',
      startDate: new Date().toISOString().slice(0, 10),
      isActive: true,
      isNewJoiner: true,
      roleIds: ['role-joiner'],
    });
    setModalOpen(true);
  };

  const openEditModal = (user: User) => {
    setEditingUser(user);
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
    });
    setModalOpen(true);
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
    const payload = {
      ...form,
      managerId: form.managerId || null,
      mentorId: form.mentorId || null,
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
                  <span className="font-mono-tabular shrink-0">{user.startDate}</span>
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
                    {state.positions.length === 0 ? (
                      <option value="">No positions defined yet</option>
                    ) : (
                      <>
                        <option value="">Unassigned</option>
                        {state.positions.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.title} ({p.level})
                          </option>
                        ))}
                      </>
                    )}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1">Start Date</label>
                  <input
                    type="date"
                    value={form.startDate}
                    onChange={(e) => setForm({ ...form, startDate: e.target.value })}
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
                    {state.users
                      .filter((u) => u.isActive && u.id !== editingUser?.id)
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
                    {state.users
                      .filter((u) => u.isActive && u.id !== editingUser?.id)
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

              <div className="flex flex-wrap gap-6 pt-2">
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
                    checked={form.isNewJoiner}
                    onChange={(e) => setForm({ ...form, isNewJoiner: e.target.checked })}
                    className="accent-sky-600"
                  />
                  <span>New Joiner Cohort</span>
                </label>
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
