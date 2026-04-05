/**
 * ASCII Art Post-Processing Shader for Babel
 *
 * Edge-detection + luminance mapped to characters from many writing systems.
 * Characters are rendered to a font atlas texture at init time.
 * Black characters on white paper. Tower of Babel = all languages.
 */

// Characters sorted roughly by visual density (sparse to dense)
// Pulled from Latin, Greek, Cyrillic, Hebrew, Arabic, CJK, Devanagari, Thai, etc.
const CHAR_SET = [
  // Very light
  '.', ',', "'", '-', '~', ':', ';', '!',
  // Light
  '+', '=', '/', '\\', '|', '(', ')', '<', '>',
  // Medium-light — Latin/misc
  'i', 'l', 't', 'r', 'c', 'v', 'x', 'z', 'n', 's',
  // Medium — mixed scripts
  'a', 'e', 'o', 'u', 'k', 'w', 'y', 'f', 'h', 'd',
  // Medium — Greek
  '\u03B1', '\u03B2', '\u03B3', '\u03B4', '\u03B5', '\u03B6', '\u03B7', '\u03B8',
  // Medium — Cyrillic
  '\u0414', '\u0416', '\u0418', '\u041B', '\u041F', '\u0424', '\u042F', '\u0426',
  // Medium-dense — Hebrew
  '\u05D0', '\u05D1', '\u05D2', '\u05D3', '\u05D4', '\u05D5', '\u05D6', '\u05D7',
  // Medium-dense — CJK/Katakana
  '\u30A2', '\u30AB', '\u30B5', '\u30BF', '\u30CA', '\u30CF', '\u30DE', '\u30E4',
  // Dense — more CJK
  '\u4E00', '\u4E09', '\u4E0B', '\u4E16', '\u4E2D', '\u5929', '\u5730', '\u4EBA',
  // Dense — Devanagari
  '\u0905', '\u0915', '\u0917', '\u091C', '\u0924', '\u0928', '\u092A', '\u092E',
  // Very dense — Latin/symbols
  'A', 'B', 'D', 'G', 'H', 'K', 'M', 'N', 'Q', 'R', 'W',
  '#', '$', '%', '&', '@',
  // Very dense — CJK ideographs
  '\u9F8D', '\u7FFB', '\u8A9E', '\u5854', '\u6587', '\u5B57',
];

const ATLAS_COLS = 16;
const ATLAS_ROWS = Math.ceil(CHAR_SET.length / ATLAS_COLS);
const TOTAL_CHARS = CHAR_SET.length;

/**
 * Create a canvas texture atlas of all characters.
 * Returns a THREE.CanvasTexture.
 */
export function createCharAtlas(THREE, cellSize) {
  const size = Math.ceil(cellSize * 1.2); // slight padding
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_COLS * size;
  canvas.height = ATLAS_ROWS * size;
  const ctx = canvas.getContext('2d');

  // White background
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Draw each character
  ctx.fillStyle = '#000';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `${size * 0.85}px monospace`;

  for (let i = 0; i < CHAR_SET.length; i++) {
    const col = i % ATLAS_COLS;
    const row = Math.floor(i / ATLAS_COLS);
    const x = col * size + size / 2;
    const y = row * size + size / 2;
    ctx.fillText(CHAR_SET[i], x, y);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.needsUpdate = true;

  return texture;
}

export const SHADER_UNIFORMS_EXTRA = {
  tAtlas: { value: null },
  atlasSize: { value: [ATLAS_COLS, ATLAS_ROWS] },
  totalChars: { value: TOTAL_CHARS },
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
    uniform float charSize;
    uniform float time;
    uniform vec2 atlasSize;   // cols, rows
    uniform float totalChars;

    varying vec2 vUv;

    float luma(vec3 c) {
      return dot(c, vec3(0.299, 0.587, 0.114));
    }

    float rand(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
    }

    float rand2(vec2 p) {
      return fract(sin(dot(p, vec2(269.5, 183.3))) * 61532.1947);
    }

    float sobel(vec2 uv) {
      vec2 t = 1.0 / resolution;
      float tl = luma(texture2D(tDiffuse, uv + vec2(-t.x, t.y)).rgb);
      float tm = luma(texture2D(tDiffuse, uv + vec2(0.0, t.y)).rgb);
      float tr = luma(texture2D(tDiffuse, uv + vec2(t.x, t.y)).rgb);
      float ml = luma(texture2D(tDiffuse, uv + vec2(-t.x, 0.0)).rgb);
      float mr = luma(texture2D(tDiffuse, uv + vec2(t.x, 0.0)).rgb);
      float bl = luma(texture2D(tDiffuse, uv + vec2(-t.x, -t.y)).rgb);
      float bm = luma(texture2D(tDiffuse, uv + vec2(0.0, -t.y)).rgb);
      float br = luma(texture2D(tDiffuse, uv + vec2(t.x, -t.y)).rgb);
      float gx = -tl - 2.0*ml - bl + tr + 2.0*mr + br;
      float gy = -tl - 2.0*tm - tr + bl + 2.0*bm + br;
      return length(vec2(gx, gy));
    }

    void main() {
      vec2 pix = gl_FragCoord.xy;
      vec2 cellId = floor(pix / charSize);
      vec2 cellCenter = (cellId * charSize + charSize * 0.5) / resolution;
      vec2 p = fract(pix / charSize); // 0..1 within cell

      // Sample scene
      float l = luma(texture2D(tDiffuse, cellCenter).rgb);

      // Edge detection
      float edge = (
        sobel(cellCenter) +
        sobel(cellCenter + vec2(1.0/resolution.x, 0.0)) +
        sobel(cellCenter + vec2(0.0, 1.0/resolution.y))
      ) / 3.0;
      edge = smoothstep(0.04, 0.2, edge);

      // Luminance fill
      float fill = smoothstep(0.02, 0.8, l) * 0.5;

      // Combined ink
      float ink = clamp(edge + fill, 0.0, 1.0);

      // If no ink, output white paper
      if (ink < 0.03) {
        gl_FragColor = vec4(1.0, 0.99, 0.97, 1.0);
        return;
      }

      // Per-cell random hash
      float h = rand(cellId);
      float h2 = rand2(cellId);

      // Map ink level to a range in the sorted character set
      // ink 0..1 maps to char index 0..totalChars
      float baseIndex = ink * (totalChars - 1.0);

      // Add random offset within a window for variety
      float window = totalChars * 0.15; // +/- 15% of total chars
      float offset = (h - 0.5) * window;
      float charIndex = clamp(baseIndex + offset, 0.0, totalChars - 1.0);

      // Rare cycling cells
      if (h2 > 0.997) {
        float cycleOffset = sin(time * 8.0 + h * 40.0) * window;
        charIndex = clamp(baseIndex + cycleOffset, 0.0, totalChars - 1.0);
      }

      // Convert char index to atlas UV
      float idx = floor(charIndex);
      float col = mod(idx, atlasSize.x);
      float row = floor(idx / atlasSize.x);

      vec2 atlasUV = vec2(
        (col + p.x) / atlasSize.x,
        (row + p.y) / atlasSize.y
      );

      // Sample the character from the atlas
      float charSample = 1.0 - luma(texture2D(tAtlas, atlasUV).rgb);

      // Black ink on white paper
      vec3 col3 = vec3(1.0 - charSample * 0.92);

      // Subtle vignette
      vec2 uv = pix / resolution;
      col3 *= 1.0 - 0.1 * length((uv - 0.5) * 1.5);

      gl_FragColor = vec4(col3, 1.0);
    }
  `
};
