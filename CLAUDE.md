# BABEL — Coding Agent Prompt

## What This Is

A multiplayer browser game for the **Vibe Coding Game Jam 2026** (deadline: May 1, 2026 @ 13:37 UTC). The theme is "Tower of Babel."

**The game is The Wikipedia Game set inside the Library of Babel.** Players navigate a vast, interconnected museum of knowledge — each room is a Wikipedia article brought to life as a unique 3D environment. You get a word pair (start article → target article) and must find your way from one to the other by walking through portals that link to other articles. Other anonymous players wander the same space on their own journeys. Everyone can speak, but only in Babel gibberish. The entire scene renders through an ASCII art post-processing shader — the world IS made of text.

Think: *Peak* (friendslop game, proximity presence, cozy multiplayer vibes) meets *The Wikipedia Game* (navigate between articles via links) set in *The Library of Babel* (infinite rooms of almost-meaningful text, one coherent signal in oceans of noise).

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
1. Player arrives in the library as an anonymous first-person character
2. The game assigns a **word pair**: a start article and a target article
3. Player is placed in the start article's room — a unique 3D environment generated from the article's content
4. The room has **portals** on the walls (styled as paintings, doorways, or glowing inscriptions) — each leads to a linked Wikipedia article
5. Player reads the room, picks a portal, walks through it → lands in the next article's room
6. Repeat: navigate room to room until you reach the target article
7. **Arrival**: celebration moment, stats reveal (hops taken, time, path), your journey leaves a trace in the world
8. New word pair. Go again.

### The Wikipedia Game Mechanic
- **Word pairs** are curated to be solvable in 3–8 hops. The server picks pairs with known short paths.
- **Each room has 6–12 portals** linking to other articles. Links are curated from the Wikipedia article's actual hyperlinks — filtered to remove stubs, disambiguation pages, and dead ends. Prefer articles that are well-connected hubs.
- **The challenge is knowledge and intuition**: which link gets you closer to your target? "I need to get from *Honey Bee* to *Napoleon*... maybe through *France*?"
- **No time pressure by default.** Exploration is the point. But your hop count and time are tracked for personal stats.
- **The target article name is always visible** in the HUD so you know where you're heading.
- **Breadcrumb trail**: Your path history is shown (start → article 1 → article 2 → ...) so you can see your journey.

### Multiplayer
- **Anonymous**: No login. Player gets a random color on join. No usernames.
- **Shared world**: All players exist in the same library. If two players are in the same article-room, they see each other.
- **Parallel solo**: Everyone has their own word pair. You see others exploring, but you're on your own journey.
- **Proximity presence**: Other players render as simple geometric silhouettes with their assigned color. Seeing someone else in a room tells you this article is on *someone's* path.
- **Babel Chat**: Players CAN type messages, but all text displays above their head as **Library of Babel gibberish**. Same input always produces the same gibberish (deterministic). You're in the Library of Babel — comprehension is not guaranteed.

### The Library (3D World)

The library is an infinite network of rooms. Each room is a Wikipedia article.

**Room generation from article content:**
- The server fetches the article's opening paragraph via the Wikipedia API.
- **Keywords from the paragraph seed the room's procedural layout.** Simple keyword-to-environment mapping:
  - Nature words (ocean, mountain, forest, river) → organic terrain, flowing shapes, natural colors
  - Science words (atom, star, cell, quantum) → geometric/crystalline structures, glowing elements
  - History words (war, king, empire, ancient) → stone architecture, columns, arches, grand scale
  - Art/culture words (music, painting, dance, film) → flowing curves, warm tones, gallery-like space
  - Technology words (computer, engine, digital, machine) → angular geometry, grid patterns, metallic surfaces
  - Geography words (city, country, island, capital) → landscape features, maps on walls, terrain variation
  - Default → classic hexagonal library chamber (Borges-style)
- **Room size scales with article importance** — a room for "United States" is a grand hall; a room for "Honey Bee" is an intimate chamber.
- **Babel text covers every surface** — walls, floors, pillars are inscribed with Library of Babel gibberish. But the article's actual opening paragraph appears as a legible inscription in a prominent location (a plaque, a tablet, text floating in the center).
- **The article title** is inscribed above the main entrance.

**Portals (links to other articles):**
- Portals are the primary interactive element. They appear as **glowing rectangular frames on the walls**, like paintings or doorways.
- Each portal displays the linked article's title.
- Walking into a portal transitions you to that article's room.
- Portals have a subtle glow/shimmer. Portals that lead toward more connected articles glow brighter.
- **Transition**: brief dissolve/fall through Babel text, then the new room materializes. Should feel like turning a page.

