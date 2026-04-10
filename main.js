/**
 * BRING IT — Rhythm Party Game Client
 *
 * Scrolling highway beat system, continuous timing, Web Audio.
 * First mode: Workout Class (P90X style)
 */

import {
  MOVE, MOVE_KEYS, MOVE_NAMES, PHASE, SUBDIVISIONS,
  BEATS_PER_BAR, NEON_COLORS, STARTING_BPM, TIMING,
} from './shared/constants.js';

import {
  initAudio, playInputSound, playMetronomeTick,
  playPatternLocked, playCallerFailed, playSurvived,
  playEliminated, playCountdownBeep, playVictory,
  playGameOver, startMetronome, stopMetronome,
  setMuted, isMuted,
} from './client/audio.js';

// ─── State ──────────────────────────────────────────────────────────

const state = {
  room: null,
  myId: null,
  phase: PHASE.LOBBY,
  bpm: STARTING_BPM,
  round: 0,
  callerId: '',
  countdown: 0,
  alivePlayers: 0,
  totalPlayers: 0,

  // Timing
  barStartTime: 0,
  barDurationMs: 2400,
  barProgress: 0,

  // Pattern data — arrays of { time (ms offset), move (1-4) }
  bar1Pattern: [],
  bar2Pattern: [],
  lockedPattern: [],
  myInputs: [],

  // Players
  players: new Map(),

  // UI
  message: '',
  messageColor: '#fff',
  messageTimer: 0,
  resultMessage: '',
  callerFailed: false,
  gameOverWinner: null,

  // Results detail
  lastResults: null,

  // FX
  beatPulse: 0,
  screenShake: 0,
  flashAlpha: 0,
  flashColor: '#fff',
  particles: [],
  lastCountdown: -1,
  lastBeatIndex: -1,
  countInBeatMs: 600,
  countInStart: 0,
  countInTotalMs: 2400,
  predictedBarStart: 0,

  // Hit feedback — brief flashes on the judgment line
  hitFeedback: [], // { time, rating, color, alpha }
};

// ─── Canvas Setup ───────────────────────────────────────────────────

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
let W, H;

