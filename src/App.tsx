import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, AlertCircle, RefreshCcw } from 'lucide-react';
import { AppProvider, useApp } from './store';
import type { View } from './types';
import { parseHash, viewHash } from './lib/router';
import { parseDue, todayKey } from './lib/date';
import { useIsMobile } from './lib/useMediaQuery';
import { Rail } from './components/Rail';
import { Sidebar } from './components/Sidebar';
import { MobileDrawer, MobileMore, MobileQuickAdd, MobileTabBar, MobileTopBar } from './components/Mobile';
import { Toasts } from './components/Toasts';
import { TaskView } from './views/TaskView';
import { DetailPane } from './views/DetailPane';
import { CalendarView } from './views/CalendarView';
import { SearchPalette } from './views/SearchPalette';
import { SettingsModal } from './views/SettingsModal';

function Splash() {
  return (
    <div className="splash">
      <motion.div className="splash-logo" initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 240, damping: 20 }}>
        <Check size={30} />
      </motion.div>
      <h1>滴答</h1>
      <p>正在打开你的清单…</p>
      <div className="splash-loader"><span /></div>
    </div>
  );
}

function ErrorScreen({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <div className="splash">
      <div className="splash-logo is-error"><AlertCircle size={28} /></div>
      <h1>无法连接本地服务</h1>
      <p>{error}</p>
      <button className="btn primary" onClick={onRetry}><RefreshCcw size={15} /> 重试</button>
      <p className="splash-hint">请确认本地服务正在运行，或重新打开启动脚本。</p>
    </div>
  );
}

function useTheme() {
  const { state } = useApp();
  const [systemDark, setSystemDark] = useState(false);
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    setSystemDark(media.matches);
    const listener = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }, []);
  if (!state) return { theme: 'light', accent: '#4f76f6', wallpaper: 'aurora' };
  const theme = state.settings.theme === 'auto' ? (systemDark ? 'dark' : 'light') : state.settings.theme;
  return { theme, accent: state.settings.accent, wallpaper: state.settings.wallpaper };
}

function useReminders() {
  const { state, toast } = useApp();
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    if (!state?.settings.notifications) return;
    const check = () => {
      const now = Date.now();
      const current = stateRef.current;
      if (!current) return;
      let notified: Record<string, number> = {};
      try {
        notified = JSON.parse(localStorage.getItem('dida-notified-v1') || '{}');
      } catch {
        notified = {};
      }
      let changed = false;
      for (const task of current.tasks) {
        if (task.deletedAt || task.status !== 'open' || !task.dueAt) continue;
        const due = parseDue(task.allDay ? `${task.dueAt.slice(0, 10)}T09:00` : task.dueAt);
        if (!due) continue;
        const offsets = task.reminders.length ? task.reminders : [0];
        for (const offset of offsets) {
          const trigger = due.getTime() - offset * 60000;
          if (now < trigger || now - trigger > 5 * 60000) continue;
          const key = `${task.id}-${task.dueAt}-${offset}`;
          if (notified[key]) continue;
          notified[key] = now;
          changed = true;
          toast(`提醒：${task.title}`, 'info');
          if ('Notification' in window && Notification.permission === 'granted') {
            new Notification('滴答提醒', { body: task.title, icon: '/favicon.svg', tag: task.id });
          }
        }
      }
      for (const [key, timestamp] of Object.entries(notified)) {
        if (now - timestamp > 7 * 86400000) delete notified[key];
      }
      if (changed || Object.keys(notified).length) localStorage.setItem('dida-notified-v1', JSON.stringify(notified));
    };
    check();
    const interval = window.setInterval(check, 20000);
    return () => window.clearInterval(interval);
  }, [state?.settings.notifications, toast]);
}

