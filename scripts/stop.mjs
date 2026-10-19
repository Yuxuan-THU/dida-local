import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pidFile = path.join(root, 'data', 'server.pid');
if (!fs.existsSync(pidFile)) {
  console.log('没有找到运行中的本地服务。');
  process.exit(0);
}
const pid = Number(fs.readFileSync(pidFile, 'utf8').trim());
if (!Number.isFinite(pid) || pid <= 0) {
  console.log('服务 PID 文件无效，已忽略。');
  fs.rmSync(pidFile, { force: true });
  process.exit(0);
}
console.log(`正在停止本地服务（PID ${pid}）…`);
if (process.platform === 'win32') {
  spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
} else {
  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    // already stopped
  }
}
fs.rmSync(pidFile, { force: true });
console.log('已停止。再次双击「启动滴答清单」即可重新打开。');
