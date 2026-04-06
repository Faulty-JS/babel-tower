import * as THREE from 'three';
import { AsciiShader, createCharAtlas, ATLAS_INFO } from './ascii-shader.js';
const CELL_SIZE = 10; // cell width; height is 14 (set in shader)
import { NetworkClient } from './client/network.js';
import { PlayerManager } from './client/players.js';
import { ChatUI } from './client/chat.js';
import { HUD } from './client/hud.js';
import { PortalManager } from './client/portal-ui.js';
import { buildRoom, updateRoomAnimations } from './client/room-renderer.js';
import { generateBabelText } from './shared/babel-text.js';
import {
  PLAYER_HEIGHT, MOVE_SPEED, JUMP_FORCE, GRAVITY,
  MOUSE_SENSITIVITY, PLAYER_RADIUS, BASE_ROOM_RADIUS,
  ROOM_HEIGHT, ROOM_CATEGORIES,
} from './shared/constants.js';

// ─── Platformer Physics Tuning ──────────────────────────────────────
const COYOTE_TIME = 0.1;           // seconds after leaving edge you can still jump
const JUMP_BUFFER_TIME = 0.1;      // seconds before landing that jump input is remembered
const JUMP_CUT_MULTIPLIER = 0.35;  // velocity multiplier when releasing jump early
const WALL_SLIDE_SPEED = -6;       // max downward speed when wall sliding
const WALL_JUMP_FORCE_Y = JUMP_FORCE * 1.0;
const WALL_JUMP_FORCE_XZ = MOVE_SPEED * 0.8;
const RESPAWN_Y = -20;             // fall below this = respawn
const GROUND_ACCEL = 50;           // how fast you reach full speed on ground (higher = snappier)
const GROUND_DECEL = 40;           // how fast you stop on ground (higher = less slippery)
const AIR_ACCEL = 8;               // air acceleration (lower = more committed jumps)
const AIR_DECEL = 3;               // air deceleration (low = momentum-preserving)

// ─── State ───────────────────────────────────────────────────────────
const state = {
  camera: null,
  scene: null,
  renderer: null,
  clock: new THREE.Clock(),
  movement: { forward: false, backward: false, left: false, right: false, jump: false },
  euler: new THREE.Euler(0, 0, 0, 'YXZ'),
  velocity: new THREE.Vector3(),
  locked: false,
  asciiEnabled: true,
  onGround: false,
  // Platformer physics
  coyoteTimer: 0,          // time since last grounded (allows late jumps)
  jumpBufferTimer: 0,      // time since jump pressed (allows early jumps)
  jumpHeld: false,          // is jump key still held (variable jump height)
  wallSlideDir: 0,          // -1 or 1 if wall sliding, 0 if not
  lastWallNormalX: 0,
  lastWallNormalZ: 0,
  // Post-processing
  renderTarget: null,
  asciiMaterial: null,
  asciiScene: null,
  asciiCamera: null,
  // Room state
  roomGroup: null,
  roomPortals: [],
  roomPlatforms: [],
  roomRadius: BASE_ROOM_RADIUS,
  roomHeight: ROOM_HEIGHT,
  currentArticle: null,
};

// ─── Modules ─────────────────────────────────────────────────────────
let network = null;
let playerManager = null;
let chatUI = null;
let hud = null;
let portalManager = null;

// ─── Init ────────────────────────────────────────────────────────────
function init() {
  // Renderer
  state.renderer = new THREE.WebGLRenderer({ antialias: false });
  state.renderer.setSize(window.innerWidth, window.innerHeight);
  state.renderer.setPixelRatio(1);
  state.renderer.setClearColor(0x000000);
  document.body.appendChild(state.renderer.domElement);

  // Scene
  state.scene = new THREE.Scene();
  state.scene.background = new THREE.Color(0x000000);
  state.scene.fog = new THREE.FogExp2(0x000000, 0.008);

  // Camera
  state.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 500);
  state.camera.position.set(0, PLAYER_HEIGHT, 0);

  // Post-processing
  setupAsciiPostProcessing();

  // Lighting (will be adjusted per room)
  setupLighting();

  // Modules
  playerManager = new PlayerManager(state.scene);
  hud = new HUD();
  portalManager = new PortalManager();

  portalManager.onEnterPortal = (targetArticle) => {
    loadArticle(targetArticle);
  };

  // Controls
  setupControls();

  // Resize
  window.addEventListener('resize', onResize);

  // Connect to server (or run offline)
  connectToServer();

  // Go
  animate();
}

