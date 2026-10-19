import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import QRCode from 'qrcode';
import { DATA_DIR, bumpRevision, getRevision } from './db.mjs';
import {
  getState,
  createTask,
  updateTask,
  setTaskCompleted,
  deleteTask,
  restoreTask,
  purgeTask,
  emptyTrash,
  postponeTask,
  reorderTasks,
  bulkTasks,
  createList,
  updateList,
  deleteList,
  createTag,
  updateTag,
  deleteTag,
  createHabit,
  updateHabit,
  deleteHabit,
  checkinHabit,
  addFocusSession,
  createFilter,
  deleteFilter,
  saveSettings,
  exportData,
  replaceAll,
  resetAll,
} from './store.mjs';
import { importTickTick, inspectTickTick, defaultTickTickPath } from './importer.mjs';
import {
  getTickTickSyncStatus,
  setTickTickSyncSettings,
  syncTickTick,
  startTickTickSync,
} from './ticktick-sync.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const dist = path.join(root, 'dist');
const PORT = Number(process.env.DIDA_PORT) || 4317;
const MOBILE = process.argv.includes('--mobile') || process.env.DIDA_MOBILE === '1';
const HOST = process.env.DIDA_HOST || (MOBILE ? '0.0.0.0' : '127.0.0.1');
const TOKEN_FILE = path.join(DATA_DIR, 'mobile-token.txt');

function mobileToken() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(TOKEN_FILE)) {
    const existing = fs.readFileSync(TOKEN_FILE, 'utf8').trim();
    if (existing.length >= 16) return existing;
  }
  const token = crypto.randomBytes(18).toString('base64url');
  fs.writeFileSync(TOKEN_FILE, token, 'utf8');
  return token;
}

function isLoopback(req) {
  const address = req.socket.remoteAddress || '';
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
}

function requestToken(req, url) {
  const header = req.headers['x-dida-token'];
  if (typeof header === 'string' && header) return header;
  const query = url.searchParams.get('token');
  if (query) return query;
  const cookie = req.headers.cookie || '';
  const match = cookie.match(/(?:^|;\s*)dida_token=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : '';
}

function lanAddresses() {
  const result = [];
  for (const [name, entries] of Object.entries(os.networkInterfaces())) {
    if (/vEthernet|WSL|Virtual|Hyper-V|Loopback|VPN|Tunnel|Tailscale|SpeedCat/i.test(name)) continue;
    for (const entry of entries || []) {
      if (entry.family === 'IPv4' && !entry.internal && entry.address && !entry.address.startsWith('169.254.')) {
        result.push(entry.address);
      }
    }
  }
  const score = (ip) => {
    if (ip.startsWith('192.168.')) return 0;
    if (ip.startsWith('10.')) return 1;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return 2;
    if (ip.startsWith('198.18.')) return 9;
    return 5;
  };
  return [...new Set(result)].sort((a, b) => score(a) - score(b));
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
  '.map': 'application/json; charset=utf-8',
};

function json(res, status, value) {
  const body = JSON.stringify(value);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'X-Dida-Revision': String(getRevision()),
  });
  res.end(body);
}

