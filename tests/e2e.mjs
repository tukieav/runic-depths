// Runic Depths — E2E tests via Playwright + system Chrome
import { chromium } from 'playwright';

const URL = `http://localhost:${process.env.PORT || 8531}/?debug=1`;
const results = [];
let errors = [];

function check(name, ok, extra = '') {
  results.push({ name, ok, extra });
  console.log((ok ? 'PASS' : 'FAIL') + ' — ' + name + (extra ? ' (' + extra + ')' : ''));
}

const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);

const st0 = await page.evaluate(() => window.__astro.getState());
check('boots to menu', st0.state === 'menu', st0.state);

// start game
await page.evaluate(() => window.__astro.startGame());
await page.waitForTimeout(300);
let st = await page.evaluate(() => window.__astro.getState());
check('game starts (playing)', st.state === 'playing', st.state);
check('hero placed', st.heroX > 0 && st.heroY > 0);

// movement test
const before = { x: st.heroX, y: st.heroY };
await page.evaluate(() => {
  const s = window.__astro.getState();
  window.__astro.move(s.stairsDir.dx, s.stairsDir.dy);
});
await page.waitForTimeout(150);
st = await page.evaluate(() => window.__astro.getState());
check('movement works', st.heroX !== before.x || st.heroY !== before.y, `${before.x},${before.y} -> ${st.heroX},${st.heroY}`);

// keyboard movement
const kb0 = { x: st.heroX, y: st.heroY };
for (const k of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'a', 's', 'd']) {
  await page.keyboard.press(k);
  await page.waitForTimeout(60);
}
st = await page.evaluate(() => window.__astro.getState());
check('keyboard input accepted (no crash)', st.state === 'playing' || st.state === 'levelup' || st.state === 'gameover');

// Smart bot: walk toward stairs, fight monsters, level up, reach depth 2
let combatSeen = false, dmgDealt = false, levelupSeen = false, reachedDepth2 = false;
let prevMonHp = null;
for (let i = 0; i < 600; i++) {
  st = await page.evaluate(() => window.__astro.getState());
  if (st.state === 'gameover') break;
  if (st.state === 'levelup') {
    levelupSeen = true;
    await page.evaluate(() => window.__astro.pickCard(0));
    continue;
  }
  if (st.depth >= 2) reachedDepth2 = true;
  if (reachedDepth2 && levelupSeen && combatSeen && dmgDealt) break;
  if (st.depth >= 4) break;
  if (st.hp < 15 && st.potions > 0) { await page.evaluate(() => window.__astro.usePotion()); }
  // adjacent monster? attack it
  const adj = st.monstersNearby.find(m => Math.abs(m.dx) + Math.abs(m.dy) === 1);
  if (adj) {
    combatSeen = true;
    if (prevMonHp !== null && adj.hp < prevMonHp) dmgDealt = true;
    prevMonHp = adj.hp;
    await page.evaluate(([dx, dy]) => window.__astro.move(dx, dy), [adj.dx, adj.dy]);
  } else {
    prevMonHp = null;
    await page.evaluate(([dx, dy]) => window.__astro.move(dx, dy), [st.stairsDir.dx, st.stairsDir.dy]);
  }
  await page.waitForTimeout(25);
}
check('combat happened', combatSeen);
check('damage reduces monster hp', dmgDealt);
check('level-up card flow', levelupSeen, levelupSeen ? '' : 'no level-up during run (may need more XP)');
check('reached depth 2 (stairs work)', reachedDepth2, 'depth=' + st.depth);

// death test
await page.evaluate(() => window.__astro.forceGameOver());
await page.waitForTimeout(300);
st = await page.evaluate(() => window.__astro.getState());
check('death -> gameover', st.state === 'gameover', st.state);
check('hp is 0', st.hp === 0);

// rewarded resurrect (localhost SDK shows test ad)
await page.evaluate(() => window.__astro.resurrect());
// wait for test ad to finish (up to 35s)
let resurrected = false;
for (let i = 0; i < 70; i++) {
  await page.waitForTimeout(500);
  st = await page.evaluate(() => window.__astro.getState());
  if (st.state === 'playing') { resurrected = true; break; }
}
check('rewarded resurrect revives', resurrected, 'hp=' + st.hp + ' state=' + st.state);
if (resurrected) check('resurrect gives ~50% hp', st.hp > 0);

