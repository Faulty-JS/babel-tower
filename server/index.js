/**
 * Babel — Game Server
 *
 * Express serves static files, Colyseus handles WebSocket multiplayer.
 */

import express from 'express';
import { createServer } from 'http';
import colyseus from 'colyseus';
const { Server } = colyseus;
import wsTransport from '@colyseus/ws-transport';
const { WebSocketTransport } = wsTransport;
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { SERVER_PORT } from '../shared/constants.js';
import { TowerRoom } from './tower-room.js';
import { TowerState } from './tower-state.js';
import { loadTowerState, saveTowerState } from './db.js';
import { prewarmCache } from './puzzle-validator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CLIENT_DIR = join(__dirname, '..');

// ─── Load persisted tower state ─────────────────────────────────────
const savedState = loadTowerState();
const tower = new TowerState();
if (savedState) {
  tower.currentHeight = savedState.currentHeight;
  tower.totalSolves = savedState.totalSolves;
  tower.growthPoints = savedState.growthPoints;
  tower.history = savedState.history || [];
  console.log(`[Babel] Loaded tower state: height=${tower.currentHeight}, solves=${tower.totalSolves}`);
} else {
  console.log('[Babel] Starting with fresh tower state');
}

// Ensure we have active growth points
if (tower.growthPoints.filter(g => g.active).length === 0) {
  tower.generateGrowthPoints();
}

// ─── Express ─────────────────────────────────────────────────────────
const app = express();

// CORS — allow Cloudflare Pages origin to connect
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Static files (also served from Railway as fallback)
app.use(express.static(CLIENT_DIR, {
  maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0,
  etag: true,
}));

// API endpoint to get tower state (for initial load without WebSocket)
app.get('/api/tower', (req, res) => {
  res.json({
    towerHeight: tower.currentHeight,
    totalSolves: tower.totalSolves,
    growthPoints: tower.growthPoints.filter(g => g.active),
  });
});

// ─── Colyseus ────────────────────────────────────────────────────────
const httpServer = createServer(app);
const gameServer = new Server({
  transport: new WebSocketTransport({ server: httpServer }),
});

// Store tower reference globally so the room can access it
globalThis.__babelTower = tower;
gameServer.define('tower', TowerRoom);

// ─── Start ───────────────────────────────────────────────────────────
// Railway provides PORT env var; fall back to constants
const PORT = process.env.PORT || SERVER_PORT;
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`[Babel] Server listening on http://0.0.0.0:${PORT}`);
  console.log(`[Babel] Tower height: ${tower.currentHeight} floors`);
  console.log(`[Babel] Active growth points: ${tower.growthPoints.filter(g => g.active).length}`);

  // Pre-warm puzzle cache in background
  prewarmCache();
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n[Babel] Shutting down...');
  saveTowerState(tower);
  process.exit(0);
});

process.on('SIGTERM', () => {
  saveTowerState(tower);
  process.exit(0);
});
