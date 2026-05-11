precision highp float;

varying float v_t;
varying vec3  v_worldNormal;

uniform float u_time;

void main() {
  // Root → mid → tip colour gradient (realistic grass tones)
  vec3 rootColor = vec3(0.055, 0.130, 0.025);   // dark earthy green
  vec3 midColor  = vec3(0.150, 0.340, 0.070);   // medium grass green
  vec3 tipColor  = vec3(0.400, 0.580, 0.150);   // bright yellow-green

  vec3 color = v_t < 0.5
    ? mix(rootColor, midColor,  v_t * 2.0)
    : mix(midColor,  tipColor, (v_t - 0.5) * 2.0);

  // Ambient occlusion proxy: darken near ground
  color *= 0.35 + 0.65 * v_t;

  // Directional sun light (warm, upper right)
  vec3 sunDir   = normalize(vec3(0.55, 1.0, 0.35));
  float ndotl   = max(0.0, dot(v_worldNormal, sunDir));
  color *= 0.45 + 0.55 * ndotl;

  // Subtle subsurface scattering at tips: warm back-lit glow
  vec3 sssColor  = vec3(0.60, 0.80, 0.20);
  float sss      = pow(v_t, 3.0) * 0.18;
  color = mix(color, sssColor, sss);

  // Slow golden-hour colour shift
  float dusk = sin(u_time * 0.08) * 0.5 + 0.5;
  color = mix(color, color * vec3(1.08, 1.04, 0.82), dusk * 0.15);

  gl_FragColor = vec4(color, 1.0);
}
