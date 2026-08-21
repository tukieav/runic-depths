// gfx.js — procedural art: pixel sprites, textured tiles, lighting, UI chrome
// All art generated at boot into offscreen canvases. Zero asset files.

export const TILE = 40;
const PIX = 16; // sprite grid

function mkCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  return [c, g];
}

// deterministic per-tile noise
export function noise(x, y, seed = 0) {
  const n = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
  return n - Math.floor(n);
}

// ---------------------------------------------------------------- BIOMES
export const BIOMES = [
  { // 0: stone halls (depth 1-3)
    name: 'stone',
    floorBase: [72, 66, 76], floorVar: 16, grout: 'rgba(20,16,26,0.5)',
    moss: 'rgba(84,124,66,0.5)', mossChance: 0.14,
    wallTop: [116, 110, 130], wallFace: [52, 47, 62], mortar: 'rgba(14,10,22,0.85)',
    crack: 'rgba(10,8,16,0.5)',
  },
  { // 1: crypt (depth 4-6)
    name: 'crypt',
    floorBase: [62, 74, 64], floorVar: 14, grout: 'rgba(10,18,12,0.55)',
    moss: 'rgba(106,150,80,0.55)', mossChance: 0.24,
    wallTop: [96, 120, 100], wallFace: [42, 56, 46], mortar: 'rgba(8,16,10,0.85)',
    crack: 'rgba(6,12,8,0.55)',
  },
  { // 2: infernal depths (depth 7+)
    name: 'lava',
    floorBase: [84, 58, 50], floorVar: 18, grout: 'rgba(28,12,8,0.55)',
    moss: 'rgba(255,110,40,0.45)', mossChance: 0.12, // embers instead of moss
    wallTop: [134, 82, 62], wallFace: [64, 36, 28], mortar: 'rgba(26,8,4,0.9)',
    crack: 'rgba(255,120,40,0.35)',
  },
];
export function biomeIndex(depth) { return Math.min(2, ((depth - 1) / 3) | 0); }

// Pre-rendered tile variants: floors[biome][v], walls[biome][v]
const N_FLOOR = 6, N_WALL = 4;
export const floors = [], walls = [], wallFills = [];

function bakeFloor(b, v) {
  const [c, g] = mkCanvas(TILE, TILE);
  const [r0, g0, b0] = b.floorBase;
  const shade = (noise(v, 7, 3) - 0.5) * b.floorVar * 2;
  g.fillStyle = `rgb(${r0 + shade | 0},${g0 + shade | 0},${b0 + shade | 0})`;
  g.fillRect(0, 0, TILE, TILE);
  // stone slab pattern: 2x2 slabs with grout, offset per variant
  g.strokeStyle = b.grout; g.lineWidth = 2;
  const off = (v % 2) * 10;
  g.strokeRect(-2, -2, TILE + 4, TILE + 4);
  g.beginPath();
  g.moveTo(0, TILE / 2 + (v % 3) * 2 - 2); g.lineTo(TILE, TILE / 2 + (v % 3) * 2 - 2);
  g.moveTo(TILE / 2 + off - 5, 0); g.lineTo(TILE / 2 + off - 5, TILE / 2);
  g.moveTo(TILE / 4 + off, TILE / 2); g.lineTo(TILE / 4 + off, TILE);
  g.stroke();
  // per-pixel speckle
  for (let i = 0; i < 26; i++) {
    const px = noise(i, v, 11) * TILE, py = noise(v, i, 13) * TILE;
    const s = (noise(i, v, 17) - 0.5) * 26;
    g.fillStyle = `rgba(${r0 + s | 0},${g0 + s | 0},${b0 + s | 0},0.7)`;
    g.fillRect(px | 0, py | 0, 2, 2);
  }
  // edge highlight top-left (subtle relief)
  g.fillStyle = 'rgba(255,255,255,0.045)';
  g.fillRect(0, 0, TILE, 2); g.fillRect(0, 0, 2, TILE);
  g.fillStyle = 'rgba(0,0,0,0.12)';
  g.fillRect(0, TILE - 2, TILE, 2); g.fillRect(TILE - 2, 0, 2, TILE);
  // moss / embers / crack decals
  if (noise(v, 3, 23) < b.mossChance * 3 && v >= 3) {
    g.fillStyle = b.moss;
    const mx = 6 + noise(v, 5, 29) * 22, my = 6 + noise(v, 9, 31) * 22;
    for (let i = 0; i < 7; i++) {
      g.fillRect(mx + (noise(i, v, 37) - 0.5) * 14 | 0, my + (noise(v, i, 41) - 0.5) * 12 | 0, 3, 2);
    }
  }
  if (v === 5) { // cracked variant
    g.strokeStyle = b.crack; g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(8, 6); g.lineTo(16, 15); g.lineTo(13, 24); g.lineTo(22, 34);
    g.moveTo(16, 15); g.lineTo(25, 18);
    g.stroke();
  }
  return c;
}