function resize() {
  W = canvas.width = window.innerWidth;
  H = canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

// ─── Network ────────────────────────────────────────────────────────

async function connect() {
  const host = window.GAME_SERVER_URL || `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}`;
  const client = new Colyseus.Client(host);

  try {
    state.room = await client.joinOrCreate('party');
    state.myId = state.room.sessionId;
    console.log('[Net] Joined as', state.myId);
    setupRoomListeners();
    setTimeout(() => updateLobbyCount(), 500);
  } catch (e) {
    console.error('[Net] Failed to connect:', e);
    setTimeout(connect, 2000);
  }
}

function setupRoomListeners() {
  const room = state.room;

  room.state.listen('phase', (val) => { state.phase = val; });
  room.state.listen('bpm', (val) => { state.bpm = val; });
  room.state.listen('round', (val) => { state.round = val; });
  room.state.listen('callerId', (val) => { state.callerId = val; });
  room.state.listen('countdown', (val) => {
    state.countdown = val;
    if (val !== state.lastCountdown && (state.phase === PHASE.COUNTDOWN || state.phase === PHASE.COUNTIN)) {
      playCountdownBeep(val);
      state.lastCountdown = val;
    }
  });
  room.state.listen('alivePlayers', (val) => { state.alivePlayers = val; });
  room.state.listen('totalPlayers', (val) => { state.totalPlayers = val; });
  room.state.listen('barDurationMs', (val) => { state.barDurationMs = val; });

  // Player sync
  room.state.players.onAdd((player, sessionId) => {
    state.players.set(sessionId, {
      color: player.color,
      role: player.role,
      alive: player.alive,
      score: player.score,
      currentMove: player.currentMove,
    });
    player.listen('role', (v) => { const p = state.players.get(sessionId); if (p) p.role = v; });
    player.listen('alive', (v) => { const p = state.players.get(sessionId); if (p) p.alive = v; });
    player.listen('score', (v) => { const p = state.players.get(sessionId); if (p) p.score = v; });
    player.listen('currentMove', (v) => { const p = state.players.get(sessionId); if (p) p.currentMove = v; });
    player.listen('color', (v) => { const p = state.players.get(sessionId); if (p) p.color = v; });
    updateLobbyCount();
  });
  room.state.players.onRemove((player, sessionId) => {
    state.players.delete(sessionId);
    updateLobbyCount();
  });

  // Messages
  room.onMessage('phaseChange', (data) => {
    state.callerFailed = false;
    state.gameOverWinner = null;
    state.lastBeatIndex = -1;
    state.lastResults = null;
    state.hitFeedback = [];

    if (data.barDurationMs) {
      state.barDurationMs = data.barDurationMs;
      // Use predicted start from count-in if it's close (within 200ms)
      // This makes the playhead seamlessly continue from the count-in approach
      if (state.predictedBarStart && Math.abs(Date.now() - state.predictedBarStart) < 200) {
        state.barStartTime = state.predictedBarStart;
      } else {
        state.barStartTime = Date.now();
      }
      state.predictedBarStart = 0;
    }
    if (data.bar1Pattern) state.bar1Pattern = [...data.bar1Pattern];
    if (data.pattern) state.lockedPattern = [...data.pattern];

    if (data.phase === PHASE.COUNTIN) {
      stopMetronome();
      state.lastCountdown = -1;
      if (data.beatMs) state.countInBeatMs = data.beatMs;
      state.countInStart = Date.now();
      const totalBeats = data.totalBeats || 4;
      state.countInTotalMs = data.beatMs * totalBeats;
      state.predictedBarStart = Date.now() + state.countInTotalMs;
    }
    if (data.phase === PHASE.CALLING_BAR1 || data.phase === PHASE.CALLING_BAR2) {
      state.myInputs = [];
      if (data.phase === PHASE.CALLING_BAR1) {
        state.bar1Pattern = [];
        state.bar2Pattern = [];
      } else {
        state.bar2Pattern = [];
      }
      startMetronome(state.bpm, BEATS_PER_BAR);
    }
    if (data.phase === PHASE.RESPONDING) {
      state.myInputs = [];
      startMetronome(state.bpm, BEATS_PER_BAR);
    }
    if (data.phase === PHASE.COUNTDOWN) {
      stopMetronome();
      state.lastCountdown = -1;
    }
    if (data.phase === PHASE.RESULTS || data.phase === PHASE.GAME_OVER || data.phase === PHASE.JUDGING) {
      stopMetronome();
    }
    if (data.phase === PHASE.LOBBY) {
      stopMetronome();
      showLobby();
    } else {
      hideLobby();
    }
  });

  room.onMessage('canStart', () => { updateLobbyCount(); });

  room.onMessage('inputEvent', (data) => {
    if (data.phase === PHASE.CALLING_BAR1) {
      state.bar1Pattern.push({ time: data.time, move: data.move });
    } else if (data.phase === PHASE.CALLING_BAR2) {
      state.bar2Pattern.push({ time: data.time, move: data.move });
    }
  });

  room.onMessage('patternLocked', (data) => {
    state.lockedPattern = [...data.pattern];
    flashMessage('PATTERN LOCKED!', '#00FF87');
    triggerFlash('#00FF87', 0.3);
    playPatternLocked();
  });

  room.onMessage('callerFailed', (data) => {
    state.callerFailed = true;
    flashMessage(data.reason, '#FF3366');
    triggerFlash('#FF3366', 0.25);
    state.bar1Pattern = [];
    state.bar2Pattern = [];
    playCallerFailed();
    stopMetronome();
  });

  room.onMessage('roundResults', (data) => {
    const myResult = data.results.find(r => r.sessionId === state.myId);
    state.lastResults = myResult || null;
    if (myResult) {
      if (myResult.survived) {
        flashMessage('SURVIVED!', '#00FF87');
        triggerFlash('#00FF87', 0.2);
        playSurvived();
        spawnParticles(W / 2, H / 2, '#00FF87', 20);
      } else {
        flashMessage('ELIMINATED!', '#FF3366');
        triggerFlash('#FF3366', 0.4);
        state.screenShake = 15;
        playEliminated();
      }
    }
    state.resultMessage = `${data.alivePlayers} players remaining`;
  });

  room.onMessage('gameOver', (data) => {
    state.gameOverWinner = data;
    if (data.winnerId === state.myId) {
      flashMessage('YOU WIN!', '#FFE600');
      triggerFlash('#FFE600', 0.5);
      spawnParticles(W / 2, H / 2, '#FFE600', 50);
      spawnParticles(W / 3, H / 2, '#FF1493', 30);
      spawnParticles(W * 2 / 3, H / 2, '#00FF87', 30);
      playVictory();
    } else {
      flashMessage('GAME OVER', '#FF1493');
      playGameOver();
    }
  });
}

// ─── Input ──────────────────────────────────────────────────────────

document.addEventListener('keydown', (e) => {
  if (e.key === 'm' || e.key === 'M') {
    setMuted(!isMuted());
    flashMessage(isMuted() ? 'MUTED' : 'UNMUTED', '#666');
    return;
  }

  const move = MOVE_KEYS[e.key];
  if (!move || !state.room) return;
  e.preventDefault();
  initAudio();

  const isCaller = state.myId === state.callerId;
  const myPlayer = state.players.get(state.myId);

  // Continuous time — ms elapsed since bar start
  const timeInBar = Date.now() - state.barStartTime;

  if (isCaller && (state.phase === PHASE.CALLING_BAR1 || state.phase === PHASE.CALLING_BAR2)) {
    const beat = { time: timeInBar, move };
    state.myInputs.push(beat);
    state.room.send('callerInput', beat);
    playInputSound(move);
    addHitFeedback('INPUT', MOVE_COLORS[move]);
  } else if (!isCaller && state.phase === PHASE.RESPONDING && myPlayer && myPlayer.alive) {
    const beat = { time: timeInBar, move };
    state.myInputs.push(beat);
    state.room.send('responderInput', beat);
    playInputSound(move);

    // Check timing against locked pattern — find closest matching beat
    const rating = getTimingRating(timeInBar, move, state.lockedPattern);
    addHitFeedback(rating, MOVE_COLORS[move]);
  }

  state.beatPulse = 1.0;
});

function getTimingRating(time, move, pattern) {
  let bestDelta = Infinity;
  for (const beat of pattern) {
    if (beat.move === move) {
      const delta = Math.abs(beat.time - time);
      if (delta < bestDelta) bestDelta = delta;
    }
  }
  if (bestDelta <= TIMING.PERFECT) return 'PERFECT';
  if (bestDelta <= TIMING.GREAT) return 'GREAT';
  if (bestDelta <= TIMING.GOOD) return 'GOOD';
  return 'MISS';
}

function addHitFeedback(rating, color) {
  const ratingColors = {
    'PERFECT': '#FFE600',
    'GREAT': '#00FF87',
    'GOOD': '#00D4FF',
    'MISS': '#FF3366',
    'INPUT': '#FF6B35',
  };
  state.hitFeedback.push({
    rating,
    color: ratingColors[rating] || color,
    alpha: 1.0,
    y: 0,
  });
}

document.addEventListener('click', () => { initAudio(); });

// ─── Lobby UI ───────────────────────────────────────────────────────

const lobbyEl = document.getElementById('lobby');
const lobbyCount = document.getElementById('lobby-count');
const startBtn = document.getElementById('start-btn');

startBtn.addEventListener('click', () => {
  if (state.room) state.room.send('requestStart');
});

function updateLobbyCount() {
  lobbyCount.textContent = state.players.size;
  if (state.players.size >= 1) {
    startBtn.disabled = false;
    startBtn.textContent = 'BRING IT';
  } else {
    startBtn.disabled = true;
    startBtn.textContent = 'WAITING FOR PLAYERS';
  }
}

function showLobby() { lobbyEl.classList.remove('hidden'); }
function hideLobby() { lobbyEl.classList.add('hidden'); }

// ─── FX ─────────────────────────────────────────────────────────────

function flashMessage(text, color = '#fff') {
  state.message = text;
  state.messageColor = color;
  state.messageTimer = 120;
}

function triggerFlash(color, alpha = 0.3) {
  state.flashColor = color;
  state.flashAlpha = alpha;
}

function spawnParticles(x, y, color, count = 15) {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 2 + Math.random() * 6;
    state.particles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 2,
      life: 60 + Math.random() * 40,
      maxLife: 100,
      color,
      size: 3 + Math.random() * 5,
    });
  }
}

