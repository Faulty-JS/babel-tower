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

      // Hash the cell position for per-cell randomness (deterministic)
      vec2 cellId = floor(pix / charSize);
      float hash = fract(sin(dot(cellId, vec2(127.1, 311.7))) * 43758.5453);
      float hash2 = fract(sin(dot(cellId, vec2(269.5, 183.3))) * 61532.1947);

      // ~0.3% of cells slowly cycle their character variant
      // hash2 selects which cells cycle; time drives the animation
      int variant;
      if (hash2 > 0.997) {
        // Rare cycling cell: smoothly rotates through variants
        variant = int(mod(floor(time * 8.0 + hash * 20.0), 3.0));
      } else {
        variant = int(hash * 3.0); // stable per-cell pick
      }

      // Pick character with per-cell variance
      // Each density level has 3 character options
      int n = 0;
      if (ink > 0.05) {
        // sparse: . , `
        if (variant == 0) n = 4096;       // .
        else if (variant == 1) n = 8192;   // ,
        else n = 16384;                    // `
      }
      if (ink > 0.12) {
        // light: : ; -
        if (variant == 0) n = 131200;      // :
        else if (variant == 1) n = 135296;  // ;
        else n = 14745600;                  // -
      }
      if (ink > 0.22) {
        // medium-light: = ~ +
        if (variant == 0) n = 14762080;    // =
        else if (variant == 1) n = 4675652; // +
        else n = 14752800;                  // ~
      }
      if (ink > 0.34) {
        // medium: * x /
        if (variant == 0) n = 11512810;    // *
        else if (variant == 1) n = 11162952; // x
        else n = 4329604;                   // /
      }
      if (ink > 0.48) {
        // medium-dense: o 0 &
        if (variant == 0) n = 15255086;    // o
        else if (variant == 1) n = 15255150; // 0
        else n = 11197490;                  // &
      }
      if (ink > 0.62) {
        // dense: # $ %
        if (variant == 0) n = 13199452;    // #
        else if (variant == 1) n = 15252014; // $
        else n = 15239202;                  // %
      }
      if (ink > 0.78) {
        // very dense: @ W M
        if (variant == 0) n = 32424190;    // @
        else if (variant == 1) n = 31983550; // W
        else n = 32307775;                  // M
      }

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
