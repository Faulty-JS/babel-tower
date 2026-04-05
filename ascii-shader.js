/**
 * ASCII Art Post-Processing Shader for Babel
 *
 * Edge-detection + luminance shading, black ink on white paper.
 * Per-cell character variance with rare cycling cells.
 */

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
    uniform float charSize;
    uniform float time;

    varying vec2 vUv;

    float luma(vec3 c) {
      return dot(c, vec3(0.299, 0.587, 0.114));
    }

    float rand(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
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

      // Edge strength
      float edge = sobel(cellCenter);
      edge = smoothstep(0.04, 0.2, edge);

      // Luminance-based fill (bright scene areas = more ink on white paper)
      float fill = smoothstep(0.02, 0.8, l) * 0.5;

      // Total ink
      float ink = clamp(edge + fill, 0.0, 1.0);

      // Per-cell variance
      float h = rand(cellId);
      float h2 = rand(cellId + 73.0);

      // Rare fast-cycling cells
      float vary = h;
      if (h2 > 0.997) {
        vary = fract(time * 8.0 + h * 20.0);
      }

      // Procedural character pattern within the cell
      float c = 0.0;

      // Center dot
      float dot1 = 1.0 - smoothstep(0.0, 0.2 + ink * 0.3, length(p - 0.5));
      c = dot1 * step(0.05, ink);

      // Add cross arms at higher ink
      if (ink > 0.3) {
        float cross1 = step(abs(p.x - 0.5), 0.1) * step(abs(p.y - 0.5), ink * 0.45);
        float cross2 = step(abs(p.y - 0.5), 0.1) * step(abs(p.x - 0.5), ink * 0.45);
        c = max(c, (cross1 + cross2) * ink);
      }

      // Add diagonal strokes at higher ink, offset by variance
      if (ink > 0.5) {
        float d1 = abs((p.x - 0.5) - (p.y - 0.5 + vary * 0.1));
        float d2 = abs((p.x - 0.5) + (p.y - 0.5 - vary * 0.1));
        float diag = step(d1, 0.08) + step(d2, 0.08);
        c = max(c, diag * (ink - 0.3));
      }

      // Near-solid fill at high ink
      if (ink > 0.8) {
        c = max(c, ink);
      }

      c = clamp(c, 0.0, 1.0);

      // Black ink on white paper
      vec3 col = vec3(1.0 - c * 0.95);

      // Vignette
      vec2 uv = pix / resolution;
      col *= 1.0 - 0.1 * length((uv - 0.5) * 1.5);

      gl_FragColor = vec4(col, 1.0);
    }
  `
};
