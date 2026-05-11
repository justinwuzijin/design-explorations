import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.165.0/build/three.module.js';

const BLADE_COUNT = 65000;
const PLANE_SIZE  = 12.0;
const VEL_RES     = 256;

// ---- Tunable parameters (synced with slider UI) ----
const params = {
  windIntensity:    0.7,
  windAngle:        45,
  cursorSensitivity: 0.5,
  influenceRadius:  0.18,
};

// ---- Renderer ----
const canvas = document.getElementById('canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;

// ---- Cameras ----
const perspCamera = new THREE.PerspectiveCamera(
  50,
  window.innerWidth / window.innerHeight,
  0.01, 200
);
perspCamera.position.set(0, 7, 11);
perspCamera.lookAt(0, 0, 0);

const orthoCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

// ---- Scenes ----
const mainScene   = new THREE.Scene();
mainScene.background = new THREE.Color(0x0e1a08);
mainScene.fog = new THREE.FogExp2(0x0e1a08, 0.042);

const advectScene = new THREE.Scene();

// ---- Mouse tracking ----
const mouse = {
  uv:    new THREE.Vector2(0.5, 0.5),
  delta: new THREE.Vector2(0, 0),
  prev:  new THREE.Vector2(0.5, 0.5),
};

window.addEventListener('mousemove', e => {
  const x =        e.clientX / window.innerWidth;
  const y = 1.0 - (e.clientY / window.innerHeight);
  mouse.delta.set(x - mouse.prev.x, y - mouse.prev.y);
  mouse.prev.set(x, y);
  mouse.uv.set(x, y);
});

// ---- Shader loader ----
async function fetchShader(path) {
  const r = await fetch(path);
  if (!r.ok) throw new Error(`Failed to load shader: ${path}`);
  return r.text();
}

// ---- Ping-pong FBO factory ----
function createFBO() {
  return new THREE.WebGLRenderTarget(VEL_RES, VEL_RES, {
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

let fboA, fboB;

// ---- Init ----
async function init() {
  const [quadVert, advectFrag, grassVert, grassFrag] = await Promise.all([
    fetchShader('shaders/quad.vert'),
    fetchShader('shaders/advect.frag'),
    fetchShader('shaders/grass.vert'),
    fetchShader('shaders/grass.frag'),
  ]);

  fboA = createFBO();
  fboB = createFBO();

  // ---- Advect (velocity field update) pass ----
  const advectMat = new THREE.ShaderMaterial({
    vertexShader:   quadVert,
    fragmentShader: advectFrag,
    uniforms: {
      u_velocity:        { value: fboA.texture },
      u_texelSize:       { value: new THREE.Vector2(1 / VEL_RES, 1 / VEL_RES) },
      u_time:            { value: 0.0 },
      u_dt:              { value: 0.016 },
      u_windIntensity:   { value: params.windIntensity },
      u_windAngle:       { value: params.windAngle },
      u_mousePos:        { value: new THREE.Vector2(0.5, 0.5) },
      u_mouseDelta:      { value: new THREE.Vector2(0, 0) },
      u_influenceRadius: { value: params.influenceRadius },
      u_cursorStrength:  { value: params.cursorSensitivity },
    },
    depthTest: false,
    depthWrite: false,
  });

  const quadGeo   = new THREE.PlaneGeometry(2, 2);
  const advectMesh = new THREE.Mesh(quadGeo, advectMat);
  advectScene.add(advectMesh);

  // ---- Grass instanced geometry ----
  const grassGeo = new THREE.InstancedBufferGeometry();
  grassGeo.instanceCount = BLADE_COUNT;

  // 5-vertex blade shape (tapered quad, triangle strip order):
  //   v4 tip (0, 1)
  //   v2(-0.35, 0.5)  v3(0.35, 0.5)
  //   v0(-0.5, 0.0)   v1(0.5, 0.0)
  const bladeVerts = new Float32Array([
    -0.5, 0.0, 0,
     0.5, 0.0, 0,
    -0.35, 0.5, 0,
     0.35, 0.5, 0,
     0.0, 1.0, 0,
  ]);
  grassGeo.setAttribute('position', new THREE.BufferAttribute(bladeVerts, 3));

  // Indexed triangles: bottom quad + top triangle
  const bladeIdx = new Uint16Array([0,1,3, 0,3,2, 2,3,4]);
  grassGeo.setIndex(new THREE.BufferAttribute(bladeIdx, 1));

  // Height ratio per vertex (0 = root, 1 = tip)
  const tVals = new Float32Array([0, 0, 0.5, 0.5, 1.0]);
  grassGeo.setAttribute('a_t', new THREE.BufferAttribute(tVals, 1));

  // Per-instance data
  const offsets = new Float32Array(BLADE_COUNT * 2);
  const hashes  = new Float32Array(BLADE_COUNT);
  for (let i = 0; i < BLADE_COUNT; i++) {
    offsets[i * 2]     = Math.random();
    offsets[i * 2 + 1] = Math.random();
    hashes[i]          = Math.random();
  }
  grassGeo.setAttribute('a_offset', new THREE.InstancedBufferAttribute(offsets, 2));
  grassGeo.setAttribute('a_hash',   new THREE.InstancedBufferAttribute(hashes, 1));

  // ---- Grass material ----
  const grassMat = new THREE.ShaderMaterial({
    vertexShader:   grassVert,
    fragmentShader: grassFrag,
    uniforms: {
      u_velocityField: { value: fboA.texture },
      u_windIntensity: { value: params.windIntensity },
      u_planeSize:     { value: PLANE_SIZE },
      u_time:          { value: 0.0 },
    },
    side: THREE.DoubleSide,
  });

  const grassMesh = new THREE.Mesh(grassGeo, grassMat);
  mainScene.add(grassMesh);

  // ---- Ground plane ----
  const groundGeo = new THREE.PlaneGeometry(PLANE_SIZE * 1.05, PLANE_SIZE * 1.05, 1, 1);
  groundGeo.rotateX(-Math.PI / 2);
  const groundMat = new THREE.MeshStandardMaterial({
    color:     0x131e08,
    roughness: 1.0,
    metalness: 0.0,
  });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.position.y = -0.001;
  mainScene.add(ground);

  // ---- Lighting ----
  const ambient = new THREE.AmbientLight(0x4a6a80, 0.55);
  mainScene.add(ambient);

  const sun = new THREE.DirectionalLight(0xffe8b0, 1.3);
  sun.position.set(6, 12, 4);
  mainScene.add(sun);

  // Subtle fill from below (sky bounce)
  const fill = new THREE.DirectionalLight(0x90c0ff, 0.12);
  fill.position.set(-3, -1, 2);
  mainScene.add(fill);

  // ---- Slider controls ----
  setupControls(advectMat, grassMat);

  // ---- Start loop ----
  animate(advectMat, grassMat);
}

// ---- Controls ----
function setupControls(advectMat, grassMat) {
  const bindings = [
    {
      id: 'windIntensity',
      mats: [advectMat, grassMat],
      uniform: 'u_windIntensity',
      key: 'windIntensity',
    },
    {
      id: 'windAngle',
      mats: [advectMat],
      uniform: 'u_windAngle',
      key: 'windAngle',
    },
    {
      id: 'cursorSensitivity',
      mats: [advectMat],
      uniform: 'u_cursorStrength',
      key: 'cursorSensitivity',
    },
    {
      id: 'influenceRadius',
      mats: [advectMat],
      uniform: 'u_influenceRadius',
      key: 'influenceRadius',
    },
  ];

  bindings.forEach(({ id, mats, uniform, key }) => {
    const slider = document.getElementById(id);
    const valEl  = document.getElementById(id + '-val');
    if (!slider) return;

    slider.addEventListener('input', () => {
      const v = parseFloat(slider.value);
      params[key] = v;
      valEl.textContent = v;
      mats.forEach(m => { m.uniforms[uniform].value = v; });
    });
  });
}

// ---- Animation loop ----
const clock = new THREE.Clock();
let elapsed = 0;

function animate(advectMat, grassMat) {
  requestAnimationFrame(() => animate(advectMat, grassMat));

  const dt = Math.min(clock.getDelta(), 0.05);
  elapsed += dt;

  // Update time + mouse uniforms
  advectMat.uniforms.u_time.value  = elapsed;
  advectMat.uniforms.u_dt.value    = dt;
  advectMat.uniforms.u_mousePos.value.copy(mouse.uv);
  advectMat.uniforms.u_mouseDelta.value.copy(mouse.delta);
  grassMat.uniforms.u_time.value   = elapsed;

  // Step velocity field: advect → write to back buffer
  advectMat.uniforms.u_velocity.value = fboA.texture;
  renderer.setRenderTarget(fboB);
  renderer.render(advectScene, orthoCamera);
  renderer.setRenderTarget(null);

  // Swap ping-pong buffers
  const tmp = fboA; fboA = fboB; fboB = tmp;
  grassMat.uniforms.u_velocityField.value = fboA.texture;

  // Decay mouse delta each frame so impulse fades naturally
  mouse.delta.multiplyScalar(0.80);

  // Render main scene
  renderer.render(mainScene, perspCamera);
}

// ---- Resize ----
window.addEventListener('resize', () => {
  perspCamera.aspect = window.innerWidth / window.innerHeight;
  perspCamera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

init().catch(console.error);