function updateParticles() {
  for (let i = state.particles.length - 1; i >= 0; i--) {
    const p = state.particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.1;
    p.vx *= 0.98;
    p.life--;
    if (p.life <= 0) state.particles.splice(i, 1);
  }
}

function drawParticles() {
  for (const p of state.particles) {
    ctx.globalAlpha = Math.min(1, p.life / 30);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
  }
  ctx.globalAlpha = 1;
}

// ─── Rendering ──────────────────────────────────────────────────────

const MOVE_ARROWS = ['', '▲', '▼', '◄', '►'];
const MOVE_COLORS = ['', '#00D4FF', '#FF1493', '#FFE600', '#00FF87'];
const MOVE_LABELS = ['', 'UP', 'DOWN', 'LEFT', 'RIGHT'];

function drawFrame(time) {
  let shakeX = 0, shakeY = 0;
  if (state.screenShake > 0) {
    shakeX = (Math.random() - 0.5) * state.screenShake * 2;
    shakeY = (Math.random() - 0.5) * state.screenShake * 2;
    state.screenShake *= 0.9;
    if (state.screenShake < 0.5) state.screenShake = 0;
  }

  ctx.save();
  ctx.translate(shakeX, shakeY);
  ctx.clearRect(-10, -10, W + 20, H + 20);

  // Background
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#0a0a18');
  grad.addColorStop(0.5, '#0e0818');
  grad.addColorStop(1, '#12081f');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  drawGrid(time);

  const floorY = H * 0.55;
  const floorGrad = ctx.createLinearGradient(0, floorY - 2, 0, floorY + 40);
  floorGrad.addColorStop(0, 'rgba(255,255,255,0.06)');
  floorGrad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = floorGrad;
  ctx.fillRect(0, floorY, W, 40);
  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, floorY);
  ctx.lineTo(W, floorY);
  ctx.stroke();

  if (state.phase === PHASE.LOBBY) {
    ctx.restore();
    return;
  }

  // Update timing
  const elapsed = Date.now() - state.barStartTime;
  state.barProgress = Math.min(elapsed / state.barDurationMs, 1.0);

  // Beat pulse sync
  if (state.phase === PHASE.CALLING_BAR1 || state.phase === PHASE.CALLING_BAR2 || state.phase === PHASE.RESPONDING) {
    const beatDuration = state.barDurationMs / BEATS_PER_BAR;
    const beatIndex = Math.floor(elapsed / beatDuration);
    if (beatIndex !== state.lastBeatIndex && beatIndex < BEATS_PER_BAR) {
      state.lastBeatIndex = beatIndex;
      state.beatPulse = Math.max(state.beatPulse, 0.6);
    }
  }
  state.beatPulse *= 0.92;

  drawTopBar(time);
  drawCharacters(floorY, time);
  drawHighway(time);
  drawHitFeedback();
  drawMessage(time);
  drawCountdown();
  updateParticles();
  drawParticles();

  // Full-screen flash
  if (state.flashAlpha > 0) {
    ctx.globalAlpha = state.flashAlpha;
    ctx.fillStyle = state.flashColor;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
    state.flashAlpha *= 0.9;
    if (state.flashAlpha < 0.01) state.flashAlpha = 0;
  }

  ctx.restore();
}

