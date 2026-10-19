import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Check, Flag, X } from 'lucide-react';

export function cx(...names: (string | false | null | undefined)[]) {
  return names.filter(Boolean).join(' ');
}

export function IconButton({
  label,
  children,
  className,
  onClick,
  active,
  disabled,
  type = 'button',
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
  onClick?: (e: React.MouseEvent) => void;
  active?: boolean;
  disabled?: boolean;
  type?: 'button' | 'submit';
}) {
  return (
    <button
      type={type}
      className={cx('icon-button', active && 'is-active', className)}
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

export function Checkbox({
  checked,
  onChange,
  color,
  size = 'normal',
  ariaLabel = '完成任务',
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  color?: string;
  size?: 'normal' | 'small';
  ariaLabel?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <button
      type="button"
      className={cx('task-check', checked && 'is-checked', size === 'small' && 'is-small')}
      style={checked && color ? { background: color, borderColor: color } : undefined}
      aria-label={ariaLabel}
      aria-pressed={checked}
      onClick={(event) => {
        event.stopPropagation();
        onChange(!checked);
      }}
    >
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <motion.path
          d="M4.5 10.5 8.2 14 15.5 6.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={false}
          animate={{ pathLength: checked ? 1 : 0, opacity: checked ? 1 : 0 }}
          transition={reduce ? { duration: 0 } : { duration: 0.22, ease: [0.2, 0.9, 0.25, 1] }}
        />
      </svg>
    </button>
  );
}

export const PRIORITY_META = [
  { label: '无优先级', short: '无', color: '#94a3b8' },
  { label: '低优先级', short: '低', color: '#3b82f6' },
  { label: '中优先级', short: '中', color: '#f59e0b' },
  { label: '高优先级', short: '高', color: '#ef4444' },
];

export function PriorityFlag({ priority, size = 14 }: { priority: number; size?: number }) {
  if (!priority) return <Flag size={size} className="priority-none" />;
  const meta = PRIORITY_META[priority] || PRIORITY_META[0];
  return <Flag size={size} fill={meta.color} color={meta.color} />;
}

export function ProgressRing({
  value,
  size = 38,
  stroke = 4,
  color = 'var(--accent)',
  track = 'var(--border)',
  children,
}: {
  value: number;
  size?: number;
  stroke?: number;
  color?: string;
  track?: string;
  children?: React.ReactNode;
}) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(1, value));
  return (
    <div className="progress-ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={track} strokeWidth={stroke} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={false}
          animate={{ strokeDashoffset: circumference * (1 - clamped) }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          style={{ transform: 'rotate(-90deg)', transformOrigin: '50% 50%' }}
        />
      </svg>
      {children && <div className="progress-ring-inner">{children}</div>}
    </div>
  );
}

export function TagPill({
  name,
  color,
  onClick,
  onRemove,
  small,
}: {
  name: string;
  color?: string;
  onClick?: () => void;
  onRemove?: () => void;
  small?: boolean;
}) {
  const c = color || '#64748b';
  return (
    <span
      className={cx('tag-pill', small && 'is-small', onClick && 'is-clickable')}
      style={{ color: c, background: `${c}16` }}
      onClick={onClick}
    >
      <span className="tag-dot" style={{ background: c }} />
      {name}
      {onRemove && (
        <button
          type="button"
          className="tag-remove"
          onClick={(event) => {
            event.stopPropagation();
            onRemove();
          }}
          aria-label={`移除标签 ${name}`}
        >
          <X size={10} />
        </button>
      )}
    </span>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  width = 560,
  footer,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  children: React.ReactNode;
  width?: number;
  footer?: React.ReactNode;
  className?: string;
}) {
  const reduce = useReducedMotion();
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (typeof document === 'undefined') return null;
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="modal-layer"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) onClose();
          }}
        >
          <motion.div
            className={cx('modal-card', className)}
            style={{ width }}
            role="dialog"
            aria-modal="true"
            initial={reduce ? { opacity: 1 } : { opacity: 0, y: 14, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.985 }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
          >
            {title && (
              <div className="modal-head">
                <h2>{title}</h2>
                <IconButton label="关闭" onClick={onClose}>
                  <X size={17} />
                </IconButton>
              </div>
            )}
            <div className="modal-body">{children}</div>
            {footer && <div className="modal-footer">{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

export function Popover({
  trigger,
  children,
  align = 'start',
  width = 280,
  className,
  open: controlledOpen,
  onOpenChange,
}: {
  trigger: (open: boolean) => React.ReactNode;
  children: (close: () => void) => React.ReactNode;
  align?: 'start' | 'end' | 'center';
  width?: number;
  className?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = (next: boolean) => {
    if (controlledOpen == null) setInternalOpen(next);
    onOpenChange?.(next);
  };
  const wrapRef = useRef<HTMLDivElement>(null);
  const id = useId();
  const reduce = useReducedMotion();

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="popover-wrap" ref={wrapRef}>
      <div className="popover-trigger" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls={id}>
        {trigger(open)}
      </div>
      <AnimatePresence>
        {open && (
          <motion.div
            id={id}
            className={cx('popover-panel', `align-${align}`, className)}
            style={{ width }}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: -4, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -3, scale: 0.99 }}
            transition={{ duration: 0.15 }}
            onClick={(event) => event.stopPropagation()}
          >
            {children(() => setOpen(false))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export interface ContextMenuItem {
  label: string;
  icon?: React.ReactNode;
  danger?: boolean;
  onClick?: () => void;
  separator?: boolean;
  checked?: boolean;
  hint?: string;
}

export function ContextMenu({
  x,
  y,
  items,
  onClose,
}: {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const left = Math.min(x, window.innerWidth - 220);
  const top = Math.min(y, window.innerHeight - Math.min(420, items.length * 34 + 20));
  return createPortal(
    <motion.div
      ref={ref}
      className="context-menu"
      style={{ left, top }}
      initial={{ opacity: 0, scale: 0.97, y: -2 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.12 }}
    >
      {items.map((item, i) =>
        item.separator ? (
          <div className="context-separator" key={`sep-${i}`} />
        ) : (
          <button
            key={`${item.label}-${i}`}
            className={cx('context-item', item.danger && 'danger')}
            onClick={() => {
              item.onClick?.();
              onClose();
            }}
          >
            <span className="context-icon">{item.checked ? <Check size={14} /> : item.icon}</span>
            <span>{item.label}</span>
            {item.hint && <span className="context-hint">{item.hint}</span>}
          </button>
        ),
      )}
    </motion.div>,
    document.body,
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  compact,
}: {
  icon: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <motion.div
      className={cx('empty-state', compact && 'is-compact')}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28 }}
    >
      <div className="empty-art">{icon}</div>
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {action && <div className="empty-action">{action}</div>}
    </motion.div>
  );
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="kbd">{children}</kbd>;
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  size = 'normal',
}: {
  value: T;
  options: { value: T; label: React.ReactNode }[];
  onChange: (value: T) => void;
  size?: 'normal' | 'small';
}) {
  return (
    <div className={cx('segmented', size === 'small' && 'is-small')}>
      {options.map((option) => (
        <button
          type="button"
          key={option.value}
          className={cx('segment', value === option.value && 'is-active')}
          onClick={() => onChange(option.value)}
        >
          {value === option.value && <motion.span className="segment-bg" layoutId={`segment-${useIdSafe()}`} />}
          <span className="segment-label">{option.label}</span>
        </button>
      ))}
    </div>
  );
}

let segmentCounter = 0;
function useIdSafe() {
  const ref = useRef<string | null>(null);
  if (!ref.current) ref.current = `seg-${++segmentCounter}`;
  return ref.current;
}

export function Confetti({ show, pieces = 26 }: { show: boolean; pieces?: number }) {
  if (!show) return null;
  const colors = ['#4f76f6', '#f59e0b', '#10b981', '#ec4899', '#8b5cf6', '#06b6d4'];
  return (
    <div className="confetti" aria-hidden="true">
      {Array.from({ length: pieces }).map((_, i) => {
        const angle = (Math.PI * 2 * i) / pieces;
        const distance = 50 + Math.random() * 90;
        return (
          <motion.span
            key={i}
            style={{ background: colors[i % colors.length] }}
            initial={{ x: 0, y: 0, scale: 1, opacity: 1, rotate: 0 }}
            animate={{
              x: Math.cos(angle) * distance,
              y: Math.sin(angle) * distance + 30,
              scale: 0.3,
              opacity: 0,
              rotate: Math.random() * 300,
            }}
            transition={{ duration: 0.8 + Math.random() * 0.45, ease: 'easeOut' }}
          />
        );
      })}
    </div>
  );
}