import React, { useState } from 'react';
import { Megaphone, Pin, Plus, Trash2, X } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { Announcement } from '../../types';
import { downloadExcelTemplate } from '../../utils/excel';
import { ExcelImportActions } from '../common/ExcelImportActions';
import { UserAvatar } from '../common/UserAvatar';

export const AnnouncementsView: React.FC = () => {
  const { state, canEdit, createAnnouncement, updateAnnouncement, deleteAnnouncement, importAnnouncements, notify } = useAppStore();
  const editable = canEdit('announcements');

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({
    title: '',
    body: '',
    category: 'General' as Announcement['category'],
    pinned: true,
    active: true,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editable || !form.title.trim() || !form.body.trim()) return;
    createAnnouncement(form);
    setForm({ title: '', body: '', category: 'General', pinned: true, active: true });
    setModalOpen(false);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-neutral-200 dark:border-zinc-800 bg-white dark:bg-[#0A0A0C] p-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <Megaphone className="h-5 w-5 text-amber-500 dark:text-amber-400" />
          <div>
            <h2 className="text-base font-display font-semibold text-neutral-900 dark:text-neutral-100">
              Company Announcements
            </h2>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Pinned active announcements appear directly on every staff member&apos;s Dashboard.
            </p>
          </div>
        </div>

        {editable && (
          <div className="flex items-center gap-2">
            <ExcelImportActions
              templateTitle="Download Announcements Excel Template (.xlsx)"
              importTitle="Import Announcements from Excel (.xlsx / .csv)"
              onDownloadTemplate={() =>
                downloadExcelTemplate('announcements-import-template.xlsx', 'Announcements', [
                  { header: 'Headline', example: 'Q2 Security Compliance Update', width: 32 },
                  { header: 'Category', example: 'Policy', width: 14 },
                  { header: 'Message', example: 'Please complete your annual security review before Friday.', width: 50 },
                  { header: 'Pinned', example: true, width: 10 },
                  { header: 'Active', example: true, width: 10 },
                ])
              }
              onImportRows={importAnnouncements}
              onError={(msg) => notify(msg, 'error')}
            />
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-medium whitespace-nowrap"
            >
              <Plus className="h-4 w-4" />
              <span>New Announcement</span>
            </button>
          </div>
        )}
      </div>

      <div className="space-y-3">
        {state.announcements.map((ann) => {
          const author = state.users.find((u) => u.id === ann.authorId);
          return (
            <article
              key={ann.id}
              className="rounded-xl border border-neutral-200 dark:border-zinc-800 bg-white dark:bg-[#0A0A0C] p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
                    <span className="font-medium text-sky-600 dark:text-sky-400">{ann.category}</span>
                    <span>·</span>
                    <span className="font-mono-tabular">{ann.createdAt.slice(0, 10)}</span>
                    {ann.pinned && (
                      <>
                        <span>·</span>
                        <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 font-medium">
                          <Pin className="h-3 w-3" /> Pinned
                        </span>
                      </>
                    )}
                    {!ann.active && (
                      <>
                        <span>·</span>
                        <span className="text-neutral-400">Archived</span>
                      </>
                    )}
                  </div>
                  <h3 className="text-base font-display font-semibold text-neutral-900 dark:text-neutral-100">
                    {ann.title}
                  </h3>
                </div>

                {editable && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => updateAnnouncement(ann.id, { pinned: !ann.pinned })}
                      className={`px-2.5 py-1 rounded-lg border text-xs font-medium transition-colors ${
                        ann.pinned
                          ? 'border-amber-500/40 bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300'
                          : 'border-neutral-200 dark:border-zinc-800 text-neutral-600 dark:text-neutral-400'
                      }`}
                    >
                      {ann.pinned ? 'Unpin' : 'Pin'}
                    </button>
                    <button
                      type="button"
                      onClick={() => updateAnnouncement(ann.id, { active: !ann.active })}
                      className="px-2.5 py-1 rounded-lg border border-neutral-200 dark:border-zinc-800 text-xs font-medium text-neutral-600 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-zinc-900"
                    >
                      {ann.active ? 'Archive' : 'Activate'}
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteAnnouncement(ann.id)}
                      className="p-1.5 rounded-lg text-neutral-400 hover:text-red-600 dark:hover:text-red-400"
                      aria-label="Delete announcement"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>

              <p className="mt-2.5 text-sm text-neutral-600 dark:text-neutral-300 leading-relaxed">{ann.body}</p>

              <div className="mt-4 pt-3 border-t border-neutral-100 dark:border-zinc-800 flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
                <UserAvatar name={author?.fullName ?? 'Admin'} avatarUrl={author?.avatarUrl} size="xs" />
                <span>Posted by {author?.fullName ?? 'Administrator'}</span>
              </div>
            </article>
          );
        })}

        {state.announcements.length === 0 && (
          <div className="rounded-xl border border-neutral-200 dark:border-zinc-800 bg-white dark:bg-[#0A0A0C] p-10 text-center text-sm text-neutral-500 dark:text-neutral-400">
            No announcements published yet.
          </div>
        )}
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/65" onClick={() => setModalOpen(false)} />
          <div className="relative z-10 w-full max-w-lg rounded-xl border border-neutral-200 dark:border-zinc-800 bg-white dark:bg-[#0A0A0C] p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-display font-semibold text-neutral-900 dark:text-neutral-100">
                Publish Announcement
              </h3>
              <button type="button" onClick={() => setModalOpen(false)} className="text-neutral-400 hover:text-neutral-200">
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1">Headline</label>
                <input
                  required
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  className="w-full rounded-lg border border-neutral-200 dark:border-zinc-800 bg-white dark:bg-black px-3 py-2 text-sm text-neutral-900 dark:text-neutral-100"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1">Category</label>
                <select
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value as Announcement['category'] })}
                  className="w-full rounded-lg border border-neutral-200 dark:border-zinc-800 bg-white dark:bg-black px-3 py-2 text-sm text-neutral-900 dark:text-neutral-100"
                >
                  <option value="General">General</option>
                  <option value="Policy">Policy</option>
                  <option value="Release">Release</option>
                  <option value="Culture">Culture</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1">Message</label>
                <textarea
                  required
                  rows={4}
                  value={form.body}
                  onChange={(e) => setForm({ ...form, body: e.target.value })}
                  className="w-full rounded-lg border border-neutral-200 dark:border-zinc-800 bg-white dark:bg-black px-3 py-2 text-sm text-neutral-900 dark:text-neutral-100"
                />
              </div>
              <label className="inline-flex items-center gap-2 text-xs text-neutral-700 dark:text-neutral-300">
                <input
                  type="checkbox"
                  checked={form.pinned}
                  onChange={(e) => setForm({ ...form, pinned: e.target.checked })}
                  className="accent-sky-600"
                />
                <span>Pin to Dashboard Feed</span>
              </label>
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
                  Publish
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
