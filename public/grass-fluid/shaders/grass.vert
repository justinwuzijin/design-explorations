// Per-vertex attributes (base blade geometry)
attribute float a_t;       // height ratio: 0.0 = root, 1.0 = tip

// Per-instance attributes
attribute vec2  a_offset;  // XZ position as UV [0,1] over the plane
attribute float a_hash;    // per-blade random seed [0,1]

uniform sampler2D u_velocityField;
uniform float u_windIntensity;
uniform float u_planeSize;
uniform float u_time;

varying float v_t;
varying vec3  v_worldNormal;

void main() {
  float bladeHeight = 0.055 + a_hash * 0.145;  // 5.5 – 20 cm
  float bladeWidth  = mix(0.018, 0.004, a_t);  // taper toward tip

  // Random lean in XZ so blades don't all stand vertical
  float leanAngle = (fract(a_hash * 7.391) - 0.5) * 0.45;
  float leanX = sin(leanAngle) * a_t * bladeHeight * 0.5;
  float leanZ = cos(leanAngle * 1.3) * a_t * bladeHeight * 0.25;

  // Sample 2D velocity field at this blade's ground UV
  vec2 vel = texture2D(u_velocityField, a_offset).xy;

  // Quadratic bend weight: zero at root, full at tip
  float bendW = a_t * a_t;

  // Lateral offset (position.x from base geometry, -0.5..0.5)
  float localX = position.x * bladeWidth;

  // World position
  float wx = (a_offset.x - 0.5) * u_planeSize + localX + leanX;
  float wy = a_t * bladeHeight;
  float wz = (a_offset.y - 0.5) * u_planeSize + leanZ;

  // Apply wind displacement — blades bend with velocity field
  float dispScale = bladeHeight * bendW * 0.9;
  wx += vel.x * dispScale;
  wz += vel.y * dispScale;

  // Micro-flutter: high-freq jitter at tips for realism
  float flutter = sin(u_time * 4.5 + a_hash * 6.2831 + a_t * 3.1) * 0.003 * a_t;
  wx += flutter;

  // Approximate face normal (for lighting in fragment shader)
  // Blade faces roughly toward camera; tilt normal by bend direction
  vec3 up     = vec3(0.0, 1.0, 0.0);
  vec3 bendDir = normalize(vec3(vel.x, 0.0, vel.y) + vec3(0.0, 1.0, 0.0));
  v_worldNormal = normalize(mix(up, bendDir, bendW * 0.6));

  v_t = a_t;

  gl_Position = projectionMatrix * modelViewMatrix * vec4(wx, wy, wz, 1.0);
}
