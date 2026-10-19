import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  CalendarCheck2,
  CalendarRange,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleDashed,
  Filter,
  Inbox,
  ListTodo,
  MoreHorizontal,
  Plus,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { AnimatePresence, motion, Reorder, useDragControls } from 'framer-motion';
import type { Task, TaskList, Tag, View } from '../types';
import { useApp } from '../store';
import { computeCounts, groupTasks, sortTasks, tasksForView, todayProgress, viewInfo } from '../lib/selectors';
import { addDays, dateKey, fullDateLabel, todayKey } from '../lib/date';
import { useIsMobile } from '../lib/useMediaQuery';
import { QuickAdd } from '../components/QuickAdd';
import { TaskRow, taskContextItems } from '../components/TaskRow';
import {
  Checkbox,
  ContextMenu,
  EmptyState,
  IconButton,
  PriorityFlag,
  ProgressRing,
  TagPill,
  cx,
} from '../components/ui';

type SortMode = 'manual' | 'priority' | 'due' | 'title';

function sortWithMode(tasks: Task[], mode: SortMode) {
  if (mode === 'manual') return sortTasks(tasks);
  if (mode === 'priority') {
    return [...tasks].sort((a, b) => b.priority - a.priority || (a.dueAt || '9999').localeCompare(b.dueAt || '9999') || a.sortOrder - b.sortOrder);
  }
  if (mode === 'due') {
    return [...tasks].sort((a, b) => (a.dueAt || '9999').localeCompare(b.dueAt || '9999') || b.priority - a.priority);
  }
  return [...tasks].sort((a, b) => a.title.localeCompare(b.title, 'zh-CN'));
}

const emptyMeta: Record<string, { icon: React.ReactNode; title: string; description: string }> = {
  today: { icon: <CalendarCheck2 size={32} />, title: '今天没有任务', description: '享受片刻空白，或者添加一件想完成的小事。' },
  next7: { icon: <CalendarRange size={32} />, title: '接下来 7 天很轻松', description: '还没有安排任务，给自己留点呼吸的空间。' },
  inbox: { icon: <Inbox size={32} />, title: '收集箱是空的', description: '想到什么，先扔进来，稍后再整理。' },
  all: { icon: <ListTodo size={32} />, title: '所有任务都完成了', description: '干净利落，今天做得很好。' },
  completed: { icon: <CheckCircle2 size={32} />, title: '还没有完成的任务', description: '完成第一件小事后，它会出现在这里。' },
  abandoned: { icon: <CircleDashed size={32} />, title: '没有已放弃的任务', description: '暂时放下的任务会收纳在这里。' },
  trash: { icon: <Trash2 size={32} />, title: '垃圾桶是空的', description: '删除的任务会先来到这里。' },
  tag: { icon: <Filter size={32} />, title: '这个标签下还没有任务', description: '在任务里输入 # 就能添加标签。' },
  filter: { icon: <Filter size={32} />, title: '没有符合条件的任务', description: '试试调整过滤条件。' },
};

function ReorderableRow({
  task,
  tags,
  onOpen,
  onToggle,
  onPatch,
  onDelete,
  onContextMenu,
  trash,
  onRestore,
  onPurge,
}: {
  task: Task;
  tags: Tag[];
  onOpen: () => void;
  onToggle: (completed: boolean) => void;
  onPatch: (patch: Partial<Task>) => void;
  onDelete: () => void;
  onContextMenu: (event: React.MouseEvent) => void;
  trash?: boolean;
  onRestore?: () => void;
  onPurge?: () => void;
}) {
  const controls = useDragControls();
  return (
    <Reorder.Item value={task.id} dragListener={false} dragControls={controls} className="task-reorder-item">
      <TaskRow
        task={task}
        tags={tags}
        onOpen={onOpen}
        onToggle={onToggle}
        onPatch={onPatch}
        onDelete={onDelete}
        onContextMenu={onContextMenu}
        trash={trash}
        onRestore={onRestore}
        onPurge={onPurge}
        dragHandle
        onDragHandlePointerDown={(event) => {
          event.preventDefault();
          controls.start(event);
        }}
      />
    </Reorder.Item>
  );
}