function bakeWall(b, v) {
  const [c, g] = mkCanvas(TILE, TILE);
  const [tr, tg, tb] = b.wallTop, [fr, fg, fb] = b.wallFace;
  const TOPH = 12; // visible top cap of the wall
  // front face: bricks
  g.fillStyle = `rgb(${fr},${fg},${fb})`;
  g.fillRect(0, TOPH, TILE, TILE - TOPH);
  const rows = 3, bh = (TILE - TOPH) / rows;
  for (let r = 0; r < rows; r++) {
    const y = TOPH + r * bh;
    const offs = (r % 2) * (TILE / 4) + (v * 7 % 11);
    g.strokeStyle = b.mortar; g.lineWidth = 2;
    g.beginPath(); g.moveTo(0, y); g.lineTo(TILE, y); g.stroke();
    for (let bx = -1; bx < 3; bx++) {
      const x = ((bx * (TILE / 2) + offs) % (TILE + TILE / 2)) - 4;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + bh); g.stroke();
      // brick shading — lighter top edge per brick for relief
      const s = (noise(bx + v * 5, r, 47) - 0.5) * 20;
      g.fillStyle = `rgba(${fr + s + 14 | 0},${fg + s + 12 | 0},${fb + s + 16 | 0},0.85)`;
      g.fillRect(x + 2, y + 2, TILE / 2 - 4, bh - 4);
      g.fillStyle = 'rgba(255,255,255,0.07)';
      g.fillRect(x + 2, y + 2, TILE / 2 - 4, 2);
    }
  }
  // top cap: lighter (light from above)
  const grd = g.createLinearGradient(0, 0, 0, TOPH);
  grd.addColorStop(0, `rgb(${tr},${tg},${tb})`);
  grd.addColorStop(1, `rgb(${tr - 18},${tg - 18},${tb - 18})`);
  g.fillStyle = grd;
  g.fillRect(0, 0, TILE, TOPH);
  for (let i = 0; i < 10; i++) {
    const s = (noise(i, v, 53) - 0.5) * 26;
    g.fillStyle = `rgba(${tr + s | 0},${tg + s | 0},${tb + s | 0},0.8)`;
    g.fillRect(noise(v, i, 59) * TILE | 0, noise(i, v, 61) * TOPH | 0, 3, 2);
  }
  g.fillStyle = 'rgba(0,0,0,0.4)';
  g.fillRect(0, TOPH, TILE, 2);
  // bottom shadow onto floor below
  g.fillStyle = 'rgba(0,0,0,0.32)';
  g.fillRect(0, TILE - 3, TILE, 3);
  if (b.name === 'lava' && v === 3) { // glowing fissure
    g.strokeStyle = 'rgba(255,140,50,0.8)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(10, TOPH + 4); g.lineTo(18, TOPH + 12); g.lineTo(14, TOPH + 20); g.stroke();
  }
  return c;
}

