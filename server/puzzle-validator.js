/**
 * Puzzle Validator — Server-side puzzle generation and validation.
 *
 * The server generates puzzle parameters and validates answers
 * so clients can't cheat.
 */

import { PUZZLE_TYPES, PUZZLE_DIFFICULTY } from '../shared/constants.js';
import { getFromPool, addToPool } from './puzzle-cache.js';

// Countries cache (loaded once)
let countriesCache = null;

/**
 * Generate a puzzle for a given floor.
 */
export async function generatePuzzle(floor) {
  // Pick a random puzzle type from the implemented ones
  const implemented = ['trivia', 'glyph_trace', 'word_excavation', 'geography', 'pattern_complete'];
  const type = implemented[Math.floor(Math.random() * implemented.length)];

  let difficulty = 'easy';
  if (floor >= PUZZLE_DIFFICULTY.hard.minFloor) difficulty = 'hard';
  else if (floor >= PUZZLE_DIFFICULTY.medium.minFloor) difficulty = 'medium';

  try {
    switch (type) {
      case 'trivia':
        return await generateTriviaPuzzle(difficulty);
      case 'geography':
        return await generateGeographyPuzzle(difficulty);
      case 'glyph_trace':
        return generateGlyphPuzzle(difficulty);
      case 'word_excavation':
        return generateWordPuzzle(difficulty);
      case 'pattern_complete':
        return generatePatternPuzzle(difficulty);
      default:
        return generatePatternPuzzle(difficulty);
    }
  } catch (e) {
    console.warn(`[Puzzle] Failed to generate ${type}, falling back:`, e.message);
    return generatePatternPuzzle(difficulty);
  }
}

// ─── Trivia (OpenTriviaDB) ───────────────────────────────────────────
async function generateTriviaPuzzle(difficulty) {
  // Try from pool first
  const pooled = getFromPool(`trivia_${difficulty}`);
  if (pooled) return pooled;

  const res = await fetch(`https://opentdb.com/api.php?amount=5&difficulty=${difficulty}&type=multiple`);
  const json = await res.json();

  if (json.response_code !== 0 || !json.results.length) {
    throw new Error('OpenTriviaDB returned no results');
  }

  const puzzles = json.results.map(q => {
    const options = [...q.incorrect_answers, q.correct_answer];
    // Shuffle options
    for (let i = options.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [options[i], options[j]] = [options[j], options[i]];
    }
    const correctIndex = options.indexOf(q.correct_answer);

    return {
      type: 'trivia',
      data: {
        question: decodeHTML(q.question),
        options: options.map(o => decodeHTML(o)),
        category: q.category,
      },
      answer: correctIndex,
    };
  });

  // Pool extras
  for (let i = 1; i < puzzles.length; i++) {
    addToPool(`trivia_${difficulty}`, puzzles[i]);
  }

  return puzzles[0];
}

// ─── Geography (REST Countries) ──────────────────────────────────────
async function generateGeographyPuzzle(difficulty) {
  if (!countriesCache) {
    const res = await fetch('https://restcountries.com/v3.1/all?fields=name,capital,flags,region');
    countriesCache = await res.json();
  }

  const countries = countriesCache.filter(c => c.capital && c.capital.length > 0);
  const subType = Math.random() > 0.5 ? 'flag' : 'capital';

  // Pick a correct country and 3 wrong ones
  const shuffled = [...countries].sort(() => Math.random() - 0.5);
  const correct = shuffled[0];
  const wrongs = shuffled.slice(1, 4);
  const allOptions = [correct, ...wrongs].sort(() => Math.random() - 0.5);
  const correctIndex = allOptions.indexOf(correct);

  if (subType === 'flag') {
    return {
      type: 'geography',
      data: {
        subType: 'flag',
        flagUrl: correct.flags?.png || correct.flags?.svg || '',
        question: 'Which country does this flag belong to?',
        options: allOptions.map(c => c.name.common),
      },
      answer: correctIndex,
    };
  } else {
    return {
      type: 'geography',
      data: {
        subType: 'capital',
        question: `What is the capital of ${correct.name.common}?`,
        options: allOptions.map(c => c.capital[0]),
      },
      answer: correctIndex,
    };
  }
}

// ─── Glyph Trace ─────────────────────────────────────────────────────
function generateGlyphPuzzle(difficulty) {
  const size = difficulty === 'easy' ? 3 : difficulty === 'medium' ? 4 : 5;
  const totalDots = size * size;

  // Generate dots on a grid
  const dots = [];
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      dots.push({ row, col, id: row * size + col });
    }
  }

  // Generate a valid Hamiltonian path using backtracking
  const path = findHamiltonianPath(size);

  return {
    type: 'glyph_trace',
    data: { gridSize: size, dots, pathLength: totalDots },
    answer: path,
  };
}

