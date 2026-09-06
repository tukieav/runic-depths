// Real Ogg decoding, gesture-only loading, audible mixer and lifecycle regression.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
const server = createServer(async (req, res) => {
  try {
    const path = new URL(req.url, 'http://localhost').pathname;
    if (path === '/') {
      res.setHeader('Content-Type', 'text/html');
      res.end(
        '<!doctype html><html><head><link rel="icon" href="data:,"></head><body><button id="start">Start</button></body></html>',
      );
    } else if (path === '/src/audio.js' || /^\/assets\/audio\/[a-z0-9-]+\.ogg$/.test(path)) {
      res.setHeader('Content-Type', path.endsWith('.ogg') ? 'audio/ogg' : 'text/javascript');
      res.end(await readFile(new URL(`..${path}`, import.meta.url)));
    } else {
      res.writeHead(404);
      res.end();
    }
  } catch {
    res.writeHead(500);
    res.end();
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({
  executablePath: process.env.CHROME_BIN || '/usr/bin/google-chrome',
  headless: true,
});
try {
  const page = await browser.newPage();
  const errors = [],
    requests = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (['warning', 'error'].includes(message.type())) errors.push(message.text());
  });
  page.on('request', (request) => {
    if (request.url().endsWith('.ogg')) requests.push(request.url());
  });
  const url = `http://127.0.0.1:${server.address().port}/`;
  await page.goto(url);
  await page.evaluate(async () => {
    const Native = window.AudioContext;
    window.AudioContext = class extends Native {
      createDynamicsCompressor() {
        const node = super.createDynamicsCompressor();
        window.meter = super.createAnalyser();
        node.connect(window.meter);
        return node;
      }
    };
    window.audio = await import('/src/audio.js');
    audio.updateAudio(1);
    audio.swordSound();
    document.getElementById('start').onclick = () => {
      audio.unlockAudio();
      audio.updateAudio(1 / 60);
      audio.swordSound();
    };
  });
  assert.equal((await page.evaluate(() => audio.getAudioStatus())).available, false);
  assert.equal(requests.length, 0, 'No sample downloads or audio context before a gesture');
  await page.click('#start');
  await page.waitForFunction(() => audio.getAudioStatus().loadedClips === 21);
  await page.evaluate(() => {
    audio.setMood(0, 1);
    audio.updateAudio(1 / 60);
    audio.swordSound(-0.5);
    audio.monsterDieSound(0.5);
  });
  await page.waitForTimeout(450);
  const playing = await page.evaluate(() => {
    const data = new Float32Array(meter.fftSize);
    meter.getFloatTimeDomainData(data);
    return {
      ...audio.getAudioStatus(),
      rms: Math.sqrt(data.reduce((sum, v) => sum + v * v, 0) / data.length),
    };
  });
  assert.equal(playing.available, true);
  assert.equal(playing.playingTracks, 2);
  assert.equal(playing.fallback, false);
  assert.equal(playing.sampleFailures, 0);
  assert.ok(playing.rms > 0.001, `Decoded score produces real audio, RMS ${playing.rms}`);
  for (let chapter = 1; chapter < 6; chapter++) {
    await page.evaluate((chapter) => audio.setMood(chapter, 0.5), chapter);
    await page.waitForFunction(
      (count) => audio.getAudioStatus().loadedClips === count,
      21 + chapter,
    );
    await page.evaluate(() => audio.updateAudio(1 / 60));
  }
  assert.equal((await page.evaluate(() => audio.getAudioStatus())).loadedClips, 26);
  await page.evaluate(() => {
    audio.setPlatformMuted(true);
    audio.setMuted(false);
    audio.setVolume(1);
  });
  await page.waitForTimeout(350);
  const silent = await page.evaluate(() => {
    const data = new Float32Array(meter.fftSize);
    meter.getFloatTimeDomainData(data);
    return Math.max(...data.map(Math.abs));
  });
  assert.ok(silent < 0.001, `Platform mute overrides local preferences, peak ${silent}`);
  await page.evaluate(() => audio.pauseAudio());
  const paused = await page.evaluate(() => audio.getAudioStatus());
  assert.equal(paused.voices, 0);
  assert.equal(paused.playingTracks, 0);
  assert.equal(paused.state, 'suspended');
  await page.evaluate(() => {
    audio.setPlatformMuted(false);
    audio.resumeAudio();
  });
  await page.waitForFunction(() => audio.getAudioStatus().state === 'running');
  await page.evaluate(() => audio.updateAudio(0.016));
  assert.equal((await page.evaluate(() => audio.getAudioStatus())).playingTracks, 2);
  assert.equal(requests.length, 26, 'Decoded buffers reused across pause and resume');
  await page.evaluate(() => audio.pauseAudio());
  assert.deepEqual(errors, []);
  // A valid HTTP response with an unsupported/corrupt clip must retain synthesis.
  const fallback = await browser.newPage();
  await fallback.route('**/*.ogg', (route) =>
    route.fulfill({ status: 200, contentType: 'audio/ogg', body: 'invalid audio' }),
  );
  await fallback.goto(url);
  await fallback.evaluate(async () => {
    window.audio = await import('/src/audio.js');
    document.getElementById('start').onclick = () => audio.unlockAudio();
  });
  await fallback.click('#start');
  await fallback.waitForFunction(() => audio.getAudioStatus().sampleFailures === 21);
  await fallback.evaluate(() => {
    audio.updateAudio(0.016);
    audio.swordSound();
  });
  const degraded = await fallback.evaluate(() => audio.getAudioStatus());
  assert.equal(degraded.fallback, true);
  assert.ok(degraded.voices > 0);
  await fallback.evaluate(() => audio.pauseAudio());
  console.log(
    JSON.stringify(
      {
        result:
          'PASS real Chrome WebAudio: 26 Ogg decodes, six scores, gesture-only downloads, audible mixer, platform mute, pause/resume and corrupt-asset fallback',
        playing,
        paused,
        requests: requests.length,
        errors,
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