// wall fill (interior rock mass — used when no floor below): dark cobble top-face
function bakeWallFill(b, v) {
  const [c, g] = mkCanvas(TILE, TILE);
  const [tr, tg, tb] = b.wallTop;
  const dr = tr * 0.42 | 0, dg = tg * 0.42 | 0, db = tb * 0.42 | 0;
  g.fillStyle = `rgb(${dr},${dg},${db})`;
  g.fillRect(0, 0, TILE, TILE);
  // big irregular cobbles
  for (let i = 0; i < 7; i++) {
    const cx = noise(i, v, 71) * TILE, cy = noise(v, i, 73) * TILE;
    const rr = 6 + noise(i, v, 79) * 9;
    const s = (noise(i * 3, v, 83) - 0.5) * 20;
    g.fillStyle = `rgba(${dr + s + 8 | 0},${dg + s + 8 | 0},${db + s + 10 | 0},0.9)`;
    g.beginPath(); g.ellipse(cx, cy, rr, rr * 0.8, noise(i, v, 89) * 3, 0, 7); g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 1.5; g.stroke();
  }
  g.fillStyle = 'rgba(0,0,0,0.18)';
  g.fillRect(0, 0, TILE, TILE);
  return c;
}

// unexplored rock mass — textured dark cobble, never pure black
export let voidTile;
function bakeVoid() {
  const [c, g] = mkCanvas(TILE, TILE);
  g.fillStyle = '#211d30';
  g.fillRect(0, 0, TILE, TILE);
  // chunky rock cobbles
  for (let i = 0; i < 8; i++) {
    const cx = noise(i, 1, 71) * TILE, cy = noise(1, i, 73) * TILE;
    const rr = 5 + noise(i, 2, 79) * 8;
    const s = (noise(i, 3, 83) - 0.5) * 14;
    g.fillStyle = `rgb(${40 + s | 0},${36 + s | 0},${54 + s | 0})`;
    g.beginPath(); g.ellipse(cx, cy, rr, rr * 0.75, noise(i, 4, 89) * 3, 0, 7); g.fill();
    g.strokeStyle = 'rgba(6,4,12,0.5)'; g.lineWidth = 1.5; g.stroke();
  }
  for (let i = 0; i < 14; i++) {
    g.fillStyle = `rgba(${40 + noise(i, 1, 3) * 16 | 0},${36 + noise(i, 2, 5) * 12 | 0},${56 + noise(i, 3, 7) * 16 | 0},0.55)`;
    g.fillRect(noise(i, 4, 9) * TILE | 0, noise(i, 5, 11) * TILE | 0, 3, 3);
  }
  return c;
}

// ---------------------------------------------------------------- SPRITES
// 16x16 pixel maps. '.' = transparent. Palette per sprite.
const SPRITES = {};

function bakeSprite(rows, pal, scale = 2.4) {
  const w = rows[0].length, h = rows.length;
  const [c, g] = mkCanvas(Math.ceil(w * scale), Math.ceil(h * scale));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const ch = rows[y][x];
    if (ch === '.' || !pal[ch]) continue;
    g.fillStyle = pal[ch];
    g.fillRect(Math.floor(x * scale), Math.floor(y * scale), Math.ceil(scale), Math.ceil(scale));
  }
  // white flash variant
  const [wc, wg] = mkCanvas(c.width, c.height);
  wg.drawImage(c, 0, 0);
  wg.globalCompositeOperation = 'source-in';
  wg.fillStyle = '#ffffff';
  wg.fillRect(0, 0, wc.width, wc.height);
  return { img: c, flash: wc, w: c.width, h: c.height };
}

const GOBLIN = [
'................',
'................',
'..o..........o..',
'.ogo........ogo.',
'.oggo..oo..oggo.',
'..oggooGGooggo..',
'...oGGGGGGGGo...',
'...oGrGGGGrGo...',
'...oGGGGGGGGo...',
'....oGGwwGGo....',
'.....oGGGGo.....',
'....oGGGGGGo....',
'...oGGoooGGGo...',
'...oGo...oGGo...',
'...oo.....oo....',
'................',
];
const GOBLIN_PAL = { o: '#1d3a14', G: '#5cb85c', r: '#e03c30', w: '#e8e4c8' };

const BAT_A = [
'................',
'................',
'................',
'oo...........oo',
'ooo..........oo',
'oPPo...oo...oPo',
'.oPPPooPPooPPo.',
'..oPPPPPPPPPo..',
'...oPPPPPPPo...',
'...oPrPPrPPo...',
'....oPPPPPo....',
'.....oPoPo.....',
'......o..o.....',
'................',
'................',
'................',
];
const BAT_B = [
'................',
'................',
'................',
'................',
'................',
'.......oo......',
'..oooooPPooooo.',
'.oPPPPPPPPPPPo.',
'..ooPPPPPPPoo..',
'...oPrPPrPPo...',
'....oPPPPPo....',
'.....oPoPo.....',
'......o..o.....',
'................',
'................',
'................',
];
const BAT_PAL = { o: '#2a1d40', P: '#9a7ad0', r: '#ff5c5c' };

