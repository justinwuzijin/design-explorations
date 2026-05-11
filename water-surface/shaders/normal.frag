precision highp float;

varying vec2 v_uv;

uniform sampler2D u_height;
uniform vec2      u_texelSize;
uniform float     u_normalStrength;  // world-space normal amplification

void main() {
  vec2 ts = u_texelSize;

  float hL = texture2D(u_height, v_uv + vec2(-ts.x, 0.0)).r;
  float hR = texture2D(u_height, v_uv + vec2( ts.x, 0.0)).r;
  float hD = texture2D(u_height, v_uv + vec2(0.0, -ts.y)).r;
  float hU = texture2D(u_height, v_uv + vec2(0.0,  ts.y)).r;

  // Central-difference gradient, amplified for visible reflection distortion
  vec3 tx = normalize(vec3(2.0 * ts.x, (hR - hL) * u_normalStrength, 0.0));
  vec3 tz = normalize(vec3(0.0, (hU - hD) * u_normalStrength, 2.0 * ts.y));

  vec3 n = normalize(cross(tz, tx));
  gl_FragColor = vec4(n * 0.5 + 0.5, 1.0);
}
