varying vec2 v_texCoord;

void main() {
  v_texCoord = uv;
  gl_Position = vec4(position, 1.0);
}
