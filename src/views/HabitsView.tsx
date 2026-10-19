import { useMemo, useState } from 'react';
import { addDays, differenceInCalendarDays, format } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { Check, Flame, MoreHorizontal, Plus, Sparkles, Target, TrendingUp, Trash2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { useApp } from '../store';
import type { Habit } from '../types';
import { addDays as addDayKey, dateKey, parseDateKey, todayKey, WEEKDAYS, weekDates } from '../lib/date';
import { Confetti, ContextMenu, EmptyState, IconButton, Modal, ProgressRing, cx } from '../components/ui';

const HABIT_EMOJIS = ['🌅', '🏃', '📖', '🧘', '💧', '🥗', '😴', '✍️', '🎵', '🧠', '💪', '🌱'];
const HABIT_COLORS = ['#f59e0b', '#8b5cf6', '#10b981', '#4f76f6', '#ec4899', '#06b6d4', '#ef4444'];

function habitDone(habit: Habit, value: number) {
  return value >= habit.goal;
}

function isScheduled(habit: Habit, day: Date) {
  if (habit.frequency.type === 'daily') return true;
  if (habit.frequency.type === 'weekly') return (habit.frequency.days || []).includes(day.getDay());
  return true;
}

function currentStreak(habit: Habit, logs: { date: string; value: number }[]) {
  const done = new Set(logs.filter((l) => habitDone(habit, l.value)).map((l) => l.date));
  let cursor = todayKey();
  if (!done.has(cursor)) cursor = addDayKey(cursor, -1);
  let streak = 0;
  while (done.has(cursor) && streak < 3650) {
    streak += 1;
    cursor = addDayKey(cursor, -1);
  }
  return streak;
}

function bestStreak(habit: Habit, logs: { date: string; value: number }[]) {
  const dates = [...new Set(logs.filter((l) => habitDone(habit, l.value)).map((l) => l.date))].sort();
  let best = 0;
  let run = 0;
  let previous: string | null = null;
  for (const date of dates) {
    run = previous && differenceInCalendarDays(parseDateKey(date), parseDateKey(previous)) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
    previous = date;
  }
  return best;
}

export function HabitsView() {
  const { state, toggleHabit, createHabit, updateHabit, deleteHabit, toast } = useApp();
  const [editor, setEditor] = useState<{ habit?: Habit } | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; habit: Habit } | null>(null);
  const [celebrate, setCelebrate] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('🌱');
  const [color, setColor] = useState('#10b981');
  const [goal, setGoal] = useState(1);
  const [unit, setUnit] = useState('次');
  const [frequency, setFrequency] = useState<'daily' | 'weekly'>('daily');
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5]);

  if (!state) return null;
  const week = weekDates(new Date(), state.settings.weekStart);
  const today = todayKey();

  const logsFor = (habitId: string) => state.habitLogs.filter((l) => l.habitId === habitId);
  const todayDoneCount = state.habits.filter((h) => {
    const log = state.habitLogs.find((l) => l.habitId === h.id && l.date === today);
    return log && habitDone(h, log.value);
  }).length;
  const scheduledToday = state.habits.filter((h) => isScheduled(h, new Date())).length;
  const best = state.habits.reduce((max, h) => Math.max(max, bestStreak(h, logsFor(h.id))), 0);

  const openEditor = (habit?: Habit) => {
    setEditor({ habit });
    setName(habit?.name || '');
    setEmoji(habit?.emoji || '🌱');
    setColor(habit?.color || '#10b981');
    setGoal(habit?.goal || 1);
    setUnit(habit?.unit || '次');
    setFrequency(habit?.frequency.type === 'weekly' ? 'weekly' : 'daily');
    setDays(habit?.frequency.days || [1, 2, 3, 4, 5]);
  };

  const save = async () => {
    if (!name.trim()) {
      toast('给习惯起个名字', 'error');
      return;
    }
    const payload = {
      name: name.trim(),
      emoji,
      color,
      goal,
      unit,
      step: 1,
      frequency: frequency === 'daily' ? { type: 'daily' as const } : { type: 'weekly' as const, days },
    };
    if (editor?.habit) {
      await updateHabit(editor.habit.id, payload);
    } else {
      await createHabit(payload);
    }
    setEditor(null);
  };

  const bump = async (habit: Habit, day: string) => {
    if (day > today) return;
    const log = state.habitLogs.find((l) => l.habitId === habit.id && l.date === day);
    const current = log?.value || 0;
    const next = current >= habit.goal ? 0 : Math.min(habit.goal, current + habit.step);
    await toggleHabit(habit.id, day, next > 0, next);
    if (next >= habit.goal) {
      setCelebrate(habit.id);
      window.setTimeout(() => setCelebrate(null), 1000);
    }
  };

  return (
    <section className="habits-view">
      <header className="view-head">
        <div className="view-head-left">
          <span className="view-emoji habits-emoji"><Flame size={20} /></span>
          <div>
            <div className="view-eyebrow">HABITS</div>
            <h2>习惯</h2>
            <div className="view-sub">
              <span>微小而持续的改变</span>
              <span className="view-count">{todayDoneCount} / {scheduledToday} 已完成</span>
            </div>
          </div>
        </div>
        <div className="view-head-right">
          <button className="btn primary" onClick={() => openEditor()}>
            <Plus size={16} /> 新建习惯
          </button>
        </div>
      </header>

      <div className="habits-scroll">
        <div className="habit-stats">
          <div className="habit-stat-card">
            <span className="habit-stat-icon"><Target size={17} /></span>
            <div><strong>{scheduledToday ? Math.round((todayDoneCount / scheduledToday) * 100) : 0}%</strong><span>今日完成度</span></div>
            <ProgressRing value={scheduledToday ? todayDoneCount / scheduledToday : 0} size={36} stroke={3.5} />
          </div>
          <div className="habit-stat-card">
            <span className="habit-stat-icon warm"><Flame size={17} /></span>
            <div><strong>{state.habits.reduce((max, h) => Math.max(max, currentStreak(h, logsFor(h.id))), 0)}</strong><span>当前最长连续</span></div>
          </div>
          <div className="habit-stat-card">
            <span className="habit-stat-icon green"><TrendingUp size={17} /></span>
            <div><strong>{best}</strong><span>历史最佳连续</span></div>
          </div>
        </div>

        <div className="habit-board">
          <div className="habit-week-head">
            <div className="habit-name-col">习惯</div>
            <div className="habit-week-days">
              {week.map((day) => {
                const key = dateKey(day);
                return (
                  <div className={cx('habit-day-head', key === today && 'is-today')} key={key}>
                    <span>周{WEEKDAYS[day.getDay()]}</span>
                    <strong>{day.getDate()}</strong>
                  </div>
                );
              })}
            </div>
            <div className="habit-streak-col">连续</div>
            <div className="habit-menu-col" />
          </div>

          {state.habits.length === 0 ? (
            <EmptyState
              icon={<Flame size={32} />}
              title="还没有习惯"
              description="从一件每天都能做到的小事开始。"
              action={<button className="btn primary" onClick={() => openEditor()}>创建第一个习惯</button>}
            />
          ) : (
            state.habits.map((habit) => {
              const logs = logsFor(habit.id);
              const streak = currentStreak(habit, logs);
              const logToday = logs.find((l) => l.date === today);
              const todayValue = logToday?.value || 0;
              return (
                <motion.div className="habit-row" key={habit.id} layout>
                  <div className="habit-name-col">
                    <span className="habit-icon" style={{ background: `${habit.color}18`, color: habit.color }}>{habit.emoji}</span>
                    <div>
                      <strong>{habit.name}</strong>
                      <span>{habit.goal > 1 ? `目标 ${habit.goal} ${habit.unit}` : (habit.frequency.type === 'daily' ? '每天' : '每周')}</span>
                    </div>
                    <Confetti show={celebrate === habit.id} pieces={18} />
                  </div>
                  <div className="habit-week-days">
                    {week.map((day) => {
                      const key = dateKey(day);
                      const log = logs.find((l) => l.date === key);
                      const value = log?.value || 0;
                      const done = habitDone(habit, value);
                      const scheduled = isScheduled(habit, day);
                      const future = key > today;
                      return (
                        <div className="habit-dot-wrap" key={key}>
                          <span className="habit-dot-label">{WEEKDAYS[day.getDay()]}</span>
                          <button
                            className={cx('habit-dot', done && 'is-done', key === today && 'is-today', !scheduled && 'is-off', future && 'is-future', value > 0 && !done && 'is-partial')}
                            style={done ? { background: habit.color, borderColor: habit.color } : { '--habit-color': habit.color } as React.CSSProperties}
                            onClick={() => bump(habit, key)}
                            disabled={future || !scheduled}
                            aria-label={`${format(day, 'M月d日')} ${done ? '已完成' : '未完成'}`}
                          >
                            {done ? <Check size={14} /> : value > 0 ? <span>{value}</span> : null}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                  <div className="habit-streak-col">
                    {streak > 0 ? <span className="habit-streak"><Flame size={13} /> {streak}</span> : <span className="habit-streak muted">—</span>}
                  </div>
                  <div className="habit-menu-col">
                    <IconButton
                      label="习惯操作"
                      onClick={(event) => {
                        const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
                        setMenu({ x: rect.right - 180, y: rect.bottom + 4, habit });
                      }}
                    >
                      <MoreHorizontal size={16} />
                    </IconButton>
                  </div>
                  {habit.goal > 1 && (
                    <div className="habit-goal-bar">
                      <span style={{ width: `${Math.min(100, (todayValue / habit.goal) * 100)}%`, background: habit.color }} />
                    </div>
                  )}
                </motion.div>
              );
            })
          )}
        </div>

        <div className="habit-history">
          <div className="habit-history-head"><span>最近 12 周</span><span>颜色越深，完成越稳定</span></div>
          <div className="habit-heatmap">
            {Array.from({ length: 84 }, (_, i) => addDays(new Date(), i - 83)).map((day) => {
              const key = dateKey(day);
              const completed = state.habits.filter((h) => {
                const log = state.habitLogs.find((l) => l.habitId === h.id && l.date === key);
                return log && habitDone(h, log.value);
              }).length;
              const intensity = state.habits.length ? completed / state.habits.length : 0;
              return (
                <span
                  key={key}
                  className={cx('heat-cell', intensity > 0 && 'has-value')}
                  style={{ opacity: intensity > 0 ? 0.25 + intensity * 0.75 : undefined }}
                  title={`${format(day, 'M月d日', { locale: zhCN })} · ${completed} 个习惯`}
                />
              );
            })}
          </div>
        </div>
      </div>

      <Modal
        open={Boolean(editor)}
        onClose={() => setEditor(null)}
        title={editor?.habit ? '编辑习惯' : '新建习惯'}
        width={520}
        footer={
          <>
            <button className="btn ghost" onClick={() => setEditor(null)}>取消</button>
            <button className="btn primary" onClick={save}>{editor?.habit ? '保存' : '创建习惯'}</button>
          </>
        }
      >
        <div className="form-stack">
          <label className="field-label">
            习惯名称
            <input className="text-input" value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：早起、阅读 30 分钟" autoFocus />
          </label>
          <div className="field-label">
            图标
            <div className="emoji-grid">
              {HABIT_EMOJIS.map((item) => (
                <button key={item} type="button" className={cx('emoji-choice', emoji === item && 'is-active')} onClick={() => setEmoji(item)}>{item}</button>
              ))}
            </div>
          </div>
          <div className="field-label">
            颜色
            <div className="color-row">
              {HABIT_COLORS.map((item) => (
                <button key={item} type="button" className={cx('color-choice', color === item && 'is-active')} style={{ background: item }} onClick={() => setColor(item)} aria-label={item} />
              ))}
            </div>
          </div>
          <div className="form-row">
            <label className="field-label">
              每天目标
              <input className="text-input" type="number" min={1} max={99} value={goal} onChange={(event) => setGoal(Math.max(1, Number(event.target.value) || 1))} />
            </label>
            <label className="field-label">
              单位
              <input className="text-input" value={unit} onChange={(event) => setUnit(event.target.value)} placeholder="次 / 杯 / 页" />
            </label>
          </div>
          <div className="field-label">
            频率
            <div className="segmented">
              <button className={cx('segment', frequency === 'daily' && 'is-active')} onClick={() => setFrequency('daily')}>每天</button>
              <button className={cx('segment', frequency === 'weekly' && 'is-active')} onClick={() => setFrequency('weekly')}>每周指定</button>
            </div>
          </div>
          {frequency === 'weekly' && (
            <div className="weekday-picker">
              {['日', '一', '二', '三', '四', '五', '六'].map((label, index) => (
                <button
                  key={label}
                  className={cx('weekday-btn', days.includes(index) && 'is-active')}
                  onClick={() => setDays((current) => current.includes(index) ? current.filter((d) => d !== index) : [...current, index])}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
      </Modal>

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={[
            { label: '编辑习惯', icon: <Sparkles size={15} />, onClick: () => openEditor(menu.habit) },
            { label: '删除习惯', icon: <Trash2 size={15} />, danger: true, onClick: () => { deleteHabit(menu.habit.id); setMenu(null); } },
          ]}
          onClose={() => setMenu(null)}
        />
      )}
    </section>
  );
}