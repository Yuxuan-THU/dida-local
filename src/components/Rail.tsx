import {
  Bell,
  CalendarDays,
  ChartNoAxesColumn,
  Flame,
  LayoutGrid,
  ListChecks,
  Search,
  Settings,
  Timer,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { useApp } from '../store';
import type { View } from '../types';
import { cx } from './ui';

type RailView = 'today' | 'calendar' | 'focus' | 'habits' | 'matrix' | 'summary';

const NAV = [
  { key: 'today', label: '任务', icon: ListChecks, hash: '#/today' },
  { key: 'calendar', label: '日历', icon: CalendarDays, hash: '#/calendar' },
  { key: 'focus', label: '专注', icon: Timer, hash: '#/focus' },
  { key: 'habits', label: '习惯', icon: Flame, hash: '#/habits' },
  { key: 'matrix', label: '矩阵', icon: LayoutGrid, hash: '#/matrix' },
  { key: 'summary', label: '摘要', icon: ChartNoAxesColumn, hash: '#/summary' },
] as const;

function activeKey(view: View): RailView | null {
  if (view.kind === 'calendar' || view.kind === 'focus' || view.kind === 'habits' || view.kind === 'matrix' || view.kind === 'summary') {
    return view.kind;
  }
  if (['today', 'next7', 'inbox', 'all', 'list', 'tag', 'filter', 'completed', 'abandoned', 'trash'].includes(view.kind)) {
    return 'today';
  }
  return null;
}

export function Rail({
  view,
  onNavigate,
  onSearch,
  onSettings,
}: {
  view: View;
  onNavigate: (view: View) => void;
  onSearch: () => void;
  onSettings: () => void;
}) {
  const { state } = useApp();
  const active = activeKey(view);
  const name = state?.settings.userName || '我';
  const initial = name.slice(0, 1).toUpperCase();

  return (
    <aside className="rail">
      <div className="rail-top">
        <button className="avatar-button" onClick={onSettings} title="个人资料与设置" aria-label="个人资料与设置">
          <span className="avatar">{initial}</span>
          <span className="avatar-status" />
        </button>
      </div>

      <nav className="rail-nav" aria-label="主导航">
        {NAV.map((item) => {
          const Icon = item.icon;
          const selected = active === item.key;
          return (
            <button
              key={item.key}
              className={cx('rail-item', selected && 'is-active')}
              onClick={() => onNavigate({ kind: item.key } as View)}
              aria-label={item.label}
              aria-current={selected ? 'page' : undefined}
              data-tooltip={item.label}
            >
              {selected && <motion.span className="rail-active-bg" layoutId="rail-active" transition={{ type: 'spring', stiffness: 450, damping: 34 }} />}
              <Icon size={21} strokeWidth={selected ? 2.25 : 1.9} />
            </button>
          );
        })}
      </nav>

      <div className="rail-bottom">
        <button className="rail-item" onClick={onSearch} aria-label="搜索" data-tooltip="搜索  Ctrl K">
          <Search size={21} strokeWidth={1.9} />
        </button>
        <button className="rail-item" onClick={onSettings} aria-label="通知" data-tooltip="提醒与通知">
          <Bell size={21} strokeWidth={1.9} />
          {state?.tasks.some((t) => t.status === 'open' && t.dueAt?.slice(0, 10) === new Date().toISOString().slice(0, 10)) && <span className="rail-dot" />}
        </button>
        <button className="rail-item" onClick={onSettings} aria-label="设置" data-tooltip="设置">
          <Settings size={21} strokeWidth={1.9} />
        </button>
      </div>
    </aside>
  );
}