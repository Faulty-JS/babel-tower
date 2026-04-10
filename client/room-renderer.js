/**
 * Room Renderer — Procedural PLATFORMING room generation from Wikipedia article data.
 *
 * Each article-room is a unique platforming challenge seeded from the title.
 * Categories determine terrain style, room shape, central features, and atmosphere.
 * Portals at varying heights reward skill.
 * Includes moving platforms, bounce pads, crumbling platforms, bridges, and ramps.
 */

import * as THREE from 'three';
import { generateBabelText } from '../shared/babel-text.js';
import {
  BASE_ROOM_RADIUS, ROOM_HEIGHT, PORTAL_WIDTH, PORTAL_HEIGHT, ROOM_CATEGORIES,
} from '../shared/constants.js';

// ─── Seeded RNG ─────────────────────────────────────────────────────
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

// ─── Materials ──────────────────────────────────────────────────────
const BOUNCE_COLOR = 0x44ddaa;
const CRUMBLE_COLOR = 0xcc8844;
const MOVING_COLOR = 0x6688cc;

// ─── Room shape types ───────────────────────────────────────────────
const ROOM_SHAPES = {
  octagon:    { sides: 8, heightMult: 1.0,  radiusMult: 1.0 },
  tallShaft:  { sides: 6, heightMult: 1.8,  radiusMult: 0.7 },
  wideArena:  { sides: 10, heightMult: 0.7, radiusMult: 1.4 },
  amphitheater: { sides: 12, heightMult: 1.2, radiusMult: 1.1 },
  hexChamber: { sides: 6, heightMult: 1.0,  radiusMult: 0.9 },
};

function pickRoomShape(cat, rng) {
  const shapes = {
    nature:     ['octagon', 'wideArena', 'amphitheater'],
    science:    ['tallShaft', 'hexChamber', 'octagon'],
    history:    ['amphitheater', 'wideArena', 'octagon'],
    technology: ['hexChamber', 'tallShaft', 'octagon'],
    geography:  ['wideArena', 'amphitheater', 'octagon'],
    art:        ['amphitheater', 'tallShaft', 'wideArena'],
    default:    ['octagon', 'hexChamber', 'amphitheater'],
  };
  const options = shapes[cat] || shapes.default;
  return ROOM_SHAPES[options[Math.floor(rng() * options.length)]];
}

// ─── Atmosphere per category ────────────────────────────────────────
const CATEGORY_ATMOSPHERE = {
  nature:     { fogColor: 0x1a2e1a, fogDensity: 0.006, ambientTint: 0x88cc88 },
  science:    { fogColor: 0x0a0a2e, fogDensity: 0.007, ambientTint: 0x8888ee },
  history:    { fogColor: 0x2e2010, fogDensity: 0.005, ambientTint: 0xccaa77 },
  technology: { fogColor: 0x0a1a2e, fogDensity: 0.008, ambientTint: 0x77aacc },
  geography:  { fogColor: 0x1a2e1a, fogDensity: 0.004, ambientTint: 0xaacc88 },
  art:        { fogColor: 0x2e1a2a, fogDensity: 0.005, ambientTint: 0xcc88aa },
  default:    { fogColor: 0x1a1a18, fogDensity: 0.006, ambientTint: 0xaaaaaa },
};

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

function createPortalLabelLarge(title, index, total) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  // Transparent background with subtle backing
  ctx.clearRect(0, 0, 1024, 256);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
  roundRect(ctx, 20, 20, 984, 216, 16);
  ctx.fill();

  // Border glow — brighter for higher portals (better links)
  const brightness = Math.floor(150 + (index / Math.max(total, 1)) * 105);
  ctx.strokeStyle = `rgb(${brightness}, ${brightness}, 255)`;
  ctx.lineWidth = 4;
  roundRect(ctx, 20, 20, 984, 216, 16);
  ctx.stroke();

  // Title text — large and bold
  ctx.font = 'bold 64px monospace';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const displayTitle = title.length > 22 ? title.slice(0, 20) + '..' : title;
  ctx.fillText(displayTitle, 512, 100);

  // Arrow indicator
  ctx.font = 'bold 40px monospace';
  ctx.fillStyle = `rgb(${brightness}, ${brightness}, 255)`;
  ctx.fillText('>>> ENTER >>>', 512, 180);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
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
  const words = extract.split(' ');
  let line = '';
  let y = 100;
  for (const word of words) {
    const testLine = line + (line ? ' ' : '') + word;
    if (ctx.measureText(testLine).width > 960) {
      if (y < 480) ctx.fillText(line, 32, y);
      line = word;
      y += 22;
    } else line = testLine;
  }
  if (y < 480) ctx.fillText(line, 32, y);
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

// ─── Category config ────────────────────────────────────────────────

function getCategory(articleData) {
  const cat = articleData.category || 'default';
  return ROOM_CATEGORIES[cat] || ROOM_CATEGORIES.default;
}

// ─── Platform builder ───────────────────────────────────────────────

