import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, generateDungeon, distance } from '../src/engine.js';
import { CLASSES, CHAPTERS, ENEMIES, ITEMS, resolveEnding } from '../src/content.js';

const advance = (game, seconds, hz = 60) => { for (let i = 0; i < Math.round(seconds * hz); i++) game.tick(1 / hz); };
function arena(classId = 'warden') {
  const game = new Game({ seed: 42, classId });
  game.enemies = []; game.objects = []; game.hero.invulnerable = 0;
  return game;
}
function target(game, dx = 1) {
  game.spawnEnemy('hollow_guard', game.hero.x + dx, game.hero.y);
  const enemy = game.enemies.at(-1);
  assert.ok(enemy, 'test target is real campaign enemy');
  enemy.hp = enemy.maxHp = 10000; enemy.speed = 0; enemy.attackCooldown = 100;
  return enemy;
}

test('all walkable tiles, spawn rooms and exits are connected for 100 seeds × 12 floors', () => {
  for (let seed = 0; seed < 100; seed++) for (let floor = 1; floor <= 12; floor++) {
    const { map, rooms } = generateDungeon(seed * 104729, floor);
    const first = rooms[0], seen = new Set([`${first.cx},${first.cy}`]), queue = [[first.cx, first.cy]];
    for (let i = 0; i < queue.length; i++) {
      const [x, y] = queue[i];
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy, key = `${nx},${ny}`;
        if (map[ny]?.[nx] === 0 && !seen.has(key)) { seen.add(key); queue.push([nx, ny]); }
      }
    }
    assert.equal(seen.size, map.flat().filter(x => x === 0).length, `seed ${seed} floor ${floor}`);
    for (const room of rooms) assert.ok(seen.has(`${room.cx},${room.cy}`));
    assert.ok(map[0].every(x => x === 1) && map.at(-1).every(x => x === 1));
  }
});

test('dungeon seed is deterministic and different seeds vary rooms', () => {
  assert.deepEqual(generateDungeon(913, 7).map, generateDungeon(913, 7).map);
  assert.notDeepEqual(generateDungeon(913, 7).map, generateDungeon(914, 7).map);
});

test('click movement follows a real route around walls to the distant portal room', () => {
  for (const classId of CLASSES.map(c => c.id)) {
    const game = arena(classId), end = game.rooms[8];
    game.clickMove({ x: end.cx, y: end.cy });
    assert.ok(game.movePath.length > 20);
    for (let i = 0; i < 6000 && game.moveTarget; i++) { game.tick(1 / 60); assert.ok(game.walkable(game.hero.x, game.hero.y)); }
    assert.ok(distance(game.hero, { x: end.cx, y: end.cy }) < .3, `${classId} reaches distant room`);
  }
});

test('clicking a ranged target behind a wall paths to a clear firing position', () => {
  const game = arena('ranger'), enemy = target(game, 3);
  game.map[Math.round(game.hero.y)][Math.round(game.hero.x + 1)] = 1;
  assert.equal(game.lineOfSight(game.hero, enemy), false);
  game.attackTarget = enemy;
  advance(game, 3);
  assert.ok(enemy.hp < enemy.maxHp, 'ranged target acquisition must move around blocking wall before firing');
});

test('line-of-sight sampling rejects the blocked corridor corner found in combat soak', () => {
  const game = new Game({ seed: 84621, classId: 'oracle' }); game.floor = 5; game.makeFloor();
  game.hero.x = 19.000000068557267; game.hero.y = 12.039231735368531;
  const point = { x: 18.09616761095822, y: 16.845470998436213 };
  assert.ok(game.walkable(game.hero.x, game.hero.y)); assert.ok(game.walkable(point.x, point.y));
  assert.equal(game.lineOfSight(game.hero, point), false, 'line of sight must account for projectile clearance around corners');
});

