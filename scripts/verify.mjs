import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const outDir = path.resolve('verify-shots');
fs.mkdirSync(outDir, { recursive: true });
if (process.env.DIDA_ALLOW_RESET !== '1') {
  console.error('Refusing to run: this script resets the local database. Set DIDA_ALLOW_RESET=1 only when you intentionally want demo data.');
  process.exit(1);
}
await fetch('http://127.0.0.1:4317/api/reset', { method: 'POST' });

const errors = [];
const browser = await chromium.launch({ executablePath: edge, headless: true, args: ['--disable-gpu'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 1 });
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(`console: ${message.text()}`);
});
page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
await page.goto('http://127.0.0.1:4317/', { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
await page.screenshot({ path: path.join(outDir, '01-today.png') });

const nav = async (selector, name) => {
  const loc = page.locator(selector).first();
  if (await loc.count()) {
    await loc.click();
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(outDir, `${name}.png`) });
  } else {
    errors.push(`missing nav: ${selector}`);
  }
};
await nav('.rail-item[aria-label="日历"]', '02-calendar');
await nav('.rail-item[aria-label="任务"]', '07-tasks');

// Complete the first task and verify it moves into the completed group.
const firstCheck = page.locator('.task-row .task-check').first();
if (await firstCheck.count()) {
  await firstCheck.click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(outDir, '08-after-complete.png') });
}

// Detail view.
const firstTask = page.locator('.task-row').first();
if (await firstTask.count()) {
  await firstTask.click();
  await page.waitForTimeout(550);
  await page.screenshot({ path: path.join(outDir, '09-detail.png') });
  // Date picker popover.
  const dateField = page.locator('.detail-field').first();
  if (await dateField.count()) {
    await dateField.click();
    await page.waitForTimeout(350);
    await page.screenshot({ path: path.join(outDir, '10-datepicker.png') });
    await page.keyboard.press('Escape');
  }
  await page.keyboard.press('Escape');
}

// Search.
await page.keyboard.press('Control+K');
await page.waitForTimeout(350);
await page.locator('.search-input-row input').fill('任务');
await page.waitForTimeout(450);
await page.screenshot({ path: path.join(outDir, '11-search.png') });
await page.keyboard.press('Escape');

// Settings, data tab.
await page.locator('.rail-item[aria-label="设置"]').first().click();
await page.waitForTimeout(500);
await page.screenshot({ path: path.join(outDir, '12-settings-appearance.png') });
await page.locator('.settings-tab', { hasText: '数据' }).click();
await page.waitForTimeout(1200);
await page.screenshot({ path: path.join(outDir, '13-settings-data.png') });
await page.locator('.settings-tab', { hasText: '外观' }).click();
await page.locator('.settings-content .segment', { hasText: '深色' }).click();
await page.waitForTimeout(650);
await page.screenshot({ path: path.join(outDir, '14-settings-dark.png') });
await page.keyboard.press('Escape');
await page.waitForTimeout(500);
await page.screenshot({ path: path.join(outDir, '15-dark-today.png') });

// Return to light.
await page.locator('.rail-item[aria-label="设置"]').first().click();
await page.locator('.settings-content .segment', { hasText: '浅色' }).click();
await page.waitForTimeout(350);
await page.keyboard.press('Escape');

// Quick add: parser + task creation.
const quick = page.locator('.quick-add textarea');
if (await quick.count()) {
  await quick.fill('明天下午 3 点 测试任务 !高 #工作');
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(outDir, '16-quickadd.png') });
  await quick.press('Enter');
  await page.waitForTimeout(650);
  await page.screenshot({ path: path.join(outDir, '17-after-add.png') });
}

// Calendar week view.
await page.locator('.rail-item[aria-label="日历"]').first().click();
await page.waitForTimeout(400);
await page.locator('.calendar-actions .segment', { hasText: '周' }).click();
await page.waitForTimeout(500);
await page.screenshot({ path: path.join(outDir, '20-calendar-week.png') });

const state = await (await fetch('http://127.0.0.1:4317/api/state')).json();
const testTask = state.tasks.find((task) => task.title === '测试任务');
const result = {
  errors,
  title: await page.title(),
  taskRows: await page.locator('.task-row').count(),
  testTask: testTask ? { dueAt: testTask.dueAt, priority: testTask.priority, tags: testTask.tags } : null,
  theme: await page.locator('html').getAttribute('data-theme'),
};
fs.writeFileSync(path.join(outDir, 'result.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
await fetch('http://127.0.0.1:4317/api/reset', { method: 'POST' });
await browser.close();
