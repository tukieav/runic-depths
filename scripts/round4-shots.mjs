// Reviewer captures for the bright-cover / opening-menu handoff.
import { chromium } from 'playwright';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true });
const cover = await browser.newPage({ viewport: { width: 907, height: 510 } });
await cover.goto(`${pathToFileURL(resolve('marketing/cover.html')).href}?w=907&h=510`);
await cover.screenshot({ path: 'qa/round4-cover-907x510.png' });
await cover.close();
const menu = await browser.newPage({ viewport: { width: 907, height: 510 } });
await menu.goto(`http://127.0.0.1:${process.env.PORT || 8531}/?debug=1`, { waitUntil: 'networkidle' });
await menu.waitForTimeout(300);
await menu.screenshot({ path: 'qa/round4-menu-907x510.png' });
await menu.close();
await browser.close();
console.log('captured qa/round4-cover-907x510.png and qa/round4-menu-907x510.png');