function addPlatform(group, platforms, material, x, y, z, w, h, d, opts = {}) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.set(x, y, z);
  group.add(mesh);

  const p = {
    x: x - w / 2, y: y - h / 2, z: z - d / 2,
    w, h, d,
    cx: x, cy: y, cz: z,
    top: y + h / 2,
    mesh,
    // Special types
    bounce: opts.bounce || false,
    crumble: opts.crumble || false,
    crumbleTimer: null,
    dead: false,
    // Moving platform
    moving: opts.moving || false,
    moveAxis: opts.moveAxis || 'x',    // 'x', 'z', or 'y'
    moveRange: opts.moveRange || 0,
    moveSpeed: opts.moveSpeed || 0,
    movePhase: opts.movePhase || 0,
    originX: x, originY: y, originZ: z,
  };

  platforms.push(p);
  return p;
}

// ─── Room builder ───────────────────────────────────────────────────

/**
 * Build a platforming room from article data.
 */
export function buildRoom(articleData) {
  const group = new THREE.Group();
  const portals = [];
  const platforms = [];
  const category = getCategory(articleData);
  const rng = mulberry32(hashString(articleData.title));
  const cat = articleData.category || 'default';

  const scaleFactor = Math.min(1.4, Math.max(0.9, articleData.links.length / 8));
  const shape = pickRoomShape(cat, rng);
  const radius = BASE_ROOM_RADIUS * scaleFactor * shape.radiusMult;
  const sides = shape.sides;
  const height = ROOM_HEIGHT * shape.heightMult;
  const atmosphere = CATEGORY_ATMOSPHERE[cat] || CATEGORY_ATMOSPHERE.default;

  const baseColor = category.color;
  const stoneMat = new THREE.MeshLambertMaterial({ color: baseColor });
  const darkStoneMat = new THREE.MeshLambertMaterial({
    color: new THREE.Color(baseColor).multiplyScalar(0.7),
  });
  const platformMat = new THREE.MeshLambertMaterial({
    color: new THREE.Color(baseColor).multiplyScalar(0.85),
  });
  const bounceMat = new THREE.MeshLambertMaterial({ color: BOUNCE_COLOR });
  const crumbleMat = new THREE.MeshLambertMaterial({ color: CRUMBLE_COLOR });
  const movingMat = new THREE.MeshLambertMaterial({ color: MOVING_COLOR });

  // ─── Floor (void — falling = respawn) ──────────────────────
  const floorShape = new THREE.Shape();
  for (let i = 0; i < sides; i++) {
    const angle = (i / sides) * Math.PI * 2 - Math.PI / 2;
    const fx = Math.cos(angle) * radius;
    const fz = Math.sin(angle) * radius;
    if (i === 0) floorShape.moveTo(fx, fz);
    else floorShape.lineTo(fx, fz);
  }
  floorShape.closePath();

  // Visible void floor far below
  const floorGeo = new THREE.ShapeGeometry(floorShape);
  const floorMat = new THREE.MeshLambertMaterial({
    color: new THREE.Color(baseColor).multiplyScalar(0.2),
  });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -15;
  group.add(floor);

  // Ceiling
  const ceilGeo = new THREE.ShapeGeometry(floorShape);
  const ceiling = new THREE.Mesh(ceilGeo, darkStoneMat);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = height;
  group.add(ceiling);

  // ─── Walls ─────────────────────────────────────────────────
  for (let i = 0; i < sides; i++) {
    const angle1 = (i / sides) * Math.PI * 2 - Math.PI / 2;
    const angle2 = ((i + 1) / sides) * Math.PI * 2 - Math.PI / 2;
    const midAngle = (angle1 + angle2) / 2;
    const x1 = Math.cos(angle1) * radius, z1 = Math.sin(angle1) * radius;
    const x2 = Math.cos(angle2) * radius, z2 = Math.sin(angle2) * radius;
    const wallWidth = Math.sqrt((x2 - x1) ** 2 + (z2 - z1) ** 2);
    const wcx = (x1 + x2) / 2, wcz = (z1 + z2) / 2;

    const wallGeo = new THREE.PlaneGeometry(wallWidth, height);
    const wallMesh = new THREE.Mesh(wallGeo, stoneMat);
    wallMesh.position.set(wcx, height / 2, wcz);
    wallMesh.rotation.y = -midAngle - Math.PI / 2;
    group.add(wallMesh);
  }

  // Columns
  for (let i = 0; i < sides; i++) {
    const angle = (i / sides) * Math.PI * 2 - Math.PI / 2;
    const cx = Math.cos(angle) * radius, cz = Math.sin(angle) * radius;
    const col = new THREE.Mesh(new THREE.BoxGeometry(2, height, 2), darkStoneMat);
    col.position.set(cx, height / 2, cz);
    group.add(col);
  }

  // ─── Spawn platform (small — void is RIGHT THERE) ─────────
  addPlatform(group, platforms, platformMat, 0, 0, 0, 10, 2, 10);

  // ─── Hazard materials ─────────────────────────────────────
  const hazardMat = new THREE.MeshLambertMaterial({ color: 0xcc2222 });
  const beamMat = new THREE.MeshLambertMaterial({ color: 0x993333 });
  const narrowMat = new THREE.MeshLambertMaterial({
    color: new THREE.Color(baseColor).multiplyScalar(0.6),
  });

  // ─── Central feature per category ──────────────────────────
  buildCentralFeature(group, platforms, cat, rng, radius, height, platformMat, bounceMat, darkStoneMat);

  // ─── Portal paths — THE CORE GAMEPLAY ─────────────────────
  // Each portal gets a designed obstacle course route from center.
  // Difficulty scales with portal height (index). Ground = easy, top = brutal.
  const portalLinks = articleData.links.slice(0, Math.min(sides, articleData.links.length));
  const numPortals = portalLinks.length;
  const hazards = []; // spinning beams, pendulums — animated in updateRoomAnimations

  for (let i = 0; i < numPortals; i++) {
    const portalTitle = portalLinks[i];
    const wallAngle = (i / sides) * Math.PI * 2 - Math.PI / 2 + Math.PI / sides;
    const portalY = getPortalHeight(i, numPortals, height, rng);
    const difficulty = i / Math.max(numPortals - 1, 1); // 0 = easiest, 1 = hardest

    // ─── Build obstacle course to this portal ───────────────
    const steps = 4 + Math.floor(rng() * 3) + Math.floor(difficulty * 3);
    const courseAngleSpread = 0.15 + difficulty * 0.2; // harder portals have more winding paths

    for (let s = 0; s < steps; s++) {
      const t = (s + 1) / (steps + 1);
      const dist = 8 + t * (radius - 16);
      const wobble = Math.sin(s * 1.7) * courseAngleSpread;
      const stepAngle = wallAngle + wobble;
      const sx = Math.cos(stepAngle) * dist;
      const sz = Math.sin(stepAngle) * dist;
      const sy = 1 + t * (portalY - 1);

      // Platform size SHRINKS with difficulty
      const baseSize = 6 - difficulty * 3; // 6 at easy, 3 at hard
      const sizeVar = rng() * 2;

      // ─── Challenge selection based on difficulty + step ────
      const roll = rng();
      const isLateStep = s > 1 && s < steps - 1;

      if (difficulty > 0.3 && roll < 0.12 && isLateStep) {
        // NARROW BEAM — thin platform, requires precision
        const beamLen = 6 + rng() * 4;
        const beamDir = stepAngle + Math.PI / 2;
        addPlatform(group, platforms, narrowMat, sx, sy, sz,
          beamLen, 0.5, 1.5 + (1 - difficulty));
      } else if (difficulty > 0.2 && roll < 0.25 && isLateStep) {
        // MOVING platform — must time your jump
        const moveAxis = rng() > 0.5 ? (rng() > 0.5 ? 'y' : 'x') : 'z';
        const moveRange = 3 + difficulty * 5 + rng() * 3;
        const moveSpeed = 1.2 + difficulty * 2 + rng();
        addPlatform(group, platforms, movingMat, sx, sy, sz,
          baseSize + sizeVar, 0.8, baseSize + sizeVar, {
            moving: true, moveAxis, moveRange, moveSpeed,
            movePhase: rng() * Math.PI * 2,
          });
      } else if (difficulty > 0.4 && roll < 0.38 && isLateStep) {
        // CRUMBLE — land and GO, no hesitation
        addPlatform(group, platforms, crumbleMat, sx, sy, sz,
          baseSize + sizeVar + 1, 0.8, baseSize + sizeVar + 1, { crumble: true });
      } else if (roll < 0.15 && s === 0 && difficulty < 0.5) {
        // BOUNCE PAD at start of easy paths — fun launch
        addPlatform(group, platforms, bounceMat, sx, sy, sz,
          4, 0.8, 4, { bounce: true });
      } else {
        // Normal platform — size varies with difficulty
        addPlatform(group, platforms, platformMat, sx, sy, sz,
          baseSize + sizeVar, 0.8, baseSize + sizeVar);
      }

      // ─── HAZARD: Spinning beam between platforms (mid-high difficulty) ──
      if (difficulty > 0.35 && rng() < 0.3 && isLateStep) {
        const hazardY = sy + 2;
        const beamLength = 8 + rng() * 6;
        const beamGeo = new THREE.BoxGeometry(beamLength, 0.8, 0.8);
        const beam = new THREE.Mesh(beamGeo, hazardMat);
        beam.position.set(sx, hazardY, sz);
        group.add(beam);
        hazards.push({
          type: 'spinner',
          mesh: beam,
          x: sx, y: hazardY, z: sz,
          speed: 1.5 + difficulty * 2 + rng() * 1.5,
          phase: rng() * Math.PI * 2,
          radius: beamLength / 2,
        });
      }
    }

    // Landing platform at portal — always safe, slightly larger
    const landDist = radius - 6;
    const landX = Math.cos(wallAngle) * landDist;
    const landZ = Math.sin(wallAngle) * landDist;
    const landSize = 7 - difficulty * 2;
    addPlatform(group, platforms, platformMat, landX, portalY - 0.5, landZ,
      landSize + 2, 1.2, landSize);

    // ─── Portal ──────────────────────────────────────────────
    const wallX = Math.cos(wallAngle) * radius;
    const wallZ = Math.sin(wallAngle) * radius;
    const inward = new THREE.Vector3(-Math.cos(wallAngle) * 0.3, 0, -Math.sin(wallAngle) * 0.3);

    const portalGeo = new THREE.PlaneGeometry(PORTAL_WIDTH, PORTAL_HEIGHT);
    const portalMat2 = new THREE.MeshBasicMaterial({ visible: false });
    const portalMesh = new THREE.Mesh(portalGeo, portalMat2);
    portalMesh.position.set(wallX, portalY + PORTAL_HEIGHT / 2, wallZ);
    portalMesh.rotation.y = -wallAngle - Math.PI / 2;
    portalMesh.position.add(inward);
    portalMesh.userData.isPortal = true;
    portalMesh.userData.targetArticle = portalTitle;
    group.add(portalMesh);

    // Sign
    const signTex = createPortalSign(portalTitle);
    const signMat = new THREE.MeshBasicMaterial({ map: signTex, side: THREE.DoubleSide });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(PORTAL_WIDTH - 0.4, PORTAL_HEIGHT - 0.6), signMat);
    sign.position.copy(portalMesh.position);
    sign.rotation.y = portalMesh.rotation.y;
    sign.position.add(inward.clone().multiplyScalar(0.5));
    group.add(sign);

    // Frame
    const frameMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const ft = 0.6;
    const bars = [
      { w: PORTAL_WIDTH + ft * 2, h: ft, d: ft, y: portalY + PORTAL_HEIGHT + ft / 2 },
      { w: PORTAL_WIDTH + ft * 2, h: ft, d: ft, y: portalY - ft / 2 },
    ];
    for (const b of bars) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(b.w, b.h, b.d), frameMat);
      bar.position.set(wallX, b.y, wallZ);
      bar.rotation.y = -wallAngle - Math.PI / 2;
      bar.position.add(inward);
      group.add(bar);
    }
    for (const side of [-1, 1]) {
      const sideBar = new THREE.Mesh(new THREE.BoxGeometry(ft, PORTAL_HEIGHT + ft, ft), frameMat);
      sideBar.position.set(wallX, portalY + PORTAL_HEIGHT / 2, wallZ);
      sideBar.rotation.y = -wallAngle - Math.PI / 2;
      const off = new THREE.Vector3(side * (PORTAL_WIDTH / 2 + ft / 2), 0, 0);
      off.applyAxisAngle(new THREE.Vector3(0, 1, 0), -wallAngle - Math.PI / 2);
      sideBar.position.add(off).add(inward);
      group.add(sideBar);
    }

    // ─── Billboard label (always faces inward, big and readable) ──
    const labelTex = createPortalLabelLarge(portalTitle, i, numPortals);
    const labelMat = new THREE.MeshBasicMaterial({ map: labelTex, side: THREE.DoubleSide, transparent: true });
    const labelW = Math.max(PORTAL_WIDTH + 3, Math.min(portalTitle.length * 0.55 + 2, 14));
    const label = new THREE.Mesh(new THREE.PlaneGeometry(labelW, 2.5), labelMat);
    label.position.set(wallX, portalY + PORTAL_HEIGHT + 2.2, wallZ);
    label.rotation.y = -wallAngle - Math.PI / 2;
    label.position.add(inward.clone().multiplyScalar(0.5));
    group.add(label);

    // Second label lower — visible from ground for high portals
    if (portalY > 5) {
      const groundLabel = new THREE.Mesh(new THREE.PlaneGeometry(labelW * 0.8, 1.8), labelMat);
      groundLabel.position.set(wallX, portalY - 1.5, wallZ);
      groundLabel.rotation.y = -wallAngle - Math.PI / 2;
      groundLabel.position.add(inward.clone().multiplyScalar(3));
      group.add(groundLabel);
    }

    // Light — colored by portal height (ground=warm, high=cool)
    const lightColor = portalY < 5 ? 0xffeedd : portalY < 15 ? 0xddddff : 0xaaddff;
    const pl = new THREE.PointLight(lightColor, 1.2, 25);
    pl.position.set(wallX, portalY + PORTAL_HEIGHT / 2, wallZ);
    pl.position.add(inward.clone().multiplyScalar(8));
    group.add(pl);

    portals.push({
      mesh: portalMesh, title: portalTitle,
      position: portalMesh.position.clone(),
      normal: new THREE.Vector3(-Math.cos(wallAngle), 0, -Math.sin(wallAngle)),
      height: portalY,
    });
  }

  // ─── Center plaque ────────────────────────────────────────
  const plaqueTex = createPlaqueTexture(articleData.title, articleData.extract);
  const plaqueMat = new THREE.MeshBasicMaterial({ map: plaqueTex, side: THREE.DoubleSide });
  const plaqueGeo = new THREE.PlaneGeometry(8, 4);
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2;
    const plaque = new THREE.Mesh(plaqueGeo, plaqueMat);
    plaque.position.set(Math.cos(angle) * 2.5, 4, Math.sin(angle) * 2.5);
    plaque.rotation.y = -angle - Math.PI / 2;
    group.add(plaque);
  }

  return { group, portals, platforms, hazards, radius, height, atmosphere };
}