// ─── ASCII Post-Processing ───────────────────────────────────────────
function setupAsciiPostProcessing() {
  const w = window.innerWidth;
  const h = window.innerHeight;

  state.renderTarget = new THREE.WebGLRenderTarget(w, h, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    format: THREE.RGBAFormat,
  });

  const charAtlas = createCharAtlas(THREE);

  state.asciiMaterial = new THREE.ShaderMaterial({
    uniforms: {
      tDiffuse: { value: state.renderTarget.texture },
      tAtlas: { value: charAtlas },
      resolution: { value: new THREE.Vector2(w, h) },
      cellSize: { value: CELL_SIZE },
      time: { value: 0.0 },
      gridSize: { value: ATLAS_INFO.gridSize },
      totalChars: { value: ATLAS_INFO.totalChars },
    },
    vertexShader: AsciiShader.vertexShader,
    fragmentShader: AsciiShader.fragmentShader,
    depthTest: false,
    depthWrite: false,
  });

  state.asciiCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  state.asciiScene = new THREE.Scene();
  const quad = new THREE.PlaneGeometry(2, 2);
  state.asciiScene.add(new THREE.Mesh(quad, state.asciiMaterial));
}

// ─── Lighting ────────────────────────────────────────────────────────
function setupLighting() {
  const ambient = new THREE.AmbientLight(0xffffff, 1.0);
  state.scene.add(ambient);

  const dir = new THREE.DirectionalLight(0xffffff, 1.2);
  dir.position.set(10, 30, 10);
  state.scene.add(dir);

  const fill = new THREE.DirectionalLight(0xeeeeff, 0.4);
  fill.position.set(-10, 20, -10);
  state.scene.add(fill);

  // Central room light
  const center = new THREE.PointLight(0xffeedd, 0.8, ROOM_HEIGHT * 3);
  center.position.set(0, ROOM_HEIGHT * 0.7, 0);
  state.scene.add(center);
}

// ─── Room Loading ────────────────────────────────────────────────────

function loadRoom(articleData) {
  // Remove old room
  if (state.roomGroup) {
    state.scene.remove(state.roomGroup);
    state.roomGroup = null;
  }

  // Build new room
  const { group, portals, platforms, radius, height } = buildRoom(articleData);
  state.roomGroup = group;
  state.roomPortals = portals;
  state.roomPlatforms = platforms || [];
  state.roomRadius = radius;
  state.roomHeight = height || ROOM_HEIGHT;
  state.currentArticle = articleData.title;
  state.scene.add(group);

  // Update portal manager
  portalManager.setPortals(portals);
  portalManager.transitionComplete();

  // Update HUD
  hud.setArticle(articleData.title);

  // Reset player position to room center
  state.camera.position.set(0, PLAYER_HEIGHT, 0);
  state.velocity.set(0, 0, 0);

  console.log(`[Game] Loaded room: ${articleData.title} (${portals.length} portals)`);
}

function loadArticle(title) {
  if (network && network.connected) {
    network.enterPortal(title);
  } else {
    // Offline: use hardcoded fallback
    loadOfflineArticle(title);
  }
}

// ─── Offline Mode (hardcoded articles for testing) ───────────────────

