/**
 * ASCII Art Post-Processing Shader for Babel
 *
 * Black text on white background.
 * Maps brightness to ASCII characters — dark areas get dense chars, bright areas get sparse.
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

    // 5x5 bitmap font encoded as integers.
    float getBit(int n, vec2 p) {
      p = floor(p * vec2(-5.0, 5.0) + 2.5);
      if (p.x < 0.0 || p.x > 4.0 || p.y < 0.0 || p.y > 4.0) return 0.0;
      int idx = int(p.x) + int(p.y) * 5;
      return float((n >> idx) & 1);
    }

    void main() {
      vec2 pix = gl_FragCoord.xy;
      vec2 cell = floor(pix / charSize) * charSize;
      vec2 cellCenter = (cell + charSize * 0.5) / resolution;

      vec4 texel = texture2D(tDiffuse, cellCenter);
      float lum = dot(texel.rgb, vec3(0.2126, 0.7152, 0.0722));

      // Strong contrast — push midtones apart
      lum = smoothstep(0.0, 0.65, lum);

      // INVERTED: dense characters for DARK, blank for BRIGHT
      int n = 32424190;       // @ (darkest = most ink)
      if (lum > 0.08) n = 15239202;  // %
      if (lum > 0.15) n = 13199452;  // #
      if (lum > 0.22) n = 15255086;  // o
      if (lum > 0.30) n = 11512810;  // *
      if (lum > 0.38) n = 4675652;   // +
      if (lum > 0.48) n = 14762080;  // =
      if (lum > 0.58) n = 14745600;  // -
      if (lum > 0.68) n = 131200;    // :
      if (lum > 0.78) n = 4096;      // .
      if (lum > 0.88) n = 0;         // blank white

      vec2 p = mod(pix, charSize) / charSize;
      float c = getBit(n, p);

      // Black text on white background
      vec3 inkColor = vec3(0.0, 0.0, 0.0); // pure black ink
      vec3 paperColor = vec3(1.0, 0.99, 0.97); // clean white paper

      // Very subtle scene color tint on ink
      vec3 tintedInk = mix(inkColor, texel.rgb * 0.2, 0.1);

      vec3 col = mix(paperColor, tintedInk, c);

      // Subtle vignette (darken edges)
      vec2 uv = gl_FragCoord.xy / resolution;
      float vig = 1.0 - 0.15 * length((uv - 0.5) * 1.6);
      col *= vig;

      gl_FragColor = vec4(col, 1.0);
    }
  `
};