test('five distinct bilingual classes, six chapters, 24 regular enemies and six bosses', () => {
  assert.equal(CLASSES.length, 5); assert.equal(new Set(CLASSES.map(c => c.id)).size, 5);
  assert.equal(CHAPTERS.length, 6);
  assert.equal(Object.values(ENEMIES).filter(e => !e.boss).length, 24);
  assert.equal(Object.values(ENEMIES).filter(e => e.boss).length, 6);
  for (const c of CLASSES) {
    assert.ok(c.name.en && c.name.pl && c.origin.en && c.origin.pl);
    assert.equal(c.skills.length, 3);
    for (const skill of c.skills) assert.ok(skill.name.en && skill.name.pl && skill.desc.en && skill.desc.pl);
  }
  for (const chapter of CHAPTERS) {
    assert.ok(ENEMIES[chapter.boss].boss); assert.equal(chapter.floorNames.length, 2);
    for (const type of chapter.enemies) assert.ok(ENEMIES[type]);
    assert.ok(chapter.story.en && chapter.story.pl && chapter.completion.en && chapter.completion.pl);
  }
});

for (const c of CLASSES) {
  test(`${c.id}: basic attacks damage, respect cooldown and cannot hit through walls`, () => {
    const game = arena(c.id), enemy = target(game);
    assert.equal(game.attack(enemy), true); assert.equal(game.attack(enemy), false);
    advance(game, .3); assert.ok(enemy.hp < enemy.maxHp);
    const before = enemy.hp;
    game.projectiles = []; enemy.x = game.hero.x + 4;
    game.map[Math.round(game.hero.y)][Math.round(game.hero.x + 2)] = 1;
    game.hero.attackCooldown = 0; game.attack(enemy); advance(game, .6);
    assert.equal(enemy.hp, before);
  });
  c.skills.forEach((skill, index) => test(`${c.id}: ${skill.id} has bounded power and mana/cooldown costs`, () => {
    const game = arena(c.id), enemy = target(game, skill.kind === 'dash' ? 3.1 : 1);
    game.hero.hp = Math.floor(game.hero.maxHp / 2);
    const hp = game.hero.hp, mana = game.hero.mana, position = { ...game.hero };
    assert.equal(game.skill(index, enemy), true);
    assert.equal(game.hero.mana, mana - skill.cost);
    assert.equal(game.skill(index, enemy), false);
    advance(game, skill.kind === 'totem' ? 1 : .35);
    if (skill.kind === 'heal') assert.ok(game.hero.hp > hp);
    else {
      assert.ok(enemy.hp < enemy.maxHp, `${skill.kind} actually damages target`);
      assert.ok(enemy.maxHp - enemy.hp < 400, 'starting skill must not delete a chapter boss in one cast');
    }
    if (skill.kind === 'dash') assert.ok(distance(game.hero, position) > 1);
    game.cooldowns[index] = 0; game.hero.mana = 0;
    assert.equal(game.skill(index, enemy), false);
  }));
}

test('real-time motion, mana and cooldowns agree at 30/60/120/144 Hz; pause freezes state', () => {
  const results = [30, 60, 120, 144].map(hz => {
    const game = arena(); game.hero.mana = 0; game.cooldowns[0] = 4;
    game.input.x = 1; advance(game, .5, hz);
    return [game.hero.x, game.hero.mana, game.cooldowns[0], game.time];
  });
  for (const result of results) result.forEach((value, i) => assert.ok(Math.abs(value - results[0][i]) < .00001));
  const game = arena(); game.mode = 'paused'; const before = game.serialize(); advance(game, 2);
  assert.equal(game.serialize(), before);
});