// ─── Central Feature Builders ───────────────────────────────────────

function buildCentralFeature(group, platforms, cat, rng, radius, height, platMat, bounceMat, darkMat) {
  const featureBuilders = {
    nature: buildNatureCenterpiece,
    science: buildScienceCenterpiece,
    history: buildHistoryCenterpiece,
    technology: buildTechCenterpiece,
    geography: buildGeoCenterpiece,
    art: buildArtCenterpiece,
    default: buildDefaultCenterpiece,
  };
  const builder = featureBuilders[cat] || featureBuilders.default;
  builder(group, platforms, rng, radius, height, platMat, bounceMat, darkMat);
}

function buildNatureCenterpiece(group, platforms, rng, radius, height, platMat, bounceMat, darkMat) {
  // Giant tree: trunk + branch platforms + bouncy canopy top
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x5c3a1e });
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x2d6b2d });

  // Trunk — tapered cylinder made of stacked boxes
  const trunkH = height * 0.6;
  for (let i = 0; i < 6; i++) {
    const t = i / 6;
    const w = 5 - t * 2.5;
    const segH = trunkH / 6;
    const seg = new THREE.Mesh(new THREE.BoxGeometry(w, segH, w), trunkMat);
    seg.position.set(0, 2 + t * trunkH + segH / 2, 0);
    seg.rotation.y = t * 0.3;
    group.add(seg);
  }

  // Branch platforms spiraling up the trunk
  for (let i = 0; i < 5; i++) {
    const t = (i + 1) / 6;
    const angle = i * Math.PI * 0.7 + rng() * 0.5;
    const dist = 5 + rng() * 4;
    const py = 2 + t * trunkH;
    addPlatform(group, platforms, platMat,
      Math.cos(angle) * dist, py, Math.sin(angle) * dist,
      5 + rng() * 2, 0.8, 4 + rng() * 2);
  }

  // Canopy — large bouncy platform at top
  const canopyY = 2 + trunkH;
  const canopy = new THREE.Mesh(
    new THREE.SphereGeometry(8, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2),
    leafMat
  );
  canopy.position.set(0, canopyY, 0);
  group.add(canopy);
  addPlatform(group, platforms, bounceMat, 0, canopyY - 0.5, 0, 10, 1, 10, { bounce: true });
}

