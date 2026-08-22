import { chromium } from 'playwright';

const url = `http://127.0.0.1:${process.env.PORT || 8531}/?debug=1`;
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 907, height: 510 }, deviceScaleFactor: 1 });
const failures = [];
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${name}${detail ? ` (${detail})` : ''}`);
  if (!ok) failures.push(name);
}

await page.goto(url, { waitUntil: 'domcontentloaded' });

// Regression 1: choosing a level card after its old resolve timer expired must
// resume a real enemy turn and then player input, rather than leave resolving.
await page.evaluate(() => { window.__astro.startGameWithSeed(17); window.__astro.setResolutionDelay(1); });
let levelupSeen = false;
for (let i = 0; i < 1200 && !levelupSeen; i++) {
  const s = await page.evaluate(() => window.__astro.getState());
  if (s.state === 'levelup') { levelupSeen = true; break; }
  if (s.state === 'gameover') { await page.evaluate(() => window.__astro.playAgain()); continue; }
  const adjacent = s.monstersNearby.find(m => Math.abs(m.dx) + Math.abs(m.dy) === 1);
  await page.evaluate(([dx, dy]) => window.__astro.move(dx, dy), adjacent ? [adjacent.dx, adjacent.dy] : [s.stairsDir.dx, s.stairsDir.dy]);
  await page.waitForTimeout(4);
}
check('combat opens a real level-up choice', levelupSeen);
if (levelupSeen) {
  await page.waitForTimeout(30); // deliberately longer than the old 1 ms resolve timer
  const beforePick = await page.evaluate(() => window.__astro.getState());
  await page.evaluate(() => window.__astro.pickCard(0));
  await page.waitForTimeout(12);
  const afterPick = await page.evaluate(() => window.__astro.getState());
  check('level-up choice never leaves a stale resolving lock', beforePick.turnPhase === 'levelup' && afterPick.turnPhase === 'player', `${beforePick.turnPhase}->${afterPick.turnPhase}`);
  const beforeMove = { x: afterPick.heroX, y: afterPick.heroY };
  await page.evaluate(([dx, dy]) => window.__astro.move(dx, dy), [afterPick.stairsDir.dx, afterPick.stairsDir.dy]);
  await page.waitForTimeout(12);
  const afterMove = await page.evaluate(() => window.__astro.getState());
  check('input works after a deliberately delayed level-up pick', afterMove.heroX !== beforeMove.x || afterMove.heroY !== beforeMove.y, `${beforeMove.x},${beforeMove.y} -> ${afterMove.heroX},${afterMove.heroY}`);
}

// Regression 2: a slow enemy's visible forecast must match its upcoming rest turn.
await page.evaluate(() => { window.__astro.newRunWithSeed(91); window.__astro.setupFinalPolishEncounter('slow'); });
let s = await page.evaluate(() => window.__astro.getState());
const ogre = s.monstersNearby.find(m => m.type === 'ogre');
check('slow enemy forecasts WAIT on its skipped turn', ogre?.intent === 'wait', JSON.stringify(ogre));
check('negative intent proof: skipped slow turn is not labelled MOVE', ogre?.intent !== 'move', JSON.stringify(ogre));

// Regression 3: a two-hit rune ward must return a tactical control window.
await page.evaluate(() => { window.__astro.newRunWithSeed(92); window.__astro.setupFinalPolishEncounter('ward'); window.__astro.setResolutionDelay(1); });
await page.evaluate(() => window.__astro.move(1, 0));
await page.waitForTimeout(12);
s = await page.evaluate(() => window.__astro.getState());
check('first ward strike keeps the ward in place', s.runePillarCount === 1, `wards=${s.runePillarCount}`);
await page.evaluate(() => window.__astro.move(1, 0));
await page.waitForTimeout(12);
s = await page.evaluate(() => window.__astro.getState());
const staggered = s.monstersNearby.find(m => m.type === 'skeleton');
check('shattered ward opens its tile and staggers the encounter', s.runePillarCount === 0 && s.staggeredMonsterCount === 1, `wards=${s.runePillarCount} staggered=${s.staggeredMonsterCount}`);
check('negative tactical proof: pulsed enemy is not forecast to move or attack', staggered?.intent === 'stunned', JSON.stringify(staggered));

await browser.close();
process.exit(failures.length ? 1 : 0);
