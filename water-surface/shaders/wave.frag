precision highp float;

varying vec2 v_uv;

uniform sampler2D u_prev;
uniform sampler2D u_curr;
uniform vec2      u_texelSize;
uniform float     u_waveSpeed;
uniform float     u_damping;
uniform float     u_gravity;
uniform float     u_simDt;
uniform float     u_time;

uniform vec2  u_mousePos;
uniform float u_mouseActive;
uniform float u_impactStrength;
uniform float u_impactRadius;

void main() {
  vec2 uv = v_uv;
  vec2 ts = u_texelSize;
  float dt = u_simDt;

  float hC = texture2D(u_curr, uv).r;
  float hL = texture2D(u_curr, uv + vec2(-ts.x, 0.0)).r;
  float hR = texture2D(u_curr, uv + vec2( ts.x, 0.0)).r;
  float hD = texture2D(u_curr, uv + vec2(0.0, -ts.y)).r;
  float hU = texture2D(u_curr, uv + vec2(0.0,  ts.y)).r;
  float hP = texture2D(u_prev, uv).r;

  // Discrete Laplacian
  float lap = hL + hR + hD + hU - 4.0 * hC;

  // Wave speed: clamp for numerical stability (c²dt² < 0.5)
  float c  = clamp(u_waveSpeed, 0.02, 0.70);
  float c2 = min(c * c * dt * dt, 0.48);

  // Wave equation with surface tension restoring force
  float hNew = (2.0 * hC - hP + c2 * lap) * u_damping
               - u_gravity * hC * dt * dt * 0.5;

  // ---- Absorbing sponge boundary (prevents edge reflections / standing waves) ----
  // Ramp from 0 at the edge to 1 at 12% inward
  float SPONGE = 0.12;
  float sx = smoothstep(0.0, SPONGE, uv.x) * (1.0 - smoothstep(1.0 - SPONGE, 1.0, uv.x));
  float sy = smoothstep(0.0, SPONGE, uv.y) * (1.0 - smoothstep(1.0 - SPONGE, 1.0, uv.y));
  float sponge = sx * sy;
  // At the boundary: pull strongly toward zero; interior: standard damping
  hNew = mix(hNew * 0.70, hNew, sponge);

  // ---- Cursor impulse ----
  if (u_mouseActive > 0.5) {
    float d = length(uv - u_mousePos);
    float r = max(u_impactRadius, 0.005);
    float impulse = exp(-d * d / (2.0 * r * r));
    hNew += impulse * u_impactStrength * 0.08 * dt;
  }

  hNew = clamp(hNew, -1.0, 1.0);
  gl_FragColor = vec4(hNew, hNew, hNew, 1.0);
}
