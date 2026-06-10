precision highp float;

// State texture: R = pigment density, G = water (wetness)
uniform sampler2D u_prev;
uniform vec2  u_texel;
uniform float u_dt;

// Stroke injection (segment between last frame's and this frame's pointer)
uniform float u_drawing;   // 0 or 1
uniform vec2  u_from;      // UV
uniform vec2  u_to;        // UV
uniform float u_radius;    // brush radius, in V-normalized units
uniform float u_aspect;    // canvas width / height
uniform float u_pigment;   // pigment deposit per frame
uniform float u_water;     // water deposit per frame

// Behaviour
uniform float u_evaporation;
uniform float u_diffusion;
uniform float u_edgeFlow;

varying vec2 vUv;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i),               hash(i + vec2(1, 0)), f.x),
             mix(hash(i + vec2(0, 1)),  hash(i + vec2(1, 1)), f.x), f.y);
}

float sdSegment(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
  return length(pa - ba * h);
}

void main() {
  vec2 c = texture2D(u_prev, vUv).rg;
  vec2 n = texture2D(u_prev, vUv + vec2(0.0,  u_texel.y)).rg;
  vec2 s = texture2D(u_prev, vUv - vec2(0.0,  u_texel.y)).rg;
  vec2 e = texture2D(u_prev, vUv + vec2(u_texel.x, 0.0)).rg;
  vec2 w = texture2D(u_prev, vUv - vec2(u_texel.x, 0.0)).rg;
  vec2 avg = (n + s + e + w) * 0.25;

  float pig   = c.r;
  float water = c.g;

  // paper grain: makes diffusion uneven so edges wander organically
  float grain = vnoise(vUv * 240.0);

  // everything only moves while the paper is wet
  float wet = smoothstep(0.004, 0.10, water);

  // pigment spreads into neighbouring wet paper
  pig = mix(pig, avg.r, u_diffusion * wet * (0.72 + 0.28 * grain));

  // pigment crawls toward the drying boundary and piles up there
  // (the dark rim watercolor is known for)
  vec2 gradW = vec2(e.g - w.g, n.g - s.g);
  float gmag = length(gradW);
  if (gmag > 1e-5) {
    vec2 dir = gradW / gmag; // points toward the wetter side
    float upstream = texture2D(u_prev, vUv + dir * u_texel * 1.5).r;
    float pull = u_edgeFlow * wet * smoothstep(0.0, 0.06, gmag);
    pig += (upstream - pig) * pull;
  }

  // water spreads faster than pigment, then evaporates (grain dries unevenly)
  water = mix(water, avg.g, 0.45);
  water *= 1.0 - u_evaporation * u_dt * (0.7 + 0.6 * grain);

  // brush deposit along the pointer segment, gaussian falloff
  if (u_drawing > 0.5) {
    vec2 p = vec2(vUv.x * u_aspect, vUv.y);
    vec2 a = vec2(u_from.x * u_aspect, u_from.y);
    vec2 b = vec2(u_to.x   * u_aspect, u_to.y);
    float d = sdSegment(p, a, b);
    float m = exp(-(d * d) / (u_radius * u_radius * 0.5));
    pig   += u_pigment * m * (0.85 + 0.3 * grain);
    water += u_water * m;
  }

  gl_FragColor = vec4(clamp(pig, 0.0, 1.5), clamp(water, 0.0, 1.2), 0.0, 1.0);
}
