/**
 * BRING IT — Rhythm Party Game Client
 *
 * Canvas 2D renderer, beat system, input handling, Colyseus networking.
 * First mode: Workout Class (P90X style)
 */

import {
  MOVE, MOVE_KEYS, MOVE_NAMES, PHASE, SUBDIVISIONS,
  BEATS_PER_BAR, NEON_COLORS, STARTING_BPM,
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

  // Pattern data
  bar1Pattern: new Array(SUBDIVISIONS).fill(0),
  bar2Pattern: new Array(SUBDIVISIONS).fill(0),
  lockedPattern: new Array(SUBDIVISIONS).fill(0),
  myInputs: new Array(SUBDIVISIONS).fill(0),
  lastInputSlot: -1,

  // Players
  players: new Map(),

  // UI
  message: '',
  messageColor: '#fff',
  messageTimer: 0,
  resultMessage: '',
  callerFailed: false,
  gameOverWinner: null,

  // FX
  beatPulse: 0,
  screenShake: 0,
  flashAlpha: 0,
  flashColor: '#fff',
  particles: [],
  lastCountdown: -1,

  // Metronome tracking
  lastBeatIndex: -1,
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
    // Ensure lobby updates after first state sync
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
    // Play countdown beep when countdown changes
    if (val !== state.lastCountdown && state.phase === PHASE.COUNTDOWN) {
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

    if (data.barDurationMs) {
      state.barDurationMs = data.barDurationMs;
      state.barStartTime = Date.now();
    }
    if (data.bar1Pattern) state.bar1Pattern = [...data.bar1Pattern];
    if (data.pattern) state.lockedPattern = [...data.pattern];

    if (data.phase === PHASE.CALLING_BAR1 || data.phase === PHASE.CALLING_BAR2) {
      if (state.myId === state.callerId) {
        state.myInputs.fill(0);
        state.lastInputSlot = -1;
      }
      startMetronome(state.bpm, BEATS_PER_BAR);
    }
    if (data.phase === PHASE.RESPONDING) {
      state.myInputs.fill(0);
      state.lastInputSlot = -1;
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

  room.onMessage('canStart', () => {
    updateLobbyCount();
  });

  room.onMessage('inputEvent', (data) => {
    if (data.phase === PHASE.CALLING_BAR1) {
      state.bar1Pattern[data.slot] = data.move;
    } else if (data.phase === PHASE.CALLING_BAR2) {
      state.bar2Pattern[data.slot] = data.move;
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
    state.bar1Pattern.fill(0);
    state.bar2Pattern.fill(0);
    playCallerFailed();
    stopMetronome();
  });

  room.onMessage('roundResults', (data) => {
    const myResult = data.results.find(r => r.sessionId === state.myId);
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
  // Toggle mute with M
  if (e.key === 'm' || e.key === 'M') {
    setMuted(!isMuted());
    flashMessage(isMuted() ? 'MUTED' : 'UNMUTED', '#666');
    return;
  }

  const move = MOVE_KEYS[e.key];
  if (!move || !state.room) return;
  e.preventDefault();

  // Init audio on first input gesture
  initAudio();

  const isCaller = state.myId === state.callerId;
  const myPlayer = state.players.get(state.myId);

  const elapsed = Date.now() - state.barStartTime;
  const slotDuration = state.barDurationMs / SUBDIVISIONS;
  const slot = Math.min(Math.floor(elapsed / slotDuration), SUBDIVISIONS - 1);

  if (slot === state.lastInputSlot) return;
  state.lastInputSlot = slot;

  if (isCaller && (state.phase === PHASE.CALLING_BAR1 || state.phase === PHASE.CALLING_BAR2)) {
    state.myInputs[slot] = move;
    state.room.send('callerInput', { slot, move });
    playInputSound(move);
  } else if (!isCaller && state.phase === PHASE.RESPONDING && myPlayer && myPlayer.alive) {
    state.myInputs[slot] = move;
    state.room.send('responderInput', { slot, move });
    playInputSound(move);
  }

  state.beatPulse = 1.0;
});

// Also init audio on start button click
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
    p.vy += 0.1; // gravity
    p.vx *= 0.98;
    p.life--;
    if (p.life <= 0) {
      state.particles.splice(i, 1);
    }
  }
}

function drawParticles() {
  for (const p of state.particles) {
    const alpha = Math.min(1, p.life / 30);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
  }
  ctx.globalAlpha = 1;
}

// ─── Rendering ──────────────────────────────────────────────────────

const MOVE_ARROWS = ['', '▲', '▼', '◄', '►'];
const MOVE_COLORS = ['', '#00D4FF', '#FF1493', '#FFE600', '#00FF87'];

function drawFrame(time) {
  // Screen shake offset
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

  // Ambient grid (subtle)
  drawGrid(time);

  // Floor
  const floorY = H * 0.62;
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

  // Beat pulse from timing (metronome visual sync)
  if (state.phase === PHASE.CALLING_BAR1 || state.phase === PHASE.CALLING_BAR2 || state.phase === PHASE.RESPONDING) {
    const beatDuration = state.barDurationMs / BEATS_PER_BAR;
    const beatIndex = Math.floor(elapsed / beatDuration);
    if (beatIndex !== state.lastBeatIndex && beatIndex < BEATS_PER_BAR) {
      state.lastBeatIndex = beatIndex;
      state.beatPulse = Math.max(state.beatPulse, 0.6);
    }
  }

  // Decay
  state.beatPulse *= 0.92;

  drawTopBar(time);
  drawCharacters(floorY, time);
  drawBeatLane(time);
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

  // Vertical lines
  for (let x = 0; x < W; x += spacing) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
  }
  // Horizontal lines
  for (let y = 0; y < H; y += spacing) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }
}

