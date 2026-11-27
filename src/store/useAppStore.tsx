import { supabase } from '../integrations/supabase/client';
import type { Json } from '../integrations/supabase/types';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { DEFAULT_CERT_BG, LEGACY_DEFAULT_CERT_BG, SEED_STATE } from '../data/seedData';
import {
  Announcement,
  AppState,
  AuditLogEntry,
  BrandingSettings,
  Course,
  CustomerEntity,
  Enrollment,
  ModuleId,
  OnboardingChecklistItem,
  PermissionLevel,
  Position,
  ProductEntity,
  Project,
  ProjectFilterPreset,
  ProjectUpdate,
  QuizAttempt,
  Role,
  Task,
  TimelineColumnKey,
  ToastMessage,
  User,
  VendorEntity,
} from '../types';
import { getRowField, parseBooleanCell } from '../utils/excel';
import { canEditModule, canViewModule, getEffectivePermission } from '../utils/rbac';

const STORAGE_KEY = 'department_os_state_v2';
const CLOUD_MIGRATION_KEY = 'department_os_cloud_migrated_project';

export type CloudSyncStatus = 'connecting' | 'synced' | 'error' | 'offline';

const clone = <T,>(val: T): T => JSON.parse(JSON.stringify(val));

const uid = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

function hasCustomWorkspaceData(candidate: Partial<AppState> | null | undefined): boolean {
  if (!candidate) return false;
  if ((candidate.courses?.length ?? 0) > 0) return true;
  if ((candidate.enrollments?.length ?? 0) > 0) return true;
  if ((candidate.projects?.length ?? 0) > 0) return true;
  if ((candidate.tasks?.length ?? 0) > 0) return true;
  if ((candidate.positions?.length ?? 0) > 0) return true;
  if ((candidate.announcements?.length ?? 0) > 0) return true;
  if ((candidate.customers?.length ?? 0) > 0) return true;
  if ((candidate.vendors?.length ?? 0) > 0) return true;
  if ((candidate.products?.length ?? 0) > 0) return true;
  if ((candidate.onboardingItems?.length ?? 0) > 0) return true;
  if ((candidate.projectUpdates?.length ?? 0) > 0) return true;
  if ((candidate.filterPresets?.length ?? 0) > 0) return true;
  if ((candidate.auditLogs?.length ?? 0) > 0) return true;
  if ((candidate.users?.length ?? 0) > 1) return true;
  if (candidate.roles && candidate.roles.length !== SEED_STATE.roles.length) return true;
  if (candidate.branding?.logoUrl) return true;
  if (candidate.branding?.appName && candidate.branding.appName !== SEED_STATE.branding.appName) return true;
  if (candidate.branding?.tagline && candidate.branding.tagline !== SEED_STATE.branding.tagline) return true;
  if (
    candidate.branding?.defaultCertificateBg &&
    candidate.branding.defaultCertificateBg !== DEFAULT_CERT_BG &&
    candidate.branding.defaultCertificateBg !== LEGACY_DEFAULT_CERT_BG
  ) {
    return true;
  }
  return false;
}

function mergeById<T extends { id: string }>(primary: T[] = [], secondary: T[] = []): T[] {
  const seen = new Set(primary.map((item) => item.id));
  const merged = [...primary];
  for (const item of secondary) {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      merged.push(item);
    }
  }
  return merged;
}

function buildHydratedState(prev: AppState, incoming: Partial<AppState>): AppState {
  const savedCertBg = incoming.branding?.defaultCertificateBg;
  const upgradedCertBg =
    !savedCertBg || savedCertBg === LEGACY_DEFAULT_CERT_BG ? DEFAULT_CERT_BG : savedCertBg;
  const nextUsers = incoming.users && incoming.users.length > 0 ? incoming.users : prev.users;
  const validCurrentUserId = nextUsers.some((u) => u.id === prev.currentUserId)
    ? prev.currentUserId
    : nextUsers[0]?.id ?? prev.currentUserId;

  return {
    ...clone(SEED_STATE),
    ...prev,
    ...incoming,
    branding: {
      ...SEED_STATE.branding,
      ...prev.branding,
      ...(incoming.branding ?? {}),
      defaultCertificateBg: upgradedCertBg,
    },
    users: nextUsers,
    isAuthenticated: prev.isAuthenticated,
    currentUserId: validCurrentUserId,
  };
}

function mergeWorkspaceStates(local: AppState, remote: Partial<AppState>): AppState {
  const mergedBranding: BrandingSettings = {
    ...SEED_STATE.branding,
    ...(remote.branding ?? {}),
    ...local.branding,
    logoUrl: local.branding.logoUrl || remote.branding?.logoUrl || '',
    defaultCertificateBg:
      local.branding.defaultCertificateBg && local.branding.defaultCertificateBg !== LEGACY_DEFAULT_CERT_BG
        ? local.branding.defaultCertificateBg
        : remote.branding?.defaultCertificateBg && remote.branding.defaultCertificateBg !== LEGACY_DEFAULT_CERT_BG
          ? remote.branding.defaultCertificateBg
          : DEFAULT_CERT_BG,
  };

  const mergedUsers = mergeById(local.users, remote.users);
  const validCurrentUserId = mergedUsers.some((u) => u.id === local.currentUserId)
    ? local.currentUserId
    : mergedUsers[0]?.id ?? local.currentUserId;

  return {
    ...clone(SEED_STATE),
    ...remote,
    ...local,
    branding: mergedBranding,
    roles: mergeById(local.roles, remote.roles),
    positions: mergeById(local.positions, remote.positions),
    users: mergedUsers,
    onboardingItems: mergeById(local.onboardingItems, remote.onboardingItems),
    announcements: mergeById(local.announcements, remote.announcements),
    customers: mergeById(local.customers, remote.customers),
    vendors: mergeById(local.vendors, remote.vendors),
    products: mergeById(local.products, remote.products),
    projects: mergeById(local.projects, remote.projects),
    tasks: mergeById(local.tasks, remote.tasks),
    projectUpdates: mergeById(local.projectUpdates, remote.projectUpdates),
    filterPresets: mergeById(local.filterPresets, remote.filterPresets),
    courses: mergeById(local.courses, remote.courses),
    enrollments: mergeById(local.enrollments, remote.enrollments),
    auditLogs: mergeById(local.auditLogs, remote.auditLogs),
    isAuthenticated: local.isAuthenticated,
    currentUserId: validCurrentUserId,
  };
}

function serializeForCloud(s: AppState): Json {
  const { isAuthenticated: _ignoredAuth, ...rest } = s;
  return rest as unknown as Json;
}

function loadInitialState(): AppState {
  return clone(SEED_STATE);
}

interface AppContextValue {
  state: AppState;
  currentUser: User;
  toasts: ToastMessage[];
  dismissToast: (id: string) => void;
  notify: (title: string, type?: ToastMessage['type']) => void;
  cloudStatus: CloudSyncStatus;
  lastCloudSyncAt: string | null;
  pushLocalToCloud: () => Promise<boolean>;
  pullCloudToLocal: () => Promise<boolean>;
  getPerm: (moduleId: ModuleId) => PermissionLevel;
  canView: (moduleId: ModuleId) => boolean;
  canEdit: (moduleId: ModuleId) => boolean;

  // Auth
  login: (email: string, password: string) => boolean;
  logout: () => void;

  // Branding & Theme
  updateBranding: (patch: Partial<BrandingSettings>) => void;
  toggleTheme: () => void;
  resetDemoData: () => void;

  // Roles (RBAC)
  createRole: (role: Omit<Role, 'id'>) => void;
  updateRole: (id: string, patch: Partial<Role>) => void;
  deleteRole: (id: string) => void;

  // Positions
  createPosition: (pos: Omit<Position, 'id'>) => void;
  updatePosition: (id: string, patch: Partial<Position>) => void;
  deletePosition: (id: string) => void;

  // Staff & Profile
  createStaff: (user: Omit<User, 'id' | 'onboardingCompletedIds'>) => void;
  updateStaff: (id: string, patch: Partial<User>) => void;
  deleteStaff: (id: string) => void;
  updateOwnProfile: (patch: Partial<Pick<User, 'fullName' | 'avatarUrl' | 'location' | 'phone' | 'bio' | 'password'>>) => void;

  // Onboarding
  toggleOnboardingItem: (userId: string, itemId: string) => void;
  createOnboardingItem: (item: Omit<OnboardingChecklistItem, 'id'>) => void;
  deleteOnboardingItem: (id: string) => void;

  // Announcements
  createAnnouncement: (ann: Omit<Announcement, 'id' | 'createdAt' | 'authorId'>) => void;
  updateAnnouncement: (id: string, patch: Partial<Announcement>) => void;
  deleteAnnouncement: (id: string) => void;

  // Project Config (Customers, Vendors, Products)
  createCustomer: (item: Omit<CustomerEntity, 'id'>) => void;
  updateCustomer: (id: string, patch: Partial<CustomerEntity>) => void;
  deleteCustomer: (id: string) => void;
  createVendor: (item: Omit<VendorEntity, 'id'>) => void;
  updateVendor: (id: string, patch: Partial<VendorEntity>) => void;
  deleteVendor: (id: string) => void;
  createProduct: (item: Omit<ProductEntity, 'id'>) => void;
  updateProduct: (id: string, patch: Partial<ProductEntity>) => void;
  deleteProduct: (id: string) => void;

  // Projects & Tasks
  createProject: (proj: Omit<Project, 'id' | 'createdAt'>) => Project;
  updateProject: (id: string, patch: Partial<Project>) => void;
  deleteProject: (id: string) => void;
  saveProjectAsTemplate: (projectId: string) => void;
  createProjectFromTemplate: (templateId: string, newName: string) => Project | null;
  postProjectUpdate: (projectId: string, message: string, healthStatus: ProjectUpdate['healthStatus']) => void;
  saveFilterPreset: (preset: Omit<ProjectFilterPreset, 'id'>) => void;
  deleteFilterPreset: (id: string) => void;
  updateProjectVisibleColumns: (projectId: string, columns: TimelineColumnKey[]) => void;

