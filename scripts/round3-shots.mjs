// Required Round 3 reviewer captures from the isolated test server.
import { chromium } from 'playwright';

const cases = [
  { width: 907, height: 510, out: 'qa/round3-gameplay-907x510.png' },
  { width: 1920, height: 1080, out: 'qa/round3-gameplay-1920x1080.png' },
  { width: 390, height: 844, out: 'qa/round3-gameplay-390x844.png' },
];
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true });
for (const shot of cases) {
  const page = await browser.newPage({ viewport: shot, deviceScaleFactor: 1 });
  await page.addInitScript(() => localStorage.removeItem('runic-depths-controls-seen'));
  await page.goto(`http://localhost:${process.env.PORT || 8531}/?debug=1`, { waitUntil: 'networkidle' });
  await page.evaluate(() => window.__astro.startGameWithSeed(17));
  await page.evaluate(() => {
    const s = window.__astro.getState();
    window.__astro.move(s.stairsDir.dx, s.stairsDir.dy);
  });
  await page.waitForTimeout(180);
  await page.screenshot({ path: shot.out });
  await page.close();
  console.log('captured', shot.out);
}
await browser.close();
