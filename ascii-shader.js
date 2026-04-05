/**
 * ASCII Art Post-Processing Shader for Babel
 *
 * Based on emilwidlund/ASCII approach:
 * - Large 1024x1024 atlas canvas with 16x16 grid of characters
 * - Characters rendered at 54px for maximum clarity
 * - Simple luminance → character index mapping
 * - Black text on white paper
 */

// Characters sorted by visual density (sparse → dense)
const CHAR_SET = " .:,'-^=*+?!|0#X%WM@";

const GRID_SIZE = 16; // 16x16 grid on the atlas
const TOTAL_CHARS = CHAR_SET.length;

/**
 * Create a high-resolution character atlas texture.
 * 1024x1024 canvas, 16x16 grid = 64x64 pixels per character cell.
 */
export function createCharAtlas(THREE) {
  const atlasSize = 1024;
  const cellSize = atlasSize / GRID_SIZE; // 64px per cell

  const canvas = document.createElement('canvas');
  canvas.width = atlasSize;
  canvas.height = atlasSize;
  const ctx = canvas.getContext('2d');

  // White background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, atlasSize, atlasSize);

  // Render characters in black, large font
  ctx.fillStyle = '#000000';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '54px "Courier New", Courier, monospace';

  for (let i = 0; i < CHAR_SET.length; i++) {
    const col = i % GRID_SIZE;
    const row = Math.floor(i / GRID_SIZE);
    const x = col * cellSize + cellSize / 2;
    const y = row * cellSize + cellSize / 2;
    ctx.fillText(CHAR_SET[i], x, y);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.flipY = false; // Shader addresses rows top-to-bottom matching canvas
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.needsUpdate = true;

  return texture;
}

export const ATLAS_INFO = {
  gridSize: GRID_SIZE,
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
    uniform float cellSize;
    uniform float gridSize;    // atlas grid dimensions (16)
    uniform float totalChars;
    uniform float time;

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

      // Position within cell (0..1)
      vec2 p = (pix - cellOrigin) / cellSize;

      // Sample scene luminance and remap for visibility
      float l = luma(texture2D(tDiffuse, cellCenter).rgb);
      l = clamp(l * 2.5, 0.0, 1.0);

      // Map luminance to character index
      float charIndex = floor(l * (totalChars - 1.0) + 0.5);

      // Per-cell jitter for subtle variety (+/- 1 char)
      float h = rand(cellId);
      float jitter = (h - 0.5) * 2.0;

      // Rare cycling cells (~0.4%)
      float h2 = rand(cellId + 73.0);
      if (h2 > 0.996) {
        jitter = sin(time * 6.0 + h * 40.0) * 3.0;
      }

      charIndex = clamp(charIndex + jitter, 0.0, totalChars - 1.0);
      float idx = floor(charIndex);

      // Space = white paper
      if (idx < 0.5) {
        gl_FragColor = vec4(0.98, 0.975, 0.95, 1.0);
        return;
      }

      // Atlas UV: character index to grid position
      float col = mod(idx, gridSize);
      float row = floor(idx / gridSize);
      vec2 atlasUV = vec2(
        (col + p.x) / gridSize,
        (row + p.y) / gridSize
      );

      // Sample the character glyph
      float glyph = 1.0 - luma(texture2D(tAtlas, atlasUV).rgb);

      // Black ink on warm white paper
      float ink = 0.98 - glyph * 0.92;

      // Vignette
      vec2 uv = pix / resolution;
      float vig = 1.0 - 0.06 * length((uv - 0.5) * 1.3);

      gl_FragColor = vec4(vec3(ink * vig), 1.0);
    }
  `
};
