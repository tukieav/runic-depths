// Shipping-bundle platform integration in Chrome. SDK transport is mocked explicitly.
// Run after npm run build. This does not claim a CrazyGames portal acceptance.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve('dist');
const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (pathname === '/_embed') {
      res.setHeader('Content-Type', 'text/html');
      return res.end('<!doctype html><html><head><link rel="icon" href="data:,"><style>body{margin:0;background:#21252a}iframe{display:block;border:0;width:907px;height:510px}button{height:40px}</style></head><body><button id="portal">Portal control</button><iframe title="Runic Depths" allow="autoplay; fullscreen" src="/?qa=1"></iframe></body></html>');
    }
    const file = path.resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
    if (!file.startsWith(root + path.sep)) { res.writeHead(403); return res.end(); }
    const data = await readFile(file);
    res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp' })[path.extname(file)] || 'application/octet-stream');
    res.end(data);
  } catch { res.writeHead(404); res.end('Not found'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN || '/usr/bin/google-chrome', headless: true,
  args: ['--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const results = [], errors = [];
const check = async (name, fn) => { await fn(); results.push(name); console.log('PASS ' + name); };
function mockSDK({ mute = false, rejectInit = false, locale = 'en-US' } = {}) {
  const events = [], data = new Map(), listeners = new Set();
  window.__PLATFORM = { events, data, setMute(value) { for (const fn of listeners) fn({ muteAudio: value }); } };
  window.CrazyGames = { SDK: {
    environment: 'crazygames',
    init: async () => { if (rejectInit) throw new Error('Controlled SDK unavailable'); },
    game: {
      settings: { muteAudio: mute }, addSettingsChangeListener: fn => listeners.add(fn), removeSettingsChangeListener: fn => listeners.delete(fn),
      gameplayStart() { events.push('start'); }, gameplayStop() { events.push('stop'); },
      loadingStart() { events.push('load'); }, loadingStop() { events.push('loaded'); }, happytime() { events.push('happy'); },
    },
    data: { getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) },
    user: { systemInfo: { locale } },
  } };
}
const observe = page => {
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', e => { if (e.type() === 'error') errors.push(e.text()); });
};
const ready = frame => frame.waitForFunction(() => window.__RUNIC?.game && document.getElementById('loading').hidden, null, { timeout: 20000 });
const snapshot = frame => frame.evaluate(() => __RUNIC.snapshot());
const frames = frame => frame.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const verifyBoundaries = async frame => {
  const { events, active, mode } = await frame.evaluate(() => ({ events: __PLATFORM.events.filter(e => e === 'start' || e === 'stop'), active: __RUNIC.snapshot().sdk.gameplayActive, mode: __RUNIC.game.mode }));
  assert.ok(events.length >= 1);
  for (let i = 0; i < events.length; i++) assert.equal(events[i], i % 2 ? 'stop' : 'start', JSON.stringify(events));
  assert.equal(events.at(-1) === 'start', active);
  assert.equal(active, mode === 'playing');
  return events;
};
try {
  const context = await browser.newContext({ viewport: { width: 1000, height: 640 }, locale: 'en-US' });
  await context.addInitScript(mockSDK, {});
  const page = await context.newPage(); observe(page);
  await page.goto(base + '/_embed');
  const frame = page.frames().find(f => f.url().includes('?qa=1'));
  await ready(frame);
  await check('907x510 embedded shipping game boots directly into playable state', async () => {
    assert.equal((await snapshot(frame)).mode, 'playing');
    assert.deepEqual(await frame.evaluate(() => __PLATFORM.events), ['load', 'loaded', 'start']);
    await frame.locator('#game').click({ position: { x: 600, y: 190 } });
    const before = await frame.evaluate(() => __RUNIC.game.time);
    await frames(frame);
    assert.ok(await frame.evaluate(() => __RUNIC.game.time) > before);
    await verifyBoundaries(frame);
  });
  await check('actual rapid pause/resume buttons preserve every SDK boundary', async () => {
    const count = (await verifyBoundaries(frame)).length;
    await frame.evaluate(() => {
      for (let i = 0; i < 5; i++) {
        document.getElementById('pause-button').click();
        document.querySelector('[data-action="close"]').click();
      }
    });
    assert.equal((await verifyBoundaries(frame)).length, count + 10);
  });
  await check('inventory pauses simulation/audio and UI navigation cannot restart score', async () => {
    await frame.locator('#inventory-button').click();
    const before = await frame.evaluate(() => ({ time: __RUNIC.game.time, state: __RUNIC.snapshot() }));
    assert.equal(before.state.mode, 'paused');
    assert.equal(before.state.audio.voices, 0);
    await page.keyboard.press('x'); // A real gesture unlocks an empty context inside the modal.
    await frames(frame);
    assert.equal(await frame.evaluate(() => __RUNIC.game.time), before.time);
    assert.equal((await snapshot(frame)).audio.voices, 0);
    await verifyBoundaries(frame);
    await frame.locator('[data-action="close"]').first().click();
    await verifyBoundaries(frame);
  });
  await check('real iframe focus loss stops gameplay; explicit resume restarts it', async () => {
    await page.locator('#portal').click();
    await frame.waitForFunction(() => __RUNIC.game.mode === 'paused');
    assert.equal((await snapshot(frame)).sdk.gameplayActive, false);
    assert.equal((await snapshot(frame)).audio.voices, 0);
    await verifyBoundaries(frame);
    await frame.locator('[data-action="close"]').first().click();
    await verifyBoundaries(frame);
  });
  await check('visibility loss uses the same paired paused boundary', async () => {
    await frame.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    assert.equal((await snapshot(frame)).mode, 'paused');
    assert.equal((await snapshot(frame)).audio.voices, 0);
    await verifyBoundaries(frame);
    await frame.evaluate(() => { delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); });
    assert.equal((await snapshot(frame)).mode, 'paused');
    await frame.locator('[data-action="close"]').first().click();
    await verifyBoundaries(frame);
  });
  await context.close();

  const muteContext = await browser.newContext({ viewport: { width: 1000, height: 700 }, locale: 'en-US' });
  await muteContext.addInitScript(mockSDK, { mute: true, locale: 'pl-PL' });
  const mutePage = await muteContext.newPage(); observe(mutePage);
  await mutePage.goto(base + '/?qa=1'); await ready(mutePage);
  await check('platform mute wins over actual in-game audio toggles', async () => {
    await mutePage.locator('#audio-button').click();
    await mutePage.locator('#audio-button').click();
    await frames(mutePage);
    const state = await snapshot(mutePage);
    assert.equal(state.lang, 'pl', 'SDK locale selects Polish');
    assert.equal(state.audio.platformMuted, true); assert.equal(state.audio.muted, false); assert.equal(state.audio.voices, 0);
    await mutePage.evaluate(() => __PLATFORM.setMute(false));
    await mutePage.keyboard.press('x');
    await mutePage.waitForFunction(() => __RUNIC.snapshot().audio.voices > 0);
    assert.equal((await snapshot(mutePage)).audio.platformMuted, false);
    await mutePage.evaluate(() => __PLATFORM.setMute(true));
    assert.equal((await snapshot(mutePage)).audio.platformMuted, true);
  });
  await muteContext.close();

  const offlineContext = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'pl-PL' });
  await offlineContext.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new DOMException('Controlled storage denial', 'SecurityError'); } });
  });
  const offlinePage = await offlineContext.newPage(); observe(offlinePage);
  await offlinePage.goto(base + '/?qa=1'); await ready(offlinePage);
  await check('missing SDK and denied storage still boot; failed save visibly warns mobile player', async () => {
    assert.equal((await snapshot(offlinePage)).sdk.state, 'offline');
    assert.equal((await snapshot(offlinePage)).lang, 'en', 'Absent SDK locale falls back to English regardless of browser locale');
    await offlinePage.evaluate(() => __RUNIC.save());
    const message = offlinePage.locator('#save-status');
    assert.match(await message.textContent(), /SAVE UNAVAILABLE/);
    assert.equal(await message.isVisible(), true, 'The save failure must remain visible on mobile');
    assert.match((await snapshot(offlinePage)).sdk.dataError, /storage unavailable/);
  });
  await offlineContext.close();

  const rejectContext = await browser.newContext({ viewport: { width: 907, height: 510 }, locale: 'en-US' });
  await rejectContext.addInitScript(mockSDK, { rejectInit: true });
  const rejectPage = await rejectContext.newPage(); observe(rejectPage);
  await rejectPage.goto(base + '/?qa=1'); await ready(rejectPage);
  await check('SDK initialization rejection is optional and never blocks real gameplay', async () => {
    const state = await snapshot(rejectPage);
    assert.equal(state.mode, 'playing'); assert.equal(state.sdk.state, 'offline');
    assert.equal(state.audio.available, false);
  });
  await rejectContext.close();
  assert.deepEqual(errors, [], 'No game page errors or console errors');
  await mkdir('qa/arpg', { recursive: true });
  await writeFile('qa/arpg/platform-results.json', JSON.stringify({ scope: 'Bundled game in Chrome; controlled SDK transport, real WebAudio/WebGL and iframe lifecycle', passed: results, errors }, null, 2) + '\n');
  console.log(`${results.length} platform browser integration checks passed`);
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
