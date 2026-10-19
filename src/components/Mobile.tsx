import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  CalendarDays,
  CheckCircle2,
  LayoutList,
  Menu,
  MoreHorizontal,
  Plus,
  Search,
  Settings,
  Trash2,
  X,
} from 'lucide-react';
import type { View } from '../types';
import { useApp } from '../store';
import { QuickAdd } from './QuickAdd';
import { Sidebar } from './Sidebar';
import { Modal, cx } from './ui';

const TABS = [
  { key: 'tasks', label: '任务', icon: LayoutList, view: { kind: 'today' } as View },
  { key: 'calendar', label: '日历', icon: CalendarDays, view: { kind: 'calendar' } as View },
] as const;

function tabForView(view: View) {
  if (view.kind === 'calendar') return 'calendar';
  return 'tasks';
}

export function MobileTopBar({
  title,
  onMenu,
  onSearch,
  onAdd,
  showAdd,
}: {
  title: string;
  onMenu: () => void;
  onSearch: () => void;
  onAdd: () => void;
  showAdd: boolean;
}) {
  return (
    <header className="mobile-topbar">
      <button className="mobile-topbar-btn" onClick={onMenu} aria-label="打开菜单">
        <Menu size={21} />
      </button>
      <div className="mobile-brand">
        <span className="mobile-title-text">{title}</span>
      </div>
      <div className="mobile-topbar-actions">
        <button className="mobile-topbar-btn" onClick={onSearch} aria-label="搜索">
          <Search size={20} />
        </button>
        {showAdd && (
          <button className="mobile-topbar-btn is-accent" onClick={onAdd} aria-label="快速添加">
            <Plus size={21} />
          </button>
        )}
      </div>
    </header>
  );
}

export function MobileTabBar({
  view,
  onNavigate,
  onMore,
}: {
  view: View;
  onNavigate: (view: View) => void;
  onMore: () => void;
}) {
  const active = tabForView(view);
  return (
    <nav className="mobile-tabbar" aria-label="手机导航">
      {TABS.map((tab) => {
        const Icon = tab.icon;
        return (
          <button
            key={tab.key}
            className={cx('mobile-tab', active === tab.key && 'is-active')}
            onClick={() => onNavigate(tab.view)}
          >
            {active === tab.key && <motion.span className="mobile-tab-bg" layoutId="mobile-tab-bg" />}
            <Icon size={20} strokeWidth={active === tab.key ? 2.25 : 1.8} />
            <span>{tab.label}</span>
          </button>
        );
      })}
      <button className={cx('mobile-tab', ['abandoned', 'trash', 'completed'].includes(view.kind) && 'is-active')} onClick={onMore}>
        <MoreHorizontal size={21} strokeWidth={2} />
        <span>更多</span>
      </button>
    </nav>
  );
}

export function MobileDrawer({
  open,
  view,
  onClose,
  onNavigate,
  onSettings,
}: {
  open: boolean;
  view: View;
  onClose: () => void;
  onNavigate: (view: View) => void;
  onSettings: () => void;
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="mobile-drawer-layer" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
          <motion.div className="mobile-drawer" initial={{ x: -300 }} animate={{ x: 0 }} exit={{ x: -300 }} transition={{ type: 'spring', stiffness: 360, damping: 34 }}>
            <button className="mobile-drawer-close" onClick={onClose} aria-label="关闭">
              <X size={18} />
            </button>
            <Sidebar
              mobile
              view={view}
              onNavigate={(next) => {
                onNavigate(next);
                onClose();
              }}
              onOpenSettings={() => {
                onClose();
                onSettings();
              }}
            />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function MobileQuickAdd({
  open,
  onClose,
  defaultDue,
}: {
  open: boolean;
  onClose: () => void;
  defaultDue?: string;
}) {
  const [token, setToken] = useState(0);
  useEffect(() => {
    if (open) setToken((value) => value + 1);
  }, [open]);
  return (
    <Modal open={open} onClose={onClose} width={520} className="mobile-sheet">
      <div className="mobile-sheet-head">
        <strong>快速添加</strong>
        <button onClick={onClose} aria-label="关闭"><X size={18} /></button>
      </div>
      <QuickAdd focusToken={token} onCreated={onClose} defaultDue={defaultDue} />
    </Modal>
  );
}

export function MobileMore({
  open,
  onClose,
  onNavigate,
  onSettings,
  onSearch,
}: {
  open: boolean;
  onClose: () => void;
  onNavigate: (view: View) => void;
  onSettings: () => void;
  onSearch: () => void;
}) {
  const { state } = useApp();
  const go = (view: View) => {
    onClose();
    onNavigate(view);
  };
  const items = [
    { label: '已完成', icon: <CheckCircle2 size={19} />, action: () => go({ kind: 'completed' }) },
    { label: '垃圾桶', icon: <Trash2 size={19} />, action: () => go({ kind: 'trash' }) },
    { label: '搜索', icon: <Search size={19} />, action: () => { onClose(); onSearch(); } },
    { label: '设置', icon: <Settings size={19} />, action: () => { onClose(); onSettings(); } },
  ];
  return (
    <Modal open={open} onClose={onClose} width={520} className="mobile-sheet">
      <div className="mobile-sheet-head">
        <div className="mobile-me">
          <span>{(state?.settings.userName || '我').slice(0, 1)}</span>
          <div><strong>{state?.settings.userName || '我'}</strong><small>本地账户</small></div>
        </div>
        <button onClick={onClose} aria-label="关闭"><X size={18} /></button>
      </div>
      <div className="mobile-more-grid">
        {items.map((item) => (
          <button key={item.label} className="mobile-more-item" onClick={item.action}>
            {item.icon}
            <span>{item.label}</span>
          </button>
        ))}
      </div>
      <div className="mobile-more-note">手机与电脑共用同一份本地数据</div>
    </Modal>
  );
}