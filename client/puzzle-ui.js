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
    case 'cipher_wall': renderCipherWall(content, puzzle.data, onSubmit); break;
    case 'inscription': renderInscriptionReconstruction(content, puzzle.data, onSubmit); break;
    case 'rune_lock': renderRuneLock(content, puzzle.data, onSubmit); break;
    case 'stone_slide': renderStoneSlide(content, puzzle.data, onSubmit); break;
    case 'echo_sequence': renderEchoSequence(content, puzzle.data, onSubmit); break;
    case 'seal_breaking': renderSealBreaking(content, puzzle.data, onSubmit); break;
    case 'light_channeling': renderLightChanneling(content, puzzle.data, onSubmit); break;
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
  h.textContent = `// ${type.toUpperCase().replace(/_/g, ' ')}`;
  return h;
}

// ─── Cipher Wall ─────────────────────────────────────────────────────

function renderCipherWall(container, data, onSubmit) {
  container.appendChild(makeHeader('cipher wall'));

  const info = document.createElement('div');
  info.className = 'puzzle-question';
  info.textContent = 'Decode the inscription using the cipher key.';
  container.appendChild(info);

  // Cipher key display
  const keyDiv = document.createElement('div');
  keyDiv.className = 'cipher-key';
  for (const [sym, letter] of Object.entries(data.key)) {
    const pair = document.createElement('span');
    pair.className = 'cipher-pair';
    pair.innerHTML = `<span class="cipher-symbol">${sym}</span><span class="cipher-letter">${letter}</span>`;
    keyDiv.appendChild(pair);
  }
  container.appendChild(keyDiv);

  // Encoded symbols row
  const encodedDiv = document.createElement('div');
  encodedDiv.className = 'cipher-encoded';
  data.encoded.forEach(sym => {
    const el = document.createElement('span');
    el.className = 'cipher-char';
    el.textContent = sym;
    encodedDiv.appendChild(el);
  });
  container.appendChild(encodedDiv);

  // Translation row
  const translationDiv = document.createElement('div');
  translationDiv.className = 'cipher-translation';
  const decoded = [];
  data.encoded.forEach((sym, i) => {
    const el = document.createElement('span');
    el.className = 'cipher-decoded-char';
    // Auto-fill non-letter characters (spaces, punctuation)
    const isSymbol = Object.keys(data.key).includes(sym);
    if (!isSymbol) {
      el.textContent = sym;
      decoded.push(sym);
    } else {
      el.textContent = '_';
      decoded.push(null);
    }
    translationDiv.appendChild(el);
  });
  container.appendChild(translationDiv);

  // Build reverse key for checking
  const reverseKey = {};
  for (const [sym, letter] of Object.entries(data.key)) {
    reverseKey[sym] = letter;
  }

  // Find first empty position
  let cursorPos = decoded.findIndex(d => d === null);

  function updateCursor() {
    const chars = translationDiv.querySelectorAll('.cipher-decoded-char');
    chars.forEach((ch, i) => {
      ch.classList.toggle('active', i === cursorPos);
    });
  }
  updateCursor();

  // Keyboard input
  function onKeyDown(e) {
    if (e.key === 'Backspace') {
      // Find previous editable position
      for (let i = cursorPos - 1; i >= 0; i--) {
        const sym = data.encoded[i];
        if (Object.keys(data.key).includes(sym)) {
          decoded[i] = null;
          translationDiv.children[i].textContent = '_';
          cursorPos = i;
          updateCursor();
          break;
        }
      }
      e.preventDefault();
      return;
    }

    if (e.key.length === 1 && /[a-zA-Z]/.test(e.key) && cursorPos >= 0 && cursorPos < decoded.length) {
      decoded[cursorPos] = e.key.toLowerCase();
      translationDiv.children[cursorPos].textContent = e.key.toLowerCase();

      // Advance to next empty
      let found = false;
      for (let i = cursorPos + 1; i < decoded.length; i++) {
        if (decoded[i] === null) {
          cursorPos = i;
          found = true;
          break;
        }
      }
      if (!found) cursorPos = -1;
      updateCursor();

      // Check if complete
      if (decoded.every(d => d !== null)) {
        document.removeEventListener('keydown', onKeyDown);
        const answer = decoded.join('');
        onSubmit(answer);
      }
    }
  }
  document.addEventListener('keydown', onKeyDown);

  // Letter buttons for mobile/click
  const lettersDiv = document.createElement('div');
  lettersDiv.className = 'cipher-letters';
  'abcdefghijklmnopqrstuvwxyz'.split('').forEach(letter => {
    const btn = document.createElement('button');
    btn.className = 'cipher-letter-btn';
    btn.textContent = letter;
    btn.addEventListener('click', () => {
      onKeyDown({ key: letter, preventDefault: () => {} });
    });
    lettersDiv.appendChild(btn);
  });
  // Backspace button
  const bksp = document.createElement('button');
  bksp.className = 'cipher-letter-btn';
  bksp.textContent = '\u2190';
  bksp.addEventListener('click', () => {
    onKeyDown({ key: 'Backspace', preventDefault: () => {} });
  });
  lettersDiv.appendChild(bksp);
  container.appendChild(lettersDiv);

  // Store cleanup ref so ESC also removes the listener
  const origOnClose = currentOnClose;
  currentOnClose = () => {
    document.removeEventListener('keydown', onKeyDown);
    if (origOnClose) origOnClose();
  };
}

