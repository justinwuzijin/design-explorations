precision highp float;

uniform sampler2D u_image;
uniform vec2 u_resolution;
uniform float u_radius;
uniform float u_bloomThreshold;
uniform float u_bloomStrength;
uniform float u_vignette;
uniform int u_samples;

varying vec2 v_texCoord;

// Pseudo-random for jittered sampling
float rand(vec2 co) {
  return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
}

// Circular bokeh blur — samples in a disc pattern
vec4 bokehBlur(sampler2D tex, vec2 uv, vec2 texelSize, float radius, int samples) {
  vec4 color = vec4(0.0);
  float total = 0.0;

  float goldenAngle = 2.399963;

  for (int i = 0; i < 128; i++) {
    if (i >= samples) break;

    float fi = float(i);
    float r = sqrt(fi / float(samples)) * radius;
    float theta = fi * goldenAngle;

    vec2 offset = vec2(cos(theta), sin(theta)) * r * texelSize;
    vec4 sample = texture2D(tex, uv + offset);

    // Weight bright samples more heavily for bokeh bloom
    float luma = dot(sample.rgb, vec3(0.2126, 0.7152, 0.0722));
    float weight = 1.0 + max(0.0, luma - u_bloomThreshold) * u_bloomStrength;

    color += sample * weight;
    total += weight;
  }

  return color / total;
}

void main() {
  vec2 texelSize = 1.0 / u_resolution;

  vec4 color = bokehBlur(u_image, v_texCoord, texelSize, u_radius, u_samples);

  // Vignette
  vec2 uv = v_texCoord;
  float dist = length(uv - 0.5) * 2.0;
  float vignette = 1.0 - smoothstep(0.5, 1.4, dist * u_vignette);
  color.rgb *= vignette;

  gl_FragColor = color;
}
