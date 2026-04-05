/**
 * Network Client — Colyseus WebSocket connection to the game server.
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
    this.onTowerGrow = null;
    this.onChatBubble = null;
    this.onPuzzleReceived = null;
    this.onPuzzleResult = null;
    this.onInitState = null;
    this.onGrowthPointsUpdate = null;

    // Position send throttle
    this._lastSendTime = 0;
    this._sendInterval = 1000 / TICK_RATE;
  }

  /**
   * Connect to the game server and join the tower room.
   */
  async connect(serverUrl) {
    try {
      // Colyseus client loaded from CDN as global
      this.client = new Colyseus.Client(serverUrl);
      this.room = await this.client.joinOrCreate('tower');
      this.sessionId = this.room.sessionId;
      this.connected = true;

      console.log('[Network] Connected! Session:', this.sessionId);

      // ─── State change listeners ─────────────────────────────────
      this.room.state.players.onAdd((player, sessionId) => {
        if (sessionId === this.sessionId) return;
        if (this.onPlayerJoin) this.onPlayerJoin(sessionId, player.color);

        player.onChange(() => {
          if (this.onPlayerMove) {
            this.onPlayerMove(sessionId, player.x, player.y, player.z, player.rotationY);
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

      this.room.onMessage('puzzleData', (data) => {
        if (this.onPuzzleReceived) this.onPuzzleReceived(data);
      });

      this.room.onMessage('puzzleResult', (data) => {
        if (this.onPuzzleResult) this.onPuzzleResult(data);
      });

      this.room.onMessage('towerGrew', (data) => {
        if (this.onTowerGrow) this.onTowerGrow(data);
      });

      this.room.onMessage('chatBubble', (data) => {
        if (this.onChatBubble) this.onChatBubble(data);
      });

      this.room.onMessage('growthPointsUpdate', (data) => {
        if (this.onGrowthPointsUpdate) this.onGrowthPointsUpdate(data);
      });

      this.room.onLeave((code) => {
        console.log('[Network] Left room, code:', code);
        this.connected = false;
        // Auto-reconnect after a delay
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

  /**
   * Send player position (throttled).
   */
  sendPosition(x, y, z, rotationY) {
    if (!this.room || !this.connected) return;
    const now = Date.now();
    if (now - this._lastSendTime < this._sendInterval) return;
    this._lastSendTime = now;
    this.room.send('position', { x, y, z, rotationY });
  }

  requestPuzzle(growthPointId) {
    if (!this.room) return;
    this.room.send('requestPuzzle', { growthPointId });
  }

  submitSolution(growthPointId, answer) {
    if (!this.room) return;
    this.room.send('submitSolution', { growthPointId, answer });
  }

  cancelPuzzle() {
    if (!this.room) return;
    this.room.send('cancelPuzzle', {});
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
