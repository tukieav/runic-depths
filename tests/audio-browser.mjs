// Real WebAudio regression: no autoplay creation; gesture starts voices; pause clears them.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN || '/usr/bin/google-chrome', headless: true });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (['warning', 'error'].includes(message.type())) errors.push(message.text()); });
  await page.goto('about:blank');
  await page.evaluate(async source => {
    window.audio = await import(URL.createObjectURL(new Blob([source], { type: 'text/javascript' })));
    audio.updateAudio(1); audio.swordSound();
    document.body.innerHTML = '<button id="start">Start</button>';
    document.getElementById('start').onclick = () => { audio.unlockAudio(); audio.updateAudio(1 / 60); audio.swordSound(); };
  }, await readFile(new URL('../src/audio.js', import.meta.url), 'utf8'));
  assert.equal((await page.evaluate(() => audio.getAudioStatus())).available, false);
  await page.click('#start');
  const playing = await page.evaluate(() => audio.getAudioStatus());
  assert.equal(playing.available, true); assert.ok(playing.voices >= 1);
  await page.evaluate(() => audio.pauseAudio());
  const paused = await page.evaluate(() => audio.getAudioStatus());
  assert.equal(paused.voices, 0); assert.equal(paused.state, 'suspended');
  assert.deepEqual(errors, []);
  console.log('PASS real Chrome WebAudio: gesture unlock, score/effects, pause cleanup, no warnings');
} finally { await browser.close(); }
