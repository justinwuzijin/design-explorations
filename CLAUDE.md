# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development

No build step — all experiments are plain HTML/JS served as static files. To view them, run a local HTTP server from the repo root (required for `fetch()` shader loading and ES module imports):

```bash
python3 -m http.server 8080
# or
npx serve .
```

Then open `http://localhost:8080`.

> **Note:** Opening HTML files directly via `file://` will fail — shaders are loaded via `fetch()` and Three.js is imported as an ES module from a CDN, both of which require HTTP.

## Architecture

The repo is a flat collection of self-contained WebGL experiments, each in its own directory. All share a single source image at `assets/photo.jpg`.

| Experiment | Approach | What it demonstrates |
|---|---|---|
| `raw-webgl/` | Vanilla WebGL 1.0 | Manual GL setup, VBO, shader compilation, texture loading |
| `threejs/` | Three.js r165 (CDN) | Same bokeh GLSL via `ShaderMaterial` on a fullscreen `PlaneGeometry` |
| `threejs-cube/` | Three.js r165 | `OrbitControls`, damping, multi-material cube faces |
| `gallery/` | Three.js r165 | 38 floating cards with per-card drift animation, mouse parallax, `FogExp2` |
| `grass-fluid/` | Three.js r165 | 65k instanced grass blades driven by a GPU fluid velocity field |

`raw-webgl/` and `threejs/` implement the same bokeh effect (circular blur with bloom weighting + vignette) and share nearly identical GLSL — useful for comparing the two approaches side-by-side.

**Shader uniforms (bokeh experiments):**
- `u_radius` — blur kernel radius in pixels
- `u_bloomThreshold` / `u_bloomStrength` — luma-weighted sample boosting
- `u_vignette` — edge darkening strength
- `u_samples` — Poisson disk sample count (max 128, hardcoded in GLSL loop)

All UI sliders bind directly to these uniforms at runtime with no intermediate state layer.

## `grass-fluid/` — Fluid wind simulation

Two-pass GPU architecture:

1. **Velocity field pass** (`shaders/advect.frag`) — runs each frame on a 256×256 `WebGLRenderTarget` (ping-pong). Applies semi-Lagrangian advection, velocity decay, layered curl noise for ambient wind, and cursor impulse injection. Output is a 2-channel (RG = XZ velocity) half-float texture.

2. **Grass render pass** (`shaders/grass.vert/frag`) — 65,000 instanced blades using `InstancedBufferGeometry`. Each instance has `a_offset` (UV position on the plane) and `a_hash` (random seed). The vertex shader samples the velocity texture at `a_offset` and bends the blade tip by the velocity scaled by a quadratic weight (`a_t²`). No CPU-side wind computation — everything runs on GPU.

**Key patterns:**
- Ping-pong swap: `fboA ↔ fboB` each frame; grass samples `fboA.texture`
- `THREE.HalfFloatType` for FBO (WebGL2, supported in Three.js r155+)
- Curl noise = curl of a Simplex noise field → divergence-free, no visible repetition
- Mouse impulse: outward radial push + delta vector, falls off with `smoothstep³`
- Blade geometry: 5 vertices (v0–v4), 3 indexed triangles, tapered width via `mix(0.018, 0.004, a_t)`

**Adding a new parameter:** add slider to `index.html`, add uniform to `advectMat`/`grassMat` in `main.js`, add a binding entry in `setupControls()`, declare in the relevant shader.
