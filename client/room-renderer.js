/**
 * Room Renderer — Procedural PLATFORMING room generation from Wikipedia article data.
 *
 * Each article-room is a platforming challenge. Portals are placed at varying
 * heights — easy portals on the ground, strategic portals require skill to reach.
 * Room layout is seeded deterministically from the article title.
 */

import * as THREE from 'three';
import { generateBabelText } from '../shared/babel-text.js';
import {
  BASE_ROOM_RADIUS, ROOM_HEIGHT, PORTAL_WIDTH, PORTAL_HEIGHT, ROOM_CATEGORIES,
} from '../shared/constants.js';

// ─── Seeded RNG (deterministic per article) ─────────────────────────
function mulberry32(seed) {
  let t = seed | 0;
  return () => {
    t = (t + 0x6D2B79F5) | 0;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return h;
}

// ─── Texture helpers ────────────────────────────────────────────────

function createPortalSign(title) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#111111';
  ctx.fillRect(0, 0, 1024, 512);

  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 8;
  ctx.strokeRect(12, 12, 1000, 488);

  ctx.font = 'bold 60px monospace';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('> > >', 512, 80);

  ctx.font = 'bold 56px monospace';
  const words = title.split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line + (line ? ' ' : '') + word;
    if (ctx.measureText(test).width > 920) { lines.push(line); line = word; }
    else line = test;
  }
  lines.push(line);
  const displayLines = lines.slice(0, 3);
  const lineHeight = 70;
  const startY = 256 - ((displayLines.length - 1) * lineHeight) / 2;
  displayLines.forEach((l, idx) => ctx.fillText(l, 512, startY + idx * lineHeight));

  ctx.font = 'bold 40px monospace';
  ctx.fillText('ENTER', 512, 440);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

function createPortalLabel(title) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#111111';
  ctx.fillRect(0, 0, 1024, 128);
  ctx.font = 'bold 48px monospace';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const display = title.length > 28 ? title.slice(0, 26) + '..' : title;
  ctx.fillText(display, 512, 64);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

function createPlaqueTexture(title, extract) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#f0ece0';
  ctx.fillRect(0, 0, 1024, 512);
  ctx.strokeStyle = '#8a7a5a';
  ctx.lineWidth = 3;
  ctx.strokeRect(10, 10, 1004, 492);

  ctx.font = 'bold 28px monospace';
  ctx.fillStyle = '#1a1a1a';
  ctx.textAlign = 'center';
  ctx.fillText(title, 512, 55);

  ctx.font = '16px monospace';
  ctx.fillStyle = '#333';
  ctx.textAlign = 'left';
  const maxWidth = 960;
  const lineHeight = 22;
  const words = extract.split(' ');
  let line = '';
  let y = 100;
  for (const word of words) {
    const testLine = line + (line ? ' ' : '') + word;
    if (ctx.measureText(testLine).width > maxWidth) {
      if (y < 480) ctx.fillText(line, 32, y);
      line = word;
      y += lineHeight;
    } else {
      line = testLine;
    }
  }
  if (y < 480) ctx.fillText(line, 32, y);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

// ─── Room builder ───────────────────────────────────────────────────

function getCategory(articleData) {
  const cat = articleData.category || 'default';
  return ROOM_CATEGORIES[cat] || ROOM_CATEGORIES.default;
}

/**
 * Build a platforming room from article data.
 * Returns { group, portals, platforms, radius }.
 * `platforms` is an array of { x, y, z, w, h, d } AABBs for collision.
 */
