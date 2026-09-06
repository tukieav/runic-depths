// Tests the real shipping asset pipeline. Software WebGL is not a device benchmark.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

const root = path.resolve('dist');
const output = 'qa/graphics';
const classes = ['warden', 'ranger', 'arcanist', 'reaver', 'oracle'];
const results = [];
const errors = [];
const evidence = { models: {}, scenes: [], motion: [], fallback: {} };
const sha = (body) => createHash('sha256').update(body).digest('hex');
const buildHashes = {};
await mkdir(output, { recursive: true });
async function collect(directory) {
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, item.name);
    if (item.isDirectory()) await collect(file);
    else buildHashes[path.relative(root, file)] = sha(await readFile(file));
  }
}
await collect(root);

const check = async (name, run) => {
  await run();
  results.push(name);
  console.log(`PASS ${name}`);
};
const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const file = path.resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
    if (!file.startsWith(root + path.sep)) {
      res.writeHead(403);
      return res.end();
    }
    const body = await readFile(file);
    res.setHeader(
      'Content-Type',
      {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.png': 'image/png',
        '.webp': 'image/webp',
        '.glb': 'model/gltf-binary',
      }[path.extname(file)] || 'application/octet-stream',
    );
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
let browser;

function parseGlb(body) {
  assert.equal(body.readUInt32LE(0), 0x46546c67, 'GLB magic');
  assert.equal(body.readUInt32LE(4), 2, 'glTF 2.0');
  assert.equal(body.readUInt32LE(8), body.length, 'complete GLB');
  assert.equal(body.readUInt32LE(16), 0x4e4f534a, 'JSON first chunk');
  return JSON.parse(body.subarray(20, 20 + body.readUInt32LE(12)).toString());
}

// Inspects live objects used by the renderer, rather than module metadata.
async function inspect(page) {
  return page.evaluate(() => {
    const { renderer, game } = window.__RUNIC;
    const actor = renderer.actors.get('$hero');
    const info = {
      classId: game.hero.classId,
      bones: [],
      skins: [],
      textures: [],
      environmentMaps: [],
    };
    actor.root.traverse((node) => {
      if (node.isBone)
        info.bones.push({
          name: node.name,
          q: node.quaternion.toArray(),
          p: node.position.toArray(),
        });
      if (!node.isSkinnedMesh) return;
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      info.skins.push({
        name: node.name,
        vertices: node.geometry.attributes.position.count,
        uv: !!node.geometry.attributes.uv,
        joints: node.skeleton.bones.length,
        weights: !!node.geometry.attributes.skinWeight,
        indices: !!node.geometry.attributes.skinIndex,
      });
      for (const material of materials) {
        if (material.map?.image)
          info.textures.push({
            name: material.map.name,
            width: material.map.image.width,
            height: material.map.image.height,
            material: material.type,
          });
      }
    });
    renderer.static.traverse((node) => {
      if (!node.isMesh) return;
      for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
        if (material.map?.image)
          info.environmentMaps.push({
            name: material.map.name,
            width: material.map.image.width,
            height: material.map.image.height,
            normal: material.normalMap?.image?.width || 0,
            roughness: material.roughnessMap?.image?.width || 0,
          });
      }
    });
    info.props = [];
    info.enemyAssets = [];
    renderer.scene.traverse((node) => {
      if (node.userData.propKind) info.props.push(node.userData.propKind);
    });
    for (const [id, enemy] of renderer.actors) {
      if (id !== '$hero' && enemy.visual?.stats.detail === 'high')
        info.enemyAssets.push(enemy.visual.stats.id);
    }
    info.hero = { x: game.hero.x, y: game.hero.y, hp: game.hero.hp, time: game.time };
    info.animation = actor.visual?.root.userData.animation;
    info.mixerTime = actor.visual?.mixer.time;
    info.drawCalls = renderer.renderer.info.render.calls;
    info.triangles = renderer.renderer.info.render.triangles;
    return info;
  });
}
function poseDifference(before, after) {
  return before.bones.reduce((sum, bone, index) => {
    const next = after.bones[index];
    if (!next || next.name !== bone.name) return sum;
    return sum + bone.q.reduce((value, component, i) => value + Math.abs(component - next.q[i]), 0);
  }, 0);
}
async function start(page, id = 'warden') {
  await page.evaluate((classId) => window.__RUNIC.newGame(classId), id);
  await page.waitForFunction(
    () => {
      const actor = window.__RUNIC?.renderer.actors.get('$hero');
      let skinned = false;
      actor?.root.traverse((node) => {
        if (node.isSkinnedMesh) skinned = true;
      });
      return skinned && window.__RUNIC.game.mode === 'playing';
    },
    null,
    { timeout: 30000 },
  );
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
}

