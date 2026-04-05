/**
 * Shared constants used by both client and server.
 * Import from here to keep values in sync.
 */

// ─── Tower Geometry ──────────────────────────────────────────────────
export const TOWER_RADIUS = 40;
export const FLOOR_HEIGHT = 12;
export const INITIAL_FLOORS = 5;        // Floors the tower starts with
export const MAX_FLOORS = 200;          // Upper bound
export const TAPER_PER_FLOOR = 0.5;     // Radius shrinks by this per floor
export const SPIRAL_SEGMENTS = 12;      // Steps per ramp segment

// ─── Player ──────────────────────────────────────────────────────────
export const PLAYER_HEIGHT = 8;
export const MOVE_SPEED = 50;
export const JUMP_FORCE = 30;
export const GRAVITY = -80;
export const MOUSE_SENSITIVITY = 0.002;
export const PLAYER_COLORS = [
  0xff6b6b, 0x4ecdc4, 0x45b7d1, 0xf9ca24,
  0x6c5ce7, 0xa8e6cf, 0xfd9644, 0xee5a24,
  0x7bed9f, 0xe056fd, 0x0abde3, 0xfeca57,
];

// ─── Growth Points ───────────────────────────────────────────────────
export const GROWTH_POINTS_PER_FLOOR = 4;
export const GROWTH_POINT_RADIUS = 1.5;
export const PUZZLE_INTERACT_DISTANCE = 8; // How close you need to be

// ─── Puzzle ──────────────────────────────────────────────────────────
export const PUZZLE_TYPES = [
  'trivia',           // OpenTriviaDB — multiple choice questions
  'image_jigsaw',     // Wikipedia image — rearrange tiles
  'glyph_trace',      // Connect dots in correct order on a grid
  'word_excavation',  // Find a hidden word in a letter grid
  'fragment_assembly', // Drag/rotate pieces to reconstruct a shape
  'geography',        // REST Countries — flag/capital matching
  'pattern_complete',  // Complete a visual pattern sequence
];

// Difficulty scales with floor number
export const PUZZLE_DIFFICULTY = {
  easy:   { minFloor: 0,  maxFloor: 5  },
  medium: { minFloor: 3,  maxFloor: 12 },
  hard:   { minFloor: 8,  maxFloor: 999 },
};

// ─── Tower Growth ────────────────────────────────────────────────────
export const SOLVES_PER_GROWTH = 3;     // Puzzles solved to trigger growth
export const GROWTH_ANIMATION_MS = 2000;

// ─── Chat / Babel ────────────────────────────────────────────────────
export const CHAT_BUBBLE_DURATION_MS = 5000;
export const MAX_CHAT_LENGTH = 140;

// ─── ASCII Shader ────────────────────────────────────────────────────
export const ASCII_CHAR_SIZE = 8.0;

// ─── Network ─────────────────────────────────────────────────────────
export const SERVER_PORT = 3456;
export const TICK_RATE = 20;            // Server updates per second
export const MAX_PLAYERS = 50;