function drawGrid(time) {
  const spacing = 60;
  const pulse = state.beatPulse;
  const baseAlpha = 0.015 + pulse * 0.03;
  ctx.strokeStyle = `rgba(180, 75, 243, ${baseAlpha})`;
  ctx.lineWidth = 0.5;
  for (let x = 0; x < W; x += spacing) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
  }
  for (let y = 0; y < H; y += spacing) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }
}

function drawTopBar(time) {
  const isCaller = state.myId === state.callerId;
  const myPlayer = state.players.get(state.myId);

  let phaseText = '';
  let phaseColor = '#666';
  switch (state.phase) {
    case PHASE.COUNTDOWN: phaseText = 'GET READY'; phaseColor = '#FFE600'; break;
    case PHASE.COUNTIN: phaseText = 'COUNT IN'; phaseColor = '#FF6B35'; break;
    case PHASE.CALLING_BAR1: phaseText = isCaller ? 'FREESTYLE YOUR PATTERN' : 'WATCH THE CALLER'; phaseColor = '#FF6B35'; break;
    case PHASE.CALLING_BAR2: phaseText = isCaller ? 'REPEAT TO LOCK IT IN' : 'WATCH THE CALLER'; phaseColor = '#FF6B35'; break;
    case PHASE.RESPONDING: phaseText = isCaller ? 'WATCH THEM SWEAT' : 'YOUR TURN — MATCH IT!'; phaseColor = '#00FF87'; break;
    case PHASE.RESULTS: phaseText = 'RESULTS'; phaseColor = '#B24BF3'; break;
    case PHASE.GAME_OVER: phaseText = 'GAME OVER'; phaseColor = '#FF1493'; break;
  }

  ctx.shadowColor = phaseColor;
  ctx.shadowBlur = 8;
  ctx.font = '900 22px "Bebas Neue", Inter, sans-serif';
  ctx.fillStyle = phaseColor;
  ctx.textAlign = 'center';
  ctx.fillText(phaseText, W / 2, 32);
  ctx.shadowBlur = 0;

  if (state.phase === PHASE.CALLING_BAR1 || state.phase === PHASE.CALLING_BAR2) {
    const barLabel = state.phase === PHASE.CALLING_BAR1 ? 'BAR 1' : 'BAR 2';
    ctx.font = '700 12px Inter, sans-serif';
    ctx.fillStyle = '#FF6B35';
    ctx.textAlign = 'center';
    ctx.fillText(barLabel, W / 2, 48);
  }

  ctx.font = '700 13px Inter, sans-serif';
  ctx.fillStyle = '#555';
  ctx.textAlign = 'left';
  ctx.fillText(`ROUND ${state.round}`, 16, 24);
  const bpmAlpha = 0.4 + state.beatPulse * 0.6;
  ctx.fillStyle = `rgba(255, 107, 53, ${bpmAlpha})`;
  ctx.fillText(`${state.bpm} BPM`, 16, 42);

  ctx.textAlign = 'right';
  ctx.fillStyle = '#555';
  ctx.fillText(`${state.alivePlayers} ALIVE`, W - 16, 24);
  if (myPlayer) {
    ctx.fillStyle = isCaller ? '#FF6B35' : (myPlayer.alive ? '#00FF87' : '#FF3366');
    const roleText = isCaller ? '★ CALLER' : (myPlayer.alive ? 'RESPONDER' : 'ELIMINATED');
    ctx.fillText(roleText, W - 16, 42);
  }

  ctx.font = '700 10px Inter, sans-serif';
  ctx.fillStyle = '#333';
  ctx.fillText(isMuted() ? '🔇 M' : '🔊 M', W - 16, H - 10);
}

