/**
 * Puzzle Validator — Server-side puzzle generation and validation.
 *
 * The server generates puzzle parameters and validates answers
 * so clients can't cheat.
 */

import { PUZZLE_TYPES, PUZZLE_DIFFICULTY } from '../shared/constants.js';
import { getFromPool, addToPool } from './puzzle-cache.js';
import { getRandomSentence, getRandomTitle, getShortTitle } from './content-pool.js';

const SYMBOLS = ['◆', '●', '▲', '■', '★', '⬢', '◇', '○', '△', '□', '☆', '⬡', '⊕', '⊗', '⊘', '⊙'];

// Countries cache (loaded once)
let countriesCache = null;

/**
 * Generate a puzzle for a given floor.
 */
export async function generatePuzzle(floor) {
  const implemented = [
    'glyph_trace', 'cipher_wall', 'inscription', 'rune_lock',
    'stone_slide', 'echo_sequence', 'seal_breaking', 'light_channeling',
  ];
  const type = implemented[Math.floor(Math.random() * implemented.length)];

  let difficulty = 'easy';
  if (floor >= PUZZLE_DIFFICULTY.hard.minFloor) difficulty = 'hard';
  else if (floor >= PUZZLE_DIFFICULTY.medium.minFloor) difficulty = 'medium';

  try {
    switch (type) {
      case 'glyph_trace': return generateGlyphPuzzle(difficulty);
      case 'cipher_wall': return generateCipherPuzzle(difficulty);
      case 'inscription': return generateInscriptionPuzzle(difficulty);
      case 'rune_lock': return generateRuneLockPuzzle(difficulty);
      case 'stone_slide': return generateStoneSlidePuzzle(difficulty);
      case 'echo_sequence': return generateEchoPuzzle(difficulty);
      case 'seal_breaking': return generateSealPuzzle(difficulty);
      case 'light_channeling': return generateLightPuzzle(difficulty);
      default: return generateGlyphPuzzle(difficulty);
    }
  } catch (e) {
    console.warn(`[Puzzle] Failed to generate ${type}, falling back:`, e.message);
    return generateGlyphPuzzle(difficulty);
  }
}

// ─── Glyph Trace ─────────────────────────────────────────────────────
function generateGlyphPuzzle(difficulty) {
  const size = difficulty === 'easy' ? 3 : difficulty === 'medium' ? 4 : 5;
  const totalDots = size * size;
  const dots = [];
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      dots.push({ row, col, id: row * size + col });
    }
  }
  const path = findHamiltonianPath(size);
  return { type: 'glyph_trace', data: { gridSize: size, dots, pathLength: totalDots }, answer: path };
}

function findHamiltonianPath(size) {
  const total = size * size;
  const visited = new Set();
  const path = [];
  const startRow = Math.floor(Math.random() * size);
  const startCol = Math.floor(Math.random() * size);

  function neighbors(row, col) {
    const dirs = [[0,1],[0,-1],[1,0],[-1,0]];
    const result = [];
    for (const [dr, dc] of dirs) {
      const nr = row + dr, nc = col + dc;
      if (nr >= 0 && nr < size && nc >= 0 && nc < size) result.push([nr, nc]);
    }
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
      if (!visited.has(nid) && backtrack(nr, nc)) return true;
    }
    visited.delete(id);
    path.pop();
    return false;
  }

  backtrack(startRow, startCol);
  return path;
}