try {
  await check('fifteen shipping PBR maps match their source manifest', async () => {
    const manifest = JSON.parse(
      await readFile(path.join(root, 'assets/textures/manifest.json'), 'utf8'),
    );
    let count = 0;
    for (const surface of Object.values(manifest.surfaces)) {
      assert.equal(surface.width, 512);
      assert.equal(surface.height, 512);
      for (const role of ['albedo', 'normal', 'roughness']) {
        const map = surface.maps[role];
        const body = await readFile(path.join(root, map.url));
        assert.equal(body.length, map.bytes, `${map.url}: byte count`);
        assert.equal(sha(body), map.sha256, `${map.url}: SHA256`);
        assert.equal(body.toString('ascii', 8, 12), 'WEBP', `${map.url}: actual WebP container`);
        count++;
      }
    }
    assert.equal(count, 15);
  });
  await check(
    'all shipping character GLBs contain UVs, weighted skeletons, textures and eight animation clips',
    async () => {
      const manifest = JSON.parse(
        await readFile(path.join(root, 'assets/models/manifest.json'), 'utf8'),
      );
      for (const id of classes)
        assert.ok(
          manifest.assets.some((asset) => asset.id === id),
          `${id}: listed in shipping manifest`,
        );
      for (const { id, bytes } of manifest.assets) {
        const body = await readFile(path.join(root, 'assets/models', `${id}.glb`));
        assert.equal(body.length, bytes, `${id}: manifest byte count`);
        const gltf = parseGlb(body);
        assert.ok(gltf.skins?.length, `${id}: skeleton`);
        assert.ok(gltf.images?.length && gltf.textures?.length, `${id}: texture image`);
        const primitives = gltf.meshes.flatMap((mesh) => mesh.primitives);
        assert.ok(
          primitives.some(
            (p) =>
              p.attributes.JOINTS_0 !== undefined &&
              p.attributes.WEIGHTS_0 !== undefined &&
              p.attributes.TEXCOORD_0 !== undefined,
          ),
          `${id}: UV and skin attributes`,
        );
        const clipNames = (gltf.animations || []).map((clip) => clip.name.toLowerCase());
        for (const clip of [
          'idle',
          'walk',
          'attack',
          'attack_alt',
          'cast',
          'dodge',
          'hit',
          'death',
        ]) {
          assert.ok(clipNames.includes(clip), `${id}: ${clip} clip`);
          const animation = gltf.animations.find((entry) => entry.name.toLowerCase() === clip);
          assert.ok(
            animation.channels.length > 0 && animation.samplers.length > 0,
            `${id}: ${clip} tracks`,
          );
        }
        evidence.models[id] = {
          bytes: body.length,
          sha256: sha(body),
          clips: clipNames,
          joints: gltf.skins[0].joints.length,
          images: gltf.images.length,
        };
      }
    },
  );
  await check(
    'two authored props match their manifest and contain UV-mapped GLB geometry',
    async () => {
      const manifest = JSON.parse(
        await readFile(path.join(root, 'assets/props/manifest.json'), 'utf8'),
      );
      for (const id of ['sarcophagus', 'shrine']) {
        const model = manifest.props[id];
        const body = await readFile(path.join(root, model.url));
        assert.equal(body.length, model.bytes, `${id}: byte count`);
        assert.equal(sha(body), model.sha256, `${id}: SHA256`);
        const gltf = parseGlb(body);
        assert.ok(
          gltf.meshes?.some((mesh) =>
            mesh.primitives.some((primitive) => primitive.attributes.TEXCOORD_0 !== undefined),
          ),
          `${id}: UV geometry`,
        );
      }
    },
  );
  browser = await chromium.launch({
    executablePath: process.env.CHROME_BIN || '/usr/bin/google-chrome',
    headless: true,
    args: [
      '--enable-webgl',
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
    ],
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    locale: 'en-US',
  });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto(`${base}/?qa=1`);
  await page.waitForFunction(() => window.__RUNIC?.game, null, { timeout: 30000 });

  await check(
    'five classes render actual textured skinned meshes and animate bones while walking',
    async () => {
      for (const id of classes) {
        await start(page, id);
        const before = await inspect(page);
        assert.ok(before.skins.length > 0 && before.bones.length > 5, `${id}: live skeletal model`);
        assert.ok(
          before.skins.every((skin) => skin.uv && skin.weights && skin.indices),
          `${id}: live UV/skin attributes`,
        );
        assert.ok(
          before.textures.some((texture) => texture.width >= 64 && texture.height >= 64),
          `${id}: decoded texture`,
        );
        await page.keyboard.down('d');
        let after;
        try {
          await page.waitForFunction(
            ({ x, y }) =>
              Math.hypot(window.__RUNIC.game.hero.x - x, window.__RUNIC.game.hero.y - y) > 0.3,
            before.hero,
            { timeout: 15000 },
          );
          after = await inspect(page);
        } finally {
          await page.keyboard.up('d');
        }
        assert.ok(
          poseDifference(before, after) > 0.05,
          `${id}: bone rotations changed during movement`,
        );
        assert.equal(after.animation, 'walk', `${id}: locomotion selects walk clip`);
        assert.ok(after.mixerTime > before.mixerTime, `${id}: live animation mixer advances`);
        evidence.motion.push({
          classId: id,
          distance: Math.hypot(after.hero.x - before.hero.x, after.hero.y - before.hero.y),
          boneRotationChange: poseDifference(before, after),
          skinnedMeshes: after.skins.length,
          textureImages: after.textures,
        });
        await page.screenshot({ path: `${output}/class-${id}.png` });
      }
    },
  );
  await check('real attack and skill inputs select distinct skeletal animation clips', async () => {
    await start(page, 'arcanist');
    for (const [key, clip] of [
      ['Enter', 'attack'],
      ['1', 'cast'],
    ]) {
      const before = await inspect(page);
      // Enter is intentionally a held input, sampled by the simulation frame.
      await page.keyboard.down(key);
      let after;
      try {
        await page.waitForFunction(
          (expected) =>
            window.__RUNIC.renderer.actors.get('$hero').visual?.root.userData.animation ===
            expected,
          clip,
          { timeout: 15000 },
        );
        // Observe a pose after the crossfade has advanced, while the action is active.
        await page.waitForFunction(
          (time) => window.__RUNIC.renderer.actors.get('$hero').visual.mixer.time > time + 0.16,
          before.mixerTime,
          { timeout: 15000 },
        );
        after = await inspect(page);
      } finally {
        await page.keyboard.up(key);
      }
      assert.ok(poseDifference(before, after) > 0.05, `${clip}: changed bone pose`);
      evidence.motion.push({ input: key, clip, boneRotationChange: poseDifference(before, after) });
    }
  });
  await check('six chapters load textured environment meshes and render screenshots', async () => {
    const observedProps = new Set();
    const observedEnemies = new Set();
    for (const floor of [1, 3, 5, 7, 9, 11]) {
      // Scene setup only: this verifies rendering, not campaign completion or balance.
      await page.evaluate(async (depth) => {
        const { game, renderer } = window.__RUNIC;
        game.floor = depth;
        game.makeFloor();
        await renderer.loadEnemyChapter(game);
        renderer.build(game);
      }, floor);
      await page.waitForFunction(
        () => {
          let loaded = false;
          window.__RUNIC.renderer.static.traverse((node) => {
            const materials = Array.isArray(node.material) ? node.material : [node.material];
            if (materials.some((material) => material?.map?.image?.width >= 64)) loaded = true;
          });
          return loaded;
        },
        null,
        { timeout: 30000 },
      );
      await page.evaluate(
        () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
      );
      const scene = await inspect(page);
      scene.props.forEach((prop) => observedProps.add(prop));
      scene.enemyAssets.forEach((asset) => observedEnemies.add(asset));
      assert.ok(scene.environmentMaps.length > 0, `floor ${floor}: mapped architecture`);
      assert.ok(
        scene.environmentMaps.some(
          (map) => map.width === 512 && map.normal === 512 && map.roughness === 512,
        ),
        `floor ${floor}: decoded albedo/normal/roughness maps`,
      );
      assert.ok(
        scene.drawCalls > 0 && scene.triangles > 0,
        `floor ${floor}: actual rendered geometry`,
      );
      evidence.scenes.push({
        floor,
        maps: scene.environmentMaps,
        drawCalls: scene.drawCalls,
        triangles: scene.triangles,
        props: scene.props,
        enemyAssets: [...new Set(scene.enemyAssets)],
      });
      await page.screenshot({ path: `${output}/chapter-${(floor + 1) / 2}.png` });
    }
    for (const prop of ['sarcophagus', 'shrine'])
      assert.ok(observedProps.has(prop), `${prop}: authored GLB instantiated in game scene`);
    for (const enemy of ['hollow_guard', 'crypt_crawler', 'candle_wisp', 'bell_hound'])
      assert.ok(
        observedEnemies.has(enemy),
        `${enemy}: authored enemy GLB instantiated in game scene`,
      );
  });
  await page.close();
  await check(
    'touch viewport loads the upgraded scene and keeps graphics inside the canvas',
    async () => {
      const mobile = await browser.newPage({
        viewport: { width: 844, height: 390 },
        hasTouch: true,
        isMobile: true,
        deviceScaleFactor: 1,
      });
      mobile.on('pageerror', (error) => errors.push(error.message));
      await mobile.goto(`${base}/?qa=1`);
      await mobile.waitForFunction(() => window.__RUNIC?.game, null, { timeout: 30000 });
      await start(mobile, 'ranger');
      const info = await inspect(mobile);
      assert.ok(
        info.skins.length > 0 && info.textures.length > 0,
        'mobile: loaded textured character',
      );
      assert.equal(
        await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        true,
      );
      assert.equal(await mobile.locator('#touch-stick').isVisible(), true);
      await mobile.screenshot({ path: `${output}/mobile-landscape.png` });
      await mobile.setViewportSize({ width: 390, height: 844 });
      await mobile.evaluate(
        () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
      );
      await mobile.screenshot({ path: `${output}/mobile-portrait.png` });
      await mobile.close();
    },
  );
  await check('blocked model and surface requests retain a visible playable fallback', async () => {
    const fallback = await browser.newPage({ viewport: { width: 907, height: 510 } });
    const failures = [],
      blocked = [];
    fallback.on('pageerror', (error) => failures.push(error.message));
    await fallback.route(/\/assets\/(models|textures|props)\//, (route) => {
      blocked.push(new URL(route.request().url()).pathname);
      return route.abort('failed');
    });
    await fallback.goto(`${base}/?qa=1`);
    await fallback.waitForFunction(
      () =>
        window.__RUNIC?.game?.mode === 'playing' && window.__RUNIC?.renderer.actors.has('$hero'),
      null,
      { timeout: 30000 },
    );
    const before = await fallback.evaluate(() => ({
      x: window.__RUNIC.game.hero.x,
      y: window.__RUNIC.game.hero.y,
    }));
    await fallback.keyboard.down('d');
    try {
      await fallback.waitForFunction(
        ({ x, y }) =>
          Math.hypot(window.__RUNIC.game.hero.x - x, window.__RUNIC.game.hero.y - y) > 0.25,
        before,
        { timeout: 15000 },
      );
    } finally {
      await fallback.keyboard.up('d');
    }
    const render = await fallback.evaluate(() => {
      let meshes = 0;
      window.__RUNIC.renderer.actors.get('$hero').root.traverse((node) => {
        if (node.isMesh) meshes++;
      });
      return {
        meshes,
        calls: window.__RUNIC.renderer.renderer.info.render.calls,
        mode: window.__RUNIC.game.mode,
      };
    });
    assert.ok(
      blocked.some((url) => url.endsWith('.glb')),
      'actually blocked model request',
    );
    assert.ok(render.meshes > 0 && render.calls > 0, 'fallback draws geometry');
    assert.equal(render.mode, 'playing');
    assert.deepEqual(failures, [], 'no uncaught errors after blocked assets');
    evidence.fallback = { blocked, render, uncaughtErrors: failures };
    await fallback.screenshot({ path: `${output}/blocked-assets-fallback.png` });
    await fallback.close();
  });
  await check(
    'unresponsive asset transfers time out without holding game startup open',
    async () => {
      const stalled = await browser.newPage({ viewport: { width: 907, height: 510 } });
      const pending = [],
        failures = [];
      stalled.on('pageerror', (error) => failures.push(error.message));
      await stalled.route(/\/assets\/(models|textures|props)\//, (route) => {
        pending.push(route);
      });
      const started = Date.now();
      await stalled.goto(`${base}/?qa=1`, { waitUntil: 'domcontentloaded' });
      await stalled.waitForFunction(
        () =>
          window.__RUNIC?.game?.mode === 'playing' && window.__RUNIC.renderer.actors.has('$hero'),
        null,
        { timeout: 15000 },
      );
      assert.ok(pending.length >= 2, 'actually held asset requests open');
      assert.deepEqual(failures, [], 'no uncaught timeout errors');
      evidence.stalledTransfers = {
        requests: pending.length,
        bootMilliseconds: Date.now() - started,
        uncaughtErrors: failures,
      };
      await Promise.allSettled(pending.map((route) => route.abort('failed')));
      await stalled.close();
    },
  );
  assert.deepEqual(errors, [], 'clean graphics run console');
} catch (error) {
  errors.push(error.stack || String(error));
  process.exitCode = 1;
  console.error(error);
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
  await writeFile(
    `${output}/results.json`,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        scope:
          'Built game in headless Chromium software WebGL; scripted rendering fixtures, not a physical device benchmark or portal approval',
        buildHashes,
        results,
        errors,
        evidence,
      },
      null,
      2,
    ) + '\n',
  );
}
