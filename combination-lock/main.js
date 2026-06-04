import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.165.0/build/three.module.js';

// ---- Lock configuration ----
const DIAL_COUNT = 3;
const DIGITS     = 10;                 // 0-9 per dial
const STEP       = (Math.PI * 2) / DIGITS;  // detent angle (36 deg)
const RADIUS     = 1.0;
const THICK      = 0.62;               // wheel thickness along the shared axis (X)
const SPACING    = THICK + 0.14;       // centre-to-centre distance between wheels

// Texture alignment: which surface angle sits at the front (+Z). Calibrated so the
// engraved digit facing the camera matches the readout at the top of the screen.
const TEX_OFFSET = 0.0;
const READ_DIR   = 1;                  // sign mapping rotation -> advancing digit

// ---- Renderer ----
const canvas = document.getElementById('canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

// ---- Scene & camera ----
const scene = new THREE.Scene();
const BG = new THREE.Color(0xffffff);
scene.background = BG;

const camera = new THREE.PerspectiveCamera(
  42, window.innerWidth / window.innerHeight, 0.05, 100
);
camera.position.set(0, 0.9, 6.4);
camera.lookAt(0, 0, 0);

// ---- Lights ----
scene.add(new THREE.HemisphereLight(0xffffff, 0xe8e8f0, 0.7));

const key = new THREE.DirectionalLight(0xffffff, 2.1);
key.position.set(4, 6, 7);
scene.add(key);

const rim = new THREE.DirectionalLight(0x88aaff, 1.1);
rim.position.set(-5, 2, -4);
scene.add(rim);

const fill = new THREE.PointLight(0xffe6c0, 0.6, 40);
fill.position.set(0, -3, 5);
scene.add(fill);

// ---- Rig (orbits as one unit) ----
const rig = new THREE.Group();
scene.add(rig);

// ---- Digit texture ----
function makeDigitTexture() {
  const cellW = 160, h = 256;
  const c = document.createElement('canvas');
  c.width = cellW * DIGITS;
  c.height = h;
  const ctx = c.getContext('2d');

  // brushed-metal vertical gradient
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0.0, '#3a3a42');
  g.addColorStop(0.5, '#15151a');
  g.addColorStop(1.0, '#34343c');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, c.width, h);

  // faint horizontal brushing
  ctx.globalAlpha = 0.05;
  ctx.strokeStyle = '#ffffff';
  for (let y = 0; y < h; y += 3) {
    ctx.beginPath();
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(c.width, y + 0.5);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (let d = 0; d < DIGITS; d++) {
    const cx = d * cellW + cellW / 2;

    // engraved divider tick on the left edge of each cell
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(d * cellW + 1, 0);
    ctx.lineTo(d * cellW + 1, h);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.beginPath();
    ctx.moveTo(d * cellW + 3, 0);
    ctx.lineTo(d * cellW + 3, h);
    ctx.stroke();

    // numeral, drawn twice for an engraved look
    ctx.font = '600 132px Inter, -apple-system, sans-serif';
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillText(String(d), cx, h / 2 + 4);
    ctx.fillStyle = 'rgba(238,238,246,0.92)';
    ctx.fillText(String(d), cx, h / 2);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  tex.offset.x = TEX_OFFSET;
  return tex;
}

// ---- Build dials ----
// Cylinder default axis is Y; rotate the geometry so the tube axis lies along X,
// then spinning mesh.rotation.x rotates each wheel about its own axis.
const sideGeo = new THREE.CylinderGeometry(RADIUS, RADIUS, THICK, 96, 1, false);
sideGeo.rotateZ(Math.PI / 2);

const rimMat = new THREE.MeshStandardMaterial({
  color: 0x2a2a30, metalness: 0.85, roughness: 0.35,
});

const dials = [];
const totalSpan = (DIAL_COUNT - 1) * SPACING;

for (let i = 0; i < DIAL_COUNT; i++) {
  const faceMat = new THREE.MeshStandardMaterial({
    map: makeDigitTexture(), metalness: 0.45, roughness: 0.5,
  });
  // material order for CylinderGeometry: [side, top, bottom]
  const mesh = new THREE.Mesh(sideGeo, [faceMat, rimMat, rimMat]);
  mesh.position.x = -totalSpan / 2 + i * SPACING;
  rig.add(mesh);

  dials.push({
    mesh,
    rotation:   0,
    velocity:   0,
    dragging:   false,
    lastDetent: 0,
  });
}

// central rod through all wheels
const rodGeo = new THREE.CylinderGeometry(0.13, 0.13, totalSpan + THICK + 0.5, 24);
rodGeo.rotateZ(Math.PI / 2);
const rod = new THREE.Mesh(
  rodGeo,
  new THREE.MeshStandardMaterial({ color: 0x9aa0ad, metalness: 0.95, roughness: 0.25 })
);
rig.add(rod);

// front pointer/indicator showing the active read line
const markGeo = new THREE.ConeGeometry(0.12, 0.26, 4);
const markMat = new THREE.MeshStandardMaterial({ color: 0xffcf66, metalness: 0.4, roughness: 0.4, emissive: 0x3a2600, emissiveIntensity: 0.6 });
const marker = new THREE.Mesh(markGeo, markMat);
marker.rotation.x = Math.PI; // point downward onto the top of the wheels
marker.position.set(0, RADIUS + 0.28, 0.0);
rig.add(marker);

// ---- Audio: detent tick ----
let audioCtx = null;
let tickBuffer = null;
let lastTickTime = 0;

async function initAudio() {
  if (audioCtx) return;
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  try {
    const res = await fetch('../assets/dial-spin.m4a');
    const arr = await res.arrayBuffer();
    tickBuffer = await audioCtx.decodeAudioData(arr);
  } catch (e) {
    console.warn('tick audio failed to load', e);
  }
}

function playTick(strength = 1) {
  if (!audioCtx || !tickBuffer) return;
  const now = audioCtx.currentTime;
  if (now - lastTickTime < 0.018) return; // avoid machine-gunning
  lastTickTime = now;

  const src = audioCtx.createBufferSource();
  src.buffer = tickBuffer;
  src.playbackRate.value = 0.92 + Math.random() * 0.16;

  const gain = audioCtx.createGain();
  gain.gain.value = Math.min(1, 0.35 + strength * 0.65);

  src.connect(gain).connect(audioCtx.destination);
  src.start();
}

// ---- Pointer interaction ----
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();

let mode = null;           // 'orbit' | 'spin' | null
let activeDial = null;
let prevX = 0, prevY = 0;

function setNDC(e) {
  ndc.set(
    (e.clientX / window.innerWidth) * 2 - 1,
    -(e.clientY / window.innerHeight) * 2 + 1
  );
}

function onDown(e) {
  initAudio();
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();

  prevX = e.clientX;
  prevY = e.clientY;
  setNDC(e);
  raycaster.setFromCamera(ndc, camera);

  const hits = raycaster.intersectObjects(dials.map(d => d.mesh), false);
  if (hits.length > 0) {
    mode = 'spin';
    activeDial = dials.find(d => d.mesh === hits[0].object);
    activeDial.dragging = true;
    activeDial.velocity = 0;
  } else {
    mode = 'orbit';
  }
  canvas.setPointerCapture?.(e.pointerId);
}

function onMove(e) {
  if (!mode) return;
  const dx = e.clientX - prevX;
  const dy = e.clientY - prevY;
  prevX = e.clientX;
  prevY = e.clientY;

  if (mode === 'orbit') {
    rig.rotation.y += dx * 0.006;
    rig.rotation.x += dy * 0.006;
    rig.rotation.x = Math.max(-0.9, Math.min(0.9, rig.rotation.x));
  } else if (mode === 'spin' && activeDial) {
    // vertical drag spins the wheel; tune so a full screen feels like a few turns
    const delta = dy * 0.012 * READ_DIR;
    activeDial.rotation += delta;
    activeDial.velocity = delta; // last-frame delta becomes throw velocity
  }
}

function onUp(e) {
  if (mode === 'spin' && activeDial) activeDial.dragging = false;
  mode = null;
  activeDial = null;
  canvas.releasePointerCapture?.(e.pointerId);
}

canvas.addEventListener('pointerdown', onDown);
window.addEventListener('pointermove', onMove);
window.addEventListener('pointerup', onUp);
canvas.addEventListener('contextmenu', e => e.preventDefault());

// ---- Per-frame dial update ----
function updateDial(dial) {
  if (!dial.dragging) {
    // inertial spin
    dial.rotation += dial.velocity;
    dial.velocity *= 0.94;

    // once slow enough, ease into the nearest detent
    if (Math.abs(dial.velocity) < 0.0025) {
      dial.velocity = 0;
      const target = Math.round(dial.rotation / STEP) * STEP;
      dial.rotation += (target - dial.rotation) * 0.22;
    }
  }

  dial.mesh.rotation.x = dial.rotation;

  // detent crossing -> tick
  const detent = Math.round(dial.rotation / STEP);
  if (detent !== dial.lastDetent) {
    dial.lastDetent = detent;
    const speed = Math.min(1, Math.abs(dial.velocity) * 6 + 0.25);
    playTick(speed);
  }
}

// ---- Resize ----
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---- Animate ----
function tick() {
  for (const d of dials) updateDial(d);
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}
tick();
