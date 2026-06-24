// Offline oil-pastel and watercolor stylization for flipbook frame sequences.
// Colours are sampled from each source pixel (the photographic frame), then
// broken up with the same tooth / wash logic as the interactive demos.

const PAPER = [0.994, 0.992, 0.987];
const PAPER_TEX_SIZE = 626;

export function hash(p) {
  return fract(Math.sin(p[0] * 127.1 + p[1] * 311.7) * 43758.5453123);
}

function fract(x) {
  return x - Math.floor(x);
}

export function vnoise(p) {
  const i = [Math.floor(p[0]), Math.floor(p[1])];
  const f = [p[0] - i[0], p[1] - i[1]];
  const u = [f[0] * f[0] * (3 - 2 * f[0]), f[1] * f[1] * (3 - 2 * f[1])];
  const a = hash(i);
  const b = hash([i[0] + 1, i[1]]);
  const c = hash([i[0], i[1] + 1]);
  const d = hash([i[0] + 1, i[1] + 1]);
  return a * (1 - u[0]) * (1 - u[1])
       + b * u[0] * (1 - u[1])
       + c * (1 - u[0]) * u[1]
       + d * u[0] * u[1];
}

export function toothAt(pc) {
  return clamp(
    vnoise([pc[0] * 45, pc[1] * 45]) * 0.30
    + vnoise([pc[0] * 160, pc[1] * 160]) * 0.40
    + vnoise([pc[0] * 420, pc[1] * 420]) * 0.30,
    0, 1,
  );
}

function clamp(x, lo, hi) {
  return Math.min(hi, Math.max(lo, x));
}

function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function mixPigment(a, b, t) {
  t = clamp(t, 0, 1);
  return [
    Math.sqrt(a[0] * a[0] * (1 - t) + b[0] * b[0] * t),
    Math.sqrt(a[1] * a[1] * (1 - t) + b[1] * b[1] * t),
    Math.sqrt(a[2] * a[2] * (1 - t) + b[2] * b[2] * t),
  ];
}

function srgbToLinear(c) {
  return c.map((v) => {
    const x = v / 255;
    return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  });
}

function linearToSrgb(c) {
  return c.map((v) => {
    const x = clamp(v, 0, 1);
    const s = x <= 0.0031308 ? x * 12.92 : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
    return Math.round(clamp(s, 0, 1) * 255);
  });
}

export function absorbanceFromSrgb(r, g, b) {
  const ch = (x) => Math.min(3.4, -Math.log(Math.max(x / 255, 0.015)));
  return [ch(r), ch(g), ch(b)];
}

function paperScale(w, h) {
  return [w / PAPER_TEX_SIZE, h / PAPER_TEX_SIZE];
}

function luminance(r, g, b) {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

// Edge + tone analysis shared by both stylizers (matches buildSketchFrame logic).
function analyzeSource(data, w, h) {
  const lum = new Float32Array(w * h);
  const edge = new Float32Array(w * h);
  const rgb = new Float32Array(w * h * 3);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const o = i * 4;
      const r = data[o], g = data[o + 1], b = data[o + 2];
      rgb[i * 3] = r;
      rgb[i * 3 + 1] = g;
      rgb[i * 3 + 2] = b;
      lum[i] = luminance(r, g, b);
    }
  }

  const EDGE_GAIN = 1.6, EDGE_THRESH = 22, EDGE_SOFT = 70;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const xm = x > 0 ? x - 1 : x, xp = x < w - 1 ? x + 1 : x;
      const ym = y > 0 ? y - 1 : y, yp = y < h - 1 ? y + 1 : y;
      const tl = lum[ym * w + xm], tt = lum[ym * w + x], tr = lum[ym * w + xp];
      const ll = lum[y * w + xm], rr = lum[y * w + xp];
      const bl = lum[yp * w + xm], bb = lum[yp * w + x], br = lum[yp * w + xp];
      const gx = (tr + 2 * rr + br) - (tl + 2 * ll + bl);
      const gy = (bl + 2 * bb + br) - (tl + 2 * tt + tr);
      const mag = Math.sqrt(gx * gx + gy * gy) * EDGE_GAIN / 8;
      edge[i] = mag > EDGE_THRESH ? Math.min(1, (mag - EDGE_THRESH) / EDGE_SOFT) : 0;
    }
  }

  return { lum, edge, rgb };
}

