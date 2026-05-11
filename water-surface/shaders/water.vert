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
  v_uv = simUV;

  // ClampToEdgeWrapping gives ~0 height outside the sim zone (sponge boundary).
  float h = texture2D(u_heightMap, simUV).r;
  v_height = h;

  vec3 displaced = position;
  displaced.y += h * u_heightScale;

  vec4 mvPos = modelViewMatrix * vec4(displaced, 1.0);
  v_viewDir = normalize(-mvPos.xyz);
  v_depth = -mvPos.z;

  gl_Position = projectionMatrix * mvPos;
}