export function buildRoom(articleData) {
  const group = new THREE.Group();
  const portals = [];
  const platforms = []; // AABB collision boxes: { x, y, z, w, h, d }
  const category = getCategory(articleData);
  const rng = mulberry32(hashString(articleData.title));

  const scaleFactor = Math.min(1.4, Math.max(0.9, articleData.links.length / 8));
  const radius = BASE_ROOM_RADIUS * scaleFactor;
  const sides = 8; // octagonal for more wall space
  const height = ROOM_HEIGHT; // already tall from constants

  const baseColor = category.color;
  const stoneMat = new THREE.MeshLambertMaterial({ color: baseColor });
  const darkStoneMat = new THREE.MeshLambertMaterial({
    color: new THREE.Color(baseColor).multiplyScalar(0.7),
  });
  const platformMat = new THREE.MeshLambertMaterial({
    color: new THREE.Color(baseColor).multiplyScalar(0.85),
  });

  // ─── Kill floor (falling below = respawn) ──────────────────────
  // The "floor" is a void — only platforms are walkable
  // But we add a visible base floor at y=0 for the ground-level platforms to sit on
  const floorShape = new THREE.Shape();
  for (let i = 0; i < sides; i++) {
    const angle = (i / sides) * Math.PI * 2 - Math.PI / 2;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    if (i === 0) floorShape.moveTo(x, z);
    else floorShape.lineTo(x, z);
  }
  floorShape.closePath();

  const floorGeo = new THREE.ShapeGeometry(floorShape);
  const floorMat = new THREE.MeshLambertMaterial({
    color: new THREE.Color(baseColor).multiplyScalar(0.3),
  });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.5;
  group.add(floor);

  // Ground platform (spawn area in center)
  const spawnW = 18, spawnD = 18, spawnH = 1.5;
  addPlatform(group, platforms, platformMat, 0, -0.5, 0, spawnW, spawnH, spawnD);

  // Ceiling
  const ceilGeo = new THREE.ShapeGeometry(floorShape);
  const ceiling = new THREE.Mesh(ceilGeo, darkStoneMat);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = height;
  group.add(ceiling);

  // ─── Walls ─────────────────────────────────────────────────────
  for (let i = 0; i < sides; i++) {
    const angle1 = (i / sides) * Math.PI * 2 - Math.PI / 2;
    const angle2 = ((i + 1) / sides) * Math.PI * 2 - Math.PI / 2;
    const midAngle = (angle1 + angle2) / 2;
    const x1 = Math.cos(angle1) * radius;
    const z1 = Math.sin(angle1) * radius;
    const x2 = Math.cos(angle2) * radius;
    const z2 = Math.sin(angle2) * radius;
    const wallWidth = Math.sqrt((x2 - x1) ** 2 + (z2 - z1) ** 2);
    const wallCenterX = (x1 + x2) / 2;
    const wallCenterZ = (z1 + z2) / 2;

    // Full wall
    const wallGeo = new THREE.PlaneGeometry(wallWidth, height);
    const wallMesh = new THREE.Mesh(wallGeo, stoneMat);
    wallMesh.position.set(wallCenterX, height / 2, wallCenterZ);
    wallMesh.rotation.y = -midAngle - Math.PI / 2;
    group.add(wallMesh);
  }

  // ─── Columns at vertices ───────────────────────────────────────
  for (let i = 0; i < sides; i++) {
    const angle = (i / sides) * Math.PI * 2 - Math.PI / 2;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    const colGeo = new THREE.BoxGeometry(1.5, height, 1.5);
    const col = new THREE.Mesh(colGeo, darkStoneMat);
    col.position.set(x, height / 2, z);
    group.add(col);
  }

  // ─── Generate platform layout ──────────────────────────────────
  // Platforms bridge from center to walls at varying heights
  const numPlatforms = 15 + Math.floor(rng() * 12);

  for (let i = 0; i < numPlatforms; i++) {
    const angle = rng() * Math.PI * 2;
    const dist = 10 + rng() * (radius - 15);
    const px = Math.cos(angle) * dist;
    const pz = Math.sin(angle) * dist;

    // Height: distribute platforms across vertical space
    // More platforms in lower half, fewer at the top (harder to reach)
    const heightBias = rng() * rng(); // quadratic bias toward lower
    const py = 1 + heightBias * (height * 0.65);

    const pw = 4 + rng() * 8;
    const pd = 4 + rng() * 8;
    const ph = 1.0 + rng() * 0.8;

    addPlatform(group, platforms, platformMat, px, py, pz, pw, ph, pd);
  }

  // ─── Stepping stone paths from spawn to wall areas ─────────────
  // Create intentional paths so rooms are navigable
  const portalLinks = articleData.links.slice(0, Math.min(sides, articleData.links.length));
  const numPortals = portalLinks.length;

  for (let i = 0; i < numPortals; i++) {
    const wallAngle = (i / sides) * Math.PI * 2 - Math.PI / 2 + Math.PI / sides;
    const portalHeight = getPortalHeight(i, numPortals, height, rng);

    // Create a stepping path from near-center to the portal
    const steps = 3 + Math.floor(rng() * 3);
    for (let s = 0; s < steps; s++) {
      const t = (s + 1) / (steps + 1);
      const dist = 12 + t * (radius - 18);
      const stepAngle = wallAngle + (rng() - 0.5) * 0.25;
      const sx = Math.cos(stepAngle) * dist;
      const sz = Math.sin(stepAngle) * dist;
      // Interpolate height from ground to portal height
      const sy = 0.5 + t * (portalHeight - 1);
      const sw = 5 + rng() * 4;
      const sd = 5 + rng() * 4;

      addPlatform(group, platforms, platformMat, sx, sy, sz, sw, 1.0, sd);
    }

    // Landing platform right in front of the portal
    const landDist = radius - 6;
    const landX = Math.cos(wallAngle) * landDist;
    const landZ = Math.sin(wallAngle) * landDist;
    addPlatform(group, platforms, platformMat, landX, portalHeight - 0.5, landZ, 8, 1.2, 6);
  }

  // ─── Portals at varying heights on walls ───────────────────────
  for (let i = 0; i < numPortals; i++) {
    const portalTitle = portalLinks[i];
    const wallAngle = (i / sides) * Math.PI * 2 - Math.PI / 2 + Math.PI / sides;
    const portalHeight_y = getPortalHeight(i, numPortals, height, rng);

    const wallX = Math.cos(wallAngle) * radius;
    const wallZ = Math.sin(wallAngle) * radius;

    const inward = new THREE.Vector3(
      -Math.cos(wallAngle) * 0.3,
      0,
      -Math.sin(wallAngle) * 0.3,
    );

    // Portal collision trigger
    const portalGeo = new THREE.PlaneGeometry(PORTAL_WIDTH, PORTAL_HEIGHT);
    const portalMat = new THREE.MeshBasicMaterial({ visible: false });
    const portalMesh = new THREE.Mesh(portalGeo, portalMat);
    portalMesh.position.set(wallX, portalHeight_y + PORTAL_HEIGHT / 2, wallZ);
    portalMesh.rotation.y = -wallAngle - Math.PI / 2;
    portalMesh.position.add(inward);
    portalMesh.userData.isPortal = true;
    portalMesh.userData.targetArticle = portalTitle;
    group.add(portalMesh);

    // Sign inside portal
    const signTexture = createPortalSign(portalTitle);
    const signMat = new THREE.MeshBasicMaterial({ map: signTexture, side: THREE.DoubleSide });
    const signGeo = new THREE.PlaneGeometry(PORTAL_WIDTH - 0.4, PORTAL_HEIGHT - 0.6);
    const sign = new THREE.Mesh(signGeo, signMat);
    sign.position.copy(portalMesh.position);
    sign.rotation.y = portalMesh.rotation.y;
    sign.position.add(inward.clone().multiplyScalar(0.5));
    group.add(sign);

    // Frame
    const frameMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const ft = 0.6;

    const topBar = new THREE.Mesh(new THREE.BoxGeometry(PORTAL_WIDTH + ft * 2, ft, ft), frameMat);
    topBar.position.set(wallX, portalHeight_y + PORTAL_HEIGHT + ft / 2, wallZ);
    topBar.rotation.y = -wallAngle - Math.PI / 2;
    topBar.position.add(inward);
    group.add(topBar);

    const bottomBar = new THREE.Mesh(new THREE.BoxGeometry(PORTAL_WIDTH + ft * 2, ft, ft), frameMat);
    bottomBar.position.set(wallX, portalHeight_y - ft / 2, wallZ);
    bottomBar.rotation.y = -wallAngle - Math.PI / 2;
    bottomBar.position.add(inward);
    group.add(bottomBar);

    for (const side of [-1, 1]) {
      const sideBar = new THREE.Mesh(new THREE.BoxGeometry(ft, PORTAL_HEIGHT + ft, ft), frameMat);
      sideBar.position.set(wallX, portalHeight_y + PORTAL_HEIGHT / 2, wallZ);
      sideBar.rotation.y = -wallAngle - Math.PI / 2;
      const sideOffset = new THREE.Vector3(side * (PORTAL_WIDTH / 2 + ft / 2), 0, 0);
      sideOffset.applyAxisAngle(new THREE.Vector3(0, 1, 0), -wallAngle - Math.PI / 2);
      sideBar.position.add(sideOffset);
      sideBar.position.add(inward);
      group.add(sideBar);
    }

    // Label above
    const labelTexture = createPortalLabel(portalTitle);
    const labelMat = new THREE.MeshBasicMaterial({ map: labelTexture, side: THREE.DoubleSide });
    const labelGeo = new THREE.PlaneGeometry(PORTAL_WIDTH + 2, 1.5);
    const label = new THREE.Mesh(labelGeo, labelMat);
    label.position.set(wallX, portalHeight_y + PORTAL_HEIGHT + 1.5, wallZ);
    label.rotation.y = -wallAngle - Math.PI / 2;
    label.position.add(inward);
    group.add(label);

    // Light
    const portalLight = new THREE.PointLight(0xffffff, 1.0, 15);
    portalLight.position.set(wallX, portalHeight_y + PORTAL_HEIGHT / 2, wallZ);
    portalLight.position.add(inward.clone().multiplyScalar(8));
    group.add(portalLight);

    portals.push({
      mesh: portalMesh,
      title: portalTitle,
      position: portalMesh.position.clone(),
      normal: new THREE.Vector3(-Math.cos(wallAngle), 0, -Math.sin(wallAngle)),
      height: portalHeight_y,
    });
  }

  // ─── Center plaque (floating, reachable from spawn) ────────────
  const plaqueTexture = createPlaqueTexture(articleData.title, articleData.extract);
  const plaqueMat = new THREE.MeshBasicMaterial({ map: plaqueTexture, side: THREE.DoubleSide });
  const plaqueGeo = new THREE.PlaneGeometry(8, 4);
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2;
    const plaque = new THREE.Mesh(plaqueGeo, plaqueMat);
    plaque.position.set(Math.cos(angle) * 2.5, 3.5, Math.sin(angle) * 2.5);
    plaque.rotation.y = -angle - Math.PI / 2;
    group.add(plaque);
  }

  return { group, portals, platforms, radius, height };
}

