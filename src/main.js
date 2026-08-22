// Runic Depths — turn-based dungeon crawler mini-cRPG for CrazyGames
import { initSDK, loadingStart, loadingStop, gameplayStart, gameplayStop, happytime, requestAd, getMuteSetting, onSettingsChange, loadBest, saveBest } from './sdk.js';
import * as sfx from './audio.js';
import { meta, loadMeta, saveMeta, CLASSES, UPGRADES, BESTIARY_INFO, upgradeCost, canBuyUpgrade, buyUpgrade, canBuyClass, buyClass, selectClass, addSouls, recordKill, recordRun, checkDailyStreak, startingHero, goldMult } from './meta.js';
import * as gfx from './gfx.js';

// Desktop-first fullscreen viewport: canvas fills 100% of the browser window.
// GAME_W/GAME_H are the logical game-space size (wider window = more dungeon visible).
let GAME_W = 1280, GAME_H = 720;
let viewScale = 1, dpr = 1;
const TILE = 40;
const MAP_W = 44, MAP_H = 34;
const VIEW_RADIUS = 9;
const MIN_TILES_Y = 15.5; // vertical tiles always visible — horizontal grows with aspect

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
const motionScale = () => reducedMotionQuery.matches ? 0.35 : 1;

function fitCanvas() {
  const ww = Math.max(320, window.innerWidth), wh = Math.max(240, window.innerHeight);
  dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(ww * dpr);
  canvas.height = Math.round(wh * dpr);
  canvas.style.width = ww + 'px';
  canvas.style.height = wh + 'px';
  const aspect = ww / wh;
  if (aspect >= 1.15) {
    // landscape/desktop: fixed vertical tiles, width follows aspect (wider = more dungeon)
    GAME_H = MIN_TILES_Y * TILE;
    GAME_W = GAME_H * aspect;
    viewScale = (wh * dpr) / GAME_H;
  } else {
    // portrait/square: fixed logical width so UI panels always fit
    GAME_W = 720;
    GAME_H = GAME_W / aspect;
    viewScale = (ww * dpr) / GAME_W;
  }
}
window.addEventListener('resize', fitCanvas); fitCanvas();

// ---------- data ----------
const WEAPONS = [
  { name: 'Rusty Dagger', atk: 1, color: '#8a8f98', icon: 'dagger' },
  { name: 'Iron Sword', atk: 3, color: '#c8ccd4', icon: 'sword' },
  { name: 'War Axe', atk: 6, color: '#d4a24c', icon: 'axe' },
  { name: 'Runeblade', atk: 10, color: '#5cc8ff', icon: 'rune' },
  { name: 'Voidfang', atk: 15, color: '#c05cff', icon: 'void' },
];
const ARMORS = [
  { name: 'Cloth Rags', def: 0, color: '#9a8f78' },
  { name: 'Leather', def: 1, color: '#a5713c' },
  { name: 'Chainmail', def: 2, color: '#b8bec8' },
  { name: 'Runeplate', def: 4, color: '#5cc8ff' },
  { name: 'Voidmail', def: 6, color: '#c05cff' },
];
const MONSTER_TYPES = {
  goblin:   { name: 'Goblin',   hp: 8,  atk: 3,  def: 0, xp: 5,  color: '#5cb85c', size: 0.32, slow: false },
  bat:      { name: 'Cave Bat', hp: 5,  atk: 2,  def: 0, xp: 4,  color: '#9a7ad0', size: 0.26, slow: false, erratic: true },
  skeleton: { name: 'Skeleton', hp: 14, atk: 5,  def: 1, xp: 10, color: '#d8d8cc', size: 0.36, slow: false },
  cultist:  { name: 'Cultist',  hp: 12, atk: 4,  def: 0, xp: 14, color: '#d05ca8', size: 0.34, slow: false, ranged: true },
  ogre:     { name: 'Ogre',     hp: 28, atk: 9,  def: 2, xp: 22, color: '#b06a3c', size: 0.44, slow: true },
  wraith:   { name: 'Wraith',   hp: 18, atk: 7,  def: 1, xp: 26, color: '#6ad0d0', size: 0.38, slow: false, phasing: true },
  boss:     { name: 'Depth Lord', hp: 60, atk: 12, def: 3, xp: 60, color: '#e04c6a', size: 0.5, slow: false, boss: true },
};

// ---------- state ----------
let state = 'boot'; // boot, menu, shop, bestiary, playing, levelup, gameover
let map, explored, visible, rooms;
let hero, monsters, chests, potionsOnFloor, goldPiles, soulGems, altars, stairs, runePillars;
let depth, gold, score, best = 0;
let runSouls = 0, soulsDoubled = false, soulsBanked = 0;
let dailyBonus = 0;
let shopTab = 'upgrades'; // upgrades | classes
let turnCount = 0;
let floaters = [], particles = [];
let shake = 0, shakeT = 0;
let levelCards = [];
let resurrectUsed = false, adBusy = false;
let camX = 0, camY = 0;
let buttons = []; // {x,y,w,h,id}
let time = 0;
let msgLog = [];
let torchList = []; // visible torch tiles for lighting
let decos = []; // room decorations: {x,y,kind,v}
let displayHp = 0, displayXp = 0; // animated bar drain
let turnPhase = 'player'; // player | resolving | paused
let resolvingTimer = null;
let resolutionDelay = 120;
let pendingEnemyTurn = false;
let paused = false;
let frameDt = 0;
let selectedPath = null;
let floorSeed = 0;
const MAX_PARTICLES = 240, MAX_FLOATERS = 40, MAX_RINGS = 12;

