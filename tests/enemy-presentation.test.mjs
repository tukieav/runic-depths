import test from 'node:test';
import assert from 'node:assert/strict';
import { CHAPTERS, ENEMIES } from '../src/content.js';
import { ENEMY_PRESENTATION, enemyPresentation } from '../src/enemy-presentation.js';

test('every spawnable enemy and boss has an explicit identity and asset', () => {
  assert.deepEqual(Object.keys(ENEMY_PRESENTATION).sort(), Object.keys(ENEMIES).sort());
  for (const enemy of Object.values(ENEMIES)) {
    const presentation = enemyPresentation(enemy);
    assert.equal(presentation.id, enemy.id);
    assert.equal(
      presentation.assetId,
      enemy.id,
      `${enemy.id} must not silently share a generic skeleton`,
    );
    assert.equal(presentation.body, enemy.shape);
    assert.equal(presentation.boss, !!enemy.boss);
    assert.equal(
      presentation.details.length >= 4,
      true,
      `${enemy.id} needs authored recognition cues`,
    );
    for (const color of Object.values(presentation.palette))
      assert.ok(Number.isInteger(color) && color >= 0 && color <= 0xffffff);
  }
  assert.equal(new Set(Object.values(ENEMY_PRESENTATION).map((p) => p.assetId)).size, 30);
});

test('runtime instance IDs cannot override bestiary identity or access inherited object properties', () => {
  assert.equal(enemyPresentation({ id: 481, type: 'moss_caller' }).id, 'moss_caller');
  assert.equal(enemyPresentation({ id: 'hollow_guard', type: 'moss_caller' }).id, 'moss_caller');
  for (const value of [null, undefined, 123, {}, '__proto__', 'constructor', 'missing_enemy'])
    assert.equal(enemyPresentation(value), null);
  assert.throws(() => {
    ENEMY_PRESENTATION.moss_caller.weapon = 'sword';
  }, TypeError);
  assert.throws(() => {
    ENEMY_PRESENTATION.moss_caller.details.push('sword');
  }, TypeError);
});

test('ranged AI always has a ranged attack presentation; melee attacks have no ordinary projectile', () => {
  const meleeWeapons = new Set(['sword', 'hammer', 'fists', 'fangs']);
  for (const enemy of Object.values(ENEMIES)) {
    const presentation = enemyPresentation(enemy.id);
    const ranged = ['ranged', 'summoner'].includes(enemy.behavior);
    assert.equal(presentation.projectile !== null, ranged, enemy.id);
    assert.equal(['shoot', 'cast'].includes(presentation.attackStyle), ranged, enemy.id);
    if (ranged) {
      assert.ok(enemy.range > 3, `${enemy.id} must have actual ranged reach`);
      assert.ok(
        !meleeWeapons.has(presentation.weapon),
        `${enemy.id} cannot launch magic with a generic melee weapon`,
      );
    }
    if (enemy.shape === 'hound') assert.equal(presentation.attackStyle, 'bite', enemy.id);
    if (enemy.shape === 'spider')
      assert.ok(
        presentation.details.some((detail) => detail.startsWith('eight-jointed')),
        enemy.id,
      );
  }
});

test('both authored archers have bows, bowstrings, quivers, arrows and bilingual bow lore', () => {
  const archers = Object.values(ENEMY_PRESENTATION).filter((p) => p.weapon === 'bow');
  assert.deepEqual(archers.map((p) => p.id).sort(), ['ember_channeler', 'thorn_lurker']);
  for (const archer of archers) {
    const enemy = ENEMIES[archer.id];
    assert.equal(enemy.behavior, 'ranged');
    assert.equal(archer.attackStyle, 'shoot');
    assert.equal(archer.projectile, 'arrow');
    assert.ok(archer.details.includes('visible-bowstring'));
    assert.ok(archer.details.includes('back-quiver'));
    assert.match(enemy.lore.en, /bow/);
    assert.match(enemy.lore.pl, /łuk/);
  }
});

test('natural and magical ranged enemies retain their distinct attack sources', () => {
  assert.equal(enemyPresentation('spore_weaver').projectile, 'spore');
  assert.equal(enemyPresentation('null_weaver').projectile, 'void');
  assert.equal(enemyPresentation('moss_caller').weapon, 'staff');
  assert.equal(enemyPresentation('glass_scribe').weapon, 'staff');
  assert.equal(enemyPresentation('undertow_cantor').weapon, 'staff');
  assert.equal(enemyPresentation('candle_wisp').weapon, 'orb');
  assert.equal(enemyPresentation('glass_oracle').projectile, 'prism');
  assert.equal(enemyPresentation('drowned_king').weapon, 'trident');
  assert.equal(enemyPresentation('drowned_king').attackStyle, 'cast');
  assert.equal(enemyPresentation('first_keeper').weapon, 'orb');
});

test('each chapter shares a material family while its boss has unique physical recognition cues', () => {
  for (const chapter of CHAPTERS) {
    const boss = enemyPresentation(chapter.boss);
    const ordinary = chapter.enemies.map(enemyPresentation);
    assert.equal(boss.boss, true);
    assert.ok(
      ordinary.every((p) => p.theme === boss.theme),
      chapter.id,
    );
    const regularDetails = new Set(ordinary.flatMap((p) => p.details));
    assert.ok(
      boss.details.filter((detail) => !regularDetails.has(detail)).length >= 4,
      `${chapter.boss} needs a silhouette beyond a scaled ordinary enemy`,
    );
  }
});
