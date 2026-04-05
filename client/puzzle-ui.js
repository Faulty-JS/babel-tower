/**
 * Puzzle UI — Renders puzzle overlays in terminal/ASCII aesthetic.
 */

let currentOnClose = null;

export function createPuzzleOverlay() {
  const overlay = document.createElement('div');
  overlay.id = 'puzzle-overlay';
  document.body.appendChild(overlay);

  // ESC to close
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && overlay.style.display === 'flex') {
      hidePuzzle();
      if (currentOnClose) currentOnClose();
    }
  });

  return overlay;
}

export function showPuzzle(puzzle, onSubmit, onClose) {
  const overlay = document.getElementById('puzzle-overlay');
  const content = document.getElementById('puzzle-content') || createContent(overlay);
  overlay.style.display = 'flex';
  content.innerHTML = '';
  currentOnClose = onClose;

  // Exit pointer lock so player can interact with puzzle
  if (document.pointerLockElement) {
    document.exitPointerLock();
  }

  switch (puzzle.type) {
    case 'trivia': renderTrivia(content, puzzle.data, onSubmit); break;
    case 'geography': renderGeography(content, puzzle.data, onSubmit); break;
    case 'glyph_trace': renderGlyphTrace(content, puzzle.data, onSubmit); break;
    case 'word_excavation': renderWordExcavation(content, puzzle.data, onSubmit); break;
    case 'pattern_complete': renderPatternComplete(content, puzzle.data, onSubmit); break;
    default:
      content.innerHTML = '<p>// UNKNOWN PUZZLE TYPE</p>';
  }
}

export function hidePuzzle() {
  const overlay = document.getElementById('puzzle-overlay');
  if (overlay) overlay.style.display = 'none';
  currentOnClose = null;
}

function createContent(overlay) {
  const content = document.createElement('div');
  content.id = 'puzzle-content';
  overlay.appendChild(content);
  return content;
}

// ─── Shared helpers ──────────────────────────────────────────────────

function makeButton(text, onClick) {
  const btn = document.createElement('button');
  btn.className = 'puzzle-btn';
  btn.textContent = text;
  btn.addEventListener('click', onClick);
  return btn;
}

function makeHeader(type) {
  const h = document.createElement('div');
  h.className = 'puzzle-header';
  h.textContent = `// ${type.toUpperCase().replace('_', ' ')}`;
  return h;
}

function showResult(container, success) {
  const result = document.createElement('div');
  result.className = success ? 'puzzle-success' : 'puzzle-fail';
  result.textContent = success ? '>> CORRECT <<' : '>> INCORRECT <<';
  container.appendChild(result);
}

// ─── Trivia ──────────────────────────────────────────────────────────

function renderTrivia(container, data, onSubmit) {
  container.appendChild(makeHeader('trivia'));

  if (data.category) {
    const cat = document.createElement('div');
    cat.className = 'puzzle-category';
    cat.textContent = `[${data.category}]`;
    container.appendChild(cat);
  }

  const q = document.createElement('div');
  q.className = 'puzzle-question';
  q.textContent = data.question;
  container.appendChild(q);

  const optionsDiv = document.createElement('div');
  optionsDiv.className = 'puzzle-options';

  data.options.forEach((opt, i) => {
    const btn = makeButton(`${String.fromCharCode(65 + i)}. ${opt}`, () => {
      onSubmit(i);
    });
    optionsDiv.appendChild(btn);
  });

  container.appendChild(optionsDiv);

  const hint = document.createElement('div');
  hint.className = 'puzzle-hint';
  hint.textContent = '[ESC to cancel]';
  container.appendChild(hint);
}

// ─── Geography ───────────────────────────────────────────────────────

function renderGeography(container, data, onSubmit) {
  container.appendChild(makeHeader('geography'));

  if (data.subType === 'flag' && data.flagUrl) {
    const flag = document.createElement('img');
    flag.src = data.flagUrl;
    flag.className = 'puzzle-flag';
    flag.style.cssText = 'width: 120px; height: auto; margin: 10px 0; image-rendering: pixelated; border: 1px solid #335533;';
    container.appendChild(flag);
  }

  const q = document.createElement('div');
  q.className = 'puzzle-question';
  q.textContent = data.question;
  container.appendChild(q);

  const optionsDiv = document.createElement('div');
  optionsDiv.className = 'puzzle-options';

  data.options.forEach((opt, i) => {
    const btn = makeButton(`${String.fromCharCode(65 + i)}. ${opt}`, () => {
      onSubmit(i);
    });
    optionsDiv.appendChild(btn);
  });

  container.appendChild(optionsDiv);
}

