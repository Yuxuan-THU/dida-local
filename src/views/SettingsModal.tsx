import { useEffect, useRef, useState } from 'react';
import {
  Bell,
  Check,
  Copy,
  Database,
  Download,
  FileUp,
  FolderOpen,
  HardDriveDownload,
  Keyboard,
  Palette,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Smartphone,
  Info,
  Wifi,
  Cloud,
  AlertTriangle,
} from 'lucide-react';
import { useApp } from '../store';
import { api } from '../api';
import type { MobileInfo, TickTickPreview, TickTickSyncStatus } from '../types';
import { todayKey } from '../lib/date';
import { useIsMobile } from '../lib/useMediaQuery';
import { Modal, Segmented, cx } from '../components/ui';

type Tab = 'appearance' | 'mobile' | 'notifications' | 'data' | 'shortcuts' | 'about';

const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
  { key: 'appearance', label: '外观', icon: <Palette size={16} /> },
  { key: 'mobile', label: '手机访问', icon: <Smartphone size={16} /> },
  { key: 'notifications', label: '提醒', icon: <Bell size={16} /> },
  { key: 'data', label: '数据', icon: <Database size={16} /> },
  { key: 'shortcuts', label: '快捷键', icon: <Keyboard size={16} /> },
  { key: 'about', label: '关于', icon: <Info size={16} /> },
];

const ACCENTS = ['#4f76f6', '#7c5cf0', '#10b981', '#f59e0b', '#ec4899', '#06b6d4', '#ef4444'];
const WALLPAPERS: { key: string; label: string; className: string }[] = [
  { key: 'aurora', label: '极光', className: 'wall-aurora' },
  { key: 'paper', label: '纸张', className: 'wall-paper' },
  { key: 'mint', label: '薄荷', className: 'wall-mint' },
  { key: 'none', label: '纯色', className: 'wall-none' },
];

