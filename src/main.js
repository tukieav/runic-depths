// Runic Depths — turn-based dungeon crawler mini-cRPG for CrazyGames
import { initSDK, loadingStart, loadingStop, gameplayStart, gameplayStop, happytime, requestAd, getMuteSetting, onSettingsChange, loadBest, saveBest } from './sdk.js';
import * as sfx from './audio.js';
import { meta, loadMeta, saveMeta, CLASSES, UPGRADES, BESTIARY_INFO, upgradeCost, canBuyUpgrade, buyUpgrade, canBuyClass, buyClass, selectClass, addSouls, recordKill, recordRun, checkDailyStreak, startingHero, goldMult } from './meta.js';

const GAME_W = 960, GAME_H = 640;
const TILE = 40;
const MAP_W = 44, MAP_H = 34;
const VIEW_RADIUS = 5;

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
canvas.width = GAME_W; canvas.height = GAME_H;

function fitCanvas() {
  const ww = window.innerWidth, wh = window.innerHeight;
  const s = Math.min(ww / GAME_W, wh / GAME_H);
  canvas.style.width = (GAME_W * s) + 'px';
  canvas.style.height = (GAME_H * s) + 'px';
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
let hero, monsters, chests, potionsOnFloor, goldPiles, soulGems, altars, stairs;
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

function logMsg(t, color) { msgLog.push({ t, color: color || '#cfc9b8', life: 4 }); if (msgLog.length > 4) msgLog.shift(); }

// ---------- dungeon generation ----------
function genDungeon(d) {
  map = [];
  for (let y = 0; y < MAP_H; y++) { map.push(new Array(MAP_W).fill(1)); } // 1 = wall
  rooms = [];
  const nRooms = 8 + Math.min(6, d);
  let tries = 0;
  while (rooms.length < nRooms && tries < 300) {
    tries++;
    const w = 4 + (Math.random() * 6 | 0), h = 4 + (Math.random() * 5 | 0);
    const x = 1 + (Math.random() * (MAP_W - w - 2) | 0), y = 1 + (Math.random() * (MAP_H - h - 2) | 0);
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
  // torches on some wall tiles adjacent to floor
  for (let y = 1; y < MAP_H - 1; y++) for (let x = 1; x < MAP_W - 1; x++) {
    if (map[y][x] === 1 && map[y + 1][x] === 0 && Math.random() < 0.07) map[y][x] = 2; // torch wall
  }
  explored = [];
  for (let y = 0; y < MAP_H; y++) explored.push(new Array(MAP_W).fill(false));

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
  monsters = []; chests = []; potionsOnFloor = []; goldPiles = []; soulGems = []; altars = [];
  const isBossDepth = d % 3 === 0;
  // special rooms: pick 1-2 non-start, non-stairs rooms
  const specials = [];
  const candidates = rooms.slice(1).filter(r => r !== far);
  shuffle(candidates);
  if (d >= 2 && candidates.length > 0) specials.push({ room: candidates[0], kind: 'vault' });    // guarded treasure vault
  if (d >= 3 && candidates.length > 1 && Math.random() < 0.6) specials.push({ room: candidates[1], kind: 'altar' }); // risk/reward altar
  for (let i = 1; i < rooms.length; i++) {
    const r = rooms[i];
    const special = specials.find(s => s.room === r);
    const spots = [];
    for (let yy = r.y; yy < r.y + r.h; yy++) for (let xx = r.x; xx < r.x + r.w; xx++) {
      if (!(xx === stairs.x && yy === stairs.y)) spots.push({ x: xx, y: yy });
    }
    shuffle(spots);
    let si = 0;
    if (special && special.kind === 'vault') {
      // treasure vault: 2 chests + gold, guarded by 2 tough monsters
      for (let c = 0; c < 2 && si < spots.length; c++) { chests.push({ x: spots[si].x, y: spots[si].y, opened: false }); si++; }
      if (si < spots.length) { goldPiles.push({ x: spots[si].x, y: spots[si].y, amt: 20 + (Math.random() * 15 * d | 0) }); si++; }
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
    const nMon = (d <= 1 ? 0 : 1) + (Math.random() * Math.min(monCap, 1 + d * 0.45) | 0);
    for (let m = 0; m < nMon && si < spots.length; m++) {
      spawnMonster(rollMonsterType(d), spots[si].x, spots[si].y, d);
      si++;
    }
    if (Math.random() < 0.55 && si < spots.length) { chests.push({ x: spots[si].x, y: spots[si].y, opened: false }); si++; }
    if (Math.random() < 0.3 && si < spots.length) { potionsOnFloor.push({ x: spots[si].x, y: spots[si].y }); si++; }
    if (Math.random() < 0.4 && si < spots.length) { goldPiles.push({ x: spots[si].x, y: spots[si].y, amt: 5 + (Math.random() * 10 * d | 0) }); si++; }
    if (Math.random() < 0.25 && si < spots.length) { soulGems.push({ x: spots[si].x, y: spots[si].y, amt: 1 + (Math.random() * (1 + d * 0.4) | 0) }); si++; }
  }
  if (isBossDepth) {
    // boss guards the stairs room
    spawnMonster('boss', far.cx + (far.w > 2 ? 1 : 0), far.cy, d);
    // boss floors always drop a soul gem cluster near stairs
    soulGems.push({ x: far.cx - 1, y: far.cy, amt: 3 + d });
  }
  updateVisibility();
}

function rollMonsterType(d) {
  const roll = Math.random();
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
    bump: 0, bumpDx: 0, bumpDy: 0,
  });
}

function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; }

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
function newRun() {
  const s = startingHero();
  hero = {
    x: 0, y: 0, hp: s.maxHp, maxHp: s.maxHp, baseAtk: s.baseAtk, baseDef: s.baseDef,
    lvl: 1, xp: 0, weapon: 0, armor: 0, potions: s.potions,
    crit: s.crit, healAmt: s.heal, tint: s.tint, cursed: 0, blessed: 0,
    bump: 0, bumpDx: 0, bumpDy: 0,
  };
  depth = 1; gold = 0; score = 0; turnCount = 0;
  runSouls = 0; soulsDoubled = false; soulsBanked = 0;
  resurrectUsed = false;
  floaters = []; particles = []; msgLog = [];
  genDungeon(depth);
  logMsg('Depth 1 — find the stairs!', '#ffd76a');
}

