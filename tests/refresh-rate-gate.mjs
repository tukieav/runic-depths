import { chromium } from 'playwright';

const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
await page.goto(`http://localhost:${process.env.PORT || 8531}/?debug=1`, { waitUntil: 'networkidle' });
await page.evaluate(() => window.__astro.startGameWithSeed(424242));
await page.waitForTimeout(80);
const probes = await page.evaluate(() => [60, 144, 165].map(hz => ({ hz, ...window.__astro.timingProbe(hz) })));
console.log(JSON.stringify(probes));
const baseline = probes[0];
const logicSame = probes.every(p => p.score === baseline.score && p.heroX === baseline.heroX && p.heroY === baseline.heroY && p.spawnCount === baseline.spawnCount && p.difficulty === baseline.difficulty);
const visualTolerance = Math.max(...probes.map(p => p.visualSeconds)) - Math.min(...probes.map(p => p.visualSeconds)) <= 1 / 60 + 0.001;
console.log(`${logicSame ? 'PASS' : 'FAIL'} turn results are refresh-rate independent`);
console.log(`${visualTolerance ? 'PASS' : 'FAIL'} visual duration stays within one 60Hz frame`);
await browser.close();
process.exit(logicSame && visualTolerance ? 0 : 1);
