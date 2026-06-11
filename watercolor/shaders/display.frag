precision highp float;

uniform sampler2D u_state;
uniform vec2  u_texel;
uniform float u_edge;     // rim darkening strength
uniform float u_granul;   // granulation amount

varying vec2 vUv;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i),              hash(i + vec2(1, 0)), f.x),
             mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}

void main() {
  // RGB = per-channel pigment absorbance (subtractive colour state)
  vec3 pig = texture2D(u_state, vUv).rgb;
  float p = dot(pig, vec3(0.3333));

  // absorbance gradient -> dark rim where the wash piles up at its boundary
  vec3 dx = texture2D(u_state, vUv + vec2(u_texel.x, 0.0)).rgb
          - texture2D(u_state, vUv - vec2(u_texel.x, 0.0)).rgb;
  vec3 dy = texture2D(u_state, vUv + vec2(0.0, u_texel.y)).rgb
          - texture2D(u_state, vUv - vec2(0.0, u_texel.y)).rgb;
  float edge = length(vec2(dot(dx, vec3(0.3333)), dot(dy, vec3(0.3333))));

  // rim + granulation scale the whole absorbance, keeping the wash's hue
  float boost = 1.0 + edge * u_edge * smoothstep(0.01, 0.25, p + edge)
                      / max(p, 0.06);
  float g = vnoise(vUv * 360.0);
  boost *= 1.0 - u_granul * g * smoothstep(0.04, 0.5, p);

  // faint paper tooth on light areas — barely-there, uniform across the sheet
  float tooth = vnoise(vUv * 720.0) * 0.6 + vnoise(vUv * 260.0) * 0.4;
  vec3 paper = vec3(0.994, 0.992, 0.987)
             - tooth * 0.012 * (1.0 - smoothstep(0.0, 0.4, p));

  // Beer–Lambert: the wash is a transparent filter over the paper, so
  // overlapping pigments mix subtractively and faint washes tint gently
  vec3 col = paper * exp(-pig * boost);

  gl_FragColor = vec4(col, 1.0);
}