// ─── Inscription Reconstruction ──────────────────────────────────────

function renderInscriptionReconstruction(container, data, onSubmit) {
  container.appendChild(makeHeader('inscription'));

  const info = document.createElement('div');
  info.className = 'puzzle-question';
  info.textContent = 'Reconstruct the shattered inscription. Click fragments to place them in order.';
  container.appendChild(info);

  const slots = [];
  const placed = new Array(data.numSlots).fill(null);

  // Slots (the tablet)
  const slotsDiv = document.createElement('div');
  slotsDiv.className = 'inscription-slots';
  for (let i = 0; i < data.numSlots; i++) {
    const slot = document.createElement('div');
    slot.className = 'inscription-slot';
    slot.dataset.index = i;
    slot.textContent = `[ ${i + 1} ]`;
    slot.addEventListener('click', () => {
      if (placed[i] !== null) {
        // Return fragment to pool
        const frag = placed[i];
        placed[i] = null;
        slot.textContent = `[ ${i + 1} ]`;
        slot.classList.remove('filled');
        // Re-show fragment chip
        const chip = container.querySelector(`[data-frag-id="${frag.id}"]`);
        if (chip) chip.style.display = '';
      }
    });
    slots.push(slot);
    slotsDiv.appendChild(slot);
  }
  container.appendChild(slotsDiv);

  // Fragment chips
  const chipsDiv = document.createElement('div');
  chipsDiv.className = 'inscription-chips';
  let selectedFrag = null;

  data.fragments.forEach(frag => {
    const chip = document.createElement('div');
    chip.className = 'inscription-chip';
    chip.textContent = frag.text;
    chip.dataset.fragId = frag.id;
    chip.addEventListener('click', () => {
      // Place in first empty slot
      const emptyIdx = placed.findIndex(p => p === null);
      if (emptyIdx >= 0) {
        placed[emptyIdx] = frag;
        slots[emptyIdx].textContent = frag.text;
        slots[emptyIdx].classList.add('filled');
        chip.style.display = 'none';

        // Check if all placed
        if (placed.every(p => p !== null)) {
          const answer = placed.map(p => p.id);
          onSubmit(answer);
        }
      }
    });
    chipsDiv.appendChild(chip);
  });
  container.appendChild(chipsDiv);
}

// ─── Rune Lock ───────────────────────────────────────────────────────

