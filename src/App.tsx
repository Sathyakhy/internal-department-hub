import React, { useEffect, useState } from 'react';
import { AppProvider, useAppStore } from './store/useAppStore';
import { ModuleId } from './types';
import { ALL_MODULES } from './utils/rbac';
import { AccessDenied } from './components/common/AccessDenied';
import { ToastContainer } from './components/common/ToastContainer';
import { LoginScreen } from './components/layout/LoginScreen';
import { Sidebar } from './components/layout/Sidebar';
import { TopHeader } from './components/layout/TopHeader';
import { AdminRbacAuditView } from './components/modules/AdminRbacAuditView';
import { AnnouncementsView } from './components/modules/AnnouncementsView';
import { DashboardView } from './components/modules/DashboardView';
import { LearningView } from './components/modules/LearningView';
import { MyTasksView } from './components/modules/MyTasksView';
import { OnboardingHubView } from './components/modules/OnboardingHubView';
import { OrgChartView } from './components/modules/OrgChartView';
import { PositionsCatalogView } from './components/modules/PositionsCatalogView';
import { ProfileView } from './components/modules/ProfileView';
import { ProjectConfigView } from './components/modules/ProjectConfigView';
import { ProjectsView } from './components/modules/ProjectsView';
import { SettingsView } from './components/modules/SettingsView';
import { StaffDirectoryView } from './components/modules/StaffDirectoryView';
import { TaskDetailDrawer } from './components/modules/TaskDetailDrawer';

const WorkspaceShell: React.FC = () => {
  const { state, currentUser, canView } = useAppStore();

  const [activeModule, setActiveModule] = useState<ModuleId>('dashboard');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [drawerTaskId, setDrawerTaskId] = useState<string | null>(null);

  useEffect(() => {
    if (!canView(activeModule)) {
      const firstPermitted = ALL_MODULES.find((m) => canView(m.id))?.id ?? 'dashboard';
      setActiveModule(firstPermitted);
    }
  }, [currentUser.id, state.roles, activeModule, canView]);

  if (!state.isAuthenticated) {
    return (
      <>
        <LoginScreen />
        <ToastContainer />
      </>
    );
  }

  const renderModule = () => {
    const meta = ALL_MODULES.find((m) => m.id === activeModule);
    if (!canView(activeModule)) {
      return (
        <AccessDenied
          moduleLabel={meta?.label ?? activeModule}
          onBackToDashboard={() => setActiveModule('dashboard')}
        />
      );
    }

    switch (activeModule) {
      case 'dashboard':
        return (
          <DashboardView
            onOpenTaskDrawer={(tid) => setDrawerTaskId(tid)}
            onNavigateModule={(m) => setActiveModule(m)}
          />
        );
      case 'onboarding':
        return (
          <OnboardingHubView
            onOpenTaskDrawer={(tid) => setDrawerTaskId(tid)}
            onNavigateModule={(m) => setActiveModule(m)}
          />
        );
      case 'projects':
        return <ProjectsView onOpenTaskDrawer={(tid) => setDrawerTaskId(tid)} />;
      case 'tasks':
        return <MyTasksView onOpenTaskDrawer={(tid) => setDrawerTaskId(tid)} />;
      case 'learning':
        return <LearningView />;
      case 'announcements':
        return <AnnouncementsView />;
      case 'staff':
        return <StaffDirectoryView />;
      case 'positions':
        return <PositionsCatalogView />;
      case 'org-chart':
        return <OrgChartView />;
      case 'profile':
        return <ProfileView />;
      case 'project-config':
        return <ProjectConfigView />;
      case 'admin':
        return <AdminRbacAuditView />;
      case 'settings':
        return <SettingsView />;
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen flex bg-neutral-50 dark:bg-black text-neutral-900 dark:text-neutral-100">
      <Sidebar
        activeModule={activeModule}
        onSelectModule={setActiveModule}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((v) => !v)}
        mobileOpen={mobileNavOpen}
        onCloseMobile={() => setMobileNavOpen(false)}
      />

      <div className="flex-1 flex flex-col min-w-0">
        <TopHeader
          activeModule={activeModule}
          onOpenMobileNav={() => setMobileNavOpen(true)}
          onNavigateProfile={() => setActiveModule('profile')}
        />

        <main className="flex-1 overflow-y-auto p-4 sm:p-6">
          <div className="max-w-[1440px] mx-auto">{renderModule()}</div>
        </main>
      </div>

      <TaskDetailDrawer
        taskId={drawerTaskId}
        onClose={() => setDrawerTaskId(null)}
        onSelectTask={(tid) => setDrawerTaskId(tid)}
      />

      <ToastContainer />
    </div>
  );
};

export default function App() {
  return (
    <AppProvider>
      <WorkspaceShell />
    </AppProvider>
  );
}