/**
 * Determine portal height based on index. First portal is ground-level,
 * later portals are progressively higher (harder to reach).
 */
function getPortalHeight(index, total, roomHeight, rng) {
  if (index === 0) return 0; // First portal always on ground
  // Distribute remaining portals across height with some randomness
  const baseHeight = (index / total) * roomHeight * 0.55;
  const jitter = (rng() - 0.5) * 3;
  return Math.max(0, Math.min(roomHeight * 0.6, baseHeight + jitter));
}

/**
 * Add a box platform to the scene and collision list.
 */
function addPlatform(group, platforms, material, x, y, z, w, h, d) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.set(x, y, z);
  group.add(mesh);

  platforms.push({
    x: x - w / 2, y: y - h / 2, z: z - d / 2,
    w, h, d,
    // Center for quick reference
    cx: x, cy: y, cz: z,
    // Top surface Y
    top: y + h / 2,
  });
}

/**
 * Update animated elements in the room.
 */
export function updateRoomAnimations(group, time) {
  if (!group) return;
  group.traverse(obj => {
    if (obj.userData.floats) {
      obj.position.y += Math.sin(time * 1.5 + (obj.userData.floatOffset || 0)) * 0.003;
      obj.rotation.x += 0.005;
      obj.rotation.z += 0.003;
    }
  });
}
