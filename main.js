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
  barProgress: 0,       // 0-1 within current bar

  // Pattern data
  bar1Pattern: new Array(SUBDIVISIONS).fill(0),
  bar2Pattern: new Array(SUBDIVISIONS).fill(0),
  lockedPattern: new Array(SUBDIVISIONS).fill(0),
  myInputs: new Array(SUBDIVISIONS).fill(0),
  lastInputSlot: -1,

  // Players
  players: new Map(),   // sessionId → { color, role, alive, score, currentMove }

  // UI
  message: '',
  messageTimer: 0,
  resultMessage: '',
  callerFailed: false,
  gameOverWinner: null,

  // Beat pulse
  beatPulse: 0,
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
  } catch (e) {
    console.error('[Net] Failed to connect:', e);
    setTimeout(connect, 2000);
  }
}

function setupRoomListeners() {
  const room = state.room;

  // State sync
  room.state.listen('phase', (val) => { state.phase = val; });
  room.state.listen('bpm', (val) => { state.bpm = val; });
  room.state.listen('round', (val) => { state.round = val; });
  room.state.listen('callerId', (val) => { state.callerId = val; });
  room.state.listen('countdown', (val) => { state.countdown = val; });
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
    if (data.barDurationMs) {
      state.barDurationMs = data.barDurationMs;
      state.barStartTime = Date.now();
    }
    if (data.bar1Pattern) state.bar1Pattern = [...data.bar1Pattern];
    if (data.pattern) state.lockedPattern = [...data.pattern];

    // Reset my inputs when my turn starts
    if (data.phase === PHASE.CALLING_BAR1 || data.phase === PHASE.CALLING_BAR2) {
      if (state.myId === state.callerId) {
        state.myInputs.fill(0);
        state.lastInputSlot = -1;
      }
    }
    if (data.phase === PHASE.RESPONDING) {
      state.myInputs.fill(0);
      state.lastInputSlot = -1;
    }
    if (data.phase === PHASE.LOBBY) {
      showLobby();
    } else {
      hideLobby();
    }
  });

  room.onMessage('canStart', (data) => {
    updateLobbyCount();
  });

  room.onMessage('inputEvent', (data) => {
    // Update the displayed pattern bars
    if (data.phase === PHASE.CALLING_BAR1) {
      state.bar1Pattern[data.slot] = data.move;
    } else if (data.phase === PHASE.CALLING_BAR2) {
      state.bar2Pattern[data.slot] = data.move;
    }
  });

  room.onMessage('patternLocked', (data) => {
    state.lockedPattern = [...data.pattern];
    flashMessage('PATTERN LOCKED!', '#00FF87');
  });

  room.onMessage('callerFailed', (data) => {
    state.callerFailed = true;
    flashMessage(data.reason, '#FF3366');
    state.bar1Pattern.fill(0);
    state.bar2Pattern.fill(0);
  });

  room.onMessage('roundResults', (data) => {
    const myResult = data.results.find(r => r.sessionId === state.myId);
    if (myResult) {
      if (myResult.survived) {
        flashMessage('SURVIVED!', '#00FF87');
      } else {
        flashMessage('ELIMINATED!', '#FF3366');
      }
    }
    state.resultMessage = `${data.alivePlayers} players remaining`;
  });

  room.onMessage('gameOver', (data) => {
    state.gameOverWinner = data;
    if (data.winnerId === state.myId) {
      flashMessage('YOU WIN!', '#FFE600');
    } else {
      flashMessage('GAME OVER', '#FF1493');
    }
  });
}

// ─── Input ──────────────────────────────────────────────────────────

document.addEventListener('keydown', (e) => {
  const move = MOVE_KEYS[e.key];
  if (!move || !state.room) return;
  e.preventDefault();

  const isCaller = state.myId === state.callerId;
  const myPlayer = state.players.get(state.myId);

  // Calculate which subdivision slot we're in
  const elapsed = Date.now() - state.barStartTime;
  const slotDuration = state.barDurationMs / SUBDIVISIONS;
  const slot = Math.min(Math.floor(elapsed / slotDuration), SUBDIVISIONS - 1);

  // Prevent double-input on same slot
  if (slot === state.lastInputSlot) return;
  state.lastInputSlot = slot;

  if (isCaller && (state.phase === PHASE.CALLING_BAR1 || state.phase === PHASE.CALLING_BAR2)) {
    state.myInputs[slot] = move;
    state.room.send('callerInput', { slot, move });
  } else if (!isCaller && state.phase === PHASE.RESPONDING && myPlayer && myPlayer.alive) {
    state.myInputs[slot] = move;
    state.room.send('responderInput', { slot, move });
  }

  // Beat pulse effect
  state.beatPulse = 1.0;
});

