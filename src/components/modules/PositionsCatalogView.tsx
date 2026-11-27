import React, { useState } from 'react';
import { Briefcase, Edit2, Plus, Trash2, X } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { Position } from '../../types';
import { downloadExcelTemplate } from '../../utils/excel';
import { ExcelImportActions } from '../common/ExcelImportActions';

export const PositionsCatalogView: React.FC = () => {
  const { state, canEdit, createPosition, updatePosition, deletePosition, importPositions, notify } = useAppStore();
  const editable = canEdit('positions');

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Position | null>(null);
  const [form, setForm] = useState({
    title: '',
    level: 'L4',
    priorityLevel: 50,
    description: '',
  });

  const sorted = [...state.positions].sort((a, b) => b.priorityLevel - a.priorityLevel);

  const openCreate = () => {
    setEditing(null);
    setForm({ title: '', level: 'L4', priorityLevel: 50, description: '' });
    setModalOpen(true);
  };

  const openEdit = (pos: Position) => {
    setEditing(pos);
    setForm({
      title: pos.title,
      level: pos.level,
      priorityLevel: pos.priorityLevel,
      description: pos.description,
    });
    setModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editable || !form.title.trim()) return;
    if (editing) {
      updatePosition(editing.id, form);
    } else {
      createPosition(form);
    }
    setModalOpen(false);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-neutral-200 dark:border-zinc-800 bg-white dark:bg-[#0A0A0C] p-4 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-display font-semibold text-neutral-900 dark:text-neutral-100">
            Positions Catalog
          </h2>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            Defines job titles, career bands, and priority rank used for deterministic Org Chart sibling sorting.
          </p>
        </div>
        {editable && (
          <div className="flex items-center gap-2">
            <ExcelImportActions
              templateTitle="Download Positions Excel Template (.xlsx)"
              importTitle="Import Positions from Excel (.xlsx / .csv)"
              onDownloadTemplate={() =>
                downloadExcelTemplate('positions-import-template.xlsx', 'Positions', [
                  { header: 'Title', example: 'Senior Engineer', width: 24 },
                  { header: 'Level', example: 'L4', width: 12 },
                  { header: 'Priority Rank', example: 60, width: 16 },
                  { header: 'Description', example: 'Technical delivery and architecture mentoring', width: 42 },
                ])
              }
              onImportRows={importPositions}
              onError={(msg) => notify(msg, 'error')}
            />
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-medium whitespace-nowrap"
            >
              <Plus className="h-4 w-4" />
              <span>Add Position</span>
            </button>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-neutral-200 dark:border-zinc-800 bg-white dark:bg-[#0A0A0C] overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-neutral-200 dark:border-zinc-800 text-xs font-medium text-neutral-500 dark:text-neutral-400">
              <th className="py-3 px-4">Position Title</th>
              <th className="py-3 px-4">Band / Level</th>
              <th className="py-3 px-4">Org Priority Rank</th>
              <th className="py-3 px-4">Active Staff</th>
              <th className="py-3 px-4">Description</th>
              {editable && <th className="py-3 px-4 text-right">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 dark:divide-zinc-800 text-sm">
            {sorted.map((pos) => {
              const count = state.users.filter((u) => u.isActive && u.positionId === pos.id).length;
              return (
                <tr key={pos.id} className="hover:bg-neutral-50 dark:hover:bg-zinc-900/60">
                  <td className="py-3 px-4 font-medium text-neutral-900 dark:text-neutral-100 flex items-center gap-2 whitespace-nowrap">
                    <Briefcase className="h-4 w-4 text-sky-600 dark:text-sky-400 shrink-0" />
                    <span>{pos.title}</span>
                  </td>
                  <td className="py-3 px-4 font-mono-tabular text-xs text-neutral-700 dark:text-neutral-300">
                    {pos.level}
                  </td>
                  <td className="py-3 px-4 font-mono-tabular text-xs font-semibold text-amber-600 dark:text-amber-400">
                    {pos.priorityLevel}
                  </td>
                  <td className="py-3 px-4 font-mono-tabular text-xs text-neutral-600 dark:text-neutral-400">
                    {count}
                  </td>
                  <td className="py-3 px-4 text-xs text-neutral-500 dark:text-neutral-400 max-w-md">
                    {pos.description}
                  </td>
                  {editable && (
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => openEdit(pos)}
                        className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
                        aria-label={`Edit ${pos.title}`}
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => deletePosition(pos.id)}
                        className="p-1.5 rounded-lg text-neutral-400 hover:text-red-600 dark:hover:text-red-400"
                        aria-label={`Delete ${pos.title}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
            {sorted.length === 0 && (
              <tr>
                <td
                  colSpan={editable ? 6 : 5}
                  className="py-10 px-4 text-center text-sm text-neutral-500 dark:text-neutral-400"
                >
                  No positions created yet. Click &ldquo;Add Position&rdquo; to define your team titles.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/65" onClick={() => setModalOpen(false)} />
          <div className="relative z-10 w-full max-w-md rounded-xl border border-neutral-200 dark:border-zinc-800 bg-white dark:bg-[#0A0A0C] p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-display font-semibold text-neutral-900 dark:text-neutral-100">
                {editing ? 'Edit Position' : 'New Position'}
              </h3>
              <button type="button" onClick={() => setModalOpen(false)} className="text-neutral-400 hover:text-neutral-200">
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1">Title</label>
                <input
                  required
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  className="w-full rounded-lg border border-neutral-200 dark:border-zinc-800 bg-white dark:bg-black px-3 py-2 text-sm text-neutral-900 dark:text-neutral-100"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1">Level</label>
                  <input
                    required
                    type="text"
                    value={form.level}
                    onChange={(e) => setForm({ ...form, level: e.target.value })}
                    className="w-full rounded-lg border border-neutral-200 dark:border-zinc-800 bg-white dark:bg-black px-3 py-2 text-sm text-neutral-900 dark:text-neutral-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1">
                    Priority Rank (1-100)
                  </label>
                  <input
                    required
                    type="number"
                    min={1}
                    max={200}
                    value={form.priorityLevel}
                    onChange={(e) => setForm({ ...form, priorityLevel: Number(e.target.value) })}
                    className="w-full font-mono-tabular rounded-lg border border-neutral-200 dark:border-zinc-800 bg-white dark:bg-black px-3 py-2 text-sm text-neutral-900 dark:text-neutral-100"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1">Description</label>
                <textarea
                  rows={3}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full rounded-lg border border-neutral-200 dark:border-zinc-800 bg-white dark:bg-black px-3 py-2 text-sm text-neutral-900 dark:text-neutral-100"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-neutral-200 dark:border-zinc-800 text-xs font-medium text-neutral-700 dark:text-neutral-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-medium"
                >
                  {editing ? 'Save Changes' : 'Create Position'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