const OFFLINE_ARTICLES = {
  'Library of Babel': {
    title: 'Library of Babel',
    extract: 'The Library of Babel is a short story by Argentine author and librarian Jorge Luis Borges, conceiving of a universe in the form of a vast library containing all possible 410-page books of a certain format and character set.',
    links: ['Jorge Luis Borges', 'Universe', 'Book', 'Infinity', 'Mathematics', 'Philosophy'],
    category: 'art',
    linkCount: 42,
  },
  'Jorge Luis Borges': {
    title: 'Jorge Luis Borges',
    extract: 'Jorge Francisco Isidoro Luis Borges Acevedo was an Argentine short-story writer, essayist, poet and translator, and a key figure in Spanish-language and international literature.',
    links: ['Argentina', 'Short story', 'Library of Babel', 'Poetry', 'Literature', 'Buenos Aires'],
    category: 'art',
    linkCount: 35,
  },
  'Universe': {
    title: 'Universe',
    extract: 'The universe is all of space and time and their contents, including planets, stars, galaxies, and all other forms of matter and energy.',
    links: ['Space', 'Time', 'Galaxy', 'Star', 'Planet', 'Big Bang', 'Dark matter', 'Library of Babel'],
    category: 'science',
    linkCount: 60,
  },
  'Philosophy': {
    title: 'Philosophy',
    extract: 'Philosophy is the systematized study of general and fundamental questions, such as those about existence, reason, knowledge, values, mind, and language.',
    links: ['Existence', 'Knowledge', 'Ethics', 'Logic', 'Metaphysics', 'Library of Babel'],
    category: 'default',
    linkCount: 50,
  },
};

function loadOfflineArticle(title) {
  const data = OFFLINE_ARTICLES[title];
  if (data) {
    loadRoom(data);
  } else {
    // Generate a generic room for unknown articles
    loadRoom({
      title,
      extract: `This is the room for "${title}". In the full game, this room would be generated from the Wikipedia article's content.`,
      links: Object.keys(OFFLINE_ARTICLES),
      category: 'default',
      linkCount: 6,
    });
  }
}

// ─── Controls ────────────────────────────────────────────────────────
function setupControls() {
  const blocker = document.getElementById('blocker');
  let hasEnteredOnce = false;

  blocker.addEventListener('click', () => {
    document.body.requestPointerLock();
  });

  document.addEventListener('click', (e) => {
    if (hasEnteredOnce && !state.locked &&
        !(chatUI && chatUI.visible) && e.target.tagName === 'CANVAS') {
      document.body.requestPointerLock();
    }
  });

  document.addEventListener('pointerlockchange', () => {
    state.locked = document.pointerLockElement === document.body;

    if (state.locked && !hasEnteredOnce) {
      hasEnteredOnce = true;
    }

    if (chatUI && chatUI.visible) {
      blocker.style.display = 'none';
    } else if (!hasEnteredOnce) {
      blocker.style.display = state.locked ? 'none' : 'flex';
    } else {
      blocker.style.display = 'none';
      if (!state.locked) {
        showResumeHint();
      } else {
        hideResumeHint();
      }
    }
  });

  document.addEventListener('mousemove', (e) => {
    if (!state.locked) return;
    state.euler.setFromQuaternion(state.camera.quaternion);
    state.euler.y -= e.movementX * MOUSE_SENSITIVITY;
    state.euler.x -= e.movementY * MOUSE_SENSITIVITY;
    state.euler.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, state.euler.x));
    state.camera.quaternion.setFromEuler(state.euler);
  });

  document.addEventListener('keydown', (e) => {
    if (chatUI && chatUI.visible) return;

    switch (e.code) {
      case 'KeyW': case 'ArrowUp':    state.movement.forward = true; break;
      case 'KeyS': case 'ArrowDown':  state.movement.backward = true; break;
      case 'KeyA': case 'ArrowLeft':  state.movement.left = true; break;
      case 'KeyD': case 'ArrowRight': state.movement.right = true; break;
      case 'Space':
        state.movement.jump = true;
        state.jumpHeld = true;
        state.jumpBufferTimer = JUMP_BUFFER_TIME;
        e.preventDefault();
        break;
      case 'Backquote':
        state.asciiEnabled = !state.asciiEnabled;
        break;
      case 'KeyT':
        if (chatUI && !chatUI.visible) {
          if (document.pointerLockElement) document.exitPointerLock();
          chatUI.showInput();
        }
        break;
    }
  });

  document.addEventListener('keyup', (e) => {
    switch (e.code) {
      case 'KeyW': case 'ArrowUp':    state.movement.forward = false; break;
      case 'KeyS': case 'ArrowDown':  state.movement.backward = false; break;
      case 'KeyA': case 'ArrowLeft':  state.movement.left = false; break;
      case 'KeyD': case 'ArrowRight': state.movement.right = false; break;
      case 'Space':
        state.movement.jump = false;
        state.jumpHeld = false;
        break;
    }
  });
}

