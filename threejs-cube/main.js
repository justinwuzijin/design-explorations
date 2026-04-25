import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.165.0/build/three.module.js';
import { OrbitControls } from 'https://cdn.jsdelivr.net/npm/three@0.165.0/examples/jsm/controls/OrbitControls.js';

// --- Renderer ---
const canvas = document.getElementById('canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;

// --- Scene & Camera ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0e0e0e);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(3, 2, 4);

// --- OrbitControls ---
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.04;
controls.autoRotate = true;
controls.autoRotateSpeed = 1.2;
controls.enablePan = false;
controls.minDistance = 2;
controls.maxDistance = 10;

// Pause auto-rotate while user is dragging, resume after
let userInteracting = false;
controls.addEventListener('start', () => { userInteracting = true;  controls.autoRotate = false; });
controls.addEventListener('end',   () => { userInteracting = false; controls.autoRotate = true;  });

// Hide hint after first interaction
const hint = document.getElementById('hint');
renderer.domElement.addEventListener('pointerdown', () => hint.classList.add('hidden'), { once: true });

// --- Lights ---
// Ambient fill
scene.add(new THREE.AmbientLight(0xffffff, 0.4));

// Key light (warm)
const keyLight = new THREE.DirectionalLight(0xfff0dd, 2.5);
keyLight.position.set(5, 8, 5);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(1024, 1024);
scene.add(keyLight);

// Rim light (cool, opposite side)
const rimLight = new THREE.DirectionalLight(0xaac8ff, 1.2);
rimLight.position.set(-5, 3, -4);
scene.add(rimLight);

// --- Cube ---
const geometry = new THREE.BoxGeometry(1.6, 1.6, 1.6);

// Each face gets a slightly different hue for depth
const faceColors = [0xe8554e, 0x4e9ee8, 0x4ee87a, 0xe8c84e, 0xb44ee8, 0xe8844e];
const materials = faceColors.map(color =>
  new THREE.MeshStandardMaterial({
    color,
    roughness: 0.25,
    metalness: 0.6,
  })
);

const cube = new THREE.Mesh(geometry, materials);
cube.castShadow = true;
scene.add(cube);

// Wireframe overlay for a techy edge look
const wireMat = new THREE.MeshBasicMaterial({
  color: 0xffffff,
  wireframe: true,
  transparent: true,
  opacity: 0.06,
});
const wire = new THREE.Mesh(geometry, wireMat);
cube.add(wire);

// --- Floor (receives shadow) ---
const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(20, 20),
  new THREE.ShadowMaterial({ opacity: 0.25 })
);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -1.4;
floor.receiveShadow = true;
scene.add(floor);

// --- Resize ---
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- Animate ---
function animate() {
  requestAnimationFrame(animate);
  controls.update(); // required for damping + autoRotate
  renderer.render(scene, camera);
}

animate();
