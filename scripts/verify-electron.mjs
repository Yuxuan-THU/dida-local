import { _electron as electron } from 'playwright-core';
import path from 'node:path';
import fs from 'node:fs';

const out = path.resolve('verify-shots', 'electron.png');
const env = { ...process.env, ELECTRON_DISABLE_SECURITY_WARNINGS: 'true' };
delete env.ELECTRON_RUN_AS_NODE;
const electronApp = await electron.launch({
  args: ['.'],
  cwd: process.cwd(),
  env,
  timeout: 60000,
});
const page = await electronApp.firstWindow({ timeout: 60000 });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
await page.waitForTimeout(1800);
await page.screenshot({ path: out });
console.log(JSON.stringify({ title: await page.title(), url: page.url(), errors }, null, 2));
await electronApp.close();
fs.existsSync(out);
