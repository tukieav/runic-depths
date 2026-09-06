// Final-frame and motion regression evidence, not an automated AAA certification.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

const root = path.resolve('dist');
const output = 'qa/cinematic';
const report = {
  generatedAt: new Date().toISOString(),
  scope:
    'Built game, Chromium software WebGL, scripted visual fixtures. No physical-device performance or AAA/portal certification.',
  buildHashes: {},
  passed: [],
  errors: [],
  frames: [],
  motion: [],
  characters: [],
  diagnostics: [],
  filter: process.env.CINEMATIC_FILTER || null,
};
await mkdir(output, { recursive: true });
async function hashTree(directory) {
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, item.name);
    if (item.isDirectory()) await hashTree(file);
    else
      report.buildHashes[path.relative(root, file)] = createHash('sha256')
        .update(await readFile(file))
        .digest('hex');
  }
}
await hashTree(root);
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
        '.ogg': 'audio/ogg',
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
const check = async (name, run) => {
  if (report.filter && !name.match(new RegExp(report.filter))) return;
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
const frames = (page) =>
  page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );

async function graphicsDiagnostic(page) {
  return page.evaluate(() => {
    const runic = window.__RUNIC;
    const renderer = runic?.renderer;
    const actor = renderer?.actors.get('$hero');
    const characters = renderer?.getGraphicsStatus().characters;
    const materials = new Set();
    actor?.visual?.root.traverse((node) => {
      if (node.isSkinnedMesh)
        for (const material of [].concat(node.material)) materials.add(material.type);
    });
    return {
      mode: runic?.game.mode,
      classId: runic?.game.hero.classId,
      quality: renderer?.quality,
      heroDetail: actor?.visual?.stats.detail,
      heroTriangles: actor?.visual?.stats.triangles,
      heroMaterials: [...materials],
      loaded: characters?.loaded,
      failed: characters?.failed,
      lodLoaded: characters?.lodLoaded,
      lodFailed: characters?.lodFailed,
      postprocessing: renderer?.postprocessingStatus(),
      contextLost: renderer?.renderer.getContext().isContextLost(),
    };
  });
}
async function waitForDetail(page, expected, label) {
  try {
    await page.waitForFunction(
      (value) => window.__RUNIC.renderer.actors.get('$hero')?.visual?.stats.detail === value,
      expected,
      { timeout: 20000 },
    );
  } catch (error) {
    const diagnostic = await graphicsDiagnostic(page).catch((reason) => ({
      unavailable: String(reason),
    }));
    report.diagnostics.push({ label, expected, ...diagnostic });
    throw new Error(
      `${label}: detail did not become ${expected}. Actual graphics state: ${JSON.stringify(diagnostic)}\n${error.message}`,
    );
  }
}