function seededRandom(seed) {
  let v = (seed >>> 0) || 1;
  return () => { v += 0x6D2B79F5; let t = v; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

function logMsg(t, color) { msgLog.push({ t, color: color || '#cfc9b8', life: 4 }); if (msgLog.length > 4) msgLog.shift(); }

// ---------- dungeon generation ----------
function genDungeon(d, seed = Date.now()) {
  const random = seededRandom(seed + d * 7919);
  map = [];
  for (let y = 0; y < MAP_H; y++) { map.push(new Array(MAP_W).fill(1)); } // 1 = wall
  rooms = [];
  const nRooms = 8 + Math.min(6, d);
  let tries = 0;
  while (rooms.length < nRooms && tries < 300) {
    tries++;
    const w = 4 + (random() * 6 | 0), h = 4 + (random() * 5 | 0);
    const x = 1 + (random() * (MAP_W - w - 2) | 0), y = 1 + (random() * (MAP_H - h - 2) | 0);
    let ok = true;
    for (const r of rooms) {
      if (x < r.x + r.w + 1 && x + w + 1 > r.x && y < r.y + r.h + 1 && y + h + 1 > r.y) { ok = false; break; }
    }
    if (!ok) continue;
    rooms.push({ x, y, w, h, cx: x + (w >> 1), cy: y + (h >> 1) });
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) map[yy][xx] = 0;
  }
  // connect rooms in sequence with L-corridors
  for (let i = 1; i < rooms.length; i++) {
    const a = rooms[i - 1], b = rooms[i];
    let x = a.cx, y = a.cy;
    while (x !== b.cx) { map[y][x] = 0; x += Math.sign(b.cx - x); }
    while (y !== b.cy) { map[y][x] = 0; y += Math.sign(b.cy - y); }
    map[y][x] = 0;
  }
  // torches on wall tiles adjacent to floor — dense enough to light rooms every few tiles
  torchList = [];
  for (let y = 1; y < MAP_H - 1; y++) for (let x = 1; x < MAP_W - 1; x++) {
    if (map[y][x] === 1 && map[y + 1][x] === 0 && random() < 0.2) { map[y][x] = 2; torchList.push({ x, y }); }
  }
  // guarantee at least 2 torches per room (rooms must never be pitch dark)
  for (const r of rooms) {
    let count = 0;
    for (const t of torchList) if (t.x >= r.x - 1 && t.x <= r.x + r.w && t.y >= r.y - 2 && t.y <= r.y + r.h) count++;
    let guard = 0;
    while (count < 2 && guard++ < 60) {
      const x = r.x + (random() * r.w | 0), y = r.y - 1 + (random() * (r.h + 1) | 0);
      if (y >= 1 && map[y][x] === 1 && map[y + 1] && map[y + 1][x] === 0) { map[y][x] = 2; torchList.push({ x, y }); count++; }
    }
  }
  // decorations: every room gets 3-7 floor props (bones, rubble, mushrooms, crates, webs, pillars, puddles)
  decos = [];
  const DECO_KINDS = ['rubble', 'bones', 'mushroom', 'crack', 'crate', 'web', 'puddle', 'skull', 'pillar'];
  for (const r of rooms) {
    const n = 3 + (random() * 5 | 0);
    let placed = 0, guard = 0;
    while (placed < n && guard++ < 50) {
      const x = r.x + (random() * r.w | 0), y = r.y + (random() * r.h | 0);
      if (map[y][x] !== 0) continue;
      if (decos.some(dd => dd.x === x && dd.y === y)) continue;
      let kind = DECO_KINDS[random() * DECO_KINDS.length | 0];
      // pillars only in rooms >= 5x5 and away from edges
      if (kind === 'pillar' && (r.w < 5 || r.h < 5 || x <= r.x || x >= r.x + r.w - 1 || y <= r.y || y >= r.y + r.h - 1)) kind = 'rubble';
      decos.push({ x, y, kind, v: random() });
      placed++;
    }
  }
  // corridor rubble sprinkles
  for (let y = 1; y < MAP_H - 1; y++) for (let x = 1; x < MAP_W - 1; x++) {
    if (map[y][x] === 0 && random() < 0.03 && !rooms.some(r => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) && !decos.some(dd => dd.x === x && dd.y === y)) {
      decos.push({ x, y, kind: random() < 0.5 ? 'rubble' : 'crack', v: random() });
    }
  }
  explored = [];
  for (let y = 0; y < MAP_H; y++) explored.push(new Array(MAP_W).fill(false));
  // first frame richness: start room (+wall border) is pre-explored
  for (let y = Math.max(0, rooms[0].y - 1); y <= Math.min(MAP_H - 1, rooms[0].y + rooms[0].h); y++)
    for (let x = Math.max(0, rooms[0].x - 1); x <= Math.min(MAP_W - 1, rooms[0].x + rooms[0].w); x++)
      explored[y][x] = true;

  // hero start = first room, stairs = farthest room
  const start = rooms[0];
  hero.x = start.cx; hero.y = start.cy;
  let far = rooms[0], fd = -1;
  for (const r of rooms) {
    const dd = Math.abs(r.cx - start.cx) + Math.abs(r.cy - start.cy);
    if (dd > fd) { fd = dd; far = r; }
  }
  stairs = { x: far.cx, y: far.cy };

  // populate
  monsters = []; chests = []; potionsOnFloor = []; goldPiles = []; soulGems = []; altars = []; runePillars = [];
  const isBossDepth = d % 3 === 0;
  // special rooms: pick 1-2 non-start, non-stairs rooms
  const specials = [];
  const candidates = rooms.slice(1).filter(r => r !== far);
  shuffle(candidates, random);
  if (d >= 2 && candidates.length > 0) specials.push({ room: candidates[0], kind: 'vault' });    // guarded treasure vault
  if (d >= 3 && candidates.length > 1 && random() < 0.6) specials.push({ room: candidates[1], kind: 'altar' }); // risk/reward altar
  for (let i = 1; i < rooms.length; i++) {
    const r = rooms[i];
    const special = specials.find(s => s.room === r);
    const spots = [];
    for (let yy = r.y; yy < r.y + r.h; yy++) for (let xx = r.x; xx < r.x + r.w; xx++) {
      if (!(xx === stairs.x && yy === stairs.y)) spots.push({ x: xx, y: yy });
    }
    shuffle(spots, random);
    let si = 0;
    if (special && special.kind === 'vault') {
      // treasure vault: 2 chests + gold, guarded by 2 tough monsters
      for (let c = 0; c < 2 && si < spots.length; c++) { chests.push({ x: spots[si].x, y: spots[si].y, opened: false }); si++; }
      if (si < spots.length) { goldPiles.push({ x: spots[si].x, y: spots[si].y, amt: 20 + (random() * 15 * d | 0) }); si++; }
      for (let m = 0; m < 2 && si < spots.length; m++) {
        spawnMonster(d >= 4 && m === 0 ? 'wraith' : d >= 2 ? 'ogre' : 'skeleton', spots[si].x, spots[si].y, d);
        si++;
      }
      continue;
    }
    if (special && special.kind === 'altar') {
      if (si < spots.length) { altars.push({ x: spots[si].x, y: spots[si].y, used: false }); si++; }
    }
    // difficulty curve: gentle at depth 1-2, ramps after
    const monCap = d <= 1 ? 2 : d === 2 ? 2 : 3;
    const nMon = (d <= 1 ? 0 : 1) + (random() * Math.min(monCap, 1 + d * 0.45) | 0);
    for (let m = 0; m < nMon && si < spots.length; m++) {
      spawnMonster(rollMonsterType(d, random), spots[si].x, spots[si].y, d);
      si++;
    }
    if (random() < 0.55 && si < spots.length) { chests.push({ x: spots[si].x, y: spots[si].y, opened: false }); si++; }
    if (random() < 0.3 && si < spots.length) { potionsOnFloor.push({ x: spots[si].x, y: spots[si].y }); si++; }
    if (random() < 0.4 && si < spots.length) { goldPiles.push({ x: spots[si].x, y: spots[si].y, amt: 5 + (random() * 10 * d | 0) }); si++; }
    if (random() < 0.25 && si < spots.length) { soulGems.push({ x: spots[si].x, y: spots[si].y, amt: 1 + (random() * (1 + d * 0.4) | 0) }); si++; }
  }
  if (isBossDepth) {
    // boss guards the stairs room
    spawnMonster('boss', far.cx + (far.w > 2 ? 1 : 0), far.cy, d);
    // boss floors always drop a soul gem cluster near stairs
    soulGems.push({ x: far.cx - 1, y: far.cy, amt: 3 + d });
  }
  // The opening cannot place a monster within four moves of the hero; the first
  // room teaches reading intent and routes before it demands a fight.
  if (d === 1) monsters = monsters.filter(m => Math.abs(m.x - hero.x) + Math.abs(m.y - hero.y) > 4);
  // rich first impression: the starting room always has visible loot
  {
    const spots = [];
    for (let yy = start.y; yy < start.y + start.h; yy++) for (let xx = start.x; xx < start.x + start.w; xx++) {
      if ((xx !== hero.x || yy !== hero.y) && map[yy][xx] === 0 &&
          !chests.some(c => c.x === xx && c.y === yy) && !goldPiles.some(g => g.x === xx && g.y === yy)) {
        spots.push({ x: xx, y: yy });
      }
    }
    shuffle(spots, random);
    if (spots[0] && !chests.some(c => c.x === spots[0].x && c.y === spots[0].y)) chests.push({ x: spots[0].x, y: spots[0].y, opened: false });
    if (spots[1]) goldPiles.push({ x: spots[1].x, y: spots[1].y, amt: 6 + (random() * 8 | 0) });
    // Fair first floor: a reachable healing resource is always in the pre-explored start room.
    if (spots[2] && d === 1) potionsOnFloor.push({ x: spots[2].x, y: spots[2].y });
    if (spots[3] && d === 1) soulGems.push({ x: spots[3].x, y: spots[3].y, amt: 1 });
  }
  // Rune wards belong to a live encounter: they block bolts until shattered,
  // then pulse to buy a short, deliberate window against that room's enemies.
  const pillarRoom = rooms.slice(1).find(r => r !== far && r.w >= 5 && r.h >= 5 &&
    monsters.some(m => m.x >= r.x && m.x < r.x + r.w && m.y >= r.y && m.y < r.y + r.h));
  if (pillarRoom) {
    const wardSpots = [[pillarRoom.cx, pillarRoom.cy], [pillarRoom.cx - 1, pillarRoom.cy], [pillarRoom.cx + 1, pillarRoom.cy], [pillarRoom.cx, pillarRoom.cy - 1], [pillarRoom.cx, pillarRoom.cy + 1]];
    const spot = wardSpots.find(([x, y]) => map[y][x] === 0 &&
      !monsters.some(m => m.x === x && m.y === y) &&
      !chests.some(c => c.x === x && c.y === y) && !potionsOnFloor.some(p => p.x === x && p.y === y) &&
      !goldPiles.some(g => g.x === x && g.y === y) && !soulGems.some(s => s.x === x && s.y === y) &&
      !altars.some(a => a.x === x && a.y === y) && !(stairs.x === x && stairs.y === y));
    if (spot) {
      const [px, py] = spot;
      map[py][px] = 3;
      runePillars.push({ x: px, y: py, hp: 2, maxHp: 2 });
    }
  }
  updateVisibility();
}

function rollMonsterType(d, random = Math.random) {
  const roll = random();
  if (d <= 1) return roll < 0.7 ? 'goblin' : 'bat';
  if (d === 2) return roll < 0.4 ? 'goblin' : roll < 0.6 ? 'bat' : roll < 0.9 ? 'skeleton' : 'cultist';
  if (d <= 4) return roll < 0.25 ? 'goblin' : roll < 0.4 ? 'bat' : roll < 0.65 ? 'skeleton' : roll < 0.82 ? 'cultist' : 'ogre';
  return roll < 0.15 ? 'goblin' : roll < 0.3 ? 'bat' : roll < 0.5 ? 'skeleton' : roll < 0.68 ? 'cultist' : roll < 0.86 ? 'ogre' : 'wraith';
}

function spawnMonster(type, x, y, d) {
  const t = MONSTER_TYPES[type];
  const scale = 1 + (d - 1) * (d <= 2 ? 0.12 : 0.18);
  monsters.push({
    type, x, y,
    hp: Math.round(t.hp * scale), maxHp: Math.round(t.hp * scale),
    atk: Math.round(t.atk * scale), def: t.def + ((d / 3) | 0),
    xp: Math.round(t.xp * scale),
    slow: t.slow, boss: !!t.boss, erratic: !!t.erratic, ranged: !!t.ranged, phasing: !!t.phasing,
    bump: 0, bumpDx: 0, bumpDy: 0, flash: 0, kbX: 0, kbY: 0, face: 1, staggered: 0,
  });
}

function shuffle(a, random = Math.random) { for (let i = a.length - 1; i > 0; i--) { const j = random() * (i + 1) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; }

// ---------- visibility (fog of war) ----------
function losClear(x0, y0, x1, y1) {
  let dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
  let sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1, err = dx - dy;
  let x = x0, y = y0;
  while (!(x === x1 && y === y1)) {
    if (!(x === x0 && y === y0) && map[y][x] !== 0) return false;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x += sx; }
    if (e2 < dx) { err += dx; y += sy; }
  }
  return true;
}

function updateVisibility() {
  visible = [];
  for (let y = 0; y < MAP_H; y++) visible.push(new Array(MAP_W).fill(false));
  for (let y = Math.max(0, hero.y - VIEW_RADIUS); y <= Math.min(MAP_H - 1, hero.y + VIEW_RADIUS); y++) {
    for (let x = Math.max(0, hero.x - VIEW_RADIUS); x <= Math.min(MAP_W - 1, hero.x + VIEW_RADIUS); x++) {
      const dx = x - hero.x, dy = y - hero.y;
      if (dx * dx + dy * dy <= VIEW_RADIUS * VIEW_RADIUS && losClear(hero.x, hero.y, x, y)) {
        visible[y][x] = true; explored[y][x] = true;
      }
    }
  }
}

// ---------- hero / run ----------
function newRun(seed = (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0) {
  const s = startingHero();
  hero = {
    x: 0, y: 0, hp: s.maxHp, maxHp: s.maxHp, baseAtk: s.baseAtk, baseDef: s.baseDef,
    lvl: 1, xp: 0, weapon: 0, armor: 0, potions: s.potions,
    crit: s.crit, healAmt: s.heal, tint: s.tint, cursed: 0, blessed: 0,
    bump: 0, bumpDx: 0, bumpDy: 0, flash: 0, face: 1,
  };
  displayHp = s.maxHp; displayXp = 0;
  depth = 1; gold = 0; score = 0; turnCount = 0;
  runSouls = 0; soulsDoubled = false; soulsBanked = 0;
  resurrectUsed = false;
  turnPhase = 'player';
  pendingEnemyTurn = false;
  selectedPath = null;
  floorSeed = seed >>> 0;
  if (resolvingTimer) { clearTimeout(resolvingTimer); resolvingTimer = null; }
  floaters = []; particles = []; msgLog = [];
  genDungeon(depth, floorSeed);
  logMsg('Your turn — enemy icons show their next action.', '#8ad0ff');
}

function heroAtk() { return hero.baseAtk + WEAPONS[hero.weapon].atk; }
function heroDef() { return hero.baseDef + ARMORS[hero.armor].def; }
function xpNeeded() { return hero.lvl * 20; }
function calcScore() { return depth * 100 + gold + hero.xp + (hero.lvl - 1) * 20; }

// ---------- turn logic ----------
function tryMove(dx, dy) {
  if (state !== 'playing' || adBusy || paused || turnPhase !== 'player') return;
  if (dx === 0 && dy === 0) return;
  const nx = hero.x + dx, ny = hero.y + dy;
  if (nx < 0 || ny < 0 || nx >= MAP_W || ny >= MAP_H) return;
  const mon = monsters.find(m => m.x === nx && m.y === ny);
  const pillar = runePillars && runePillars.find(p => p.x === nx && p.y === ny);
  if (pillar) {
    attackPillar(pillar, dx, dy);
    endPlayerTurn();
    return;
  }
  if (!mon && map[ny][nx] !== 0) return;
  if (mon) {
    if (dx !== 0) hero.face = Math.sign(dx);
    attackMonster(mon, dx, dy);
  } else {
    hero.x = nx; hero.y = ny;
    hero.bump = 1; hero.bumpDx = dx; hero.bumpDy = dy;
    if (dx !== 0) hero.face = Math.sign(dx);
    sfx.stepSound();
    pickupAt(nx, ny);
    if (nx === stairs.x && ny === stairs.y) { descend(); return; }
  }
  endPlayerTurn();
}

function attackPillar(pillar, dx, dy) {
  pillar.hp--;
  hero.bump = 1; hero.bumpDx = dx * 0.5; hero.bumpDy = dy * 0.5;
  sfx.swordSound();
  burstSparks(pillar.x, pillar.y, 8);
  addFloater(pillar.x, pillar.y, pillar.hp > 0 ? 'WARD CRACKS' : 'RUNE PULSE', '#c88aff');
  if (pillar.hp <= 0) {
    map[pillar.y][pillar.x] = 0;
    runePillars.splice(runePillars.indexOf(pillar), 1);
    burstParticles(pillar.x, pillar.y, '#c88aff', 20);
    const affected = monsters.filter(m => Math.abs(m.x - pillar.x) + Math.abs(m.y - pillar.y) <= 3);
    for (const m of affected) m.staggered = Math.max(m.staggered || 0, 2);
    logMsg(`Rune pulse staggers ${affected.length} ${affected.length === 1 ? 'enemy' : 'enemies'}!`, '#c88aff');
  } else logMsg('Rune ward: one strike remains.', '#c88aff');
}

function pickupAt(x, y) {
  const ch = chests.find(c => c.x === x && c.y === y && !c.opened);
  if (ch) { openChest(ch); }
  const pi = potionsOnFloor.findIndex(p => p.x === x && p.y === y);
  if (pi >= 0) { potionsOnFloor.splice(pi, 1); hero.potions++; sfx.potionSound(); logMsg('Found a potion!', '#ff7ab0'); addFloater(x, y, '+potion', '#ff7ab0'); }
  const gi = goldPiles.findIndex(g => g.x === x && g.y === y);
  if (gi >= 0) { const g = goldPiles.splice(gi, 1)[0]; const amt = Math.round(g.amt * goldMult()); gold += amt; sfx.chestSound(); addFloater(x, y, '+' + amt + 'g', '#ffd76a'); }
  const si = soulGems.findIndex(s => s.x === x && s.y === y);
  if (si >= 0) {
    const s = soulGems.splice(si, 1)[0];
    runSouls += s.amt;
    sfx.magicSound();
    addFloater(x, y, '+' + s.amt + ' ♦', '#8ad0ff');
    logMsg('Soul gem! +' + s.amt + ' souls', '#8ad0ff');
    burstParticles(x, y, '#8ad0ff', 10);
  }
  const al = altars.find(a => a.x === x && a.y === y && !a.used);
  if (al) { useAltar(al); }
}

function useAltar(al) {
  al.used = true;
  sfx.magicSound();
  doShake(4);
  burstParticles(al.x, al.y, '#c05cff', 20);
  const roll = Math.random();
  if (roll < 0.45) {
    // blessing: permanent (this run) stat boost
    const which = Math.random();
    if (which < 0.4) { hero.baseAtk += 2; logMsg('The altar blesses your blade! +2 ATK', '#c88aff'); addFloater(al.x, al.y, '+2 ATK', '#c88aff'); }
    else if (which < 0.7) { hero.maxHp += 10; hero.hp += 10; logMsg('The altar strengthens you! +10 Max HP', '#c88aff'); addFloater(al.x, al.y, '+10 HP', '#c88aff'); }
    else { hero.baseDef += 1; logMsg('The altar hardens your skin! +1 DEF', '#c88aff'); addFloater(al.x, al.y, '+1 DEF', '#c88aff'); }
    happytime();
  } else if (roll < 0.7) {
    const amt = 3 + (Math.random() * 3 * depth | 0);
    runSouls += amt;
    logMsg('The altar yields ' + amt + ' souls!', '#8ad0ff');
    addFloater(al.x, al.y, '+' + amt + ' ♦', '#8ad0ff');
  } else {
    // curse: damage + summon
    const dmg = Math.max(3, Math.round(hero.maxHp * 0.2));
    hero.hp -= dmg;
    sfx.hurtSound();
    doShake(8);
    logMsg('The altar CURSES you! -' + dmg + ' HP', '#e04c6a');
    addFloater(al.x, al.y, '-' + dmg, '#ff5c5c');
    if (hero.hp <= 0) die();
  }
}

function openChest(ch) {
  ch.opened = true;
  sfx.chestSound();
  burstParticles(ch.x, ch.y, '#ffd76a', 14);
  const roll = Math.random();
  if (roll < 0.32) {
    const amt = Math.round((10 + (Math.random() * 15 * depth | 0)) * goldMult());
    gold += amt; addFloater(ch.x, ch.y, '+' + amt + ' gold', '#ffd76a'); logMsg('Chest: ' + amt + ' gold!', '#ffd76a');
  } else if (roll < 0.55) {
    hero.potions++; addFloater(ch.x, ch.y, '+potion', '#ff7ab0'); logMsg('Chest: HP potion!', '#ff7ab0');
  } else if (roll < 0.8) {
    const maxTier = Math.min(WEAPONS.length - 1, 1 + ((depth / 2) | 0));
    const t = Math.min(maxTier, hero.weapon + 1 + (Math.random() < 0.25 ? 1 : 0));
    if (t > hero.weapon) { hero.weapon = t; addFloater(ch.x, ch.y, WEAPONS[t].name + '!', WEAPONS[t].color); logMsg('New weapon: ' + WEAPONS[t].name + '!', WEAPONS[t].color); sfx.magicSound(); }
    else { gold += 8 * depth; addFloater(ch.x, ch.y, '+' + 8 * depth + ' gold', '#ffd76a'); }
  } else {
    const maxTier = Math.min(ARMORS.length - 1, 1 + ((depth / 2) | 0));
    const t = Math.min(maxTier, hero.armor + 1 + (Math.random() < 0.25 ? 1 : 0));
    if (t > hero.armor) { hero.armor = t; addFloater(ch.x, ch.y, ARMORS[t].name + '!', ARMORS[t].color); logMsg('New armor: ' + ARMORS[t].name + '!', ARMORS[t].color); sfx.magicSound(); }
    else { gold += 8 * depth; addFloater(ch.x, ch.y, '+' + 8 * depth + ' gold', '#ffd76a'); }
  }
}

function attackMonster(mon, dx, dy) {
  hero.bump = 1; hero.bumpDx = dx * 0.6; hero.bumpDy = dy * 0.6;
  const variance = (Math.random() * 3 | 0) - 1;
  const isCrit = hero.crit > 0 && Math.random() < hero.crit;
  let dmg = Math.max(1, heroAtk() + variance - mon.def);
  if (isCrit) dmg = Math.round(dmg * 2);
  mon.hp -= dmg;
  mon.flash = 0.18;
  mon.kbX = dx * 5; mon.kbY = dy * 5; // knockback pixels
  sfx.swordSound();
  addFloater(mon.x, mon.y, (isCrit ? 'CRIT -' : '-') + dmg, isCrit ? '#ff9a3c' : '#ffea70', isCrit);
  burstSparks(mon.x, mon.y, isCrit ? 16 : 9);
  doShake(isCrit ? 6 : 3.5);
  if (mon.hp <= 0) {
    monsters.splice(monsters.indexOf(mon), 1);
    sfx.monsterDieSound();
    deathBurst(mon.x, mon.y, MONSTER_TYPES[mon.type].color, mon.boss ? 44 : 26);
    addFloater(mon.x, mon.y, '+' + mon.xp + ' XP', '#7ad0ff');
    recordKill(mon.type);
    gainXp(mon.xp);
    if (mon.boss) {
      happytime();
      const bg = Math.round(50 * depth * goldMult());
      gold += bg;
      const bs = 5 + depth * 2;
      runSouls += bs;
      logMsg('DEPTH LORD SLAIN! +' + bg + ' gold, +' + bs + ' souls', '#e04c6a');
      doShake(10);
      sfx.magicSound();
    } else {
      logMsg(MONSTER_TYPES[mon.type].name + ' slain!', '#9fdc7a');
      if (Math.random() < 0.08) { runSouls += 1; addFloater(mon.x, mon.y, '+1 ♦', '#8ad0ff'); }
    }
  }
}

function gainXp(n) {
  hero.xp += n;
  if (hero.xp >= xpNeeded()) {
    hero.xp -= xpNeeded();
    hero.lvl++;
    sfx.levelUpSound();
    happytime();
    showLevelCards();
  }
}

function showLevelCards() {
  const opts = [
    { id: 'hp', title: '+15 Max HP', sub: 'and full heal', color: '#e0506a' },
    { id: 'atk', title: '+3 Attack', sub: 'hit harder', color: '#ffd76a' },
    { id: 'def', title: '+2 Defense', sub: 'take less damage', color: '#5cc8ff' },
  ];
  levelCards = shuffle(opts);
  state = 'levelup';
}

function pickCard(c) {
  if (c.id === 'hp') { hero.maxHp += 15; hero.hp = hero.maxHp; }
  else if (c.id === 'atk') { hero.baseAtk += 3; }
  else { hero.baseDef += 2; }
  logMsg('Level ' + hero.lvl + '! ' + c.title, '#ffd76a');
  levelUpBurst(hero.x, hero.y);
  state = 'playing';
  if (pendingEnemyTurn) {
    pendingEnemyTurn = false;
    endPlayerTurn();
  } else turnPhase = 'player';
}

function usePotion() {
  if (state !== 'playing' || paused || turnPhase !== 'player' || hero.potions <= 0 || hero.hp >= hero.maxHp) return;
  hero.potions--;
  const heal = hero.healAmt || 30;
  hero.hp = Math.min(hero.maxHp, hero.hp + heal);
  sfx.potionSound();
  addFloater(hero.x, hero.y, '+' + heal + ' HP', '#ff7ab0');
  burstParticles(hero.x, hero.y, '#ff7ab0', 12);
}

function descend() {
  depth++;
  sfx.stairsSound();
  score = calcScore();
  logMsg('Depth ' + depth + ' — deeper and deadlier...', '#ffd76a');
  floorSeed = (floorSeed + 0x9e3779b9) >>> 0;
  genDungeon(depth, floorSeed);
  doShake(5);
  endPlayerTurn(true);
}

function endPlayerTurn(skipMonsters) {
  if (state === 'levelup') {
    pendingEnemyTurn = !skipMonsters;
    turnPhase = 'levelup';
    return;
  }
  turnPhase = 'resolving';
  score = calcScore();
  // Keep the committed hit, loot, and move readable before the enemy response.
  resolvingTimer = setTimeout(() => {
    resolvingTimer = null;
    if (paused || state !== 'playing') return;
    turnCount++;
    if (!skipMonsters) monstersAct();
    updateVisibility();
    if (hero.hp <= 0) { die(); return; }
    turnPhase = 'player';
  }, resolutionDelay);
}

function pauseRun() {
  if (paused) return;
  paused = true;
  if (resolvingTimer) { clearTimeout(resolvingTimer); resolvingTimer = null; }
  if (state === 'playing') { turnPhase = 'paused'; gameplayStop(); }
  sfx.pauseAudio();
}

function resumeRun() {
  if (!paused) return;
  paused = false;
  sfx.resumeAudio();
  if (state === 'playing') { turnPhase = 'player'; gameplayStart(); }
}

function monstersAct() {
  for (const m of monsters) {
    if (m.staggered > 0) { m.staggered--; continue; }
    if (m.slow && turnCount % 2 === 0) continue;
    const dx = hero.x - m.x, dy = hero.y - m.y;
    const dist = Math.abs(dx) + Math.abs(dy);
    if (dist === 1) {
      // attack hero
      const variance = (Math.random() * 3 | 0) - 1;
      const dmg = Math.max(1, m.atk + variance - heroDef());
      hero.hp -= dmg;
      hero.flash = 0.18;
      m.bump = 1; m.bumpDx = Math.sign(dx) * 0.5; m.bumpDy = Math.sign(dy) * 0.5;
      if (dx !== 0) m.face = Math.sign(dx);
      sfx.hurtSound();
      addFloater(hero.x, hero.y, '-' + dmg, '#ff5c5c');
      doShake(4 + (m.boss ? 4 : 0));
      continue;
    }
    // cultist: ranged dark bolt within 4 tiles + LOS, every other turn
    if (m.ranged && dist <= 4 && losClear(m.x, m.y, hero.x, hero.y) && turnCount % 2 === 1) {
      const dmg = Math.max(1, Math.round(m.atk * 0.7) - heroDef());
      hero.hp -= dmg;
      m.bump = 1; m.bumpDx = Math.sign(dx) * 0.3; m.bumpDy = Math.sign(dy) * 0.3;
      sfx.hurtSound();
      addFloater(hero.x, hero.y, '-' + dmg, '#d05ca8');
      burstParticles(hero.x, hero.y, '#d05ca8', 6);
      doShake(3);
      continue;
    }
    if (dist > 9) {
      if (Math.random() < 0.3) stepMonster(m, [(Math.random() * 3 | 0) - 1, 0][0], 0);
      continue;
    }
    // bat: erratic — 40% random direction instead of chasing
    if (m.erratic && Math.random() < 0.4) {
      const dirs = shuffle([[1, 0], [-1, 0], [0, 1], [0, -1]]);
      for (const [ox, oy] of dirs) { if (stepMonster(m, ox, oy)) break; }
      continue;
    }
    // chase: prefer axis with bigger delta
    const options = [];
    if (Math.abs(dx) >= Math.abs(dy)) { options.push([Math.sign(dx), 0], [0, Math.sign(dy)]); }
    else { options.push([0, Math.sign(dy)], [Math.sign(dx), 0]); }
    for (const [ox, oy] of options) {
      if (ox === 0 && oy === 0) continue;
      if (stepMonster(m, ox, oy)) break;
    }
  }
}

function stepMonster(m, dx, dy) {
  const nx = m.x + dx, ny = m.y + dy;
  if (nx < 1 || ny < 1 || nx >= MAP_W - 1 || ny >= MAP_H - 1) return false;
  if (map[ny][nx] !== 0 && !m.phasing) return false;
  if (nx === hero.x && ny === hero.y) return false;
  if (monsters.some(o => o !== m && o.x === nx && o.y === ny)) return false;
  m.x = nx; m.y = ny; m.bump = 1; m.bumpDx = dx; m.bumpDy = dy;
  if (dx !== 0) m.face = Math.sign(dx);
  return true;
}

function monsterIntent(m) {
  if (m.staggered > 0) return { id: 'stunned', label: 'STUNNED', color: '#c88aff' };
  if (m.slow && (turnCount + 1) % 2 === 0) return { id: 'wait', label: 'WAIT', color: '#8eb4d4' };
  const dist = Math.abs(hero.x - m.x) + Math.abs(hero.y - m.y);
  if (dist === 1) return { id: 'melee', label: 'MELEE', color: '#ff8a70' };
  if (m.ranged && dist <= 4 && losClear(m.x, m.y, hero.x, hero.y) && (turnCount + 1) % 2 === 1) return { id: 'ranged', label: 'BOLT', color: '#e890d4' };
  return { id: 'move', label: 'MOVE', color: '#9fdc7a' };
}

function die() {
  hero.hp = 0;
  state = 'gameover';
  sfx.gameOverSound();
  doShake(8);
  gameplayStop();
  score = calcScore();
  if (score > best) { best = score; saveBest(best); }
  // bank souls: gems collected + depth bonus (only the unbanked delta, resurrect-safe)
  runSouls += Math.max(0, (depth - 1) * 2);
  const delta = runSouls - soulsBanked;
  if (delta > 0) addSouls(delta);
  soulsBanked = runSouls;
  const newRecord = recordRun(depth);
  if (newRecord) happytime();
}

async function doubleSouls() {
  if (soulsDoubled || adBusy || runSouls <= 0) return;
  adBusy = true;
  const ok = await requestAd('rewarded', {
    onStart: () => { pauseRun(); sfx.setMuted(true); },
    onFinish: () => { sfx.setMuted(getMuteSetting()); resumeRun(); },
  });
  adBusy = false;
  if (ok) {
    soulsDoubled = true;
    addSouls(runSouls); // second helping
    runSouls *= 2;
    soulsBanked = runSouls;
    sfx.levelUpSound();
    logMsg('Souls doubled!', '#8ad0ff');
  }
}

async function resurrect() {
  if (resurrectUsed || adBusy) return;
  adBusy = true;
  const ok = await requestAd('rewarded', {
    onStart: () => { pauseRun(); sfx.setMuted(true); },
    onFinish: () => { sfx.setMuted(getMuteSetting()); resumeRun(); },
  });
  adBusy = false;
  if (ok) {
    resurrectUsed = true;
    hero.hp = Math.max(1, Math.round(hero.maxHp * 0.5));
    // push adjacent monsters away one tile
    for (const m of monsters) {
      if (Math.abs(m.x - hero.x) + Math.abs(m.y - hero.y) === 1) {
        stepMonster(m, Math.sign(m.x - hero.x), Math.sign(m.y - hero.y));
      }
    }
    state = 'playing';
    gameplayStart();
    sfx.levelUpSound();
    logMsg('RESURRECTED! Fight on!', '#ffd76a');
    burstParticles(hero.x, hero.y, '#ffd76a', 30);
  }
}

async function playAgain() {
  newRun();
  state = 'playing';
  gameplayStart();
}

function startGame(seed) {
  sfx.unlockAudio();
  newRun(seed);
  state = 'playing';
  gameplayStart();
}

// ---------- fx ----------
function addFloater(tx, ty, text, color, big) {
  if (floaters.length >= MAX_FLOATERS) floaters.splice(0, floaters.length - MAX_FLOATERS + 1);
  floaters.push({
    x: tx * TILE + TILE / 2 + (Math.random() - 0.5) * 8, y: ty * TILE,
    text, color, life: 1.25, vy: -70, vx: (Math.random() - 0.5) * 40, big: !!big,
  });
}
function addParticle(p) {
  if (particles.length >= MAX_PARTICLES) particles.splice(0, particles.length - MAX_PARTICLES + 1);
  particles.push(p);
}
function burstParticles(tx, ty, color, n) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, s = 40 + Math.random() * 120;
    addParticle({ x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.4 + Math.random() * 0.4, color, r: 1.5 + Math.random() * 2.5 });
  }
}
// combat sparks (PEGI-friendly: sparks/dust instead of blood)
function burstSparks(tx, ty, n) {
  const cx = tx * TILE + TILE / 2, cy = ty * TILE + TILE / 2;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, s = 90 + Math.random() * 200;
    addParticle({
      x: cx, y: cy, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 40,
      life: 0.2 + Math.random() * 0.35,
      color: Math.random() < 0.5 ? '#ffe08a' : '#ff9a3c',
      r: 1 + Math.random() * 2, spark: true,
    });
  }
}
// death: sprite shatters into colored shards + dust puff
function deathBurst(tx, ty, color, n) {
  const cx = tx * TILE + TILE / 2, cy = ty * TILE + TILE / 2;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, s = 30 + Math.random() * 180;
    addParticle({
      x: cx + (Math.random() - 0.5) * 16, y: cy + (Math.random() - 0.5) * 16,
      vx: Math.cos(a) * s, vy: Math.sin(a) * s - 60,
      life: 0.45 + Math.random() * 0.5,
      color: Math.random() < 0.7 ? color : '#c8c0b0',
      r: 2 + Math.random() * 3, square: true,
    });
  }
}
// level-up: golden burst + expanding ring
let rings = [];
function levelUpBurst(tx, ty) {
  const cx = tx * TILE + TILE / 2, cy = ty * TILE + TILE / 2;
  for (let i = 0; i < 34; i++) {
    const a = Math.random() * Math.PI * 2, s = 60 + Math.random() * 220;
    addParticle({ x: cx, y: cy, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 80, life: 0.5 + Math.random() * 0.6, color: Math.random() < 0.6 ? '#ffd76a' : '#fff2c0', r: 1.5 + Math.random() * 2.5, spark: true });
  }
  if (rings.length >= MAX_RINGS) rings.shift();
  rings.push({ x: cx, y: cy, r: 6, life: 0.6, color: '#ffd76a' });
}
function doShake(n) { shake = Math.max(shake, n * motionScale()); shakeT = 0.25 * motionScale(); }

