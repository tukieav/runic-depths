// Record preview videos (landscape + portrait) via Playwright recordVideo
import { chromium } from 'playwright';
import { renameSync, readdirSync } from 'node:fs';

const mode = process.argv[2] || 'landscape';
const size = mode === 'portrait' ? { width: 800, height: 1200 } : { width: 1920, height: 1080 };
const dir = 'marketing/rec-' + mode;

const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true });
const ctx = await browser.newContext({ viewport: size, recordVideo: { dir, size } });
const page = await ctx.newPage();
await page.goto(`http://localhost:${process.env.PORT || 8531}/?debug=1`, { waitUntil: 'networkidle' });
// Start before the capture window used by the composer: the preview never
// contains the menu, and the raw first frames are trimmed before concatenation.
await page.evaluate(() => window.__astro.startGame());
await page.waitForTimeout(900);
const t0 = Date.now();
// Bot plays for ~17s; the composer takes a clean 15.8s gameplay segment.
while (Date.now() - t0 < 17000) {
  const st = await page.evaluate(() => window.__astro.getState());
  if (st.state === 'levelup') { await page.waitForTimeout(900); await page.evaluate(() => window.__astro.pickCard(0)); continue; }
  if (st.state === 'gameover') {
    console.log('bot died at', (Date.now() - t0) / 1000, 's — restarting');
    await page.evaluate(() => window.__astro.playAgain());
    await page.waitForTimeout(350);
    continue;
  }
  if (st.hp < 18 && st.potions > 0) await page.evaluate(() => window.__astro.usePotion());
  const adj = st.monstersNearby.find(m => Math.abs(m.dx) + Math.abs(m.dy) === 1);
  if (adj) await page.evaluate(([dx, dy]) => window.__astro.move(dx, dy), [adj.dx, adj.dy]);
  else await page.evaluate(([dx, dy]) => window.__astro.move(dx, dy), [st.stairsDir.dx, st.stairsDir.dy]);
  await page.waitForTimeout(230);
}
const st = await page.evaluate(() => window.__astro.getState());
console.log('final state:', st.state, 'hp:', st.hp, 'depth:', st.depth);
await ctx.close();
await browser.close();
if (st.state !== 'playing' && st.state !== 'levelup') process.exit(2);
const f = readdirSync(dir).find(f => f.endsWith('.webm'));
renameSync(dir + '/' + f, 'marketing/raw-' + mode + '.webm');
console.log('saved marketing/raw-' + mode + '.webm');
