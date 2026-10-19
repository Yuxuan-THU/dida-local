import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  CalendarDays,
  CheckSquare,
  CornerDownLeft,
  Flag,
  Hash,
  ListTodo,
  Plus,
  Search,
  Settings,
} from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { useApp } from '../store';
import type { Task, View } from '../types';
import { formatDue, isOverdue } from '../lib/date';
import { PRIORITY_META, Kbd, cx } from '../components/ui';

interface SearchResult {
  id: string;
  type: 'task' | 'tag' | 'action';
  title: string;
  subtitle?: string;
  task?: Task;
  view?: View;
  icon: React.ReactNode;
  action?: () => void;
  color?: string;
}

export function SearchPalette({
  open,
  onClose,
  onOpenTask,
  onNavigate,
  onSettings,
}: {
  open: boolean;
  onClose: () => void;
  onOpenTask: (id: string) => void;
  onNavigate: (view: View) => void;
  onSettings: () => void;
}) {
  const { state, createTask } = useApp();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActive(0);
      window.setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  const results = useMemo<SearchResult[]>(() => {
    if (!state) return [];
    const q = query.trim().toLowerCase();
    const found: SearchResult[] = [];

    if (q) {
      const tasks = state.tasks
        .filter((task) => !task.deletedAt)
        .filter((task) => `${task.title} ${task.notes} ${task.tags.join(' ')}`.toLowerCase().includes(q))
        .sort((a, b) => {
          const aTitle = a.title.toLowerCase().startsWith(q) ? 1 : 0;
          const bTitle = b.title.toLowerCase().startsWith(q) ? 1 : 0;
          if (aTitle !== bTitle) return bTitle - aTitle;
          return b.updatedAt.localeCompare(a.updatedAt);
        })
        .slice(0, 10);
      for (const task of tasks) {
        found.push({
          id: `task-${task.id}`,
          type: 'task',
          title: task.title,
          subtitle: `${task.dueAt ? formatDue(task) : '无日期'}${task.tags.length ? ` · #${task.tags.join(' #')}` : ''}`,
          task,
          icon: <CheckSquare size={16} />,
        });
      }
      const tags = state.tags.filter((tag) => tag.name.toLowerCase().includes(q)).slice(0, 3);
      for (const tag of tags) {
        found.push({
          id: `tag-${tag.id}`,
          type: 'tag',
          title: `#${tag.name}`,
          subtitle: '标签',
          icon: <Hash size={16} />,
          view: { kind: 'tag', name: tag.name },
          color: tag.color,
        });
      }
      found.push({
        id: 'create',
        type: 'action',
        title: `创建任务「${query.trim()}」`,
        subtitle: '回车创建任务',
        icon: <Plus size={16} />,
        action: async () => {
          const task = await createTask({ title: query.trim(), stage: 'todo' });
          if (task) {
            onClose();
            onOpenTask(task.id);
          }
        },
      });
    } else {
      found.push(
        { id: 'today', type: 'action', title: '今天', subtitle: '查看今天的任务', icon: <CalendarDays size={16} />, view: { kind: 'today' } },
        { id: 'next7', type: 'action', title: '最近 7 天', subtitle: '接下来一周的安排', icon: <ListTodo size={16} />, view: { kind: 'next7' } },
        { id: 'settings', type: 'action', title: '设置', subtitle: '主题、数据与导入', icon: <Settings size={16} />, action: () => { onClose(); onSettings(); } },
      );
    }
    return found;
  }, [query, state, createTask, onClose, onOpenTask, onSettings]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  useEffect(() => {
    const element = listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`);
    element?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const choose = (result: SearchResult | undefined) => {
    if (!result) return;
    if (result.task) {
      onClose();
      onOpenTask(result.task.id);
    } else if (result.view) {
      onClose();
      onNavigate(result.view);
    } else if (result.action) {
      result.action();
    }
  };

  const highlighted = (text: string) => {
    const q = query.trim();
    if (!q) return text;
    const index = text.toLowerCase().indexOf(q.toLowerCase());
    if (index < 0) return text;
    return (
      <>
        {text.slice(0, index)}
        <mark>{text.slice(index, index + q.length)}</mark>
        {text.slice(index + q.length)}
      </>
    );
  };

  const groups = ['task', 'tag', 'action'] as const;
  const groupLabels: Record<string, string> = { task: '任务', tag: '标签', action: '操作' };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="search-layer"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.14 }}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) onClose();
          }}
        >
          <motion.div
            className="search-panel"
            initial={{ opacity: 0, y: -14, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.985 }}
            transition={{ type: 'spring', stiffness: 420, damping: 32 }}
            role="dialog"
            aria-label="搜索"
          >
            <div className="search-input-row">
              <Search size={20} />
              <input
                ref={inputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索任务、标签，或输入新任务…"
                onKeyDown={(event) => {
                  if (event.key === 'Escape') onClose();
                  if (event.key === 'ArrowDown') {
                    event.preventDefault();
                    setActive((value) => Math.min(results.length - 1, value + 1));
                  }
                  if (event.key === 'ArrowUp') {
                    event.preventDefault();
                    setActive((value) => Math.max(0, value - 1));
                  }
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    choose(results[active]);
                  }
                }}
              />
              {query ? (
                <button className="search-clear" onClick={() => setQuery('')}>清除</button>
              ) : (
                <Kbd>ESC</Kbd>
              )}
            </div>

            <div className="search-results" ref={listRef}>
              {results.length === 0 && (
                <div className="search-empty">
                  <Search size={26} />
                  <p>没有找到「{query}」</p>
                  <span>试试任务标题或标签。</span>
                </div>
              )}
              {groups.map((group) => {
                const items = results.filter((result) => result.type === group);
                if (!items.length) return null;
                return (
                  <div className="search-group" key={group}>
                    <div className="search-group-label">{groupLabels[group]}</div>
                    {items.map((result) => {
                      const index = results.indexOf(result);
                      const priority = result.task?.priority ?? 0;
                      return (
                        <button
                          key={result.id}
                          data-index={index}
                          className={cx('search-row', active === index && 'is-active')}
                          onMouseEnter={() => setActive(index)}
                          onClick={() => choose(result)}
                        >
                          <span className="search-row-icon" style={result.color ? { color: result.color, background: `${result.color}14` } : undefined}>
                            {result.icon}
                          </span>
                          <span className="search-row-copy">
                            <span className="search-row-title">{highlighted(result.title)}</span>
                            {result.subtitle && <span className="search-row-sub">{result.subtitle}</span>}
                          </span>
                          {priority > 0 && (
                            <span className="search-priority" style={{ color: PRIORITY_META[priority].color }}>
                              <Flag size={12} fill={PRIORITY_META[priority].color} />
                            </span>
                          )}
                          {active === index && <CornerDownLeft size={14} className="search-enter" />}
                          {result.type === 'action' && !result.action && <ArrowRight size={14} className="search-enter" />}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>

            <div className="search-footer">
              <span><Kbd>↑</Kbd><Kbd>↓</Kbd> 选择</span>
              <span><Kbd>↵</Kbd> 打开</span>
              <span><Kbd>ESC</Kbd> 关闭</span>
              <span className="search-footer-brand">滴答 · 本地搜索</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}