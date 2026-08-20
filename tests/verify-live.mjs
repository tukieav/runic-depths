import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
await page.goto('https://tukieav.github.io/runic-depths/?debug=1', { waitUntil: 'networkidle' });
await page.waitForTimeout(5000); // sdk timeout race = 3s
const st = await page.evaluate(() => window.__astro ? window.__astro.getState() : null);
console.log('state:', JSON.stringify(st));
// play a few moves
await page.evaluate(() => window.__astro.startGame());
for (let i = 0; i < 8; i++) {
  await page.evaluate(() => { const s = window.__astro.getState(); window.__astro.move(s.stairsDir.dx, s.stairsDir.dy); });
  await page.waitForTimeout(120);
}
const st2 = await page.evaluate(() => window.__astro.getState());
console.log('after moves:', JSON.stringify({ state: st2.state, x: st2.heroX, y: st2.heroY, depth: st2.depth }));
const metaOk = await page.evaluate(() => {
  const s = window.__astro.getState();
  return typeof s.souls === 'number' && typeof s.streak === 'number' && Array.isArray(s.classes) && s.classes.includes('knight');
});
console.log('META_SYSTEMS=' + metaOk);
const bright = await page.evaluate(() => {
  const c = document.getElementById('game');
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let n = 0;
  for (let i = 0; i < d.length; i += 400) if (d[i] > 40 || d[i+1] > 40 || d[i+2] > 40) n++;
  return n;
});
const realErrors = errors.filter(e => !e.toLowerCase().includes('sdk'));
console.log('BRIGHT_SAMPLES=' + bright);
console.log('ERRORS=' + realErrors.length, realErrors.slice(0,3).join(' | '));
await browser.close();
process.exit(bright > 0 && st2.state === 'playing' && metaOk && realErrors.length === 0 ? 0 : 1);
