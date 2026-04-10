/**
 * GameRoom — Colyseus room for the rhythm party game.
 *
 * Manages: roles, beat timing, pattern recording/matching,
 * elimination, round progression, BPM escalation.
 */

import colyseus from 'colyseus';
const { Room } = colyseus;
import { Schema, MapSchema, ArraySchema, defineTypes } from '@colyseus/schema';
import {
  MAX_PLAYERS, STARTING_BPM, BPM_INCREMENT, MAX_BPM,
  BEATS_PER_BAR, SUBDIVISIONS, MIN_PLAYERS_TO_START,
  COUNTDOWN_SECONDS, RESULTS_DURATION_MS, PHASE, NEON_COLORS,
} from '../shared/constants.js';

// ─── Schema ─────────────────────────────────────────────────────────

class PlayerState extends Schema {}
defineTypes(PlayerState, {
  color: 'string',
  role: 'string',    // 'caller' | 'responder' | 'spectator'
  alive: 'boolean',
  score: 'number',
  currentMove: 'number', // current pose for rendering (0-4)
});

class GameRoomState extends Schema {}
defineTypes(GameRoomState, {
  phase: 'string',
  bpm: 'number',
  round: 'number',
  callerId: 'string',
  barStartTime: 'number',
  barDurationMs: 'number',
  countdown: 'number',
  alivePlayers: 'number',
  totalPlayers: 'number',
  players: { map: PlayerState },
});

// ─── Room ───────────────────────────────────────────────────────────

export class GameRoom extends Room {
  onCreate(options) {
    this.maxClients = MAX_PLAYERS;
    this.setState(new GameRoomState());
    this.state.players = new MapSchema();
    this.state.phase = PHASE.LOBBY;
    this.state.bpm = STARTING_BPM;
    this.state.round = 0;
    this.state.callerId = '';
    this.state.countdown = 0;
    this.state.alivePlayers = 0;
    this.state.totalPlayers = 0;

    this.colorCounter = 0;

    // Pattern storage (not in schema — sent via messages)
    this.callerBar1 = new Array(SUBDIVISIONS).fill(0);
    this.callerBar2 = new Array(SUBDIVISIONS).fill(0);
    this.lockedPattern = new Array(SUBDIVISIONS).fill(0);
    this.responderInputs = new Map(); // sessionId → number[]
    this.phaseTimer = null;

    // ─── Message Handlers ───────────────────────────────────────

    this.onMessage('callerInput', (client, data) => {
      if (client.sessionId !== this.state.callerId) return;
      if (this.state.phase !== PHASE.CALLING_BAR1 && this.state.phase !== PHASE.CALLING_BAR2) return;

      const { slot, move } = data;
      if (slot < 0 || slot >= SUBDIVISIONS || move < 1 || move > 4) return;

      if (this.state.phase === PHASE.CALLING_BAR1) {
        this.callerBar1[slot] = move;
      } else {
        this.callerBar2[slot] = move;
      }

      // Update caller pose for rendering
      const player = this.state.players.get(client.sessionId);
      if (player) player.currentMove = move;

      // Broadcast to everyone so they see the input in real-time
      this.broadcast('inputEvent', {
        phase: this.state.phase,
        slot,
        move,
        sessionId: client.sessionId,
      });
    });

    this.onMessage('responderInput', (client, data) => {
      if (this.state.phase !== PHASE.RESPONDING) return;
      const player = this.state.players.get(client.sessionId);
      if (!player || player.role !== 'responder' || !player.alive) return;

      const { slot, move } = data;
      if (slot < 0 || slot >= SUBDIVISIONS || move < 1 || move > 4) return;

      if (!this.responderInputs.has(client.sessionId)) {
        this.responderInputs.set(client.sessionId, new Array(SUBDIVISIONS).fill(0));
      }
      this.responderInputs.get(client.sessionId)[slot] = move;

      // Update pose
      player.currentMove = move;

      // Broadcast so others see the responder's move
      this.broadcast('inputEvent', {
        phase: this.state.phase,
        slot,
        move,
        sessionId: client.sessionId,
      });
    });

    this.onMessage('requestStart', (client) => {
      if (this.state.phase === PHASE.LOBBY && this.getAlivePlayers().length >= MIN_PLAYERS_TO_START) {
        this.startGame();
      }
    });

    console.log('[GameRoom] Created');
  }