function heroAtk() { return hero.baseAtk + WEAPONS[hero.weapon].atk; }
function heroDef() { return hero.baseDef + ARMORS[hero.armor].def; }
function xpNeeded() { return hero.lvl * 20; }
function calcScore() { return depth * 100 + gold + hero.xp + (hero.lvl - 1) * 20; }

// ---------- turn logic ----------
function tryMove(dx, dy) {
  if (state !== 'playing' || adBusy) return;
  if (dx === 0 && dy === 0) return;
  const nx = hero.x + dx, ny = hero.y + dy;
  if (nx < 0 || ny < 0 || nx >= MAP_W || ny >= MAP_H) return;
  const mon = monsters.find(m => m.x === nx && m.y === ny);
  if (!mon && map[ny][nx] !== 0) return;
  if (mon) {
    attackMonster(mon, dx, dy);
  } else {
    hero.x = nx; hero.y = ny;
    hero.bump = 1; hero.bumpDx = dx; hero.bumpDy = dy;
    sfx.stepSound();
    pickupAt(nx, ny);
    if (nx === stairs.x && ny === stairs.y) { descend(); return; }
  }
  endPlayerTurn();
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
  sfx.swordSound();
  addFloater(mon.x, mon.y, (isCrit ? 'CRIT -' : '-') + dmg, isCrit ? '#ff9a3c' : '#ffea70');
  burstParticles(mon.x, mon.y, MONSTER_TYPES[mon.type].color, isCrit ? 14 : 8);
  doShake(isCrit ? 5 : 3);
  if (mon.hp <= 0) {
    monsters.splice(monsters.indexOf(mon), 1);
    sfx.monsterDieSound();
    burstParticles(mon.x, mon.y, MONSTER_TYPES[mon.type].color, 18);
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
  burstParticles(hero.x, hero.y, '#ffd76a', 24);
  state = 'playing';
}

function usePotion() {
  if (state !== 'playing' || hero.potions <= 0 || hero.hp >= hero.maxHp) return;
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
  genDungeon(depth);
  doShake(5);
  endPlayerTurn(true);
}

function endPlayerTurn(skipMonsters) {
  turnCount++;
  score = calcScore();
  if (!skipMonsters) monstersAct();
  updateVisibility();
  if (hero.hp <= 0) die();
}

function monstersAct() {
  for (const m of monsters) {
    if (m.slow && turnCount % 2 === 0) continue;
    const dx = hero.x - m.x, dy = hero.y - m.y;
    const dist = Math.abs(dx) + Math.abs(dy);
    if (dist === 1) {
      // attack hero
      const variance = (Math.random() * 3 | 0) - 1;
      const dmg = Math.max(1, m.atk + variance - heroDef());
      hero.hp -= dmg;
      m.bump = 1; m.bumpDx = Math.sign(dx) * 0.5; m.bumpDy = Math.sign(dy) * 0.5;
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
  return true;
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
    onStart: () => sfx.setMuted(true),
    onFinish: () => sfx.setMuted(getMuteSetting()),
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
    onStart: () => sfx.setMuted(true),
    onFinish: () => sfx.setMuted(getMuteSetting()),
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
  if (adBusy) return;
  adBusy = true;
  await requestAd('midgame', {
    onStart: () => sfx.setMuted(true),
    onFinish: () => sfx.setMuted(getMuteSetting()),
  });
  adBusy = false;
  newRun();
  state = 'playing';
  gameplayStart();
}

function startGame() {
  sfx.unlockAudio();
  newRun();
  state = 'playing';
  gameplayStart();
}

// ---------- fx ----------
function addFloater(tx, ty, text, color) {
  floaters.push({ x: tx * TILE + TILE / 2, y: ty * TILE, text, color, life: 1.2, vy: -40 });
}
function burstParticles(tx, ty, color, n) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, s = 40 + Math.random() * 120;
    particles.push({ x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.4 + Math.random() * 0.4, color, r: 1.5 + Math.random() * 2.5 });
  }
}
function doShake(n) { shake = Math.max(shake, n); shakeT = 0.25; }

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

// ---------- rendering ----------
function tileShade(x, y) {
  // deterministic pseudo-noise per tile
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

function draw(dt) {
  time += dt;
  // camera
  camX = hero.x * TILE + TILE / 2 - GAME_W / 2;
  camY = hero.y * TILE + TILE / 2 - GAME_H / 2;
  camX = Math.max(0, Math.min(MAP_W * TILE - GAME_W, camX));
  camY = Math.max(0, Math.min(MAP_H * TILE - GAME_H, camY));

  let sx = 0, sy = 0;
  if (shakeT > 0) { shakeT -= dt; sx = (Math.random() - 0.5) * shake * 2; sy = (Math.random() - 0.5) * shake * 2; if (shakeT <= 0) shake = 0; }

  ctx.fillStyle = '#0a0810';
  ctx.fillRect(0, 0, GAME_W, GAME_H);

  if (state === 'menu' || state === 'boot') { drawMenu(); return; }
  if (state === 'shop') { drawShop(); return; }
  if (state === 'bestiary') { drawBestiary(); return; }

  ctx.save();
  ctx.translate(-camX + sx, -camY + sy);

  const x0 = Math.max(0, Math.floor(camX / TILE)), x1 = Math.min(MAP_W - 1, Math.ceil((camX + GAME_W) / TILE));
  const y0 = Math.max(0, Math.floor(camY / TILE)), y1 = Math.min(MAP_H - 1, Math.ceil((camY + GAME_H) / TILE));

  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (!explored[y][x]) continue;
      const vis = visible[y][x];
      const px = x * TILE, py = y * TILE;
      const sh = tileShade(x, y);
      if (map[y][x] === 0) {
        // floor: stone with moss variation
        const g = 30 + sh * 14;
        ctx.fillStyle = sh > 0.82 ? `rgb(${g * 0.7 | 0},${g * 1.15 | 0},${g * 0.6 | 0})` : `rgb(${g | 0},${g | 0},${g + 8 | 0})`;
        ctx.fillRect(px, py, TILE, TILE);
        ctx.strokeStyle = 'rgba(0,0,0,0.25)';
        ctx.strokeRect(px + 0.5, py + 0.5, TILE - 1, TILE - 1);
      } else {
        // wall
        const g = 52 + sh * 18;
        ctx.fillStyle = `rgb(${g | 0},${g * 0.9 | 0},${g * 1.1 | 0})`;
        ctx.fillRect(px, py, TILE, TILE);
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fillRect(px, py + TILE - 6, TILE, 6);
        if (map[y][x] === 2 && vis) {
          // torch with flicker
          const fl = 0.7 + 0.3 * Math.sin(time * 9 + x * 3 + y * 7) + 0.1 * Math.random();
          ctx.fillStyle = '#5a4028';
          ctx.fillRect(px + TILE / 2 - 2, py + TILE / 2, 4, 12);
          const grd = ctx.createRadialGradient(px + TILE / 2, py + TILE / 2, 1, px + TILE / 2, py + TILE / 2, 16 * fl);
          grd.addColorStop(0, 'rgba(255,190,80,0.9)');
          grd.addColorStop(1, 'rgba(255,120,20,0)');
          ctx.fillStyle = grd;
          ctx.fillRect(px - 8, py - 8, TILE + 16, TILE + 16);
          ctx.fillStyle = `rgba(255,${160 + fl * 60 | 0},60,1)`;
          ctx.beginPath(); ctx.arc(px + TILE / 2, py + TILE / 2 - 2, 4 * fl + 2, 0, 7); ctx.fill();
        }
      }
      if (!vis) { ctx.fillStyle = 'rgba(5,4,12,0.62)'; ctx.fillRect(px, py, TILE, TILE); }
    }
  }

  // stairs
  if (explored[stairs.y] && explored[stairs.y][stairs.x]) {
    const px = stairs.x * TILE, py = stairs.y * TILE;
    ctx.fillStyle = '#0c0a14';
    ctx.fillRect(px + 4, py + 4, TILE - 8, TILE - 8);
    ctx.strokeStyle = '#ffd76a';
    ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) ctx.strokeRect(px + 6 + i * 5, py + 6 + i * 5, TILE - 12 - i * 10, TILE - 12 - i * 10);
    const pulse = 0.5 + 0.5 * Math.sin(time * 4);
    ctx.fillStyle = `rgba(255,215,106,${0.15 + pulse * 0.2})`;
    ctx.fillRect(px, py, TILE, TILE);
  }

  // gold piles / potions / chests
  for (const g of goldPiles) if (visible[g.y][g.x]) {
    const px = g.x * TILE + TILE / 2, py = g.y * TILE + TILE / 2;
    ctx.fillStyle = '#ffd76a';
    for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(px - 6 + i * 4, py + 6 - (i % 2) * 4, 3.5, 0, 7); ctx.fill(); }
    ctx.strokeStyle = '#a5713c'; ctx.stroke();
  }
  for (const p of potionsOnFloor) if (visible[p.y][p.x]) {
    const px = p.x * TILE + TILE / 2, py = p.y * TILE + TILE / 2;
    ctx.fillStyle = '#ff5c8a';
    ctx.beginPath(); ctx.arc(px, py + 3, 7, 0, 7); ctx.fill();
    ctx.fillStyle = '#d8d8e8'; ctx.fillRect(px - 2, py - 9, 4, 7);
  }
  for (const c of chests) if (visible[c.y][c.x] || (c.opened && explored[c.y][c.x])) {
    const px = c.x * TILE + 6, py = c.y * TILE + 10;
    ctx.fillStyle = c.opened ? '#4a3520' : '#8a5c2c';
    ctx.fillRect(px, py, TILE - 12, TILE - 16);
    ctx.fillStyle = c.opened ? '#3a2a18' : '#a5713c';
    ctx.fillRect(px, py - 4, TILE - 12, 8);
    ctx.fillStyle = '#ffd76a';
    ctx.fillRect(px + (TILE - 12) / 2 - 2, py + 2, 4, 6);
  }
  // soul gems: pulsing cyan diamonds
  for (const s of soulGems) if (visible[s.y][s.x]) {
    const px = s.x * TILE + TILE / 2, py = s.y * TILE + TILE / 2;
    const pulse = 0.75 + 0.25 * Math.sin(time * 5 + s.x);
    const r = 8 * pulse;
    ctx.fillStyle = 'rgba(138,208,255,0.25)';
    ctx.beginPath(); ctx.arc(px, py, r + 6, 0, 7); ctx.fill();
    ctx.fillStyle = '#8ad0ff';
    ctx.beginPath();
    ctx.moveTo(px, py - r); ctx.lineTo(px + r * 0.7, py); ctx.lineTo(px, py + r); ctx.lineTo(px - r * 0.7, py);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#d8f0ff'; ctx.lineWidth = 1.5; ctx.stroke();
  }
  // altars: purple obelisk with flame
  for (const a of altars) if (visible[a.y][a.x] || (a.used && explored[a.y][a.x])) {
    const px = a.x * TILE + TILE / 2, py = a.y * TILE + TILE / 2;
    ctx.fillStyle = a.used ? '#4a3a5a' : '#6a4a9a';
    ctx.fillRect(px - 8, py - 4, 16, 16);
    ctx.fillRect(px - 11, py + 8, 22, 5);
    if (!a.used) {
      const fl = 0.7 + 0.3 * Math.sin(time * 7 + a.x);
      const grd2 = ctx.createRadialGradient(px, py - 10, 1, px, py - 10, 14 * fl);
      grd2.addColorStop(0, 'rgba(200,90,255,0.9)');
      grd2.addColorStop(1, 'rgba(120,40,200,0)');
      ctx.fillStyle = grd2;
      ctx.fillRect(px - 16, py - 26, 32, 32);
      ctx.fillStyle = '#c88aff';
      ctx.beginPath(); ctx.arc(px, py - 10, 4 * fl + 1.5, 0, 7); ctx.fill();
    }
  }

  // monsters
  for (const m of monsters) {
    if (!visible[m.y][m.x]) continue;
    const t = MONSTER_TYPES[m.type];
    m.bump = Math.max(0, m.bump - dt * 6);
    const px = m.x * TILE + TILE / 2 - m.bumpDx * m.bump * 10;
    const py = m.y * TILE + TILE / 2 - m.bumpDy * m.bump * 10;
    const r = t.size * TILE;
    const bob = Math.sin(time * 5 + m.x * 2) * 2;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.ellipse(px, py + r * 0.8, r * 0.8, r * 0.35, 0, 0, 7); ctx.fill();
    ctx.fillStyle = t.color;
    ctx.beginPath(); ctx.arc(px, py + bob - 2, r, 0, 7); ctx.fill();
    if (m.boss) { ctx.strokeStyle = '#ffd76a'; ctx.lineWidth = 3; ctx.stroke(); }
    // eyes
    ctx.fillStyle = m.boss ? '#fff05c' : '#1a0a0a';
    ctx.beginPath(); ctx.arc(px - r * 0.35, py + bob - r * 0.2, r * 0.15, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(px + r * 0.35, py + bob - r * 0.2, r * 0.15, 0, 7); ctx.fill();
    // hp bar
    if (m.hp < m.maxHp) {
      ctx.fillStyle = '#20101a'; ctx.fillRect(px - r, py - r - 8, r * 2, 4);
      ctx.fillStyle = '#e04c5a'; ctx.fillRect(px - r, py - r - 8, r * 2 * (m.hp / m.maxHp), 4);
    }
  }

  // hero
  {
    hero.bump = Math.max(0, hero.bump - dt * 6);
    const px = hero.x * TILE + TILE / 2 - hero.bumpDx * hero.bump * 12;
    const py = hero.y * TILE + TILE / 2 - hero.bumpDy * hero.bump * 12;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.ellipse(px, py + 12, 12, 5, 0, 0, 7); ctx.fill();
    // body (class tint)
    ctx.fillStyle = hero.tint || '#3a6ea8';
    ctx.beginPath(); ctx.arc(px, py, 12, 0, 7); ctx.fill();
    ctx.strokeStyle = ARMORS[hero.armor].color; ctx.lineWidth = 3; ctx.stroke();
    // head
    ctx.fillStyle = '#e8c49a';
    ctx.beginPath(); ctx.arc(px, py - 9, 7, 0, 7); ctx.fill();
    // weapon glint
    ctx.strokeStyle = WEAPONS[hero.weapon].color;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(px + 9, py + 2); ctx.lineTo(px + 17, py - 10); ctx.stroke();
  }

  // particles & floaters (world space)
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt; if (p.life <= 0) { particles.splice(i, 1); continue; }
    p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 200 * dt;
    ctx.globalAlpha = Math.min(1, p.life * 2);
    ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill();
  }
  ctx.globalAlpha = 1;
  for (let i = floaters.length - 1; i >= 0; i--) {
    const f = floaters[i];
    f.life -= dt; if (f.life <= 0) { floaters.splice(i, 1); continue; }
    f.y += f.vy * dt;
    ctx.globalAlpha = Math.min(1, f.life);
    ctx.font = 'bold 16px system-ui';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#000'; ctx.fillText(f.text, f.x + 1, f.y + 1);
    ctx.fillStyle = f.color; ctx.fillText(f.text, f.x, f.y);
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  drawHUD();
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

function drawHUD() {
  buttons = [];
  // top-left panel
  ctx.fillStyle = 'rgba(8,6,16,0.75)';
  ctx.fillRect(8, 8, 250, 96);
  drawBar(16, 16, 180, 16, hero.hp / hero.maxHp, '#e04c5a', '#301018', `HP ${Math.max(0, hero.hp)}/${hero.maxHp}`);
  drawBar(16, 36, 180, 12, hero.xp / xpNeeded(), '#7ad0ff', '#102030', `XP ${hero.xp}/${xpNeeded()}`);
  ctx.font = 'bold 13px system-ui'; ctx.textAlign = 'left'; ctx.fillStyle = '#cfc9b8';
  ctx.fillText(`LVL ${hero.lvl}  ATK ${heroAtk()}  DEF ${heroDef()}`, 16, 66);
  ctx.fillStyle = '#ffd76a';
  ctx.fillText(`Gold ${gold}   Depth ${depth}`, 16, 84);
  ctx.fillStyle = '#8ad0ff';
  ctx.fillText(`♦ ${runSouls}`, 200, 84);
  ctx.fillStyle = WEAPONS[hero.weapon].color;
  ctx.fillText(WEAPONS[hero.weapon].name, 16, 100);
  ctx.fillStyle = ARMORS[hero.armor].color;
  ctx.fillText(ARMORS[hero.armor].name, 130, 100);

  // score / best top center
  ctx.font = 'bold 16px system-ui'; ctx.textAlign = 'center';
  ctx.fillStyle = '#fff'; ctx.fillText(`SCORE ${score}`, GAME_W / 2, 26);
  ctx.font = '12px system-ui'; ctx.fillStyle = '#8f889c';
  ctx.fillText(`BEST ${best}`, GAME_W / 2, 42);

  // potion button bottom-left
  const pb = { x: 14, y: GAME_H - 66, w: 120, h: 52, id: 'potion' };
  buttons.push(pb);
  ctx.fillStyle = hero.potions > 0 ? 'rgba(255,92,138,0.25)' : 'rgba(60,50,60,0.4)';
  ctx.fillRect(pb.x, pb.y, pb.w, pb.h);
  ctx.strokeStyle = '#ff5c8a'; ctx.strokeRect(pb.x + 0.5, pb.y + 0.5, pb.w - 1, pb.h - 1);
  ctx.fillStyle = '#ff5c8a';
  ctx.beginPath(); ctx.arc(pb.x + 24, pb.y + 30, 9, 0, 7); ctx.fill();
  ctx.fillStyle = '#d8d8e8'; ctx.fillRect(pb.x + 21, pb.y + 14, 6, 9);
  ctx.font = 'bold 15px system-ui'; ctx.textAlign = 'left'; ctx.fillStyle = '#fff';
  ctx.fillText(`x ${hero.potions}  (Q)`, pb.x + 42, pb.y + 32);

  // minimap top-right
  const mmW = 132, mmH = 102, mx = GAME_W - mmW - 10, my = 10;
  ctx.fillStyle = 'rgba(8,6,16,0.8)'; ctx.fillRect(mx, my, mmW, mmH);
  ctx.strokeStyle = 'rgba(255,255,255,0.2)'; ctx.strokeRect(mx + 0.5, my + 0.5, mmW - 1, mmH - 1);
  const msx = mmW / MAP_W, msy = mmH / MAP_H;
  for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
    if (!explored[y][x] || map[y][x] !== 0) continue;
    ctx.fillStyle = visible[y][x] ? '#5a5470' : '#2c2838';
    ctx.fillRect(mx + x * msx, my + y * msy, Math.ceil(msx), Math.ceil(msy));
  }
  if (explored[stairs.y][stairs.x]) { ctx.fillStyle = '#ffd76a'; ctx.fillRect(mx + stairs.x * msx - 1, my + stairs.y * msy - 1, 4, 4); }
  ctx.fillStyle = '#5cc8ff'; ctx.fillRect(mx + hero.x * msx - 1, my + hero.y * msy - 1, 4, 4);
  for (const m of monsters) if (visible[m.y][m.x]) { ctx.fillStyle = '#e04c5a'; ctx.fillRect(mx + m.x * msx, my + m.y * msy, 3, 3); }

  // message log bottom center
  ctx.textAlign = 'center'; ctx.font = 'bold 14px system-ui';
  msgLog.forEach((m, i) => {
    m.life -= 1 / 60;
    ctx.globalAlpha = Math.max(0, Math.min(1, m.life));
    ctx.fillStyle = '#000'; ctx.fillText(m.t, GAME_W / 2 + 1, GAME_H - 70 + i * 18 + 1);
    ctx.fillStyle = m.color; ctx.fillText(m.t, GAME_W / 2, GAME_H - 70 + i * 18);
  });
  ctx.globalAlpha = 1;
}

