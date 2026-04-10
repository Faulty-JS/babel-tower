/**
 * Antiquarian Print Shader for Babel
 *
 * Design direction: old book illustration / etching print.
 * The world looks like it was drawn by an illustrator for
 * a leather-bound volume of Borges. Every choice is intentional:
 *
 *   Palette:  Warm sepia — cream, ochre, umber, ink.
 *             A hint of scene color bleeds through for room variety.
 *   Edges:    Two-scale Sobel → bold ink outlines with pen-weight wobble.
 *   Tone:     S-curve contrast → mapped through the sepia gradient.
 *   Shadows:  Diagonal hatching with organic stroke breaks.
 *             Cross-hatching only in the deepest darks.
 *   Paper:    Gentle grain — the surface breathes.
 *   Compose:  Warm vignette pulls focus to center.
 */

export const ATLAS_INFO = { gridSize: 1, totalChars: 1 };

export function createCharAtlas(THREE) {
  const c = document.createElement('canvas');
  c.width = 1; c.height = 1;
  c.getContext('2d').fillRect(0, 0, 1, 1);
  const t = new THREE.CanvasTexture(c);
  t.needsUpdate = true;
  return t;
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

    // ── Antiquarian palette ──────────────────────────
    // Cream parchment, warm ochre, rich umber, dark ink
    const vec3 PAPER   = vec3(0.95, 0.91, 0.84);
    const vec3 MIDTONE = vec3(0.72, 0.58, 0.42);
    const vec3 SHADOW  = vec3(0.22, 0.16, 0.11);
    const vec3 INK     = vec3(0.08, 0.05, 0.03);

    float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

    // ── Noise ────────────────────────────────────────
    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
    }

    float vnoise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      return mix(
        mix(hash(i), hash(i + vec2(1, 0)), f.x),
        mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x),
        f.y
      );
    }

    // ── Sobel edge detection ─────────────────────────
    float sobel(vec2 uv, float scale) {
      vec2 t = scale / resolution;
      float tl = luma(texture2D(tDiffuse, uv + vec2(-t.x,  t.y)).rgb);
      float tc = luma(texture2D(tDiffuse, uv + vec2( 0.0,  t.y)).rgb);
      float tr = luma(texture2D(tDiffuse, uv + vec2( t.x,  t.y)).rgb);
      float ml = luma(texture2D(tDiffuse, uv + vec2(-t.x,  0.0)).rgb);
      float mr = luma(texture2D(tDiffuse, uv + vec2( t.x,  0.0)).rgb);
      float bl = luma(texture2D(tDiffuse, uv + vec2(-t.x, -t.y)).rgb);
      float bc = luma(texture2D(tDiffuse, uv + vec2( 0.0, -t.y)).rgb);
      float br = luma(texture2D(tDiffuse, uv + vec2( t.x, -t.y)).rgb);
      float gx = -tl - 2.0*ml - bl + tr + 2.0*mr + br;
      float gy = -tl - 2.0*tc - tr + bl + 2.0*bc + br;
      return sqrt(gx*gx + gy*gy);
    }

    void main() {
      vec2 uv = gl_FragCoord.xy / resolution;
      vec2 pix = gl_FragCoord.xy;

      // ── Sample scene ──────────────────────────────
      vec3 scene = texture2D(tDiffuse, uv).rgb;
      float l = luma(scene);
      float presence = smoothstep(0.01, 0.06, l);

      // ── Edge detection ────────────────────────────
      // Two scales: bold silhouettes + fine detail
      float edgeBold = sobel(uv, 1.5);
      float edgeFine = sobel(uv, 0.6);

      // Pen-weight variation (organic wobble)
      float penVar = vnoise(pix * 0.06) * 0.012;

      float outline = 0.0;
      outline += smoothstep(0.035 + penVar, 0.10, edgeBold);
      outline += smoothstep(0.07 + penVar, 0.18, edgeFine) * 0.35;
      outline = clamp(outline, 0.0, 1.0);

      // Heavier ink in darker regions
      outline *= mix(0.6, 1.0, smoothstep(0.5, 0.0, l));

      // ── Tonal mapping ─────────────────────────────
      // Aggressive brightness lift so dark rooms still read
      float t = clamp(l * 2.0 + 0.08, 0.0, 1.0);
      // S-curve for print-like contrast
      t = t * t * (3.0 - 2.0 * t);

      // Map through the sepia palette — pure, no scene color
      vec3 color = mix(SHADOW, MIDTONE, smoothstep(0.0, 0.4, t));
      color = mix(color, PAPER, smoothstep(0.3, 0.85, t));

      // ── Hatching (shadow regions only) ────────────
      float darkness = smoothstep(0.5, 0.0, t);

      if (darkness > 0.01) {
        float w = vnoise(pix * 0.05) * 4.0;

        // Primary diagonal strokes
        float spacing = mix(6.0, 3.5, darkness);
        float strokeLine = mod(pix.x - pix.y * 0.8 + w, spacing);
        float strokeW = mix(0.4, 1.3, darkness);
        float stroke = 1.0 - smoothstep(0.0, strokeW, strokeLine);

        // Break strokes for hand-drawn feel
        stroke *= step(0.18, vnoise(pix * 0.02 + 300.0));

        color = mix(color, INK, stroke * darkness * 0.55 * presence);

        // Cross-strokes in deeper shadows
        if (darkness > 0.45) {
          float crossDark = smoothstep(0.45, 1.0, darkness);
          float w2 = vnoise(pix * 0.04 + 80.0) * 3.0;
          float crossLine = mod(pix.x + pix.y * 0.8 + w2, spacing * 1.1);
          float crossStroke = 1.0 - smoothstep(0.0, strokeW * 0.8, crossLine);
          crossStroke *= step(0.25, vnoise(pix * 0.025 + 500.0));
          color = mix(color, INK, crossStroke * crossDark * 0.4 * presence);
        }
      }

      // ── Apply edges ───────────────────────────────
      color = mix(color, INK, outline * presence);

      // ── Paper for void areas ──────────────────────
      color = mix(PAPER, color, presence);

      // ── Paper grain ───────────────────────────────
      float grain = (vnoise(pix * 0.35) - 0.5) * 0.022;
      grain += (vnoise(pix * 1.8) - 0.5) * 0.010;
      color += grain;

      // ── Vignette ──────────────────────────────────
      vec2 vc = (uv - 0.5) * vec2(1.0, 1.15);
      color *= 1.0 - 0.28 * dot(vc, vc);

      gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
    }
  `
};
