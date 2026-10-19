import { chromium } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const out = path.join(os.tmpdir(), 'dida-mobile-shots');
fs.mkdirSync(out, { recursive: true });
const info = await (await fetch('http://127.0.0.1:4317/api/mobile-info')).json();
const target = info.urls[0];
const edge = process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const browser = await chromium.launch({ executablePath: edge, headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
await page.goto(target, { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
await page.screenshot({ path: `${out}/11-today-lan.png` });

await page.locator('.mobile-topbar-btn[aria-label="打开清单"]').click();
await page.waitForTimeout(350);
await page.screenshot({ path: `${out}/12-drawer-lan.png` });
await page.locator('.mobile-drawer-close').click();
await page.waitForTimeout(200);

await page.locator('.mobile-tab', { hasText: '日历' }).click();
await page.waitForTimeout(550);
await page.screenshot({ path: `${out}/13-calendar-lan.png` });

await page.locator('.mobile-tab', { hasText: '习惯' }).click();
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/14-habits-lan.png` });

await page.locator('.mobile-tab', { hasText: '更多' }).click();
await page.waitForTimeout(350);
await page.locator('.mobile-more-item', { hasText: '设置' }).click();
await page.waitForTimeout(400);
await page.screenshot({ path: `${out}/15-mobile-settings.png` });

const tokenStored = await page.evaluate(() => localStorage.getItem('dida-access-token'));
console.log(JSON.stringify({
  errors,
  targetHost: new URL(target).host,
  tokenStored: Boolean(tokenStored),
  urlAfterToken: page.url(),
  tasks: await page.locator('.task-row').count(),
}, null, 2));
await browser.close();
