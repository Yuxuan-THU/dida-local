import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bell,
  CalendarDays,
  Check,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  Flag,
  ListChecks,
  MoreHorizontal,
  Pin,
  Plus,
  Repeat2,
  Sparkles,
  Tag as TagIcon,
  Timer,
  Trash2,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import type { RepeatRule, Task } from '../types';
import { useApp } from '../store';
import { formatDue, relativeTime } from '../lib/date';
import { repeatLabel } from '../lib/parse';
import { Checkbox, ContextMenu, IconButton, Popover, PRIORITY_META, TagPill, cx } from '../components/ui';
import { DatePickerPanel, ListMenu, PriorityMenu, ReminderMenu, RepeatMenu } from '../components/pickers';

function FieldRow({
  icon,
  label,
  value,
  children,
  tone,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  value?: React.ReactNode;
  children?: React.ReactNode;
  tone?: string;
  onClick?: () => void;
}) {
  return (
    <div className="field-row">
      <span className="field-icon" style={tone ? { color: tone } : undefined}>{icon}</span>
      <span className="field-key">{label}</span>
      {children || (
        <button className="field-value" onClick={onClick}>
          {value}
        </button>
      )}
    </div>
  );
}

function TagPicker({ task, onDone }: { task: Task; onDone: () => void }) {
  const { state, createTag, patchTask } = useApp();
  const [name, setName] = useState('');
  if (!state) return null;

  const toggle = async (tagName: string) => {
    const next = task.tags.includes(tagName) ? task.tags.filter((t) => t !== tagName) : [...task.tags, tagName];
    await patchTask(task.id, { tags: next });
  };

  const add = async () => {
    const value = name.trim().replace(/^#/, '');
    if (!value) return;
    if (!state.tags.some((t) => t.name === value)) await createTag(value);
    if (!task.tags.includes(value)) await patchTask(task.id, { tags: [...task.tags, value] });
    setName('');
  };

  return (
    <div className="tag-picker">
      <div className="tag-picker-add">
        <Plus size={14} />
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="新建或搜索标签"
          onKeyDown={(event) => {
            if (event.key === 'Enter') add();
          }}
          autoFocus
        />
      </div>
      <div className="tag-picker-list">
        {state.tags.map((tag) => {
          const active = task.tags.includes(tag.name);
          return (
            <button key={tag.id} className={cx('tag-option', active && 'is-active')} onClick={() => toggle(tag.name)}>
              <span className="tag-dot" style={{ background: tag.color }} />
              <span>{tag.name}</span>
              {active && <Check size={14} />}
            </button>
          );
        })}
        {!state.tags.length && <p className="muted small-copy">还没有标签，输入名称新建一个。</p>}
      </div>
      <button className="btn ghost small full" onClick={onDone}>完成</button>
    </div>
  );
}

export function DetailPane({ taskId, onClose }: { taskId: string; onClose: () => void }) {
  const { state, patchTask, toggleTask, deleteTask, createTask, toast } = useApp();
  const task = state?.tasks.find((t) => t.id === taskId);
  const [title, setTitle] = useState(task?.title || '');
  const [notes, setNotes] = useState(task?.notes || '');
  const [addingSubtask, setAddingSubtask] = useState(false);
  const [subtaskDraft, setSubtaskDraft] = useState('');
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const notesTimer = useRef<number | null>(null);

  useEffect(() => {
    setTitle(task?.title || '');
    setNotes(task?.notes || '');
    setAddingSubtask(false);
    setSubtaskDraft('');
  }, [taskId]);

  useEffect(() => {
    if (!task) return;
    if (task.title !== title && title.trim() && document.activeElement !== titleRef.current) setTitle(task.title);
  }, [task?.title]);

  useEffect(() => {
    if (!titleRef.current) return;
    titleRef.current.style.height = 'auto';
    titleRef.current.style.height = `${Math.max(34, titleRef.current.scrollHeight)}px`;
  }, [title]);

  useEffect(() => {
    return () => {
      if (notesTimer.current) window.clearTimeout(notesTimer.current);
    };
  }, []);

  if (!state || !task) {
    return (
      <aside className="detail-pane">
        <div className="detail-missing">
          <p>任务不存在或已被删除</p>
          <button className="btn ghost" onClick={onClose}>关闭</button>
        </div>
      </aside>
    );
  }

  const list = state.lists.find((l) => l.id === task.listId);
  const completed = task.status === 'completed';
  const abandoned = task.status === 'abandoned';
  const subtaskDone = task.subtasks.filter((s) => s.done).length;
  const tagColor = (name: string) => state.tags.find((t) => t.name === name)?.color;

  const saveTitle = async () => {
    const value = title.trim();
    if (!value) {
      setTitle(task.title);
      return;
    }
    if (value !== task.title) await patchTask(task.id, { title: value });
  };

  const changeNotes = (value: string) => {
    setNotes(value);
    if (notesTimer.current) window.clearTimeout(notesTimer.current);
    notesTimer.current = window.setTimeout(() => {
      if (value !== task.notes) patchTask(task.id, { notes: value });
    }, 600);
  };

  const addSubtask = async () => {
    const value = subtaskDraft.trim();
    if (!value) {
      setAddingSubtask(false);
      return;
    }
    const next = [...task.subtasks, { id: `sub_${Date.now()}`, title: value, done: false }];
    await patchTask(task.id, { subtasks: next });
    setSubtaskDraft('');
    setAddingSubtask(true);
  };

  const updateSubtask = async (id: string, done: boolean) => {
    await patchTask(task.id, { subtasks: task.subtasks.map((s) => (s.id === id ? { ...s, done } : s)) });
  };

  const removeSubtask = async (id: string) => {
    await patchTask(task.id, { subtasks: task.subtasks.filter((s) => s.id !== id) });
  };

  const duplicate = async () => {
    const copy = await createTask({
      ...task,
      id: undefined,
      title: `${task.title} 副本`,
      status: 'open',
      completedAt: null,
      stage: 'todo',
      createdAt: new Date().toISOString(),
    });
    if (copy) {
      toast('已创建任务副本', 'success');
      onClose();
    }
  };

  return (
    <motion.aside
      className="detail-pane"
      initial={{ opacity: 0, x: 26 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 26 }}
      transition={{ type: 'spring', stiffness: 360, damping: 32 }}
    >
      <div className="detail-head">
        <div className="detail-head-left">
          <IconButton className="detail-back" label="返回" onClick={onClose}>
            <ChevronLeft size={19} />
          </IconButton>
          <Checkbox
            checked={completed}
            color={list?.color}
            onChange={(next) => toggleTask(task.id, next)}
            ariaLabel={completed ? '取消完成' : '完成任务'}
          />
          <span className={cx('detail-status', completed && 'is-completed', abandoned && 'is-abandoned')}>
            {completed ? '已完成' : abandoned ? '已放弃' : '进行中'}
          </span>
          {task.repeatRule && <span className="detail-repeat"><Repeat2 size={12} /> {repeatLabel(task.repeatRule)}</span>}
        </div>
        <div className="detail-head-actions">
          <IconButton label={task.pinned ? '取消置顶' : '置顶'} onClick={() => patchTask(task.id, { pinned: !task.pinned })} active={task.pinned}>
            <Pin size={16} />
          </IconButton>
          <IconButton
            label="更多"
            onClick={(event) => {
              const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
              setMenu({ x: rect.right - 210, y: rect.bottom + 6 });
            }}
          >
            <MoreHorizontal size={17} />
          </IconButton>
          <IconButton className="detail-close" label="关闭详情" onClick={onClose}>
            <X size={17} />
          </IconButton>
        </div>
      </div>

      <div className="detail-scroll">
        <div className="detail-title-wrap">
          <span className="detail-list-emoji" style={{ background: `${list?.color || '#4f76f6'}16` }}>{list?.emoji || '📋'}</span>
          <textarea
            ref={titleRef}
            className={cx('detail-title', completed && 'is-completed')}
            value={title}
            rows={1}
            onChange={(event) => setTitle(event.target.value)}
            onBlur={saveTitle}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                (event.currentTarget as HTMLTextAreaElement).blur();
              }
            }}
            aria-label="任务标题"
          />
        </div>

        <div className="detail-notes-wrap">
          <textarea
            className="detail-notes"
            value={notes}
            placeholder="添加描述…（支持多行文本）"
            onChange={(event) => changeNotes(event.target.value)}
            onBlur={() => {
              if (notes !== task.notes) patchTask(task.id, { notes });
            }}
            rows={3}
          />
        </div>

        <div className="detail-section">
          <div className="detail-section-head">
            <span><CheckSquare size={14} /> 子任务</span>
            {task.subtasks.length > 0 && <span className="muted">{subtaskDone}/{task.subtasks.length}</span>}
          </div>
          {task.subtasks.length > 0 && (
            <div className="subtask-progress"><span style={{ width: `${(subtaskDone / task.subtasks.length) * 100}%` }} /></div>
          )}
          <div className="subtasks">
            {task.subtasks.map((sub) => (
              <div className={cx('subtask-row', sub.done && 'is-done')} key={sub.id}>
                <Checkbox checked={sub.done} size="small" onChange={(next) => updateSubtask(sub.id, next)} ariaLabel="完成子任务" />
                <span>{sub.title}</span>
                <button className="subtask-delete" onClick={() => removeSubtask(sub.id)} aria-label="删除子任务">
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
          {addingSubtask ? (
            <div className="subtask-add-row">
              <Plus size={14} />
              <input
                value={subtaskDraft}
                onChange={(event) => setSubtaskDraft(event.target.value)}
                placeholder="子任务标题，回车添加"
                autoFocus
                onKeyDown={(event) => {
                  if (event.key === 'Enter') addSubtask();
                  if (event.key === 'Escape') {
                    setAddingSubtask(false);
                    setSubtaskDraft('');
                  }
                }}
                onBlur={() => {
                  if (!subtaskDraft.trim()) setAddingSubtask(false);
                }}
              />
            </div>
          ) : (
            <button className="add-subtask" onClick={() => setAddingSubtask(true)}>
              <Plus size={14} /> 添加子任务
            </button>
          )}
        </div>

        <div className="detail-fields">
          <Popover
            width={330}
            align="start"
            trigger={() => (
              <button className={cx('detail-field', task.dueAt && 'has-value')}>
                <CalendarDays size={16} />
                <span className="detail-field-label">日期</span>
                <span className={cx('detail-field-value', task.dueAt && 'is-strong')}>
                  {task.dueAt ? formatDue(task, true) : '设置日期'}
                </span>
                <ChevronRight size={14} />
              </button>
            )}
          >
            {(close) => (
              <DatePickerPanel
                dueAt={task.dueAt}
                allDay={task.allDay}
                weekStart={state.settings.weekStart}
                onChange={(dueAt, allDay) => patchTask(task.id, { dueAt, allDay })}
                onClose={close}
              />
            )}
          </Popover>

          <Popover
            width={220}
            trigger={() => (
              <button className={cx('detail-field', task.priority > 0 && 'has-value')}>
                <Flag size={16} color={task.priority ? PRIORITY_META[task.priority].color : undefined} fill={task.priority ? PRIORITY_META[task.priority].color : 'none'} />
                <span className="detail-field-label">优先级</span>
                <span className="detail-field-value" style={task.priority ? { color: PRIORITY_META[task.priority].color } : undefined}>
                  {PRIORITY_META[task.priority].label}
                </span>
                <ChevronRight size={14} />
              </button>
            )}
          >
            {(close) => (
              <PriorityMenu
                value={task.priority}
                onChange={(priority) => {
                  patchTask(task.id, { priority });
                  close();
                }}
              />
            )}
          </Popover>

          <Popover
            width={210}
            trigger={() => (
              <button className="detail-field has-value">
                <ListChecks size={16} />
                <span className="detail-field-label">清单</span>
                <span className="detail-field-value is-strong">{list?.emoji} {list?.name}</span>
                <ChevronRight size={14} />
              </button>
            )}
          >
            {(close) => (
              <ListMenu
                lists={state.lists}
                value={task.listId}
                onChange={(listId) => {
                  patchTask(task.id, { listId });
                  close();
                }}
              />
            )}
          </Popover>

          <Popover
            width={250}
            trigger={() => (
              <button className="detail-field">
                <TagIcon size={16} />
                <span className="detail-field-label">标签</span>
                <span className="detail-field-value">
                  {task.tags.length ? (
                    <span className="detail-tags">
                      {task.tags.map((tag) => (
                        <TagPill key={tag} name={tag} color={tagColor(tag)} small />
                      ))}
                    </span>
                  ) : (
                    '添加标签'
                  )}
                </span>
                <ChevronRight size={14} />
              </button>
            )}
          >
            {(close) => <TagPicker task={task} onDone={close} />}
          </Popover>

          <Popover
            width={220}
            trigger={() => (
              <button className="detail-field">
                <Bell size={16} />
                <span className="detail-field-label">提醒</span>
                <span className={cx('detail-field-value', task.reminders.length > 0 && 'is-strong')}>
                  {task.reminders.length
                    ? task.reminders
                        .map((m) => (m === 0 ? '准时' : m < 60 ? `提前 ${m} 分钟` : m === 60 ? '提前 1 小时' : '提前 1 天'))
                        .join('、')
                    : '无提醒'}
                </span>
                <ChevronRight size={14} />
              </button>
            )}
          >
            {(close) => (
              <ReminderMenu
                value={task.reminders}
                onChange={(reminders) => {
                  patchTask(task.id, { reminders });
                  close();
                }}
              />
            )}
          </Popover>

          <Popover
            width={220}
            trigger={() => (
              <button className="detail-field">
                <Repeat2 size={16} />
                <span className="detail-field-label">重复</span>
                <span className={cx('detail-field-value', task.repeatRule && 'is-strong')}>
                  {task.repeatRule ? repeatLabel(task.repeatRule) : '不重复'}
                </span>
                <ChevronRight size={14} />
              </button>
            )}
          >
            {(close) => (
              <RepeatMenu
                value={task.repeatRule}
                onChange={(rule: RepeatRule | null) => {
                  patchTask(task.id, { repeatRule: rule });
                  close();
                }}
              />
            )}
          </Popover>

          <div className="detail-field">
            <Timer size={16} />
            <span className="detail-field-label">番茄钟</span>
            <span className="detail-field-value">预计 {task.estimate || 0} 个</span>
            <div className="stepper">
              <button onClick={() => patchTask(task.id, { estimate: Math.max(0, task.estimate - 1) })} disabled={task.estimate <= 0}>−</button>
              <span>{task.estimate || 0}</span>
              <button onClick={() => patchTask(task.id, { estimate: Math.min(12, task.estimate + 1) })} disabled={task.estimate >= 12}>+</button>
            </div>
          </div>
        </div>

        <div className="detail-footer">
          <div className="detail-timestamps">
            <span>创建于 {relativeTime(task.createdAt)}</span>
            {task.completedAt && <span>完成于 {relativeTime(task.completedAt)}</span>}
          </div>
          {abandoned ? (
            <button className="text-button" onClick={() => patchTask(task.id, { status: 'open' })}>
              重新开始
            </button>
          ) : (
            <button className="text-button danger-text" onClick={() => { deleteTask(task.id); onClose(); }}>
              <Trash2 size={14} /> 删除任务
            </button>
          )}
        </div>
      </div>

      <AnimatePresence>
        {menu && (
          <ContextMenu
            x={menu.x}
            y={menu.y}
            onClose={() => setMenu(null)}
            items={[
              { label: task.pinned ? '取消置顶' : '置顶任务', icon: <Pin size={15} />, onClick: () => patchTask(task.id, { pinned: !task.pinned }) },
              { label: '创建副本', icon: <CircleDot size={15} />, onClick: duplicate },
              completed
                ? { label: '标记为未完成', icon: <CircleDot size={15} />, onClick: () => toggleTask(task.id, false) }
                : { label: '标记为已完成', icon: <Check size={15} />, onClick: () => toggleTask(task.id, true) },
              { separator: true, label: '' },
              { label: '标记为已放弃', icon: <CircleDot size={15} />, onClick: () => patchTask(task.id, { status: 'abandoned' }) },
              { label: '删除任务', icon: <Trash2 size={15} />, danger: true, onClick: () => { deleteTask(task.id); onClose(); } },
            ]}
          />
        )}
      </AnimatePresence>
    </motion.aside>
  );
}