function drawCharacters(floorY, time) {
  const callerPlayer = state.players.get(state.callerId);
  const responders = [];
  state.players.forEach((p, id) => {
    if (id !== state.callerId) responders.push({ id, ...p });
  });

  const responderY = floorY - 10;
  const cols = Math.min(responders.length, 12);
  const spacing = Math.min(60, (W - 100) / (cols || 1));

  responders.forEach((r, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = W / 2 + (col - (cols - 1) / 2) * spacing;
    const y = responderY - row * 50;
    drawCharacter(x, y, 28, r.color, r.currentMove, r.alive, time);
  });

  if (callerPlayer) {
    const callerX = W / 2;
    const callerY = floorY - 20;
    const callerSize = 60;

    const spotGrad = ctx.createRadialGradient(callerX, callerY - 20, 0, callerX, callerY - 20, callerSize * 2);
    spotGrad.addColorStop(0, callerPlayer.color + '18');
    spotGrad.addColorStop(1, 'transparent');
    ctx.fillStyle = spotGrad;
    ctx.beginPath();
    ctx.ellipse(callerX, callerY, callerSize * 2, callerSize * 1.5, 0, 0, Math.PI * 2);
    ctx.fill();

    drawCharacter(callerX, callerY, callerSize, callerPlayer.color, callerPlayer.currentMove, true, time, true);

    ctx.font = '900 11px "Bebas Neue", Inter, sans-serif';
    ctx.fillStyle = '#FF6B35';
    ctx.textAlign = 'center';
    ctx.shadowColor = '#FF6B35';
    ctx.shadowBlur = 6;
    ctx.fillText('★ CALLER ★', callerX, callerY + callerSize * 0.6 + 16);
    ctx.shadowBlur = 0;
  }
}

function drawCharacter(x, y, size, color, move, alive, time, isCaller = false) {
  ctx.globalAlpha = alive ? 1.0 : 0.2;
  const headR = size * 0.2;
  const bodyW = size * 0.35;
  const bodyH = size * 0.4;
  const limbW = Math.max(size * 0.08, 2);

  let headOffsetX = 0, headOffsetY = 0;
  let leftArmAngle = 0, rightArmAngle = 0;
  let squat = 0, bodyTilt = 0;

  switch (move) {
    case MOVE.UP:
      leftArmAngle = -Math.PI * 0.8; rightArmAngle = Math.PI * 0.8;
      headOffsetY = -size * 0.08; break;
    case MOVE.DOWN:
      squat = size * 0.15;
      leftArmAngle = -Math.PI * 0.3; rightArmAngle = Math.PI * 0.3; break;
    case MOVE.LEFT:
      headOffsetX = -size * 0.08; bodyTilt = -0.1;
      leftArmAngle = -Math.PI * 0.6; rightArmAngle = Math.PI * 0.15; break;
    case MOVE.RIGHT:
      headOffsetX = size * 0.08; bodyTilt = 0.1;
      leftArmAngle = -Math.PI * 0.15; rightArmAngle = Math.PI * 0.6; break;
  }

  ctx.save();
  ctx.translate(x, y + squat);
  ctx.rotate(bodyTilt);

  if (isCaller && alive) {
    ctx.shadowColor = color;
    ctx.shadowBlur = 12 + state.beatPulse * 25;
  }

  ctx.strokeStyle = color;
  ctx.lineWidth = limbW;
  ctx.lineCap = 'round';

  // Legs
  ctx.beginPath(); ctx.moveTo(-bodyW * 0.3, 0); ctx.lineTo(-bodyW * 0.4, size * 0.3 - squat); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(bodyW * 0.3, 0); ctx.lineTo(bodyW * 0.4, size * 0.3 - squat); ctx.stroke();

  // Body
  ctx.fillStyle = color;
  roundRect(ctx, -bodyW / 2, -bodyH, bodyW, bodyH, size * 0.06);
  ctx.fill();

  // Arms
  const shoulderY = -bodyH + bodyH * 0.15;
  const armLen = size * 0.35;
  ctx.beginPath(); ctx.moveTo(-bodyW / 2, shoulderY);
  ctx.lineTo(-bodyW / 2 + Math.sin(leftArmAngle) * armLen, shoulderY + Math.cos(leftArmAngle) * armLen); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(bodyW / 2, shoulderY);
  ctx.lineTo(bodyW / 2 + Math.sin(rightArmAngle) * armLen, shoulderY + Math.cos(rightArmAngle) * armLen); ctx.stroke();

  // Head
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(headOffsetX, -bodyH - headR * 0.5 + headOffsetY, headR, 0, Math.PI * 2); ctx.fill();

  ctx.shadowBlur = 0;
  ctx.restore();

  if (!alive) {
    ctx.strokeStyle = '#FF3366'; ctx.lineWidth = 3;
    const s = size * 0.2;
    ctx.beginPath();
    ctx.moveTo(x - s, y - size * 0.25 - s); ctx.lineTo(x + s, y - size * 0.25 + s);
    ctx.moveTo(x + s, y - size * 0.25 - s); ctx.lineTo(x - s, y - size * 0.25 + s);
    ctx.stroke();
  }
  ctx.globalAlpha = 1.0;
}

// ─── TIMELINE (static boxes + sweeping playhead) ───────────────────

function snapToGrid(timeMs) {
  // Snap to nearest 8th note for display position
  const subdivMs = state.barDurationMs / SUBDIVISIONS;
  return Math.round(timeMs / subdivMs) * subdivMs;
}

function timeToX(timeMs, laneX, laneW) {
  // Map a time (0 → barDurationMs) to pixel position across the lane
  return laneX + (timeMs / state.barDurationMs) * laneW;
}

