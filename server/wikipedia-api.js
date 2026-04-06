/**
 * Wikipedia API — Fetches article data and links from Wikipedia.
 * All fetching happens server-side to handle CORS and caching.
 */

import { articleCache } from './article-cache.js';
import { WIKI_LINKS_PER_ROOM } from '../shared/constants.js';

const USER_AGENT = 'BabelGame/0.1 (multiplayer-browser-game; educational)';

/**
 * Fetch article summary (extract + thumbnail) from Wikipedia REST API.
 */
async function fetchSummary(title) {
  const encoded = encodeURIComponent(title.replace(/ /g, '_'));
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encoded}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
  });
  if (!res.ok) return null;
  return res.json();
}

/**
 * Fetch article links from Wikipedia Action API.
 * Returns internal links from the article, filtered for quality.
 */
async function fetchLinks(title) {
  const encoded = encodeURIComponent(title.replace(/ /g, '_'));
  const url = `https://en.wikipedia.org/w/api.php?action=parse&page=${encoded}&prop=links&format=json&origin=*`;
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
  });
  if (!res.ok) return [];
  const data = await res.json();

  if (!data.parse || !data.parse.links) return [];

  // Filter: only namespace 0 (main articles) that exist
  return data.parse.links
    .filter(link => link.ns === 0 && ('exists' in link))
    .map(link => link['*'])
    .filter(title => !isFilteredArticle(title));
}

/**
 * Filter out disambiguation, list, and meta pages.
 */
function isFilteredArticle(title) {
  const lower = title.toLowerCase();
  if (lower.includes('(disambiguation)')) return true;
  if (lower.startsWith('list of')) return true;
  if (lower.startsWith('index of')) return true;
  if (lower.startsWith('outline of')) return true;
  if (lower.startsWith('wikipedia:')) return true;
  if (lower.startsWith('template:')) return true;
  if (lower.startsWith('category:')) return true;
  if (lower.startsWith('portal:')) return true;
  if (lower.startsWith('help:')) return true;
  return false;
}

/**
 * Categorize an article by keywords in its extract.
 */
function categorizeArticle(extract) {
  const lower = (extract || '').toLowerCase();
  const categories = {
    nature: ['ocean', 'mountain', 'forest', 'river', 'lake', 'tree', 'animal', 'plant', 'bird', 'fish', 'species', 'flower', 'island', 'desert', 'sea', 'water', 'earth'],
    science: ['atom', 'star', 'cell', 'quantum', 'energy', 'electron', 'molecule', 'physics', 'chemical', 'biology', 'dna', 'theory', 'experiment', 'particle', 'equation', 'mathematical'],
    history: ['war', 'king', 'empire', 'ancient', 'dynasty', 'battle', 'century', 'revolution', 'medieval', 'roman', 'emperor', 'kingdom', 'civilization'],
    art: ['music', 'painting', 'dance', 'film', 'theater', 'novel', 'poem', 'sculpture', 'artist', 'composer', 'symphony', 'opera', 'literary', 'album', 'song'],
    technology: ['computer', 'engine', 'digital', 'machine', 'software', 'internet', 'algorithm', 'program', 'network', 'data', 'electronic', 'invention'],
    geography: ['city', 'country', 'capital', 'population', 'continent', 'region', 'province', 'territory', 'border', 'coast', 'nation', 'republic', 'district', 'located'],
  };

  let bestCategory = 'default';
  let bestScore = 0;

  for (const [cat, keywords] of Object.entries(categories)) {
    let score = 0;
    for (const kw of keywords) {
      if (lower.includes(kw)) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      bestCategory = cat;
    }
  }

  return bestCategory;
}

/**
 * Fetch full article data: title, extract, links, category, thumbnail.
 * Uses cache when available.
 */
export async function getArticleData(title) {
  // Check cache first
  const cached = articleCache.get(title);
  if (cached) return cached;

  try {
    // Fetch summary first to get canonical title (handles redirects)
    const summary = await fetchSummary(title);
    if (!summary) {
      console.warn(`[Wikipedia] Article not found: ${title}`);
      return null;
    }

    // Use canonical title for links (parse API doesn't follow redirects well)
    const canonicalTitle = summary.title || title;
    const allLinks = await fetchLinks(canonicalTitle);

    // Pick a subset of links for portals
    const links = selectPortalLinks(allLinks, WIKI_LINKS_PER_ROOM);

    const articleData = {
      title: summary.title,
      extract: summary.extract || '',
      description: summary.description || '',
      thumbnail: summary.thumbnail ? summary.thumbnail.source : null,
      links,
      category: categorizeArticle(summary.extract),
      linkCount: allLinks.length,
    };

    articleCache.set(title, articleData);
    return articleData;
  } catch (e) {
    console.error(`[Wikipedia] Error fetching "${title}":`, e.message);
    return null;
  }
}

/**
 * Select portal links — prefer well-known, well-connected articles.
 * Takes a random sample from the first portion of links (which tend to be
 * more relevant as they appear earlier in the article).
 */
function selectPortalLinks(allLinks, count) {
  if (allLinks.length <= count) return allLinks;

  // Prefer links from the first half of the article (more relevant)
  const preferredCount = Math.min(Math.floor(allLinks.length * 0.5), allLinks.length);
  const preferred = allLinks.slice(0, preferredCount);
  const rest = allLinks.slice(preferredCount);

  const selected = [];
  const used = new Set();

  // Pick most from preferred
  const fromPreferred = Math.min(Math.ceil(count * 0.7), preferred.length);
  const shuffledPref = shuffleArray([...preferred]);
  for (let i = 0; i < fromPreferred && selected.length < count; i++) {
    selected.push(shuffledPref[i]);
    used.add(shuffledPref[i]);
  }

  // Fill rest from remaining
  const shuffledRest = shuffleArray([...rest]);
  for (let i = 0; i < shuffledRest.length && selected.length < count; i++) {
    if (!used.has(shuffledRest[i])) {
      selected.push(shuffledRest[i]);
    }
  }

  return selected;
}

function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Check if an article exists (lightweight check via summary API).
 */
export async function articleExists(title) {
  if (articleCache.has(title)) return true;
  const summary = await fetchSummary(title);
  return summary !== null && summary.type !== 'disambiguation';
}
