/**
 * BRING IT — Audio Engine
 *
 * All sounds synthesized via Web Audio API — zero asset loading.
 * Provides metronome, input feedback, timing-rated hits, stings, and ambient pulse.
 */

let ctx = null;
let masterGain = null;
let muted = false;
let compressor = null;

// Lazy-init on first user gesture (browser autoplay policy)
export function initAudio() {
  if (ctx) return;
  ctx = new (window.AudioContext || window.webkitAudioContext)();

  // Compressor to prevent clipping when many sounds play at once
  compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -18;
  compressor.knee.value = 12;
  compressor.ratio.value = 6;
  compressor.attack.value = 0.003;
  compressor.release.value = 0.15;
  compressor.connect(ctx.destination);

  masterGain = ctx.createGain();
  masterGain.gain.value = 0.5;
  masterGain.connect(compressor);
}

export function setMuted(val) { muted = val; }
export function isMuted() { return muted; }

function now() { return ctx ? ctx.currentTime : 0; }

// ─── Helpers ────────────────────────────────────────────────

function osc(type, freq, startTime, duration, gain = 0.3) {
  if (!ctx || muted) return null;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(gain, startTime);
  g.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
  o.connect(g);
  g.connect(masterGain);
  o.start(startTime);
  o.stop(startTime + duration);
  return o;
}

function oscSweep(type, freqStart, freqEnd, startTime, duration, gain = 0.3) {
  if (!ctx || muted) return null;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freqStart, startTime);
  o.frequency.exponentialRampToValueAtTime(freqEnd, startTime + duration);
  g.gain.setValueAtTime(gain, startTime);
  g.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
  o.connect(g);
  g.connect(masterGain);
  o.start(startTime);
  o.stop(startTime + duration);
  return o;
}

function noise(startTime, duration, gain = 0.1) {
  if (!ctx || muted) return;
  const bufferSize = Math.max(1, Math.floor(ctx.sampleRate * duration));
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, startTime);
  g.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 4000;
  src.connect(hp);
  hp.connect(g);
  g.connect(masterGain);
  src.start(startTime);
  src.stop(startTime + duration);
}

// ─── Metronome ──────────────────────────────────────────────

export function playMetronomeTick(isDownbeat = false) {
  if (!ctx || muted) return;
  const t = now();
  if (isDownbeat) {
    // Higher pitch, louder accent
    osc('triangle', 1200, t, 0.06, 0.4);
    osc('sine', 800, t, 0.04, 0.15);
  } else {
    osc('triangle', 800, t, 0.04, 0.2);
  }
  // Subtle click
  noise(t, 0.015, 0.08);
}

// ─── Input Feedback ─────────────────────────────────────────

const MOVE_TONES = {
  1: 523,  // UP    = C5
  2: 330,  // DOWN  = E4
  3: 440,  // LEFT  = A4
  4: 587,  // RIGHT = D5
};

export function playInputSound(move) {
  if (!ctx || muted) return;
  const freq = MOVE_TONES[move] || 440;
  const t = now();
  osc('square', freq, t, 0.08, 0.12);
  osc('sine', freq * 2, t, 0.06, 0.06);
  noise(t, 0.02, 0.04);
}

// ─── Timing-Rated Hit Sounds ────────────────────────────────

export function playTimingHit(rating) {
  if (!ctx || muted) return;
  const t = now();
  switch (rating) {
    case 'PERFECT':
      // Bright sparkle — high harmonics + shimmer
      osc('sine', 1047, t, 0.1, 0.2);
      osc('sine', 1568, t + 0.02, 0.08, 0.12);
      osc('triangle', 2093, t + 0.03, 0.06, 0.06);
      noise(t, 0.04, 0.03);
      break;
    case 'GREAT':
      // Clean chime
      osc('sine', 880, t, 0.1, 0.18);
      osc('triangle', 1320, t + 0.02, 0.06, 0.06);
      break;
    case 'GOOD':
      // Soft thud + tone
      osc('sine', 660, t, 0.08, 0.12);
      break;
    case 'MISS':
      // Dull buzz
      osc('sawtooth', 120, t, 0.12, 0.08);
      noise(t, 0.06, 0.05);
      break;
  }
}

// ─── Pattern Locked ─────────────────────────────────────────

export function playPatternLocked() {
  if (!ctx || muted) return;
  const t = now();
  // Rising arpeggio
  osc('square', 523, t, 0.12, 0.15);
  osc('square', 659, t + 0.08, 0.12, 0.15);
  osc('square', 784, t + 0.16, 0.15, 0.2);
  osc('sawtooth', 1047, t + 0.24, 0.3, 0.12);
  // Sizzle
  noise(t + 0.24, 0.15, 0.06);
}

