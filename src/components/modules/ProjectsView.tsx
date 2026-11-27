import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Archive,
  Bookmark,
  ChevronDown,
  ChevronRight,
  Columns,
  Copy,
  Download,
  FolderKanban,
  GanttChart,
  ListTree,
  MessageSquarePlus,
  Plus,
  Search,
  Table2,
  Trash2,
  X,
} from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import {
  Project,
  ProjectPM,
  ProjectPMCategory,
  ProjectPriority,
  ProjectStatus,
  ProjectUpdate,
  Task,
  TaskStatus,
  TimelineColumnKey,
} from '../../types';
import { downloadExcelTemplate } from '../../utils/excel';
import { downloadCsv, getTaskScheduleConflicts, isTaskOverdue } from '../../utils/rbac';
import { ExcelImportActions } from '../common/ExcelImportActions';
import { PriorityBadge, ProjectStatusBadge, TaskStatusBadge } from '../common/StatusBadge';
import { UserAvatar } from '../common/UserAvatar';

interface ProjectsViewProps {
  onOpenTaskDrawer: (taskId: string) => void;
}

type ProjectSubView = 'list' | 'timeline' | 'gantt' | 'updates';

const TIMELINE_COLUMN_OPTIONS: { key: TimelineColumnKey; label: string }[] = [
  { key: 'status', label: 'Status' },
  { key: 'priority', label: 'Priority' },
  { key: 'assignee', label: 'Assignee (PIC)' },
  { key: 'startDate', label: 'Start Date' },
  { key: 'dueDate', label: 'Due Date' },
  { key: 'dependencies', label: 'Predecessors' },
  { key: 'attachments', label: 'Files' },
];

interface FlattenedTask {
  task: Task;
  depth: number;
  hasChildren: boolean;
}

function flattenTaskTree(
  tasks: Task[],
  collapsedIds: Set<string>,
  parentId: string | null = null,
  depth = 0
): FlattenedTask[] {
  const children = tasks
    .filter((t) => t.parentId === parentId)
    .sort((a, b) => a.order - b.order);

  const result: FlattenedTask[] = [];
  for (const t of children) {
    const kids = tasks.filter((k) => k.parentId === t.id);
    result.push({ task: t, depth, hasChildren: kids.length > 0 });
    if (kids.length > 0 && !collapsedIds.has(t.id)) {
      result.push(...flattenTaskTree(tasks, collapsedIds, t.id, depth + 1));
    }
  }
  return result;
}

