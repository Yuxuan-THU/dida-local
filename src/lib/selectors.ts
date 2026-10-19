import type { AppState, FilterRule, Task, View } from '../types';
import { addDays, dateKey, dayDiff, fullDateLabel, humanDay, isOverdue, weekRangeLabel } from './date';

export const isOpen = (task: Task) => task.status === 'open' && !task.deletedAt && task.status !== ('abandoned' as any);
export const isAlive = (task: Task) => !task.deletedAt;
export const isCompleted = (task: Task) => task.status === 'completed' && !task.deletedAt;

export function sortTasks(tasks: Task[]) {
  return [...tasks].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.createdAt.localeCompare(b.createdAt);
  });
}

export function matchesFilter(task: Task, rule: FilterRule) {
  if (rule.status === 'completed' && task.status !== 'completed') return false;
  if (rule.status === 'open' && task.status !== 'open') return false;
  if (rule.priority?.length && !rule.priority.includes(task.priority)) return false;
  if (rule.tag && !task.tags.includes(rule.tag)) return false;
  if (rule.listId && task.listId !== rule.listId) return false;
  if (rule.keyword) {
    const needle = rule.keyword.toLowerCase();
    const haystack = `${task.title} ${task.notes} ${task.tags.join(' ')}`.toLowerCase();
    if (!haystack.includes(needle)) return false;
  }
  if (rule.due) {
    const today = dateKey();
    if (rule.due === 'none' && task.dueAt) return false;
    if (rule.due === 'today' && task.dueAt?.slice(0, 10) !== today) return false;
    if (rule.due === 'overdue' && !(task.dueAt && task.dueAt.slice(0, 10) < today)) return false;
    if (rule.due === 'week' && !(task.dueAt && task.dueAt.slice(0, 10) <= addDays(today, 7))) return false;
  }
  return true;
}

export function tasksForView(state: AppState, view: View): Task[] {
  const all = state.tasks;
  switch (view.kind) {
    case 'today':
      return all.filter(
        (t) =>
          !t.deletedAt &&
          t.status !== 'abandoned' &&
          ((t.dueAt && t.dueAt.slice(0, 10) <= dateKey()) ||
            (t.status === 'completed' && t.completedAt?.slice(0, 10) === dateKey())),
      );
    case 'next7': {
      const end = addDays(dateKey(), 6);
      return all.filter(
        (t) =>
          !t.deletedAt &&
          t.status !== 'abandoned' &&
          t.dueAt &&
          t.dueAt.slice(0, 10) <= end,
      );
    }
    case 'inbox':
      return all.filter((t) => !t.deletedAt && t.listId === 'inbox');
    case 'list':
      return all.filter((t) => !t.deletedAt && t.listId === view.id);
    case 'tag':
      return all.filter((t) => !t.deletedAt && t.tags.includes(view.name));
    case 'filter': {
      const filter = state.filters.find((f) => f.id === view.id);
      if (!filter) return [];
      return all.filter((t) => !t.deletedAt && matchesFilter(t, filter.query));
    }
    case 'completed':
      return all.filter((t) => !t.deletedAt && t.status === 'completed');
    case 'abandoned':
      return all.filter((t) => !t.deletedAt && t.status === 'abandoned');
    case 'trash':
      return all.filter((t) => Boolean(t.deletedAt));
    case 'all':
      return all.filter((t) => !t.deletedAt && t.status !== 'abandoned');
    default:
      return [];
  }
}

export interface TaskCounts {
  today: number;
  next7: number;
  inbox: number;
  completed: number;
  trash: number;
  abandoned: number;
  lists: Record<string, number>;
  tags: Record<string, number>;
}

export function computeCounts(state: AppState): TaskCounts {
  const counts: TaskCounts = { today: 0, next7: 0, inbox: 0, completed: 0, trash: 0, abandoned: 0, lists: {}, tags: {} };
  const today = dateKey();
  const end = addDays(today, 7);
  for (const task of state.tasks) {
    if (task.deletedAt) {
      counts.trash += 1;
      continue;
    }
    if (task.status === 'abandoned') {
      counts.abandoned += 1;
      continue;
    }
    if (task.status === 'completed') {
      counts.completed += 1;
      continue;
    }
    if (task.dueAt && task.dueAt.slice(0, 10) <= today) counts.today += 1;
    if (task.dueAt && task.dueAt.slice(0, 10) <= end) counts.next7 += 1;
    if (task.listId === 'inbox') counts.inbox += 1;
    counts.lists[task.listId] = (counts.lists[task.listId] || 0) + 1;
    for (const tag of task.tags) counts.tags[tag] = (counts.tags[tag] || 0) + 1;
  }
  return counts;
}

export interface Group {
  key: string;
  label: string;
  tone?: 'danger' | 'muted' | 'normal';
  tasks: Task[];
  collapsible?: boolean;
  defaultCollapsed?: boolean;
  count?: number;
}

