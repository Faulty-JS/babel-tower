# Puzzle System — Coding Agent Prompt

## Context

You're working on **Babel**, a multiplayer browser game where anonymous players collectively build a living tower by solving puzzles at glowing growth points. The engine, ASCII shader, multiplayer, and core loop are all working. The puzzle system needs a complete overhaul.

**The current puzzles are generic and disconnected from the world.** Trivia, geography, and pattern-matching feel like a homework app, not an ancient tower. We're replacing them with puzzles that feel like **deciphering secrets the tower is guarding** — tactile, spatial, deductive, and deeply thematic.

**Critical new direction: The tower feeds on the internet.** Puzzle content should be sourced from live APIs (Wikipedia, Wikidata, REST Countries) so the tower feels alive and connected to real human knowledge. The mechanics stay tactile and ancient-feeling, but the *content* — the phrases you decode, the images you reassemble, the words you uncover — comes from the living web. The tower is an artifact absorbing all of human knowledge.

---

## Design Philosophy

Every puzzle should feel like the player is:
- Cracking an ancient lock
- Deciphering an inscription carved from real human knowledge
- Channeling energy through the tower's bones
- Learning a dead language that speaks in fragments of Wikipedia
- Activating something dormant in the walls

**NOT** like they're:
- Taking a quiz
- Playing a mobile ad
- Doing homework

The puzzles are **tactile and spatial** (rotating, sliding, connecting) or **deductive** (working something out step by step). The *mechanics* are ancient. The *content* is the living internet.

**Quick to play:** 15-60 seconds each. Bite-sized encounters, not brain-melting ordeals.

**Difficulty scales with floor number:** Higher floors = larger grids, more complex configurations, tighter constraints. The `difficulty` parameter (`easy`, `medium`, `hard`) controls this.

---

## Internet Integration: The Content Layer

The server maintains a **content pool** that continuously fetches and caches diverse content from the web. This pool feeds into every puzzle type that needs text, images, or facts.

### Content Sources (all free, no auth, CORS-enabled)

