// Enemy art/behavior contract measured in the built browser game.
// Portrait fixtures are review evidence, never a claim of AAA or portal approval.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, readdir, mkdir, writeFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { ENEMIES, CHAPTERS } from '../src/content.js';
import { ENEMY_PRESENTATION } from '../src/enemy-presentation.js';

const root = path.resolve('dist');
const output = process.env.ENEMY_QA_OUTPUT || 'qa/enemies';
const hardware = process.env.ENEMY_QA_GPU === 'hardware';
const filter = process.env.ENEMY_QA_FILTER || null;
const enemyManifest = JSON.parse(
  await readFile(path.join(root, 'assets/enemies/manifest.json'), 'utf8'),
);
const report = {
  generatedAt: new Date().toISOString(),
  scope:
    'All 30 enemy identities, authored equipment and animation, real AI projectile timing, quality modes and missing-asset fallback. Scripted fixtures; no AAA certification or physical low-end device claim.',
  filter,
  hardwareRequested: hardware,
  buildHashes: {},
  passed: [],
  errors: [],
  enemies: [],
  attacks: [],
  frames: [],
};
await mkdir(output, { recursive: true });
// Failed or filtered runs must not publish old screenshots as current evidence.
// Only this script's outputs are retired; retain independent garden/glTF audits.
const ownedOutputs = [
  ...Object.keys(ENEMIES).map((id) => `${id}.png`),
  ...CHAPTERS.map((_, index) => `chapter-${index + 1}-gameplay.png`),
  'all-30-contact-sheet.png',
  'performance-equipment.png',
  'missing-assets-fallback.png',
  'results.json',
];
await Promise.all(ownedOutputs.map((name) => rm(path.join(output, name), { force: true })));
async function hashTree(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) await hashTree(file);
    else
      report.buildHashes[path.relative(root, file)] = createHash('sha256')
        .update(await readFile(file))
        .digest('hex');
  }
}
await hashTree(root);
const server = createServer(async (request, response) => {
  try {
    const name = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const file = path.resolve(root, `.${name === '/' ? '/index.html' : name}`);
    if (!file.startsWith(root + path.sep)) throw new Error('Outside root');
    response.setHeader(
      'Content-Type',
      {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.glb': 'model/gltf-binary',
        '.png': 'image/png',
        '.webp': 'image/webp',
        '.ogg': 'audio/ogg',
      }[path.extname(file)] || 'application/octet-stream',
    );
    response.end(await readFile(file));
  } catch {
    response.writeHead(404);
    response.end('Not found');
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const check = async (name, run) => {
  if (filter && !name.match(new RegExp(filter))) return;
  try {
    await run();
    report.passed.push(name);
    console.log(`PASS ${name}`);
  } catch (error) {
    report.errors.push(`${name}: ${error.stack || error}`);
    console.error(`FAIL ${name}: ${error.message}`);
    process.exitCode = 1;
  }
};
let browser;
async function start(page) {
  await page.goto(`${base}/?qa=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__RUNIC?.game, null, { timeout: 45000 });
  await page.evaluate(() => window.__RUNIC.newGame('warden'));
  await page.waitForFunction(
    () =>
      window.__RUNIC.game.mode === 'playing' && window.__RUNIC.renderer.actors.get('$hero')?.visual,
    null,
    { timeout: 45000 },
  );
  if (await page.locator('#dismiss-tutorial').isVisible())
    await page.locator('#dismiss-tutorial').click();
  await page.evaluate(() => {
    window.__RUNIC.game.mode = 'paused';
  });
}

// The ordinary engine spawns every actor. An empty room fixture removes occlusion
// and random encounter composition; the engine's movement and attacks stay intact.
async function fixture(page, ids, { floor = 1, distance = 4 } = {}) {
  return page.evaluate(
    ({ ids, floor, distance }) => {
      const { game: g, renderer: r } = window.__RUNIC;
      g.floor = floor;
      g.makeFloor();
      g.mode = 'paused';
      g.enemies = [];
      g.objects = [];
      g.drops = [];
      g.projectiles = [];
      g.effects = [];
      const room = g.rooms?.[0];
      // Work on the generated map without replacing pathfinding/LOS functions.
      const cx = Math.round(g.hero.x),
        cy = Math.round(g.hero.y);
      for (let y = cy - 7; y <= cy + 7; y++)
        for (let x = cx - 7; x <= cx + 7; x++) {
          if (
            g.map[y]?.[x] !== undefined &&
            x > 0 &&
            y > 0 &&
            x < g.map[0].length - 1 &&
            y < g.map.length - 1
          ) {
            g.map[y][x] = 0;
            if (g.explored[y]) g.explored[y][x] = true;
          }
        }
      g.hero.x = cx;
      g.hero.y = cy;
      g.hero.hp = g.hero.maxHp;
      g.input.x = 0;
      g.input.y = 0;
      g.input.attack = false;
      g.moveTarget = null;
      g.attackTarget = null;
      ids.forEach((id, i) => {
        const x = cx + (ids.length === 1 ? 0 : ((i % 5) - (Math.min(5, ids.length) - 1) / 2) * 2.2);
        g.spawnEnemy(id, x, cy + distance + Math.floor(i / 5) * 1.4);
        const e = g.enemies.at(-1);
        e.attackCooldown = 0;
        e.specialCooldown = 100;
        e.aggro = true;
        e.facing = Math.PI;
      });
      g.reveal();
      r.build(g);
      r.render(g, 0);
      return { ids: g.enemies.map((e) => e.id), center: [cx, cy], room };
    },
    { ids, floor, distance },
  );
}

async function inspect(page, id) {
  const multiple = Array.isArray(id);
  const result = await page.evaluate(
    ({ ids, render }) => {
      const { game: g, renderer: r } = window.__RUNIC;
      // A streamed hero LOD can rebuild actors between automation messages. Read
      // one actual rendered frame atomically, never a half-prepared scene.
      if (render) r.render(g, 0);
      const rows = ids.map((id) => {
        const e = g.enemies.find((e) => e.type === id),
          actor = r.actors.get(e?.id);
        if (!actor) return { id, missing: true };
        const meshes = [],
          bones = [],
          materials = new Set();
        let triangles = 0,
          bowWeightedVertices = 0;
        (actor.visual?.root || actor.model).traverse((node) => {
          if (node.isBone) bones.push(node.name);
          if (!node.isMesh) return;
          triangles += (node.geometry.index?.count || node.geometry.attributes.position.count) / 3;
          meshes.push({ name: node.name, skinned: !!node.isSkinnedMesh, userData: node.userData });
          if (node.isSkinnedMesh) {
            const drawJoint = node.skeleton.bones.findIndex((bone) => bone.name === 'bow_draw');
            const index = node.geometry.attributes.skinIndex,
              weight = node.geometry.attributes.skinWeight;
            if (drawJoint >= 0 && index && weight)
              for (let vertex = 0; vertex < index.count; vertex++)
                for (let component = 0; component < 4; component++)
                  if (
                    index.getComponent(vertex, component) === drawJoint &&
                    weight.getComponent(vertex, component) > 0.01
                  ) {
                    bowWeightedVertices++;
                    break;
                  }
          }
          for (const material of [].concat(node.material)) materials.add(material.type);
        });
        return {
          id,
          stats: actor.visual?.stats || null,
          asset: actor.visual?.root.userData || null,
          actorData: actor.root.userData,
          meshes,
          bones,
          triangles,
          bowWeightedVertices,
          materials: [...materials],
          animation: actor.visual?.root.userData.animation,
          visible: actor.root.visible,
        };
      });
      return {
        rows,
        frame: render
          ? {
              quality: r.quality,
              actorCount: r.actors.size,
              expectedEnemyCount: ids.length,
              heroDetail: r.actors.get('$hero')?.visual?.stats.detail,
              glError: r.renderer.getContext().getError(),
            }
          : null,
      };
    },
    { ids: multiple ? id : [id], render: multiple },
  );
  return multiple ? result : result.rows[0];
}

async function portrait(page, id) {
  // A separate close camera exposes the actual runtime PBR mesh and rig at a
  // useful inspection size. The six gameplay captures retain the normal camera.
  const png = await page.evaluate((id) => {
    const { game: g, renderer: r } = window.__RUNIC;
    const e = g.enemies.find((e) => e.type === id),
      actor = r.actors.get(e.id);
    const extent = (e.scale || 1) * 1.15;
    const saved = {
      hero: [g.hero.x, g.hero.y],
      target: r.target.clone(),
      facing: e.facing,
      bounds: [r.camera.left, r.camera.right, r.camera.top, r.camera.bottom],
      static: r.static.visible,
      cameraLayers: r.camera.layers.mask,
    };
    const layers = [];
    actor.visual.root.traverse((node) => {
      layers.push([node, node.layers.mask]);
      node.layers.enable(2);
    });
    r.scene.traverse((node) => {
      if (node.isLight) {
        layers.push([node, node.layers.mask]);
        node.layers.enable(2);
      }
    });
    r.camera.layers.set(2);
    const visibility = [...r.actors.values()].map((value) => [value.model, value.model.visible]);
    for (const [model] of visibility) model.visible = model === actor.model;
    r.static.visible = false;
    g.hero.x = e.x;
    g.hero.y = e.y;
    e.facing = 0;
    r.target.set(e.x, 0.6 * (e.scale || 1), e.y);
    const aspect = r.renderer.domElement.width / r.renderer.domElement.height;
    r.camera.left = -extent * aspect;
    r.camera.right = extent * aspect;
    r.camera.top = extent;
    r.camera.bottom = -extent;
    r.camera.updateProjectionMatrix();
    // Use the actual game pipeline and its normal frame/skeleton bookkeeping.
    // Only composition changes: one model, a close camera and hidden scenery.
    r.render(g, 0);
    r.render(g, 0);
    const gl = r.renderer.getContext(),
      pixels = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
    gl.readPixels(
      0,
      0,
      gl.drawingBufferWidth,
      gl.drawingBufferHeight,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      pixels,
    );
    let bright = 0;
    for (let i = 0; i < pixels.length; i += 4)
      if (Math.max(pixels[i], pixels[i + 1], pixels[i + 2]) > 60) bright++;
    const result = {
      image: r.renderer.domElement.toDataURL('image/png'),
      brightFraction: bright / (pixels.length / 4),
      glError: gl.getError(),
    };
    [g.hero.x, g.hero.y] = saved.hero;
    e.facing = saved.facing;
    [r.camera.left, r.camera.right, r.camera.top, r.camera.bottom] = saved.bounds;
    r.camera.updateProjectionMatrix();
    r.target.copy(saved.target);
    r.static.visible = saved.static;
    r.camera.layers.mask = saved.cameraLayers;
    for (const [node, mask] of layers) node.layers.mask = mask;
    for (const [model, visible] of visibility) model.visible = visible;
    r.render(g, 0);
    return result;
  }, id);
  report.frames.push({
    file: `${id}.png`,
    fixture: 'actual High game pipeline; close camera, one actor, scenery hidden',
    brightFraction: png.brightFraction,
    glError: png.glError,
  });
  assert.equal(png.glError, 0, `${id}: close frame has no WebGL error`);
  assert.ok(
    png.brightFraction > 0.003,
    `${id}: actual framebuffer contains the lit model, not an empty silhouette`,
  );
  await writeFile(`${output}/${id}.png`, Buffer.from(png.image.split(',')[1], 'base64'));
  return png.image;
}

try {
  browser = await chromium.launch({
    executablePath: process.env.CHROME_BIN || '/usr/bin/google-chrome',
    headless: true,
    args: [
      '--no-sandbox',
      '--enable-webgl',
      '--use-gl=angle',
      hardware ? '--use-angle=gl' : '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
    ],
  });
  report.browser = browser.version();
  const page = await browser.newPage({
    viewport: { width: 1120, height: 840 },
    deviceScaleFactor: 1,
    locale: 'en-US',
  });
  page.on('pageerror', (error) => report.errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') report.errors.push(message.text());
  });
  await start(page);
  report.gpu = await page.evaluate(() => {
    const gl = window.__RUNIC.renderer.renderer.getContext(),
      extension = gl.getExtension('WEBGL_debug_renderer_info');
    return extension
      ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL)
      : gl.getParameter(gl.RENDERER);
  });
  if (hardware)
    assert.match(report.gpu, /NVIDIA/, 'hardware visual review uses the available NVIDIA GPU');

  await check('shared PBR textures contain valid normal and roughness data', async () => {
    await fixture(page, ['thorn_lurker']);
    await page.evaluate(async () => {
      const { game: g, renderer: r } = window.__RUNIC;
      await r.loadEnemyChapter(g);
      r.build(g);
      r.render(g, 0);
    });
    report.pbr = await page.evaluate(() => {
      const { game: g, renderer: r } = window.__RUNIC;
      const actor = r.actors.get(g.enemies[0].id);
      let material;
      actor.visual.root.traverse((node) => {
        if (node.isSkinnedMesh) material = node.material;
      });
      const sample = (texture) => {
        if (!texture?.image) return null;
        const canvas = document.createElement('canvas');
        canvas.width = texture.image.width;
        canvas.height = texture.image.height;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        context.drawImage(texture.image, 0, 0);
        const bytes = context.getImageData(0, 0, canvas.width, canvas.height).data;
        const mean = [0, 0, 0],
          min = [255, 255, 255],
          max = [0, 0, 0];
        for (let i = 0; i < bytes.length; i += 4)
          for (let channel = 0; channel < 3; channel++) {
            const value = bytes[i + channel];
            mean[channel] += value;
            min[channel] = Math.min(min[channel], value);
            max[channel] = Math.max(max[channel], value);
          }
        return {
          width: canvas.width,
          height: canvas.height,
          mean: mean.map((value) => value / (bytes.length / 4)),
          min,
          max,
        };
      };
      return {
        vertexColors: material.vertexColors,
        normal: sample(material.normalMap),
        roughmetal: sample(material.roughnessMap),
        color: sample(material.map),
      };
    });
    assert.equal(report.pbr.vertexColors, true, 'per-component authored palette is enabled');
    assert.ok(
      report.pbr.normal?.mean[2] > 200,
      'normal blue channel points out of the surface, not an all-black reset buffer',
    );
    for (const channel of [0, 1])
      assert.ok(
        report.pbr.normal.mean[channel] > 90 && report.pbr.normal.mean[channel] < 180,
        'normal XY channels remain centered around neutral',
      );
    assert.ok(
      report.pbr.roughmetal?.mean[1] > 80 && report.pbr.roughmetal.max[1] > 170,
      'cloth, bark and metal retain authored roughness, not zero-roughness chrome',
    );
    assert.ok(
      report.pbr.roughmetal.max[2] > 150 && report.pbr.roughmetal.min[2] < 20,
      'atlas distinguishes metallic armor from nonmetal cloth',
    );
  });

  await check('all 30 enemies use distinct authored assets and anatomy in High', async () => {
    assert.equal(Object.keys(ENEMIES).length, 30);
    await fixture(page, Object.keys(ENEMIES));
    await page.evaluate(async () => {
      const { game: g, renderer: r } = window.__RUNIC;
      await r.loadEnemyChapter(g);
      r.build(g);
      r.render(g, 0);
    });
    const portraits = [];
    for (let chapter = 0; chapter < CHAPTERS.length; chapter++) {
      const ids = [...CHAPTERS[chapter].enemies, CHAPTERS[chapter].boss];
      await fixture(page, ids, { floor: chapter * 2 + 1, distance: 2.8 });
      await page.evaluate(async () => {
        const { game: g, renderer: r } = window.__RUNIC;
        await r.loadEnemyChapter(g);
        r.build(g);
        r.render(g, 0);
      });
      await page.screenshot({ path: `${output}/chapter-${chapter + 1}-gameplay.png` });
      report.frames.push({
        file: `chapter-${chapter + 1}-gameplay.png`,
        fixture:
          'generated room with five chapter enemies; ordinary High gameplay camera and postprocessing',
      });
      for (const id of ids) {
        const result = await inspect(page, id),
          definition = ENEMY_PRESENTATION[id];
        report.enemies.push({ ...result, expected: definition });
        assert.equal(
          result.stats?.id,
          id,
          `${id}: identity-specific model, not a shape-level substitute`,
        );
        assert.equal(result.stats.detail, 'high');
        assert.ok(result.bones.length >= 12, `${id}: actual articulated rig`);
        const manifestAsset = enemyManifest.assets.find(
          (asset) => asset.id === id && asset.detail === 'high',
        );
        assert.equal(
          result.triangles,
          manifestAsset.triangles,
          `${id}: actual decoded triangles match authored asset`,
        );
        assert.ok(
          result.meshes.some((mesh) => mesh.skinned),
          `${id}: geometry uses the rig`,
        );
        assert.ok(result.materials.includes('MeshStandardMaterial'), `${id}: physical material`);
        for (const clip of ['idle', 'walk', 'attack', 'hit', 'death'])
          assert.ok(result.stats.clips.includes(clip), `${id}: authored ${clip} clip`);
        if (definition.weapon === 'bow') {
          assert.ok(result.stats.clips.includes('shoot'), `${id}: bow shooting clip`);
          assert.ok(result.bones.includes('bow_draw'), `${id}: real articulated bowstring joint`);
          assert.ok(
            result.bowWeightedVertices > 10,
            `${id}: real bowstring/arrow vertices deform with draw joint`,
          );
        }
        const parts = result.meshes.flatMap((mesh) => mesh.userData.parts || []).join(' ');
        assert.ok(
          parts.length > 0,
          `${id}: source component provenance retained on actual joined geometry`,
        );
        if (definition.weapon === 'bow') {
          for (const part of [/Weapon_Bow_Recurve_Limb/i, /Weapon_Bow_String/i, /Back quiver/i])
            assert.match(parts, part, `${id}: actual authored bow component exists`);
          assert.doesNotMatch(
            parts,
            /Weapon_Sword/i,
            `${id}: sword not baked into the archer mesh`,
          );
        } else if (['sword', 'staff', 'hammer', 'trident'].includes(definition.weapon))
          assert.match(
            parts,
            new RegExp(`Weapon_${definition.weapon}`, 'i'),
            `${id}: actual authored weapon matches combat role`,
          );
        if (definition.body === 'spider')
          assert.equal(
            result.bones.filter((bone) => bone.startsWith('leg_')).length,
            8,
            `${id}: eight articulated legs`,
          );
        if (definition.body === 'hound')
          assert.equal(
            result.bones.filter((bone) => bone.startsWith('leg_')).length,
            4,
            `${id}: four articulated legs`,
          );
        assert.ok(result.visible, `${id}: model rendered in the visible room`);
        portraits.push({
          id,
          name: ENEMIES[id].name.en,
          weapon: definition.weapon,
          image: await portrait(page, id),
        });
      }
    }
    assert.equal(new Set(report.enemies.map((enemy) => enemy.stats.id)).size, 30);
    const sheet = await browser.newPage({
      viewport: { width: 1600, height: 2080 },
      deviceScaleFactor: 1,
    });
    await sheet.setContent(
      `<html><head><style>body{margin:0;background:#10151c;color:#e9e3d6;font:16px system-ui}header{padding:20px 24px;height:70px;box-sizing:border-box}main{display:grid;grid-template-columns:repeat(5,1fr);gap:2px}article{background:#1a222a;min-height:327px}img{width:100%;height:285px;object-fit:contain}p{margin:0 12px;font-size:14px}small{color:#a7bac0}</style></head><body><header>Runic Depths — all 30 runtime enemy models · High PBR close-camera inspection · ${hardware ? 'NVIDIA hardware' : 'SwiftShader software'} · original art</header><main>${portraits.map((item) => `<article><img src="${item.image}"><p>${item.name}<br><small>${item.id} · ${item.weapon}</small></p></article>`).join('')}</main></body></html>`,
    );
    await sheet
      .locator('img')
      .evaluateAll((images) => Promise.all(images.map((image) => image.decode())));
    await sheet.screenshot({ path: `${output}/all-30-contact-sheet.png`, fullPage: true });
    await sheet.close();
    report.frames.push({
      file: 'all-30-contact-sheet.png',
      fixture:
        'actual runtime meshes, close orthographic camera, native PBR render; normal gameplay camera shown separately',
    });
  });

  await check('real ranged AI draws or casts before releasing the correct projectile', async () => {
    for (const [id, definition] of Object.entries(ENEMY_PRESENTATION).filter(([id]) =>
      ['ranged', 'summoner'].includes(ENEMIES[id].behavior),
    )) {
      await fixture(page, [id], { distance: 4 });
      await page.evaluate(async () => {
        const { game: g, renderer: r } = window.__RUNIC;
        await r.loadEnemyChapter(g);
        r.build(g);
      });
      const result = await page.evaluate((id) => {
        const { game: g, renderer: r } = window.__RUNIC;
        const e = g.enemies.find((enemy) => enemy.type === id),
          actor = r.actors.get(e.id);
        const bonePose = () => {
          const values = [];
          actor.visual?.root.traverse((node) => {
            if (node.isBone) values.push(...node.quaternion.toArray());
          });
          return values;
        };
        const idle = bonePose();
        const bowPosition = () =>
          actor.visual?.root.getObjectByName('bow_draw')?.position.toArray() || null;
        const idleBowPosition = bowPosition();
        let draw = null,
          released = null;
        g.mode = 'playing';
        for (let frame = 1; frame <= 75; frame++) {
          g.tick(1 / 60);
          r.updateActors(g, 1 / 60, g.time);
          if (frame === 8)
            draw = {
              time: frame / 60,
              windup: e.rangedWindup,
              projectiles: g.projectiles.length,
              animation: actor.visual?.root.userData.animation,
              pose: bonePose(),
              bowPosition: bowPosition(),
            };
          const projectile = g.projectiles.find(
            (projectile) => projectile.enemy && projectile.sourceType === id,
          );
          if (projectile) {
            r.updateProjectiles(g);
            const model = r.projectileModels.get(projectile.id),
              geometry = [];
            model?.root.traverse((node) => {
              if (node.isMesh)
                geometry.push({
                  name: node.name,
                  type: node.geometry.type,
                  scale: node.scale.toArray(),
                });
            });
            released = {
              time: frame / 60,
              kind: projectile.kind,
              sourceType: projectile.sourceType,
              sourceHeight: projectile.sourceHeight,
              animation: actor.visual?.root.userData.animation,
              geometry,
              userData: model?.root.userData,
              heroHp: g.hero.hp,
            };
            break;
          }
        }
        g.mode = 'paused';
        r.render(g, 0);
        const poseDelta =
          draw?.pose.reduce((sum, value, i) => sum + Math.abs(value - (idle[i] || 0)), 0) || 0;
        const bowDrawDelta =
          idleBowPosition && draw?.bowPosition
            ? Math.hypot(...draw.bowPosition.map((value, i) => value - idleBowPosition[i]))
            : null;
        if (draw) delete draw.pose;
        return { id, draw, released, poseDelta, idleBowPosition, bowDrawDelta };
      }, id);
      report.attacks.push(result);
      assert.ok(result.draw, `${id}: anticipation sampled`);
      assert.equal(result.draw.projectiles, 0, `${id}: shot does not precede drawing/casting`);
      assert.ok(result.draw.windup > 0, `${id}: actual AI windup still active`);
      assert.ok(result.poseDelta > 0.05, `${id}: articulated pose changes during anticipation`);
      assert.equal(
        result.draw.animation,
        definition.weapon === 'bow' ? 'shoot' : 'cast',
        `${id}: role-specific animation`,
      );
      assert.ok(result.released, `${id}: AI really releases a shot`);
      assert.ok(
        result.released.time >= 0.3 && result.released.time < 0.7,
        `${id}: release after visible anticipation`,
      );
      assert.equal(
        result.released.kind,
        definition.projectile,
        `${id}: appropriate projectile kind`,
      );
      assert.equal(result.released.sourceType, id);
      assert.ok(
        result.released.geometry.length > 0,
        `${id}: projectile geometry is actually constructed`,
      );
      if (definition.projectile === 'arrow') {
        assert.ok(
          result.bowDrawDelta > 0.01,
          `${id}: actual skinned string/arrow joint translates during the draw`,
        );
        for (const part of ['shaft', 'head', 'fletch'])
          assert.ok(
            result.released.geometry.some((mesh) => mesh.name.includes(part)),
            `${id}: arrow has actual ${part} geometry`,
          );
      }
    }
  });

  await check('all 30 enemies retain their identity and equipment in Performance', async () => {
    await page.evaluate(() => window.__RUNIC.renderer.setQuality('low'));
    await fixture(page, Object.keys(ENEMIES));
    await page.evaluate(async () => {
      const { game: g, renderer: r } = window.__RUNIC;
      await r.loadEnemyChapter(g);
      r.build(g);
      r.render(g, 0);
    });
    const snapshot = await inspect(page, Object.keys(ENEMIES));
    report.performance = snapshot.rows;
    report.performanceFrame = snapshot.frame;
    assert.equal(snapshot.frame.glError, 0, 'Performance snapshot is a clean actual GPU frame');
    for (const result of snapshot.rows) {
      const { id } = result;
      assert.equal(result.stats?.id, id, `${id}: Performance retains identity`);
      assert.equal(result.stats.detail, 'low', `${id}: real low-detail asset loaded`);
      assert.ok(
        result.materials.includes('MeshLambertMaterial'),
        `${id}: lighter real shading material`,
      );
      assert.ok(
        !result.materials.includes('MeshStandardMaterial'),
        `${id}: expensive physical material removed`,
      );
      const highAsset = enemyManifest.assets.find(
        (asset) => asset.id === id && asset.detail === 'high',
      );
      const lowAsset = enemyManifest.assets.find(
        (asset) => asset.id === id && asset.detail === 'low',
      );
      assert.equal(
        result.triangles,
        lowAsset.triangles,
        `${id}: actual low geometry matches authored asset`,
      );
      assert.ok(result.triangles <= highAsset.triangles, `${id}: low geometry never exceeds High`);
      if (highAsset.triangles > 1800)
        assert.ok(result.triangles < highAsset.triangles, `${id}: large geometry is reduced`);
      assert.ok(result.bones.length >= 12, `${id}: low model retains articulated animation`);
    }
    await fixture(
      page,
      ['thorn_lurker', 'ember_channeler', 'glass_scribe', 'bell_hound', 'root_matriarch'],
      { distance: 2.8 },
    );
    await page.screenshot({ path: `${output}/performance-equipment.png` });
  });

  // Fallback is an independent cold-start test. Retire the completed 30-actor
  // scene so its continuous software-GPU loop cannot starve a second context.
  await page.close();

  await check('missing authored enemy files preserve playable role-correct fallback', async () => {
    const fallback = await browser.newPage({
      viewport: { width: 1120, height: 840 },
      deviceScaleFactor: 1,
    });
    const pageErrors = [];
    fallback.on('pageerror', (error) => pageErrors.push(error.message));
    await fallback.route(
      (url) => url.pathname.includes('/assets/enemies/') && url.pathname.endsWith('.glb'),
      (route) => route.abort('failed'),
    );
    await start(fallback);
    await fixture(fallback, ['thorn_lurker', 'ember_channeler', 'glass_scribe'], { distance: 2.8 });
    await fallback.evaluate(async () => {
      const { game: g, renderer: r } = window.__RUNIC;
      await r.loadEnemyChapter(g);
      r.build(g);
      r.render(g, 0);
    });
    report.fallback = [];
    for (const id of ['thorn_lurker', 'ember_channeler', 'glass_scribe']) {
      const result = await inspect(fallback, id);
      report.fallback.push(result);
      assert.equal(
        result.stats?.detail,
        'fallback',
        `${id}: deliberate asset failure really exercises fallback`,
      );
      assert.equal(result.asset?.fallback, true, `${id}: actual fallback hierarchy is used`);
      assert.ok(
        result.visible && result.triangles > 0,
        `${id}: usable visible geometry survives asset failure`,
      );
      const names = result.meshes.map((mesh) => mesh.name).join(' ');
      if (ENEMY_PRESENTATION[id].weapon === 'bow') {
        assert.match(names, /bow/, `${id}: fallback actually carries a bow`);
        assert.match(names, /string/, `${id}: fallback bow includes a visible string`);
        assert.doesNotMatch(names, /sword/, `${id}: no sword substituted for a ranged bow`);
      } else assert.match(names, /staff/, `${id}: caster retains a staff`);
    }
    const playable = await fallback.evaluate(() => {
      const { game: g } = window.__RUNIC;
      g.mode = 'playing';
      for (let i = 0; i < 30; i++) g.tick(1 / 60);
      g.mode = 'paused';
      return { hp: g.hero.hp, projectiles: g.projectiles.map((p) => p.kind) };
    });
    assert.ok(
      playable.hp > 0 && playable.projectiles.includes('arrow'),
      'fallback enemies still perform real AI attacks',
    );
    assert.deepEqual(pageErrors, []);
    await fallback.screenshot({ path: `${output}/missing-assets-fallback.png` });
    await fallback.close();
  });
} catch (error) {
  report.errors.push(error.stack || String(error));
  process.exitCode = 1;
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
  await writeFile(`${output}/results.json`, JSON.stringify(report, null, 2));
  console.log(
    `${report.passed.length} enemy browser groups passed; ${report.errors.length} errors`,
  );
  if (report.errors.length) process.exitCode = 1;
}
