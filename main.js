import * as THREE from 'three';
import { AsciiShader } from './ascii-shader.js';
import { NetworkClient } from './client/network.js';
import { PlayerManager } from './client/players.js';
import { ChatUI } from './client/chat.js';
import { createPuzzleOverlay, showPuzzle, hidePuzzle, showPuzzleResult } from './client/puzzle-ui.js';
import { generateBabelText, getWallInscription } from './shared/babel-text.js';
import {
  TOWER_RADIUS, FLOOR_HEIGHT, TAPER_PER_FLOOR, PLAYER_HEIGHT,
  MOVE_SPEED, JUMP_FORCE, GRAVITY, MOUSE_SENSITIVITY,
  PUZZLE_INTERACT_DISTANCE, ASCII_CHAR_SIZE, INITIAL_FLOORS,
} from './shared/constants.js';

// ─── State ───────────────────────────────────────────────────────────
const state = {
  camera: null,
  scene: null,
  renderer: null,
  clock: new THREE.Clock(),
  movement: { forward: false, backward: false, left: false, right: false },
  euler: new THREE.Euler(0, 0, 0, 'YXZ'),
  velocity: new THREE.Vector3(),
  locked: false,
  asciiEnabled: true,
  onGround: false,
  // Post-processing
  renderTarget: null,
  asciiMaterial: null,
  asciiScene: null,
  asciiCamera: null,
  // Game state
  towerHeight: INITIAL_FLOORS,
  growthPointMeshes: [],
  growthPointsData: [],
  nearestGrowthPoint: null,
  solvingPuzzle: false,
  currentGrowthPointId: null,
  towerGroup: null,
};

// ─── Modules ─────────────────────────────────────────────────────────
let network = null;
let playerManager = null;
let chatUI = null;