const SKELETON = [
'................',
'.....oooooo.....',
'....oWWWWWWo....',
'....oWWWWWWo....',
'....oWrWWrWo....',
'....oWWWWWWo....',
'.....oWooWo.....',
'......oWWo......',
'....ooWWWWoo....',
'...oWoWWWWoWo...',
'...oW.oWWo.Wo...',
'...oo.oWWo.oo...',
'......oWWo......',
'.....oWooWo.....',
'.....oW..Wo.....',
'.....oo..oo.....',
];
const SKELETON_PAL = { o: '#3c3c34', W: '#d8d8cc', r: '#e03c30' };

const CULTIST = [
'................',
'.....oooooo.....',
'....oRRRRRRo....',
'...oRRRRRRRRo...',
'...oRRddddRRo...',
'...oRdyddydRo...',
'...oRRddddRRo...',
'...oRRRRRRRRo...',
'..oRRRRRRRRRRo..',
'..oRRRRRRRRRRo..',
'..oRRsRRRRsRRo..',
'..oRRRRRRRRRRo..',
'..oRRRRRRRRRRo..',
'.oRRRRRRRRRRRRo.',
'.oRRRRRRRRRRRRo.',
'..oooooooooooo..',
];
const CULTIST_PAL = { o: '#3a1030', R: '#a03a80', d: '#180818', y: '#ff70d0', s: '#d05ca8' };

const OGRE = [
'................',
'...oooooooooo...',
'..oOOOOOOOOOOo..',
'..oOOOOOOOOOOo..',
'..oOrOOOOOOrOo..',
'..oOOOOOOOOOOo..',
'..oOtOOOOOOtOo..',
'..oOOttOOttOOo..',
'.ooOOOOOOOOOOoo.',
'oOOoOOOOOOOOoOOo',
'oOOoOOOOOOOOoOOo',
'oooOOOOOOOOOOooo',
'...oOOOooOOOo...',
'...oOOo..oOOo...',
'...oOOo..oOOo...',
'...ooo....ooo...',
];
const OGRE_PAL = { o: '#4a2810', O: '#b06a3c', r: '#ffd23c', t: '#e8e4c8' };

const WRAITH = [
'................',
'......oooo......',
'....ooCCCCoo....',
'...oCCCCCCCCo...',
'...oCCCCCCCCo...',
'...oCrCCCCrCo...',
'...oCCCCCCCCo...',
'....oCCCCCCo....',
'....oCCCCCCo....',
'...oCCCCCCCCo...',
'...oCCoCCoCCo...',
'..oCCo.oCo.CCo..',
'..oCo..oCo..oo..',
'..oo...oo.......',
'.......o........',
'................',
];
const WRAITH_PAL = { o: 'rgba(40,90,90,0.75)', C: 'rgba(106,208,208,0.8)', r: '#e8fbff' };

const BOSS = [
'.o............o.',
'.oo..........oo.',
'.oHo........oHo.',
'..oHo..oo..oHo..',
'..oHooDDDDooHo..',
'...oDDDDDDDDo...',
'..oDDyDDDDyDDo..',
'..oDDDDDDDDDDo..',
'..oDDDttttDDDo..',
'.oDDDDDDDDDDDDo.',
'.oDDDDDDDDDDDDo.',
'.oDoDDDDDDDDoDo.',
'.oo.oDDDDDDo.oo.',
'....oDDooDDo....',
'....oDo..oDo....',
'....oo....oo....',
];
const BOSS_PAL = { o: '#3a0a14', H: '#e8b84c', D: '#c03048', y: '#fff05c', t: '#2a0a10' };

