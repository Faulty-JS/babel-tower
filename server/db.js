/**
 * Persistence layer using JSON file storage.
 * Saves tower state to disk so it survives server restarts.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DATA_DIR = join(__dirname, '..', 'data');
const DB_FILE = join(DATA_DIR, 'tower.json');

const DEFAULT_STATE = {
  currentHeight: 5,
  totalSolves: 0,
  growthPoints: [],
  history: [],
};

export function loadTowerState() {
  try {
    if (existsSync(DB_FILE)) {
      const raw = readFileSync(DB_FILE, 'utf-8');
      return JSON.parse(raw);
    }
  } catch (e) {
    console.warn('[DB] Failed to load tower state, starting fresh:', e.message);
  }
  return null;
}

export function saveTowerState(state) {
  try {
    if (!existsSync(DATA_DIR)) {
      mkdirSync(DATA_DIR, { recursive: true });
    }
    const data = {
      currentHeight: state.currentHeight,
      totalSolves: state.totalSolves,
      growthPoints: state.growthPoints,
      history: (state.history || []).slice(-500), // keep last 500 events
    };
    writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('[DB] Failed to save tower state:', e.message);
  }
}
