import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.165.0/build/three.module.js';

const SIM_RES    = 512;
const SIM_SIZE   = 14.0;   // world-units covered by the wave simulation
const MESH_SIZE  = 60.0;   // large enough that fog hides all edges
const MESH_SEGS  = 200;    // dense enough for displacement in sim zone

// Defaults tuned for still water realism
const params = {
  waveSpeed:      0.18,   // slow propagation — real water isn't springy
  damping:        0.9975, // high retention — ripples linger naturally
  gravity:        0.005,  // gentle restoring force
  simDt:          1.0,
  impactStrength: 0.45,
  impactRadius:   0.028,
  heightScale:    0.07,   // very subtle displacement — water is nearly flat
};

// ---- Renderer ----
const canvas = document.getElementById('canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

// ---- Cameras ----
// Moderate angle — shows surface reflections well without extreme foreshortening
const perspCamera = new THREE.PerspectiveCamera(
  52, window.innerWidth / window.innerHeight, 0.01, 200
);
perspCamera.position.set(0, 7, 11);
perspCamera.lookAt(0, 0, 0);

const orthoCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

// ---- Scenes ----
const HORIZON_COLOR = new THREE.Color(0x060d1a);

const mainScene   = new THREE.Scene();
mainScene.background = HORIZON_COLOR;
mainScene.fog = new THREE.FogExp2(HORIZON_COLOR, 0.075); // dense enough to hide mesh edges

const waveScene   = new THREE.Scene();
const normalScene = new THREE.Scene();

// ---- Mouse — raycast screen → world → simulation UV ----
const mouse = {
  uv:     new THREE.Vector2(0.5, 0.5),
  active: 0,
};

const _raycaster  = new THREE.Raycaster();
const _waterPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0); // y = 0
const _hit        = new THREE.Vector3();
const _ndc        = new THREE.Vector2();

function updateMouseUV(clientX, clientY) {
  _ndc.set(
    (clientX / window.innerWidth)  *  2 - 1,
   -(clientY / window.innerHeight) *  2 + 1
  );
  _raycaster.setFromCamera(_ndc, perspCamera);
  if (_raycaster.ray.intersectPlane(_waterPlane, _hit)) {
    // Convert world XZ hit to simulation UV (SIM_SIZE centred at origin)
    mouse.uv.set(
      _hit.x / SIM_SIZE + 0.5,
      _hit.z / SIM_SIZE + 0.5
    );
  }
}

window.addEventListener('mousemove', e => updateMouseUV(e.clientX, e.clientY));
window.addEventListener('mousedown', e => { updateMouseUV(e.clientX, e.clientY); mouse.active = 1; });
window.addEventListener('mouseup',   () => { mouse.active = 0; });
window.addEventListener('touchstart', e => {
  updateMouseUV(e.touches[0].clientX, e.touches[0].clientY);
  mouse.active = 1;
}, { passive: true });
window.addEventListener('touchmove', e => {
  updateMouseUV(e.touches[0].clientX, e.touches[0].clientY);
}, { passive: true });
window.addEventListener('touchend', () => { mouse.active = 0; });

// ---- Shader loader ----
async function fetchShader(path) {
  const r = await fetch(path);
  if (!r.ok) throw new Error(`Shader load failed: ${path}`);
  return r.text();
}

// ---- FBO factory ----
function createFBO() {
  return new THREE.WebGLRenderTarget(SIM_RES, SIM_RES, {
    minFilter:     THREE.LinearFilter,
    magFilter:     THREE.LinearFilter,
    format:        THREE.RGBAFormat,
    type:          THREE.HalfFloatType,
    wrapS:         THREE.ClampToEdgeWrapping,
    wrapT:         THREE.ClampToEdgeWrapping,
    depthBuffer:   false,
    stencilBuffer: false,
  });
}

let fboPrev, fboCurr, fboNext, fboNormal;
let waveMat, normalMat, waterMat;

