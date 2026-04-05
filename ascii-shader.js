/**
 * ASCII Art Post-Processing Shader for Babel
 *
 * Edge-detection based: draws black outlines on white background.
 * Combines Sobel edge detection with subtle ASCII fill for depth.
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

    float luminance(vec3 c) {
      return dot(c, vec3(0.2126, 0.7152, 0.0722));
    }

    // Simple hash for per-cell randomness
    float hash21(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
    }

    // Sobel edge detection
    float edgeDetect(vec2 uv) {
      vec2 texel = 1.0 / resolution;

      float tl = luminance(texture2D(tDiffuse, uv + vec2(-texel.x, texel.y)).rgb);
      float tm = luminance(texture2D(tDiffuse, uv + vec2(0.0, texel.y)).rgb);
      float tr = luminance(texture2D(tDiffuse, uv + vec2(texel.x, texel.y)).rgb);
      float ml = luminance(texture2D(tDiffuse, uv + vec2(-texel.x, 0.0)).rgb);
      float mr = luminance(texture2D(tDiffuse, uv + vec2(texel.x, 0.0)).rgb);
      float bl = luminance(texture2D(tDiffuse, uv + vec2(-texel.x, -texel.y)).rgb);
      float bm = luminance(texture2D(tDiffuse, uv + vec2(0.0, -texel.y)).rgb);
      float br = luminance(texture2D(tDiffuse, uv + vec2(texel.x, -texel.y)).rgb);

      float gx = -tl - 2.0*ml - bl + tr + 2.0*mr + br;
      float gy = -tl - 2.0*tm - tr + bl + 2.0*bm + br;

      return sqrt(gx * gx + gy * gy);
    }

    // Render a character cell as filled or empty based on density
    // Uses procedural pattern instead of bitmap lookup for compatibility
    float charPattern(float density, vec2 p, float variant) {
      // p is 0..1 within the cell
      // density 0..1 controls how much of the cell is filled
      // variant adds per-cell uniqueness

      if (density < 0.02) return 0.0; // blank

      // Dot pattern: more dots = denser character
      float px = p.x;
      float py = p.y;

      // Center dot (appears at low density)
      float d = length(p - vec2(0.5)) * 2.0;
      float dots = step(d, density * 0.6);

      // Cross pattern at medium density
      if (density > 0.25) {
        float cross = step(abs(px - 0.5), 0.12) * step(abs(py - 0.5), density * 0.4);
        cross += step(abs(py - 0.5), 0.12) * step(abs(px - 0.5), density * 0.4);
        dots = max(dots, min(cross, 1.0));
      }

      // Grid fill at high density
      if (density > 0.5) {
        // Variant shifts the pattern
        float offset = variant * 0.15;
        float gx = step(0.5, fract(px * (2.0 + density * 3.0) + offset));
        float gy = step(0.5, fract(py * (2.0 + density * 3.0) + offset * 1.3));
        float grid = gx * gy;
        dots = max(dots, grid * density);
      }

      // Solid fill at very high density
      if (density > 0.85) {
        dots = max(dots, step(0.1, density));
      }

      return clamp(dots, 0.0, 1.0);
    }

    void main() {
      vec2 pix = gl_FragCoord.xy;
      vec2 cell = floor(pix / charSize) * charSize;
      vec2 cellCenter = (cell + charSize * 0.5) / resolution;

      vec4 texel = texture2D(tDiffuse, cellCenter);
      float lum = luminance(texel.rgb);

      // Edge detection
      float edge = 0.0;
      vec2 texelSize = 1.0 / resolution;
      edge += edgeDetect(cellCenter);
      edge += edgeDetect(cellCenter + vec2(texelSize.x, 0.0));
      edge += edgeDetect(cellCenter + vec2(0.0, texelSize.y));
      edge /= 3.0;
      edge = smoothstep(0.05, 0.25, edge);

      // Subtle shading for dark areas
      float shade = 1.0 - smoothstep(0.0, 0.5, lum);
      shade *= 0.3;

      // Combine
      float ink = max(edge, shade);

      // Per-cell hash for variance
      vec2 cellId = floor(pix / charSize);
      float h1 = hash21(cellId);
      float h2 = hash21(cellId + vec2(73.0, 157.0));

      // ~0.3% of cells cycle rapidly
      float variant = h1;
      if (h2 > 0.997) {
        variant = fract(time * 8.0 + h1 * 20.0);
      }

      // Render character pattern
      vec2 p = mod(pix, charSize) / charSize;
      float c = charPattern(ink, p, variant);

      // Black ink on white paper
      vec3 paper = vec3(1.0, 0.99, 0.97);
      vec3 inkColor = vec3(0.0, 0.0, 0.0);
      vec3 col = mix(paper, inkColor, c);

      // Subtle vignette
      vec2 uv = gl_FragCoord.xy / resolution;
      float vig = 1.0 - 0.12 * length((uv - 0.5) * 1.6);
      col *= vig;

      gl_FragColor = vec4(col, 1.0);
    }
  `
};
