// Runic Depths — procedural audio via WebAudio (no audio files)
let ctx = null;
let masterGain = null;
let muted = false;

function ensureCtx() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = ctx.createGain();
    masterGain.gain.value = 0.5;
    masterGain.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
}

export function setMuted(m) {
  muted = m;
  if (masterGain) masterGain.gain.value = m ? 0 : 0.5;
}

export function unlockAudio() { ensureCtx(); }

function tone(freq, dur, type, vol, delay = 0) {
  if (muted || !ctx) return;
  const t0 = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq * 0.5), t0 + dur);
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  osc.connect(g); g.connect(masterGain);
  osc.start(t0); osc.stop(t0 + dur + 0.05);
}

function noise(dur, vol, delay = 0) {
  if (muted || !ctx) return;
  const t0 = ctx.currentTime + delay;
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  src.connect(g); g.connect(masterGain);
  src.start(t0);
}

// sword swing/hit
export function swordSound() {
  ensureCtx();
  noise(0.09, 0.25);
  tone(180, 0.1, 'square', 0.15, 0.01);
}

// magic zap (boss / special)
export function magicSound() {
  ensureCtx();
  tone(880, 0.2, 'sine', 0.2);
  tone(1320, 0.25, 'triangle', 0.15, 0.05);
}

// level-up fanfare
export function levelUpSound() {
  ensureCtx();
  [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.28, 'triangle', 0.25, i * 0.08));
}

// footstep
export function stepSound() {
  ensureCtx();
  tone(90 + Math.random() * 30, 0.05, 'sine', 0.06);
}

// chest open
export function chestSound() {
  ensureCtx();
  tone(392, 0.12, 'triangle', 0.2);
  tone(587, 0.15, 'triangle', 0.2, 0.08);
  tone(784, 0.2, 'sine', 0.18, 0.16);
}

// take damage
export function hurtSound() {
  ensureCtx();
  tone(140, 0.18, 'sawtooth', 0.2);
}

// potion drink
export function potionSound() {
  ensureCtx();
  tone(330, 0.1, 'sine', 0.15);
  tone(494, 0.12, 'sine', 0.15, 0.07);
}

// descend stairs
export function stairsSound() {
  ensureCtx();
  [330, 262, 208, 165].forEach((f, i) => tone(f, 0.15, 'triangle', 0.15, i * 0.09));
}

export function gameOverSound() {
  ensureCtx();
  [392, 330, 262, 196].forEach((f, i) => tone(f, 0.4, 'sawtooth', 0.15, i * 0.15));
}

export function monsterDieSound() {
  ensureCtx();
  noise(0.15, 0.18);
  tone(220, 0.2, 'sawtooth', 0.12, 0.02);
}