// ─── Caller Failed ──────────────────────────────────────────

export function playCallerFailed() {
  if (!ctx || muted) return;
  const t = now();
  // Descending "wah wah"
  osc('sawtooth', 400, t, 0.2, 0.15);
  osc('sawtooth', 300, t + 0.15, 0.25, 0.15);
  osc('sawtooth', 200, t + 0.35, 0.3, 0.1);
}

// ─── Survived ───────────────────────────────────────────────

export function playSurvived() {
  if (!ctx || muted) return;
  const t = now();
  osc('sine', 660, t, 0.12, 0.2);
  osc('sine', 880, t + 0.1, 0.15, 0.25);
  osc('triangle', 1320, t + 0.2, 0.25, 0.15);
}

// ─── Eliminated ─────────────────────────────────────────────

export function playEliminated() {
  if (!ctx || muted) return;
  const t = now();
  osc('sawtooth', 200, t, 0.3, 0.2);
  osc('sawtooth', 150, t + 0.1, 0.4, 0.2);
  noise(t, 0.25, 0.1);
}

// ─── Countdown Beep ─────────────────────────────────────────

export function playCountdownBeep(num) {
  if (!ctx || muted) return;
  const t = now();
  if (num > 0) {
    // Pitched countdown: higher as it gets closer to GO
    const pitch = 440 + (4 - num) * 110;
    osc('sine', pitch, t, 0.12, 0.3);
    osc('triangle', pitch, t, 0.08, 0.08);
    noise(t, 0.01, 0.04);
  } else {
    // "GO!" — big power chord with sweep
    osc('square', 523, t, 0.25, 0.15);
    osc('square', 659, t, 0.25, 0.15);
    osc('square', 784, t, 0.25, 0.15);
    osc('sawtooth', 1047, t, 0.4, 0.1);
    oscSweep('sine', 400, 1600, t, 0.2, 0.08);
    noise(t, 0.12, 0.08);
  }
}

// ─── Count-in Beat (at BPM tempo) ──────────────────────────

export function playCountInBeat(beatNum) {
  if (!ctx || muted) return;
  const t = now();
  if (beatNum < 3) {
    // "1", "2", "3" — wood block style
    osc('triangle', 900 + beatNum * 100, t, 0.06, 0.25);
    noise(t, 0.02, 0.1);
  } else {
    // "GO!" — accent
    osc('square', 523, t, 0.2, 0.15);
    osc('square', 784, t, 0.2, 0.15);
    osc('sawtooth', 1047, t, 0.3, 0.1);
    oscSweep('sine', 500, 2000, t, 0.15, 0.06);
    noise(t, 0.08, 0.06);
  }
}

// ─── Game Over / Victory ────────────────────────────────────

export function playVictory() {
  if (!ctx || muted) return;
  const t = now();
  // Fanfare
  osc('square', 523, t, 0.15, 0.15);
  osc('square', 659, t + 0.12, 0.15, 0.15);
  osc('square', 784, t + 0.24, 0.15, 0.15);
  osc('square', 1047, t + 0.36, 0.4, 0.2);
  osc('sawtooth', 1047, t + 0.36, 0.45, 0.08);
  osc('sine', 1568, t + 0.5, 0.5, 0.1);
  noise(t + 0.36, 0.2, 0.05);
}

export function playGameOver() {
  if (!ctx || muted) return;
  const t = now();
  osc('sawtooth', 300, t, 0.3, 0.15);
  osc('sawtooth', 250, t + 0.25, 0.35, 0.15);
  osc('sawtooth', 180, t + 0.5, 0.5, 0.12);
  osc('sine', 130, t + 0.75, 0.6, 0.1);
}

// ─── Schedule a bar of metronome ticks ──────────────────────

let metronomeInterval = null;

export function startMetronome(bpm, beatsPerBar = 4) {
  stopMetronome();
  if (!ctx || muted) return;

  const beatInterval = 60000 / bpm; // ms per beat
  let beat = 0;

  playMetronomeTick(true); // immediate downbeat
  metronomeInterval = setInterval(() => {
    beat = (beat + 1) % beatsPerBar;
    playMetronomeTick(beat === 0);
  }, beatInterval);
}

export function stopMetronome() {
  if (metronomeInterval) {
    clearInterval(metronomeInterval);
    metronomeInterval = null;
  }
}