function renderRuneLock(container, data, onSubmit) {
  container.appendChild(makeHeader('rune lock'));

  const info = document.createElement('div');
  info.className = 'puzzle-question';
  info.textContent = 'Rotate each ring until the keyhole symbols match the target.';
  container.appendChild(info);

  // Target display
  const targetDiv = document.createElement('div');
  targetDiv.className = 'rune-target';
  targetDiv.innerHTML = '<span class="rune-target-label">TARGET:</span> ';
  data.target.forEach(sym => {
    const s = document.createElement('span');
    s.className = 'rune-target-symbol';
    s.textContent = sym;
    targetDiv.appendChild(s);
  });
  container.appendChild(targetDiv);

  // Rings
  const rotations = data.rings.map(() => 0);
  const ringsDiv = document.createElement('div');
  ringsDiv.className = 'rune-rings';

  data.rings.forEach((ring, ringIdx) => {
    const rowDiv = document.createElement('div');
    rowDiv.className = 'rune-ring-row';
    rowDiv.title = 'Click to rotate';

    function renderRing() {
      rowDiv.innerHTML = '';
      ring.forEach((sym, i) => {
        const cell = document.createElement('span');
        cell.className = 'rune-cell' + (i === data.keyholeIndex ? ' rune-keyhole' : '');
        cell.textContent = sym;
        rowDiv.appendChild(cell);
      });
    }

    rowDiv.addEventListener('click', () => {
      // Rotate left by 1
      ring.push(ring.shift());
      rotations[ringIdx]++;
      renderRing();

      // Check if solved
      const solved = data.rings.every((r, ri) => r[data.keyholeIndex] === data.target[ri]);
      if (solved) {
        onSubmit(rotations);
      }
    });

    renderRing();
    ringsDiv.appendChild(rowDiv);
  });
  container.appendChild(ringsDiv);
}

// ─── Stone Slide ─────────────────────────────────────────────────────

function renderStoneSlide(container, data, onSubmit) {
  container.appendChild(makeHeader('stone slide'));

  const info = document.createElement('div');
  info.className = 'puzzle-question';
  info.textContent = `Slide the tiles to reconstruct the inscription. Starts with "${data.hint}..."`;
  container.appendChild(info);

  const tiles = [...data.tiles];
  const gridSize = data.gridSize;

  const gridDiv = document.createElement('div');
  gridDiv.className = 'slide-grid';
  gridDiv.style.gridTemplateColumns = `repeat(${gridSize}, 1fr)`;

  function render() {
    gridDiv.innerHTML = '';
    tiles.forEach((tile, idx) => {
      const cell = document.createElement('div');
      cell.className = 'slide-tile' + (tile === null ? ' slide-empty' : '');
      cell.textContent = tile || '';
      if (tile !== null) {
        cell.addEventListener('click', () => {
          const blankIdx = tiles.indexOf(null);
          const row = Math.floor(idx / gridSize);
          const col = idx % gridSize;
          const bRow = Math.floor(blankIdx / gridSize);
          const bCol = blankIdx % gridSize;
          const dist = Math.abs(row - bRow) + Math.abs(col - bCol);
          if (dist === 1) {
            [tiles[idx], tiles[blankIdx]] = [tiles[blankIdx], tiles[idx]];
            render();
            // Check solved
            const solved = tiles.every((t, i) => t === data.tiles[i] ? false : true);
            // Actually check against the correct order
            checkSolved();
          }
        });
      }
      gridDiv.appendChild(cell);
    });
  }

  function checkSolved() {
    // The solved state: reading left-to-right, top-to-bottom spells the sentence
    // Last tile is null (blank)
    const lastIsBlank = tiles[tiles.length - 1] === null;
    if (!lastIsBlank) return;
    onSubmit(tiles);
  }

  render();
  container.appendChild(gridDiv);
}

// ─── Echo Sequence ───────────────────────────────────────────────────