// ─── Cipher Wall ─────────────────────────────────────────────────────
function generateCipherPuzzle(difficulty) {
  const { sentence, title } = getRandomSentence();
  const maxLen = difficulty === 'easy' ? 25 : difficulty === 'medium' ? 35 : 50;
  const text = sentence.toLowerCase().slice(0, maxLen).trim();

  // Extract unique letters
  const uniqueLetters = [...new Set(text.replace(/[^a-z]/g, '').split(''))];
  // Shuffle symbols and assign
  const shuffled = [...SYMBOLS].sort(() => Math.random() - 0.5);
  const key = {};
  uniqueLetters.forEach((letter, i) => {
    key[shuffled[i % shuffled.length]] = letter;
  });

  // Build reverse map: letter -> symbol
  const reverseKey = {};
  for (const [sym, letter] of Object.entries(key)) {
    reverseKey[letter] = sym;
  }

  // Encode
  const encoded = [];
  for (const ch of text) {
    if (reverseKey[ch]) encoded.push(reverseKey[ch]);
    else encoded.push(ch); // spaces, punctuation pass through
  }

  return {
    type: 'cipher_wall',
    data: { key, encoded, phraseLength: text.length },
    answer: text,
    revealText: sentence,
  };
}

// ─── Inscription Reconstruction ──────────────────────────────────────
function generateInscriptionPuzzle(difficulty) {
  const { sentence } = getRandomSentence();
  const maxLen = difficulty === 'easy' ? 40 : difficulty === 'medium' ? 60 : 80;
  const text = sentence.slice(0, maxLen).trim();

  const numFragments = difficulty === 'easy' ? 3 : difficulty === 'medium' ? 4 : 5;
  const words = text.split(' ');
  const fragments = [];
  const wordsPerFragment = Math.ceil(words.length / numFragments);

  for (let i = 0; i < numFragments; i++) {
    const start = i * wordsPerFragment;
    const end = Math.min(start + wordsPerFragment, words.length);
    if (start < words.length) {
      fragments.push({ id: i, text: words.slice(start, end).join(' ') });
    }
  }

  // The correct order is 0, 1, 2, ...
  const correctOrder = fragments.map(f => f.id);

  // Scramble for display
  const scrambled = [...fragments].sort(() => Math.random() - 0.5);
  // Ensure it's not already in order
  if (scrambled.every((f, i) => f.id === i)) {
    // Swap first two
    [scrambled[0], scrambled[1]] = [scrambled[1], scrambled[0]];
  }

  return {
    type: 'inscription',
    data: { fragments: scrambled, numSlots: fragments.length },
    answer: correctOrder,
    revealText: sentence,
  };
}

// ─── Rune Lock ───────────────────────────────────────────────────────
function generateRuneLockPuzzle(difficulty) {
  const numRings = difficulty === 'easy' ? 2 : difficulty === 'medium' ? 3 : 4;
  const ringSize = difficulty === 'easy' ? 5 : difficulty === 'medium' ? 6 : 7;

  const title = getShortTitle(numRings + 4);
  const chars = title.slice(0, numRings).split('');

  // Build target symbols — one per ring
  const usedSymbols = new Set();
  const target = [];
  for (const ch of chars) {
    let sym;
    do {
      sym = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
    } while (usedSymbols.has(sym));
    usedSymbols.add(sym);
    target.push(sym);
  }

  // Build rings, each containing the target symbol at some position
  const rings = [];
  const solutionRotations = [];

  for (let r = 0; r < numRings; r++) {
    const ring = [];
    // Fill with random symbols, ensuring target is included
    const targetPos = Math.floor(Math.random() * ringSize);
    for (let i = 0; i < ringSize; i++) {
      if (i === targetPos) {
        ring.push(target[r]);
      } else {
        let sym;
        do {
          sym = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
        } while (sym === target[r]);
        ring.push(sym);
      }
    }

    // The keyhole is at position 0. Target is at targetPos.
    // To solve, rotate left by targetPos so target lands at position 0.
    const solutionRotation = targetPos;

    // Randomize starting rotation (not at solution)
    let startRotation;
    do {
      startRotation = Math.floor(Math.random() * ringSize);
    } while (startRotation === solutionRotation);

    // Apply start rotation to the ring
    const rotatedRing = [];
    for (let i = 0; i < ringSize; i++) {
      rotatedRing.push(ring[(i + startRotation) % ringSize]);
    }

    rings.push(rotatedRing);
    // To solve from start position, we need to rotate by (solutionRotation - startRotation + ringSize) % ringSize
    solutionRotations.push((solutionRotation - startRotation + ringSize) % ringSize);
  }

  return {
    type: 'rune_lock',
    data: { rings, target, keyholeIndex: 0 },
    answer: solutionRotations,
    revealText: title,
  };
}

