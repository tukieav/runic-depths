import './style.css';
import { Game, distance } from './engine.js';
import { DungeonRenderer } from './renderer.js';
import {
  CLASSES,
  CHAPTERS,
  ENEMIES,
  ITEMS,
  RARITIES,
  STORY_CHOICES,
  ENDINGS,
  resolveEnding,
  TIPS,
} from './content.js';
import { local } from './i18n.js';
import * as sdk from './sdk.js';
import * as audio from './audio.js';
const $ = (id) => document.getElementById(id),
  canvas = $('game');
const SAVE = 'runicdepths.covenant.v2',
  PREF = 'runicdepths.preferences.v2';
const glyphs = { warden: 'ᛉ', ranger: 'ᛇ', arcanist: 'ᛟ', reaver: 'ᚦ', oracle: 'ᛚ' };
let game,
  renderer,
  lang = 'en',
  panel = null,
  pausedByLifecycle = false,
  booted = false,
  selectedClass = 'warden',
  journalTab = 'story',
  lastUI = 0,
  lastSave = 0,
  lastStep = 0,
  frameTime = 0,
  frameSamples = [],
  fps = 60;
let prefs = {
  language: null,
  music: 0.32,
  sfx: 0.65,
  muted: false,
  zoom: 1,
  quality: matchMedia('(pointer:coarse)').matches ? 'low' : 'high',
  reducedMotion: matchMedia('(prefers-reduced-motion:reduce)').matches,
  tutorial: false,
};
let saveWarningShown = false;
let keys = new Set(),
  pointer = { x: 0, y: 0 },
  stick = { x: 0, y: 0 },
  stickId = null,
  announcementTimer,
  modalPreviousFocus;
