import { spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

const root = path.resolve('android');
const gradle = process.env.GRADLE_BIN || 'gradle';
const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || '';
const javaHome = process.env.JAVA_HOME || '';

if (!sdk) {
  console.error('ANDROID_HOME (or ANDROID_SDK_ROOT) is required.');
  process.exit(1);
}
if (!fs.existsSync(path.join(sdk, 'platforms', 'android-35'))) {
  console.error(`Android SDK 35 not found: ${sdk}`);
  process.exit(1);
}

const env = {
  ...process.env,
  ...(javaHome ? { JAVA_HOME: javaHome } : {}),
  ANDROID_HOME: sdk,
  ANDROID_SDK_ROOT: sdk,
  Path: `${javaHome ? `${javaHome}\\bin;` : ''}${sdk}\\platform-tools;${process.env.Path || process.env.PATH || ''}`,
};

const result = spawnSync(gradle, ['assembleDebug', '--no-daemon', '--console=plain'], {
  cwd: root,
  env,
  stdio: 'inherit',
  shell: true,
});

const apk = path.join(root, 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
if (result.status === 0 && fs.existsSync(apk)) {
  const out = path.resolve('release', 'DidaLocal-0.1.0-debug.apk');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.copyFileSync(apk, out);
  console.log(`APK: ${out}`);
} else {
  process.exit(result.status || 1);
}
