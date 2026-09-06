// Original offline-rendered chamber score and designed Foley, "The Bell Beneath".
// Compressed local samples load only after a user gesture. Procedural fallback
// keeps older browsers and interrupted downloads playable without errors.
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
const clips = new Map(),
  pendingClips = new Map(),
  failedClips = new Set();
const tracks = new Map();
const SAMPLE_NAMES = [
  'blade-1',
  'blade-2',
  'blade-3',
  'step-1',
  'step-2',
  'step-3',
  'impact',
  'bow',
  'magic-1',
  'magic-2',
  'magic-3',
  'creature-1',
  'creature-2',
  'loot',
  'rare',
  'level',
  'potion',
  'ui',
  'boss',
];
let sampleBase = null,
  transportStart = 0,
  transportOffset = 0,
  variation = 0;
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
    loadedClips: clips.size,
    playingTracks: tracks.size,
    loading: pendingClips.size,
    sampleFailures: failedClips.size,
    fallback: !clips.has(`chapter-${chapter + 1}`),
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
      transportStart = ctx.currentTime;
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
  if (paused && ctx) transportStart = ctx.currentTime;
  paused = false;
  resumeContext();
  loadAudioAssets();
  return true;
}
function loadClip(name) {
  if (!sampleBase || clips.has(name) || pendingClips.has(name) || failedClips.has(name)) return;
  const task = Promise.resolve()
    .then(async () => {
      const response = await fetch(new URL(`${name}.ogg`, sampleBase));
      if (!response.ok) throw new Error('Audio asset unavailable');
      const buffer = await ctx.decodeAudioData(await response.arrayBuffer());
      clips.set(name, buffer);
    })
    .catch(() => failedClips.add(name))
    .finally(() => pendingClips.delete(name));
  pendingClips.set(name, task);
}
function loadAudioAssets() {
  if (!ctx || typeof fetch !== 'function') return;
  if (!sampleBase) {
    try {
      const base = new URL('assets/audio/', globalThis.document?.baseURI);
      if (!['http:', 'https:'].includes(base.protocol)) return;
      sampleBase = base;
    } catch {
      return;
    }
  }
  for (const name of SAMPLE_NAMES) loadClip(name);
  loadClip('combat-stem');
  loadClip(`chapter-${chapter + 1}`);
}
// Samples are deliberately varied without allocating new AudioBuffers per hit.
function sample(name, gain = 0.5, pan = 0, pitch = 1) {
  if (!canPlay() || sfxVolume <= 0 || voices.size >= 56 || !clips.has(name)) return false;
  const source = ctx.createBufferSource(),
    envelope = ctx.createGain();
  source.buffer = clips.get(name);
  source.playbackRate.value = pitch;
  envelope.gain.value = gain;
  source.connect(envelope);
  const panner = ctx.createStereoPanner?.();
  if (panner) {
    panner.pan.value = Math.max(-1, Math.min(1, Number(pan) || 0));
    envelope.connect(panner);
    panner.connect(effects);
  } else envelope.connect(effects);
  register(source, panner ? [envelope, panner] : [envelope]);
  source.start(ctx.currentTime);
  return true;
}
function varied(prefix, count, gain, pan = 0) {
  variation++;
  return sample(`${prefix}-${1 + (variation % count)}`, gain, pan, 0.96 + (variation % 7) * 0.012);
}
function stopTrack(key, fade = false) {
  const track = tracks.get(key);
  if (!track) return;
  tracks.delete(key);
  try {
    if (fade) {
      track.envelope.gain.setTargetAtTime(0, ctx.currentTime, 0.3);
      track.source.stop(ctx.currentTime + 1.5);
    } else track.source.stop();
  } catch {
    /* Ended or interrupted. */
  }
}
function startTrack(key, name, gain) {
  if (!clips.has(name) || tracks.get(key)?.name === name) return;
  stopTrack(key, true);
  const source = ctx.createBufferSource(),
    envelope = ctx.createGain();
  source.buffer = clips.get(name);
  source.loop = true;
  source.connect(envelope);
  envelope.connect(music);
  envelope.gain.setValueAtTime(0, ctx.currentTime);
  envelope.gain.setTargetAtTime(gain, ctx.currentTime, 0.65);
  register(source, [envelope]);
  tracks.set(key, { source, envelope, name });
  const offset = (transportOffset + ctx.currentTime - transportStart) % source.buffer.duration;
  source.start(ctx.currentTime, Math.max(0, offset));
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
  if (!paused && ctx) transportOffset += ctx.currentTime - transportStart;
  paused = true;
  clearVoices();
  tracks.clear();
  if (ctx && ctx.state !== 'closed') {
    try {
      Promise.resolve(ctx.suspend()).catch(() => {});
    } catch {
      /* Device interruption. */
    }
  }
}
export function resumeAudio() {
  if (paused && ctx) transportStart = ctx.currentTime;
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
    if (sampleBase) loadClip(`chapter-${chapter + 1}`);
  }
  intensity = clamp(combatIntensity);
}
export function updateAudio(_dt) {
  if (!canPlay() || musicVolume <= 0) return;
  if (clips.has(`chapter-${chapter + 1}`)) {
    startTrack('score', `chapter-${chapter + 1}`, 0.74);
    startTrack('combat', 'combat-stem', intensity * 0.43);
    const combat = tracks.get('combat');
    if (combat) combat.envelope.gain.setTargetAtTime(intensity * 0.43, ctx.currentTime, 0.9);
    return;
  }
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
export function swordSound(pan = 0) {
  if (varied('blade', 3, 0.52, pan)) return;
  noise(0.085, 0.18, 0, 2100);
  note(175, 0.11, 'triangle', 0.14, 0.015, effects, 0.003, 65);
}
export function magicSound(pan = 0) {
  if (varied('magic', 3, 0.4, pan)) return;
  bell(659, 0.5, 0.14);
  bell(988, 0.55, 0.08, 0.06);
}
export function bowSound(pan = 0) {
  if (sample('bow', 0.5, pan, 0.94 + Math.random() * 0.12)) return;
  noise(0.12, 0.15, 0, 2800);
  note(460, 0.13, 'sine', 0.08, 0, effects, 0.004, 170);
}
export function levelUpSound() {
  if (sample('level', 0.48)) return;
  [62, 65, 69, 74, 77].forEach((n, i) => bell(midi(n), 0.65, 0.14, i * 0.09));
}
export function stepSound(pan = 0) {
  if (varied('step', 3, 0.14, pan)) return;
  noise(0.045, 0.035, 0, 360);
  note(82, 0.045, 'sine', 0.03);
}
export function chestSound() {
  if (sample('rare', 0.4)) return;
  [67, 74, 79].forEach((n, i) => bell(midi(n), 0.5, 0.12, i * 0.075));
}
export function hurtSound() {
  if (sample('impact', 0.5, 0, 0.88 + Math.random() * 0.15)) return;
  note(125, 0.16, 'triangle', 0.17, 0, effects, 0.006, 60);
  noise(0.075, 0.07, 0, 480);
}
export function potionSound() {
  if (sample('potion', 0.42)) return;
  [64, 71, 76].forEach((n, i) => note(midi(n), 0.16, 'sine', 0.1, i * 0.07));
}
export function stairsSound() {
  if (sample('rare', 0.3, 0, 0.65)) return;
  [69, 65, 62, 57].forEach((n, i) => bell(midi(n), 0.5, 0.08, i * 0.1));
}
export function gameOverSound() {
  if (sample('boss', 0.48, 0, 0.72)) return;
  [62, 57, 53, 50].forEach((n, i) => note(midi(n), 0.8, 'triangle', 0.1, i * 0.17, effects, 0.06));
}
export function monsterDieSound(pan = 0) {
  if (varied('creature', 2, 0.24, pan)) {
    sample('impact', 0.18, pan, 0.85);
    return;
  }
  noise(0.11, 0.1, 0, 750);
  note(210, 0.17, 'triangle', 0.075, 0, effects, 0.005, 75);
}
export function uiSound() {
  if (sample('ui', 0.14)) return;
  note(740, 0.075, 'sine', 0.055);
}
export function lootSound(rarity = 'common') {
  const rare =
    typeof rarity === 'number'
      ? rarity >= 2
      : ['rare', 'epic', 'legendary', 'mythic'].includes(rarity);
  if (sample(rare ? 'rare' : 'loot', rare ? 0.38 : 0.26)) return;
  bell(rare ? 880 : 659, rare ? 0.8 : 0.3, 0.12);
  if (rare) bell(1320, 0.8, 0.08, 0.09);
}
export function bossSound() {
  if (sample('boss', 0.56)) return;
  [38, 45, 50].forEach((n, i) => note(midi(n), 1.6, 'triangle', 0.14, i * 0.12, effects, 0.2));
}
export function skillSound(kind = 'arcane', pan = 0) {
  if (
    ['warden', 'reaver', 'warrior', 'knight', 'melee', 'whirlwind', 'shield', 'cleave'].some((s) =>
      String(kind).includes(s),
    )
  ) {
    if (varied('blade', 3, 0.6, pan)) {
      sample('impact', 0.36, pan, 0.7);
      return;
    }
    swordSound();
    note(90, 0.3, 'triangle', 0.18, 0.04, effects, 0.005, 40);
  } else if (['ranger', 'rogue', 'arrow', 'bow', 'dash'].some((s) => String(kind).includes(s))) {
    bowSound(pan);
  } else if (
    ['cleric', 'paladin', 'templar', 'heal', 'holy'].some((s) => String(kind).includes(s))
  ) {
    if (sample('magic-3', 0.42, pan, 0.82)) return;
    [62, 69, 74].forEach((n, i) => bell(midi(n), 0.7, 0.1, i * 0.04));
  } else if (['shadow', 'necromancer', 'hex'].some((s) => String(kind).includes(s))) {
    if (sample('magic-2', 0.4, pan, 0.68)) return;
    note(180, 0.5, 'triangle', 0.1, 0, effects, 0.05, 440);
    bell(622, 0.7, 0.08, 0.08);
  } else magicSound();
}
