import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/engine.js';

function arena(type) {
  const game = new Game({ seed: 84621, classId: 'warden' });
  game.enemies = [];
  game.objects = [];
  game.projectiles = [];
  for (let y = 7; y <= 17; y++) for (let x = 7; x <= 17; x++) game.map[y][x] = 0;
  Object.assign(game.hero, { x: 10, y: 10 });
  game.spawnEnemy(type, 10, 14);
  const enemy = game.enemies[0];
  Object.assign(enemy, { attackCooldown: 0, specialCooldown: 100, speed: 0 });
  game.mode = 'playing';
  return { game, enemy };
}
const advance = (game, frames) => {
  for (let i = 0; i < frames; i++) game.tick(1 / 60);
};

for (const type of ['thorn_lurker', 'ember_channeler', 'moss_caller', 'spore_weaver']) {
  test(`${type}: actual AI prepares its ranged attack before releasing a typed projectile`, () => {
    const { game, enemy } = arena(type);
    game.tick(1 / 60);
    assert.ok(enemy.rangedWindup > 0.3);
    assert.ok(enemy.attackTime > 0.6);
    assert.equal(game.projectiles.length, 0, 'no invisible instant release');
    if (type === 'moss_caller' || type === 'spore_weaver') assert.ok(enemy.castTime > 0.6);
    advance(game, 18);
    assert.equal(game.projectiles.length, 0, '0.3 seconds of readable anticipation');
    advance(game, 2);
    assert.equal(game.projectiles.length, 1);
    const shot = game.projectiles[0];
    assert.equal(shot.sourceType, type);
    assert.equal(
      shot.kind,
      type === 'moss_caller' ? 'thorn' : type === 'spore_weaver' ? 'spore' : 'arrow',
    );
    assert.ok(shot.vy < 0 && Math.abs(shot.vx) < 1e-8);
    assert.ok(shot.sourceHeight > 0.4);
  });
}

test('a prepared arrow keeps its telegraphed aim when the hero sidesteps', () => {
  const { game, enemy } = arena('thorn_lurker');
  game.tick(1 / 60);
  assert.deepEqual(enemy.rangedAim, { x: 10, y: 10 });
  game.hero.x = 12;
  advance(game, 20);
  assert.equal(game.projectiles.length, 1);
  assert.ok(
    Math.abs(game.projectiles[0].vx) < 1e-8,
    'the released arrow does not secretly retarget the sidestep',
  );
});

test('new obstruction cancels a prepared shot instead of firing through the wall', () => {
  const { game } = arena('ember_channeler');
  game.tick(1 / 60);
  game.map[12][10] = 1;
  advance(game, 25);
  assert.equal(game.projectiles.length, 0);
});

test('boss special attack has a visible preparation phase before its projectile fan', () => {
  const { game, enemy } = arena('glass_oracle');
  enemy.specialCooldown = 0;
  enemy.attackCooldown = 100;
  game.tick(1 / 60);
  assert.equal(enemy.specialWindup, 0.55);
  assert.ok(enemy.castTime > 0.8);
  advance(game, 30);
  assert.equal(game.projectiles.length, 0);
  advance(game, 5);
  assert.ok(game.projectiles.length > 3);
  assert.ok(game.projectiles.every((p) => p.kind === 'prism' && p.sourceType === 'glass_oracle'));
});

test('pause freezes preparation; revival clears a pending enemy release', () => {
  const { game, enemy } = arena('thorn_lurker');
  game.tick(1 / 60);
  const before = enemy.rangedWindup;
  game.mode = 'paused';
  advance(game, 60);
  assert.equal(enemy.rangedWindup, before);
  assert.equal(game.projectiles.length, 0);
  game.revive();
  assert.equal(enemy.rangedWindup, 0);
  assert.equal(enemy.rangedAim, null);
  assert.equal(enemy.castTime, 0);
});

test('summoning plays preparation and a floor marker before a helper appears', () => {
  const { game, enemy } = arena('moss_caller');
  enemy.specialCooldown = 0;
  game.tick(1 / 60);
  assert.equal(game.enemies.length, 1);
  assert.equal(enemy.summonWindup, 0.4);
  assert.ok(enemy.castTime > 0.6);
  assert.ok(game.effects.some((effect) => effect.type === 'ring'));
  advance(game, 22);
  assert.equal(game.enemies.length, 1, 'the helper does not precede the casting gesture');
  advance(game, 3);
  assert.equal(game.enemies.length, 2);
  assert.equal(enemy.summons, 1);
  assert.equal(enemy.summonPoint, null);
});

test('summoning cannot place a helper in a new wall or survive revival as a pending cast', () => {
  const { game, enemy } = arena('moss_caller');
  enemy.specialCooldown = 0;
  game.tick(1 / 60);
  game.map[14][11] = 1;
  advance(game, 25);
  assert.equal(game.enemies.length, 1);
  assert.equal(enemy.summons, 0);
  game.map[14][11] = 0;
  enemy.specialCooldown = 0;
  game.tick(1 / 60);
  assert.ok(enemy.summonWindup > 0);
  game.revive();
  assert.equal(enemy.summonWindup, 0);
  assert.equal(enemy.summonPoint, null);
});

test('old saves retain progress while migrating an archer from the former melee role', () => {
  const game = new Game({ seed: 84621, classId: 'warden' });
  game.floor = 3;
  game.makeFloor();
  game.enemies = [];
  game.spawnEnemy('thorn_lurker', game.hero.x + 1, game.hero.y);
  Object.assign(game.enemies[0], {
    behavior: 'melee',
    range: 1.7,
    rangedWindup: 999,
    rangedAim: { x: 'invalid' },
    castTime: 999,
    summonWindup: 999,
    summonPoint: { x: 'invalid' },
  });
  game.gold = 137;
  game.enemies[0].hp -= 1;
  const restored = Game.restore(game.serialize());
  assert.ok(restored);
  assert.equal(restored.gold, 137);
  assert.equal(restored.floor, 3);
  assert.equal(restored.enemies[0].hp, game.enemies[0].hp);
  assert.equal(restored.enemies[0].behavior, 'ranged');
  assert.equal(restored.enemies[0].range, 6);
  assert.equal(restored.enemies[0].rangedWindup, 0);
  assert.equal(restored.enemies[0].rangedAim, null);
  assert.equal(restored.enemies[0].castTime, 0);
  assert.equal(restored.enemies[0].summonWindup, 0);
  assert.equal(restored.enemies[0].summonPoint, null);
});