// ─── Stone Slide ─────────────────────────────────────────────────────
function generateStoneSlidePuzzle(difficulty) {
  const gridSize = difficulty === 'easy' ? 3 : 4;
  const totalTiles = gridSize * gridSize;

  const { sentence } = getRandomSentence();
  const chars = sentence.slice(0, totalTiles - 1).padEnd(totalTiles - 1, ' ').split('');
  const solved = [...chars, null]; // null is the blank

  // Shuffle by applying random valid moves
  const tiles = [...solved];
  let blankIdx = tiles.indexOf(null);
  const moves = difficulty === 'easy' ? 20 : difficulty === 'medium' ? 40 : 60;

  for (let m = 0; m < moves; m++) {
    const neighbors = [];
    const row = Math.floor(blankIdx / gridSize);
    const col = blankIdx % gridSize;
    if (row > 0) neighbors.push(blankIdx - gridSize);
    if (row < gridSize - 1) neighbors.push(blankIdx + gridSize);
    if (col > 0) neighbors.push(blankIdx - 1);
    if (col < gridSize - 1) neighbors.push(blankIdx + 1);

    const pick = neighbors[Math.floor(Math.random() * neighbors.length)];
    [tiles[blankIdx], tiles[pick]] = [tiles[pick], tiles[blankIdx]];
    blankIdx = pick;
  }

  // Ensure not already solved
  if (tiles.every((t, i) => t === solved[i])) {
    // Swap two non-blank adjacent tiles
    const a = 0, b = 1;
    [tiles[a], tiles[b]] = [tiles[b], tiles[a]];
  }

  return {
    type: 'stone_slide',
    data: { gridSize, tiles, hint: sentence.slice(0, 3) },
    answer: solved,
    revealText: sentence,
  };
}

// ─── Echo Sequence ───────────────────────────────────────────────────
function generateEchoPuzzle(difficulty) {
  const title = getShortTitle(7);
  const word = title.slice(0, difficulty === 'easy' ? 5 : difficulty === 'medium' ? 6 : 7);

  // Map unique letters to unique symbols
  const uniqueLetters = [...new Set(word.split(''))];
  const shuffledSymbols = [...SYMBOLS].sort(() => Math.random() - 0.5);
  const letterToSymbol = {};
  const symbolToLetter = {};
  uniqueLetters.forEach((letter, i) => {
    letterToSymbol[letter] = shuffledSymbols[i];
    symbolToLetter[shuffledSymbols[i]] = letter;
  });

  const symbols = uniqueLetters.map(l => letterToSymbol[l]);
  const fullSequence = word.split('').map(l => symbols.indexOf(letterToSymbol[l]));

  // Build 3 rounds of increasing length
  const r1Len = Math.min(3, fullSequence.length);
  const r2Len = Math.min(5, fullSequence.length);
  const sequences = [
    fullSequence.slice(0, r1Len),
    fullSequence.slice(0, r2Len),
    fullSequence,
  ];

  return {
    type: 'echo_sequence',
    data: { symbols, sequences, revealWord: word },
    answer: sequences,
    revealText: word,
  };
}

