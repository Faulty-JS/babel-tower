/**
 * Content Pool — Centralized API fetching and caching for puzzle content.
 *
 * Fetches from Wikipedia, Wikidata, REST Countries, OpenTriviaDB.
 * Maintains pools of pre-fetched content so puzzle generation is instant.
 * Falls back to curated static lists if APIs are down.
 */

import { getWallInscription } from '../shared/babel-text.js';

// ─── Static Fallback Lists ──────────────────────────────────────────

const FALLBACK_SENTENCES = [
  "The Great Library of Alexandria was one of the largest libraries of the ancient world",
  "A neutron star is the collapsed core of a massive supergiant star",
  "The Rosetta Stone was carved in 196 BC with a decree in three scripts",
  "The Voyager 1 spacecraft is the most distant human-made object from Earth",
  "Cuneiform is one of the earliest known systems of writing",
  "The speed of light in a vacuum is approximately 299792 kilometers per second",
  "The Great Wall of China stretches over 13000 miles across northern China",
  "DNA carries the genetic instructions for the development of all living organisms",
  "The Mariana Trench is the deepest known point in the ocean at nearly 11000 meters",
  "Stonehenge was built in several stages over a period of about 1500 years",
  "The human brain contains approximately 86 billion neurons",
  "The Amazon Rainforest produces about 20 percent of the worlds oxygen",
  "Pi is an irrational number that begins 3.14159 and never repeats",
  "The Andromeda Galaxy is the nearest large galaxy to the Milky Way",
  "Ancient Egyptians used hieroglyphics as their formal writing system",
  "The periodic table contains 118 confirmed chemical elements",
  "Mount Everest is the tallest mountain above sea level at 8849 meters",
  "The Dead Sea is one of the saltiest bodies of water on Earth",
  "Pluto was reclassified as a dwarf planet in 2006 by the International Astronomical Union",
  "The aurora borealis is caused by charged particles from the sun striking the atmosphere",
  "Archimedes discovered the principle of buoyancy while taking a bath",
  "The Colosseum in Rome could hold between 50000 and 80000 spectators",
  "Black holes have gravitational fields so strong that nothing can escape them",
  "The Silk Road was an ancient network of trade routes connecting East and West",
  "Photosynthesis converts sunlight into chemical energy stored in glucose",
  "The deepest point on dry land is the shore of the Dead Sea",
  "Coral reefs support approximately 25 percent of all marine species",
  "The first known use of zero as a number was in ancient India",
  "Galileo Galilei was the first to observe the moons of Jupiter through a telescope",
  "The pangolin is the worlds most trafficked mammal",
  "Obsidian is volcanic glass formed when lava cools rapidly",
  "The Library of Congress is the largest library in the world by shelf space",
  "Tardigrades can survive extreme temperatures radiation and even the vacuum of space",
  "The oldest known cave paintings are over 40000 years old",
  "A single bolt of lightning contains enough energy to toast 100000 slices of bread",
  "The Great Barrier Reef is the largest living structure visible from space",
  "Mercury is the smallest planet in our solar system",
  "The Hanging Gardens of Babylon were one of the Seven Wonders of the Ancient World",
  "Octopuses have three hearts and blue blood",
  "The Fibonacci sequence appears throughout nature in shells spirals and flowers",
  "Antarctica contains about 70 percent of the worlds fresh water as ice",
  "The speed of sound in air is approximately 343 meters per second",
  "Mesopotamia is often called the cradle of civilization",
  "Venus rotates in the opposite direction to most planets in the solar system",
  "The human body contains enough iron to make a small nail",
  "The oldest known living tree is over 5000 years old",
  "Quantum entanglement allows particles to be connected across any distance",
  "The Pyramids of Giza are the only surviving Wonder of the Ancient World",
  "Honey never spoils and edible honey has been found in ancient Egyptian tombs",
  "The rings of Saturn are made mostly of ice particles and rocky debris",
];

const FALLBACK_TITLES = [
  "Andromeda Galaxy", "Rosetta Stone", "Fibonacci Sequence", "Hammurabi",
  "Sagrada Familia", "Pangaea", "Nikola Tesla", "Machu Picchu",
  "Kepler 442b", "Voyager One", "Cuneiform", "Archimedes",
  "Stonehenge", "Aurora Borealis", "Colosseum", "Black Hole",
  "Silk Road", "Dead Sea", "Coral Reef", "Obsidian",
  "Galileo", "Mercury", "Babylon", "Ptolemy",
  "Pleiades", "Orion Nebula", "Quasar", "Pulsar",
  "Entropy", "Helix Nebula", "Cygnus", "Eclipse",
  "Zenith", "Equinox", "Solstice", "Magnetar",
  "Tundra", "Caldera", "Basalt", "Granite",
  "Obelisk", "Ziggurat", "Aqueduct", "Pantheon",
  "Labyrinth", "Oracle", "Sphinx", "Pharaoh",
  "Alchemy", "Chrysalis", "Parallax", "Nexus",
];

