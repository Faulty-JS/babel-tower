/**
 * ASCII Art Post-Processing Shader for Babel
 *
 * Approach: render each character as a hand-crafted 5x5 bitmap pattern
 * directly in the fragment shader. No font atlas needed — avoids
 * downscaling artifacts that make characters unreadable.
 *
 * Characters sorted by density (sparse → dense):
 *   space . : - = + * # % @
 *
 * Each cell is 8x12 pixels (monospace aspect ratio).
 * Characters are drawn as 5x5 pixel patterns within the cell.
 */

// 10 characters from sparse to dense
const CHAR_COUNT = 10;

export const ATLAS_INFO = {
  gridSize: 1,       // not used with bitmap approach
  totalChars: CHAR_COUNT,
};

// No atlas needed — bitmaps are encoded in the shader
export function createCharAtlas(THREE) {
  // Return a 1x1 white dummy texture (shader uses built-in bitmaps)
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 1, 1);
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

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
    uniform vec2 resolution;
    uniform float cellSize; // not used, we use fixed 8x12
    uniform float gridSize;
    uniform float totalChars;
    uniform float time;

    varying vec2 vUv;

    // Cell dimensions
    const float CELL_W = 8.0;
    const float CELL_H = 12.0;

    float luma(vec3 c) {
      return dot(c, vec3(0.299, 0.587, 0.114));
    }

    float rand(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
    }

    // 5x5 bitmap font — each character encoded as 5 floats (rows),
    // each float has 5 bits (columns). Bit 1 = ink pixel.
    // Returns 1.0 if pixel (px, py) is ink for character index idx.
    float getBitmapPixel(int idx, int px, int py) {
      // Clamp to 5x5 grid
      if (px < 0 || px > 4 || py < 0 || py > 4) return 0.0;

      // Encode each character as 5 rows of 5-bit patterns
      // Characters: space . : - = + * # % @

      // space (index 0) - all empty
      // . (index 1)
      // : (index 2)
      // - (index 3)
      // = (index 4)
      // + (index 5)
      // * (index 6)
      // # (index 7)
      // % (index 8)
      // @ (index 9)

      int row;

      if (idx == 0) {
        // space — empty
        return 0.0;
      }
      else if (idx == 1) {
        // . — single dot bottom center
        //  .....
        //  .....
        //  .....
        //  .....
        //  ..#..
        if (py == 4 && px == 2) return 1.0;
        return 0.0;
      }
      else if (idx == 2) {
        // : — two dots
        //  .....
        //  ..#..
        //  .....
        //  ..#..
        //  .....
        if (px == 2 && (py == 1 || py == 3)) return 1.0;
        return 0.0;
      }
      else if (idx == 3) {
        // - — horizontal line middle
        //  .....
        //  .....
        //  .###.
        //  .....
        //  .....
        if (py == 2 && px >= 1 && px <= 3) return 1.0;
        return 0.0;
      }
      else if (idx == 4) {
        // = — two horizontal lines
        //  .....
        //  .###.
        //  .....
        //  .###.
        //  .....
        if ((py == 1 || py == 3) && px >= 1 && px <= 3) return 1.0;
        return 0.0;
      }
      else if (idx == 5) {
        // + — cross
        //  .....
        //  ..#..
        //  .###.
        //  ..#..
        //  .....
        if (py == 2 && px >= 1 && px <= 3) return 1.0;
        if (px == 2 && py >= 1 && py <= 3) return 1.0;
        return 0.0;
      }
      else if (idx == 6) {
        // * — star/asterisk
        //  .....
        //  .#.#.
        //  ..#..
        //  .#.#.
        //  .....
        if (py == 1 && (px == 1 || px == 3)) return 1.0;
        if (py == 2 && px == 2) return 1.0;
        if (py == 3 && (px == 1 || px == 3)) return 1.0;
        return 0.0;
      }
      else if (idx == 7) {
        // # — hash/grid
        //  .#.#.
        //  #####
        //  .#.#.
        //  #####
        //  .#.#.
        if (py == 1 || py == 3) return 1.0; // full rows
        if (px == 1 || px == 3) return 1.0; // columns
        return 0.0;
      }
      else if (idx == 8) {
        // % — dense diagonal
        //  ##..#
        //  ##.#.
        //  ..#..
        //  .#.##
        //  #..##
        if (py == 0 && (px <= 1 || px == 4)) return 1.0;
        if (py == 1 && (px <= 1 || px == 3)) return 1.0;
        if (py == 2 && px == 2) return 1.0;
        if (py == 3 && (px == 1 || px >= 3)) return 1.0;
        if (py == 4 && (px == 0 || px >= 3)) return 1.0;
        return 0.0;
      }
      else if (idx == 9) {
        // @ — nearly full block
        //  .###.
        //  #.##.
        //  #.#.#
        //  #.##.
        //  .###.
        if (py == 0 && px >= 1 && px <= 3) return 1.0;
        if (py == 1 && (px == 0 || px == 2 || px == 3)) return 1.0;
        if (py == 2 && (px == 0 || px == 2 || px == 4)) return 1.0;
        if (py == 3 && (px == 0 || px == 2 || px == 3)) return 1.0;
        if (py == 4 && px >= 1 && px <= 3) return 1.0;
        return 0.0;
      }

      return 0.0;
    }

    void main() {
      vec2 pix = gl_FragCoord.xy;

      // Which cell is this pixel in?
      vec2 cellId = floor(vec2(pix.x / CELL_W, pix.y / CELL_H));
      vec2 cellOrigin = vec2(cellId.x * CELL_W, cellId.y * CELL_H);
      vec2 cellCenter = (cellOrigin + vec2(CELL_W * 0.5, CELL_H * 0.5)) / resolution;

      // Position within cell (pixel coords 0..CELL_W, 0..CELL_H)
      vec2 localPix = pix - cellOrigin;

      // Map local pixel to 5x5 bitmap position
      // Center the 5x5 grid (5 wide, 5 tall) within the 8x12 cell
      // Horizontal: 5 pixels centered in 8 → offset 1.5, scale 1.0
      // Vertical: 5 pixels centered in 12 → offset 3.5, scale 1.0
      int bx = int(floor(localPix.x - 1.5));
      int by = int(floor(localPix.y - 3.5));

      // Sample scene luminance at cell center
      float l = luma(texture2D(tDiffuse, cellCenter).rgb);

      // Map luminance to character index (0-9)
      // Low luminance (dark scene) → space (white paper)
      // High luminance (bright scene) → dense characters (ink)
      float charIndexF = l * 9.0;

      // Per-cell jitter for subtle variety (+/- 0.8 char)
      float h = rand(cellId);
      float jitter = (h - 0.5) * 1.6;

      // Rare cycling cells (~0.5%)
      float h2 = rand(cellId + 73.0);
      if (h2 > 0.995) {
        jitter = sin(time * 8.0 + h * 50.0) * 2.0;
      }

      charIndexF = clamp(charIndexF + jitter, 0.0, 9.0);
      int charIdx = int(floor(charIndexF));

      // Space = white paper
      if (charIdx == 0) {
        gl_FragColor = vec4(0.98, 0.975, 0.95, 1.0);
        return;
      }

      // Check if this pixel is ink in the bitmap
      float ink = getBitmapPixel(charIdx, bx, by);

      // Slight color tint from the scene
      vec3 sceneColor = texture2D(tDiffuse, cellCenter).rgb;
      float sceneLuma = luma(sceneColor);

      // Mix: ink pixels are dark, non-ink pixels are paper
      vec3 paperColor = vec3(0.98, 0.975, 0.95);
      vec3 inkColor = vec3(0.06, 0.06, 0.08); // near-black

      // Subtle scene color tint on ink
      inkColor = mix(inkColor, sceneColor * 0.3, 0.15);

      vec3 color = mix(paperColor, inkColor, ink);

      // Vignette
      vec2 uv = pix / resolution;
      float vig = 1.0 - 0.06 * length((uv - 0.5) * 1.3);
      color *= vig;

      gl_FragColor = vec4(color, 1.0);
    }
  `
};