test('XP grants levels and talent points; legal purchases and forge limits are enforced', () => {
  const game = arena(), beforeDamage = game.hero.damage;
  game.gainXp(170); assert.ok(game.hero.level >= 3); assert.ok(game.talentPoints >= 2);
  assert.equal(game.talent('might'), true); assert.ok(game.hero.damage > beforeDamage);
  assert.equal(game.talent('__proto__'), false);
  let item;
  for (let i = 0; i < 20; i++) { item = game.dropItem(game.hero.x, game.hero.y, true); if (item.slot === 'weapon') break; }
  game.inventory.push(item); assert.equal(game.equip(item.id), true); assert.equal(game.equip(item.id), false);
  game.gold = 0; assert.equal(game.forge(item.slot), false);
  game.gold = 1000; const gold = game.gold;
  for (let i = 0; i < 5; i++) assert.equal(game.forge(item.slot), true);
  assert.equal(game.gold, gold - 600); assert.equal(game.forge(item.slot), false);
  game.potions = 15; assert.equal(game.buyPotion(), false);
  game.potions = 3; game.gold = 24; assert.equal(game.buyPotion(), false);
  game.gold = 25; assert.equal(game.buyPotion(), true); assert.equal(game.gold, 0);
});

test('all generated equipment uses a matching content slot', () => {
  const game = arena(), slots = new Set();
  for (let i = 0; i < 300; i++) {
    const item = game.dropItem(6, 6); slots.add(item.slot);
    const base = ITEMS.find(b => b.id === item.baseId);
    assert.equal(base.slot, item.slot, `${item.baseId} slot matches generated slot`);
  }
  assert.ok(slots.size >= 3);
});

test('melee danger telegraphs allow reaction and dodge avoids damage', () => {
  const game = arena(), enemy = target(game, .9);
  enemy.attackCooldown = 0; const hp = game.hero.hp;
  game.tick(.05); assert.equal(game.hero.hp, hp);
  assert.ok(game.effects.some(e => e.type === 'warning'));
  advance(game, .2); assert.equal(game.hero.hp, hp);
  game.dodge(-1, 0); advance(game, .5); assert.equal(game.hero.hp, hp);
  const other = arena(), threat = target(other, .9); threat.attackCooldown = 0;
  const initialHp = other.hero.hp; advance(other, .6); assert.ok(other.hero.hp < initialHp);
});

test('campaign gates all 12 floors, requires each boss and reaches final victory', () => {
  const game = new Game({ seed: 1 }); let bossCount = 0;
  for (let floor = 1; floor <= 12; floor++) {
    assert.equal(game.floor, floor); assert.equal(game.portalOpen, false); assert.equal(game.descend(), false);
    const boss = game.enemies.find(e => e.boss);
    assert.equal(!!boss, floor % 2 === 0);
    for (const enemy of [...game.enemies].filter(e => !e.boss)) game.hurtEnemy(enemy, 1e8);
    if (boss) { bossCount++; assert.equal(game.portalOpen, false); game.hurtEnemy(boss, 1e8); }
    assert.equal(game.portalOpen, true);
    if (floor < 12) assert.equal(game.descend(), true);
    else { const portal = game.objects.find(o => o.type === 'portal'); Object.assign(game.hero, { x: portal.x, y: portal.y }); game.interact(); }
  }
  assert.equal(bossCount, 6); assert.equal(game.mode, 'victory'); assert.equal(game.completed, true);
  assert.equal(game.descend(), false);
});

test('both story decisions affect three resolved endings', () => {
  assert.equal(resolveEnding({ memory_tree: 'preserve', furnace_souls: 'shelter' }), 'restore');
  assert.equal(resolveEnding({ memory_tree: 'release', furnace_souls: 'freedom' }), 'release');
  assert.equal(resolveEnding({ memory_tree: 'preserve', furnace_souls: 'freedom' }), 'balance');
  assert.equal(resolveEnding({ memory_tree: 'release', furnace_souls: 'shelter' }), 'balance');
});