function renderEchoSequence(container, data, onSubmit) {
  container.appendChild(makeHeader('echo sequence'));

  const info = document.createElement('div');
  info.className = 'puzzle-question';
  info.textContent = 'Watch the sequence, then repeat it.';
  container.appendChild(info);

  const statusDiv = document.createElement('div');
  statusDiv.className = 'echo-status';
  container.appendChild(statusDiv);

  // Symbol buttons
  const btnsDiv = document.createElement('div');
  btnsDiv.className = 'echo-symbols';
  const symbolBtns = data.symbols.map((sym, i) => {
    const btn = document.createElement('button');
    btn.className = 'echo-symbol-btn';
    btn.textContent = sym;
    btn.dataset.index = i;
    btnsDiv.appendChild(btn);
    return btn;
  });
  container.appendChild(btnsDiv);

  let currentRound = 0;
  let playerInput = [];
  let isPlaying = false;
  const allAnswers = [];

  function flashSymbol(idx, duration = 400) {
    return new Promise(resolve => {
      symbolBtns[idx].classList.add('echo-active');
      setTimeout(() => {
        symbolBtns[idx].classList.remove('echo-active');
        setTimeout(resolve, 100);
      }, duration);
    });
  }

  async function playSequence() {
    isPlaying = true;
    statusDiv.textContent = 'the tower speaks...';
    await new Promise(r => setTimeout(r, 600));

    for (const idx of data.sequences[currentRound]) {
      await flashSymbol(idx, 400);
    }

    isPlaying = false;
    statusDiv.textContent = `Round ${currentRound + 1} of 3 — repeat the sequence`;
    playerInput = [];
  }

  function handleClick(idx) {
    if (isPlaying) return;
    playerInput.push(idx);

    // Flash briefly
    symbolBtns[idx].classList.add('echo-active');
    setTimeout(() => symbolBtns[idx].classList.remove('echo-active'), 150);

    const seq = data.sequences[currentRound];
    const pos = playerInput.length - 1;

    if (playerInput[pos] !== seq[pos]) {
      // Wrong! Restart round
      statusDiv.textContent = 'wrong... the tower speaks again...';
      playerInput = [];
      setTimeout(() => playSequence(), 800);
      return;
    }

    if (playerInput.length === seq.length) {
      allAnswers.push([...playerInput]);
      currentRound++;

      if (currentRound >= 3) {
        // Done
        statusDiv.textContent = `the tower taught you: ${data.revealWord}`;
        statusDiv.classList.add('echo-reveal');
        onSubmit(allAnswers);
        return;
      }

      statusDiv.textContent = 'correct... the tower speaks again...';
      setTimeout(() => playSequence(), 800);
    }
  }

  symbolBtns.forEach((btn, i) => {
    btn.addEventListener('click', () => handleClick(i));
  });

  // Start first round
  playSequence();
}

// ─── Seal Breaking ───────────────────────────────────────────────────

function renderSealBreaking(container, data, onSubmit) {
  container.appendChild(makeHeader('seal breaking'));

  const info = document.createElement('div');
  info.className = 'puzzle-question';
  info.textContent = 'Activate all nodes. Clicking a node toggles it and its neighbors.';
  container.appendChild(info);

  const canvasSize = 360;
  const canvas = document.createElement('canvas');
  canvas.width = canvasSize;
  canvas.height = canvasSize;
  canvas.style.cssText = 'display: block; margin: 10px auto; cursor: pointer;';
  container.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  // Build adjacency
  const adj = Array.from({ length: data.nodes.length }, () => []);
  for (const e of data.edges) {
    adj[e.from].push(e.to);
    adj[e.to].push(e.from);
  }

  const litState = data.nodes.map(n => n.lit);
  const clicks = [];

  function draw() {
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvasSize, canvasSize);

    // Draw edges
    ctx.strokeStyle = '#ccc';
    ctx.lineWidth = 1;
    for (const e of data.edges) {
      const a = data.nodes[e.from];
      const b = data.nodes[e.to];
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }

    // Draw nodes
    data.nodes.forEach((node, i) => {
      ctx.beginPath();
      ctx.arc(node.x, node.y, 22, 0, Math.PI * 2);
      ctx.fillStyle = litState[i] ? '#222' : '#ddd';
      ctx.fill();
      ctx.strokeStyle = '#333';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Label
      ctx.fillStyle = litState[i] ? '#fff' : '#bbb';
      ctx.font = 'bold 16px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(node.label, node.x, node.y);
    });
  }

  canvas.addEventListener('click', (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    // Find clicked node
    let clickedId = -1;
    for (let i = 0; i < data.nodes.length; i++) {
      const dx = mx - data.nodes[i].x;
      const dy = my - data.nodes[i].y;
      if (Math.sqrt(dx * dx + dy * dy) < 25) {
        clickedId = i;
        break;
      }
    }

    if (clickedId >= 0) {
      clicks.push(clickedId);
      litState[clickedId] = !litState[clickedId];
      for (const n of adj[clickedId]) {
        litState[n] = !litState[n];
      }
      draw();

      // Check all lit
      if (litState.every(l => l)) {
        onSubmit(clicks);
      }
    }
  });

  draw();
}

