# BABEL — Coding Agent Prompt

## What This Is

A multiplayer browser game for the **Vibe Coding Game Jam 2026** (deadline: May 1, 2026 @ 13:37 UTC). The theme is "Tower of Babel" — anonymous players collectively build a living tower by solving diverse puzzles at glowing growth points. The entire scene renders through an ASCII art post-processing shader.

**Jam rules:**
- 90% of code must be AI-generated
- Web-based, free-to-play, NO login or signup
- NO loading screens — must load almost instantly
- Multiplayer preferred
- Three.js recommended
- Hosted on the web (preferably custom domain)
- Prizes: $20k / $10k / $5k

---

## The Game

### Core Loop
1. Player arrives at the tower as an anonymous first-person character
2. The tower is a living structure that glows where it wants to grow
3. Player climbs to a glowing growth point and interacts with it
4. A puzzle materializes — could be trivia, a jigsaw, a spatial challenge, a word puzzle (type is random, content is sourced from live APIs)
5. Player solves the puzzle → the tower absorbs the contribution and grows at that point
6. New growth points bloom on the fresh edges
7. Player climbs higher, repeats

### Multiplayer
- **Anonymous**: No login. Player gets a random color on join. No usernames.
- **Shared world**: All players see the same tower, same growth points, each other.
- **Passive collaboration**: More players = tower grows faster. No explicit coordination needed.
- **Other players render as simple geometric silhouettes** with their assigned color.
- **Babel Chat**: Players CAN type messages, but all text displays above their head as **Library of Babel gibberish**. Same input always produces the same gibberish (deterministic). The feeling: everyone is trying to talk but no one understands anyone. That's the Babel curse.

### The Living Tower
- The tower is NOT a static structure with a blueprint. It's an organism.
- It **pulses and glows** at its edges where it wants to grow.
- When players solve puzzles at growth points, those areas solidify and the tower extends.
- **Growth points** are the interactive hotspots — glowing orbs/areas at the tower's frontier.
- The tower's shape emerges from collective player choices (which growth points people gravitate toward).
- The tower should feel **massive, ancient, and alive**. Walls are inscribed with Library of Babel text (mostly nonsensical, occasionally haunting).
- The tower persists across sessions (SQLite on the server).