// hero: parameterized (tint, armor color, weapon drawn separately)
const HERO = [
'................',
'.....hhhhhh.....',
'....hhhhhhhh....',
'....hhssssdh....',
'....hsssssdh....',
'....hhsssdhh....',
'.....hhhhhh.....',
'....aAAAAAAa....',
'...aAAAAAAAAa...',
'...aABBAABBAa...',
'...sAAAAAAAAs...',
'....aAAAAAAa....',
'....aBBaaBBa....',
'....aBBa.BBa....',
'....abba.bba....',
'................',
];
function heroPal(tint, armorColor) {
  return {
    h: shade(tint, -0.35), s: '#e8c49a', d: shade('#e8c49a', -0.3),
    a: shade(armorColor, -0.4), A: armorColor, B: tint, b: shade(tint, -0.45),
  };
}
function shade(hex, f) {
  // accepts #rrggbb; f in [-1,1]
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (f < 0) { r *= 1 + f; g *= 1 + f; b *= 1 + f; }
  else { r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f; }
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

// weapon overlays (drawn beside hero) — 16x16, right-facing
const WEAPON_MAPS = {
  dagger: [
    '................', '................', '................', '................',
    '................', '................', '..........g.....', '.........gWg....',
    '..........W.....', '..........h.....', '................', '................',
    '................', '................', '................', '................'],
  sword: [
    '................', '................', '................', '..........gW....',
    '..........Wg....', '.........gW.....', '.........Wg.....', '........hW......',
    '........h.......', '................', '................', '................',
    '................', '................', '................', '................'],
  axe: [
    '................', '................', '........WWW.....', '.......WWWWg....',
    '.......WWg......', '........hg......', '........h.......', '........h.......',
    '........h.......', '................', '................', '................',
    '................', '................', '................', '................'],
  rune: [
    '................', '................', '..........gW....', '.........gWg....',
    '.........Wg.....', '........gW......', '........Wg......', '.......hW.......',
    '.......h........', '................', '................', '................',
    '................', '................', '................', '................'],
  void: [
    '................', '................', '.........gWg....', '........gWWWg...',
    '.........WWg....', '........gWg.....', '........Wg......', '.......hW.......',
    '.......h........', '................', '................', '................',
    '................', '................', '................', '................'],
};
function weaponPal(color) { return { W: color, g: shade(color, 0.5), h: '#6a4a28' }; }

export const monsterSprites = {};
export let batFrames = [];
const heroCache = new Map();
const weaponCache = new Map();

export function heroSprite(tint, armorColor) {
  const k = tint + '|' + armorColor;
  if (!heroCache.has(k)) heroCache.set(k, bakeSprite(HERO, heroPal(tint, armorColor)));
  return heroCache.get(k);
}
export function weaponSprite(icon, color) {
  const k = icon + '|' + color;
  if (!weaponCache.has(k)) weaponCache.set(k, bakeSprite(WEAPON_MAPS[icon] || WEAPON_MAPS.sword, weaponPal(color)));
  return weaponCache.get(k);
}

// ---------------------------------------------------------------- LIGHTING
let fogCanvas, fogCtx, fogData;

export function initGfx(mapW, mapH, gameW, gameH) {
  for (let b = 0; b < BIOMES.length; b++) {
    floors[b] = []; walls[b] = [];
    for (let v = 0; v < N_FLOOR; v++) floors[b].push(bakeFloor(BIOMES[b], v));
    for (let v = 0; v < N_WALL; v++) walls[b].push(bakeWall(BIOMES[b], v));
  }
  voidTile = bakeVoid();
  monsterSprites.goblin = bakeSprite(GOBLIN, GOBLIN_PAL);
  monsterSprites.skeleton = bakeSprite(SKELETON, SKELETON_PAL);
  monsterSprites.cultist = bakeSprite(CULTIST, CULTIST_PAL);
  monsterSprites.ogre = bakeSprite(OGRE, OGRE_PAL, 2.9);
  monsterSprites.wraith = bakeSprite(WRAITH, WRAITH_PAL);
  monsterSprites.boss = bakeSprite(BOSS, BOSS_PAL, 3.4);
  batFrames = [bakeSprite(BAT_A, BAT_PAL, 2.0), bakeSprite(BAT_B, BAT_PAL, 2.0)];
  monsterSprites.bat = batFrames[0];

  const [fc, fg] = mkCanvas(mapW, mapH);
  fogCanvas = fc; fogCtx = fg;
  fogData = fg.createImageData(mapW, mapH);
  void gameW; void gameH;
}

// Smooth fog-of-war + light falloff. One pixel per tile, upscaled with smoothing.
export function drawFog(ctx, opts) {
  const { mapW, mapH, explored, visible, map, heroX, heroY, torches, camX, camY, gameW, gameH, flicker } = opts;
  const d = fogData.data;
  const R = 9.5 * flicker;
  for (let y = 0; y < mapH; y++) {
    for (let x = 0; x < mapW; x++) {
      const i = (y * mapW + x) * 4;
      let a;
      if (!explored[y][x]) a = 108; // unexplored rock: dim but textured, never black
      else if (!visible[y][x]) a = 118; // explored memory: dimmed but clearly readable
      else {
        const dx = x - heroX, dy = y - heroY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        // gentle falloff, capped well below opaque — visible area stays bright
        a = Math.max(0, Math.min(105, ((dist / R) ** 1.9) * 120 - 10));
        // torch light contribution
        for (let t = 0; t < torches.length; t++) {
          const tdx = x - torches[t].x, tdy = y - torches[t].y;
          const td = Math.sqrt(tdx * tdx + tdy * tdy);
          if (td < 5) a = Math.min(a, 8 + td * 22);
        }
      }
      d[i] = 4; d[i + 1] = 2; d[i + 2] = 12; d[i + 3] = a;
    }
  }
  fogCtx.putImageData(fogData, 0, 0);
  // called inside camera-translated context: draw in world space
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(fogCanvas, -TILE / 2, -TILE / 2, mapW * TILE, mapH * TILE);
  ctx.restore();
  void gameW; void gameH; void map; void camX; void camY;
}

// warm torch glow around hero (before fog)
export function drawHeroLight(ctx, px, py, flicker) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const r = 320 * flicker;
  const grd = ctx.createRadialGradient(px, py, 12, px, py, r);
  grd.addColorStop(0, 'rgba(255,196,110,0.30)');
  grd.addColorStop(0.45, 'rgba(255,155,70,0.13)');
  grd.addColorStop(1, 'rgba(255,120,40,0)');
  ctx.fillStyle = grd;
  ctx.fillRect(px - r, py - r, r * 2, r * 2);
  ctx.restore();
}