// ─── Light Channeling ────────────────────────────────────────────────

function renderLightChanneling(container, data, onSubmit) {
  container.appendChild(makeHeader('light channeling'));

  const info = document.createElement('div');
  info.className = 'puzzle-question';
  info.textContent = 'Click mirrors to rotate them. Guide the light beam from entry to target.';
  container.appendChild(info);

  const cellSize = 60;
  const padding = 40;
  const canvasSize = data.gridSize * cellSize + padding * 2;
  const canvas = document.createElement('canvas');
  canvas.width = canvasSize;
  canvas.height = canvasSize;
  canvas.style.cssText = 'display: block; margin: 10px auto; cursor: pointer;';
  container.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  // Local copy of mirror angles
  const mirrors = data.cells.map(c => ({ ...c }));

  function cellToPixel(x, y) {
    return { px: padding + x * cellSize + cellSize / 2, py: padding + y * cellSize + cellSize / 2 };
  }

  function traceBeam() {
    const path = [];
    let bx, by, dx, dy;
    const gs = data.gridSize;

    if (data.entry.edge === 'left') { bx = 0; by = data.entry.pos; dx = 1; dy = 0; }
    else if (data.entry.edge === 'right') { bx = gs - 1; by = data.entry.pos; dx = -1; dy = 0; }
    else if (data.entry.edge === 'top') { bx = data.entry.pos; by = 0; dx = 0; dy = 1; }
    else { bx = data.entry.pos; by = gs - 1; dx = 0; dy = -1; }

    // Entry point
    const ep = cellToPixel(bx, by);
    let entryPx, entryPy;
    if (data.entry.edge === 'left') { entryPx = padding - 20; entryPy = ep.py; }
    else if (data.entry.edge === 'right') { entryPx = canvasSize - padding + 20; entryPy = ep.py; }
    else if (data.entry.edge === 'top') { entryPx = ep.px; entryPy = padding - 20; }
    else { entryPx = ep.px; entryPy = canvasSize - padding + 20; }
    path.push({ x: entryPx, y: entryPy });

    let hitTarget = false;
    for (let step = 0; step < 50; step++) {
      const p = cellToPixel(bx, by);
      path.push({ x: p.px, y: p.py });

      // Check for mirror at this cell
      const mirror = mirrors.find(m => m.x === bx && m.y === by);
      if (mirror) {
        if (mirror.angle === '/') { [dx, dy] = [-dy, -dx]; }
        else if (mirror.angle === '\\') { [dx, dy] = [dy, dx]; }
      }

      bx += dx;
      by += dy;

      if (bx < 0 || bx >= gs || by < 0 || by >= gs) {
        // Beam exits grid — check if at target
        if (data.target.edge === 'right' && bx >= gs && by === data.target.pos) hitTarget = true;
        if (data.target.edge === 'left' && bx < 0 && by === data.target.pos) hitTarget = true;
        if (data.target.edge === 'bottom' && by >= gs && bx === data.target.pos) hitTarget = true;
        if (data.target.edge === 'top' && by < 0 && bx === data.target.pos) hitTarget = true;

        // Add exit point
        const exitP = cellToPixel(
          Math.max(0, Math.min(gs - 1, bx)),
          Math.max(0, Math.min(gs - 1, by))
        );
        if (data.target.edge === 'right' && bx >= gs) path.push({ x: canvasSize - padding + 20, y: exitP.py });
        else if (data.target.edge === 'left' && bx < 0) path.push({ x: padding - 20, y: exitP.py });
        else if (data.target.edge === 'bottom' && by >= gs) path.push({ x: exitP.px, y: canvasSize - padding + 20 });
        else if (data.target.edge === 'top' && by < 0) path.push({ x: exitP.px, y: padding - 20 });
        break;
      }
    }
    return { path, hitTarget };
  }

  function draw() {
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvasSize, canvasSize);

    // Grid
    ctx.strokeStyle = '#eee';
    ctx.lineWidth = 1;
    for (let x = 0; x <= data.gridSize; x++) {
      ctx.beginPath();
      ctx.moveTo(padding + x * cellSize, padding);
      ctx.lineTo(padding + x * cellSize, padding + data.gridSize * cellSize);
      ctx.stroke();
    }
    for (let y = 0; y <= data.gridSize; y++) {
      ctx.beginPath();
      ctx.moveTo(padding, padding + y * cellSize);
      ctx.lineTo(padding + data.gridSize * cellSize, padding + y * cellSize);
      ctx.stroke();
    }

    // Entry marker
    const ep = cellToPixel(
      data.entry.edge === 'left' ? 0 : data.entry.edge === 'right' ? data.gridSize - 1 : data.entry.pos,
      data.entry.edge === 'top' ? 0 : data.entry.edge === 'bottom' ? data.gridSize - 1 : data.entry.pos
    );
    ctx.font = 'bold 20px monospace';
    ctx.fillStyle = '#333';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (data.entry.edge === 'left') ctx.fillText('\u25b6', padding - 20, ep.py);
    else if (data.entry.edge === 'right') ctx.fillText('\u25c0', canvasSize - padding + 20, ep.py);

    // Target marker
    const tp = cellToPixel(
      data.target.edge === 'left' ? 0 : data.target.edge === 'right' ? data.gridSize - 1 : data.target.pos,
      data.target.edge === 'top' ? 0 : data.target.edge === 'bottom' ? data.gridSize - 1 : data.target.pos
    );
    if (data.target.edge === 'right') ctx.fillText('\u2605', canvasSize - padding + 20, tp.py);
    else if (data.target.edge === 'left') ctx.fillText('\u2605', padding - 20, tp.py);

    // Draw mirrors
    for (const m of mirrors) {
      const p = cellToPixel(m.x, m.y);
      ctx.font = 'bold 28px monospace';
      ctx.fillStyle = m.type === 'fixed' ? '#999' : '#222';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(m.angle, p.px, p.py);
      if (m.type === 'rotatable') {
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 1;
        ctx.strokeRect(p.px - cellSize / 2 + 4, p.py - cellSize / 2 + 4, cellSize - 8, cellSize - 8);
      }
    }

    // Trace and draw beam
    const { path, hitTarget } = traceBeam();
    ctx.strokeStyle = hitTarget ? '#222' : '#aaa';
    ctx.lineWidth = hitTarget ? 3 : 2;
    ctx.setLineDash(hitTarget ? [] : [4, 4]);
    ctx.beginPath();
    for (let i = 0; i < path.length; i++) {
      if (i === 0) ctx.moveTo(path[i].x, path[i].y);
      else ctx.lineTo(path[i].x, path[i].y);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    return hitTarget;
  }

  canvas.addEventListener('click', (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    // Find clicked mirror
    for (const m of mirrors) {
      if (m.type !== 'rotatable') continue;
      const p = cellToPixel(m.x, m.y);
      if (Math.abs(mx - p.px) < cellSize / 2 && Math.abs(my - p.py) < cellSize / 2) {
        m.angle = m.angle === '/' ? '\\' : '/';
        const hitTarget = draw();
        if (hitTarget) {
          const answer = mirrors
            .filter(mi => mi.type === 'rotatable')
            .map(mi => ({ x: mi.x, y: mi.y, angle: mi.angle }));
          onSubmit(answer);
        }
        return;
      }
    }
  });

  draw();
}

