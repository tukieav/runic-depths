import { CLASSES, CHAPTERS, ENEMIES, ITEMS, RARITIES } from './content.js';
export const SAVE_VERSION = 2;
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const finite = (n, f = 0) => (Number.isFinite(n) ? n : f);
let serial = 0;
const uid = () => ++serial;
export function generateDungeon(seed, floor = 1) {
  const random = rng(seed + floor * 7919),
    size = 41;
  const map = Array.from({ length: size }, () => Array(size).fill(1)),
    rooms = [];
  for (let gy = 0; gy < 3; gy++)
    for (let gx = 0; gx < 3; gx++) {
      const w = 8 + Math.floor(random() * 3),
        h = 8 + Math.floor(random() * 3),
        x = 2 + gx * 13 + Math.floor(random() * 2),
        y = 2 + gy * 13 + Math.floor(random() * 2);
      const r = { x, y, w, h, cx: x + Math.floor(w / 2), cy: y + Math.floor(h / 2) };
      rooms.push(r);
      for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) map[yy][xx] = 0;
    }
  // A connected snake with two additional loops: no isolated quest rooms.
  const order = [0, 1, 2, 5, 4, 3, 6, 7, 8];
  function corridor(a, b) {
    let x = a.cx,
      y = a.cy;
    while (x !== b.cx || y !== b.cy) {
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) map[y + j][x + i] = 0;
      if (x !== b.cx) x += Math.sign(b.cx - x);
      else y += Math.sign(b.cy - y);
    }
  }
  for (let i = 1; i < order.length; i++) corridor(rooms[order[i - 1]], rooms[order[i]]);
  corridor(rooms[random() > 0.5 ? 1 : 2], rooms[random() > 0.5 ? 4 : 5]);
  corridor(rooms[random() > 0.5 ? 3 : 4], rooms[random() > 0.5 ? 6 : 7]);
  return { map, rooms, random };
}
export class Game {
  constructor({ seed = Date.now(), classId = 'warden', onEvent = () => {} } = {}) {
    this.onEvent = onEvent;
    this.seed = seed >>> 0;
    this.random = rng(this.seed);
    this.floor = 1;
    this.time = 0;
    this.mode = 'playing';
    this.settings = { reducedMotion: false };
    this.choices = {};
    this.lore = [];
    this.kills = {};
    this.totalKills = 0;
    this.deaths = 0;
    this.gold = 0;
    this.inventory = [];
    this.equipment = { weapon: null, armor: null, charm: null };
    this.talents = { might: 0, vitality: 0, focus: 0 };
    this.talentPoints = 0;
    this.completed = false;
    this.floorKills = 0;
    this.cooldowns = [0, 0, 0];
    this.potionCooldown = 0;
    this.dodgeCooldown = 0;
    this.potions = 5;
    this.effects = [];
    this.projectiles = [];
    this.loot = [];
    this.floaters = [];
    this.explored = [];
    this.input = { x: 0, y: 0, attack: false, target: null };
    this.moveTarget = null;
    this.attackTarget = null;
    this.flow = null;
    this.flowTimer = 0;
    const c = CLASSES.find((c) => c.id === classId) || CLASSES[0];
    this.class = c;
    this.hero = {
      x: 0,
      y: 0,
      facing: 0,
      hp: c.hp,
      maxHp: c.hp,
      mana: c.mana,
      maxMana: c.mana,
      damage: c.damage,
      speed: c.speed,
      range: c.range,
      classId: c.id,
      color: c.color,
      level: 1,
      xp: 0,
      nextXp: 70,
      attackTime: 0,
      dashTime: 0,
      attackCooldown: 0,
      invulnerable: 0,
    };
    this.makeFloor();
  }
  emit(type, data = {}) {
    this.onEvent({ type, ...data });
  }
  makeFloor() {
    this.chapter = CHAPTERS[Math.min(5, Math.floor((this.floor - 1) / 2))];
    const { map, rooms, random } = generateDungeon(this.seed, this.floor);
    this.map = map;
    this.rooms = rooms;
    this.random = random;
    this.hero.x = rooms[0].cx;
    this.hero.y = rooms[0].cy;
    this.hero.invulnerable = 2;
    this.hero.hp = Math.max(this.hero.hp, this.hero.maxHp * 0.6);
    this.hero.mana = this.hero.maxMana;
    this.explored = map.map((r) => r.map(() => false));
    this.enemies = [];
    this.objects = [];
    this.loot = [];
    this.effects = [];
    this.projectiles = [];
    this.floorKills = 0;
    this.flow = null;
    this.moveTarget = null;
    this.attackTarget = null;
    const start = rooms[0];
    this.objects.push({ id: uid(), type: 'npc', x: start.cx - 2, y: start.cy, used: false });
    this.objects.push({ id: uid(), type: 'waypoint', x: start.cx, y: start.cy - 2, used: false });
    for (let i = 1; i < rooms.length; i++) {
      const r = rooms[i];
      const n = 3 + Math.min(4, Math.floor(this.floor / 2));
      for (let k = 0; k < n; k++) {
        const type = this.chapter.enemies[Math.floor(random() * this.chapter.enemies.length)];
        this.spawnEnemy(type, r.x + 1 + random() * (r.w - 2), r.y + 1 + random() * (r.h - 2));
      }
      if (i % 2 === 1)
        this.objects.push({ id: uid(), type: 'chest', x: r.cx - 2, y: r.cy, used: false });
      if (i === 3 || i === 6)
        this.objects.push({ id: uid(), type: 'shrine', x: r.cx + 2, y: r.cy, used: false });
      if (i === 2 || i === 5 || i === 7)
        this.objects.push({
          id: uid(),
          type: 'lore',
          x: r.cx,
          y: r.cy - 2,
          used: false,
          loreIndex: i === 2 ? 0 : i === 5 ? 1 : 2,
        });
    }
    const end = rooms[8];
    if (this.floor % 2 === 0) this.spawnEnemy(this.chapter.boss, end.cx, end.cy, true);
    this.objects.push({ id: uid(), type: 'portal', x: end.cx, y: end.cy + 2, used: false });
    this.initialEnemies = this.enemies.length;
    this.requiredKills = Math.ceil(this.initialEnemies * 0.55);
    this.reveal();
    this.emit('floor', { floor: this.floor });
  }
  spawnEnemy(type, x, y, boss = false) {
    const t = ENEMIES[type];
    if (!t) return;
    const factor = 1 + (this.floor - 1) * 0.14;
    const hp = Math.round(t.hp * factor);
    this.enemies.push({
      id: uid(),
      summons: 0,
      windup: 0,
      chargeX: 0,
      chargeY: 0,
      chargeTime: 0,
      type,
      x,
      y,
      homeX: x,
      homeY: y,
      facing: 0,
      hp,
      maxHp: hp,
      damage: t.damage * (1 + (this.floor - 1) * 0.09),
      speed: t.speed,
      range: t.range,
      color: t.color,
      scale: t.scale || 1,
      shape: t.shape,
      behavior: t.behavior,
      xp: t.xp,
      boss: boss || !!t.boss,
      attackTime: 0,
      attackCooldown: 1 + this.random(),
      specialCooldown: 3,
      phase: 1,
      aggro: false,
      dead: false,
      slow: 0,
    });
  }
  walkable(x, y, r = 0.23) {
    for (const dx of [-r, r])
      for (const dy of [-r, r])
        if (this.map[Math.round(y + dy)]?.[Math.round(x + dx)] !== 0) return false;
    return true;
  }
  move(entity, dx, dy) {
    if (this.walkable(entity.x + dx, entity.y)) entity.x += dx;
    if (this.walkable(entity.x, entity.y + dy)) entity.y += dy;
  }
  lineOfSight(a, b) {
    const steps = Math.ceil(distance(a, b) * 8);
    for (let i = 1; i < steps; i++)
      if (!this.walkable(a.x + ((b.x - a.x) * i) / steps, a.y + ((b.y - a.y) * i) / steps, 0.08))
        return false;
    return true;
  }
  reveal() {
    const h = this.hero;
    for (let y = Math.max(0, Math.floor(h.y - 8)); y < Math.min(this.map.length, h.y + 8); y++)
      for (let x = Math.max(0, Math.floor(h.x - 8)); x < Math.min(this.map[0].length, h.x + 8); x++)
        if (Math.hypot(x - h.x, y - h.y) < 8) this.explored[y][x] = true;
  }
  updateFlow() {
    const sx = Math.round(this.hero.x),
      sy = Math.round(this.hero.y),
      W = this.map[0].length;
    this.flow = new Int16Array(W * this.map.length).fill(-1);
    this.flow[sy * W + sx] = 0;
    const queue = [[sx, sy]];
    for (let i = 0; i < queue.length; i++) {
      const [x, y] = queue[i];
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nx = x + dx,
          ny = y + dy,
          j = ny * W + nx;
        if (this.map[ny]?.[nx] === 0 && this.flow[j] === -1) {
          this.flow[j] = this.flow[y * W + x] + 1;
          queue.push([nx, ny]);
        }
      }
    }
  }
  pathDirection(entity, target) {
    if (this.lineOfSight(entity, target)) return { x: target.x - entity.x, y: target.y - entity.y };
    if (!this.flow) return { x: 0, y: 0 };
    const W = this.map[0].length,
      x = Math.round(entity.x),
      y = Math.round(entity.y);
    let best = this.flow[y * W + x],
      point = null;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const n = this.flow[(y + dy) * W + x + dx];
      if (n >= 0 && (best < 0 || n < best)) {
        best = n;
        point = { x: x + dx - entity.x, y: y + dy - entity.y };
      }
    }
    return point || { x: 0, y: 0 };
  }
  clickMove(point) {
    if (!point) return;
    const x = Math.round(point.x),
      y = Math.round(point.y);
    if (this.map[y]?.[x] !== 0) return;
    this.moveTarget = { x: point.x, y: point.y };
    this.movePath = this.findPath(this.hero, this.moveTarget);
    this.attackTarget = null;
  }
  findPath(a, b) {
    const ax = Math.round(a.x),
      ay = Math.round(a.y),
      bx = Math.round(b.x),
      by = Math.round(b.y),
      W = this.map[0].length;
    const queue = [[ax, ay]],
      prev = new Map([[ay * W + ax, null]]);
    for (let i = 0; i < queue.length; i++) {
      const [x, y] = queue[i];
      if (x === bx && y === by) break;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nx = x + dx,
          ny = y + dy,
          key = ny * W + nx;
        if (this.map[ny]?.[nx] === 0 && !prev.has(key)) {
          prev.set(key, y * W + x);
          queue.push([nx, ny]);
        }
      }
    }
    let key = by * W + bx;
    if (!prev.has(key)) return [];
    const path = [];
    while (prev.get(key) !== null) {
      path.unshift({ x: key % W, y: Math.floor(key / W) });
      key = prev.get(key);
    }
    return path;
  }
  stats() {
    const h = this.hero,
      c = this.class;
    let dmg = c.damage + (h.level - 1) * 2 + this.talents.might * 3,
      armor = 0,
      hp = c.hp + (h.level - 1) * 9 + this.talents.vitality * 16,
      mana = c.mana + this.talents.focus * 12;
    for (const item of Object.values(this.equipment)) {
      if (!item) continue;
      dmg += item.damage || 0;
      armor += item.armor || 0;
      hp += item.health || 0;
    }
    h.damage = dmg;
    h.armor = armor;
    h.gearColor = this.equipment.armor?.color || h.color;
    h.weaponTier = this.equipment.weapon?.rarity || 0;
    h.maxHp = hp;
    h.maxMana = mana;
    h.hp = Math.min(h.hp, hp);
    h.mana = Math.min(h.mana, mana);
  }
  effect(x, y, color, radius = 1, type = 'ring', life = 0.45) {
    this.effects.push({ id: uid(), x, y, color, radius, type, life, maxLife: life });
    if (this.effects.length > 100) this.effects.shift();
  }
  float(x, y, text, color = '#f6de9d') {
    this.floaters.push({ id: uid(), x, y, text, color, life: 1.1 });
    if (this.floaters.length > 40) this.floaters.shift();
  }
  hurtEnemy(e, damage, color = 0xeac178) {
    if (e.dead) return;
    const crit = this.random() < (this.class.id === 'ranger' ? 0.2 : 0.1);
    damage = Math.round(damage * (crit ? 1.6 : 1));
    e.hp -= damage;
    e.aggro = true;
    this.float(e.x, e.y, String(damage) + (crit ? '!' : ''), crit ? '#ffdc87' : '#fff1cf');
    this.effect(e.x, e.y, color, 0.4, 'hit', 0.2);
    if (e.hp <= 0) {
      e.dead = true;
      this.floorKills++;
      this.totalKills++;
      this.kills[e.type] = (this.kills[e.type] || 0) + 1;
      this.gainXp(e.xp);
      this.gold += Math.floor(3 + this.random() * 5 + this.floor);
      if (e.boss || this.random() < 0.16) this.dropItem(e.x, e.y, e.boss);
      if (this.random() < 0.12)
        this.loot.push({ id: uid(), type: 'potion', x: e.x, y: e.y, color: 0xde5761 });
      if (this.class.id === 'reaver')
        this.hero.hp = Math.min(this.hero.maxHp, this.hero.hp + 2 + this.floor * 0.15);
      this.emit('kill', { boss: e.boss });
      if (e.boss) {
        this.effect(e.x, e.y, 0xffc774, 4, 'nova', 1.2);
        this.emit('bossDefeated');
      }
    }
  }
  hurtHero(amount) {
    const h = this.hero;
    if (h.invulnerable > 0 || this.mode !== 'playing') return;
    const reduced = Math.max(1, amount - (h.armor || 0) * 0.6);
    h.hp = Math.max(0, h.hp - reduced);
    h.invulnerable = 0.32;
    this.float(h.x, h.y, '−' + Math.round(reduced), '#ff8585');
    this.emit('hurt');
    if (h.hp <= 0) {
      this.mode = 'dead';
      this.deaths++;
      this.emit('dead');
    }
  }
  gainXp(n) {
    const h = this.hero;
    h.xp += n;
    while (h.xp >= h.nextXp) {
      h.xp -= h.nextXp;
      h.level++;
      h.nextXp = Math.round(h.nextXp * 1.22);
      this.talentPoints++;
      this.stats();
      h.hp = h.maxHp;
      h.mana = h.maxMana;
      this.effect(h.x, h.y, 0xffd277, 2, 'nova', 1);
      this.emit('levelup');
    }
  }
  attack(point = null) {
    const h = this.hero;
    if (this.mode !== 'playing' || h.attackCooldown > 0) return false;
    let target = this.enemies
      .filter((e) => !e.dead && distance(e, h) <= h.range + 0.5 && this.lineOfSight(h, e))
      .sort((a, b) => distance(a, point || h) - distance(b, point || h))[0];
    if (point) h.facing = Math.atan2(point.x - h.x, point.y - h.y);
    if (target) h.facing = Math.atan2(target.x - h.x, target.y - h.y);
    h.attackCooldown = this.class.id === 'reaver' ? 0.42 : this.class.id === 'ranger' ? 0.39 : 0.52;
    h.attackTime = 0.28;
    if (h.range > 3) {
      const p = target ||
        point || { x: h.x + Math.sin(h.facing) * 5, y: h.y + Math.cos(h.facing) * 5 };
      this.shoot(h, p, h.damage, h.color, false, 12);
    } else {
      const enemies = this.enemies.filter(
        (e) => !e.dead && distance(h, e) < h.range + 0.45 && this.lineOfSight(h, e),
      );
      for (const e of enemies.slice(0, this.class.id === 'reaver' ? 3 : 2))
        this.hurtEnemy(e, h.damage, h.color);
      this.effect(
        h.x + Math.sin(h.facing) * 0.7,
        h.y + Math.cos(h.facing) * 0.7,
        h.color,
        1.1,
        'slash',
        0.22,
      );
    }
    this.emit('attack', { ranged: h.range > 3 });
    return true;
  }
  shoot(from, to, damage, color, enemy = false, speed = 8) {
    const dx = to.x - from.x,
      dy = to.y - from.y,
      d = Math.hypot(dx, dy) || 1;
    this.projectiles.push({
      id: uid(),
      x: from.x,
      y: from.y,
      vx: (dx / d) * speed,
      vy: (dy / d) * speed,
      damage,
      color,
      enemy,
      radius: enemy ? 0.18 : 0.15,
      life: 2,
    });
  }
  skill(index, point = null) {
    const s = this.class.skills[index],
      h = this.hero;
    if (!s || this.mode !== 'playing' || this.cooldowns[index] > 0 || h.mana < s.cost) return false;
    h.mana -= s.cost;
    this.cooldowns[index] = s.cooldown / (1 + this.talents.focus * 0.07);
    h.attackTime = 0.4;
    const power = h.damage * ((s.damage || this.class.damage * 1.8) / this.class.damage);
    if (point) h.facing = Math.atan2(point.x - h.x, point.y - h.y);
    if (s.kind === 'heal') {
      h.hp = Math.min(h.maxHp, h.hp + h.maxHp * 0.34);
      h.invulnerable = 1.5;
      this.effect(h.x, h.y, 0x83efbd, 3, 'heal', 1);
    } else if (s.kind === 'dash') {
      h.dashTime = 0.22;
      h.invulnerable = 0.5;
      for (let i = 0; i < 14; i++)
        this.move(h, Math.sin(h.facing) * 0.22, Math.cos(h.facing) * 0.22);
      for (const e of this.enemies)
        if (!e.dead && distance(e, h) < 2.5) this.hurtEnemy(e, power, s.color);
      this.effect(h.x, h.y, s.color, 2.5, 'nova', 0.5);
    } else if (s.kind === 'projectile') {
      const target = point ||
        this.enemies
          .filter((e) => !e.dead && distance(e, h) < 9)
          .sort((a, b) => distance(a, h) - distance(b, h))[0] || {
          x: h.x + Math.sin(h.facing) * 6,
          y: h.y + Math.cos(h.facing) * 6,
        };
      for (const offset of [-0.16, 0, 0.16]) {
        const angle = Math.atan2(target.x - h.x, target.y - h.y) + offset;
        this.shoot(
          h,
          { x: h.x + Math.sin(angle) * 8, y: h.y + Math.cos(angle) * 8 },
          power * 0.7,
          s.color,
          false,
          10,
        );
      }
    } else if (s.kind === 'totem') {
      this.effects.push({
        id: uid(),
        x: h.x,
        y: h.y,
        color: s.color,
        radius: 3,
        type: 'totem',
        life: 6,
        maxLife: 6,
        pulse: 0,
        damage: power * 0.36,
      });
    } else {
      const radius = s.kind === 'cleave' ? 2.9 : 4.2;
      for (const e of this.enemies)
        if (!e.dead && distance(e, h) < radius && this.lineOfSight(h, e)) {
          this.hurtEnemy(e, power, s.color);
          e.slow = 2;
        }
      this.effect(h.x, h.y, s.color, radius, s.kind === 'cleave' ? 'slash' : 'nova', 0.7);
    }
    this.emit('skill', { kind: s.kind });
    return true;
  }
  dodge(dx = 0, dy = 0) {
    const h = this.hero;
    if (this.mode !== 'playing' || this.dodgeCooldown > 0) return false;
    const d = Math.hypot(dx, dy);
    if (d) h.facing = Math.atan2(dx, dy);
    h.dashTime = 0.18;
    h.invulnerable = 0.5;
    this.dodgeCooldown = 2.6;
    this.moveTarget = null;
    this.emit('dodge');
    return true;
  }
  potion() {
    if (
      this.mode !== 'playing' ||
      this.potions <= 0 ||
      this.potionCooldown > 0 ||
      this.hero.hp >= this.hero.maxHp
    )
      return false;
    this.potions--;
    this.hero.hp = Math.min(this.hero.maxHp, this.hero.hp + this.hero.maxHp * 0.55);
    this.potionCooldown = 5;
    this.effect(this.hero.x, this.hero.y, 0x80e3b6, 1.6, 'heal', 0.8);
    this.emit('potion');
    return true;
  }
  dropItem(x, y, boss = false) {
    let rarity = 0;
    const roll = this.random();
    if (boss) rarity = roll > 0.8 ? 4 : 3;
    else rarity = roll > 0.98 ? 4 : roll > 0.88 ? 3 : roll > 0.58 ? 2 : roll > 0.23 ? 1 : 0;
    rarity = Math.min(rarity, RARITIES.length - 1);
    const slots = ['weapon', 'armor', 'charm'],
      slot = slots[Math.floor(this.random() * 3)];
    const weaponIds = {
      warden: 'lantern_blade',
      ranger: 'thorn_bow',
      arcanist: 'mirror_staff',
      reaver: 'cinder_axe',
      oracle: 'tide_focus',
    };
    const bases = ITEMS.filter(
      (i) => i.slot === slot && (slot !== 'weapon' || i.id === weaponIds[this.class.id]),
    );
    const base = bases[Math.floor(this.random() * bases.length)] || ITEMS[0];
    const power = Math.round((2 + this.floor + this.random() * 3) * (1 + rarity * 0.5));
    const item = {
      id: uid(),
      baseId: base.id,
      slot,
      rarity,
      level: this.floor,
      damage: slot === 'weapon' ? power : slot === 'charm' ? Math.ceil(power * 0.3) : 0,
      armor: slot === 'armor' ? Math.ceil(power * 0.55) : 0,
      health: slot === 'charm' ? power * 3 : slot === 'armor' ? power : 0,
      color: RARITIES[rarity].color,
      value: 8 + power * 3,
      forged: 0,
    };
    this.loot.push({ id: uid(), type: 'item', x, y, color: item.color, item });
    return item;
  }
  equip(id) {
    const i = this.inventory.findIndex((it) => it.id === id);
    if (i < 0) return false;
    const item = this.inventory.splice(i, 1)[0],
      old = this.equipment[item.slot];
    this.equipment[item.slot] = item;
    if (old) this.inventory.push(old);
    this.stats();
    this.emit('equip');
    return true;
  }
  salvage(id) {
    const i = this.inventory.findIndex((it) => it.id === id);
    if (i < 0) return false;
    this.gold += this.inventory[i].value;
    this.inventory.splice(i, 1);
    this.emit('save');
    return true;
  }
  forge(slot) {
    const item = this.equipment[slot];
    if (!item || item.forged >= 5) return false;
    const cost = 40 * (item.forged + 1);
    if (this.gold < cost) return false;
    this.gold -= cost;
    item.forged++;
    if (item.damage) item.damage += 2;
    if (item.armor) item.armor++;
    if (item.health) item.health += 5;
    this.stats();
    this.emit('forge');
    return true;
  }
  buyPotion() {
    if (this.gold < 25 || this.potions >= 15) return false;
    this.gold -= 25;
    this.potions++;
    this.emit('save');
    return true;
  }
  talent(id) {
    if (this.talentPoints <= 0 || !Object.hasOwn(this.talents, id) || this.talents[id] >= 10)
      return false;
    this.talentPoints--;
    this.talents[id]++;
    this.stats();
    this.emit('save');
    return true;
  }
  get portalOpen() {
    return this.floorKills >= this.requiredKills && !this.enemies.some((e) => e.boss && !e.dead);
  }
  get nearby() {
    return this.objects
      .filter((o) => !o.used && distance(o, this.hero) < 2.15)
      .sort((a, b) => distance(a, this.hero) - distance(b, this.hero))[0];
  }
  interact(id = null) {
    if (this.mode !== 'playing') return;
    const o = id
      ? this.objects.find((x) => x.id === id && !x.used && distance(x, this.hero) < 2.15)
      : this.nearby;
    if (!o) {
      this.emit('nothingNearby');
      return;
    }
    if (o.type === 'chest') {
      o.used = true;
      this.gold += 15 + this.floor * 5;
      this.dropItem(o.x, o.y, true);
      this.emit('chest');
      this.effect(o.x, o.y, 0xe6bd68, 1, 'nova', 0.7);
    } else if (o.type === 'shrine') {
      o.used = true;
      this.hero.hp = this.hero.maxHp;
      this.hero.mana = this.hero.maxMana;
      this.potions = Math.min(15, this.potions + 1);
      this.effect(o.x, o.y, 0x8cebc9, 2, 'heal', 1);
      this.emit('shrine');
    } else if (o.type === 'lore') {
      o.used = true;
      const key = `${this.chapter.id}:${o.loreIndex}`;
      if (!this.lore.includes(key)) this.lore.push(key);
      this.gainXp(20);
      if (this.lore.filter((k) => k.startsWith(this.chapter.id + ':')).length === 3) {
        this.gold += 100;
        this.gainXp(80);
        this.emit('memoryComplete');
      }
      this.emit('lore', { index: o.loreIndex });
    } else if (o.type === 'npc' || o.type === 'waypoint')
      this.emit(o.type === 'npc' ? 'dialogue' : 'camp');
    else if (o.type === 'portal') {
      if (!this.portalOpen) {
        this.emit('portalLocked');
        return;
      }
      if (this.floor === 12) {
        this.completed = true;
        this.mode = 'victory';
        this.emit('victory');
      } else this.emit('descend');
    }
  }
  descend() {
    if (!this.portalOpen || this.floor >= 12) return false;
    this.floor++;
    this.potions = Math.min(15, this.potions + 1);
    this.makeFloor();
    this.emit('save');
    return true;
  }
  revive() {
    this.mode = 'playing';
    this.gold = Math.floor(this.gold * 0.9);
    this.hero.hp = this.hero.maxHp;
    this.hero.mana = this.hero.maxMana;
    this.hero.x = this.rooms[0].cx;
    this.hero.y = this.rooms[0].cy;
    this.hero.invulnerable = 3;
    this.projectiles = [];
    this.moveTarget = null;
    for (const e of this.enemies) {
      e.aggro = false;
      if (distance(e, this.hero) < 8) {
        e.x = e.homeX;
        e.y = e.homeY;
      }
    }
    this.emit('revive');
  }
  warning(x, y, radius, damage, delay = 1) {
    if (this.walkable(x, y, 0.01))
      this.effects.push({
        id: uid(),
        x,
        y,
        color: 0xeb664f,
        type: 'warning',
        radius,
        life: delay,
        maxLife: delay,
        damage,
      });
  }
  bossAttack(e) {
    const h = this.hero;
    e.phase = e.hp < e.maxHp * 0.35 ? 3 : e.hp < e.maxHp * 0.7 ? 2 : 1;
    e.specialCooldown = 6 - e.phase * 0.6;
    const fan = (count, speed, offset = 0) => {
      for (let i = 0; i < count; i++) {
        if (i === Math.floor(this.time) % count) continue;
        const a = (i * Math.PI * 2) / count + offset;
        this.shoot(
          e,
          { x: e.x + Math.sin(a) * 8, y: e.y + Math.cos(a) * 8 },
          e.damage * 0.65,
          e.color,
          true,
          speed,
        );
      }
    };
    const summon = () => {
      if (this.enemies.filter((x) => !x.dead).length >= 85) return;
      for (const [dx, dy] of [
        [1.4, 0],
        [-1.4, 0],
      ])
        if (this.walkable(e.x + dx, e.y + dy))
          this.spawnEnemy(this.chapter.enemies[0], e.x + dx, e.y + dy);
    };
    if (e.type === 'bell_keeper') {
      // Three tolls with staggered warning windows; the outer positions leave gaps.
      this.warning(e.x, e.y, 2.6 + e.phase * 0.25, e.damage * 1.4, 0.95);
      if (e.phase > 1)
        for (let i = 0; i < 3; i++) {
          const a = (i * Math.PI * 2) / 3 + this.time;
          this.warning(e.x + Math.sin(a) * 3.5, e.y + Math.cos(a) * 3.5, 1.4, e.damage, 1.35);
        }
    } else if (e.type === 'root_matriarch') {
      summon();
      for (let i = 0; i < e.phase + 1; i++) {
        const a = (i * Math.PI * 2) / (e.phase + 1);
        this.warning(
          h.x + Math.sin(a) * 1.4,
          h.y + Math.cos(a) * 1.4,
          1.7,
          e.damage,
          1.2 + i * 0.13,
        );
      }
    } else if (e.type === 'glass_oracle') {
      fan(8 + e.phase * 2, 3.2, this.time * 0.3);
      this.warning(h.x, h.y, 1.8, e.damage, 1.1);
    } else if (e.type === 'iron_judge') {
      const dx = h.x - e.x,
        dy = h.y - e.y,
        d = Math.hypot(dx, dy) || 1;
      e.chargeX = dx / d;
      e.chargeY = dy / d;
      e.windup = 0.9;
      for (let i = 1; i <= 5; i++)
        this.warning(e.x + e.chargeX * i, e.y + e.chargeY * i, 0.85, e.damage, 0.95 + i * 0.07);
    } else if (e.type === 'drowned_king') {
      if (e.phase > 1) summon();
      for (let i = 0; i < 4; i++)
        this.warning(h.x + (i - 1.5) * 1.8, h.y, 1.1, e.damage, 1 + i * 0.17);
      fan(8, 2.6, this.time);
    } else {
      fan(10 + e.phase * 2, 3.4, this.time * 0.21);
      this.warning(h.x, h.y, 2.3, e.damage * 1.2, 1.1);
      if (e.phase === 3) {
        this.warning(h.x + 2.5, h.y, 1.5, e.damage, 1.45);
        this.warning(h.x - 2.5, h.y, 1.5, e.damage, 1.45);
      }
    }
    e.attackTime = 0.7;
    this.emit('bossAttack');
  }
  tick(dt) {
    if (this.mode !== 'playing') return;
    dt = clamp(dt, 0, 0.05);
    this.time += dt;
    const h = this.hero;
    h.attackTime = Math.max(0, h.attackTime - dt);
    h.invulnerable = Math.max(0, h.invulnerable - dt);
    h.attackCooldown = Math.max(0, h.attackCooldown - dt);
    h.mana = Math.min(h.maxMana, h.mana + dt * (5 + this.talents.focus));
    this.cooldowns = this.cooldowns.map((c) => Math.max(0, c - dt));
    this.potionCooldown = Math.max(0, this.potionCooldown - dt);
    this.dodgeCooldown = Math.max(0, this.dodgeCooldown - dt);
    let dx = this.input.x,
      dy = this.input.y;
    if (dx || dy) {
      this.moveTarget = null;
      this.attackTarget = null;
    } else if (this.attackTarget && !this.attackTarget.dead) {
      if (distance(h, this.attackTarget) <= h.range && this.lineOfSight(h, this.attackTarget)) {
        this.attack(this.attackTarget);
      } else {
        if (this.lineOfSight(h, this.attackTarget)) {
          dx = this.attackTarget.x - h.x;
          dy = this.attackTarget.y - h.y;
        } else {
          this.attackPathTimer = (this.attackPathTimer || 0) - dt;
          if (this.attackPathTimer <= 0 || !this.attackPath?.length) {
            this.attackPath = this.findPath(h, this.attackTarget);
            this.attackPathTimer = 0.4;
          }
          const p = this.attackPath?.[0] || this.attackTarget;
          dx = p.x - h.x;
          dy = p.y - h.y;
          if (Math.hypot(dx, dy) < 0.2) this.attackPath?.shift();
        }
      }
    } else if (this.moveTarget) {
      const p = this.movePath?.[0] || this.moveTarget;
      dx = p.x - h.x;
      dy = p.y - h.y;
      if (Math.hypot(dx, dy) < 0.18) {
        if (this.movePath?.length) this.movePath.shift();
        else this.moveTarget = null;
        dx = 0;
        dy = 0;
      }
    }
    h.moving = !!(dx || dy);
    if (h.dashTime > 0) {
      h.dashTime = Math.max(0, h.dashTime - dt);
      this.move(h, Math.sin(h.facing) * 15 * dt, Math.cos(h.facing) * 15 * dt);
    } else {
      const d = Math.hypot(dx, dy);
      if (d > 0.01) {
        h.facing = Math.atan2(dx, dy);
        this.move(h, (dx / d) * h.speed * dt, (dy / d) * h.speed * dt);
      }
    }
    if (this.input.attack) this.attack(this.input.target);
    this.flowTimer -= dt;
    if (this.flowTimer <= 0) {
      this.updateFlow();
      this.reveal();
      this.flowTimer = 0.35;
    }
    let combat = false;
    for (const e of this.enemies) {
      if (e.dead) continue;
      const d = distance(e, h);
      e.attackTime = Math.max(0, e.attackTime - dt);
      e.attackCooldown -= dt;
      e.specialCooldown -= dt;
      e.slow = Math.max(0, e.slow - dt);
      if (d < 8 && this.lineOfSight(e, h)) e.aggro = true;
      if (!e.aggro || d > 17) continue;
      combat = true;
      e.facing = Math.atan2(h.x - e.x, h.y - e.y);
      if (e.boss && e.specialCooldown <= 0) {
        this.bossAttack(e);
      }
      if (
        !e.boss &&
        e.behavior === 'summoner' &&
        e.specialCooldown <= 0 &&
        e.summons < 2 &&
        this.enemies.filter((x) => !x.dead).length < 85
      ) {
        e.specialCooldown = 12;
        e.summons++;
        const p = { x: e.x + 1, y: e.y };
        if (this.walkable(p.x, p.y)) {
          this.spawnEnemy(this.chapter.enemies[0], p.x, p.y);
          this.effect(p.x, p.y, e.color, 1, 'nova', 0.6);
        }
      }
      if (e.windup > 0) {
        e.windup = Math.max(0, e.windup - dt);
        if (e.windup === 0) e.chargeTime = 0.65;
        continue;
      }
      if (e.chargeTime > 0) {
        e.chargeTime = Math.max(0, e.chargeTime - dt);
        this.move(e, e.chargeX * 11 * dt, e.chargeY * 11 * dt);
        if (distance(e, h) < 1.4) this.hurtHero(e.damage * 1.5);
        if (e.chargeTime === 0) e.attackCooldown = 2;
        continue;
      }
      const ranged = e.behavior === 'ranged' || e.behavior === 'summoner';
      const range = ranged ? Math.min(8, e.range || 6) : 1.05 + (e.boss ? 0.55 : 0);
      if (d < range && this.lineOfSight(e, h)) {
        if (e.attackCooldown <= 0) {
          e.attackCooldown = e.boss ? 1.6 : ranged ? 2 : 1.25;
          e.attackTime = 0.45;
          if (ranged) this.shoot(e, h, e.damage, e.color, true, 4.5);
          else {
            this.effects.push({
              id: uid(),
              x: e.x + Math.sin(e.facing) * 0.7,
              y: e.y + Math.cos(e.facing) * 0.7,
              color: 0xe77d54,
              radius: e.boss ? 1.6 : 1,
              type: 'warning',
              life: e.boss ? 0.65 : 0.4,
              maxLife: e.boss ? 0.65 : 0.4,
              damage: e.damage,
            });
          }
        }
      } else {
        const v = this.pathDirection(e, h),
          len = Math.hypot(v.x, v.y) || 1;
        const speed =
          e.speed * (e.slow > 0 ? 0.45 : 1) * (e.behavior === 'charger' && d > 3 ? 1.4 : 1);
        this.move(e, (v.x / len) * speed * dt, (v.y / len) * speed * dt);
      }
      // Gentle separation prevents a single unreadable pile of enemies.
      for (const other of this.enemies) {
        if (other === e || other.dead || other.id > e.id) continue;
        const dd = distance(e, other);
        if (dd < 0.58 && dd > 0.01)
          this.move(e, ((e.x - other.x) / dd) * 0.5 * dt, ((e.y - other.y) / dd) * 0.5 * dt);
      }
    }
    this.combat = combat;
    for (const p of this.projectiles) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (!this.walkable(p.x, p.y, 0.06)) {
        p.life = 0;
        continue;
      }
      if (p.enemy) {
        if (distance(p, h) < 0.48) {
          this.hurtHero(p.damage);
          p.life = 0;
        }
      } else
        for (const e of this.enemies)
          if (!e.dead && distance(p, e) < (e.boss ? 0.8 : 0.48)) {
            this.hurtEnemy(e, p.damage, p.color);
            p.life = 0;
            break;
          }
    }
    this.projectiles = this.projectiles.filter((p) => p.life > 0);
    for (const e of this.effects) {
      e.life -= dt;
      if (e.type === 'warning' && e.life <= 0) {
        if (distance(h, e) < e.radius) this.hurtHero(e.damage);
        this.effect(e.x, e.y, 0xf08b59, e.radius, 'nova', 0.3);
      }
      if (e.type === 'totem') {
        e.pulse -= dt;
        if (e.pulse <= 0) {
          e.pulse = 0.7;
          for (const enemy of this.enemies)
            if (!enemy.dead && distance(e, enemy) < e.radius)
              this.hurtEnemy(enemy, e.damage, e.color);
          if (distance(e, h) < e.radius) h.hp = Math.min(h.maxHp, h.hp + 2);
        }
      }
    }
    this.effects = this.effects.filter((e) => e.life > 0);
    for (const f of this.floaters) f.life -= dt;
    this.floaters = this.floaters.filter((f) => f.life > 0);
    for (const item of this.loot) {
      if (item.taken || distance(item, h) > 1.3) continue;
      if (item.type === 'potion') {
        if (this.potions >= 15) continue;
        this.potions++;
      } else {
        if (this.inventory.length >= 24) continue;
        this.inventory.push(item.item);
      }
      item.taken = true;
      this.emit('loot', { rarity: item.item?.rarity || 0 });
    }
    this.loot = this.loot.filter((i) => !i.taken);
  }
  serialize() {
    return JSON.stringify({
      version: SAVE_VERSION,
      mode: this.mode,
      seed: this.seed,
      floor: this.floor,
      hero: this.hero,
      choices: this.choices,
      lore: this.lore,
      kills: this.kills,
      totalKills: this.totalKills,
      deaths: this.deaths,
      gold: this.gold,
      inventory: this.inventory,
      equipment: this.equipment,
      talents: this.talents,
      talentPoints: this.talentPoints,
      potions: this.potions,
      completed: this.completed,
      cooldowns: this.cooldowns,
      potionCooldown: this.potionCooldown,
      dodgeCooldown: this.dodgeCooldown,
      floorKills: this.floorKills,
      enemies: this.enemies,
      objects: this.objects,
      loot: this.loot,
      explored: this.explored,
      time: this.time,
    });
  }
  static restore(raw, onEvent = () => {}) {
    try {
      const s = JSON.parse(raw);
      if (
        s?.version !== SAVE_VERSION ||
        !CLASSES.some((c) => c.id === s.hero?.classId) ||
        !Number.isInteger(s.floor) ||
        s.floor < 1 ||
        s.floor > 12
      )
        return null;
      const game = new Game({
        seed: finite(s.seed, 1),
        classId: s.hero.classId,
        onEvent: () => {},
      });
      game.floor = s.floor;
      game.makeFloor();
      for (const key of ['choices', 'kills'])
        if (s[key] && typeof s[key] === 'object' && !Array.isArray(s[key])) game[key] = s[key];
      game.lore = Array.isArray(s.lore)
        ? s.lore.filter((x) => typeof x === 'string').slice(0, 24)
        : [];
      for (const key of ['totalKills', 'deaths', 'gold', 'talentPoints', 'time'])
        game[key] = clamp(finite(s[key]), 0, 1e8);
      game.talents = Object.fromEntries(
        ['might', 'vitality', 'focus'].map((k) => [
          k,
          clamp(Math.floor(finite(s.talents?.[k])), 0, 10),
        ]),
      );
      game.hero.level = clamp(Math.floor(finite(s.hero.level, 1)), 1, 100);
      game.hero.xp = clamp(finite(s.hero.xp), 0, 1e7);
      game.hero.nextXp = clamp(finite(s.hero.nextXp, 70), 70, 1e8);
      const itemOK = (i) =>
        i &&
        Number.isSafeInteger(i.id) &&
        i.id > 0 &&
        i.id < 1e9 &&
        ITEMS.some((b) => b.id === i.baseId && b.slot === i.slot) &&
        ['weapon', 'armor', 'charm'].includes(i.slot) &&
        Number.isInteger(i.rarity) &&
        i.rarity >= 0 &&
        i.rarity < RARITIES.length &&
        ['damage', 'armor', 'health', 'value', 'forged'].every(
          (k) => Number.isFinite(i[k]) && i[k] >= 0 && i[k] < 10000,
        );
      game.inventory = Array.isArray(s.inventory) ? s.inventory.filter(itemOK).slice(0, 24) : [];
      for (const slot of ['weapon', 'armor', 'charm'])
        game.equipment[slot] =
          itemOK(s.equipment?.[slot]) && s.equipment[slot].slot === slot ? s.equipment[slot] : null;
      game.stats();
      game.hero.hp = clamp(finite(s.hero.hp, game.hero.maxHp), 1, game.hero.maxHp);
      game.hero.mana = clamp(finite(s.hero.mana, game.hero.maxMana), 0, game.hero.maxMana);
      if (
        Number.isFinite(s.hero.x) &&
        Number.isFinite(s.hero.y) &&
        game.walkable(s.hero.x, s.hero.y)
      ) {
        game.hero.x = s.hero.x;
        game.hero.y = s.hero.y;
      }
      if (
        Array.isArray(s.enemies) &&
        s.enemies.length <= 100 &&
        s.enemies.every(
          (e) =>
            ENEMIES[e.type] &&
            [
              'id',
              'x',
              'y',
              'homeX',
              'homeY',
              'hp',
              'maxHp',
              'damage',
              'speed',
              'range',
              'xp',
              'attackCooldown',
              'specialCooldown',
              'attackTime',
              'phase',
              'slow',
              'facing',
            ].every((k) => Number.isFinite(e[k])) &&
            Number.isSafeInteger(e.id) &&
            e.id < 1e9 &&
            e.id > 0 &&
            e.hp <= e.maxHp &&
            e.maxHp > 0 &&
            e.maxHp < 1e6 &&
            e.damage >= 0 &&
            e.damage < 1000 &&
            e.speed >= 0 &&
            e.speed < 20 &&
            e.xp >= 0 &&
            e.xp < 10000 &&
            game.walkable(e.x, e.y, 0.01),
        )
      ) {
        game.enemies = s.enemies.map((e) => ({
          ...e,
          summons: clamp(finite(e.summons), 0, 2),
          windup: 0,
          chargeTime: 0,
          chargeX: 0,
          chargeY: 0,
        }));
        game.floorKills = clamp(Math.floor(finite(s.floorKills)), 0, 200);
      }
      if (Array.isArray(s.objects) && s.objects.length === game.objects.length)
        for (let i = 0; i < game.objects.length; i++) game.objects[i].used = !!s.objects[i].used;
      if (Array.isArray(s.explored) && s.explored.length === game.map.length)
        game.explored = s.explored.map((r, y) => game.map[y].map((_, x) => !!r?.[x]));
      if (Array.isArray(s.loot))
        game.loot = s.loot
          .filter(
            (l) =>
              Number.isSafeInteger(l?.id) &&
              l.id > 0 &&
              l.id < 1e9 &&
              Number.isFinite(l.x) &&
              Number.isFinite(l.y) &&
              game.walkable(l.x, l.y, 0.01) &&
              (l.type === 'potion' || itemOK(l.item)),
          )
          .slice(0, 100);
      game.cooldowns = game.class.skills.map((skill, i) =>
        clamp(finite(s.cooldowns?.[i]), 0, skill.cooldown),
      );
      game.potionCooldown = clamp(finite(s.potionCooldown), 0, 5);
      game.dodgeCooldown = clamp(finite(s.dodgeCooldown), 0, 2.6);
      game.potions = clamp(Math.floor(finite(s.potions, 3)), 0, 15);
      game.completed = !!s.completed;
      game.mode = game.completed ? 'victory' : s.mode === 'dead' ? 'dead' : 'playing';
      if (game.mode === 'dead') game.hero.hp = 0;
      serial = Math.max(
        serial,
        ...game.enemies.map((e) => e.id || 0),
        ...game.inventory.map((e) => e.id || 0),
        ...game.loot.flatMap((e) => [e.id || 0, e.item?.id || 0]),
        ...Object.values(game.equipment).map((e) => e?.id || 0),
      );
      game.onEvent = onEvent;
      return game;
    } catch {
      return null;
    }
  }
}
