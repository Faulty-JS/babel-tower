/**
 * Library of Babel text generator.
 *
 * Deterministic: the same seed always produces the same text.
 * Used for:
 *   1. Ambient inscriptions on tower walls
 *   2. Babel chat — player messages get transformed into gibberish
 *
 * This is a lightweight reimplementation of the Library of Babel algorithm.
 * The real Library contains every possible 3200-character page using 29 chars
 * (a-z, space, comma, period). We use a seeded PRNG to simulate this.
 */

// The Babel alphabet: 26 lowercase letters + space + comma + period
const BABEL_CHARS = 'abcdefghijklmnopqrstuvwxyz ,.'

/**
 * Simple seeded PRNG (mulberry32)
 */
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Hash a string into a 32-bit integer seed.
 */
function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return hash;
}

/**
 * Generate a page of Babel text from a seed string.
 * @param {string} seed - Any string (coordinates, player input, etc.)
 * @param {number} length - Number of characters to generate
 * @returns {string} Babel text
 */
export function generateBabelText(seed, length = 80) {
  const rng = mulberry32(hashString(seed));
  let text = '';
  for (let i = 0; i < length; i++) {
    text += BABEL_CHARS[Math.floor(rng() * BABEL_CHARS.length)];
  }
  return text;
}

/**
 * Transform a player's chat message into Babel gibberish.
 * The output length matches the input length so it "looks" like
 * the player said something of that size.
 *
 * Deterministic: same message always produces the same Babel text.
 * Different messages produce different text.
 *
 * @param {string} message - The player's original message
 * @param {string} sessionId - Player's session ID for extra entropy
 * @returns {string} Babel gibberish of the same length
 */
export function babelify(message, sessionId = '') {
  return generateBabelText(message + sessionId, message.length);
}

/**
 * Generate ambient wall inscription text for a tower coordinate.
 * @param {number} floor - Floor number
 * @param {number} angle - Angle around the tower (radians)
 * @param {number} length - Text length
 * @returns {string} Inscription text
 */
export function getWallInscription(floor, angle, length = 120) {
  const seed = `wall:${floor}:${angle.toFixed(2)}`;
  return generateBabelText(seed, length);
}