function AppShell() {
  const { state, loading, error, refresh } = useApp();
  const isMobile = useIsMobile();
  const [view, setView] = useState<View>(() => parseHash(window.location.hash));
  const [selectedTask, setSelectedTask] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [quickAddToken, setQuickAddToken] = useState(0);
  const [mobileDrawer, setMobileDrawer] = useState(false);
  const [mobileMore, setMobileMore] = useState(false);
  const [mobileQuickAdd, setMobileQuickAdd] = useState(false);
  const theme = useTheme();
  useReminders();

  useEffect(() => {
    const onHash = () => setView(parseHash(window.location.hash));
    window.addEventListener('hashchange', onHash);
    window.addEventListener('popstate', onHash);
    return () => {
      window.removeEventListener('hashchange', onHash);
      window.removeEventListener('popstate', onHash);
    };
  }, []);

  const navigate = (next: View) => {
    const hash = viewHash(next);
    if (window.location.hash !== hash) window.history.pushState(null, '', hash);
    setView(next);
    setSelectedTask(null);
    setMobileDrawer(false);
    setMobileMore(false);
  };

  useEffect(() => {
    if (!state) return;
    document.title = state.settings.userName ? `${state.settings.userName} · 滴答清单` : '滴答 · 本地清单';
    document.documentElement.dataset.theme = theme.theme;
    document.documentElement.style.setProperty('--accent', theme.accent);
    document.documentElement.style.setProperty('--wallpaper', theme.wallpaper);
  }, [state, theme]);

  useEffect(() => {
    if (selectedTask && state && !state.tasks.some((t) => t.id === selectedTask)) setSelectedTask(null);
  }, [selectedTask, state]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      const typing = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable);
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearchOpen((value) => !value);
        return;
      }
      if (event.key === 'Escape') {
        if (mobileDrawer) setMobileDrawer(false);
        else if (mobileMore) setMobileMore(false);
        else if (mobileQuickAdd) setMobileQuickAdd(false);
        else if (searchOpen) setSearchOpen(false);
        else if (settingsOpen) setSettingsOpen(false);
        else if (selectedTask) setSelectedTask(null);
        return;
      }
      if (typing || event.ctrlKey || event.metaKey || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === 'q') {
        event.preventDefault();
        if (!['today', 'next7', 'inbox', 'all', 'list', 'tag', 'filter'].includes(view.kind)) navigate({ kind: 'today' });
        setQuickAddToken((token) => token + 1);
      } else if (key === 't') {
        navigate({ kind: 'today' });
      } else if (key === 'c') {
        navigate({ kind: 'calendar' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [searchOpen, settingsOpen, selectedTask, view.kind, mobileDrawer, mobileMore, mobileQuickAdd]);

  if (loading) return <Splash />;
  if (error || !state) return <ErrorScreen error={error || '未知错误'} onRetry={refresh} />;

  const isTaskView = ['today', 'next7', 'all', 'completed', 'abandoned', 'trash', 'tag', 'filter'].includes(view.kind);
  const detailOpen = Boolean(selectedTask);

  const mobileTitle = (() => {
    switch (view.kind) {
      case 'today': return '今天';
      case 'next7': return '最近 7 天';
      case 'all': return '所有任务';
      case 'completed': return '已完成';
      case 'abandoned': return '已放弃';
      case 'trash': return '垃圾桶';
      case 'tag': return `# ${view.name}`;
      case 'filter': return state.filters.find((f) => f.id === view.id)?.name || '过滤器';
      case 'calendar': return '日历';
      default: return '滴答';
    }
  })();

  const renderView = () => (
    <>
      {isTaskView && (
        <TaskView
          view={view}
          quickAddToken={quickAddToken}
          onOpenTask={setSelectedTask}
          onOpenSettings={() => setSettingsOpen(true)}
        />
      )}
      {view.kind === 'calendar' && <CalendarView onOpenTask={setSelectedTask} />}
    </>
  );

  return (
    <div className={`app${isMobile ? ' is-mobile' : ''}${detailOpen ? ' has-detail' : ''}`} data-theme={theme.theme} data-wallpaper={theme.wallpaper}>
      <div className="app-bg" aria-hidden="true" />
      {!isMobile && (
        <>
          <Rail
            view={view}
            onNavigate={navigate}
            onSearch={() => setSearchOpen(true)}
            onSettings={() => setSettingsOpen(true)}
          />
          <Sidebar view={view} onNavigate={navigate} onOpenSettings={() => setSettingsOpen(true)} />
        </>
      )}

      <div className="app-body">
        {isMobile && (
          <MobileTopBar
            title={mobileTitle}
            onMenu={() => setMobileDrawer(true)}
            onSearch={() => setSearchOpen(true)}
            onAdd={() => setMobileQuickAdd(true)}
            showAdd={false}
          />
        )}

        <div className={cnWorkspace(detailOpen)}>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              className="view-slot"
              key={`${view.kind}-${'id' in view ? view.id : ''}`}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18, ease: [0.2, 0.8, 0.3, 1] }}
            >
              {renderView()}
            </motion.div>
          </AnimatePresence>

          <AnimatePresence>
            {selectedTask && <DetailPane taskId={selectedTask} onClose={() => setSelectedTask(null)} />}
          </AnimatePresence>
        </div>

        {isMobile && (
          <MobileTabBar
            view={view}
            onNavigate={navigate}
            onMore={() => setMobileMore(true)}
          />
        )}
      </div>

      {isMobile && (
        <>
          {isTaskView && !detailOpen && (
            <button className="mobile-fab" onClick={() => setMobileQuickAdd(true)} aria-label="快速添加任务">
              <span>+</span>
            </button>
          )}
          <MobileDrawer
            open={mobileDrawer}
            view={view}
            onClose={() => setMobileDrawer(false)}
            onNavigate={navigate}
            onSettings={() => setSettingsOpen(true)}
          />
          <MobileMore
            open={mobileMore}
            onClose={() => setMobileMore(false)}
            onNavigate={navigate}
            onSettings={() => setSettingsOpen(true)}
            onSearch={() => setSearchOpen(true)}
          />
          <MobileQuickAdd
            open={mobileQuickAdd}
            defaultDue={view.kind === 'today' ? todayKey() : undefined}
            onClose={() => setMobileQuickAdd(false)}
          />
        </>
      )}

      <SearchPalette
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onOpenTask={setSelectedTask}
        onNavigate={navigate}
        onSettings={() => setSettingsOpen(true)}
      />
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <Toasts />
    </div>
  );
}

function cnWorkspace(detailOpen: boolean) {
  return `workspace${detailOpen ? ' has-detail' : ''}`;
}

export default function App() {
  return (
    <AppProvider>
      <AppShell />
    </AppProvider>
  );
}