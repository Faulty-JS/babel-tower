/**
 * ASCII Art Post-Processing Shader for Babel
 *
 * Edge-detection based: draws black outlines on white background.
 * Combines Sobel edge detection with subtle ASCII fill for depth.
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
    uniform sampler2D tDiffuse;
    uniform vec2 resolution;
    uniform float charSize;
    uniform float time;

    varying vec2 vUv;

    // 5x5 bitmap character
    float getBit(int n, vec2 p) {
      p = floor(p * vec2(-5.0, 5.0) + 2.5);
      if (p.x < 0.0 || p.x > 4.0 || p.y < 0.0 || p.y > 4.0) return 0.0;
      int idx = int(p.x) + int(p.y) * 5;
      return float((n >> idx) & 1);
    }

    float luminance(vec3 c) {
      return dot(c, vec3(0.2126, 0.7152, 0.0722));
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

    void main() {
      vec2 pix = gl_FragCoord.xy;
      vec2 cell = floor(pix / charSize) * charSize;
      vec2 cellCenter = (cell + charSize * 0.5) / resolution;

      vec4 texel = texture2D(tDiffuse, cellCenter);
      float lum = luminance(texel.rgb);

      // Edge detection at cell center (sample multiple points for stability)
      float edge = 0.0;
      vec2 texelSize = 1.0 / resolution;
      edge += edgeDetect(cellCenter);
      edge += edgeDetect(cellCenter + vec2(texelSize.x, 0.0));
      edge += edgeDetect(cellCenter + vec2(0.0, texelSize.y));
      edge /= 3.0;

      // Amplify edges
      edge = smoothstep(0.05, 0.25, edge);

      // Also add subtle shading for dark areas (not just edges)
      float shade = 1.0 - smoothstep(0.0, 0.5, lum);
      shade *= 0.3; // Keep shading subtle

      // Combine: edges are primary, shading is secondary
      float ink = max(edge, shade);

      // Pick character density based on ink amount
      int n = 0;
      if (ink > 0.05) n = 4096;        // .
      if (ink > 0.12) n = 131200;       // :
      if (ink > 0.20) n = 14745600;     // -
      if (ink > 0.30) n = 4675652;      // +
      if (ink > 0.42) n = 11512810;     // *
      if (ink > 0.55) n = 15255086;     // o
      if (ink > 0.68) n = 13199452;     // #
      if (ink > 0.80) n = 15239202;     // %
      if (ink > 0.90) n = 32424190;     // @

      vec2 p = mod(pix, charSize) / charSize;
      float c = getBit(n, p);

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