// ─── Trivia (kept for backwards compat) ──────────────────────────────

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
    optionsDiv.appendChild(makeButton(`${String.fromCharCode(65 + i)}. ${opt}`, () => onSubmit(i)));
  });
  container.appendChild(optionsDiv);
}

// ─── Geography (kept for backwards compat) ───────────────────────────

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
    optionsDiv.appendChild(makeButton(`${String.fromCharCode(65 + i)}. ${opt}`, () => onSubmit(i)));
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
    ctx.strokeStyle = '#ddd';
    ctx.lineWidth = 0.5;
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const x = padding + c * spacing, y = padding + r * spacing;
        ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.stroke();
      }
    }
    if (path.length > 1) {
      ctx.strokeStyle = '#222'; ctx.lineWidth = 2; ctx.beginPath();
      for (let i = 0; i < path.length; i++) {
        const r = Math.floor(path[i] / size), c = path[i] % size;
        const x = padding + c * spacing, y = padding + r * spacing;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const id = r * size + c;
        const x = padding + c * spacing, y = padding + r * spacing;
        const inPath = path.includes(id);
        ctx.fillStyle = inPath ? '#111' : '#aaa';
        ctx.beginPath(); ctx.arc(x, y, inPath ? 8 : 6, 0, Math.PI * 2); ctx.fill();
        if (inPath) {
          ctx.fillStyle = '#fff'; ctx.font = '10px monospace';
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(String(path.indexOf(id) + 1), x, y);
        }
      }
    }
  }

  canvas.addEventListener('click', (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    let closestId = -1, closestDist = Infinity;
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const x = padding + c * spacing, y = padding + r * spacing;
        const dist = Math.sqrt((mx - x) ** 2 + (my - y) ** 2);
        if (dist < spacing * 0.4 && dist < closestDist) { closestDist = dist; closestId = r * size + c; }
      }
    }
    if (closestId >= 0 && !path.includes(closestId)) {
      if (path.length === 0) { path.push(closestId); }
      else {
        const lastId = path[path.length - 1];
        const dist = Math.abs(Math.floor(lastId / size) - Math.floor(closestId / size)) +
                     Math.abs(lastId % size - closestId % size);
        if (dist === 1) path.push(closestId);
      }
      drawState();
      if (path.length === size * size) onSubmit(path);
    }
  });

  drawState();

  const controls = document.createElement('div');
  controls.style.cssText = 'text-align: center; margin-top: 8px;';
  controls.appendChild(makeButton('UNDO', () => { path.pop(); drawState(); }));
  controls.appendChild(makeButton('CLEAR', () => { path.length = 0; drawState(); }));
  container.appendChild(controls);
}