### Aesthetic: ASCII Art Shader
- **The entire 3D scene renders through an ASCII post-processing shader.** This is the defining visual style.
- The shader maps brightness to ASCII characters. Dark areas are spaces/dots, bright areas are dense characters like `#`, `@`, `%`.
- The ASCII look ties directly into the text/language theme of Babel — the world IS made of text.
- Characters should have a slight color tint from the underlying scene (not pure monochrome).
- Pressing **backtick (`)** toggles ASCII on/off for debugging.
- **This shader needs a lot of iteration to look good.** Experiment with: character size, character sets (maybe use Babel alphabet instead of standard ASCII), color mapping, fog behavior through ASCII, glow effects for growth points.

### Puzzle Diversity
The game's replayability comes from puzzle variety. Every growth point gives a random puzzle type with content sourced from live APIs. Puzzle types:

1. **Trivia** (OpenTriviaDB) — Multiple choice questions. Category influences visual feedback.
   - API: `https://opentdb.com/api.php?amount=1&difficulty={easy|medium|hard}`
   - No auth, CORS enabled, free

2. **Image Jigsaw** (Wikipedia) — Random image sliced into tiles, player rearranges them.
   - API: `https://en.wikipedia.org/api/rest_v1/page/random/summary` → get image URL
   - No auth, CORS enabled

3. **Glyph Trace** (original) — Grid of dots, draw a single-stroke path connecting them all.
   - Generated server-side. Difficulty = grid size (3×3 → 5×5).

4. **Word Excavation** (Wikipedia) — Hidden word buried in a letter grid, dig it out.
   - Fetch random Wikipedia article title, embed in generated grid.

5. **Geography** (REST Countries) — Match flags to countries, name capitals, etc.
   - API: `https://restcountries.com/v3.1/all?fields=name,capital,flags`
   - No auth, free

6. **Fragment Assembly** (original) — Drag and rotate broken pieces to reconstruct a shape.
   - Generated server-side. Target shapes get more complex with difficulty.

7. **Pattern Complete** (original) — Visual sequence with a missing element, pick the right one.
   - Generated server-side.

**Each puzzle type should be individually simple (100-200 lines).** The server generates puzzle data and holds the answer. The client renders the puzzle UI and submits the player's solution. Server validates.

**Puzzle UI style**: Monospace font, dark background with green/amber text, minimal chrome. Should feel like it belongs in the ASCII world — not a polished modern UI. Think terminal aesthetic.

### Library of Babel Integration
- **Babel text generator** is in `shared/babel-text.js` (already implemented).
- Uses a seeded PRNG to deterministically generate text from the Babel alphabet (a-z, space, comma, period).
- **Ambient inscriptions**: Tower walls display Babel text. Use `getWallInscription(floor, angle)`.
- **Chat babelification**: Player messages transformed via `babelify(message, sessionId)`.
- Could also be used: growth point names, loading text, any in-world signage.

---

## Technical Architecture

### Client (Three.js + vanilla JS, no build step)
```
index.html          — Shell, pointer lock, import map
main.js             — Scene setup, render loop, movement, ASCII post-processing
ascii-shader.js     — Custom GLSL shader for ASCII rendering
client/
  network.js        — Colyseus WebSocket client
  players.js        — Remote player rendering and interpolation
  puzzle-ui.js      — Puzzle overlay rendering for each type
shared/
  constants.js      — Shared constants (client + server)
  babel-text.js     — Library of Babel text generator
```

- **No build step.** Uses ES modules with import maps. Three.js loaded from CDN.
- **Instant load.** No heavy assets. Tower is procedural geometry. Textures are minimal or generated.
- Import Three.js from: `https://cdnjs.cloudflare.com/ajax/libs/three.js/0.170.0/three.module.min.js`

### Server (Node.js + Colyseus + SQLite)
```
server/
  index.js            — Express static server + Colyseus setup
  tower-state.js      — Authoritative tower data, growth logic
  puzzle-validator.js  — Puzzle generation and server-side validation
```

- **Colyseus** for real-time multiplayer (rooms, state sync, message passing).
- **Express** serves static files and handles the Colyseus upgrade.
- **better-sqlite3** for persisting tower state across server restarts.
- Dependencies in `package.json`: `colyseus`, `@colyseus/ws-transport`, `express`, `better-sqlite3`.

### Network Protocol (Colyseus messages)

**Client → Server:**
| Message | Payload | When |
|---------|---------|------|
| `position` | `{ x, y, z, rotationY }` | Every tick (~20/sec) |
| `requestPuzzle` | `{ growthPointId }` | Player interacts with growth point |
| `submitSolution` | `{ growthPointId, answer }` | Player submits puzzle answer |
| `chat` | `{ message }` | Player sends chat |

**Server → Client (via Colyseus state or broadcasts):**
| Event | Payload | When |
|-------|---------|------|
| State: `players` | Map of `{ x, y, z, rotationY, color }` | Continuous sync |
| State: `growthPoints` | Array of `{ id, x, y, z, active, solvesRemaining }` | On change |
| State: `towerHeight` | `number` | On growth |
| `puzzleData` | `{ type, data }` (no answer!) | Response to requestPuzzle |
| `puzzleResult` | `{ success, grew, newFloor }` | Response to submitSolution |
| `chatBubble` | `{ sessionId, babelText }` | Player chat (babelified) |
| `towerGrew` | `{ floor, growthPoints }` | New floor unlocked |

### Player Movement & Physics
- First-person: WASD + mouse look (pointer lock)
- Simple gravity + floor collision (snap to nearest floor platform)
- Space to jump
- The tower is circular with spiral ramps between floors
- Collision is simple: check distance from center vs. floor radius, check Y vs. floor height
- No complex physics engine needed

---

## Implementation Priority

Build in this order. Each phase should produce something playable.

### Phase 1: Playable Single-Player Prototype
**Goal:** Walk around the tower, approach a growth point, solve a puzzle, see the tower grow.
1. Fix/polish the existing Three.js scene, camera, and movement (`main.js`)
2. Make the ASCII shader look great — this is the game's identity
3. Implement growth point interaction (approach → press E → puzzle opens)
4. Implement at least 2 puzzle types fully (trivia + glyph trace recommended)
5. Wire up growth logic client-side (temporary, before server exists)
6. Add Library of Babel inscriptions on tower walls

### Phase 2: Multiplayer
**Goal:** Multiple browser tabs see each other, shared tower state.
1. `npm install` and get the Colyseus server running
2. Implement the TowerRoom (Colyseus room with schema)
3. Move tower state to server-authoritative
4. Player position sync — see other players as silhouettes
5. Puzzle request/submit flow through server
6. Babel chat

### Phase 3: Polish & Content
**Goal:** Ship-ready for the jam.
1. Implement remaining puzzle types (aim for at least 5 total)
2. Tower growth animation (satisfying visual when the tower extends)
3. Sound design (ambient, puzzle solve, tower growth) — keep it minimal
4. Growth point visual polish (pulsing, particle effects through ASCII)
5. Mobile support (touch controls) if time permits
6. Deploy to a hosting provider (Fly.io, Railway, or similar)
7. Performance testing with many players

---

## Critical Constraints

1. **NO LOGIN. NO SIGNUP.** Player opens the URL and is immediately in the game.
2. **INSTANT LOAD.** No loading screens, no progress bars, no heavy asset downloads. Everything is procedural geometry or loaded lazily.
3. **ASCII SHADER IS NON-NEGOTIABLE.** The entire game renders through the ASCII post-processing effect. This is the visual identity. Make it look good.
4. **90% AI-GENERATED CODE.** This is a jam rule. Just keep building with AI.
5. **MULTIPLAYER MUST WORK.** Multiple players in the same tower, seeing each other, contributing to the same structure.
6. **PUZZLES MUST BE DIVERSE.** The whole point is that you never know what you'll get next. At least 5 puzzle types at launch.
7. **THE TOWER IS ALIVE.** It glows, it pulses, it grows organically. It's not a static structure with a health bar. It's a living thing that players feed.
8. **BABEL CHAT IS MANDATORY.** Players can type but output is gibberish. This is thematically essential, not a nice-to-have.
9. **KEEP IT LIGHTWEIGHT.** No React, no webpack, no heavy frameworks. Vanilla JS + Three.js + Colyseus. The game should feel as lean as its aesthetic.
10. **THE VIBE IS: ancient, mysterious, communal, text-as-material.** Not cute, not corporate, not gamified. Think: discovering a structure that has been building itself since before language existed, and joining the effort without understanding why.

---

## Existing Code Status

| File | Status | Notes |
|------|--------|-------|
| `index.html` | Working scaffold | Pointer lock blocker, import map |
| `main.js` | Working scaffold | Scene, camera, movement, ASCII post-proc, basic tower geometry, growth points |
| `ascii-shader.js` | Working scaffold | GLSL shader with brightness→character mapping. Needs iteration. |
| `shared/constants.js` | Complete | All shared constants defined |
| `shared/babel-text.js` | Complete | Babel text generation, chat babelification, wall inscriptions |
| `server/index.js` | Scaffold only | Express + Colyseus skeleton, needs TowerRoom |
| `server/tower-state.js` | Scaffold with logic | Growth point generation, solve recording. Needs SQLite persistence. |
| `server/puzzle-validator.js` | Scaffold only | Function signatures and flow defined, puzzle generation is TODO |
| `client/network.js` | Scaffold only | Colyseus client interface defined, all methods are TODO |
| `client/players.js` | Scaffold with logic | Player mesh creation, interpolation, chat bubbles. Needs integration. |
| `client/puzzle-ui.js` | Scaffold only | Overlay container, puzzle router. Individual renderers are TODO. |

---

## External APIs Quick Reference

| API | URL | Auth | CORS | Use |
|-----|-----|------|------|-----|
| OpenTriviaDB | `https://opentdb.com/api.php` | None | Yes | Trivia puzzles |
| Wikipedia | `https://en.wikipedia.org/api/rest_v1/page/random/summary` | None | Yes | Images, article titles for word puzzles |
| Wikidata | `https://www.wikidata.org/w/api.php` | None | Yes | Structured facts |
| REST Countries | `https://restcountries.com/v3.1/all` | None | Yes | Geography puzzles |

**Cache API responses server-side** to avoid rate limits and speed up puzzle generation. Wikipedia allows 50k req/hour. OpenTriviaDB has no documented limits but be respectful.

---

## File Tree After Full Implementation

```
babel/
├── index.html
├── main.js
├── ascii-shader.js
├── package.json
├── CLAUDE.md
├── client/
│   ├── network.js
│   ├── players.js
│   ├── puzzle-ui.js
│   └── chat.js              ← Chat input UI
├── shared/
│   ├── constants.js
│   └── babel-text.js
├── server/
│   ├── index.js
│   ├── tower-state.js
│   ├── tower-room.js        ← Colyseus room definition
│   ├── puzzle-validator.js
│   ├── puzzle-cache.js       ← API response caching
│   └── db.js                ← SQLite persistence layer
└── data/
    └── babel.db              ← SQLite database (gitignored)
```