function drawMenu() {
  // animated dungeon backdrop
  for (let i = 0; i < 40; i++) {
    const x = (i * 137 + time * 12) % (GAME_W + 40) - 20;
    const y = (i * 89) % GAME_H;
    const fl = 0.5 + 0.5 * Math.sin(time * 3 + i);
    ctx.fillStyle = `rgba(255,${140 + fl * 60 | 0},50,${0.04 + fl * 0.05})`;
    ctx.beginPath(); ctx.arc(x, y, 14 + fl * 8, 0, 7); ctx.fill();
  }
  ctx.textAlign = 'center';
  ctx.font = 'bold 64px Georgia, serif';
  const grd = ctx.createLinearGradient(0, 140, 0, 220);
  grd.addColorStop(0, '#ffd76a'); grd.addColorStop(1, '#c07830');
  ctx.fillStyle = '#000'; ctx.fillText('RUNIC DEPTHS', GAME_W / 2 + 3, 183);
  ctx.fillStyle = grd; ctx.fillText('RUNIC DEPTHS', GAME_W / 2, 180);
  ctx.font = '20px system-ui'; ctx.fillStyle = '#9f96b8';
  ctx.fillText('Turn-based dungeon crawler — loot, level up, descend', GAME_W / 2, 220);

  // class + souls line
  const cls = CLASSES[meta.selectedClass] || CLASSES.knight;
  ctx.font = 'bold 17px system-ui'; ctx.fillStyle = '#8ad0ff';
  ctx.fillText(`♦ ${meta.souls} souls`, GAME_W / 2 - 150, 262);
  ctx.fillStyle = cls.tint;
  ctx.fillText(`Class: ${cls.name}`, GAME_W / 2 + 60, 262);
  if (meta.bestDepth > 0) {
    ctx.fillStyle = '#ffd76a'; ctx.font = '15px system-ui';
    ctx.fillText(`Deepest: ${meta.bestDepth}`, GAME_W / 2 + 240, 262);
  }
  if (dailyBonus > 0) {
    const fl = 0.6 + 0.4 * Math.sin(time * 5);
    ctx.font = 'bold 16px system-ui';
    ctx.fillStyle = `rgba(138,208,255,${fl})`;
    ctx.fillText(`DAILY BONUS +${dailyBonus} ♦ — day ${meta.streak.count} streak!`, GAME_W / 2, 292);
  }

  const bw = 240, bh = 64, bx = GAME_W / 2 - bw / 2, by = 320;
  buttons = [{ x: bx, y: by, w: bw, h: bh, id: 'play' }];
  const pulse = 0.85 + 0.15 * Math.sin(time * 4);
  ctx.fillStyle = `rgba(90,200,120,${pulse})`;
  ctx.fillRect(bx, by, bw, bh);
  ctx.strokeStyle = '#d0ffdd'; ctx.lineWidth = 2; ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
  ctx.font = 'bold 30px system-ui'; ctx.fillStyle = '#08140c';
  ctx.fillText('PLAY', GAME_W / 2, by + 42);

  // shop + bestiary buttons
  const sw = 210, sh = 52;
  const shopB = { x: GAME_W / 2 - sw - 12, y: by + 84, w: sw, h: sh, id: 'shop' };
  const bestB = { x: GAME_W / 2 + 12, y: by + 84, w: sw, h: sh, id: 'bestiary' };
  buttons.push(shopB, bestB);
  ctx.fillStyle = 'rgba(138,208,255,0.18)';
  ctx.fillRect(shopB.x, shopB.y, shopB.w, shopB.h);
  ctx.strokeStyle = '#8ad0ff'; ctx.strokeRect(shopB.x + 0.5, shopB.y + 0.5, shopB.w - 1, shopB.h - 1);
  ctx.font = 'bold 20px system-ui'; ctx.fillStyle = '#8ad0ff';
  ctx.fillText('♦ SOUL SHOP', shopB.x + sw / 2, shopB.y + 33);
  ctx.fillStyle = 'rgba(200,138,255,0.15)';
  ctx.fillRect(bestB.x, bestB.y, bestB.w, bestB.h);
  ctx.strokeStyle = '#c88aff'; ctx.strokeRect(bestB.x + 0.5, bestB.y + 0.5, bestB.w - 1, bestB.h - 1);
  ctx.fillStyle = '#c88aff';
  ctx.fillText('BESTIARY', bestB.x + sw / 2, bestB.y + 33);

  ctx.font = '15px system-ui'; ctx.fillStyle = '#8f889c';
  ctx.fillText('WASD / arrows / tap to move · walk into monsters to attack · Q = potion', GAME_W / 2, 520);
  if (best > 0) { ctx.fillStyle = '#ffd76a'; ctx.fillText(`Best score: ${best}`, GAME_W / 2, 548); }
}

