import test from 'node:test';
import assert from 'node:assert/strict';
let version = 0;
const fresh = () => import(`../src/audio.js?test=${++version}`);
function fixture() {
  const contexts = [], nodes = [];
  const param = () => ({ value: 0, cancelScheduledValues() {}, setTargetAtTime(v) { this.value = v; }, setValueAtTime(v) { this.value = v; }, exponentialRampToValueAtTime(v) { assert.ok(Number.isFinite(v)); } });
  const node = () => {
    const n = { gain: param(), frequency: param(), connect() {}, disconnect() {}, start(t) { assert.ok(Number.isFinite(t)); }, stop() { this.onended?.(); } };
    nodes.push(n); return n;
  };
  globalThis.AudioContext = class {
    constructor() { this.state = 'running'; this.currentTime = 0; this.sampleRate = 8000; this.destination = {}; contexts.push(this); }
    createGain() { return node(); }
    createOscillator() { return node(); }
    createBufferSource() { return node(); }
    createBiquadFilter() { return node(); }
    createDynamicsCompressor() { return { ...node(), threshold: param(), knee: param(), ratio: param(), attack: param(), release: param() }; }
    createBuffer(_, len) { return { getChannelData: () => new Float32Array(len) }; }
    resume() { this.state = 'running'; return Promise.resolve(); }
    suspend() { this.state = 'suspended'; return Promise.resolve(); }
  };
  globalThis.document = { hidden: false, addEventListener() {} };
  return { contexts, nodes };
}
test('boot and effects before user gesture never construct AudioContext', async () => {
  const f = fixture(), audio = await fresh();
  audio.setMuted(false); audio.setVolume(0.7); audio.setMood(3, 1);
  audio.swordSound(); audio.magicSound(); audio.updateAudio(1 / 60); audio.resumeAudio();
  assert.equal(f.contexts.length, 0);
  assert.equal(audio.unlockAudio(), true);
  assert.equal(f.contexts.length, 1);
  audio.unlockAudio(); assert.equal(f.contexts.length, 1);
});
test('all effects and adaptive chapters schedule finite voices safely', async () => {
  const f = fixture(), audio = await fresh(); audio.unlockAudio();
  for (const name of ['swordSound', 'magicSound', 'levelUpSound', 'stepSound', 'chestSound', 'hurtSound', 'potionSound', 'stairsSound', 'gameOverSound', 'monsterDieSound', 'uiSound', 'lootSound', 'bossSound']) audio[name]();
  for (const kind of ['warrior', 'ranger', 'cleric', 'shadow', 'mage']) audio.skillSound(kind);
  for (let i = 0; i < 6; i++) { audio.setMood(i, i / 4); f.contexts[0].currentTime += 1; audio.updateAudio(1); }
  assert.ok(f.nodes.length > 80);
  assert.equal(audio.getAudioStatus().chapter, 5);
  audio.pauseAudio(); assert.equal(audio.getAudioStatus().voices, 0);
});
test('platform mute wins over local preferences; hidden/pause suppress new audio', async () => {
  const f = fixture(), audio = await fresh(); audio.unlockAudio();
  audio.setPlatformMuted(true); audio.setMuted(false); audio.setVolume(1);
  let count = f.nodes.length;
  audio.swordSound(); audio.updateAudio(1);
  assert.equal(f.nodes.length, count);
  audio.setPlatformMuted(false); audio.pauseAudio(); audio.magicSound();
  assert.equal(f.nodes.length, count);
  audio.resumeAudio(); document.hidden = true; audio.magicSound();
  assert.equal(f.nodes.length, count);
  document.hidden = false; audio.magicSound(); assert.ok(f.nodes.length > count);
  audio.setMusicVolume(-100); audio.setSfxVolume(100);
  assert.equal(audio.getAudioStatus().musicVolume, 0);
  assert.equal(audio.getAudioStatus().sfxVolume, 1);
});
test('missing WebAudio support is a silent supported fallback', async () => {
  delete globalThis.AudioContext; delete globalThis.window; delete globalThis.document;
  const audio = await fresh();
  assert.equal(audio.unlockAudio(), false);
  assert.doesNotThrow(() => { audio.bossSound(); audio.pauseAudio(); audio.resumeAudio(); audio.updateAudio(0.1); });
});