  createTask: (task: Omit<Task, 'id' | 'updatedAt'>) => Task;
  updateTask: (id: string, patch: Partial<Task>) => void;
  deleteTask: (id: string) => void;
  duplicateTask: (id: string) => void;
  bulkUpdateTasks: (taskIds: string[], patch: Partial<Pick<Task, 'status' | 'assigneeId' | 'archived'>>) => void;

  // LMS Courses & Enrollments
  createCourse: (course: Omit<Course, 'id' | 'createdAt'>) => Course;
  updateCourse: (id: string, patch: Partial<Course>) => void;
  deleteCourse: (id: string) => void;
  enrollInCourse: (userId: string, courseId: string) => void;
  toggleLessonCompletion: (userId: string, courseId: string, lessonId: string) => void;
  submitQuizAttempt: (userId: string, courseId: string, answers: number[]) => QuizAttempt;

  // Bulk Excel Imports
  importPositions: (rows: Record<string, string>[]) => void;
  importStaff: (rows: Record<string, string>[]) => void;
  importConfigEntities: (kind: 'customers' | 'vendors' | 'products', rows: Record<string, string>[]) => void;
  importProjects: (rows: Record<string, string>[]) => void;
  importTasks: (projectId: string, rows: Record<string, string>[]) => void;
  importOnboardingItems: (rows: Record<string, string>[]) => void;
  importAnnouncements: (rows: Record<string, string>[]) => void;
}

