// Vision-gate: fullscreen + density screenshots at 1280x720 and 1920x1080
import { chromium } from 'playwright';
import fs from 'fs';
fs.mkdirSync('qa/gate', { recursive: true });
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true });
let allOk = true;
for (const [w, h] of [[1280, 720], [1920, 1080]]) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('http://localhost:8531/?debug=1', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1800);
  // canvas fills viewport?
  const geo = await page.evaluate(() => {
    const c = document.getElementById('game');
    const r = c.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height, iw: innerWidth, ih: innerHeight, cw: c.width, ch: c.height };
  });
  const fills = Math.abs(geo.w - geo.iw) < 2 && Math.abs(geo.h - geo.ih) < 2 && geo.x < 1 && geo.y < 1;
  console.log(`${w}x${h} canvas fills viewport: ${fills}`, JSON.stringify(geo));
  if (!fills) allOk = false;
  await page.screenshot({ path: `qa/gate/menu-${w}x${h}.png` });
  await page.evaluate(() => window.__astro.startGame());
  await page.waitForTimeout(500);
  for (let i = 0; i < 6; i++) {
    await page.evaluate(() => { const s = window.__astro.getState(); if (s.state === 'levelup') window.__astro.pickCard(0); else window.__astro.move(s.stairsDir.dx, s.stairsDir.dy); });
    await page.waitForTimeout(90);
  }
  await page.screenshot({ path: `qa/gate/game-${w}x${h}.png` });
  // black-bar check: sample edge strips of the rendered screenshot via canvas pixels
  const edge = await page.evaluate(() => {
    const c = document.getElementById('game');
    const g = c.getContext('2d');
    const strips = [
      g.getImageData(0, 0, c.width, 8).data,                 // top
      g.getImageData(0, c.height - 8, c.width, 8).data,      // bottom
      g.getImageData(0, 0, 8, c.height).data,                // left
      g.getImageData(c.width - 8, 0, 8, c.height).data,      // right
    ];
    return strips.map(d => { let n = 0, tot = 0; for (let i = 0; i < d.length; i += 40) { tot++; if (d[i] > 25 || d[i+1] > 25 || d[i+2] > 25) n++; } return n / tot; });
  });
  console.log(`${w}x${h} edge brightness fractions:`, edge.map(x => x.toFixed(2)).join(' '));
  // overall brightness of gameplay frame: avg luminance floor + near-black fraction cap
  const stats = await page.evaluate(() => {
    const c = document.getElementById('game');
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let black = 0, tot = 0, lum = 0;
    for (let i = 0; i < d.length; i += 160) { tot++; const l = 0.3 * d[i] + 0.5 * d[i+1] + 0.2 * d[i+2]; lum += l; if (l < 8) black++; }
    return { blackFrac: black / tot, avgLum: lum / tot };
  });
  console.log(`${w}x${h} gameplay: blackFrac=${stats.blackFrac.toFixed(3)} avgLum=${stats.avgLum.toFixed(1)}`);
  if (stats.avgLum < 22 || stats.blackFrac > 0.15) { console.log('FAIL: scene too dark/void'); allOk = false; }
  const real = errors.filter(e => !e.toLowerCase().includes('sdk'));
  if (real.length) { console.log('ERRORS:', real.slice(0, 3)); allOk = false; }
  await page.close();
}
await browser.close();
console.log(allOk ? 'GATE_OK' : 'GATE_FAIL');
process.exit(allOk ? 0 : 1);
