import React from 'react';
import { LogOut, Menu, Moon, Sun } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { ModuleId } from '../../types';
import { ALL_MODULES } from '../../utils/rbac';
import { UserAvatar } from '../common/UserAvatar';

interface TopHeaderProps {
  activeModule: ModuleId;
  onOpenMobileNav: () => void;
  onNavigateProfile: () => void;
}

export const TopHeader: React.FC<TopHeaderProps> = ({
  activeModule,
  onOpenMobileNav,
  onNavigateProfile,
}) => {
  const { state, currentUser, toggleTheme, logout, canView, getPerm } = useAppStore();
  const activeMeta = ALL_MODULES.find((m) => m.id === activeModule);
  const pos = state.positions.find((p) => p.id === currentUser.positionId);
  const perm = getPerm(activeModule);

  return (
    <header className="h-14 border-b border-neutral-200 dark:border-zinc-800 bg-white dark:bg-[#0A0A0C] px-4 sm:px-6 flex items-center justify-between gap-6 shrink-0">
      {/* Left: Mobile toggle + Breadcrumb */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={onOpenMobileNav}
          className="lg:hidden p-2 -ml-2 rounded-lg text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-zinc-900"
          aria-label="Open navigation menu"
        >
          <Menu className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-2 text-sm min-w-0">
          <span className="text-neutral-400 dark:text-neutral-500 hidden sm:inline whitespace-nowrap">
            {state.branding.appName}
          </span>
          <span className="text-neutral-300 dark:text-zinc-700 hidden sm:inline">/</span>
          <h1 className="font-display font-semibold text-neutral-900 dark:text-neutral-100 truncate">
            {activeMeta?.label ?? 'Workspace'}
          </h1>
          <span className="text-neutral-300 dark:text-zinc-700 hidden md:inline">·</span>
          <span className="text-xs text-neutral-500 dark:text-neutral-400 hidden md:inline whitespace-nowrap">
            {perm === 'edit' ? 'Edit Access' : perm === 'view' ? 'View Only' : 'Restricted'}
          </span>
        </div>
      </div>

      {/* Right: Theme toggle + User trigger + Sign Out */}
      <div className="flex items-center gap-2.5 shrink-0">
        <button
          type="button"
          onClick={toggleTheme}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-zinc-800 text-xs font-medium text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-zinc-900 transition-colors whitespace-nowrap shrink-0"
          aria-label="Toggle light or dark mode"
        >
          {state.branding.theme === 'dark' ? (
            <>
              <Sun className="h-3.5 w-3.5 text-amber-400" />
              <span>Light</span>
            </>
          ) : (
            <>
              <Moon className="h-3.5 w-3.5 text-neutral-600" />
              <span>Dark</span>
            </>
          )}
        </button>

        <button
          type="button"
          onClick={() => {
            if (canView('profile')) onNavigateProfile();
          }}
          className="flex items-center gap-2.5 pl-1 pr-2 py-1 rounded-lg hover:bg-neutral-100 dark:hover:bg-zinc-900 transition-colors text-left shrink-0"
        >
          <UserAvatar name={currentUser.fullName} avatarUrl={currentUser.avatarUrl} size="sm" />
          <div className="hidden sm:block leading-tight">
            <div className="text-xs font-semibold text-neutral-900 dark:text-neutral-100 whitespace-nowrap">
              {currentUser.fullName}
            </div>
            <div className="text-[11px] text-neutral-500 dark:text-neutral-400 whitespace-nowrap max-w-[140px] truncate">
              {pos?.title ?? 'Administrator'}
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={logout}
          title="Sign Out"
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-neutral-200 dark:border-zinc-800 text-xs font-medium text-neutral-600 dark:text-neutral-300 hover:text-red-600 dark:hover:text-red-400 hover:border-red-300 dark:hover:border-red-900 transition-colors whitespace-nowrap shrink-0"
        >
          <LogOut className="h-3.5 w-3.5" />
          <span className="hidden md:inline">Sign Out</span>
        </button>
      </div>
    </header>
  );
};