// ─── Init ────────────────────────────────────────────────────────────
function init() {
  // Renderer
  state.renderer = new THREE.WebGLRenderer({ antialias: false });
  state.renderer.setSize(window.innerWidth, window.innerHeight);
  state.renderer.setPixelRatio(1);
  state.renderer.setClearColor(0x000000);
  document.body.appendChild(state.renderer.domElement);

  // Scene — black background (shader inverts to white paper)
  state.scene = new THREE.Scene();
  state.scene.background = new THREE.Color(0xffffff);
  state.scene.fog = new THREE.Fog(0xffffff, 80, 300);

  // Camera
  state.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 500);
  state.camera.position.set(0, PLAYER_HEIGHT, TOWER_RADIUS * 0.6);

  // Post-processing
  setupAsciiPostProcessing();

  // Build the tower
  buildTower(state.towerHeight);

  // Lighting
  setupLighting();

  // Spawn initial growth points (will be replaced by server data)
  spawnGrowthPoints();

  // Player manager
  playerManager = new PlayerManager(state.scene);

  // Puzzle overlay
  createPuzzleOverlay();

  // Controls
  setupControls();

  // HUD
  createHUD();

  // Resize
  window.addEventListener('resize', onResize);

  // Connect to server
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

  state.asciiMaterial = new THREE.ShaderMaterial({
    uniforms: {
      tDiffuse: { value: state.renderTarget.texture },
      resolution: { value: new THREE.Vector2(w, h) },
      charSize: { value: ASCII_CHAR_SIZE },
      time: { value: 0.0 },
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

// ─── Tower Construction ──────────────────────────────────────────────
function buildTower(numFloors) {
  if (state.towerGroup) {
    state.scene.remove(state.towerGroup);
  }

  const towerGroup = new THREE.Group();
  state.towerGroup = towerGroup;

  const stoneMat = new THREE.MeshLambertMaterial({ color: 0x333333 });
  const darkStoneMat = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
  const edgeMat = new THREE.MeshLambertMaterial({ color: 0x222222 });

  // Ground — dark to form clear horizon line
  const groundGeo = new THREE.PlaneGeometry(500, 500);
  const groundMat = new THREE.MeshLambertMaterial({ color: 0x444444 });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.5;
  towerGroup.add(ground);

  for (let floor = 0; floor < numFloors; floor++) {
    const y = floor * FLOOR_HEIGHT;
    const radius = TOWER_RADIUS - floor * TAPER_PER_FLOOR;
    const segments = 24;

    // Floor ring
    const outerR = radius;
    const innerR = radius * 0.3;
    const ringGeo = new THREE.RingGeometry(innerR, outerR, segments);
    const floorMesh = new THREE.Mesh(ringGeo, floor % 2 === 0 ? stoneMat : darkStoneMat);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.position.y = y;
    floorMesh.userData.isFloor = true;
    floorMesh.userData.floorNum = floor;
    towerGroup.add(floorMesh);

    // Ceiling for the floor below (thin slab)
    if (floor > 0) {
      const ceilGeo = new THREE.RingGeometry(innerR, outerR, segments);
      const ceilMesh = new THREE.Mesh(ceilGeo, darkStoneMat);
      ceilMesh.rotation.x = Math.PI / 2;
      ceilMesh.position.y = y - 0.1;
      towerGroup.add(ceilMesh);
    }

    // Outer wall columns
    for (let i = 0; i < segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      const x = Math.cos(angle) * outerR;
      const z = Math.sin(angle) * outerR;

      const colGeo = new THREE.BoxGeometry(2, FLOOR_HEIGHT * 0.9, 2);
      const col = new THREE.Mesh(colGeo, edgeMat);
      col.position.set(x, y + FLOOR_HEIGHT * 0.45, z);
      towerGroup.add(col);
    }

    // Wall panels between columns (every other gap)
    for (let i = 0; i < segments; i += 2) {
      const angle1 = (i / segments) * Math.PI * 2;
      const angle2 = ((i + 1) / segments) * Math.PI * 2;
      const midAngle = (angle1 + angle2) / 2;
      const wallWidth = 2 * outerR * Math.sin(Math.PI / segments);

      const wallGeo = new THREE.PlaneGeometry(wallWidth, FLOOR_HEIGHT * 0.8);
      const wallMesh = new THREE.Mesh(wallGeo, darkStoneMat);
      wallMesh.position.set(
        Math.cos(midAngle) * (outerR - 0.5),
        y + FLOOR_HEIGHT * 0.45,
        Math.sin(midAngle) * (outerR - 0.5)
      );
      wallMesh.rotation.y = -midAngle + Math.PI / 2;
      towerGroup.add(wallMesh);
    }

    // Inner columns
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2 + floor * 0.2;
      const x = Math.cos(angle) * innerR;
      const z = Math.sin(angle) * innerR;

      const colGeo = new THREE.BoxGeometry(1.5, FLOOR_HEIGHT * 0.9, 1.5);
      const col = new THREE.Mesh(colGeo, darkStoneMat);
      col.position.set(x, y + FLOOR_HEIGHT * 0.45, z);
      towerGroup.add(col);
    }

    // Spiral ramp
    const rampAngleStart = floor * (Math.PI / 4);
    const rampSegments = 16;
    for (let s = 0; s < rampSegments; s++) {
      const t = s / rampSegments;
      const angle = rampAngleStart + t * (Math.PI / 2);
      const rampR = (innerR + outerR) * 0.5;
      const rx = Math.cos(angle) * rampR;
      const rz = Math.sin(angle) * rampR;
      const ry = y + t * FLOOR_HEIGHT;

      const stepGeo = new THREE.BoxGeometry(5, 0.5, 4);
      const step = new THREE.Mesh(stepGeo, stoneMat);
      step.position.set(rx, ry, rz);
      step.rotation.y = -angle;
      step.userData.isRamp = true;
      step.userData.rampY = ry;
      towerGroup.add(step);
    }
  }

  state.scene.add(towerGroup);
}

// ─── Lighting ────────────────────────────────────────────────────────
function setupLighting() {
  // Low ambient for strong contrast
  const ambient = new THREE.AmbientLight(0xffffff, 0.15);
  state.scene.add(ambient);

  // Strong directional from above-right for clear shadows
  const dir = new THREE.DirectionalLight(0xffffff, 1.2);
  dir.position.set(30, 120, 40);
  state.scene.add(dir);

  // Soft fill from opposite side
  const fill = new THREE.DirectionalLight(0xeeeeff, 0.3);
  fill.position.set(-30, 60, -20);
  state.scene.add(fill);

  // Interior point lights every 2 floors
  for (let i = 0; i < state.towerHeight; i += 2) {
    const light = new THREE.PointLight(0xffeedd, 0.6, FLOOR_HEIGHT * 6);
    light.position.set(0, i * FLOOR_HEIGHT + FLOOR_HEIGHT * 0.5, 0);
    state.scene.add(light);
  }
}

// ─── Growth Points ───────────────────────────────────────────────────
function spawnGrowthPoints(serverPoints) {
  // Clear existing
  state.growthPointMeshes.forEach(m => state.scene.remove(m));
  state.growthPointMeshes = [];
  state.growthPointsData = [];

  const points = serverPoints || generateDefaultGrowthPoints();

  points.forEach(gp => {
    const geo = new THREE.SphereGeometry(1.8, 12, 12);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x222222,
      transparent: true,
      opacity: 0.7,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(gp.x, gp.y, gp.z);
    mesh.userData.isGrowthPoint = true;
    mesh.userData.growthPointId = gp.id;
    mesh.userData.pulseOffset = Math.random() * Math.PI * 2;

    // Inner core — darker
    const innerGeo = new THREE.SphereGeometry(1.0, 8, 8);
    const innerMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.9,
    });
    const inner = new THREE.Mesh(innerGeo, innerMat);
    mesh.add(inner);

    // Subtle point light so they show up in ASCII
    const light = new THREE.PointLight(0xffffff, 0.3, 12);
    mesh.add(light);

    state.scene.add(mesh);
    state.growthPointMeshes.push(mesh);
    state.growthPointsData.push(gp);
  });
}

