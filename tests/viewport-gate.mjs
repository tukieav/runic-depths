import { chromium } from 'playwright';
import fs from 'fs';

const sizes = [[907, 510], [1216, 684], [1077, 606], [821, 462], [1366, 768], [1920, 1080], [1536, 864], [1280, 720], [800, 450], [1080, 607]];
const shots = new Map([[907, 510], [1280, 720], [1920, 1080], [390, 844]]);
const url = `http://localhost:${process.env.PORT || 8531}/?debug=1`;
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true });
let failures = 0;

async function checkViewport(width, height) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1, hasTouch: width === 390 });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(220);
  const box = await page.locator('#game').boundingBox();
  const menuState = await page.evaluate(() => window.__astro.getState().state);
  if (shots.has(width, height)) await page.screenshot({ path: `qa/hardening-menu-${width}x${height}.png` });
  // Physical pointer/touch path, not the debug start hook. Portrait menu sits above screen center.
  await page.mouse.click(width / 2, width < height ? 196 : height * 0.584);
  await page.waitForTimeout(280);
  const game = await page.evaluate(() => window.__astro.getState());
  if (shots.has(width, height)) await page.screenshot({ path: `qa/hardening-gameplay-${width}x${height}.png` });
  const pass = box.width >= width * 0.98 && box.height >= height * 0.98 && menuState === 'menu' && game.state === 'playing' && errors.length === 0;
  console.log(`${pass ? 'PASS' : 'FAIL'} ${width}x${height} canvas=${Math.round(box.width)}x${Math.round(box.height)} state=${game.state}`);
  if (!pass) failures++;
  await page.close();
}

for (const [w, h] of sizes) await checkViewport(w, h);
await checkViewport(390, 844);
await browser.close();
process.exit(failures ? 1 : 0);
