/**
 * ASCII Art Post-Processing Shader for Babel
 *
 * Pen-and-ink aesthetic — two layers:
 *   1. LINEWORK (primary) — Sobel edge detection traces structure outlines
 *   2. SHADING (secondary) — subtle luminance fill in darker areas
 *
 * Edges drive character density. Shading is an undertone.
 * Pure black ink on white paper. Characters should be readable.
 *
 * 12x16 pixel cells with 7x9 bitmap glyphs.
 * Characters by density: space . : - = + * # % @
 */

const CHAR_COUNT = 10;

export const ATLAS_INFO = {
  gridSize: 1,
  totalChars: CHAR_COUNT,
};

export function createCharAtlas(THREE) {
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
    uniform float cellSize;
    uniform float gridSize;
    uniform float totalChars;
    uniform float time;

    varying vec2 vUv;

    const float CELL_W = 12.0;
    const float CELL_H = 16.0;
    const vec3 PAPER = vec3(0.98, 0.976, 0.95);
    const vec3 INK = vec3(0.05, 0.05, 0.07);

    float luma(vec3 c) {
      return dot(c, vec3(0.299, 0.587, 0.114));
    }

    float rand(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
    }

    // ── Sobel edge detection ──────────────────────────────────
    // Sample at cell-scale spacing for cleaner edges
    float sobelEdge(vec2 uv) {
      vec2 texel = vec2(CELL_W, CELL_H) / resolution;

      float tl = luma(texture2D(tDiffuse, uv + vec2(-texel.x,  texel.y)).rgb);
      float tc = luma(texture2D(tDiffuse, uv + vec2(     0.0,  texel.y)).rgb);
      float tr = luma(texture2D(tDiffuse, uv + vec2( texel.x,  texel.y)).rgb);
      float ml = luma(texture2D(tDiffuse, uv + vec2(-texel.x,      0.0)).rgb);
      float mr = luma(texture2D(tDiffuse, uv + vec2( texel.x,      0.0)).rgb);
      float bl = luma(texture2D(tDiffuse, uv + vec2(-texel.x, -texel.y)).rgb);
      float bc = luma(texture2D(tDiffuse, uv + vec2(     0.0, -texel.y)).rgb);
      float br = luma(texture2D(tDiffuse, uv + vec2( texel.x, -texel.y)).rgb);

      float gx = -tl - 2.0*ml - bl + tr + 2.0*mr + br;
      float gy = -tl - 2.0*tc - tr + bl + 2.0*bc + br;

      return sqrt(gx * gx + gy * gy);
    }

    // ── 7x9 bitmap characters ─────────────────────────────────
    // Larger glyphs for readability at 12x16 cells
    float getBitmapPixel(int idx, int px, int py) {
      if (px < 0 || px > 6 || py < 0 || py > 8) return 0.0;

      if (idx == 0) {
        // space
        return 0.0;
      }
      else if (idx == 1) {
        // .  — single dot at bottom
        if (py == 7 && (px == 3)) return 1.0;
        if (py == 8 && (px == 3)) return 1.0;
        return 0.0;
      }
      else if (idx == 2) {
        // :  — two dots
        if ((py == 2 || py == 3) && px == 3) return 1.0;
        if ((py == 6 || py == 7) && px == 3) return 1.0;
        return 0.0;
      }
      else if (idx == 3) {
        // -  — horizontal line
        if (py == 4 && px >= 1 && px <= 5) return 1.0;
        return 0.0;
      }
      else if (idx == 4) {
        // =  — double horizontal
        if (py == 3 && px >= 1 && px <= 5) return 1.0;
        if (py == 5 && px >= 1 && px <= 5) return 1.0;
        return 0.0;
      }
      else if (idx == 5) {
        // +  — cross
        if (py == 4 && px >= 1 && px <= 5) return 1.0;
        if (px == 3 && py >= 2 && py <= 6) return 1.0;
        return 0.0;
      }
      else if (idx == 6) {
        // *  — asterisk
        if (py == 2 && (px == 1 || px == 5)) return 1.0;
        if (py == 3 && (px == 2 || px == 4)) return 1.0;
        if (py == 4 && px == 3) return 1.0;
        if (py == 5 && (px == 2 || px == 4)) return 1.0;
        if (py == 6 && (px == 1 || px == 5)) return 1.0;
        if (py == 4 && px >= 1 && px <= 5) return 1.0;
        return 0.0;
      }
      else if (idx == 7) {
        // #  — hash grid
        if (px == 2 || px == 4) return 1.0;  // vertical bars
        if (py == 3 || py == 5) {            // horizontal bars
          if (px >= 0 && px <= 6) return 1.0;
        }
        return 0.0;
      }
      else if (idx == 8) {
        // %  — percent
        if (py == 0 && (px == 1 || px == 2)) return 1.0;
        if (py == 1 && (px == 1 || px == 2 || px == 5)) return 1.0;
        if (py == 2 && px == 4) return 1.0;
        if (py == 3 && px == 4) return 1.0;
        if (py == 4 && px == 3) return 1.0;
        if (py == 5 && px == 2) return 1.0;
        if (py == 6 && px == 2) return 1.0;
        if (py == 7 && (px == 1 || px == 4 || px == 5)) return 1.0;
        if (py == 8 && (px == 4 || px == 5)) return 1.0;
        return 0.0;
      }
      else if (idx == 9) {
        // @  — at sign (dense)
        if (py == 1 && px >= 2 && px <= 4) return 1.0;
        if (py == 2 && (px == 1 || px == 5)) return 1.0;
        if (py == 3 && (px == 0 || px == 3 || px == 4 || px == 5 || px == 6)) return 1.0;
        if (py == 4 && (px == 0 || px == 2 || px == 4 || px == 6)) return 1.0;
        if (py == 5 && (px == 0 || px == 2 || px == 4 || px == 6)) return 1.0;
        if (py == 6 && (px == 0 || px == 3 || px == 4 || px == 6)) return 1.0;
        if (py == 7 && (px == 1 || px == 6)) return 1.0;
        if (py == 8 && px >= 2 && px <= 5) return 1.0;
        return 0.0;
      }

      return 0.0;
    }

    void main() {
      vec2 pix = gl_FragCoord.xy;

      // Cell coordinates
      vec2 cellId = floor(vec2(pix.x / CELL_W, pix.y / CELL_H));
      vec2 cellOrigin = vec2(cellId.x * CELL_W, cellId.y * CELL_H);
      vec2 cellCenter = (cellOrigin + vec2(CELL_W * 0.5, CELL_H * 0.5)) / resolution;

      // Local pixel within cell -> bitmap coords
      vec2 localPix = pix - cellOrigin;
      // Center 7x9 glyph in 12x16 cell
      int bx = int(floor(localPix.x - 2.5));
      int by = int(floor(localPix.y - 3.5));

      // ── Layer 1: Edge detection (LINEWORK — primary) ──────
      float edge = sobelEdge(cellCenter);
      // Aggressive edge sensitivity — edges are the star
      float edgeVal = smoothstep(0.01, 0.08, edge) * 9.0;

      // ── Layer 2: Shading (subtle fill — secondary) ────────
      float l = luma(texture2D(tDiffuse, cellCenter).rgb);
      // Shading is gentle: scale down and shift so only darker areas show
      // Only surfaces with decent luminance get any shading at all
      float shadeVal = l * 4.0;

      // ── Combine: edges dominate, shading fills in ─────────
      float combined = max(edgeVal, shadeVal);

      // Per-cell jitter (+/- 0.6 char)
      float h = rand(cellId);
      float jitter = (h - 0.5) * 1.2;

      // Rare cycling cells (~0.4%)
      float h2 = rand(cellId + 73.0);
      if (h2 > 0.996) {
        jitter = sin(time * 8.0 + h * 50.0) * 2.5;
      }

      float charIndexF = clamp(combined + jitter, 0.0, 9.0);
      int charIdx = int(floor(charIndexF));

      // Widen the "space" threshold — index 0 and 1 both become white paper
      // This keeps light areas truly clean
      if (charIdx <= 1) {
        gl_FragColor = vec4(PAPER, 1.0);
        return;
      }

      // Sample bitmap glyph
      float inkHit = getBitmapPixel(charIdx, bx, by);

      // Pure black on white — no color, no tint
      vec3 color = mix(PAPER, INK, inkHit);

      gl_FragColor = vec4(color, 1.0);
    }
  `
};
