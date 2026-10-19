import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = 4317;
const url = `http://127.0.0.1:${port}/`;
const dataDir = path.join(root, 'data');
const pidFile = path.join(dataDir, 'server.pid');
fs.mkdirSync(dataDir, { recursive: true });

async function healthy() {
  try {
    const response = await fetch(`${url}api/health`, { signal: AbortSignal.timeout(800) });
    if (!response.ok) return false;
    const data = await response.json();
    return data?.app === 'dida-local';
  } catch {
    return false;
  }
}

function ensureBuild() {
  if (fs.existsSync(path.join(root, 'dist', 'index.html'))) return true;
  console.log('首次启动，正在构建界面…');
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const result = spawnSync(npm, ['run', 'build'], { cwd: root, stdio: 'inherit', windowsHide: true });
  return result.status === 0;
}

function openAppWindow(target) {
  if (process.platform === 'win32') {
    const candidates = [
      path.join(process.env['ProgramFiles(x86)'] || '', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      path.join(process.env['ProgramFiles'] || '', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      path.join(process.env['ProgramFiles'] || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(process.env['ProgramFiles(x86)'] || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    ].filter(Boolean);
    const browser = candidates.find((candidate) => fs.existsSync(candidate));
    if (browser) {
      spawn(browser, [`--app=${target}`, '--window-size=1440,940', '--no-first-run', '--no-default-browser-check'], {
        detached: true,
        stdio: 'ignore',
        windowsHide: false,
      }).unref();
      return;
    }
    spawn('cmd', ['/c', 'start', '', target], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
    return;
  }
  const command = process.platform === 'darwin' ? 'open' : 'xdg-open';
  spawn(command, [target], { detached: true, stdio: 'ignore' }).unref();
}

if (!(await healthy())) {
  if (!ensureBuild()) {
    console.error('构建失败，请先运行 npm install 与 npm run build。');
    process.exit(1);
  }
  console.log('正在启动本地服务…');
  const log = fs.openSync(path.join(dataDir, 'server.log'), 'a');
  const child = spawn(process.execPath, [path.join(root, 'server', 'server.mjs'), '--mobile'], {
    cwd: root,
    env: { ...process.env, DIDA_PORT: String(port), DIDA_DATA_DIR: dataDir, DIDA_MOBILE: '1' },
    detached: true,
    stdio: ['ignore', log, log],
    windowsHide: true,
  });
  child.unref();
  fs.writeFileSync(pidFile, String(child.pid), 'utf8');
  let ok = false;
  for (let i = 0; i < 40; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    if (await healthy()) {
      ok = true;
      break;
    }
  }
  if (!ok) {
    console.error('本地服务启动超时，请查看 data/server.log。');
    process.exit(1);
  }
}

console.log(`滴答 · 本地清单已就绪：${url}`);
try {
  const response = await fetch(`${url}api/mobile-info`, { signal: AbortSignal.timeout(1200) });
  if (response.ok) {
    const info = await response.json();
    if (info.urls?.length) {
      console.log('');
      console.log('手机访问（同一 Wi-Fi，电脑保持开机）：');
      for (const mobileUrl of info.urls) console.log(`  ${mobileUrl}`);
      console.log('也可以在电脑端「设置 → 手机访问」里扫码。');
      console.log('');
    }
  } else {
    console.log('提示：当前服务不是手机共享模式；停止后重新运行本脚本即可开启。');
  }
} catch {
  // Mobile info is optional.
}
if (!process.argv.includes('--no-open') && !process.env.DIDA_NO_OPEN) {
  openAppWindow(url);
  console.log('已打开独立应用窗口。关闭窗口不会丢失数据；再次双击即可打开。');
}
