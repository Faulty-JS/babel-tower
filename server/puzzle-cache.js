/**
 * Puzzle Cache — caches API responses to avoid rate limits.
 */

const cache = new Map();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

export function getCached(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.time > CACHE_TTL) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

export function setCache(key, data) {
  cache.set(key, { data, time: Date.now() });
}

// Pre-fetch pool: stores multiple items so puzzles are instant
const pools = new Map();

export function getFromPool(type) {
  const pool = pools.get(type);
  if (!pool || pool.length === 0) return null;
  return pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
}

export function addToPool(type, item) {
  if (!pools.has(type)) pools.set(type, []);
  const pool = pools.get(type);
  if (pool.length < 50) pool.push(item);
}

export function poolSize(type) {
  return pools.has(type) ? pools.get(type).length : 0;
}
