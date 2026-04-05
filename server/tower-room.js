/**
 * TowerRoom — Colyseus room for the Babel tower.
 *
 * Handles:
 *   - Player join/leave
 *   - Position sync
 *   - Puzzle request/submit
 *   - Tower growth
 *   - Babel chat
 */

import colyseus from 'colyseus';
const { Room } = colyseus;
import { Schema, MapSchema, ArraySchema, defineTypes } from '@colyseus/schema';
import { TowerState } from './tower-state.js';
import { generatePuzzle, validateSolution } from './puzzle-validator.js';
import { saveTowerState } from './db.js';
import { babelify } from '../shared/babel-text.js';
import { PLAYER_COLORS, MAX_PLAYERS, PUZZLE_INTERACT_DISTANCE } from '../shared/constants.js';

// ─── Schema Definitions ─────────────────────────────────────────────

class PlayerState extends Schema {}
defineTypes(PlayerState, {
  x: 'number',
  y: 'number',
  z: 'number',
  rotationY: 'number',
  color: 'number',
});

class GrowthPointState extends Schema {}
defineTypes(GrowthPointState, {
  gpId: 'string',
  x: 'number',
  y: 'number',
  z: 'number',
  active: 'boolean',
  solvesRemaining: 'number',
  floor: 'number',
});

class TowerRoomState extends Schema {}
defineTypes(TowerRoomState, {
  players: { map: PlayerState },
  towerHeight: 'number',
  totalSolves: 'number',
});

// ─── Room ────────────────────────────────────────────────────────────

export class TowerRoom extends Room {
  onCreate(options) {
    this.maxClients = MAX_PLAYERS;

    // Initialize state
    this.setState(new TowerRoomState());
    this.state.players = new MapSchema();

    // Tower logic (separate from Colyseus schema for complex operations)
    this.tower = globalThis.__babelTower || new TowerState();
    this.state.towerHeight = this.tower.currentHeight;
    this.state.totalSolves = this.tower.totalSolves;

    // Active puzzles: sessionId → { puzzle, growthPointId }
    this.activePuzzles = new Map();

    // Color assignment counter
    this.colorCounter = 0;

    // Save interval
    this.saveInterval = setInterval(() => {
      saveTowerState(this.tower);
    }, 30000);

    // ─── Message Handlers ─────────────────────────────────────────

    this.onMessage('position', (client, data) => {
      const player = this.state.players.get(client.sessionId);
      if (!player) return;
      player.x = data.x || 0;
      player.y = data.y || 0;
      player.z = data.z || 0;
      player.rotationY = data.rotationY || 0;
    });

    this.onMessage('requestPuzzle', async (client, data) => {
      const { growthPointId } = data;

      // Find the growth point
      const gp = this.tower.growthPoints.find(g => g.id === growthPointId && g.active);
      if (!gp) {
        client.send('puzzleData', { error: 'Growth point not available' });
        return;
      }

      // Check if player already has an active puzzle
      if (this.activePuzzles.has(client.sessionId)) {
        client.send('puzzleData', { error: 'Already solving a puzzle' });
        return;
      }

      try {
        const puzzle = await generatePuzzle(gp.floor);
        this.activePuzzles.set(client.sessionId, {
          puzzle,
          growthPointId,
        });

        // Send puzzle data WITHOUT the answer
        client.send('puzzleData', {
          type: puzzle.type,
          data: puzzle.data,
          growthPointId,
        });
      } catch (e) {
        console.error('[Room] Puzzle generation failed:', e);
        client.send('puzzleData', { error: 'Failed to generate puzzle' });
      }
    });

    this.onMessage('submitSolution', (client, data) => {
      const active = this.activePuzzles.get(client.sessionId);
      if (!active) {
        client.send('puzzleResult', { success: false, error: 'No active puzzle' });
        return;
      }

      const { puzzle, growthPointId } = active;
      const isCorrect = validateSolution(puzzle, data.answer);

      // Clear the active puzzle
      this.activePuzzles.delete(client.sessionId);

      if (isCorrect) {
        const result = this.tower.recordSolve(growthPointId, client.sessionId, puzzle.type);
        this.state.totalSolves = this.tower.totalSolves;

        client.send('puzzleResult', {
          success: true,
          grew: result.grew,
          newFloor: result.newFloor,
        });

        if (result.grew) {
          this.state.towerHeight = this.tower.currentHeight;
          // Broadcast growth event with new growth points
          this.broadcast('towerGrew', {
            floor: this.tower.currentHeight,
            growthPoints: this.tower.growthPoints.filter(g => g.active),
          });
          saveTowerState(this.tower);
        }

        // Broadcast updated growth points
        this.broadcast('growthPointsUpdate', {
          growthPoints: this.tower.growthPoints.filter(g => g.active),
        });
      } else {
        client.send('puzzleResult', { success: false });
      }
    });

    this.onMessage('cancelPuzzle', (client) => {
      this.activePuzzles.delete(client.sessionId);
    });

    this.onMessage('chat', (client, data) => {
      if (!data.message || data.message.length > 140) return;
      const babelText = babelify(data.message, client.sessionId);
      this.broadcast('chatBubble', {
        sessionId: client.sessionId,
        babelText,
      });
    });

    console.log('[TowerRoom] Created. Tower height:', this.tower.currentHeight);
  }

  onJoin(client, options) {
    const player = new PlayerState();
    player.x = 0;
    player.y = 8;
    player.z = 24;
    player.rotationY = 0;
    player.color = PLAYER_COLORS[this.colorCounter % PLAYER_COLORS.length];
    this.colorCounter++;

    this.state.players.set(client.sessionId, player);

    // Send the current growth points to the new player
    client.send('initState', {
      growthPoints: this.tower.growthPoints.filter(g => g.active),
      towerHeight: this.tower.currentHeight,
      totalSolves: this.tower.totalSolves,
      sessionId: client.sessionId,
      color: player.color,
    });

    console.log(`[TowerRoom] Player joined: ${client.sessionId} (${this.clients.length} total)`);
  }

  onLeave(client) {
    this.state.players.delete(client.sessionId);
    this.activePuzzles.delete(client.sessionId);
    console.log(`[TowerRoom] Player left: ${client.sessionId} (${this.clients.length} total)`);
  }

  onDispose() {
    clearInterval(this.saveInterval);
    saveTowerState(this.tower);
    console.log('[TowerRoom] Disposed. Tower state saved.');
  }
}