// ─── Network ─────────────────────────────────────────────────────────
async function connectToServer() {
  network = new NetworkClient();
  chatUI = new ChatUI(network);

  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = window.BABEL_SERVER_URL || `${protocol}//${location.host}`;

  network.onInitState = (data) => {
    console.log('[Game] Init state received:', data);
  };

  network.onWordPair = (data) => {
    console.log('[Game] Word pair:', data.start, '→', data.target);
    hud.resetJourney();
    hud.setTarget(data.target);
  };

  network.onArticleData = (data) => {
    console.log('[Game] Article data received:', data.title);
    loadRoom(data);
  };

  network.onArticleError = (data) => {
    console.warn('[Game] Article error:', data.message);
    portalManager.transitionComplete();
  };

  network.onJourneyComplete = async (data) => {
    console.log('[Game] Journey complete!', data);
    // Show win overlay, wait for dismissal, then request new pair
    if (document.pointerLockElement) document.exitPointerLock();
    await hud.showWin(data);
    hud.resetJourney();
    network.requestNewPair();
  };

  network.onPlayerJoin = (sessionId, color) => {
    playerManager.addPlayer(sessionId, color);
    hud.setPlayerCount(playerManager.getPlayerCount() + 1);
  };

  network.onPlayerLeave = (sessionId) => {
    playerManager.removePlayer(sessionId);
    hud.setPlayerCount(playerManager.getPlayerCount() + 1);
  };

  network.onPlayerMove = (sessionId, x, y, z, rotationY) => {
    playerManager.updatePosition(sessionId, x, y, z, rotationY);
  };

  network.onPlayerArticleChange = (sessionId, article) => {
    playerManager.setPlayerArticle(sessionId, article);
  };

  network.onChatBubble = (data) => {
    chatUI.addMessage(data.sessionId, data.babelText);
    playerManager.showChatBubble(data.sessionId, data.babelText);
  };

  const connected = await network.connect(wsUrl);
  if (!connected) {
    console.log('[Game] Running in offline mode');
    // Load starting room offline
    loadOfflineArticle('Library of Babel');
  }
}

// ─── Resume Hint ─────────────────────────────────────────────────────
function showResumeHint() {
  let hint = document.getElementById('resume-hint');
  if (!hint) {
    hint = document.createElement('div');
    hint.id = 'resume-hint';
    hint.textContent = 'click to resume';
    hint.style.cssText = `
      position: fixed; bottom: 50%; left: 50%; transform: translateX(-50%);
      color: #999; font-family: monospace; font-size: 14px;
      z-index: 90; pointer-events: none;
    `;
    document.body.appendChild(hint);
  }
  hint.style.display = 'block';
}

function hideResumeHint() {
  const hint = document.getElementById('resume-hint');
  if (hint) hint.style.display = 'none';
}

