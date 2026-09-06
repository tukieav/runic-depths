import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, mkdir, stat, writeFile, rm } from 'node:fs/promises';
import { resolve, dirname, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';

const exec = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, 'marketing/v2');
const rawDirectory = resolve(output, '.recordings');
const captureQuality = process.env.RUNIC_CAPTURE_QUALITY === 'low' ? 'low' : 'high';
const capturePixelRatio = 0.8;
const mime = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
};
await mkdir(output, { recursive: true });
await mkdir(rawDirectory, { recursive: true });
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    let path = resolve(root, '.' + pathname);
    if (path !== root && !path.startsWith(root + sep)) throw new Error('Outside root');
    if ((await stat(path)).isDirectory()) path = resolve(path, 'index.html');
    const bytes = await readFile(path);
    response.writeHead(200, { 'Content-Type': mime[extname(path)] || 'application/octet-stream' });
    response.end(bytes);
  } catch {
    response.writeHead(404);
    response.end('Not found');
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const gameURL = process.env.RUNIC_GAME_URL || `${base}/dist/?qa=1`;
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome',
  headless: true,
  args: ['--no-sandbox', '--enable-unsafe-swiftshader'],
});
const manifest = {
  version: '2.1',
  createdAt: new Date().toISOString(),
  requirements: 'https://docs.crazygames.com/requirements/game-covers/',
  artwork: {
    source: '../../assets/hero-atlas.png',
    provenance: '../../assets/PROVENANCE.md',
    method:
      'Original five-hero portrait atlas placed in a responsive HTML/CSS composition; covers rendered with Chromium. No image manipulation pipeline.',
  },
  coverCopy: 'RUNIC DEPTHS',
  covers: [],
  videos: [],
  staging:
    'Preview encounters are staged before recording using the local QA interface: level 8 Rune Arcanist with ordinary level/talent stats, full health and mana, positioned in the floor 6 guardian arena. Recording then uses real keyboard movement, attacks and abilities in the actual game at normal wall-clock speed. No invulnerability, damage override, debug overlay or speed-up is used.',
  capture: `Game graphics ${captureQuality} setting (${captureQuality === 'high' ? 'dynamic shadows and point lights enabled' : 'performance mode'}). Viewport is rendered at ${capturePixelRatio} internal pixel ratio for software Chromium capture; DOM/UI and output remain full resolution. No audio track or cursor. Each preview begins with its matching static cover for approximately 0.5 seconds.`,
  captureQuality,
  buildHashes: Object.fromEntries(
    await Promise.all(
      [
        'bundle.js',
        'bundle.css',
        'index.html',
        'assets/models/manifest.json',
        'assets/textures/manifest.json',
        'assets/props/manifest.json',
      ].map(async (name) => [
        name,
        createHash('sha256')
          .update(await readFile(resolve(root, 'dist', name)))
          .digest('hex'),
      ]),
    ),
  ),
};

async function cover(name, width, height) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  await page.goto(`${base}/marketing/v2/cover.html`);
  await page.waitForFunction(() => window.coverReady);
  await page.screenshot({ path: resolve(output, name), animations: 'disabled' });
  await page.close();
  manifest.covers.push({
    file: name,
    width,
    height,
    bytes: (await stat(resolve(output, name))).size,
  });
  console.log(`Cover ready: ${name} ${width}x${height}`);
}