### Aesthetic: ASCII Art Shader
- **The entire 3D scene renders through an ASCII post-processing shader.** This is the defining visual style.
- The shader maps brightness to ASCII characters. Dark areas are spaces/dots, bright areas are dense characters like `#`, `@`, `%`.
- The ASCII look ties directly into the text/language theme of Babel — the world IS made of text.
- Characters have a slight color tint from the underlying scene (not pure monochrome).
- Pressing **backtick (`)** toggles ASCII on/off for debugging.
- **This shader needs iteration to look good.** Experiment with: character size, character sets, color mapping, fog behavior through ASCII, portal glow effects.

### Win State (Reaching Your Target)
When you arrive in your target article's room:
1. **Celebration**: visual flash, particles (ASCII confetti), satisfying sound. The room briefly lights up.
2. **Stats reveal**: overlay showing your path (each article visited), total hops, time taken, and the optimal shortest path for comparison.
3. **World contribution**: your completed path leaves a faint luminous trail in the rooms you passed through — other players can see the ghostly traces of past journeys. Rooms that many players have passed through glow subtly warmer.
4. **New pair**: after a moment, a new word pair appears and you're off again.

### Library of Babel Integration
- **Babel text generator** is in `shared/babel-text.js` (already implemented).
- Uses a seeded PRNG to deterministically generate text from the Babel alphabet (a-z, space, comma, period).
- **Ambient inscriptions**: Every surface in the library is covered in Babel text. Use article title + position as seed for consistency.
- **Chat babelification**: Player messages transformed via `babelify(message, sessionId)`.
- **Room flavor text**: Babel text fills the space between real article content and portals.
- The feeling: you're in an infinite library where almost everything is nonsense, but each room contains one true page — the Wikipedia article — and the portals are your way of navigating between islands of meaning.

---

## Technical Architecture

### Client (Three.js + vanilla JS, no build step)
```
index.html          — Shell, pointer lock, import map
main.js             — Scene setup, render loop, room rendering, movement, ASCII post-processing
ascii-shader.js     — Custom GLSL shader for ASCII rendering (KEEP AS-IS)
client/
  network.js        — Colyseus WebSocket client
  players.js        — Remote player rendering and interpolation
  room-renderer.js  — Procedural room generation from article data
  portal-ui.js      — Portal rendering and interaction
  hud.js            — Word pair display, breadcrumb trail, stats
  chat.js           — Chat input UI
shared/
  constants.js      — Shared constants (client + server)
  babel-text.js     — Library of Babel text generator (KEEP AS-IS)
```

- **No build step.** Uses ES modules with import maps. Three.js loaded from CDN.
- **Instant load.** No heavy assets. Rooms are procedural geometry. Textures are minimal or generated.
- Import Three.js from: `https://cdnjs.cloudflare.com/ajax/libs/three.js/0.170.0/three.module.min.js`

### Server (Node.js + Colyseus)
```
server/
  index.js            — Express static server + Colyseus setup
  library-room.js     — Colyseus room definition (THE main room)
  wikipedia-api.js    — Wikipedia API fetching, link extraction, article caching
  word-pairs.js       — Word pair generation (start/target with known paths)
  article-cache.js    — Persistent article data cache (in-memory + optional SQLite)
```

- **Colyseus** for real-time multiplayer (rooms, state sync, message passing).
- **Express** serves static files and handles the Colyseus upgrade.
- Dependencies in `package.json`: `colyseus`, `@colyseus/schema`, `@colyseus/ws-transport`, `express`.
- **No SQLite required for MVP** — article data can be cached in-memory. Add persistence later if needed.

### Network Protocol (Colyseus messages)

**Client → Server:**
| Message | Payload | When |
|---------|---------|------|
| `position` | `{ x, y, z, rotationY, currentArticle }` | Every tick (~20/sec) |
| `enterPortal` | `{ targetArticle }` | Player walks into a portal |
| `requestNewPair` | `{}` | Player wants a new word pair (or on first join) |
| `chat` | `{ message }` | Player sends chat |

**Server → Client:**
| Event | Payload | When |
|-------|---------|------|
| State: `players` | Map of `{ x, y, z, rotationY, color, currentArticle }` | Continuous sync |
| `articleData` | `{ title, extract, links[], keywords[], thumbnail? }` | When player enters a room |
| `wordPair` | `{ start, target, optimalHops }` | On join or new pair request |
| `chatBubble` | `{ sessionId, babelText }` | Player chat (babelified) |
| `journeyComplete` | `{ path[], hops, timeMs, optimalHops }` | Player reached target |

### Room Rendering (Client-Side)

Each article-room is generated procedurally on the client from data the server provides:

1. **Server sends `articleData`**: title, opening paragraph (extract), list of link titles, keyword categories, optional thumbnail URL.
2. **Client's `room-renderer.js`** takes this data and builds a Three.js scene:
   - Base room geometry selected by keyword category (hexagonal chamber, grand hall, organic cave, crystalline structure, etc.)
   - Room scale proportional to number of links (more links = bigger room)
   - Babel text inscribed on walls (procedural via babel-text.js)
   - Article extract displayed as a legible plaque/inscription
   - Portals placed on walls, each labeled with a linked article title
   - Ambient lighting tinted by keyword category
3. **Transition between rooms**: fade to white/black, brief Babel text cascade, new room fades in. Keep it fast (<1 second).

### Player Movement & Physics
- First-person: WASD + mouse look (pointer lock)
- Simple gravity + floor collision
- Space to jump
- Rooms are enclosed spaces — collision with walls
- Portal trigger: walk into a portal frame → `enterPortal` message to server
- No complex physics engine needed

### Wikipedia API Strategy

**Fetching articles:**
- Use `https://en.wikipedia.org/api/rest_v1/page/summary/{title}` for article extract + thumbnail
- Use `https://en.wikipedia.org/w/api.php?action=parse&page={title}&prop=links&format=json` for extracting links
- All fetching happens server-side to handle CORS and caching

**Link curation (server-side):**
- From each article, extract all internal Wikipedia links
- Filter out: disambiguation pages, stub articles, list pages, meta/talk pages
- Prefer links that appear in the first 2-3 paragraphs (most relevant)
- Cap at 6–12 links per room
- Each link is verified to be a real article (exists in Wikipedia)

**Word pair generation:**
- Maintain a pool of well-known articles (top ~5000 by pageviews)
- Pick start and target from this pool
- Use BFS or pre-computed shortest paths to ensure the pair is solvable in 3–8 hops
- Store computed paths for stats comparison
- Fallback: curated list of 100+ known-good word pairs

**Caching:**
- Cache article data (extract, links) in server memory
- TTL: 1 hour (Wikipedia content doesn't change fast)
- Pre-warm cache with popular articles on server start
- Maximum cache size: ~10,000 articles

---

## Implementation Priority

Build in this order. Each phase should produce something playable.

### Phase 1: Single Room Prototype
**Goal:** Stand in a procedurally generated room, see portals, walk through one to enter a new room.
1. Simplify `main.js` — remove all tower/growth-point code, keep scene + camera + movement + ASCII shader
2. Build `client/room-renderer.js` — generate a room from article data (hardcoded initially)
3. Build portal rendering and interaction (walk into portal → load new room)
4. Build `server/wikipedia-api.js` — fetch article data + links from Wikipedia API
5. Wire it up: server fetches article data → sends to client → client renders room
6. HUD: show current article title + target article

### Phase 2: The Wikipedia Game
**Goal:** Get a word pair, navigate rooms, reach the target, see stats.
1. Build `server/word-pairs.js` — generate solvable word pairs
2. Implement the full navigation flow: start room → portal → new room → ... → target room
3. Win state: celebration, stats overlay, path visualization
4. Breadcrumb trail in HUD
5. New pair assignment after completion

### Phase 3: Multiplayer
**Goal:** Multiple browser tabs see each other in the same library.
1. Build `server/library-room.js` (Colyseus room) — track players, their positions, and current articles
2. Player position sync — see other players as silhouettes in the same article-room
3. Babel chat with proximity (chat bubbles above heads)
4. Server-authoritative room transitions

### Phase 4: Polish & Ship
**Goal:** Ship-ready for the jam.
1. Room variety — make the keyword-to-environment mapping richer and more visually distinct
2. Room transitions (dissolve/cascade effect)
3. World traces — completed journeys leave faint trails
4. Sound design (ambient library hum, portal whoosh, arrival celebration) — minimal
5. ASCII shader polish for the new environments
6. Performance: room geometry cleanup, efficient caching
7. Deploy to hosting (Fly.io, Railway, or similar)

---

## Critical Constraints

1. **NO LOGIN. NO SIGNUP.** Player opens the URL and is immediately in the library.
2. **INSTANT LOAD.** No loading screens. Rooms are procedural geometry. First room loads fast, subsequent rooms pre-fetch.
3. **ASCII SHADER IS NON-NEGOTIABLE.** The entire game renders through the ASCII post-processing effect. This is the visual identity.
4. **90% AI-GENERATED CODE.** Jam rule.
5. **MULTIPLAYER MUST WORK.** Multiple players in the same library, seeing each other in shared rooms.
6. **WIKIPEDIA CONTENT IS REAL.** Every room is a real Wikipedia article. Every portal leads to a real linked article. The content is genuine human knowledge.
7. **BABEL CHAT IS MANDATORY.** Players can type but output is gibberish. Thematically essential.
8. **KEEP IT LIGHTWEIGHT.** No React, no webpack, no heavy frameworks. Vanilla JS + Three.js + Colyseus.
9. **ROOMS MUST FEEL DIFFERENT.** Each article-room should have a distinct character seeded by the article's content. Not just re-skinned boxes.
10. **THE VIBE IS: infinite, quiet, scholarly, strange.** You're wandering an impossible library where every room holds one fragment of truth surrounded by oceans of beautiful nonsense. Other silent figures drift past on their own quests. You don't know where they're going. They don't know where you're going. But you're all here, in the library, together.

---

## Existing Code Status (Post-Pivot)

| File | Status | Action |
|------|--------|--------|
| `index.html` | Reusable shell | Strip puzzle/tower CSS, add room/portal/HUD styles |
| `main.js` | Partially reusable | Keep: scene, camera, movement, ASCII post-proc, pointer lock. Remove: tower geometry, growth points, puzzle interaction. Add: room loading, portal interaction. |
| `ascii-shader.js` | **KEEP AS-IS** | The shader is the game's identity. No changes needed. |
| `shared/constants.js` | Needs rewrite | Remove tower/puzzle constants, add room/portal/wikipedia constants |
| `shared/babel-text.js` | **KEEP AS-IS** | Used for room inscriptions and chat. |
| `server/index.js` | Partially reusable | Keep Express + Colyseus skeleton. Remove tower-state references. |
| `server/tower-state.js` | **DELETE** | Replaced by room/article logic |
| `server/tower-room.js` | **REPLACE** → `library-room.js` | New Colyseus room for library navigation |
| `server/puzzle-validator.js` | **DELETE** | No more puzzles |
| `server/puzzle-cache.js` | **REPURPOSE** → `article-cache.js` | Same caching pattern, different data |
| `server/content-pool.js` | **DELETE** | Replaced by wikipedia-api.js |
| `server/db.js` | **REMOVE for MVP** | May re-add later for persistent journey traces |
| `client/network.js` | Needs rewrite | New message types for room navigation instead of puzzles |
| `client/players.js` | **Mostly reusable** | Player silhouettes + chat bubbles carry over |
| `client/puzzle-ui.js` | **DELETE** | No more puzzles |
| `client/chat.js` | **KEEP** | Chat UI carries over |

---

## External APIs

| API | URL | Auth | CORS | Use |
|-----|-----|------|------|-----|
| Wikipedia REST | `https://en.wikipedia.org/api/rest_v1/page/summary/{title}` | None | Yes | Article extract, thumbnail |
| Wikipedia Action | `https://en.wikipedia.org/w/api.php` | None | Yes | Link extraction, page existence checks |

Wikipedia allows 50k requests/hour with a proper User-Agent header. Cache aggressively server-side to stay well within limits.

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
│   ├── network.js          — Colyseus client (room navigation messages)
│   ├── players.js          — Remote player silhouettes + chat bubbles
│   ├── room-renderer.js    — Procedural room generation from article data
│   ├── portal-ui.js        — Portal rendering and interaction
│   ├── hud.js              — Word pair, breadcrumbs, stats overlay
│   └── chat.js             — Chat input UI
├── shared/
│   ├── constants.js        — Shared constants
│   └── babel-text.js       — Library of Babel text generator
└── server/
    ├── index.js            — Express + Colyseus setup
    ├── library-room.js     — Colyseus room (player sync, room transitions)
    ├── wikipedia-api.js    — Wikipedia fetching + link extraction
    ├── word-pairs.js       — Word pair generation with path validation
    └── article-cache.js    — In-memory article data cache
```
