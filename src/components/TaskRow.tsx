import { useMemo, useRef, useState } from 'react';
import {
  CalendarClock,
  CheckSquare,
  Clock,
  GripVertical,
  MoreHorizontal,
  PencilLine,
  Repeat2,
  StickyNote,
  Timer,
} from 'lucide-react';
import { motion } from 'framer-motion';
import type { Tag, Task } from '../types';
import { formatDue, isOverdue, dateKey, parseDateKey, relativeTime } from '../lib/date';
import { addDays } from 'date-fns';
import { repeatLabel } from '../lib/parse';
import { useIsMobile } from '../lib/useMediaQuery';
import { PRIORITY_META, Checkbox, ContextMenuItem, PriorityFlag, TagPill, cx } from './ui';

export function TaskRow({
  task,
  tags,
  onOpen,
  onToggle,
  onPatch,
  onDelete,
  onContextMenu,
  draggable,
  onDragStart,
  onDragOver,
  onDrop,
  isDragOver,
  compact,
  trash,
  onRestore,
  onPurge,
  dragHandle,
  onDragHandlePointerDown,
}: {
  task: Task;
  tags: Tag[];
  onOpen: () => void;
  onToggle: (completed: boolean) => void;
  onPatch: (patch: Partial<Task>) => void;
  onDelete: () => void;
  onContextMenu: (event: React.MouseEvent) => void;
  draggable?: boolean;
  onDragStart?: (event: React.DragEvent) => void;
  onDragOver?: (event: React.DragEvent) => void;
  onDrop?: (event: React.DragEvent) => void;
  isDragOver?: boolean;
  compact?: boolean;
  trash?: boolean;
  onRestore?: () => void;
  onPurge?: () => void;
  dragHandle?: boolean;
  onDragHandlePointerDown?: (event: React.PointerEvent<HTMLButtonElement>) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(task.title);
  const inputRef = useRef<HTMLInputElement>(null);
  const longPressTimer = useRef<number | null>(null);
  const isMobile = useIsMobile();
  const overdue = isOverdue(task);
  const subtaskDone = task.subtasks.filter((s) => s.done).length;
  const completed = task.status === 'completed';

  const clearLongPress = () => {
    if (longPressTimer.current !== null) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const startLongPress = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isMobile || trash || event.pointerType === 'mouse') return;
    const rect = event.currentTarget.getBoundingClientRect();
    clearLongPress();
    longPressTimer.current = window.setTimeout(() => {
      longPressTimer.current = null;
      onContextMenu({
        preventDefault: () => undefined,
        clientX: Math.min(rect.right - 8, window.innerWidth - 12),
        clientY: rect.top + Math.min(44, rect.height / 2),
      } as unknown as React.MouseEvent);
    }, 520);
  };

  const postponeToTomorrow = () => {
    const base = task.dueAt ? parseDateKey(task.dueAt.slice(0, 10)) : new Date();
    const next = dateKey(addDays(base, 1));
    onPatch({
      dueAt: task.allDay || !task.dueAt ? next : `${next}T${task.dueAt.slice(11, 16)}`,
      allDay: !task.dueAt ? true : task.allDay,
    });
  };

  const haptic = () => {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try { navigator.vibrate(14); } catch { /* ignore */ }
    }
  };

  const tagColors = useMemo(() => {
    const map: Record<string, string> = {};
    for (const tag of tags) map[tag.name] = tag.color;
    return map;
  }, [tags]);

  const startEdit = () => {
    if (trash) return;
    setDraft(task.title);
    setEditing(true);
    window.setTimeout(() => inputRef.current?.select(), 0);
  };

  const commit = () => {
    const title = draft.trim();
    setEditing(false);
    if (title && title !== task.title) onPatch({ title });
    else setDraft(task.title);
  };

  return (
    <motion.div
      layout="position"
      className={cx(
        'task-row',
        completed && 'is-completed',
        overdue && 'is-overdue',
        compact && 'is-compact',
        isDragOver && 'is-drag-over',
        task.pinned && 'is-pinned',
      )}
      onClick={editing ? undefined : onOpen}
      onContextMenu={onContextMenu}
      onPointerDown={startLongPress}
      onPointerMove={clearLongPress}
      onPointerUp={clearLongPress}
      onPointerCancel={clearLongPress}
      onPointerLeave={clearLongPress}
      draggable={draggable && !editing && !isMobile}
      onDragStart={onDragStart as any}
      onDragOver={onDragOver}
      onDrop={onDrop}
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0, marginTop: 0 }}
      transition={{ duration: 0.18 }}
    >
      {dragHandle ? (
        <button
          type="button"
          className="task-drag is-handle"
          aria-label="拖动排序"
          onPointerDown={onDragHandlePointerDown}
          onClick={(event) => event.stopPropagation()}
          onContextMenu={(event) => event.stopPropagation()}
        >
          <GripVertical size={16} />
        </button>
      ) : (
        <span className="task-drag" aria-hidden="true">
          <GripVertical size={15} />
        </span>
      )}

      <div className="task-swipe-wrap">
        <motion.div
          className="task-swipe-content"
          drag={isMobile && !trash && !completed && !editing ? 'x' : false}
          dragConstraints={{ left: -96, right: 96 }}
          dragElastic={0.08}
          dragMomentum={false}
          dragDirectionLock
          dragSnapToOrigin
          onDragEnd={(_, info) => {
            if (info.offset.x < -62) { haptic(); onToggle(true); }
            if (info.offset.x > 62) { haptic(); postponeToTomorrow(); }
          }}
        >
      <div className="task-main">
        <Checkbox
          checked={completed}
          onChange={(next) => onToggle(next)}
          ariaLabel={completed ? '取消完成任务' : '完成任务'}
        />
        <div className="task-content">
          {editing ? (
            <input
              ref={inputRef}
              className="inline-title-input"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onBlur={commit}
              onClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => {
                if (event.key === 'Enter') commit();
                if (event.key === 'Escape') {
                  setDraft(task.title);
                  setEditing(false);
                }
              }}
            />
          ) : (
            <div
              className="task-title"
              onDoubleClick={(event) => {
                event.stopPropagation();
                startEdit();
              }}
            >
              {task.title}
            </div>
          )}
          <div className="task-meta">
            {task.notes && (
              <span className="task-meta-item" title={task.notes}>
                <StickyNote size={12.5} />
              </span>
            )}
            {task.subtasks.length > 0 && (
              <span className={cx('task-meta-item', subtaskDone === task.subtasks.length && 'is-done')}>
                <CheckSquare size={12.5} />
                {subtaskDone}/{task.subtasks.length}
              </span>
            )}
            {task.repeatRule && (
              <span className="task-meta-item">
                <Repeat2 size={12.5} />
                {repeatLabel(task.repeatRule)}
              </span>
            )}
            {task.estimate > 0 && (
              <span className="task-meta-item">
                <Timer size={12.5} />
                {task.estimate}
              </span>
            )}
            {task.tags.slice(0, 3).map((tag) => (
              <TagPill key={tag} name={tag} color={tagColors[tag]} small />
            ))}
            {task.tags.length > 3 && <span className="task-meta-item">+{task.tags.length - 3}</span>}
            {task.dueAt && (
              <span className={cx('task-meta-item due-chip', overdue && 'is-overdue')}>
                <Clock size={12.5} />
                {formatDue(task)}
              </span>
            )}
          </div>
        </div>

        <div className="task-trailing">
          {isMobile && task.dueAt && (
            <span className={cx('mobile-task-date', overdue && 'is-overdue')}>{formatDue(task)}</span>
          )}
          {task.priority > 0 && (
            <span className="task-priority" title={PRIORITY_META[task.priority].label}>
              <PriorityFlag priority={task.priority} />
            </span>
          )}
          {task.pinned && <span className="task-pin" title="已置顶">置顶</span>}
          {(!isMobile || trash) && (
          <div className="task-actions" onClick={(event) => event.stopPropagation()}>
            {trash ? (
              <>
                <button className="text-button small" onClick={onRestore}>恢复</button>
                <button className="text-button small danger-text" onClick={onPurge}>永久删除</button>
              </>
            ) : (
              <>
                <button className="task-action" onClick={startEdit} aria-label="重命名" title="重命名">
                  <PencilLine size={14} />
                </button>
                <button className="task-action" onClick={onContextMenu} aria-label="更多操作" title="更多操作">
                  <MoreHorizontal size={16} />
                </button>
              </>
            )}
          </div>
          )}
        </div>
      </div>
        </motion.div>
        {isMobile && !trash && !completed && <div className="task-swipe-bg" aria-hidden="true"><CheckSquare size={15} /> 完成</div>}
        {isMobile && !trash && !completed && <div className="task-swipe-bg is-tomorrow" aria-hidden="true"><CalendarClock size={15} /> 明天</div>}
      </div>
    </motion.div>
  );
}

