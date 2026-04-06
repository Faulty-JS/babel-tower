/**
 * Article Cache — In-memory cache for Wikipedia article data.
 */

import { ARTICLE_CACHE_TTL, MAX_CACHE_SIZE } from '../shared/constants.js';

class ArticleCache {
  constructor() {
    this.cache = new Map();
  }

  get(title) {
    const key = this._normalize(title);
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > ARTICLE_CACHE_TTL) {
      this.cache.delete(key);
      return null;
    }
    return entry.data;
  }

  set(title, data) {
    // Evict oldest if at capacity
    if (this.cache.size >= MAX_CACHE_SIZE) {
      const oldest = this.cache.keys().next().value;
      this.cache.delete(oldest);
    }
    this.cache.set(this._normalize(title), {
      data,
      timestamp: Date.now(),
    });
  }

  has(title) {
    return this.get(title) !== null;
  }

  get size() {
    return this.cache.size;
  }

  _normalize(title) {
    return title.replace(/ /g, '_').toLowerCase();
  }
}

export const articleCache = new ArticleCache();
