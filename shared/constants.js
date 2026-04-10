/**
 * Shared constants for the rhythm party game.
 */

// ─── Server ──────────────────────────────────────────────
export const SERVER_PORT = 3456;
export const MAX_PLAYERS = 99;
export const TICK_RATE = 20; // Hz

// ─── Rhythm ──────────────────────────────────────────────
export const STARTING_BPM = 100;
export const BPM_INCREMENT = 8;      // per round
export const MAX_BPM = 200;
export const BEATS_PER_BAR = 4;      // 4/4 time
export const SUBDIVISIONS = 8;       // 8th notes per bar (2 per beat)
export const MIN_PLAYERS_TO_START = 1;
export const COUNTDOWN_SECONDS = 3;
export const RESULTS_DURATION_MS = 3000;

// ─── Moves ───────────────────────────────────────────────
// 0 = empty, 1-4 = directional
export const MOVE = {
  NONE: 0,
  UP: 1,
  DOWN: 2,
  LEFT: 3,
  RIGHT: 4,
};

export const MOVE_NAMES = ['', 'UP', 'DOWN', 'LEFT', 'RIGHT'];
export const MOVE_KEYS = {
  ArrowUp: MOVE.UP,    w: MOVE.UP,    W: MOVE.UP,
  ArrowDown: MOVE.DOWN, s: MOVE.DOWN,  S: MOVE.DOWN,
  ArrowLeft: MOVE.LEFT, a: MOVE.LEFT,  A: MOVE.LEFT,
  ArrowRight: MOVE.RIGHT, d: MOVE.RIGHT, D: MOVE.RIGHT,
};

// ─── Game Phases ─────────────────────────────────────────
export const PHASE = {
  LOBBY: 'lobby',
  COUNTDOWN: 'countdown',
  CALLING_BAR1: 'calling_bar1',
  CALLING_BAR2: 'calling_bar2',
  RESPONDING: 'responding',
  JUDGING: 'judging',
  RESULTS: 'results',
  GAME_OVER: 'game_over',
};

// ─── Colors (neon palette) ───────────────────────────────
export const NEON_COLORS = [
  '#FF1493', // deep pink
  '#00FF87', // spring green
  '#00D4FF', // cyan
  '#FFE600', // yellow
  '#FF6B35', // orange
  '#B24BF3', // purple
  '#FF3366', // hot pink
  '#39FF14', // neon green
  '#FF5F1F', // neon orange
  '#00FFFF', // aqua
  '#FF00FF', // magenta
  '#7FFF00', // chartreuse
  '#FF4500', // red-orange
  '#1E90FF', // dodger blue
  '#FFD700', // gold
];
