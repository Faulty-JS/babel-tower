/**
 * Network Client — Colyseus WebSocket connection to the Library of Babel.
 */

import { TICK_RATE } from '../shared/constants.js';

export class NetworkClient {
  constructor() {
    this.room = null;
    this.client = null;
    this.sessionId = null;
    this.playerColor = 0xffffff;
    this.connected = false;

    // Callbacks
    this.onPlayerJoin = null;
    this.onPlayerLeave = null;
    this.onPlayerMove = null;
    this.onChatBubble = null;
    this.onInitState = null;
    this.onArticleData = null;
    this.onArticleError = null;
    this.onWordPair = null;
    this.onJourneyComplete = null;
    this.onPlayerArticleChange = null;

    // Position send throttle
    this._lastSendTime = 0;
    this._sendInterval = 1000 / TICK_RATE;
  }

  async connect(serverUrl) {
    try {
      this.client = new Colyseus.Client(serverUrl);
      this.room = await this.client.joinOrCreate('library');
      this.sessionId = this.room.sessionId;
      this.connected = true;

      console.log('[Network] Connected! Session:', this.sessionId);

      // ─── State change listeners ─────────────────────────────────
      this.room.state.players.onAdd((player, sessionId) => {
        if (sessionId === this.sessionId) return;
        if (this.onPlayerJoin) this.onPlayerJoin(sessionId, player.color);

        let lastArticle = player.currentArticle;
        player.onChange(() => {
          if (this.onPlayerMove) {
            this.onPlayerMove(sessionId, player.x, player.y, player.z, player.rotationY);
          }
          if (player.currentArticle !== lastArticle) {
            lastArticle = player.currentArticle;
            if (this.onPlayerArticleChange) {
              this.onPlayerArticleChange(sessionId, player.currentArticle);
            }
          }
        });
      });

      this.room.state.players.onRemove((player, sessionId) => {
        if (this.onPlayerLeave) this.onPlayerLeave(sessionId);
      });

      // ─── Message handlers ───────────────────────────────────────
      this.room.onMessage('initState', (data) => {
        this.sessionId = data.sessionId;
        this.playerColor = data.color;
        if (this.onInitState) this.onInitState(data);
      });

      this.room.onMessage('articleData', (data) => {
        if (this.onArticleData) this.onArticleData(data);
      });

      this.room.onMessage('articleError', (data) => {
        if (this.onArticleError) this.onArticleError(data);
      });

      this.room.onMessage('wordPair', (data) => {
        if (this.onWordPair) this.onWordPair(data);
      });

      this.room.onMessage('journeyComplete', (data) => {
        if (this.onJourneyComplete) this.onJourneyComplete(data);
      });

      this.room.onMessage('chatBubble', (data) => {
        if (this.onChatBubble) this.onChatBubble(data);
      });

      this.room.onLeave((code) => {
        console.log('[Network] Left room, code:', code);
        this.connected = false;
        if (code !== 1000) {
          setTimeout(() => this.connect(serverUrl), 3000);
        }
      });

      this.room.onError((code, message) => {
        console.error('[Network] Room error:', code, message);
      });

      return true;
    } catch (e) {
      console.warn('[Network] Connection failed:', e.message);
      this.connected = false;
      return false;
    }
  }

  sendPosition(x, y, z, rotationY) {
    if (!this.room || !this.connected) return;
    const now = Date.now();
    if (now - this._lastSendTime < this._sendInterval) return;
    this._lastSendTime = now;
    this.room.send('position', { x, y, z, rotationY });
  }

  enterPortal(targetArticle) {
    if (!this.room) return;
    this.room.send('enterPortal', { targetArticle });
  }

  requestNewPair() {
    if (!this.room) return;
    this.room.send('requestNewPair', {});
  }

  sendChat(message) {
    if (!this.room) return;
    this.room.send('chat', { message });
  }

  disconnect() {
    if (this.room) {
      this.room.leave();
      this.connected = false;
    }
  }
}
