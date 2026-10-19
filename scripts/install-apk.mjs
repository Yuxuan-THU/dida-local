import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const apk = path.resolve('release', 'DidaLocal-0.1.0-debug.apk');
if (!fs.existsSync(apk)) {
  console.error('APK not found. Run npm run apk:build first.');
  process.exit(1);
}
const devices = spawnSync('adb', ['devices'], { encoding: 'utf8' });
if (!/device\s*$/m.test(devices.stdout || '')) {
  console.error('No ADB device. Connect the phone and enable USB debugging.');
  process.exit(1);
}
const result = spawnSync('adb', ['install', '-r', apk], { stdio: 'inherit' });
if (result.status !== 0) {
  console.error('\nIf the phone says INSTALL_FAILED_USER_RESTRICTED:');
  console.error('  小米：开发者选项 → 打开「USB 安装」和「USB 调试（安全设置）」');
  console.error('  或在手机上打开「文件管理 → Download」手动安装 APK。');
  process.exit(result.status || 1);
}
console.log('Installed: com.dida.local');