async function inspectFrame(page, label) {
  const result = await page.evaluate(() => {
    const { renderer: r, game } = window.__RUNIC;
    // Read within the same task as rendering. A non-preserved WebGL drawing buffer
    // cannot be inspected reliably after the browser has composited the canvas.
    const gl = r.renderer.getContext();
    const priorGlErrors = [];
    for (let i = 0, error; i < 8 && (error = gl.getError()); i++) priorGlErrors.push(error);
    r.render(game, 0);
    const width = Math.min(320, gl.drawingBufferWidth),
      height = Math.min(240, gl.drawingBufferHeight);
    const pixels = new Uint8Array(width * height * 4);
    gl.readPixels(
      Math.floor((gl.drawingBufferWidth - width) / 2),
      Math.floor((gl.drawingBufferHeight - height) / 2),
      width,
      height,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      pixels,
    );
    let sum = 0,
      squared = 0,
      visible = 0,
      clipped = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      const luma = pixels[i] * 0.2126 + pixels[i + 1] * 0.7152 + pixels[i + 2] * 0.0722;
      sum += luma;
      squared += luma * luma;
      if (luma > 5) visible++;
      if (luma > 250) clipped++;
    }
    const count = pixels.length / 4,
      mean = sum / count;
    const actor = r.actors.get('$hero');
    const heroMaterials = new Set();
    actor?.visual?.root.traverse((node) => {
      if (node.isSkinnedMesh)
        for (const material of [].concat(node.material)) heroMaterials.add(material.type);
    });
    const foot = r.project(game.hero.x, game.hero.y, 0),
      head = r.project(game.hero.x, game.hero.y, 1.6);
    const glError = gl.getError();
    return {
      floor: game.floor,
      quality: r.quality,
      framebuffer: [gl.drawingBufferWidth, gl.drawingBufferHeight],
      camera: {
        top: r.camera.top,
        bottom: r.camera.bottom,
        left: r.camera.left,
        right: r.camera.right,
      },
      visibleFraction: visible / count,
      clippedFraction: clipped / count,
      meanLuminance: mean,
      luminanceDeviation: Math.sqrt(Math.max(0, squared / count - mean * mean)),
      heroPixels: Math.hypot(head.x - foot.x, head.y - foot.y),
      heroVisible: !!actor?.root.visible,
      animation: actor?.visual?.root.userData.animation,
      characterDetail: actor?.visual?.stats.detail,
      characterTriangles: actor?.visual?.stats.triangles,
      heroMaterials: [...heroMaterials],
      drawCalls: r.renderer.info.render.calls,
      triangles: r.renderer.info.render.triangles,
      postprocessing: r.postprocessingStatus?.() || r.postprocessing?.status?.() || null,
      audio: window.__RUNIC.snapshot().audio,
      priorGlErrors,
      glError,
    };
  });
  report.frames.push({ label, ...result });
  await page.screenshot({ path: `${output}/${label}.png` });
  assert.equal(result.glError, 0, `${label}: no WebGL error from sampled frame`);
  assert.deepEqual(result.priorGlErrors, [], `${label}: no preceding WebGL error`);
  assert.ok(result.visibleFraction > 0.5, `${label}: rendered center is not black`);
  assert.ok(result.luminanceDeviation > 3, `${label}: final framebuffer contains scene variation`);
  assert.ok(result.clippedFraction < 0.3, `${label}: scene is not washed out`);
  assert.ok(
    result.heroVisible && result.heroPixels > 12,
    `${label}: hero has visible screen footprint`,
  );
  assert.ok(Object.values(result.camera).every(Number.isFinite), `${label}: valid camera`);
  return result;
}

async function pose(page) {
  return page.evaluate(() => {
    const visual = window.__RUNIC.renderer.actors.get('$hero').visual;
    const bones = [];
    visual.root.traverse((node) => {
      if (node.isBone) bones.push({ name: node.name, quaternion: node.quaternion.toArray() });
    });
    return { animation: visual.root.userData.animation, time: visual.mixer.time, bones };
  });
}
function poseDelta(a, b) {
  const next = new Map(b.bones.map((bone) => [bone.name, bone]));
  return a.bones.reduce(
    (total, bone) =>
      total +
      bone.quaternion.reduce(
        (sum, value, i) => sum + Math.abs(value - (next.get(bone.name)?.quaternion[i] ?? value)),
        0,
      ),
    0,
  );
}
async function start(page, id = 'warden') {
  await page.evaluate((classId) => window.__RUNIC.newGame(classId), id);
  await page.waitForFunction(
    () =>
      window.__RUNIC.game.mode === 'playing' && window.__RUNIC.renderer.actors.get('$hero')?.visual,
    null,
    { timeout: 30000 },
  );
  await frames(page);
  // Review the normal playing composition after the player dismisses onboarding.
  // The full browser suite separately checks controls with onboarding visible.
  if (await page.locator('#dismiss-tutorial').isVisible())
    await page.locator('#dismiss-tutorial').click();
}