const text = (en, pl) => (lang === 'pl' ? pl : en);
const l = (value) => local(value, lang);
const esc = (s) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
const hex = (n) => '#' + Number(n).toString(16).padStart(6, '0');
function persistPrefs() {
  sdk.saveData(PREF, JSON.stringify(prefs));
}
function save() {
  if (!game) return;
  const success = sdk.saveData(SAVE, game.serialize());
  $('save-status').dataset.error = String(!success);
  document.body.classList.toggle('save-unavailable', !success);
  if (!success && !saveWarningShown) {
    saveWarningShown = true;
    toast(
      text(
        'Saving is unavailable in this browser. Keep this tab open to retain this journey.',
        'Zapis jest niedostępny w tej przeglądarce. Nie zamykaj karty, aby zachować tę podróż.',
      ),
    );
  }
  if (success) saveWarningShown = false;
  $('save-status').textContent = success
    ? text('PROGRESS SAVED', 'POSTĘP ZAPISANY')
    : text('SAVE UNAVAILABLE · KEEP THIS TAB OPEN', 'ZAPIS NIEDOSTĘPNY · NIE ZAMYKAJ KARTY');
  lastSave = game.time;
}
function toast(message) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = message;
  $('toast-stack').append(el);
  while ($('toast-stack').children.length > 3) $('toast-stack').firstChild.remove();
  setTimeout(() => el.remove(), 4000);
}
function announce() {
  clearTimeout(announcementTimer);
  $('floor-announcement').innerHTML =
    `<small>${text('CHAPTER', 'ROZDZIAŁ')} ${Math.ceil(game.floor / 2)} · ${text('DEPTH', 'POZIOM')} ${game.floor}/12</small><b>${esc(l(game.chapter.name))}</b>`;
  $('floor-announcement').classList.add('show');
  announcementTimer = setTimeout(() => $('floor-announcement').classList.remove('show'), 3200);
}
function applyPrefs() {
  audio.setMuted(prefs.muted);
  audio.setMusicVolume(prefs.music);
  audio.setSfxVolume(prefs.sfx);
  renderer?.setQuality(prefs.quality);
  renderer?.setZoom(Number(prefs.zoom) || 1);
  if (game) game.settings.reducedMotion = prefs.reducedMotion;
  document.body.classList.toggle('reduce-motion', prefs.reducedMotion);
  $('audio-button').textContent = prefs.muted ? '♪̸' : '♫';
}
function event(e) {
  if (!booted) return;
  switch (e.type) {
    case 'floor':
      renderer?.build(game);
      announce();
      break;
    case 'attack':
      game.class.weapon === 'bow'
        ? audio.bowSound()
        : e.ranged
          ? audio.magicSound()
          : audio.swordSound();
      break;
    case 'enemyShot': {
      const pan = Math.max(-1, Math.min(1, (e.x - game.hero.x - (e.y - game.hero.y)) / 8));
      e.kind === 'arrow' ? audio.bowSound(pan) : audio.magicSound(pan);
      break;
    }
    case 'skill':
      renderer?.playHeroAnimation('cast');
      audio.skillSound(e.kind);
      break;
    case 'dodge':
      audio.skillSound('dash');
      break;
    case 'hurt':
      renderer?.playHeroAnimation('hit');
      audio.hurtSound();
      $('damage-flash').classList.add('active');
      setTimeout(() => $('damage-flash').classList.remove('active'), 180);
      break;
    case 'kill':
      audio.monsterDieSound();
      break;
    case 'bossAttack':
      audio.bossSound();
      break;
    case 'bossDefeated':
      sdk.happytime();
      toast(
        text(
          'Guardian defeated. A legendary memory remains.',
          'Strażnik pokonany. Pozostało legendarne wspomnienie.',
        ),
      );
      save();
      break;
    case 'memoryComplete':
      toast(
        text(
          'Chapter memories complete · +100 gold, +80 experience',
          'Wspomnienia rozdziału skompletowane · +100 złota, +80 doświadczenia',
        ),
      );
      break;
    case 'levelup':
      audio.levelUpSound();
      toast(
        text(
          `Level ${game.hero.level} · a talent point awaits [T]`,
          `Poziom ${game.hero.level} · dostępny punkt talentu [T]`,
        ),
      );
      save();
      break;
    case 'potion':
      audio.potionSound();
      break;
    case 'loot':
      audio.lootSound(RARITIES[e.rarity]?.id);
      toast(text('Loot collected · open inventory [I]', 'Zebrano łup · otwórz ekwipunek [I]'));
      break;
    case 'chest':
      audio.chestSound();
      toast(
        text(
          'A forgotten cache. Step closer to collect your treasure.',
          'Zapomniana skrytka. Podejdź, aby zebrać skarb.',
        ),
      );
      break;
    case 'shrine':
      audio.potionSound();
      toast(
        text(
          'The lantern restores health, mana, and one potion.',
          'Latarnia odnawia zdrowie, manę i jedną miksturę.',
        ),
      );
      save();
      break;
    case 'lore':
      openPanel('lore', e.index);
      save();
      break;
    case 'dialogue':
      openPanel('dialogue');
      break;
    case 'camp':
      openPanel('camp');
      break;
    case 'portalLocked':
      toast(
        text(
          'Break the ward: defeat more enemies and the guardian, if present.',
          'Przełam pieczęć: pokonaj więcej wrogów oraz strażnika, jeśli tu jest.',
        ),
      );
      break;
    case 'descend': {
      const choice = STORY_CHOICES.find((c) => c.chapter === game.floor / 2 && !game.choices[c.id]);
      if (choice) openPanel('choice', choice.id);
      else nextFloor();
      break;
    }
    case 'dead':
      audio.gameOverSound();
      openPanel('dead');
      save();
      break;
    case 'victory':
      audio.levelUpSound();
      sdk.happytime();
      save();
      openPanel('victory');
      break;
    case 'equip':
      audio.uiSound();
      save();
      break;
    case 'forge':
      audio.chestSound();
      save();
      break;
    case 'save':
      save();
      break;
    case 'revive':
      closePanel();
      renderer.build(game);
      save();
      break;
  }
}
function nextFloor() {
  closePanel();
  sdk.gameplayStop();
  sdk.loadingStart();
  audio.stairsSound();
  game.descend();
  renderer.build(game);
  sdk.loadingStop();
  sdk.gameplayStart();
  save();
  announce();
}
function newGame(classId) {
  $('toast-stack').replaceChildren();
  lastStep = 0;
  game = new Game({ classId, onEvent: event });
  selectedClass = game.class.id;
  game.settings.reducedMotion = prefs.reducedMotion;
  renderer.build(game);
  closePanel();
  updateLanguage();
  save();
  announce();
  sdk.gameplayStart();
}
function setLanguage(value) {
  lang = value === 'pl' ? 'pl' : 'en';
  prefs.language = lang;
  persistPrefs();
  updateLanguage();
  if (panel) renderPanel();
}
function updateLanguage() {
  document.documentElement.lang = lang;
  $('language-button').textContent = lang.toUpperCase();
  $('quest-eyebrow').textContent = text('THE HOLLOW COVENANT', 'PUSTY PAKT');
  $('basic-label').textContent = text('Attack', 'Atak');
  $('dodge-label').textContent = text('Dodge', 'Unik');
  $('hero-name').textContent = l(game.class.name);
  $('portrait').textContent = glyphs[game.class.id];
  $('portrait').style.color = hex(game.hero.color);
  for (let i = 0; i < 3; i++) {
    const s = game.class.skills[i],
      b = $(`skill-${i}`);
    b.querySelector('small').textContent = l(s.name);
    b.title = `${i + 1} · ${l(s.name)}\n${l(s.desc)}\n${s.cost} ${text('mana', 'many')} · ${s.cooldown}s`;
    b.setAttribute('aria-label', l(s.name));
    b.querySelector('.skill-symbol').style.color = hex(s.color);
  }
  $('onboarding-title').textContent = text(
    'Your oath begins here.',
    'Tutaj zaczyna się twoja przysięga.',
  );
  $('onboarding-text').textContent = matchMedia('(pointer:coarse)').matches
    ? text(
        'Move with the left stick. Tap the sword to attack, the runes to cast. Tap a glowing object to interact.',
        'Poruszaj się lewym drążkiem. Miecz atakuje, runy rzucają zaklęcia. Dotknij świecącego obiektu, aby go użyć.',
      )
    : text(
        'WASD to move · click to walk or attack · 1–3 skills · Space dodge · Q heal · E interact. Choose a hero with ♙.',
        'WASD ruch · kliknij, aby iść lub atakować · 1–3 umiejętności · Spacja unik · Q leczenie · E interakcja. Wybierz bohatera: ♙.',
      );
  const labels = {
    'inventory-button': text('Inventory · I', 'Ekwipunek · I'),
    'journal-button': text('Journal · J', 'Dziennik · J'),
    'talents-button': text('Talents · T', 'Talenty · T'),
    'character-button': text('Choose hero', 'Wybór bohatera'),
    'pause-button': text('Pause · Escape', 'Pauza · Escape'),
    'audio-button': text('Toggle sound', 'Włącz lub wyłącz dźwięk'),
    'basic-button': text(
      'Basic attack · Enter or hold mouse',
      'Zwykły atak · Enter lub przytrzymaj mysz',
    ),
    'dodge-button': text('Dodge · Space', 'Unik · Spacja'),
    'potion-button': text('Healing potion · Q', 'Mikstura leczenia · Q'),
  };
  for (const [id, label] of Object.entries(labels)) {
    $(id).title = label;
    $(id).setAttribute('aria-label', label);
  }
  renderHUD();
}
function renderHUD() {
  if (!game) return;
  const h = game.hero;
  const guardianAlive = game.enemies.some((enemy) => enemy.boss && !enemy.dead);
  $('chapter-label').textContent =
    `${l(game.chapter.name)} · ${text('Depth', 'Poziom')} ${game.floor}`;
  $('quest-title').textContent = l(
    game.chapter.floorNames?.[(game.floor - 1) % 2] || game.chapter.name,
  );
  $('quest-description').textContent = l(game.chapter.objective);
  $('quest-fill').style.width = Math.min(100, (game.floorKills / game.requiredKills) * 100) + '%';
  $('quest-count').textContent = game.portalOpen
    ? text(
        '◆ The descent is open. Find the golden portal.',
        '◆ Zejście otwarte. Znajdź złoty portal.',
      )
    : text(
        `${Math.min(game.floorKills, game.requiredKills)} / ${game.requiredKills} echoes released${guardianAlive ? ' · guardian remains' : ''}`,
        `${Math.min(game.floorKills, game.requiredKills)} / ${game.requiredKills} uwolnionych ech${guardianAlive ? ' · odnajdź strażnika' : ''}`,
      );
  $('hero-level').textContent = text(`LV ${h.level}`, `POZ ${h.level}`);
  for (const key of ['health', 'mana']) {
    const value = key === 'health' ? h.hp : h.mana,
      max = key === 'health' ? h.maxHp : h.maxMana;
    $(key + '-fill').style.width = Math.max(0, (value / max) * 100) + '%';
    $(key + '-value').textContent = `${Math.ceil(value)} / ${max}`;
  }
  $('xp-fill').style.width = (h.xp / h.nextXp) * 100 + '%';
  $('gold-value').textContent = game.gold;
  $('talent-badge').hidden = !game.talentPoints;
  $('potion-label').textContent = text(`Potion · ${game.potions}`, `Mikstura · ${game.potions}`);
  for (let i = 0; i < 3; i++) {
    const b = $(`skill-${i}`),
      cd = game.cooldowns[i];
    b.querySelector('em').textContent = cd > 0 ? cd.toFixed(1) : '';
    b.style.opacity = h.mana < game.class.skills[i].cost ? '.5' : '1';
  }
  $('dodge-button').querySelector('em').textContent =
    game.dodgeCooldown > 0 ? game.dodgeCooldown.toFixed(1) : '';
  $('potion-button').querySelector('em').textContent =
    game.potionCooldown > 0 ? game.potionCooldown.toFixed(1) : '';
  const o = game.nearby,
    names = {
      chest: text('Open cache', 'Otwórz skrytkę'),
      shrine: text('Restore at the lantern', 'Odnów siły przy latarni'),
      lore: text('Read memory', 'Przeczytaj wspomnienie'),
      npc: text('Speak to the keeper', 'Porozmawiaj z opiekunem'),
      waypoint: text('Rest & forge', 'Odpoczynek i kuźnia'),
      portal: game.portalOpen
        ? text('Descend deeper', 'Zejdź głębiej')
        : text('The portal is sealed', 'Portal zapieczętowany'),
    };
  $('interact-button').textContent = o ? `[E] ${names[o.type]}` : '';
  $('interaction-wrap').style.bottom = !$('onboarding').hidden ? '230px' : '';
  const boss = game.enemies.find((e) => e.boss && !e.dead && distance(e, h) < 12);
  $('boss-hud').hidden = !boss;
  if (boss) {
    $('boss-name').textContent = l(ENEMIES[boss.type].name);
    $('boss-fill').style.width = Math.max(0, (boss.hp / boss.maxHp) * 100) + '%';
    $('boss-phase').textContent = text(
      `PHASE ${boss.phase} · leave the danger circles`,
      `FAZA ${boss.phase} · opuszczaj kręgi zagrożenia`,
    );
  }
  $('map-caption').textContent = text(`DEPTH ${game.floor} / 12`, `POZIOM ${game.floor} / 12`);
  drawMap();
}
function drawMap() {
  const c = $('minimap'),
    ctx = c.getContext('2d'),
    s = 4,
    off = 0;
  ctx.clearRect(0, 0, 164, 164);
  for (let y = 0; y < 41; y++)
    for (let x = 0; x < 41; x++) {
      if (!game.explored[y]?.[x]) continue;
      ctx.fillStyle = game.map[y][x] ? '#33444a' : '#6b7975';
      ctx.fillRect(x * s + off, y * s + off, s - 1, s - 1);
    }
  for (const o of game.objects) {
    if (!game.explored[Math.round(o.y)]?.[Math.round(o.x)]) continue;
    ctx.fillStyle =
      o.type === 'portal'
        ? game.portalOpen
          ? '#fce0a0'
          : '#846b8e'
        : o.used
          ? '#67746c'
          : o.type === 'npc'
            ? '#c9dab9'
            : '#a6beb5';
    ctx.fillRect(o.x * s - 1, o.y * s - 1, 4, 4);
  }
  for (const e of game.enemies)
    if (!e.dead && distance(e, game.hero) < 8) {
      ctx.fillStyle = e.boss ? '#ff8b67' : '#c57969';
      ctx.fillRect(e.x * s, e.y * s, e.boss ? 4 : 2, e.boss ? 4 : 2);
    }
  ctx.fillStyle = '#ffecad';
  ctx.beginPath();
  ctx.arc(game.hero.x * s, game.hero.y * s, 3, 0, Math.PI * 2);
  ctx.fill();
}
function modalShell(
  title,
  intro,
  body,
  eyebrow = text('THE HOLLOW COVENANT', 'PUSTY PAKT'),
  close = true,
) {
  return `<section class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">${close ? '<button class="modal-close" data-action="close" aria-label="' + text('Close', 'Zamknij') + '">×</button>' : ''}<div class="eyebrow">${esc(eyebrow)}</div><h2 id="modal-title">${esc(title)}</h2>${intro ? `<p class="intro">${esc(intro)}</p>` : ''}${body}</section>`;
}
function openPanel(name, data) {
  modalPreviousFocus = document.activeElement;
  panel = { name, data };
  keys.clear();
  stick = { x: 0, y: 0 };
  game.input = { x: 0, y: 0, attack: false, target: null };
  game.moveTarget = null;
  game.attackTarget = null;
  if (game.mode === 'playing') game.mode = 'paused';
  sdk.gameplayStop();
  audio.pauseAudio();
  $('modal-root').hidden = false;
  renderPanel();
  $('modal-root').querySelector('button')?.focus();
  save();
}
function closePanel() {
  if (!panel) return;
  const name = panel.name;
  if (name === 'dead' && game.mode === 'dead') return;
  if (game.completed) {
    panel = { name: 'victory' };
    renderPanel();
    return;
  }
  panel = null;
  $('modal-root').hidden = true;
  $('modal-root').innerHTML = '';
  keys.clear();
  if (game.mode === 'paused') game.mode = 'playing';
  pausedByLifecycle = false;
  if (game.mode === 'playing' && !document.hidden) {
    sdk.gameplayStart();
    audio.resumeAudio();
  }
  modalPreviousFocus?.focus?.();
}
function itemName(it) {
  return (
    l(ITEMS.find((i) => i.id === it.baseId)?.name || { en: 'Runic relic', pl: 'Runiczny relikt' }) +
    (it.forged ? ` +${it.forged}` : '')
  );
}
function itemStats(it) {
  return [
    it.damage ? `+${it.damage} ${text('damage', 'obrażeń')}` : '',
    it.armor ? `+${it.armor} ${text('armor', 'pancerza')}` : '',
    it.health ? `+${it.health} ${text('health', 'zdrowia')}` : '',
  ]
    .filter(Boolean)
    .join(' · ');
}
function btn(action, label, cls = 'secondary', extra = '') {
  return `<button class="${cls}" data-action="${action}" ${extra}>${label}</button>`;
}
function renderPanel() {
  if (!panel) return;
  let html = '';
  const { name, data } = panel,
    h = game.hero;
  if (name === 'characters') {
    const chosen = CLASSES.find((c) => c.id === selectedClass) || game.class;
    html = modalShell(
      text('Choose your oath', 'Wybierz swoją przysięgę'),
      text(
        'Five paths into the same forgotten city. Every hero is available from the beginning.',
        'Pięć dróg do tego samego zapomnianego miasta. Każdy bohater jest dostępny od początku.',
      ),
      `<div class="class-grid">${CLASSES.map((c) => `<button class="class-card ${chosen.id === c.id ? 'selected' : ''}" data-action="select-class" data-id="${c.id}" style="--portrait-position:${CLASSES.findIndex((x) => x.id === c.id) * 25}%"><span class="class-glyph" style="color:${hex(c.color)}">${glyphs[c.id]}</span><strong>${esc(l(c.name))}</strong><small>${c.hp} HP · ${c.mana} MP<br>${esc(c.weapon === 'sword' ? text('Sword & shield', 'Miecz i tarcza') : c.weapon === 'bow' ? text('Runic bow', 'Runiczny łuk') : c.weapon === 'axe' ? text('Heavy axe', 'Ciężki topór') : c.weapon === 'staff' ? text('Arcane staff', 'Magiczny kostur') : text('Tidal magic', 'Magia przypływu'))}</small></button>`).join('')}</div><div class="class-detail"><p>${esc(l(chosen.desc))}</p><p>${esc(l(chosen.origin))}</p><div class="skill-chips">${chosen.skills.map((s) => `<span class="chip" title="${esc(l(s.desc))}">${esc(l(s.name))}</span>`).join('')}</div></div><div class="button-row">${btn('begin-class', text('Begin a new journey', 'Rozpocznij nową podróż'), 'primary')}${btn('close', text('Continue current journey', 'Kontynuuj obecną podróż'))}</div><p class="credits">${text('Starting a new journey replaces the current campaign save. Your audio and language settings are kept.', 'Nowa podróż zastępuje zapis obecnej kampanii. Ustawienia dźwięku i języka zostają zachowane.')}</p>`,
    );
  } else if (name === 'inventory' || name === 'camp') {
    const camp = name === 'camp',
      slots = {
        weapon: text('Weapon', 'Broń'),
        armor: text('Armor', 'Pancerz'),
        charm: text('Talisman', 'Talizman'),
      };
    const equip = `<div class="equip-grid">${Object.entries(slots)
      .map(([slot, label]) => {
        const it = game.equipment[slot];
        return `<div class="equip-slot"><small>${label}</small><b style="color:${it ? hex(it.color) : '#829790'}">${it ? esc(itemName(it)) : text('Empty slot', 'Puste miejsce')}</b><div class="item-stat">${it ? itemStats(it) : '—'}</div>${camp && it ? `<div class="button-row">${btn('forge', it.forged >= 5 ? text('Masterwork', 'Arcydzieło') : text(`Temper · ${40 * (it.forged + 1)} ◆`, `Wzmocnij · ${40 * (it.forged + 1)} ◆`), 'secondary', `data-slot="${slot}" ${it.forged >= 5 || game.gold < 40 * (it.forged + 1) ? 'disabled' : ''}`)}</div>` : ''}</div>`;
      })
      .join('')}</div>`;
    const inventory = game.inventory.length
      ? `<div class="inventory-grid">${game.inventory.map((it) => `<div class="inventory-item"><b style="color:${hex(it.color)}">${esc(itemName(it))}</b><div class="item-stat">${esc(l(RARITIES[it.rarity].name))} · ${itemStats(it)}</div><div class="button-row">${btn('equip', text('Equip', 'Załóż'), 'secondary', `data-id="${it.id}"`)}${btn('salvage', `${text('Salvage', 'Rozłóż')} · ${it.value} ◆`, 'secondary', `data-id="${it.id}"`)}</div></div>`).join('')}</div>`
      : `<div class="empty">${text('Open caches and defeat enemies to discover equipment. Walk over glowing loot to collect it.', 'Otwieraj skrytki i pokonuj wrogów, aby znajdować wyposażenie. Przejdź przez świecący łup, aby go zebrać.')}</div>`;
    html = modalShell(
      camp
        ? text('The lantern refuge', 'Przystań latarni')
        : text('Relics of the deep', 'Relikty głębin'),
      camp
        ? text(
            'Rest a moment. Tamsin can temper your equipped relics up to five times.',
            'Odpocznij chwilę. Tamsin może pięciokrotnie wzmocnić twoje założone relikty.',
          )
        : text(
            'Equip stronger relics. Salvage what you leave behind into gold for the forge.',
            'Zakładaj silniejsze relikty. Rozkładaj zbędne znaleziska na złoto potrzebne w kuźni.',
          ),
      `<div class="stats-grid"><div class="stat-box"><b>${h.damage}</b><small>${text('DAMAGE', 'OBRAŻENIA')}</small></div><div class="stat-box"><b>${h.armor || 0}</b><small>${text('ARMOR', 'PANCERZ')}</small></div><div class="stat-box"><b>${h.maxHp}</b><small>${text('VITALITY', 'ŻYWOTNOŚĆ')}</small></div><div class="stat-box"><b>${game.gold} ◆</b><small>${text('GOLD', 'ZŁOTO')}</small></div></div>${equip}${camp ? `<div class="button-row">${btn('buy-potion', text('Healing potion · 25 ◆', 'Mikstura leczenia · 25 ◆'), 'secondary', game.gold < 25 || game.potions >= 15 ? 'disabled' : '')}${btn('rest', text('Rest by the lantern', 'Odpocznij przy latarni'), 'secondary', game.combat ? 'disabled' : '')}</div>` : ''}<div class="divider"></div><h3>${text('Satchel', 'Sakwa')} <small>${game.inventory.length}/24</small></h3>${inventory}`,
    );
  } else if (name === 'talents') {
    const talents = [
      [
        'might',
        '⚔',
        text('Resolve', 'Determinacja'),
        text('+3 weapon damage per rank.', '+3 obrażenia broni na rangę.'),
      ],
      [
        'vitality',
        'ᛉ',
        text('Endurance', 'Wytrzymałość'),
        text('+16 maximum health per rank.', '+16 maksymalnego zdrowia na rangę.'),
      ],
      [
        'focus',
        'ᛟ',
        text('Attunement', 'Zestrojenie'),
        text(
          '+12 mana, faster regeneration and shorter skill cooldowns.',
          '+12 many, szybsza regeneracja i krótszy czas odnowienia umiejętności.',
        ),
      ],
    ];
    html = modalShell(
      text('Shape your legend', 'Ukształtuj swoją legendę'),
      text(
        `Choose a lasting strength. ${game.talentPoints} unspent talent points.`,
        `Wybierz trwałe wzmocnienie. Niewydane punkty talentów: ${game.talentPoints}.`,
      ),
      `<div class="talent-grid">${talents.map(([id, glyph, title, desc]) => `<div class="talent-card"><span class="glyph">${glyph}</span><h3>${title}</h3><p>${desc}</p><p>${game.talents[id]} / 10</p>${btn('talent', text('Learn · 1 point', 'Rozwiń · 1 punkt'), 'secondary', `data-id="${id}" ${game.talentPoints < 1 || game.talents[id] >= 10 ? 'disabled' : ''}`)}</div>`).join('')}</div><p class="credits">${text('Every level restores your health and mana and grants one talent point. Talents are saved with this hero.', 'Każdy poziom odnawia zdrowie i manę oraz daje jeden punkt talentu. Talenty zapisują się z tym bohaterem.')}</p>`,
    );
  } else if (name === 'journal') {
    let body = '';
    if (journalTab === 'story') {
      body = CHAPTERS.slice(0, Math.ceil(game.floor / 2))
        .map(
          (c, i) =>
            `<article class="lore-entry"><div class="eyebrow">${text('CHAPTER', 'ROZDZIAŁ')} ${i + 1}</div><h3>${esc(l(c.name))}</h3><p>${esc(l(c.story))}</p></article>`,
        )
        .join('');
    } else if (journalTab === 'lore') {
      body =
        game.lore
          .map((key) => {
            const [id, index] = key.split(':'),
              entry = CHAPTERS.find((c) => c.id === id)?.lore[Number(index)];
            return entry
              ? `<article class="lore-entry"><h3>${esc(l(entry.title))}</h3><p>${esc(l(entry.text))}</p></article>`
              : '';
          })
          .join('') ||
        `<div class="empty">${text('Seek floating manuscripts in the dungeon. Each holds a piece of the truth.', 'Szukaj lewitujących manuskryptów w lochu. Każdy kryje fragment prawdy.')}</div>`;
    } else {
      body = `<div class="bestiary-grid">${Object.entries(game.kills)
        .filter(([, n]) => n > 0)
        .map(([id, n]) => {
          const e = ENEMIES[id];
          return e
            ? `<div class="beast"><strong>${esc(l(e.name))}</strong><small>${n} ${text('released', 'uwolnionych')} · ${esc(l(e.lore || e.tip))}</small></div>`
            : '';
        })
        .join('')}</div>`;
      if (!game.totalKills)
        body = `<div class="empty">${text('Defeated creatures will be recorded here.', 'Pokonane istoty zostaną tutaj opisane.')}</div>`;
    }
    html = modalShell(
      text('The lantern chronicle', 'Kronika latarni'),
      text(
        'A city built on a promise. A truth buried beneath twelve floors.',
        'Miasto zbudowane na obietnicy. Prawda pogrzebana pod dwunastoma poziomami.',
      ),
      `<div class="tabs">${[
        ['story', text('Campaign', 'Kampania')],
        ['lore', text('Memories', 'Wspomnienia')],
        ['bestiary', text('Bestiary', 'Bestiariusz')],
      ]
        .map(([id, label]) =>
          btn('journal-tab', label, journalTab === id ? 'active' : '', `data-id="${id}"`),
        )
        .join('')}</div>${body}`,
    );
  } else if (name === 'lore') {
    const entry = game.chapter.lore[data];
    html = modalShell(
      l(entry.title),
      text('A memory preserved in runic ink.', 'Wspomnienie zachowane w runicznym atramencie.'),
      `<p class="dialogue-text">${esc(l(entry.text))}</p><div class="button-row">${btn('close', text('Carry this memory', 'Zachowaj wspomnienie'), 'primary')}</div>`,
    );
  } else if (name === 'dialogue') {
    html = modalShell(
      l(game.chapter.name),
      l(game.chapter.subtitle),
      `${game.chapter.dialogue
        .slice(0, game.floor % 2 === 0 && !game.enemies.some((e) => e.boss && !e.dead) ? 2 : 1)
        .map(
          (d) =>
            `<div class="dialogue-speaker">${esc(l(d.speaker))}</div><p class="dialogue-text">${esc(l(d.text))}</p>`,
        )
        .join(
          '',
        )}<div class="button-row">${btn('close', text('I will find the truth', 'Odnajdę prawdę'), 'primary')}${btn('camp', text('Visit the refuge', 'Odwiedź przystań'))}</div>`,
    );
  } else if (name === 'choice') {
    const c = STORY_CHOICES.find((c) => c.id === data);
    html = modalShell(
      l(c.title),
      l(c.text || c.prompt),
      `${c.options.map((o) => `<button class="choice" data-action="story-choice" data-id="${o.id}" data-choice="${c.id}">${esc(l(o.text))}<small>${esc(l(o.desc))}</small></button>`).join('')}<p class="credits">${text('This decision shapes the city’s future. There is no payment or random outcome.', 'Ta decyzja kształtuje przyszłość miasta. Nie wymaga płatności ani nie zależy od losowania.')}</p>`,
      text('A CHOICE THAT ENDURES', 'WYBÓR, KTÓRY POZOSTANIE'),
      false,
    );
  } else if (name === 'dead') {
    html = modalShell(
      text('The lantern still burns', 'Latarnia nadal płonie'),
      text(
        'Your story does not end here. Return to this floor’s refuge with your equipment and experience. The journey costs 10% of your gold.',
        'Twoja historia tutaj się nie kończy. Wróć do przystani na tym poziomie z wyposażeniem i doświadczeniem. Powrót kosztuje 10% złota.',
      ),
      `<div class="ending-mark">ᛉ</div><p class="intro">${esc(l(TIPS[game.deaths % TIPS.length]))}</p><div class="button-row">${btn('revive', text('Rise again', 'Powstań ponownie'), 'primary')}</div>`,
      text('ANOTHER CHANCE', 'KOLEJNA SZANSA'),
      false,
    );
  } else if (name === 'victory') {
    const ending = ENDINGS[resolveEnding(game.choices)];
    html = modalShell(
      l(ending.title),
      text('You have reached the end of The Hollow Covenant.', 'Dotarłeś do końca Pustego Paktu.'),
      `<div class="ending-mark">ᛟ</div><p class="dialogue-text">${esc(l(ending.text))}</p><div class="stats-grid"><div class="stat-box"><b>12</b><small>${text('DEPTHS', 'POZIOMÓW')}</small></div><div class="stat-box"><b>${game.totalKills}</b><small>${text('ECHOES FREED', 'UWOLNIONYCH ECH')}</small></div><div class="stat-box"><b>${h.level}</b><small>${text('HERO LEVEL', 'POZIOM BOHATERA')}</small></div><div class="stat-box"><b>${Math.floor(game.time / 60)}m</b><small>${text('JOURNEY', 'PODRÓŻ')}</small></div></div><div class="button-row">${btn('characters', text('Follow another path', 'Podążaj inną drogą'), 'primary')}</div><p class="credits">${text('An original world, procedural 3D artwork and original synthesized score. Thank you for carrying the lantern.', 'Autorski świat, proceduralna grafika 3D i oryginalna muzyka syntezowana. Dziękujemy za niesienie latarni.')}</p>`,
      text('THE COVENANT IS UNBOUND', 'PAKT ZOSTAŁ ROZWIĄZANY'),
      false,
    );
  } else {
    html = modalShell(
      text('A moment by the fire', 'Chwila przy ogniu'),
      text(
        'The dungeon waits. Your progress is saved automatically.',
        'Loch czeka. Twój postęp zapisuje się automatycznie.',
      ),
      `<div class="button-row">${btn('close', text('Return to the depths', 'Wróć do głębin'), 'primary')}${btn('characters', text('Choose hero', 'Wybierz bohatera'))}${btn('journal', text('Read the chronicle', 'Czytaj kronikę'))}</div><div class="divider"></div><div class="settings-row"><label for="setting-lang">${text('Language', 'Język')}</label><select id="setting-lang"><option value="en" ${lang === 'en' ? 'selected' : ''}>English</option><option value="pl" ${lang === 'pl' ? 'selected' : ''}>Polski</option></select></div><div class="settings-row"><label for="setting-music">${text('Music', 'Muzyka')}</label><input id="setting-music" type="range" min="0" max="1" step=".05" value="${prefs.music}"></div><div class="settings-row"><label for="setting-sfx">${text('Sound effects', 'Efekty dźwiękowe')}</label><input id="setting-sfx" type="range" min="0" max="1" step=".05" value="${prefs.sfx}"></div><div class="settings-row"><label for="setting-quality">${text('Graphics', 'Grafika')}</label><select id="setting-quality"><option value="high" ${prefs.quality === 'high' ? 'selected' : ''}>${text('High', 'Wysoka')}</option><option value="low" ${prefs.quality === 'low' ? 'selected' : ''}>${text('Performance', 'Wydajność')}</option></select></div><div class="settings-row"><label for="setting-zoom">${text('Camera zoom', 'Przybliżenie kamery')}</label><input id="setting-zoom" type="range" min=".8" max="1.35" step=".05" value="${prefs.zoom || 1}"></div><div class="settings-row"><label for="setting-motion">${text('Reduce motion', 'Ogranicz animacje')}</label><input id="setting-motion" type="checkbox" ${prefs.reducedMotion ? 'checked' : ''}></div><div class="divider"></div><p class="intro">${text('WASD / arrows — move · Left click — walk or attack · Hold Enter — attack · 1, 2, 3 — abilities · Space — dodge · Q — potion · E — interact · I — inventory · J — journal · T — talents · Esc — pause.', 'WASD / strzałki — ruch · Lewy przycisk myszy — ruch lub atak · Przytrzymaj Enter — atak · 1, 2, 3 — umiejętności · Spacja — unik · Q — mikstura · E — interakcja · I — ekwipunek · J — dziennik · T — talenty · Esc — pauza.')}</p><p class="credits">${text('Fantasy combat without gore. No purchases or advertisements. Original campaign & procedural art. Three.js · MIT license.', 'Walka fantasy bez drastycznych scen. Bez zakupów i reklam. Autorska kampania i grafika proceduralna. Three.js · licencja MIT.')}</p>`,
    );
  }
  $('modal-root').innerHTML = html;
}
$('modal-root').addEventListener('click', (e) => {
  const b = e.target.closest('[data-action]');
  if (!b || b.disabled) return;
  audio.unlockAudio();
  audio.uiSound();
  const a = b.dataset.action,
    id = b.dataset.id;
  if (a === 'close') {
    closePanel();
    return;
  }
  if (a === 'select-class') {
    selectedClass = id;
    renderPanel();
    return;
  }
  if (a === 'begin-class') {
    panel = null;
    game.mode = 'playing';
    $('modal-root').hidden = true;
    newGame(selectedClass);
    return;
  }
  if (a === 'equip') game.equip(Number(id));
  else if (a === 'salvage') game.salvage(Number(id));
  else if (a === 'forge') game.forge(b.dataset.slot);
  else if (a === 'buy-potion') game.buyPotion();
  else if (a === 'talent') game.talent(id);
  else if (a === 'rest') {
    if (!game.combat) {
      game.hero.hp = game.hero.maxHp;
      game.hero.mana = game.hero.maxMana;
      save();
      toast(text('Restored. The road awaits.', 'Siły odnowione. Droga czeka.'));
    }
  } else if (a === 'journal-tab') journalTab = id;
  else if (a === 'revive') {
    game.revive();
    return;
  } else if (a === 'story-choice') {
    const c = STORY_CHOICES.find((c) => c.id === b.dataset.choice),
      option = c.options.find((o) => o.id === id);
    game.choices[c.id] = option.effect;
    toast(l(option.response));
    nextFloor();
    return;
  } else {
    openPanel(a);
    return;
  }
  renderPanel();
  renderHUD();
});
$('modal-root').addEventListener('input', (e) => {
  const el = e.target;
  if (el.id === 'setting-lang') {
    setLanguage(el.value);
    return;
  }
  if (el.id === 'setting-music') prefs.music = Number(el.value);
  if (el.id === 'setting-sfx') prefs.sfx = Number(el.value);
  if (el.id === 'setting-quality') prefs.quality = el.value;
  if (el.id === 'setting-zoom') prefs.zoom = Number(el.value);
  if (el.id === 'setting-motion') prefs.reducedMotion = el.checked;
  applyPrefs();
  persistPrefs();
});
function worldMovement() {
  let x =
      (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) -
      (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0) +
      stick.x,
    y =
      (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) -
      (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) +
      stick.y;
  return { x: (x + y) * Math.SQRT1_2, y: (y - x) * Math.SQRT1_2 };
}
function dismissTutorial() {
  prefs.tutorial = true;
  $('onboarding').hidden = true;
  persistPrefs();
}
window.addEventListener('keydown', (e) => {
  if (!booted) return;
  if (e.code === 'Tab' && panel) {
    const focusables = [...$('modal-root').querySelectorAll('button:not(:disabled),input,select')];
    const first = focusables[0],
      last = focusables.at(-1);
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last?.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first?.focus();
    }
    return;
  }
  if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName) && e.code !== 'Escape') return;
  audio.unlockAudio();
  if (e.code === 'Escape') {
    if (panel) closePanel();
    else openPanel('pause');
    return;
  }
  if (panel) {
    return;
  }
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter'].includes(e.code))
    e.preventDefault();
  keys.add(e.code);
  if (e.repeat) return;
  const m = worldMovement();
  if (
    ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(
      e.code,
    )
  )
    dismissTutorial();
  if (e.code === 'Digit1') game.skill(0, pointer.world);
  if (e.code === 'Digit2') game.skill(1, pointer.world);
  if (e.code === 'Digit3') game.skill(2, pointer.world);
  if (e.code === 'Space') game.dodge(m.x, m.y);
  if (e.code === 'KeyQ') game.potion();
  if (e.code === 'KeyE') {
    dismissTutorial();
    game.interact();
  }
  const panels = { KeyI: 'inventory', KeyJ: 'journal', KeyT: 'talents', KeyC: 'characters' };
  if (panels[e.code]) openPanel(panels[e.code]);
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('pointermove', (e) => {
  pointer.x = e.clientX;
  pointer.y = e.clientY;
  pointer.world = renderer?.screenToWorld(e.clientX, e.clientY);
});
canvas.addEventListener('pointerdown', (e) => {
  if (!booted || panel) return;
  e.preventDefault();
  audio.unlockAudio();
  dismissTutorial();
  pointer.world = renderer.screenToWorld(e.clientX, e.clientY);
  if (!pointer.world) return;
  if (e.button === 2) {
    game.skill(0, pointer.world);
    return;
  }
  const enemy = game.enemies
    .filter((x) => !x.dead && distance(x, pointer.world) < 1.05 && distance(x, game.hero) < 14)
    .sort((a, b) => distance(a, pointer.world) - distance(b, pointer.world))[0];
  const object = game.objects.find((x) => !x.used && distance(x, pointer.world) < 1.15);
  if (enemy) {
    game.attackTarget = enemy;
    game.moveTarget = null;
    if (distance(enemy, game.hero) <= game.hero.range) game.attack(enemy);
  } else if (object && distance(object, game.hero) < 2.15) game.interact(object.id);
  else game.clickMove(pointer.world);
});
function bind(id, fn) {
  $(id).addEventListener('click', () => {
    if (!booted) return;
    audio.unlockAudio();
    fn();
  });
}
bind('pause-button', () => (panel ? closePanel() : openPanel('pause')));
bind('language-button', () => setLanguage(lang === 'en' ? 'pl' : 'en'));
bind('audio-button', () => {
  prefs.muted = !prefs.muted;
  applyPrefs();
  persistPrefs();
});
bind('inventory-button', () => openPanel('inventory'));
bind('journal-button', () => openPanel('journal'));
bind('talents-button', () => openPanel('talents'));
bind('character-button', () => {
  selectedClass = game.class.id;
  openPanel('characters');
});
bind('interact-button', () => {
  dismissTutorial();
  game.interact();
});
bind('dismiss-tutorial', dismissTutorial);
bind('potion-button', () => game.potion());
bind('dodge-button', () => {
  const m = worldMovement();
  game.dodge(m.x, m.y);
});
for (let i = 0; i < 3; i++) bind('skill-' + i, () => game.skill(i, pointer.world));
bind('basic-button', () => game.attack(pointer.world));
$('basic-button').addEventListener('pointerdown', (e) => {
  if (!booted || panel) return;
  audio.unlockAudio();
  keys.add('Enter');
  e.target.setPointerCapture?.(e.pointerId);
});
for (const type of ['pointerup', 'pointercancel'])
  $('basic-button').addEventListener(type, () => keys.delete('Enter'));
