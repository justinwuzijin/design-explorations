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

// Indigo wash ramp sampled from the reference image:
// warm paper -> pale blue-gray wash -> mist -> slate -> indigo -> near-black ink
vec3 ramp(float t) {
  vec3 paper  = vec3(0.994, 0.992, 0.987);
  vec3 pale   = vec3(0.812, 0.831, 0.871);
  vec3 mist   = vec3(0.624, 0.655, 0.733);
  vec3 slate  = vec3(0.412, 0.447, 0.557);
  vec3 indigo = vec3(0.196, 0.227, 0.353);
  vec3 ink    = vec3(0.067, 0.086, 0.176);

  t = clamp(t, 0.0, 1.0);
  vec3 col = mix(paper, pale,  smoothstep(0.00, 0.22, t));
  col      = mix(col,  mist,   smoothstep(0.18, 0.45, t));
  col      = mix(col,  slate,  smoothstep(0.40, 0.65, t));
  col      = mix(col,  indigo, smoothstep(0.60, 0.85, t));
  col      = mix(col,  ink,    smoothstep(0.82, 1.00, t));
  return col;
}

void main() {
  float p = texture2D(u_state, vUv).r;

  // pigment gradient -> dark rim where the wash piles up at its boundary
  float px = texture2D(u_state, vUv + vec2(u_texel.x, 0.0)).r
           - texture2D(u_state, vUv - vec2(u_texel.x, 0.0)).r;
  float py = texture2D(u_state, vUv + vec2(0.0, u_texel.y)).r
           - texture2D(u_state, vUv - vec2(0.0, u_texel.y)).r;
  float edge = length(vec2(px, py));

  float density = p + edge * u_edge * smoothstep(0.01, 0.25, p + edge);

  // granulation: pigment settles into the paper tooth
  float g = vnoise(vUv * 360.0);
  density *= 1.0 - u_granul * g * smoothstep(0.04, 0.5, p);

  vec3 col = ramp(density);

  // faint paper tooth on light areas — barely-there, uniform across the sheet
  float tooth = vnoise(vUv * 720.0) * 0.6 + vnoise(vUv * 260.0) * 0.4;
  col -= tooth * 0.012 * (1.0 - smoothstep(0.0, 0.4, p));

  gl_FragColor = vec4(col, 1.0);
}