| Source | API | What we pull | Cache strategy |
|--------|-----|-------------|----------------|
| Wikipedia | `https://en.wikipedia.org/api/rest_v1/page/random/summary` | Article titles, first sentences, thumbnail images | Pool 20+, refill in background |
| Wikidata | `https://www.wikidata.org/w/api.php?action=wbsearchentities` | Structured facts (height of X, capital of Y) | Pool 20+ |
| REST Countries | `https://restcountries.com/v3.1/all?fields=name,capital,flags` | Country names, capitals, flag images | Cache all on startup (it's small) |
| OpenTriviaDB | `https://opentdb.com/api.php?amount=10` | Trivia Q&A pairs (repurposed as cipher/inscription content) | Pool 10+ per difficulty |

### Content Pool Implementation (`server/content-pool.js` — NEW FILE)

```js
// Create a new file: server/content-pool.js
// This centralizes all API fetching so puzzle generators just call:
//   getRandomSentence()    → "The Eiffel Tower is a wrought-iron lattice tower in Paris"
//   getRandomTitle()       → "Kepler-442b"
//   getRandomImageUrl()    → "https://upload.wikimedia.org/..."
//   getRandomFact()        → { subject: "Mount Everest", property: "height", value: "8849m" }
//   getRandomCountry()     → { name: "Japan", capital: "Tokyo", flag: "https://..." }
//
// Each function pulls from a pre-fetched pool. If the pool is empty, falls back to
// a curated static list (so the game ALWAYS works even if APIs are down).
//
// Background refill: every 30 seconds, check pool sizes and top up any below threshold.
```

**Fallback is critical.** If Wikipedia is slow or down, every puzzle must still work using static fallback content. The static lists should be thematic: ancient civilizations, astronomy, mythology, architecture, natural wonders.

### Static Fallback Lists

Include these directly in `content-pool.js`:

```js
const FALLBACK_SENTENCES = [
  "The Great Library of Alexandria was one of the largest libraries of the ancient world",
  "A neutron star is the collapsed core of a massive supergiant star",
  "The Rosetta Stone was carved in 196 BC with a decree in three scripts",
  "The Voyager 1 spacecraft is the most distant human-made object from Earth",
  "Cuneiform is one of the earliest known systems of writing",
  // ... 50+ more covering science, history, mythology, architecture, nature
];

const FALLBACK_TITLES = [
  "Andromeda Galaxy", "Rosetta Stone", "Fibonacci Sequence", "Hammurabi",
  "Sagrada Família", "Pangaea", "Nikola Tesla", "Machu Picchu",
  // ... 50+ more
];
```

---

## Current State of the Code

### Files to modify:

**`server/puzzle-validator.js`** — Contains `generatePuzzle(floor)` which picks a random type and generates puzzle data. Also contains `validateSolution(puzzle, submission)`. Currently has 5 implemented types (trivia, geography, glyph_trace, word_excavation, pattern_complete).

- The `implemented` array on line 19 controls which types can be rolled
- Each generator returns `{ type, data, answer }` — `data` goes to client, `answer` stays on server
- Uses `puzzle-cache.js` for pooling API-sourced puzzles

**`client/puzzle-ui.js`** — Contains `showPuzzle(puzzle, onSubmit, onClose)` which routes to a renderer per type. Each renderer builds DOM in a container, handles input, and calls `onSubmit(answer)`.

- Helper functions: `makeButton(text, onClick)`, `makeHeader(type)`, `createContent(overlay)`
- The overlay exits pointer lock when shown (line 31-33)
- ESC to close is already handled globally (lines 12-17)

**`index.html`** — CSS for puzzle UI is in the `<style>` block. Current styles: `.puzzle-header`, `.puzzle-question`, `.puzzle-options`, `.puzzle-btn`, `.puzzle-success`, `.puzzle-fail`, `.word-cell`, `.pattern-sequence`, etc.

### Files to create:
- **`server/content-pool.js`** — Centralized API fetching and content pooling (see above)

### What to keep:
- **Glyph Trace** — The dot-connection puzzle. Already feels right. Keep as-is.
- The shared infrastructure: `showPuzzle`/`hidePuzzle`, `makeButton`/`makeHeader`, overlay mechanics, ESC handling, `showPuzzleResult`, `validateSolution`.
- The cache pool system in `puzzle-cache.js`.

### What to replace:
- **Remove** `trivia`, `geography`, `pattern_complete`, and `word_excavation` from the `implemented` array. Leave their code (don't delete), but they shouldn't be rollable.
- **Add** the 7 new puzzle types below.
- Update the fallback in `generatePuzzle`'s catch block to `generateGlyphPuzzle(difficulty)`.

---

## The 8 Puzzle Types

### 1. Glyph Trace ✅ (ALREADY IMPLEMENTED — keep as-is)
**Feel:** Tracing an ancient rune carved into stone.
**Internet integration:** None needed — this one works as pure procedural generation.
- Grid of dots. Player clicks dots in sequence to draw a single-stroke Hamiltonian path.
- Difficulty: easy=3×3, medium=4×4, hard=5×5.
- Already working. Don't touch it.

---

### 2. Rune Lock 🔒 (NEW)
**Feel:** Cracking a combination lock on an ancient sealed door.

**Internet integration:** The target symbols at the keyhole spell out the first few characters of a Wikipedia article title. When solved, the title briefly displays: *"You unsealed: Kepler-442b"*. This tiny reward makes each puzzle feel like it unlocked a piece of real knowledge.

**Mechanic:** 2-4 concentric rings of symbols. Each ring can be rotated (clicking rotates it one position). The player must align all rings so the symbols at a marked position match a target pattern shown above the lock.

**Server (`generateRuneLockPuzzle`):**
```
Fetch a short Wikipedia title via content pool: getRandomTitle()
Take the first 2-4 characters (matching number of rings)
Map each character to a symbol from the pool
Build rings of 5-8 symbols each, ensuring the target symbol is in each ring
Randomize starting rotations (ensure not already solved)
Answer: array of rotation counts needed to solve
Also include: revealText (the Wikipedia title) — sent to client AFTER solve
```
- Data: `{ rings: [['◆','●','▲','■','★'], ...], target: ['▲','■','★','◆'], initialRotations: [3, 1, 0, 2] }`
- Answer: `[rotationForRing0, rotationForRing1, ...]`
- Bonus data (sent with puzzleResult on success): `{ revealText: "Kepler-442b" }`

**Client (`renderRuneLock`):**
- Draw concentric rings as horizontal rows of symbols
- Each row is a ring. One column is highlighted as the "keyhole"
- Target symbols shown above the keyhole column
- Click a ring row to rotate it (shift symbols left by 1, wrapping)
- When all keyhole symbols match the target → auto-submit

**Validation:** Check that symbols at the keyhole position match the target.

---

### 3. Light Channeling 💡 (NEW)
**Feel:** Guiding sacred light through the tower's stone corridors to illuminate a hidden word.

**Internet integration:** When the beam reaches the target, a word from a Wikipedia article illuminates along the beam path — like the light is revealing hidden text in the stone. The word is cosmetic, not part of the puzzle mechanic.

**Mechanic:** Grid of cells. A light beam enters from one edge. Some cells contain fixed mirrors. Some have rotatable mirrors the player clicks to toggle (/ or \). Guide the beam to the target.

**Server (`generateLightPuzzle`):**
```
Grid size: easy=4×4, medium=5×5, hard=6×6
Place entry point on one edge, target on another
Place 2-4 fixed mirrors (shown differently from rotatable)
Place 2-4 rotatable mirrors
Generate a valid solution path, then randomize rotatable orientations
Fetch a Wikipedia sentence via content pool for the reveal text
Answer: array of final orientations for each rotatable mirror
```
- Data: `{ gridSize, entry: {edge, pos}, target: {edge, pos}, cells: [{x, y, type, angle}], revealWord: "ANDROMEDA" }`
- Rotatable mirrors: 2 states: `/` and `\`. Click to toggle.

**Client (`renderLightChanneling`):**
- CANVAS-based. Draw grid, mirrors, beam path in real-time
- Fixed mirrors: grey `/` `\`
- Rotatable mirrors: bold black `/` `\`, clickable
- Beam: bright line that traces from entry, bouncing off mirrors
- When beam reaches target → brief reveal of the word along the path, then auto-submit
- Entry: `►`, Target: `★`

**Validation:** Simulate beam on server with submitted mirror angles. Check if it reaches target.

---

### 4. Seal Breaking 🔮 (NEW)
**Feel:** Activating a dormant constellation carved into the wall.

**Internet integration:** Each node in the constellation is labeled with a letter. When all nodes are lit, the letters spell a Wikipedia title — the constellation was a word all along. *"You awakened: PANGAEA"*

**Mechanic:** Lights Out on a graph. Nodes connected by edges. Click a node → toggle it and neighbors. Goal: light them all.

**Server (`generateSealPuzzle`):**
```
Fetch a short title (4-7 chars) via content pool: getRandomTitle()
Number of nodes = number of letters in the title
Generate a connected graph with those nodes, each labeled with a letter
Arrange positions in a roughly circular/organic layout
Start all lit, apply N random clicks to scramble
Record the scrambling clicks as the answer
```
- Data: `{ nodes: [{id, x, y, lit: bool, label: "P"}], edges: [{from, to}], revealText: "PANGAEA" }`
- Answer: array of node IDs to click

**Client (`renderSealBreaking`):**
- CANVAS-based. Draw nodes as circles with letter labels, edges as lines
- Lit nodes: filled bright with letter visible. Dark nodes: dim outline, letter barely visible
- Click → toggle + neighbors, with brief pulse
- When all lit → letters glow, word revealed, auto-submit

**Validation:** Simulate clicks on initial state. Check all nodes lit.

---

### 5. Echo Sequence 🔊 (NEW)
**Feel:** Learning the tower's language by repeating what it whispers.

**Internet integration:** The symbols in each round correspond to letters. After all 3 rounds, the combined sequence spells a word from Wikipedia. *"The tower taught you: QUASAR"*

**Mechanic:** Simon Says with ancient symbols. Tower shows a sequence, player repeats it. 3 rounds of increasing length.

**Server (`generateEchoPuzzle`):**
```
Fetch a word (5-7 chars) via content pool: getRandomTitle() (pick a short one)
Map each unique letter to a unique symbol from the pool
Build 3 rounds: first 3 letters, first 5 letters, all letters
Answer: the 3 sequences as arrays of symbol indices
```
- Data: `{ symbols: ['◆','●','▲','■','◇'], sequences: [[2,0,1], [2,0,1,3,4], [2,0,1,3,4,0,2]], revealWord: "QUASAR" }`
- Each sequence element is an index into the symbols array

**Client (`renderEchoSequence`):**
- Show symbol buttons in a row. Each has a faint letter beneath it (hidden until final reveal)
- On each round: symbols light up one by one (500ms each)
- Player clicks to repeat. Wrong click → flash, round restarts
- After round 3 → letters reveal beneath symbols, word glows, auto-submit
- Between rounds: *"the tower speaks again..."*

**Validation:** Check player's submitted sequences match exactly.

---

### 6. Stone Slide 🧩 (NEW)
**Feel:** Reassembling a shattered inscription absorbed from the internet.

**Internet integration:** The tiles contain letters that spell a Wikipedia sentence fragment when assembled. You're literally sliding real human knowledge back into order. The solved state reveals: *"The speed of light is approximately 299792 km per s—"* (truncated to fit the grid).

**Mechanic:** Classic sliding tile puzzle (15-puzzle) but tiles show letters/words instead of numbers.

**Server (`generateStoneSlidePuzzle`):**
```
Fetch a sentence via content pool: getRandomSentence()
Truncate to fit grid: easy=3×3 (8 chars + blank), medium=4×4 (15 chars + blank)
Each tile is a character from the sentence (or a short word for larger grids)
Generate solved state, apply N random valid slide moves to shuffle
Answer: the solved tile order
```
- Data: `{ gridSize: 3, tiles: ['T','H','E',' ','S','U','N',' ', null], shuffledOrder: [4,2,0,7,null,3,1,6,5], revealText: "THE SUN " }`
- The solved arrangement reads left-to-right, top-to-bottom as the sentence fragment

**Client (`renderStoneSlide`):**
- Grid of clickable tiles with letters
- One empty space (dark/recessed)
- Click adjacent tile → it slides into gap
- Show faint hint of expected text at bottom (first 2-3 characters visible)
- When solved → sentence glows into view, auto-submit

**Validation:** Array equality of tile positions.

---

### 7. Inscription Reconstruction 📜 (NEW)
**Feel:** Piecing together a shattered tablet of absorbed knowledge.

**Internet integration:** The inscription is a **real sentence from Wikipedia** broken into fragments. When reconstructed, the player reads an actual fact they may not have known. The tower literally teaches you things through its puzzles.

**Mechanic:** Fragments of text need to be placed in the correct positions on a grid/line to reconstruct the original.

**Server (`generateInscriptionPuzzle`):**
```
Fetch a Wikipedia sentence via content pool: getRandomSentence()
Truncate to ~30-60 characters
Split into fragments of 2-4 words each
Assign each fragment a correct position (order in the sentence)
Scramble the fragment order
Answer: correct order of fragment IDs [2, 0, 3, 1]
```
- Data: `{ fragments: [{id: 0, text: "is the collapsed"}, {id: 1, text: "A neutron star"}, {id: 2, text: "core of a"}, {id: 3, text: "massive supergiant star"}], correctOrder: [1, 0, 2, 3] }`
- Difficulty: easy = 3 fragments, medium = 4-5, hard = 6+

**Client (`renderInscriptionReconstruction`):**
- Show empty slots at the top (the tablet)
- Scrambled fragment chips below
- Click a fragment to select it, click a slot to place it
- Click a placed fragment to return it to the pool
- When all slots filled correctly → sentence glows as complete inscription, auto-submit
- Visual: fragments look like broken stone pieces with text carved into them

**Validation:** Check fragment order matches `correctOrder`.

---

### 8. Cipher Wall 🗝️ (NEW)
**Feel:** Decoding a real message carved into the wall using a key the tower provided.

**Internet integration:** The phrase being decoded is a **real sentence from Wikipedia**. The player is literally decrypting real knowledge from ancient-looking cipher text. When solved, they read something true about the world.

**Mechanic:** A substitution cipher. Player sees a symbol→letter key and an encoded message. They decode it letter by letter.

**Server (`generateCipherPuzzle`):**
```
Fetch a sentence via content pool: getRandomSentence()
Truncate to 20-50 characters (short enough to decode quickly)
Extract unique letters from the sentence
Map each to a unique symbol from the pool (◆ ● ▲ ■ ★ ⬢ ◇ ○ △ □ ☆ ⬡ ⊕ ⊗ ⊘ ⊙)
Encode the sentence: replace each letter with its symbol
Spaces and punctuation pass through unencoded
Answer: the original sentence (lowercase, trimmed)
```
- Data: `{ key: {'◆':'t','●':'h','▲':'e',...}, encoded: ['◆','●','▲',' ',...], phraseLength: 35 }`
- Easy: 20 chars, fewer unique letters. Hard: 50 chars, more unique letters.
- **Fallback phrases** if API is down — use thematic phrases:
  "the tower remembers what you have forgotten",
  "every word ever written exists in this library", etc.

**Client (`renderCipherWall`):**
- Cipher key displayed as a clean grid: symbol → letter
- Encoded symbols shown in a row (large, monospace)
- Below: 26 clickable letter buttons (a-z)
- Player clicks letters left-to-right to decode
- Decoded letters appear below each symbol in a "translation row"
- Backspace to undo
- Spaces auto-advance
- When fully decoded → the real sentence is revealed, auto-submit
- Visual: archaeological desk feel. The key is a reference card. The symbols are the inscription. You're a translator.

**Validation:** Case-insensitive, trimmed string match.

---

## Growth Point Names — Internet-Sourced

When a player approaches a growth point, the HUD should display its name. Growth points are named after Wikipedia articles. When the server generates growth points (in `tower-state.js`), it should also fetch a random Wikipedia title for each one via the content pool.

```
// In growth point data:
{ id: "gp_5_2", floor: 5, x: 12, y: 62, z: -8, active: true,
  solvesRemaining: 3, name: "The Growth Point of Andromeda" }
```

The client displays: `[E] The Growth Point of Andromeda` when near it. This tiny detail makes the tower feel like it *knows things*.

---

## Ambient Wall Inscriptions — Blended Reality

Currently the tower walls use pure Babel gibberish from `shared/babel-text.js`. Update this so that **1 in 10 wall inscriptions contains a real sentence from the content pool** embedded in Babel text. Like tuning a radio — mostly static, occasionally a real human voice comes through.

Implementation: In `content-pool.js`, export a function `getWallText(floor, angle)` that:
- 90% of the time: returns pure Babel text via `getWallInscription(floor, angle)`
- 10% of the time: returns a real sentence surrounded by Babel text padding

This makes exploring the tower walls genuinely interesting — you might spot a real sentence carved among the noise.

---

## Implementation Checklist

For each new puzzle type:

### Server side (`server/puzzle-validator.js`):
1. Add generator: `async function generateXxxPuzzle(difficulty) { return { type, data, answer } }`
2. Add to `implemented` array and `switch` in `generatePuzzle()`
3. Add validation logic in `validateSolution()` if needed
4. Use `content-pool.js` functions for web content

### Client side (`client/puzzle-ui.js`):
1. Add renderer: `function renderXxx(container, data, onSubmit) { ... }`
2. Add `case` in `showPuzzle()` switch
3. Include the "reveal" moment — after correct solve, briefly show the real-world text before closing

### New file (`server/content-pool.js`):
1. Implement pool management for Wikipedia sentences, titles, images, facts, countries
2. Background refill loop (every 30 seconds)
3. Static fallback lists (50+ entries per category)
4. Export: `getRandomSentence()`, `getRandomTitle()`, `getRandomImageUrl()`, `getRandomFact()`, `getRandomCountry()`, `getWallText(floor, angle)`

### CSS (`index.html` `<style>` block):
1. Add classes for new puzzle types
2. Add `.puzzle-reveal` class for the post-solve text reveal (centered, slightly larger font, fades in)

### Don't forget:
- Remove `trivia`, `geography`, `pattern_complete`, `word_excavation` from `implemented` array
- Update fallback to `generateGlyphPuzzle(difficulty)`
- Initialize the content pool on server start (call `initContentPool()` from `server/index.js`)
- Add the `revealText` pattern: on successful solve, send the revealed text back to the client in the `puzzleResult` message so it can display briefly before closing

---

## The Reveal Moment

This is a subtle but important pattern. After every correct solve, the puzzle overlay should briefly show what the player "unlocked" from the internet:

```
>> CORRECT <<
"A neutron star is the collapsed core of a massive supergiant star"
— absorbed into the tower —
```

Then it fades and closes (1.5-2 seconds). This is the payoff: every puzzle teaches you something real. The tower isn't just growing — it's *learning*.

Update `showPuzzleResult()` in `puzzle-ui.js` to accept an optional `revealText` parameter. If present, display it below the CORRECT message in smaller, italicized text.

---

## Technical Constraints

1. **No build step.** Vanilla JS + ES modules. No React, no bundler.
2. **No new npm dependencies.** Server only has `colyseus`, `@colyseus/schema`, `@colyseus/ws-transport`, `express`. Use the built-in `fetch` (Node 18+ has it globally).
3. **Each puzzle ≤ 200 lines** (server + client combined). If growing larger, simplify.
4. **All answers validated server-side.** Client never sees the answer.
5. **Canvas-based puzzles** (light channeling, seal breaking, echo sequence): `<canvas>`, 2D context, ~300-400px, centered.
6. **DOM-based puzzles** (rune lock, stone slide, cipher wall, inscription): styled `<div>` elements, click-to-interact.
7. **Auto-submit when solved.** No SUBMIT button if completion is detectable.
8. **API calls are server-side only.** Client never hits Wikipedia/etc directly.
9. **Always have fallbacks.** Every puzzle must work even if all APIs are down. The content pool's static lists are the safety net.
10. **Puzzle data must be JSON-serializable.** No functions, no circular references.

## Visual Style

All puzzle UI renders inside `#puzzle-content` (white background, 1px #ccc border, monospace font).

- **Symbols:** ◆ ● ▲ ■ ★ ⬢ ◇ ○ △ □ ☆ ⬡ ⊕ ⊗ ⊘ ⊙
- **Canvas puzzles:** White bg, black strokes, minimal. Active elements slightly warmer (#444 vs #bbb).
- **DOM puzzles:** Follow `.puzzle-btn` style. Hover: background #eee, border #333.
- **Headers:** `// RUNE LOCK`, `// CIPHER WALL`, etc.
- **No color.** Black, white, greys only. ASCII shader handles the rest.
- **The reveal text** after solving: centered, 14px, slightly italic feel (use `font-style: italic` or quotes), fades in over 300ms.
- **Animations:** Minimal. 100-200ms transitions. Brief glow on completion.

## Testing

After implementing each type:
1. Server generates without errors (test with APIs up AND with fallbacks)
2. Client renders correctly and is playable
3. Correct solution → `{ success: true }` + reveal text displays
4. Wrong solution → `{ success: false }`
5. Difficulty scaling works (easy/medium/hard produce different sizes)
6. Each puzzle solvable in under 60 seconds
7. Kill the network and verify fallback content works
8. `implemented` array includes all new types, excludes retired ones

## Implementation Order

1. **`server/content-pool.js`** — Build this first. Everything else depends on it.
2. **Cipher Wall** — Simplest puzzle. Proves the content pool works end-to-end.
3. **Inscription Reconstruction** — Second-simplest. Text fragment ordering.
4. **Rune Lock** — DOM-based symbol rotation.
5. **Stone Slide** — 15-puzzle with letters from content pool.
6. **Echo Sequence** — Simon Says with timed playback.
7. **Seal Breaking** — Lights Out on a graph with letter-labeled nodes.
8. **Light Channeling** — Most complex. Beam sim + mirror rotation + real-time tracing.
9. **Growth point names** — Wire up content pool to `tower-state.js`.
10. **Wall inscriptions** — Blend real sentences into ambient Babel text.