function drawShop() {
  ctx.textAlign = 'center';
  ctx.font = 'bold 40px Georgia, serif'; ctx.fillStyle = '#8ad0ff';
  ctx.fillText('SOUL SHOP', GAME_W / 2, 62);
  ctx.font = 'bold 20px system-ui';
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
      ctx.fillStyle = maxed ? 'rgba(60,80,60,0.5)' : affordable ? 'rgba(138,208,255,0.14)' : 'rgba(40,36,60,0.7)';
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = maxed ? '#6a9a6a' : affordable ? '#8ad0ff' : '#444';
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
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
      ctx.fillStyle = selected ? 'rgba(90,200,120,0.2)' : owned ? 'rgba(138,208,255,0.1)' : affordable ? 'rgba(200,138,255,0.12)' : 'rgba(40,36,60,0.7)';
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = selected ? '#5ac878' : owned ? '#8ad0ff' : affordable ? '#c88aff' : '#444';
      ctx.lineWidth = selected ? 3 : 1;
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      ctx.lineWidth = 1;
      // class avatar
      ctx.fillStyle = c.tint;
      ctx.beginPath(); ctx.arc(x + 48, y + 48, 22, 0, 7); ctx.fill();
      ctx.fillStyle = '#e8c49a';
      ctx.beginPath(); ctx.arc(x + 48, y + 32, 12, 0, 7); ctx.fill();
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
  ctx.fillStyle = 'rgba(90,200,120,0.85)';
  ctx.fillRect(bb.x, bb.y, bb.w, bb.h);
  ctx.font = 'bold 20px system-ui'; ctx.fillStyle = '#08140c';
  ctx.fillText('BACK', GAME_W / 2, bb.y + 33);
}