function buildScienceCenterpiece(group, platforms, rng, radius, height, platMat, bounceMat, darkMat) {
  // Orrery: central pillar with orbiting ring platforms
  const pillarMat = new THREE.MeshLambertMaterial({ color: 0x4466aa });
  const ringMat = new THREE.MeshLambertMaterial({ color: 0x6688cc });

  // Central pillar
  const pillar = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 2, height * 0.7, 8), pillarMat);
  pillar.position.set(0, height * 0.35, 0);
  group.add(pillar);

  // Orbiting platforms at different heights (these move!)
  for (let i = 0; i < 4; i++) {
    const orbitDist = 6 + i * 3;
    const orbitY = 4 + i * (height * 0.12);
    const angle = (i / 4) * Math.PI * 2;
    addPlatform(group, platforms, ringMat,
      Math.cos(angle) * orbitDist, orbitY, Math.sin(angle) * orbitDist,
      4, 0.8, 4, {
        moving: true, moveAxis: 'x',
        moveRange: orbitDist * 0.8,
        moveSpeed: 0.6 + i * 0.2,
        movePhase: angle,
      });
  }

  // Glowing sphere at top
  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(2, 12, 8),
    new THREE.MeshBasicMaterial({ color: 0x4488ff })
  );
  sphere.position.set(0, height * 0.7, 0);
  group.add(sphere);
  const glow = new THREE.PointLight(0x4488ff, 2, 30);
  glow.position.copy(sphere.position);
  group.add(glow);
}