// ---------- input ----------
window.addEventListener('keydown', (e) => {
  if (state === 'menu' && (e.key === ' ' || e.key === 'Enter')) { startGame(); return; }
  if ((state === 'shop' || state === 'bestiary') && e.key === 'Escape') { state = 'menu'; return; }
  if (state === 'levelup') {
    if (e.key === '1') pickCard(levelCards[0]);
    if (e.key === '2') pickCard(levelCards[1]);
    if (e.key === '3') pickCard(levelCards[2]);
    return;
  }
  if (state !== 'playing') return;
  const k = e.key.toLowerCase();
  if (k === 'arrowup' || k === 'w') { e.preventDefault(); tryMove(0, -1); }
  else if (k === 'arrowdown' || k === 's') { e.preventDefault(); tryMove(0, 1); }
  else if (k === 'arrowleft' || k === 'a') { e.preventDefault(); tryMove(-1, 0); }
  else if (k === 'arrowright' || k === 'd') { e.preventDefault(); tryMove(1, 0); }
  else if (k === 'q') usePotion();
});

function gameCoords(e) {
  const b = canvas.getBoundingClientRect();
  const cx = (e.touches ? e.touches[0].clientX : e.clientX) - b.left;
  const cy = (e.touches ? e.touches[0].clientY : e.clientY) - b.top;
  return { x: cx * (GAME_W / b.width), y: cy * (GAME_H / b.height) };
}

