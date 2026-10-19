import { useMemo, useState } from 'react';
import {
  CalendarDays,
  CalendarRange,
  ChevronDown,
  ChevronRight,
  Filter,
  Inbox,
  ListTodo,
  MoreHorizontal,
  Plus,
  Sparkles,
  Tag as TagIcon,
  Trash2,
  Archive,
  CheckCircle2,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { useApp } from '../store';
import type { TaskList, View } from '../types';
import { computeCounts } from '../lib/selectors';
import { todayKey } from '../lib/date';
import { IconButton, Modal, ProgressRing, PRIORITY_META, ContextMenu, cx } from './ui';

const EMOJIS = ['📋', '💼', '🏠', '🏃', '📚', '💡', '🎯', '🌱', '🎨', '🎵', '✈️', '🍀', '❤️', '🧠', '🛒', '💰'];
const COLORS = ['#4f76f6', '#f59e0b', '#10b981', '#ec4899', '#8b5cf6', '#06b6d4', '#ef4444', '#84cc16'];

function NavItem({
  icon,
  label,
  count,
  active,
  onClick,
  onContextMenu,
  activeId = 'sidebar-active',
  dotColor,
}: {
  icon: React.ReactNode;
  label: string;
  count?: number;
  active?: boolean;
  onClick: () => void;
  onContextMenu?: (event: React.MouseEvent) => void;
  activeId?: string;
  dotColor?: string;
}) {
  return (
    <button
      className={cx('sidebar-item', active && 'is-active')}
      onClick={onClick}
      onContextMenu={onContextMenu}
      aria-current={active ? 'page' : undefined}
    >
      {active && (
        <motion.span
          className="sidebar-active-bg"
          layoutId={activeId}
          transition={{ type: 'spring', stiffness: 480, damping: 36 }}
        />
      )}
      <span className={cx('sidebar-icon', dotColor && 'has-dot')} style={dotColor ? { color: dotColor } : undefined}>
        {dotColor ? <span className="sidebar-color-dot" style={{ background: dotColor }} /> : icon}
      </span>
      <span className="sidebar-label">{label}</span>
      {typeof count === 'number' && count > 0 && <span className="sidebar-count">{count}</span>}
    </button>
  );
}

export function Sidebar({
  view,
  onNavigate,
  onOpenSettings,
  mobile = false,
}: {
  view: View;
  onNavigate: (view: View) => void;
  onOpenSettings: () => void;
  mobile?: boolean;
}) {
  const { state, createList, updateList, deleteList, createFilter, deleteFilter, toast } = useApp();
  const [listsOpen, setListsOpen] = useState(true);
  const [tagsOpen, setTagsOpen] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [filterMenu, setFilterMenu] = useState<{ x: number; y: number; id: string; name: string } | null>(null);
  const [filterEditor, setFilterEditor] = useState(false);
  const [filterName, setFilterName] = useState('');
  const [filterPriority, setFilterPriority] = useState<number[]>([]);
  const [filterTag, setFilterTag] = useState('');
  const [filterDue, setFilterDue] = useState('');
  const [filterStatus, setFilterStatus] = useState<'open' | 'completed'>('open');
  const [editor, setEditor] = useState<{ mode: 'create' | 'edit'; list?: TaskList } | null>(null);
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('📋');
  const [color, setColor] = useState(COLORS[0]);
  const [viewMode, setViewMode] = useState<'list' | 'board'>('list');
  const [deleteTarget, setDeleteTarget] = useState<TaskList | null>(null);

  const counts = useMemo(() => (state ? computeCounts(state) : null), [state]);
  if (!state || !counts) return <aside className="sidebar" />;

  const today = todayKey();
  const todayTasks = state.tasks.filter((t) => !t.deletedAt && t.dueAt?.slice(0, 10) === today);
  const doneToday = todayTasks.filter((t) => t.status === 'completed').length;
  const ratio = todayTasks.length ? doneToday / todayTasks.length : 0;
  const lists = state.lists.filter((l) => !l.isInbox);
  const inbox = state.lists.find((l) => l.isInbox);

  const openEditor = (mode: 'create' | 'edit', list?: TaskList) => {
    setEditor({ mode, list });
    setName(list?.name || '');
    setEmoji(list?.emoji || '📋');
    setColor(list?.color || COLORS[0]);
    setViewMode(list?.viewMode || 'list');
  };

  const saveList = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast('请输入清单名称', 'error');
      return;
    }
    if (editor?.mode === 'edit' && editor.list) {
      await updateList(editor.list.id, { name: trimmed, emoji, color, viewMode });
      setEditor(null);
    } else {
      const list = await createList({ name: trimmed, emoji, color, viewMode });
      setEditor(null);
      if (list) onNavigate({ kind: 'list', id: list.id });
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    await deleteList(deleteTarget.id);
    if (view.kind === 'list' && view.id === deleteTarget.id) onNavigate({ kind: 'inbox' });
    setDeleteTarget(null);
  };

  return (
    <aside className={cx('sidebar', mobile && 'is-mobile')}>
      {mobile && (
        <button className="sidebar-profile" onClick={onOpenSettings}>
          <span className="sidebar-avatar">{(state.settings.userName || '我').slice(0, 1)}</span>
          <div>
            <strong>{state.settings.userName || '我'}</strong>
            <small>本地账户 · 与电脑同步</small>
          </div>
        </button>
      )}
      <div className="sidebar-head">
        <div>
          <h1>我的清单</h1>
          <span className="local-badge"><span className="local-dot" /> 本地优先</span>
        </div>
        <IconButton label="设置" onClick={onOpenSettings}>
          <Sparkles size={17} />
        </IconButton>
      </div>

      <div className="sidebar-scroll">
        <nav className="sidebar-nav">
          <NavItem
            icon={<CalendarDays size={18} />}
            label="今天"
            count={counts.today}
            active={view.kind === 'today'}
            onClick={() => onNavigate({ kind: 'today' })}
          />
          <NavItem
            icon={<CalendarRange size={18} />}
            label="最近 7 天"
            count={counts.next7}
            active={view.kind === 'next7'}
            onClick={() => onNavigate({ kind: 'next7' })}
          />
          <NavItem
            icon={<Inbox size={18} />}
            label="收集箱"
            count={counts.inbox}
            active={view.kind === 'inbox'}
            onClick={() => onNavigate({ kind: 'inbox' })}
          />
          <NavItem
            icon={<ListTodo size={18} />}
            label="全部任务"
            active={view.kind === 'all'}
            onClick={() => onNavigate({ kind: 'all' })}
          />
        </nav>

        <div className="sidebar-section">
          <div className="section-head">
            <button className="section-toggle" onClick={() => setListsOpen((v) => !v)}>
              {listsOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              <span>清单</span>
            </button>
            <button className="section-add" onClick={() => openEditor('create')} aria-label="新建清单" title="新建清单">
              <Plus size={15} />
            </button>
          </div>
          {listsOpen && (
            <div className="section-body">
              {lists.map((list) => (
                <div className="sidebar-item-wrap" key={list.id}>
                  <NavItem
                    icon={<span className="list-emoji">{list.emoji}</span>}
                    label={list.name}
                    count={counts.lists[list.id] || 0}
                    active={view.kind === 'list' && view.id === list.id}
                    onClick={() => onNavigate({ kind: 'list', id: list.id })}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      openEditor('edit', list);
                    }}
                  />
                  <button
                    className="sidebar-more"
                    onClick={(event) => {
                      event.stopPropagation();
                      openEditor('edit', list);
                    }}
                    aria-label="编辑清单"
                  >
                    <MoreHorizontal size={15} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="sidebar-section">
          <div className="section-head">
            <button className="section-toggle" onClick={() => setTagsOpen((v) => !v)}>
              {tagsOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              <span>标签</span>
            </button>
            <span className="section-count">{state.tags.length}</span>
          </div>
          {tagsOpen &&
            (state.tags.length ? (
              <div className="section-body">
                {state.tags.map((tag) => (
                  <NavItem
                    key={tag.id}
                    icon={<TagIcon size={18} />}
                    dotColor={tag.color}
                    label={tag.name}
                    count={counts.tags[tag.name] || 0}
                    active={view.kind === 'tag' && view.name === tag.name}
                    onClick={() => onNavigate({ kind: 'tag', name: tag.name })}
                  />
                ))}
              </div>
            ) : (
              <p className="sidebar-hint">在任务里输入 # 添加标签</p>
            ))}
        </div>

        <div className="sidebar-section">
          <div className="section-head">
            <button className="section-toggle" onClick={() => setFiltersOpen((v) => !v)}>
              {filtersOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              <span>过滤器</span>
            </button>
            <button className="section-add" onClick={() => setFilterEditor(true)} aria-label="新建过滤器" title="新建过滤器">
              <Plus size={15} />
            </button>
          </div>
          {filtersOpen && (
            <div className="section-body">
              {state.filters.length ? (
                state.filters.map((filter) => (
                  <div className="sidebar-item-wrap" key={filter.id}>
                    <NavItem
                      icon={<Filter size={18} />}
                      label={filter.name}
                      active={view.kind === 'filter' && view.id === filter.id}
                      onClick={() => onNavigate({ kind: 'filter', id: filter.id })}
                      onContextMenu={(event) => {
                        event.preventDefault();
                        setFilterMenu({ x: event.clientX, y: event.clientY, id: filter.id, name: filter.name });
                      }}
                    />
                    <button
                      className="sidebar-more"
                      onClick={(event) => {
                        const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
                        setFilterMenu({ x: rect.right - 190, y: rect.bottom + 4, id: filter.id, name: filter.name });
                      }}
                      aria-label="过滤器操作"
                    >
                      <MoreHorizontal size={15} />
                    </button>
                  </div>
                ))
              ) : (
                <p className="sidebar-hint">按优先级、标签或日期组合出专属视图。</p>
              )}
            </div>
          )}
        </div>

        <div className="sidebar-section sidebar-archive">
          <NavItem
            icon={<CheckCircle2 size={18} />}
            label="已完成"
            count={counts.completed}
            active={view.kind === 'completed'}
            onClick={() => onNavigate({ kind: 'completed' })}
          />
          <NavItem
            icon={<Archive size={18} />}
            label="已放弃"
            count={counts.abandoned}
            active={view.kind === 'abandoned'}
            onClick={() => onNavigate({ kind: 'abandoned' })}
          />
          <NavItem
            icon={<Trash2 size={18} />}
            label="垃圾桶"
            count={counts.trash}
            active={view.kind === 'trash'}
            onClick={() => onNavigate({ kind: 'trash' })}
          />
        </div>
      </div>

      <div className="sidebar-footer">
        <button className="today-progress-card" onClick={() => onNavigate({ kind: 'today' })}>
          <ProgressRing value={ratio} size={42} stroke={4}>
            <span>{Math.round(ratio * 100)}%</span>
          </ProgressRing>
          <span className="today-progress-copy">
            <strong>今日进度</strong>
            <span>{doneToday} / {todayTasks.length} 个任务</span>
          </span>
        </button>
      </div>

      <Modal
        open={Boolean(editor)}
        onClose={() => setEditor(null)}
        title={editor?.mode === 'edit' ? '编辑清单' : '新建清单'}
        width={470}
        footer={
          <>
            <button className="btn ghost" onClick={() => setEditor(null)}>取消</button>
            <button className="btn primary" onClick={saveList}>{editor?.mode === 'edit' ? '保存' : '创建清单'}</button>
          </>
        }
      >
        <div className="form-stack">
          <label className="field-label">
            名称
            <input
              className="text-input"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="例如：工作、旅行计划"
              autoFocus
              onKeyDown={(event) => {
                if (event.key === 'Enter') saveList();
              }}
            />
          </label>
          <div className="field-label">
            图标
            <div className="emoji-grid">
              {EMOJIS.map((item) => (
                <button
                  key={item}
                  className={cx('emoji-choice', emoji === item && 'is-active')}
                  onClick={() => setEmoji(item)}
                  type="button"
                >
                  {item}
                </button>
              ))}
            </div>
          </div>
          <div className="field-label">
            颜色
            <div className="color-row">
              {COLORS.map((item) => (
                <button
                  key={item}
                  type="button"
                  className={cx('color-choice', color === item && 'is-active')}
                  style={{ background: item }}
                  onClick={() => setColor(item)}
                  aria-label={item}
                />
              ))}
            </div>
          </div>
          <div className="field-label">
            默认视图
            <div className="segmented">
              <button className={cx('segment', viewMode === 'list' && 'is-active')} onClick={() => setViewMode('list')}>
                列表
              </button>
              <button className={cx('segment', viewMode === 'board' && 'is-active')} onClick={() => setViewMode('board')}>
                看板
              </button>
            </div>
          </div>
          {editor?.mode === 'edit' && editor.list && (
            <button
              className="danger-link"
              type="button"
              onClick={() => {
                setDeleteTarget(editor.list!);
                setEditor(null);
              }}
            >
              <Trash2 size={14} /> 删除这个清单
            </button>
          )}
        </div>
      </Modal>

      <Modal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="删除清单"
        width={420}
        footer={
          <>
            <button className="btn ghost" onClick={() => setDeleteTarget(null)}>取消</button>
            <button className="btn danger" onClick={confirmDelete}>删除</button>
          </>
        }
      >
        <p className="modal-copy">
          确定删除「{deleteTarget?.name}」吗？清单里的任务会移到收集箱，不会被删除。
        </p>
      </Modal>

      <Modal
        open={filterEditor}
        onClose={() => setFilterEditor(false)}
        title="新建过滤器"
        width={480}
        footer={
          <>
            <button className="btn ghost" onClick={() => setFilterEditor(false)}>取消</button>
            <button
              className="btn primary"
              onClick={async () => {
                if (!filterName.trim()) {
                  toast('给过滤器起个名字', 'error');
                  return;
                }
                await createFilter({
                  name: filterName.trim(),
                  query: {
                    ...(filterPriority.length ? { priority: filterPriority } : {}),
                    ...(filterTag ? { tag: filterTag } : {}),
                    ...(filterDue ? { due: filterDue } : {}),
                    status: filterStatus,
                  },
                });
                setFilterName('');
                setFilterPriority([]);
                setFilterTag('');
                setFilterDue('');
                setFilterStatus('open');
                setFilterEditor(false);
              }}
            >
              创建过滤器
            </button>
          </>
        }
      >
        <div className="form-stack">
          <label className="field-label">
            名称
            <input className="text-input" value={filterName} onChange={(event) => setFilterName(event.target.value)} placeholder="例如：本周重要工作" autoFocus />
          </label>
          <div className="field-label">
            优先级（可多选）
            <div className="filter-priority-row">
              {[3, 2, 1, 0].map((value) => (
                <button
                  key={value}
                  type="button"
                  className={cx('priority-chip', filterPriority.includes(value) && 'is-active')}
                  style={{ '--priority-color': PRIORITY_META[value].color } as React.CSSProperties}
                  onClick={() => setFilterPriority((current) => current.includes(value) ? current.filter((v) => v !== value) : [...current, value])}
                >
                  {PRIORITY_META[value].label}
                </button>
              ))}
            </div>
          </div>
          <div className="form-row">
            <label className="field-label">
              标签
              <select className="text-input" value={filterTag} onChange={(event) => setFilterTag(event.target.value)}>
                <option value="">任意标签</option>
                {state.tags.map((tag) => <option value={tag.name} key={tag.id}>{tag.name}</option>)}
              </select>
            </label>
            <label className="field-label">
              日期
              <select className="text-input" value={filterDue} onChange={(event) => setFilterDue(event.target.value)}>
                <option value="">任意日期</option>
                <option value="today">今天</option>
                <option value="week">最近 7 天</option>
                <option value="overdue">已过期</option>
                <option value="none">无日期</option>
              </select>
            </label>
          </div>
          <div className="field-label">
            状态
            <div className="segmented">
              <button className={cx('segment', filterStatus === 'open' && 'is-active')} onClick={() => setFilterStatus('open')}>未完成</button>
              <button className={cx('segment', filterStatus === 'completed' && 'is-active')} onClick={() => setFilterStatus('completed')}>已完成</button>
            </div>
          </div>
        </div>
      </Modal>

      {filterMenu && (
        <ContextMenu
          x={filterMenu.x}
          y={filterMenu.y}
          onClose={() => setFilterMenu(null)}
          items={[
            {
              label: '删除过滤器',
              icon: <Trash2 size={15} />,
              danger: true,
              onClick: async () => {
                await deleteFilter(filterMenu.id);
                if (view.kind === 'filter' && view.id === filterMenu.id) onNavigate({ kind: 'today' });
                setFilterMenu(null);
              },
            },
          ]}
        />
      )}
    </aside>
  );
}