function buildHistoryCenterpiece(group, platforms, rng, radius, height, platMat, bounceMat, darkMat) {
  // Ruined tower: broken circular staircase, crumbling walls
  const stoneMat = new THREE.MeshLambertMaterial({ color: 0x8a7a5a });

  // Tower base — thick circular wall
  const towerR = 6;
  const towerH = height * 0.65;
  const segments = 12;
  for (let i = 0; i < segments; i++) {
    if (rng() < 0.25) continue; // gaps = ruins
    const a1 = (i / segments) * Math.PI * 2;
    const a2 = ((i + 1) / segments) * Math.PI * 2;
    const midA = (a1 + a2) / 2;
    const segW = 2 * towerR * Math.sin(Math.PI / segments);
    const segH = towerH * (0.5 + rng() * 0.5); // uneven heights = ruined
    const wall = new THREE.Mesh(new THREE.BoxGeometry(segW, segH, 1.5), stoneMat);
    wall.position.set(Math.cos(midA) * towerR, segH / 2 + 1, Math.sin(midA) * towerR);
    wall.rotation.y = -midA;
    group.add(wall);
  }

  // Internal spiral staircase platforms
  for (let i = 0; i < 8; i++) {
    const t = i / 8;
    const angle = t * Math.PI * 2.5;
    const dist = 3 + rng() * 2;
    const py = 2 + t * towerH * 0.8;
    addPlatform(group, platforms, platMat,
      Math.cos(angle) * dist, py, Math.sin(angle) * dist,
      4, 1, 3);
  }
}