function findHamiltonianPath(size) {
  const total = size * size;
  const visited = new Set();
  const path = [];

  // Start from a random position
  const startRow = Math.floor(Math.random() * size);
  const startCol = Math.floor(Math.random() * size);

  function neighbors(row, col) {
    const dirs = [[0,1],[0,-1],[1,0],[-1,0]];
    const result = [];
    for (const [dr, dc] of dirs) {
      const nr = row + dr;
      const nc = col + dc;
      if (nr >= 0 && nr < size && nc >= 0 && nc < size) {
        result.push([nr, nc]);
      }
    }
    // Shuffle neighbors for randomness
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  function backtrack(row, col) {
    const id = row * size + col;
    visited.add(id);
    path.push(id);

    if (path.length === total) return true;

    for (const [nr, nc] of neighbors(row, col)) {
      const nid = nr * size + nc;
      if (!visited.has(nid)) {
        if (backtrack(nr, nc)) return true;
      }
    }

    visited.delete(id);
    path.pop();
    return false;
  }

  backtrack(startRow, startCol);
  return path;
}

// ─── Word Excavation ─────────────────────────────────────────────────
function generateWordPuzzle(difficulty) {
  const words = [
    'BABEL', 'TOWER', 'STONE', 'LIGHT', 'GLYPH', 'RUNE', 'STAR', 'MOON',
    'FLAME', 'SHADOW', 'CRYSTAL', 'PRISM', 'ECHO', 'VOID', 'MYTH',
    'ARCANE', 'CIPHER', 'NEXUS', 'FORGE', 'ZENITH', 'ABYSS', 'ORACLE',
    'TEMPLE', 'ALTAR', 'RITUAL', 'ANCIENT', 'MYSTIC', 'COSMOS', 'ENIGMA',
  ];

  const gridSize = difficulty === 'easy' ? 6 : difficulty === 'medium' ? 8 : 10;
  const wordPool = words.filter(w => w.length <= gridSize);
  const word = wordPool[Math.floor(Math.random() * wordPool.length)];

  // Create grid filled with random letters
  const grid = [];
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  for (let r = 0; r < gridSize; r++) {
    const row = [];
    for (let c = 0; c < gridSize; c++) {
      row.push(letters[Math.floor(Math.random() * letters.length)]);
    }
    grid.push(row);
  }

  // Place the word in a random direction
  const directions = [[0,1], [1,0], [1,1], [0,-1], [-1,0]];
  const dir = directions[Math.floor(Math.random() * directions.length)];
  let placed = false;

  for (let attempt = 0; attempt < 100 && !placed; attempt++) {
    const startR = Math.floor(Math.random() * gridSize);
    const startC = Math.floor(Math.random() * gridSize);

    // Check if word fits
    const endR = startR + dir[0] * (word.length - 1);
    const endC = startC + dir[1] * (word.length - 1);

    if (endR >= 0 && endR < gridSize && endC >= 0 && endC < gridSize) {
      for (let i = 0; i < word.length; i++) {
        grid[startR + dir[0] * i][startC + dir[1] * i] = word[i];
      }
      placed = true;
    }
  }

  return {
    type: 'word_excavation',
    data: {
      grid,
      wordLength: word.length,
      hint: `Find a ${word.length}-letter word hidden in the grid`,
    },
    answer: word,
  };
}

// ─── Pattern Complete ────────────────────────────────────────────────
function generatePatternPuzzle(difficulty) {
  const patternType = Math.floor(Math.random() * 3);

  if (patternType === 0) {
    // Number sequence
    return generateNumberPattern(difficulty);
  } else if (patternType === 1) {
    // Color pattern
    return generateColorPattern(difficulty);
  } else {
    // Shape pattern
    return generateShapePattern(difficulty);
  }
}

function generateNumberPattern(difficulty) {
  const len = difficulty === 'easy' ? 4 : difficulty === 'medium' ? 5 : 6;
  // Simple arithmetic sequence
  const start = Math.floor(Math.random() * 10) + 1;
  const step = Math.floor(Math.random() * 5) + 2;
  const multiply = Math.random() > 0.5;

  const sequence = [];
  for (let i = 0; i < len + 1; i++) {
    sequence.push(multiply ? start * Math.pow(step, i) : start + step * i);
  }

  const answer = sequence.pop();
  const wrongAnswers = [
    answer + step,
    answer - step,
    answer * 2,
  ].filter(w => w !== answer && w > 0);

  const options = [answer, ...wrongAnswers.slice(0, 3)].sort(() => Math.random() - 0.5);
  const correctIndex = options.indexOf(answer);

  return {
    type: 'pattern_complete',
    data: {
      subType: 'number',
      sequence: sequence.map(String),
      question: 'What comes next?',
      options: options.map(String),
    },
    answer: correctIndex,
  };
}

function generateColorPattern(difficulty) {
  const colors = ['#ff4444', '#44ff44', '#4444ff', '#ffff44', '#ff44ff', '#44ffff'];
  const patternLen = difficulty === 'easy' ? 2 : 3;
  const pattern = [];
  for (let i = 0; i < patternLen; i++) {
    pattern.push(colors[Math.floor(Math.random() * colors.length)]);
  }

  // Repeat pattern and show with one missing
  const sequence = [];
  for (let i = 0; i < 3; i++) {
    sequence.push(...pattern);
  }
  const answer = sequence[sequence.length - 1];
  sequence[sequence.length - 1] = '?';

  // Options
  const wrongColors = colors.filter(c => c !== answer).slice(0, 3);
  const options = [answer, ...wrongColors].sort(() => Math.random() - 0.5);
  const correctIndex = options.indexOf(answer);

  return {
    type: 'pattern_complete',
    data: {
      subType: 'color',
      sequence,
      question: 'Which color completes the pattern?',
      options,
    },
    answer: correctIndex,
  };
}

function generateShapePattern(difficulty) {
  const shapes = ['circle', 'square', 'triangle', 'diamond', 'star', 'hexagon'];
  const patternLen = difficulty === 'easy' ? 2 : 3;
  const pattern = [];
  for (let i = 0; i < patternLen; i++) {
    pattern.push(shapes[Math.floor(Math.random() * shapes.length)]);
  }

  const sequence = [];
  for (let i = 0; i < 3; i++) {
    sequence.push(...pattern);
  }
  const answer = sequence[sequence.length - 1];
  sequence[sequence.length - 1] = '?';

  const wrongShapes = shapes.filter(s => s !== answer).slice(0, 3);
  const options = [answer, ...wrongShapes].sort(() => Math.random() - 0.5);
  const correctIndex = options.indexOf(answer);

  return {
    type: 'pattern_complete',
    data: {
      subType: 'shape',
      sequence,
      question: 'Which shape completes the pattern?',
      options,
    },
    answer: correctIndex,
  };
}

/**
 * Validate a player's submitted solution.
 */
export function validateSolution(puzzle, submission) {
  if (puzzle.type === 'word_excavation') {
    return puzzle.answer.toLowerCase() === String(submission).toLowerCase();
  }
  if (puzzle.type === 'glyph_trace') {
    if (!Array.isArray(submission) || !Array.isArray(puzzle.answer)) return false;
    if (submission.length !== puzzle.answer.length) return false;
    // Check that submission is a valid Hamiltonian path
    return JSON.stringify(submission) === JSON.stringify(puzzle.answer) ||
           JSON.stringify(submission) === JSON.stringify([...puzzle.answer].reverse());
  }
  if (Array.isArray(puzzle.answer)) {
    return JSON.stringify(puzzle.answer) === JSON.stringify(submission);
  }
  return puzzle.answer === submission;
}

// ─── Helpers ─────────────────────────────────────────────────────────
function decodeHTML(html) {
  const entities = {
    '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"',
    '&#039;': "'", '&apos;': "'", '&ldquo;': '"', '&rdquo;': '"',
    '&lsquo;': "'", '&rsquo;': "'", '&ndash;': '-', '&mdash;': '-',
    '&eacute;': 'e', '&egrave;': 'e', '&uuml;': 'u', '&ouml;': 'o',
    '&auml;': 'a', '&iacute;': 'i', '&ntilde;': 'n',
  };
  return html.replace(/&[^;]+;/g, match => entities[match] || match);
}

/**
 * Pre-warm the puzzle cache by fetching some trivia in the background.
 */
export async function prewarmCache() {
  console.log('[Puzzle] Pre-warming puzzle cache...');
  try {
    for (const diff of ['easy', 'medium', 'hard']) {
      generateTriviaPuzzle(diff).catch(() => {});
    }
    // Pre-load countries
    generateGeographyPuzzle('easy').catch(() => {});
  } catch (e) {
    console.warn('[Puzzle] Prewarm failed:', e.message);
  }
}
