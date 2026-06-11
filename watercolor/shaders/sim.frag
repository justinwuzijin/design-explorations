precision highp float;

// State texture: RGB = pigment absorbance per colour channel, A = water.
// Absorbances add where pigments meet, which is exactly how real watercolor
// mixes (subtractive): yellow over blue makes green, overlaps darken.
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
uniform vec3  u_absorb;    // brush pigment absorbance (from swatch colour)
uniform float u_charge;    // water load: 1 at the first touch, empties as the stroke travels

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
  vec4 c = texture2D(u_prev, vUv);
  vec4 n = texture2D(u_prev, vUv + vec2(0.0,  u_texel.y));
  vec4 s = texture2D(u_prev, vUv - vec2(0.0,  u_texel.y));
  vec4 e = texture2D(u_prev, vUv + vec2(u_texel.x, 0.0));
  vec4 w = texture2D(u_prev, vUv - vec2(u_texel.x, 0.0));
  vec4 avg = (n + s + e + w) * 0.25;

  vec3  pig   = c.rgb;
  float water = c.a;

  // paper grain: makes diffusion uneven so edges wander organically
  float grain = vnoise(vUv * 240.0);

  // everything only moves while the paper is wet
  float wet = smoothstep(0.004, 0.10, water);

  // pigment spreads into neighbouring wet paper; each channel diffuses on
  // its own, so adjoining colours bleed into one another and mix in the water
  pig = mix(pig, avg.rgb, u_diffusion * wet * (0.72 + 0.28 * grain));

  // pigment crawls toward the drying boundary and piles up there
  // (the dark rim watercolor is known for)
  vec2 gradW = vec2(e.a - w.a, n.a - s.a);
  float gmag = length(gradW);
  if (gmag > 1e-5) {
    vec2 dir = gradW / gmag; // points toward the wetter side
    vec3 upstream = texture2D(u_prev, vUv + dir * u_texel * 1.5).rgb;
    float pull = u_edgeFlow * wet * smoothstep(0.0, 0.06, gmag);
    pig += (upstream - pig) * pull;
  }

  // water spreads faster than pigment, then evaporates (grain dries unevenly).
  // standing water behaves like liquid: a loaded puddle pushes outward faster
  // and resists drying until it has thinned out
  float puddle = smoothstep(0.25, 0.9, avg.a);
  water = mix(water, avg.a, 0.45 + 0.3 * puddle);
  water *= 1.0 - u_evaporation * u_dt * (0.7 + 0.6 * grain) * (1.0 - 0.45 * puddle);

  // brush deposit along the pointer segment, gaussian falloff;
  // depositing absorbance means colours laid into wet paint mix subtractively
  if (u_drawing > 0.5) {
    vec2 p = vec2(vUv.x * u_aspect, vUv.y);
    vec2 a = vec2(u_from.x * u_aspect, u_from.y);
    vec2 b = vec2(u_to.x   * u_aspect, u_to.y);
    float d = sdSegment(p, a, b);
    float m = exp(-(d * d) / (u_radius * u_radius * 0.5));
    pig   += u_absorb * (u_pigment * m * (0.85 + 0.3 * grain));

    // a freshly dipped brush releases a wide bead of water that blooms past
    // the pigment; as the charge empties the stroke turns drier and tighter
    float mw = exp(-(d * d) / (u_radius * u_radius * (0.5 + 1.1 * u_charge)));
    water += u_water * mw * (0.55 + 1.65 * u_charge);
  }

  gl_FragColor = vec4(clamp(pig, vec3(0.0), vec3(2.5)), clamp(water, 0.0, 1.2));
}