function buildTechCenterpiece(group, platforms, rng, radius, height, platMat, bounceMat, darkMat) {
  // Machine core: spinning frame, moving pistons, glowing center
  const metalMat = new THREE.MeshLambertMaterial({ color: 0x556677 });

  // Core frame — cross beams
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI;
    const beam = new THREE.Mesh(new THREE.BoxGeometry(16, 1, 1), metalMat);
    beam.position.set(0, height * 0.4, 0);
    beam.rotation.y = angle;
    group.add(beam);
  }

  // Vertical pistons — moving platforms
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const dist = 5;
    addPlatform(group, platforms, new THREE.MeshLambertMaterial({ color: MOVING_COLOR }),
      Math.cos(angle) * dist, height * 0.2, Math.sin(angle) * dist,
      3, 1, 3, {
        moving: true, moveAxis: 'y',
        moveRange: height * 0.25,
        moveSpeed: 1.5 + rng() * 1.5,
        movePhase: (i / 4) * Math.PI * 2,
      });
  }

  // Glowing core
  const core = new THREE.Mesh(
    new THREE.OctahedronGeometry(2, 0),
    new THREE.MeshBasicMaterial({ color: 0x44aaff })
  );
  core.position.set(0, height * 0.4, 0);
  group.add(core);
  const coreLight = new THREE.PointLight(0x44aaff, 2, 25);
  coreLight.position.copy(core.position);
  group.add(coreLight);
}

function buildGeoCenterpiece(group, platforms, rng, radius, height, platMat, bounceMat, darkMat) {
  // Terrain sculpture: layered terrain rings getting higher toward center
  const layers = 5;
  for (let i = layers - 1; i >= 0; i--) {
    const t = i / layers;
    const layerR = 3 + t * 10;
    const layerH = (layers - i) * 2;
    const layerMat = new THREE.MeshLambertMaterial({
      color: new THREE.Color().setHSL(0.25 + t * 0.1, 0.4, 0.3 + t * 0.15),
    });
    const ring = new THREE.Mesh(
      new THREE.CylinderGeometry(layerR, layerR + 1, layerH, 8),
      layerMat
    );
    ring.position.set(0, layerH / 2, 0);
    group.add(ring);
  }
  // Peak platform
  addPlatform(group, platforms, platMat, 0, layers * 2 + 0.5, 0, 6, 1, 6);
}

function buildArtCenterpiece(group, platforms, rng, radius, height, platMat, bounceMat, darkMat) {
  // Floating gallery: suspended platform rings with "paintings" (colored planes)
  const galleryMat = new THREE.MeshLambertMaterial({ color: 0x8c5c6a });

  // Central floating gallery platform
  addPlatform(group, platforms, platMat, 0, height * 0.35, 0, 12, 0.8, 12);

  // Painting frames around the gallery
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2;
    const dist = 7;
    const paintingColor = new THREE.Color().setHSL(rng(), 0.7, 0.5);
    const painting = new THREE.Mesh(
      new THREE.PlaneGeometry(3, 4),
      new THREE.MeshBasicMaterial({ color: paintingColor })
    );
    painting.position.set(
      Math.cos(angle) * dist, height * 0.35 + 3,
      Math.sin(angle) * dist
    );
    painting.rotation.y = -angle + Math.PI;
    group.add(painting);

    // Frame
    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(3.4, 4.4, 0.3),
      new THREE.MeshLambertMaterial({ color: 0x3a2a1a })
    );
    frame.position.copy(painting.position);
    frame.position.z += Math.sin(angle) * 0.2;
    frame.position.x += Math.cos(angle) * 0.2;
    frame.rotation.y = painting.rotation.y;
    group.add(frame);
  }

  // Floating stepping stones to reach the gallery
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2 + rng();
    const dist = 12 + rng() * 5;
    const py = height * 0.15 + rng() * height * 0.15;
    addPlatform(group, platforms, galleryMat,
      Math.cos(angle) * dist, py, Math.sin(angle) * dist,
      4, 0.6, 4);
  }
}

