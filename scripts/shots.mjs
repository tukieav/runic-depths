// Screenshot helper: menu + gameplay + combat, saved to qa/<prefix>-*.png
import { chromium } from 'playwright';
import fs from 'fs';
const prefix = process.argv[2] || 'shot';
fs.mkdirSync('qa', { recursive: true });
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
await page.goto('http://localhost:8531/?debug=1', { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
await page.screenshot({ path: `qa/${prefix}-menu.png` });
await page.evaluate(() => window.__astro.startGame());
await page.waitForTimeout(600);
// walk a bit to reveal dungeon
for (let i = 0; i < 10; i++) {
  await page.evaluate(() => { const s = window.__astro.getState(); window.__astro.move(s.stairsDir.dx, s.stairsDir.dy); if (s.state === 'levelup') window.__astro.pickCard(0); });
  await page.waitForTimeout(80);
}
await page.screenshot({ path: `qa/${prefix}-gameplay.png` });
// seek combat: move until adjacent monster, then attack mid-swing
let gotCombat = false;
for (let i = 0; i < 300 && !gotCombat; i++) {
  const s = await page.evaluate(() => window.__astro.getState());
  if (s.state === 'levelup') { await page.evaluate(() => window.__astro.pickCard(0)); continue; }
  if (s.state !== 'playing') break;
  const adj = s.monstersNearby.find(m => Math.abs(m.dx) + Math.abs(m.dy) === 1);
  if (adj) {
    await page.evaluate(([dx, dy]) => window.__astro.move(dx, dy), [adj.dx, adj.dy]);
    await page.waitForTimeout(120);
    gotCombat = true;
  } else {
    await page.evaluate(() => { const s = window.__astro.getState(); window.__astro.move(s.stairsDir.dx, s.stairsDir.dy); });
    await page.waitForTimeout(30);
  }
}
await page.screenshot({ path: `qa/${prefix}-combat.png` });
const realErrors = errors.filter(e => !e.toLowerCase().includes('sdk'));
console.log('combat=' + gotCombat, 'ERRORS=' + realErrors.length, realErrors.slice(0, 3).join(' | '));
await browser.close();
