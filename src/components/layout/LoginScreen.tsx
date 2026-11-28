import React, { useState } from 'react';
import { ArrowRight, Eye, EyeOff, Lock, Mail, Moon, Sun } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';

const LAST_LOGIN_EMAIL_KEY = 'department_os_last_login_email';

export const LoginScreen: React.FC = () => {
  const { state, login, toggleTheme } = useAppStore();
  const [email, setEmail] = useState(() => {
    try {
      return localStorage.getItem(LAST_LOGIN_EMAIL_KEY) ?? '';
    } catch {
      return '';
    }
  });
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const ok = login(email, password);
    if (ok) {
      try {
        localStorage.setItem(LAST_LOGIN_EMAIL_KEY, email.trim());
      } catch {
        // Ignore storage quota / privacy mode restrictions
      }
    } else {
      setError('Invalid email, password, or inactive account.');
    }
  };

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-black flex flex-col">
      {/* Minimal Header */}
      <header className="px-6 py-4 flex items-center justify-between border-b border-neutral-200 dark:border-zinc-800 bg-white dark:bg-[#0A0A0C]">
        <div className="flex items-center gap-2.5">
          {state.branding.logoUrl ? (
            <img
              src={state.branding.logoUrl}
              alt={state.branding.appName}
              referrerPolicy="no-referrer"
              className="h-8 w-auto max-w-[140px] rounded-md object-contain"
            />
          ) : (
            <div className="h-8 w-8 rounded-lg bg-zinc-900 dark:bg-zinc-900 border border-zinc-800 text-white font-display font-bold flex items-center justify-center relative overflow-hidden">
              <span>{state.branding.appName.slice(0, 1).toUpperCase()}</span>
              <span className="absolute bottom-0 inset-x-0 h-0.5 flex">
                <span className="flex-1 bg-amber-500" />
                <span className="flex-1 bg-sky-500" />
                <span className="flex-1 bg-red-600" />
              </span>
            </div>
          )}
          <span className="font-display font-bold text-lg text-neutral-900 dark:text-neutral-100 whitespace-nowrap">
            {state.branding.appName}
          </span>
        </div>

        <button
          type="button"
          onClick={toggleTheme}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-zinc-800 text-xs font-medium text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-zinc-900 transition-colors"
        >
          {state.branding.theme === 'dark' ? (
            <Sun className="h-3.5 w-3.5 text-amber-400" />
          ) : (
            <Moon className="h-3.5 w-3.5 text-neutral-600" />
          )}
          <span>{state.branding.theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
        </button>
      </header>

      {/* Centered Minimalist Login Card */}
      <main className="flex-1 flex items-center justify-center p-6">
        <section className="w-full max-w-md rounded-2xl border border-neutral-200 dark:border-zinc-800 bg-white dark:bg-[#0A0A0C] overflow-hidden">
          <div className="p-7 sm:p-9">
            {state.branding.logoUrl && (
              <div className="mb-5">
                <img
                  src={state.branding.logoUrl}
                  alt={state.branding.appName}
                  referrerPolicy="no-referrer"
                  className="h-10 w-auto max-w-[180px] object-contain"
                />
              </div>
            )}
            <p className="text-xs font-medium text-amber-600 dark:text-amber-400">
              {state.branding.tagline}
            </p>
            <h1 className="mt-2 text-2xl font-display font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
              Sign in to {state.branding.appName}
            </h1>
            <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed">
              {state.branding.heroText}
            </p>

            <form onSubmit={handleSubmit} className="mt-7 space-y-4">
              <div>
                <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">
                  Work Email
                </label>
                <div className="relative">
                  <Mail className="h-4 w-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@ecamsolution.com"
                    className="w-full pl-9 pr-3 py-2.5 text-sm rounded-lg border border-neutral-200 dark:border-zinc-800 bg-neutral-50 dark:bg-black text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <Lock className="h-4 w-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    className="w-full pl-9 pr-10 py-2.5 text-sm rounded-lg border border-neutral-200 dark:border-zinc-800 bg-neutral-50 dark:bg-black text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 px-3 py-2 text-xs text-red-700 dark:text-red-300">
                  {error}
                </div>
              )}

              <button
                type="submit"
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-sm font-medium transition-colors"
              >
                <span>Sign In</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </form>
          </div>
        </section>
      </main>
    </div>
  );
};
