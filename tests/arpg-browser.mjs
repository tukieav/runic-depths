// Browser integration checks use the bundled shipping game, plus opt-in QA inspection.
// This is local evidence, not a CrazyGames approval or a physical device benchmark.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { ENDINGS } from '../src/content.js';

const root = path.resolve('dist');
const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const file = path.resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
    if (!file.startsWith(root + path.sep)) { res.writeHead(403); return res.end(); }
    const body = await readFile(file);
    res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp' })[path.extname(file)] || 'application/octet-stream');
    res.end(body);
  } catch { res.writeHead(404); res.end('Not found'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
await mkdir('qa/arpg', { recursive: true });
await rm('qa/arpg/browser-results.json', { force: true });
const buildHashes = Object.fromEntries(await Promise.all(['bundle.js', 'bundle.css', 'index.html'].map(async file => [file, createHash('sha256').update(await readFile(path.join(root, file))).digest('hex')])));
const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN || '/usr/bin/google-chrome', headless: true,
  args: ['--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const results = [], errors = [];
const viewportMatrix = [
  ['desktop', 1440, 900, false], ['portal', 907, 510, false],
  ['portal-medium', 1216, 684, false], ['portal-compact', 1077, 606, false],
  ['portal-small', 821, 462, false], ['laptop', 1366, 768, false],
  ['full-hd', 1920, 1080, false], ['desktop-large', 1536, 864, false],
  ['hd', 1280, 720, false], ['tablet', 1080, 607, true],
  ['mobile-wide', 800, 450, true], ['portrait', 390, 844, true],
  ['landscape', 844, 390, true],
];
const check = async (name, run) => { await run(); results.push(name); console.log(`PASS ${name}`); };
const state = page => page.evaluate(() => window.__RUNIC.snapshot());
const hero = page => page.evaluate(() => ({ ...window.__RUNIC.game.hero, time: window.__RUNIC.game.time }));
// Wait for observed motion: software WebGL on CI may render only a few frames per second.
const waitForMotion = (page, before, minimum) => page.waitForFunction(({ x, y, minimum }) => {
  const h = window.__RUNIC.game.hero;
  return Math.hypot(h.x - x, h.y - y) > minimum;
}, { x: before.x, y: before.y, minimum }, { timeout: 10000 });
const start = async (page, classId = 'warden') => {
  await page.evaluate(id => window.__RUNIC.newGame(id), classId);
  await page.waitForFunction(() => window.__RUNIC.game.mode === 'playing' && !document.querySelector('#hud').hidden);
  // Wait two actual rendered frames after a scene rebuild, not an arbitrary screenshot delay.
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
};
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: 'en-US' });
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', e => { if (e.type() === 'error') errors.push(e.text()); });
  await page.goto(`${base}/?qa=1`);
  await page.waitForFunction(() => window.__RUNIC?.game && window.__RUNIC?.renderer, null, { timeout: 20000 });
  await check('WebGL scene boots with opt-in QA hook', async () => {
    const value = await page.evaluate(() => ({ canvas: !!document.querySelector('#game'), renderer: !!window.__RUNIC.renderer.renderer, classId: window.__RUNIC.game.hero.classId }));
    assert.ok(value.canvas && value.renderer); assert.ok(value.classId);
  });
  await start(page);
  await check('keyboard movement changes world position continuously', async () => {
    const before = await hero(page); await page.keyboard.down('d');
    try { await waitForMotion(page, before, .25); } finally { await page.keyboard.up('d'); }
    const after = await hero(page); assert.ok(Math.hypot(after.x - before.x, after.y - before.y) > .25);
    assert.ok(after.time > before.time);
  });
  await check('ground click creates movement and reaches nearby target', async () => {
    await start(page);
    const point = await page.evaluate(() => {
      const { game, renderer } = window.__RUNIC;
      for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 8) {
        const target = { x: game.hero.x + Math.cos(angle) * 2, y: game.hero.y + Math.sin(angle) * 2 };
        if (!game.walkable(target.x, target.y) || !game.lineOfSight(game.hero, target)) continue;
        if ([...game.objects.filter(o => !o.used), ...game.enemies.filter(e => !e.dead)].some(o => Math.hypot(o.x - target.x, o.y - target.y) < 1.3)) continue;
        const screen = renderer.project(target.x, target.y, 0);
        if (document.elementFromPoint(screen.x, screen.y)?.id === 'game') return screen;
      }
      throw new Error('No unobstructed nearby ground click target');
    });
    const before = await hero(page); await page.mouse.click(point.x, point.y); await waitForMotion(page, before, .3);
    const after = await hero(page); assert.ok(Math.hypot(after.x - before.x, after.y - before.y) > .3);
  });
  await check('inventory pauses simulation and Escape resumes play', async () => {
    await page.keyboard.press('i'); await page.waitForTimeout(60);
    const before = await hero(page); assert.notEqual(await page.evaluate(() => window.__RUNIC.game.mode), 'playing');
    await page.waitForTimeout(300); const after = await hero(page); assert.equal(after.time, before.time); assert.equal(after.hp, before.hp);
    await page.keyboard.press('Escape'); await page.waitForFunction(() => window.__RUNIC.game.mode === 'playing');
  });
  await check('modal focus stays trapped and focused buttons activate from the keyboard', async () => {
    await page.locator('#pause-button').click();
    for (let i = 0; i < 15; i++) {
      await page.keyboard.press('Tab'); assert.ok(await page.evaluate(() => document.querySelector('#modal-root').contains(document.activeElement)));
    }
    await page.locator('[data-action="close"]').first().focus(); await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => window.__RUNIC.game.mode), 'playing');
  });
  await check('English/Polish switching updates visible gameplay labels', async () => {
    const before = await page.locator('#quest-title').innerText(); await page.locator('#language-button').click();
    const after = await page.locator('#quest-title').innerText(); assert.notEqual(before, after);
    assert.equal(await page.locator('html').getAttribute('lang'), 'pl');
    await page.locator('#language-button').click(); assert.equal(await page.locator('html').getAttribute('lang'), 'en');
  });
  await check('five classes render and keyboard skills spend mana with cooldown feedback', async () => {
    for (const classId of ['warden', 'ranger', 'arcanist', 'reaver', 'oracle']) {
      await start(page, classId); const before = await hero(page); await page.keyboard.press('1');
      const after = await hero(page); assert.equal(after.classId, classId); assert.ok(after.mana < before.mana);
      assert.ok(await page.evaluate(() => window.__RUNIC.game.cooldowns[0] > 0));
      assert.ok((await page.locator('#hero-name').innerText()).length > 2);
    }
  });
  await check('mute and modal lifecycle control live WebAudio', async () => {
    await page.locator('#basic-button').click(); const active = (await state(page)).audio;
    assert.ok(active?.available, 'AudioContext exists after a gesture');
    await page.locator('#audio-button').click(); assert.equal((await state(page)).audio.muted, true);
    await page.locator('#audio-button').click(); assert.equal((await state(page)).audio.muted, false);
    await page.locator('#pause-button').click(); await page.waitForTimeout(100);
    const paused = (await state(page)).audio; assert.equal(paused.voices, 0); assert.equal(paused.paused, true);
    await page.keyboard.press('Escape');
  });
  await check('WebGL context loss pauses safely and restoration permits resume', async () => {
    await page.evaluate(() => window.__RUNIC.renderer.renderer.forceContextLoss());
    await page.waitForFunction(() => window.__RUNIC.game.mode === 'paused');
    const before = await hero(page); await page.waitForTimeout(150); assert.equal((await hero(page)).time, before.time);
    await page.evaluate(() => window.__RUNIC.renderer.renderer.forceContextRestore());
    await page.waitForFunction(() => !window.__RUNIC.renderer.renderer.getContext().isContextLost());
    await page.keyboard.press('Escape'); await page.waitForTimeout(100);
    assert.equal(await page.evaluate(() => window.__RUNIC.game.mode), 'playing');
  });
  await check('local progress survives reload and continue', async () => {
    await page.evaluate(() => { window.__RUNIC.game.gold = 321; window.__RUNIC.game.emit('save'); });
    await page.waitForTimeout(400); await page.reload();
    await page.waitForFunction(() => window.__RUNIC?.game);
    const continueButton = page.getByRole('button', { name: /Continue journey|Kontynuuj podróż/i });
    if (await continueButton.isVisible()) await continueButton.click();
    assert.equal(await page.evaluate(() => window.__RUNIC.game.gold), 321);
    assert.equal(await page.evaluate(() => window.__RUNIC.game.hero.classId), 'oracle');
  });
  await check('real story-choice buttons lead to three final ending screens (scripted combat setup)', async () => {
    async function clearedPortal(floor) {
      await page.evaluate(depth => {
        const { game, renderer } = window.__RUNIC; game.floor = depth; game.makeFloor(); renderer.build(game);
        for (const enemy of [...game.enemies]) game.hurtEnemy(enemy, 1e8);
        const portal = game.objects.find(o => o.type === 'portal'); game.hero.x = portal.x; game.hero.y = portal.y; game.interact();
      }, floor);
    }
    for (const [ending, first, second] of [['restore', 'preserve', 'shelter'], ['release', 'release', 'freedom'], ['balance', 'preserve', 'freedom']]) {
      await start(page); await clearedPortal(4);
      await page.locator(`[data-action="story-choice"][data-id="${first}"]`).click();
      assert.equal(await page.evaluate(() => window.__RUNIC.game.floor), 5);
      await clearedPortal(8); await page.locator(`[data-action="story-choice"][data-id="${second}"]`).click();
      assert.equal(await page.evaluate(() => window.__RUNIC.game.floor), 9);
      await clearedPortal(12);
      assert.equal(await page.evaluate(() => window.__RUNIC.game.mode), 'victory');
      assert.ok((await page.locator('#modal-root').innerText()).includes(ENDINGS[ending].title.en));
      await page.screenshot({ path: `qa/arpg/ending-${ending}.png` });
    }
  });
  await check('desktop and portal/mobile layouts keep controls reachable', async () => {
    const layoutErrors = [];
    for (const [label, width, height, mobile] of viewportMatrix) {
      const priorErrors = layoutErrors.length;
      // Release the desktop WebGL context before opening touch contexts on small CI runners.
      if (mobile && !page.isClosed()) await page.close();
      const view = mobile ? await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1, hasTouch: true, isMobile: true, locale: 'en-US' }) : page;
      if (mobile) {
        view.on('pageerror', e => errors.push(e.message));
        view.on('console', e => { if (e.type() === 'error') errors.push(`${label}: ${e.text()}`); });
        await view.goto(`${base}/?qa=1`); await view.waitForFunction(() => window.__RUNIC?.game);
      }
      else await view.setViewportSize({ width, height });
      await start(view);
      assert.equal(await view.evaluate(() => devicePixelRatio), 1, `${label}: audited at DPR 1`);
      assert.equal(await view.evaluate(() => matchMedia('(pointer:coarse)').matches), mobile, `${label}: correct input capabilities`);
      await view.screenshot({ path: `qa/arpg/${label}-${width}x${height}.png` });
      if (!await view.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)) layoutErrors.push(`${label}: horizontal overflow`);
      for (const id of ['#language-button', '#audio-button', '#pause-button', '#inventory-button', '#journal-button', '#talents-button', '#character-button', '#basic-button', '#skill-0', '#skill-1', '#skill-2', '#dodge-button', '#potion-button', '#interact-button', ...(mobile ? ['#touch-stick'] : [])]) {
        const box = await view.locator(id).boundingBox();
        if (!(box && box.x >= -1 && box.y >= -1 && box.x + box.width <= width + 1 && box.y + box.height <= height + 1)) layoutErrors.push(`${label}: ${id} outside viewport ${JSON.stringify(box)}`);
        if (!(box?.width >= 28 && box?.height >= 28)) layoutErrors.push(`${label}: ${id} small hit target ${JSON.stringify(box)}`);
        if (box && !await view.evaluate(selector => {
          const element = document.querySelector(selector), rect = element.getBoundingClientRect();
          return element.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
        }, id)) layoutErrors.push(`${label}: ${id} center is covered by another element`);
      }
      async function checkModal(name) {
        const box = await view.locator('.modal').boundingBox();
        if (!(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= width + 1 && box.y + box.height <= height + 1)) layoutErrors.push(`${label}: ${name} modal outside viewport ${JSON.stringify(box)}`);
        if (!await view.locator('.modal').evaluate(element => element.scrollWidth <= element.clientWidth + 1)) layoutErrors.push(`${label}: ${name} modal has horizontal overflow`);
      }
      await view.locator('#inventory-button').click(); await checkModal('inventory'); await view.screenshot({ path: `qa/arpg/${label}-inventory.png` });
      await view.keyboard.press('Escape');
      await view.locator('#character-button').click();
      assert.equal(await view.locator('[data-action="select-class"]').count(), 5);
      await checkModal('class selection');
      await view.screenshot({ path: `qa/arpg/${label}-classes.png` });
      await view.keyboard.press('Escape');
      if (mobile) {
        const before = await hero(view); const skillBox = await view.locator('#skill-0').boundingBox();
        await view.touchscreen.tap(skillBox.x + skillBox.width / 2, skillBox.y + skillBox.height / 2);
        assert.ok((await hero(view)).mana < before.mana, `${label}: touch skill spends mana`);
        const box = await view.locator('#touch-stick').boundingBox(); assert.ok(box, `${label}: joystick visible`);
        const cdp = await view.context().newCDPSession(view), x = box.x + box.width / 2, y = box.y + box.height / 2;
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + 25, y }] });
        try { await waitForMotion(view, before, .2); } finally { await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); }
        const after = await hero(view); assert.ok(Math.hypot(after.x - before.x, after.y - before.y) > .2, `${label}: real touch joystick moves hero`);
        await view.close();
      }
      console.log(`${layoutErrors.length === priorErrors ? 'PASS' : 'FAIL'} layout ${label} ${width}x${height} DPR1 ${mobile ? 'touch' : 'mouse'}`);
    }
    assert.deepEqual(layoutErrors, [], 'reachable controls');
  });
  await check('shipping URL hides privileged QA controls', async () => {
    const production = await browser.newPage(); await production.goto(base);
    await production.waitForFunction(() => document.querySelector('#loading').hidden || getComputedStyle(document.querySelector('#loading')).display === 'none');
    assert.equal(await production.evaluate(() => typeof window.__RUNIC), 'undefined'); await production.close();
  });
  assert.deepEqual(errors, [], 'no browser runtime or console errors');
  await writeFile('qa/arpg/browser-results.json', JSON.stringify({ date: new Date().toISOString(), browser: await browser.version(), renderer: 'headless Chrome SwiftShader', buildHashes, viewports: viewportMatrix.map(([label, width, height, coarsePointer]) => ({ label, width, height, coarsePointer, dpr: 1 })), passed: results, errors, externalPortalAudit: 'not performed' }, null, 2));
  console.log(`PASS ${results.length} browser integration groups; screenshots in qa/arpg`);
} finally {
  await browser.close(); await new Promise(resolve => server.close(resolve));
}