export function groupTasks(view: View, tasks: Task[]): Group[] {
  const open = sortTasks(tasks.filter((t) => t.status === 'open'));
  const completed = [...tasks.filter((t) => t.status === 'completed')].sort((a, b) =>
    (b.completedAt || '').localeCompare(a.completedAt || ''),
  );
  const today = dateKey();

  if (view.kind === 'today') {
    const overdue = open.filter((t) => t.dueAt && t.dueAt.slice(0, 10) < today);
    const todays = open.filter((t) => t.dueAt?.slice(0, 10) === today);
    const noDate = open.filter((t) => !t.dueAt);
    const groups: Group[] = [];
    if (overdue.length)
      groups.push({ key: 'overdue', label: '已过期', tone: 'danger', tasks: overdue, collapsible: true, count: overdue.length });
    groups.push({ key: 'today', label: '今天', tasks: todays, collapsible: true, count: todays.length });
    if (noDate.length) groups.push({ key: 'nodate', label: '无日期', tone: 'muted', tasks: noDate, collapsible: true, defaultCollapsed: true, count: noDate.length });
    if (completed.length)
      groups.push({ key: 'completed', label: '已完成', tone: 'muted', tasks: completed, collapsible: true, defaultCollapsed: true, count: completed.length });
    return groups;
  }

  if (view.kind === 'next7') {
    const groups: Group[] = [];
    const overdue = open.filter((t) => t.dueAt && t.dueAt.slice(0, 10) < today);
    if (overdue.length) groups.push({ key: 'overdue', label: '已过期', tone: 'danger', tasks: overdue, collapsible: true, count: overdue.length });
    for (let i = 0; i < 7; i += 1) {
      const key = addDays(today, i);
      const dayTasks = open.filter((t) => t.dueAt?.slice(0, 10) === key);
      if (dayTasks.length || i === 0) {
        groups.push({
          key,
          label: i === 0 ? '今天' : `${humanDay(key)} · ${key.slice(5).replace('-', '/')}`,
          tasks: dayTasks,
          collapsible: true,
          count: dayTasks.length,
        });
      }
    }
    if (completed.length)
      groups.push({ key: 'completed', label: '已完成', tone: 'muted', tasks: completed, collapsible: true, defaultCollapsed: true, count: completed.length });
    return groups;
  }

  if (view.kind === 'completed') {
    const byDay = new Map<string, Task[]>();
    for (const task of completed) {
      const key = task.completedAt?.slice(0, 10) || task.dueAt?.slice(0, 10) || '未知';
      if (!byDay.has(key)) byDay.set(key, []);
      byDay.get(key)!.push(task);
    }
    return [...byDay.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([key, dayTasks]) => ({
        key,
        label: key === today ? '今天' : humanDay(key, true),
        tone: 'muted' as const,
        tasks: dayTasks,
        collapsible: true,
        count: dayTasks.length,
      }));
  }

  if (view.kind === 'trash') {
    return sortTasks(tasks).length
      ? [{ key: 'trash', label: '垃圾桶', tone: 'muted', tasks: sortTasks(tasks), count: tasks.length }]
      : [];
  }

  if (view.kind === 'abandoned') {
    return tasks.length ? [{ key: 'abandoned', label: '已放弃', tone: 'muted', tasks: sortTasks(tasks), count: tasks.length }] : [];
  }

  const groups: Group[] = [];
  const pinned = open.filter((t) => t.pinned);
  if (pinned.length) groups.push({ key: 'pinned', label: '置顶', tasks: pinned, collapsible: true, count: pinned.length });
  const normal = open.filter((t) => !t.pinned);
  if (normal.length || !pinned.length) groups.push({ key: 'open', label: '', tasks: normal, count: normal.length });
  if (completed.length)
    groups.push({ key: 'completed', label: '已完成', tone: 'muted', tasks: completed, collapsible: true, defaultCollapsed: true, count: completed.length });
  return groups;
}

export function viewInfo(state: AppState, view: View) {
  switch (view.kind) {
    case 'today':
      return { title: '今天', subtitle: fullDateLabel(), eyebrow: '', color: '#4f76f6' };
    case 'next7':
      return { title: '最近 7 天', subtitle: weekRangeLabel(), eyebrow: '', color: '#4f76f6' };
    case 'inbox':
      return { title: '收集箱', subtitle: '所有没有归类的想法', eyebrow: '清单', color: '#64748b' };
    case 'all':
      return { title: '全部任务', subtitle: '所有未完成的任务', eyebrow: '智能清单', color: '#4f76f6' };
    case 'completed':
      return { title: '已完成', subtitle: '每一件完成的小事，都算数', eyebrow: '智能清单', color: '#10b981' };
    case 'abandoned':
      return { title: '已放弃', subtitle: '暂时放下的任务', eyebrow: '智能清单', color: '#94a3b8' };
    case 'trash':
      return { title: '垃圾桶', subtitle: '删除的任务会保留在这里', eyebrow: '智能清单', color: '#94a3b8' };
    case 'list': {
      const list = state.lists.find((l) => l.id === view.id);
      return { title: list?.name || '清单', subtitle: list?.isInbox ? '收件箱' : '清单', eyebrow: '清单', color: list?.color || '#4f76f6', emoji: list?.emoji, list };
    }
    case 'tag':
      return { title: `#${view.name}`, subtitle: '按标签汇总的任务', eyebrow: '标签', color: state.tags.find((t) => t.name === view.name)?.color || '#f59e0b' };
    case 'filter': {
      const filter = state.filters.find((f) => f.id === view.id);
      return { title: filter?.name || '过滤器', subtitle: '自定义筛选', eyebrow: '过滤器', color: filter?.color || '#4f76f6' };
    }
    default:
      return { title: '', subtitle: '', eyebrow: '', color: '#4f76f6' };
  }
}

export function todayProgress(tasks: Task[]) {
  const today = dateKey();
  const relevant = tasks.filter((t) => t.dueAt?.slice(0, 10) === today && t.status !== 'abandoned');
  const completed = relevant.filter((t) => t.status === 'completed').length;
  return { completed, total: relevant.length, ratio: relevant.length ? completed / relevant.length : 0 };
}

export function overdueOf(tasks: Task[]) {
  return tasks.filter((t) => isOverdue(t));
}

export function daysFromNow(task: Task) {
  return task.dueAt ? dayDiff(task.dueAt.slice(0, 10)) : null;
}