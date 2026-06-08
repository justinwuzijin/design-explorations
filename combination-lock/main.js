import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.165.0/build/three.module.js';

// ---- Lock configuration ----
const DIAL_COUNT = 3;
const DIGITS     = 10;                 // 0-9 per dial
const STEP       = (Math.PI * 2) / DIGITS;  // detent angle (36 deg)
const RADIUS     = 1.0;
const THICK      = 0.62;               // wheel thickness along the shared axis (Y)
const SPACING    = THICK + 0.14;       // centre-to-centre distance between wheels

// Texture alignment: which surface angle sits at the front (+Z). Calibrated so the
// engraved digit facing the camera matches the active read line.
const TEX_OFFSET    = 0.05;
const READ_DIR      = 1;               // sign mapping rotation -> advancing digit
const DISPLAY_OFFSET = 0;              // detent index -> displayed digit calibration

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
camera.position.set(0, 0.7, 8.4);
camera.lookAt(0, 0.45, 0);

// Environment map so polished-metal surfaces have something to reflect.
// Built procedurally from a soft studio gradient (no external dependency).
function makeStudioEnv() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 256;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, c.height);
  g.addColorStop(0.0, '#ffffff'); // bright sky
  g.addColorStop(0.45, '#e8edf3');
  g.addColorStop(0.55, '#aeb6c2'); // horizon
  g.addColorStop(1.0, '#5a606b'); // floor
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, c.width, c.height);
  // a couple of soft rectangular "softbox" highlights for crisp metal glints
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.fillRect(70, 30, 120, 70);
  ctx.fillRect(330, 40, 110, 60);
  const tex = new THREE.CanvasTexture(c);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const pmrem = new THREE.PMREMGenerator(renderer);
const envMap = pmrem.fromEquirectangular(makeStudioEnv()).texture;

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
// Cylinder default axis is Y, so wheels stack vertically and each one spins about
// its own (vertical) axis via mesh.rotation.y. The engraved digit facing the camera
// at +Z is the active read line, giving a vertical column of numbers.
const sideGeo = new THREE.CylinderGeometry(RADIUS, RADIUS, THICK, 96, 1, false);

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
  // index 0 sits at the top so the combination reads top -> bottom
  mesh.position.y = totalSpan / 2 - i * SPACING;
  rig.add(mesh);

  // start each wheel on a random detent so the lock begins scrambled (LOCKED)
  const startDetent = 1 + Math.floor(Math.random() * (DIGITS - 1));
  const startRot = startDetent * STEP;
  mesh.rotation.y = startRot;

  dials.push({
    mesh,
    rotation:   startRot,
    velocity:   0,
    dragging:   false,
    lastDetent: startDetent,
  });
}

// central rod through all wheels (vertical)
const rodGeo = new THREE.CylinderGeometry(0.13, 0.13, totalSpan + THICK + 0.5, 24);
const rod = new THREE.Mesh(
  rodGeo,
  new THREE.MeshStandardMaterial({ color: 0x9aa0ad, metalness: 0.95, roughness: 0.25 })
);
rig.add(rod);

// ---- Shackle: polished steel U-hoop coming out of the top ----
// Lives inside a pivot group so it can lift + swing open around its right leg.
const SHACKLE_W = 0.62;            // half the distance between the two legs
const bodyTop   = totalSpan / 2 + THICK / 2;
const shacklePivot = new THREE.Group();
shacklePivot.position.set(SHACKLE_W, 0, 0); // pivot sits on the right leg axis
rig.add(shacklePivot);

(function buildShackle() {
  const w    = SHACKLE_W;
  const zOff = 0.0;
  const legBottom = bodyTop - 0.06;       // tucks just into the body top
  const legTop    = bodyTop + 0.95;       // where the straight legs meet the arc
  const arcR      = w;                    // semicircle radius == half leg spacing

  const pts = [];
  const legSeg = 8;
  for (let i = 0; i <= legSeg; i++) {
    const y = legBottom + (legTop - legBottom) * (i / legSeg);
    pts.push(new THREE.Vector3(-w, y, zOff));
  }
  const arcSeg = 40;
  for (let i = 1; i < arcSeg; i++) {
    const a = Math.PI - (Math.PI * i) / arcSeg; // pi -> 0
    pts.push(new THREE.Vector3(Math.cos(a) * arcR, legTop + Math.sin(a) * arcR, zOff));
  }
  for (let i = 0; i <= legSeg; i++) {
    const y = legTop - (legTop - legBottom) * (i / legSeg);
    pts.push(new THREE.Vector3(w, y, zOff));
  }

  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal', 0.0);
  const shackleGeo = new THREE.TubeGeometry(curve, 220, 0.125, 24, false);
  const shackleMat = new THREE.MeshStandardMaterial({
    color: 0xdfe3e8, metalness: 1.0, roughness: 0.18,
    envMap, envMapIntensity: 1.25,
  });
  const shackle = new THREE.Mesh(shackleGeo, shackleMat);
  shacklePivot.add(shackle);

  const capGeo = new THREE.SphereGeometry(0.125, 20, 16);
  for (const x of [-w, w]) {
    const cap = new THREE.Mesh(capGeo, shackleMat);
    cap.position.set(x, legBottom, zOff);
    shacklePivot.add(cap);
  }

  // shift children back by the pivot offset so the closed shackle sits centred
  shacklePivot.children.forEach(c => { c.position.x -= w; });
})();