// ---- Init ----
async function init() {
  const [quadVert, waveFrag, normalFrag, waterVert, waterFrag] = await Promise.all([
    fetchShader('shaders/quad.vert'),
    fetchShader('shaders/wave.frag'),
    fetchShader('shaders/normal.frag'),
    fetchShader('shaders/water.vert'),
    fetchShader('shaders/water.frag'),
  ]);

  fboPrev   = createFBO();
  fboCurr   = createFBO();
  fboNext   = createFBO();
  fboNormal = createFBO();

  const texelSize = new THREE.Vector2(1 / SIM_RES, 1 / SIM_RES);

  // Normal strength: controls how much the height gradient tilts the normal.
  // Higher = ripples show more distortion in reflections despite tiny displacement.
  const NORMAL_STRENGTH = 22.0;

  // ---- Wave propagation pass ----
  waveMat = new THREE.ShaderMaterial({
    vertexShader:   quadVert,
    fragmentShader: waveFrag,
    uniforms: {
      u_prev:           { value: fboPrev.texture },
      u_curr:           { value: fboCurr.texture },
      u_texelSize:      { value: texelSize },
      u_waveSpeed:      { value: params.waveSpeed },
      u_damping:        { value: params.damping },
      u_gravity:        { value: params.gravity },
      u_simDt:          { value: params.simDt },
      u_time:           { value: 0.0 },
      u_mousePos:       { value: mouse.uv.clone() },
      u_mouseActive:    { value: 0.0 },
      u_impactStrength: { value: params.impactStrength },
      u_impactRadius:   { value: params.impactRadius },
    },
    depthTest:  false,
    depthWrite: false,
  });

  waveScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), waveMat));

  // ---- Normal computation pass ----
  normalMat = new THREE.ShaderMaterial({
    vertexShader:   quadVert,
    fragmentShader: normalFrag,
    uniforms: {
      u_height:        { value: fboCurr.texture },
      u_texelSize:     { value: texelSize },
      u_normalStrength:{ value: NORMAL_STRENGTH },
    },
    depthTest:  false,
    depthWrite: false,
  });

  normalScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), normalMat));

  // ---- Water mesh — large enough that fog hides the boundary ----
  const waterGeo = new THREE.PlaneGeometry(MESH_SIZE, MESH_SIZE, MESH_SEGS, MESH_SEGS);
  waterGeo.rotateX(-Math.PI / 2);

  waterMat = new THREE.ShaderMaterial({
    vertexShader:   waterVert,
    fragmentShader: waterFrag,
    uniforms: {
      u_heightMap:   { value: fboCurr.texture },
      u_normalMap:   { value: fboNormal.texture },
      u_heightScale: { value: params.heightScale },
      u_simSize:     { value: SIM_SIZE },
      u_time:        { value: 0.0 },
    },
    side: THREE.DoubleSide,
  });

  mainScene.add(new THREE.Mesh(waterGeo, waterMat));

  // Floor plane matching grass world — extends beyond water so no hard edge
  const floorGeo = new THREE.PlaneGeometry(MESH_SIZE * 1.5, MESH_SIZE * 1.5, 1, 1);
  floorGeo.rotateX(-Math.PI / 2);
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x060d1a, roughness: 1.0, metalness: 0.0 });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.position.y = -0.001;
  mainScene.add(floor);

  mainScene.add(new THREE.AmbientLight(0x2a3850, 0.5));
  const sun = new THREE.DirectionalLight(0xfff5e8, 0.8);
  sun.position.set(4, 10, 3);
  mainScene.add(sun);

  setupControls();
  animate();
}

// ---- Controls ----
function setupControls() {
  const bindings = [
    { id: 'waveSpeed',      key: 'waveSpeed',      mat: waveMat,  u: 'u_waveSpeed' },
    { id: 'damping',        key: 'damping',         mat: waveMat,  u: 'u_damping' },
    { id: 'gravity',        key: 'gravity',         mat: waveMat,  u: 'u_gravity' },
    { id: 'simDt',          key: 'simDt',           mat: waveMat,  u: 'u_simDt' },
    { id: 'impactStrength', key: 'impactStrength',  mat: waveMat,  u: 'u_impactStrength' },
    { id: 'impactRadius',   key: 'impactRadius',    mat: waveMat,  u: 'u_impactRadius' },
    { id: 'heightScale',    key: 'heightScale',     mat: null,     u: null },
  ];

  bindings.forEach(({ id, key, mat, u }) => {
    const slider = document.getElementById(id);
    const valEl  = document.getElementById(id + '-val');
    if (!slider) return;
    slider.addEventListener('input', () => {
      const v = parseFloat(slider.value);
      params[key] = v;
      valEl.textContent = v;
      if (mat && u) mat.uniforms[u].value = v;
      if (key === 'heightScale') waterMat.uniforms.u_heightScale.value = v;
    });
  });
}

// ---- Animation ----
const clock = new THREE.Clock();
let elapsed = 0;

function animate() {
  requestAnimationFrame(animate);

  const dt = Math.min(clock.getDelta(), 0.05);
  elapsed += dt;

  waveMat.uniforms.u_time.value        = elapsed;
  waveMat.uniforms.u_mousePos.value.copy(mouse.uv);
  waveMat.uniforms.u_mouseActive.value  = mouse.active;

  // Wave step
  waveMat.uniforms.u_prev.value = fboPrev.texture;
  waveMat.uniforms.u_curr.value = fboCurr.texture;
  renderer.setRenderTarget(fboNext);
  renderer.render(waveScene, orthoCamera);

  // Rotate history
  const tmp = fboPrev; fboPrev = fboCurr; fboCurr = fboNext; fboNext = tmp;

  // Normal step
  normalMat.uniforms.u_height.value = fboCurr.texture;
  renderer.setRenderTarget(fboNormal);
  renderer.render(normalScene, orthoCamera);
  renderer.setRenderTarget(null);

  waterMat.uniforms.u_heightMap.value = fboCurr.texture;
  waterMat.uniforms.u_normalMap.value = fboNormal.texture;
  waterMat.uniforms.u_time.value      = elapsed;

  renderer.render(mainScene, perspCamera);
}

// ---- Resize ----
window.addEventListener('resize', () => {
  perspCamera.aspect = window.innerWidth / window.innerHeight;
  perspCamera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

init().catch(console.error);