function handleTap(gx, gy) {
  sfx.unlockAudio();
  // buttons first
  for (const btn of buttons) {
    if (gx >= btn.x && gx <= btn.x + btn.w && gy >= btn.y && gy <= btn.y + btn.h) {
      if (btn.id === 'play') startGame();
      else if (btn.id === 'again') playAgain();
      else if (btn.id === 'resurrect') resurrect();
      else if (btn.id === 'x2souls') doubleSouls();
      else if (btn.id === 'potion') usePotion();
      else if (btn.id === 'shop') { state = 'shop'; shopTab = 'upgrades'; sfx.chestSound(); }
      else if (btn.id === 'bestiary') { state = 'bestiary'; sfx.chestSound(); }
      else if (btn.id === 'back') { state = 'menu'; sfx.stepSound(); }
      else if (btn.id.startsWith('tab_')) { shopTab = btn.id.slice(4); sfx.stepSound(); }
      else if (btn.id.startsWith('up_')) {
        const id = btn.id.slice(3);
        if (buyUpgrade(id)) { sfx.levelUpSound(); } else { sfx.hurtSound(); }
      }
      else if (btn.id.startsWith('cls_')) {
        const id = btn.id.slice(4);
        if (meta.classes.includes(id)) { selectClass(id); sfx.potionSound(); }
        else if (buyClass(id)) { sfx.levelUpSound(); happytime(); }
        else { sfx.hurtSound(); }
      }
      else if (btn.id.startsWith('card')) pickCard(levelCards[parseInt(btn.id.slice(4), 10)]);
      return;
    }
  }
  if (state !== 'playing') return;
  // tap a tile: move one step toward it (adjacent = direct)
  const wx = gx + camX, wy = gy + camY;
  const tx = Math.floor(wx / TILE), ty = Math.floor(wy / TILE);
  const dx = tx - hero.x, dy = ty - hero.y;
  if (dx === 0 && dy === 0) return;
  if (Math.abs(dx) >= Math.abs(dy)) tryMove(Math.sign(dx), 0);
  else tryMove(0, Math.sign(dy));
}

canvas.addEventListener('mousedown', (e) => { const p = gameCoords(e); handleTap(p.x, p.y); });
canvas.addEventListener('touchstart', (e) => { e.preventDefault(); const p = gameCoords(e); handleTap(p.x, p.y); }, { passive: false });
canvas.addEventListener('mousemove', (e) => {
  if (state !== 'playing' || turnPhase !== 'player') return;
  const p = gameCoords(e), tx = Math.floor((p.x + camX) / TILE), ty = Math.floor((p.y + camY) / TILE);
  if (Math.abs(tx - hero.x) + Math.abs(ty - hero.y) === 1) selectedPath = { x: tx, y: ty };
});

// ---------- rendering ----------
function tileShade(x, y) {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

function drawSprite(spr, px, py, face, flash, alpha) {
  ctx.save();
  if (alpha != null && alpha < 1) ctx.globalAlpha = alpha;
  ctx.translate(px, py);
  if (face < 0) ctx.scale(-1, 1);
  ctx.drawImage(spr.img, -spr.w / 2, -spr.h / 2);
  if (flash > 0) {
    ctx.globalAlpha = Math.min(1, flash * 8) * (alpha != null ? alpha : 1);
    ctx.drawImage(spr.flash, -spr.w / 2, -spr.h / 2);
  }
  ctx.restore();
}

function drawDeco(dd) {
  const px = dd.x * TILE, py = dd.y * TILE, cx = px + TILE / 2, cy = py + TILE / 2;
  const v = dd.v;
  switch (dd.kind) {
    case 'rubble': {
      for (let i = 0; i < 5; i++) {
        const rx = cx + Math.sin(v * 40 + i * 2.3) * 12, ry = cy + Math.cos(v * 31 + i * 1.7) * 10;
        const rr = 2 + ((v * 17 + i) % 1) * 3;
        ctx.fillStyle = i % 2 ? '#565064' : '#464050';
        ctx.beginPath(); ctx.ellipse(rx, ry, rr, rr * 0.7, v * 6 + i, 0, 7); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.07)';
        ctx.fillRect(rx - rr * 0.5, ry - rr * 0.6, rr, 1.5);
      }
      break;
    }
    case 'bones': {
      ctx.strokeStyle = '#c8c4b0'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cx - 9, cy - 4 + v * 4); ctx.lineTo(cx + 7, cy + 3);
      ctx.moveTo(cx - 4, cy + 7); ctx.lineTo(cx + 9, cy - 5 + v * 3);
      ctx.stroke();
      ctx.fillStyle = '#d8d4c0';
      for (const [ex, ey] of [[cx - 9, cy - 4 + v * 4], [cx + 7, cy + 3], [cx - 4, cy + 7], [cx + 9, cy - 5 + v * 3]]) {
        ctx.beginPath(); ctx.arc(ex, ey, 2.6, 0, 7); ctx.fill();
      }
      ctx.lineCap = 'butt';
      break;
    }
    case 'skull': {
      ctx.fillStyle = '#d0ccb8';
      ctx.beginPath(); ctx.arc(cx, cy + 2, 6.5, 0, 7); ctx.fill();
      ctx.fillRect(cx - 4.5, cy + 4, 9, 6);
      ctx.fillStyle = '#14101c';
      ctx.beginPath(); ctx.arc(cx - 2.6, cy + 1.5, 1.9, 0, 7); ctx.arc(cx + 2.6, cy + 1.5, 1.9, 0, 7); ctx.fill();
      ctx.fillRect(cx - 3.4, cy + 6.5, 1.4, 3); ctx.fillRect(cx - 0.7, cy + 6.5, 1.4, 3); ctx.fillRect(cx + 2, cy + 6.5, 1.4, 3);
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.beginPath(); ctx.arc(cx - 2, cy - 2.5, 2, 0, 7); ctx.fill();
      break;
    }
    case 'mushroom': {
      const glow = 0.55 + 0.45 * Math.sin(time * 2.5 + v * 20);
      const col = v < 0.5 ? '90,220,180' : '140,170,255';
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(cx, cy, 1, cx, cy, 16);
      g.addColorStop(0, `rgba(${col},${0.22 * glow})`);
      g.addColorStop(1, `rgba(${col},0)`);
      ctx.fillStyle = g; ctx.fillRect(cx - 16, cy - 16, 32, 32);
      ctx.restore();
      for (let i = 0; i < 3; i++) {
        const mx = cx - 8 + i * 8 + Math.sin(v * 30 + i) * 3, my = cy + 4 + Math.cos(v * 20 + i * 2) * 4;
        const s = 3 + (i === 1 ? 2 : 0);
        ctx.fillStyle = '#b8ae9a'; ctx.fillRect(mx - 1.2, my - s, 2.4, s + 2);
        ctx.fillStyle = `rgba(${col},${0.75 + 0.25 * glow})`;
        ctx.beginPath(); ctx.ellipse(mx, my - s, s + 1.5, s, 0, Math.PI, 0); ctx.fill();
      }
      break;
    }
    case 'crack': {
      ctx.strokeStyle = 'rgba(8,6,14,0.6)'; ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(px + 6 + v * 8, py + 5);
      ctx.lineTo(px + 14 + v * 6, py + 16); ctx.lineTo(px + 10, py + 26); ctx.lineTo(px + 20 + v * 8, py + 35);
      ctx.moveTo(px + 14 + v * 6, py + 16); ctx.lineTo(px + 26, py + 20 + v * 6);
      ctx.stroke();
      break;
    }
    case 'crate': {
      const s = 11 + v * 3;
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath(); ctx.ellipse(cx, cy + s * 0.75, s, 3.5, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#7a5c34';
      ctx.fillRect(cx - s / 2, cy - s / 2, s, s);
      ctx.strokeStyle = '#54401f'; ctx.lineWidth = 1.6;
      ctx.strokeRect(cx - s / 2 + 1, cy - s / 2 + 1, s - 2, s - 2);
      ctx.beginPath();
      ctx.moveTo(cx - s / 2, cy - s / 2); ctx.lineTo(cx + s / 2, cy + s / 2);
      ctx.moveTo(cx + s / 2, cy - s / 2); ctx.lineTo(cx - s / 2, cy + s / 2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.09)';
      ctx.fillRect(cx - s / 2, cy - s / 2, s, 2.5);
      break;
    }
    case 'web': {
      ctx.strokeStyle = 'rgba(220,220,235,0.35)'; ctx.lineWidth = 1;
      const wx = px + (v < 0.5 ? 4 : TILE - 4), wy = py + 4;
      const dir = v < 0.5 ? 1 : -1;
      ctx.beginPath();
      for (let i = 1; i <= 3; i++) {
        ctx.moveTo(wx, wy);
        ctx.lineTo(wx + dir * i * 5, wy + (4 - i) * 5);
      }
      for (let i = 1; i <= 3; i++) {
        ctx.moveTo(wx + dir * i * 3, wy + i * 2.6);
        ctx.quadraticCurveTo(wx + dir * i * 5.4, wy + i * 4.4, wx + dir * i * 3.4, wy + i * 6.4);
      }
      ctx.stroke();
      break;
    }
    case 'puddle': {
      const shimmer = 0.5 + 0.5 * Math.sin(time * 1.8 + v * 25);
      ctx.fillStyle = 'rgba(30,50,80,0.45)';
      ctx.beginPath(); ctx.ellipse(cx, cy + 4, 11 + v * 4, 6 + v * 2, v, 0, 7); ctx.fill();
      ctx.fillStyle = `rgba(120,170,230,${0.10 + 0.10 * shimmer})`;
      ctx.beginPath(); ctx.ellipse(cx - 2, cy + 3, 7 + v * 3, 3.6, v, 0, 7); ctx.fill();
      ctx.fillStyle = `rgba(200,230,255,${0.18 * shimmer})`;
      ctx.fillRect(cx - 4 + v * 4, cy + 2, 4, 1.2);
      break;
    }
    case 'pillar': {
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath(); ctx.ellipse(cx, cy + 12, 12, 4, 0, 0, 7); ctx.fill();
      const g = ctx.createLinearGradient(cx - 9, 0, cx + 9, 0);
      g.addColorStop(0, '#4e4860'); g.addColorStop(0.5, '#6e6884'); g.addColorStop(1, '#443e54');
      ctx.fillStyle = g;
      ctx.fillRect(cx - 9, cy - 14, 18, 26);
      // broken top
      ctx.fillStyle = '#7a7492';
      ctx.beginPath();
      ctx.moveTo(cx - 9, cy - 14); ctx.lineTo(cx - 3, cy - 19 - v * 3); ctx.lineTo(cx + 3, cy - 13); ctx.lineTo(cx + 9, cy - 17); ctx.lineTo(cx + 9, cy - 14);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(cx - 9, cy + 6, 18, 6);
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(cx - 7, cy - 12, 3, 22);
      break;
    }
  }
}

