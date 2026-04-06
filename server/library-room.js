/**
 * LibraryRoom — Colyseus room for the Library of Babel.
 *
 * Handles:
 *   - Player join/leave
 *   - Position sync
 *   - Word pair assignment and journey tracking
 *   - Article room navigation (portal transitions)
 *   - Win detection
 *   - Babel chat
 */

import colyseus from 'colyseus';
const { Room } = colyseus;
import { Schema, MapSchema, defineTypes } from '@colyseus/schema';
import { babelify } from '../shared/babel-text.js';
import { PLAYER_COLORS, MAX_PLAYERS } from '../shared/constants.js';
import { getArticleData } from './wikipedia-api.js';
import { getWordPair, getNewWordPair } from './word-pairs.js';

// ─── Schema Definitions ─────────────────────────────────────────────

class PlayerState extends Schema {}
defineTypes(PlayerState, {
  x: 'number',
  y: 'number',
  z: 'number',
  rotationY: 'number',
  color: 'number',
  currentArticle: 'string',
});

class LibraryRoomState extends Schema {}
defineTypes(LibraryRoomState, {
  players: { map: PlayerState },
});

// ─── Room ────────────────────────────────────────────────────────────

export class LibraryRoom extends Room {
  onCreate(options) {
    this.maxClients = MAX_PLAYERS;
    this.setState(new LibraryRoomState());
    this.state.players = new MapSchema();

    this.colorCounter = 0;

    // Per-player journey tracking (not synced via schema — sent via messages)
    // Map<sessionId, { start, target, optimalHops, path[], startTime }>
    this.journeys = new Map();

    // ─── Message Handlers ─────────────────────────────────────────

    this.onMessage('position', (client, data) => {
      const player = this.state.players.get(client.sessionId);
      if (!player) return;
      player.x = data.x || 0;
      player.y = data.y || 0;
      player.z = data.z || 0;
      player.rotationY = data.rotationY || 0;
    });

    this.onMessage('enterPortal', async (client, data) => {
      const { targetArticle } = data;
      if (!targetArticle) return;

      const player = this.state.players.get(client.sessionId);
      if (!player) return;

      try {
        const articleData = await getArticleData(targetArticle);
        if (articleData) {
          player.currentArticle = articleData.title;
          player.x = 0;
          player.y = 4;
          player.z = 0;
          client.send('articleData', articleData);

          // Track journey
          const journey = this.journeys.get(client.sessionId);
          if (journey) {
            journey.path.push(articleData.title);

            // Check win condition — normalize for comparison
            if (this._titlesMatch(articleData.title, journey.target)) {
              const elapsed = Date.now() - journey.startTime;
              const hops = journey.path.length - 1; // don't count the start
              client.send('journeyComplete', {
                path: journey.path,
                hops,
                timeMs: elapsed,
                optimalHops: journey.optimalHops,
                start: journey.start,
                target: journey.target,
              });
            }
          }
        } else {
          client.send('articleError', { message: `Article not found: ${targetArticle}` });
        }
      } catch (e) {
        console.error(`[Library] Error loading article "${targetArticle}":`, e.message);
        client.send('articleError', { message: 'Failed to load article' });
      }
    });

    this.onMessage('requestNewPair', async (client) => {
      const journey = this.journeys.get(client.sessionId);
      const currentTarget = journey ? journey.target : null;
      await this._assignWordPair(client, currentTarget);
    });

    this.onMessage('chat', (client, data) => {
      if (!data.message || data.message.length > 140) return;
      const babelText = babelify(data.message, client.sessionId);
      this.broadcast('chatBubble', {
        sessionId: client.sessionId,
        babelText,
      });
    });

    console.log('[LibraryRoom] Created');
  }

  async onJoin(client, options) {
    const player = new PlayerState();
    player.x = 0;
    player.y = 4;
    player.z = 0;
    player.rotationY = 0;
    player.color = PLAYER_COLORS[this.colorCounter % PLAYER_COLORS.length];
    player.currentArticle = '';
    this.colorCounter++;

    this.state.players.set(client.sessionId, player);

    client.send('initState', {
      sessionId: client.sessionId,
      color: player.color,
    });

    // Assign a word pair and load the start article
    await this._assignWordPair(client, null);

    console.log(`[Library] Player joined: ${client.sessionId} (${this.clients.length} total)`);
  }

  async _assignWordPair(client, currentTarget) {
    const pair = getNewWordPair(currentTarget);

    // Start the journey
    this.journeys.set(client.sessionId, {
      start: pair.start,
      target: pair.target,
      optimalHops: pair.optimalHops,
      path: [pair.start],
      startTime: Date.now(),
    });

    // Send word pair to client
    client.send('wordPair', {
      start: pair.start,
      target: pair.target,
      optimalHops: pair.optimalHops,
    });

    // Load and send the start article
    const player = this.state.players.get(client.sessionId);
    try {
      const articleData = await getArticleData(pair.start);
      if (articleData) {
        if (player) {
          player.currentArticle = articleData.title;
          player.x = 0;
          player.y = 4;
          player.z = 0;
        }
        client.send('articleData', articleData);
      } else {
        client.send('articleError', { message: `Start article not found: ${pair.start}` });
      }
    } catch (e) {
      console.error(`[Library] Error loading start article:`, e.message);
      client.send('articleError', { message: 'Failed to load start article' });
    }
  }

  _titlesMatch(a, b) {
    const normalize = (s) => s.toLowerCase().replace(/_/g, ' ').trim();
    return normalize(a) === normalize(b);
  }

  onLeave(client) {
    this.state.players.delete(client.sessionId);
    this.journeys.delete(client.sessionId);
    console.log(`[Library] Player left: ${client.sessionId} (${this.clients.length} total)`);
  }

  onDispose() {
    console.log('[LibraryRoom] Disposed');
  }
}
