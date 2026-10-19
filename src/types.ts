export interface TaskList {
  id: string;
  name: string;
  emoji: string;
  color: string;
  sortOrder: number;
  isInbox: boolean;
  viewMode: 'list' | 'board';
  archived: boolean;
  createdAt: string;
  deletedAt?: string | null;
}

export interface Subtask {
  id: string;
  title: string;
  done: boolean;
}

export interface RepeatRule {
  freq: 'daily' | 'weekdays' | 'weekly' | 'monthly' | 'yearly';
  interval?: number;
  weekdays?: number[];
}

export type TaskStatus = 'open' | 'completed' | 'abandoned';
export type Stage = 'todo' | 'doing' | 'done';

export interface Task {
  id: string;
  listId: string;
  title: string;
  notes: string;
  status: TaskStatus;
  priority: number;
  dueAt: string | null;
  allDay: boolean;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  sortOrder: number;
  tags: string[];
  subtasks: Subtask[];
  repeatRule: RepeatRule | null;
  reminders: number[];
  estimate: number;
  focusedSeconds: number;
  stage: Stage;
  pinned: boolean;
  deletedAt: string | null;
}

export interface Tag {
  id: string;
  name: string;
  color: string;
  createdAt: string;
}

export interface FilterRule {
  priority?: number[];
  tag?: string;
  listId?: string;
  due?: 'today' | 'week' | 'overdue' | 'none';
  status?: 'open' | 'completed';
  keyword?: string;
}

export interface SavedFilter {
  id: string;
  name: string;
  icon: string;
  color: string;
  query: FilterRule;
  sortOrder: number;
  createdAt: string;
}

export interface Settings {
  theme: 'light' | 'dark' | 'auto';
  accent: string;
  wallpaper: string;
  userName: string;
  weekStart: number;
  timeFormat: '24h' | '12h';
  density: 'comfortable' | 'compact';
  showCompleted: boolean;
  dailyTaskGoal: number;
  notifications: boolean;
  sound: boolean;
  firstDayDone: boolean;
}

export interface AppState {
  lists: TaskList[];
  tags: Tag[];
  tasks: Task[];
  filters: SavedFilter[];
  settings: Settings;
  meta: { now: string; version: number; revision: number };
}

export type View =
  | { kind: 'today' }
  | { kind: 'next7' }
  | { kind: 'inbox' }
  | { kind: 'all' }
  | { kind: 'completed' }
  | { kind: 'abandoned' }
  | { kind: 'trash' }
  | { kind: 'calendar' }
  | { kind: 'list'; id: string }
  | { kind: 'tag'; name: string }
  | { kind: 'filter'; id: string };

export interface ToastItem {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
  action?: { label: string; onClick: () => void };
}

export interface ImportStats {
  ok: boolean;
  stats: {
    lists: number;
    tasks: number;
    completed: number;
    tags: number;
  };
  backupPath: string;
  source: string;
}

export interface TickTickSyncStatus {
  enabled: boolean;
  scope: 'all' | 'future';
  source: string;
  sourceExists: boolean;
  running: boolean;
  lastSync: string | null;
  lastError: string | null;
  conflicts: number;
  stats: {
    tasks?: number;
    completed?: number;
    lists?: number;
    added?: number;
    updated?: number;
    removed?: number;
    conflicts?: number;
  };
}

export interface TickTickPreview {
  path: string;
  tasks: number;
  completed: number;
  lists: number;
  size: number;
  futureTasks: number;
  futureCompleted: number;
}

export interface MobileInfo {
  token: string;
  port: number;
  urls: string[];
  qrDataUrl: string | null;
}