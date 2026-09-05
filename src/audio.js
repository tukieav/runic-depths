// Original procedural score, "The Bell Beneath". No downloaded music or samples.
// Scheduling follows the game frame: no audio timers keep running in hidden tabs.
let ctx = null;
let master = null,
  music = null,
  effects = null;
let muted = false,
  platformMuted = false,
  paused = false;
let volume = 0.72,
  musicVolume = 0.55,
  sfxVolume = 0.8;
let chapter = 0,
  intensity = 0,
  beat = 0,
  nextBeat = 0;
const voices = new Set();
const clamp = (v, fallback = 0) =>
  Number.isFinite(Number(v)) ? Math.max(0, Math.min(1, Number(v))) : fallback;
const midi = (n) => 440 * 2 ** ((n - 69) / 12);
// Each chapter changes tonic, voicing and bell melody while retaining the theme.
const SCORES = [
  { root: 38, steps: [0, 7, 12, 10, 3, 7, 14, 12], chord: [0, 7, 15], tempo: 70 },
  { root: 36, steps: [0, 3, 10, 7, 12, 10, 7, 2], chord: [0, 7, 14], tempo: 74 },
  { root: 41, steps: [0, 7, 15, 12, 5, 10, 7, 3], chord: [0, 5, 12], tempo: 66 },
  { root: 35, steps: [0, 7, 10, 14, 12, 7, 3, 2], chord: [0, 7, 10], tempo: 78 },
  { root: 38, steps: [0, 12, 7, 15, 14, 10, 7, 0], chord: [0, 7, 15], tempo: 72 },
  // The Heart Below resolves the opening motif into a suspended, luminous cadence.
  { root: 43, steps: [0, 7, 14, 12, 9, 7, 5, 0], chord: [0, 7, 14], tempo: 64 },
];
const hidden = () => !!globalThis.document?.hidden;
function smooth(param, value) {
  if (!param || !ctx) return;
  param.cancelScheduledValues(ctx.currentTime);
  param.setTargetAtTime(value, ctx.currentTime, 0.035);
}
function refreshGains() {
  smooth(master?.gain, muted || platformMuted ? 0 : volume);
  smooth(music?.gain, musicVolume * 0.48);
  smooth(effects?.gain, sfxVolume * 0.7);
}
export function setMuted(value) {
  muted = !!value;
  refreshGains();
}
export function setPlatformMuted(value) {
  platformMuted = !!value;
  refreshGains();
}
export function setVolume(value) {
  volume = clamp(value, volume);
  refreshGains();
}
export function setMusicVolume(value) {
  musicVolume = clamp(value, musicVolume);
  refreshGains();
}
export function setSfxVolume(value) {
  sfxVolume = clamp(value, sfxVolume);
  refreshGains();
}
export function getAudioStatus() {
  return {
    available: !!ctx,
    state: ctx?.state || 'locked',
    muted,
    platformMuted,
    paused,
    volume,
    musicVolume,
    sfxVolume,
    chapter,
    voices: voices.size,
  };
}
function resumeContext() {
  if (!ctx || paused || hidden() || ctx.state === 'closed') return;
  if (ctx.state !== 'running') {
    try {
      Promise.resolve(ctx.resume()).catch(() => {});
    } catch {
      /* Gesture may be required by browser. */
    }
  }
}
export function unlockAudio() {
  // Must be called from a click/tap/key gesture. Nothing else constructs a context.
  if (!ctx) {
    const AudioContext =
      globalThis.AudioContext ||
      globalThis.webkitAudioContext ||
      globalThis.window?.AudioContext ||
      globalThis.window?.webkitAudioContext;
    if (!AudioContext) return false;
    try {
      ctx = new AudioContext();
      master = ctx.createGain();
      music = ctx.createGain();
      effects = ctx.createGain();
      music.connect(master);
      effects.connect(master);
      // Gentle limiter keeps simultaneous spells comfortable.
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -14;
      limiter.knee.value = 20;
      limiter.ratio.value = 5;
      limiter.attack.value = 0.008;
      limiter.release.value = 0.25;
      master.connect(limiter);
      limiter.connect(ctx.destination);
      nextBeat = ctx.currentTime + 0.08;
      globalThis.document?.addEventListener('pointerup', resumeContext, { passive: true });
      globalThis.document?.addEventListener('touchend', resumeContext, { passive: true });
      refreshGains();
    } catch {
      try {
        ctx?.close()?.catch?.(() => {});
      } catch {
        /* Unsupported device. */
      }
      ctx = null;
      master = music = effects = null;
      return false;
    }
  }
  paused = false;
  resumeContext();
  return true;
}
function clearVoices() {
  for (const node of voices) {
    try {
      node.stop();
      node.disconnect();
    } catch {
      /* Already ended. */
    }
  }
  voices.clear();
}
export function pauseAudio() {
  paused = true;
  clearVoices();
  if (ctx && ctx.state !== 'closed') {
    try {
      Promise.resolve(ctx.suspend()).catch(() => {});
    } catch {
      /* Device interruption. */
    }
  }
}
export function resumeAudio() {
  paused = false;
  if (ctx) nextBeat = ctx.currentTime + 0.08;
  resumeContext();
}
function canPlay() {
  return (
    ctx && ctx.state === 'running' && !paused && !hidden() && !muted && !platformMuted && volume > 0
  );
}
function register(source, nodes) {
  voices.add(source);
  source.onended = () => {
    voices.delete(source);
    source.disconnect();
    for (const node of nodes) node.disconnect();
  };
}
function note(
  freq,
  duration,
  type = 'sine',
  gain = 0.1,
  delay = 0,
  bus = effects,
  attack = 0.006,
  endFreq = freq,
) {
  if (!canPlay() || voices.size >= 56) return;
  const start = ctx.currentTime + Math.max(0, delay);
  const osc = ctx.createOscillator(),
    envelope = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(Math.max(20, freq), start);
  if (endFreq !== freq)
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), start + duration);
  envelope.gain.setValueAtTime(0.0001, start);
  envelope.gain.exponentialRampToValueAtTime(
    Math.max(0.0001, gain),
    start + Math.min(attack, duration * 0.3),
  );
  envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(envelope);
  envelope.connect(bus);
  register(osc, [envelope]);
  osc.start(start);
  osc.stop(start + duration + 0.015);
}
function noise(duration, gain, delay = 0, cutoff = 1100) {
  if (!canPlay() || voices.size >= 56) return;
  const start = ctx.currentTime + delay;
  const len = Math.max(1, Math.floor(ctx.sampleRate * duration));
  const buffer = ctx.createBuffer(1, len, ctx.sampleRate),
    samples = buffer.getChannelData(0);
  for (let i = 0; i < len; i++) samples[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const source = ctx.createBufferSource(),
    filter = ctx.createBiquadFilter(),
    envelope = ctx.createGain();
  source.buffer = buffer;
  filter.type = 'lowpass';
  filter.frequency.value = cutoff;
  envelope.gain.setValueAtTime(gain, start);
  envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  source.connect(filter);
  filter.connect(envelope);
  envelope.connect(effects);
  register(source, [filter, envelope]);
  source.start(start);
  source.stop(start + duration + 0.015);
}
function bell(freq, duration = 1.3, gain = 0.1, delay = 0, bus = effects) {
  note(freq, duration, 'sine', gain, delay, bus, 0.01);
  note(freq * 2.002, duration * 0.48, 'sine', gain * 0.22, delay, bus, 0.003);
}
export function setMood(chapterIndex, combatIntensity = 0) {
  const next = Math.max(0, Math.floor(Number(chapterIndex) || 0)) % SCORES.length;
  if (next !== chapter) {
    chapter = next;
    beat = 0;
    if (ctx) nextBeat = ctx.currentTime + 0.1;
  }
  intensity = clamp(combatIntensity);
}
export function updateAudio(_dt) {
  if (!canPlay() || musicVolume <= 0) return;
  const score = SCORES[chapter];
  const stepLength = 60 / (score.tempo + intensity * 22) / 2;
  if (nextBeat < ctx.currentTime - 0.15) nextBeat = ctx.currentTime + 0.025;
  // A short lookahead prevents frame jitter; never catch up an entire hidden tab.
  let scheduled = 0;
  while (nextBeat < ctx.currentTime + 0.12 && scheduled++ < 3) {
    const delay = Math.max(0, nextBeat - ctx.currentTime);
    const phrase = Math.floor(beat / 16) % 4;
    const root = score.root + [0, -2, 3, 0][phrase];
    if (beat % 8 === 0) {
      for (const [i, interval] of score.chord.entries()) {
        note(
          midi(root + interval),
          stepLength * 9,
          i === 0 ? 'sine' : 'triangle',
          i === 0 ? 0.14 : 0.04,
          delay,
          music,
          0.7,
        );
      }
    }
    if (beat % 2 === 0 || intensity > 0.5) {
      const pitch = midi(root + 24 + score.steps[beat % 8]);
      bell(pitch, stepLength * 3, 0.055 + intensity * 0.025, delay, music);
      // Quiet reflected bell is a finite echo, requiring no feedback/timer graph.
      note(pitch, stepLength * 2, 'sine', 0.012, delay + stepLength * 0.75, music, 0.04);
    }
    if (intensity > 0.2 && beat % 2 === 0) {
      note(midi(root - 12), 0.25, 'sine', intensity * 0.22, delay, music, 0.008, 28);
    }
    beat++;
    nextBeat += stepLength;
  }
}
export function swordSound() {
  noise(0.085, 0.18, 0, 2100);
  note(175, 0.11, 'triangle', 0.14, 0.015, effects, 0.003, 65);
}
export function magicSound() {
  bell(659, 0.5, 0.14);
  bell(988, 0.55, 0.08, 0.06);
}
export function levelUpSound() {
  [62, 65, 69, 74, 77].forEach((n, i) => bell(midi(n), 0.65, 0.14, i * 0.09));
}
export function stepSound() {
  noise(0.045, 0.035, 0, 360);
  note(82, 0.045, 'sine', 0.03);
}
export function chestSound() {
  [67, 74, 79].forEach((n, i) => bell(midi(n), 0.5, 0.12, i * 0.075));
}
export function hurtSound() {
  note(125, 0.16, 'triangle', 0.17, 0, effects, 0.006, 60);
  noise(0.075, 0.07, 0, 480);
}
export function potionSound() {
  [64, 71, 76].forEach((n, i) => note(midi(n), 0.16, 'sine', 0.1, i * 0.07));
}
export function stairsSound() {
  [69, 65, 62, 57].forEach((n, i) => bell(midi(n), 0.5, 0.08, i * 0.1));
}
export function gameOverSound() {
  [62, 57, 53, 50].forEach((n, i) => note(midi(n), 0.8, 'triangle', 0.1, i * 0.17, effects, 0.06));
}
export function monsterDieSound() {
  noise(0.11, 0.1, 0, 750);
  note(210, 0.17, 'triangle', 0.075, 0, effects, 0.005, 75);
}
export function uiSound() {
  note(740, 0.075, 'sine', 0.055);
}
export function lootSound(rarity = 'common') {
  const rare =
    typeof rarity === 'number'
      ? rarity >= 2
      : ['rare', 'epic', 'legendary', 'mythic'].includes(rarity);
  bell(rare ? 880 : 659, rare ? 0.8 : 0.3, 0.12);
  if (rare) bell(1320, 0.8, 0.08, 0.09);
}
export function bossSound() {
  [38, 45, 50].forEach((n, i) => note(midi(n), 1.6, 'triangle', 0.14, i * 0.12, effects, 0.2));
}
export function skillSound(kind = 'arcane') {
  if (['warrior', 'knight', 'melee', 'whirlwind', 'shield'].some((s) => String(kind).includes(s))) {
    swordSound();
    note(90, 0.3, 'triangle', 0.18, 0.04, effects, 0.005, 40);
  } else if (['ranger', 'rogue', 'arrow', 'bow', 'dash'].some((s) => String(kind).includes(s))) {
    noise(0.12, 0.15, 0, 2800);
    note(460, 0.13, 'sine', 0.08, 0, effects, 0.004, 170);
  } else if (
    ['cleric', 'paladin', 'templar', 'heal', 'holy'].some((s) => String(kind).includes(s))
  ) {
    [62, 69, 74].forEach((n, i) => bell(midi(n), 0.7, 0.1, i * 0.04));
  } else if (['shadow', 'necromancer', 'hex'].some((s) => String(kind).includes(s))) {
    note(180, 0.5, 'triangle', 0.1, 0, effects, 0.05, 440);
    bell(622, 0.7, 0.08, 0.08);
  } else magicSound();
}