const AppStoreContext = createContext<AppContextValue | null>(null);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<AppState>(loadInitialState);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const notify = useCallback((title: string, type: ToastMessage['type'] = 'success') => {
    const id = uid('toast');
    setToasts((prev) => [...prev, { id, title, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3400);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const [cloudStatus, setCloudStatus] = useState<CloudSyncStatus>(() =>
    supabase ? 'connecting' : 'offline'
  );
  const [lastCloudSyncAt, setLastCloudSyncAt] = useState<string | null>(null);

  const stateRef = useRef(state);
  stateRef.current = state;

  // Cloud sync: safely migrate local data on first connect, or hydrate from shared workspace_state
  const cloudReady = useRef(false);
  const skipNextCloudSave = useRef(false);

  useEffect(() => {
    if (!supabase) {
      setCloudStatus('offline');
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('workspace_state')
          .select('data, updated_at')
          .eq('id', 'main')
          .maybeSingle();

        if (cancelled) return;
        if (error) {
          console.error('Cloud load failed', error);
          setCloudStatus('error');
          return;
        }

        const localSnapshot = stateRef.current;
        const remoteData = (data?.data ?? null) as Partial<AppState> | null;
        const remoteHasData = hasCustomWorkspaceData(remoteData);
        const localHasData = hasCustomWorkspaceData(localSnapshot);
        const projectId = (import.meta.env.VITE_SUPABASE_PROJECT_ID as string | undefined) || 'default';
        const alreadyMigrated = localStorage.getItem(CLOUD_MIGRATION_KEY) === projectId;

        if (localHasData && !remoteHasData) {
          const nowIso = new Date().toISOString();
          const { error: upsertError } = await supabase.from('workspace_state').upsert({
            id: 'main',
            data: serializeForCloud(localSnapshot),
            updated_at: nowIso,
          });
          if (cancelled) return;
          if (upsertError) {
            console.error('Cloud migration upsert failed', upsertError);
            setCloudStatus('error');
          } else {
            localStorage.setItem(CLOUD_MIGRATION_KEY, projectId);
            setLastCloudSyncAt(nowIso);
            setCloudStatus('synced');
            notify('Migrated local workspace data to cloud database');
          }
        } else if (localHasData && remoteHasData && !alreadyMigrated && remoteData) {
          const merged = mergeWorkspaceStates(localSnapshot, remoteData);
          const nowIso = new Date().toISOString();
          skipNextCloudSave.current = true;
          setState(merged);
          const { error: upsertError } = await supabase.from('workspace_state').upsert({
            id: 'main',
            data: serializeForCloud(merged),
            updated_at: nowIso,
          });
          if (cancelled) return;
          if (upsertError) {
            console.error('Cloud merge upsert failed', upsertError);
            setCloudStatus('error');
          } else {
            localStorage.setItem(CLOUD_MIGRATION_KEY, projectId);
            setLastCloudSyncAt(nowIso);
            setCloudStatus('synced');
            notify('Merged and synced workspace data with cloud database');
          }
        } else if (remoteHasData && remoteData) {
          skipNextCloudSave.current = true;
          setState((prev) => buildHydratedState(prev, remoteData));
          localStorage.setItem(CLOUD_MIGRATION_KEY, projectId);
          setLastCloudSyncAt(data?.updated_at ?? new Date().toISOString());
          setCloudStatus('synced');
        } else {
          localStorage.setItem(CLOUD_MIGRATION_KEY, projectId);
          setLastCloudSyncAt(data?.updated_at ?? null);
          setCloudStatus('synced');
        }

        cloudReady.current = true;
      } catch (err) {
        if (cancelled) return;
        console.error('Unexpected cloud sync error', err);
        setCloudStatus('error');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [notify]);

  useEffect(() => {
    const client = supabase;
    if (!client || !cloudReady.current) return;
    if (skipNextCloudSave.current) {
      skipNextCloudSave.current = false;
      return;
    }

    const t = setTimeout(() => {
      const nowIso = new Date().toISOString();
      client
        .from('workspace_state')
        .upsert({ id: 'main', data: serializeForCloud(state), updated_at: nowIso })
        .then(({ error }) => {
          if (error) {
            console.error('Cloud save failed', error);
            setCloudStatus('error');
          } else {
            setLastCloudSyncAt(nowIso);
            setCloudStatus('synced');
          }
        });
    }, 800);

    return () => clearTimeout(t);
  }, [state]);

  const pushLocalToCloud = useCallback(async (): Promise<boolean> => {
    if (!supabase) {
      notify('Cloud database is not configured.', 'error');
      return false;
    }
    setCloudStatus('connecting');
    const nowIso = new Date().toISOString();
    const { error } = await supabase.from('workspace_state').upsert({
      id: 'main',
      data: serializeForCloud(stateRef.current),
      updated_at: nowIso,
    });
    if (error) {
      console.error('Manual cloud push failed', error);
      setCloudStatus('error');
      notify('Failed to push local data to database.', 'error');
      return false;
    }
    const projectId = (import.meta.env.VITE_SUPABASE_PROJECT_ID as string | undefined) || 'default';
    localStorage.setItem(CLOUD_MIGRATION_KEY, projectId);
    cloudReady.current = true;
    setLastCloudSyncAt(nowIso);
    setCloudStatus('synced');
    notify('Workspace data migrated to cloud database');
    return true;
  }, [notify]);

  const pullCloudToLocal = useCallback(async (): Promise<boolean> => {
    if (!supabase) {
      notify('Cloud database is not configured.', 'error');
      return false;
    }
    setCloudStatus('connecting');
    const { data, error } = await supabase
      .from('workspace_state')
      .select('data, updated_at')
      .eq('id', 'main')
      .maybeSingle();

    if (error) {
      console.error('Manual cloud pull failed', error);
      setCloudStatus('error');
      notify('Failed to load workspace data from database.', 'error');
      return false;
    }
    const remoteData = (data?.data ?? null) as Partial<AppState> | null;
    if (!remoteData || Object.keys(remoteData).length === 0) {
      setCloudStatus('synced');
      notify('No saved workspace data found in cloud database yet.', 'info');
      return false;
    }

    skipNextCloudSave.current = true;
    setState((prev) => buildHydratedState(prev, remoteData));
    cloudReady.current = true;
    setLastCloudSyncAt(data?.updated_at ?? new Date().toISOString());
    setCloudStatus('synced');
    notify('Loaded workspace data from cloud database');
    return true;
  }, [notify]);



  // Sync Tailwind dark class
  useEffect(() => {
    const root = document.documentElement;
    if (state.branding.theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [state.branding.theme]);

  const currentUser = useMemo(
    () => state.users.find((u) => u.id === state.currentUserId) ?? state.users[0],
    [state.users, state.currentUserId]
  );

  const getPerm = useCallback(
    (moduleId: ModuleId) => getEffectivePermission(currentUser, state.roles, moduleId),
    [currentUser, state.roles]
  );

  const canView = useCallback(
    (moduleId: ModuleId) => canViewModule(currentUser, state.roles, moduleId),
    [currentUser, state.roles]
  );

  const canEdit = useCallback(
    (moduleId: ModuleId) => canEditModule(currentUser, state.roles, moduleId),
    [currentUser, state.roles]
  );

  const makeAudit = useCallback(
    (
      prevState: AppState,
      action: AuditLogEntry['action'],
      module: ModuleId,
      table: string,
      recordId: string,
      summary: string,
      before: unknown,
      after: unknown
    ): AuditLogEntry => {
      const actor = prevState.users.find((u) => u.id === prevState.currentUserId) ?? prevState.users[0];
      return {
        id: uid('aud'),
        actorId: actor?.id ?? 'system',
        actorName: actor?.fullName ?? 'System',
        timestamp: new Date().toISOString(),
        action,
        module,
        table,
        recordId,
        summary,
        before: before ? clone(before) : null,
        after: after ? clone(after) : null,
      };
    },
    []
  );

  // Auth
  const login = useCallback(
    (email: string, password: string) => {
      const normalized = email.trim().toLowerCase();
      const matched = state.users.find(
        (u) => u.email.toLowerCase() === normalized && u.password === password && u.isActive
      );
      if (!matched) {
        notify('Invalid email, password, or inactive account.', 'error');
        return false;
      }
      setState((prev) => ({
        ...prev,
        isAuthenticated: true,
        currentUserId: matched.id,
      }));
      notify(`Signed in as ${matched.fullName}`, 'success');
      return true;
    },
    [state.users, notify]
  );

  const logout = useCallback(() => {
    setState((prev) => ({ ...prev, isAuthenticated: false }));
  }, []);

  // Branding & Settings
  const updateBranding = useCallback(
    (patch: Partial<BrandingSettings>) => {
      setState((prev) => {
        const nextBranding = { ...prev.branding, ...patch };
        const audit = makeAudit(
          prev,
          'UPDATE',
          'settings',
          'branding',
          'branding-settings',
          'Updated workspace branding and theme settings',
          prev.branding,
          nextBranding
        );
        return {
          ...prev,
          branding: nextBranding,
          auditLogs: [audit, ...prev.auditLogs],
        };
      });
      notify('Settings saved');
    },
    [makeAudit, notify]
  );

  const toggleTheme = useCallback(() => {
    setState((prev) => ({
      ...prev,
      branding: {
        ...prev.branding,
        theme: prev.branding.theme === 'dark' ? 'light' : 'dark',
      },
    }));
  }, []);

  const resetDemoData = useCallback(async () => {
    const fresh = clone(SEED_STATE);
    fresh.isAuthenticated = true;
    setState(fresh);
    if (supabase) {
      const nowIso = new Date().toISOString();
      await supabase.from('workspace_state').upsert({
        id: 'main',
        data: serializeForCloud(fresh),
        updated_at: nowIso,
      });
    }
    notify('Demo data restored to Supabase database defaults', 'info');
  }, [notify]);

  // Roles
  const createRole = useCallback(
    (role: Omit<Role, 'id'>) => {
      const newRole: Role = { ...role, id: uid('role') };
      setState((prev) => {
        const audit = makeAudit(
          prev,
          'CREATE',
          'admin',
          'roles',
          newRole.id,
          `Created role "${newRole.name}"`,
          null,
          newRole
        );
        return { ...prev, roles: [...prev.roles, newRole], auditLogs: [audit, ...prev.auditLogs] };
      });
      notify(`Role "${role.name}" created`);
    },
    [makeAudit, notify]
  );

  const updateRole = useCallback(
    (id: string, patch: Partial<Role>) => {
      setState((prev) => {
        const existing = prev.roles.find((r) => r.id === id);
        if (!existing) return prev;
        const updated = { ...existing, ...patch };
        const audit = makeAudit(
          prev,
          'UPDATE',
          'admin',
          'roles',
          id,
          `Updated permissions for role "${updated.name}"`,
          existing,
          updated
        );
        return {
          ...prev,
          roles: prev.roles.map((r) => (r.id === id ? updated : r)),
          auditLogs: [audit, ...prev.auditLogs],
        };
      });
      notify('Role permissions updated');
    },
    [makeAudit, notify]
  );

  const deleteRole = useCallback(
    (id: string) => {
      setState((prev) => {
        const existing = prev.roles.find((r) => r.id === id);
        if (!existing) return prev;
        const audit = makeAudit(
          prev,
          'DELETE',
          'admin',
          'roles',
          id,
          `Deleted role "${existing.name}"`,
          existing,
          null
        );
        return {
          ...prev,
          roles: prev.roles.filter((r) => r.id !== id),
          users: prev.users.map((u) => ({ ...u, roleIds: u.roleIds.filter((rid) => rid !== id) })),
          auditLogs: [audit, ...prev.auditLogs],
        };
      });
      notify('Role deleted');
    },
    [makeAudit, notify]
  );

  // Positions
  const createPosition = useCallback(
    (pos: Omit<Position, 'id'>) => {
      const created: Position = { ...pos, id: uid('pos') };
      setState((prev) => {
        const audit = makeAudit(
          prev,
          'CREATE',
          'positions',
          'positions',
          created.id,
          `Added position "${created.title}" (${created.level})`,
          null,
          created
        );
        return { ...prev, positions: [...prev.positions, created], auditLogs: [audit, ...prev.auditLogs] };
      });
      notify(`Position "${pos.title}" added`);
    },
    [makeAudit, notify]
  );

  const updatePosition = useCallback(
    (id: string, patch: Partial<Position>) => {
      setState((prev) => {
        const existing = prev.positions.find((p) => p.id === id);
        if (!existing) return prev;
        const updated = { ...existing, ...patch };
        const audit = makeAudit(
          prev,
          'UPDATE',
          'positions',
          'positions',
          id,
          `Updated position "${updated.title}"`,
          existing,
          updated
        );
        return {
          ...prev,
          positions: prev.positions.map((p) => (p.id === id ? updated : p)),
          auditLogs: [audit, ...prev.auditLogs],
        };
      });
      notify('Position updated');
    },
    [makeAudit, notify]
  );

  const deletePosition = useCallback(
    (id: string) => {
      setState((prev) => {
        const existing = prev.positions.find((p) => p.id === id);
        if (!existing) return prev;
        const audit = makeAudit(
          prev,
          'DELETE',
          'positions',
          'positions',
          id,
          `Removed position "${existing.title}"`,
          existing,
          null
        );
        return {
          ...prev,
          positions: prev.positions.filter((p) => p.id !== id),
          auditLogs: [audit, ...prev.auditLogs],
        };
      });
      notify('Position deleted');
    },
    [makeAudit, notify]
  );

  // Staff (with Auto-Enrollment in LMS courses flagged autoAssignNewJoiners!)
  const createStaff = useCallback(
    (userInput: Omit<User, 'id' | 'onboardingCompletedIds'>) => {
      const created: User = {
        ...userInput,
        id: uid('usr'),
        onboardingCompletedIds: [],
      };
      setState((prev) => {
        const autoCourses = prev.courses.filter((c) => c.autoAssignNewJoiners);
        const now = new Date().toISOString();
        const newEnrollments: Enrollment[] = autoCourses.map((course) => ({
          id: uid('enr'),
          userId: created.id,
          courseId: course.id,
          completedLessonIds: [],
          quizAttempts: [],
          passed: false,
          completedAt: null,
          enrolledAt: now,
        }));

        const audit = makeAudit(
          prev,
          'CREATE',
          'staff',
          'users',
          created.id,
          `Created staff profile for ${created.fullName} (auto-enrolled in ${newEnrollments.length} LMS course${
            newEnrollments.length === 1 ? '' : 's'
          })`,
          null,
          created
        );
        return {
          ...prev,
          users: [...prev.users, created],
          enrollments: [...prev.enrollments, ...newEnrollments],
          auditLogs: [audit, ...prev.auditLogs],
        };
      });
      notify(`Added ${userInput.fullName} & auto-enrolled in onboarding courses`);
    },
    [makeAudit, notify]
  );

  const updateStaff = useCallback(
    (id: string, patch: Partial<User>) => {
      setState((prev) => {
        const existing = prev.users.find((u) => u.id === id);
        if (!existing) return prev;
        const updated = { ...existing, ...patch };
        const audit = makeAudit(
          prev,
          'UPDATE',
          'staff',
          'users',
          id,
          `Updated staff profile for ${updated.fullName}`,
          existing,
          updated
        );
        return {
          ...prev,
          users: prev.users.map((u) => (u.id === id ? updated : u)),
          auditLogs: [audit, ...prev.auditLogs],
        };
      });
      notify('Staff profile updated');
    },
    [makeAudit, notify]
  );

  const deleteStaff = useCallback(
    (id: string) => {
      setState((prev) => {
        if (prev.users.length <= 1 || prev.currentUserId === id) {
          return prev;
        }
        const existing = prev.users.find((u) => u.id === id);
        if (!existing) return prev;
        const audit = makeAudit(
          prev,
          'DELETE',
          'staff',
          'users',
          id,
          `Removed staff profile for ${existing.fullName}`,
          existing,
          null
        );
        return {
          ...prev,
          users: prev.users
            .filter((u) => u.id !== id)
            .map((u) => ({
              ...u,
              managerId: u.managerId === id ? null : u.managerId,
              mentorId: u.mentorId === id ? null : u.mentorId,
            })),
          auditLogs: [audit, ...prev.auditLogs],
        };
      });
      notify('Staff member removed');
    },
    [makeAudit, notify]
  );

  const updateOwnProfile = useCallback(
    (patch: Partial<Pick<User, 'fullName' | 'avatarUrl' | 'location' | 'phone' | 'bio' | 'password'>>) => {
      setState((prev) => {
        const existing = prev.users.find((u) => u.id === prev.currentUserId);
        if (!existing) return prev;
        const updated = { ...existing, ...patch };
        const audit = makeAudit(
          prev,
          'UPDATE',
          'profile',
          'users',
          existing.id,
          `Updated personal profile for ${updated.fullName}`,
          existing,
          updated
        );
        return {
          ...prev,
          users: prev.users.map((u) => (u.id === existing.id ? updated : u)),
          auditLogs: [audit, ...prev.auditLogs],
        };
      });
      notify('Profile updated');
    },
    [makeAudit, notify]
  );

  // Onboarding
  const toggleOnboardingItem = useCallback(
    (userId: string, itemId: string) => {
      setState((prev) => {
        const user = prev.users.find((u) => u.id === userId);
        if (!user) return prev;
        const has = user.onboardingCompletedIds.includes(itemId);
        const nextIds = has
          ? user.onboardingCompletedIds.filter((x) => x !== itemId)
          : [...user.onboardingCompletedIds, itemId];
        const updated = { ...user, onboardingCompletedIds: nextIds };
        const audit = makeAudit(
          prev,
          'UPDATE',
          'onboarding',
          'users',
          userId,
          `${has ? 'Unchecked' : 'Completed'} onboarding item for ${user.fullName}`,
          { onboardingCompletedIds: user.onboardingCompletedIds },
          { onboardingCompletedIds: nextIds }
        );
        return {
          ...prev,
          users: prev.users.map((u) => (u.id === userId ? updated : u)),
          auditLogs: [audit, ...prev.auditLogs],
        };
      });
    },
    [makeAudit]
  );

  const createOnboardingItem = useCallback(
    (item: Omit<OnboardingChecklistItem, 'id'>) => {
      const created: OnboardingChecklistItem = { ...item, id: uid('ob') };
      setState((prev) => {
        const audit = makeAudit(
          prev,
          'CREATE',
          'onboarding',
          'onboarding_items',
          created.id,
          `Added onboarding checklist task "${created.title}"`,
          null,
          created
        );
        return {
          ...prev,
          onboardingItems: [...prev.onboardingItems, created],
          auditLogs: [audit, ...prev.auditLogs],
        };
      });
      notify('Onboarding checklist item added');
    },
    [makeAudit, notify]
  );

  const deleteOnboardingItem = useCallback(
    (id: string) => {
      setState((prev) => {
        const existing = prev.onboardingItems.find((i) => i.id === id);
        if (!existing) return prev;
        const audit = makeAudit(
          prev,
          'DELETE',
          'onboarding',
          'onboarding_items',
          id,
          `Removed onboarding checklist task "${existing.title}"`,
          existing,
          null
        );
        return {
          ...prev,
          onboardingItems: prev.onboardingItems.filter((i) => i.id !== id),
          auditLogs: [audit, ...prev.auditLogs],
        };
      });
      notify('Checklist item removed');
    },
    [makeAudit, notify]
  );

  // Announcements
  const createAnnouncement = useCallback(
    (ann: Omit<Announcement, 'id' | 'createdAt' | 'authorId'>) => {
      setState((prev) => {
        const created: Announcement = {
          ...ann,
          id: uid('ann'),
          authorId: prev.currentUserId,
          createdAt: new Date().toISOString(),
        };
        const audit = makeAudit(
          prev,
          'CREATE',
          'announcements',
          'announcements',
          created.id,
          `Published announcement "${created.title}"`,
          null,
          created
        );
        return {
          ...prev,
          announcements: [created, ...prev.announcements],
          auditLogs: [audit, ...prev.auditLogs],
        };
      });
      notify('Announcement published');
    },
    [makeAudit, notify]
  );

  const updateAnnouncement = useCallback(
    (id: string, patch: Partial<Announcement>) => {
      setState((prev) => {
        const existing = prev.announcements.find((a) => a.id === id);
        if (!existing) return prev;
        const updated = { ...existing, ...patch };
        const audit = makeAudit(
          prev,
          'UPDATE',
          'announcements',
          'announcements',
          id,
          `Updated announcement "${updated.title}"`,
          existing,
          updated
        );
        return {
          ...prev,
          announcements: prev.announcements.map((a) => (a.id === id ? updated : a)),
          auditLogs: [audit, ...prev.auditLogs],
        };
      });
      notify('Announcement updated');
    },
    [makeAudit, notify]
  );

  const deleteAnnouncement = useCallback(
    (id: string) => {
      setState((prev) => {
        const existing = prev.announcements.find((a) => a.id === id);
        if (!existing) return prev;
        const audit = makeAudit(
          prev,
          'DELETE',
          'announcements',
          'announcements',
          id,
          `Deleted announcement "${existing.title}"`,
          existing,
          null
        );
        return {
          ...prev,
          announcements: prev.announcements.filter((a) => a.id !== id),
          auditLogs: [audit, ...prev.auditLogs],
        };
      });
      notify('Announcement deleted');
    },
    [makeAudit, notify]
  );

  // Project Config Entities
  const createCustomer = useCallback(
    (item: Omit<CustomerEntity, 'id'>) => {
      const created: CustomerEntity = { ...item, id: uid('cust') };
      setState((prev) => {
        const audit = makeAudit(
          prev,
          'CREATE',
          'project-config',
          'customers',
          created.id,
          `Added customer "${created.name}"`,
          null,
          created
        );
        return { ...prev, customers: [...prev.customers, created], auditLogs: [audit, ...prev.auditLogs] };
      });
      notify('Customer added');
    },
    [makeAudit, notify]
  );

  const updateCustomer = useCallback(
    (id: string, patch: Partial<CustomerEntity>) => {
      setState((prev) => {
        const existing = prev.customers.find((c) => c.id === id);
        if (!existing) return prev;
        const updated = { ...existing, ...patch };
        const audit = makeAudit(
          prev,
          'UPDATE',
          'project-config',
          'customers',
          id,
          `Updated customer "${updated.name}"`,
          existing,
          updated
        );
        return {
          ...prev,
          customers: prev.customers.map((c) => (c.id === id ? updated : c)),
          auditLogs: [audit, ...prev.auditLogs],
        };
      });
      notify('Customer updated');
    },
    [makeAudit, notify]
  );

  const deleteCustomer = useCallback(
    (id: string) => {
      setState((prev) => {
        const existing = prev.customers.find((c) => c.id === id);
        if (!existing) return prev;
        const audit = makeAudit(
          prev,
          'DELETE',
          'project-config',
          'customers',
          id,
          `Deleted customer "${existing.name}"`,
          existing,
          null
        );
        return {
          ...prev,
          customers: prev.customers.filter((c) => c.id !== id),
          auditLogs: [audit, ...prev.auditLogs],
        };
      });
      notify('Customer deleted');
    },
    [makeAudit, notify]
  );

  const createVendor = useCallback(
    (item: Omit<VendorEntity, 'id'>) => {
      const created: VendorEntity = { ...item, id: uid('vend') };
      setState((prev) => {
        const audit = makeAudit(
          prev,
          'CREATE',
          'project-config',
          'vendors',
          created.id,
          `Added vendor "${created.name}"`,
          null,
          created
        );
        return { ...prev, vendors: [...prev.vendors, created], auditLogs: [audit, ...prev.auditLogs] };
      });
      notify('Vendor added');
    },
    [makeAudit, notify]
  );

  const updateVendor = useCallback(
    (id: string, patch: Partial<VendorEntity>) => {
      setState((prev) => {
        const existing = prev.vendors.find((v) => v.id === id);
        if (!existing) return prev;
        const updated = { ...existing, ...patch };
        const audit = makeAudit(
          prev,
          'UPDATE',
          'project-config',
          'vendors',
          id,
          `Updated vendor "${updated.name}"`,
          existing,
          updated
        );
        return {
          ...prev,
          vendors: prev.vendors.map((v) => (v.id === id ? updated : v)),
          auditLogs: [audit, ...prev.auditLogs],
        };
      });
      notify('Vendor updated');
    },
    [makeAudit, notify]
  );

  const deleteVendor = useCallback(
    (id: string) => {
      setState((prev) => {
        const existing = prev.vendors.find((v) => v.id === id);
        if (!existing) return prev;
        const audit = makeAudit(
          prev,
          'DELETE',
          'project-config',
          'vendors',
          id,
          `Deleted vendor "${existing.name}"`,
          existing,
          null
        );
        return {
          ...prev,
          vendors: prev.vendors.filter((v) => v.id !== id),
          auditLogs: [audit, ...prev.auditLogs],
        };
      });
      notify('Vendor deleted');
    },
    [makeAudit, notify]
  );

  const createProduct = useCallback(
    (item: Omit<ProductEntity, 'id'>) => {
      const created: ProductEntity = { ...item, id: uid('prod') };
      setState((prev) => {
        const audit = makeAudit(
          prev,
          'CREATE',
          'project-config',
          'products',
          created.id,
          `Added product "${created.name}"`,
          null,
          created
        );
        return { ...prev, products: [...prev.products, created], auditLogs: [audit, ...prev.auditLogs] };
      });
      notify('Product added');
    },
    [makeAudit, notify]
  );

  const updateProduct = useCallback(
    (id: string, patch: Partial<ProductEntity>) => {
      setState((prev) => {
        const existing = prev.products.find((p) => p.id === id);
        if (!existing) return prev;
        const updated = { ...existing, ...patch };
        const audit = makeAudit(
          prev,
          'UPDATE',
          'project-config',
          'products',
          id,
          `Updated product "${updated.name}"`,
          existing,
          updated
        );
        return {
          ...prev,
          products: prev.products.map((p) => (p.id === id ? updated : p)),
          auditLogs: [audit, ...prev.auditLogs],
        };
      });
      notify('Product updated');
    },
    [makeAudit, notify]
  );

  const deleteProduct = useCallback(
    (id: string) => {
      setState((prev) => {
        const existing = prev.products.find((p) => p.id === id);
        if (!existing) return prev;
        const audit = makeAudit(
          prev,
          'DELETE',
          'project-config',
          'products',
          id,
          `Deleted product "${existing.name}"`,
          existing,
          null
        );
        return {
          ...prev,
          products: prev.products.filter((p) => p.id !== id),
          auditLogs: [audit, ...prev.auditLogs],
        };
      });
      notify('Product deleted');
    },
    [makeAudit, notify]
  );

  // Projects & Tasks
  const createProject = useCallback(
    (proj: Omit<Project, 'id' | 'createdAt'>) => {
      const created: Project = {
        ...proj,
        id: uid('proj'),
        createdAt: new Date().toISOString(),
      };
      setState((prev) => {
        const audit = makeAudit(
          prev,
          'CREATE',
          'projects',
          'projects',
          created.id,
          `Created project "${created.name}"`,
          null,
          created
        );
        return { ...prev, projects: [created, ...prev.projects], auditLogs: [audit, ...prev.auditLogs] };
      });
      notify(`Project "${proj.name}" created`);
      return created;
    },
    [makeAudit, notify]
  );

  const updateProject = useCallback(
    (id: string, patch: Partial<Project>) => {
      setState((prev) => {
        const existing = prev.projects.find((p) => p.id === id);
        if (!existing) return prev;
        const updated = { ...existing, ...patch };
        const audit = makeAudit(
          prev,
          'UPDATE',
          'projects',
          'projects',
          id,
          `Updated project "${updated.name}"`,
          existing,
          updated
        );
        return {
          ...prev,
          projects: prev.projects.map((p) => (p.id === id ? updated : p)),
          auditLogs: [audit, ...prev.auditLogs],
        };
      });
      notify('Project updated');
    },
    [makeAudit, notify]
  );

  const deleteProject = useCallback(
    (id: string) => {
      setState((prev) => {
        const existing = prev.projects.find((p) => p.id === id);
        if (!existing) return prev;
        const audit = makeAudit(
          prev,
          'DELETE',
          'projects',
          'projects',
          id,
          `Deleted project "${existing.name}"`,
          existing,
          null
        );
        return {
          ...prev,
          projects: prev.projects.filter((p) => p.id !== id),
          tasks: prev.tasks.filter((t) => t.projectId !== id),
          projectUpdates: prev.projectUpdates.filter((u) => u.projectId !== id),
          auditLogs: [audit, ...prev.auditLogs],
        };
      });
      notify('Project deleted');
    },
    [makeAudit, notify]
  );

  const cloneTasksForProject = (sourceTasks: Task[], targetProjectId: string): Task[] => {
    const idMap = new Map<string, string>();
    for (const t of sourceTasks) {
      idMap.set(t.id, uid('tsk'));
    }
    const now = new Date().toISOString();
    return sourceTasks.map((t) => ({
      ...clone(t),
      id: idMap.get(t.id)!,
      projectId: targetProjectId,
      parentId: t.parentId ? idMap.get(t.parentId) ?? null : null,
      predecessorIds: t.predecessorIds.map((pid) => idMap.get(pid)).filter((x): x is string => Boolean(x)),
      updatedAt: now,
    }));
  };

  const saveProjectAsTemplate = useCallback(
    (projectId: string) => {
      setState((prev) => {
        const src = prev.projects.find((p) => p.id === projectId);
        if (!src) return prev;
        const tplId = uid('proj-tpl');
        const template: Project = {
          ...clone(src),
          id: tplId,
          name: `${src.name} (Template)`,
          isTemplate: true,
          archived: false,
          createdAt: new Date().toISOString(),
        };
        const srcTasks = prev.tasks.filter((t) => t.projectId === projectId && !t.archived);
        const clonedTasks = cloneTasksForProject(srcTasks, tplId);
        const audit = makeAudit(
          prev,
          'CREATE',
          'projects',
          'projects',
          tplId,
          `Saved project "${src.name}" as reusable template`,
          null,
          template
        );
        return {
          ...prev,
          projects: [template, ...prev.projects],
          tasks: [...prev.tasks, ...clonedTasks],
          auditLogs: [audit, ...prev.auditLogs],
        };
      });
      notify('Project saved as reusable template');
    },
    [makeAudit, notify]
  );

  const createProjectFromTemplate = useCallback(
    (templateId: string, newName: string) => {
      let createdProject: Project | null = null;
      setState((prev) => {
        const tpl = prev.projects.find((p) => p.id === templateId);
        if (!tpl) return prev;
        const projId = uid('proj');
        createdProject = {
          ...clone(tpl),
          id: projId,
          name: newName.trim() || `${tpl.name.replace(' (Template)', '')} Copy`,
          isTemplate: false,
          archived: false,
          status: 'Active',
          ownerId: prev.currentUserId,
          createdAt: new Date().toISOString(),
        };
        const tplTasks = prev.tasks.filter((t) => t.projectId === templateId);
        const clonedTasks = cloneTasksForProject(tplTasks, projId);
        const audit = makeAudit(
          prev,
          'CREATE',
          'projects',
          'projects',
          projId,
          `Created project "${createdProject.name}" from template "${tpl.name}"`,
          null,
          createdProject
        );
        return {
          ...prev,
          projects: [createdProject, ...prev.projects],
          tasks: [...prev.tasks, ...clonedTasks],
          auditLogs: [audit, ...prev.auditLogs],
        };
      });
      notify('Project created from template');
      return createdProject;
    },
    [makeAudit, notify]
  );

  const postProjectUpdate = useCallback(
    (projectId: string, message: string, healthStatus: ProjectUpdate['healthStatus']) => {
      setState((prev) => {
        const created: ProjectUpdate = {
          id: uid('upd'),
          projectId,
          authorId: prev.currentUserId,
          message,
          healthStatus,
          createdAt: new Date().toISOString(),
        };
        const audit = makeAudit(
          prev,
          'CREATE',
          'projects',
          'project_updates',
          created.id,
          `Posted ${healthStatus} update on project`,
          null,
          created
        );
        return {
          ...prev,
          projectUpdates: [created, ...prev.projectUpdates],
          auditLogs: [audit, ...prev.auditLogs],
        };
      });
      notify('Project status update posted');
    },
    [makeAudit, notify]
  );

  const saveFilterPreset = useCallback(
    (preset: Omit<ProjectFilterPreset, 'id'>) => {
      const created: ProjectFilterPreset = { ...preset, id: uid('fp') };
      setState((prev) => ({
        ...prev,
        filterPresets: [...prev.filterPresets, created],
      }));
      notify(`Saved filter preset "${preset.name}"`);
    },
    [notify]
  );

  const deleteFilterPreset = useCallback(
    (id: string) => {
      setState((prev) => ({
        ...prev,
        filterPresets: prev.filterPresets.filter((f) => f.id !== id),
      }));
      notify('Filter preset deleted');
    },
    [notify]
  );

  const updateProjectVisibleColumns = useCallback((projectId: string, columns: TimelineColumnKey[]) => {
    setState((prev) => ({
      ...prev,
      projects: prev.projects.map((p) => (p.id === projectId ? { ...p, visibleColumns: columns } : p)),
    }));
  }, []);

  const createTask = useCallback(
    (taskInput: Omit<Task, 'id' | 'updatedAt'>) => {
      const created: Task = {
        ...taskInput,
        id: uid('tsk'),
        updatedAt: new Date().toISOString(),
      };
      setState((prev) => {
        const audit = makeAudit(
          prev,
          'CREATE',
          'projects',
          'tasks',
          created.id,
          `Created task "${created.title}"`,
          null,
          created
        );
        return {
          ...prev,
          tasks: [...prev.tasks, created],
          auditLogs: [audit, ...prev.auditLogs],
        };
      });
      notify(`Task "${taskInput.title}" created`);
      return created;
    },
    [makeAudit, notify]
  );

  const updateTask = useCallback(
    (id: string, patch: Partial<Task>) => {
      setState((prev) => {
        const existing = prev.tasks.find((t) => t.id === id);
        if (!existing) return prev;
        const updated: Task = {
          ...existing,
          ...patch,
          updatedAt: new Date().toISOString(),
        };
        const audit = makeAudit(
          prev,
          'UPDATE',
          'projects',
          'tasks',
          id,
          `Updated task "${updated.title}"`,
          existing,
          updated
        );
        return {
          ...prev,
          tasks: prev.tasks.map((t) => (t.id === id ? updated : t)),
          auditLogs: [audit, ...prev.auditLogs],
        };
      });
    },
    [makeAudit]
  );

  const deleteTask = useCallback(
    (id: string) => {
      setState((prev) => {
        const existing = prev.tasks.find((t) => t.id === id);
        if (!existing) return prev;
        // Gather all descendants recursively
        const toDelete = new Set<string>([id]);
        let added = true;
        while (added) {
          added = false;
          for (const t of prev.tasks) {
            if (t.parentId && toDelete.has(t.parentId) && !toDelete.has(t.id)) {
              toDelete.add(t.id);
              added = true;
            }
          }
        }
        const audit = makeAudit(
          prev,
          'DELETE',
          'projects',
          'tasks',
          id,
          `Deleted task "${existing.title}" (${toDelete.size} item${toDelete.size > 1 ? 's' : ''})`,
          existing,
          null
        );
        return {
          ...prev,
          tasks: prev.tasks
            .filter((t) => !toDelete.has(t.id))
            .map((t) => ({
              ...t,
              predecessorIds: t.predecessorIds.filter((pid) => !toDelete.has(pid)),
            })),
          auditLogs: [audit, ...prev.auditLogs],
        };
      });
      notify('Task deleted');
    },
    [makeAudit, notify]
  );

  const duplicateTask = useCallback(
    (id: string) => {
      setState((prev) => {
        const root = prev.tasks.find((t) => t.id === id);
        if (!root) return prev;

        const subtreeIds = new Set<string>([id]);
        let added = true;
        while (added) {
          added = false;
          for (const t of prev.tasks) {
            if (t.parentId && subtreeIds.has(t.parentId) && !subtreeIds.has(t.id)) {
              subtreeIds.add(t.id);
              added = true;
            }
          }
        }

        const subtree = prev.tasks.filter((t) => subtreeIds.has(t.id));
        const idMap = new Map<string, string>();
        for (const t of subtree) {
          idMap.set(t.id, uid('tsk'));
        }
        const now = new Date().toISOString();
        const clones: Task[] = subtree.map((t) => ({
          ...clone(t),
          id: idMap.get(t.id)!,
          title: t.id === id ? `${t.title} (Copy)` : t.title,
          parentId: t.id === id ? root.parentId : idMap.get(t.parentId!) ?? null,
          predecessorIds: t.predecessorIds.map((pid) => idMap.get(pid) ?? pid),
          updatedAt: now,
        }));

        const audit = makeAudit(
          prev,
          'CREATE',
          'projects',
          'tasks',
          idMap.get(id)!,
          `Duplicated task "${root.title}" (${clones.length} node${clones.length > 1 ? 's' : ''})`,
          null,
          clones[0]
        );

        return {
          ...prev,
          tasks: [...prev.tasks, ...clones],
          auditLogs: [audit, ...prev.auditLogs],
        };
      });
      notify('Task duplicated');
    },
    [makeAudit, notify]
  );

  const bulkUpdateTasks = useCallback(
    (taskIds: string[], patch: Partial<Pick<Task, 'status' | 'assigneeId' | 'archived'>>) => {
      if (!taskIds.length) return;
      const targetSet = new Set(taskIds);
      setState((prev) => {
        const now = new Date().toISOString();
        const beforeSnap = prev.tasks.filter((t) => targetSet.has(t.id)).map((t) => ({ id: t.id, status: t.status, assigneeId: t.assigneeId, archived: t.archived }));
        const updatedTasks = prev.tasks.map((t) =>
          targetSet.has(t.id) ? { ...t, ...patch, updatedAt: now } : t
        );
        const afterSnap = updatedTasks.filter((t) => targetSet.has(t.id)).map((t) => ({ id: t.id, status: t.status, assigneeId: t.assigneeId, archived: t.archived }));
        const audit = makeAudit(
          prev,
          'UPDATE',
          'projects',
          'tasks',
          taskIds.join(','),
          `Bulk updated ${taskIds.length} task(s)`,
          beforeSnap,
          afterSnap
        );
        return {
          ...prev,
          tasks: updatedTasks,
          auditLogs: [audit, ...prev.auditLogs],
        };
      });
      notify(`Updated ${taskIds.length} selected task(s)`);
    },
    [makeAudit, notify]
  );

  // LMS Courses & Enrollments
  const createCourse = useCallback(
    (courseInput: Omit<Course, 'id' | 'createdAt'>) => {
      const created: Course = {
        ...courseInput,
        id: uid('crs'),
        createdAt: new Date().toISOString(),
      };
      setState((prev) => {
        const audit = makeAudit(
          prev,
          'CREATE',
          'learning',
          'courses',
          created.id,
          `Created LMS course "${created.title}"`,
          null,
          created
        );
        return {
          ...prev,
          courses: [created, ...prev.courses],
          auditLogs: [audit, ...prev.auditLogs],
        };
      });
      notify(`Course "${courseInput.title}" created`);
      return created;
    },
    [makeAudit, notify]
  );

  const updateCourse = useCallback(
    (id: string, patch: Partial<Course>) => {
      setState((prev) => {
        const existing = prev.courses.find((c) => c.id === id);
        if (!existing) return prev;
        const updated = { ...existing, ...patch };
        const audit = makeAudit(
          prev,
          'UPDATE',
          'learning',
          'courses',
          id,
          `Updated LMS course "${updated.title}"`,
          existing,
          updated
        );
        return {
          ...prev,
          courses: prev.courses.map((c) => (c.id === id ? updated : c)),
          auditLogs: [audit, ...prev.auditLogs],
        };
      });
      notify('Course updated');
    },
    [makeAudit, notify]
  );

  const deleteCourse = useCallback(
    (id: string) => {
      setState((prev) => {
        const existing = prev.courses.find((c) => c.id === id);
        if (!existing) return prev;
        const audit = makeAudit(
          prev,
          'DELETE',
          'learning',
          'courses',
          id,
          `Deleted LMS course "${existing.title}"`,
          existing,
          null
        );
        return {
          ...prev,
          courses: prev.courses.filter((c) => c.id !== id),
          enrollments: prev.enrollments.filter((e) => e.courseId !== id),
          auditLogs: [audit, ...prev.auditLogs],
        };
      });
      notify('Course deleted');
    },
    [makeAudit, notify]
  );

  const enrollInCourse = useCallback(
    (userId: string, courseId: string) => {
      setState((prev) => {
        const exists = prev.enrollments.some((e) => e.userId === userId && e.courseId === courseId);
        if (exists) return prev;
        const created: Enrollment = {
          id: uid('enr'),
          userId,
          courseId,
          completedLessonIds: [],
          quizAttempts: [],
          passed: false,
          completedAt: null,
          enrolledAt: new Date().toISOString(),
        };
        const audit = makeAudit(
          prev,
          'CREATE',
          'learning',
          'enrollments',
          created.id,
          `Enrolled in course`,
          null,
          created
        );
        return {
          ...prev,
          enrollments: [...prev.enrollments, created],
          auditLogs: [audit, ...prev.auditLogs],
        };
      });
      notify('Enrolled in course');
    },
    [makeAudit, notify]
  );

  const checkCoursePassed = (course: Course, completedLessonIds: string[], quizPassed: boolean) => {
    const allLessonIds = course.modules.flatMap((m) => m.lessons.map((l) => l.id));
    const allLessonsDone = allLessonIds.length === 0 || allLessonIds.every((lid) => completedLessonIds.includes(lid));
    if (course.completionRule === 'All Lessons') return allLessonsDone;
    if (course.completionRule === 'Quiz Pass') return quizPassed;
    return allLessonsDone && quizPassed;
  };

  const toggleLessonCompletion = useCallback(
    (userId: string, courseId: string, lessonId: string) => {
      setState((prev) => {
        const course = prev.courses.find((c) => c.id === courseId);
        if (!course) return prev;
        const existing = prev.enrollments.find((e) => e.userId === userId && e.courseId === courseId);
        if (!existing) return prev;
        const has = existing.completedLessonIds.includes(lessonId);
        const nextLessons = has
          ? existing.completedLessonIds.filter((x) => x !== lessonId)
          : [...existing.completedLessonIds, lessonId];
        const anyQuizPassed = existing.quizAttempts.some((a) => a.passed);
        const isPassed = checkCoursePassed(course, nextLessons, anyQuizPassed);
        const updated: Enrollment = {
          ...existing,
          completedLessonIds: nextLessons,
          passed: isPassed,
          completedAt: isPassed ? existing.completedAt ?? new Date().toISOString() : null,
        };
        return {
          ...prev,
          enrollments: prev.enrollments.map((e) => (e.id === existing.id ? updated : e)),
        };
      });
    },
    []
  );

  const submitQuizAttempt = useCallback(
    (userId: string, courseId: string, answers: number[]): QuizAttempt => {
      let attemptResult: QuizAttempt = {
        id: uid('qa'),
        score: 0,
        passed: false,
        answers,
        submittedAt: new Date().toISOString(),
      };
      setState((prev) => {
        const course = prev.courses.find((c) => c.id === courseId);
        const existing = prev.enrollments.find((e) => e.userId === userId && e.courseId === courseId);
        if (!course || !existing) return prev;

        const questions = course.quiz.questions;
        const correctCount = questions.reduce(
          (acc, q, idx) => (answers[idx] === q.correctIndex ? acc + 1 : acc),
          0
        );
        const score = questions.length > 0 ? Math.round((correctCount / questions.length) * 100) : 100;
        const quizPassed = score >= course.quiz.passingScore;
        attemptResult = {
          id: uid('qa'),
          score,
          passed: quizPassed,
          answers,
          submittedAt: new Date().toISOString(),
        };

        const nextAttempts = [...existing.quizAttempts, attemptResult];
        const anyQuizPassed = nextAttempts.some((a) => a.passed);
        const coursePassed = checkCoursePassed(course, existing.completedLessonIds, anyQuizPassed);

        const updated: Enrollment = {
          ...existing,
          quizAttempts: nextAttempts,
          passed: coursePassed,
          completedAt: coursePassed ? existing.completedAt ?? new Date().toISOString() : existing.completedAt,
        };

        const audit = makeAudit(
          prev,
          'UPDATE',
          'learning',
          'enrollments',
          existing.id,
          `Submitted quiz for "${course.title}" (${score}% — ${quizPassed ? 'Passed' : 'Failed'})`,
          { passed: existing.passed, attemptCount: existing.quizAttempts.length },
          { passed: updated.passed, attemptCount: updated.quizAttempts.length, score }
        );

        return {
          ...prev,
          enrollments: prev.enrollments.map((e) => (e.id === existing.id ? updated : e)),
          auditLogs: [audit, ...prev.auditLogs],
        };
      });
      return attemptResult;
    },
    [makeAudit]
  );

  // Bulk Excel Imports
  const importPositions = useCallback(
    (rows: Record<string, string>[]) => {
      let importedCount = 0;
      let skippedCount = 0;

      setState((prev) => {
        const existingTitles = new Set(prev.positions.map((p) => p.title.trim().toLowerCase()));
        const added: Position[] = [];

        for (const row of rows) {
          const title = getRowField(row, 'title', 'positiontitle', 'name').trim();
          if (!title) continue;
          const normTitle = title.toLowerCase();
          if (existingTitles.has(normTitle)) {
            skippedCount++;
            continue;
          }
          existingTitles.add(normTitle);

          const level = getRowField(row, 'level', 'band', 'bandlevel') || 'L4';
          const rawRank = Number(getRowField(row, 'prioritylevel', 'priorityrank', 'priority', 'rank'));
          const priorityLevel = Number.isFinite(rawRank) && rawRank > 0 ? Math.min(200, Math.max(1, Math.round(rawRank))) : 50;
          const description = getRowField(row, 'description', 'desc');

          added.push({
            id: uid('pos'),
            title,
            level,
            priorityLevel,
            description,
          });
        }

        importedCount = added.length;
        if (added.length === 0) return prev;

        const audit = makeAudit(
          prev,
          'CREATE',
          'positions',
          'positions',
          added.map((a) => a.id).join(','),
          `Imported ${added.length} position(s) from Excel`,
          null,
          added
        );

        return {
          ...prev,
          positions: [...prev.positions, ...added],
          auditLogs: [audit, ...prev.auditLogs],
        };
      });

      if (importedCount > 0) {
        notify(
          `Imported ${importedCount} position${importedCount === 1 ? '' : 's'}${skippedCount ? ` (${skippedCount} duplicate skipped)` : ''}`,
          'success'
        );
      } else {
        notify('No new positions imported (missing title or all duplicates).', 'warning');
      }
    },
    [makeAudit, notify]
  );

  const importStaff = useCallback(
    (rows: Record<string, string>[]) => {
      let importedCount = 0;
      let skippedCount = 0;

      setState((prev) => {
        const today = new Date().toISOString().slice(0, 10);
        const existingEmails = new Set(prev.users.map((u) => u.email.trim().toLowerCase()));
        const posByTitle = new Map(prev.positions.map((p) => [p.title.trim().toLowerCase(), p.id]));
        const roleByName = new Map(prev.roles.map((r) => [r.name.trim().toLowerCase(), r.id]));
        const fallbackRoleId =
          prev.roles.find((r) => r.id === 'role-joiner')?.id ??
          prev.roles.find((r) => r.id === 'role-staff')?.id ??
          prev.roles[0]?.id;

        interface PendingStaff {
          user: User;
          managerRef: string;
          mentorRef: string;
        }

        const pending: PendingStaff[] = [];

        for (const row of rows) {
          const fullName = getRowField(row, 'fullname', 'name', 'staffname').trim();
          const email = getRowField(row, 'email', 'workemail').trim();
          if (!fullName || !email) continue;
          const normEmail = email.toLowerCase();
          if (existingEmails.has(normEmail)) {
            skippedCount++;
            continue;
          }
          existingEmails.add(normEmail);

          const posTitle = getRowField(row, 'positiontitle', 'position', 'jobtitle').toLowerCase();
          const positionId = (posTitle && posByTitle.get(posTitle)) || prev.positions[0]?.id || '';

          const rolesRaw = getRowField(row, 'roles', 'role', 'systemroles');
          const resolvedRoleIds = rolesRaw
            ? rolesRaw
                .split(/[,;]+/)
                .map((s) => roleByName.get(s.trim().toLowerCase()))
                .filter((x): x is string => Boolean(x))
            : [];
          const roleIds = resolvedRoleIds.length > 0 ? Array.from(new Set(resolvedRoleIds)) : fallbackRoleId ? [fallbackRoleId] : [];

          const rawStart = getRowField(row, 'startdate', 'joineddate');
          const startDate = /^\d{4}-\d{2}-\d{2}$/.test(rawStart) ? rawStart : today;

          pending.push({
            user: {
              id: uid('usr'),
              fullName,
              email,
              password: getRowField(row, 'password') || 'password123',
              avatarUrl: '',
              department: getRowField(row, 'department', 'dept') || 'General',
              location: getRowField(row, 'location', 'office') || 'HQ',
              phone: getRowField(row, 'phone', 'phonenumber'),
              bio: getRowField(row, 'bio', 'notes'),
              positionId,
              managerId: null,
              mentorId: null,
              startDate,
              isActive: parseBooleanCell(getRowField(row, 'isactive', 'active'), true),
              isNewJoiner: parseBooleanCell(getRowField(row, 'isnewjoiner', 'newjoiner'), true),
              roleIds,
              onboardingCompletedIds: [],
            },
            managerRef: getRowField(row, 'manager', 'manageremail', 'managername', 'directmanager').toLowerCase(),
            mentorRef: getRowField(row, 'mentor', 'mentoremail', 'mentorname').toLowerCase(),
          });
        }

        importedCount = pending.length;
        if (pending.length === 0) return prev;

        const allUsers = [...prev.users, ...pending.map((p) => p.user)];
        const byEmail = new Map(allUsers.map((u) => [u.email.trim().toLowerCase(), u.id]));
        const byName = new Map(allUsers.map((u) => [u.fullName.trim().toLowerCase(), u.id]));

        const createdUsers: User[] = pending.map(({ user, managerRef, mentorRef }) => {
          const resolvedManager = managerRef ? byEmail.get(managerRef) ?? byName.get(managerRef) ?? null : null;
          const resolvedMentor = mentorRef ? byEmail.get(mentorRef) ?? byName.get(mentorRef) ?? null : null;
          return {
            ...user,
            managerId: resolvedManager && resolvedManager !== user.id ? resolvedManager : null,
            mentorId: resolvedMentor && resolvedMentor !== user.id ? resolvedMentor : null,
          };
        });

        const autoCourses = prev.courses.filter((c) => c.autoAssignNewJoiners);
        const now = new Date().toISOString();
        const newEnrollments: Enrollment[] = [];
        for (const u of createdUsers) {
          for (const course of autoCourses) {
            newEnrollments.push({
              id: uid('enr'),
              userId: u.id,
              courseId: course.id,
              completedLessonIds: [],
              quizAttempts: [],
              passed: false,
              completedAt: null,
              enrolledAt: now,
            });
          }
        }

        const audit = makeAudit(
          prev,
          'CREATE',
          'staff',
          'users',
          createdUsers.map((u) => u.id).join(','),
          `Imported ${createdUsers.length} staff member(s) from Excel`,
          null,
          createdUsers
        );

        return {
          ...prev,
          users: [...prev.users, ...createdUsers],
          enrollments: [...prev.enrollments, ...newEnrollments],
          auditLogs: [audit, ...prev.auditLogs],
        };
      });

      if (importedCount > 0) {
        notify(
          `Imported ${importedCount} staff profile${importedCount === 1 ? '' : 's'}${skippedCount ? ` (${skippedCount} duplicate skipped)` : ''}`,
          'success'
        );
      } else {
        notify('No new staff profiles imported (ensure Full Name & unique Email are provided).', 'warning');
      }
    },
    [makeAudit, notify]
  );

  const importConfigEntities = useCallback(
    (kind: 'customers' | 'vendors' | 'products', rows: Record<string, string>[]) => {
      let importedCount = 0;

      setState((prev) => {
        if (kind === 'customers') {
          const added: CustomerEntity[] = [];
          for (const row of rows) {
            const name = getRowField(row, 'name', 'customername').trim();
            if (!name) continue;
            added.push({
              id: uid('cust'),
              name,
              industry: getRowField(row, 'industry', 'sector') || 'Enterprise',
              contactEmail: getRowField(row, 'contactemail', 'email'),
            });
          }
          importedCount = added.length;
          if (added.length === 0) return prev;
          const audit = makeAudit(
            prev,
            'CREATE',
            'project-config',
            'customers',
            added.map((a) => a.id).join(','),
            `Imported ${added.length} customer(s) from Excel`,
            null,
            added
          );
          return { ...prev, customers: [...prev.customers, ...added], auditLogs: [audit, ...prev.auditLogs] };
        }

        if (kind === 'vendors') {
          const added: VendorEntity[] = [];
          for (const row of rows) {
            const name = getRowField(row, 'name', 'vendorname').trim();
            if (!name) continue;
            added.push({
              id: uid('vend'),
              name,
              specialty: getRowField(row, 'specialty', 'category') || 'Partner',
              contactEmail: getRowField(row, 'supportemail', 'contactemail', 'email'),
            });
          }
          importedCount = added.length;
          if (added.length === 0) return prev;
          const audit = makeAudit(
            prev,
            'CREATE',
            'project-config',
            'vendors',
            added.map((a) => a.id).join(','),
            `Imported ${added.length} vendor(s) from Excel`,
            null,
            added
          );
          return { ...prev, vendors: [...prev.vendors, ...added], auditLogs: [audit, ...prev.auditLogs] };
        }

        const added: ProductEntity[] = [];
        for (const row of rows) {
          const name = getRowField(row, 'name', 'productname').trim();
          if (!name) continue;
          added.push({
            id: uid('prod'),
            name,
            code: getRowField(row, 'productcode', 'code') || name.slice(0, 4).toUpperCase(),
            description: getRowField(row, 'description', 'desc'),
          });
        }
        importedCount = added.length;
        if (added.length === 0) return prev;
        const audit = makeAudit(
          prev,
          'CREATE',
          'project-config',
          'products',
          added.map((a) => a.id).join(','),
          `Imported ${added.length} product(s) from Excel`,
          null,
          added
        );
        return { ...prev, products: [...prev.products, ...added], auditLogs: [audit, ...prev.auditLogs] };
      });

      if (importedCount > 0) {
        notify(`Imported ${importedCount} ${kind.slice(0, -1)}(s) from Excel`, 'success');
      } else {
        notify(`No valid ${kind} rows found in spreadsheet.`, 'warning');
      }
    },
    [makeAudit, notify]
  );

  const importProjects = useCallback(
    (rows: Record<string, string>[]) => {
      let importedCount = 0;

      setState((prev) => {
        const today = new Date().toISOString().slice(0, 10);
        const defaultDue = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
        const actor = prev.users.find((u) => u.id === prev.currentUserId) ?? prev.users[0];
        const customerByName = new Map(prev.customers.map((c) => [c.name.trim().toLowerCase(), c.id]));
        const vendorByName = new Map(prev.vendors.map((v) => [v.name.trim().toLowerCase(), v.id]));
        const productByNameOrCode = new Map<string, string>();
        for (const p of prev.products) {
          productByNameOrCode.set(p.name.trim().toLowerCase(), p.id);
          if (p.code) productByNameOrCode.set(p.code.trim().toLowerCase(), p.id);
        }

        const VALID_STATUSES: Project['status'][] = ['Planning', 'Active', 'On Hold', 'Completed'];
        const VALID_PRIORITIES: Project['priority'][] = ['Low', 'Medium', 'High', 'Critical'];

        const added: Project[] = [];
        for (const row of rows) {
          const name = getRowField(row, 'name', 'projectname', 'title').trim();
          if (!name) continue;

          const rawStatus = getRowField(row, 'status').toLowerCase();
          const status = VALID_STATUSES.find((s) => s.toLowerCase() === rawStatus) ?? 'Active';

          const rawPriority = getRowField(row, 'priority').toLowerCase();
          const priority = VALID_PRIORITIES.find((p) => p.toLowerCase() === rawPriority) ?? 'Medium';

          const rawStart = getRowField(row, 'startdate');
          const rawDue = getRowField(row, 'duedate', 'enddate');
          const startDate = /^\d{4}-\d{2}-\d{2}$/.test(rawStart) ? rawStart : today;
          const dueDate = /^\d{4}-\d{2}-\d{2}$/.test(rawDue) ? rawDue : defaultDue;

          const custKey = getRowField(row, 'customer', 'customername').toLowerCase();
          const vendKey = getRowField(row, 'vendor', 'vendorname').toLowerCase();
          const prodKey = getRowField(row, 'product', 'productname', 'productcode').toLowerCase();

          added.push({
            id: uid('proj'),
            name,
            description: getRowField(row, 'description', 'desc'),
            status,
            priority,
            startDate,
            dueDate,
            ownerId: actor?.id ?? prev.currentUserId,
            customerId: (custKey && customerByName.get(custKey)) || prev.customers[0]?.id || '',
            vendorId: (vendKey && vendorByName.get(vendKey)) || prev.vendors[0]?.id || '',
            productId: (prodKey && productByNameOrCode.get(prodKey)) || prev.products[0]?.id || '',
            pms: actor
              ? [
                  {
                    id: uid('pm'),
                    userId: actor.id,
                    name: actor.fullName,
                    email: actor.email,
                    category: 'Internal (eCam)',
                  },
                ]
              : [],
            memberIds: actor ? [actor.id] : [],
            archived: false,
            isTemplate: false,
            visibleColumns: ['status', 'priority', 'assignee', 'startDate', 'dueDate', 'dependencies', 'attachments'],
            createdAt: new Date().toISOString(),
          });
        }

        importedCount = added.length;
        if (added.length === 0) return prev;

        const audit = makeAudit(
          prev,
          'CREATE',
          'projects',
          'projects',
          added.map((a) => a.id).join(','),
          `Imported ${added.length} project(s) from Excel`,
          null,
          added
        );

        return {
          ...prev,
          projects: [...added, ...prev.projects],
          auditLogs: [audit, ...prev.auditLogs],
        };
      });

      if (importedCount > 0) {
        notify(`Imported ${importedCount} project${importedCount === 1 ? '' : 's'}`, 'success');
      } else {
        notify('No valid projects found in spreadsheet.', 'warning');
      }
    },
    [makeAudit, notify]
  );

  const importTasks = useCallback(
    (projectId: string, rows: Record<string, string>[]) => {
      let importedCount = 0;

      setState((prev) => {
        const project = prev.projects.find((p) => p.id === projectId);
        if (!project) return prev;

        const existingProjectTasks = prev.tasks.filter((t) => t.projectId === projectId && !t.archived);
        const byEmail = new Map(prev.users.map((u) => [u.email.trim().toLowerCase(), u.id]));
        const byName = new Map(prev.users.map((u) => [u.fullName.trim().toLowerCase(), u.id]));

        const VALID_PRIORITIES: Task['priority'][] = ['Low', 'Medium', 'High', 'Critical'];
        const normalizeStatus = (raw: string): Task['status'] => {
          const s = raw.trim().toLowerCase();
          if (s === 'in progress' || s === 'inprogress' || s === 'progress') return 'in progress';
          if (s === 'done' || s === 'completed' || s === 'complete') return 'done';
          if (s === 'blocked') return 'blocked';
          return 'todo';
        };

        interface PendingTask {
          task: Task;
          parentRef: string;
          predRefs: string[];
        }

        const pending: PendingTask[] = [];
        const baseOrder = existingProjectTasks.length;

        rows.forEach((row, idx) => {
          const title = getRowField(row, 'title', 'tasktitle', 'name').trim();
          if (!title) return;

          const assigneeRef = getRowField(row, 'assignee', 'assigneeemail', 'assigneename', 'pic').toLowerCase();
          const assigneeId = assigneeRef ? byEmail.get(assigneeRef) ?? byName.get(assigneeRef) ?? null : null;

          const rawStart = getRowField(row, 'startdate');
          const rawDue = getRowField(row, 'duedate', 'enddate');
          const startDate = /^\d{4}-\d{2}-\d{2}$/.test(rawStart) ? rawStart : project.startDate;
          const dueDate = /^\d{4}-\d{2}-\d{2}$/.test(rawDue) ? rawDue : project.dueDate;

          const rawPriority = getRowField(row, 'priority').toLowerCase();
          const priority = VALID_PRIORITIES.find((p) => p.toLowerCase() === rawPriority) ?? 'Medium';

          const parentRef = getRowField(row, 'parenttask', 'parent', 'parenttasktitle').trim().toLowerCase();
          const predRaw = getRowField(row, 'predecessors', 'predecessortitles', 'dependencies');
          const predRefs = predRaw
            ? predRaw
                .split(/[;,]+/)
                .map((s) => s.trim().toLowerCase())
                .filter(Boolean)
            : [];

          pending.push({
            task: {
              id: uid('tsk'),
              projectId,
              parentId: null,
              title,
              description: getRowField(row, 'description', 'desc'),
              assigneeId,
              startDate,
              dueDate,
              status: normalizeStatus(getRowField(row, 'status')),
              priority,
              predecessorIds: [],
              attachments: [],
              archived: false,
              order: baseOrder + idx + 1,
              updatedAt: new Date().toISOString(),
            },
            parentRef,
            predRefs,
          });
        });

        importedCount = pending.length;
        if (pending.length === 0) return prev;

        const titleToId = new Map<string, string>();
        for (const t of existingProjectTasks) {
          titleToId.set(t.title.trim().toLowerCase(), t.id);
        }
        for (const p of pending) {
          titleToId.set(p.task.title.trim().toLowerCase(), p.task.id);
        }

        const added: Task[] = pending.map(({ task, parentRef, predRefs }) => {
          const parentId = parentRef ? titleToId.get(parentRef) ?? null : null;
          const predecessorIds = predRefs
            .map((ref) => titleToId.get(ref))
            .filter((id): id is string => Boolean(id) && id !== task.id);
          return {
            ...task,
            parentId: parentId && parentId !== task.id ? parentId : null,
            predecessorIds: Array.from(new Set(predecessorIds)),
          };
        });

        const audit = makeAudit(
          prev,
          'CREATE',
          'projects',
          'tasks',
          added.map((a) => a.id).join(','),
          `Imported ${added.length} task(s) into "${project.name}" from Excel`,
          null,
          added
        );

        return {
          ...prev,
          tasks: [...prev.tasks, ...added],
          auditLogs: [audit, ...prev.auditLogs],
        };
      });

      if (importedCount > 0) {
        notify(`Imported ${importedCount} task${importedCount === 1 ? '' : 's'} into project`, 'success');
      } else {
        notify('No valid task rows found in spreadsheet.', 'warning');
      }
    },
    [makeAudit, notify]
  );

  const importOnboardingItems = useCallback(
    (rows: Record<string, string>[]) => {
      let importedCount = 0;

      setState((prev) => {
        const VALID_CATS: OnboardingChecklistItem['category'][] = [
          'IT & Access',
          'HR & Compliance',
          'Team & Tooling',
          'Architecture',
        ];
        const added: OnboardingChecklistItem[] = [];
        const baseOrder = prev.onboardingItems.length;

        rows.forEach((row, idx) => {
          const title = getRowField(row, 'title', 'task', 'step', 'name').trim();
          if (!title) return;
          const rawCat = getRowField(row, 'category').toLowerCase();
          const category =
            VALID_CATS.find((c) => c.toLowerCase() === rawCat) ??
            (rawCat.includes('it') ? 'IT & Access' : rawCat.includes('hr') ? 'HR & Compliance' : rawCat.includes('arch') ? 'Architecture' : 'Team & Tooling');
          const rawOrder = Number(getRowField(row, 'order', 'sortorder'));

          added.push({
            id: uid('ob'),
            title,
            description: getRowField(row, 'description', 'desc') || 'Required department onboarding step.',
            category,
            order: Number.isFinite(rawOrder) && rawOrder > 0 ? Math.round(rawOrder) : baseOrder + idx + 1,
          });
        });

        importedCount = added.length;
        if (added.length === 0) return prev;

        const audit = makeAudit(
          prev,
          'CREATE',
          'onboarding',
          'onboarding_items',
          added.map((a) => a.id).join(','),
          `Imported ${added.length} onboarding checklist step(s) from Excel`,
          null,
          added
        );

        return {
          ...prev,
          onboardingItems: [...prev.onboardingItems, ...added],
          auditLogs: [audit, ...prev.auditLogs],
        };
      });

      if (importedCount > 0) {
        notify(`Imported ${importedCount} onboarding step${importedCount === 1 ? '' : 's'}`, 'success');
      } else {
        notify('No valid onboarding checklist rows found in spreadsheet.', 'warning');
      }
    },
    [makeAudit, notify]
  );

  const importAnnouncements = useCallback(
    (rows: Record<string, string>[]) => {
      let importedCount = 0;

      setState((prev) => {
        const VALID_CATS: Announcement['category'][] = ['General', 'Policy', 'Release', 'Culture'];
        const added: Announcement[] = [];
        const now = new Date().toISOString();

        for (const row of rows) {
          const title = getRowField(row, 'headline', 'title', 'subject').trim();
          const body = getRowField(row, 'message', 'body', 'content', 'description').trim();
          if (!title || !body) continue;

          const rawCat = getRowField(row, 'category').toLowerCase();
          const category = VALID_CATS.find((c) => c.toLowerCase() === rawCat) ?? 'General';

          added.push({
            id: uid('ann'),
            title,
            body,
            category,
            pinned: parseBooleanCell(getRowField(row, 'pinned', 'pin'), true),
            active: parseBooleanCell(getRowField(row, 'active'), true),
            authorId: prev.currentUserId,
            createdAt: now,
          });
        }

        importedCount = added.length;
        if (added.length === 0) return prev;

        const audit = makeAudit(
          prev,
          'CREATE',
          'announcements',
          'announcements',
          added.map((a) => a.id).join(','),
          `Imported ${added.length} announcement(s) from Excel`,
          null,
          added
        );

        return {
          ...prev,
          announcements: [...added, ...prev.announcements],
          auditLogs: [audit, ...prev.auditLogs],
        };
      });

      if (importedCount > 0) {
        notify(`Imported ${importedCount} announcement${importedCount === 1 ? '' : 's'}`, 'success');
      } else {
        notify('No valid announcements found (ensure Headline & Message columns are filled).', 'warning');
      }
    },
    [makeAudit, notify]
  );

  const value: AppContextValue = {
    state,
    currentUser,
    toasts,
    dismissToast,
    notify,
    cloudStatus,
    lastCloudSyncAt,
    pushLocalToCloud,
    pullCloudToLocal,
    getPerm,
    canView,
    canEdit,
    login,
    logout,
    updateBranding,
    toggleTheme,
    resetDemoData,
    createRole,
    updateRole,
    deleteRole,
    createPosition,
    updatePosition,
    deletePosition,
    createStaff,
    updateStaff,
    deleteStaff,
    updateOwnProfile,
    toggleOnboardingItem,
    createOnboardingItem,
    deleteOnboardingItem,
    createAnnouncement,
    updateAnnouncement,
    deleteAnnouncement,
    createCustomer,
    updateCustomer,
    deleteCustomer,
    createVendor,
    updateVendor,
    deleteVendor,
    createProduct,
    updateProduct,
    deleteProduct,
    createProject,
    updateProject,
    deleteProject,
    saveProjectAsTemplate,
    createProjectFromTemplate,
    postProjectUpdate,
    saveFilterPreset,
    deleteFilterPreset,
    updateProjectVisibleColumns,
    createTask,
    updateTask,
    deleteTask,
    duplicateTask,
    bulkUpdateTasks,
    createCourse,
    updateCourse,
    deleteCourse,
    enrollInCourse,
    toggleLessonCompletion,
    submitQuizAttempt,
    importPositions,
    importStaff,
    importConfigEntities,
    importProjects,
    importTasks,
    importOnboardingItems,
    importAnnouncements,
  };

  return <AppStoreContext.Provider value={value}>{children}</AppStoreContext.Provider>;
};

export function useAppStore() {
  const ctx = useContext(AppStoreContext);
  if (!ctx) throw new Error('useAppStore must be used inside AppProvider');
  return ctx;
}
