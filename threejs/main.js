import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.165.0/build/three.module.js';

const params = {
  radius: 18,
  bloomThreshold: 0.6,
  bloomStrength: 8.0,
  vignette: 1.0,
  samples: 64,
};

// Scene: just a fullscreen quad
const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('canvas'), antialias: false });
renderer.setPixelRatio(devicePixelRatio);

const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

async function init() {
  const [vertSrc, fragSrc] = await Promise.all([
    fetch('shader.vert').then(r => r.text()),
    fetch('shader.frag').then(r => r.text()),
  ]);

  const texture = new THREE.TextureLoader().load('../assets/photo.jpg', () => render());
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;

  const material = new THREE.ShaderMaterial({
    vertexShader: vertSrc,
    fragmentShader: fragSrc,
    uniforms: {
      u_image:          { value: texture },
      u_resolution:     { value: new THREE.Vector2() },
      u_radius:         { value: params.radius },
      u_bloomThreshold: { value: params.bloomThreshold },
      u_bloomStrength:  { value: params.bloomStrength },
      u_vignette:       { value: params.vignette },
      u_samples:        { value: params.samples },
    },
  });

  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  scene.add(mesh);

  window._material = material; // expose for controls

  setupControls(material);
  updateTime();
  setInterval(updateTime, 1000);
  resize();
  window.addEventListener('resize', resize);
}

function resize() {
  const canvas = renderer.domElement;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  renderer.setSize(w, h, false);
  if (window._material) {
    window._material.uniforms.u_resolution.value.set(
      w * devicePixelRatio,
      h * devicePixelRatio
    );
  }
  render();
}

function render() {
  renderer.render(scene, camera);
}

function setupControls(material) {
  const map = {
    radius:         'u_radius',
    bloomThreshold: 'u_bloomThreshold',
    bloomStrength:  'u_bloomStrength',
    vignette:       'u_vignette',
    samples:        'u_samples',
  };

  Object.entries(map).forEach(([id, uniform]) => {
    const slider = document.getElementById(id);
    const valueEl = document.getElementById(id + '-value');
    if (!slider) return;
    slider.value = params[id];
    valueEl.textContent = params[id];
    slider.addEventListener('input', () => {
      const val = parseFloat(slider.value);
      params[id] = val;
      valueEl.textContent = slider.value;
      material.uniforms[uniform].value = val;
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

init();