// ─── Word Excavation (kept for backwards compat) ─────────────────────

function renderWordExcavation(container, data, onSubmit) {
  container.appendChild(makeHeader('word excavation'));
  const info = document.createElement('div');
  info.className = 'puzzle-question';
  info.textContent = data.hint || 'Find the hidden word in the grid.';
  container.appendChild(info);
  const selected = [];
  const gridDiv = document.createElement('div');
  gridDiv.className = 'word-grid';
  gridDiv.style.cssText = `display: grid; grid-template-columns: repeat(${data.grid[0].length}, 1fr); gap: 2px; max-width: 400px; margin: 10px auto;`;
  const cells = [];
  data.grid.forEach((row, r) => {
    row.forEach((letter, c) => {
      const cell = document.createElement('div');
      cell.className = 'word-cell';
      cell.textContent = letter;
      cell.addEventListener('click', () => {
        const idx = selected.findIndex(s => s.r === r && s.c === c);
        if (idx >= 0) { selected.splice(idx, 1); cell.classList.remove('selected'); }
        else { selected.push({ r, c, letter }); cell.classList.add('selected'); }
        wordDisplay.textContent = selected.map(s => s.letter).join('');
      });
      gridDiv.appendChild(cell);
      cells.push(cell);
    });
  });
  container.appendChild(gridDiv);
  const wordDisplay = document.createElement('div');
  wordDisplay.className = 'word-display';
  container.appendChild(wordDisplay);
  const controls = document.createElement('div');
  controls.style.cssText = 'text-align: center; margin-top: 8px;';
  controls.appendChild(makeButton('SUBMIT', () => onSubmit(selected.map(s => s.letter).join(''))));
  controls.appendChild(makeButton('CLEAR', () => { selected.length = 0; cells.forEach(c => c.classList.remove('selected')); wordDisplay.textContent = ''; }));
  container.appendChild(controls);
}