async function preview(name, width, height, openingCover) {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
    recordVideo: { dir: rawDirectory, size: { width, height } },
  });
  await context.addInitScript(
    (quality) =>
      localStorage.setItem(
        'runicdepths.preferences.v2',
        JSON.stringify({
          language: 'en',
          tutorial: true,
          muted: true,
          quality,
          reducedMotion: false,
        }),
      ),
    captureQuality,
  );
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(gameURL);
  await page.waitForFunction(() => window.__RUNIC?.game);
  await page.addStyleTag({
    content:
      'html,body,*{cursor:none!important}#onboarding,#floor-announcement,#toast-stack{display:none!important}',
  });
  await page.evaluate(
    ({ captureQuality, capturePixelRatio }) => {
      const qa = window.__RUNIC;
      qa.newGame('arcanist');
      const game = qa.game;
      game.floor = 6;
      game.makeFloor();
      game.hero.level = 8;
      game.talents = { might: 2, vitality: 2, focus: 2 };
      game.stats();
      game.hero.hp = game.hero.maxHp;
      game.hero.mana = game.hero.maxMana;
      const arena = game.rooms[8];
      game.hero.x = arena.cx - 2;
      game.hero.y = arena.cy - 1;
      game.reveal();
      game.mode = 'paused';
      game.hero.invulnerable = 0;
      qa.renderer.setQuality(captureQuality);
      qa.renderer.renderer.setPixelRatio(capturePixelRatio);
      qa.renderer.build(game);
      qa.renderer.render(game, 0.016);
      document.querySelector('#onboarding').hidden = true;
    },
    { captureQuality, capturePixelRatio },
  );
  await page.waitForTimeout(1600);
  const coverData = `data:image/png;base64,${(await readFile(resolve(output, openingCover))).toString('base64')}`;
  await page.evaluate(async (source) => {
    const img = document.createElement('img');
    img.id = 'marketing-opening';
    img.src = source;
    Object.assign(img.style, {
      position: 'fixed',
      inset: '0',
      width: '100vw',
      height: '100vh',
      objectFit: 'fill',
      zIndex: '2147483647',
    });
    document.body.append(img);
    await img.decode();
  }, coverData);
  // The tail of this take is exactly 18 seconds. The extra 0.7 s opening
  // provides pre-roll so trimming never exposes page load or staging frames.
  await page.waitForTimeout(1200);
  await page.evaluate(() => {
    document.querySelector('#marketing-opening').remove();
    window.__RUNIC.game.mode = 'playing';
  });
  const started = Date.now();
  const timeline = [
    [0, 'down', 'Enter'],
    [150, 'press', 'Digit1'],
    [600, 'down', 'KeyD'],
    [1050, 'up', 'KeyD'],
    [1450, 'press', 'Digit3'],
    [2100, 'down', 'KeyS'],
    [2550, 'up', 'KeyS'],
    [3100, 'press', 'Digit2'],
    [3900, 'down', 'KeyA'],
    [4400, 'up', 'KeyA'],
    [4950, 'press', 'KeyQ'],
    [5450, 'down', 'KeyW'],
    [5900, 'up', 'KeyW'],
    [6700, 'press', 'Digit1'],
    [7200, 'down', 'KeyD'],
    [7600, 'up', 'KeyD'],
    [8300, 'press', 'Digit3'],
    [9050, 'down', 'KeyS'],
    [9500, 'up', 'KeyS'],
    [10300, 'press', 'KeyQ'],
    [11100, 'down', 'KeyA'],
    [11550, 'up', 'KeyA'],
    [12300, 'press', 'Digit2'],
    [13000, 'press', 'Digit1'],
    [13900, 'down', 'KeyW'],
    [14350, 'up', 'KeyW'],
    [15100, 'press', 'Digit3'],
    [16000, 'press', 'KeyQ'],
    [17200, 'up', 'Enter'],
  ];
  for (const [at, action, key] of timeline) {
    const wait = at - (Date.now() - started);
    if (wait > 0) await page.waitForTimeout(wait);
    await page.keyboard[action](key);
    if (at === 15100)
      await page.screenshot({ path: resolve(output, name.replace('.mp4', '-last-frame.png')) });
  }
  const remaining = 17500 - (Date.now() - started);
  if (remaining > 0) await page.waitForTimeout(remaining);
  const snapshot = await page.evaluate(() => ({
    mode: __RUNIC.game.mode,
    hp: __RUNIC.game.hero.hp,
    kills: __RUNIC.game.floorKills,
    bossAlive: __RUNIC.game.enemies.some((e) => e.boss && !e.dead),
    graphics: __RUNIC.renderer.getGraphicsStatus(),
    shadowMapEnabled: __RUNIC.renderer.renderer.shadowMap.enabled,
  }));
  const video = page.video();
  await context.close();
  const raw = await video.path();
  const { stdout: durationText } = await exec('ffprobe', [
    '-v',
    'error',
    '-show_entries',
    'format=duration',
    '-of',
    'default=nw=1:nk=1',
    raw,
  ]);
  const duration = Number(durationText.trim());
  // Match the actual cover's pixels: software capture can append repeated tail
  // frames, and a scene-change threshold depends on the dungeon's palette.
  const frameBytes = 96 * 54 * 3;
  const { stdout: frames } = await exec(
    'ffmpeg',
    [
      '-v',
      'error',
      '-i',
      raw,
      '-vf',
      'fps=5,scale=96:54',
      '-pix_fmt',
      'rgb24',
      '-f',
      'rawvideo',
      '-',
    ],
    { encoding: 'buffer', maxBuffer: 32 * 1024 * 1024 },
  );
  const { stdout: reference } = await exec(
    'ffmpeg',
    [
      '-v',
      'error',
      '-i',
      resolve(output, openingCover),
      '-vf',
      'scale=96:54',
      '-frames:v',
      '1',
      '-pix_fmt',
      'rgb24',
      '-f',
      'rawvideo',
      '-',
    ],
    { encoding: 'buffer', maxBuffer: 1024 * 1024 },
  );
  const coverFrames = [];
  for (let frame = 0; frame < frames.length / frameBytes; frame++) {
    let difference = 0;
    for (let pixel = 0; pixel < frameBytes; pixel++)
      difference += Math.abs(frames[frame * frameBytes + pixel] - reference[pixel]);
    if (difference / frameBytes < 8) coverFrames.push(frame);
  }
  const transition = coverFrames.length ? (coverFrames.at(-1) + 1) / 5 : NaN;
  if (!Number.isFinite(transition))
    throw new Error(`Matching opening cover not found in ${name}, duration ${duration}`);
  const start = Math.max(0, transition - 0.5);
  await exec(
    'ffmpeg',
    [
      '-y',
      '-ss',
      String(start),
      '-i',
      raw,
      '-t',
      '18',
      '-an',
      '-c:v',
      'libx264',
      '-preset',
      'fast',
      '-crf',
      '20',
      '-pix_fmt',
      'yuv420p',
      '-r',
      '30',
      '-movflags',
      '+faststart',
      resolve(output, name),
    ],
    { maxBuffer: 4 * 1024 * 1024 },
  );
  const { stdout: probe } = await exec('ffprobe', [
    '-v',
    'error',
    '-show_entries',
    'stream=codec_name,codec_type,width,height,r_frame_rate:format=duration,size',
    '-of',
    'json',
    resolve(output, name),
  ]);
  const metadata = JSON.parse(probe),
    streams = metadata.streams;
  if (streams.some((stream) => stream.codec_type === 'audio'))
    throw new Error('Preview unexpectedly contains audio');
  if (Number(metadata.format.size) > 50 * 1024 * 1024) throw new Error('Preview exceeds 50 MB');
  if (snapshot.mode !== 'playing') throw new Error(`Preview interrupted by ${snapshot.mode} panel`);
  if (errors.length) throw new Error(`Preview browser errors: ${errors.join('; ')}`);
  if (snapshot.graphics.surfaces.loaded !== 15 || snapshot.graphics.props.loaded !== 2)
    throw new Error('Preview used incomplete surface/prop assets');
  if (!snapshot.graphics.characters.ready)
    throw new Error('Preview used incomplete character assets');
  manifest.videos.push({
    file: name,
    width,
    height,
    ...metadata,
    openingCover,
    openingCoverSeconds: 0.5,
    errors,
    endState: snapshot,
  });
  await rm(raw);
  console.log(
    `Preview ready: ${name}, ${metadata.format.duration}s, ${metadata.format.size} bytes`,
  );
}

try {
  await cover('cover-16x9.png', 1920, 1080);
  await cover('cover-1x1.png', 800, 800);
  await cover('cover-2x3.png', 800, 1200);
  if (!process.argv.includes('--covers-only')) {
    await preview('video-landscape.mp4', 1920, 1080, 'cover-16x9.png');
    await preview('video-portrait.mp4', 720, 1080, 'cover-2x3.png');
  }
  await writeFile(resolve(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