// ─── Lobby UI ───────────────────────────────────────────────────────

const lobbyEl = document.getElementById('lobby');
const lobbyCount = document.getElementById('lobby-count');
const startBtn = document.getElementById('start-btn');

startBtn.addEventListener('click', () => {
  if (state.room) state.room.send('requestStart');
});

function updateLobbyCount() {
  lobbyCount.textContent = state.players.size;
  if (state.players.size >= 2) {
    startBtn.disabled = false;
    startBtn.textContent = 'BRING IT';
  } else {
    startBtn.disabled = true;
    startBtn.textContent = 'WAITING FOR PLAYERS';
  }
}

function showLobby() { lobbyEl.classList.remove('hidden'); }
function hideLobby() { lobbyEl.classList.add('hidden'); }

// ─── Messages ───────────────────────────────────────────────────────

function flashMessage(text, color = '#fff') {
  state.message = text;
  state.messageColor = color;
  state.messageTimer = 120; // frames
}

// ─── Rendering ──────────────────────────────────────────────────────

const MOVE_ARROWS = ['', '▲', '▼', '◄', '►'];
const MOVE_COLORS = ['', '#00D4FF', '#FF1493', '#FFE600', '#00FF87'];

function drawFrame(time) {
  ctx.clearRect(0, 0, W, H);

  // Background gradient
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#0a0a18');
  grad.addColorStop(1, '#12081f');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Floor line
  const floorY = H * 0.62;
  ctx.strokeStyle = '#222';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, floorY);
  ctx.lineTo(W, floorY);
  ctx.stroke();

  if (state.phase === PHASE.LOBBY) return;

  // Update bar progress
  const elapsed = Date.now() - state.barStartTime;
  state.barProgress = Math.min(elapsed / state.barDurationMs, 1.0);

  // Beat pulse decay
  state.beatPulse *= 0.92;

  drawTopBar(time);
  drawCharacters(floorY, time);
  drawBeatLane(time);
  drawMessage(time);
  drawCountdown();
}

function drawTopBar(time) {
  const isCaller = state.myId === state.callerId;
  const myPlayer = state.players.get(state.myId);

  // Phase label
  let phaseText = '';
  let phaseColor = '#666';
  switch (state.phase) {
    case PHASE.COUNTDOWN: phaseText = 'GET READY'; phaseColor = '#FFE600'; break;
    case PHASE.CALLING_BAR1: phaseText = isCaller ? 'SET THE PATTERN (BAR 1)' : 'WATCH THE CALLER'; phaseColor = '#FF6B35'; break;
    case PHASE.CALLING_BAR2: phaseText = isCaller ? 'REPEAT IT (BAR 2)' : 'WATCH THE CALLER'; phaseColor = '#FF6B35'; break;
    case PHASE.RESPONDING: phaseText = isCaller ? 'WATCH THEM SWEAT' : 'YOUR TURN — COPY IT!'; phaseColor = '#00FF87'; break;
    case PHASE.RESULTS: phaseText = 'RESULTS'; phaseColor = '#B24BF3'; break;
    case PHASE.GAME_OVER: phaseText = 'GAME OVER'; phaseColor = '#FF1493'; break;
  }

  ctx.font = '900 18px Inter, sans-serif';
  ctx.fillStyle = phaseColor;
  ctx.textAlign = 'center';
  ctx.fillText(phaseText, W / 2, 30);

  // Round + BPM
  ctx.font = '700 13px Inter, sans-serif';
  ctx.fillStyle = '#555';
  ctx.textAlign = 'left';
  ctx.fillText(`ROUND ${state.round}`, 16, 24);
  ctx.fillText(`${state.bpm} BPM`, 16, 42);

  // Player count
  ctx.textAlign = 'right';
  ctx.fillStyle = '#555';
  ctx.fillText(`${state.alivePlayers} ALIVE`, W - 16, 24);

  // Role indicator
  if (myPlayer) {
    ctx.fillStyle = isCaller ? '#FF6B35' : (myPlayer.alive ? '#00FF87' : '#FF3366');
    const roleText = isCaller ? 'YOU ARE THE CALLER' : (myPlayer.alive ? 'RESPONDER' : 'ELIMINATED');
    ctx.fillText(roleText, W - 16, 42);
  }

  // Progress bar for current bar
  if (state.phase === PHASE.CALLING_BAR1 || state.phase === PHASE.CALLING_BAR2 || state.phase === PHASE.RESPONDING) {
    const barW = W - 32;
    const barH = 4;
    const barY = 52;

    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(16, barY, barW, barH);

    // Beat markers
    for (let i = 0; i <= BEATS_PER_BAR; i++) {
      const x = 16 + (i / BEATS_PER_BAR) * barW;
      ctx.fillStyle = '#333';
      ctx.fillRect(x - 1, barY - 2, 2, barH + 4);
    }

    // Progress fill
    const fillColor = state.phase === PHASE.RESPONDING ? '#00FF87' : '#FF6B35';
    ctx.fillStyle = fillColor;
    ctx.fillRect(16, barY, barW * state.barProgress, barH);

    // Current position marker
    const markerX = 16 + barW * state.barProgress;
    ctx.fillStyle = '#fff';
    ctx.fillRect(markerX - 2, barY - 4, 4, barH + 8);
  }
}