function drawTopBar(time) {
  const isCaller = state.myId === state.callerId;
  const myPlayer = state.players.get(state.myId);

  // Phase label
  let phaseText = '';
  let phaseColor = '#666';
  switch (state.phase) {
    case PHASE.COUNTDOWN: phaseText = 'GET READY'; phaseColor = '#FFE600'; break;
    case PHASE.CALLING_BAR1: phaseText = isCaller ? 'SET THE PATTERN' : 'WATCH THE CALLER'; phaseColor = '#FF6B35'; break;
    case PHASE.CALLING_BAR2: phaseText = isCaller ? 'REPEAT TO LOCK' : 'WATCH THE CALLER'; phaseColor = '#FF6B35'; break;
    case PHASE.RESPONDING: phaseText = isCaller ? 'WATCH THEM SWEAT' : 'YOUR TURN!'; phaseColor = '#00FF87'; break;
    case PHASE.RESULTS: phaseText = 'RESULTS'; phaseColor = '#B24BF3'; break;
    case PHASE.GAME_OVER: phaseText = 'GAME OVER'; phaseColor = '#FF1493'; break;
  }

  // Glow behind phase text
  ctx.shadowColor = phaseColor;
  ctx.shadowBlur = 8;
  ctx.font = '900 20px "Bebas Neue", Inter, sans-serif';
  ctx.fillStyle = phaseColor;
  ctx.textAlign = 'center';
  ctx.fillText(phaseText, W / 2, 32);
  ctx.shadowBlur = 0;

  // BAR 1 / BAR 2 indicator
  if (state.phase === PHASE.CALLING_BAR1 || state.phase === PHASE.CALLING_BAR2) {
    const barLabel = state.phase === PHASE.CALLING_BAR1 ? 'BAR 1' : 'BAR 2';
    ctx.font = '700 12px Inter, sans-serif';
    ctx.fillStyle = '#FF6B35';
    ctx.fillText(barLabel, W / 2, 48);
  }

  // Round + BPM
  ctx.font = '700 13px Inter, sans-serif';
  ctx.fillStyle = '#555';
  ctx.textAlign = 'left';
  ctx.fillText(`ROUND ${state.round}`, 16, 24);

  // BPM with pulse
  const bpmAlpha = 0.4 + state.beatPulse * 0.6;
  ctx.fillStyle = `rgba(255, 107, 53, ${bpmAlpha})`;
  ctx.fillText(`${state.bpm} BPM`, 16, 42);

  // Player count
  ctx.textAlign = 'right';
  ctx.fillStyle = '#555';
  ctx.fillText(`${state.alivePlayers} ALIVE`, W - 16, 24);

  // Role indicator
  if (myPlayer) {
    ctx.fillStyle = isCaller ? '#FF6B35' : (myPlayer.alive ? '#00FF87' : '#FF3366');
    const roleText = isCaller ? '★ CALLER' : (myPlayer.alive ? 'RESPONDER' : 'ELIMINATED');
    ctx.fillText(roleText, W - 16, 42);
  }

  // Mute indicator
  ctx.textAlign = 'right';
  ctx.font = '700 10px Inter, sans-serif';
  ctx.fillStyle = '#333';
  ctx.fillText(isMuted() ? '🔇 M to unmute' : '🔊 M to mute', W - 16, H - 10);

  // Progress bar
  if (state.phase === PHASE.CALLING_BAR1 || state.phase === PHASE.CALLING_BAR2 || state.phase === PHASE.RESPONDING) {
    const barW = W - 32;
    const barH = 4;
    const barY = 56;

    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    roundRect(ctx, 16, barY, barW, barH, 2);
    ctx.fill();

    // Beat markers
    for (let i = 0; i <= BEATS_PER_BAR; i++) {
      const x = 16 + (i / BEATS_PER_BAR) * barW;
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.fillRect(x - 1, barY - 3, 2, barH + 6);
    }

    // Subdivision markers (smaller)
    for (let i = 0; i < SUBDIVISIONS; i++) {
      const x = 16 + (i / SUBDIVISIONS) * barW;
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.fillRect(x, barY - 1, 1, barH + 2);
    }

    // Progress fill with gradient
    const fillColor = state.phase === PHASE.RESPONDING ? '#00FF87' : '#FF6B35';
    const progGrad = ctx.createLinearGradient(16, 0, 16 + barW * state.barProgress, 0);
    progGrad.addColorStop(0, fillColor + '44');
    progGrad.addColorStop(1, fillColor);
    ctx.fillStyle = progGrad;
    roundRect(ctx, 16, barY, barW * state.barProgress, barH, 2);
    ctx.fill();

    // Playhead
    const markerX = 16 + barW * state.barProgress;
    ctx.shadowColor = fillColor;
    ctx.shadowBlur = 8;
    ctx.fillStyle = '#fff';
    ctx.fillRect(markerX - 1.5, barY - 5, 3, barH + 10);
    ctx.shadowBlur = 0;
  }
}