function drawHighway(time) {
  const laneH = 160;
  const laneY = H - laneH - 20;
  const laneX = 50;
  const laneW = W - 100;

  // Background panel
  ctx.fillStyle = 'rgba(10, 10, 25, 0.92)';
  roundRect(ctx, laneX - 14, laneY - 14, laneW + 28, laneH + 28, 10);
  ctx.fill();
  const borderColor = state.phase === PHASE.RESPONDING ? '#00FF8720' : '#FF6B3520';
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 1;
  roundRect(ctx, laneX - 14, laneY - 14, laneW + 28, laneH + 28, 10);
  ctx.stroke();

  const slotW = laneW / SUBDIVISIONS;
  const isCaller = state.myId === state.callerId;

  // Draw subdivision grid (the boxes)
  drawSlotGrid(laneX, laneY, laneW, laneH, slotW);

  // Draw content based on phase
  if (state.phase === PHASE.CALLING_BAR1 || state.phase === PHASE.CALLING_BAR2) {
    drawCallingTimeline(laneX, laneY, laneW, laneH, slotW);
  } else if (state.phase === PHASE.RESPONDING) {
    drawRespondingTimeline(laneX, laneY, laneW, laneH, slotW);
  } else if (state.phase === PHASE.RESULTS || state.phase === PHASE.GAME_OVER) {
    drawResultsTimeline(laneX, laneY, laneW, laneH, slotW);
  }

  // Count-in beat markers (approaching from left)
  if (state.phase === PHASE.COUNTIN) {
    const approachW = 80;
    const countInProgress = Math.min((Date.now() - state.countInStart) / state.countInTotalMs, 1.0);
    const totalBeats = 4;

    for (let b = 0; b < totalBeats; b++) {
      const beatProgress = b / totalBeats;
      const bx = laneX - approachW + beatProgress * approachW;
      const isPast = countInProgress > beatProgress;
      const beatNum = b + 1;
      const label = b < 3 ? String(beatNum) : 'GO';

      ctx.font = '900 16px "Bebas Neue", Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = isPast ? '#FF6B35' : '#FF6B3544';
      ctx.fillText(label, bx, laneY + laneH / 2 + 6);
    }
  }

  // Sweeping playhead — also during count-in (approaches from left)
  const showPlayhead = state.phase === PHASE.CALLING_BAR1 || state.phase === PHASE.CALLING_BAR2 ||
                       state.phase === PHASE.RESPONDING || state.phase === PHASE.COUNTIN;
  if (showPlayhead) {
    let playX;
    let playColor;

    if (state.phase === PHASE.COUNTIN) {
      // During count-in: playhead approaches from the left toward position 0
      const countInProgress = Math.min((Date.now() - state.countInStart) / state.countInTotalMs, 1.0);
      const approachWidth = 80; // px of lead-in space to the left of the lane
      playX = laneX - approachWidth + countInProgress * approachWidth;
      playColor = '#FF6B35';
    } else {
      playX = laneX + state.barProgress * laneW;
      playColor = state.phase === PHASE.RESPONDING ? '#00FF87' : '#FF6B35';
    }

    // Glow trail behind playhead
    const trailGrad = ctx.createLinearGradient(playX - 60, 0, playX, 0);
    trailGrad.addColorStop(0, 'transparent');
    trailGrad.addColorStop(1, playColor + '15');
    ctx.fillStyle = trailGrad;
    ctx.fillRect(laneX, laneY, playX - laneX, laneH);

    // Playhead line
    ctx.strokeStyle = playColor;
    ctx.lineWidth = 2.5;
    ctx.shadowColor = playColor;
    ctx.shadowBlur = 10 + state.beatPulse * 15;
    ctx.beginPath();
    ctx.moveTo(playX, laneY - 6);
    ctx.lineTo(playX, laneY + laneH + 6);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Small triangle on top
    ctx.fillStyle = playColor;
    ctx.beginPath();
    ctx.moveTo(playX, laneY - 6);
    ctx.lineTo(playX - 5, laneY - 12);
    ctx.lineTo(playX + 5, laneY - 12);
    ctx.closePath();
    ctx.fill();
  }

  // Input hint
  if (
    (state.phase === PHASE.RESPONDING && !isCaller) ||
    ((state.phase === PHASE.CALLING_BAR1 || state.phase === PHASE.CALLING_BAR2) && isCaller)
  ) {
    ctx.font = '700 10px Inter, sans-serif';
    ctx.fillStyle = '#333';
    ctx.textAlign = 'center';
    ctx.fillText('▲ ▼ ◄ ► or W A S D', W / 2, H - 4);
  }
}

function drawSlotGrid(laneX, laneY, laneW, laneH, slotW) {
  const beatDuration = state.barDurationMs / BEATS_PER_BAR;

  for (let i = 0; i < SUBDIVISIONS; i++) {
    const sx = laneX + i * slotW;
    const isDownbeat = i % 2 === 0;

    // Slot background
    ctx.fillStyle = isDownbeat ? 'rgba(255,255,255,0.025)' : 'rgba(255,255,255,0.012)';
    ctx.fillRect(sx, laneY, slotW - 1, laneH);

    // Beat number at top for downbeats
    if (i % 2 === 0) {
      ctx.font = '700 9px Inter, sans-serif';
      ctx.fillStyle = '#333';
      ctx.textAlign = 'center';
      ctx.fillText(String(i / 2 + 1), sx + slotW / 2, laneY - 4);
    }
  }

  // Vertical grid lines
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= SUBDIVISIONS; i++) {
    const x = laneX + i * slotW;
    const isBeat = i % 2 === 0;
    ctx.strokeStyle = isBeat ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.04)';
    ctx.beginPath();
    ctx.moveTo(x, laneY);
    ctx.lineTo(x, laneY + laneH);
    ctx.stroke();
  }
}