export const ProjectsView: React.FC<ProjectsViewProps> = ({ onOpenTaskDrawer }) => {
  const {
    state,
    currentUser,
    canEdit,
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
    duplicateTask,
    bulkUpdateTasks,
    importProjects,
    importTasks,
    notify,
  } = useAppStore();

  const editable = canEdit('projects');

  const [selectedProjectId, setSelectedProjectId] = useState<string>(
    state.projects.find((p) => !p.isTemplate && !p.archived)?.id ?? state.projects[0]?.id ?? ''
  );
  const [subView, setSubView] = useState<ProjectSubView>('list');

  // Project Filters & Presets
  const [showTemplatesTab, setShowTemplatesTab] = useState(false);
  const [priorityFilter, setPriorityFilter] = useState<ProjectPriority | 'all'>('all');
  const [pmQuery, setPmQuery] = useState('');
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [presetName, setPresetName] = useState('');

  // Project Creation / Template Modals
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [templateUseModal, setTemplateUseModal] = useState<Project | null>(null);
  const [templateNewName, setTemplateNewName] = useState('');

  // Task Tree & Timeline Bulk State
  const [collapsedTaskIds, setCollapsedTaskIds] = useState<Set<string>>(new Set());
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
  const [columnsMenuOpen, setColumnsMenuOpen] = useState(false);
  const [quickTaskTitle, setQuickTaskTitle] = useState('');
  const [bulkStatus, setBulkStatus] = useState<TaskStatus>('in progress');
  const [bulkAssignee, setBulkAssignee] = useState<string>('');

  // Project Updates Form
  const [updateMsg, setUpdateMsg] = useState('');
  const [updateHealth, setUpdateHealth] = useState<ProjectUpdate['healthStatus']>('On Track');

  // Project Create/Edit Form
  const [pForm, setPForm] = useState({
    name: '',
    description: '',
    status: 'Active' as ProjectStatus,
    priority: 'High' as ProjectPriority,
    startDate: new Date().toISOString().slice(0, 10),
    dueDate: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
    customerId: state.customers[0]?.id ?? '',
    vendorId: state.vendors[0]?.id ?? '',
    productId: state.products[0]?.id ?? '',
    pms: [] as ProjectPM[],
  });
  const [pmDraft, setPmDraft] = useState({
    category: 'Internal (eCam)' as ProjectPMCategory,
    userId: state.users[0]?.id ?? '',
    name: '',
    email: '',
  });

  const filteredProjects = useMemo(() => {
    const pq = pmQuery.trim().toLowerCase();
    return state.projects
      .filter((p) => (showTemplatesTab ? p.isTemplate : !p.isTemplate))
      .filter((p) => (includeArchived ? true : !p.archived))
      .filter((p) => (priorityFilter === 'all' ? true : p.priority === priorityFilter))
      .filter((p) => {
        if (!pq) return true;
        return p.pms.some(
          (pm) => pm.name.toLowerCase().includes(pq) || pm.category.toLowerCase().includes(pq)
        );
      })
      .filter((p) => {
        if (!overdueOnly) return true;
        return state.tasks.some((t) => t.projectId === p.id && isTaskOverdue(t));
      });
  }, [state.projects, state.tasks, showTemplatesTab, includeArchived, priorityFilter, pmQuery, overdueOnly]);

  const activeProject = useMemo(
    () =>
      state.projects.find((p) => p.id === selectedProjectId) ??
      filteredProjects[0] ??
      state.projects[0],
    [state.projects, selectedProjectId, filteredProjects]
  );

  const projectTasks = useMemo(
    () =>
      activeProject
        ? state.tasks.filter((t) => t.projectId === activeProject.id && !t.archived)
        : [],
    [state.tasks, activeProject]
  );

  const flattenedTasks = useMemo(
    () => flattenTaskTree(projectTasks, collapsedTaskIds),
    [projectTasks, collapsedTaskIds]
  );

  const toggleCollapse = (taskId: string) => {
    setCollapsedTaskIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  };

  const toggleSelectTask = (taskId: string) => {
    setSelectedTaskIds((prev) =>
      prev.includes(taskId) ? prev.filter((id) => id !== taskId) : [...prev, taskId]
    );
  };

  const openCreateProjectModal = () => {
    setEditingProject(null);
    setPForm({
      name: '',
      description: '',
      status: 'Active',
      priority: 'Medium',
      startDate: new Date().toISOString().slice(0, 10),
      dueDate: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
      customerId: state.customers[0]?.id ?? '',
      vendorId: state.vendors[0]?.id ?? '',
      productId: state.products[0]?.id ?? '',
      pms: [
        {
          id: `pm-${Date.now()}`,
          userId: currentUser.id,
          name: currentUser.fullName,
          email: currentUser.email,
          category: 'Internal (eCam)',
        },
      ],
    });
    setProjectModalOpen(true);
  };

  const openEditProjectModal = (proj: Project) => {
    setEditingProject(proj);
    setPForm({
      name: proj.name,
      description: proj.description,
      status: proj.status,
      priority: proj.priority,
      startDate: proj.startDate,
      dueDate: proj.dueDate,
      customerId: proj.customerId,
      vendorId: proj.vendorId,
      productId: proj.productId,
      pms: proj.pms,
    });
    setProjectModalOpen(true);
  };

  const handleAddPmToForm = () => {
    if (pmDraft.category === 'Internal (eCam)') {
      const user = state.users.find((u) => u.id === pmDraft.userId);
      if (!user) return;
      setPForm((prev) => ({
        ...prev,
        pms: [
          ...prev.pms,
          { id: `pm-${Date.now()}`, userId: user.id, name: user.fullName, email: user.email, category: 'Internal (eCam)' },
        ],
      }));
    } else {
      if (!pmDraft.name.trim()) return;
      setPForm((prev) => ({
        ...prev,
        pms: [
          ...prev.pms,
          {
            id: `pm-${Date.now()}`,
            name: pmDraft.name.trim(),
            email: pmDraft.email.trim(),
            category: pmDraft.category,
          },
        ],
      }));
      setPmDraft({ ...pmDraft, name: '', email: '' });
    }
  };

  const handleProjectSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editable || !pForm.name.trim()) return;
    if (editingProject) {
      updateProject(editingProject.id, pForm);
    } else {
      const created = createProject({
        ...pForm,
        ownerId: currentUser.id,
        memberIds: [currentUser.id, ...pForm.pms.map((p) => p.userId).filter((x): x is string => Boolean(x))],
        archived: false,
        isTemplate: false,
        visibleColumns: ['status', 'priority', 'assignee', 'startDate', 'dueDate', 'dependencies', 'attachments'],
      });
      setSelectedProjectId(created.id);
      setShowTemplatesTab(false);
    }
    setProjectModalOpen(false);
  };

  const handleQuickAddRootTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editable || !activeProject || !quickTaskTitle.trim()) return;
    createTask({
      projectId: activeProject.id,
      parentId: null,
      title: quickTaskTitle.trim(),
      description: '',
      assigneeId: currentUser.id,
      startDate: activeProject.startDate,
      dueDate: activeProject.dueDate,
      status: 'todo',
      priority: 'Medium',
      predecessorIds: [],
      attachments: [],
      archived: false,
      order: projectTasks.filter((t) => !t.parentId).length + 1,
    });
    setQuickTaskTitle('');
  };

  const handleExportTasksCsv = () => {
    if (!activeProject) return;
    const rows = flattenedTasks.map(({ task, depth }) => {
      const assignee = state.users.find((u) => u.id === task.assigneeId)?.fullName ?? 'Unassigned';
      const preds = task.predecessorIds
        .map((pid) => state.tasks.find((t) => t.id === pid)?.title ?? pid)
        .join('; ');
      return [
        `${'  '.repeat(depth)}${task.title}`,
        task.status,
        task.priority,
        assignee,
        task.startDate,
        task.dueDate,
        preds,
      ];
    });
    downloadCsv(
      `${activeProject.name.toLowerCase().replace(/\s+/g, '-')}-tasks.csv`,
      ['Task Title', 'Status', 'Priority', 'Assignee (PIC)', 'Start Date', 'Due Date', 'Predecessors'],
      rows
    );
    notify('Exported project tasks CSV');
  };

  const ganttBounds = useMemo(() => {
    if (!activeProject) return { minMs: 0, totalDays: 30, startStr: '' };
    const dates = [
      activeProject.startDate,
      activeProject.dueDate,
      ...projectTasks.map((t) => t.startDate),
      ...projectTasks.map((t) => t.dueDate),
    ].filter(Boolean);
    const timestamps = dates.map((d) => new Date(d).getTime()).filter((n) => !Number.isNaN(n));
    const minMs = (timestamps.length > 0 ? Math.min(...timestamps) : Date.now()) - 2 * 86400000;
    const maxMs = (timestamps.length > 0 ? Math.max(...timestamps) : Date.now() + 14 * 86400000) + 4 * 86400000;
    const totalDays = Math.max(14, Math.ceil((maxMs - minMs) / 86400000));
    return { minMs, totalDays, startStr: new Date(minMs).toISOString().slice(0, 10) };
  }, [activeProject, projectTasks]);

  const DAY_WIDTH = 28;
  const GANTT_ROW_HEIGHT = 44;

  const visibleCols = activeProject?.visibleColumns ?? [
    'status',
    'priority',
    'assignee',
    'startDate',
    'dueDate',
    'dependencies',
  ];

  const toggleProjectColumn = (col: TimelineColumnKey) => {
    if (!activeProject) return;
    const next = visibleCols.includes(col)
      ? visibleCols.filter((c) => c !== col)
      : [...visibleCols, col];
    updateProjectVisibleColumns(activeProject.id, next);
  };

  return (
    <div className="space-y-5">
      {/* Top Project Filter & Preset Bar */}
      <div className="rounded-xl border border-neutral-200 dark:border-zinc-800 bg-white dark:bg-[#0A0A0C] p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1 p-1 bg-neutral-100 dark:bg-zinc-900 rounded-lg">
            <button
              type="button"
              onClick={() => setShowTemplatesTab(false)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                !showTemplatesTab
                  ? 'bg-white dark:bg-black text-neutral-900 dark:text-neutral-100 shadow-sm'
                  : 'text-neutral-600 dark:text-neutral-400'
              }`}
            >
              Projects ({state.projects.filter((p) => !p.isTemplate).length})
            </button>
            <button
              type="button"
              onClick={() => setShowTemplatesTab(true)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                showTemplatesTab
                  ? 'bg-white dark:bg-black text-neutral-900 dark:text-neutral-100 shadow-sm'
                  : 'text-neutral-600 dark:text-neutral-400'
              }`}
            >
              Templates ({state.projects.filter((p) => p.isTemplate).length})
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value as ProjectPriority | 'all')}
              className="rounded-lg border border-neutral-200 dark:border-zinc-800 bg-white dark:bg-black px-2.5 py-1.5 text-xs text-neutral-900 dark:text-neutral-100"
            >
              <option value="all">All Priorities</option>
              <option value="Critical">Critical</option>
              <option value="High">High</option>
              <option value="Medium">Medium</option>
              <option value="Low">Low</option>
            </select>

            <div className="relative">
              <Search className="h-3.5 w-3.5 text-neutral-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={pmQuery}
                onChange={(e) => setPmQuery(e.target.value)}
                placeholder="Filter by PM..."
                className="pl-8 pr-2.5 py-1.5 rounded-lg border border-neutral-200 dark:border-zinc-800 bg-white dark:bg-black text-xs w-36 text-neutral-900 dark:text-neutral-100"
              />
            </div>

            <button
              type="button"
              onClick={() => setOverdueOnly((v) => !v)}
              className={`px-2.5 py-1.5 rounded-lg border text-xs font-medium ${
                overdueOnly
                  ? 'border-red-500/40 bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400'
                  : 'border-neutral-200 dark:border-zinc-800 text-neutral-600 dark:text-neutral-300'
              }`}
            >
              Overdue
            </button>

            <button
              type="button"
              onClick={() => setIncludeArchived((v) => !v)}
              className={`px-2.5 py-1.5 rounded-lg border text-xs font-medium ${
                includeArchived
                  ? 'border-sky-500/40 bg-sky-50 dark:bg-sky-500/10 text-sky-700 dark:text-sky-400'
                  : 'border-neutral-200 dark:border-zinc-800 text-neutral-600 dark:text-neutral-300'
              }`}
            >
              Show Archived
            </button>

            {editable && (
              <div className="flex items-center gap-1.5">
                <ExcelImportActions
                  compact
                  templateTitle="Download Projects Excel Template (.xlsx)"
                  importTitle="Import Projects from Excel (.xlsx / .csv)"
                  onDownloadTemplate={() =>
                    downloadExcelTemplate('projects-import-template.xlsx', 'Projects', [
                      { header: 'Name', example: 'Fleet GPS Rollout Phase 1', width: 28 },
                      { header: 'Status', example: 'Active', width: 14 },
                      { header: 'Priority', example: 'High', width: 12 },
                      { header: 'Start Date', example: new Date().toISOString().slice(0, 10), width: 14 },
                      { header: 'Due Date', example: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10), width: 14 },
                      { header: 'Customer', example: '', width: 20 },
                      { header: 'Vendor', example: '', width: 20 },
                      { header: 'Product', example: '', width: 20 },
                      { header: 'Description', example: 'Initial deployment & customer handoff', width: 38 },
                    ])
                  }
                  onImportRows={importProjects}
                  onError={(msg) => notify(msg, 'error')}
                />
                <button
                  type="button"
                  onClick={openCreateProjectModal}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-medium whitespace-nowrap"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>New Project</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Saveable Filter Presets */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-neutral-100 dark:border-zinc-800">
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-neutral-400 flex items-center gap-1 mr-1">
              <Bookmark className="h-3.5 w-3.5" /> Presets:
            </span>
            {state.filterPresets.map((fp) => (
              <div
                key={fp.id}
                className="inline-flex items-center rounded-md border border-neutral-200 dark:border-zinc-800 overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => {
                    setPriorityFilter(fp.priority);
                    setPmQuery(fp.pmQuery);
                    setOverdueOnly(fp.overdueOnly);
                    setIncludeArchived(fp.includeArchived);
                  }}
                  className="px-2 py-1 text-xs hover:bg-neutral-50 dark:hover:bg-zinc-900 text-neutral-700 dark:text-neutral-300"
                >
                  {fp.name}
                </button>
                <button
                  type="button"
                  onClick={() => deleteFilterPreset(fp.id)}
                  className="px-1.5 py-1 text-neutral-400 hover:text-red-600 dark:hover:text-red-400 border-l border-neutral-200 dark:border-zinc-800"
                  aria-label={`Delete preset ${fp.name}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-1.5">
            <input
              type="text"
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              placeholder="Save current filter as..."
              className="rounded-lg border border-neutral-200 dark:border-zinc-800 bg-white dark:bg-black px-2.5 py-1 text-xs w-44 text-neutral-900 dark:text-neutral-100"
            />
            <button
              type="button"
              disabled={!presetName.trim()}
              onClick={() => {
                saveFilterPreset({
                  name: presetName.trim(),
                  priority: priorityFilter,
                  pmQuery,
                  overdueOnly,
                  includeArchived,
                });
                setPresetName('');
              }}
              className="px-2.5 py-1 rounded-lg border border-neutral-200 dark:border-zinc-800 text-xs font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-zinc-900 disabled:opacity-40"
            >
              Save Preset
            </button>
          </div>
        </div>
      </div>

      {/* Horizontal Project Selector Strip */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {filteredProjects.map((proj) => {
          const isSelected = activeProject?.id === proj.id;
          const cust = state.customers.find((c) => c.id === proj.customerId);
          const prod = state.products.find((pr) => pr.id === proj.productId);
          const pTasks = state.tasks.filter((t) => t.projectId === proj.id && !t.archived);
          const doneCount = pTasks.filter((t) => t.status === 'done').length;
          return (
            <div
              key={proj.id}
              onClick={() => {
                setSelectedProjectId(proj.id);
                setSelectedTaskIds([]);
              }}
              className={`rounded-xl border p-4 cursor-pointer transition-colors ${
                isSelected
                  ? 'border-sky-600 dark:border-sky-500 bg-sky-50/40 dark:bg-sky-500/10'
                  : 'border-neutral-200 dark:border-zinc-800 bg-white dark:bg-[#0A0A0C] hover:border-neutral-300 dark:hover:border-zinc-700'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-xs text-neutral-500 dark:text-neutral-400 truncate">
                    {cust?.name ?? 'Internal'} · {prod?.code ?? 'Core'}
                    {proj.archived && ' · Archived'}
                  </div>
                  <h3 className="text-sm font-display font-semibold text-neutral-900 dark:text-neutral-100 truncate mt-0.5">
                    {proj.name}
                  </h3>
                </div>
                <PriorityBadge priority={proj.priority} />
              </div>

              <div className="mt-3 flex items-center justify-between gap-2 text-xs">
                <ProjectStatusBadge status={proj.status} />
                <span className="font-mono-tabular text-neutral-500 dark:text-neutral-400">
                  {doneCount}/{pTasks.length} tasks · Due {proj.dueDate}
                </span>
              </div>

              {proj.isTemplate && editable && (
                <div className="mt-3 pt-2.5 border-t border-neutral-100 dark:border-zinc-800 flex justify-end">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setTemplateUseModal(proj);
                      setTemplateNewName(`${proj.name.replace(' (Template)', '')} — Client Deployment`);
                    }}
                    className="px-2.5 py-1 rounded-md bg-sky-600 text-white text-xs font-medium hover:bg-sky-700"
                  >
                    Use Template
                  </button>
                </div>
              )}
            </div>
          );
        })}

        {filteredProjects.length === 0 && (
          <div className="col-span-full rounded-xl border border-neutral-200 dark:border-zinc-800 bg-white dark:bg-[#0A0A0C] p-10 text-center space-y-3">
            <FolderKanban className="h-9 w-9 text-neutral-300 dark:text-zinc-700 mx-auto" />
            <div className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
              {state.projects.length === 0
                ? 'No projects created yet'
                : 'No projects match the current filter criteria'}
            </div>
            {state.projects.length === 0 && editable && (
              <button
                type="button"
                onClick={openCreateProjectModal}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-medium"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Create Your First Project</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Selected Project Workspace */}
      {activeProject && (
        <div className="rounded-xl border border-neutral-200 dark:border-zinc-800 bg-white dark:bg-[#0A0A0C] overflow-hidden">
          {/* Project Header & Sub-View Switcher */}
          <div className="p-5 border-b border-neutral-200 dark:border-zinc-800 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-1 max-w-3xl">
                <div className="flex flex-wrap items-center gap-2">
                  <FolderKanban className="h-5 w-5 text-sky-600 dark:text-sky-400" />
                  <h2 className="text-lg font-display font-bold text-neutral-900 dark:text-neutral-100">
                    {activeProject.name}
                  </h2>
                  <ProjectStatusBadge status={activeProject.status} />
                  <PriorityBadge priority={activeProject.priority} />
                </div>
                <p className="text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed">
                  {activeProject.description}
                </p>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-neutral-500 dark:text-neutral-400 pt-1">
                  <span>
                    Customer:{' '}
                    <strong className="font-medium text-neutral-800 dark:text-neutral-200">
                      {state.customers.find((c) => c.id === activeProject.customerId)?.name ?? 'N/A'}
                    </strong>
                  </span>
                  <span>
                    Vendor:{' '}
                    <strong className="font-medium text-neutral-800 dark:text-neutral-200">
                      {state.vendors.find((v) => v.id === activeProject.vendorId)?.name ?? 'N/A'}
                    </strong>
                  </span>
                  <span>
                    Product:{' '}
                    <strong className="font-medium text-neutral-800 dark:text-neutral-200">
                      {state.products.find((p) => p.id === activeProject.productId)?.name ?? 'N/A'}
                    </strong>
                  </span>
                  <span className="font-mono-tabular">
                    {activeProject.startDate} → {activeProject.dueDate}
                  </span>
                </div>

                {/* Multi-Category PM Contacts */}
                <div className="flex flex-wrap items-center gap-2 pt-1.5">
                  {activeProject.pms.map((pm) => (
                    <span
                      key={pm.id}
                      className="inline-flex items-center gap-1.5 rounded-md border border-neutral-200 dark:border-zinc-800 px-2 py-0.5 text-[11px] text-neutral-700 dark:text-neutral-300"
                    >
                      <span className="text-sky-600 dark:text-sky-400 font-medium">{pm.category}:</span>
                      <span>{pm.name}</span>
                    </span>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleExportTasksCsv}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-zinc-800 text-xs font-medium text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-zinc-900"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>Export CSV</span>
                </button>
                {editable && (
                  <>
                    <button
                      type="button"
                      onClick={() => saveProjectAsTemplate(activeProject.id)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-zinc-800 text-xs font-medium text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-zinc-900"
                    >
                      <Copy className="h-3.5 w-3.5" />
                      <span>Save as Template</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => openEditProjectModal(activeProject)}
                      className="px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-zinc-800 text-xs font-medium text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-zinc-900"
                    >
                      Edit Project
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        updateProject(activeProject.id, { archived: !activeProject.archived })
                      }
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-zinc-800 text-xs font-medium text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-zinc-900"
                    >
                      <Archive className="h-3.5 w-3.5" />
                      <span>{activeProject.archived ? 'Unarchive' : 'Archive'}</span>
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Sub-View Tabs */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-neutral-100 dark:border-zinc-800">
              <div className="flex items-center gap-1 p-1 bg-neutral-100 dark:bg-zinc-900 rounded-lg">
                {(
                  [
                    { id: 'list', label: 'List Tree', Icon: ListTree },
                    { id: 'timeline', label: 'Timeline Sheet', Icon: Table2 },
                    { id: 'gantt', label: 'Gantt & Dependencies', Icon: GanttChart },
                    { id: 'updates', label: 'Status Updates', Icon: MessageSquarePlus },
                  ] as const
                ).map(({ id, label, Icon }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setSubView(id)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
                      subView === id
                        ? 'bg-white dark:bg-black text-neutral-900 dark:text-neutral-100 shadow-sm'
                        : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    <span>{label}</span>
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                {editable && (
                  <ExcelImportActions
                    compact
                    templateTitle="Download Tasks Excel Template (.xlsx)"
                    importTitle="Import Tasks into Project from Excel (.xlsx / .csv)"
                    onDownloadTemplate={() =>
                      downloadExcelTemplate('tasks-import-template.xlsx', 'Tasks', [
                        { header: 'Title', example: 'Configure Telemetry Gateway', width: 28 },
                        { header: 'Parent Task', example: '', width: 22 },
                        { header: 'Status', example: 'todo', width: 14 },
                        { header: 'Priority', example: 'High', width: 12 },
                        { header: 'Assignee Email', example: 'chansathya.khy@ecamsolution.com', width: 30 },
                        { header: 'Start Date', example: activeProject.startDate, width: 14 },
                        { header: 'Due Date', example: activeProject.dueDate, width: 14 },
                        { header: 'Predecessors', example: '', width: 22 },
                        { header: 'Description', example: 'Install and verify production endpoints', width: 36 },
                      ])
                    }
                    onImportRows={(rows) => importTasks(activeProject.id, rows)}
                    onError={(msg) => notify(msg, 'error')}
                  />
                )}

                {subView === 'timeline' && (
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setColumnsMenuOpen((v) => !v)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-zinc-800 text-xs font-medium text-neutral-700 dark:text-neutral-200"
                    >
                      <Columns className="h-3.5 w-3.5" />
                      <span>Columns ({visibleCols.length})</span>
                    </button>
                    {columnsMenuOpen && (
                      <div className="absolute right-0 mt-1 w-48 rounded-lg border border-neutral-200 dark:border-zinc-800 bg-white dark:bg-[#0A0A0C] shadow-xl p-2 z-30 space-y-1">
                        {TIMELINE_COLUMN_OPTIONS.map((opt) => (
                          <label
                            key={opt.key}
                            className="flex items-center gap-2 px-2 py-1 text-xs rounded hover:bg-neutral-50 dark:hover:bg-zinc-900 cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={visibleCols.includes(opt.key)}
                              onChange={() => toggleProjectColumn(opt.key)}
                              className="accent-sky-600"
                            />
                            <span>{opt.label}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* SUB-VIEW 1: RECURSIVE LIST TREE */}
          {subView === 'list' && (
            <div className="divide-y divide-neutral-100 dark:divide-zinc-800">
              {flattenedTasks.map(({ task, depth, hasChildren }) => {
                const assignee = state.users.find((u) => u.id === task.assigneeId);
                const overdue = isTaskOverdue(task);
                const conflicts = getTaskScheduleConflicts(task, projectTasks);
                return (
                  <div
                    key={task.id}
                    className={`px-5 py-3 flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 ${
                      overdue
                        ? 'bg-red-50/40 dark:bg-red-500/10 hover:bg-red-50/70 dark:hover:bg-red-500/15'
                        : 'hover:bg-neutral-50 dark:hover:bg-zinc-900/60'
                    }`}
                  >
                    <div
                      className="flex items-center gap-2 min-w-0 flex-1"
                      style={{ paddingLeft: `${depth * 22}px` }}
                    >
                      {hasChildren ? (
                        <button
                          type="button"
                          onClick={() => toggleCollapse(task.id)}
                          className="p-0.5 rounded text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
                          aria-label="Toggle subtasks"
                        >
                          {collapsedTaskIds.has(task.id) ? (
                            <ChevronRight className="h-4 w-4" />
                          ) : (
                            <ChevronDown className="h-4 w-4" />
                          )}
                        </button>
                      ) : (
                        <span className="w-5 shrink-0" />
                      )}

                      <button
                        type="button"
                        onClick={() => onOpenTaskDrawer(task.id)}
                        className={`text-sm font-medium text-left truncate hover:text-sky-600 dark:hover:text-sky-400 ${
                          overdue ? 'text-red-700 dark:text-red-400' : 'text-neutral-900 dark:text-neutral-100'
                        }`}
                      >
                        {task.title}
                      </button>

                      {conflicts.length > 0 && (
                        <span
                          title="Schedule conflict: starts before predecessor finishes"
                          className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded px-1.5 py-0.5 shrink-0"
                        >
                          <AlertTriangle className="h-3 w-3" />
                          Conflict
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      {assignee && (
                        <div className="hidden md:flex items-center gap-1.5 text-xs text-neutral-600 dark:text-neutral-400">
                          <UserAvatar name={assignee.fullName} avatarUrl={assignee.avatarUrl} size="xs" />
                          <span className="max-w-[110px] truncate">{assignee.fullName}</span>
                        </div>
                      )}
                      <span
                        className={`text-xs font-mono-tabular whitespace-nowrap ${
                          overdue ? 'text-red-600 dark:text-red-400 font-semibold' : 'text-neutral-500'
                        }`}
                      >
                        {task.dueDate}
                      </span>
                      <PriorityBadge priority={task.priority} />
                      <TaskStatusBadge status={task.status} />
                      {editable && (
                        <button
                          type="button"
                          onClick={() => duplicateTask(task.id)}
                          title="Duplicate task subtree"
                          className="p-1 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}

              {flattenedTasks.length === 0 && (
                <div className="p-8 text-center text-sm text-neutral-500 dark:text-neutral-400">
                  No tasks in this project yet.
                </div>
              )}

              {editable && (
                <form
                  onSubmit={handleQuickAddRootTask}
                  className="p-4 bg-neutral-50 dark:bg-black flex items-center gap-2"
                >
                  <input
                    type="text"
                    value={quickTaskTitle}
                    onChange={(e) => setQuickTaskTitle(e.target.value)}
                    placeholder="Add a new root task to this project..."
                    className="flex-1 rounded-lg border border-neutral-200 dark:border-zinc-800 bg-white dark:bg-[#0A0A0C] px-3 py-2 text-xs text-neutral-900 dark:text-neutral-100"
                  />
                  <button
                    type="submit"
                    disabled={!quickTaskTitle.trim()}
                    className="inline-flex items-center gap-1 px-3.5 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-medium disabled:opacity-40"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add Task
                  </button>
                </form>
              )}
            </div>
          )}

          {/* SUB-VIEW 2: SPREADSHEET TIMELINE VIEW */}
          {subView === 'timeline' && (
            <div>
              {editable && selectedTaskIds.length > 0 && (
                <div className="px-4 py-2.5 bg-sky-50 dark:bg-sky-500/10 border-b border-sky-200 dark:border-sky-500/20 flex flex-wrap items-center justify-between gap-3 text-xs">
                  <span className="font-semibold text-sky-800 dark:text-sky-300">
                    {selectedTaskIds.length} task(s) selected
                  </span>
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={bulkStatus}
                      onChange={(e) => setBulkStatus(e.target.value as TaskStatus)}
                      className="rounded-md border border-neutral-200 dark:border-zinc-800 bg-white dark:bg-black px-2 py-1 text-xs"
                    >
                      <option value="todo">To Do</option>
                      <option value="in progress">In Progress</option>
                      <option value="done">Done</option>
                      <option value="blocked">Blocked</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => {
                        bulkUpdateTasks(selectedTaskIds, { status: bulkStatus });
                        setSelectedTaskIds([]);
                      }}
                      className="px-2.5 py-1 rounded-md bg-sky-600 text-white font-medium"
                    >
                      Set Status
                    </button>

                    <select
                      value={bulkAssignee}
                      onChange={(e) => setBulkAssignee(e.target.value)}
                      className="rounded-md border border-neutral-200 dark:border-zinc-800 bg-white dark:bg-black px-2 py-1 text-xs"
                    >
                      <option value="">Assign PIC...</option>
                      {state.users
                        .filter((u) => u.isActive)
                        .map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.fullName}
                          </option>
                        ))}
                    </select>
                    <button
                      type="button"
                      disabled={!bulkAssignee}
                      onClick={() => {
                        bulkUpdateTasks(selectedTaskIds, { assigneeId: bulkAssignee });
                        setSelectedTaskIds([]);
                      }}
                      className="px-2.5 py-1 rounded-md bg-neutral-900 dark:bg-zinc-800 text-white font-medium disabled:opacity-40"
                    >
                      Set PIC
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        bulkUpdateTasks(selectedTaskIds, { archived: true });
                        setSelectedTaskIds([]);
                      }}
                      className="px-2.5 py-1 rounded-md border border-red-300 dark:border-red-500/30 text-red-700 dark:text-red-400 font-medium"
                    >
                      Archive Selected
                    </button>
                  </div>
                </div>
              )}

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[780px]">
                  <thead>
                    <tr className="border-b border-neutral-200 dark:border-zinc-800 text-xs font-medium text-neutral-500 dark:text-neutral-400">
                      <th className="sticky left-0 z-20 bg-neutral-50 dark:bg-black py-3 px-4 min-w-[290px] border-r border-neutral-200 dark:border-zinc-800">
                        <div className="flex items-center gap-2.5">
                          {editable && (
                            <input
                              type="checkbox"
                              checked={
                                flattenedTasks.length > 0 &&
                                selectedTaskIds.length === flattenedTasks.length
                              }
                              onChange={(e) =>
                                setSelectedTaskIds(
                                  e.target.checked ? flattenedTasks.map((f) => f.task.id) : []
                                )
                              }
                              className="accent-sky-600"
                              aria-label="Select all tasks"
                            />
                          )}
                          <span>Task Name (Frozen)</span>
                        </div>
                      </th>
                      {visibleCols.includes('status') && <th className="py-3 px-4">Status</th>}
                      {visibleCols.includes('priority') && <th className="py-3 px-4">Priority</th>}
                      {visibleCols.includes('assignee') && <th className="py-3 px-4">PIC</th>}
                      {visibleCols.includes('startDate') && <th className="py-3 px-4">Start</th>}
                      {visibleCols.includes('dueDate') && <th className="py-3 px-4">Due</th>}
                      {visibleCols.includes('dependencies') && <th className="py-3 px-4">Predecessors</th>}
                      {visibleCols.includes('attachments') && <th className="py-3 px-4">Files</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100 dark:divide-zinc-800 text-xs">
                    {flattenedTasks.map(({ task, depth }) => {
                      const assignee = state.users.find((u) => u.id === task.assigneeId);
                      const overdue = isTaskOverdue(task);
                      const checked = selectedTaskIds.includes(task.id);
                      return (
                        <tr
                          key={task.id}
                          className={
                            overdue
                              ? 'bg-red-50/50 dark:bg-red-500/10'
                              : 'hover:bg-neutral-50 dark:hover:bg-zinc-900/60'
                          }
                        >
                          <td className="sticky left-0 z-10 bg-white dark:bg-[#0A0A0C] py-2.5 px-4 border-r border-neutral-200 dark:border-zinc-800">
                            <div
                              className="flex items-center gap-2.5"
                              style={{ paddingLeft: `${depth * 18}px` }}
                            >
                              {editable && (
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => toggleSelectTask(task.id)}
                                  className="accent-sky-600 shrink-0"
                                />
                              )}
                              <button
                                type="button"
                                onClick={() => onOpenTaskDrawer(task.id)}
                                className={`font-medium text-left truncate max-w-[230px] hover:text-sky-600 dark:hover:text-sky-400 ${
                                  overdue ? 'text-red-700 dark:text-red-400' : 'text-neutral-900 dark:text-neutral-100'
                                }`}
                              >
                                {task.title}
                              </button>
                            </div>
                          </td>

                          {visibleCols.includes('status') && (
                            <td className="py-2.5 px-4">
                              {editable ? (
                                <select
                                  value={task.status}
                                  onChange={(e) =>
                                    updateTask(task.id, { status: e.target.value as TaskStatus })
                                  }
                                  className="rounded border border-neutral-200 dark:border-zinc-800 bg-white dark:bg-black px-2 py-1 text-xs"
                                >
                                  <option value="todo">To Do</option>
                                  <option value="in progress">In Progress</option>
                                  <option value="done">Done</option>
                                  <option value="blocked">Blocked</option>
                                </select>
                              ) : (
                                <TaskStatusBadge status={task.status} />
                              )}
                            </td>
                          )}

                          {visibleCols.includes('priority') && (
                            <td className="py-2.5 px-4">
                              <PriorityBadge priority={task.priority} />
                            </td>
                          )}

                          {visibleCols.includes('assignee') && (
                            <td className="py-2.5 px-4 whitespace-nowrap">
                              {assignee ? (
                                <div className="flex items-center gap-1.5">
                                  <UserAvatar name={assignee.fullName} avatarUrl={assignee.avatarUrl} size="xs" />
                                  <span>{assignee.fullName}</span>
                                </div>
                              ) : (
                                <span className="text-neutral-400">Unassigned</span>
                              )}
                            </td>
                          )}

                          {visibleCols.includes('startDate') && (
                            <td className="py-2.5 px-4 font-mono-tabular whitespace-nowrap text-neutral-600 dark:text-neutral-400">
                              {task.startDate}
                            </td>
                          )}

                          {visibleCols.includes('dueDate') && (
                            <td
                              className={`py-2.5 px-4 font-mono-tabular whitespace-nowrap ${
                                overdue ? 'text-red-600 dark:text-red-400 font-semibold' : 'text-neutral-600 dark:text-neutral-400'
                              }`}
                            >
                              {task.dueDate}
                            </td>
                          )}

                          {visibleCols.includes('dependencies') && (
                            <td className="py-2.5 px-4 text-neutral-500">
                              {task.predecessorIds.length > 0
                                ? `${task.predecessorIds.length} linked`
                                : '—'}
                            </td>
                          )}

                          {visibleCols.includes('attachments') && (
                            <td className="py-2.5 px-4 font-mono-tabular text-neutral-500">
                              {task.attachments.length}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* SUB-VIEW 3: GANTT VIEW & SVG DEPENDENCY ENGINE */}
          {subView === 'gantt' && (
            <div className="overflow-x-auto">
              <div className="min-w-[900px] flex">
                {/* Left Task Column */}
                <div className="w-72 shrink-0 border-r border-neutral-200 dark:border-zinc-800 bg-white dark:bg-[#0A0A0C]">
                  <div className="h-11 px-4 border-b border-neutral-200 dark:border-zinc-800 flex items-center text-xs font-medium text-neutral-500 dark:text-neutral-400">
                    Task & Schedule Warnings
                  </div>
                  {flattenedTasks.map(({ task, depth }) => {
                    const conflicts = getTaskScheduleConflicts(task, projectTasks);
                    return (
                      <div
                        key={task.id}
                        style={{ height: GANTT_ROW_HEIGHT, paddingLeft: `${16 + depth * 14}px` }}
                        className="pr-3 border-b border-neutral-100 dark:border-zinc-800 flex items-center justify-between gap-2"
                      >
                        <button
                          type="button"
                          onClick={() => onOpenTaskDrawer(task.id)}
                          className="text-xs font-medium text-neutral-800 dark:text-neutral-200 hover:text-sky-600 dark:hover:text-sky-400 truncate text-left"
                        >
                          {task.title}
                        </button>
                        {conflicts.length > 0 && (
                          <span
                            title="Conflict: Starts before predecessor finishes"
                            className="inline-flex items-center gap-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 border border-amber-300 dark:border-amber-500/30 rounded px-1.5 py-0.5 shrink-0"
                          >
                            <AlertTriangle className="h-3 w-3" />
                            Conflict
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Right Gantt Grid + Bars + SVG Arrows */}
                <div
                  className="relative flex-1 overflow-x-auto"
                  style={{ minWidth: ganttBounds.totalDays * DAY_WIDTH }}
                >
                  {/* Day Header */}
                  <div
                    className="h-11 border-b border-neutral-200 dark:border-zinc-800 flex items-center bg-neutral-50 dark:bg-black"
                    style={{ width: ganttBounds.totalDays * DAY_WIDTH }}
                  >
                    {Array.from({ length: ganttBounds.totalDays }).map((_, i) => {
                      const d = new Date(ganttBounds.minMs + i * 86400000);
                      const showLabel = i % 3 === 0;
                      return (
                        <div
                          key={i}
                          style={{ width: DAY_WIDTH }}
                          className="h-full border-r border-neutral-100 dark:border-zinc-800/70 flex items-center justify-center text-[10px] font-mono-tabular text-neutral-400 shrink-0"
                        >
                          {showLabel ? d.toISOString().slice(5, 10) : ''}
                        </div>
                      );
                    })}
                  </div>

                  {/* Bars & SVG Connectors Container */}
                  <div
                    className="relative"
                    style={{
                      width: ganttBounds.totalDays * DAY_WIDTH,
                      height: flattenedTasks.length * GANTT_ROW_HEIGHT,
                    }}
                  >
                    <div className="absolute inset-0 flex pointer-events-none">
                      {Array.from({ length: ganttBounds.totalDays }).map((_, i) => (
                        <div
                          key={i}
                          style={{ width: DAY_WIDTH }}
                          className="h-full border-r border-neutral-100 dark:border-zinc-800/50 shrink-0"
                        />
                      ))}
                    </div>

                    {(() => {
                      const barMap = new Map<
                        string,
                        { x: number; w: number; y: number; conflict: boolean }
                      >();

                      flattenedTasks.forEach(({ task }, rowIndex) => {
                        const sMs = new Date(task.startDate).getTime();
                        const eMs = new Date(task.dueDate).getTime();
                        const startOffsetDays = Math.max(0, (sMs - ganttBounds.minMs) / 86400000);
                        const durationDays = Math.max(1, (eMs - sMs) / 86400000 + 1);
                        const x = startOffsetDays * DAY_WIDTH;
                        const w = durationDays * DAY_WIDTH;
                        const y = rowIndex * GANTT_ROW_HEIGHT;
                        const conflict = getTaskScheduleConflicts(task, projectTasks).length > 0;
                        barMap.set(task.id, { x, w, y, conflict });
                      });

                      return (
                        <>
                          <svg
                            width={ganttBounds.totalDays * DAY_WIDTH}
                            height={flattenedTasks.length * GANTT_ROW_HEIGHT}
                            className="absolute inset-0 pointer-events-none z-10"
                          >
                            <defs>
                              <marker
                                id="gantt-arrow"
                                markerWidth="7"
                                markerHeight="7"
                                refX="6"
                                refY="3.5"
                                orient="auto"
                              >
                                <polygon points="0 0, 7 3.5, 0 7" fill="#71717A" />
                              </marker>
                              <marker
                                id="gantt-arrow-conflict"
                                markerWidth="7"
                                markerHeight="7"
                                refX="6"
                                refY="3.5"
                                orient="auto"
                              >
                                <polygon points="0 0, 7 3.5, 0 7" fill="#D97706" />
                              </marker>
                            </defs>
                            {flattenedTasks.map(({ task }) =>
                              task.predecessorIds.map((pid) => {
                                const fromBar = barMap.get(pid);
                                const toBar = barMap.get(task.id);
                                if (!fromBar || !toBar) return null;
                                const predTask = projectTasks.find((t) => t.id === pid);
                                const isConflict = Boolean(
                                  predTask && predTask.dueDate && task.startDate < predTask.dueDate
                                );
                                const x1 = fromBar.x + fromBar.w;
                                const y1 = fromBar.y + GANTT_ROW_HEIGHT / 2;
                                const x2 = toBar.x;
                                const y2 = toBar.y + GANTT_ROW_HEIGHT / 2;
                                const cx = (x1 + x2) / 2;
                                const pathD = `M ${x1} ${y1} C ${cx} ${y1}, ${cx} ${y2}, ${x2} ${y2}`;
                                return (
                                  <path
                                    key={`${pid}-${task.id}`}
                                    d={pathD}
                                    fill="none"
                                    stroke={isConflict ? '#D97706' : '#71717A'}
                                    strokeWidth={1.75}
                                    strokeDasharray={isConflict ? '4 3' : undefined}
                                    markerEnd={
                                      isConflict ? 'url(#gantt-arrow-conflict)' : 'url(#gantt-arrow)'
                                    }
                                  />
                                );
                              })
                            )}
                          </svg>

                          {flattenedTasks.map(({ task }, rowIndex) => {
                            const geom = barMap.get(task.id)!;
                            const barColor =
                              task.status === 'done'
                                ? 'bg-amber-500 text-black'
                                : task.status === 'blocked'
                                  ? 'bg-red-600 text-white'
                                  : isTaskOverdue(task)
                                    ? 'bg-red-600 text-white'
                                    : 'bg-sky-600 text-white';

                            return (
                              <div
                                key={task.id}
                                style={{ top: rowIndex * GANTT_ROW_HEIGHT, height: GANTT_ROW_HEIGHT }}
                                className="absolute left-0 right-0 border-b border-neutral-100 dark:border-zinc-800/60"
                              >
                                <button
                                  type="button"
                                  onClick={() => onOpenTaskDrawer(task.id)}
                                  style={{ left: geom.x, width: Math.max(24, geom.w) }}
                                  title={`${task.title} (${task.startDate} → ${task.dueDate})`}
                                  className={`absolute top-2 h-7 rounded-md ${barColor} px-2 text-[11px] font-medium flex items-center justify-between gap-1 shadow-sm hover:brightness-110 z-20 overflow-hidden`}
                                >
                                  <span className="truncate">{task.title}</span>
                                  {geom.conflict && <AlertTriangle className="h-3 w-3 shrink-0" />}
                                </button>
                              </div>
                            );
                          })}
                        </>
                      );
                    })()}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* SUB-VIEW 4: PROJECT STATUS UPDATES */}
          {subView === 'updates' && (
            <div className="p-5 space-y-5">
              {editable && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!updateMsg.trim()) return;
                    postProjectUpdate(activeProject.id, updateMsg.trim(), updateHealth);
                    setUpdateMsg('');
                  }}
                  className="rounded-xl border border-neutral-200 dark:border-zinc-800 bg-neutral-50 dark:bg-black p-4 space-y-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-neutral-700 dark:text-neutral-200">
                      Post Project Status Update
                    </span>
                    <select
                      value={updateHealth}
                      onChange={(e) =>
                        setUpdateHealth(e.target.value as ProjectUpdate['healthStatus'])
                      }
                      className="rounded-lg border border-neutral-200 dark:border-zinc-800 bg-white dark:bg-[#0A0A0C] px-2.5 py-1 text-xs"
                    >
                      <option value="On Track">On Track</option>
                      <option value="At Risk">At Risk</option>
                      <option value="Delayed">Delayed</option>
                    </select>
                  </div>
                  <textarea
                    rows={2}
                    value={updateMsg}
                    onChange={(e) => setUpdateMsg(e.target.value)}
                    placeholder="Share milestone progress, blockers, or stakeholder notes..."
                    className="w-full rounded-lg border border-neutral-200 dark:border-zinc-800 bg-white dark:bg-[#0A0A0C] p-3 text-xs text-neutral-900 dark:text-neutral-100"
                  />
                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={!updateMsg.trim()}
                      className="px-4 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-medium disabled:opacity-40"
                    >
                      Post Update
                    </button>
                  </div>
                </form>
              )}

              <div className="space-y-3">
                {state.projectUpdates
                  .filter((u) => u.projectId === activeProject.id)
                  .map((upd) => {
                    const author = state.users.find((u) => u.id === upd.authorId);
                    const healthCls =
                      upd.healthStatus === 'On Track'
                        ? 'text-sky-700 bg-sky-50 border-sky-200 dark:text-sky-400 dark:bg-sky-500/10 dark:border-sky-500/30'
                        : upd.healthStatus === 'At Risk'
                          ? 'text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-400 dark:bg-amber-500/10 dark:border-amber-500/30'
                          : 'text-red-700 bg-red-50 border-red-200 dark:text-red-400 dark:bg-red-500/10 dark:border-red-500/30';
                    return (
                      <div
                        key={upd.id}
                        className="rounded-xl border border-neutral-200 dark:border-zinc-800 p-4 space-y-2"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <UserAvatar
                              name={author?.fullName ?? 'Team'}
                              avatarUrl={author?.avatarUrl}
                              size="xs"
                            />
                            <span className="text-xs font-semibold text-neutral-900 dark:text-neutral-100">
                              {author?.fullName}
                            </span>
                            <span className={`rounded border px-2 py-0.5 text-[11px] font-medium ${healthCls}`}>
                              {upd.healthStatus}
                            </span>
                          </div>
                          <span className="text-[11px] font-mono-tabular text-neutral-400">
                            {upd.createdAt.slice(0, 10)}
                          </span>
                        </div>
                        <p className="text-xs text-neutral-600 dark:text-neutral-300 leading-relaxed">
                          {upd.message}
                        </p>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Create / Edit Project Modal */}
      {projectModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/65" onClick={() => setProjectModalOpen(false)} />
          <div className="relative z-10 w-full max-w-2xl rounded-xl border border-neutral-200 dark:border-zinc-800 bg-white dark:bg-[#0A0A0C] shadow-2xl max-h-[90vh] flex flex-col">
            <div className="px-6 py-4 border-b border-neutral-200 dark:border-zinc-800 flex items-center justify-between">
              <h3 className="text-base font-display font-semibold text-neutral-900 dark:text-neutral-100">
                {editingProject ? `Edit ${editingProject.name}` : 'Create New Project'}
              </h3>
              <button type="button" onClick={() => setProjectModalOpen(false)} className="text-neutral-400 hover:text-neutral-200">
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleProjectSubmit} className="p-6 overflow-y-auto space-y-4 text-sm">
              <div>
                <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1">Project Name</label>
                <input
                  required
                  type="text"
                  value={pForm.name}
                  onChange={(e) => setPForm({ ...pForm, name: e.target.value })}
                  className="w-full rounded-lg border border-neutral-200 dark:border-zinc-800 bg-white dark:bg-black px-3 py-2 text-sm text-neutral-900 dark:text-neutral-100"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1">Description</label>
                <textarea
                  rows={2}
                  value={pForm.description}
                  onChange={(e) => setPForm({ ...pForm, description: e.target.value })}
                  className="w-full rounded-lg border border-neutral-200 dark:border-zinc-800 bg-white dark:bg-black px-3 py-2 text-sm text-neutral-900 dark:text-neutral-100"
                />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1">Status</label>
                  <select
                    value={pForm.status}
                    onChange={(e) => setPForm({ ...pForm, status: e.target.value as ProjectStatus })}
                    className="w-full rounded-lg border border-neutral-200 dark:border-zinc-800 bg-white dark:bg-black px-2.5 py-2 text-xs text-neutral-900 dark:text-neutral-100"
                  >
                    <option value="Planning">Planning</option>
                    <option value="Active">Active</option>
                    <option value="On Hold">On Hold</option>
                    <option value="Completed">Completed</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1">Priority</label>
                  <select
                    value={pForm.priority}
                    onChange={(e) => setPForm({ ...pForm, priority: e.target.value as ProjectPriority })}
                    className="w-full rounded-lg border border-neutral-200 dark:border-zinc-800 bg-white dark:bg-black px-2.5 py-2 text-xs text-neutral-900 dark:text-neutral-100"
                  >
                    <option value="Low">Low</option>
                    <option value="Medium">Medium</option>
                    <option value="High">High</option>
                    <option value="Critical">Critical</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1">Start</label>
                  <input
                    type="date"
                    value={pForm.startDate}
                    onChange={(e) => setPForm({ ...pForm, startDate: e.target.value })}
                    className="w-full font-mono-tabular rounded-lg border border-neutral-200 dark:border-zinc-800 bg-white dark:bg-black px-2 py-2 text-xs text-neutral-900 dark:text-neutral-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1">Due</label>
                  <input
                    type="date"
                    value={pForm.dueDate}
                    onChange={(e) => setPForm({ ...pForm, dueDate: e.target.value })}
                    className="w-full font-mono-tabular rounded-lg border border-neutral-200 dark:border-zinc-800 bg-white dark:bg-black px-2 py-2 text-xs text-neutral-900 dark:text-neutral-100"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1">Customer</label>
                  <select
                    value={pForm.customerId}
                    onChange={(e) => setPForm({ ...pForm, customerId: e.target.value })}
                    className="w-full rounded-lg border border-neutral-200 dark:border-zinc-800 bg-white dark:bg-black px-2.5 py-2 text-xs text-neutral-900 dark:text-neutral-100"
                  >
                    <option value="">None (Internal)</option>
                    {state.customers.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1">Vendor</label>
                  <select
                    value={pForm.vendorId}
                    onChange={(e) => setPForm({ ...pForm, vendorId: e.target.value })}
                    className="w-full rounded-lg border border-neutral-200 dark:border-zinc-800 bg-white dark:bg-black px-2.5 py-2 text-xs text-neutral-900 dark:text-neutral-100"
                  >
                    <option value="">None</option>
                    {state.vendors.map((v) => (
                      <option key={v.id} value={v.id}>{v.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1">Product</label>
                  <select
                    value={pForm.productId}
                    onChange={(e) => setPForm({ ...pForm, productId: e.target.value })}
                    className="w-full rounded-lg border border-neutral-200 dark:border-zinc-800 bg-white dark:bg-black px-2.5 py-2 text-xs text-neutral-900 dark:text-neutral-100"
                  >
                    <option value="">None</option>
                    {state.products.map((pr) => (
                      <option key={pr.id} value={pr.id}>{pr.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Multi-Category PM Assignment */}
              <div className="pt-2 border-t border-neutral-100 dark:border-zinc-800 space-y-2.5">
                <div className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
                  Project Managers & Stakeholder Contacts
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {pForm.pms.map((pm) => (
                    <span
                      key={pm.id}
                      className="inline-flex items-center gap-1.5 rounded-md border border-neutral-200 dark:border-zinc-800 px-2.5 py-1 text-xs"
                    >
                      <span className="font-medium text-sky-600 dark:text-sky-400">{pm.category}:</span>
                      <span>{pm.name}</span>
                      <button
                        type="button"
                        onClick={() =>
                          setPForm((prev) => ({ ...prev, pms: prev.pms.filter((x) => x.id !== pm.id) }))
                        }
                        className="text-neutral-400 hover:text-red-600 dark:hover:text-red-400"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={pmDraft.category}
                    onChange={(e) =>
                      setPmDraft({ ...pmDraft, category: e.target.value as ProjectPMCategory })
                    }
                    className="rounded-lg border border-neutral-200 dark:border-zinc-800 bg-white dark:bg-black px-2.5 py-1.5 text-xs text-neutral-900 dark:text-neutral-100"
                  >
                    <option value="Internal (eCam)">Internal (eCam)</option>
                    <option value="Customer Contact">Customer Contact</option>
                    <option value="Vendor Contact">Vendor Contact</option>
                  </select>

                  {pmDraft.category === 'Internal (eCam)' ? (
                    <select
                      value={pmDraft.userId}
                      onChange={(e) => setPmDraft({ ...pmDraft, userId: e.target.value })}
                      className="flex-1 rounded-lg border border-neutral-200 dark:border-zinc-800 bg-white dark:bg-black px-2.5 py-1.5 text-xs text-neutral-900 dark:text-neutral-100"
                    >
                      {state.users
                        .filter((u) => u.isActive)
                        .map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.fullName}
                          </option>
                        ))}
                    </select>
                  ) : (
                    <>
                      <input
                        type="text"
                        placeholder="Contact Name"
                        value={pmDraft.name}
                        onChange={(e) => setPmDraft({ ...pmDraft, name: e.target.value })}
                        className="flex-1 rounded-lg border border-neutral-200 dark:border-zinc-800 bg-white dark:bg-black px-2.5 py-1.5 text-xs text-neutral-900 dark:text-neutral-100"
                      />
                      <input
                        type="email"
                        placeholder="Contact Email"
                        value={pmDraft.email}
                        onChange={(e) => setPmDraft({ ...pmDraft, email: e.target.value })}
                        className="flex-1 rounded-lg border border-neutral-200 dark:border-zinc-800 bg-white dark:bg-black px-2.5 py-1.5 text-xs text-neutral-900 dark:text-neutral-100"
                      />
                    </>
                  )}
                  <button
                    type="button"
                    onClick={handleAddPmToForm}
                    className="px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-zinc-800 text-xs font-medium hover:bg-neutral-50 dark:hover:bg-zinc-900"
                  >
                    Add Contact
                  </button>
                </div>
              </div>

              <div className="pt-4 border-t border-neutral-200 dark:border-zinc-800 flex items-center justify-between gap-2">
                {editingProject ? (
                  <button
                    type="button"
                    onClick={() => {
                      deleteProject(editingProject.id);
                      setProjectModalOpen(false);
                    }}
                    className="inline-flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete Project
                  </button>
                ) : (
                  <span />
                )}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setProjectModalOpen(false)}
                    className="px-4 py-2 rounded-lg border border-neutral-200 dark:border-zinc-800 text-xs font-medium text-neutral-700 dark:text-neutral-300"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-medium"
                  >
                    {editingProject ? 'Save Project' : 'Create Project'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Instantiate From Template Modal */}
      {templateUseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/65" onClick={() => setTemplateUseModal(null)} />
          <div className="relative z-10 w-full max-w-md rounded-xl border border-neutral-200 dark:border-zinc-800 bg-white dark:bg-[#0A0A0C] p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-display font-semibold text-neutral-900 dark:text-neutral-100">
              Create Project from Template
            </h3>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Clones all task trees and predecessor links from <strong>{templateUseModal.name}</strong>.
            </p>
            <input
              type="text"
              value={templateNewName}
              onChange={(e) => setTemplateNewName(e.target.value)}
              className="w-full rounded-lg border border-neutral-200 dark:border-zinc-800 bg-white dark:bg-black px-3 py-2 text-sm text-neutral-900 dark:text-neutral-100"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setTemplateUseModal(null)}
                className="px-4 py-2 rounded-lg border border-neutral-200 dark:border-zinc-800 text-xs font-medium text-neutral-700 dark:text-neutral-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const created = createProjectFromTemplate(templateUseModal.id, templateNewName);
                  setTemplateUseModal(null);
                  setShowTemplatesTab(false);
                  if (created) setSelectedProjectId(created.id);
                }}
                className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-medium"
              >
                Launch Project
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
