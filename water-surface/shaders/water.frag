precision highp float;

varying vec2  v_uv;
varying float v_height;
varying vec3  v_viewDir;
varying float v_depth;

uniform sampler2D u_normalMap;
uniform float     u_time;

// ---- Environment ----
const vec3 SKY_ZENITH  = vec3(0.22, 0.45, 0.82);
const vec3 SKY_HORIZON = vec3(0.55, 0.72, 0.90);
const vec3 SKY_GROUND  = vec3(0.06, 0.10, 0.18);

const vec3 WATER_DEEP  = vec3(0.008, 0.028, 0.075);
const vec3 WATER_MID   = vec3(0.012, 0.055, 0.130);

// Foam / disturbed surface
const vec3 FOAM_COLOR  = vec3(0.88, 0.93, 0.98);   // near-white with faint blue tint

// Sun
const vec3 SUN_DIR     = vec3(0.40, 0.84, 0.24);
const vec3 SUN_COLOR   = vec3(1.00, 0.97, 0.90);

// Schlick Fresnel — water F0 = 0.02 (n=1.33)
float fresnel(float cosTheta) {
  return 0.02 + 0.98 * pow(clamp(1.0 - cosTheta, 0.0, 1.0), 5.0);
}

vec3 skyEnv(vec3 r) {
  float up = r.y;
  if (up > 0.0) {
    return mix(SKY_HORIZON, SKY_ZENITH, pow(up, 0.35));
  } else {
    return mix(SKY_GROUND, WATER_DEEP, clamp(-up * 4.0, 0.0, 1.0));
  }
}

void main() {
  vec3 N = normalize(texture2D(u_normalMap, v_uv).rgb * 2.0 - 1.0);
  vec3 V = normalize(v_viewDir);
  vec3 L = normalize(SUN_DIR);
  vec3 R = reflect(-V, N);

  // ---- Fresnel ----
  float cosTheta = max(0.0, dot(N, V));
  float F = fresnel(cosTheta);
  // Boost F so reflections are visible from our overhead angle
  F = clamp(F * 3.5 + 0.08, 0.0, 0.95);

  // ---- Environment reflection ----
  vec3 refl = skyEnv(R);

  // ---- Refracted water body ----
  // At rest: deep blue. Active ripple areas: slightly lighter
  float activity = clamp(abs(v_height) * 6.0, 0.0, 1.0);
  vec3 refracted = mix(WATER_DEEP, WATER_MID, activity);

  // ---- Base water colour from Fresnel blend ----
  vec3 color = mix(refracted, refl, F);

  // ---- Foam at disturbed surface ----
  // Real water: both wave crests (positive) and churned troughs show white foam
  // Smooth threshold so rings get bright white fringes
  float disturbance = abs(v_height);
  float foamMask = smoothstep(0.12, 0.45, disturbance);
  // Crests are brighter than troughs
  float crestBoost = smoothstep(0.0, 0.3, v_height);
  float foam = foamMask * (0.55 + 0.45 * crestBoost);
  color = mix(color, FOAM_COLOR, foam);

  // ---- Sun specular — very tight (real water is mirror-like) ----
  vec3 H = normalize(L + V);
  float spec  = pow(max(0.0, dot(N, H)), 480.0);
  float spec2 = pow(max(0.0, dot(N, H)), 48.0) * 0.03;  // soft glow halo
  color += SUN_COLOR * (spec * 1.6 + spec2);

  // ---- Subtle SSS at crest peaks ----
  float sss = smoothstep(0.15, 0.55, v_height) * max(0.0, dot(N, L));
  color += vec3(0.10, 0.35, 0.65) * sss * 0.15;

  // ---- Micro-ripple shimmer in reflection ----
  vec2 uv2 = v_uv * 20.0;
  float micro = sin(uv2.x * 2.1 + u_time * 0.8) * sin(uv2.y * 1.7 + u_time * 0.6);
  color += refl * micro * 0.018 * F;

  color = pow(clamp(color, 0.0, 1.0), vec3(0.90));

  // Manual exponential fog — matches scene.fog density
  const vec3 FOG_COLOR = vec3(0.024, 0.051, 0.102); // #060d1a — matches scene background
  float fogFactor = 1.0 - exp(-0.075 * v_depth);
  color = mix(color, FOG_COLOR, clamp(fogFactor, 0.0, 1.0));

  gl_FragColor = vec4(color, 1.0);
}