function draw(dt) {
  time += dt;
  frameDt = dt;
  // fullscreen: render in logical game space scaled to the real canvas
  ctx.setTransform(viewScale, 0, 0, viewScale, 0, 0);
  // camera
  camX = hero.x * TILE + TILE / 2 - GAME_W / 2;
  camY = hero.y * TILE + TILE / 2 - GAME_H / 2;
  camX = Math.max(0, Math.min(MAP_W * TILE - GAME_W, camX));
  camY = Math.max(0, Math.min(MAP_H * TILE - GAME_H, camY));

  let sx = 0, sy = 0;
  if (shakeT > 0) { shakeT -= dt; sx = (Math.random() - 0.5) * shake * 2; sy = (Math.random() - 0.5) * shake * 2; if (shakeT <= 0) shake = 0; }

  ctx.fillStyle = '#07060c';
  ctx.fillRect(-2, -2, GAME_W + 4, GAME_H + 4);

  if (state === 'menu' || state === 'boot') { drawMenu(); return; }
  if (state === 'shop') { drawShop(); return; }
  if (state === 'bestiary') { drawBestiary(); return; }

  const biome = gfx.biomeIndex(depth);
  const flicker = 0.94 + 0.06 * Math.sin(time * 8.5) + 0.02 * Math.sin(time * 23);

  ctx.save();
  ctx.translate(-camX + sx, -camY + sy);

  const x0 = Math.max(0, Math.floor(camX / TILE)), x1 = Math.min(MAP_W - 1, Math.ceil((camX + GAME_W) / TILE));
  const y0 = Math.max(0, Math.floor(camY / TILE)), y1 = Math.min(MAP_H - 1, Math.ceil((camY + GAME_H) / TILE));

  // --- tiles (textured, baked variants) ---
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const px = x * TILE, py = y * TILE;
      if (!explored[y][x]) { ctx.drawImage(gfx.voidTile, px, py); continue; }
      const sh = tileShade(x, y);
      if (map[y][x] === 0 || map[y][x] === 3) {
        ctx.drawImage(gfx.floors[biome][(sh * 6) | 0], px, py);
      } else {
        ctx.drawImage(gfx.walls[biome][(sh * 4) | 0], px, py);
        if (map[y][x] === 2 && visible[y][x]) {
          // wall torch: sconce + flame + glow + fire particles
          const fl = 0.75 + 0.25 * Math.sin(time * 9 + x * 3 + y * 7) + 0.08 * Math.random();
          const tx = px + TILE / 2, ty = py + TILE / 2 + 4;
          ctx.fillStyle = '#4a3520';
          ctx.fillRect(tx - 2, ty, 4, 12);
          ctx.fillStyle = '#6a5030';
          ctx.fillRect(tx - 4, ty + 10, 8, 3);
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          const grd = ctx.createRadialGradient(tx, ty - 4, 2, tx, ty - 4, 34 * fl);
          grd.addColorStop(0, 'rgba(255,190,80,0.55)');
          grd.addColorStop(1, 'rgba(255,120,20,0)');
          ctx.fillStyle = grd;
          ctx.fillRect(tx - 36, ty - 40, 72, 72);
          ctx.restore();
          // flame body
          ctx.fillStyle = `rgba(255,${150 + fl * 70 | 0},50,0.95)`;
          ctx.beginPath();
          ctx.ellipse(tx, ty - 5, 3.4 * fl + 1, 6 * fl + 2, Math.sin(time * 11 + x) * 0.2, 0, 7);
          ctx.fill();
          ctx.fillStyle = `rgba(255,240,170,${0.8 * fl})`;
          ctx.beginPath(); ctx.ellipse(tx, ty - 4, 1.6, 3 * fl, 0, 0, 7); ctx.fill();
          // occasional ember particle
          if (Math.random() < dt * 6) {
            addParticle({ x: tx + (Math.random() - 0.5) * 4, y: ty - 8, vx: (Math.random() - 0.5) * 14, vy: -24 - Math.random() * 26, life: 0.5 + Math.random() * 0.5, color: '#ffb85c', r: 1 + Math.random(), spark: true });
          }
        }
      }
    }
  }

  // --- room decorations (props on explored floor) ---
  for (const dd of decos) {
    if (!explored[dd.y][dd.x]) continue;
    if (dd.x < x0 - 1 || dd.x > x1 + 1 || dd.y < y0 - 1 || dd.y > y1 + 1) continue;
    if (dd.x === stairs.x && dd.y === stairs.y) continue;
    drawDeco(dd);
  }
  // Destructible pillars are real terrain: they block both player and monster pathing.
  for (const p of runePillars || []) if (explored[p.y][p.x]) {
    const px = p.x * TILE + TILE / 2, py = p.y * TILE + TILE / 2;
    const pulse = 0.55 + 0.45 * Math.sin(time * 4 + p.x);
    ctx.fillStyle = 'rgba(0,0,0,0.38)'; ctx.beginPath(); ctx.ellipse(px, py + 13, 13, 4, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#4d4166'; ctx.fillRect(px - 9, py - 15, 18, 28);
    ctx.fillStyle = '#7d669d'; ctx.fillRect(px - 6, py - 13, 4, 23);
    ctx.strokeStyle = `rgba(200,138,255,${pulse})`; ctx.lineWidth = 2; ctx.strokeRect(px - 6, py - 9, 12, 16);
    ctx.fillStyle = '#e4bcff'; ctx.font = 'bold 13px Georgia, serif'; ctx.textAlign = 'center'; ctx.fillText('ᚱ', px, py + 4);
    ctx.font = 'bold 9px system-ui'; ctx.fillStyle = '#e8d8ff'; ctx.fillText(`WARD ${p.hp}/2`, px, py - 20);
  }
  if (selectedPath && visible[selectedPath.y] && visible[selectedPath.y][selectedPath.x]) {
    ctx.strokeStyle = '#8ad8ff'; ctx.lineWidth = 2.5; ctx.setLineDash([4, 3]);
    ctx.strokeRect(selectedPath.x * TILE + 4, selectedPath.y * TILE + 4, TILE - 8, TILE - 8);
    ctx.setLineDash([]);
  }

  // stairs — glowing rune portal
  if (explored[stairs.y] && explored[stairs.y][stairs.x]) {
    const px = stairs.x * TILE, py = stairs.y * TILE;
    const pulse = 0.5 + 0.5 * Math.sin(time * 4);
    ctx.fillStyle = '#0a0812';
    ctx.fillRect(px + 3, py + 3, TILE - 6, TILE - 6);
    ctx.strokeStyle = `rgba(255,215,106,${0.5 + pulse * 0.5})`;
    ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) ctx.strokeRect(px + 6 + i * 5, py + 6 + i * 5, TILE - 12 - i * 10, TILE - 12 - i * 10);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const sg = ctx.createRadialGradient(px + TILE / 2, py + TILE / 2, 2, px + TILE / 2, py + TILE / 2, 26 + pulse * 8);
    sg.addColorStop(0, `rgba(255,215,106,${0.22 + pulse * 0.18})`);
    sg.addColorStop(1, 'rgba(255,180,60,0)');
    ctx.fillStyle = sg;
    ctx.fillRect(px - 20, py - 20, TILE + 40, TILE + 40);
    ctx.restore();
  }

  // gold piles / potions / chests
  for (const g of goldPiles) if (visible[g.y][g.x]) {
    const px = g.x * TILE + TILE / 2, py = g.y * TILE + TILE / 2;
    const gl = 0.6 + 0.4 * Math.sin(time * 4 + g.x * 2);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = `rgba(255,215,106,${0.12 * gl})`;
    ctx.beginPath(); ctx.arc(px, py + 4, 14, 0, 7); ctx.fill();
    ctx.restore();
    for (let i = 0; i < 5; i++) {
      const cx = px - 8 + (i * 4), cy = py + 6 - (i % 2) * 4;
      ctx.fillStyle = i % 2 ? '#ffd76a' : '#e8b84c';
      ctx.beginPath(); ctx.arc(cx, cy, 3.5, 0, 7); ctx.fill();
      ctx.strokeStyle = '#8a5c1c'; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,220,0.7)';
      ctx.fillRect(cx - 1.5, cy - 1.5, 1.5, 1.5);
    }
  }
  for (const p of potionsOnFloor) if (visible[p.y][p.x]) {
    const px = p.x * TILE + TILE / 2, py = p.y * TILE + TILE / 2;
    const bob = Math.sin(time * 3 + p.x) * 1.5;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(px, py + 10, 7, 2.5, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#ff5c8a';
    ctx.beginPath(); ctx.arc(px, py + 3 + bob, 7, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.beginPath(); ctx.arc(px - 2.5, py + 1 + bob, 2.2, 0, 7); ctx.fill();
    ctx.fillStyle = '#d8d8e8'; ctx.fillRect(px - 2, py - 9 + bob, 4, 7);
    ctx.fillStyle = '#8a6c4a'; ctx.fillRect(px - 2.5, py - 11 + bob, 5, 3);
  }
  for (const c of chests) if (visible[c.y][c.x] || (c.opened && explored[c.y][c.x])) {
    const px = c.x * TILE + 6, py = c.y * TILE + 12;
    const w = TILE - 12, h = TILE - 18;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(px + w / 2, py + h + 2, w * 0.6, 3, 0, 0, 7); ctx.fill();
    // body with wood grain
    ctx.fillStyle = c.opened ? '#4a3520' : '#8a5c2c';
    ctx.fillRect(px, py, w, h);
    ctx.fillStyle = c.opened ? '#3f2d1b' : '#7a4f24';
    for (let i = 1; i < 4; i++) ctx.fillRect(px, py + i * (h / 4), w, 1.5);
    // lid
    ctx.fillStyle = c.opened ? '#3a2a18' : '#a5713c';
    ctx.fillRect(px - 1, py - 5, w + 2, 8);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(px - 1, py - 5, w + 2, 2);
    // metal bands + lock
    ctx.fillStyle = c.opened ? '#5a4c34' : '#c8a44a';
    ctx.fillRect(px + 2, py - 5, 3, h + 5); ctx.fillRect(px + w - 5, py - 5, 3, h + 5);
    ctx.fillStyle = '#ffd76a';
    ctx.fillRect(px + w / 2 - 2.5, py - 1, 5, 7);
    if (!c.opened) {
      const gl = 0.5 + 0.5 * Math.sin(time * 3 + c.x);
      ctx.fillStyle = `rgba(255,215,106,${0.1 * gl})`;
      ctx.fillRect(px - 4, py - 9, w + 8, h + 12);
    }
  }
  // soul gems: pulsing cyan diamonds
  for (const s of soulGems) if (visible[s.y][s.x]) {
    const px = s.x * TILE + TILE / 2, py = s.y * TILE + TILE / 2;
    const pulse = 0.75 + 0.25 * Math.sin(time * 5 + s.x);
    const r = 8 * pulse;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const gg = ctx.createRadialGradient(px, py, 1, px, py, r + 10);
    gg.addColorStop(0, 'rgba(138,208,255,0.5)');
    gg.addColorStop(1, 'rgba(80,160,255,0)');
    ctx.fillStyle = gg;
    ctx.fillRect(px - r - 10, py - r - 10, (r + 10) * 2, (r + 10) * 2);
    ctx.restore();
    ctx.fillStyle = '#8ad0ff';
    ctx.beginPath();
    ctx.moveTo(px, py - r); ctx.lineTo(px + r * 0.7, py); ctx.lineTo(px, py + r); ctx.lineTo(px - r * 0.7, py);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.beginPath();
    ctx.moveTo(px, py - r); ctx.lineTo(px + r * 0.3, py - r * 0.3); ctx.lineTo(px - r * 0.25, py - r * 0.2);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#d8f0ff'; ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(px, py - r); ctx.lineTo(px + r * 0.7, py); ctx.lineTo(px, py + r); ctx.lineTo(px - r * 0.7, py);
    ctx.closePath(); ctx.stroke();
  }
  // altars: purple obelisk with flame
  for (const a of altars) if (visible[a.y][a.x] || (a.used && explored[a.y][a.x])) {
    const px = a.x * TILE + TILE / 2, py = a.y * TILE + TILE / 2;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.ellipse(px, py + 14, 13, 3.5, 0, 0, 7); ctx.fill();
    const bodyGrd = ctx.createLinearGradient(px - 8, 0, px + 8, 0);
    bodyGrd.addColorStop(0, a.used ? '#3a2d48' : '#553a80');
    bodyGrd.addColorStop(0.5, a.used ? '#4a3a5a' : '#7a55b0');
    bodyGrd.addColorStop(1, a.used ? '#32273e' : '#4a3272');
    ctx.fillStyle = bodyGrd;
    ctx.fillRect(px - 8, py - 4, 16, 16);
    ctx.fillRect(px - 11, py + 9, 22, 5);
    // engraved rune
    ctx.strokeStyle = a.used ? '#5a4a70' : '#c88aff'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(px - 3, py + 8); ctx.lineTo(px, py); ctx.lineTo(px + 3, py + 8); ctx.moveTo(px - 2, py + 5); ctx.lineTo(px + 2, py + 5); ctx.stroke();
    if (!a.used) {
      const fl = 0.7 + 0.3 * Math.sin(time * 7 + a.x);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const grd2 = ctx.createRadialGradient(px, py - 10, 1, px, py - 10, 20 * fl);
      grd2.addColorStop(0, 'rgba(200,90,255,0.7)');
      grd2.addColorStop(1, 'rgba(120,40,200,0)');
      ctx.fillStyle = grd2;
      ctx.fillRect(px - 22, py - 32, 44, 44);
      ctx.restore();
      ctx.fillStyle = '#c88aff';
      ctx.beginPath(); ctx.ellipse(px, py - 11, 3 * fl + 1, 5.5 * fl + 1.5, 0, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(255,240,255,0.8)';
      ctx.beginPath(); ctx.ellipse(px, py - 10, 1.4, 2.6 * fl, 0, 0, 7); ctx.fill();
      if (Math.random() < dt * 4) {
        addParticle({ x: px + (Math.random() - 0.5) * 6, y: py - 14, vx: (Math.random() - 0.5) * 10, vy: -18 - Math.random() * 20, life: 0.6, color: '#c88aff', r: 1.2, spark: true });
      }
    }
  }

  // --- monsters (sprites) ---
  for (const m of monsters) {
    if (!visible[m.y][m.x]) continue;
    const t = MONSTER_TYPES[m.type];
    m.bump = Math.max(0, m.bump - dt * 6);
    m.flash = Math.max(0, m.flash - dt);
    m.kbX *= Math.max(0, 1 - dt * 10); m.kbY *= Math.max(0, 1 - dt * 10);
    const px = m.x * TILE + TILE / 2 - m.bumpDx * m.bump * 10 + m.kbX;
    const py = m.y * TILE + TILE / 2 - m.bumpDy * m.bump * 10 + m.kbY;
    const bob = Math.sin(time * 4.5 + m.x * 2 + m.y) * 1.8;
    let spr = gfx.monsterSprites[m.type];
    if (m.type === 'bat') spr = gfx.batFrames[(time * 8 + m.x) % 2 | 0];
    const r = t.size * TILE;
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.38)';
    ctx.beginPath(); ctx.ellipse(px, py + r * 0.85, r * 0.75, r * 0.3, 0, 0, 7); ctx.fill();
    // boss aura
    if (m.boss) {
      const au = 0.6 + 0.4 * Math.sin(time * 3);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const ag = ctx.createRadialGradient(px, py, 4, px, py, r * 2.2);
      ag.addColorStop(0, `rgba(255,60,90,${0.22 * au})`);
      ag.addColorStop(1, 'rgba(255,40,80,0)');
      ctx.fillStyle = ag;
      ctx.fillRect(px - r * 2.2, py - r * 2.2, r * 4.4, r * 4.4);
      ctx.restore();
    }
    const alpha = m.phasing ? 0.66 + 0.14 * Math.sin(time * 4 + m.x) : 1;
    drawSprite(spr, px, py + bob - 2, m.face, m.flash, alpha);
    const intent = monsterIntent(m);
    ctx.font = 'bold 9px system-ui'; ctx.textAlign = 'center';
    const intentW = intent.label === 'STUNNED' ? 50 : 38;
    ctx.fillStyle = 'rgba(9,7,15,0.85)'; ctx.fillRect(px - intentW / 2, py - r - 27, intentW, 12);
    ctx.fillStyle = intent.color; ctx.fillText(intent.label, px, py - r - 18);
    // hp bar
    if (m.hp < m.maxHp) {
      const bw = Math.max(r * 2, 26);
      ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fillRect(px - bw / 2 - 1, py - r - 12, bw + 2, 6);
      const hg = ctx.createLinearGradient(0, py - r - 11, 0, py - r - 6);
      hg.addColorStop(0, '#ff6a5a'); hg.addColorStop(1, '#c02838');
      ctx.fillStyle = hg;
      ctx.fillRect(px - bw / 2, py - r - 11, bw * (m.hp / m.maxHp), 4);
    }
  }

  // --- hero (layered sprite: body + armor tint + weapon) ---
  {
    hero.bump = Math.max(0, hero.bump - dt * 6);
    hero.flash = Math.max(0, (hero.flash || 0) - dt);
    const px = hero.x * TILE + TILE / 2 - hero.bumpDx * hero.bump * 12;
    const py = hero.y * TILE + TILE / 2 - hero.bumpDy * hero.bump * 12;
    const bob = Math.sin(time * 3.2) * 1.4;
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath(); ctx.ellipse(px, py + 15, 11, 4, 0, 0, 7); ctx.fill();
    const spr = gfx.heroSprite(hero.tint || '#3a6ea8', ARMORS[hero.armor].color);
    drawSprite(spr, px, py + bob - 2, hero.face, hero.flash);
    // weapon overlay (flips with hero)
    const wspr = gfx.weaponSprite(WEAPONS[hero.weapon].icon, WEAPONS[hero.weapon].color);
    const swing = hero.bump > 0 ? hero.bump * 6 : 0;
    ctx.save();
    ctx.translate(px, py + bob - 2);
    if (hero.face < 0) ctx.scale(-1, 1);
    ctx.translate(swing, -swing * 0.5);
    ctx.drawImage(wspr.img, -wspr.w / 2 + 10, -wspr.h / 2 - 2);
    ctx.restore();
  }

  // --- hero torch light (additive, before fog) ---
  gfx.drawHeroLight(ctx, hero.x * TILE + TILE / 2, hero.y * TILE + TILE / 2, flicker);

  // --- particles & floaters (world space) ---
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt; if (p.life <= 0) { particles.splice(i, 1); continue; }
    p.x += p.vx * dt; p.y += p.vy * dt; p.vy += (p.spark ? 60 : 260) * dt;
    ctx.globalAlpha = Math.min(1, p.life * 2.2);
    ctx.fillStyle = p.color;
    if (p.square) {
      ctx.fillRect(p.x - p.r, p.y - p.r, p.r * 2, p.r * 2);
    } else {
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
  for (let i = rings.length - 1; i >= 0; i--) {
    const rg = rings[i];
    rg.life -= dt; if (rg.life <= 0) { rings.splice(i, 1); continue; }
    rg.r += dt * 190;
    ctx.globalAlpha = rg.life * 1.5;
    ctx.strokeStyle = rg.color; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(rg.x, rg.y, rg.r, 0, 7); ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // --- fog of war with soft gradient light ---
  gfx.drawFog(ctx, {
    mapW: MAP_W, mapH: MAP_H, explored, visible, map,
    heroX: hero.x, heroY: hero.y, torches: torchList.filter(t => visible[t.y] && visible[t.y][t.x]),
    camX, camY, gameW: GAME_W, gameH: GAME_H, flicker,
  });

  // floaters above fog (readability)
  for (let i = floaters.length - 1; i >= 0; i--) {
    const f = floaters[i];
    f.life -= dt; if (f.life <= 0) { floaters.splice(i, 1); continue; }
    f.y += f.vy * dt; f.vy += 60 * dt; // arc
    f.x += (f.vx || 0) * dt;
    ctx.globalAlpha = Math.min(1, f.life);
    ctx.font = `bold ${f.big ? 22 : 16}px Georgia, serif`;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#000'; ctx.fillText(f.text, f.x + 1.5, f.y + 1.5);
    ctx.fillStyle = f.color; ctx.fillText(f.text, f.x, f.y);
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  // hero hurt: red edge pulse
  if (hero.flash > 0) {
    ctx.fillStyle = `rgba(200,30,40,${hero.flash * 1.4 * motionScale()})`;
    ctx.fillRect(0, 0, GAME_W, 6); ctx.fillRect(0, GAME_H - 6, GAME_W, 6);
    ctx.fillRect(0, 0, 6, GAME_H); ctx.fillRect(GAME_W - 6, 0, 6, GAME_H);
  }

  gfx.drawVignette(ctx, GAME_W, GAME_H);
  drawHUD(dt);
  if (state === 'levelup') drawLevelUp();
  if (state === 'gameover') drawGameOver();
}

function drawBar(x, y, w, h, frac, fg, bg, label) {
  ctx.fillStyle = bg; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = fg; ctx.fillRect(x, y, w * Math.max(0, Math.min(1, frac)), h);
  ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  if (label) {
    ctx.font = 'bold 12px system-ui'; ctx.textAlign = 'center'; ctx.fillStyle = '#fff';
    ctx.fillText(label, x + w / 2, y + h - 4);
  }
}

function drawHUD(dt) {
  dt = dt || 0.016;
  buttons = [];
  // animated bar drain
  displayHp += (hero.hp - displayHp) * Math.min(1, dt * 8);
  const xpFrac = hero.xp / xpNeeded();
  displayXp += (xpFrac - displayXp) * Math.min(1, dt * 8);

  // top-left stats panel
  gfx.drawPanel(ctx, 8, 8, 258, 104);
  gfx.drawGradBar(ctx, 18, 18, 180, 16, Math.max(0, displayHp) / hero.maxHp, '#ff6a5a', '#b01c30', '#2a0e14', `HP ${Math.max(0, hero.hp)}/${hero.maxHp}`);
  gfx.drawGradBar(ctx, 18, 38, 180, 11, displayXp, '#8ad8ff', '#2868b0', '#0c1c30', `XP ${hero.xp}/${xpNeeded()}`);
  ctx.font = 'bold 13px system-ui'; ctx.textAlign = 'left'; ctx.fillStyle = '#d8d2c0';
  ctx.fillText(`LVL ${hero.lvl}   ATK ${heroAtk()}   DEF ${heroDef()}`, 18, 66);
  ctx.fillStyle = '#ffd76a';
  ctx.fillText(`⛁ ${gold}`, 18, 84);
  ctx.fillStyle = '#d8d2c0';
  ctx.fillText(`Depth ${depth}`, 84, 84);
  ctx.fillStyle = '#8ad0ff';
  ctx.fillText(`♦ ${runSouls}`, 208, 84);
  // weapon icon + name
  const wspr = gfx.weaponSprite(WEAPONS[hero.weapon].icon, WEAPONS[hero.weapon].color);
  ctx.save();
  ctx.translate(26, 98);
  ctx.drawImage(wspr.img, -wspr.w / 2, -wspr.h / 2);
  ctx.restore();
  ctx.font = 'bold 12px system-ui';
  ctx.fillStyle = WEAPONS[hero.weapon].color;
  ctx.fillText(WEAPONS[hero.weapon].name, 40, 102);
  gfx.drawShieldIcon(ctx, 148, 97, 12, ARMORS[hero.armor].color);
  ctx.fillStyle = ARMORS[hero.armor].color;
  ctx.fillText(ARMORS[hero.armor].name, 160, 102);

  // score / best top center
  ctx.font = 'bold 17px Georgia, serif'; ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillText(`SCORE ${score}`, GAME_W / 2 + 1, 27);
  ctx.fillStyle = '#f0e8d0'; ctx.fillText(`SCORE ${score}`, GAME_W / 2, 26);
  ctx.font = '12px Georgia, serif'; ctx.fillStyle = '#9a92a8';
  ctx.fillText(`BEST ${best}`, GAME_W / 2, 43);
  const phaseLabel = turnPhase === 'resolving' ? 'ENEMY TURN — RESOLVING' : 'YOUR TURN — SELECT A TILE';
  ctx.font = 'bold 12px system-ui';
  ctx.fillStyle = turnPhase === 'resolving' ? '#ff9a70' : '#8ad8ff';
  ctx.fillText(phaseLabel, GAME_W / 2, 60);
  if (depth === 1 && turnCount < 7) {
    ctx.font = 'bold 12px system-ui'; ctx.fillStyle = '#fff0b8';
    ctx.fillText('Cyan path · enemy labels = intent · wards stun foes', GAME_W / 2, 78);
  }

  // potion button bottom-left
  const pb = { x: 14, y: GAME_H - 68, w: 126, h: 54, id: 'potion' };
  buttons.push(pb);
  gfx.drawPanel(ctx, pb.x, pb.y, pb.w, pb.h, { glow: hero.potions > 0 ? '#ff5c8a' : 'rgba(120,100,110,0.4)' });
  const pbb = Math.sin(time * 3) * 1.2;
  ctx.fillStyle = hero.potions > 0 ? '#ff5c8a' : '#6a4a55';
  ctx.beginPath(); ctx.arc(pb.x + 26, pb.y + 32 + pbb, 9, 0, 7); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.beginPath(); ctx.arc(pb.x + 23, pb.y + 29 + pbb, 3, 0, 7); ctx.fill();
  ctx.fillStyle = '#d8d8e8'; ctx.fillRect(pb.x + 23, pb.y + 15 + pbb, 6, 9);
  ctx.fillStyle = '#8a6c4a'; ctx.fillRect(pb.x + 22, pb.y + 12 + pbb, 8, 4);
  ctx.font = 'bold 16px Georgia, serif'; ctx.textAlign = 'left'; ctx.fillStyle = '#fff8e8';
  ctx.fillText(`x ${hero.potions}`, pb.x + 44, pb.y + 30);
  ctx.font = '11px system-ui'; ctx.fillStyle = '#9a92a8';
  ctx.fillText('press Q', pb.x + 44, pb.y + 45);

  // minimap top-right (framed panel)
  const mmW = 136, mmH = 106, mx = GAME_W - mmW - 12, my = 10;
  gfx.drawPanel(ctx, mx - 4, my - 2, mmW + 8, mmH + 4);
  const msx = mmW / MAP_W, msy = mmH / MAP_H;
  for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
    if (!explored[y][x] || map[y][x] !== 0) continue;
    ctx.fillStyle = visible[y][x] ? '#6a6284' : '#332e44';
    ctx.fillRect(mx + x * msx, my + y * msy, Math.ceil(msx), Math.ceil(msy));
  }
  if (explored[stairs.y][stairs.x]) { ctx.fillStyle = '#ffd76a'; ctx.fillRect(mx + stairs.x * msx - 1, my + stairs.y * msy - 1, 4, 4); }
  const hb = 0.6 + 0.4 * Math.sin(time * 6);
  ctx.fillStyle = `rgba(120,220,255,${hb})`;
  ctx.fillRect(mx + hero.x * msx - 2, my + hero.y * msy - 2, 5, 5);
  for (const m of monsters) if (visible[m.y][m.x]) { ctx.fillStyle = '#ff4c5a'; ctx.fillRect(mx + m.x * msx, my + m.y * msy, 3, 3); }

  // message log bottom center
  ctx.textAlign = 'center'; ctx.font = 'bold 14px Georgia, serif';
  msgLog.forEach((m, i) => {
    m.life -= frameDt;
    ctx.globalAlpha = Math.max(0, Math.min(1, m.life));
    ctx.fillStyle = '#000'; ctx.fillText(m.t, GAME_W / 2 + 1, GAME_H - 70 + i * 18 + 1);
    ctx.fillStyle = m.color; ctx.fillText(m.t, GAME_W / 2, GAME_H - 70 + i * 18);
  });
  ctx.globalAlpha = 1;
}

function drawMenuBackdrop() {
  // dungeon wall backdrop with brick texture
  const biome = 0;
  if (gfx.walls[biome]) {
    ctx.save();
    ctx.globalAlpha = 0.5;
    for (let y = 0; y < GAME_H; y += TILE) for (let x = 0; x < GAME_W; x += TILE) {
      const sh = tileShade(x / TILE, y / TILE);
      ctx.drawImage((y < TILE * 2 || y > GAME_H - TILE * 2) ? gfx.walls[biome][(sh * 4) | 0] : gfx.floors[biome][(sh * 6) | 0], x, y);
    }
    ctx.restore();
    // darken center-out
    const dg = ctx.createRadialGradient(GAME_W / 2, GAME_H / 2, 100, GAME_W / 2, GAME_H / 2, GAME_H * 0.95);
    dg.addColorStop(0, 'rgba(7,6,12,0.55)');
    dg.addColorStop(1, 'rgba(7,6,12,0.92)');
    ctx.fillStyle = dg;
    ctx.fillRect(0, 0, GAME_W, GAME_H);
  }
  // two big flaming torches flanking the title
  for (const tx of [GAME_W / 2 - 330, GAME_W / 2 + 330]) {
    const ty = 150;
    const fl = 0.8 + 0.2 * Math.sin(time * 8 + tx) + 0.06 * Math.random();
    ctx.fillStyle = '#4a3520';
    ctx.fillRect(tx - 4, ty, 8, 46);
    ctx.fillStyle = '#6a5030';
    ctx.fillRect(tx - 8, ty + 42, 16, 6);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const grd = ctx.createRadialGradient(tx, ty - 10, 4, tx, ty - 10, 70 * fl);
    grd.addColorStop(0, 'rgba(255,190,80,0.5)');
    grd.addColorStop(1, 'rgba(255,120,20,0)');
    ctx.fillStyle = grd;
    ctx.fillRect(tx - 74, ty - 84, 148, 148);
    ctx.restore();
    ctx.fillStyle = `rgba(255,${150 + fl * 70 | 0},50,0.95)`;
    ctx.beginPath(); ctx.ellipse(tx, ty - 10, 7 * fl + 2, 14 * fl + 4, Math.sin(time * 10 + tx) * 0.15, 0, 7); ctx.fill();
    ctx.fillStyle = `rgba(255,240,170,${0.85 * fl})`;
    ctx.beginPath(); ctx.ellipse(tx, ty - 8, 3, 7 * fl, 0, 0, 7); ctx.fill();
    // embers
    if (Math.random() < 0.3) {
      addParticle({ x: tx + (Math.random() - 0.5) * 10, y: ty - 20, vx: (Math.random() - 0.5) * 16, vy: -30 - Math.random() * 30, life: 0.8, color: '#ffb85c', r: 1.2, spark: true });
    }
  }
  // menu particles (embers) — use particle array in screen space
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= frameDt; if (p.life <= 0) { particles.splice(i, 1); continue; }
    p.x += p.vx * frameDt; p.y += p.vy * frameDt;
    ctx.globalAlpha = Math.min(1, p.life * 2);
    ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill();
  }
  ctx.globalAlpha = 1;
  // drifting fog layers
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 5; i++) {
    const fx = ((time * (8 + i * 4) + i * 260) % (GAME_W + 400)) - 200;
    const fy = 420 + i * 45 - 60;
    const fg = ctx.createRadialGradient(fx, fy, 10, fx, fy, 150);
    fg.addColorStop(0, 'rgba(90,80,130,0.05)');
    fg.addColorStop(1, 'rgba(60,50,100,0)');
    ctx.fillStyle = fg;
    ctx.fillRect(fx - 150, fy - 80, 300, 160);
  }
  ctx.restore();
}

function drawMenu() {
  drawMenuBackdrop();
  ctx.textAlign = 'center';
  // logo with glow
  const pulseL = 0.75 + 0.25 * Math.sin(time * 2.2);
  ctx.save();
  ctx.shadowColor = `rgba(255,190,80,${0.55 * pulseL})`;
  ctx.shadowBlur = 26;
  ctx.font = 'bold 68px Georgia, serif';
  const grd = ctx.createLinearGradient(0, 130, 0, 210);
  grd.addColorStop(0, '#ffe9a8'); grd.addColorStop(0.5, '#ffd76a'); grd.addColorStop(1, '#b06a20');
  ctx.fillStyle = '#1a0e04'; ctx.fillText('RUNIC DEPTHS', GAME_W / 2 + 4, 184);
  ctx.fillStyle = grd; ctx.fillText('RUNIC DEPTHS', GAME_W / 2, 180);
  ctx.restore();
  // rune underline
  ctx.strokeStyle = `rgba(255,215,106,${0.5 + 0.3 * pulseL})`; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(GAME_W / 2 - 250, 200); ctx.lineTo(GAME_W / 2 + 250, 200); ctx.stroke();
  for (let i = 0; i < 7; i++) {
    const rx = GAME_W / 2 - 210 + i * 70;
    ctx.fillStyle = `rgba(138,208,255,${0.3 + 0.4 * Math.sin(time * 3 + i)})`;
    ctx.font = '14px Georgia, serif';
    ctx.fillText(['ᚱ', 'ᚢ', 'ᚾ', 'ᛁ', 'ᚲ', 'ᛞ', 'ᛟ'][i], rx, 218);
  }
  ctx.font = '19px Georgia, serif'; ctx.fillStyle = '#b0a8c4';
  ctx.fillText('Turn-based dungeon crawler — loot, level up, descend', GAME_W / 2, 244);

  // class + souls line
  const cls = CLASSES[meta.selectedClass] || CLASSES.knight;
  ctx.font = 'bold 17px Georgia, serif'; ctx.fillStyle = '#8ad0ff';
  ctx.fillText(`♦ ${meta.souls} souls`, GAME_W / 2 - 150, 282);
  ctx.fillStyle = cls.tint;
  ctx.fillText(`Class: ${cls.name}`, GAME_W / 2 + 60, 282);
  if (meta.bestDepth > 0) {
    ctx.fillStyle = '#ffd76a'; ctx.font = '15px Georgia, serif';
    ctx.fillText(`Deepest: ${meta.bestDepth}`, GAME_W / 2 + 250, 282);
  }
  if (dailyBonus > 0) {
    const fl = 0.6 + 0.4 * Math.sin(time * 5);
    ctx.font = 'bold 16px Georgia, serif';
    ctx.fillStyle = `rgba(138,208,255,${fl})`;
    ctx.fillText(`DAILY BONUS +${dailyBonus} ♦ — day ${meta.streak.count} streak!`, GAME_W / 2, 310);
  }

  const bw = 250, bh = 64, bx = GAME_W / 2 - bw / 2, by = 330;
  buttons = [{ x: bx, y: by, w: bw, h: bh, id: 'play' }];
  const pulse = 0.9 + 0.1 * Math.sin(time * 4);
  gfx.drawButton(ctx, bx, by, bw, bh, '⚔ PLAY', '#3e9e5c', { size: 28, pulse });

  // shop + bestiary buttons
  const sw = 214, shh = 52;
  const shopB = { x: GAME_W / 2 - sw - 14, y: by + 84, w: sw, h: shh, id: 'shop' };
  const bestB = { x: GAME_W / 2 + 14, y: by + 84, w: sw, h: shh, id: 'bestiary' };
  buttons.push(shopB, bestB);
  gfx.drawButton(ctx, shopB.x, shopB.y, sw, shh, '♦ SOUL SHOP', '#2a5a8a', { size: 19 });
  gfx.drawButton(ctx, bestB.x, bestB.y, sw, shh, '📖 BESTIARY', '#5a3a80', { size: 19 });

  ctx.font = '15px Georgia, serif'; ctx.fillStyle = '#8f889c';
  ctx.fillText('WASD / arrows / tap to move · walk into monsters to attack · Q = potion', GAME_W / 2, 545);
  if (best > 0) { ctx.fillStyle = '#ffd76a'; ctx.fillText(`Best score: ${best}`, GAME_W / 2, 572); }
  gfx.drawVignette(ctx, GAME_W, GAME_H);
}

function drawShop() {
  drawMenuBackdrop();
  ctx.textAlign = 'center';
  ctx.save();
  ctx.shadowColor = 'rgba(138,208,255,0.5)'; ctx.shadowBlur = 18;
  ctx.font = 'bold 40px Georgia, serif'; ctx.fillStyle = '#8ad0ff';
  ctx.fillText('SOUL SHOP', GAME_W / 2, 62);
  ctx.restore();
  ctx.font = 'bold 20px Georgia, serif'; ctx.fillStyle = '#8ad0ff';
  ctx.fillText(`♦ ${meta.souls} souls`, GAME_W / 2, 94);
  buttons = [];

  // tabs
  const tabs = [['upgrades', 'UPGRADES'], ['classes', 'CLASSES']];
  tabs.forEach(([id, label], i) => {
    const tx = GAME_W / 2 - 190 + i * 200, ty = 112, tw = 180, th = 40;
    buttons.push({ x: tx, y: ty, w: tw, h: th, id: 'tab_' + id });
    ctx.fillStyle = shopTab === id ? 'rgba(138,208,255,0.35)' : 'rgba(40,36,60,0.8)';
    ctx.fillRect(tx, ty, tw, th);
    ctx.strokeStyle = shopTab === id ? '#8ad0ff' : '#555';
    ctx.strokeRect(tx + 0.5, ty + 0.5, tw - 1, th - 1);
    ctx.font = 'bold 17px system-ui'; ctx.fillStyle = shopTab === id ? '#fff' : '#9f96b8';
    ctx.fillText(label, tx + tw / 2, ty + 26);
  });

  if (shopTab === 'upgrades') {
    const ids = Object.keys(UPGRADES);
    ids.forEach((id, i) => {
      const u = UPGRADES[id];
      const lvl = meta.upgrades[id] || 0;
      const maxed = lvl >= u.max;
      const cost = maxed ? 0 : upgradeCost(id);
      const affordable = !maxed && meta.souls >= cost;
      const y = 178 + i * 92, x = GAME_W / 2 - 330, w = 660, h = 80;
      buttons.push({ x, y, w, h, id: 'up_' + id });
      gfx.drawPanel(ctx, x, y, w, h, { glow: maxed ? '#6a9a6a' : affordable ? '#8ad0ff' : 'rgba(90,80,110,0.5)', light: affordable && !maxed });
      ctx.textAlign = 'left';
      ctx.font = 'bold 21px system-ui'; ctx.fillStyle = '#fff';
      ctx.fillText(u.name, x + 20, y + 32);
      ctx.font = '15px system-ui'; ctx.fillStyle = '#9f96b8';
      ctx.fillText(u.desc + ' per level', x + 20, y + 58);
      // pips
      for (let p = 0; p < u.max; p++) {
        ctx.fillStyle = p < lvl ? '#8ad0ff' : '#333048';
        ctx.fillRect(x + 250 + p * 22, y + 34, 16, 12);
      }
      ctx.textAlign = 'right';
      ctx.font = 'bold 19px system-ui';
      ctx.fillStyle = maxed ? '#9fdc7a' : affordable ? '#8ad0ff' : '#777';
      ctx.fillText(maxed ? 'MAX' : `♦ ${cost}`, x + w - 20, y + 47);
      ctx.textAlign = 'center';
    });
  } else {
    const ids = Object.keys(CLASSES);
    ids.forEach((id, i) => {
      const c = CLASSES[id];
      const owned = meta.classes.includes(id);
      const selected = meta.selectedClass === id;
      const affordable = !owned && meta.souls >= c.cost;
      const y = 178 + i * 108, x = GAME_W / 2 - 330, w = 660, h = 96;
      buttons.push({ x, y, w, h, id: 'cls_' + id });
      gfx.drawPanel(ctx, x, y, w, h, { glow: selected ? '#5ac878' : owned ? '#8ad0ff' : affordable ? '#c88aff' : 'rgba(90,80,110,0.5)', light: selected });
      // class avatar: hero sprite in class tint
      const av = gfx.heroSprite(c.tint, '#9a8f78');
      ctx.save();
      ctx.translate(x + 48, y + 48);
      ctx.scale(1.4, 1.4);
      ctx.drawImage(av.img, -av.w / 2, -av.h / 2);
      ctx.restore();
      ctx.textAlign = 'left';
      ctx.font = 'bold 21px system-ui'; ctx.fillStyle = '#fff';
      ctx.fillText(c.name, x + 92, y + 34);
      ctx.font = '15px system-ui'; ctx.fillStyle = '#9f96b8';
      ctx.fillText(c.desc, x + 92, y + 58);
      ctx.fillStyle = '#cfc9b8';
      ctx.fillText(`HP ${c.hp}  ATK ${c.atk}  Potions ${c.potions}${c.crit ? '  Crit ' + Math.round(c.crit * 100) + '%' : ''}`, x + 92, y + 80);
      ctx.textAlign = 'right';
      ctx.font = 'bold 19px system-ui';
      ctx.fillStyle = selected ? '#5ac878' : owned ? '#8ad0ff' : affordable ? '#c88aff' : '#777';
      ctx.fillText(selected ? 'SELECTED' : owned ? 'SELECT' : `♦ ${c.cost}`, x + w - 20, y + 55);
      ctx.textAlign = 'center';
    });
  }

  // back button
  const bb = { x: GAME_W / 2 - 110, y: GAME_H - 66, w: 220, h: 50, id: 'back' };
  buttons.push(bb);
  gfx.drawButton(ctx, bb.x, bb.y, bb.w, bb.h, 'BACK', '#3e9e5c', { size: 20 });
}

function drawBestiary() {
  drawMenuBackdrop();
  ctx.textAlign = 'center';
  ctx.save();
  ctx.shadowColor = 'rgba(200,138,255,0.5)'; ctx.shadowBlur = 18;
  ctx.font = 'bold 40px Georgia, serif'; ctx.fillStyle = '#c88aff';
  ctx.fillText('BESTIARY', GAME_W / 2, 62);
  ctx.restore();
  ctx.font = '16px Georgia, serif'; ctx.fillStyle = '#9f96b8';
  ctx.fillText(`Deepest depth: ${meta.bestDepth}   ·   Runs: ${meta.totalRuns}   ·   Total kills: ${meta.totalKills}`, GAME_W / 2, 96);
  buttons = [];
  const ids = Object.keys(MONSTER_TYPES);
  ids.forEach((id, i) => {
    const t = MONSTER_TYPES[id];
    const kills = meta.bestiary[id] || 0;
    const known = kills > 0;
    const col = i % 2, row = (i / 2) | 0;
    const x = GAME_W / 2 - 330 + col * 340, y = 124 + row * 102, w = 320, h = 92;
    gfx.drawPanel(ctx, x, y, w, h, { glow: known ? t.color : 'rgba(70,64,90,0.5)' });
    // portrait: actual sprite (dark silhouette when unknown)
    const spr = gfx.monsterSprites[id];
    if (spr) {
      ctx.save();
      ctx.translate(x + 44, y + 46);
      const sc = Math.min(1.1, 52 / spr.h);
      ctx.scale(sc, sc);
      if (known) ctx.drawImage(spr.img, -spr.w / 2, -spr.h / 2);
      else { ctx.filter = 'brightness(0.22)'; ctx.drawImage(spr.img, -spr.w / 2, -spr.h / 2); ctx.filter = 'none'; }
      ctx.restore();
      if (!known) {
        ctx.font = 'bold 26px Georgia, serif'; ctx.fillStyle = '#6a6084';
        ctx.fillText('?', x + 44, y + 55);
      }
    }
    ctx.textAlign = 'left';
    ctx.font = 'bold 18px system-ui'; ctx.fillStyle = known ? '#fff' : '#666';
    ctx.fillText(known ? t.name : '???', x + 88, y + 30);
    ctx.font = '13px system-ui'; ctx.fillStyle = '#9f96b8';
    if (known) {
      wrapText(BESTIARY_INFO[id] || '', x + 88, y + 50, w - 100, 15);
      ctx.fillStyle = t.color;
      ctx.fillText(`Slain: ${kills}`, x + 88, y + 82);
    } else {
      ctx.fillText('Encounter this creature to reveal it.', x + 88, y + 50);
    }
    ctx.textAlign = 'center';
  });
  const bb = { x: GAME_W / 2 - 110, y: GAME_H - 66, w: 220, h: 50, id: 'back' };
  buttons.push(bb);
  gfx.drawButton(ctx, bb.x, bb.y, bb.w, bb.h, 'BACK', '#3e9e5c', { size: 20 });
}

function wrapText(text, x, y, maxW, lineH) {
  const words = text.split(' ');
  let line = '', yy = y;
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, x, yy); line = w; yy += lineH;
    } else line = test;
  }
  if (line) ctx.fillText(line, x, yy);
}

