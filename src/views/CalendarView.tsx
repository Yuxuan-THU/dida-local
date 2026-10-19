import { useMemo, useState } from 'react';
import { addDays, addMonths, eachDayOfInterval, format } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Plus, CalendarDays, Check } from 'lucide-react';
import { motion } from 'framer-motion';
import { useApp } from '../store';
import type { Task } from '../types';
import { dateKey, dueMinutes, monthGrid, monthLabel, parseDateKey, todayKey, weekDates, WEEKDAYS } from '../lib/date';
import { useIsMobile } from '../lib/useMediaQuery';
import { Checkbox, EmptyState, IconButton, Segmented, cx } from '../components/ui';

type CalendarMode = 'month' | 'week';
type MobileCalendarMode = 'agenda' | 'list' | 'timeline' | 'week' | 'heatmap';

export function CalendarView({ onOpenTask }: { onOpenTask: (id: string) => void }) {
  const { state, patchTask, createTask, toggleTask, toast } = useApp();
  const isMobile = useIsMobile();
  const [mode, setMode] = useState<CalendarMode>('month');
  const [mobileMode, setMobileMode] = useState<MobileCalendarMode>('agenda');
  const [cursor, setCursor] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState(todayKey());
  const [quickTitle, setQuickTitle] = useState('');
  const [dragging, setDragging] = useState<string | null>(null);
  const [dragOverDay, setDragOverDay] = useState<string | null>(null);

  const visibleTasks = useMemo(
    () => (state?.tasks || []).filter((t) => !t.deletedAt && t.status !== 'abandoned'),
    [state?.tasks],
  );
  const byDay = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const task of visibleTasks) {
      if (!task.dueAt) continue;
      const key = task.dueAt.slice(0, 10);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(task);
    }
    for (const list of map.values()) {
      list.sort((a, b) => {
        if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
        return (a.dueAt || '').localeCompare(b.dueAt || '') || a.sortOrder - b.sortOrder;
      });
    }
    return map;
  }, [visibleTasks]);

  const yearCounts = useMemo(() => {
    const map = new Map<string, number>();
    const year = cursor.getFullYear();
    for (const task of visibleTasks) {
      const day = task.dueAt?.slice(0, 10);
      if (!day || day.slice(0, 4) !== String(year)) continue;
      map.set(day, (map.get(day) || 0) + 1);
    }
    return map;
  }, [visibleTasks, cursor]);

  if (!state) return null;
  const weekStart = state.settings.weekStart;
  const weekLabels = weekStart === 0 ? ['日', '一', '二', '三', '四', '五', '六'] : ['一', '二', '三', '四', '五', '六', '日'];
  const days = mode === 'month' ? monthGrid(cursor, weekStart) : weekDates(cursor, weekStart);
  const mobileDays = weekDates(cursor, weekStart);
  const selectedTasks = byDay.get(selectedDay) || [];

  const move = (direction: number) => {
    setCursor((current) => {
      if (isMobile) {
        const next = addDays(current, direction * 7);
        setSelectedDay(dateKey(next));
        return next;
      }
      return mode === 'month' ? addMonths(current, direction) : addDays(current, direction * 7);
    });
  };

  const goToday = () => {
    setCursor(new Date());
    setSelectedDay(todayKey());
  };

  const dropOnDay = async (dayKey: string) => {
    if (!dragging) return;
    const task = state.tasks.find((t) => t.id === dragging);
    if (task) {
      const time = task.allDay ? '' : `T${task.dueAt?.slice(11, 16) || '09:00'}`;
      await patchTask(task.id, { dueAt: `${dayKey}${time}`, allDay: task.allDay });
      toast(`已移动到 ${format(parseDateKey(dayKey), 'M月d日', { locale: zhCN })}`, 'success');
    }
    setDragging(null);
    setDragOverDay(null);
  };

  const addQuick = async () => {
    const title = quickTitle.trim();
    if (!title) return;
    const task = await createTask({ title, dueAt: selectedDay, allDay: true });
    setQuickTitle('');
    if (task) {
      toast('任务已添加到这一天', 'success');
      onOpenTask(task.id);
    }
  };

  return (
    <section className="calendar-view">
      <header className="view-head calendar-head">
        <div className="view-head-left">
          <span className="view-emoji calendar-emoji"><CalendarDays size={20} /></span>
          <div>
            <div className="view-eyebrow">CALENDAR</div>
            <h2>{monthLabel(cursor)}</h2>
            <div className="view-sub">
              <span>
                {isMobile
                  ? ({ agenda: '日程视图', list: '列表视图', timeline: '时间轴', week: '格子周', heatmap: '热力图' } as const)[mobileMode]
                  : mode === 'month'
                    ? '月视图'
                    : '周视图'}
              </span>
              <span className="view-count">{visibleTasks.length} 个已安排任务</span>
            </div>
          </div>
        </div>
        <div className="view-head-right calendar-actions">
          <button className="btn ghost small" onClick={goToday}>今天</button>
          <div className="month-nav">
            <IconButton label="上一个" onClick={() => move(-1)}><ChevronLeft size={18} /></IconButton>
            <IconButton label="下一个" onClick={() => move(1)}><ChevronRight size={18} /></IconButton>
          </div>
          {!isMobile && (
            <Segmented
              value={mode}
              onChange={(value) => setMode(value)}
              options={[
                { value: 'month', label: '月' },
                { value: 'week', label: '周' },
              ]}
              size="small"
            />
          )}
        </div>
      </header>

      {isMobile ? (
        <MobileCalendar
          days={mobileDays}
          byDay={byDay}
          lists={state.lists}
          selectedDay={selectedDay}
          onSelect={setSelectedDay}
          onOpenTask={onOpenTask}
          onToggle={toggleTask}
          quickTitle={quickTitle}
          setQuickTitle={setQuickTitle}
          onAdd={addQuick}
          mode={mobileMode}
          onMode={setMobileMode}
          onDrop={() => undefined}
          yearCounts={yearCounts}
        />
      ) : (
      <div className="calendar-body">
        <div className={cx('calendar-main', mode === 'week' && 'is-week')}>
          <div className="calendar-weekdays">
            {weekLabels.map((label) => <span key={label}>周{label}</span>)}
          </div>
          {mode === 'month' ? (
            <div className="month-grid">
              {days.map((day) => {
                const key = dateKey(day);
                const dayTasks = byDay.get(key) || [];
                const outside = day.getMonth() !== cursor.getMonth();
                return (
                  <div
                    key={key}
                    className={cx(
                      'month-cell',
                      outside && 'is-outside',
                      key === todayKey() && 'is-today',
                      key === selectedDay && 'is-selected',
                      dragOverDay === key && 'is-drag-over',
                    )}
                    onClick={() => setSelectedDay(key)}
                    onDragOver={(event) => {
                      event.preventDefault();
                      setDragOverDay(key);
                    }}
                    onDragLeave={() => setDragOverDay((v) => (v === key ? null : v))}
                    onDrop={(event) => {
                      event.preventDefault();
                      dropOnDay(key);
                    }}
                  >
                    <div className="month-cell-head">
                      <span className="month-day-number">{day.getDate()}</span>
                      {key === todayKey() && <span className="today-label">今天</span>}
                      {dayTasks.length > 0 && <span className="month-day-count">{dayTasks.length}</span>}
                    </div>
                    <div className="month-tasks">
                      {dayTasks.slice(0, 3).map((task) => {
                        const list = state.lists.find((l) => l.id === task.listId);
                        return (
                          <button
                            key={task.id}
                            draggable
                            onDragStart={() => setDragging(task.id)}
                            onDragEnd={() => setDragging(null)}
                            className={cx('calendar-chip', task.status === 'completed' && 'is-completed')}
                            style={{ '--chip-color': list?.color || '#4f76f6' } as React.CSSProperties}
                            onClick={(event) => {
                              event.stopPropagation();
                              setSelectedDay(key);
                              onOpenTask(task.id);
                            }}
                          >
                            {!task.allDay && <span className="chip-time">{task.dueAt?.slice(11, 16)}</span>}
                            <span className="chip-title">{task.title}</span>
                          </button>
                        );
                      })}
                      {dayTasks.length > 3 && <span className="month-more">+{dayTasks.length - 3} 更多</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <WeekGrid
              days={days}
              byDay={byDay}
              lists={state.lists}
              selectedDay={selectedDay}
              onSelect={setSelectedDay}
              onOpenTask={onOpenTask}
              onDrop={dropOnDay}
              setDragging={setDragging}
              dragOverDay={dragOverDay}
              setDragOverDay={setDragOverDay}
            />
          )}
        </div>

        <aside className="calendar-side">
          <div className="calendar-side-head">
            <div>
              <span className="calendar-side-date">{format(parseDateKey(selectedDay), 'M月d日', { locale: zhCN })}</span>
              <span className="calendar-side-week">周{WEEKDAYS[parseDateKey(selectedDay).getDay()]}</span>
            </div>
            <span className="calendar-side-count">{selectedTasks.filter((t) => t.status === 'open').length} 项待办</span>
          </div>
          <div className="calendar-quick">
            <Plus size={15} />
            <input
              value={quickTitle}
              onChange={(event) => setQuickTitle(event.target.value)}
              placeholder="添加到这一天"
              onKeyDown={(event) => {
                if (event.key === 'Enter') addQuick();
              }}
            />
          </div>
          <div className="calendar-side-list">
            {selectedTasks.length === 0 ? (
              <div className="calendar-side-empty">
                <CalendarDays size={24} />
                <p>这一天还没有安排</p>
                <span>留白也是一种计划。</span>
              </div>
            ) : (
              selectedTasks.map((task) => {
                const list = state.lists.find((l) => l.id === task.listId);
                return (
                  <div className={cx('calendar-side-task', task.status === 'completed' && 'is-completed')} key={task.id}>
                    <Checkbox checked={task.status === 'completed'} size="small" color={list?.color} onChange={(next) => toggleTask(task.id, next)} />
                    <button className="calendar-side-task-title" onClick={() => onOpenTask(task.id)}>
                      <span>{task.title}</span>
                      <small>
                        {task.allDay ? '全天' : task.dueAt?.slice(11, 16)}
                      </small>
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </aside>
      </div>
      )}
    </section>
  );
}

function MobileCalendar({
  days,
  byDay,
  lists,
  selectedDay,
  onSelect,
  onOpenTask,
  onToggle,
  quickTitle,
  setQuickTitle,
  onAdd,
  mode,
  onMode,
  onDrop,
  yearCounts,
}: {
  days: Date[];
  byDay: Map<string, Task[]>;
  lists: { id: string; name: string; color: string; emoji: string }[];
  selectedDay: string;
  onSelect: (key: string) => void;
  onOpenTask: (id: string) => void;
  onToggle: (id: string, next: boolean) => void;
  quickTitle: string;
  setQuickTitle: (value: string) => void;
  onAdd: () => void;
  mode: MobileCalendarMode;
  onMode: (mode: MobileCalendarMode) => void;
  onDrop: (key: string) => void;
  yearCounts: Map<string, number>;
}) {
  const selectedTasks = byDay.get(selectedDay) || [];
  const dayDate = parseDateKey(selectedDay);
  return (
    <div className="mobile-calendar">
      <div className="mobile-week-strip">
        {days.map((day) => {
          const key = dateKey(day);
          const count = (byDay.get(key) || []).filter((t) => t.status === 'open').length;
          return (
            <button
              key={key}
              className={cx('mobile-day-pill', key === selectedDay && 'is-selected', key === todayKey() && 'is-today')}
              onClick={() => onSelect(key)}
            >
              <span>周{WEEKDAYS[day.getDay()]}</span>
              <strong>{day.getDate()}</strong>
              <i className={cx(count > 0 && 'has-dots')}>{count > 0 ? count : ''}</i>
            </button>
          );
        })}
      </div>

      <div className="mobile-calendar-viewbar">
        <Segmented
          value={mode}
          onChange={(value) => onMode(value as MobileCalendarMode)}
          options={[
            { value: 'agenda', label: '日程' },
            { value: 'list', label: '列表' },
            { value: 'timeline', label: '时间轴' },
            { value: 'week', label: '格子周' },
            { value: 'heatmap', label: '热力图' },
          ]}
          size="small"
        />
      </div>

      {mode === 'agenda' && (
        <>
          <div className="mobile-calendar-toolbar">
            <div>
              <strong>{format(dayDate, 'M月d日', { locale: zhCN })}</strong>
              <span>周{WEEKDAYS[dayDate.getDay()]} · {selectedTasks.filter((t) => t.status === 'open').length} 项待办</span>
            </div>
          </div>

          <div className="mobile-calendar-add">
            <Plus size={16} />
            <input
              value={quickTitle}
              onChange={(event) => setQuickTitle(event.target.value)}
              placeholder="添加到这一天"
              onKeyDown={(event) => {
                if (event.key === 'Enter') onAdd();
              }}
            />
          </div>

          <div className="mobile-agenda">
            {selectedTasks.length === 0 ? (
              <div className="mobile-agenda-empty">
                <CalendarDays size={24} />
                <p>这一天还没有安排</p>
                <span>留白也是一种计划。</span>
              </div>
            ) : (
              selectedTasks.map((task) => {
                const list = lists.find((l) => l.id === task.listId);
                return (
                  <div className={cx('mobile-agenda-row', task.status === 'completed' && 'is-completed')} key={task.id}>
                    <Checkbox checked={task.status === 'completed'} color={list?.color} onChange={(next) => onToggle(task.id, next)} />
                    <button className="mobile-agenda-copy" onClick={() => onOpenTask(task.id)}>
                      <span>{task.title}</span>
                      <small>
                        {task.allDay ? '全天' : task.dueAt?.slice(11, 16)}
                      </small>
                    </button>
                    <span className="mobile-agenda-color" style={{ background: list?.color }} />
                  </div>
                );
              })
            )}
          </div>

          <div className="mobile-calendar-hint">左右切换周，点选日期查看当天安排</div>
        </>
      )}

      {mode === 'list' && (
        <div className="mobile-calendar-list">
          {days.map((day) => {
            const key = dateKey(day);
            const tasks = byDay.get(key) || [];
            if (tasks.length === 0) return null;
            return (
              <section key={key} className="mobile-calendar-list-day">
                <h4>
                  <span>{format(day, 'M月d日', { locale: zhCN })}</span>
                  <small>周{WEEKDAYS[day.getDay()]}</small>
                </h4>
                {tasks.map((task) => {
                  const list = lists.find((l) => l.id === task.listId);
                  return (
                    <div className={cx('mobile-agenda-row', task.status === 'completed' && 'is-completed')} key={task.id}>
                      <Checkbox checked={task.status === 'completed'} color={list?.color} onChange={(next) => onToggle(task.id, next)} />
                      <button className="mobile-agenda-copy" onClick={() => onOpenTask(task.id)}>
                        <span>{task.title}</span>
                        <small>
                          {task.allDay ? '全天' : task.dueAt?.slice(11, 16)}
                        </small>
                      </button>
                      <span className="mobile-agenda-color" style={{ background: list?.color }} />
                    </div>
                  );
                })}
              </section>
            );
          })}
          {days.every((day) => (byDay.get(dateKey(day)) || []).length === 0) && (
            <div className="mobile-agenda-empty">
              <CalendarDays size={24} />
              <p>这一周还没有安排</p>
              <span>点「日程」切回当天。</span>
            </div>
          )}
        </div>
      )}

      {mode === 'week' && (
        <div className="mobile-week-view">
          <WeekGrid
            days={days}
            byDay={byDay}
            lists={lists}
            selectedDay={selectedDay}
            onSelect={onSelect}
            onOpenTask={onOpenTask}
            onDrop={onDrop}
            setDragging={() => undefined}
            dragOverDay={null}
            setDragOverDay={() => undefined}
          />
        </div>
      )}

      {mode === 'timeline' && (
        <div className="mobile-timeline">
          {(() => {
            const timed = [...selectedTasks].sort((a, b) => {
              if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
              return (a.dueAt || '').localeCompare(b.dueAt || '');
            });
            if (timed.length === 0) {
              return (
                <div className="mobile-agenda-empty">
                  <CalendarDays size={24} />
                  <p>这一天还没有安排</p>
                  <span>时间轴会按时间顺序展示任务。</span>
                </div>
              );
            }
            return timed.map((task) => {
              const list = lists.find((l) => l.id === task.listId);
              return (
                <div className={cx('mobile-timeline-row', task.status === 'completed' && 'is-completed')} key={task.id}>
                  <span className="mobile-timeline-time">{task.allDay ? '全天' : (task.dueAt?.slice(11, 16) || '')}</span>
                  <span className="mobile-timeline-dot" style={{ background: list?.color }} />
                  <button className="mobile-timeline-copy" onClick={() => onOpenTask(task.id)}>
                    <span>{task.title}</span>
                    <small>{task.allDay ? '全天' : task.dueAt?.slice(11, 16)}</small>
                  </button>
                </div>
              );
            });
          })()}
        </div>
      )}

      {mode === 'heatmap' && (
        <div className="mobile-heatmap">
          <div className="mobile-heatmap-head">
            <strong>{dayDate.getFullYear()} 年</strong>
            <span>颜色越深，当天安排越多</span>
          </div>
          <div className="mobile-heatmap-body">
            <div className="mobile-heatmap-weekdays">
              {['一', '二', '三', '四', '五', '六', '日'].map((w) => <span key={w}>{w}</span>)}
            </div>
            <div className="mobile-heatmap-grid">
              {(() => {
                const year = dayDate.getFullYear();
                const jan1 = new Date(year, 0, 1);
                const lead = (jan1.getDay() + 6) % 7;
                let cellDate = addDays(jan1, -lead);
                const last = new Date(year, 11, 31);
                const cells: (Date | null)[] = [];
                while (cellDate <= last) {
                  cells.push(cellDate);
                  cellDate = addDays(cellDate, 1);
                }
                while (cells.length % 7 !== 0) cells.push(null);
                return cells.map((date, index) => {
                  if (!date) return <span className="mobile-heat-cell is-empty" key={index} />;
                  const key = dateKey(date);
                  const count = yearCounts.get(key) || 0;
                  const strength = count === 0 ? 0 : Math.min(1, 0.4 + count * 0.18);
                  return (
                    <span
                      key={index}
                      className="mobile-heat-cell"
                      title={`${key} · ${count} 项`}
                      style={count > 0 ? { background: `color-mix(in srgb, var(--accent) ${Math.round(strength * 100)}%, var(--panel-3))` } : undefined}
                    />
                  );
                });
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function WeekGrid({
  days,
  byDay,
  lists,
  selectedDay,
  onSelect,
  onOpenTask,
  onDrop,
  setDragging,
  dragOverDay,
  setDragOverDay,
}: {
  days: Date[];
  byDay: Map<string, Task[]>;
  lists: { id: string; name: string; color: string; emoji: string }[];
  selectedDay: string;
  onSelect: (key: string) => void;
  onOpenTask: (id: string) => void;
  onDrop: (key: string) => void;
  setDragging: (id: string | null) => void;
  dragOverDay: string | null;
  setDragOverDay: (key: string | null) => void;
}) {
  const START_HOUR = 6;
  const END_HOUR = 23;
  const HOUR_HEIGHT = 52;
  const hours = Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => START_HOUR + i);
  const timedTasks = days.flatMap((day) => (byDay.get(dateKey(day)) || []).filter((t) => !t.allDay));
  const allDayCount = days.reduce((sum, day) => sum + (byDay.get(dateKey(day)) || []).filter((t) => t.allDay).length, 0);

  return (
    <div className="week-grid-wrap">
      <div className="week-head-row">
        <div className="week-gutter" />
        {days.map((day) => {
          const key = dateKey(day);
          return (
            <button
              key={key}
              className={cx('week-day-head', key === todayKey() && 'is-today', key === selectedDay && 'is-selected')}
              onClick={() => onSelect(key)}
            >
              <span>周{WEEKDAYS[day.getDay()]}</span>
              <strong>{day.getDate()}</strong>
            </button>
          );
        })}
      </div>
      {allDayCount > 0 && (
        <div className="week-allday-row">
          <div className="week-gutter"><span>全天</span></div>
          {days.map((day) => {
            const key = dateKey(day);
            return (
              <div
                key={key}
                className={cx('week-allday-cell', dragOverDay === key && 'is-over')}
                onDragOver={(event) => { event.preventDefault(); setDragOverDay(key); }}
                onDragLeave={() => setDragOverDay(null)}
                onDrop={(event) => { event.preventDefault(); onDrop(key); }}
              >
                {(byDay.get(key) || []).filter((t) => t.allDay).map((task) => {
                  const list = lists.find((l) => l.id === task.listId);
                  return (
                    <button key={task.id} draggable onDragStart={() => setDragging(task.id)} className="week-allday-chip" style={{ '--chip-color': list?.color } as React.CSSProperties} onClick={() => onOpenTask(task.id)}>
                      {task.title}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
      <div className="week-scroll">
        <div className="week-time-grid" style={{ height: (END_HOUR - START_HOUR + 1) * HOUR_HEIGHT }}>
          <div className="week-gutter-col">
            {hours.map((hour) => <div className="week-hour-label" key={hour} style={{ top: (hour - START_HOUR) * HOUR_HEIGHT }}>{String(hour).padStart(2, '0')}:00</div>)}
          </div>
          {days.map((day) => {
            const key = dateKey(day);
            const dayTasks = (byDay.get(key) || []).filter((t) => !t.allDay);
            return (
              <div
                key={key}
                className={cx('week-day-col', dragOverDay === key && 'is-over', key === todayKey() && 'is-today')}
                onClick={() => onSelect(key)}
                onDragOver={(event) => { event.preventDefault(); setDragOverDay(key); }}
                onDragLeave={() => setDragOverDay(null)}
                onDrop={(event) => { event.preventDefault(); onDrop(key); }}
              >
                {hours.map((hour) => <div className="week-hour-line" key={hour} style={{ top: (hour - START_HOUR) * HOUR_HEIGHT }} />)}
                {dayTasks.map((task) => {
                  const list = lists.find((l) => l.id === task.listId);
                  const minutes = dueMinutes(task.dueAt);
                  const top = Math.max(0, ((minutes - START_HOUR * 60) / 60) * HOUR_HEIGHT);
                  return (
                    <button
                      key={task.id}
                      draggable
                      onDragStart={() => setDragging(task.id)}
                      className={cx('week-event', task.status === 'completed' && 'is-completed')}
                      style={{ top, '--chip-color': list?.color || '#4f76f6' } as React.CSSProperties}
                      onClick={(event) => { event.stopPropagation(); onOpenTask(task.id); }}
                    >
                      <span className="week-event-time">{task.dueAt?.slice(11, 16)}</span>
                      <span className="week-event-title">{task.title}</span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}