// ─── Physics / Movement ──────────────────────────────────────────────
function updateMovement(dt) {
  if (!state.locked) return;

  // ─── Input direction ──────────────────────────────────────
  const dir = new THREE.Vector3();
  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();

  state.camera.getWorldDirection(forward);
  forward.y = 0;
  forward.normalize();
  right.crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

  if (state.movement.forward) dir.add(forward);
  if (state.movement.backward) dir.sub(forward);
  if (state.movement.left) dir.sub(right);
  if (state.movement.right) dir.add(right);
  if (dir.length() > 0) dir.normalize();

  // ─── Horizontal movement (snappy ground, momentum in air) ──
  const targetVx = dir.x * MOVE_SPEED;
  const targetVz = dir.z * MOVE_SPEED;
  const hasInput = dir.length() > 0.01;

  if (state.onGround) {
    // Ground: snap to target speed quickly, stop fast
    const rate = hasInput ? GROUND_ACCEL : GROUND_DECEL;
    state.velocity.x += (targetVx - state.velocity.x) * Math.min(1, rate * dt);
    state.velocity.z += (targetVz - state.velocity.z) * Math.min(1, rate * dt);
  } else {
    // Air: slower steering, preserve momentum
    const rate = hasInput ? AIR_ACCEL : AIR_DECEL;
    state.velocity.x += (targetVx - state.velocity.x) * Math.min(1, rate * dt);
    state.velocity.z += (targetVz - state.velocity.z) * Math.min(1, rate * dt);
  }

  // ─── Timers ───────────────────────────────────────────────
  state.coyoteTimer -= dt;
  state.jumpBufferTimer -= dt;

  if (state.onGround) {
    state.coyoteTimer = COYOTE_TIME;
  }

  // ─── Jump logic ───────────────────────────────────────────
  const canJump = state.coyoteTimer > 0;
  const wantsJump = state.jumpBufferTimer > 0;

  if (canJump && wantsJump) {
    state.velocity.y = JUMP_FORCE;
    state.coyoteTimer = 0;
    state.jumpBufferTimer = 0;
    state.onGround = false;
  }

  // Variable jump height — cut velocity short when releasing
  if (!state.jumpHeld && state.velocity.y > 0) {
    state.velocity.y *= JUMP_CUT_MULTIPLIER;
  }

  // ─── Wall slide & wall jump ───────────────────────────────
  state.wallSlideDir = 0;
  const wallLimit = state.roomRadius - PLAYER_RADIUS - 1.5;
  const distFromCenter = Math.sqrt(
    state.camera.position.x ** 2 + state.camera.position.z ** 2
  );

  if (!state.onGround && distFromCenter > wallLimit - 0.5 && state.velocity.y < 0) {
    // Touching wall while falling — wall slide
    state.wallSlideDir = 1;
    state.velocity.y = Math.max(state.velocity.y, WALL_SLIDE_SPEED);
    state.lastWallNormalX = -state.camera.position.x / distFromCenter;
    state.lastWallNormalZ = -state.camera.position.z / distFromCenter;

    // Wall jump
    if (wantsJump) {
      state.velocity.y = WALL_JUMP_FORCE_Y;
      state.velocity.x = state.lastWallNormalX * WALL_JUMP_FORCE_XZ;
      state.velocity.z = state.lastWallNormalZ * WALL_JUMP_FORCE_XZ;
      state.jumpBufferTimer = 0;
      state.coyoteTimer = 0;
    }
  }

  // ─── Gravity ──────────────────────────────────────────────
  state.velocity.y += GRAVITY * dt;

  // ─── Apply velocity ───────────────────────────────────────
  let newX = state.camera.position.x + state.velocity.x * dt;
  let newZ = state.camera.position.z + state.velocity.z * dt;
  let newY = state.camera.position.y + state.velocity.y * dt;

  // ─── Room boundary collision ──────────────────────────────
  const newDist = Math.sqrt(newX * newX + newZ * newZ);
  if (newDist > wallLimit) {
    const angle = Math.atan2(newZ, newX);
    newX = Math.cos(angle) * wallLimit;
    newZ = Math.sin(angle) * wallLimit;
  }

  // ─── Platform collision ───────────────────────────────────
  const feetY = newY - PLAYER_HEIGHT;
  const prevFeetY = state.camera.position.y - PLAYER_HEIGHT;
  state.onGround = false;

  for (const p of state.roomPlatforms) {
    // AABB: platform spans [p.x, p.x+p.w] x [p.y, p.y+p.h] x [p.z, p.z+p.d]
    const inX = newX + PLAYER_RADIUS > p.x && newX - PLAYER_RADIUS < p.x + p.w;
    const inZ = newZ + PLAYER_RADIUS > p.z && newZ - PLAYER_RADIUS < p.z + p.d;

    if (inX && inZ) {
      // Landing on top — feet were above or at platform top, now below
      if (prevFeetY >= p.top - 0.3 && feetY < p.top) {
        newY = p.top + PLAYER_HEIGHT;
        state.velocity.y = 0;
        state.onGround = true;
      }
      // Hitting bottom (head bonk)
      else if (prevFeetY + PLAYER_HEIGHT <= p.y + 0.3 && newY > p.y) {
        // Only bonk if moving up
        if (state.velocity.y > 0) {
          newY = p.y - 0.01;
          state.velocity.y = 0;
        }
      }
      // Side collision (push out horizontally)
      else if (feetY < p.top && feetY + PLAYER_HEIGHT > p.y) {
        const cx = p.cx;
        const cz = p.cz;
        const dx = newX - cx;
        const dz = newZ - cz;
        const halfW = p.w / 2 + PLAYER_RADIUS;
        const halfD = p.d / 2 + PLAYER_RADIUS;

        // Push out on the axis of least penetration
        const overlapX = halfW - Math.abs(dx);
        const overlapZ = halfD - Math.abs(dz);
        if (overlapX < overlapZ) {
          newX = cx + Math.sign(dx) * halfW;
        } else {
          newZ = cz + Math.sign(dz) * halfD;
        }
      }
    }
  }

  // ─── Ceiling collision ────────────────────────────────────
  if (newY > state.roomHeight - 1) {
    newY = state.roomHeight - 1;
    state.velocity.y = 0;
  }

  // ─── Respawn on fall ──────────────────────────────────────
  if (newY < RESPAWN_Y) {
    newX = 0;
    newY = PLAYER_HEIGHT + 2;
    newZ = 0;
    state.velocity.set(0, 0, 0);
  }

  state.camera.position.set(newX, newY, newZ);

  // Send position to server
  if (network && network.connected) {
    network.sendPosition(
      state.camera.position.x,
      state.camera.position.y,
      state.camera.position.z,
      state.euler.y
    );
  }
}

