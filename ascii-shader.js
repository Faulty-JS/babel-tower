/**
 * ASCII Art Post-Processing Shader for Babel
 *
 * Font atlas approach: render real monospace glyphs to a canvas texture,
 * then sample them in the fragment shader based on scene luminance.
 * Black text on white paper. Standard keyboard characters only.
 *
 * Characters sorted by visual density (sparse to dense).
 * Rectangular cells (8x14) match monospace character proportions.
 */

// Characters sorted by ascending visual density
// Carefully chosen for distinguishable density steps
const CHAR_SET = ' .`-,:;\'!~+*=<>/\\|?ixczrtsvoenuayhkdfw17023456#%$&@HDGMWB';

const ATLAS_COLS = 8;
const ATLAS_ROWS = Math.ceil(CHAR_SET.length / ATLAS_COLS);
const TOTAL_CHARS = CHAR_SET.length;

/**
 * Create a canvas font atlas with all characters rendered at cellSize.
 */
export function createCharAtlas(THREE, cellW, cellH) {
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_COLS * cellW;
  canvas.height = ATLAS_ROWS * cellH;
  const ctx = canvas.getContext('2d');

  // White background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Render each character in black
  ctx.fillStyle = '#000000';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `bold ${Math.floor(cellH * 0.82)}px "Courier New", "Courier", monospace`;

  for (let i = 0; i < CHAR_SET.length; i++) {
    const col = i % ATLAS_COLS;
    const row = Math.floor(i / ATLAS_COLS);
    const x = col * cellW + cellW / 2;
    const y = row * cellH + cellH / 2;
    ctx.fillText(CHAR_SET[i], x, y);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.needsUpdate = true;

  return texture;
}

export const ATLAS_INFO = {
  cols: ATLAS_COLS,
  rows: ATLAS_ROWS,
  totalChars: TOTAL_CHARS,
};

export const AsciiShader = {
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,

  fragmentShader: `
    precision highp float;

    uniform sampler2D tDiffuse;
    uniform sampler2D tAtlas;
    uniform vec2 resolution;
    uniform vec2 cellSize;     // (width, height) in pixels
    uniform float time;
    uniform vec2 atlasSize;    // (cols, rows) in the atlas
    uniform float totalChars;

    varying vec2 vUv;

    float luma(vec3 c) {
      return dot(c, vec3(0.299, 0.587, 0.114));
    }

    float rand(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
    }

    void main() {
      vec2 pix = gl_FragCoord.xy;

      // Which cell is this pixel in?
      vec2 cellId = floor(pix / cellSize);
      vec2 cellOrigin = cellId * cellSize;
      vec2 cellCenter = (cellOrigin + cellSize * 0.5) / resolution;

      // Position within the cell (0..1)
      vec2 p = (pix - cellOrigin) / cellSize;

      // Sample scene luminance at cell center
      float l = luma(texture2D(tDiffuse, cellCenter).rgb);

      // Map luminance to character index (bright scene = dense char = more ink)
      // Slight contrast boost
      l = smoothstep(0.01, 0.9, l);
      float baseIndex = l * (totalChars - 1.0);

      // Per-cell random jitter for variety (+/- 2 chars)
      float h = rand(cellId);
      float jitter = (h - 0.5) * 4.0;

      // Rare cycling cells (~0.5%)
      float h2 = rand(cellId + 73.0);
      if (h2 > 0.995) {
        jitter = sin(time * 6.0 + h * 40.0) * 4.0;
      }

      float charIndex = clamp(baseIndex + jitter, 0.0, totalChars - 1.0);
      float idx = floor(charIndex);

      // If first character (space), output white
      if (idx < 0.5) {
        gl_FragColor = vec4(0.98, 0.97, 0.95, 1.0);
        return;
      }

      // Atlas UV lookup
      float col = mod(idx, atlasSize.x);
      float row = floor(idx / atlasSize.x);

      vec2 atlasUV = vec2(
        (col + p.x) / atlasSize.x,
        (row + p.y) / atlasSize.y
      );

      // Sample character glyph (atlas is white bg / black text)
      float glyph = 1.0 - luma(texture2D(tAtlas, atlasUV).rgb);

      // Output: black ink on white paper
      float paper = 0.98;
      float ink = paper - glyph * 0.93;

      // Subtle vignette
      vec2 uv = pix / resolution;
      float vig = 1.0 - 0.08 * length((uv - 0.5) * 1.4);

      gl_FragColor = vec4(vec3(ink * vig), 1.0);
    }
  `
};