// vignette: cached per canvas size (viewport is dynamic/fullscreen)
let vigCache = null, vigW = 0, vigH = 0;
export function drawVignette(ctx, w, h) {
  const gw = Math.ceil(w || vigW || 1280), gh = Math.ceil(h || vigH || 720);
  if (!vigCache || vigW !== gw || vigH !== gh) {
    vigW = gw; vigH = gh;
    const [vc, vg] = mkCanvas(gw, gh);
    const grd = vg.createRadialGradient(gw / 2, gh / 2, gh * 0.48, gw / 2, gh / 2, gh * 0.95);
    grd.addColorStop(0, 'rgba(0,0,0,0)');
    grd.addColorStop(1, 'rgba(0,0,0,0.42)');
    vg.fillStyle = grd;
    vg.fillRect(0, 0, gw, gh);
    vigCache = vc;
  }
  ctx.drawImage(vigCache, 0, 0, gw, gh);
}

// ---------------------------------------------------------------- UI CHROME
export function drawPanel(ctx, x, y, w, h, opts = {}) {
  const glow = opts.glow || null;
  ctx.save();
  // drop shadow
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(x + 3, y + 4, w, h);
  // body: dark stone gradient
  const grd = ctx.createLinearGradient(x, y, x, y + h);
  grd.addColorStop(0, opts.light ? '#2e2a40' : '#221e32');
  grd.addColorStop(1, opts.light ? '#1c1828' : '#141020');
  ctx.fillStyle = grd;
  ctx.fillRect(x, y, w, h);
  // inner texture speckle
  ctx.fillStyle = 'rgba(255,255,255,0.025)';
  for (let i = 0; i < w * h / 900; i++) {
    ctx.fillRect(x + noise(i, x, 5) * w | 0, y + noise(y, i, 7) * h | 0, 2, 2);
  }
  // border: dark outer + metallic inner
  ctx.strokeStyle = '#0a0812'; ctx.lineWidth = 2;
  ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
  ctx.strokeStyle = glow || 'rgba(190,164,110,0.55)'; ctx.lineWidth = 1.5;
  ctx.strokeRect(x + 3, y + 3, w - 6, h - 6);
  // corner rivets
  ctx.fillStyle = glow || '#b8a06a';
  for (const [cx, cy] of [[x + 6, y + 6], [x + w - 6, y + 6], [x + 6, y + h - 6], [x + w - 6, y + h - 6]]) {
    ctx.beginPath(); ctx.arc(cx, cy, 2, 0, 7); ctx.fill();
  }
  ctx.restore();
}