try {
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
  report.browser = browser.version();
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    locale: 'en-US',
  });
  page.on('pageerror', (error) => report.errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') report.errors.push(message.text());
  });
  await page.goto(`${base}/?qa=1`);
  await page.waitForFunction(() => window.__RUNIC?.game, null, { timeout: 30000 });
  await start(page);
  await check(
    'five classes use articulated rigs and decoded color normal roughness emissive maps',
    async () => {
      const lods = JSON.parse(
        await readFile(path.join(root, 'assets/models/lod/manifest.json'), 'utf8'),
      );
      assert.equal(
        lods.assets.length,
        8,
        'all character families have a packaged performance model',
      );
      report.lods = [];
      for (const entry of lods.assets) {
        const body = await readFile(path.join(root, `assets/models/lod/${entry.id}.glb`));
        assert.equal(body.length, entry.bytes, `${entry.id}: performance model byte count`);
        assert.equal(body.readUInt32LE(0), 0x46546c67, 'actual GLB container');
        const gltf = JSON.parse(body.subarray(20, 20 + body.readUInt32LE(12)).toString());
        const triangles = gltf.meshes
          .flatMap((mesh) => mesh.primitives)
          .reduce(
            (total, primitive) =>
              total + gltf.accessors[primitive.indices ?? primitive.attributes.POSITION].count / 3,
            0,
          );
        assert.ok(triangles < 5000, `${entry.id}: actual low-detail index count`);
        assert.ok(
          gltf.skins[0].joints.length >= 24,
          `${entry.id}: low-detail rig remains articulated`,
        );
        for (const clip of ['walk', 'attack', 'cast', 'dodge', 'hit', 'death'])
          assert.ok(
            gltf.animations.some((animation) => animation.name === clip),
            `${entry.id}: ${clip} retained in performance mode`,
          );
        report.lods.push({ id: entry.id, triangles, bytes: body.length });
      }
      for (const id of ['warden', 'ranger', 'arcanist', 'reaver', 'oracle']) {
        await start(page, id);
        const character = await page.evaluate(() => {
          const visual = window.__RUNIC.renderer.actors.get('$hero').visual;
          let bones = 0;
          const materials = [];
          visual.root.traverse((node) => {
            if (node.isBone) bones++;
            if (!node.isSkinnedMesh) return;
            for (const material of [].concat(node.material))
              materials.push({
                vertices: node.geometry.attributes.position.count,
                color: material.map?.image?.width || 0,
                normal: material.normalMap?.image?.width || 0,
                roughness: material.roughnessMap?.image?.width || 0,
                emissive: material.emissiveMap?.image?.width || 0,
              });
          });
          return {
            id: window.__RUNIC.game.hero.classId,
            bones,
            materials,
            clips: visual.stats.clips,
          };
        });
        assert.ok(character.bones >= 24, `${id}: articulated multi-segment rig`);
        assert.ok(
          character.materials.some(
            (m) => m.color >= 512 && m.normal >= 512 && m.roughness >= 512 && m.emissive >= 512,
          ),
          `${id}: decoded differentiated material maps`,
        );
        for (const clip of [
          'idle',
          'walk',
          'attack',
          'attack_alt',
          'cast',
          'dodge',
          'hit',
          'death',
        ])
          assert.ok(character.clips.includes(clip), `${id}: ${clip} authored clip`);
        report.characters.push(character);
        await page.screenshot({ path: `${output}/class-${id}.png` });
      }
    },
  );
  await check('six chapter compositions render visible final frames on desktop', async () => {
    for (const floor of [1, 3, 5, 7, 9, 11]) {
      await page.evaluate((depth) => {
        const { game, renderer } = window.__RUNIC;
        game.floor = depth;
        game.makeFloor();
        renderer.build(game);
      }, floor);
      await frames(page);
      await inspectFrame(page, `chapter-${(floor + 1) / 2}-desktop`);
    }
  });
  await check('high and low quality survive repeated switching and resize', async () => {
    await start(page);
    for (const [quality, width, height] of [
      ['high', 1280, 720],
      ['low', 907, 510],
      ['high', 1440, 900],
    ]) {
      await page.setViewportSize({ width, height });
      await page.evaluate((value) => window.__RUNIC.renderer.setQuality(value), quality);
      await waitForDetail(page, quality, `quality switch to ${quality}`);
      await frames(page);
      const frame = await inspectFrame(page, `quality-${quality}-${width}x${height}`);
      assert.equal(frame.quality, quality);
      assert.equal(
        frame.characterDetail,
        quality,
        'quality change selects the appropriate live model',
      );
      assert.ok(
        quality === 'low' ? frame.characterTriangles < 5000 : frame.characterTriangles > 15000,
        'live model triangle count reflects the selected asset detail',
      );
      assert.deepEqual(frame.heroMaterials, [
        quality === 'low' ? 'MeshLambertMaterial' : 'MeshStandardMaterial',
      ]);
      assert.ok(frame.postprocessing, 'live postprocessing state is observable');
      assert.equal(frame.postprocessing.enabled, quality === 'high');
      assert.equal(frame.postprocessing.width, width, 'intermediate targets follow viewport width');
      assert.equal(
        frame.postprocessing.height,
        height,
        'intermediate targets follow viewport height',
      );
      assert.deepEqual(
        frame.postprocessing.passes,
        quality === 'high'
          ? ['scene', 'contact-occlusion', 'hdr-bloom', 'color-grade', 'tone-map', 'fxaa']
          : ['scene'],
      );
    }
    await page.setViewportSize({ width: 821, height: 462 });
    await page.locator('#pause-button').click();
    const zoom = page.locator('#setting-zoom');
    await zoom.scrollIntoViewIfNeeded();
    assert.ok(
      await zoom.evaluate((element) => {
        const r = element.getBoundingClientRect();
        return (
          r.width >= 80 &&
          r.x >= 0 &&
          r.right <= innerWidth &&
          element === document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
        );
      }),
      'camera zoom control is reachable in a compact portal pause menu',
    );
    const cameraHeight = () =>
      page.evaluate(
        () => window.__RUNIC.renderer.camera.top - window.__RUNIC.renderer.camera.bottom,
      );
    const changeZoom = (value) =>
      zoom.evaluate((element, next) => {
        element.value = String(next);
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
      }, value);
    await changeZoom(0.8);
    const wide = await cameraHeight();
    await changeZoom(1.3);
    const close = await cameraHeight();
    assert.ok(close < wide * 0.8, 'actual settings events bring the playing camera closer');
    await page.screenshot({ path: `${output}/compact-camera-setting.png` });
    await page.reload();
    await page.waitForFunction(() => window.__RUNIC?.renderer, null, { timeout: 30000 });
    assert.equal(
      await page.evaluate(() => window.__RUNIC.renderer.zoom),
      1.3,
      'camera preference survives reload',
    );
    report.cameraZoom = {
      viewport: [821, 462],
      worldHeightWide: wide,
      worldHeightClose: close,
      restoredZoom: 1.3,
    };
    await start(page);
    await page.locator('#pause-button').click();
    await changeZoom(1);
    await page.keyboard.press('Escape');
    await page.setViewportSize({ width: 1440, height: 900 });
  });
  await check('real attack cast dodge and damage select distinct animated poses', async () => {
    for (const [clip, key] of [
      ['attack', 'Enter'],
      ['cast', '1'],
      ['dodge', 'Space'],
      ['hit', null],
    ]) {
      await start(page, 'arcanist');
      const before = await pose(page);
      if (key) await page.keyboard.down(key);
      else
        await page.evaluate(() => {
          window.__RUNIC.game.hero.invulnerable = 0;
          window.__RUNIC.game.hurtHero(3);
        });
      let after;
      try {
        await page.waitForFunction(
          (expected) =>
            window.__RUNIC.renderer.actors.get('$hero').visual.root.userData.animation === expected,
          clip,
          { timeout: 15000 },
        );
        after = await pose(page);
        // Crossfade starts at the previous pose; observe actual mixer progression.
        if (poseDelta(before, after) <= 0.01) {
          await page.waitForFunction(
            (time) => window.__RUNIC.renderer.actors.get('$hero').visual.mixer.time > time + 0.05,
            before.time,
            { timeout: 15000 },
          );
          after = await pose(page);
        }
      } finally {
        if (key) await page.keyboard.up(key);
      }
      const delta = poseDelta(before, after);
      assert.ok(delta > 0.01, `${clip}: skinning changes bone pose`);
      report.motion.push({
        clip,
        input: key || 'scripted real damage event',
        boneRotationChange: delta,
        bones: after.bones.length,
      });
      await page.screenshot({ path: `${output}/action-${clip}.png` });
    }
  });
  await check('postprocessed scene survives WebGL context restoration', async () => {
    await page.evaluate(() => window.__RUNIC.renderer.renderer.forceContextLoss());
    await page.waitForFunction(() => window.__RUNIC.game.mode === 'paused');
    await page.evaluate(() => window.__RUNIC.renderer.renderer.forceContextRestore());
    await page.waitForFunction(
      () => !window.__RUNIC.renderer.renderer.getContext().isContextLost(),
      null,
      { timeout: 15000 },
    );
    await page.keyboard.press('Escape');
    await frames(page);
    await inspectFrame(page, 'context-restored');
    await start(page, 'warden');
    await inspectFrame(page, 'context-restored-new-journey');
  });
  await check(
    'performance portal visibly changes from locked to unlocked after real kill events',
    async () => {
      await start(page, 'warden');
      await page.evaluate(() => window.__RUNIC.renderer.setQuality('low'));
      await waitForDetail(page, 'low', 'performance portal model');
      await page.evaluate(() => {
        const { game, renderer } = window.__RUNIC;
        const portal = game.objects.find((object) => object.type === 'portal');
        game.mode = 'paused';
        game.hero.x = portal.x;
        game.hero.y = portal.y;
        game.reveal();
        // The fixture relocates the paused hero instantly; rebuild refreshes the
        // exploration texture without waiting for normal simulation movement.
        renderer.build(game);
        renderer.render(game, 0.1);
      });
      await frames(page);
      const portalState = () =>
        page.evaluate(() => {
          const { game, renderer } = window.__RUNIC;
          const portal = [...renderer.objectModels.values()].find((object) => object.portal);
          const displayedRing = portal.portal.children.find(
            (node) => node.isMesh && node.geometry.type === 'TorusGeometry',
          );
          return {
            unlocked: game.portalOpen,
            displayed: portal.group.visible,
            material: displayedRing.material.type,
            color: displayedRing.material.color.toArray(),
            emissive: displayedRing.material.emissive.toArray(),
            intensity: displayedRing.material.emissiveIntensity,
          };
        });
      const locked = await portalState();
      assert.equal(locked.unlocked, false);
      assert.equal(locked.displayed, true, 'portal is actually visible to the playing camera');
      assert.equal(locked.material, 'MeshLambertMaterial');
      await inspectFrame(page, 'performance-portal-locked');
      await page.evaluate(() => {
        const { game, renderer } = window.__RUNIC;
        for (const enemy of [...game.enemies]) game.hurtEnemy(enemy, 1e8);
        renderer.render(game, 0.1);
      });
      await frames(page);
      const unlocked = await portalState();
      assert.equal(unlocked.unlocked, true, 'normal kill accounting opens the portal');
      assert.notDeepEqual(unlocked.color, locked.color, 'displayed ring changes color');
      assert.notDeepEqual(
        unlocked.emissive,
        locked.emissive,
        'displayed ring changes emission color',
      );
      assert.ok(unlocked.intensity > locked.intensity, 'displayed ring becomes brighter');
      report.portal = {
        locked,
        unlocked,
        scope:
          'Scripted kills exercise normal engine accounting; actual displayed ring material is inspected.',
      };
      await inspectFrame(page, 'performance-portal-unlocked');
    },
  );
  await check(
    'rebuilding a warmed character and NPC scene does not accumulate GPU textures',
    async () => {
      await start(page, 'warden');
      await page.evaluate(() => {
        window.__RUNIC.game.mode = 'paused';
      });
      const rebuild = async () => {
        await page.evaluate(() => {
          const { game, renderer } = window.__RUNIC;
          renderer.build(game);
          renderer.render(game, 0.016);
        });
        await frames(page);
        return page.evaluate(() => window.__RUNIC.renderer.renderer.info.memory.textures);
      };
      await rebuild();
      const baseline = await rebuild();
      const counts = [];
      for (let i = 0; i < 6; i++) counts.push(await rebuild());
      report.textureLifetime = { baseline, repeatedSceneTextures: counts, tolerance: 2 };
      assert.ok(
        counts.every((count) => count <= baseline + 2),
        `fixed visible scene must not leak bone textures per rebuild: baseline ${baseline}, observed ${counts}`,
      );
      assert.ok(
        counts.at(-1) - counts[0] <= 2,
        'GPU texture growth stays bounded across six rebuilds',
      );
      await page.evaluate(() => {
        window.__RUNIC.game.mode = 'playing';
      });
    },
  );
  await page.close();
  await check(
    'delayed optional LOD transfers do not delay Performance materials or gameplay',
    async () => {
      const delayed = await browser.newPage({
        viewport: { width: 907, height: 510 },
        deviceScaleFactor: 1,
      });
      const pending = [];
      delayed.on('pageerror', (error) => report.errors.push(error.message));
      delayed.on('console', (message) => {
        if (message.type() === 'error') report.errors.push(message.text());
      });
      await delayed.route(/\/assets\/models\/lod\//, (route) => {
        pending.push(route);
      });
      try {
        await delayed.goto(`${base}/?qa=1`);
        await delayed.waitForFunction(() => window.__RUNIC?.game, null, { timeout: 30000 });
        await start(delayed, 'warden');
        const initial = await graphicsDiagnostic(delayed);
        assert.equal(initial.heroDetail, 'high', 'fixture starts with a full-quality loaded model');
        await delayed.evaluate(() => {
          window.__RUNIC.game.gold = 137;
        });
        await delayed.locator('#pause-button').click();
        const switchedAt = Date.now();
        await delayed.locator('#setting-quality').selectOption('low');
        await delayed.waitForFunction(
          () => {
            const visual = window.__RUNIC.renderer.actors.get('$hero')?.visual;
            const materials = [];
            visual?.root.traverse((node) => {
              if (node.isSkinnedMesh) materials.push(...[].concat(node.material));
            });
            return (
              materials.length > 0 && materials.every((material) => material.isMeshLambertMaterial)
            );
          },
          null,
          { timeout: 10000 },
        );
        const whileHeld = await graphicsDiagnostic(delayed);
        assert.ok(pending.length > 0, 'actual LOD requests are being held');
        assert.equal(
          whileHeld.heroDetail,
          'high',
          'existing geometry remains usable before optional files arrive',
        );
        assert.equal(whileHeld.quality, 'low');
        assert.deepEqual(
          whileHeld.heroMaterials,
          ['MeshLambertMaterial'],
          'lighter materials apply while LOD transfer is still pending',
        );
        assert.equal(whileHeld.lodLoaded.length, 0);
        await delayed.keyboard.press('Escape');
        assert.equal(await delayed.evaluate(() => window.__RUNIC.game.mode), 'playing');
        const beforeClock = await delayed.evaluate(() => window.__RUNIC.game.time);
        await delayed.waitForFunction(
          (time) => window.__RUNIC.game.time > time + 0.1,
          beforeClock,
          { timeout: 10000 },
        );
        // This exceeds the former 4.5-second asset deadline. Keep files pending
        // through the check, then release real responses rather than mocking GLBs.
        await delayed.waitForTimeout(Math.max(0, 5600 - (Date.now() - switchedAt)));
        const releaseAt = Date.now();
        await Promise.all(pending.splice(0).map((route) => route.continue()));
        await waitForDetail(delayed, 'low', 'late optional LOD arrival');
        const afterArrival = await graphicsDiagnostic(delayed);
        assert.ok(afterArrival.heroTriangles < 5000);
        assert.deepEqual(afterArrival.lodFailed, {});
        assert.equal(
          await delayed.evaluate(() => window.__RUNIC.game.gold),
          137,
          'late visual refresh preserves the current journey',
        );
        report.delayedLods = {
          heldMilliseconds: releaseAt - switchedAt,
          simulationAdvancedWhilePending: true,
          initial,
          whileHeld,
          afterArrival,
        };
        await inspectFrame(delayed, 'delayed-lod-performance-arrived');
      } catch (error) {
        const diagnostic = await graphicsDiagnostic(delayed).catch((reason) => ({
          unavailable: String(reason),
        }));
        report.diagnostics.push({
          label: 'delayed LOD fixture',
          pendingRequests: pending.length,
          ...diagnostic,
        });
        throw error;
      } finally {
        await Promise.allSettled(pending.map((route) => route.abort('failed')));
        await delayed.close();
      }
    },
  );
  await check(
    'touch landscape and portrait preserve scene and combat control visibility',
    async () => {
      const touch = await browser.newPage({
        viewport: { width: 844, height: 390 },
        hasTouch: true,
        isMobile: true,
        deviceScaleFactor: 1,
      });
      touch.on('pageerror', (error) => report.errors.push(error.message));
      await touch.goto(`${base}/?qa=1`);
      await touch.waitForFunction(() => window.__RUNIC?.game, null, { timeout: 30000 });
      await start(touch, 'ranger');
      for (const [width, height] of [
        [844, 390],
        [390, 844],
      ]) {
        await touch.setViewportSize({ width, height });
        await frames(touch);
        await inspectFrame(touch, `touch-${width}x${height}`);
        for (const id of [
          '#touch-stick',
          '#basic-button',
          '#skill-0',
          '#skill-1',
          '#skill-2',
          '#dodge-button',
        ]) {
          assert.ok(await touch.locator(id).isVisible(), `${width}x${height}: ${id} visible`);
          assert.ok(
            await touch.locator(id).evaluate((element) => {
              const r = element.getBoundingClientRect();
              return (
                r.x >= 0 &&
                r.y >= 0 &&
                r.right <= innerWidth + 1 &&
                r.bottom <= innerHeight + 1 &&
                element.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2))
              );
            }),
            `${width}x${height}: ${id} reachable`,
          );
        }
      }
      await touch.close();
    },
  );
  await check(
    'missing floating-point color targets keeps direct-render gameplay visible',
    async () => {
      const fallback = await browser.newPage({ viewport: { width: 907, height: 510 } });
      fallback.on('pageerror', (error) => report.errors.push(error.message));
      fallback.on('console', (message) => {
        if (message.type() === 'error') report.errors.push(message.text());
      });
      await fallback.addInitScript(() => {
        const prototype = WebGL2RenderingContext.prototype;
        const original = prototype.getExtension;
        prototype.getExtension = function (name) {
          return name === 'EXT_color_buffer_float' ? null : original.call(this, name);
        };
        const supported = prototype.getSupportedExtensions;
        prototype.getSupportedExtensions = function () {
          return supported.call(this).filter((name) => name !== 'EXT_color_buffer_float');
        };
      });
      await fallback.goto(`${base}/?qa=1`);
      await fallback.waitForFunction(() => window.__RUNIC?.game, null, { timeout: 30000 });
      await start(fallback);
      await fallback.evaluate(() => window.__RUNIC.renderer.setQuality('high'));
      await frames(fallback);
      const frame = await inspectFrame(fallback, 'no-float-color-target-fallback');
      assert.equal(
        frame.postprocessing.enabled,
        false,
        'high preference cannot enable unsupported HDR targets',
      );
      assert.ok(frame.postprocessing.fallbackReason.length > 0, 'capability fallback is explained');
      assert.equal(await fallback.evaluate(() => window.__RUNIC.game.mode), 'playing');
      await fallback.close();
    },
  );
  assert.deepEqual(report.errors, [], 'clean cinematic console');
} catch (error) {
  report.errors.push(error.stack || String(error));
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
  await writeFile(`${output}/results.json`, JSON.stringify(report, null, 2) + '\n');
}