export function SettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, saveSettings, importTickTick, importJson, resetAll, refresh, toast } = useApp();
  const isPhone = useIsMobile();
  const [tab, setTab] = useState<Tab>('appearance');
  const [preview, setPreview] = useState<TickTickPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [importRange, setImportRange] = useState<'future' | 'all'>('future');
  const [importResult, setImportResult] = useState<{ tasks: number; completed: number } | null>(null);
  const [confirmImport, setConfirmImport] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [name, setName] = useState('');
  const [mobileInfo, setMobileInfo] = useState<MobileInfo | null>(null);
  const [mobileError, setMobileError] = useState<string | null>(null);
  const [mobileLoading, setMobileLoading] = useState(false);
  const [syncStatus, setSyncStatus] = useState<TickTickSyncStatus | null>(null);
  const [syncBusy, setSyncBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open && state) setName(state.settings.userName);
  }, [open, state]);

  useEffect(() => {
    if (tab !== 'data' || preview || !open) return;
    setPreviewLoading(true);
    api.previewTickTick(importRange === 'future' ? todayKey() : undefined)
      .then(setPreview)
      .catch(() => setPreview(null))
      .finally(() => setPreviewLoading(false));
  }, [tab, open, preview, importRange]);

  useEffect(() => {
    if (isPhone || tab !== 'mobile' || !open || mobileInfo || mobileLoading || mobileError) return;
    setMobileLoading(true);
    setMobileError(null);
    api.mobileInfo()
      .then(setMobileInfo)
      .catch((error) => setMobileError(error instanceof Error ? error.message : '手机访问未开启'))
      .finally(() => setMobileLoading(false));
  }, [isPhone, tab, open, mobileInfo, mobileLoading, mobileError]);

  useEffect(() => {
    if (tab !== 'data' || !open) return;
    let active = true;
    const load = () => api.ticktickSyncStatus()
      .then((status) => { if (active) setSyncStatus(status); })
      .catch(() => {});
    load();
    const timer = window.setInterval(load, 5000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [tab, open]);

  if (!state) return null;
  const settings = state.settings;

  const requestNotifications = async () => {
    if (settings.notifications) {
      await saveSettings({ notifications: false });
      toast('桌面提醒已关闭', 'info');
      return;
    }
    if (!('Notification' in window)) {
      toast('当前浏览器不支持系统通知', 'error');
      return;
    }
    const permission = await Notification.requestPermission();
    await saveSettings({ notifications: permission === 'granted' });
    toast(permission === 'granted' ? '提醒通知已开启' : '未获得通知权限', permission === 'granted' ? 'success' : 'info');
  };

  const doImport = async () => {
    setConfirmImport(false);
    const result = await importTickTick({
      fromDate: importRange === 'future' ? todayKey() : null,
      includeHabits: false,
      keepFilters: false,
    });
    if (result) {
      setImportResult(result);
      setPreview(null);
    }
  };

  const changeSync = async (patch: { enabled?: boolean; scope?: 'all' | 'future' }) => {
    try {
      const next = await api.saveTicktickSync(patch);
      setSyncStatus(next);
      toast(next.enabled ? '官方滴答自动同步已开启' : '官方滴答自动同步已关闭', next.enabled ? 'success' : 'info');
    } catch (error) {
      toast(error instanceof Error ? error.message : '保存同步设置失败', 'error');
    }
  };

  const runSyncNow = async () => {
    setSyncBusy(true);
    try {
      const result = await api.syncTicktick();
      if (result.status) setSyncStatus(result.status);
      if (result.ok) {
        await refresh();
        const changed = result.changed || {};
        toast(`同步完成：新增 ${changed.added || 0}，更新 ${changed.updated || 0}`, 'success');
      } else {
        toast(result.error || '同步失败', 'error');
      }
    } catch (error) {
      toast(error instanceof Error ? error.message : '同步失败', 'error');
    } finally {
      setSyncBusy(false);
    }
  };

  const readBackup = async (file: File) => {
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      await importJson(data);
      onClose();
    } catch {
      toast('备份文件格式不正确', 'error');
    }
  };

  return (
    <>
      <Modal open={open} onClose={onClose} title="设置" width={820} className="settings-modal">
        <div className="settings-layout">
          <aside className="settings-tabs">
            <div className="settings-profile">
              <span className="settings-avatar">{(settings.userName || '我').slice(0, 1)}</span>
              <div><strong>{settings.userName}</strong><span>本地账户</span></div>
            </div>
            {TABS.filter((item) => !isPhone || item.key !== 'mobile').map((item) => (
              <button key={item.key} className={cx('settings-tab', tab === item.key && 'is-active')} onClick={() => setTab(item.key)}>
                {item.icon}<span>{item.label}</span>
              </button>
            ))}
            <div className="settings-local-note"><ShieldCheck size={14} /> 数据仅保存在本机</div>
          </aside>

          <div className="settings-content">
            {tab === 'appearance' && (
              <div className="settings-section">
                <h3>外观</h3>
                <p className="settings-lead">让任务看起来像你的工作台。</p>
                <div className="setting-row">
                  <span className="setting-label">主题<small>跟随系统时会自动切换</small></span>
                  <Segmented
                    value={settings.theme}
                    onChange={(theme) => saveSettings({ theme })}
                    options={[
                      { value: 'light', label: '浅色' },
                      { value: 'dark', label: '深色' },
                      { value: 'auto', label: '跟随系统' },
                    ]}
                    size="small"
                  />
                </div>
                <div className="setting-row vertical">
                  <span className="setting-label">强调色</span>
                  <div className="accent-row">
                    {ACCENTS.map((color) => (
                      <button
                        key={color}
                        className={cx('accent-choice', settings.accent === color && 'is-active')}
                        style={{ background: color }}
                        onClick={() => saveSettings({ accent: color })}
                        aria-label={color}
                      >
                        {settings.accent === color && <Check size={14} />}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="setting-row vertical">
                  <span className="setting-label">背景纹理</span>
                  <div className="wallpaper-grid">
                    {WALLPAPERS.map((wall) => (
                      <button
                        key={wall.key}
                        className={cx('wallpaper-choice', wall.className, settings.wallpaper === wall.key && 'is-active')}
                        onClick={() => saveSettings({ wallpaper: wall.key })}
                      >
                        <span>{wall.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="setting-row">
                  <span className="setting-label">显示密度</span>
                  <Segmented
                    value={settings.density}
                    onChange={(density) => saveSettings({ density })}
                    options={[
                      { value: 'comfortable', label: '舒适' },
                      { value: 'compact', label: '紧凑' },
                    ]}
                    size="small"
                  />
                </div>
                <div className="setting-row">
                  <span className="setting-label">一周开始于</span>
                  <Segmented
                    value={String(settings.weekStart)}
                    onChange={(value) => saveSettings({ weekStart: Number(value) })}
                    options={[
                      { value: '1', label: '周一' },
                      { value: '0', label: '周日' },
                    ]}
                    size="small"
                  />
                </div>
                <div className="setting-row">
                  <span className="setting-label">你的名字</span>
                  <input
                    className="text-input compact"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    onBlur={() => {
                      if (name.trim() && name.trim() !== settings.userName) saveSettings({ userName: name.trim() });
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') (event.currentTarget as HTMLInputElement).blur();
                    }}
                  />
                </div>
                <div className="setting-row">
                  <span className="setting-label">每日任务目标</span>
                  <div className="stepper">
                    <button onClick={() => saveSettings({ dailyTaskGoal: Math.max(1, settings.dailyTaskGoal - 1) })}>−</button>
                    <span>{settings.dailyTaskGoal} 个</span>
                    <button onClick={() => saveSettings({ dailyTaskGoal: Math.min(50, settings.dailyTaskGoal + 1) })}>+</button>
                  </div>
                </div>
                <div className="setting-row">
                  <span className="setting-label">完成提示音</span>
                  <button className={cx('toggle-switch', settings.sound && 'is-on')} onClick={() => saveSettings({ sound: !settings.sound })} aria-pressed={settings.sound}><span /></button>
                </div>
              </div>
            )}

            {tab === 'mobile' && (
              <div className="settings-section">
                <h3>手机访问</h3>
                <p className="settings-lead">手机和电脑连同一个 Wi-Fi，直接使用电脑上的同一份数据。</p>
                {mobileLoading && <p className="muted">正在生成手机访问地址…</p>}
                {!mobileLoading && mobileInfo && (
                  <>
                    <div className="mobile-access-card">
                      {mobileInfo.qrDataUrl ? (
                        <img className="mobile-qr" src={mobileInfo.qrDataUrl} alt="手机访问二维码" />
                      ) : (
                        <div className="mobile-qr is-empty"><Smartphone size={30} /></div>
                      )}
                      <div className="mobile-access-copy">
                        <strong>用手机相机或浏览器扫码</strong>
                        <span>首次打开后，建议在浏览器菜单中选择「添加到主屏幕」。</span>
                        <div className="mobile-url-row">
                          <code>{mobileInfo.urls[0] || '没有检测到局域网地址'}</code>
                          <button
                            className="icon-button"
                            title="复制访问链接"
                            onClick={async () => {
                              const url = mobileInfo.urls[0];
                              if (!url) return;
                              try {
                                await navigator.clipboard.writeText(url);
                                toast('访问链接已复制', 'success');
                              } catch {
                                window.prompt('复制访问链接', url);
                              }
                            }}
                          >
                            <Copy size={15} />
                          </button>
                        </div>
                        {mobileInfo.urls.length > 1 && (
                          <div className="mobile-url-list">
                            {mobileInfo.urls.slice(1).map((url) => <code key={url}>{url}</code>)}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="setting-note">
                      <Wifi size={15} />
                      <span>电脑需要保持开机。手机和电脑必须在同一 Wi-Fi；访客网络通常无法互访。</span>
                    </div>
                    <div className="settings-help">
                      打不开时：确认 Windows 防火墙允许 Node.js 访问「专用网络」；或先用 USB 数据线连接手机，
                      在电脑执行 <code>adb reverse tcp:4317 tcp:4317</code>，手机浏览器打开 <code>http://127.0.0.1:4317/</code>。
                    </div>
                  </>
                )}
                {!mobileLoading && mobileError && (
                  <div className="mobile-access-error">
                    <Smartphone size={24} />
                    <strong>当前没有开启手机访问</strong>
                    <p>{mobileError}</p>
                    <p>请关闭并重新运行「启动滴答清单.cmd」，新版会以手机共享模式启动。</p>
                  </div>
                )}
              </div>
            )}

            {tab === 'notifications' && (
              <div className="settings-section">
                <h3>提醒</h3>
                <p className="settings-lead">任务到期时，在桌面收到通知。</p>
                <div className="notification-hero">
                  <span className="notification-icon"><Bell size={22} /></span>
                  <div>
                    <strong>{settings.notifications ? '桌面提醒已开启' : '开启桌面提醒'}</strong>
                    <p>{('Notification' in window) && Notification.permission === 'granted' ? '系统权限已授予，任务到期时会通知你。' : '需要浏览器授权通知权限。提醒只在应用打开时检查。'}</p>
                  </div>
                  <button className={cx('btn', settings.notifications ? 'ghost' : 'primary')} onClick={requestNotifications}>
                    {settings.notifications ? '关闭提醒' : '开启提醒'}
                  </button>
                </div>
                <div className="setting-note">
                  <ShieldCheck size={15} />
                  <span>所有提醒逻辑在本机运行，不会上传任何任务内容。</span>
                </div>
                <h4 className="settings-subhead">提醒规则</h4>
                <p className="settings-help">任务详情里可以为每个任务添加「准时 / 提前 5 分钟 / 30 分钟 / 1 小时 / 1 天」提醒；全天任务默认在当天 09:00 提醒。</p>
              </div>
            )}

            {tab === 'data' && (
              <div className="settings-section">
                <h3>数据</h3>
                <p className="settings-lead">数据保存在这台电脑上，随时可以迁移或备份。</p>

                <div className="data-card sync-card">
                  <div className="data-card-head">
                    <span className="data-icon sync"><RefreshCw size={20} className={syncStatus?.running ? 'is-spinning' : ''} /></span>
                    <div>
                      <strong>
                        官方滴答自动同步
                        <span className={cx('sync-state', syncStatus?.enabled && 'is-on')}>{syncStatus?.enabled ? '已开启' : '已关闭'}</span>
                      </strong>
                      <span>读取官方桌面版数据库，手机上的改动会经官方同步进入这里</span>
                    </div>
                  </div>
                  {!syncStatus && <p className="muted">正在读取同步状态…</p>}
                  {syncStatus && (
                    <>
                      <div className="sync-scope-row">
                        <span>同步范围</span>
                        <Segmented
                          value={syncStatus.scope}
                          onChange={(value) => changeSync({ scope: value as 'all' | 'future' })}
                          options={[
                            { value: 'all', label: '全部消息' },
                            { value: 'future', label: '今天及以后' },
                          ]}
                          size="small"
                        />
                      </div>
                      <div className="sync-summary">
                        <span>上次同步：<strong>{syncStatus.lastSync ? new Date(syncStatus.lastSync).toLocaleString('zh-CN') : '尚未同步'}</strong></span>
                        <span>{syncStatus.stats.tasks ? `官方 ${syncStatus.stats.tasks} 条任务` : '等待首次同步'}</span>
                        {syncStatus.conflicts > 0 && <span className="sync-conflict"><AlertTriangle size={12} /> {syncStatus.conflicts} 条本地修改未覆盖</span>}
                      </div>
                      {!syncStatus.sourceExists && (
                        <div className="sync-warning"><AlertTriangle size={14} /> 找不到官方滴答数据库，请先安装并至少运行一次官方客户端。</div>
                      )}
                      {syncStatus.lastError && (
                        <div className="sync-warning"><AlertTriangle size={14} /> {syncStatus.lastError}</div>
                      )}
                      <p className="sync-caution">
                        单向镜像：官方 → 本地。官方客户端需要保持在后台运行；在本应用内做的修改暂时不会写回官方或手机。
                      </p>
                      <div className="data-card-actions">
                        <button className="btn primary" onClick={runSyncNow} disabled={syncBusy || !syncStatus.sourceExists}>
                          <RefreshCw size={14} className={syncBusy ? 'is-spinning' : ''} /> {syncBusy ? '同步中…' : '立即同步'}
                        </button>
                        <button className="btn ghost" onClick={() => changeSync({ enabled: !syncStatus.enabled })}>
                          {syncStatus.enabled ? '关闭自动同步' : '开启自动同步'}
                        </button>
                      </div>
                      <div className="sync-source"><Cloud size={13} /> {syncStatus.source}</div>
                    </>
                  )}
                </div>

                <div className="data-card">
                  <div className="data-card-head">
                    <span className="data-icon tt"><HardDriveDownload size={20} /></span>
                    <div><strong>从滴答清单导入</strong><span>读取本机已安装的滴答清单数据</span></div>
                  </div>
                  <div className="import-range">
                    <Segmented
                      value={importRange}
                      onChange={(value) => {
                        setImportRange(value);
                        setPreview(null);
                      }}
                      options={[
                        { value: 'future', label: '今天及以后' },
                        { value: 'all', label: '全部历史' },
                      ]}
                      size="small"
                    />
                    <p>{importRange === 'future' ? `只导入到期日在 ${todayKey()} 及以后的任务，今天之前的任务不会迁移。` : '导入全部历史任务，包括已完成和已放弃的任务。'}</p>
                  </div>
                  {previewLoading && <p className="muted">正在读取本机数据…</p>}
                  {!previewLoading && preview && (
                    <div className="import-preview">
                      <span><strong>{importRange === 'future' ? preview.futureTasks : preview.tasks}</strong> 个任务</span>
                      <span><strong>{importRange === 'future' ? preview.futureCompleted : preview.completed}</strong> 个已完成</span>
                    </div>
                  )}
                  {!previewLoading && !preview && <p className="muted">没有检测到滴答清单数据（%APPDATA%\Tick_Tick\TickTick.db）。</p>}
                  {importResult && (
                    <div className="import-success">
                      <Check size={15} /> 已导入 {importResult.tasks} 个任务
                    </div>
                  )}
                  <div className="data-card-actions">
                    <button className="btn primary" disabled={!preview || previewLoading || (importRange === 'future' && preview.futureTasks === 0)} onClick={() => setConfirmImport(true)}>
                      {importRange === 'future' ? '导入今天起的任务' : '导入全部数据'}
                    </button>
                    <button className="btn ghost" onClick={() => {
                      setPreview(null);
                      setImportResult(null);
                      setTab('data');
                    }}>重新检测</button>
                  </div>
                </div>

                <div className="data-card">
                  <div className="data-card-head">
                    <span className="data-icon backup"><Download size={20} /></span>
                    <div><strong>备份与恢复</strong><span>导出完整 JSON，或从备份恢复</span></div>
                  </div>
                  <div className="data-card-actions">
                    <a className="btn ghost" href={api.exportUrl} download>导出备份</a>
                    <button className="btn ghost" onClick={() => fileRef.current?.click()}><FileUp size={15} /> 导入备份</button>
                    <input
                      ref={fileRef}
                      type="file"
                      accept="application/json,.json"
                      hidden
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) readBackup(file);
                        event.target.value = '';
                      }}
                    />
                  </div>
                </div>

                <div className="data-card danger-card">
                  <div className="data-card-head">
                    <span className="data-icon danger"><RotateCcw size={20} /></span>
                    <div><strong>恢复演示数据</strong><span>清空当前数据，重新载入示例</span></div>
                  </div>
                  <div className="data-card-actions">
                    <button className="btn danger ghost" onClick={() => setConfirmReset(true)}>重置所有数据</button>
                  </div>
                </div>

                <div className="data-path">
                  <FolderOpen size={14} />
                  <span>本地数据库：<code>dida/data/dida.db</code></span>
                </div>
              </div>
            )}

            {tab === 'shortcuts' && (
              <div className="settings-section">
                <h3>快捷键</h3>
                <p className="settings-lead">少动鼠标，多做一点。</p>
                <div className="shortcut-list">
                  {[
                    ['快速添加任务', 'Q'],
                    ['全局搜索', 'Ctrl / ⌘ + K'],
                    ['回到今天', 'T'],
                    ['打开日历', 'C'],
                    ['关闭详情 / 弹窗', 'Esc'],
                    ['提交快速添加', 'Enter'],
                    ['换行（快速添加）', 'Shift + Enter'],
                  ].map(([label, keys]) => (
                    <div className="shortcut-row" key={label}>
                      <span>{label}</span>
                      <span className="shortcut-keys">
                        {keys.split(' + ').map((key) => <kbd key={key}>{key}</kbd>)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {tab === 'about' && (
              <div className="settings-section">
                <h3>关于</h3>
                <div className="about-hero">
                  <span className="about-logo"><Check size={26} /></span>
                  <div>
                    <strong>滴答 · 本地任务</strong>
                    <span>版本 1.3.0 · 本地优先</span>
                  </div>
                </div>
                <p className="settings-lead">
                  一个完全运行在本机的任务与日历工具。界面与交互参考滴答清单的公开产品形态，代码与视觉素材均为独立实现，不包含原软件的任何专有代码或资源。
                </p>
                <div className="about-grid">
                  <div><span>数据存储</span><strong>SQLite（本机）</strong></div>
                  <div><span>网络请求</span><strong>无外部请求</strong></div>
                  <div><span>逆向分析</span><strong>REA · 静态证据</strong></div>
                  <div><span>前端</span><strong>React + Vite</strong></div>
                </div>
                <div className="setting-note">
                  <Info size={15} />
                  <span>如果需要迁移到另一台电脑，请在「数据」中导出备份后再导入。</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </Modal>

      <Modal
        open={confirmImport}
        onClose={() => setConfirmImport(false)}
        title="导入滴答清单数据"
        width={460}
        footer={
          <>
            <button className="btn ghost" onClick={() => setConfirmImport(false)}>取消</button>
            <button className="btn primary" onClick={doImport}>开始导入</button>
          </>
        }
      >
        <p className="modal-copy">
          {importRange === 'future'
            ? `将只导入到期日在 ${todayKey()} 及以后的任务，今天之前的任务不会迁移。`
            : '将导入滴答清单的全部历史任务，包括已完成和已放弃的任务。'}
          {' '}导入会替换当前的任务和标签。导入前会自动生成一份 JSON 备份，保存在 <code>dida/data/backups</code>。
        </p>
      </Modal>

      <Modal
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        title="重置所有数据"
        width={440}
        footer={
          <>
            <button className="btn ghost" onClick={() => setConfirmReset(false)}>取消</button>
            <button className="btn danger" onClick={async () => { setConfirmReset(false); await resetAll(); onClose(); }}>确认重置</button>
          </>
        }
      >
        <p className="modal-copy">当前所有任务和标签都会被删除，并恢复为演示数据。这个操作无法撤销。</p>
      </Modal>
    </>
  );
}