// ─── Pool Storage ───────────────────────────────────────────────────

const pools = {
  sentences: [],
  titles: [],
};

const POOL_MIN = 10;
const REFILL_INTERVAL = 30_000; // 30 seconds

let refillTimer = null;

// ─── API Fetchers ───────────────────────────────────────────────────

async function fetchWikipediaSentences(count = 5) {
  const results = [];
  const fetches = Array.from({ length: count }, () =>
    fetch('https://en.wikipedia.org/api/rest_v1/page/random/summary')
      .then(r => r.json())
      .then(data => {
        if (data.extract) {
          // Take first sentence only
          const sentence = data.extract.split('. ')[0].replace(/\.$/, '');
          if (sentence.length >= 20 && sentence.length <= 120) {
            results.push({ sentence, title: data.title });
          }
        }
      })
      .catch(() => {})
  );
  await Promise.all(fetches);
  return results;
}

// ─── Pool Management ────────────────────────────────────────────────

async function refillPools() {
  try {
    if (pools.sentences.length < POOL_MIN) {
      const items = await fetchWikipediaSentences(8);
      for (const item of items) {
        if (pools.sentences.length < 50) {
          pools.sentences.push(item);
        }
      }
    }
    if (pools.titles.length < POOL_MIN) {
      // Extract titles from sentence pool or fetch more
      const items = await fetchWikipediaSentences(5);
      for (const item of items) {
        if (pools.titles.length < 50) {
          pools.titles.push(item.title);
        }
        if (pools.sentences.length < 50) {
          pools.sentences.push(item);
        }
      }
    }
  } catch (e) {
    // Silent — fallbacks will handle it
  }
}

// ─── Public API ─────────────────────────────────────────────────────

/**
 * Get a random sentence from the pool or fallback.
 * Returns { sentence, title } or just { sentence } from fallback.
 */
export function getRandomSentence() {
  if (pools.sentences.length > 0) {
    const idx = Math.floor(Math.random() * pools.sentences.length);
    return pools.sentences.splice(idx, 1)[0];
  }
  const sentence = FALLBACK_SENTENCES[Math.floor(Math.random() * FALLBACK_SENTENCES.length)];
  return { sentence, title: 'Ancient Knowledge' };
}

/**
 * Get a random short title from the pool or fallback.
 */
export function getRandomTitle() {
  if (pools.titles.length > 0) {
    const idx = Math.floor(Math.random() * pools.titles.length);
    return pools.titles.splice(idx, 1)[0];
  }
  return FALLBACK_TITLES[Math.floor(Math.random() * FALLBACK_TITLES.length)];
}

/**
 * Get a short title (max chars). Tries pool, then fallback, filtering by length.
 */
export function getShortTitle(maxChars = 8) {
  // Try pool first
  for (let i = 0; i < pools.titles.length; i++) {
    const t = pools.titles[i].replace(/[^a-zA-Z]/g, '');
    if (t.length >= 4 && t.length <= maxChars) {
      pools.titles.splice(i, 1);
      return t.toUpperCase();
    }
  }
  // Fallback: pick short ones
  const shorts = FALLBACK_TITLES.filter(t => {
    const clean = t.replace(/[^a-zA-Z]/g, '');
    return clean.length >= 4 && clean.length <= maxChars;
  });
  if (shorts.length > 0) {
    const t = shorts[Math.floor(Math.random() * shorts.length)];
    return t.replace(/[^a-zA-Z]/g, '').toUpperCase();
  }
  return 'BABEL';
}

/**
 * Get wall text - 90% Babel gibberish, 10% real sentence.
 */
export function getWallText(floor, angle) {
  if (Math.random() < 0.1 && pools.sentences.length > 0) {
    const item = pools.sentences[Math.floor(Math.random() * pools.sentences.length)];
    return item.sentence.toLowerCase();
  }
  return getWallInscription(floor, angle);
}

/**
 * Initialize content pool. Call on server start.
 */
export async function initContentPool() {
  console.log('[ContentPool] Initializing...');
  await refillPools();
  console.log(`[ContentPool] Ready: ${pools.sentences.length} sentences, ${pools.titles.length} titles`);

  // Background refill
  refillTimer = setInterval(refillPools, REFILL_INTERVAL);
}

export function shutdownContentPool() {
  if (refillTimer) clearInterval(refillTimer);
}