// front read-line indicator: a slim arrow on the right pointing at the column
const markGeo = new THREE.ConeGeometry(0.13, 0.3, 4);
const markMat = new THREE.MeshStandardMaterial({
  color: 0xffcf66, metalness: 0.4, roughness: 0.4,
  emissive: 0x3a2600, emissiveIntensity: 0.6,
});
const marker = new THREE.Mesh(markGeo, markMat);
marker.rotation.z = Math.PI / 2; // point left toward the front read column
marker.position.set(RADIUS + 0.34, 0, RADIUS - 0.02);
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
    // horizontal drag rolls the wheel about its vertical axis
    const delta = dx * 0.012 * READ_DIR;
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

  dial.mesh.rotation.y = dial.rotation;

  // detent crossing -> tick
  const detent = Math.round(dial.rotation / STEP);
  if (detent !== dial.lastDetent) {
    dial.lastDetent = detent;
    const speed = Math.min(1, Math.abs(dial.velocity) * 6 + 0.25);
    playTick(speed);
  }
}

// ---- Combination / unlock state ----
const target = new Array(DIAL_COUNT).fill(0); // user-set unlock code
let openAmount = 0;                            // 0 = closed, 1 = fully open

// The digit currently sitting at the front (+Z) read line for a given dial.
// Geometry: the cylinder vertex with param theta = -rotation lands at +Z, so the
// displayed digit advances opposite to the detent index.
function currentDigit(dial) {
  const idx = Math.round(dial.rotation / STEP);
  return (((-idx + DISPLAY_OFFSET) % DIGITS) + DIGITS) % DIGITS;
}

function isSettled(dial) {
  return !dial.dragging && Math.abs(dial.velocity) < 1e-4 &&
    Math.abs(dial.rotation - Math.round(dial.rotation / STEP) * STEP) < 0.02;
}

function combinationMatches() {
  for (let i = 0; i < DIAL_COUNT; i++) {
    if (!isSettled(dials[i]) || currentDigit(dials[i]) !== target[i]) return false;
  }
  return true;
}

function animateShackle() {
  const wantOpen = combinationMatches() ? 1 : 0;
  openAmount += (wantOpen - openAmount) * 0.12;
  if (openAmount < 1e-3) openAmount = 0;

  shacklePivot.position.y = openAmount * 0.55;          // lift up out of the body
  shacklePivot.rotation.y = openAmount * (Math.PI * 0.42); // swing open on its leg
  updateStatusUI(wantOpen === 1);
}

// ---- Bottom-right combination setter UI ----
const comboEl = document.getElementById('combo');
const cellEls = [];
let statusEl = null;

function buildComboUI() {
  if (!comboEl) return;
  const title = document.createElement('div');
  title.className = 'combo-title';
  title.textContent = 'unlock code';
  comboEl.appendChild(title);

  const row = document.createElement('div');
  row.className = 'combo-row';
  for (let i = 0; i < DIAL_COUNT; i++) {
    const cell = document.createElement('div');
    cell.className = 'combo-cell';

    const up = document.createElement('button');
    up.className = 'combo-btn';
    up.textContent = '▲';
    up.addEventListener('click', () => { target[i] = (target[i] + 1) % DIGITS; renderCombo(); });

    const val = document.createElement('div');
    val.className = 'combo-val';
    val.textContent = '0';

    const down = document.createElement('button');
    down.className = 'combo-btn';
    down.textContent = '▼';
    down.addEventListener('click', () => { target[i] = (target[i] + DIGITS - 1) % DIGITS; renderCombo(); });

    cell.appendChild(up);
    cell.appendChild(val);
    cell.appendChild(down);
    row.appendChild(cell);
    cellEls.push(val);
  }
  comboEl.appendChild(row);

  statusEl = document.createElement('div');
  statusEl.className = 'combo-status locked';
  statusEl.textContent = 'LOCKED';
  comboEl.appendChild(statusEl);
}

function renderCombo() {
  for (let i = 0; i < DIAL_COUNT; i++) cellEls[i].textContent = String(target[i]);
}

function updateStatusUI(open) {
  if (!statusEl) return;
  if (open) {
    statusEl.textContent = 'OPEN';
    statusEl.classList.add('open');
    statusEl.classList.remove('locked');
  } else {
    statusEl.textContent = 'LOCKED';
    statusEl.classList.add('locked');
    statusEl.classList.remove('open');
  }
}

buildComboUI();
renderCombo();

// ---- Resize ----
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---- Animate ----
function tick() {
  for (const d of dials) updateDial(d);
  animateShackle();
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}
tick();
