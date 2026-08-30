import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.165.0/build/three.module.js';

// Wet-on-wet watercolor sim, two fullscreen passes per frame:
//   1. sim pass   (ping-pong RGBA texture: RGB = pigment absorbance, A = water)
//   2. display pass (Beer–Lambert transmittance + edge rim + granulation)
// Strokes inject water + pigment along the pointer segment; pigment keeps
// diffusing while the paper is wet, then locks in place as it dries.
// Colours are stored as per-channel absorbance, so washes laid into each
// other mix subtractively like real watercolor (blue + yellow -> green).

const SIM_SCALE = 0.5; // sim runs at half canvas resolution

const params = {
  brushSize: 46,     // px
  pigment:   0.04,   // deposit per frame
  wetness:   0.16,   // water per frame
  edge:      6.0,    // rim darkening
};

const PALETTE = [
  { name: 'indigo',           hex: '#323a5a' },
  { name: 'ultramarine',      hex: '#2b56a8' },
  { name: 'cerulean',         hex: '#2e85bd' },
  { name: 'viridian',         hex: '#1e7a5a' },
  { name: 'sap green',        hex: '#5f8430' },
  { name: 'cadmium yellow',   hex: '#eec522' },
  { name: 'orange',           hex: '#e2801f' },
  { name: 'vermilion',        hex: '#cf3c22' },
  { name: 'alizarin crimson', hex: '#9c2440' },
  { name: 'violet',           hex: '#69398c' },
  { name: 'burnt sienna',     hex: '#8a5230' },
  { name: 'sepia',            hex: '#4c3a28' },
];

// A wash is a transparent filter: convert the swatch's sRGB reflectance to
// per-channel absorbance for the sim (display inverts with exp(-absorbance)).
function absorbance(hex) {
  const v = parseInt(hex.slice(1), 16);
  const ch = x => Math.min(3.4, -Math.log(Math.max(x / 255, 0.015)));
  return new THREE.Vector3(ch(v >> 16 & 255), ch(v >> 8 & 255), ch(v & 255));
}

// ---- Renderer ----
const canvas = document.getElementById('canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.autoClear = false;

const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const simScene = new THREE.Scene();
const viewScene = new THREE.Scene();

// ---- Shader loader ----
async function fetchShader(path) {
  const r = await fetch(path);
  if (!r.ok) throw new Error(`Failed to load shader: ${path}`);
  return r.text();
}

// ---- Sim buffers ----
let simW = 0, simH = 0;
let fboA = null, fboB = null;

function createFBO(w, h) {
  return new THREE.WebGLRenderTarget(w, h, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    format:    THREE.RGBAFormat,
    type:      THREE.HalfFloatType,
    wrapS:     THREE.ClampToEdgeWrapping,
    wrapT:     THREE.ClampToEdgeWrapping,
    depthBuffer: false,
    stencilBuffer: false,
  });
}

function allocateSim() {
  simW = Math.max(2, Math.round(window.innerWidth  * SIM_SCALE));
  simH = Math.max(2, Math.round(window.innerHeight * SIM_SCALE));
  if (fboA) fboA.dispose();
  if (fboB) fboB.dispose();
  fboA = createFBO(simW, simH);
  fboB = createFBO(simW, simH);
}

// ---- Pointer / stroke state ----
const stroke = {
  drawing: false,
  from: new THREE.Vector2(0.5, 0.5),
  to:   new THREE.Vector2(0.5, 0.5),
  charge: 0, // water held by the brush; refilled on every touch
};

function eventUV(e) {
  return new THREE.Vector2(
    e.clientX / window.innerWidth,
    1.0 - e.clientY / window.innerHeight
  );
}

canvas.addEventListener('pointerdown', e => {
  stroke.drawing = true;
  stroke.charge = 1; // freshly dipped
  stroke.from.copy(eventUV(e));
  stroke.to.copy(stroke.from);
  canvas.setPointerCapture?.(e.pointerId);
});

window.addEventListener('pointermove', e => {
  if (!stroke.drawing) return;
  stroke.to.copy(eventUV(e));
});

window.addEventListener('pointerup', e => {
  stroke.drawing = false;
  canvas.releasePointerCapture?.(e.pointerId);
});

// ---- Brush cursor ring ----
const ring = document.getElementById('brush-ring');
window.addEventListener('pointermove', e => {
  if (!ring) return;
  ring.style.left = e.clientX + 'px';
  ring.style.top  = e.clientY + 'px';
});

function updateRingSize() {
  if (!ring) return;
  const d = params.brushSize * 2;
  ring.style.width  = d + 'px';
  ring.style.height = d + 'px';
}

// ---- Init ----
let simMat = null, viewMat = null;