function drawLevelUp() {
  ctx.fillStyle = 'rgba(5,4,12,0.78)';
  ctx.fillRect(0, 0, GAME_W, GAME_H);
  ctx.textAlign = 'center';
  ctx.save();
  ctx.shadowColor = 'rgba(255,215,106,0.6)'; ctx.shadowBlur = 22;
  ctx.font = 'bold 44px Georgia, serif'; ctx.fillStyle = '#ffd76a';
  ctx.fillText(`LEVEL ${hero.lvl}!`, GAME_W / 2, 140);
  ctx.restore();
  ctx.font = '18px Georgia, serif'; ctx.fillStyle = '#cfc9b8';
  ctx.fillText('Choose an upgrade (or press 1 / 2 / 3)', GAME_W / 2, 175);
  buttons = [];
  const cw = 210, chh = 220, gap = 40;
  const total = cw * 3 + gap * 2, x0 = GAME_W / 2 - total / 2;
  levelCards.forEach((c, i) => {
    const x = x0 + i * (cw + gap), y = 220 + Math.sin(time * 2.4 + i * 1.8) * 4;
    buttons.push({ x, y: 220, w: cw, h: chh, id: 'card' + i });
    gfx.drawPanel(ctx, x, y, cw, chh, { glow: c.color, light: true });
    // icon medallion with glow
    ctx.save();
    ctx.shadowColor = c.color; ctx.shadowBlur = 16;
    ctx.fillStyle = c.color;
    ctx.beginPath(); ctx.arc(x + cw / 2, y + 70, 34, 0, 7); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x + cw / 2, y + 70, 34, 0, 7); ctx.stroke();
    ctx.fillStyle = '#0a0810'; ctx.font = 'bold 30px system-ui';
    ctx.fillText(c.id === 'hp' ? '♥' : c.id === 'atk' ? '⚔' : '⛨', x + cw / 2, y + 81);
    ctx.font = 'bold 22px Georgia, serif'; ctx.fillStyle = '#fff8e8';
    ctx.fillText(c.title, x + cw / 2, y + 145);
    ctx.font = '15px system-ui'; ctx.fillStyle = '#9f96b8';
    ctx.fillText(c.sub, x + cw / 2, y + 172);
    ctx.font = 'bold 14px system-ui'; ctx.fillStyle = c.color;
    ctx.fillText(`[${i + 1}]`, x + cw / 2, y + 202);
  });
}