  onJoin(client, options) {
    const color = NEON_COLORS[this.colorCounter % NEON_COLORS.length];
    this.colorCounter++;

    const player = new PlayerState();
    player.color = color;
    player.role = 'responder';
    player.alive = true;
    player.score = 0;
    player.currentMove = 0;

    this.state.players.set(client.sessionId, player);
    this.state.totalPlayers = this.state.players.size;
    this.state.alivePlayers = this.getAlivePlayers().length;

    console.log(`[GameRoom] Player joined: ${client.sessionId} (${color})`);

    // If we're in lobby and have enough players, notify
    if (this.state.phase === PHASE.LOBBY && this.state.players.size >= MIN_PLAYERS_TO_START) {
      this.broadcast('canStart', { count: this.state.players.size });
    }
  }

  onLeave(client, consented) {
    this.state.players.delete(client.sessionId);
    this.state.totalPlayers = this.state.players.size;
    this.state.alivePlayers = this.getAlivePlayers().length;
    this.responderInputs.delete(client.sessionId);

    console.log(`[GameRoom] Player left: ${client.sessionId}`);

    // If the caller left mid-game, pick a new one or end round
    if (client.sessionId === this.state.callerId && this.state.phase !== PHASE.LOBBY) {
      this.clearTimer();
      this.showResults('Caller disconnected!');
    }

    // If not enough players, go back to lobby
    if (this.state.players.size < MIN_PLAYERS_TO_START && this.state.phase !== PHASE.LOBBY) {
      this.clearTimer();
      this.state.phase = PHASE.LOBBY;
      this.state.round = 0;
      this.state.bpm = STARTING_BPM;
      this.broadcast('phaseChange', { phase: PHASE.LOBBY, message: 'Not enough players' });
    }
  }

  // ─── Game Flow ──────────────────────────────────────────────────────

  startGame() {
    this.state.round = 0;
    this.state.bpm = STARTING_BPM;
    // Reset all players
    this.state.players.forEach((p) => { p.alive = true; p.score = 0; });
    this.pickCaller();
    this.startCountdown();
  }

  pickCaller() {
    const alive = this.getAlivePlayers();
    if (alive.length === 0) return;

    // First round: random. After: last survivor or random alive
    const pick = alive[Math.floor(Math.random() * alive.length)];
    this.state.callerId = pick.sessionId;

    // Set roles
    this.state.players.forEach((player, sessionId) => {
      player.role = sessionId === this.state.callerId ? 'caller' : 'responder';
      player.currentMove = 0;
    });
  }

  startCountdown() {
    this.state.round++;
    this.state.phase = PHASE.COUNTDOWN;
    this.state.countdown = COUNTDOWN_SECONDS;

    // Reset patterns
    this.callerBar1.fill(0);
    this.callerBar2.fill(0);
    this.lockedPattern.fill(0);
    this.responderInputs.clear();

    // Reset all alive players
    this.state.players.forEach(p => { p.currentMove = 0; });

    this.broadcast('phaseChange', {
      phase: PHASE.COUNTDOWN,
      round: this.state.round,
      bpm: this.state.bpm,
      callerId: this.state.callerId,
    });

    let count = COUNTDOWN_SECONDS;
    this.phaseTimer = setInterval(() => {
      count--;
      this.state.countdown = count;
      if (count <= 0) {
        this.clearTimer();
        this.startCallingBar1();
      }
    }, 1000);
  }

  getBarDurationMs() {
    // Duration of one bar in ms
    // BPM = beats per minute. beats per bar = BEATS_PER_BAR
    // bar duration = (BEATS_PER_BAR / BPM) * 60000
    return (BEATS_PER_BAR / this.state.bpm) * 60000;
  }

  startCallingBar1() {
    this.callerBar1.fill(0);
    const duration = this.getBarDurationMs();
    this.state.phase = PHASE.CALLING_BAR1;
    this.state.barStartTime = Date.now();
    this.state.barDurationMs = duration;

    this.broadcast('phaseChange', {
      phase: PHASE.CALLING_BAR1,
      barDurationMs: duration,
      bpm: this.state.bpm,
    });

    this.phaseTimer = setTimeout(() => {
      this.startCallingBar2();
    }, duration);
  }

  startCallingBar2() {
    this.callerBar2.fill(0);
    const duration = this.getBarDurationMs();
    this.state.phase = PHASE.CALLING_BAR2;
    this.state.barStartTime = Date.now();
    this.state.barDurationMs = duration;

    this.broadcast('phaseChange', {
      phase: PHASE.CALLING_BAR2,
      barDurationMs: duration,
      bpm: this.state.bpm,
      bar1Pattern: this.callerBar1, // send bar1 for comparison display
    });

    this.phaseTimer = setTimeout(() => {
      this.checkCallerMatch();
    }, duration);
  }

