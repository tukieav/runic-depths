import { chromium } from 'playwright';

const url = `http://localhost:${process.env.PORT || 8531}/?debug=1`;
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 907, height: 510 }, deviceScaleFactor: 1 });
const failures = [];
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${name}${detail ? ` (${detail})` : ''}`);
  if (!ok) failures.push(name);
}

await page.addInitScript(() => localStorage.removeItem('runic-depths-controls-seen'));
await page.goto(url, { waitUntil: 'networkidle' });

await page.evaluate(() => window.__astro.startGame());
let state = await page.evaluate(() => window.__astro.getState());
check('first run shows the visual controls onboarding', state.onboardingActive === true);

await page.evaluate(() => window.__astro.setupCodeInputProof());
const before = await page.evaluate(() => window.__astro.getState());
await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', {
  code: 'KeyW', key: 'z', bubbles: true, cancelable: true,
})));
await page.waitForTimeout(150);
state = await page.evaluate(() => window.__astro.getState());
check('KeyW physical code moves even when key is AZERTY z', state.heroY === before.heroY - 1, `${before.heroY}->${state.heroY}`);
check('first successful input dismisses onboarding', state.onboardingActive === false);

await page.evaluate(() => { window.__astro.forceGameOver(); window.__astro.openShop(); });
await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Backspace', key: 'Backspace', bubbles: true })));
state = await page.evaluate(() => window.__astro.getState());
check('shop has a Backspace alternative to Escape', state.state === 'menu', state.state);

await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyB', key: 'b', bubbles: true })));
state = await page.evaluate(() => window.__astro.getState());
check('bestiary opens with its visible toggle key', state.state === 'bestiary', state.state);
await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyB', key: 'b', bubbles: true })));
state = await page.evaluate(() => window.__astro.getState());
check('bestiary toggle key closes the panel', state.state === 'menu', state.state);

await browser.close();
process.exit(failures.length ? 1 : 0);
