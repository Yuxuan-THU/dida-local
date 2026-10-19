import type { AppState, ImportStats, MobileInfo, SavedFilter, Settings, Tag, Task, TaskList, TickTickPreview, TickTickSyncStatus } from './types';

const TOKEN_KEY = 'dida-access-token';
let accessToken = '';
try {
  accessToken = localStorage.getItem(TOKEN_KEY) || '';
} catch {
  accessToken = '';
}
try {
  const current = new URL(window.location.href);
  const queryToken = current.searchParams.get('token');
  if (queryToken) {
    accessToken = queryToken;
    localStorage.setItem(TOKEN_KEY, queryToken);
    current.searchParams.delete('token');
    window.history.replaceState({}, '', `${current.pathname}${current.search}${current.hash}`);
  }
} catch {
  // token handling is optional on non-browser contexts.
}

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(options.headers as Record<string, string> || {}) };
  if (accessToken) headers['X-Dida-Token'] = accessToken;
  const response = await fetch(url, { ...options, headers });
  const text = await response.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { error: text };
  }
  if (!response.ok) {
    const error = new Error(data?.error || `请求失败（${response.status}）`);
    (error as any).status = response.status;
    (error as any).code = data?.code;
    throw error;
  }
  return data as T;
}

const json = (body: unknown) => JSON.stringify(body);

export const api = {
  state: () => request<AppState>('/api/state'),
  health: () => request<{ ok: boolean; revision: number }>('/api/health'),
  sync: (revision: number) => request<{ revision: number; changed: boolean; state?: AppState }>(`/api/sync?revision=${revision}`),
  mobileInfo: () => request<MobileInfo>('/api/mobile-info'),

  createTask: (task: Partial<Task>) => request<Task>('/api/tasks', { method: 'POST', body: json(task) }),
  updateTask: (id: string, patch: Partial<Task>) =>
    request<Task>(`/api/tasks/${encodeURIComponent(id)}`, { method: 'PATCH', body: json(patch) }),
  completeTask: (id: string, completed = true) =>
    request<{ task: Task; nextTask: Task | null }>(`/api/tasks/${encodeURIComponent(id)}/complete`, {
      method: 'POST',
      body: json({ completed }),
    }),
  deleteTask: (id: string) => request<Task>(`/api/tasks/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  restoreTask: (id: string) =>
    request<Task>(`/api/tasks/${encodeURIComponent(id)}/restore`, { method: 'POST', body: json({}) }),
  purgeTask: (id: string) =>
    request<{ ok: boolean }>(`/api/tasks/${encodeURIComponent(id)}?permanent=1`, { method: 'DELETE' }),
  emptyTrash: () => request<{ count: number }>('/api/tasks/empty-trash', { method: 'POST', body: json({}) }),
  postponeTask: (id: string, dueAt: string) =>
    request<Task>(`/api/tasks/${encodeURIComponent(id)}/postpone`, { method: 'POST', body: json({ dueAt }) }),
  reorderTasks: (items: { id: string; sortOrder: number; stage?: string }[]) =>
    request<{ ok: boolean }>('/api/tasks/reorder', { method: 'POST', body: json({ items }) }),
  bulkTasks: (action: string, ids: string[], payload: Record<string, unknown> = {}) =>
    request<{ tasks: Task[] }>('/api/tasks/bulk', { method: 'POST', body: json({ action, ids, payload }) }),

  createList: (list: Partial<TaskList>) => request<TaskList>('/api/lists', { method: 'POST', body: json(list) }),
  updateList: (id: string, patch: Partial<TaskList>) =>
    request<TaskList>(`/api/lists/${encodeURIComponent(id)}`, { method: 'PATCH', body: json(patch) }),
  deleteList: (id: string) =>
    request<{ ok: boolean }>(`/api/lists/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  createTag: (tag: Partial<Tag>) => request<Tag>('/api/tags', { method: 'POST', body: json(tag) }),
  updateTag: (id: string, patch: Partial<Tag>) =>
    request<Tag>(`/api/tags/${encodeURIComponent(id)}`, { method: 'PATCH', body: json(patch) }),
  deleteTag: (id: string) => request<{ ok: boolean }>(`/api/tags/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  createFilter: (filter: Partial<SavedFilter>) => request<SavedFilter>('/api/filters', { method: 'POST', body: json(filter) }),
  deleteFilter: (id: string) => request<{ ok: boolean }>(`/api/filters/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  saveSettings: (patch: Partial<Settings>) => request<Settings>('/api/settings', { method: 'POST', body: json(patch) }),

  previewTickTick: (fromDate?: string) =>
    request<TickTickPreview>(`/api/import/ticktick/preview${fromDate ? `?fromDate=${encodeURIComponent(fromDate)}` : ''}`),
  importTickTick: (options: { fromDate?: string | null; includeHabits?: boolean; keepFilters?: boolean } = {}) =>
    request<ImportStats>('/api/import/ticktick', { method: 'POST', body: json(options) }),
  ticktickSyncStatus: () => request<TickTickSyncStatus>('/api/ticktick/status'),
  saveTicktickSync: (options: { enabled?: boolean; scope?: 'all' | 'future'; source?: string }) =>
    request<TickTickSyncStatus>('/api/ticktick/settings', { method: 'POST', body: json(options) }),
  syncTicktick: () => request<{ ok: boolean; error?: string; changed?: Record<string, number>; status?: TickTickSyncStatus }>('/api/ticktick/sync', { method: 'POST', body: json({}) }),
  importJson: (data: unknown) => request<AppState>('/api/import/json', { method: 'POST', body: json(data) }),
  reset: () => request<AppState>('/api/reset', { method: 'POST', body: json({}) }),
  get exportUrl() {
    return `/api/export${accessToken ? `?token=${encodeURIComponent(accessToken)}` : ''}`;
  },
};