function drawCharacters(floorY, time) {
  const callerPlayer = state.players.get(state.callerId);
  const responders = [];

  state.players.forEach((p, id) => {
    if (id !== state.callerId) responders.push({ id, ...p });
  });

  // Draw responders behind
  const responderY = floorY - 10;
  const cols = Math.min(responders.length, 12);
  const rows = Math.ceil(responders.length / (cols || 1));
  const spacing = Math.min(60, (W - 100) / (cols || 1));

  responders.forEach((r, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = W / 2 + (col - (cols - 1) / 2) * spacing;
    const y = responderY - row * 50;
    const size = 28;
    drawCharacter(x, y, size, r.color, r.currentMove, r.alive, time);
  });

  // Draw caller in front (larger, centered, with spotlight)
  if (callerPlayer) {
    const callerX = W / 2;
    const callerY = floorY - 20;
    const callerSize = 65;

    // Spotlight cone behind caller
    const spotGrad = ctx.createRadialGradient(callerX, callerY - callerSize * 0.3, 0, callerX, callerY - callerSize * 0.3, callerSize * 2);
    spotGrad.addColorStop(0, callerPlayer.color + '18');
    spotGrad.addColorStop(0.5, callerPlayer.color + '08');
    spotGrad.addColorStop(1, 'transparent');
    ctx.fillStyle = spotGrad;
    ctx.beginPath();
    ctx.ellipse(callerX, callerY, callerSize * 2, callerSize * 1.5, 0, 0, Math.PI * 2);
    ctx.fill();

    drawCharacter(callerX, callerY, callerSize, callerPlayer.color, callerPlayer.currentMove, true, time, true);

    // Label
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
  const alpha = alive ? 1.0 : 0.2;
  ctx.globalAlpha = alpha;

  const headR = size * 0.2;
  const bodyW = size * 0.35;
  const bodyH = size * 0.4;
  const limbW = Math.max(size * 0.08, 2);

  let headOffsetX = 0, headOffsetY = 0;
  let leftArmAngle = 0, rightArmAngle = 0;
  let squat = 0;
  let bodyTilt = 0;

  switch (move) {
    case MOVE.UP:
      leftArmAngle = -Math.PI * 0.8;
      rightArmAngle = Math.PI * 0.8;
      headOffsetY = -size * 0.08;
      break;
    case MOVE.DOWN:
      squat = size * 0.15;
      leftArmAngle = -Math.PI * 0.3;
      rightArmAngle = Math.PI * 0.3;
      break;
    case MOVE.LEFT:
      headOffsetX = -size * 0.08;
      bodyTilt = -0.1;
      leftArmAngle = -Math.PI * 0.6;
      rightArmAngle = Math.PI * 0.15;
      break;
    case MOVE.RIGHT:
      headOffsetX = size * 0.08;
      bodyTilt = 0.1;
      leftArmAngle = -Math.PI * 0.15;
      rightArmAngle = Math.PI * 0.6;
      break;
  }

  const adjustedY = y + squat;

  ctx.save();
  ctx.translate(x, adjustedY);
  ctx.rotate(bodyTilt);

  // Caller glow
  if (isCaller && alive) {
    ctx.shadowColor = color;
    ctx.shadowBlur = 12 + state.beatPulse * 25;
  }

  ctx.strokeStyle = color;
  ctx.lineWidth = limbW;
  ctx.lineCap = 'round';

  // Legs
  ctx.beginPath();
  ctx.moveTo(-bodyW * 0.3, 0);
  ctx.lineTo(-bodyW * 0.4, size * 0.3 - squat);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(bodyW * 0.3, 0);
  ctx.lineTo(bodyW * 0.4, size * 0.3 - squat);
  ctx.stroke();

  // Body
  ctx.fillStyle = color;
  const bx = -bodyW / 2;
  const by = -bodyH;
  roundRect(ctx, bx, by, bodyW, bodyH, size * 0.06);
  ctx.fill();

  // Arms
  const shoulderY = by + bodyH * 0.15;
  const armLen = size * 0.35;

  ctx.beginPath();
  ctx.moveTo(-bodyW / 2, shoulderY);
  ctx.lineTo(-bodyW / 2 + Math.sin(leftArmAngle) * armLen, shoulderY + Math.cos(leftArmAngle) * armLen);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(bodyW / 2, shoulderY);
  ctx.lineTo(bodyW / 2 + Math.sin(rightArmAngle) * armLen, shoulderY + Math.cos(rightArmAngle) * armLen);
  ctx.stroke();

  // Head
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(headOffsetX, by - headR * 0.5 + headOffsetY, headR, 0, Math.PI * 2);
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.restore();

  // Eliminated X
  if (!alive) {
    ctx.strokeStyle = '#FF3366';
    ctx.lineWidth = 3;
    const cx = x;
    const cy = y - size * 0.25;
    const s = size * 0.2;
    ctx.beginPath();
    ctx.moveTo(cx - s, cy - s);
    ctx.lineTo(cx + s, cy + s);
    ctx.moveTo(cx + s, cy - s);
    ctx.lineTo(cx - s, cy + s);
    ctx.stroke();
  }

  ctx.globalAlpha = 1.0;
}

function drawBeatLane(time) {
  const laneH = 150;
  const laneY = H - laneH - 16;
  const laneX = 40;
  const laneW = W - 80;

  // Background with rounded edges
  ctx.fillStyle = 'rgba(10, 10, 25, 0.9)';
  roundRect(ctx, laneX - 12, laneY - 12, laneW + 24, laneH + 24, 10);
  ctx.fill();
  // Border
  const borderColor = state.phase === PHASE.RESPONDING ? '#00FF8722' : '#FF6B3522';
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 1;
  roundRect(ctx, laneX - 12, laneY - 12, laneW + 24, laneH + 24, 10);
  ctx.stroke();

  const isCaller = state.myId === state.callerId;
  const slotW = laneW / SUBDIVISIONS;

  ctx.font = '700 11px Inter, sans-serif';
  ctx.textAlign = 'center';

  if (state.phase === PHASE.CALLING_BAR1 || state.phase === PHASE.CALLING_BAR2) {
    const halfW = laneW / 2 - 10;
    const bar1X = laneX;
    const bar2X = laneX + laneW / 2 + 10;
    const sW = halfW / SUBDIVISIONS;

    // Bar 1 label
    const b1Active = state.phase === PHASE.CALLING_BAR1;
    ctx.fillStyle = b1Active ? '#FF6B35' : '#333';
    ctx.font = '900 12px "Bebas Neue", Inter, sans-serif';
    ctx.fillText('BAR 1', bar1X + halfW / 2, laneY + 5);

    // Bar 2 label
    const b2Active = state.phase === PHASE.CALLING_BAR2;
    ctx.fillStyle = b2Active ? '#FF6B35' : '#333';
    ctx.fillText('BAR 2', bar2X + halfW / 2, laneY + 5);

    // Current slot highlight
    const activeBarX = b1Active ? bar1X : bar2X;
    const currentSlot = Math.min(Math.floor(state.barProgress * SUBDIVISIONS), SUBDIVISIONS - 1);
    if (b1Active || b2Active) {
      ctx.fillStyle = 'rgba(255, 107, 53, 0.06)';
      ctx.fillRect(activeBarX + currentSlot * sW, laneY + 12, sW - 2, 58);
    }

    for (let i = 0; i < SUBDIVISIONS; i++) {
      drawSlot(bar1X + i * sW, laneY + 18, sW - 2, 50, state.bar1Pattern[i], !b1Active, b1Active);
    }
    for (let i = 0; i < SUBDIVISIONS; i++) {
      drawSlot(bar2X + i * sW, laneY + 18, sW - 2, 50, state.bar2Pattern[i], !b2Active, b2Active);
    }

    // Divider
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(laneX + laneW / 2, laneY - 4);
    ctx.lineTo(laneX + laneW / 2, laneY + laneH + 4);
    ctx.stroke();
    ctx.setLineDash([]);

    // Match indicator during bar 2
    if (b2Active) {
      let matchCount = 0, totalFilled = 0;
      for (let i = 0; i < SUBDIVISIONS; i++) {
        if (state.bar1Pattern[i] !== 0) {
          totalFilled++;
          if (state.bar2Pattern[i] === state.bar1Pattern[i]) matchCount++;
        }
      }
      if (totalFilled > 0) {
        const pct = Math.round(matchCount / totalFilled * 100);
        ctx.font = '700 11px Inter, sans-serif';
        ctx.fillStyle = pct === 100 ? '#00FF87' : '#FF6B35';
        ctx.fillText(`MATCH: ${pct}%`, laneX + laneW / 2, laneY + laneH + 8);
      }
    }

  } else if (state.phase === PHASE.RESPONDING) {
    const rowH = 52;

    // Locked pattern (top row)
    ctx.fillStyle = '#FFE600';
    ctx.font = '900 12px "Bebas Neue", Inter, sans-serif';
    ctx.fillText('PATTERN TO MATCH', laneX + laneW / 2, laneY + 5);

    const currentSlot = Math.min(Math.floor(state.barProgress * SUBDIVISIONS), SUBDIVISIONS - 1);

    for (let i = 0; i < SUBDIVISIONS; i++) {
      const sx = laneX + i * slotW;
      // Highlight current slot
      if (i === currentSlot) {
        ctx.fillStyle = 'rgba(0, 255, 135, 0.06)';
        ctx.fillRect(sx, laneY + 10, slotW - 2, rowH + 65);
      }
      drawSlot(sx, laneY + 14, slotW - 2, rowH - 6, state.lockedPattern[i], false, true);
    }

    // My inputs (bottom row)
    ctx.fillStyle = '#00FF87';
    ctx.font = '900 12px "Bebas Neue", Inter, sans-serif';
    ctx.fillText('YOUR INPUT', laneX + laneW / 2, laneY + rowH + 16);

    for (let i = 0; i < SUBDIVISIONS; i++) {
      const sx = laneX + i * slotW;
      const matches = state.myInputs[i] === state.lockedPattern[i] || (state.lockedPattern[i] === 0 && state.myInputs[i] === 0);
      drawSlot(sx, laneY + rowH + 24, slotW - 2, rowH - 6, state.myInputs[i], false, true, matches);
    }

  } else if (state.phase === PHASE.RESULTS || state.phase === PHASE.GAME_OVER) {
    ctx.fillStyle = '#B24BF3';
    ctx.font = '900 12px "Bebas Neue", Inter, sans-serif';
    ctx.fillText('PATTERN WAS', laneX + laneW / 2, laneY + 5);
    for (let i = 0; i < SUBDIVISIONS; i++) {
      drawSlot(laneX + i * slotW, laneY + 18, slotW - 2, 50, state.lockedPattern[i], false, true);
    }

    ctx.font = '900 18px "Bebas Neue", Inter, sans-serif';
    ctx.fillStyle = '#aaa';
    ctx.fillText(state.resultMessage, laneX + laneW / 2, laneY + 95);
  }

  // Input hint
  if (
    (state.phase === PHASE.RESPONDING && state.myId !== state.callerId) ||
    ((state.phase === PHASE.CALLING_BAR1 || state.phase === PHASE.CALLING_BAR2) && state.myId === state.callerId)
  ) {
    ctx.font = '700 10px Inter, sans-serif';
    ctx.fillStyle = '#333';
    ctx.textAlign = 'center';
    ctx.fillText('▲ ▼ ◄ ► or W A S D', W / 2, H - 6);
  }
}

function drawSlot(x, y, w, h, move, isGhost = false, isActive = false, matches = true) {
  // Background
  const bgAlpha = isGhost ? 0.02 : 0.05;
  ctx.fillStyle = `rgba(255,255,255,${bgAlpha})`;
  roundRect(ctx, x, y, w, h, 5);
  ctx.fill();

  // Border
  const borderAlpha = isGhost ? 0.05 : 0.1;
  ctx.strokeStyle = `rgba(255,255,255,${borderAlpha})`;
  ctx.lineWidth = 1;
  roundRect(ctx, x, y, w, h, 5);
  ctx.stroke();

  if (move === 0) return;

  const arrow = MOVE_ARROWS[move];
  const color = MOVE_COLORS[move];

  ctx.globalAlpha = isGhost ? 0.25 : 1;

  if (!matches && isActive) {
    ctx.fillStyle = '#FF3366';
    // Red bg for wrong
    ctx.globalAlpha = 0.15;
    ctx.fillStyle = '#FF3366';
    roundRect(ctx, x, y, w, h, 5);
    ctx.fill();
    ctx.globalAlpha = isGhost ? 0.25 : 1;
    ctx.fillStyle = '#FF3366';
  } else {
    ctx.fillStyle = color;
  }

  // Glow behind arrow
  if (isActive && !isGhost) {
    ctx.shadowColor = color;
    ctx.shadowBlur = 6;
  }

  const fontSize = Math.min(w * 0.55, h * 0.45);
  ctx.font = `900 ${fontSize}px Inter, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(arrow, x + w / 2, y + h / 2 - 2);

  // Move name
  ctx.shadowBlur = 0;
  ctx.font = `700 ${Math.min(8, w * 0.14)}px Inter, sans-serif`;
  ctx.fillText(MOVE_NAMES[move], x + w / 2, y + h - 7);

  ctx.globalAlpha = 1.0;
  ctx.textBaseline = 'alphabetic';
}

function drawCountdown() {
  if (state.phase !== PHASE.COUNTDOWN) return;

  const text = state.countdown > 0 ? String(state.countdown) : 'GO!';
  const color = state.countdown > 0 ? '#FFE600' : '#00FF87';

  // Pulsing scale
  const pulse = 1 + state.beatPulse * 0.2;

  ctx.save();
  ctx.translate(W / 2, H / 2 - 40);
  ctx.scale(pulse, pulse);

  ctx.font = '900 180px "Bebas Neue", Inter, sans-serif';
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = color;
  ctx.shadowBlur = 40;
  ctx.fillText(text, 0, 0);
  // Double render for stronger glow
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
  ctx.fillText(state.message, W / 2, H * 0.35 + yOffset);
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
