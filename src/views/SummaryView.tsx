import { useMemo } from 'react';
import { addDays as addDaysDate, format } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { ArrowRight, CalendarCheck2, CheckCircle2, Flame, Sparkles, Target, Timer, TrendingUp } from 'lucide-react';
import { motion } from 'framer-motion';
import { useApp } from '../store';
import { addDays, dateKey, formatDue, fullDateLabel, greeting, todayKey } from '../lib/date';
import { sortTasks } from '../lib/selectors';
import { ProgressRing, cx } from '../components/ui';

export function SummaryView({ onOpenTask, onOpenTasks }: { onOpenTask: (id: string) => void; onOpenTasks: () => void }) {
  const { state } = useApp();
  if (!state) return null;
  const today = todayKey();
  const todayTasks = state.tasks.filter((t) => !t.deletedAt && t.dueAt?.slice(0, 10) === today);
  const todayDone = todayTasks.filter((t) => t.status === 'completed').length;
  const todayRatio = todayTasks.length ? todayDone / todayTasks.length : 0;
  const todayFocus = state.focusSessions
    .filter((s) => s.mode === 'focus' && dateKey(new Date(s.startedAt)) === today)
    .reduce((sum, s) => sum + s.duration, 0);
  const completedToday = state.tasks.filter((t) => t.completedAt && dateKey(new Date(t.completedAt)) === today).length;
  const week = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const day = addDaysDate(new Date(), i - 6);
        const key = dateKey(day);
        const done = state.tasks.filter((t) => t.completedAt && dateKey(new Date(t.completedAt)) === key).length;
        const focus = state.focusSessions
          .filter((s) => s.mode === 'focus' && dateKey(new Date(s.startedAt)) === key)
          .reduce((sum, s) => sum + s.duration, 0);
        return { day, key, done, focus };
      }),
    [state.tasks, state.focusSessions],
  );
  const weekDone = week.reduce((sum, d) => sum + d.done, 0);
  const weekFocus = week.reduce((sum, d) => sum + d.focus, 0);
  const maxDone = Math.max(1, ...week.map((d) => d.done));
  const maxFocus = Math.max(1, ...week.map((d) => d.focus));
  const openTasks = state.tasks.filter((t) => !t.deletedAt && t.status === 'open');
  const upcoming = sortTasks(openTasks.filter((t) => t.dueAt && t.dueAt.slice(0, 10) >= today)).slice(0, 5);
  const listCounts = state.lists
    .map((list) => ({ list, count: openTasks.filter((t) => t.listId === list.id).length }))
    .filter((x) => x.count > 0)
    .sort((a, b) => b.count - a.count);
  const maxList = Math.max(1, ...listCounts.map((x) => x.count));
  const habitDoneToday = state.habits.filter((h) => {
    const log = state.habitLogs.find((l) => l.habitId === h.id && l.date === today);
    return log && log.value >= h.goal;
  }).length;
  const bestStreak = state.habits.length
    ? Math.max(
        ...state.habits.map((h) => {
          const done = new Set(state.habitLogs.filter((l) => l.habitId === h.id && l.value >= h.goal).map((l) => l.date));
          let cursor = done.has(today) ? today : addDays(today, -1);
          let streak = 0;
          while (done.has(cursor) && streak < 3650) {
            streak += 1;
            cursor = addDays(cursor, -1);
          }
          return streak;
        }),
      )
    : 0;
  const heatmap = Array.from({ length: 140 }, (_, i) => addDaysDate(new Date(), i - 139)).map((day) => {
    const key = dateKey(day);
    const count = state.tasks.filter((t) => t.completedAt && dateKey(new Date(t.completedAt)) === key).length;
    return { key, count, date: day };
  });
  const maxHeat = Math.max(1, ...heatmap.map((d) => d.count));

  return (
    <section className="summary-view">
      <header className="view-head">
        <div className="view-head-left">
          <div>
            <div className="view-eyebrow">OVERVIEW</div>
            <h2>{greeting()}，{state.settings.userName}</h2>
            <div className="view-sub">
              <span>{fullDateLabel()}</span>
              <span className="view-count">{openTasks.length} 个未完成任务</span>
            </div>
          </div>
        </div>
        <div className="view-head-right">
          <button className="btn ghost small" onClick={onOpenTasks}>查看今天 <ArrowRight size={14} /></button>
        </div>
      </header>

      <div className="summary-scroll">
        <div className="summary-hero">
          <div className="summary-hero-copy">
            <span className="summary-kicker"><Sparkles size={14} /> 今日专注</span>
            <h3>{todayDone === todayTasks.length && todayTasks.length > 0 ? '今天的事情，都做完了。' : todayDone > 0 ? '已经迈出了一步，继续保持。' : '从一件小事开始今天。'}</h3>
            <p>今日完成 {todayDone} 个任务，专注 {todayFocus} 分钟。{openTasks.length > 0 ? `还有 ${openTasks.length} 件事在等你。` : '清单已经清空，去休息一下吧。'}</p>
          </div>
          <div className="summary-hero-ring">
            <ProgressRing value={todayRatio} size={112} stroke={7}>
              <div className="summary-ring-inner">
                <strong>{Math.round(todayRatio * 100)}%</strong>
                <span>今日进度</span>
              </div>
            </ProgressRing>
          </div>
        </div>

        <div className="summary-stats">
          <div className="summary-stat">
            <span className="summary-stat-icon blue"><CheckCircle2 size={18} /></span>
            <div><strong>{completedToday}</strong><span>今日完成</span></div>
            <small>目标 {state.settings.dailyTaskGoal}</small>
          </div>
          <div className="summary-stat">
            <span className="summary-stat-icon orange"><Timer size={18} /></span>
            <div><strong>{todayFocus}<i>分钟</i></strong><span>今日专注</span></div>
            <small>目标 {state.settings.dailyFocusGoal}</small>
          </div>
          <div className="summary-stat">
            <span className="summary-stat-icon green"><Flame size={18} /></span>
            <div><strong>{habitDoneToday}<i>/{state.habits.length}</i></strong><span>习惯打卡</span></div>
            <small>连续 {bestStreak} 天</small>
          </div>
          <div className="summary-stat">
            <span className="summary-stat-icon purple"><TrendingUp size={18} /></span>
            <div><strong>{weekDone}</strong><span>本周完成</span></div>
            <small>{weekFocus} 分钟专注</small>
          </div>
        </div>

        <div className="summary-grid">
          <div className="summary-card summary-chart-card">
            <div className="summary-card-head">
              <div><strong>最近 7 天</strong><span>完成情况与专注时长</span></div>
              <div className="summary-legend"><span><i className="legend-done" />任务</span><span><i className="legend-focus" />专注</span></div>
            </div>
            <div className="summary-chart">
              {week.map((day) => (
                <div className="summary-chart-col" key={day.key}>
                  <div className="summary-chart-bars">
                    <motion.div
                      className="summary-bar done"
                      initial={{ height: 0 }}
                      animate={{ height: `${Math.max(3, (day.done / maxDone) * 100)}%` }}
                      transition={{ type: 'spring', stiffness: 200, damping: 26 }}
                      title={`${day.done} 个任务`}
                    >
                      {day.done > 0 && <span>{day.done}</span>}
                    </motion.div>
                    <motion.div
                      className="summary-bar focus"
                      initial={{ height: 0 }}
                      animate={{ height: `${Math.max(3, (day.focus / maxFocus) * 100)}%` }}
                      transition={{ type: 'spring', stiffness: 200, damping: 26, delay: 0.03 }}
                      title={`${day.focus} 分钟`}
                    />
                  </div>
                  <span className={cx('summary-chart-label', day.key === today && 'is-today')}>{['日', '一', '二', '三', '四', '五', '六'][day.day.getDay()]}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="summary-card">
            <div className="summary-card-head">
              <div><strong>清单分布</strong><span>任务都放在哪里</span></div>
            </div>
            <div className="summary-distribution">
              {listCounts.length === 0 && <p className="muted">还没有未完成任务。</p>}
              {listCounts.map(({ list, count }) => (
                <div className="summary-dist-row" key={list.id}>
                  <span className="summary-dist-name"><i style={{ background: list.color }} />{list.emoji} {list.name}</span>
                  <div className="summary-dist-track"><span style={{ width: `${(count / maxList) * 100}%`, background: list.color }} /></div>
                  <span className="summary-dist-count">{count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="summary-card summary-upcoming">
          <div className="summary-card-head">
            <div><strong>接下来</strong><span>最近的安排</span></div>
            <button className="text-button" onClick={onOpenTasks}>全部 <ArrowRight size={13} /></button>
          </div>
          <div className="summary-upcoming-list">
            {upcoming.length === 0 ? (
              <p className="muted">接下来没有安排，享受一点留白。</p>
            ) : (
              upcoming.map((task) => {
                const list = state.lists.find((l) => l.id === task.listId);
                return (
                  <button className="summary-upcoming-row" key={task.id} onClick={() => onOpenTask(task.id)}>
                    <span className="summary-upcoming-dot" style={{ background: list?.color }} />
                    <span className="summary-upcoming-title">{task.title}</span>
                    <span className="summary-upcoming-list">{list?.emoji} {list?.name}</span>
                    <span className="summary-upcoming-date">{formatDue(task)}</span>
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div className="summary-card summary-heatmap-card">
          <div className="summary-card-head">
            <div><strong>完成热力图</strong><span>过去 20 周</span></div>
            <span className="summary-heat-total"><Target size={13} /> {heatmap.reduce((sum, d) => sum + d.count, 0)} 个完成</span>
          </div>
          <div className="summary-heatmap">
            {heatmap.map((day) => (
              <span
                key={day.key}
                className="summary-heat-cell"
                style={{ opacity: day.count ? 0.25 + (day.count / maxHeat) * 0.75 : undefined }}
                title={`${format(day.date, 'M月d日', { locale: zhCN })} · ${day.count} 个任务`}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}