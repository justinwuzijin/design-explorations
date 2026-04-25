const canvas = document.getElementById('canvas');
const gl = canvas.getContext('webgl');

if (!gl) {
  alert('WebGL not supported');
  throw new Error('WebGL not supported');
}

// Load shader source from <script> tags
function getShaderSource(id) {
  return document.getElementById(id).textContent;
}

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error('Shader compile error:', gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function createProgram(gl, vertSrc, fragSrc) {
  const vert = compileShader(gl, gl.VERTEX_SHADER, vertSrc);
  const frag = compileShader(gl, gl.FRAGMENT_SHADER, fragSrc);
  const program = gl.createProgram();
  gl.attachShader(program, vert);
  gl.attachShader(program, frag);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error('Program link error:', gl.getProgramInfoLog(program));
    return null;
  }
  return program;
}

// Fullscreen quad
const positions = new Float32Array([
  -1, -1,  0, 1,
   1, -1,  1, 1,
  -1,  1,  0, 0,
   1,  1,  1, 0,
]);

const buffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

let program, uniforms, texture;

async function init() {
  // Fetch shaders
  const [vertSrc, fragSrc] = await Promise.all([
    fetch('shader.vert').then(r => r.text()),
    fetch('shader.frag').then(r => r.text()),
  ]);

  program = createProgram(gl, vertSrc, fragSrc);
  gl.useProgram(program);

  // Attributes
  const posLoc = gl.getAttribLocation(program, 'a_position');
  const texLoc = gl.getAttribLocation(program, 'a_texCoord');
  gl.enableVertexAttribArray(posLoc);
  gl.enableVertexAttribArray(texLoc);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 16, 0);
  gl.vertexAttribPointer(texLoc, 2, gl.FLOAT, false, 16, 8);

  // Uniforms
  uniforms = {
    image:          gl.getUniformLocation(program, 'u_image'),
    resolution:     gl.getUniformLocation(program, 'u_resolution'),
    radius:         gl.getUniformLocation(program, 'u_radius'),
    bloomThreshold: gl.getUniformLocation(program, 'u_bloomThreshold'),
    bloomStrength:  gl.getUniformLocation(program, 'u_bloomStrength'),
    vignette:       gl.getUniformLocation(program, 'u_vignette'),
    samples:        gl.getUniformLocation(program, 'u_samples'),
  };

  // Load image texture
  texture = gl.createTexture();
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    render();
  };
  img.src = '../assets/photo.jpg';

  setupControls();
  updateTime();
  setInterval(updateTime, 1000);
}

// Shader params — tweak these
const params = {
  radius: 18,
  bloomThreshold: 0.6,
  bloomStrength: 8.0,
  vignette: 1.0,
  samples: 64,
};

function render() {
  canvas.width  = canvas.clientWidth  * devicePixelRatio;
  canvas.height = canvas.clientHeight * devicePixelRatio;
  gl.viewport(0, 0, canvas.width, canvas.height);

  gl.useProgram(program);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.uniform1i(uniforms.image, 0);
  gl.uniform2f(uniforms.resolution, canvas.width, canvas.height);
  gl.uniform1f(uniforms.radius, params.radius);
  gl.uniform1f(uniforms.bloomThreshold, params.bloomThreshold);
  gl.uniform1f(uniforms.bloomStrength, params.bloomStrength);
  gl.uniform1f(uniforms.vignette, params.vignette);
  gl.uniform1i(uniforms.samples, params.samples);

  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

function setupControls() {
  const controls = [
    { id: 'radius',         key: 'radius',         label: 'Blur Radius' },
    { id: 'bloomThreshold', key: 'bloomThreshold',  label: 'Bloom Threshold' },
    { id: 'bloomStrength',  key: 'bloomStrength',   label: 'Bloom Strength' },
    { id: 'vignette',       key: 'vignette',        label: 'Vignette' },
    { id: 'samples',        key: 'samples',         label: 'Samples' },
  ];

  controls.forEach(({ id, key }) => {
    const slider = document.getElementById(id);
    const valueEl = document.getElementById(id + '-value');
    if (!slider) return;
    slider.value = params[key];
    valueEl.textContent = params[key];
    slider.addEventListener('input', () => {
      params[key] = parseFloat(slider.value);
      valueEl.textContent = slider.value;
      render();
    });
  });
}

function updateTime() {
  const el = document.getElementById('time');
  if (!el) return;
  const now = new Date().toLocaleString('en-US', {
    timeZone: 'America/Los_Angeles',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  el.textContent = `It is ${now} in San Francisco.`;
}

window.addEventListener('resize', render);
init();