function buildDefaultCenterpiece(group, platforms, rng, radius, height, platMat, bounceMat, darkMat) {
  // Babel pillar: tall inscribed column with spiral platforms
  const pillarMat = new THREE.MeshLambertMaterial({ color: 0x7a7a6a });
  const pillar = new THREE.Mesh(new THREE.CylinderGeometry(2, 2.5, height * 0.6, 8), pillarMat);
  pillar.position.set(0, height * 0.3, 0);
  group.add(pillar);

  // Spiral platforms around pillar
  for (let i = 0; i < 6; i++) {
    const t = i / 6;
    const angle = t * Math.PI * 2.5;
    const dist = 4 + rng() * 2;
    const py = 3 + t * height * 0.5;
    addPlatform(group, platforms, platMat,
      Math.cos(angle) * dist, py, Math.sin(angle) * dist,
      4, 0.8, 3);
  }
}

// ─── Category terrain builders ──────────────────────────────────────
// These add FLAVOR geometry between the portal paths — not random scatter.
// Each should create a few signature challenges unique to the category.

function buildNatureTerrain(group, platforms, rng, radius, height, platMat, bounceMat, crumbleMat, movingMat) {
  // Mushroom bounce ring — a ring of bounce pads at ground level
  for (let i = 0; i < 5; i++) {
    const angle = (i / 5) * Math.PI * 2 + rng() * 0.3;
    const dist = 14 + rng() * 6;
    addPlatform(group, platforms, bounceMat,
      Math.cos(angle) * dist, 0.5, Math.sin(angle) * dist,
      3, 1, 3, { bounce: true });
  }
  // Floating logs — long narrow moving platforms (cross the gaps)
  for (let i = 0; i < 3; i++) {
    const angle = rng() * Math.PI * 2;
    const dist = 20 + rng() * 15;
    const py = 4 + rng() * height * 0.25;
    addPlatform(group, platforms, movingMat,
      Math.cos(angle) * dist, py, Math.sin(angle) * dist,
      10, 0.8, 2, { moving: true, moveAxis: 'z', moveRange: 8 + rng() * 6,
        moveSpeed: 1 + rng(), movePhase: rng() * 6 });
  }
}

function buildScienceTerrain(group, platforms, rng, radius, height, platMat, bounceMat, crumbleMat, movingMat) {
  // Elevator column — 3 vertical movers that cycle up and down
  for (let i = 0; i < 3; i++) {
    const angle = (i / 3) * Math.PI * 2 + rng() * 0.5;
    const dist = 18 + rng() * 8;
    addPlatform(group, platforms, movingMat,
      Math.cos(angle) * dist, height * 0.15, Math.sin(angle) * dist,
      4, 1, 4, { moving: true, moveAxis: 'y', moveRange: height * 0.35,
        moveSpeed: 0.8 + rng() * 0.5, movePhase: (i / 3) * Math.PI * 2 });
  }
}

function buildHistoryTerrain(group, platforms, rng, radius, height, platMat, bounceMat, crumbleMat, movingMat) {
  // Crumbling staircase spiral — an alternate route that's risky
  const stairSteps = 10;
  for (let i = 0; i < stairSteps; i++) {
    const t = i / stairSteps;
    const angle = t * Math.PI * 2;
    const dist = 12 + t * 15;
    if (dist > radius - 10) break;
    const py = 1 + t * height * 0.45;
    const isCrumble = rng() < 0.35 && i > 1;
    addPlatform(group, platforms, isCrumble ? crumbleMat : platMat,
      Math.cos(angle) * dist, py, Math.sin(angle) * dist,
      5, 1, 4, isCrumble ? { crumble: true } : {});
  }
}

function buildTechTerrain(group, platforms, rng, radius, height, platMat, bounceMat, crumbleMat, movingMat) {
  // Conveyor belt network — fast-moving horizontal platforms
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2 + rng() * 0.3;
    const dist = 20 + rng() * 10;
    const py = 3 + rng() * height * 0.3;
    addPlatform(group, platforms, movingMat,
      Math.cos(angle) * dist, py, Math.sin(angle) * dist,
      5, 0.8, 3, { moving: true, moveAxis: rng() > 0.5 ? 'x' : 'z',
        moveRange: 10 + rng() * 8, moveSpeed: 2.5 + rng() * 1.5, movePhase: rng() * 6 });
  }
  // Launch pads
  for (let i = 0; i < 2; i++) {
    const angle = rng() * Math.PI * 2;
    const dist = 10 + rng() * 8;
    addPlatform(group, platforms, bounceMat,
      Math.cos(angle) * dist, 0.3, Math.sin(angle) * dist,
      3.5, 0.6, 3.5, { bounce: true });
  }
}

