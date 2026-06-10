precision highp float;

// State texture (premultiplied): RGB = surface colour * thickness, A = thickness.
// Dry medium: pigment never moves on its own — it only goes where the stick
// touches, and only comes off onto the parts of the tooth it can reach.

uniform sampler2D u_prev;
uniform vec2  u_paperScale;     // aspect-correct paper-space coordinates
uniform vec2  u_texel;

// Stroke injection (segment between last frame's and this frame's pointer)
uniform float u_drawing;        // 0 or 1
uniform vec2  u_from;           // UV
uniform vec2  u_to;             // UV
uniform float u_radius;         // stick half-width, V-normalized
uniform float u_aspect;
uniform vec3  u_color;          // stick colour (linear-ish sRGB)
uniform float u_pressure;       // 0..1  how hard the stick is pressed
uniform float u_flow;           // pigment shed per frame
uniform float u_smear;          // 0..1  drag/blend of existing pastel

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

float sdSegment(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
  return length(pa - ba * h);
}

// blend pigments in linear-light space: keeps mixtures luminous and paint-like
// (straight sRGB lerps dull out, e.g. red+yellow turning muddy instead of orange)
vec3 mixPigment(vec3 a, vec3 b, float t) {
  return sqrt(mix(a * a, b * b, clamp(t, 0.0, 1.0)));
}

// procedural paper tooth — seamless and uniform across the whole sheet
// (shared with the display pass, which uses the same coordinates)
float toothAt(vec2 pc) {
  return clamp(vnoise(pc * 45.0)  * 0.30
             + vnoise(pc * 160.0) * 0.40
             + vnoise(pc * 420.0) * 0.30, 0.0, 1.0);
}

void main() {
  vec4 st = texture2D(u_prev, vUv);
  float cov = st.a;
  vec3 col = cov > 1e-4 ? st.rgb / cov : vec3(1.0);

  if (u_drawing > 0.5) {
    vec2 p = vec2(vUv.x * u_aspect, vUv.y);
    vec2 a = vec2(u_from.x * u_aspect, u_from.y);
    vec2 b = vec2(u_to.x   * u_aspect, u_to.y);

    // crayon edges are ragged, not airbrushed: wobble the distance field
    float wob = vnoise(p * 110.0) - 0.5;
    float d = sdSegment(p, a, b) + wob * u_radius * 0.85;
    float m = 1.0 - smoothstep(u_radius * 0.45, u_radius, d);

    if (m > 0.001) {
      float tooth = toothAt(vUv * u_paperScale);

      // striations along the stroke direction (uneven shed across the stick)
      vec2 ba = b - a;
      vec2 dir = dot(ba, ba) > 1e-9 ? normalize(ba) : vec2(1.0, 0.0);
      vec2 perp = vec2(-dir.y, dir.x);
      float lane = vnoise(vec2(dot(p, perp) * 240.0, dot(p, dir) * 12.0));

      // light pressure only kisses the raised threads (broken scumble);
      // pressure — and pastel already filling the valleys — reaches deeper
      float reach = u_pressure * (0.45 + 0.55 * m) + min(cov, 1.0) * 0.45;
      float caught = smoothstep(1.0 - reach * 1.35, 1.25 - reach * 1.35, tooth);

      float dep = u_flow * m * caught * (0.55 + 0.6 * lane);

      // fresh pigment works into the surface skin instead of instantly
      // covering it: light passes glaze and blend, heavy passes coat
      float skin = min(cov, 0.85);
      float take = clamp(dep / (skin + dep + 1e-5), 0.0, 1.0)
                 * (0.4 + 0.6 * u_pressure);
      col = mixPigment(col, u_color, take);
      cov = min(cov + dep, 2.0);

      // the stick always drags the layer it moves across — two taps behind
      // the stroke pull colour forward into a smooth worked gradient
      float blendAmt = 0.3 + 0.7 * u_smear;       // never zero: pastel always blends
      vec2 uvDir = normalize(vec2(dir.x / u_aspect, dir.y));
      vec4 b1 = texture2D(u_prev, vUv - uvDir * u_texel * (2.0 + u_smear * 4.0));
      vec4 b2 = texture2D(u_prev, vUv - uvDir * u_texel * (5.0 + u_smear * 9.0));
      vec4 back = b1 * 0.65 + b2 * 0.35;
      vec3 backCol = back.a > 1e-4 ? back.rgb / back.a : col;
      float drag = blendAmt * m * (0.35 + 0.65 * u_pressure)
                 * smoothstep(0.02, 0.35, back.a);
      col = mixPigment(col, backCol, drag * 0.6);
      cov = mix(cov, max(cov, back.a), drag * 0.4);

      // kneading: wherever the stick presses, neighbouring colours soften
      // into each other a little, like burnishing with the stick's flat
      vec4 nb = 0.25 * (
        texture2D(u_prev, vUv + vec2(u_texel.x * 2.0, 0.0)) +
        texture2D(u_prev, vUv - vec2(u_texel.x * 2.0, 0.0)) +
        texture2D(u_prev, vUv + vec2(0.0, u_texel.y * 2.0)) +
        texture2D(u_prev, vUv - vec2(0.0, u_texel.y * 2.0)));
      vec3 nbCol = nb.a > 1e-4 ? nb.rgb / nb.a : col;
      float knead = blendAmt * m * 0.22 * smoothstep(0.05, 0.4, nb.a)
                  * smoothstep(0.05, 0.3, cov);
      col = mixPigment(col, nbCol, knead);
    }
  }

  gl_FragColor = vec4(col * cov, cov);
}