function drawCallingTimeline(laneX, laneY, laneW, laneH, slotW) {
  const isBar2 = state.phase === PHASE.CALLING_BAR2;
  const currentPattern = isBar2 ? state.bar2Pattern : state.bar1Pattern;

  // Label
  ctx.font = '900 12px "Bebas Neue", Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#FF6B35';
  const label = isBar2 ? 'BAR 2 — REPEAT TO LOCK' : 'BAR 1 — FREESTYLE';
  ctx.fillText(label, laneX + laneW / 2, laneY + laneH + 16);

  // Ghost of bar1 during bar2
  if (isBar2) {
    ctx.globalAlpha = 0.15;
    for (const beat of state.bar1Pattern) {
      const sx = timeToX(snapToGrid(beat.time), laneX, laneW);
      const noteH = laneH - 10;
      drawTimelineNote(sx, laneY + 5, slotW - 4, noteH, beat.move);
    }
    ctx.globalAlpha = 1;
  }

  // Current pattern notes
  for (const beat of currentPattern) {
    const sx = timeToX(snapToGrid(beat.time), laneX, laneW);
    const noteH = laneH - 10;
    drawTimelineNote(sx, laneY + 5, slotW - 4, noteH, beat.move);
  }

  // Match indicator during bar 2
  if (isBar2 && state.bar1Pattern.length > 0) {
    let matchCount = 0;
    const used = new Set();
    for (const b1 of state.bar1Pattern) {
      for (let i = 0; i < state.bar2Pattern.length; i++) {
        if (used.has(i)) continue;
        if (state.bar2Pattern[i].move === b1.move &&
            Math.abs(snapToGrid(state.bar2Pattern[i].time) - snapToGrid(b1.time)) < state.barDurationMs / SUBDIVISIONS * 0.6) {
          matchCount++;
          used.add(i);
          break;
        }
      }
    }
    const pct = Math.round(matchCount / state.bar1Pattern.length * 100);
    ctx.font = '700 11px Inter, sans-serif';
    ctx.fillStyle = pct === 100 ? '#00FF87' : '#FF6B35';
    ctx.textAlign = 'right';
    ctx.fillText(`MATCH: ${pct}%`, laneX + laneW, laneY + laneH + 16);
  }
}

function drawRespondingTimeline(laneX, laneY, laneW, laneH, slotW) {
  const halfH = laneH / 2 - 4;

  // Top half: locked pattern
  ctx.font = '900 10px "Bebas Neue", Inter, sans-serif';
  ctx.fillStyle = '#FFE600';
  ctx.textAlign = 'left';
  ctx.fillText('PATTERN', laneX - 12, laneY + halfH / 2 + 4);

  for (const beat of state.lockedPattern) {
    const sx = timeToX(snapToGrid(beat.time), laneX, laneW);
    drawTimelineNote(sx, laneY + 2, slotW - 4, halfH, beat.move);
  }

  // Divider
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(laneX, laneY + halfH + 4);
  ctx.lineTo(laneX + laneW, laneY + halfH + 4);
  ctx.stroke();
  ctx.setLineDash([]);

  // Bottom half: my inputs
  ctx.font = '900 10px "Bebas Neue", Inter, sans-serif';
  ctx.fillStyle = '#00FF87';
  ctx.textAlign = 'left';
  ctx.fillText('YOU', laneX - 12, laneY + halfH + 8 + halfH / 2 + 4);

  for (const beat of state.myInputs) {
    const sx = timeToX(snapToGrid(beat.time), laneX, laneW);
    const rating = getTimingRating(beat.time, beat.move, state.lockedPattern);
    const ratingColor = rating === 'PERFECT' ? '#FFE600' :
                        rating === 'GREAT' ? '#00FF87' :
                        rating === 'GOOD' ? '#00D4FF' : '#FF3366';
    drawTimelineNote(sx, laneY + halfH + 8, slotW - 4, halfH, beat.move, ratingColor);
  }

  // Label
  ctx.font = '900 12px "Bebas Neue", Inter, sans-serif';
  ctx.fillStyle = '#00FF87';
  ctx.textAlign = 'center';
  ctx.fillText('YOUR TURN — MATCH THE PATTERN', laneX + laneW / 2, laneY + laneH + 16);
}