// ─── Pattern Complete (kept for backwards compat) ────────────────────

function renderPatternComplete(container, data, onSubmit) {
  container.appendChild(makeHeader('pattern complete'));
  const q = document.createElement('div');
  q.className = 'puzzle-question';
  q.textContent = data.question;
  container.appendChild(q);
  const seqDiv = document.createElement('div');
  seqDiv.className = 'pattern-sequence';
  const shapeMap = { circle: '\u25cf', square: '\u25a0', triangle: '\u25b2', diamond: '\u25c6', star: '\u2605', hexagon: '\u2b22' };
  if (data.subType === 'number') {
    data.sequence.forEach(item => { const el = document.createElement('span'); el.className = 'pattern-item'; el.textContent = item; seqDiv.appendChild(el); });
    const m = document.createElement('span'); m.className = 'pattern-item pattern-mystery'; m.textContent = '?'; seqDiv.appendChild(m);
  } else if (data.subType === 'color') {
    data.sequence.forEach(item => { const el = document.createElement('span'); el.className = 'pattern-item pattern-color'; if (item === '?') { el.textContent = '?'; el.classList.add('pattern-mystery'); } else { el.style.backgroundColor = item; } seqDiv.appendChild(el); });
  } else {
    data.sequence.forEach(item => { const el = document.createElement('span'); el.className = 'pattern-item'; if (item === '?') { el.textContent = '?'; el.classList.add('pattern-mystery'); } else { el.textContent = shapeMap[item] || item; } seqDiv.appendChild(el); });
  }
  container.appendChild(seqDiv);
  const optionsDiv = document.createElement('div');
  optionsDiv.className = 'puzzle-options';
  data.options.forEach((opt, i) => {
    const btn = makeButton('', () => onSubmit(i));
    if (data.subType === 'color') { btn.style.cssText = `background:${opt};width:50px;height:50px;border-radius:4px;`; }
    else if (data.subType === 'shape') { btn.textContent = shapeMap[opt] || opt; btn.style.fontSize = '24px'; }
    else { btn.textContent = opt; }
    optionsDiv.appendChild(btn);
  });
  container.appendChild(optionsDiv);
}

// ─── Result feedback ─────────────────────────────────────────────────

export function showPuzzleResult(success, revealText) {
  const overlay = document.getElementById('puzzle-overlay');
  if (!overlay) return;
  const content = document.getElementById('puzzle-content');
  if (!content) return;

  const result = document.createElement('div');
  result.className = success ? 'puzzle-success' : 'puzzle-fail';

  let html = success
    ? '&gt;&gt; CORRECT &lt;&lt;'
    : '&gt;&gt; INCORRECT &lt;&lt;<br><span style="font-size:12px">The growth point flickers...</span>';

  if (success && revealText) {
    html += `<div class="puzzle-reveal">"${revealText}"<br><span>\u2014 absorbed into the tower \u2014</span></div>`;
  } else if (success) {
    html += '<br><span style="font-size:12px">The tower absorbs your contribution...</span>';
  }

  result.innerHTML = html;
  content.innerHTML = '';
  content.appendChild(result);

  setTimeout(() => { hidePuzzle(); }, success ? 2500 : 1500);
}
