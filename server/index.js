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
import { LibraryRoom } from './library-room.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CLIENT_DIR = join(__dirname, '..');

// ─── Express ─────────────────────────────────────────────────────────
const app = express();

// CORS
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Static files
app.use(express.static(CLIENT_DIR, {
  maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0,
  etag: true,
}));

// ─── Colyseus ────────────────────────────────────────────────────────
const httpServer = createServer(app);
const gameServer = new Server({
  transport: new WebSocketTransport({ server: httpServer }),
});

gameServer.define('library', LibraryRoom);

// ─── Start ───────────────────────────────────────────────────────────
const PORT = process.env.PORT || SERVER_PORT;
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`[Babel] Server listening on http://0.0.0.0:${PORT}`);
  console.log(`[Babel] The Library of Babel is open.`);
});

process.on('SIGINT', () => {
  console.log('\n[Babel] Shutting down...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  process.exit(0);
});
