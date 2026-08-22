import { chromium } from 'playwright';

const port = process.env.PORT || 8531;
const url = `http://localhost:${port}/?debug=1`;
const viewports = [[907, 510], [1920, 1080], [390, 844]];
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true });

async function playForShot(page) {
  await page.evaluate(() => window.__astro.startGameWithSeed(17));
  await page.waitForTimeout(240);
  for (let i = 0; i < 24; i++) {
    const s = await page.evaluate(() => window.__astro.getState());
    if (s.state === 'levelup') { await page.evaluate(() => window.__astro.pickCard(0)); continue; }
    if (s.state !== 'playing') break;
    const adjacent = s.monstersNearby.find(m => Math.abs(m.dx) + Math.abs(m.dy) === 1);
    await page.evaluate(([dx, dy]) => window.__astro.move(dx, dy), adjacent ? [adjacent.dx, adjacent.dy] : [s.stairsDir.dx, s.stairsDir.dy]);
    await page.waitForTimeout(130);
  }
}

for (const [width, height] of viewports) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1, hasTouch: width === 390 });
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(240);
  await page.screenshot({ path: `qa/final-polish-menu-${width}x${height}.png` });
  await playForShot(page);
  await page.screenshot({ path: `qa/final-polish-gameplay-${width}x${height}.png` });
  if (width === 1920) {
    await page.screenshot({ path: 'marketing/screenshot-gameplay.png' });
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(240);
    await page.screenshot({ path: 'marketing/screenshot-menu.png' });
  }
  await page.close();
}

await browser.close();