function buildGeoTerrain(group, platforms, rng, radius, height, platMat, bounceMat, crumbleMat, movingMat) {
  // Terrain shelves — wide but thin platforms at varying heights (like cliff ledges)
  for (let i = 0; i < 6; i++) {
    const angle = rng() * Math.PI * 2;
    const dist = 12 + rng() * (radius * 0.4);
    const py = rng() * height * 0.35;
    addPlatform(group, platforms, platMat,
      Math.cos(angle) * dist, py, Math.sin(angle) * dist,
      8 + rng() * 6, 1.2, 3);
  }
}

function buildArtTerrain(group, platforms, rng, radius, height, platMat, bounceMat, crumbleMat, movingMat) {
  // Bounce garden — lots of small bouncers at various heights (expressive, fun)
  for (let i = 0; i < 5; i++) {
    const angle = rng() * Math.PI * 2;
    const dist = 10 + rng() * (radius * 0.4);
    const py = rng() * height * 0.2;
    addPlatform(group, platforms, bounceMat,
      Math.cos(angle) * dist, py, Math.sin(angle) * dist,
      2.5, 0.6, 2.5, { bounce: true });
  }
  // Swaying platforms (gentle moving)
  for (let i = 0; i < 3; i++) {
    const angle = rng() * Math.PI * 2;
    const dist = 15 + rng() * 12;
    const py = 5 + rng() * height * 0.2;
    addPlatform(group, platforms, movingMat,
      Math.cos(angle) * dist, py, Math.sin(angle) * dist,
      4, 0.6, 4, { moving: true, moveAxis: 'y', moveRange: 3, moveSpeed: 1, movePhase: rng() * 6 });
  }
}

function buildDefaultTerrain(group, platforms, rng, radius, height, platMat, bounceMat, crumbleMat, movingMat) {
  // Mixed — a few of everything
  for (let i = 0; i < 4; i++) {
    const angle = rng() * Math.PI * 2;
    const dist = 12 + rng() * 15;
    const py = 1 + rng() * height * 0.3;
    const roll = rng();
    if (roll < 0.3) {
      addPlatform(group, platforms, bounceMat,
        Math.cos(angle) * dist, py, Math.sin(angle) * dist, 3, 0.8, 3, { bounce: true });
    } else if (roll < 0.6) {
      addPlatform(group, platforms, movingMat,
        Math.cos(angle) * dist, py, Math.sin(angle) * dist,
        4, 0.8, 4, { moving: true, moveAxis: 'y', moveRange: 4, moveSpeed: 1.2, movePhase: rng() * 6 });
    } else {
      addPlatform(group, platforms, platMat,
        Math.cos(angle) * dist, py, Math.sin(angle) * dist, 5, 0.8, 5);
    }
  }
}

// ─── Portal height ──────────────────────────────────────────────────

function getPortalHeight(index, total, roomHeight, rng) {
  if (index === 0) return 0;
  const baseHeight = (index / total) * roomHeight * 0.55;
  const jitter = (rng() - 0.5) * 3;
  return Math.max(0, Math.min(roomHeight * 0.6, baseHeight + jitter));
}

// ─── Update loop (moving + crumbling platforms) ─────────────────────

export function updateRoomAnimations(group, time, platforms, hazards) {
  if (!group || !platforms) return;

  for (const p of platforms) {
    if (p.dead) continue;

    // Moving platforms
    if (p.moving && p.mesh) {
      const offset = Math.sin(time * p.moveSpeed + p.movePhase) * p.moveRange;
      if (p.moveAxis === 'x') {
        p.mesh.position.x = p.originX + offset;
      } else if (p.moveAxis === 'z') {
        p.mesh.position.z = p.originZ + offset;
      } else if (p.moveAxis === 'y') {
        p.mesh.position.y = p.originY + offset;
      }
      // Update collision data
      p.cx = p.mesh.position.x;
      p.cy = p.mesh.position.y;
      p.cz = p.mesh.position.z;
      p.x = p.cx - p.w / 2;
      p.y = p.cy - p.h / 2;
      p.z = p.cz - p.d / 2;
      p.top = p.cy + p.h / 2;
    }

    // Crumbling platforms
    if (p.crumble && p.crumbleTimer !== null) {
      p.crumbleTimer -= 0.016; // approximate dt
      // Shake as it crumbles
      if (p.mesh) {
        p.mesh.position.x = p.originX + (Math.random() - 0.5) * 0.3;
        p.mesh.position.z = p.originZ + (Math.random() - 0.5) * 0.3;
      }
      if (p.crumbleTimer <= 0) {
        p.dead = true;
        if (p.mesh) {
          p.mesh.visible = false;
        }
        // Respawn after 3 seconds
        setTimeout(() => {
          p.dead = false;
          p.crumbleTimer = null;
          if (p.mesh) {
            p.mesh.visible = true;
            p.mesh.position.x = p.originX;
            p.mesh.position.z = p.originZ;
          }
        }, 3000);
      }
    }
  }

  // Spinning hazards
  if (hazards) {
    for (const h of hazards) {
      if (h.type === 'spinner' && h.mesh) {
        h.mesh.rotation.y = time * h.speed + h.phase;
      }
    }
  }
}
