import assert from 'node:assert/strict';
import test from 'node:test';
import { CLASSES, CHAPTERS, ENEMIES, ITEMS, ITEM_SLOTS, RARITIES, STORY_CHOICES, ENDINGS, resolveEnding } from '../src/content.js';
import { STRINGS, local, tr } from '../src/i18n.js';

function bilingual(value, path = 'content') {
  if (!value || typeof value !== 'object') return;
  if ('en' in value || 'pl' in value) {
    assert.equal(typeof value.en, 'string', `${path}: missing English text`);
    assert.equal(typeof value.pl, 'string', `${path}: missing Polish text`);
    assert.ok(value.en.trim() && value.pl.trim(), `${path}: empty translation`);
  }
  for (const [key, child] of Object.entries(value)) bilingual(child, `${path}.${key}`);
}

test('all campaign content is available in both languages', () => {
  for (const collection of [CLASSES, CHAPTERS, ENEMIES, ITEMS, RARITIES, STORY_CHOICES, ENDINGS]) bilingual(collection);
  assert.deepEqual(Object.keys(STRINGS.en).sort(), Object.keys(STRINGS.pl).sort());
  for (const key of Object.keys(STRINGS.en)) {
    const variables = text => [...text.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();
    assert.deepEqual(variables(STRINGS.en[key]), variables(STRINGS.pl[key]), `${key}: interpolation mismatch`);
  }
});

test('five distinct classes each have three usable skills and a supported weapon', () => {
  assert.deepEqual(CLASSES.map(c => c.id), ['warden', 'ranger', 'arcanist', 'reaver', 'oracle']);
  const ids = new Set();
  for (const character of CLASSES) {
    assert.equal(character.skills.length, 3);
    for (const stat of ['hp', 'mana', 'damage', 'speed', 'range']) assert.ok(character[stat] > 0);
    for (const skill of character.skills) {
      assert.ok(!ids.has(skill.id), `duplicate skill ${skill.id}`); ids.add(skill.id);
      assert.ok(['nova', 'dash', 'projectile', 'heal', 'totem', 'cleave'].includes(skill.kind));
      assert.ok(skill.cost > 0 && skill.cost <= character.mana, `${skill.id}: unusable mana cost`);
      assert.ok(skill.cooldown > 0 && skill.damage > 0);
    }
  }
});

test('twelve depths link to 24 enemy archetypes, six distinct bosses, and discoverable memories', () => {
  assert.equal(CHAPTERS.length, 6);
  assert.equal(CHAPTERS.flatMap(c => c.floorNames).length, 12);
  assert.equal(new Set(CHAPTERS.map(c => c.id)).size, 6);
  assert.equal(new Set(CHAPTERS.map(c => c.boss)).size, 6);
  const regular = CHAPTERS.flatMap(c => c.enemies);
  assert.equal(regular.length, 24);
  assert.equal(new Set(regular).size, 24);
  for (const chapter of CHAPTERS) {
    assert.equal(ENEMIES[chapter.boss]?.boss, true, `missing boss ${chapter.boss}`);
    assert.ok(chapter.lore.length >= 3 && chapter.dialogue.length >= 2);
    for (const id of chapter.enemies) {
      const enemy = ENEMIES[id];
      assert.ok(enemy && !enemy.boss, `invalid regular enemy ${id}`);
      assert.ok(['humanoid', 'spider', 'golem', 'wisp', 'hound'].includes(enemy.shape));
      assert.ok(['melee', 'ranged', 'charger', 'summoner'].includes(enemy.behavior));
      for (const stat of ['hp', 'damage', 'speed', 'range', 'xp', 'scale']) assert.ok(enemy[stat] > 0);
    }
  }
});

test('all four choice combinations reach the expected three endings', () => {
  assert.equal(STORY_CHOICES.length, 2);
  assert.deepEqual(STORY_CHOICES.map(c => c.chapter), [2, 4]);
  const outcomes = [];
  for (const first of STORY_CHOICES[0].options) for (const second of STORY_CHOICES[1].options) {
    const result = resolveEnding([first, second]);
    assert.ok(ENDINGS[result]); outcomes.push(result);
    assert.equal(resolveEnding({ memory_tree: first.id, furnace_souls: second.id }), result);
  }
  assert.deepEqual(outcomes, ['restore', 'balance', 'balance', 'release']);
  assert.equal(resolveEnding(), 'balance');
  assert.equal(resolveEnding([null, undefined, 'unknown']), 'balance');
});

test('every supported equipment slot has loot and all rarity tiers are ordered', () => {
  assert.deepEqual(ITEM_SLOTS, ['weapon', 'armor', 'charm']);
  assert.equal(new Set(ITEMS.map(i => i.id)).size, ITEMS.length);
  for (const slot of ITEM_SLOTS) assert.ok(ITEMS.some(i => i.slot === slot), `no loot for ${slot}`);
  for (const item of ITEMS) assert.ok(ITEM_SLOTS.includes(item.slot) && item.base > 0);
  assert.equal(RARITIES.length, 5);
  for (let i = 1; i < RARITIES.length; i++) assert.ok(RARITIES[i].multiplier > RARITIES[i - 1].multiplier);
});

test('localization safely handles fallback and literal interpolation values', () => {
  assert.equal(local({ en: 'Dawn', pl: 'Świt' }, 'pl'), 'Świt');
  assert.equal(local({ en: 'Dawn' }, 'de'), 'Dawn');
  assert.equal(local(null), '');
  assert.equal(local('Mira', 'pl'), 'Mira');
  assert.equal(tr('floorNumber', 'pl', { floor: 7 }), 'Głębina 7 / 12');
  assert.equal(tr('itemFound', 'en', { name: '$& {name}' }), 'Found: $& {name}');
  assert.equal(tr('missing_key', 'pl'), 'missing_key');
});