// ─── Seal Breaking (Lights Out on a graph) ───────────────────────────
function generateSealPuzzle(difficulty) {
  const title = getShortTitle(difficulty === 'easy' ? 5 : difficulty === 'medium' ? 6 : 7);
  const word = title;
  const numNodes = word.length;

  // Generate node positions in a circle
  const nodes = [];
  for (let i = 0; i < numNodes; i++) {
    const angle = (i / numNodes) * Math.PI * 2 - Math.PI / 2;
    const radius = 120;
    nodes.push({
      id: i,
      x: 180 + Math.cos(angle) * radius + (Math.random() - 0.5) * 20,
      y: 180 + Math.sin(angle) * radius + (Math.random() - 0.5) * 20,
      lit: true,
      label: word[i],
    });
  }

  // Generate edges: connect each node to its neighbors in the circle + a few random
  const edges = [];
  for (let i = 0; i < numNodes; i++) {
    edges.push({ from: i, to: (i + 1) % numNodes });
  }
  // Add 1-2 cross edges for complexity
  const extraEdges = difficulty === 'easy' ? 1 : 2;
  for (let e = 0; e < extraEdges; e++) {
    let a, b;
    do {
      a = Math.floor(Math.random() * numNodes);
      b = Math.floor(Math.random() * numNodes);
    } while (a === b || Math.abs(a - b) <= 1 || edges.some(ed => (ed.from === a && ed.to === b) || (ed.from === b && ed.to === a)));
    edges.push({ from: a, to: b });
  }

  // Build adjacency
  const adj = Array.from({ length: numNodes }, () => []);
  for (const e of edges) {
    adj[e.from].push(e.to);
    adj[e.to].push(e.from);
  }

  // Start all lit, apply N random clicks to scramble
  const litState = new Array(numNodes).fill(true);
  const numClicks = difficulty === 'easy' ? 2 : difficulty === 'medium' ? 3 : 4;
  const clickSequence = [];

  for (let c = 0; c < numClicks; c++) {
    const nodeId = Math.floor(Math.random() * numNodes);
    clickSequence.push(nodeId);
    // Toggle node and its neighbors
    litState[nodeId] = !litState[nodeId];
    for (const n of adj[nodeId]) {
      litState[n] = !litState[n];
    }
  }

  // If all still lit, force one more click
  if (litState.every(l => l)) {
    const nodeId = 0;
    clickSequence.push(nodeId);
    litState[nodeId] = !litState[nodeId];
    for (const n of adj[nodeId]) {
      litState[n] = !litState[n];
    }
  }

  // Set initial state
  nodes.forEach((node, i) => { node.lit = litState[i]; });

  return {
    type: 'seal_breaking',
    data: { nodes, edges, revealText: word },
    answer: clickSequence,
    revealText: word,
  };
}