const joy = $('touch-stick');
function updateStick(e) {
  const r = joy.getBoundingClientRect(),
    dx = e.clientX - r.x - r.width / 2,
    dy = e.clientY - r.y - r.height / 2,
    d = Math.hypot(dx, dy),
    max = r.width * 0.34;
  stick = { x: dx / Math.max(max, d), y: dy / Math.max(max, d) };
  joy.firstElementChild.style.transform = `translate(${stick.x * max}px,${stick.y * max}px)`;
}
joy.addEventListener('pointerdown', (e) => {
  if (panel) return;
  stickId = e.pointerId;
  joy.setPointerCapture(e.pointerId);
  audio.unlockAudio();
  dismissTutorial();
  updateStick(e);
});
joy.addEventListener('pointermove', (e) => {
  if (e.pointerId === stickId) updateStick(e);
});
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'])
  joy.addEventListener(type, () => {
    stickId = null;
    stick = { x: 0, y: 0 };
    joy.firstElementChild.style.transform = '';
  });
function lifecyclePause() {
  if (!booted) return;
  keys.clear();
  stick = { x: 0, y: 0 };
  game.input.attack = false;
  save();
  if (game.mode === 'playing') {
    pausedByLifecycle = true;
    openPanel('pause');
  }
  sdk.gameplayStop();
  audio.pauseAudio();
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) lifecyclePause();
});
window.addEventListener('blur', lifecyclePause);
window.addEventListener('pagehide', () => {
  save();
  audio.pauseAudio();
  sdk.gameplayStop();
});
window.addEventListener('resize', () => renderer?.resize());
function loop(now) {
  const elapsed = frameTime ? Math.max(0.001, (now - frameTime) / 1000) : 1 / 60,
    dt = Math.min(0.05, elapsed);
  frameTime = now;
  if (booted && !document.hidden) {
    if (game.mode === 'playing') {
      const m = worldMovement();
      game.input = {
        ...game.input,
        x: m.x,
        y: m.y,
        attack: keys.has('Enter'),
        target: pointer.world,
      };
      game.tick(dt);
      if (game.hero.moving && game.time - lastStep > 0.28) {
        audio.stepSound();
        lastStep = game.time;
      }
      audio.setMood(Math.floor((game.floor - 1) / 2), game.combat ? 1 : 0);
      audio.updateAudio(dt);
      if (game.time - lastSave > 8) save();
    }
    renderer.render(game, dt);
    if (now - lastUI > 90) {
      renderHUD();
      lastUI = now;
    }
    if (renderer.project) {
      $('combat-text').innerHTML = game.floaters
        .map((f) => {
          const p = renderer.project(f.x, f.y, 1.6 + (1.1 - f.life) * 0.8);
          return `<span class="floater" style="left:${p.x}px;top:${p.y}px;color:${f.color};opacity:${Math.min(1, f.life * 2)}">${esc(f.text)}</span>`;
        })
        .join('');
    }
    frameSamples.push(elapsed);
    if (frameSamples.length > 120) frameSamples.shift();
    fps = Math.round(1 / (frameSamples.reduce((a, b) => a + b, 0) / frameSamples.length));
  }
  requestAnimationFrame(loop);
}
async function boot() {
  try {
    await sdk.initSDK();
    sdk.loadingStart();
    try {
      const raw = JSON.parse(sdk.loadData(PREF));
      if (raw && typeof raw === 'object') {
        prefs = { ...prefs, ...raw };
        prefs.music = Math.max(0, Math.min(1, Number(prefs.music) || 0));
        prefs.sfx = Math.max(0, Math.min(1, Number(prefs.sfx) || 0));
      }
    } catch {}
    lang =
      prefs.language === 'pl'
        ? 'pl'
        : prefs.language === 'en'
          ? 'en'
          : String(sdk.getSystemLocale?.() || 'en')
                .toLowerCase()
                .startsWith('pl')
            ? 'pl'
            : 'en';
    renderer = new DungeonRenderer(canvas, {
      onContextLost: () => {
        lifecyclePause();
        toast(
          text(
            'Graphics interrupted. Waiting for the browser to restore the scene.',
            'Grafika wstrzymana. Czekamy na odtworzenie sceny przez przeglądarkę.',
          ),
        );
      },
      onContextRestored: () => {
        renderer.build(game);
        toast(text('Scene restored. Resume when ready.', 'Scena odtworzona. Możesz wznowić grę.'));
      },
    });
    renderer.setQuality(prefs.quality);
    await renderer.loadAssets(game);
    game = Game.restore(sdk.loadData(SAVE), event) || new Game({ onEvent: event });
    selectedClass = game.class.id;
    applyPrefs();
    renderer.build(game);
    audio.setPlatformMuted(sdk.getMuteSetting());
    sdk.onSettingsChange((s) => audio.setPlatformMuted(s.muteAudio));
    booted = true;
    $('loading').hidden = true;
    $('hud').hidden = false;
    $('onboarding').hidden = !!prefs.tutorial;
    updateLanguage();
    sdk.loadingStop();
    if (game.completed) openPanel('victory');
    else if (game.mode === 'dead') openPanel('dead');
    else sdk.gameplayStart();
    announce();
    requestAnimationFrame(loop);
    if (new URLSearchParams(location.search).get('qa') === '1')
      window.__RUNIC = {
        get game() {
          return game;
        },
        get renderer() {
          return renderer;
        },
        snapshot: () => ({
          mode: game.mode,
          floor: game.floor,
          hero: { ...game.hero },
          enemies: game.enemies.filter((e) => !e.dead).length,
          lang,
          panel: panel?.name || null,
          fps,
          sdk: sdk.getSDKStatus(),
          audio: audio.getAudioStatus(),
        }),
        openPanel,
        newGame,
        step: (dt) => game.tick(dt),
        save,
        setLanguage,
      };
  } catch (error) {
    console.error(error);
    $('loading').innerHTML =
      `<div class="rune-mark">ᛟ</div><h1>RUNIC DEPTHS</h1><p style="max-width:460px;text-align:center;letter-spacing:1px">${text('The 3D renderer could not start. Enable hardware acceleration or use a WebGL-enabled browser, then reload.', 'Nie można uruchomić grafiki 3D. Włącz przyspieszenie sprzętowe lub użyj przeglądarki z WebGL, a następnie odśwież.')}</p><button class="primary" id="retry">${text('Reload', 'Odśwież')}</button>`;
    $('retry').onclick = () => location.reload();
  }
}
boot();