// ─── Resize ──────────────────────────────────────────────────────────
function onResize() {
  const w = window.innerWidth;
  const h = window.innerHeight;

  state.camera.aspect = w / h;
  state.camera.updateProjectionMatrix();
  state.renderer.setSize(w, h);
  state.renderTarget.setSize(w, h);
  state.asciiMaterial.uniforms.resolution.value.set(w, h);
}

// ─── Render Loop ─────────────────────────────────────────────────────
function animate() {
  requestAnimationFrame(animate);

  const dt = Math.min(state.clock.getDelta(), 0.05);
  const time = state.clock.getElapsedTime();

  updateMovement(dt);

  // Portal proximity check
  if (portalManager && state.locked) {
    portalManager.update(state.camera.position);
    const portalInfo = portalManager.getNearestPortalInfo();
    if (hud) {
      hud.showPortalHint(portalInfo ? portalInfo.title : null);
    }
  }

  // Room animations
  updateRoomAnimations(state.roomGroup, time);

  if (playerManager) {
    playerManager.update(dt);
    if (state.currentArticle) {
      playerManager.filterByArticle(state.currentArticle);
    }
  }

  state.asciiMaterial.uniforms.time.value = time;

  if (state.asciiEnabled) {
    state.renderer.setRenderTarget(state.renderTarget);
    state.renderer.render(state.scene, state.camera);
    state.renderer.setRenderTarget(null);
    state.renderer.render(state.asciiScene, state.asciiCamera);
  } else {
    state.renderer.setRenderTarget(null);
    state.renderer.render(state.scene, state.camera);
  }
}

// ─── Start ───────────────────────────────────────────────────────────
init();
