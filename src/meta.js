// Runic Depths — persistent meta-progression (soul gems, upgrades, classes, bestiary, records, streak)
import { saveData, loadData } from './sdk.js';

export const CLASSES = {
  knight:   { name: 'Knight',   desc: 'Balanced adventurer',            hp: 40, atk: 4, def: 0, potions: 1, crit: 0,    heal: 30, tint: '#3a6ea8', cost: 0 },
  rogue:    { name: 'Rogue',    desc: '+ATK, 15% crit, less HP',        hp: 30, atk: 6, def: 0, potions: 1, crit: 0.15, heal: 30, tint: '#3aa86e', cost: 60 },
  runemage: { name: 'Runemage', desc: 'Potions heal 45, +1 potion',     hp: 34, atk: 4, def: 0, potions: 2, crit: 0,    heal: 45, tint: '#8a5cd8', cost: 120 },
};

export const UPGRADES = {
  hp:     { name: 'Vitality',  desc: '+6 Max HP',        max: 5, base: 20, mult: 1.7, per: 6 },
  atk:    { name: 'Might',     desc: '+1 Attack',        max: 5, base: 30, mult: 1.7, per: 1 },
  potion: { name: 'Alchemist', desc: '+1 start potion',  max: 2, base: 40, mult: 2.2, per: 1 },
  gold:   { name: 'Fortune',   desc: '+20% gold found',  max: 3, base: 25, mult: 1.8, per: 0.2 },
};

export const BESTIARY_INFO = {
  goblin:   'Weak but numerous. Rushes the hero.',
  bat:      'Erratic flier. Fragile, hard to predict.',
  skeleton: 'Sturdy undead soldier.',
  cultist:  'Hurls dark bolts from range. Close in fast!',
  ogre:     'Slow, hits like a truck.',
  wraith:   'Drifts through solid walls. Fear the deep.',
  boss:     'Depth Lord — guardian of every 3rd floor.',
};

const KEY = 'runicdepths.meta';

export let meta = defaultMeta();

function defaultMeta() {
  return {
    souls: 0,
    upgrades: { hp: 0, atk: 0, potion: 0, gold: 0 },
    classes: ['knight'],
    selectedClass: 'knight',
    bestiary: {},          // type -> kill count
    bestDepth: 0,
    totalRuns: 0,
    totalKills: 0,
    streak: { last: '', count: 0 },
  };
}

export function loadMeta() {
  const raw = loadData(KEY);
  if (raw) {
    try {
      const m = JSON.parse(raw);
      meta = Object.assign(defaultMeta(), m);
      meta.upgrades = Object.assign(defaultMeta().upgrades, m.upgrades || {});
      meta.streak = Object.assign(defaultMeta().streak, m.streak || {});
      if (!meta.classes.includes('knight')) meta.classes.push('knight');
      if (!meta.classes.includes(meta.selectedClass)) meta.selectedClass = 'knight';
    } catch (e) { meta = defaultMeta(); }
  }
  return meta;
}

export function saveMeta() {
  try { saveData(KEY, JSON.stringify(meta)); } catch (e) {}
}

export function upgradeCost(id) {
  const u = UPGRADES[id];
  const lvl = meta.upgrades[id] || 0;
  return Math.round(u.base * Math.pow(u.mult, lvl));
}

export function canBuyUpgrade(id) {
  return (meta.upgrades[id] || 0) < UPGRADES[id].max && meta.souls >= upgradeCost(id);
}

export function buyUpgrade(id) {
  if (!canBuyUpgrade(id)) return false;
  meta.souls -= upgradeCost(id);
  meta.upgrades[id] = (meta.upgrades[id] || 0) + 1;
  saveMeta();
  return true;
}

export function canBuyClass(id) {
  return !meta.classes.includes(id) && meta.souls >= CLASSES[id].cost;
}

export function buyClass(id) {
  if (!canBuyClass(id)) return false;
  meta.souls -= CLASSES[id].cost;
  meta.classes.push(id);
  meta.selectedClass = id;
  saveMeta();
  return true;
}

export function selectClass(id) {
  if (!meta.classes.includes(id)) return false;
  meta.selectedClass = id;
  saveMeta();
  return true;
}

export function addSouls(n) { meta.souls += n; saveMeta(); }

export function recordKill(type) {
  meta.bestiary[type] = (meta.bestiary[type] || 0) + 1;
  meta.totalKills++;
}

export function recordRun(depth) {
  meta.totalRuns++;
  if (depth > meta.bestDepth) { meta.bestDepth = depth; saveMeta(); return true; }
  saveMeta();
  return false;
}

// Daily streak: returns souls bonus granted today (0 if already claimed)
export function checkDailyStreak() {
  const today = new Date().toISOString().slice(0, 10);
  if (meta.streak.last === today) return 0;
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  meta.streak.count = meta.streak.last === yesterday ? meta.streak.count + 1 : 1;
  meta.streak.last = today;
  const bonus = 5 + 5 * Math.min(5, meta.streak.count - 1);
  meta.souls += bonus;
  saveMeta();
  return bonus;
}

// Starting hero stats for the selected class + permanent upgrades
export function startingHero() {
  const c = CLASSES[meta.selectedClass] || CLASSES.knight;
  return {
    maxHp: c.hp + (meta.upgrades.hp || 0) * UPGRADES.hp.per,
    baseAtk: c.atk + (meta.upgrades.atk || 0) * UPGRADES.atk.per,
    baseDef: c.def,
    potions: c.potions + (meta.upgrades.potion || 0),
    crit: c.crit,
    heal: c.heal,
    tint: c.tint,
  };
}

export function goldMult() { return 1 + (meta.upgrades.gold || 0) * UPGRADES.gold.per; }