function drawCharacters(floorY, time) {
  const callerPlayer = state.players.get(state.callerId);
  const responders = [];

  state.players.forEach((p, id) => {
    if (id !== state.callerId) responders.push({ id, ...p });
  });

  // Draw responders behind (smaller, in a grid)
  const responderY = floorY - 10;
  const cols = Math.min(responders.length, 12);
  const rows = Math.ceil(responders.length / cols);
  const spacing = Math.min(60, (W - 100) / (cols || 1));

  responders.forEach((r, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = W / 2 + (col - (cols - 1) / 2) * spacing;
    const y = responderY - row * 50;
    const size = 28;
    drawCharacter(x, y, size, r.color, r.currentMove, r.alive, time);
  });

  // Draw caller in front (larger, centered)
  if (callerPlayer) {
    const callerX = W / 2;
    const callerY = floorY - 20;
    const callerSize = 65;
    drawCharacter(callerX, callerY, callerSize, callerPlayer.color, callerPlayer.currentMove, true, time, true);

    // "CALLER" label
    ctx.font = '700 10px Inter, sans-serif';
    ctx.fillStyle = '#FF6B35';
    ctx.textAlign = 'center';
    ctx.fillText('CALLER', callerX, callerY + callerSize * 0.6 + 14);
  }
}

