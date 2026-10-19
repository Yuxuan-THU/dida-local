import { chromium } from 'playwright-core';
import path from 'node:path';

const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
if (process.env.DIDA_ALLOW_RESET !== '1') {
  console.error('Refusing to run: this script resets the local database. Set DIDA_ALLOW_RESET=1 only when you intentionally want demo data.');
  process.exit(1);
}
await fetch('http://127.0.0.1:4317/api/reset', { method: 'POST' });
const browser = await chromium.launch({ executablePath: edge, headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
await page.goto('http://127.0.0.1:4317/', { waitUntil: 'networkidle' });
await page.waitForTimeout(500);

const filterSection = page.locator('.sidebar-section', { hasText: '过滤器' });
await filterSection.locator('.section-add').click();
await page.waitForTimeout(300);
await page.locator('.modal-card input[placeholder*="本周重要工作"]').fill('高优先测试');
await page.locator('.priority-chip', { hasText: '高优先级' }).click();
await page.locator('.modal-card .btn.primary', { hasText: '创建过滤器' }).click();
await page.waitForTimeout(500);
await page.locator('.sidebar-item', { hasText: '高优先测试' }).click();
await page.waitForTimeout(450);
await page.screenshot({ path: path.join('verify-shots', '21-filter.png') });
const heading = await page.locator('.view-head h2').innerText();

// Create a custom list and switch it to board mode through the editor.
await page.locator('.sidebar-section', { hasText: '清单' }).first().locator('.section-add').click();
await page.waitForTimeout(250);
await page.locator('.modal-card input[placeholder*="工作、旅行计划"]').fill('项目测试');
await page.locator('.modal-card .segment', { hasText: '看板' }).click();
await page.locator('.modal-card .btn.primary', { hasText: '创建清单' }).click();
await page.waitForTimeout(600);
await page.screenshot({ path: path.join('verify-shots', '22-board-empty.png') });
const boardCols = await page.locator('.board-column').count();

console.log(JSON.stringify({ errors, heading, boardCols, filterCreated: await page.locator('.sidebar-item', { hasText: '高优先测试' }).count() }, null, 2));
await fetch('http://127.0.0.1:4317/api/reset', { method: 'POST' });
await browser.close();
