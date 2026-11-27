export type ModuleId =
  | 'dashboard'
  | 'onboarding'
  | 'projects'
  | 'learning'
  | 'tasks'
  | 'staff'
  | 'org-chart'
  | 'announcements'
  | 'profile'
  | 'admin'
  | 'positions'
  | 'project-config'
  | 'settings';

export type PermissionLevel = 'none' | 'view' | 'edit';

export type ModulePermissions = Record<ModuleId, PermissionLevel>;

export interface Role {
  id: string;
  name: string;
  description: string;
  isSystem?: boolean;
  permissions: ModulePermissions;
}

export interface Position {
  id: string;
  title: string;
  level: string;
  priorityLevel: number; // Higher = higher rank in org chart sibling sort
  description: string;
}

export interface User {
  id: string;
  fullName: string;
  email: string;
  password: string;
  avatarUrl: string;
  department: string;
  location: string;
  phone: string;
  bio: string;
  positionId: string;
  managerId: string | null;
  mentorId: string | null;
  startDate: string; // YYYY-MM-DD
  isActive: boolean;
  isNewJoiner: boolean;
  roleIds: string[];
  onboardingCompletedIds: string[];
}

export interface OnboardingChecklistItem {
  id: string;
  title: string;
  description: string;
  category: 'IT & Access' | 'HR & Compliance' | 'Team & Tooling' | 'Architecture';
  order: number;
}

export interface Announcement {
  id: string;
  title: string;
  body: string;
  category: 'General' | 'Policy' | 'Release' | 'Culture';
  pinned: boolean;
  active: boolean;
  authorId: string;
  createdAt: string;
}

export interface CustomerEntity {
  id: string;
  name: string;
  industry: string;
  contactEmail: string;
}

export interface VendorEntity {
  id: string;
  name: string;
  specialty: string;
  contactEmail: string;
}

export interface ProductEntity {
  id: string;
  name: string;
  code: string;
  description: string;
}

export type ProjectPMCategory = 'Internal (eCam)' | 'Customer Contact' | 'Vendor Contact';

export interface ProjectPM {
  id: string;
  userId?: string;
  name: string;
  email: string;
  category: ProjectPMCategory;
}

export type ProjectStatus = 'Planning' | 'Active' | 'On Hold' | 'Completed';
export type ProjectPriority = 'Low' | 'Medium' | 'High' | 'Critical';

export type TimelineColumnKey =
  | 'status'
  | 'priority'
  | 'assignee'
  | 'startDate'
  | 'dueDate'
  | 'dependencies'
  | 'attachments';

export interface Project {
  id: string;
  name: string;
  description: string;
  status: ProjectStatus;
  priority: ProjectPriority;
  startDate: string;
  dueDate: string;
  ownerId: string;
  customerId: string;
  vendorId: string;
  productId: string;
  pms: ProjectPM[];
  memberIds: string[];
  archived: boolean;
  isTemplate: boolean;
  visibleColumns: TimelineColumnKey[];
  createdAt: string;
}

export type TaskStatus = 'todo' | 'in progress' | 'done' | 'blocked';
export type TaskPriority = 'Low' | 'Medium' | 'High' | 'Critical';

export interface TaskAttachment {
  id: string;
  name: string;
  size: string;
  type: string;
  url: string;
  uploadedAt: string;
}

export interface Task {
  id: string;
  projectId: string;
  parentId: string | null;
  title: string;
  description: string;
  assigneeId: string | null;
  startDate: string;
  dueDate: string;
  status: TaskStatus;
  priority: TaskPriority;
  predecessorIds: string[];
  attachments: TaskAttachment[];
  archived: boolean;
  order: number;
  updatedAt: string;
}

export interface ProjectUpdate {
  id: string;
  projectId: string;
  authorId: string;
  message: string;
  healthStatus: 'On Track' | 'At Risk' | 'Delayed';
  createdAt: string;
}

export interface ProjectFilterPreset {
  id: string;
  name: string;
  priority: ProjectPriority | 'all';
  pmQuery: string;
  overdueOnly: boolean;
  includeArchived: boolean;
}

export type LessonType = 'text' | 'video' | 'pdf' | 'image' | 'link';

export interface Lesson {
  id: string;
  title: string;
  type: LessonType;
  durationMinutes: number;
  content: string; // Markdown/text or URL or Data URL
  order: number;
}

export interface CourseModule {
  id: string;
  title: string;
  order: number;
  lessons: Lesson[];
}

export interface QuizQuestion {
  id: string;
  prompt: string;
  options: string[];
  correctIndex: number;
}

export interface Quiz {
  passingScore: number; // 0 - 100
  questions: QuizQuestion[];
}

export type CompletionRule = 'All Lessons' | 'Quiz Pass' | 'Both';

export interface Course {
  id: string;
  title: string;
  category: string;
  description: string;
  status: 'Draft' | 'Published';
  prerequisiteCourseIds: string[];
  completionRule: CompletionRule;
  autoAssignNewJoiners: boolean;
  certificateBgOverride: string;
  modules: CourseModule[];
  quiz: Quiz;
  createdAt: string;
}

export interface QuizAttempt {
  id: string;
  score: number;
  passed: boolean;
  answers: number[];
  submittedAt: string;
}

export interface Enrollment {
  id: string;
  userId: string;
  courseId: string;
  completedLessonIds: string[];
  quizAttempts: QuizAttempt[];
  passed: boolean;
  completedAt: string | null;
  enrolledAt: string;
}

export interface AuditLogEntry {
  id: string;
  actorId: string;
  actorName: string;
  timestamp: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE';
  module: ModuleId;
  table: string;
  recordId: string;
  summary: string;
  before: unknown;
  after: unknown;
}

export interface BrandingSettings {
  appName: string;
  tagline: string;
  heroText: string;
  logoUrl: string;
  defaultCertificateBg: string;
  theme: 'light' | 'dark';
}

export interface ToastMessage {
  id: string;
  title: string;
  type: 'success' | 'info' | 'warning' | 'error';
}

export interface AppState {
  branding: BrandingSettings;
  isAuthenticated: boolean;
  currentUserId: string;
  roles: Role[];
  positions: Position[];
  users: User[];
  onboardingItems: OnboardingChecklistItem[];
  announcements: Announcement[];
  customers: CustomerEntity[];
  vendors: VendorEntity[];
  products: ProductEntity[];
  projects: Project[];
  tasks: Task[];
  projectUpdates: ProjectUpdate[];
  filterPresets: ProjectFilterPreset[];
  courses: Course[];
  enrollments: Enrollment[];
  auditLogs: AuditLogEntry[];
}