function drawGameOver() {
  ctx.fillStyle = 'rgba(16,4,8,0.85)';
  ctx.fillRect(0, 0, GAME_W, GAME_H);
  ctx.textAlign = 'center';
  ctx.save();
  ctx.shadowColor = 'rgba(224,76,90,0.7)'; ctx.shadowBlur = 28;
  ctx.font = 'bold 56px Georgia, serif'; ctx.fillStyle = '#e04c5a';
  ctx.fillText('YOU DIED', GAME_W / 2, 170);
  ctx.restore();
  ctx.font = 'bold 26px Georgia, serif'; ctx.fillStyle = '#fff8e8';
  ctx.fillText(`Score: ${score}`, GAME_W / 2, 225);
  ctx.font = '18px Georgia, serif'; ctx.fillStyle = '#ffd76a';
  ctx.fillText(`Depth ${depth} · Level ${hero.lvl} · ${gold} gold${score >= best ? '  —  NEW BEST!' : ''}`, GAME_W / 2, 258);
  ctx.font = 'bold 20px Georgia, serif'; ctx.fillStyle = '#8ad0ff';
  ctx.fillText(`♦ +${runSouls} souls banked  (total ${meta.souls})`, GAME_W / 2, 292);
  buttons = [];
  let by = 320;
  if (runSouls > 0 && !soulsDoubled) {
    const bw = 320, bh = 52, bx = GAME_W / 2 - bw / 2;
    buttons.push({ x: bx, y: by, w: bw, h: bh, id: 'x2souls' });
    gfx.drawButton(ctx, bx, by, bw, bh, '▶ x2 SOULS (watch ad)', adBusy ? '#3a5a74' : '#3a86c8', { size: 19 });
    by += 68;
  }
  if (!resurrectUsed) {
    const bw = 320, bh = 52, bx = GAME_W / 2 - bw / 2;
    buttons.push({ x: bx, y: by, w: bw, h: bh, id: 'resurrect' });
    gfx.drawButton(ctx, bx, by, bw, bh, '▶ RESURRECT (watch ad)', adBusy ? '#7a6a34' : '#c89a2e', { size: 19 });
    by += 68;
  }
  const bw = 320, bh = 56, bx = GAME_W / 2 - bw / 2;
  buttons.push({ x: bx, y: by, w: bw, h: bh, id: 'again' });
  gfx.drawButton(ctx, bx, by, bw, bh, 'PLAY AGAIN', adBusy ? '#31684a' : '#3e9e5c', { size: 23 });
  by += 72;
  // soul shop shortcut from death screen
  buttons.push({ x: GAME_W / 2 - 130, y: by, w: 260, h: 44, id: 'shop' });
  gfx.drawButton(ctx, GAME_W / 2 - 130, by, 260, 44, '♦ SPEND SOULS', '#2a5a8a', { size: 16 });
}

