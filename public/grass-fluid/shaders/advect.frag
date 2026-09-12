precision highp float;

varying vec2 v_uv;

uniform sampler2D u_velocity;
uniform vec2 u_texelSize;
uniform float u_time;
uniform float u_dt;
uniform float u_windIntensity;
uniform float u_windAngle;
uniform vec2 u_mousePos;
uniform vec2 u_mouseDelta;
uniform float u_influenceRadius;
uniform float u_cursorStrength;

// ---- Simplex noise (Ashima Arts / Stefan Gustavson) ----
vec3 _mod289v3(vec3 x) { return x - floor(x * (1.0/289.0)) * 289.0; }
vec2 _mod289v2(vec2 x) { return x - floor(x * (1.0/289.0)) * 289.0; }
vec3 _permute(vec3 x) { return _mod289v3(((x*34.0)+1.0)*x); }

float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                     -0.577350269189626, 0.024390243902439);
  vec2 i  = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = _mod289v2(i);
  vec3 p = _permute(_permute(i.y + vec3(0.0, i1.y, 1.0))
                  + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
  m = m*m; m = m*m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
  vec3 g;
  g.x  = a0.x  * x0.x   + h.x  * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

// Curl noise — divergence-free 2D vector field
vec2 curlNoise(vec2 p, float t) {
  const float eps = 0.005;
  vec2 sp = p * 2.8;
  float n1 = snoise(vec2(sp.x, sp.y + eps) + t);
  float n2 = snoise(vec2(sp.x, sp.y - eps) + t);
  float n3 = snoise(vec2(sp.x + eps, sp.y) + t);
  float n4 = snoise(vec2(sp.x - eps, sp.y) + t);
  return vec2((n1 - n2), -(n3 - n4)) / (2.0 * eps) * 0.035;
}

void main() {
  vec2 uv = v_uv;

  // Semi-Lagrangian advection: back-trace using current velocity
  vec2 vel = texture2D(u_velocity, uv).xy;
  vec2 prevUV = clamp(uv - vel * u_dt * 0.6, vec2(0.0), vec2(1.0));
  vec2 advected = texture2D(u_velocity, prevUV).xy;

  // Natural damping
  advected *= 0.983;

  // Wind direction vector
  float windRad = u_windAngle * 3.14159265 / 180.0;
  vec2 windDir = vec2(cos(windRad), sin(windRad));

  // Slow base gust (directional)
  float slowT = u_time * 0.07;
  float gustMod = snoise(vec2(uv.x * 1.5 + slowT, uv.y * 1.5 + slowT * 0.6)) * 0.5 + 0.5;
  vec2 baseWind = windDir * (0.4 + gustMod * 1.2) * 0.018 * u_windIntensity;

  // Curl turbulence layered at two scales
  float t1 = u_time * 0.10;
  float t2 = u_time * 0.17;
  vec2 curl1 = curlNoise(uv, t1);
  vec2 curl2 = curlNoise(uv * 2.1 + 0.37, t2) * 0.45;
  vec2 turbulence = (curl1 + curl2) * u_windIntensity;

  advected += baseWind + turbulence;

  // Mouse/cursor impulse
  vec2 toMouse = uv - u_mousePos;
  float dist = length(toMouse);
  float r = max(u_influenceRadius, 0.02);

  if (dist < r) {
    float falloff = 1.0 - smoothstep(0.0, r, dist);
    falloff = falloff * falloff * falloff;

    // Push outward from cursor
    vec2 outward = (dist > 0.001) ? normalize(toMouse) : vec2(0.0);
    float speed = length(u_mouseDelta);
    vec2 impulse = outward * speed * 1.8
                 + u_mouseDelta * 2.2;

    advected += impulse * falloff * u_cursorStrength * 6.0;
  }

  // Prevent runaway
  advected = clamp(advected, vec2(-3.0), vec2(3.0));

  gl_FragColor = vec4(advected, 0.0, 1.0);
}
