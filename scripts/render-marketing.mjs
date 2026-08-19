// Render covers + gameplay screenshots
import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true });

const covers = [
  { w: 1920, h: 1080, out: 'marketing/cover-16x9.png' },
  { w: 1080, h: 1080, out: 'marketing/cover-1x1.png' },
  { w: 800, h: 1200, out: 'marketing/cover-2x3.png' },
];
for (const cv of covers) {
  const page = await browser.newPage({ viewport: { width: cv.w, height: cv.h } });
  await page.goto(`file:///home/bartek/Projects/runic-depths/marketing/cover.html?w=${cv.w}&h=${cv.h}`);
  await page.waitForTimeout(500);
  await page.screenshot({ path: cv.out, clip: { x: 0, y: 0, width: cv.w, height: cv.h } });
  await page.close();
  console.log('rendered', cv.out);
}

// gameplay screenshots 1920x1080
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.goto('http://localhost:8485/?debug=1', { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
await page.screenshot({ path: 'marketing/screenshot-menu.png' });
console.log('rendered menu screenshot');
await page.evaluate(() => window.__astro.startGame());
// play turns, capture a combat moment on depth 1
let shot = false;
for (let i = 0; i < 80; i++) {
  const st = await page.evaluate(() => window.__astro.getState());
  if (st.state === 'levelup') { await page.evaluate(() => window.__astro.pickCard(0)); continue; }
  if (st.state !== 'playing') break;
  const adj = st.monstersNearby.find(m => Math.abs(m.dx) + Math.abs(m.dy) === 1);
  if (adj) {
    await page.evaluate(([dx, dy]) => window.__astro.move(dx, dy), [adj.dx, adj.dy]);
    if (!shot && i > 8) {
      await page.waitForTimeout(120);
      await page.screenshot({ path: 'marketing/screenshot-gameplay.png' });
      shot = true;
      console.log('combat screenshot at turn', i);
    }
  }
  else if (st.stairsDir.dx === 0 && st.stairsDir.dy === 0) break;
  else if (st.monstersNearby.length === 0 && shot) break;
  else await page.evaluate(([dx, dy]) => window.__astro.move(dx, dy), [st.stairsDir.dx, st.stairsDir.dy]);
  await page.waitForTimeout(80);
}
if (!shot) { await page.screenshot({ path: 'marketing/screenshot-gameplay.png' }); }
console.log('rendered gameplay screenshot');
await browser.close();