// ─── Light Channeling ────────────────────────────────────────────────
function generateLightPuzzle(difficulty) {
  const gridSize = difficulty === 'easy' ? 4 : difficulty === 'medium' ? 5 : 6;

  // Entry on left edge, target on right edge
  const entryPos = Math.floor(Math.random() * gridSize);
  const targetPos = Math.floor(Math.random() * gridSize);
  const entry = { edge: 'left', pos: entryPos };
  const target = { edge: 'right', pos: targetPos };

  // Generate a valid path from entry to target through the grid
  // Place mirrors along the path, then randomize rotatable ones
  const cells = [];
  const occupied = new Set();

  // Simple path generation: beam goes right, bouncing off mirrors
  // We'll place mirrors to create a valid path
  const numFixed = difficulty === 'easy' ? 1 : difficulty === 'medium' ? 2 : 3;
  const numRotatable = difficulty === 'easy' ? 2 : difficulty === 'medium' ? 3 : 4;

  // Strategy: create a path with placed mirrors
  // Beam enters from left at entryPos row, going right
  // We need it to reach the right edge at targetPos row
  // Place mirrors to redirect the beam

  const solutionMirrors = [];

  if (entryPos === targetPos) {
    // Straight path — add a detour
    const col1 = 1 + Math.floor(Math.random() * (gridSize - 2));
    const detourRow = entryPos === 0 ? 1 : entryPos - 1;
    // Mirror at (entryPos, col1) to redirect up/down
    solutionMirrors.push({ x: col1, y: entryPos, angle: entryPos > detourRow ? '/' : '\\' });
    // Mirror at (detourRow, col1) to redirect right
    solutionMirrors.push({ x: col1, y: detourRow, angle: entryPos > detourRow ? '\\' : '/' });
    // Mirror at (detourRow, col1+1) to redirect back down/up
    const col2 = Math.min(col1 + 2, gridSize - 1);
    solutionMirrors.push({ x: col2, y: detourRow, angle: entryPos > detourRow ? '/' : '\\' });
    // Mirror to redirect right again
    solutionMirrors.push({ x: col2, y: entryPos, angle: entryPos > detourRow ? '\\' : '/' });
  } else {
    // Need to redirect from entryPos row to targetPos row
    const col = 1 + Math.floor(Math.random() * (gridSize - 2));
    // Mirror to turn beam down/up
    solutionMirrors.push({ x: col, y: entryPos, angle: targetPos > entryPos ? '\\' : '/' });
    // Mirror to turn beam right again at target row
    solutionMirrors.push({ x: col, y: targetPos, angle: targetPos > entryPos ? '/' : '\\' });
  }

  // Mark which are fixed vs rotatable
  const allMirrors = [];
  for (let i = 0; i < solutionMirrors.length; i++) {
    const m = solutionMirrors[i];
    const isFixed = i < numFixed && i < solutionMirrors.length;
    allMirrors.push({
      x: m.x,
      y: m.y,
      type: isFixed ? 'fixed' : 'rotatable',
      angle: m.angle,
      solutionAngle: m.angle,
    });
    occupied.add(`${m.x},${m.y}`);
  }

  // Build cell data for client
  const cellData = allMirrors.map(m => {
    const clientAngle = m.type === 'fixed' ? m.angle : (Math.random() > 0.5 ? '/' : '\\');
    return {
      x: m.x,
      y: m.y,
      type: m.type,
      angle: clientAngle,
    };
  });

  // Answer: correct angles for rotatable mirrors
  const answer = allMirrors
    .filter(m => m.type === 'rotatable')
    .map(m => ({ x: m.x, y: m.y, angle: m.solutionAngle }));

  const { sentence } = getRandomSentence();
  const revealWord = sentence.split(' ')[0].toUpperCase();

  return {
    type: 'light_channeling',
    data: { gridSize, entry, target, cells: cellData, revealWord },
    answer,
    revealText: sentence,
  };
}

// ─── Trivia (kept but not in implemented array) ─────────────────────
async function generateTriviaPuzzle(difficulty) {
  const pooled = getFromPool(`trivia_${difficulty}`);
  if (pooled) return pooled;
  const res = await fetch(`https://opentdb.com/api.php?amount=5&difficulty=${difficulty}&type=multiple`);
  const json = await res.json();
  if (json.response_code !== 0 || !json.results.length) throw new Error('No results');
  const puzzles = json.results.map(q => {
    const options = [...q.incorrect_answers, q.correct_answer];
    for (let i = options.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [options[i], options[j]] = [options[j], options[i]];
    }
    return { type: 'trivia', data: { question: decodeHTML(q.question), options: options.map(o => decodeHTML(o)), category: q.category }, answer: options.indexOf(q.correct_answer) };
  });
  for (let i = 1; i < puzzles.length; i++) addToPool(`trivia_${difficulty}`, puzzles[i]);
  return puzzles[0];
}

/**
 * Validate a player's submitted solution.
 */
