import { chromium } from 'playwright';

const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 907, height: 510 }, deviceScaleFactor: 1 });
await page.goto(`http://127.0.0.1:${process.env.PORT || 8531}/?debug=1`, { waitUntil: 'domcontentloaded' });
const failures = await page.evaluate(() => {
  const bad = [];
  for (let seed = 1; seed <= 250; seed++) {
    window.__astro.newRunWithSeed(seed);
    const s = window.__astro.getState();
    if (!s.stairsReachable || !s.safeStart || !s.firstFloorResource) bad.push({ seed, stairsReachable: s.stairsReachable, safeStart: s.safeStart, firstFloorResource: s.firstFloorResource });
  }
  return bad;
});
console.log(failures.length ? `FAIL ${JSON.stringify(failures.slice(0, 5))}` : 'PASS 250 seeded floors have reachable stairs, safe starts, and a healing resource');
await browser.close();
process.exit(failures.length ? 1 : 0);