// ─── Glyph Trace ─────────────────────────────────────────────────────

function renderGlyphTrace(container, data, onSubmit) {
  container.appendChild(makeHeader('glyph trace'));

  const info = document.createElement('div');
  info.className = 'puzzle-question';
  info.textContent = 'Connect all dots with a single path. Click dots in order.';
  container.appendChild(info);

  const canvasSize = 300;
  const canvas = document.createElement('canvas');
  canvas.width = canvasSize;
  canvas.height = canvasSize;
  canvas.style.cssText = 'border: 1px solid #ccc; cursor: crosshair; display: block; margin: 10px auto;';
  container.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  const size = data.gridSize;
  const padding = 40;
  const spacing = (canvasSize - padding * 2) / (size - 1);
  const path = [];

  function drawState() {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvasSize, canvasSize);

    // Draw grid lines faintly
    ctx.strokeStyle = '#ddd';
    ctx.lineWidth = 0.5;
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const x = padding + c * spacing;
        const y = padding + r * spacing;
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // Draw path
    if (path.length > 1) {
      ctx.strokeStyle = '#222';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < path.length; i++) {
        const r = Math.floor(path[i] / size);
        const c = path[i] % size;
        const x = padding + c * spacing;
        const y = padding + r * spacing;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // Draw dots
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const id = r * size + c;
        const x = padding + c * spacing;
        const y = padding + r * spacing;

        const inPath = path.includes(id);
        ctx.fillStyle = inPath ? '#111' : '#aaa';
        ctx.beginPath();
        ctx.arc(x, y, inPath ? 8 : 6, 0, Math.PI * 2);
        ctx.fill();

        // Show order number
        if (inPath) {
          ctx.fillStyle = '#fff';
          ctx.font = '10px monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(String(path.indexOf(id) + 1), x, y);
        }
      }
    }
  }

  canvas.addEventListener('click', (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    // Find closest dot
    let closestId = -1;
    let closestDist = Infinity;
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const x = padding + c * spacing;
        const y = padding + r * spacing;
        const dist = Math.sqrt((mx - x) ** 2 + (my - y) ** 2);
        if (dist < spacing * 0.4 && dist < closestDist) {
          closestDist = dist;
          closestId = r * size + c;
        }
      }
    }

    if (closestId >= 0 && !path.includes(closestId)) {
      // Must be adjacent to last dot (or first)
      if (path.length === 0) {
        path.push(closestId);
      } else {
        const lastId = path[path.length - 1];
        const lastR = Math.floor(lastId / size);
        const lastC = lastId % size;
        const newR = Math.floor(closestId / size);
        const newC = closestId % size;
        const dist = Math.abs(lastR - newR) + Math.abs(lastC - newC);
        if (dist === 1) {
          path.push(closestId);
        }
      }
      drawState();

      // Check if complete
      if (path.length === size * size) {
        onSubmit(path);
      }
    }
  });

  drawState();

  // Undo button
  const controls = document.createElement('div');
  controls.style.cssText = 'text-align: center; margin-top: 8px;';
  const undoBtn = makeButton('UNDO', () => {
    path.pop();
    drawState();
  });
  const clearBtn = makeButton('CLEAR', () => {
    path.length = 0;
    drawState();
  });
  controls.appendChild(undoBtn);
  controls.appendChild(clearBtn);
  container.appendChild(controls);
}

// ─── Word Excavation ─────────────────────────────────────────────────