async function init() {
  const [quadVert, simFrag, displayFrag] = await Promise.all([
    fetchShader('shaders/quad.vert'),
    fetchShader('shaders/sim.frag'),
    fetchShader('shaders/display.frag'),
  ]);

  allocateSim();

  simMat = new THREE.ShaderMaterial({
    vertexShader:   quadVert,
    fragmentShader: simFrag,
    uniforms: {
      u_prev:        { value: fboA.texture },
      u_texel:       { value: new THREE.Vector2(1 / simW, 1 / simH) },
      u_dt:          { value: 0.016 },
      u_drawing:     { value: 0 },
      u_from:        { value: new THREE.Vector2(0.5, 0.5) },
      u_to:          { value: new THREE.Vector2(0.5, 0.5) },
      u_radius:      { value: 0.05 },
      u_aspect:      { value: window.innerWidth / window.innerHeight },
      u_pigment:     { value: params.pigment },
      u_water:       { value: params.wetness },
      u_absorb:      { value: absorbance(PALETTE[0].hex) },
      u_charge:      { value: 0 },
      u_evaporation: { value: 0.55 },
      u_diffusion:   { value: 0.32 },
      u_edgeFlow:    { value: 0.13 },
    },
    depthTest: false,
    depthWrite: false,
  });

  viewMat = new THREE.ShaderMaterial({
    vertexShader:   quadVert,
    fragmentShader: displayFrag,
    uniforms: {
      u_state:  { value: fboA.texture },
      u_texel:  { value: new THREE.Vector2(1 / simW, 1 / simH) },
      u_edge:   { value: params.edge },
      u_granul: { value: 0.16 },
    },
    depthTest: false,
    depthWrite: false,
  });

  const quadGeo = new THREE.PlaneGeometry(2, 2);
  simScene.add(new THREE.Mesh(quadGeo, simMat));
  viewScene.add(new THREE.Mesh(quadGeo, viewMat));

  setupControls();
  setupPalette();
  updateRingSize();
  animate();
}

// ---- Palette ----
function setupPalette() {
  const holder = document.getElementById('swatches');
  if (!holder) return;
  PALETTE.forEach((c, i) => {
    const b = document.createElement('button');
    b.className = 'swatch' + (i === 0 ? ' active' : '');
    b.style.background = c.hex;
    b.title = c.name;
    b.addEventListener('click', () => {
      simMat.uniforms.u_absorb.value.copy(absorbance(c.hex));
      holder.querySelectorAll('.swatch').forEach(s => s.classList.remove('active'));
      b.classList.add('active');
    });
    holder.appendChild(b);
  });
}

// ---- Controls ----
function setupControls() {
  const bind = (id, fn, fmt = v => v) => {
    const slider = document.getElementById(id);
    const valEl  = document.getElementById(id + '-val');
    if (!slider) return;
    slider.addEventListener('input', () => {
      const v = parseFloat(slider.value);
      fn(v);
      if (valEl) valEl.textContent = fmt(v);
    });
  };

  bind('brushSize', v => { params.brushSize = v; updateRingSize(); }, v => v + 'px');
  bind('pigment',   v => { params.pigment = v; });
  bind('wetness',   v => { params.wetness = v; });
  bind('edge',      v => { params.edge = v; });

  document.getElementById('clear')?.addEventListener('click', clearPaper);
}

function clearPaper() {
  renderer.setClearColor(0x000000, 0); // alpha is water now — clear to dry
  for (const fbo of [fboA, fboB]) {
    renderer.setRenderTarget(fbo);
    renderer.clear(true, false, false);
  }
  renderer.setRenderTarget(null);
}

// ---- Animation loop ----
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);

  simMat.uniforms.u_dt.value      = dt;
  simMat.uniforms.u_drawing.value = stroke.drawing ? 1 : 0;
  simMat.uniforms.u_from.value.copy(stroke.from);
  simMat.uniforms.u_to.value.copy(stroke.to);
  simMat.uniforms.u_radius.value  = params.brushSize / window.innerHeight;
  simMat.uniforms.u_pigment.value = params.pigment;
  simMat.uniforms.u_water.value   = params.wetness;
  viewMat.uniforms.u_edge.value   = params.edge;

  // the brush empties as it travels (and slowly while held down),
  // so the first touch floods and the tail of the stroke runs dry
  if (stroke.drawing) {
    const moved = stroke.to.distanceTo(stroke.from);
    stroke.charge = Math.max(0.12, stroke.charge - moved * 1.6 - dt * 0.22);
  }
  simMat.uniforms.u_charge.value = stroke.drawing ? stroke.charge : 0;

  // sim step: A -> B
  simMat.uniforms.u_prev.value = fboA.texture;
  renderer.setRenderTarget(fboB);
  renderer.render(simScene, camera);
  renderer.setRenderTarget(null);

  // swap
  const tmp = fboA; fboA = fboB; fboB = tmp;

  // the just-drawn segment becomes the start of the next one
  stroke.from.copy(stroke.to);

  // display
  viewMat.uniforms.u_state.value = fboA.texture;
  renderer.render(viewScene, camera);
}

// ---- Resize (reallocates sim; drawing is cleared) ----
window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  allocateSim();
  const texel = new THREE.Vector2(1 / simW, 1 / simH);
  simMat.uniforms.u_texel.value.copy(texel);
  simMat.uniforms.u_aspect.value = window.innerWidth / window.innerHeight;
  viewMat.uniforms.u_texel.value.copy(texel);
});

init().catch(console.error);