function generateDefaultGrowthPoints() {
  const points = [];
  const topFloors = [state.towerHeight - 1, state.towerHeight];
  topFloors.forEach(floor => {
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2 + Math.random() * 0.5;
      const radius = TOWER_RADIUS - floor * TAPER_PER_FLOOR;
      const r = radius * (0.4 + Math.random() * 0.4);
      points.push({
        id: `gp_${floor}_${i}`,
        floor,
        x: Math.cos(angle) * r,
        y: floor * FLOOR_HEIGHT + 2,
        z: Math.sin(angle) * r,
        active: true,
        solvesRemaining: 3,
      });
    }
  });
  return points;
}

// ─── Controls ────────────────────────────────────────────────────────
function setupControls() {
  const blocker = document.getElementById('blocker');
  let hasEnteredOnce = false;

  blocker.addEventListener('click', () => {
    document.body.requestPointerLock();
  });

  // Also re-lock on clicking the canvas after tabbing back
  document.addEventListener('click', (e) => {
    if (hasEnteredOnce && !state.locked && !state.solvingPuzzle &&
        !(chatUI && chatUI.visible) && e.target.tagName === 'CANVAS') {
      document.body.requestPointerLock();
    }
  });

  document.addEventListener('pointerlockchange', () => {
    state.locked = document.pointerLockElement === document.body;

    if (state.locked && !hasEnteredOnce) {
      hasEnteredOnce = true;
    }

    // Don't show blocker when chatting or solving puzzle
    if (state.solvingPuzzle || (chatUI && chatUI.visible)) {
      blocker.style.display = 'none';
    } else if (!hasEnteredOnce) {
      // First time: show full title screen blocker
      blocker.style.display = state.locked ? 'none' : 'flex';
    } else {
      // After first entry: hide blocker, just show small resume hint
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
    // Don't process movement while chatting
    if (chatUI && chatUI.visible) return;
    // Don't process movement while solving puzzle
    if (state.solvingPuzzle) return;

    switch (e.code) {
      case 'KeyW': case 'ArrowUp':    state.movement.forward = true; break;
      case 'KeyS': case 'ArrowDown':  state.movement.backward = true; break;
      case 'KeyA': case 'ArrowLeft':  state.movement.left = true; break;
      case 'KeyD': case 'ArrowRight': state.movement.right = true; break;
      case 'Space':
        if (state.onGround) state.velocity.y = JUMP_FORCE;
        e.preventDefault();
        break;
      case 'Backquote':
        state.asciiEnabled = !state.asciiEnabled;
        break;
      case 'KeyE':
        interactWithGrowthPoint();
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
    }
  });
}

// ─── Growth Point Interaction ────────────────────────────────────────
function interactWithGrowthPoint() {
  if (state.solvingPuzzle) return;
  if (!state.nearestGrowthPoint) return;

  const gp = state.nearestGrowthPoint;
  state.solvingPuzzle = true;
  state.currentGrowthPointId = gp.userData.growthPointId;

  // Exit pointer lock for puzzle UI
  if (document.pointerLockElement) {
    document.exitPointerLock();
  }

  if (network && network.connected) {
    // Request puzzle from server
    network.requestPuzzle(gp.userData.growthPointId);
  } else {
    // Offline mode: generate a simple local puzzle
    showPuzzle({
      type: 'trivia',
      data: {
        question: 'What is the tallest structure ever built by humans?',
        options: ['Burj Khalifa', 'Tokyo Skytree', 'Shanghai Tower', 'CN Tower'],
        category: 'Architecture',
      },
    }, (answer) => {
      handlePuzzleSubmit(answer);
    }, () => {
      cancelPuzzle();
    });
  }
}

function handlePuzzleSubmit(answer) {
  if (network && network.connected) {
    network.submitSolution(state.currentGrowthPointId, answer);
  } else {
    // Offline: always succeed for testing
    showPuzzleResult(true);
    setTimeout(() => {
      state.solvingPuzzle = false;
      // Remove the growth point
      const idx = state.growthPointMeshes.findIndex(
        m => m.userData.growthPointId === state.currentGrowthPointId
      );
      if (idx >= 0) {
        state.scene.remove(state.growthPointMeshes[idx]);
        state.growthPointMeshes.splice(idx, 1);
      }
    }, 2000);
  }
}

function cancelPuzzle() {
  state.solvingPuzzle = false;
  state.currentGrowthPointId = null;
  hidePuzzle();
  if (network && network.connected) {
    network.cancelPuzzle();
  }
}

// ─── Network ─────────────────────────────────────────────────────────
async function connectToServer() {
  network = new NetworkClient();
  chatUI = new ChatUI(network);

  // Determine WebSocket URL — use same host in dev, or configured server in prod
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = window.BABEL_SERVER_URL || `${protocol}//${location.host}`;

  network.onInitState = (data) => {
    console.log('[Game] Init state received:', data);
    state.towerHeight = data.towerHeight;
    buildTower(data.towerHeight);
    setupLighting();
    spawnGrowthPoints(data.growthPoints);
    updateHUD();
  };

  network.onPlayerJoin = (sessionId, color) => {
    playerManager.addPlayer(sessionId, color);
    updateHUD();
  };

  network.onPlayerLeave = (sessionId) => {
    playerManager.removePlayer(sessionId);
    updateHUD();
  };

  network.onPlayerMove = (sessionId, x, y, z, rotationY) => {
    playerManager.updatePosition(sessionId, x, y, z, rotationY);
  };

  network.onPuzzleReceived = (data) => {
    if (data.error) {
      console.warn('[Game] Puzzle error:', data.error);
      state.solvingPuzzle = false;
      return;
    }
    showPuzzle(data, (answer) => {
      handlePuzzleSubmit(answer);
    }, () => {
      cancelPuzzle();
    });
  };

  network.onPuzzleResult = (data) => {
    showPuzzleResult(data.success);
    setTimeout(() => {
      state.solvingPuzzle = false;
      state.currentGrowthPointId = null;
    }, data.success ? 2000 : 1500);
  };

  network.onTowerGrow = (data) => {
    console.log('[Game] Tower grew to floor', data.floor);
    state.towerHeight = data.floor;
    buildTower(data.floor);
    setupLighting();
    spawnGrowthPoints(data.growthPoints);
    showGrowthFlash();
    updateHUD();
  };

  network.onGrowthPointsUpdate = (data) => {
    spawnGrowthPoints(data.growthPoints);
  };

  network.onChatBubble = (data) => {
    chatUI.addMessage(data.sessionId, data.babelText);
    playerManager.showChatBubble(data.sessionId, data.babelText);
  };

  const connected = await network.connect(wsUrl);
  if (!connected) {
    console.log('[Game] Running in offline mode');
    updateHUD();
  }
}

// ─── Resume Hint (shown when pointer lock lost after first entry) ────
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

// ─── HUD ─────────────────────────────────────────────────────────────
function createHUD() {
  const hud = document.createElement('div');
  hud.id = 'hud';
  hud.innerHTML = `
    <div id="hud-height">FLOOR: 0</div>
    <div id="hud-players">BUILDERS: 1</div>
    <div id="hud-interact" style="display:none">[E] INTERACT</div>
    <div id="hud-controls">WASD move | SPACE jump | E interact | T chat | \` toggle ASCII</div>
  `;
  document.body.appendChild(hud);
}

function updateHUD() {
  const heightEl = document.getElementById('hud-height');
  const playersEl = document.getElementById('hud-players');
  if (heightEl) {
    const playerFloor = Math.floor(
      (state.camera.position.y - PLAYER_HEIGHT) / FLOOR_HEIGHT
    );
    heightEl.textContent = `FLOOR: ${playerFloor} / ${state.towerHeight}`;
  }
  if (playersEl) {
    const count = playerManager ? playerManager.getPlayerCount() + 1 : 1;
    playersEl.textContent = `BUILDERS: ${count}`;
  }
}

// ─── Growth Flash (when tower grows) ─────────────────────────────────
function showGrowthFlash() {
  const flash = document.createElement('div');
  flash.id = 'growth-flash';
  flash.textContent = 'THE TOWER GROWS';
  document.body.appendChild(flash);

  setTimeout(() => flash.classList.add('visible'), 10);
  setTimeout(() => {
    flash.classList.remove('visible');
    setTimeout(() => flash.remove(), 1000);
  }, 2000);
}

// ─── Physics / Movement ──────────────────────────────────────────────
const PLAYER_RADIUS = 1.5; // collision radius

function updateMovement(dt) {
  if (!state.locked) return;

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

  state.velocity.x = dir.x * MOVE_SPEED;
  state.velocity.z = dir.z * MOVE_SPEED;
  state.velocity.y += GRAVITY * dt;

  // Proposed new position
  const newX = state.camera.position.x + state.velocity.x * dt;
  const newZ = state.camera.position.z + state.velocity.z * dt;
  const newY = state.camera.position.y + state.velocity.y * dt;

  // ─── Wall / Column collision ─────────────────────────────────
  const py = state.camera.position.y - PLAYER_HEIGHT;
  let blockedX = false;
  let blockedZ = false;

  // Check against outer walls (cylindrical boundary per floor)
  for (let floor = 0; floor < state.towerHeight; floor++) {
    const floorY = floor * FLOOR_HEIGHT;
    const radius = TOWER_RADIUS - floor * TAPER_PER_FLOOR;

    // Only check floors near the player's height
    if (py < floorY - 2 || py > floorY + FLOOR_HEIGHT) continue;

    const distNew = Math.sqrt(newX * newX + newZ * newZ);

    // Outer wall: can't go outside the tower radius
    if (distNew > radius - PLAYER_RADIUS) {
      // Push back inside
      const angle = Math.atan2(newZ, newX);
      const maxR = radius - PLAYER_RADIUS;
      const clampedX = Math.cos(angle) * maxR;
      const clampedZ = Math.sin(angle) * maxR;

      // Only clamp if we were inside before (don't trap outside players)
      const distCur = Math.sqrt(state.camera.position.x ** 2 + state.camera.position.z ** 2);
      if (distCur < radius) {
        if (Math.abs(newX - clampedX) > 0.01) blockedX = true;
        if (Math.abs(newZ - clampedZ) > 0.01) blockedZ = true;
      }
    }

    // Inner wall: can't go inside the inner column ring
    const innerR = radius * 0.3;
    if (distNew < innerR + PLAYER_RADIUS && distNew > 0) {
      const distCur = Math.sqrt(state.camera.position.x ** 2 + state.camera.position.z ** 2);
      if (distCur > innerR) {
        blockedX = true;
        blockedZ = true;
      }
    }
  }

  // Apply movement with collision
  if (!blockedX) state.camera.position.x = newX;
  if (!blockedZ) state.camera.position.z = newZ;
  state.camera.position.y = newY;

  // ─── Floor / Ramp collision ──────────────────────────────────
  state.onGround = false;
  const px = state.camera.position.x;
  const pz = state.camera.position.z;
  const pyNew = state.camera.position.y - PLAYER_HEIGHT;
  const distFromCenter = Math.sqrt(px * px + pz * pz);

  // Check ramp steps
  let onRamp = false;
  if (state.towerGroup) {
    state.towerGroup.traverse(obj => {
      if (onRamp) return;
      if (obj.userData.isRamp) {
        const wp = obj.position;
        const dx = px - wp.x;
        const dz = pz - wp.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist < 3.5 && pyNew >= wp.y - 2 && pyNew <= wp.y + 1.5) {
          state.camera.position.y = wp.y + PLAYER_HEIGHT;
          state.velocity.y = 0;
          state.onGround = true;
          onRamp = true;
        }
      }
    });
  }

  if (!onRamp) {
    for (let floor = state.towerHeight - 1; floor >= 0; floor--) {
      const floorY = floor * FLOOR_HEIGHT;
      const radius = TOWER_RADIUS - floor * TAPER_PER_FLOOR;

      if (distFromCenter < radius && pyNew < floorY + 2 && pyNew > floorY - 3) {
        state.camera.position.y = floorY + PLAYER_HEIGHT;
        state.velocity.y = 0;
        state.onGround = true;
        break;
      }
    }
  }

  // Ground fallback
  if (state.camera.position.y < PLAYER_HEIGHT) {
    state.camera.position.y = PLAYER_HEIGHT;
    state.velocity.y = 0;
    state.onGround = true;
  }

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

// ─── Growth Point Animation & Proximity ──────────────────────────────
function updateGrowthPoints(time) {
  state.nearestGrowthPoint = null;
  let nearestDist = Infinity;
  const interactEl = document.getElementById('hud-interact');

  state.growthPointMeshes.forEach(mesh => {
    // Pulse animation
    const pulse = Math.sin(time * 2.5 + mesh.userData.pulseOffset) * 0.3 + 0.7;
    mesh.material.opacity = pulse * 0.6;
    mesh.scale.setScalar(0.8 + pulse * 0.4);

    // Floating animation
    mesh.position.y += Math.sin(time * 1.5 + mesh.userData.pulseOffset) * 0.002;

    // Check proximity
    const dx = state.camera.position.x - mesh.position.x;
    const dy = state.camera.position.y - mesh.position.y;
    const dz = state.camera.position.z - mesh.position.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

    if (dist < PUZZLE_INTERACT_DISTANCE && dist < nearestDist) {
      nearestDist = dist;
      state.nearestGrowthPoint = mesh;
    }
  });

  // Show/hide interact prompt
  if (interactEl) {
    interactEl.style.display = (state.nearestGrowthPoint && !state.solvingPuzzle) ? 'block' : 'none';
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
  updateGrowthPoints(time);

  if (playerManager) playerManager.update(dt);

  // Update HUD floor display periodically
  if (Math.floor(time * 2) % 2 === 0) updateHUD();

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