function renderWordExcavation(container, data, onSubmit) {
  container.appendChild(makeHeader('word excavation'));

  const info = document.createElement('div');
  info.className = 'puzzle-question';
  info.textContent = data.hint || 'Find the hidden word in the grid.';
  container.appendChild(info);

  const selected = [];
  const gridDiv = document.createElement('div');
  gridDiv.className = 'word-grid';
  gridDiv.style.cssText = `
    display: grid; grid-template-columns: repeat(${data.grid[0].length}, 1fr);
    gap: 2px; max-width: 400px; margin: 10px auto;
  `;

  const cells = [];
  data.grid.forEach((row, r) => {
    row.forEach((letter, c) => {
      const cell = document.createElement('div');
      cell.className = 'word-cell';
      cell.textContent = letter;
      cell.dataset.r = r;
      cell.dataset.c = c;

      cell.addEventListener('click', () => {
        const idx = selected.findIndex(s => s.r === r && s.c === c);
        if (idx >= 0) {
          selected.splice(idx, 1);
          cell.classList.remove('selected');
        } else {
          selected.push({ r, c, letter });
          cell.classList.add('selected');
        }
        wordDisplay.textContent = selected.map(s => s.letter).join('');
      });

      gridDiv.appendChild(cell);
      cells.push(cell);
    });
  });

  container.appendChild(gridDiv);

  const wordDisplay = document.createElement('div');
  wordDisplay.className = 'word-display';
  wordDisplay.textContent = '';
  container.appendChild(wordDisplay);

  const controls = document.createElement('div');
  controls.style.cssText = 'text-align: center; margin-top: 8px;';
  const submitBtn = makeButton('SUBMIT', () => {
    const word = selected.map(s => s.letter).join('');
    onSubmit(word);
  });
  const clearBtn = makeButton('CLEAR', () => {
    selected.length = 0;
    cells.forEach(c => c.classList.remove('selected'));
    wordDisplay.textContent = '';
  });
  controls.appendChild(submitBtn);
  controls.appendChild(clearBtn);
  container.appendChild(controls);
}

// ─── Pattern Complete ────────────────────────────────────────────────

function renderPatternComplete(container, data, onSubmit) {
  container.appendChild(makeHeader('pattern complete'));

  const q = document.createElement('div');
  q.className = 'puzzle-question';
  q.textContent = data.question;
  container.appendChild(q);

  // Show sequence
  const seqDiv = document.createElement('div');
  seqDiv.className = 'pattern-sequence';

  if (data.subType === 'number') {
    data.sequence.forEach(item => {
      const el = document.createElement('span');
      el.className = 'pattern-item';
      el.textContent = item;
      seqDiv.appendChild(el);
    });
    const mystery = document.createElement('span');
    mystery.className = 'pattern-item pattern-mystery';
    mystery.textContent = '?';
    seqDiv.appendChild(mystery);
  } else if (data.subType === 'color') {
    data.sequence.forEach(item => {
      const el = document.createElement('span');
      el.className = 'pattern-item pattern-color';
      if (item === '?') {
        el.textContent = '?';
        el.classList.add('pattern-mystery');
      } else {
        el.style.backgroundColor = item;
      }
      seqDiv.appendChild(el);
    });
  } else if (data.subType === 'shape') {
    data.sequence.forEach(item => {
      const el = document.createElement('span');
      el.className = 'pattern-item';
      if (item === '?') {
        el.textContent = '?';
        el.classList.add('pattern-mystery');
      } else {
        el.textContent = shapeToSymbol(item);
      }
      seqDiv.appendChild(el);
    });
  }

  container.appendChild(seqDiv);

  // Options
  const optionsDiv = document.createElement('div');
  optionsDiv.className = 'puzzle-options';

  data.options.forEach((opt, i) => {
    const btn = makeButton('', () => onSubmit(i));
    if (data.subType === 'color') {
      btn.style.backgroundColor = opt;
      btn.style.width = '50px';
      btn.style.height = '50px';
      btn.style.borderRadius = '4px';
    } else if (data.subType === 'shape') {
      btn.textContent = shapeToSymbol(opt);
      btn.style.fontSize = '24px';
    } else {
      btn.textContent = opt;
    }
    optionsDiv.appendChild(btn);
  });

  container.appendChild(optionsDiv);
}

function shapeToSymbol(shape) {
  const map = {
    circle: '\u25cf',
    square: '\u25a0',
    triangle: '\u25b2',
    diamond: '\u25c6',
    star: '\u2605',
    hexagon: '\u2b22',
  };
  return map[shape] || shape;
}

// ─── Result feedback ─────────────────────────────────────────────────

export function showPuzzleResult(success) {
  const overlay = document.getElementById('puzzle-overlay');
  if (!overlay) return;

  const content = document.getElementById('puzzle-content');
  if (!content) return;

  const result = document.createElement('div');
  result.className = success ? 'puzzle-success' : 'puzzle-fail';
  result.innerHTML = success
    ? '&gt;&gt; CORRECT &lt;&lt;<br><span style="font-size:12px">The tower absorbs your contribution...</span>'
    : '&gt;&gt; INCORRECT &lt;&lt;<br><span style="font-size:12px">The growth point flickers...</span>';
  content.innerHTML = '';
  content.appendChild(result);

  setTimeout(() => {
    hidePuzzle();
  }, success ? 2000 : 1500);
}
