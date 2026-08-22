const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`http://127.0.0.1:${process.env.PORT || 8531}/?debug=1`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => { window.__astro.startGameWithSeed(9001); window.__astro.setResolutionDelay(1); });
  let simulatedSeconds = 0, maxParticles = 0, maxFloaters = 0, maxListeners = 0, restarts = 0, floors = 1;
  for (let i = 0; i < 720; i++) { // 120s of 6 turns/s accelerated play
    let s = await page.evaluate(() => window.__astro.getState());
    simulatedSeconds += 1 / 6;
    if (s.state === 'gameover') { await page.evaluate(() => window.__astro.playAgain()); restarts++; await page.waitForTimeout(3); continue; }
    if (s.state === 'levelup') { await page.evaluate(() => window.__astro.pickCard(0)); continue; }
    const adjacent = s.monstersNearby.find(m => Math.abs(m.dx) + Math.abs(m.dy) === 1);
    await page.evaluate(([dx, dy]) => window.__astro.move(dx, dy), adjacent ? [adjacent.dx, adjacent.dy] : [s.stairsDir.dx, s.stairsDir.dy]);
    await page.waitForTimeout(3);
    s = await page.evaluate(() => window.__astro.getState());
    floors = Math.max(floors, s.depth);
    maxParticles = Math.max(maxParticles, s.particleCount); maxFloaters = Math.max(maxFloaters, s.floaterCount); maxListeners = Math.max(maxListeners, s.listenerCount);
    if (i > 0 && i % 180 === 0) { await page.evaluate(() => window.__astro.forceGameOver()); }
  }
  const state = await page.evaluate(() => window.__astro.getState());
  const pass = simulatedSeconds >= 120 && errors.length === 0 && maxParticles <= 240 && maxFloaters <= 40 && maxListeners === 8 && floors >= 2 && restarts >= 2 && state.listenerCount === 8;
  console.log(JSON.stringify({ simulatedSeconds, floors, restarts, maxParticles, maxFloaters, maxListeners, errors, pass }));
  await browser.close();
  process.exit(pass ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