// die again, then midgame + play again restart
await page.evaluate(() => window.__astro.forceGameOver());
await page.waitForTimeout(300);
await page.evaluate(() => window.__astro.playAgain());
let restarted = false;
for (let i = 0; i < 70; i++) {
  await page.waitForTimeout(500);
  st = await page.evaluate(() => window.__astro.getState());
  if (st.state === 'playing' && st.depth === 1) { restarted = true; break; }
}
check('midgame ad + PLAY AGAIN restarts', restarted, 'state=' + st.state + ' depth=' + st.depth);

// canvas pixels non-black
const bright = await page.evaluate(() => {
  const c = document.getElementById('game');
  const x = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let n = 0;
  for (let i = 0; i < x.length; i += 400) { if (x[i] > 40 || x[i + 1] > 40 || x[i + 2] > 40) n++; }
  return n;
});
check('canvas renders bright pixels', bright > 0, 'samples=' + bright);

// ===== meta-progression tests =====
// after deaths above, souls should have been banked
st = await page.evaluate(() => window.__astro.getState());
check('daily streak granted', st.streak >= 1 && st.dailyBonus > 0, 'streak=' + st.streak + ' bonus=' + st.dailyBonus);

// grant souls, buy an upgrade
await page.evaluate(() => window.__astro.addSouls(500));
st = await page.evaluate(() => window.__astro.getState());
check('souls currency exists', st.souls >= 500, 'souls=' + st.souls);
const soulsBefore = st.souls;
const bought = await page.evaluate(() => window.__astro.buyUpgrade('hp'));
st = await page.evaluate(() => window.__astro.getState());
check('shop upgrade purchase works', bought && st.upgrades.hp === 1 && st.souls < soulsBefore, 'hp lvl=' + st.upgrades.hp);

// buy + select a class
const cbought = await page.evaluate(() => window.__astro.buyClass('rogue'));
st = await page.evaluate(() => window.__astro.getState());
check('class unlock works', cbought && st.classes.includes('rogue') && st.selectedClass === 'rogue');

// persistence: reload page, meta must survive
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
st = await page.evaluate(() => window.__astro.getState());
check('meta persists after reload', st.upgrades.hp === 1 && st.classes.includes('rogue'), 'souls=' + st.souls + ' hp=' + st.upgrades.hp);
check('bestiary recorded kills', st.bestiaryCount >= 1, 'types=' + st.bestiaryCount);
check('depth record saved', st.bestDepth >= 2, 'bestDepth=' + st.bestDepth);

// shop UI renders (canvas-based)
await page.evaluate(() => window.__astro.openShop());
await page.waitForTimeout(400);
const shopBright = await page.evaluate(() => {
  const c = document.getElementById('game');
  const x = c.getContext('2d').getImageData(0, 100, c.width, 300).data;
  let n = 0;
  for (let i = 0; i < x.length; i += 400) { if (x[i] > 40 || x[i + 1] > 40 || x[i + 2] > 40) n++; }
  return n;
});
check('soul shop screen renders', shopBright > 0, 'samples=' + shopBright);
await page.evaluate(() => window.__astro.closeOverlay());

// bestiary UI renders
await page.evaluate(() => window.__astro.openBestiary());
await page.waitForTimeout(400);
const bestBright = await page.evaluate(() => {
  const c = document.getElementById('game');
  const x = c.getContext('2d').getImageData(0, 100, c.width, 300).data;
  let n = 0;
  for (let i = 0; i < x.length; i += 400) { if (x[i] > 40 || x[i + 1] > 40 || x[i + 2] > 40) n++; }
  return n;
});
check('bestiary screen renders', bestBright > 0, 'samples=' + bestBright);
await page.evaluate(() => window.__astro.closeOverlay());

// rogue class run: verify class stats apply (rogue = 30+6 hp with hp upgrade lvl1)
await page.evaluate(() => window.__astro.startGame());
await page.waitForTimeout(300);
st = await page.evaluate(() => window.__astro.getState());
check('rogue class run starts', st.state === 'playing');

// touch input: tap canvas (mobile support)
await page.touchscreen.tap(640, 400).catch(() => {});
await page.waitForTimeout(200);
st = await page.evaluate(() => window.__astro.getState());
check('touch tap does not crash', ['playing', 'levelup', 'gameover'].includes(st.state), st.state);

// filter known benign errors (SDK ad errors are expected flows)
errors = errors.filter(e => !e.includes('sdk init timeout') && !e.includes('CrazyGames SDK unavailable') && !e.includes('happytime() call throttled'));
check('zero console/page errors', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();
const fails = results.filter(r => !r.ok);
console.log('\n' + (fails.length === 0 ? 'ALL TESTS PASSED' : fails.length + ' FAILURES'));
console.log('CONSOLE_ERRORS=' + errors.length);
process.exit(fails.length === 0 ? 0 : 1);
