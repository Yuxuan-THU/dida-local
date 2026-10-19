const { app, BrowserWindow, Tray, Menu, globalShortcut, nativeImage, shell, session, dialog } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const PORT = 4317;
const URL = `http://127.0.0.1:${PORT}/`;
let mainWindow = null;
let tray = null;
let serverProcess = null;
let quitting = false;

if (app.isPackaged) {
  app.setPath('userData', path.join(app.getPath('appData'), 'DidaLocal'));
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();

function dataDir() {
  return app.isPackaged ? path.join(app.getPath('userData'), 'data') : path.join(root, 'data');
}

async function healthy() {
  try {
    const response = await fetch(`${URL}api/health`, { signal: AbortSignal.timeout(800) });
    if (!response.ok) return false;
    const data = await response.json();
    return data && data.app === 'dida-local';
  } catch {
    return false;
  }
}

async function ensureServer() {
  if (await healthy()) return;
  fs.mkdirSync(dataDir(), { recursive: true });
  const log = fs.openSync(path.join(dataDir(), 'server.log'), 'a');
  serverProcess = spawn(process.execPath, [path.join(root, 'server', 'server.mjs'), '--mobile'], {
    cwd: root,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      DIDA_PORT: String(PORT),
      DIDA_DATA_DIR: dataDir(),
      DIDA_MOBILE: '1',
    },
    detached: false,
    stdio: ['ignore', log, log],
    windowsHide: true,
  });
  serverProcess.on('exit', () => {
    serverProcess = null;
  });
  for (let i = 0; i < 50; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    if (await healthy()) return;
  }
  throw new Error('本地服务启动超时，请查看 data/server.log。');
}

function createWindow() {
  const icon = path.join(root, 'assets', 'app.png');
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 930,
    minWidth: 980,
    minHeight: 640,
    title: '滴答 · 本地清单',
    backgroundColor: '#eef1f7',
    icon,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
      spellcheck: true,
    },
  });
  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadURL(URL);
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('close', (event) => {
    if (!quitting) {
      event.preventDefault();
      mainWindow.hide();
      if (tray) {
        tray.displayBalloon?.({
          title: '滴答仍在运行',
          content: '点击托盘图标可以重新打开，或在托盘菜单中退出。',
          iconType: 'info',
        });
      }
    }
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(URL)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });
}

function createTray() {
  const image = nativeImage.createFromPath(path.join(root, 'assets', 'tray.png'));
  tray = new Tray(image);
  tray.setToolTip('滴答 · 本地清单');
  const menu = Menu.buildFromTemplate([
    { label: '打开滴答', click: showWindow },
    { label: '今天', click: () => navigate('#/today') },
    { label: '专注', click: () => navigate('#/focus') },
    { type: 'separator' },
    { label: '在浏览器中打开', click: () => shell.openExternal(URL) },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        quitting = true;
        app.quit();
      },
    },
  ]);
  tray.setContextMenu(menu);
  tray.on('click', () => {
    if (mainWindow?.isVisible() && mainWindow.isFocused()) mainWindow.hide();
    else showWindow();
  });
}

function showWindow() {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function navigate(hash) {
  showWindow();
  mainWindow?.webContents.executeJavaScript(`location.hash = ${JSON.stringify(hash)}; true`).catch(() => {});
}

app.setAppUserModelId('com.local.dida');
app.on('second-instance', () => showWindow());

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    callback(permission === 'notifications');
  });
  try {
    await ensureServer();
  } catch (error) {
    dialog.showErrorBox('滴答启动失败', error.message);
    app.quit();
    return;
  }
  createWindow();
  createTray();
  globalShortcut.register('CommandOrControl+Alt+D', () => {
    if (mainWindow?.isVisible()) mainWindow.hide();
    else showWindow();
  });
  app.on('activate', showWindow);
}).catch((error) => {
  dialog.showErrorBox('滴答启动失败', error.stack || error.message);
  app.quit();
});

app.on('before-quit', () => {
  quitting = true;
  globalShortcut.unregisterAll();
  if (serverProcess) {
    try {
      serverProcess.kill();
    } catch {
      // already stopped
    }
  }
});

app.on('window-all-closed', () => {
  // Keep the process and tray alive; quitting is explicit from the tray menu.
});
