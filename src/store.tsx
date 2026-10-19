import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api } from './api';
import type { AppState, FocusSession, Habit, Settings, Tag, Task, TaskList, ToastItem } from './types';
import { dateKey } from './lib/date';

interface AppContextValue {
  state: AppState | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  createTask: (input: Partial<Task>) => Promise<Task | null>;
  patchTask: (id: string, patch: Partial<Task>) => Promise<void>;
  toggleTask: (id: string, completed?: boolean) => Promise<void>;
  deleteTask: (id: string, permanent?: boolean) => Promise<void>;
  restoreTask: (id: string) => Promise<void>;
  purgeTask: (id: string) => Promise<void>;
  emptyTrash: () => Promise<void>;
  reorder: (items: { id: string; sortOrder: number; stage?: string }[]) => Promise<void>;
  createList: (input: Partial<TaskList>) => Promise<TaskList | null>;
  updateList: (id: string, patch: Partial<TaskList>) => Promise<void>;
  deleteList: (id: string) => Promise<void>;
  createTag: (name: string, color?: string) => Promise<Tag | null>;
  deleteTag: (id: string) => Promise<void>;
  createHabit: (input: Partial<Habit>) => Promise<Habit | null>;
  updateHabit: (id: string, patch: Partial<Habit>) => Promise<void>;
  deleteHabit: (id: string) => Promise<void>;
  toggleHabit: (habitId: string, date: string, done: boolean, value?: number) => Promise<void>;
  createFilter: (input: { name: string; query: Record<string, unknown>; color?: string }) => Promise<void>;
  deleteFilter: (id: string) => Promise<void>;
  addFocus: (session: Partial<FocusSession>) => Promise<void>;
  saveSettings: (patch: Partial<Settings>) => Promise<void>;
  importTickTick: (options?: { fromDate?: string | null; includeHabits?: boolean; keepFilters?: boolean }) => Promise<{ tasks: number; lists: number; habits: number; completed: number } | null>;
  importJson: (data: unknown) => Promise<void>;
  resetAll: () => Promise<void>;
  toast: (message: string, type?: ToastItem['type'], action?: ToastItem['action']) => void;
  toasts: ToastItem[];
  dismissToast: (id: string) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

function mergeSettings(current: Settings, patch: Partial<Settings>): Settings {
  return {
    ...current,
    ...patch,
    pomodoro: { ...current.pomodoro, ...(patch.pomodoro || {}) },
  };
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AppState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const stateRef = useRef<AppState | null>(null);
  stateRef.current = state;

  const toast = useCallback((message: string, type: ToastItem['type'] = 'info', action?: ToastItem['action']) => {
    const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    setToasts((items) => [...items.slice(-3), { id, message, type, action }]);
    window.setTimeout(() => setToasts((items) => items.filter((t) => t.id !== id)), 4200);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((items) => items.filter((t) => t.id !== id));
  }, []);

  const refresh = useCallback(async () => {
    try {
      const data = await api.state();
      setState(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!state) return;
    let cancelled = false;
    const poll = async () => {
      if (cancelled || document.hidden || !navigator.onLine) return;
      try {
        const result = await api.sync(stateRef.current?.meta.revision ?? 0);
        if (!cancelled && result.changed && result.state) setState(result.state);
      } catch {
        // Offline or server restarting; the next poll will retry.
      }
    };
    const interval = window.setInterval(poll, 12000);
    const onVisible = () => {
      if (!document.hidden) poll();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', poll);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', poll);
    };
  }, [state?.meta.revision]);

  const replaceTask = useCallback((task: Task) => {
    setState((s) => (s ? { ...s, tasks: s.tasks.map((t) => (t.id === task.id ? task : t)) } : s));
  }, []);

  const appendTask = useCallback((task: Task) => {
    setState((s) => (s && !s.tasks.some((t) => t.id === task.id) ? { ...s, tasks: [...s.tasks, task] } : s));
  }, []);

  const createTask = useCallback(
    async (input: Partial<Task>) => {
      try {
        const task = await api.createTask(input);
        appendTask(task);
        return task;
      } catch (err) {
        toast(err instanceof Error ? err.message : '创建任务失败', 'error');
        return null;
      }
    },
    [appendTask, toast],
  );

  const patchTask = useCallback(
    async (id: string, patch: Partial<Task>) => {
      const before = stateRef.current?.tasks.find((t) => t.id === id);
      if (before) replaceTask({ ...before, ...patch } as Task);
      try {
        const task = await api.updateTask(id, patch);
        replaceTask(task);
      } catch (err) {
        if (before) replaceTask(before);
        toast(err instanceof Error ? err.message : '保存失败', 'error');
      }
    },
    [replaceTask, toast],
  );

  const toggleTask = useCallback(
    async (id: string, completed?: boolean) => {
      const current = stateRef.current?.tasks.find((t) => t.id === id);
      if (!current) return;
      const nextCompleted = completed ?? current.status !== 'completed';
      setState((s) =>
        s
          ? {
              ...s,
              tasks: s.tasks.map((t) =>
                t.id === id
                  ? {
                      ...t,
                      status: nextCompleted ? 'completed' : 'open',
                      completedAt: nextCompleted ? new Date().toISOString() : null,
                      stage: nextCompleted ? 'done' : t.stage === 'done' ? 'todo' : t.stage,
                    }
                  : t,
              ),
            }
          : s,
      );
      try {
        const result = await api.completeTask(id, nextCompleted);
        replaceTask(result.task);
        if (result.nextTask) {
          appendTask(result.nextTask);
          toast('已完成本次，下一次已安排', 'success');
        }
      } catch (err) {
        replaceTask(current);
        toast(err instanceof Error ? err.message : '更新失败', 'error');
      }
    },
    [appendTask, replaceTask, toast],
  );

  const deleteTask = useCallback(
    async (id: string, permanent = false) => {
      try {
        if (permanent) await api.purgeTask(id);
        else await api.deleteTask(id);
        setState((s) => (s ? { ...s, tasks: s.tasks.filter((t) => t.id !== id) } : s));
        toast(permanent ? '已永久删除' : '已移至垃圾桶');
      } catch (err) {
        toast(err instanceof Error ? err.message : '删除失败', 'error');
      }
    },
    [toast],
  );

  const restoreTask = useCallback(
    async (id: string) => {
      try {
        const task = await api.restoreTask(id);
        replaceTask(task);
        toast('已恢复任务', 'success');
      } catch (err) {
        toast(err instanceof Error ? err.message : '恢复失败', 'error');
      }
    },
    [replaceTask, toast],
  );

  const purgeTask = useCallback(
    async (id: string) => {
      try {
        await api.purgeTask(id);
        setState((s) => (s ? { ...s, tasks: s.tasks.filter((t) => t.id !== id) } : s));
      } catch (err) {
        toast(err instanceof Error ? err.message : '删除失败', 'error');
      }
    },
    [toast],
  );

  const emptyTrash = useCallback(async () => {
    try {
      const result = await api.emptyTrash();
      setState((s) => (s ? { ...s, tasks: s.tasks.filter((t) => !t.deletedAt) } : s));
      toast(`已清空 ${result.count} 个任务`, 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : '清空失败', 'error');
    }
  }, [toast]);

  const reorder = useCallback(async (items: { id: string; sortOrder: number; stage?: string }[]) => {
    setState((s) =>
      s
        ? {
            ...s,
            tasks: s.tasks.map((t) => {
              const item = items.find((i) => i.id === t.id);
              return item ? { ...t, sortOrder: item.sortOrder, stage: (item.stage as Task['stage']) || t.stage } : t;
            }),
          }
        : s,
    );
    try {
      await api.reorderTasks(items);
    } catch {
      // The next refresh will reconcile.
    }
  }, []);

  const createList = useCallback(
    async (input: Partial<TaskList>) => {
      try {
        const list = await api.createList(input);
        setState((s) => (s ? { ...s, lists: [...s.lists, list] } : s));
        toast('清单已创建', 'success');
        return list;
      } catch (err) {
        toast(err instanceof Error ? err.message : '创建清单失败', 'error');
        return null;
      }
    },
    [toast],
  );

  const updateList = useCallback(
    async (id: string, patch: Partial<TaskList>) => {
      setState((s) => (s ? { ...s, lists: s.lists.map((l) => (l.id === id ? { ...l, ...patch } : l)) } : s));
      try {
        const list = await api.updateList(id, patch);
        setState((s) => (s ? { ...s, lists: s.lists.map((l) => (l.id === id ? list : l)) } : s));
      } catch (err) {
        toast(err instanceof Error ? err.message : '更新清单失败', 'error');
      }
    },
    [toast],
  );

  const deleteList = useCallback(
    async (id: string) => {
      try {
        await api.deleteList(id);
        setState((s) =>
          s
            ? {
                ...s,
                lists: s.lists.filter((l) => l.id !== id),
                tasks: s.tasks.map((t) => (t.listId === id ? { ...t, listId: 'inbox' } : t)),
              }
            : s,
        );
        toast('清单已删除，任务已移至收集箱');
      } catch (err) {
        toast(err instanceof Error ? err.message : '删除失败', 'error');
      }
    },
    [toast],
  );

  const createTag = useCallback(
    async (name: string, color?: string) => {
      try {
        const tag = await api.createTag({ name, color });
        setState((s) => (s && !s.tags.some((t) => t.name === tag.name) ? { ...s, tags: [...s.tags, tag] } : s));
        return tag;
      } catch (err) {
        toast(err instanceof Error ? err.message : '创建标签失败', 'error');
        return null;
      }
    },
    [toast],
  );

  const deleteTag = useCallback(
    async (id: string) => {
      const tag = stateRef.current?.tags.find((t) => t.id === id);
      try {
        await api.deleteTag(id);
        setState((s) =>
          s
            ? {
                ...s,
                tags: s.tags.filter((t) => t.id !== id),
                tasks: s.tasks.map((t) => (tag && t.tags.includes(tag.name) ? { ...t, tags: t.tags.filter((n) => n !== tag.name) } : t)),
              }
            : s,
        );
      } catch (err) {
        toast(err instanceof Error ? err.message : '删除标签失败', 'error');
      }
    },
    [toast],
  );

  const createHabit = useCallback(
    async (input: Partial<Habit>) => {
      try {
        const habit = await api.createHabit(input);
        setState((s) => (s ? { ...s, habits: [...s.habits, habit] } : s));
        toast('习惯已创建', 'success');
        return habit;
      } catch (err) {
        toast(err instanceof Error ? err.message : '创建习惯失败', 'error');
        return null;
      }
    },
    [toast],
  );

  const updateHabit = useCallback(
    async (id: string, patch: Partial<Habit>) => {
      setState((s) => (s ? { ...s, habits: s.habits.map((h) => (h.id === id ? { ...h, ...patch } : h)) } : s));
      try {
        const habit = await api.updateHabit(id, patch);
        setState((s) => (s ? { ...s, habits: s.habits.map((h) => (h.id === id ? habit : h)) } : s));
      } catch (err) {
        toast(err instanceof Error ? err.message : '更新习惯失败', 'error');
      }
    },
    [toast],
  );

  const deleteHabit = useCallback(
    async (id: string) => {
      try {
        await api.deleteHabit(id);
        setState((s) => (s ? { ...s, habits: s.habits.filter((h) => h.id !== id) } : s));
        toast('习惯已删除');
      } catch (err) {
        toast(err instanceof Error ? err.message : '删除失败', 'error');
      }
    },
    [toast],
  );

  const toggleHabit = useCallback(
    async (habitId: string, date: string, done: boolean, value = 1) => {
      setState((s) => {
        if (!s) return s;
        const logs = s.habitLogs.filter((l) => !(l.habitId === habitId && l.date === date));
        if (done) logs.push({ habitId, date, value, note: '', updatedAt: new Date().toISOString() });
        return { ...s, habitLogs: logs };
      });
      try {
        await api.checkinHabit(habitId, date, done ? value : 0);
      } catch (err) {
        toast(err instanceof Error ? err.message : '打卡失败', 'error');
        refresh();
      }
    },
    [refresh, toast],
  );

  const createFilter = useCallback(
    async (input: { name: string; query: Record<string, unknown>; color?: string }) => {
      try {
        const filter = await api.createFilter(input as any);
        setState((s) => (s ? { ...s, filters: [...s.filters, filter] } : s));
        toast('过滤器已创建', 'success');
      } catch (err) {
        toast(err instanceof Error ? err.message : '创建过滤器失败', 'error');
      }
    },
    [toast],
  );

  const deleteFilter = useCallback(
    async (id: string) => {
      try {
        await api.deleteFilter(id);
        setState((s) => (s ? { ...s, filters: s.filters.filter((f) => f.id !== id) } : s));
      } catch (err) {
        toast(err instanceof Error ? err.message : '删除过滤器失败', 'error');
      }
    },
    [toast],
  );

  const addFocus = useCallback(
    async (session: Partial<FocusSession>) => {
      try {
        const saved = await api.addFocus({
          ...session,
          endedAt: session.endedAt || new Date().toISOString(),
          startedAt: session.startedAt || new Date().toISOString(),
        });
        setState((s) => (s ? { ...s, focusSessions: [saved, ...s.focusSessions] } : s));
      } catch (err) {
        toast(err instanceof Error ? err.message : '保存专注记录失败', 'error');
      }
    },
    [toast],
  );

  const saveSettings = useCallback(
    async (patch: Partial<Settings>) => {
      setState((s) => (s ? { ...s, settings: mergeSettings(s.settings, patch) } : s));
      try {
        const settings = await api.saveSettings(patch);
        setState((s) => (s ? { ...s, settings } : s));
      } catch (err) {
        toast(err instanceof Error ? err.message : '设置保存失败', 'error');
      }
    },
    [toast],
  );

  const importTickTick = useCallback(async (options?: { fromDate?: string | null; includeHabits?: boolean; keepFilters?: boolean }) => {
    try {
      const result = await api.importTickTick(options);
      await refresh();
      toast(`已导入 ${result.stats.tasks} 个任务、${result.stats.lists} 个清单`, 'success');
      return result.stats;
    } catch (err) {
      toast(err instanceof Error ? err.message : '导入失败', 'error');
      return null;
    }
  }, [refresh, toast]);

  const importJson = useCallback(
    async (data: unknown) => {
      try {
        const next = await api.importJson(data);
        setState(next);
        toast('备份已恢复', 'success');
      } catch (err) {
        toast(err instanceof Error ? err.message : '恢复失败', 'error');
      }
    },
    [toast],
  );

  const resetAll = useCallback(async () => {
    try {
      const next = await api.reset();
      setState(next);
      toast('已恢复演示数据');
    } catch (err) {
      toast(err instanceof Error ? err.message : '重置失败', 'error');
    }
  }, [toast]);

  const value: AppContextValue = useMemo(
    () => ({
      state,
      loading,
      error,
      refresh,
      createTask,
      patchTask,
      toggleTask,
      deleteTask,
      restoreTask,
      purgeTask,
      emptyTrash,
      reorder,
      createList,
      updateList,
      deleteList,
      createTag,
      deleteTag,
      createHabit,
      updateHabit,
      deleteHabit,
      toggleHabit,
      createFilter,
      deleteFilter,
      addFocus,
      saveSettings,
      importTickTick,
      importJson,
      resetAll,
      toast,
      toasts,
      dismissToast,
    }),
    [
      state,
      loading,
      error,
      refresh,
      createTask,
      patchTask,
      toggleTask,
      deleteTask,
      restoreTask,
      purgeTask,
      emptyTrash,
      reorder,
      createList,
      updateList,
      deleteList,
      createTag,
      deleteTag,
      createHabit,
      updateHabit,
      deleteHabit,
      toggleHabit,
      createFilter,
      deleteFilter,
      addFocus,
      saveSettings,
      importTickTick,
      importJson,
      resetAll,
      toast,
      toasts,
      dismissToast,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp 必须在 AppProvider 内使用');
  return context;
}

export function useTodayCounts() {
  const { state } = useApp();
  return useMemo(() => {
    if (!state) return { completed: 0, total: 0 };
    const today = dateKey();
    const tasks = state.tasks.filter((t) => !t.deletedAt && t.dueAt?.slice(0, 10) === today);
    return { completed: tasks.filter((t) => t.status === 'completed').length, total: tasks.length };
  }, [state]);
}