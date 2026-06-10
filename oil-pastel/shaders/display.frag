precision highp float;

uniform sampler2D u_state;
uniform vec2  u_paperScale;    // aspect-correct paper-space coordinates
uniform vec2  u_texel;
uniform float u_grain;         // how much thin layers break over the tooth
uniform float u_relief;        // waxy emboss strength

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

// procedural paper tooth — seamless and uniform across the whole sheet
// (same field the sim pass catches pigment against)
float toothAt(vec2 pc) {
  return clamp(vnoise(pc * 45.0)  * 0.30
             + vnoise(pc * 160.0) * 0.40
             + vnoise(pc * 420.0) * 0.30, 0.0, 1.0);
}

void main() {
  vec2 pc = vUv * u_paperScale; // aspect-correct paper coordinates
  float tooth = toothAt(pc);

  // near-white sheet; recesses read a whisper darker, nothing more
  vec3 paper = vec3(0.994, 0.992, 0.987) - (1.0 - tooth) * 0.018;

  vec4 st = texture2D(u_state, vUv);
  float cov = st.a;
  vec3 pig = cov > 1e-4 ? st.rgb / cov : vec3(1.0);

  // display-resolution break-up: thin pastel only sits on the raised
  // threads, leaving white valleys; thick pastel buries the weave
  float fill = cov * (0.35 + 1.3 * tooth) - (1.0 - tooth) * u_grain * 0.5;
  float alpha = smoothstep(0.015, 0.55, fill);

  // waxy relief: light the pastel by the slope of its thickness
  float hx = texture2D(u_state, vUv + vec2(u_texel.x, 0.0)).a
           - texture2D(u_state, vUv - vec2(u_texel.x, 0.0)).a;
  float hy = texture2D(u_state, vUv + vec2(0.0, u_texel.y)).a
           - texture2D(u_state, vUv - vec2(0.0, u_texel.y)).a;
  // micro-bumps from the tooth showing through the pastel skin
  float tx = vnoise(pc * 300.0 + vec2(1.3, 0.0)) - vnoise(pc * 300.0 - vec2(1.3, 0.0));
  float ty = vnoise(pc * 300.0 + vec2(0.0, 1.3)) - vnoise(pc * 300.0 - vec2(0.0, 1.3));
  vec3 nrm = normalize(vec3(
    -(hx * 6.0 + tx * 0.8) * u_relief,
    -(hy * 6.0 + ty * 0.8) * u_relief,
    1.0));

  vec3 L = normalize(vec3(-0.35, 0.55, 0.76));
  float diff = 0.78 + 0.28 * max(dot(nrm, L), 0.0);
  float spec = pow(max(reflect(-L, nrm).z, 0.0), 14.0)
             * 0.22 * smoothstep(0.25, 1.4, cov);

  // pigment caught on the peaks reads a touch brighter than in the valleys
  float peakShade = 0.9 + 0.18 * tooth;

  vec3 pastel = pig * diff * peakShade + spec;

  vec3 col = mix(paper, pastel, alpha);
  gl_FragColor = vec4(col, 1.0);
}