// ---------- debug hook ----------
if (new URLSearchParams(location.search).has('debug')) {
  window.__astro = {
    forceGameOver: () => { if (state === 'playing') { die(); } },
    addScore: (n) => { gold += n; score = calcScore(); },
    getState: () => {
      const near = [];
      if (monsters) for (const m of monsters) {
        const dx = m.x - hero.x, dy = m.y - hero.y;
        if (Math.abs(dx) <= 6 && Math.abs(dy) <= 6) near.push({ dx, dy, hp: m.hp, type: m.type, intent: monsterIntent(m).id, staggered: m.staggered || 0 });
      }
      // BFS next-step toward stairs
      let sd = { dx: 0, dy: 0 }, stairsReachable = false;
      if (map && stairs) {
        const q = [[hero.x, hero.y]];
        const prev = new Map(); prev.set(hero.x + ',' + hero.y, null);
        let found = false;
        while (q.length && !found) {
          const [cx, cy] = q.shift();
          for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = cx + ox, ny = cy + oy, k = nx + ',' + ny;
            if (nx < 0 || ny < 0 || nx >= MAP_W || ny >= MAP_H || map[ny][nx] !== 0 || prev.has(k)) continue;
            prev.set(k, cx + ',' + cy);
            if (nx === stairs.x && ny === stairs.y) { found = true; }
            q.push([nx, ny]);
          }
        }
        stairsReachable = found;
        if (found) {
          let k = stairs.x + ',' + stairs.y, pk = prev.get(k);
          while (pk && pk !== hero.x + ',' + hero.y) { k = pk; pk = prev.get(k); }
          const [nx, ny] = k.split(',').map(Number);
          sd = { dx: nx - hero.x, dy: ny - hero.y };
        }
      }
      return {
        state, hp: hero ? hero.hp : 0, lvl: hero ? hero.lvl : 0, depth, score,
        heroX: hero ? hero.x : 0, heroY: hero ? hero.y : 0,
        potions: hero ? hero.potions : 0,
        monstersNearby: near, stairsDir: sd,
        resurrectUsed,
        runSouls, souls: meta.souls, selectedClass: meta.selectedClass,
        classes: meta.classes.slice(), upgrades: Object.assign({}, meta.upgrades),
        bestDepth: meta.bestDepth, streak: meta.streak.count, dailyBonus,
        bestiaryCount: Object.keys(meta.bestiary).length,
        altarCount: altars ? altars.length : 0, soulGemCount: soulGems ? soulGems.length : 0,
        turnPhase, paused, floorSeed, runePillarCount: runePillars ? runePillars.length : 0,
        staggeredMonsterCount: monsters ? monsters.filter(m => m.staggered > 0).length : 0,
        particleCount: particles.length, floaterCount: floaters.length, listenerCount: 8,
        safeStart: monsters ? !monsters.some(m => Math.abs(m.x - hero.x) + Math.abs(m.y - hero.y) <= 4) : false,
        firstFloorResource: potionsOnFloor ? potionsOnFloor.length > 0 : false,
        stairsReachable,
      };
    },
    move: (dx, dy) => tryMove(dx, dy),
    pickCard: (i) => { if (state === 'levelup') pickCard(levelCards[i]); },
    usePotion,
    startGame: () => { if (state === 'menu') startGame(); },
    startGameWithSeed: (seed) => { if (state === 'menu') startGame(seed); },
    newRunWithSeed: (seed) => { newRun(seed); state = 'playing'; },
    playAgain,
    resurrect,
    doubleSouls,
    openShop: () => { if (state === 'menu' || state === 'gameover') { state = 'shop'; shopTab = 'upgrades'; } },
    openBestiary: () => { if (state === 'menu') state = 'bestiary'; },
    closeOverlay: () => { if (state === 'shop' || state === 'bestiary') state = 'menu'; },
    setShopTab: (t) => { shopTab = t; },
    buyUpgrade: (id) => buyUpgrade(id),
    buyClass: (id) => buyClass(id),
    selectClass: (id) => selectClass(id),
    addSouls: (n) => addSouls(n),
    grantXp: (n) => gainXp(Math.max(0, Number(n) || 0)),
    grantSouls: (n) => { runSouls += n; },
    timingProbe: (hz) => {
      let bump = 1, particleLife = 0.6, elapsed = 0;
      const dt = 1 / hz;
      while (particleLife > 0) { bump = Math.max(0, bump - dt * 6); particleLife -= dt; elapsed += dt; }
      return { score, heroX: hero.x, heroY: hero.y, spawnCount: monsters.length, difficulty: depth, visualSeconds: elapsed, bump };
    },
    setResolutionDelay: (ms) => { resolutionDelay = Math.max(1, Math.min(120, Number(ms) || 120)); },
    setHeroHp: (hp) => { hero.hp = Math.max(1, Math.min(hero.maxHp, Number(hp) || hero.hp)); },
    setupFinalPolishEncounter: (kind) => {
      monsters = []; runePillars = [];
      const px = hero.x + 1, py = hero.y;
      for (let x = hero.x - 1; x <= hero.x + 4; x++) if (x > 0 && x < MAP_W - 1) map[py][x] = 0;
      if (kind === 'slow') {
        spawnMonster('ogre', hero.x + 3, py, Math.max(1, depth));
        turnCount = 1; // the next enemy phase is an ogre's rest turn
      } else if (kind === 'ward') {
        map[py][px] = 3;
        runePillars.push({ x: px, y: py, hp: 2, maxHp: 2 });
        spawnMonster('skeleton', hero.x + 3, py, Math.max(1, depth));
        turnCount = 0;
      }
      updateVisibility();
    },
    pauseRun,
    resumeRun,
  };
}

// ---------- boot ----------
let lastT = 0;
function loop(t) {
  const dt = paused ? 0 : Math.min(0.05, (t - lastT) / 1000 || 0.016);
  lastT = t;
  draw(dt);
  requestAnimationFrame(loop);
}

(async function boot() {
  gfx.initGfx(MAP_W, MAP_H, GAME_W, GAME_H);
  await initSDK();
  loadingStart();
  best = loadBest();
  loadMeta();
  dailyBonus = checkDailyStreak();
  sfx.setMuted(getMuteSetting());
  onSettingsChange((s) => { if (s && typeof s.muteAudio === 'boolean') sfx.setMuted(s.muteAudio); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) pauseRun(); else resumeRun(); });
  window.addEventListener('blur', pauseRun);
  window.addEventListener('focus', resumeRun);
  hero = { x: 0, y: 0 }; // placeholder before first run
  state = 'menu';
  loadingStop();
  requestAnimationFrame(loop);
})();