  checkCallerMatch() {
    // Compare bar1 and bar2
    let match = true;
    for (let i = 0; i < SUBDIVISIONS; i++) {
      if (this.callerBar1[i] !== this.callerBar2[i]) {
        match = false;
        break;
      }
    }

    // Also check that the pattern isn't empty
    const hasContent = this.callerBar1.some(m => m !== 0);

    if (match && hasContent) {
      // Pattern locked!
      this.lockedPattern = [...this.callerBar1];
      this.broadcast('patternLocked', { pattern: this.lockedPattern });
      this.startResponding();
    } else {
      // Caller failed to match — try again from bar 1
      this.broadcast('callerFailed', {
        bar1: this.callerBar1,
        bar2: this.callerBar2,
        reason: !hasContent ? 'Empty pattern!' : 'Bars didn\'t match!',
      });
      // Give them another shot
      setTimeout(() => this.startCallingBar1(), 1000);
    }
  }

  startResponding() {
    this.responderInputs.clear();
    const duration = this.getBarDurationMs();
    this.state.phase = PHASE.RESPONDING;
    this.state.barStartTime = Date.now();
    this.state.barDurationMs = duration;

    this.broadcast('phaseChange', {
      phase: PHASE.RESPONDING,
      barDurationMs: duration,
      bpm: this.state.bpm,
      pattern: this.lockedPattern,
    });

    this.phaseTimer = setTimeout(() => {
      this.judgeResponders();
    }, duration);
  }

  judgeResponders() {
    this.state.phase = PHASE.JUDGING;
    const results = [];

    this.state.players.forEach((player, sessionId) => {
      if (player.role !== 'responder' || !player.alive) return;

      const inputs = this.responderInputs.get(sessionId) || new Array(SUBDIVISIONS).fill(0);
      let correct = 0;
      let total = 0;

      for (let i = 0; i < SUBDIVISIONS; i++) {
        if (this.lockedPattern[i] !== 0) {
          total++;
          if (inputs[i] === this.lockedPattern[i]) correct++;
        }
      }

      // Must match ALL moves to survive
      const survived = total > 0 && correct === total;
      if (!survived) {
        player.alive = false;
      } else {
        player.score += this.state.round;
      }

      results.push({
        sessionId,
        survived,
        correct,
        total,
        inputs,
      });
    });

    this.state.alivePlayers = this.getAlivePlayers().length;
    this.showResults('Round complete!', results);
  }

  showResults(message, results = []) {
    this.state.phase = PHASE.RESULTS;

    this.broadcast('roundResults', {
      message,
      results,
      pattern: this.lockedPattern,
      alivePlayers: this.state.alivePlayers,
    });

    this.phaseTimer = setTimeout(() => {
      this.nextRound();
    }, RESULTS_DURATION_MS);
  }

  nextRound() {
    const alive = this.getAlivePlayers();

    if (alive.length <= 1) {
      // Game over!
      this.state.phase = PHASE.GAME_OVER;
      const winner = alive.length === 1 ? alive[0] : null;

      this.broadcast('gameOver', {
        winnerId: winner ? winner.sessionId : null,
        winnerColor: winner ? this.state.players.get(winner.sessionId).color : null,
      });

      // After a pause, restart
      this.phaseTimer = setTimeout(() => {
        this.state.phase = PHASE.LOBBY;
        this.state.bpm = STARTING_BPM;
        this.state.round = 0;
        // Reset all players
        this.state.players.forEach(p => { p.alive = true; p.score = 0; p.role = 'responder'; });
        this.state.alivePlayers = this.state.players.size;
        this.broadcast('phaseChange', { phase: PHASE.LOBBY });
      }, 5000);
    } else {
      // Escalate BPM
      this.state.bpm = Math.min(this.state.bpm + BPM_INCREMENT, MAX_BPM);
      // Caller stays the same unless they want to rotate
      // (For now, pick a new caller from alive players)
      this.pickCaller();
      this.startCountdown();
    }
  }

  // ─── Helpers ────────────────────────────────────────────────────────

  getAlivePlayers() {
    const alive = [];
    this.state.players.forEach((player, sessionId) => {
      if (player.alive) alive.push({ sessionId, player });
    });
    return alive;
  }

  clearTimer() {
    if (this.phaseTimer) {
      clearTimeout(this.phaseTimer);
      clearInterval(this.phaseTimer);
      this.phaseTimer = null;
    }
  }

  onDispose() {
    this.clearTimer();
    console.log('[GameRoom] Disposed');
  }
}
