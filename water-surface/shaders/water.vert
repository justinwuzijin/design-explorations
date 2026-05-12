uniform sampler2D u_heightMap;
uniform float     u_heightScale;
uniform float     u_simSize;    // world-space size of the simulation zone

varying vec2  v_uv;
varying float v_height;
varying vec3  v_viewDir;
varying float v_depth;   // positive view-space depth for fog

void main() {
  // Map world-space XZ to simulation UV — works regardless of total mesh size.
  // position.xz is in local space (plane centred at origin, rotated flat).
  vec2 simUV = (position.xz / u_simSize) + 0.5;
  v_uv = clamp(simUV, 0.0, 1.0);

  // Fade displacement to zero outside the sim zone
  float bx = smoothstep(0.0, 0.04, simUV.x) * (1.0 - smoothstep(0.96, 1.0, simUV.x));
  float by = smoothstep(0.0, 0.04, simUV.y) * (1.0 - smoothstep(0.96, 1.0, simUV.y));
  float inSim = bx * by;

  float h = texture2D(u_heightMap, v_uv).r * inSim;
  v_height = h;

  vec3 displaced = position;
  displaced.y += h * u_heightScale;

  vec4 mvPos = modelViewMatrix * vec4(displaced, 1.0);
  v_viewDir = normalize(-mvPos.xyz);
  v_depth = -mvPos.z;

  gl_Position = projectionMatrix * mvPos;
}