function drawBestiary() {
  ctx.textAlign = 'center';
  ctx.font = 'bold 40px Georgia, serif'; ctx.fillStyle = '#c88aff';
  ctx.fillText('BESTIARY', GAME_W / 2, 62);
  ctx.font = '16px system-ui'; ctx.fillStyle = '#9f96b8';
  ctx.fillText(`Deepest depth: ${meta.bestDepth}   ·   Runs: ${meta.totalRuns}   ·   Total kills: ${meta.totalKills}`, GAME_W / 2, 96);
  buttons = [];
  const ids = Object.keys(MONSTER_TYPES);
  ids.forEach((id, i) => {
    const t = MONSTER_TYPES[id];
    const kills = meta.bestiary[id] || 0;
    const known = kills > 0;
    const col = i % 2, row = (i / 2) | 0;
    const x = GAME_W / 2 - 330 + col * 340, y = 124 + row * 102, w = 320, h = 92;
    ctx.fillStyle = known ? 'rgba(30,26,48,0.9)' : 'rgba(20,18,30,0.9)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = known ? t.color : '#333';
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    // portrait
    ctx.fillStyle = known ? t.color : '#2a2638';
    ctx.beginPath(); ctx.arc(x + 44, y + 46, t.size * 60, 0, 7); ctx.fill();
    if (known) {
      ctx.fillStyle = '#1a0a0a';
      ctx.beginPath(); ctx.arc(x + 38, y + 40, 3, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(x + 50, y + 40, 3, 0, 7); ctx.fill();
    } else {
      ctx.font = 'bold 26px system-ui'; ctx.fillStyle = '#555';
      ctx.fillText('?', x + 44, y + 55);
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
  ctx.fillStyle = 'rgba(90,200,120,0.85)';
  ctx.fillRect(bb.x, bb.y, bb.w, bb.h);
  ctx.font = 'bold 20px system-ui'; ctx.fillStyle = '#08140c';
  ctx.fillText('BACK', GAME_W / 2, bb.y + 33);
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
  ctx.font = 'bold 40px Georgia, serif'; ctx.fillStyle = '#ffd76a';
  ctx.fillText(`LEVEL ${hero.lvl}!`, GAME_W / 2, 140);
  ctx.font = '18px system-ui'; ctx.fillStyle = '#cfc9b8';
  ctx.fillText('Choose an upgrade (or press 1 / 2 / 3)', GAME_W / 2, 175);
  buttons = [];
  const cw = 210, chh = 220, gap = 40;
  const total = cw * 3 + gap * 2, x0 = GAME_W / 2 - total / 2;
  levelCards.forEach((c, i) => {
    const x = x0 + i * (cw + gap), y = 220;
    buttons.push({ x, y, w: cw, h: chh, id: 'card' + i });
    ctx.fillStyle = 'rgba(20,16,34,0.95)';
    ctx.fillRect(x, y, cw, chh);
    ctx.strokeStyle = c.color; ctx.lineWidth = 3; ctx.strokeRect(x + 1.5, y + 1.5, cw - 3, chh - 3);
    ctx.fillStyle = c.color;
    ctx.beginPath(); ctx.arc(x + cw / 2, y + 70, 34, 0, 7); ctx.fill();
    ctx.fillStyle = '#0a0810'; ctx.font = 'bold 30px system-ui';
    ctx.fillText(c.id === 'hp' ? '♥' : c.id === 'atk' ? '⚔' : '⛨', x + cw / 2, y + 81);
    ctx.font = 'bold 22px system-ui'; ctx.fillStyle = '#fff';
    ctx.fillText(c.title, x + cw / 2, y + 145);
    ctx.font = '15px system-ui'; ctx.fillStyle = '#9f96b8';
    ctx.fillText(c.sub, x + cw / 2, y + 172);
    ctx.font = 'bold 14px system-ui'; ctx.fillStyle = c.color;
    ctx.fillText(`[${i + 1}]`, x + cw / 2, y + 202);
  });
}

function drawGameOver() {
  ctx.fillStyle = 'rgba(20,4,8,0.82)';
  ctx.fillRect(0, 0, GAME_W, GAME_H);
  ctx.textAlign = 'center';
  ctx.font = 'bold 52px Georgia, serif'; ctx.fillStyle = '#e04c5a';
  ctx.fillText('YOU DIED', GAME_W / 2, 170);
  ctx.font = 'bold 26px system-ui'; ctx.fillStyle = '#fff';
  ctx.fillText(`Score: ${score}`, GAME_W / 2, 225);
  ctx.font = '18px system-ui'; ctx.fillStyle = '#ffd76a';
  ctx.fillText(`Depth ${depth} · Level ${hero.lvl} · ${gold} gold${score >= best ? '  —  NEW BEST!' : ''}`, GAME_W / 2, 258);
  ctx.font = 'bold 20px system-ui'; ctx.fillStyle = '#8ad0ff';
  ctx.fillText(`♦ +${runSouls} souls banked  (total ${meta.souls})`, GAME_W / 2, 292);
  buttons = [];
  let by = 320;
  if (runSouls > 0 && !soulsDoubled) {
    const bw = 320, bh = 52, bx = GAME_W / 2 - bw / 2;
    buttons.push({ x: bx, y: by, w: bw, h: bh, id: 'x2souls' });
    ctx.fillStyle = adBusy ? 'rgba(60,90,120,0.5)' : 'rgba(138,208,255,0.85)';
    ctx.fillRect(bx, by, bw, bh);
    ctx.strokeStyle = '#d8f0ff'; ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
    ctx.font = 'bold 20px system-ui'; ctx.fillStyle = '#04141f';
    ctx.fillText('▶ x2 SOULS (watch ad)', GAME_W / 2, by + 34);
    by += 68;
  }
  if (!resurrectUsed) {
    const bw = 320, bh = 52, bx = GAME_W / 2 - bw / 2;
    buttons.push({ x: bx, y: by, w: bw, h: bh, id: 'resurrect' });
    ctx.fillStyle = adBusy ? 'rgba(120,100,40,0.5)' : 'rgba(255,215,106,0.9)';
    ctx.fillRect(bx, by, bw, bh);
    ctx.strokeStyle = '#fff0c0'; ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
    ctx.font = 'bold 20px system-ui'; ctx.fillStyle = '#241a04';
    ctx.fillText('▶ RESURRECT (watch ad)', GAME_W / 2, by + 34);
    by += 68;
  }
  const bw = 320, bh = 56, bx = GAME_W / 2 - bw / 2;
  buttons.push({ x: bx, y: by, w: bw, h: bh, id: 'again' });
  ctx.fillStyle = adBusy ? 'rgba(50,100,60,0.5)' : 'rgba(90,200,120,0.9)';
  ctx.fillRect(bx, by, bw, bh);
  ctx.strokeStyle = '#d0ffdd'; ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
  ctx.font = 'bold 24px system-ui'; ctx.fillStyle = '#08140c';
  ctx.fillText('PLAY AGAIN', GAME_W / 2, by + 37);
  by += 72;
  // soul shop shortcut from death screen
  buttons.push({ x: GAME_W / 2 - 130, y: by, w: 260, h: 44, id: 'shop' });
  ctx.fillStyle = 'rgba(138,208,255,0.16)';
  ctx.fillRect(GAME_W / 2 - 130, by, 260, 44);
  ctx.strokeStyle = '#8ad0ff'; ctx.strokeRect(GAME_W / 2 - 129.5, by + 0.5, 259, 43);
  ctx.font = 'bold 17px system-ui'; ctx.fillStyle = '#8ad0ff';
  ctx.fillText('♦ SPEND SOULS', GAME_W / 2, by + 29);
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
        if (Math.abs(dx) <= 6 && Math.abs(dy) <= 6) near.push({ dx, dy, hp: m.hp });
      }
      // BFS next-step toward stairs
      let sd = { dx: 0, dy: 0 };
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
      };
    },
    move: (dx, dy) => tryMove(dx, dy),
    pickCard: (i) => { if (state === 'levelup') pickCard(levelCards[i]); },
    usePotion,
    startGame: () => { if (state === 'menu') startGame(); },
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
    grantSouls: (n) => { runSouls += n; },
  };
}

// ---------- boot ----------
let lastT = 0;
function loop(t) {
  const dt = Math.min(0.05, (t - lastT) / 1000 || 0.016);
  lastT = t;
  draw(dt);
  requestAnimationFrame(loop);
}

(async function boot() {
  await initSDK();
  loadingStart();
  best = loadBest();
  loadMeta();
  dailyBonus = checkDailyStreak();
  sfx.setMuted(getMuteSetting());
  onSettingsChange((s) => { if (s && typeof s.muteAudio === 'boolean') sfx.setMuted(s.muteAudio); });
  hero = { x: 0, y: 0 }; // placeholder before first run
  state = 'menu';
  loadingStop();
  requestAnimationFrame(loop);
})();