function drawPaperGridPixels(out, w, h) {
  const GRID_COLS = 22;
  const cell = w / GRID_COLS;
  const rows = Math.max(1, Math.round(h / cell));
  for (let c = 0; c <= GRID_COLS; c++) {
    const px = Math.round(c * cell + Math.sin(c * 12.9) * 0.5);
    const a = 0.32 + 0.07 * Math.sin(c * 7.3);
    for (let y = 0; y < h; y++) {
      const o = (y * w + px) * 4;
      out[o] = out[o] * (1 - a) + 122 * a;
      out[o + 1] = out[o + 1] * (1 - a) + 168 * a;
      out[o + 2] = out[o + 2] * (1 - a) + 219 * a;
    }
  }
  for (let r = 0; r <= rows; r++) {
    const py = Math.round(r * cell + Math.sin(r * 9.7) * 0.5);
    if (py < 0 || py >= h) continue;
    const a = 0.32 + 0.07 * Math.sin(r * 5.1);
    for (let x = 0; x < w; x++) {
      const o = (py * w + x) * 4;
      out[o] = out[o] * (1 - a) + 122 * a;
      out[o + 1] = out[o + 1] * (1 - a) + 168 * a;
      out[o + 2] = out[o + 2] * (1 - a) + 219 * a;
    }
  }
}

function paperGrain(out, w, h) {
  for (let t = 0; t < 1100; t++) {
    const x = (Math.random() * w) | 0;
    const y = (Math.random() * h) | 0;
    const o = (y * w + x) * 4;
    out[o] = out[o] * 0.985 + 70 * 0.015;
    out[o + 1] = out[o + 1] * 0.985 + 64 * 0.015;
    out[o + 2] = out[o + 2] * 0.985 + 50 * 0.015;
  }
}

// Oil pastel: source frame colours with waxy tooth break-up + relief lighting.
export function renderOilPastelFrame(data, w, h, opts = {}) {
  const grain = opts.grain ?? 0.55;
  const relief = opts.relief ?? 1.0;
  // intensity: how hard the stick is pressed. Higher = richer, more saturated
  // colour and a coverage floor that lets pigment blend across the tooth
  // valleys instead of dropping to bare paper — a heavier, messier layer.
  const intensity = opts.intensity ?? 0.92;
  const ps = paperScale(w, h);
  const { lum, edge, rgb } = analyzeSource(data, w, h);

  const cov = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const darkness = 1 - lum[i] / 255;
    cov[i] = clamp(0.5 + darkness * 0.55 + edge[i] * 0.4 + intensity * 0.3, 0.3, 1.7);
  }

  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const pc = [x / w * ps[0], y / h * ps[1]];
      const tooth = toothAt(pc);
      const lane = vnoise([pc[0] * 110, pc[1] * 110]);

      const src = srgbToLinear([rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2]]);
      // pull more of the frame's actual colour as intensity rises (less paper)
      const t = clamp(0.5 + intensity * 0.4 + (1 - lum[i] / 255) * 0.22 + edge[i] * 0.12, 0, 1);
      let pig = mixPigment(PAPER, src, t);

      const hx = (x < w - 1 ? cov[i + 1] : cov[i]) - (x > 0 ? cov[i - 1] : cov[i]);
      const hy = (y < h - 1 ? cov[i + w] : cov[i]) - (y > 0 ? cov[i - w] : cov[i]);
      const tx = vnoise([pc[0] * 300 + 1.3, pc[1] * 300]) - vnoise([pc[0] * 300 - 1.3, pc[1] * 300]);
      const ty = vnoise([pc[0] * 300, pc[1] * 300 + 1.3]) - vnoise([pc[0] * 300, pc[1] * 300 - 1.3]);
      const nx = -(hx * 6 + tx * 0.8) * relief;
      const ny = -(hy * 6 + ty * 0.8) * relief;
      const len = Math.sqrt(nx * nx + ny * ny + 1);
      const diff = 0.78 + 0.28 * Math.max((-nx * 0.35 + ny * 0.55 + 0.76) / len, 0);
      const spec = Math.pow(Math.max(0.76 / len, 0), 14) * 0.18 * smoothstep(0.25, 1.4, cov[i]);

      // Scumble keeps the tooth texture, but a pressure-driven floor lets colour
      // blend across the valleys instead of dropping to bare paper. As intensity
      // rises the floor lifts, so the layer fills in and the hues blend together.
      const scumble = smoothstep(0.42 - grain * 0.18, 0.88 - grain * 0.12, tooth + lane * 0.08);
      const floor = intensity * 0.62;
      const caught = clamp(scumble * (1 - floor) + floor, 0, 1);
      const peakShade = 0.9 + 0.16 * tooth;
      pig = pig.map((v) => v * diff * peakShade + spec);

      const alpha = clamp(caught * (0.78 + cov[i] * 0.18) + intensity * 0.12, 0, 1);
      const col = [
        PAPER[0] * (1 - alpha) + pig[0] * alpha,
        PAPER[1] * (1 - alpha) + pig[1] * alpha,
        PAPER[2] * (1 - alpha) + pig[2] * alpha,
      ];
      const o = i * 4;
      const srgb = linearToSrgb(col);
      out[o] = srgb[0];
      out[o + 1] = srgb[1];
      out[o + 2] = srgb[2];
      out[o + 3] = 255;
    }
  }

  drawPaperGridPixels(out, w, h);
  return out;
}