test('save roundtrip retains class, floor kills, objects, inventory, choices and progression', () => {
  const game = new Game({ seed: 90210, classId: 'oracle' });
  game.hurtEnemy(game.enemies[0], 1e8); game.gainXp(200); game.gold = 234;
  game.choices.memory_tree = 'preserve'; game.lore.push('belfry:0'); game.objects[0].used = true;
  const item = game.dropItem(game.hero.x, game.hero.y, true); game.inventory.push(item); game.equip(item.id);
  const restored = Game.restore(game.serialize()); assert.ok(restored);
  for (const key of ['seed', 'floor', 'floorKills', 'totalKills', 'gold', 'choices', 'lore', 'talents', 'equipment']) assert.deepEqual(restored[key], game[key], key);
  assert.equal(restored.hero.classId, 'oracle'); assert.equal(restored.hero.level, game.hero.level);
  assert.equal(restored.enemies[0].dead, true); assert.equal(restored.objects[0].used, true);
  advance(restored, 1); assert.ok(Number.isFinite(restored.hero.hp));
});

test('reloading does not bypass skill, potion or dodge recovery', () => {
  const game = arena(); game.hero.hp = 30;
  assert.equal(game.skill(0), true); assert.equal(game.potion(), true); assert.equal(game.dodge(1, 0), true);
  const restored = Game.restore(game.serialize()); assert.ok(restored);
  assert.ok(restored.cooldowns[0] > 0); assert.ok(restored.potionCooldown > 0); assert.ok(restored.dodgeCooldown > 0);
  assert.equal(restored.skill(0), false); assert.equal(restored.potion(), false); assert.equal(restored.dodge(), false);
});

test('a defeated hero remains defeated after reload and pays the normal revival cost', () => {
  const game = arena(); game.gold = 100; game.hurtHero(10000);
  assert.equal(game.mode, 'dead'); const restored = Game.restore(game.serialize()); assert.ok(restored);
  assert.equal(restored.mode, 'dead'); assert.equal(restored.hero.hp, 0); assert.equal(restored.gold, 100);
  const before = restored.time; advance(restored, 1); assert.equal(restored.time, before);
  restored.revive(); assert.equal(restored.mode, 'playing'); assert.equal(restored.gold, 90); assert.equal(restored.hero.hp, restored.hero.maxHp);
});

test('invalid save inputs never throw or create unsafe combat values', () => {
  for (const raw of ['', '{', 'null', '{}', '[]', '{"version":999}']) assert.equal(Game.restore(raw), null);
  for (const mutate of [
    s => { s.floor = 100; }, s => { s.hero.classId = 'missing'; },
    s => { s.enemies[0].damage = 'poison'; s.enemies[0].speed = 'poison'; s.enemies[0].attackCooldown = 0; s.enemies[0].x = s.hero.x + .7; s.enemies[0].y = s.hero.y; },
    s => { s.enemies[0].id = 'poison'; delete s.enemies[0].attackCooldown; },
    s => { s.inventory = [{ id: '__proto__', baseId: 'lantern_blade', slot: 'armor', rarity: 4, damage: 1, armor: 1, health: 1, value: 1, forged: 0 }]; },
    s => { s.inventory = [{ id: 'broken-id', baseId: 'lantern_blade', slot: 'weapon', rarity: 4, damage: 1, armor: 1, health: 1, value: 1, forged: 0 }]; },
  ]) {
    const save = JSON.parse(new Game({ seed: 42 }).serialize()); mutate(save);
    const restored = Game.restore(JSON.stringify(save)); if (!restored) continue;
    advance(restored, 3);
    assert.ok(Number.isFinite(restored.hero.hp));
    for (const e of restored.enemies) for (const key of ['id', 'hp', 'damage', 'speed', 'attackCooldown', 'x', 'y']) assert.ok(Number.isFinite(e[key]), `safe enemy ${key}`);
    for (const i of restored.inventory) { assert.equal(ITEMS.find(b => b.id === i.baseId).slot, i.slot); assert.ok(Number.isFinite(i.id), 'item identity cannot poison future generated IDs'); }
  }
});