function drawResultsTimeline(laneX, laneY, laneW, laneH, slotW) {
  // Show locked pattern across full height
  for (const beat of state.lockedPattern) {
    const sx = timeToX(snapToGrid(beat.time), laneX, laneW);
    drawTimelineNote(sx, laneY + 5, slotW - 4, laneH - 10, beat.move, null, 0.4);
  }

  // Results text
  ctx.font = '900 22px "Bebas Neue", Inter, sans-serif';
  ctx.fillStyle = '#B24BF3';
  ctx.textAlign = 'center';
  ctx.fillText(state.resultMessage, laneX + laneW / 2, laneY + laneH / 2 - 10);

  if (state.lastResults) {
    const r = state.lastResults;
    ctx.font = '700 12px Inter, sans-serif';
    const parts = [];
    if (r.perfectCount > 0) parts.push(`PERFECT: ${r.perfectCount}`);
    if (r.greatCount > 0) parts.push(`GREAT: ${r.greatCount}`);
    if (r.goodCount > 0) parts.push(`GOOD: ${r.goodCount}`);
    if (r.missCount > 0) parts.push(`MISS: ${r.missCount}`);
    ctx.fillStyle = '#777';
    ctx.fillText(parts.join('  •  '), laneX + laneW / 2, laneY + laneH / 2 + 14);
  }
}

function drawTimelineNote(x, y, w, h, move, overrideColor = null, alpha = 1.0) {
  const color = overrideColor || MOVE_COLORS[move];
  ctx.globalAlpha = alpha;

  // Filled box with rounded corners
  ctx.fillStyle = color + '30';
  roundRect(ctx, x, y, w, h, 5);
  ctx.fill();

  // Border
  ctx.strokeStyle = color + '88';
  ctx.lineWidth = 1.5;
  roundRect(ctx, x, y, w, h, 5);
  ctx.stroke();

  // Glow
  ctx.shadowColor = color;
  ctx.shadowBlur = 4;

  // Arrow
  const fontSize = Math.min(w * 0.5, h * 0.4, 28);
  ctx.fillStyle = color;
  ctx.font = `900 ${fontSize}px Inter, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(MOVE_ARROWS[move], x + w / 2, y + h / 2);

  ctx.shadowBlur = 0;
  ctx.textBaseline = 'alphabetic';
  ctx.globalAlpha = 1;
}

function drawHitFeedback() {
  for (let i = state.hitFeedback.length - 1; i >= 0; i--) {
    const fb = state.hitFeedback[i];
    fb.alpha -= 0.025;
    fb.y -= 1.5;
    if (fb.alpha <= 0) {
      state.hitFeedback.splice(i, 1);
      continue;
    }
    ctx.globalAlpha = fb.alpha;
    ctx.font = '900 16px "Bebas Neue", Inter, sans-serif';
    ctx.fillStyle = fb.color;
    ctx.textAlign = 'center';
    ctx.shadowColor = fb.color;
    ctx.shadowBlur = 6;
    ctx.fillText(fb.rating, 90, H - 230 + fb.y);
    ctx.shadowBlur = 0;
  }
  ctx.globalAlpha = 1;
}

function drawCountdown() {
  if (state.phase !== PHASE.COUNTDOWN && state.phase !== PHASE.COUNTIN) return;

  let text, color;
  if (state.phase === PHASE.COUNTIN) {
    // "1, 2, 3, GO!" — countdown goes 4,3,2,1,0 → show as 1,2,3,GO!
    const beatNum = 4 - state.countdown;
    text = beatNum < 4 ? String(beatNum + 1) : 'GO!';
    color = beatNum < 3 ? '#FF6B35' : '#00FF87';
  } else {
    text = state.countdown > 0 ? String(state.countdown) : 'GO!';
    color = state.countdown > 0 ? '#FFE600' : '#00FF87';
  }
  const pulse = 1 + state.beatPulse * 0.2;

  ctx.save();
  ctx.translate(W / 2, H / 2 - 60);
  ctx.scale(pulse, pulse);
  ctx.font = '900 180px "Bebas Neue", Inter, sans-serif';
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = color;
  ctx.shadowBlur = 40;
  ctx.fillText(text, 0, 0);
  ctx.shadowBlur = 80;
  ctx.globalAlpha = 0.3;
  ctx.fillText(text, 0, 0);
  ctx.restore();
  ctx.textBaseline = 'alphabetic';
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;
}

function drawMessage(time) {
  if (state.messageTimer <= 0) return;
  state.messageTimer--;
  const progress = 1 - state.messageTimer / 120;
  const alpha = progress < 0.7 ? 1 : 1 - (progress - 0.7) / 0.3;
  const yOffset = -progress * 30;

  ctx.globalAlpha = alpha;
  ctx.font = '900 48px "Bebas Neue", Inter, sans-serif';
  ctx.fillStyle = state.messageColor;
  ctx.textAlign = 'center';
  ctx.shadowColor = state.messageColor;
  ctx.shadowBlur = 20;
  ctx.fillText(state.message, W / 2, H * 0.3 + yOffset);
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1.0;
}

// ─── Helpers ────────────────────────────────────────────────────────

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// ─── Game Loop ──────────────────────────────────────────────────────

function gameLoop(time) {
  drawFrame(time);
  requestAnimationFrame(gameLoop);
}

// ─── Init ───────────────────────────────────────────────────────────

connect();
requestAnimationFrame(gameLoop);