// Watercolor: source colours as absorbance, wet diffusion, Beer–Lambert display.
export function renderWatercolorFrame(data, w, h, opts = {}) {
  const edgeAmt = opts.edge ?? 6.0;
  const granul = opts.granul ?? 0.16;
  const diffusionSteps = opts.diffusionSteps ?? 10;
  const { lum, edge, rgb } = analyzeSource(data, w, h);
  const n = w * h;

  const absorb = new Float32Array(n * 3);
  const water = new Float32Array(n);

  for (let i = 0; i < n; i++) {
    const darkness = 1 - lum[i] / 255;
    const deposit = clamp(Math.max(edge[i] * 0.9, (darkness - 0.05) / 0.48), 0, 1);
    const ab = absorbanceFromSrgb(rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2]);
    absorb[i * 3] = ab[0] * deposit * 0.72;
    absorb[i * 3 + 1] = ab[1] * deposit * 0.72;
    absorb[i * 3 + 2] = ab[2] * deposit * 0.72;
    water[i] = deposit * 0.42 + edge[i] * 0.3;
  }

  const tmpA = new Float32Array(n * 3);
  const tmpW = new Float32Array(n);
  const dt = 0.016;
  const evaporation = 0.55;
  const diffusion = 0.32;
  const edgeFlow = 0.13;

  for (let step = 0; step < diffusionSteps; step++) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const nI = y > 0 ? i - w : i;
        const sI = y < h - 1 ? i + w : i;
        const eI = x < w - 1 ? i + 1 : i;
        const wI = x > 0 ? i - 1 : i;
        const avgA = [
          (absorb[nI * 3] + absorb[sI * 3] + absorb[eI * 3] + absorb[wI * 3]) * 0.25,
          (absorb[nI * 3 + 1] + absorb[sI * 3 + 1] + absorb[eI * 3 + 1] + absorb[wI * 3 + 1]) * 0.25,
          (absorb[nI * 3 + 2] + absorb[sI * 3 + 2] + absorb[eI * 3 + 2] + absorb[wI * 3 + 2]) * 0.25,
        ];
        const avgW = (water[nI] + water[sI] + water[eI] + water[wI]) * 0.25;
        const grain = vnoise([x / w * 240, y / h * 240]);
        const wet = smoothstep(0.004, 0.10, water[i]);

        tmpA[i * 3] = absorb[i * 3] + (avgA[0] - absorb[i * 3]) * diffusion * wet * (0.72 + 0.28 * grain);
        tmpA[i * 3 + 1] = absorb[i * 3 + 1] + (avgA[1] - absorb[i * 3 + 1]) * diffusion * wet * (0.72 + 0.28 * grain);
        tmpA[i * 3 + 2] = absorb[i * 3 + 2] + (avgA[2] - absorb[i * 3 + 2]) * diffusion * wet * (0.72 + 0.28 * grain);

        const gradWx = water[eI] - water[wI];
        const gradWy = water[sI] - water[nI];
        const gmag = Math.sqrt(gradWx * gradWx + gradWy * gradWy);
        if (gmag > 1e-5) {
          const dirX = gradWx / gmag;
          const dirY = gradWy / gmag;
          const sx = clamp(Math.round(x + dirX * 1.5), 0, w - 1);
          const sy = clamp(Math.round(y + dirY * 1.5), 0, h - 1);
          const up = (sy * w + sx) * 3;
          const pull = edgeFlow * wet * smoothstep(0, 0.06, gmag);
          tmpA[i * 3] += (absorb[up] - tmpA[i * 3]) * pull;
          tmpA[i * 3 + 1] += (absorb[up + 1] - tmpA[i * 3 + 1]) * pull;
          tmpA[i * 3 + 2] += (absorb[up + 2] - tmpA[i * 3 + 2]) * pull;
        }

        const puddle = smoothstep(0.25, 0.9, avgW);
        let wOut = water[i] + (avgW - water[i]) * (0.45 + 0.3 * puddle);
        wOut *= 1 - evaporation * dt * (0.7 + 0.6 * grain) * (1 - 0.45 * puddle);
        tmpW[i] = clamp(wOut, 0, 1.2);
      }
    }
    absorb.set(tmpA);
    water.set(tmpW);
  }

  const out = new Uint8ClampedArray(n * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const pig = [absorb[i * 3], absorb[i * 3 + 1], absorb[i * 3 + 2]];
      const p = (pig[0] + pig[1] + pig[2]) / 3;

      const eI = x < w - 1 ? i + 1 : i;
      const wI = x > 0 ? i - 1 : i;
      const nI = y > 0 ? i - w : i;
      const sI = y < h - 1 ? i + w : i;
      const dx = [
        absorb[eI * 3] - absorb[wI * 3],
        absorb[eI * 3 + 1] - absorb[wI * 3 + 1],
        absorb[eI * 3 + 2] - absorb[wI * 3 + 2],
      ];
      const dy = [
        absorb[sI * 3] - absorb[nI * 3],
        absorb[sI * 3 + 1] - absorb[nI * 3 + 1],
        absorb[sI * 3 + 2] - absorb[nI * 3 + 2],
      ];
      const edgeVal = Math.sqrt(
        Math.pow((dx[0] + dx[1] + dx[2]) / 3, 2)
        + Math.pow((dy[0] + dy[1] + dy[2]) / 3, 2),
      );

      let boost = 1 + edgeVal * edgeAmt * smoothstep(0.01, 0.25, p + edgeVal) / Math.max(p, 0.06);
      const g = vnoise([x / w * 360, y / h * 360]);
      boost *= 1 - granul * g * smoothstep(0.04, 0.5, p);

      const tooth = vnoise([x / w * 720, y / h * 720]) * 0.6 + vnoise([x / w * 260, y / h * 260]) * 0.4;
      const paper = [
        PAPER[0] - tooth * 0.012 * (1 - smoothstep(0, 0.4, p)),
        PAPER[1] - tooth * 0.012 * (1 - smoothstep(0, 0.4, p)),
        PAPER[2] - tooth * 0.012 * (1 - smoothstep(0, 0.4, p)),
      ];
      const col = [
        paper[0] * Math.exp(-pig[0] * boost),
        paper[1] * Math.exp(-pig[1] * boost),
        paper[2] * Math.exp(-pig[2] * boost),
      ];
      const o = i * 4;
      const srgb = linearToSrgb(col);
      out[o] = srgb[0];
      out[o + 1] = srgb[1];
      out[o + 2] = srgb[2];
      out[o + 3] = 255;
    }
  }

  drawPaperGridPixels(out, w, h);
  return out;
}

// Sketchbook base used when compositing stylized art onto the page.
export function drawSketchPaperBuffer(w, h) {
  const out = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const o = i * 4;
    out[o] = 251;
    out[o + 1] = 250;
    out[o + 2] = 245;
    out[o + 3] = 255;
  }
  paperGrain(out, w, h);
  drawPaperGridPixels(out, w, h);
  return out;
}
