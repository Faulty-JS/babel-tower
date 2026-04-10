/**
 * GameRoom — Colyseus room for the rhythm party game.
 *
 * Manages: roles, beat timing, pattern recording/matching,
 * elimination, round progression, BPM escalation.
 *
 * Patterns are stored as arrays of { time, move } where time is
 * ms offset from bar start. Matching uses timing windows, not slots.
 */

import colyseus from 'colyseus';
const { Room } = colyseus;
import { Schema, MapSchema, defineTypes } from '@colyseus/schema';
import {
  MAX_PLAYERS, STARTING_BPM, BPM_INCREMENT, MAX_BPM,
  BEATS_PER_BAR, MIN_PLAYERS_TO_START,
  COUNTDOWN_SECONDS, RESULTS_DURATION_MS, PHASE, NEON_COLORS, TIMING,
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

    // Pattern storage — arrays of { time: number (ms offset), move: number }
    this.callerBar1 = [];
    this.callerBar2 = [];
    this.lockedPattern = [];
    this.responderInputs = new Map(); // sessionId → [{ time, move }]
    this.phaseTimer = null;

    // ─── Message Handlers ───────────────────────────────────────

    this.onMessage('callerInput', (client, data) => {
      if (client.sessionId !== this.state.callerId) return;
      if (this.state.phase !== PHASE.CALLING_BAR1 && this.state.phase !== PHASE.CALLING_BAR2) return;

      const { time, move } = data;
      if (typeof time !== 'number' || move < 1 || move > 4) return;
      // Clamp time to bar duration
      const t = Math.max(0, Math.min(time, this.state.barDurationMs));

      const beat = { time: t, move };

      if (this.state.phase === PHASE.CALLING_BAR1) {
        this.callerBar1.push(beat);
      } else {
        this.callerBar2.push(beat);
      }

      // Update caller pose for rendering
      const player = this.state.players.get(client.sessionId);
      if (player) player.currentMove = move;

      // Broadcast to everyone so they see the input in real-time
      this.broadcast('inputEvent', {
        phase: this.state.phase,
        time: t,
        move,
        sessionId: client.sessionId,
      });
    });

    this.onMessage('responderInput', (client, data) => {
      if (this.state.phase !== PHASE.RESPONDING) return;
      const player = this.state.players.get(client.sessionId);
      if (!player || player.role !== 'responder' || !player.alive) return;

      const { time, move } = data;
      if (typeof time !== 'number' || move < 1 || move > 4) return;
      const t = Math.max(0, Math.min(time, this.state.barDurationMs));

      if (!this.responderInputs.has(client.sessionId)) {
        this.responderInputs.set(client.sessionId, []);
      }
      this.responderInputs.get(client.sessionId).push({ time: t, move });

      // Update pose
      player.currentMove = move;

      // Broadcast so others see the responder's move
      this.broadcast('inputEvent', {
        phase: this.state.phase,
        time: t,
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

    if (client.sessionId === this.state.callerId && this.state.phase !== PHASE.LOBBY) {
      this.clearTimer();
      this.showResults('Caller disconnected!');
    }

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
    this.state.players.forEach((p) => { p.alive = true; p.score = 0; });
    this.pickCaller();
    this.startCountdown();
  }

  pickCaller() {
    const alive = this.getAlivePlayers();
    if (alive.length === 0) return;
    const pick = alive[Math.floor(Math.random() * alive.length)];
    this.state.callerId = pick.sessionId;

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
    this.callerBar1 = [];
    this.callerBar2 = [];
    this.lockedPattern = [];
    this.responderInputs.clear();

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
        this.startCountIn();
      }
    }, 1000);
  }

  startCountIn() {
    // "1, 2, 3, GO!" at the current BPM — one beat each
    const beatMs = 60000 / this.state.bpm;
    const totalBeats = 4; // 1, 2, 3, GO
    this.state.phase = PHASE.COUNTIN;
    this.state.countdown = totalBeats;

    this.broadcast('phaseChange', {
      phase: PHASE.COUNTIN,
      bpm: this.state.bpm,
      beatMs,
      totalBeats,
    });

    let beat = 0;
    this.phaseTimer = setInterval(() => {
      beat++;
      this.state.countdown = totalBeats - beat;
      if (beat >= totalBeats) {
        this.clearTimer();
        this.startCallingBar1();
      }
    }, beatMs);
  }

  getBarDurationMs() {
    return (BEATS_PER_BAR / this.state.bpm) * 60000;
  }

  startCallingBar1() {
    this.callerBar1 = [];
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
    }, duration + 200); // small grace period
  }

  startCallingBar2() {
    this.callerBar2 = [];
    const duration = this.getBarDurationMs();
    this.state.phase = PHASE.CALLING_BAR2;
    this.state.barStartTime = Date.now();
    this.state.barDurationMs = duration;

    this.broadcast('phaseChange', {
      phase: PHASE.CALLING_BAR2,
      barDurationMs: duration,
      bpm: this.state.bpm,
      bar1Pattern: this.callerBar1, // send bar1 for display
    });

    this.phaseTimer = setTimeout(() => {
      this.checkCallerMatch();
    }, duration + 200);
  }

  checkCallerMatch() {
    // Pattern must not be empty
    if (this.callerBar1.length === 0) {
      this.broadcast('callerFailed', { reason: 'Empty pattern!' });
      setTimeout(() => this.startCountIn(), 1000);
      return;
    }

    // Compare bar1 and bar2 using timing windows
    // Each beat in bar1 must have a matching beat in bar2 (same move, within GOOD window)
    // and vice versa
    const matched = this.patternsMatch(this.callerBar1, this.callerBar2);

    if (matched) {
      // Pattern locked — use bar1 as the canonical pattern
      this.lockedPattern = [...this.callerBar1];
      this.broadcast('patternLocked', { pattern: this.lockedPattern });
      this.startResponding();
    } else {
      this.broadcast('callerFailed', {
        reason: "Bars didn't match!",
      });
      setTimeout(() => this.startCountIn(), 1000);
    }
  }

  patternsMatch(pattern1, pattern2) {
    if (pattern1.length !== pattern2.length) return false;

    // Sort both by time
    const p1 = [...pattern1].sort((a, b) => a.time - b.time);
    const p2 = [...pattern2].sort((a, b) => a.time - b.time);

    // Each beat in p1 must match a beat in p2 (same move, time within GOOD window)
    const used = new Set();
    for (const beat of p1) {
      let found = false;
      for (let i = 0; i < p2.length; i++) {
        if (used.has(i)) continue;
        if (p2[i].move === beat.move && Math.abs(p2[i].time - beat.time) <= TIMING.GOOD) {
          used.add(i);
          found = true;
          break;
        }
      }
      if (!found) return false;
    }
    return true;
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
    }, duration + 200);
  }

  judgeResponders() {
    this.state.phase = PHASE.JUDGING;
    const results = [];

    this.state.players.forEach((player, sessionId) => {
      if (player.role !== 'responder' || !player.alive) return;

      const inputs = this.responderInputs.get(sessionId) || [];
      const { score, perfectCount, greatCount, goodCount, missCount } = this.scorePattern(this.lockedPattern, inputs);

      // Must hit at least half the beats with GOOD or better to survive
      const totalBeats = this.lockedPattern.length;
      const hitsNeeded = Math.ceil(totalBeats * 0.6);
      const hits = perfectCount + greatCount + goodCount;
      const survived = hits >= hitsNeeded;

      if (!survived) {
        player.alive = false;
      } else {
        player.score += score;
      }

      results.push({
        sessionId,
        survived,
        score,
        perfectCount,
        greatCount,
        goodCount,
        missCount,
        totalBeats,
      });
    });

    this.state.alivePlayers = this.getAlivePlayers().length;
    this.showResults('Round complete!', results);
  }

  scorePattern(target, inputs) {
    let perfectCount = 0, greatCount = 0, goodCount = 0, missCount = 0;
    let score = 0;

    const usedInputs = new Set();
    const sortedTarget = [...target].sort((a, b) => a.time - b.time);

    for (const beat of sortedTarget) {
      let bestDelta = Infinity;
      let bestIdx = -1;

      for (let i = 0; i < inputs.length; i++) {
        if (usedInputs.has(i)) continue;
        if (inputs[i].move !== beat.move) continue;
        const delta = Math.abs(inputs[i].time - beat.time);
        if (delta < bestDelta) {
          bestDelta = delta;
          bestIdx = i;
        }
      }

      if (bestIdx !== -1 && bestDelta <= TIMING.GOOD) {
        usedInputs.add(bestIdx);
        if (bestDelta <= TIMING.PERFECT) {
          perfectCount++;
          score += 3;
        } else if (bestDelta <= TIMING.GREAT) {
          greatCount++;
          score += 2;
        } else {
          goodCount++;
          score += 1;
        }
      } else {
        missCount++;
      }
    }

    return { score, perfectCount, greatCount, goodCount, missCount };
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
      this.state.phase = PHASE.GAME_OVER;
      const winner = alive.length === 1 ? alive[0] : null;

      this.broadcast('gameOver', {
        winnerId: winner ? winner.sessionId : null,
        winnerColor: winner ? this.state.players.get(winner.sessionId).color : null,
      });

      this.phaseTimer = setTimeout(() => {
        this.state.phase = PHASE.LOBBY;
        this.state.bpm = STARTING_BPM;
        this.state.round = 0;
        this.state.players.forEach(p => { p.alive = true; p.score = 0; p.role = 'responder'; });
        this.state.alivePlayers = this.state.players.size;
        this.broadcast('phaseChange', { phase: PHASE.LOBBY });
      }, 5000);
    } else {
      this.state.bpm = Math.min(this.state.bpm + BPM_INCREMENT, MAX_BPM);
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