// Optional longer balance observation. The bot uses normal movement, attacks,
// abilities, pickups, talents, equipment and revival; no damage/HP/position cheats.
// Its results describe this policy, not human difficulty or guaranteed completion.
if (process.env.BALANCE_SOAK === '1') for (const c of CLASSES) test(`combat soak: ${c.id} campaign`, () => {
  const game = new Game({ seed: 84621, classId: c.id });
  const score = item => (item?.damage || 0) * 3 + (item?.armor || 0) * 4 + (item?.health || 0) * .3;
  const depthTimes = []; let previousFloor = 1, frame = 0, desired = null, lootTarget = null;
  while (!game.completed && game.time < 12000 && game.deaths < 100) {
    if (game.mode === 'dead') { game.revive(); desired = null; }
    if (game.floor !== previousFloor) { depthTimes.push({ floor: previousFloor, seconds: Math.round(game.time), deaths: game.deaths }); previousFloor = game.floor; }
    const h = game.hero;
    if (frame++ % 4 === 0) {
      while (game.talentPoints > 0) {
        const preferred = ['vitality', 'might', 'focus'].find(t => game.talents[t] < 10);
        if (!preferred) break; game.talent(preferred);
      }
      for (const item of [...game.inventory]) if (score(item) > score(game.equipment[item.slot])) game.equip(item.id); else game.salvage(item.id);
      if (game.potions < 8 && game.gold >= 25) game.buyPotion();
      if (h.hp < h.maxHp * .6) game.potion();
      const active = game.enemies.filter(e => !e.dead).sort((a, b) => distance(a, h) - distance(b, h));
      const enemy = active[0];
      if (!game.loot.includes(lootTarget)) lootTarget = game.loot.filter(l => l.type === 'item').sort((a, b) => distance(a, h) - distance(b, h))[0];
      const loot = lootTarget;
      const goal = loot && (!enemy || distance(loot, h) < 2.8) ? loot : enemy || game.objects.find(o => o.type === 'portal');
      if (goal && (!desired || distance(goal, desired) > .6 || !game.moveTarget)) { game.clickMove(goal); desired = { x: goal.x, y: goal.y }; }
      if (enemy) {
        const range = distance(enemy, h);
        if (goal === enemy && range < Math.min(h.range, 6) && game.lineOfSight(h, enemy)) game.moveTarget = null;
        if (range < h.range + .5) game.attack(enemy);
        for (let index = 0; index < 3; index++) {
          const skill = c.skills[index];
          if (skill.kind === 'heal' ? h.hp < h.maxHp * .7 : range < (skill.kind === 'projectile' ? 7 : skill.kind === 'dash' ? 5 : 3)) game.skill(index, enemy);
        }
        const warning = game.effects.find(e => e.type === 'warning' && distance(e, h) < e.radius && e.life < .5);
        if (warning) game.dodge(h.x - warning.x || -1, h.y - warning.y);
      }
      if (!active.length && game.portalOpen && distance(game.objects.find(o => o.type === 'portal'), h) < 1.5) {
        game.interact(); if (game.floor < 12) game.descend(); desired = null;
      }
    }
    game.tick(.05);
    assert.ok(Number.isFinite(h.hp) && game.walkable(h.x, h.y), 'simulation remains finite and navigable');
  }
  console.log(JSON.stringify({ combatSoak: c.id, completed: game.completed, floor: game.floor, seconds: Math.round(game.time), deaths: game.deaths, level: game.hero.level, kills: game.totalKills, depthTimes, ...(!game.completed ? { hero: game.hero, moveTarget: game.moveTarget, movePath: game.movePath?.slice(0, 5), loot: game.loot.map(l => ({ x: l.x, y: l.y })), nearbyEnemy: game.enemies.filter(e => !e.dead).sort((a, b) => distance(a, game.hero) - distance(b, game.hero))[0] } : {}) }));
  assert.equal(game.completed, true, 'ordinary combat policy can complete all twelve depths');
});
