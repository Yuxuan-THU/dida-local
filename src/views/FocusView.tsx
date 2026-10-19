import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { addDays } from 'date-fns';
import { Coffee, Flame, Pause, Play, RotateCcw, Settings2, SkipForward, Timer, Volume2, VolumeX } from 'lucide-react';
import { motion } from 'framer-motion';
import { useApp } from '../store';
import { dateKey, humanDay, todayKey } from '../lib/date';
import { formatTimer, playChime } from '../lib/sound';
import { Confetti, IconButton, ProgressRing, Segmented, cx } from '../components/ui';

type TimerMode = 'focus' | 'short' | 'long';

const MODE_META: Record<TimerMode, { label: string; short: string; color: string }> = {
  focus: { label: '专注', short: '专注', color: '#4f76f6' },
  short: { label: '短休息', short: '短休', color: '#10b981' },
  long: { label: '长休息', short: '长休', color: '#8b5cf6' },
};

const STORE_KEY = 'dida-focus-timer-v1';

interface PersistedTimer {
  mode: TimerMode;
  secondsLeft: number;
  running: boolean;
  endAt: number | null;
  taskId: string | null;
  startedAt: string | null;
}

function readPersisted(): PersistedTimer | null {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as PersistedTimer;
    if (!['focus', 'short', 'long'].includes(data.mode)) return null;
    return data;
  } catch {
    return null;
  }
}