export function TaskView({
  view,
  onOpenTask,
  quickAddToken,
  onOpenSettings,
}: {
  view: View;
  onOpenTask: (id: string) => void;
  quickAddToken: number;
  onOpenSettings: () => void;
}) {
  const { state, patchTask, toggleTask, createTask, deleteTask, restoreTask, purgeTask, emptyTrash, reorder, saveSettings, updateList, toast } = useApp();
  const isMobile = useIsMobile();
  const [sortMode, setSortMode] = useState<SortMode>('manual');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [taskMenu, setTaskMenu] = useState<{ x: number; y: number; task: Task } | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);

  if (!state) return null;
  const info = viewInfo(state, view);
  const tasks = tasksForView(state, view);
  const groups = groupTasks(view, tasks).map((group) => ({
    ...group,
    tasks: sortWithMode(group.tasks, group.key === 'completed' ? 'manual' : sortMode),
  }));
  const openCount = tasks.filter((t) => t.status === 'open').length;
  const progress = todayProgress(state.tasks);
  const counts = computeCounts(state);
  const listForView = view.kind === 'list' ? state.lists.find((l) => l.id === view.id) : undefined;
  const isBoard = listForView?.viewMode === 'board';
  const isTrash = view.kind === 'trash';
  const canAdd = !['completed', 'trash', 'abandoned'].includes(view.kind);

  const rowProps = (task: Task) => ({
    task,
    tags: state.tags,
    onOpen: () => onOpenTask(task.id),
    onToggle: (next: boolean) => toggleTask(task.id, next),
    onPatch: (patch: Partial<Task>) => patchTask(task.id, patch),
    onDelete: () => deleteTask(task.id),
    onContextMenu: (event: React.MouseEvent) => {
      event.preventDefault();
      setTaskMenu({ x: event.clientX, y: event.clientY, task });
    },
    trash: isTrash,
    onRestore: () => restoreTask(task.id),
    onPurge: () => purgeTask(task.id),
  });

  const toggleCollapsed = (key: string, defaultValue: boolean) => {
    setCollapsed((prev) => ({ ...prev, [key]: !(prev[key] ?? defaultValue) }));
  };

  const postponeAllOverdue = async () => {
    const today = todayKey();
    const overdue = state.tasks.filter((t) => !t.deletedAt && t.status === 'open' && t.dueAt && t.dueAt.slice(0, 10) < today);
    if (!overdue.length) return;
    for (const task of overdue) {
      await patchTask(task.id, { dueAt: addDays(today, 1), allDay: true });
    }
    toast(`已顺延 ${overdue.length} 个过期任务到明天`, 'success');
  };

  const handleDropReorder = async (targetId: string, groupTasksList: Task[]) => {
    if (!dragging || dragging === targetId) {
      setDragging(null);
      setDragOver(null);
      return;
    }
    const ids = groupTasksList.map((t) => t.id);
    const from = ids.indexOf(dragging);
    const to = ids.indexOf(targetId);
    if (from < 0 || to < 0) {
      setDragging(null);
      setDragOver(null);
      return;
    }
    ids.splice(from, 1);
    ids.splice(to, 0, dragging);
    await reorder(ids.map((id, index) => ({ id, sortOrder: (index + 1) * 1000 })));
    setDragging(null);
    setDragOver(null);
  };

  const duplicateTask = async (task: Task) => {
    const copy = await createTask({
      ...task,
      id: undefined,
      title: `${task.title} 副本`,
      status: 'open',
      completedAt: null,
      stage: 'todo',
      createdAt: new Date().toISOString(),
    });
    if (copy) toast('已创建任务副本', 'success');
  };

  const empty = emptyMeta[view.kind] || {
    icon: <Sparkles size={32} />,
    title: '这里还很安静',
    description: '添加第一个任务，让今天动起来。',
  };

  return (
    <section className="task-view">
      <header className="view-head">
        <div className="view-head-left">
          {view.kind === 'list' && listForView && (
            <span className="view-emoji" style={{ background: `${listForView.color}18`, color: listForView.color }}>
              {listForView.emoji}
            </span>
          )}
          <div>
            <div className="view-eyebrow">{info.eyebrow || (view.kind === 'today' ? ' TODAY' : '')}</div>
            <h2>{info.title}</h2>
            <div className="view-sub">
              <span>{info.subtitle}</span>
              {openCount > 0 && <span className="view-count">{openCount} 个任务</span>}
            </div>
          </div>
        </div>
        <div className="view-head-right">
          {view.kind === 'today' && progress.total > 0 && (
            <div className="today-progress-head">
              <ProgressRing value={progress.ratio} size={34} stroke={3.5}>
                <span>{Math.round(progress.ratio * 100)}%</span>
              </ProgressRing>
            </div>
          )}
          {view.kind === 'trash' && counts.trash > 0 && (
            <button className="btn ghost small" onClick={emptyTrash}>
              清空垃圾桶
            </button>
          )}
          <IconButton
            label="更多"
            onClick={(event) => {
              const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
              setMenu({ x: rect.right - 190, y: rect.bottom + 6 });
            }}
          >
            <MoreHorizontal size={18} />
          </IconButton>
        </div>
      </header>

      <div className="task-scroll">
        {canAdd && (
          <QuickAdd
            focusToken={quickAddToken}
            defaultDue={view.kind === 'today' ? todayKey() : undefined}
          />
        )}

        {isBoard && canAdd && listForView ? (
          <BoardView
            list={listForView}
            tasks={tasks}
            tags={state.tags}
            onOpenTask={onOpenTask}
            onToggle={toggleTask}
            onPatch={patchTask}
            onContextMenu={(event, task) => {
              event.preventDefault();
              setTaskMenu({ x: event.clientX, y: event.clientY, task });
            }}
          />
        ) : (
          <div className="task-groups">
            {groups.length === 0 ? (
              <EmptyState {...empty} />
            ) : (
              groups.map((group) => {
                const defaultCollapsed = Boolean(group.defaultCollapsed);
                const isCollapsed = collapsed[group.key] ?? defaultCollapsed;
                if (group.key === 'completed' && !state.settings.showCompleted && view.kind !== 'completed') return null;
                return (
                  <motion.div className="task-group" key={group.key} layout>
                    {group.label && (
                      <div className={cx('group-head', group.tone === 'danger' && 'is-danger')}>
                        <button className="group-toggle" onClick={() => toggleCollapsed(group.key, defaultCollapsed)}>
                          {isCollapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
                          <span className="group-label">{group.label}</span>
                          <span className="group-count">{group.tasks.length}</span>
                        </button>
                        {group.key === 'overdue' && view.kind === 'today' && (
                          <button className="group-action" onClick={postponeAllOverdue}>
                            <ArrowRight size={13} /> 顺延到明天
                          </button>
                        )}
                      </div>
                    )}
                    <AnimatePresence initial={false}>
                      {!isCollapsed && (
                        <motion.div
                          className="task-list"
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.2 }}
                        >
                          {isMobile && sortMode === 'manual' && !isTrash ? (
                            <Reorder.Group
                              axis="y"
                              values={group.tasks.map((t) => t.id)}
                              onReorder={(ids) => {
                                reorder(ids.map((id, index) => ({ id, sortOrder: (index + 1) * 1000 })));
                              }}
                              className="task-reorder-group"
                            >
                              {group.tasks.map((task) => (
                                <ReorderableRow key={task.id} {...rowProps(task)} />
                              ))}
                            </Reorder.Group>
                          ) : (
                            group.tasks.map((task) => (
                              <TaskRow
                                key={task.id}
                                {...rowProps(task)}
                                draggable={!isTrash && sortMode === 'manual'}
                                onDragStart={() => setDragging(task.id)}
                                onDragOver={(event) => {
                                  event.preventDefault();
                                  setDragOver(task.id);
                                }}
                                onDrop={(event) => {
                                  event.preventDefault();
                                  handleDropReorder(task.id, group.tasks);
                                }}
                                isDragOver={dragOver === task.id && dragging !== task.id}
                              />
                            ))
                          )}
                          {group.key === 'today' && group.tasks.length === 0 && view.kind === 'today' && (
                            <div className="group-inline-empty">
                              <Check size={14} /> 今天的任务已经清空
                            </div>
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                );
              })
            )}
          </div>
        )}
      </div>

      <AnimatePresence>
        {menu && (
          <ContextMenu
            x={menu.x}
            y={menu.y}
            onClose={() => setMenu(null)}
            items={[
              {
                label: '显示已完成任务',
                icon: <Check size={14} />,
                checked: state.settings.showCompleted,
                onClick: () => saveSettings({ showCompleted: !state.settings.showCompleted }),
              },
              { separator: true, label: '' },
              { label: '手动排序', icon: <ListTodo size={14} />, checked: sortMode === 'manual', onClick: () => setSortMode('manual') },
              { label: '按优先级排序', icon: <PriorityFlag priority={3} />, checked: sortMode === 'priority', onClick: () => setSortMode('priority') },
              { label: '按日期排序', icon: <CalendarRange size={14} />, checked: sortMode === 'due', onClick: () => setSortMode('due') },
              { label: '按名称排序', icon: <ListTodo size={14} />, checked: sortMode === 'title', onClick: () => setSortMode('title') },
              ...(view.kind === 'today' ? [{ separator: true, label: '' }, { label: '顺延所有过期任务', icon: <ArrowRight size={14} />, onClick: postponeAllOverdue }] : []),
              ...(listForView
                ? [
                    { separator: true, label: '' },
                    {
                      label: listForView.viewMode === 'board' ? '切换为列表视图' : '切换为看板视图',
                      icon: <ListTodo size={14} />,
                      onClick: () => updateList(listForView.id, { viewMode: listForView.viewMode === 'board' ? 'list' : 'board' }),
                    },
                  ]
                : []),
            ]}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {taskMenu && (
          <ContextMenu
            x={taskMenu.x}
            y={taskMenu.y}
            onClose={() => setTaskMenu(null)}
            items={taskContextItems({
              task: taskMenu.task,
              onOpen: () => onOpenTask(taskMenu.task.id),
              onToggle: () => toggleTask(taskMenu.task.id),
              onPatch: (patch) => patchTask(taskMenu.task.id, patch),
              onDelete: () => deleteTask(taskMenu.task.id),
              onDuplicate: () => duplicateTask(taskMenu.task),
              onAbandon: () => patchTask(taskMenu.task.id, { status: 'abandoned' }),
            })}
          />
        )}
      </AnimatePresence>
    </section>
  );
}

function BoardView({
  list,
  tasks,
  tags,
  onOpenTask,
  onToggle,
  onPatch,
  onContextMenu,
}: {
  list: TaskList;
  tasks: Task[];
  tags: { name: string; color: string }[];
  onOpenTask: (id: string) => void;
  onToggle: (id: string, completed: boolean) => void;
  onPatch: (id: string, patch: Partial<Task>) => void;
  onContextMenu: (event: React.MouseEvent, task: Task) => void;
}) {
  const columns: { key: 'todo' | 'doing' | 'done'; label: string; color: string }[] = [
    { key: 'todo', label: '待办', color: '#94a3b8' },
    { key: 'doing', label: '进行中', color: '#f59e0b' },
    { key: 'done', label: '已完成', color: '#10b981' },
  ];
  const [over, setOver] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const tagColors = Object.fromEntries(tags.map((t) => [t.name, t.color]));

  const columnTasks = (key: string) => {
    const open = tasks.filter((t) => t.status === 'open');
    const done = tasks.filter((t) => t.status === 'completed');
    if (key === 'done') return sortTasks(done);
    if (key === 'doing') return sortTasks(open.filter((t) => t.stage === 'doing'));
    return sortTasks(open.filter((t) => t.stage !== 'doing' && t.stage !== 'done'));
  };

  return (
    <div className="board">
      {columns.map((column) => {
        const items = columnTasks(column.key);
        return (
          <div
            key={column.key}
            className={cx('board-column', over === column.key && 'is-over')}
            onDragOver={(event) => {
              event.preventDefault();
              setOver(column.key);
            }}
            onDragLeave={() => setOver((v) => (v === column.key ? null : v))}
            onDrop={(event) => {
              event.preventDefault();
              if (!dragging) return;
              const task = tasks.find((t) => t.id === dragging);
              if (!task) return;
              if (column.key === 'done' && task.status !== 'completed') {
                onToggle(task.id, true);
              } else if (column.key !== 'done' && task.status === 'completed') {
                onToggle(task.id, false);
                window.setTimeout(() => onPatch(task.id, { stage: column.key }), 120);
              } else if (column.key !== 'done') {
                onPatch(task.id, { stage: column.key });
              }
              setDragging(null);
              setOver(null);
            }}
          >
            <div className="board-head">
              <span className="board-dot" style={{ background: column.color }} />
              <strong>{column.label}</strong>
              <span className="board-count">{items.length}</span>
            </div>
            <div className="board-cards">
              {items.map((task) => (
                <motion.div
                  layout
                  key={task.id}
                  className={cx('board-card', task.status === 'completed' && 'is-completed')}
                  draggable
                  onDragStart={() => setDragging(task.id)}
                  onClick={() => onOpenTask(task.id)}
                  onContextMenu={(event) => onContextMenu(event, task)}
                >
                  <div className="board-card-top">
                    <Checkbox
                      checked={task.status === 'completed'}
                      size="small"
                      color={list.color}
                      onChange={(next) => onToggle(task.id, next)}
                    />
                    <span className="board-card-title">{task.title}</span>
                    {task.priority > 0 && <PriorityFlag priority={task.priority} size={13} />}
                  </div>
                  {task.notes && <p className="board-card-note">{task.notes}</p>}
                  <div className="board-card-meta">
                    {task.tags.map((tag) => (
                      <TagPill key={tag} name={tag} color={tagColors[tag]} small />
                    ))}
                    {task.dueAt && <span className="board-due">{task.dueAt.slice(5, 10).replace('-', '/')}</span>}
                  </div>
                </motion.div>
              ))}
              {items.length === 0 && <div className="board-empty">拖动任务到这里</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}