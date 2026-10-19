import { useState } from 'react';
import { addMonths, format, isSameMonth } from 'date-fns';
import { Check, ChevronLeft, ChevronRight, Clock3, Flag, Repeat2 } from 'lucide-react';
import type { RepeatRule, TaskList } from '../types';
import { addDays, combineDateTime, dateKey, formatDue, monthGrid, monthLabel, parseDateKey, toLocalInput, todayKey } from '../lib/date';
import { PRIORITY_META, cx } from './ui';

const QUICK_DAYS = [
  { label: '今天', offset: 0 },
  { label: '明天', offset: 1 },
  { label: '后天', offset: 2 },
  { label: '下周一', offset: null },
];

function nextMonday() {
  const d = new Date();
  const delta = (8 - d.getDay()) % 7 || 7;
  return addDays(dateKey(), delta);
}

export function DatePickerPanel({
  dueAt,
  allDay,
  onChange,
  onClose,
  weekStart = 1,
}: {
  dueAt: string | null;
  allDay: boolean;
  onChange: (dueAt: string | null, allDay: boolean) => void;
  onClose?: () => void;
  weekStart?: number;
}) {
  const initial = toLocalInput(dueAt);
  const [selectedDate, setSelectedDate] = useState(initial.date || todayKey());
  const [time, setTime] = useState(initial.time || '09:00');
  const [isAllDay, setIsAllDay] = useState(allDay || !initial.time);
  const [month, setMonth] = useState(initial.date ? parseDateKey(initial.date) : new Date());
  const days = monthGrid(month, weekStart);
  const weekLabels = weekStart === 0 ? ['日', '一', '二', '三', '四', '五', '六'] : ['一', '二', '三', '四', '五', '六', '日'];

  const commit = (date: string, nextAllDay = isAllDay, nextTime = time) => {
    setSelectedDate(date);
    onChange(combineDateTime(date, nextAllDay ? '' : nextTime), nextAllDay);
  };

  return (
    <div className="date-panel">
      <div className="quick-date-grid">
        {QUICK_DAYS.map((item) => {
          const key = item.offset == null ? nextMonday() : addDays(todayKey(), item.offset);
          return (
            <button
              key={item.label}
              className={cx('quick-date', selectedDate === key && 'is-active')}
              onClick={() => {
                setMonth(parseDateKey(key));
                commit(key);
              }}
              type="button"
            >
              <span>{item.label}</span>
              <small>{key.slice(5).replace('-', '/')}</small>
            </button>
          );
        })}
      </div>

      <div className="mini-cal-head">
        <button className="mini-nav" onClick={() => setMonth(addMonths(month, -1))} aria-label="上个月">
          <ChevronLeft size={15} />
        </button>
        <span>{monthLabel(month)}</span>
        <button className="mini-nav" onClick={() => setMonth(addMonths(month, 1))} aria-label="下个月">
          <ChevronRight size={15} />
        </button>
      </div>
      <div className="mini-cal-week">
        {weekLabels.map((w) => (
          <span key={w}>{w}</span>
        ))}
      </div>
      <div className="mini-cal-grid">
        {days.map((day) => {
          const key = dateKey(day);
          return (
            <button
              key={key}
              type="button"
              className={cx(
                'mini-day',
                !isSameMonth(day, month) && 'is-outside',
                key === selectedDate && 'is-selected',
                key === todayKey() && 'is-today',
              )}
              onClick={() => commit(key)}
            >
              {day.getDate()}
            </button>
          );
        })}
      </div>

      <div className="date-time-row">
        <label className="switch-row">
          <span><Clock3 size={14} /> 全天</span>
          <button
            type="button"
            className={cx('toggle-switch', isAllDay && 'is-on')}
            onClick={() => {
              const next = !isAllDay;
              setIsAllDay(next);
              commit(selectedDate, next, time);
            }}
            aria-pressed={isAllDay}
          >
            <span />
          </button>
        </label>
        {!isAllDay && (
          <input
            type="time"
            className="time-input"
            value={time}
            onChange={(event) => {
              setTime(event.target.value || '09:00');
              commit(selectedDate, false, event.target.value || '09:00');
            }}
          />
        )}
      </div>

      <div className="date-panel-footer">
        <button className="text-button danger-text" onClick={() => { onChange(null, true); onClose?.(); }}>
          清除日期
        </button>
        <button className="btn primary small" onClick={() => { onChange(combineDateTime(selectedDate, isAllDay ? '' : time), isAllDay); onClose?.(); }}>
          完成
        </button>
      </div>
    </div>
  );
}