export function FocusView({ onOpenSettings }: { onOpenSettings: () => void }) {
  const { state, addFocus, saveSettings, toast } = useApp();
  const initial = useRef(readPersisted()).current;
  const [mode, setMode] = useState<TimerMode>(initial?.mode || 'focus');
  const [secondsLeft, setSecondsLeft] = useState(initial?.secondsLeft ?? (state?.settings.pomodoro.focus ?? 25) * 60);
  const [running, setRunning] = useState(Boolean(initial?.running));
  const [endAt, setEndAt] = useState<number | null>(initial?.endAt ?? null);
  const [taskId, setTaskId] = useState<string | null>(initial?.taskId ?? null);
  const [startedAt, setStartedAt] = useState<string | null>(initial?.startedAt ?? null);
  const [showConfig, setShowConfig] = useState(false);
  const [celebration, setCelebration] = useState(false);
  const completedRef = useRef(false);
  const stateRef = useRef(state);
  stateRef.current = state;

  const pomodoro = state?.settings.pomodoro;
  const durationMinutes = mode === 'focus' ? pomodoro?.focus ?? 25 : mode === 'short' ? pomodoro?.short ?? 5 : pomodoro?.long ?? 15;
  const durationSec = durationMinutes * 60;
  const task = state?.tasks.find((t) => t.id === taskId);

  useEffect(() => {
    if (!state) return;
    if (!initial && !running && !startedAt) setSecondsLeft(durationSec);
  }, [state, initial, running, startedAt, durationSec]);

  useEffect(() => {
    localStorage.setItem(
      STORE_KEY,
      JSON.stringify({ mode, secondsLeft, running, endAt, taskId, startedAt } satisfies PersistedTimer),
    );
  }, [mode, secondsLeft, running, endAt, taskId, startedAt]);

  const finish = useCallback(async () => {
    if (completedRef.current) return;
    completedRef.current = true;
    setRunning(false);
    setEndAt(null);
    setSecondsLeft(0);
    const endedAt = new Date().toISOString();
    await addFocus({
      taskId,
      mode,
      duration: durationMinutes,
      startedAt: startedAt || new Date(Date.now() - durationMinutes * 60000).toISOString(),
      endedAt,
      completed: true,
    });
    if (stateRef.current?.settings.sound) playChime('complete');
    setCelebration(true);
    window.setTimeout(() => setCelebration(false), 1200);
    const label = mode === 'focus' ? '专注完成，休息一下' : '休息结束，回到专注';
    toast(label, 'success');
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(mode === 'focus' ? '专注完成 🎉' : '休息结束', {
        body: mode === 'focus' ? '做得好，起来伸展一下。' : '准备好开始下一轮专注了吗？',
        icon: '/favicon.svg',
      });
    }
    if (mode === 'focus') {
      const next: TimerMode = (stateRef.current?.focusSessions.filter((s) => s.mode === 'focus' && dateKey(new Date(s.startedAt)) === todayKey()).length || 0) % 4 === 3 ? 'long' : 'short';
      setMode(next);
      setSecondsLeft((next === 'short' ? stateRef.current?.settings.pomodoro.short ?? 5 : stateRef.current?.settings.pomodoro.long ?? 15) * 60);
    } else {
      setMode('focus');
      setSecondsLeft((stateRef.current?.settings.pomodoro.focus ?? 25) * 60);
    }
  }, [addFocus, durationMinutes, mode, startedAt, taskId, toast]);

  useEffect(() => {
    if (!running || !endAt) return;
    const tick = () => {
      const left = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left <= 0) finish();
    };
    tick();
    const interval = window.setInterval(tick, 250);
    return () => window.clearInterval(interval);
  }, [running, endAt, finish]);

  useEffect(() => {
    if (!running && secondsLeft !== 0 && Math.abs(secondsLeft - durationSec) > 1) {
      // Keep the paused value; this effect exists only for mode changes.
    }
  }, [durationSec, running, secondsLeft]);

  if (!state) return null;

  const start = async () => {
    if (state.settings.notifications && 'Notification' in window && Notification.permission === 'default') {
      try {
        await Notification.requestPermission();
      } catch {
        // ignore
      }
    }
    if (secondsLeft <= 0) setSecondsLeft(durationSec);
    const seconds = secondsLeft <= 0 ? durationSec : secondsLeft;
    completedRef.current = false;
    setStartedAt(new Date().toISOString());
    setEndAt(Date.now() + seconds * 1000);
    setRunning(true);
  };

  const pause = () => {
    if (endAt) setSecondsLeft(Math.max(0, Math.ceil((endAt - Date.now()) / 1000)));
    setRunning(false);
    setEndAt(null);
  };

  const reset = () => {
    completedRef.current = false;
    setRunning(false);
    setEndAt(null);
    setSecondsLeft(durationSec);
  };

  const skip = () => {
    completedRef.current = false;
    setRunning(false);
    setEndAt(null);
    if (mode === 'focus') {
      setMode('short');
      setSecondsLeft(state.settings.pomodoro.short * 60);
    } else {
      setMode('focus');
      setSecondsLeft(state.settings.pomodoro.focus * 60);
    }
  };

  const changeMode = (next: TimerMode) => {
    completedRef.current = false;
    setMode(next);
    setRunning(false);
    setEndAt(null);
    const minutes = next === 'focus' ? state.settings.pomodoro.focus : next === 'short' ? state.settings.pomodoro.short : state.settings.pomodoro.long;
    setSecondsLeft(minutes * 60);
  };

  const todaySessions = state.focusSessions.filter((s) => s.mode === 'focus' && dateKey(new Date(s.startedAt)) === todayKey());
  const todayMinutes = todaySessions.reduce((sum, s) => sum + s.duration, 0);
  const week = useMemo(() => {
    const days = Array.from({ length: 7 }, (_, i) => addDays(new Date(), i - 6));
    return days.map((day) => {
      const key = dateKey(day);
      const minutes = state.focusSessions
        .filter((s) => s.mode === 'focus' && dateKey(new Date(s.startedAt)) === key)
        .reduce((sum, s) => sum + s.duration, 0);
      return { key, date: day, minutes };
    });
  }, [state.focusSessions]);
  const weekMax = Math.max(1, ...week.map((d) => d.minutes), state.settings.dailyFocusGoal / 3);
  const ratio = durationSec ? Math.max(0, Math.min(1, secondsLeft / durationSec)) : 0;
  const circumference = 2 * Math.PI * 137;
  const openTasks = sortSelectTasks(state.tasks);

  return (
    <section className="focus-view">
      <header className="view-head">
        <div className="view-head-left">
          <span className="view-emoji focus-emoji"><Timer size={20} /></span>
          <div>
            <div className="view-eyebrow">FOCUS</div>
            <h2>专注</h2>
            <div className="view-sub">
              <span>一次只做一件事</span>
              <span className="view-count">今日 {todayMinutes} 分钟</span>
            </div>
          </div>
        </div>
        <div className="view-head-right">
          <IconButton label="计时设置" onClick={() => setShowConfig((v) => !v)} active={showConfig}>
            <Settings2 size={18} />
          </IconButton>
        </div>
      </header>

      <div className="focus-body">
        <div className="focus-stage">
          <div className="focus-mode-switch">
            <Segmented
              value={mode}
              onChange={changeMode}
              options={[
                { value: 'focus', label: '专注' },
                { value: 'short', label: '短休息' },
                { value: 'long', label: '长休息' },
              ]}
            />
          </div>

          <div className={cx('focus-timer-wrap', running && 'is-running', celebration && 'is-celebrating')}>
            <Confetti show={celebration} />
            <svg className="focus-ring" viewBox="0 0 300 300">
              <defs>
                <linearGradient id="focusGradient" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor={running ? '#6d8dff' : '#a5b4fc'} />
                  <stop offset="100%" stopColor={MODE_META[mode].color} />
                </linearGradient>
              </defs>
              <circle cx="150" cy="150" r="137" fill="none" stroke="var(--ring-track)" strokeWidth="7" />
              <motion.circle
                cx="150"
                cy="150"
                r="137"
                fill="none"
                stroke="url(#focusGradient)"
                strokeWidth="7"
                strokeLinecap="round"
                strokeDasharray={circumference}
                animate={{ strokeDashoffset: circumference * (1 - ratio) }}
                transition={{ duration: 0.35, ease: 'linear' }}
                style={{ transform: 'rotate(-90deg)', transformOrigin: '50% 50%' }}
              />
            </svg>
            <div className="focus-timer-inner">
              <span className="focus-mode-label">
                {running ? <span className="focus-pulse" /> : null}
                {MODE_META[mode].label}
              </span>
              <strong className="focus-time">{formatTimer(secondsLeft)}</strong>
              {task ? (
                <button className="focus-task" onClick={() => setTaskId(null)} title="取消关联任务">
                  {task.title}
                </button>
              ) : (
                <span className="focus-task-hint">还没有关联任务</span>
              )}
            </div>
          </div>

          <div className="focus-controls">
            <button className="focus-secondary" onClick={reset} aria-label="重置" title="重置">
              <RotateCcw size={19} />
            </button>
            <motion.button
              className="focus-primary"
              onClick={running ? pause : start}
              whileTap={{ scale: 0.94 }}
              aria-label={running ? '暂停' : '开始'}
            >
              {running ? <Pause size={27} fill="currentColor" /> : <Play size={27} fill="currentColor" />}
            </motion.button>
            <button className="focus-secondary" onClick={skip} aria-label="跳过" title="跳过">
              <SkipForward size={19} />
            </button>
          </div>

          <div className="focus-task-select">
            <span><Flame size={14} /> 关联任务</span>
            <select
              value={taskId || ''}
              onChange={(event) => setTaskId(event.target.value || null)}
              className="select-input"
            >
              <option value="">不关联任务</option>
              {openTasks.map((item) => (
                <option key={item.id} value={item.id}>{item.title}</option>
              ))}
            </select>
          </div>

          <p className="focus-quote">
            {running
              ? '把注意力放在眼前这一件事上。'
              : '开始一段不被打扰的时间，哪怕只有 25 分钟。'}
          </p>
        </div>

        <aside className="focus-side">
          <div className="focus-stat-card">
            <div className="focus-stat-top">
              <span>今日专注</span>
              <span className="focus-stat-icon"><Flame size={16} /></span>
            </div>
            <strong>{todayMinutes}<small>分钟</small></strong>
            <div className="focus-goal-bar">
              <span style={{ width: `${Math.min(100, (todayMinutes / state.settings.dailyFocusGoal) * 100)}%` }} />
            </div>
            <div className="focus-goal-copy">
              <span>目标 {state.settings.dailyFocusGoal} 分钟</span>
              <span>{todaySessions.length} 个番茄</span>
            </div>
          </div>

          <div className="focus-week-card">
            <div className="focus-week-head">
              <span>最近 7 天</span>
              <span>{week.reduce((s, d) => s + d.minutes, 0)} 分钟</span>
            </div>
            <div className="focus-bars">
              {week.map((day) => (
                <div className="focus-bar-col" key={day.key} title={`${humanDay(day.key)} · ${day.minutes} 分钟`}>
                  <div className="focus-bar-track">
                    <motion.span
                      className={cx('focus-bar', day.key === todayKey() && 'is-today')}
                      initial={{ height: 0 }}
                      animate={{ height: `${Math.max(4, (day.minutes / weekMax) * 100)}%` }}
                      transition={{ type: 'spring', stiffness: 220, damping: 28 }}
                    />
                  </div>
                  <span className="focus-bar-label">{['日', '一', '二', '三', '四', '五', '六'][day.date.getDay()]}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="focus-sessions-card">
            <div className="focus-week-head"><span>今天的番茄</span><span>{todaySessions.length} 个</span></div>
            <div className="focus-session-list">
              {todaySessions.length === 0 ? (
                <div className="focus-session-empty">完成第一个番茄后，这里会留下记录。</div>
              ) : (
                todaySessions.slice(0, 5).map((session) => (
                  <div className="focus-session-row" key={session.id}>
                    <span className="focus-session-dot" />
                    <div>
                      <span>{state.tasks.find((t) => t.id === session.taskId)?.title || '自由专注'}</span>
                      <small>{new Date(session.startedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })} · {session.duration} 分钟</small>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {showConfig && (
            <motion.div className="focus-config-card" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
              <div className="focus-week-head"><span>计时设置</span><button className="text-button" onClick={onOpenSettings}>更多</button></div>
              <div className="focus-config-row">
                <span>专注时长</span>
                <Stepper value={state.settings.pomodoro.focus} min={5} max={90} onChange={(value) => saveSettings({ pomodoro: { ...state.settings.pomodoro, focus: value } })} />
              </div>
              <div className="focus-config-row">
                <span>短休息</span>
                <Stepper value={state.settings.pomodoro.short} min={1} max={30} onChange={(value) => saveSettings({ pomodoro: { ...state.settings.pomodoro, short: value } })} />
              </div>
              <div className="focus-config-row">
                <span>长休息</span>
                <Stepper value={state.settings.pomodoro.long} min={5} max={60} onChange={(value) => saveSettings({ pomodoro: { ...state.settings.pomodoro, long: value } })} />
              </div>
              <div className="focus-config-row">
                <span>每日目标</span>
                <Stepper value={state.settings.dailyFocusGoal} min={30} max={480} step={15} suffix="分" onChange={(value) => saveSettings({ dailyFocusGoal: value })} />
              </div>
              <button className="focus-sound-row" onClick={() => saveSettings({ sound: !state.settings.sound })}>
                {state.settings.sound ? <Volume2 size={16} /> : <VolumeX size={16} />}
                <span>完成提示音</span>
                <span className={cx('toggle-switch', state.settings.sound && 'is-on')}><span /></span>
              </button>
            </motion.div>
          )}

          <div className="focus-tip">
            <Coffee size={15} />
            <span>每完成 4 个番茄，安排一次长休息。</span>
          </div>
        </aside>
      </div>
    </section>
  );
}

function Stepper({ value, onChange, min = 0, max = 100, step = 1, suffix = '分' }: { value: number; onChange: (value: number) => void; min?: number; max?: number; step?: number; suffix?: string }) {
  return (
    <div className="stepper">
      <button onClick={() => onChange(Math.max(min, value - step))} disabled={value <= min}>−</button>
      <span>{value}{suffix}</span>
      <button onClick={() => onChange(Math.min(max, value + step))} disabled={value >= max}>+</button>
    </div>
  );
}

function sortSelectTasks(tasks: { id: string; title: string; status: string; deletedAt: string | null; dueAt: string | null; sortOrder: number }[]) {
  return tasks
    .filter((t) => t.status === 'open' && !t.deletedAt)
    .sort((a, b) => (a.dueAt || '9999').localeCompare(b.dueAt || '9999') || a.sortOrder - b.sortOrder)
    .slice(0, 80);
}