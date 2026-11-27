import React, { useState } from 'react';
import { Award, Save } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { ImageUploadField } from '../common/ImageUploadField';
import { UserAvatar } from '../common/UserAvatar';

export const ProfileView: React.FC = () => {
  const { state, currentUser, canEdit, updateOwnProfile, notify } = useAppStore();
  const editable = canEdit('profile');

  const [form, setForm] = useState({
    fullName: currentUser.fullName,
    avatarUrl: currentUser.avatarUrl,
    location: currentUser.location,
    phone: currentUser.phone,
    bio: currentUser.bio,
  });

  const pos = state.positions.find((p) => p.id === currentUser.positionId);
  const certs = state.enrollments.filter((e) => e.userId === currentUser.id && e.passed);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editable) return;
    updateOwnProfile(form);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      <section className="lg:col-span-7 rounded-xl border border-neutral-200 dark:border-zinc-800 bg-white dark:bg-[#0A0A0C] p-6 space-y-5">
        <div className="flex items-center gap-4">
          <UserAvatar name={currentUser.fullName} avatarUrl={form.avatarUrl} size="xl" />
          <div>
            <h2 className="text-lg font-display font-bold text-neutral-900 dark:text-neutral-100">
              {currentUser.fullName}
            </h2>
            <p className="text-xs font-medium text-sky-600 dark:text-sky-400">
              {pos?.title ?? 'Administrator'} · {currentUser.department}
            </p>
            <p className="text-xs text-neutral-500 mt-0.5">{currentUser.email}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-sm">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1">Full Name</label>
              <input
                type="text"
                disabled={!editable}
                value={form.fullName}
                onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                className="w-full rounded-lg border border-neutral-200 dark:border-zinc-800 bg-neutral-50 dark:bg-black px-3 py-2 text-sm disabled:opacity-70"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1">Phone</label>
              <input
                type="text"
                disabled={!editable}
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="w-full font-mono-tabular rounded-lg border border-neutral-200 dark:border-zinc-800 bg-neutral-50 dark:bg-black px-3 py-2 text-sm disabled:opacity-70"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1">Location</label>
              <input
                type="text"
                disabled={!editable}
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                className="w-full rounded-lg border border-neutral-200 dark:border-zinc-800 bg-neutral-50 dark:bg-black px-3 py-2 text-sm disabled:opacity-70"
              />
            </div>
            <div className="sm:col-span-2">
              <ImageUploadField
                label="Profile Photo"
                value={form.avatarUrl}
                onChange={(avatarUrl) => setForm({ ...form, avatarUrl })}
                disabled={!editable}
                emptyHint="Using colored initials avatar"
                previewAspect="square"
                optimizeOptions={{ maxWidth: 400, maxHeight: 400, quality: 0.85 }}
                onError={(msg) => notify(msg, 'error')}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1">Bio</label>
            <textarea
              rows={3}
              disabled={!editable}
              value={form.bio}
              onChange={(e) => setForm({ ...form, bio: e.target.value })}
              className="w-full rounded-lg border border-neutral-200 dark:border-zinc-800 bg-neutral-50 dark:bg-black px-3 py-2 text-sm disabled:opacity-70"
            />
          </div>

          {editable && (
            <div className="flex justify-end">
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-medium"
              >
                <Save className="h-3.5 w-3.5" />
                Save Profile
              </button>
            </div>
          )}
        </form>
      </section>

      <section className="lg:col-span-5 rounded-xl border border-neutral-200 dark:border-zinc-800 bg-white dark:bg-[#0A0A0C] p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Award className="h-5 w-5 text-amber-500" />
          <h3 className="text-base font-display font-semibold text-neutral-900 dark:text-neutral-100">
            Earned Certifications ({certs.length})
          </h3>
        </div>

        {certs.length > 0 ? (
          <div className="space-y-2.5">
            {certs.map((enr) => {
              const course = state.courses.find((c) => c.id === enr.courseId);
              return (
                <div
                  key={enr.id}
                  className="rounded-lg border border-neutral-200 dark:border-zinc-800 p-3.5 flex items-center justify-between gap-2"
                >
                  <div>
                    <div className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                      {course?.title}
                    </div>
                    <div className="text-xs text-neutral-500 mt-0.5">
                      {course?.category} · Completed{' '}
                      <span className="font-mono-tabular">{enr.completedAt?.slice(0, 10)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            Complete published courses in the Learning Center to earn certificates.
          </p>
        )}
      </section>
    </div>
  );
};