export function PriorityMenu({ value, onChange }: { value: number; onChange: (priority: number) => void }) {
  return (
    <div className="menu-list">
      {PRIORITY_META.map((item, index) => (
        <button key={item.label} className="menu-row" onClick={() => onChange(index)}>
          <Flag size={15} fill={index ? item.color : 'none'} color={index ? item.color : 'var(--text-3)'} />
          <span>{item.label}</span>
          {value === index && <Check size={15} className="menu-check" />}
        </button>
      ))}
    </div>
  );
}

export function ListMenu({ lists, value, onChange }: { lists: TaskList[]; value: string; onChange: (id: string) => void }) {
  return (
    <div className="menu-list">
      {lists.map((list) => (
        <button key={list.id} className="menu-row" onClick={() => onChange(list.id)}>
          <span className="menu-emoji">{list.emoji}</span>
          <span>{list.name}</span>
          {value === list.id && <Check size={15} className="menu-check" />}
        </button>
      ))}
    </div>
  );
}

const REPEAT_OPTIONS: { label: string; rule: RepeatRule | null }[] = [
  { label: '不重复', rule: null },
  { label: '每天', rule: { freq: 'daily', interval: 1 } },
  { label: '每个工作日', rule: { freq: 'weekdays', interval: 1 } },
  { label: '每周', rule: { freq: 'weekly', interval: 1, weekdays: [] } },
  { label: '每月', rule: { freq: 'monthly', interval: 1 } },
  { label: '每年', rule: { freq: 'yearly', interval: 1 } },
];

export function RepeatMenu({ value, onChange }: { value: RepeatRule | null; onChange: (rule: RepeatRule | null) => void }) {
  return (
    <div className="menu-list">
      {REPEAT_OPTIONS.map((item) => (
        <button
          key={item.label}
          className="menu-row"
          onClick={() => onChange(item.rule ? { ...item.rule, weekdays: item.rule.freq === 'weekly' ? [new Date().getDay()] : undefined } : null)}
        >
          <Repeat2 size={15} />
          <span>{item.label}</span>
          {JSON.stringify(value || null) === JSON.stringify(item.rule || null) && <Check size={15} className="menu-check" />}
        </button>
      ))}
    </div>
  );
}

export function ReminderMenu({ value, onChange }: { value: number[]; onChange: (value: number[]) => void }) {
  const options = [
    { label: '准时提醒', value: 0 },
    { label: '提前 5 分钟', value: 5 },
    { label: '提前 30 分钟', value: 30 },
    { label: '提前 1 小时', value: 60 },
    { label: '提前 1 天', value: 1440 },
  ];
  return (
    <div className="menu-list">
      {options.map((item) => {
        const checked = value.includes(item.value);
        return (
          <button
            key={item.value}
            className="menu-row"
            onClick={() => onChange(checked ? value.filter((v) => v !== item.value) : [...value, item.value].sort((a, b) => a - b))}
          >
            <Clock3 size={15} />
            <span>{item.label}</span>
            {checked && <Check size={15} className="menu-check" />}
          </button>
        );
      })}
    </div>
  );
}

export function MiniDateLabel({ dueAt, allDay }: { dueAt: string | null; allDay: boolean }) {
  if (!dueAt) return <span className="muted">设置日期</span>;
  return <span>{formatDue({ dueAt, allDay })}</span>;
}