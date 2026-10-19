import { useMemo, useState } from 'react';
import { AlertCircle, ArrowUpRight, CalendarClock, Grid2X2, Plus, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';
import { useApp } from '../store';
import type { Task } from '../types';
import { addDays, dateKey, formatDue, todayKey } from '../lib/date';
import { Checkbox, EmptyState, PriorityFlag, cx } from '../components/ui';

type Quadrant = 'q1' | 'q2' | 'q3' | 'q4';

const QUADRANTS: { key: Quadrant; title: string; subtitle: string; color: string; tint: string }[] = [
  { key: 'q1', title: '重要且紧急', subtitle: '立刻去做', color: '#ef4444', tint: '#fef2f2' },
  { key: 'q2', title: '重要不紧急', subtitle: '安排时间做', color: '#4f76f6', tint: '#eff4ff' },
  { key: 'q3', title: '紧急不重要', subtitle: '快速处理或委托', color: '#f59e0b', tint: '#fffbeb' },
  { key: 'q4', title: '不重要不紧急', subtitle: '有空再说', color: '#64748b', tint: '#f8fafc' },
];

function quadrantOf(task: Task): Quadrant {
  const important = task.priority >= 2;
  const urgent = Boolean(task.dueAt && task.dueAt.slice(0, 10) <= addDays(todayKey(), 1));
  if (important && urgent) return 'q1';
  if (important && !urgent) return 'q2';
  if (!important && urgent) return 'q3';
  return 'q4';
}

export function MatrixView({ onOpenTask }: { onOpenTask: (id: string) => void }) {
  const { state, patchTask, toggleTask, createTask } = useApp();
  const [over, setOver] = useState<Quadrant | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [adding, setAdding] = useState<Quadrant | null>(null);
  const [draft, setDraft] = useState('');

  const buckets = useMemo(() => {
    const result: Record<Quadrant, Task[]> = { q1: [], q2: [], q3: [], q4: [] };
    for (const task of state?.tasks || []) {
      if (task.deletedAt || task.status !== 'open') continue;
      result[quadrantOf(task)].push(task);
    }
    for (const key of Object.keys(result) as Quadrant[]) {
      result[key].sort((a, b) => b.priority - a.priority || (a.dueAt || '9999').localeCompare(b.dueAt || '9999'));
    }
    return result;
  }, [state?.tasks]);

  if (!state) return null;

  const applyQuadrant = async (taskId: string, quadrant: Quadrant) => {
    const task = state.tasks.find((t) => t.id === taskId);
    if (!task) return;
    const patches: Partial<Task> =
      quadrant === 'q1'
        ? { priority: 3, dueAt: todayKey(), allDay: true }
        : quadrant === 'q2'
          ? { priority: 2, dueAt: addDays(todayKey(), 7), allDay: true }
          : quadrant === 'q3'
            ? { priority: 1, dueAt: todayKey(), allDay: true }
            : { priority: 0, dueAt: null, allDay: true };
    await patchTask(task.id, patches);
    setDragging(null);
    setOver(null);
  };

  const addTo = async (quadrant: Quadrant) => {
    if (!draft.trim()) {
      setAdding(null);
      return;
    }
    const dueAt = quadrant === 'q1' || quadrant === 'q3' ? todayKey() : quadrant === 'q2' ? addDays(todayKey(), 7) : null;
    const priority = quadrant === 'q1' ? 3 : quadrant === 'q2' ? 2 : quadrant === 'q3' ? 1 : 0;
    await createTask({ title: draft.trim(), dueAt, allDay: true, priority, listId: 'inbox' });
    setDraft('');
    setAdding(null);
  };

  return (
    <section className="matrix-view">
      <header className="view-head">
        <div className="view-head-left">
          <span className="view-emoji matrix-emoji"><Grid2X2 size={20} /></span>
          <div>
            <div className="view-eyebrow">EISENHOWER MATRIX</div>
            <h2>优先级矩阵</h2>
            <div className="view-sub">
              <span>把时间留给真正重要的事</span>
              <span className="view-count">{Object.values(buckets).flat().length} 个待办</span>
            </div>
          </div>
        </div>
      </header>

      <div className="matrix-scroll">
        <div className="matrix-wrap">
          <div className="matrix-grid">
            {QUADRANTS.map((quadrant) => {
              const items = buckets[quadrant.key];
              return (
                <div
                  key={quadrant.key}
                  className={cx('matrix-card', over === quadrant.key && 'is-over')}
                  style={{ '--q-color': quadrant.color, '--q-tint': quadrant.tint } as React.CSSProperties}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setOver(quadrant.key);
                  }}
                  onDragLeave={() => setOver((v) => (v === quadrant.key ? null : v))}
                  onDrop={(event) => {
                    event.preventDefault();
                    if (dragging) applyQuadrant(dragging, quadrant.key);
                  }}
                >
                  <div className="matrix-card-head">
                    <div>
                      <span className="matrix-title">{quadrant.title}</span>
                      <span className="matrix-subtitle">{quadrant.subtitle}</span>
                    </div>
                    <span className="matrix-count">{items.length}</span>
                  </div>
                  <div className="matrix-tasks">
                    {items.map((task) => {
                      const list = state.lists.find((l) => l.id === task.listId);
                      return (
                        <motion.div
                          layout
                          key={task.id}
                          className="matrix-task"
                          draggable
                          onDragStart={() => setDragging(task.id)}
                          onDragEnd={() => setDragging(null)}
                          onClick={() => onOpenTask(task.id)}
                        >
                          <Checkbox checked={false} size="small" color={quadrant.color} onChange={() => toggleTask(task.id, true)} />
                          <div className="matrix-task-copy">
                            <span>{task.title}</span>
                            <small>
                              <span>{list?.emoji} {list?.name}</span>
                              {task.dueAt && <span><CalendarClock size={11} /> {formatDue(task)}</span>}
                            </small>
                          </div>
                          {task.priority > 0 && <PriorityFlag priority={task.priority} size={13} />}
                        </motion.div>
                      );
                    })}
                    {items.length === 0 && (
                      <div className="matrix-empty">
                        <Sparkles size={16} />
                        <span>把任务拖到这里</span>
                      </div>
                    )}
                  </div>
                  {adding === quadrant.key ? (
                    <div className="matrix-add-row">
                      <Plus size={14} />
                      <input
                        value={draft}
                        onChange={(event) => setDraft(event.target.value)}
                        autoFocus
                        placeholder="添加任务，回车确认"
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') addTo(quadrant.key);
                          if (event.key === 'Escape') setAdding(null);
                        }}
                        onBlur={() => {
                          if (!draft.trim()) setAdding(null);
                        }}
                      />
                    </div>
                  ) : (
                    <button className="matrix-add" onClick={() => setAdding(quadrant.key)}>
                      <Plus size={14} /> 添加任务
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}