function readBody(req, limit = 30 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(Object.assign(new Error('请求体过大'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(Object.assign(new Error('JSON 格式错误'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

function sendFile(res, filePath, status = 200) {
  const ext = path.extname(filePath).toLowerCase();
  const stat = fs.statSync(filePath);
  res.writeHead(status, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Content-Length': stat.size,
    'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
  });
  fs.createReadStream(filePath).pipe(res);
}

function serveProduction(req, res, pathname) {
  const safe = path.normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, '');
  const target = path.join(dist, safe);
  if (target.startsWith(dist) && fs.existsSync(target) && fs.statSync(target).isFile()) {
    return sendFile(res, target);
  }
  const index = path.join(dist, 'index.html');
  if (fs.existsSync(index)) return sendFile(res, index, 200);
  res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('前端尚未构建，请先运行 npm run build。');
}

async function handleApi(req, res, url) {
  const { pathname, searchParams } = url;
  const method = req.method || 'GET';

  if (MOBILE && pathname === '/api/mobile-info') {
    if (!isLoopback(req)) return json(res, 403, { error: '只允许在电脑本机查看手机访问信息' });
    const token = mobileToken();
    const port = Number(url.port) || PORT;
    const urls = lanAddresses().map((ip) => `http://${ip}:${port}/?token=${encodeURIComponent(token)}`);
    let qrDataUrl = null;
    if (urls[0]) {
      qrDataUrl = await QRCode.toDataURL(urls[0], {
        width: 360,
        margin: 1,
        errorCorrectionLevel: 'M',
        color: { dark: '#1f2430', light: '#ffffff' },
      });
    }
    return json(res, 200, { token, port, urls, qrDataUrl });
  }

  if (MOBILE && !isLoopback(req) && pathname !== '/api/health' && requestToken(req, url) !== mobileToken()) {
    return json(res, 401, { error: '需要手机访问码，请从电脑端「设置 → 手机访问」重新扫码', code: 'TOKEN_REQUIRED' });
  }

  const body = method === 'GET' || method === 'HEAD' ? {} : await readBody(req);
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) bumpRevision();

  if (method === 'GET' && pathname === '/api/health') {
    return json(res, 200, { ok: true, app: 'dida-local', version: 1, revision: getRevision(), now: new Date().toISOString() });
  }
  if (method === 'GET' && pathname === '/api/sync') {
    const since = Number(searchParams.get('revision') || 0);
    const revision = getRevision();
    if (since === revision) return json(res, 200, { revision, changed: false });
    return json(res, 200, { revision, changed: true, state: getState() });
  }
  if (method === 'GET' && pathname === '/api/state') {
    return json(res, 200, getState());
  }
  if (method === 'GET' && pathname === '/api/export') {
    const data = exportData();
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="dida-backup-${new Date().toISOString().slice(0, 10)}.json"`,
      'Cache-Control': 'no-store',
    });
    return res.end(JSON.stringify(data, null, 2));
  }

  if (pathname === '/api/tasks' && method === 'POST') {
    return json(res, 201, createTask(body));
  }
  if (pathname === '/api/tasks/reorder' && method === 'POST') {
    return json(res, 200, reorderTasks(body.items || []));
  }
  if (pathname === '/api/tasks/bulk' && method === 'POST') {
    return json(res, 200, { tasks: bulkTasks(body.action, body.ids || [], body.payload || {}) });
  }
  if (pathname === '/api/tasks/empty-trash' && method === 'POST') {
    return json(res, 200, emptyTrash());
  }

  let match = pathname.match(/^\/api\/tasks\/([^/]+)$/);
  if (match) {
    const id = decodeURIComponent(match[1]);
    if (method === 'PATCH') return json(res, 200, updateTask(id, body));
    if (method === 'DELETE') {
      if (searchParams.get('permanent') === '1') return json(res, 200, purgeTask(id));
      return json(res, 200, deleteTask(id));
    }
  }
  match = pathname.match(/^\/api\/tasks\/([^/]+)\/complete$/);
  if (match && method === 'POST') {
    return json(res, 200, setTaskCompleted(decodeURIComponent(match[1]), body.completed !== false));
  }
  match = pathname.match(/^\/api\/tasks\/([^/]+)\/restore$/);
  if (match && method === 'POST') {
    return json(res, 200, restoreTask(decodeURIComponent(match[1])));
  }
  match = pathname.match(/^\/api\/tasks\/([^/]+)\/postpone$/);
  if (match && method === 'POST') {
    return json(res, 200, postponeTask(decodeURIComponent(match[1]), body.dueAt));
  }

  if (pathname === '/api/lists' && method === 'POST') return json(res, 201, createList(body));
  match = pathname.match(/^\/api\/lists\/([^/]+)$/);
  if (match) {
    const id = decodeURIComponent(match[1]);
    if (method === 'PATCH') return json(res, 200, updateList(id, body));
    if (method === 'DELETE') return json(res, 200, deleteList(id));
  }

  if (pathname === '/api/tags' && method === 'POST') return json(res, 201, createTag(body));
  match = pathname.match(/^\/api\/tags\/([^/]+)$/);
  if (match) {
    const id = decodeURIComponent(match[1]);
    if (method === 'PATCH') return json(res, 200, updateTag(id, body));
    if (method === 'DELETE') return json(res, 200, deleteTag(id));
  }

  if (pathname === '/api/habits' && method === 'POST') return json(res, 201, createHabit(body));
  match = pathname.match(/^\/api\/habits\/([^/]+)\/checkin$/);
  if (match && (method === 'POST' || method === 'DELETE')) {
    return json(res, 200, checkinHabit(decodeURIComponent(match[1]), body.date, method === 'DELETE' ? 0 : body.value ?? 1, body.note || ''));
  }
  match = pathname.match(/^\/api\/habits\/([^/]+)$/);
  if (match) {
    const id = decodeURIComponent(match[1]);
    if (method === 'PATCH') return json(res, 200, updateHabit(id, body));
    if (method === 'DELETE') return json(res, 200, deleteHabit(id));
  }

  if (pathname === '/api/focus' && method === 'POST') return json(res, 201, addFocusSession(body));

  if (pathname === '/api/filters' && method === 'POST') return json(res, 201, createFilter(body));
  match = pathname.match(/^\/api\/filters\/([^/]+)$/);
  if (match && method === 'DELETE') return json(res, 200, deleteFilter(decodeURIComponent(match[1])));

  if (pathname === '/api/settings' && method === 'POST') return json(res, 200, saveSettings(body));

  if (pathname === '/api/ticktick/status' && method === 'GET') {
    return json(res, 200, getTickTickSyncStatus());
  }
  if (pathname === '/api/ticktick/settings' && method === 'POST') {
    return json(res, 200, setTickTickSyncSettings(body));
  }
  if (pathname === '/api/ticktick/sync' && method === 'POST') {
    return json(res, 200, await syncTickTick({ force: true }));
  }
  if (pathname === '/api/import/ticktick/preview' && method === 'GET') {
    const custom = searchParams.get('path');
    const fromDate = searchParams.get('fromDate');
    return json(res, 200, inspectTickTick(custom || defaultTickTickPath(), { fromDate }));
  }
  if (pathname === '/api/import/ticktick' && method === 'POST') {
    return json(res, 200, importTickTick(body.path || defaultTickTickPath(), {
      fromDate: body.fromDate || null,
      includeHabits: body.includeHabits !== false,
      keepFilters: body.keepFilters === true,
    }));
  }
  if (pathname === '/api/import/json' && method === 'POST') {
    return json(res, 200, replaceAll(body));
  }
  if (pathname === '/api/reset' && method === 'POST') {
    return json(res, 200, resetAll());
  }

  return json(res, 404, { error: '接口不存在' });
}

export async function startServer({ port = PORT, dev = false, open = false } = {}) {
  let vite;
  if (dev) {
    const { createServer } = await import('vite');
    vite = await createServer({
      root,
      server: { middlewareMode: true, host: HOST },
      appType: 'spa',
    });
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://${req.headers.host || `${HOST}:${port}`}`);
    try {
      if (url.pathname.startsWith('/api/')) {
        await handleApi(req, res, url);
        return;
      }
      if (dev) {
        vite.middlewares(req, res, (error) => {
          if (error) {
            console.error(error);
            if (!res.headersSent) {
              res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
              res.end('开发服务器错误');
            }
          }
        });
        return;
      }
      serveProduction(req, res, url.pathname);
    } catch (error) {
      console.error(error);
      if (!res.headersSent) json(res, error.status || 500, { error: error.message || '服务器错误' });
      else res.end();
    }
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, HOST, resolve);
  });

  const url = `http://127.0.0.1:${port}/`;
  console.log(`\n  滴答 · 本地清单已启动：${url}\n`);
  startTickTickSync();
  if (MOBILE) {
    const token = mobileToken();
    const urls = lanAddresses().map((ip) => `http://${ip}:${port}/?token=${encodeURIComponent(token)}`);
    if (urls.length) {
      console.log('  手机访问（同一 Wi-Fi，保持电脑开机）：');
      for (const mobileUrl of urls) console.log(`    ${mobileUrl}`);
      console.log('');
    } else {
      console.log('  手机访问：没有检测到局域网 IPv4 地址，请检查 Wi-Fi。\n');
    }
  }
  if (open) openBrowser(url);
  return { server, url, close: () => new Promise((resolve) => server.close(resolve)) };
}

export function openBrowser(url) {
  if (process.platform === 'win32') {
    spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
  } else if (process.platform === 'darwin') {
    spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
  } else {
    spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  const dev = process.argv.includes('--dev');
  const open = process.argv.includes('--open');
  startServer({ port: PORT, dev, open }).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => {
      process.exit(0);
    });
  }
}