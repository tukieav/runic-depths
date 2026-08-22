// Marketing cover hard gate; Chromium decodes PNGs, so no new dependency is needed.
import { chromium } from 'playwright';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';

const covers = ['marketing/cover-16x9.png', 'marketing/cover-2x3.png', 'marketing/cover-1x1.png'];
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true });
let failed = false;
for (const file of covers) {
  const page = await browser.newPage();
  const source = `data:image/png;base64,${readFileSync(resolve(file)).toString('base64')}`;
  const m = await page.evaluate(async (src) => {
    const im = new Image(); im.src = src; await im.decode();
    const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
    const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(im, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height).data;
    let lum = 0, dark = 0, sat = 0, n = 0;
    for (let i = 0; i < d.length; i += 16) {
      const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255;
      const l = (0.2126 * r + 0.7152 * g + 0.0722 * b) * 255;
      lum += l; if (l < 40) dark++;
      const hi = Math.max(r, g, b), lo = Math.min(r, g, b); sat += hi ? (hi - lo) / hi : 0; n++;
    }
    return { meanLum: lum / n, darkFrac: dark / n, meanSat: sat / n };
  }, source);
  const pass = m.meanLum >= 80 && m.darkFrac <= .35 && m.meanSat >= .35;
  console.log(`${pass ? 'PASS' : 'FAIL'} ${file} meanLum=${m.meanLum.toFixed(2)} darkFrac=${m.darkFrac.toFixed(4)} meanSat=${m.meanSat.toFixed(4)}`);
  failed ||= !pass; await page.close();
}
await browser.close();
process.exit(failed ? 1 : 0);