export function drawButton(ctx, x, y, w, h, label, color, opts = {}) {
  const pulse = opts.pulse != null ? opts.pulse : 1;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(x + 2, y + 3, w, h);
  const grd = ctx.createLinearGradient(x, y, x, y + h);
  grd.addColorStop(0, shadeCss(color, 0.18 * pulse));
  grd.addColorStop(0.5, color);
  grd.addColorStop(1, shadeCss(color, -0.3));
  ctx.fillStyle = grd;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 2;
  ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1;
  ctx.strokeRect(x + 3, y + 3, w - 6, h - 6);
  // top gloss
  ctx.fillStyle = 'rgba(255,255,255,0.14)';
  ctx.fillRect(x + 3, y + 3, w - 6, h * 0.28);
  ctx.font = `bold ${opts.size || 20}px Georgia, serif`;
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillText(label, x + w / 2 + 1, y + h / 2 + (opts.size || 20) * 0.36 + 1);
  ctx.fillStyle = opts.textColor || '#fff8e8';
  ctx.fillText(label, x + w / 2, y + h / 2 + (opts.size || 20) * 0.36);
  ctx.restore();
}

function shadeCss(css, f) {
  // handles #hex or rgb()/rgba()
  let r, g, b, a = 1;
  if (css[0] === '#') {
    const n = parseInt(css.slice(1), 16);
    r = (n >> 16) & 255; g = (n >> 8) & 255; b = n & 255;
  } else {
    const m = css.match(/([\d.]+)/g) || [128, 128, 128];
    r = +m[0]; g = +m[1]; b = +m[2]; if (m[3] != null) a = +m[3];
  }
  if (f < 0) { r *= 1 + f; g *= 1 + f; b *= 1 + f; }
  else { r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f; }
  return `rgba(${r | 0},${g | 0},${b | 0},${a})`;
}

export function drawGradBar(ctx, x, y, w, h, frac, c0, c1, bg, label) {
  ctx.save();
  ctx.fillStyle = bg; ctx.fillRect(x, y, w, h);
  const fw = w * Math.max(0, Math.min(1, frac));
  if (fw > 0) {
    const grd = ctx.createLinearGradient(x, y, x, y + h);
    grd.addColorStop(0, c0); grd.addColorStop(1, c1);
    ctx.fillStyle = grd;
    ctx.fillRect(x, y, fw, h);
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(x, y, fw, Math.max(1, h * 0.3));
  }
  ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.lineWidth = 1.5;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);
  if (label) {
    ctx.font = 'bold 11px system-ui'; ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillText(label, x + w / 2 + 1, y + h - 3 + 1);
    ctx.fillStyle = '#fff'; ctx.fillText(label, x + w / 2, y + h - 3);
  }
  ctx.restore();
}

// small icon painters (armor shield / potion / soul gem) for HUD
export function drawShieldIcon(ctx, x, y, s, color) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y - s * 0.55); ctx.lineTo(x + s * 0.5, y - s * 0.35);
  ctx.lineTo(x + s * 0.5, y + s * 0.1);
  ctx.quadraticCurveTo(x + s * 0.5, y + s * 0.5, x, y + s * 0.65);
  ctx.quadraticCurveTo(x - s * 0.5, y + s * 0.5, x - s * 0.5, y + s * 0.1);
  ctx.lineTo(x - s * 0.5, y - s * 0.35);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.fillRect(x - s * 0.3, y - s * 0.35, s * 0.25, s * 0.6);
  ctx.restore();
}

export { shadeCss, bakeSprite };