function drawCharacter(x, y, size, color, move, alive, time, isCaller = false) {
  const alpha = alive ? 1.0 : 0.25;
  ctx.globalAlpha = alpha;

  const headR = size * 0.2;
  const bodyW = size * 0.35;
  const bodyH = size * 0.4;
  const limbW = size * 0.08;

  // Body
  ctx.fillStyle = color;
  const bodyY = y - bodyH;

  // Poses based on move
  let headOffsetX = 0, headOffsetY = 0;
  let leftArmAngle = 0, rightArmAngle = 0;
  let squat = 0;

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
      leftArmAngle = -Math.PI * 0.6;
      rightArmAngle = Math.PI * 0.15;
      break;
    case MOVE.RIGHT:
      headOffsetX = size * 0.08;
      leftArmAngle = -Math.PI * 0.15;
      rightArmAngle = Math.PI * 0.6;
      break;
  }

  const adjustedY = y + squat;

  // Legs
  ctx.strokeStyle = color;
  ctx.lineWidth = limbW;
  ctx.lineCap = 'round';
  // Left leg
  ctx.beginPath();
  ctx.moveTo(x - bodyW * 0.3, adjustedY);
  ctx.lineTo(x - bodyW * 0.4, adjustedY + size * 0.3 - squat);
  ctx.stroke();
  // Right leg
  ctx.beginPath();
  ctx.moveTo(x + bodyW * 0.3, adjustedY);
  ctx.lineTo(x + bodyW * 0.4, adjustedY + size * 0.3 - squat);
  ctx.stroke();

  // Body rectangle
  const bx = x - bodyW / 2;
  const by = adjustedY - bodyH;
  ctx.fillStyle = color;
  roundRect(ctx, bx, by, bodyW, bodyH, size * 0.06);
  ctx.fill();

  // Arms
  const shoulderY = by + bodyH * 0.15;
  const armLen = size * 0.35;
  // Left arm
  ctx.beginPath();
  ctx.moveTo(x - bodyW / 2, shoulderY);
  ctx.lineTo(
    x - bodyW / 2 + Math.sin(leftArmAngle) * armLen,
    shoulderY + Math.cos(leftArmAngle) * armLen
  );
  ctx.stroke();
  // Right arm
  ctx.beginPath();
  ctx.moveTo(x + bodyW / 2, shoulderY);
  ctx.lineTo(
    x + bodyW / 2 + Math.sin(rightArmAngle) * armLen,
    shoulderY + Math.cos(rightArmAngle) * armLen
  );
  ctx.stroke();

  // Head
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x + headOffsetX, by - headR * 0.5 + headOffsetY, headR, 0, Math.PI * 2);
  ctx.fill();

  // Glow for caller
  if (isCaller && alive) {
    ctx.shadowColor = color;
    ctx.shadowBlur = 15 + state.beatPulse * 20;
    ctx.beginPath();
    ctx.arc(x, by - headR * 0.5, headR * 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  // Eliminated X
  if (!alive) {
    ctx.strokeStyle = '#FF3366';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x - size * 0.2, by - size * 0.1);
    ctx.lineTo(x + size * 0.2, by + size * 0.3);
    ctx.moveTo(x + size * 0.2, by - size * 0.1);
    ctx.lineTo(x - size * 0.2, by + size * 0.3);
    ctx.stroke();
  }

  ctx.globalAlpha = 1.0;
}

function drawBeatLane(time) {
  const laneH = 140;
  const laneY = H - laneH - 10;
  const laneX = 40;
  const laneW = W - 80;

  // Background
  ctx.fillStyle = 'rgba(15, 15, 30, 0.85)';
  roundRect(ctx, laneX - 10, laneY - 10, laneW + 20, laneH + 20, 8);
  ctx.fill();

  // Determine what to show
  const isCaller = state.myId === state.callerId;
  const slotW = laneW / SUBDIVISIONS;

  // Bar labels
  ctx.font = '700 11px Inter, sans-serif';
  ctx.textAlign = 'center';

  if (state.phase === PHASE.CALLING_BAR1 || state.phase === PHASE.CALLING_BAR2) {
    // Show both bars side by side
    const halfW = laneW / 2 - 10;
    const bar1X = laneX;
    const bar2X = laneX + laneW / 2 + 10;
    const sW = halfW / SUBDIVISIONS;

    // Bar 1 label
    ctx.fillStyle = state.phase === PHASE.CALLING_BAR1 ? '#FF6B35' : '#444';
    ctx.fillText('BAR 1', bar1X + halfW / 2, laneY + 5);

    // Bar 2 label
    ctx.fillStyle = state.phase === PHASE.CALLING_BAR2 ? '#FF6B35' : '#444';
    ctx.fillText('BAR 2', bar2X + halfW / 2, laneY + 5);

    // Draw bar 1 slots
    for (let i = 0; i < SUBDIVISIONS; i++) {
      const sx = bar1X + i * sW;
      const isGhost = state.phase === PHASE.CALLING_BAR1;
      drawSlot(sx, laneY + 18, sW - 2, 50, state.bar1Pattern[i], isGhost);
    }

    // Draw bar 2 slots
    for (let i = 0; i < SUBDIVISIONS; i++) {
      const sx = bar2X + i * sW;
      const isActive = state.phase === PHASE.CALLING_BAR2;
      drawSlot(sx, laneY + 18, sW - 2, 50, state.bar2Pattern[i], false, isActive);
    }

    // Divider
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(laneX + laneW / 2, laneY);
    ctx.lineTo(laneX + laneW / 2, laneY + laneH);
    ctx.stroke();

  } else if (state.phase === PHASE.RESPONDING) {
    // Show locked pattern on top, my inputs below
    const rowH = 50;

    ctx.fillStyle = '#FFE600';
    ctx.fillText('PATTERN TO MATCH', laneX + laneW / 2, laneY + 5);

    // Locked pattern
    for (let i = 0; i < SUBDIVISIONS; i++) {
      const sx = laneX + i * slotW;
      drawSlot(sx, laneY + 15, slotW - 2, rowH - 5, state.lockedPattern[i], false, true);
    }

    // My inputs
    ctx.fillStyle = '#00FF87';
    ctx.fillText('YOUR INPUT', laneX + laneW / 2, laneY + rowH + 20);

    for (let i = 0; i < SUBDIVISIONS; i++) {
      const sx = laneX + i * slotW;
      const matches = state.myInputs[i] === state.lockedPattern[i] || (state.lockedPattern[i] === 0 && state.myInputs[i] === 0);
      drawSlot(sx, laneY + rowH + 28, slotW - 2, rowH - 5, state.myInputs[i], false, true, matches);
    }

  } else if (state.phase === PHASE.RESULTS || state.phase === PHASE.GAME_OVER) {
    // Show the locked pattern
    ctx.fillStyle = '#B24BF3';
    ctx.fillText('PATTERN WAS', laneX + laneW / 2, laneY + 5);
    for (let i = 0; i < SUBDIVISIONS; i++) {
      const sx = laneX + i * slotW;
      drawSlot(sx, laneY + 18, slotW - 2, 50, state.lockedPattern[i], false, true);
    }

    // Result message
    ctx.font = '900 16px Inter, sans-serif';
    ctx.fillStyle = '#aaa';
    ctx.fillText(state.resultMessage, laneX + laneW / 2, laneY + 90);
  }

  // Input hint
  if (
    (state.phase === PHASE.RESPONDING && state.myId !== state.callerId) ||
    ((state.phase === PHASE.CALLING_BAR1 || state.phase === PHASE.CALLING_BAR2) && state.myId === state.callerId)
  ) {
    ctx.font = '700 11px Inter, sans-serif';
    ctx.fillStyle = '#444';
    ctx.textAlign = 'center';
    ctx.fillText('▲ ▼ ◄ ► or W A S D', W / 2, H - 8);
  }
}

