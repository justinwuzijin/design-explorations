import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.165.0/build/three.module.js';

const canvas = document.getElementById('canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0xf2ede6, 1);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0xf2ede6, 0.055);

const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 80);
camera.position.set(0, 0, 14);

// --- Placeholder card colors (cream / grey palette) ---
const cardPalette = [
  0xd6cfc6, 0xc8c0b5, 0xe0d9d0,
  0xb8b0a8, 0xcec8c0, 0xd8d2ca,
  0xbfb8b0, 0xe8e2da, 0xc4bdb5,
  0xd0c9c0, 0xbab3aa, 0xdad4cc,
];

// Aspect ratios mimicking film stills / polaroids
const aspects = [
  [1.4, 1.0],  // landscape
  [1.0, 1.4],  // portrait
  [1.6, 1.0],  // wide
  [1.0, 1.0],  // square
];

const CARD_COUNT = 38;
const cards = [];

function makeCard(index) {
  const [w, h] = aspects[index % aspects.length];
  const geo = new THREE.PlaneGeometry(w * 1.1, h * 1.1);

  // Subtle border effect: slightly lighter inner fill drawn via canvas texture
  const size = 256;
  const offscreen = document.createElement('canvas');
  offscreen.width = size * w;
  offscreen.height = size * h;
  const ctx = offscreen.getContext('2d');

  const baseColor = cardPalette[index % cardPalette.length];
  const r = (baseColor >> 16) & 0xff;
  const g = (baseColor >> 8)  & 0xff;
  const b =  baseColor        & 0xff;

  // Fill
  ctx.fillStyle = `rgb(${r},${g},${b})`;
  ctx.fillRect(0, 0, offscreen.width, offscreen.height);

  // Subtle inner grain (noise)
  for (let i = 0; i < 2000; i++) {
    const x = Math.random() * offscreen.width;
    const y = Math.random() * offscreen.height;
    const a = Math.random() * 0.08;
    ctx.fillStyle = `rgba(0,0,0,${a})`;
    ctx.fillRect(x, y, 1, 1);
  }

  // Thin border
  ctx.strokeStyle = `rgba(0,0,0,0.1)`;
  ctx.lineWidth = 3;
  ctx.strokeRect(1.5, 1.5, offscreen.width - 3, offscreen.height - 3);

  const tex = new THREE.CanvasTexture(offscreen);
  const mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geo, mat);

  // Random position in a sphere-ish volume, avoiding dead center
  const theta = Math.random() * Math.PI * 2;
  const phi   = Math.acos(2 * Math.random() - 1);
  const radius = 4.5 + Math.random() * 5.5;

  mesh.position.set(
    Math.sin(phi) * Math.cos(theta) * radius,
    Math.sin(phi) * Math.sin(theta) * radius * 0.55, // flatten vertically
    Math.cos(phi) * radius * 0.7 - 3,
  );

  // Random tilt — slight, like scattered prints
  mesh.rotation.set(
    (Math.random() - 0.5) * 0.5,
    (Math.random() - 0.5) * 0.4,
    (Math.random() - 0.5) * 0.8,
  );

  // Drift params — each card moves at its own pace
  mesh.userData = {
    driftSpeed:   0.0003 + Math.random() * 0.0004,
    driftOffset:  Math.random() * Math.PI * 2,
    driftRadius:  0.08 + Math.random() * 0.12,
    baseY:        mesh.position.y,
    baseX:        mesh.position.x,
    rotSpeed:     (Math.random() - 0.5) * 0.00015,
  };

  scene.add(mesh);
  cards.push(mesh);
}

for (let i = 0; i < CARD_COUNT; i++) makeCard(i);

// --- Mouse parallax ---
const mouse = { x: 0, y: 0 };
const target = { x: 0, y: 0 };

window.addEventListener('mousemove', e => {
  mouse.x = (e.clientX / window.innerWidth  - 0.5) * 2;
  mouse.y = (e.clientY / window.innerHeight - 0.5) * 2;
});

// --- Resize ---
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- Animate ---
let t = 0;
function animate() {
  requestAnimationFrame(animate);
  t++;

  // Smooth mouse follow
  target.x += (mouse.x - target.x) * 0.035;
  target.y += (mouse.y - target.y) * 0.035;

  // Camera parallax — gentle shift as mouse moves
  camera.position.x = target.x * 1.8;
  camera.position.y = -target.y * 1.0;
  camera.lookAt(0, 0, 0);

  // Drift each card
  cards.forEach(card => {
    const d = card.userData;
    const phase = t * d.driftSpeed + d.driftOffset;
    card.position.x = d.baseX + Math.sin(phase) * d.driftRadius;
    card.position.y = d.baseY + Math.cos(phase * 0.7) * d.driftRadius;
    card.rotation.z += d.rotSpeed;
  });

  renderer.render(scene, camera);
}

animate();