export function taskContextItems({
  task,
  onOpen,
  onToggle,
  onPatch,
  onDelete,
  onDuplicate,
  onAbandon,
}: {
  task: Task;
  onOpen: () => void;
  onToggle: () => void;
  onPatch: (patch: Partial<Task>) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onAbandon: () => void;
}): ContextMenuItem[] {
  return [
    { label: '打开详情', icon: <PencilLine size={15} />, onClick: onOpen },
    { label: task.status === 'completed' ? '标记为未完成' : '完成任务', icon: <CheckSquare size={15} />, onClick: onToggle },
    { separator: true, label: '' },
    {
      label: '今天',
      icon: <CalendarClock size={15} />,
      onClick: () => onPatch({ dueAt: new Date().toISOString().slice(0, 10), allDay: true }),
    },
    {
      label: '明天',
      icon: <CalendarClock size={15} />,
      onClick: () => {
        const d = new Date();
        d.setDate(d.getDate() + 1);
        onPatch({ dueAt: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`, allDay: true });
      },
    },
    { separator: true, label: '' },
    { label: '高优先级', icon: <PriorityFlag priority={3} />, onClick: () => onPatch({ priority: 3 }), checked: task.priority === 3 },
    { label: '中优先级', icon: <PriorityFlag priority={2} />, onClick: () => onPatch({ priority: 2 }), checked: task.priority === 2 },
    { label: '低优先级', icon: <PriorityFlag priority={1} />, onClick: () => onPatch({ priority: 1 }), checked: task.priority === 1 },
    { label: '无优先级', icon: <PriorityFlag priority={0} />, onClick: () => onPatch({ priority: 0 }), checked: task.priority === 0 },
    { separator: true, label: '' },
    { label: '创建副本', icon: <PencilLine size={15} />, onClick: onDuplicate },
    { label: '标记为已放弃', icon: <PencilLine size={15} />, onClick: onAbandon },
    { label: '删除任务', icon: <PencilLine size={15} />, danger: true, onClick: onDelete },
  ];
}