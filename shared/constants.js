/**
 * Shared constants used by both client and server.
 */

// ─── Room Geometry ──────────────────────────────────────────────────
export const BASE_ROOM_RADIUS = 60;       // Default room radius (big rooms)
export const ROOM_HEIGHT = 40;            // Wall height (tall for platforming)
export const ROOM_SIDES = 6;             // Hexagonal rooms (Borges-style)

// ─── Player ─────────────────────────────────────────────────────────
export const PLAYER_HEIGHT = 3;
export const MOVE_SPEED = 22;
export const JUMP_FORCE = 22;
export const GRAVITY = -65;
export const MOUSE_SENSITIVITY = 0.002;
export const PLAYER_RADIUS = 1.0;
export const PLAYER_COLORS = [
  0xff6b6b, 0x4ecdc4, 0x45b7d1, 0xf9ca24,
  0x6c5ce7, 0xa8e6cf, 0xfd9644, 0xee5a24,
  0x7bed9f, 0xe056fd, 0x0abde3, 0xfeca57,
];

// ─── Portals ────────────────────────────────────────────────────────
export const PORTAL_WIDTH = 4;
export const PORTAL_HEIGHT = 6;
export const PORTAL_TRIGGER_DISTANCE = 4;  // Walk into portal to enter (3D distance)
export const MAX_PORTALS_PER_ROOM = 10;
export const MIN_PORTALS_PER_ROOM = 4;

// ─── Wikipedia ──────────────────────────────────────────────────────
export const WIKI_LINKS_PER_ROOM = 8;     // Target number of links shown as portals
export const ARTICLE_CACHE_TTL = 3600000; // 1 hour in ms
export const MAX_CACHE_SIZE = 10000;

// ─── Room Categories (keyword-to-environment mapping) ───────────────
export const ROOM_CATEGORIES = {
  nature:     { keywords: ['ocean', 'mountain', 'forest', 'river', 'lake', 'tree', 'animal', 'plant', 'bird', 'fish', 'flower', 'garden', 'island', 'desert', 'jungle', 'sea', 'water', 'earth', 'rain', 'wind'], color: 0x4a7c59, ambientColor: 0x88aa88 },
  science:    { keywords: ['atom', 'star', 'cell', 'quantum', 'energy', 'electron', 'molecule', 'physics', 'chemical', 'biology', 'dna', 'gene', 'theory', 'experiment', 'particle', 'wavelength', 'formula', 'equation'], color: 0x4a6a8c, ambientColor: 0x8888cc },
  history:    { keywords: ['war', 'king', 'empire', 'ancient', 'dynasty', 'battle', 'century', 'revolution', 'medieval', 'colonial', 'roman', 'emperor', 'kingdom', 'civilization', 'conquest'], color: 0x8c7a5c, ambientColor: 0xaa9977 },
  art:        { keywords: ['music', 'painting', 'dance', 'film', 'theater', 'novel', 'poem', 'sculpture', 'artist', 'composer', 'symphony', 'gallery', 'canvas', 'opera', 'literary'], color: 0x8c5c6a, ambientColor: 0xcc8899 },
  technology: { keywords: ['computer', 'engine', 'digital', 'machine', 'software', 'internet', 'algorithm', 'robot', 'program', 'network', 'data', 'code', 'system', 'device', 'electronic'], color: 0x5c6a8c, ambientColor: 0x7799bb },
  geography:  { keywords: ['city', 'country', 'island', 'capital', 'population', 'continent', 'region', 'province', 'territory', 'border', 'coast', 'state', 'nation', 'republic', 'district'], color: 0x6a8c5c, ambientColor: 0x99aa77 },
  default:    { keywords: [], color: 0x7a7a6a, ambientColor: 0x999988 },
};

// ─── Chat / Babel ───────────────────────────────────────────────────
export const CHAT_BUBBLE_DURATION_MS = 5000;
export const MAX_CHAT_LENGTH = 140;

// ─── Network ────────────────────────────────────────────────────────
export const SERVER_PORT = 3456;
export const TICK_RATE = 20;
export const MAX_PLAYERS = 50;
