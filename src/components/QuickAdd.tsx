import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUp, CalendarDays, Flag, ListChecks, Plus, Sparkles, X } from 'lucide-react';
import { motion } from 'framer-motion';
import { useApp } from '../store';
import type { Task } from '../types';
import { parseQuickAdd } from '../lib/parse';
import { formatDue } from '../lib/date';
import { PriorityMenu, DatePickerPanel } from './pickers';
import { IconButton, Popover, PRIORITY_META, cx } from './ui';

export function QuickAdd({
  onCreated,
  focusToken,
  placeholder,
  compact,
  defaultDue,
}: {
  onCreated?: (task: Task) => void;
  focusToken?: number;
  placeholder?: string;
  compact?: boolean;
  defaultDue?: string;
}) {
  const { state, createTask, toast } = useApp();
  const [text, setText] = useState('');
  const [focused, setFocused] = useState(false);
  const [manualDue, setManualDue] = useState<string | null | undefined>(undefined);
  const [manualAllDay, setManualAllDay] = useState<boolean | undefined>(undefined);
  const [manualPriority, setManualPriority] = useState<number | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [justAdded, setJustAdded] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const stateRef = useRef<{ text: string; title: string }>({ text: '', title: '' });

  const parsed = useMemo(() => parseQuickAdd(text), [text]);
  const dueAt = manualDue !== undefined ? manualDue : parsed.dueAt ?? defaultDue ?? null;
  const allDay = manualAllDay !== undefined ? manualAllDay : parsed.allDay;
  const priority = manualPriority !== undefined ? manualPriority : parsed.priority;
  const showPanel = focused || text.length > 0;

  useEffect(() => {
    if (focusToken) inputRef.current?.focus();
  }, [focusToken]);

  useEffect(() => {
    if (!inputRef.current) return;
    inputRef.current.style.height = 'auto';
    inputRef.current.style.height = `${Math.min(140, Math.max(24, inputRef.current.scrollHeight))}px`;
  }, [text]);

  stateRef.current = { text, title: parsed.title };

  const reset = () => {
    setText('');
    setManualDue(undefined);
    setManualAllDay(undefined);
    setManualPriority(undefined);
    setJustAdded(false);
  };

  const submit = async () => {
    const current = stateRef.current;
    if (!current.text.trim() || saving) return;
    setSaving(true);
    const task = await createTask({
      title: parsed.title,
      dueAt,
      allDay,
      priority,
      tags: parsed.tags,
      repeatRule: parsed.repeatRule,
      notes: '',
      stage: 'todo',
    });
    setSaving(false);
    if (task) {
      setJustAdded(true);
      reset();
      window.setTimeout(() => setJustAdded(false), 700);
      inputRef.current?.focus();
      toast('任务已添加', 'success');
      onCreated?.(task);
    }
  };

  const hasMeta = Boolean(dueAt || priority || parsed.tags.length || parsed.repeatRule);
  const dateLabel = dueAt ? formatDue({ dueAt, allDay }) : '';

  return (
    <motion.div
      className={cx('quick-add', showPanel && 'is-expanded', compact && 'is-compact', justAdded && 'just-added')}
      layout
      transition={{ type: 'spring', stiffness: 420, damping: 32 }}
    >
      <div className="quick-add-main">
        <span className={cx('quick-add-plus', justAdded && 'is-done')}>
          {justAdded ? <Sparkles size={17} /> : <Plus size={18} />}
        </span>
        <textarea
          ref={inputRef}
          rows={1}
          value={text}
          placeholder={placeholder || '添加任务'}
          onChange={(event) => setText(event.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => window.setTimeout(() => setFocused(false), 120)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              submit();
            }
            if (event.key === 'Escape') {
              reset();
              inputRef.current?.blur();
            }
          }}
          aria-label="快速添加任务"
        />
        {text && (
          <IconButton label="清空" className="quick-clear" onClick={reset}>
            <X size={14} />
          </IconButton>
        )}
        <motion.button
          type="button"
          className={cx('quick-submit', text.trim() && 'is-ready')}
          onClick={submit}
          aria-label="添加任务"
          whileTap={{ scale: 0.92 }}
        >
          <ArrowUp size={17} />
        </motion.button>
      </div>

      {showPanel && (
        <motion.div
          className="quick-add-toolbar"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
        >
          <div className="quick-tools">
            <Popover
              width={320}
              trigger={() => (
                <button className={cx('quick-tool', dueAt && 'has-value')}>
                  <CalendarDays size={15} />
                  <span>{dateLabel || '日期'}</span>
                </button>
              )}
            >
              {(close) => (
                <DatePickerPanel
                  dueAt={dueAt}
                  allDay={allDay}
                  onChange={(nextDue, nextAllDay) => {
                    setManualDue(nextDue);
                    setManualAllDay(nextAllDay);
                  }}
                  onClose={close}
                  weekStart={state?.settings.weekStart}
                />
              )}
            </Popover>

            <Popover
              width={220}
              trigger={() => (
                <button className={cx('quick-tool', priority > 0 && 'has-value')}>
                  <Flag size={15} color={priority ? PRIORITY_META[priority].color : undefined} fill={priority ? PRIORITY_META[priority].color : 'none'} />
                  <span>{priority ? PRIORITY_META[priority].short : '优先级'}</span>
                </button>
              )}
            >
              {(close) => (
                <PriorityMenu
                  value={priority}
                  onChange={(next) => {
                    setManualPriority(next);
                    close();
                  }}
                />
              )}
            </Popover>

            <span className="quick-hint">
              试试「明天下午 3 点 交周报 !高 #工作」
            </span>
          </div>
          <div className="quick-foot">
            <div className="parsed-chips">
              {dueAt && <span className="parsed-chip date">{dateLabel}</span>}
              {parsed.repeatRule && <span className="parsed-chip">重复</span>}
              {priority > 0 && (
                <span className="parsed-chip priority" style={{ color: PRIORITY_META[priority].color }}>
                  {PRIORITY_META[priority].short}优先级
                </span>
              )}
              {parsed.tags.map((tag) => (
                <span className="parsed-chip tag" key={tag}>#{tag}</span>
              ))}
              {!hasMeta && <span className="parsed-tip">Enter 添加 · Shift + Enter 换行</span>}
            </div>
            <button className="quick-add-button" onClick={submit} disabled={!text.trim()}>
              添加任务
            </button>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}