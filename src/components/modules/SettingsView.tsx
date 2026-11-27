import React, { useEffect, useState } from 'react';
import { CloudDownload, CloudUpload, Moon, RotateCcw, Save, Sun } from 'lucide-react';
import { DEFAULT_CERT_BG } from '../../data/seedData';
import { useAppStore } from '../../store/useAppStore';
import { ImageUploadField } from '../common/ImageUploadField';

export const SettingsView: React.FC = () => {
  const {
    state,
    canEdit,
    updateBranding,
    toggleTheme,
    resetDemoData,
    pushLocalToCloud,
    pullCloudToLocal,
    notify,
  } = useAppStore();
  const editable = canEdit('settings');
  const [syncBusy, setSyncBusy] = useState<'push' | 'pull' | null>(null);

  const [form, setForm] = useState({
    appName: state.branding.appName,
    tagline: state.branding.tagline,
    heroText: state.branding.heroText,
    logoUrl: state.branding.logoUrl,
    defaultCertificateBg: state.branding.defaultCertificateBg,
  });

  useEffect(() => {
    setForm({
      appName: state.branding.appName,
      tagline: state.branding.tagline,
      heroText: state.branding.heroText,
      logoUrl: state.branding.logoUrl,
      defaultCertificateBg: state.branding.defaultCertificateBg,
    });
  }, [state.branding]);

  const [confirmReset, setConfirmReset] = useState(false);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editable) return;
    updateBranding(form);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      <form
        onSubmit={handleSave}
        className="lg:col-span-7 rounded-xl border border-neutral-200 dark:border-zinc-800 bg-white dark:bg-[#0A0A0C] p-6 space-y-5"
      >
        <div className="flex items-center justify-between border-b border-neutral-200 dark:border-zinc-800 pb-4">
          <div>
            <h2 className="text-base font-display font-semibold text-neutral-900 dark:text-neutral-100">
              Workspace Branding & Customization
            </h2>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Changes persist across reloads and apply to the sidebar, login portal, and LMS certificates.
            </p>
          </div>
          {editable && (
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-medium shrink-0"
            >
              <Save className="h-3.5 w-3.5" />
              Save Settings
            </button>
          )}
        </div>

        <div className="space-y-4 text-sm">
          <div>
            <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1">App Name</label>
            <input
              type="text"
              disabled={!editable}
              value={form.appName}
              onChange={(e) => setForm({ ...form, appName: e.target.value })}
              className="w-full rounded-lg border border-neutral-200 dark:border-zinc-800 bg-neutral-50 dark:bg-black px-3 py-2 text-sm disabled:opacity-70"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1">Tagline</label>
            <input
              type="text"
              disabled={!editable}
              value={form.tagline}
              onChange={(e) => setForm({ ...form, tagline: e.target.value })}
              className="w-full rounded-lg border border-neutral-200 dark:border-zinc-800 bg-neutral-50 dark:bg-black px-3 py-2 text-sm disabled:opacity-70"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1">Login Hero Text</label>
            <textarea
              rows={2}
              disabled={!editable}
              value={form.heroText}
              onChange={(e) => setForm({ ...form, heroText: e.target.value })}
              className="w-full rounded-lg border border-neutral-200 dark:border-zinc-800 bg-neutral-50 dark:bg-black px-3 py-2 text-sm disabled:opacity-70"
            />
          </div>

          <ImageUploadField
            label="Company Logo"
            value={form.logoUrl}
            onChange={(logoUrl) => setForm({ ...form, logoUrl })}
            disabled={!editable}
            emptyHint="No company logo uploaded (using monogram)"
            previewAspect="square"
            optimizeOptions={{ maxWidth: 512, maxHeight: 512, preserveTransparency: true }}
            onError={(msg) => notify(msg, 'error')}
          />

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400">
                Default Certificate Background Image
              </label>
              {editable && (
                <button
                  type="button"
                  onClick={() => setForm({ ...form, defaultCertificateBg: DEFAULT_CERT_BG })}
                  className="text-[11px] text-sky-600 dark:text-sky-400 hover:underline"
                >
                  Use Built-in Default
                </button>
              )}
            </div>
            <ImageUploadField
              value={form.defaultCertificateBg}
              onChange={(defaultCertificateBg) =>
                setForm({ ...form, defaultCertificateBg: defaultCertificateBg || DEFAULT_CERT_BG })
              }
              disabled={!editable}
              emptyHint="Using built-in certificate background"
              previewAspect="landscape"
              optimizeOptions={{ maxWidth: 1400, maxHeight: 1000, quality: 0.85 }}
              onError={(msg) => notify(msg, 'error')}
            />
          </div>
        </div>
      </form>

      <div className="lg:col-span-5 space-y-6">
        <div className="rounded-xl border border-neutral-200 dark:border-zinc-800 bg-white dark:bg-[#0A0A0C] p-5 space-y-3">
          <h3 className="text-sm font-display font-semibold text-neutral-900 dark:text-neutral-100">
            Default Certificate Background Preview
          </h3>
          <div className="aspect-[2631/1860] rounded-lg border border-neutral-200 dark:border-zinc-800 overflow-hidden bg-white">
            <img
              src={form.defaultCertificateBg || DEFAULT_CERT_BG}
              alt="Default Certificate Background"
              referrerPolicy="no-referrer"
              className="w-full h-full object-contain"
            />
          </div>
        </div>

        <div className="rounded-xl border border-neutral-200 dark:border-zinc-800 bg-white dark:bg-[#0A0A0C] p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-display font-semibold text-neutral-900 dark:text-neutral-100">
                Interface Appearance
              </h3>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Switch between clean Light mode and pure Black Dark mode.
              </p>
            </div>
            <button
              type="button"
              onClick={toggleTheme}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-neutral-200 dark:border-zinc-800 text-xs font-medium hover:bg-neutral-50 dark:hover:bg-zinc-900"
            >
              {state.branding.theme === 'dark' ? (
                <>
                  <Sun className="h-3.5 w-3.5 text-amber-400" /> Switch to Light
                </>
              ) : (
                <>
                  <Moon className="h-3.5 w-3.5" /> Switch to Black Dark
                </>
              )}
            </button>
          </div>

          <div className="pt-4 border-t border-neutral-100 dark:border-zinc-800 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-display font-semibold text-neutral-900 dark:text-neutral-100">
                Reset Workspace Data
              </h3>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Clears created items and restores the clean Administrator baseline.
              </p>
            </div>
            {!confirmReset ? (
              <button
                type="button"
                onClick={() => setConfirmReset(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-red-300 text-red-600 dark:border-red-900 dark:text-red-400 text-xs font-medium hover:bg-red-50 dark:hover:bg-red-950/30 whitespace-nowrap"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Reset Workspace
              </button>
            ) : (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    resetDemoData();
                    setForm({
                      appName: 'Department OS',
                      tagline: 'eCam Solution · Internal Workspace',
                      heroText:
                        'Sign in with your eCam Solution credentials to manage operations, projects, and team enablement.',
                      logoUrl: '',
                      defaultCertificateBg: DEFAULT_CERT_BG,
                    });
                    setConfirmReset(false);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-medium"
                >
                  Confirm Reset
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmReset(false)}
                  className="px-2.5 py-1.5 rounded-lg border border-neutral-200 dark:border-zinc-800 text-xs"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>

          {editable && (
            <div className="pt-4 border-t border-neutral-100 dark:border-zinc-800 space-y-3">
              <div>
                <h3 className="text-sm font-display font-semibold text-neutral-900 dark:text-neutral-100">
                  Cloud Database Sync
                </h3>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  Local data migrates automatically on load. You can also manually push or reload the shared workspace record.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={syncBusy !== null}
                  onClick={async () => {
                    setSyncBusy('push');
                    await pushLocalToCloud();
                    setSyncBusy(null);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-medium disabled:opacity-50 whitespace-nowrap"
                >
                  <CloudUpload className="h-3.5 w-3.5" />
                  <span>{syncBusy === 'push' ? 'Migrating...' : 'Migrate Local Data to DB'}</span>
                </button>
                <button
                  type="button"
                  disabled={syncBusy !== null}
                  onClick={async () => {
                    setSyncBusy('pull');
                    await pullCloudToLocal();
                    setSyncBusy(null);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-neutral-200 dark:border-zinc-800 hover:bg-neutral-50 dark:hover:bg-zinc-900 text-neutral-700 dark:text-neutral-200 text-xs font-medium disabled:opacity-50 whitespace-nowrap"
                >
                  <CloudDownload className="h-3.5 w-3.5" />
                  <span>{syncBusy === 'pull' ? 'Loading...' : 'Reload from DB'}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
