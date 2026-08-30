import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.165.0/build/three.module.js';

// Dry oil-pastel sim, two fullscreen passes per frame (same ping-pong
// architecture as the watercolor piece):
//   1. sim pass   (ping-pong RGBA texture: RGB = colour * thickness, A = thickness)
//   2. display pass (tooth break-up + waxy relief lighting over the canvas)
// Unlike watercolor nothing diffuses — pigment only sheds where the stick
// touches, catching on the raised tooth of the paper. Pressure reaches deeper
// into the valleys, and dragging through existing pastel smears/blends it.

const SIM_SCALE = 1.0; // full res — the broken grain is the whole point

const params = {
  brushSize: 34,    // px
  pressure:  0.55,  // 0..1
  flow:      0.5,   // pigment shed per frame
  smear:     0.6,   // drag/blend of the layer underneath
  grain:     0.55,  // display-level tooth break-up
};

const PALETTE = [
  { name: 'cadmium red', hex: '#d2281e' },
  { name: 'vermilion',   hex: '#ee5a1f' },
  { name: 'orange',      hex: '#f78f1e' },
  { name: 'cadmium yellow', hex: '#f7c61b' },
  { name: 'lemon',       hex: '#f2e34f' },
  { name: 'white',       hex: '#f6f2e9' },
  { name: 'cobalt',      hex: '#2a4f9e' },
  { name: 'sap green',   hex: '#4e7d34' },
];

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
};

function eventUV(e) {
  return new THREE.Vector2(
    e.clientX / window.innerWidth,
    1.0 - e.clientY / window.innerHeight
  );
}

canvas.addEventListener('pointerdown', e => {
  stroke.drawing = true;
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

const PAPER_TEX_SIZE = 626; // px per paper-space unit (procedural tooth scale)

function paperScale() {
  return new THREE.Vector2(
    window.innerWidth  / PAPER_TEX_SIZE,
    window.innerHeight / PAPER_TEX_SIZE
  );
}

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
      u_prev:       { value: fboA.texture },
      u_paperScale: { value: paperScale() },
      u_texel:      { value: new THREE.Vector2(1 / simW, 1 / simH) },
      u_drawing:    { value: 0 },
      u_from:       { value: new THREE.Vector2(0.5, 0.5) },
      u_to:         { value: new THREE.Vector2(0.5, 0.5) },
      u_radius:     { value: 0.04 },
      u_aspect:     { value: window.innerWidth / window.innerHeight },
      u_color:      { value: new THREE.Color(PALETTE[2].hex) },
      u_pressure:   { value: params.pressure },
      u_flow:       { value: params.flow },
      u_smear:      { value: params.smear },
    },
    depthTest: false,
    depthWrite: false,
  });

  viewMat = new THREE.ShaderMaterial({
    vertexShader:   quadVert,
    fragmentShader: displayFrag,
    uniforms: {
      u_state:      { value: fboA.texture },
      u_paperScale: { value: paperScale() },
      u_texel:      { value: new THREE.Vector2(1 / simW, 1 / simH) },
      u_grain:      { value: params.grain },
      u_relief:     { value: 1.0 },
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
  bind('pressure',  v => { params.pressure = v; });
  bind('flow',      v => { params.flow = v; });
  bind('smear',     v => { params.smear = v; });
  bind('grain',     v => { params.grain = v; });

  document.getElementById('clear')?.addEventListener('click', clearPaper);
}

function setupPalette() {
  const holder = document.getElementById('swatches');
  if (!holder) return;
  PALETTE.forEach((c, i) => {
    const b = document.createElement('button');
    b.className = 'swatch' + (i === 2 ? ' active' : '');
    b.style.background = c.hex;
    b.title = c.name;
    b.addEventListener('click', () => {
      simMat.uniforms.u_color.value.set(c.hex);
      holder.querySelectorAll('.swatch').forEach(s => s.classList.remove('active'));
      b.classList.add('active');
    });
    holder.appendChild(b);
  });
}

function clearPaper() {
  renderer.setClearColor(0x000000, 0);
  for (const fbo of [fboA, fboB]) {
    renderer.setRenderTarget(fbo);
    renderer.clear(true, false, false);
  }
  renderer.setRenderTarget(null);
}

// ---- Animation loop ----
function animate() {
  requestAnimationFrame(animate);

  simMat.uniforms.u_drawing.value  = stroke.drawing ? 1 : 0;
  simMat.uniforms.u_from.value.copy(stroke.from);
  simMat.uniforms.u_to.value.copy(stroke.to);
  simMat.uniforms.u_radius.value   = params.brushSize / window.innerHeight;
  simMat.uniforms.u_pressure.value = params.pressure;
  simMat.uniforms.u_flow.value     = params.flow;
  simMat.uniforms.u_smear.value    = params.smear;
  viewMat.uniforms.u_grain.value   = params.grain;

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
  const ps = paperScale();
  simMat.uniforms.u_texel.value.copy(texel);
  simMat.uniforms.u_aspect.value = window.innerWidth / window.innerHeight;
  simMat.uniforms.u_paperScale.value.copy(ps);
  viewMat.uniforms.u_texel.value.copy(texel);
  viewMat.uniforms.u_paperScale.value.copy(ps);
});

init().catch(console.error);