export function validateSolution(puzzle, submission) {
  switch (puzzle.type) {
    case 'glyph_trace': {
      if (!Array.isArray(submission) || !Array.isArray(puzzle.answer)) return false;
      if (submission.length !== puzzle.answer.length) return false;
      return JSON.stringify(submission) === JSON.stringify(puzzle.answer) ||
             JSON.stringify(submission) === JSON.stringify([...puzzle.answer].reverse());
    }
    case 'cipher_wall': {
      return puzzle.answer === String(submission).toLowerCase().trim();
    }
    case 'inscription': {
      if (!Array.isArray(submission)) return false;
      return JSON.stringify(submission) === JSON.stringify(puzzle.answer);
    }
    case 'rune_lock': {
      if (!Array.isArray(submission)) return false;
      // Check that symbols at keyhole match target after applying rotations
      const { rings, target } = puzzle.data;
      for (let r = 0; r < rings.length; r++) {
        const ring = rings[r];
        const rotation = submission[r] || 0;
        const symbolAtKeyhole = ring[rotation % ring.length];
        if (symbolAtKeyhole !== target[r]) return false;
      }
      return true;
    }
    case 'stone_slide': {
      if (!Array.isArray(submission)) return false;
      return JSON.stringify(submission) === JSON.stringify(puzzle.answer);
    }
    case 'echo_sequence': {
      if (!Array.isArray(submission)) return false;
      return JSON.stringify(submission) === JSON.stringify(puzzle.answer);
    }
    case 'seal_breaking': {
      // Simulate the clicks and check if all nodes are lit
      if (!Array.isArray(submission)) return false;
      const { nodes, edges } = puzzle.data;
      const adj = Array.from({ length: nodes.length }, () => []);
      for (const e of edges) { adj[e.from].push(e.to); adj[e.to].push(e.from); }
      const litState = nodes.map(n => n.lit);
      for (const nodeId of submission) {
        litState[nodeId] = !litState[nodeId];
        for (const n of adj[nodeId]) litState[n] = !litState[n];
      }
      return litState.every(l => l);
    }
    case 'light_channeling': {
      // Simulate beam with submitted mirror angles
      if (!Array.isArray(submission)) return false;
      const { gridSize, entry, target, cells } = puzzle.data;

      // Build mirror map with submitted angles for rotatable
      const mirrorMap = {};
      for (const c of cells) {
        mirrorMap[`${c.x},${c.y}`] = c.type === 'fixed' ? c.angle : null;
      }
      for (const s of submission) {
        mirrorMap[`${s.x},${s.y}`] = s.angle;
      }

      // Simulate beam
      let bx, by, dx, dy;
      if (entry.edge === 'left') { bx = 0; by = entry.pos; dx = 1; dy = 0; }
      else if (entry.edge === 'right') { bx = gridSize - 1; by = entry.pos; dx = -1; dy = 0; }
      else if (entry.edge === 'top') { bx = entry.pos; by = 0; dx = 0; dy = 1; }
      else { bx = entry.pos; by = gridSize - 1; dx = 0; dy = -1; }

      for (let step = 0; step < 100; step++) {
        const key = `${bx},${by}`;
        if (mirrorMap[key]) {
          const angle = mirrorMap[key];
          if (angle === '/') { [dx, dy] = [-dy, -dx]; }
          else if (angle === '\\') { [dx, dy] = [dy, dx]; }
        }
        bx += dx;
        by += dy;

        // Check if beam exits the grid
        if (bx < 0 || bx >= gridSize || by < 0 || by >= gridSize) {
          // Check if it exits at the target
          if (target.edge === 'right' && bx >= gridSize && by === target.pos) return true;
          if (target.edge === 'left' && bx < 0 && by === target.pos) return true;
          if (target.edge === 'bottom' && by >= gridSize && bx === target.pos) return true;
          if (target.edge === 'top' && by < 0 && bx === target.pos) return true;
          return false;
        }
      }
      return false;
    }
    default: {
      if (Array.isArray(puzzle.answer)) {
        return JSON.stringify(puzzle.answer) === JSON.stringify(submission);
      }
      return puzzle.answer === submission;
    }
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────
function decodeHTML(html) {
  const entities = {
    '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"',
    '&#039;': "'", '&apos;': "'", '&ldquo;': '"', '&rdquo;': '"',
    '&lsquo;': "'", '&rsquo;': "'", '&ndash;': '-', '&mdash;': '-',
  };
  return html.replace(/&[^;]+;/g, match => entities[match] || match);
}

/**
 * Pre-warm the puzzle cache.
 */
export async function prewarmCache() {
  console.log('[Puzzle] Puzzle system ready (content pool handles pre-warming)');
}
