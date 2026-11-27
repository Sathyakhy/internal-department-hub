import React from 'react';
import {
  Award,
  Briefcase,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  Compass,
  FolderKanban,
  LayoutDashboard,
  Megaphone,
  Network,
  Settings,
  Shield,
  Sliders,
  UserCircle,
  Users,
  X,
} from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { ModuleId } from '../../types';
import { ALL_MODULES } from '../../utils/rbac';

const MODULE_ICONS: Record<ModuleId, React.ElementType> = {
  dashboard: LayoutDashboard,
  onboarding: Compass,
  projects: FolderKanban,
  tasks: CheckSquare,
  learning: Award,
  announcements: Megaphone,
  staff: Users,
  positions: Briefcase,
  'org-chart': Network,
  profile: UserCircle,
  'project-config': Sliders,
  admin: Shield,
  settings: Settings,
};

interface SidebarProps {
  activeModule: ModuleId;
  onSelectModule: (mod: ModuleId) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeModule,
  onSelectModule,
  collapsed,
  onToggleCollapse,
  mobileOpen,
  onCloseMobile,
}) => {
  const { state, canView, getPerm } = useAppStore();

  const visibleModules = ALL_MODULES.filter((m) => canView(m.id));
  const groups: ('Core' | 'Workspace' | 'People' | 'Administration')[] = [
    'Core',
    'Workspace',
    'People',
    'Administration',
  ];

  const renderBrand = () => (
    <div className="flex items-center justify-between gap-2 px-4 h-14 border-b border-neutral-200 dark:border-zinc-800 shrink-0 relative">
      <div className="flex items-center gap-2.5 min-w-0">
        {state.branding.logoUrl ? (
          <img
            src={state.branding.logoUrl}
            alt={state.branding.appName}
            referrerPolicy="no-referrer"
            className={`${
              collapsed ? 'h-7 w-7' : 'h-7 w-auto max-w-[110px]'
            } rounded object-contain shrink-0`}
          />
        ) : (
          <div className="h-7 w-7 rounded-md bg-zinc-900 dark:bg-zinc-900 border border-zinc-800 text-white font-display font-bold text-sm flex items-center justify-center shrink-0 relative overflow-hidden">
            <span>{state.branding.appName.slice(0, 1).toUpperCase()}</span>
            <span className="absolute bottom-0 inset-x-0 h-0.5 flex">
              <span className="flex-1 bg-amber-500" />
              <span className="flex-1 bg-sky-500" />
              <span className="flex-1 bg-red-600" />
            </span>
          </div>
        )}
        {!collapsed && (
          <span className="font-display font-bold text-base tracking-tight text-neutral-900 dark:text-neutral-100 truncate">
            {state.branding.appName}
          </span>
        )}
      </div>

      <button
        type="button"
        onClick={onToggleCollapse}
        className="hidden lg:inline-flex p-1.5 rounded-md text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-zinc-900 transition-colors"
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
      </button>

      <button
        type="button"
        onClick={onCloseMobile}
        className="lg:hidden p-1.5 rounded-md text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100"
        aria-label="Close navigation menu"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );

  const renderNav = () => (
    <nav className="flex-1 overflow-y-auto px-2.5 py-4 space-y-5">
      {groups.map((group) => {
        const items = visibleModules.filter((m) => m.group === group);
        if (items.length === 0) return null;
        return (
          <div key={group}>
            {!collapsed && (
              <div className="px-2.5 mb-1.5 text-[11px] font-medium text-neutral-400 dark:text-zinc-500 tracking-wide">
                {group}
              </div>
            )}
            <div className="space-y-0.5">
              {items.map((item) => {
                const Icon = MODULE_ICONS[item.id];
                const isActive = activeModule === item.id;
                const perm = getPerm(item.id);
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      onSelectModule(item.id);
                      onCloseMobile();
                    }}
                    title={collapsed ? item.label : undefined}
                    className={`w-full flex items-center justify-between gap-2.5 px-2.5 py-2 rounded-lg text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-400'
                        : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-zinc-900 hover:text-neutral-900 dark:hover:text-neutral-100'
                    }`}
                  >
                    <span className="flex items-center gap-2.5 min-w-0">
                      <Icon className={`h-4 w-4 shrink-0 ${isActive ? 'text-sky-600 dark:text-sky-400' : ''}`} />
                      {!collapsed && <span className="truncate whitespace-nowrap">{item.label}</span>}
                    </span>
                    {!collapsed && perm === 'view' && (
                      <span className="text-[10px] font-mono-tabular text-neutral-400 dark:text-zinc-500 shrink-0">
                        View
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </nav>
  );

  return (
    <>
      <aside
        className={`hidden lg:flex flex-col border-r border-neutral-200 dark:border-zinc-800 bg-white dark:bg-[#0A0A0C] shrink-0 transition-[width] duration-150 ${
          collapsed ? 'w-[68px]' : 'w-[252px]'
        }`}
      >
        {renderBrand()}
        {renderNav()}
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div className="fixed inset-0 bg-black/70" onClick={onCloseMobile} />
          <aside className="relative z-10 flex flex-col w-64 max-w-[80vw] bg-white dark:bg-[#0A0A0C] border-r border-neutral-200 dark:border-zinc-800 h-full">
            {renderBrand()}
            {renderNav()}
          </aside>
        </div>
      )}
    </>
  );
};