function drawSlot(x, y, w, h, move, isGhost = false, isActive = false, matches = true) {
  // Background
  ctx.fillStyle = isGhost ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.06)';
  roundRect(ctx, x, y, w, h, 4);
  ctx.fill();

  // Border
  ctx.strokeStyle = isGhost ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 1;
  roundRect(ctx, x, y, w, h, 4);
  ctx.stroke();

  if (move === 0) return;

  // Arrow
  const arrow = MOVE_ARROWS[move];
  const color = MOVE_COLORS[move];

  if (isGhost) {
    ctx.globalAlpha = 0.3;
  }

  if (!matches && isActive) {
    ctx.fillStyle = '#FF3366'; // wrong = red
  } else {
    ctx.fillStyle = color;
  }

  ctx.font = `900 ${Math.min(w * 0.6, h * 0.5)}px Inter, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(arrow, x + w / 2, y + h / 2);

  // Move name below
  ctx.font = `700 ${Math.min(9, w * 0.15)}px Inter, sans-serif`;
  ctx.fillText(MOVE_NAMES[move], x + w / 2, y + h - 8);

  ctx.globalAlpha = 1.0;
  ctx.textBaseline = 'alphabetic';
}

function drawCountdown() {
  if (state.phase !== PHASE.COUNTDOWN) return;

  ctx.font = '900 160px "Bebas Neue", Inter, sans-serif';
  ctx.fillStyle = '#FFE600';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = '#FFE600';
  ctx.shadowBlur = 30;
  ctx.fillText(state.countdown > 0 ? state.countdown : 'GO!', W / 2, H / 2 - 40);
  ctx.shadowBlur = 0;
  ctx.textBaseline = 'alphabetic';
}

function drawMessage(time) {
  if (state.messageTimer <= 0) return;
  state.messageTimer--;

  const alpha = Math.min(1, state.messageTimer / 30);
  ctx.globalAlpha = alpha;
  ctx.font = '900 42px "Bebas Neue", Inter, sans-serif';
  ctx.fillStyle = state.messageColor || '#fff';
  ctx.textAlign = 'center';
  ctx.shadowColor = state.messageColor || '#fff';
  ctx.shadowBlur = 20;
  ctx.fillText(state.message, W / 2, H * 0.35);
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
