// 2D Flipbook with Realistic Page Curl
// Flat top-down view like a real notebook

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

// Settings
let animationSpeed = 8;
let renderFps = 60;
let isPlaying = true;
let currentFrame = 0;
let totalFrames = 12; // driven by frames.length whenever a source loads
const BASKETBALL_FRAMES = 12;
let detail = 5;       // "pencil strokes" detail level, 1 (loose) .. 10 (dense)
let currentSeq = null; // cached images of the loaded sketch sequence, for rebuilds

// Timing
let lastAnimationTime = 0;
let lastRenderTime = 0;
let lastFrameT = 0;
let frames = [];

// Page flip state
let isFlipping = false;
let flipProgress = 0;
let flipStartTime = 0;
let flipDuration = 400; // ms for a page turn; scaled to the speed each flip

// Paper tones for the back of a turning page (no print bleeds through real paper)
const PAGE_FRONT = '#ffffff';
const PAGE_BACK  = '#f1efe8';

// Setup canvas
function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

// Easing for natural page motion
function easeInOutQuad(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

// A page swings slowly off the stack, accelerates as it passes vertical, then
// eases down onto the other side — slightly back-heavy, like real paper falling.
function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// The angle of a turning page over the flip: a slow anticipatory lift while the
// page is peeled off the stack, an accelerating fall as it tips past vertical,
// and a small settle (overshoot then back) as it lands on the other side.
function flipSwing(t) {
  if (t < 0.55) {
    const u = t / 0.55;
    return 0.5 * Math.pow(u, 1.85);          // slow build, gathering speed
  }
  const u = (t - 0.55) / 0.45;               // 0..1 for the fall
  const back = 1.2;                          // landing overshoot
  const eased = 1 + (back + 1) * Math.pow(u - 1, 3) + back * Math.pow(u - 1, 2);
  return 0.5 + 0.5 * eased;
}

// ---- Pencil sketch helpers: graphite, multi-pass jittered strokes ----
function pencilStroke(g, pts, opts = {}) {
  const { passes = 2, jitter = 1.3, width = 1.5, color = '54,52,58', alpha = 0.5 } = opts;
  for (let k = 0; k < passes; k++) {
    g.beginPath();
    for (let i = 0; i < pts.length; i++) {
      const x = pts[i][0] + (Math.random() - 0.5) * jitter;
      const y = pts[i][1] + (Math.random() - 0.5) * jitter;
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.strokeStyle = `rgba(${color},${alpha * (0.6 + 0.4 * Math.random())})`;
    g.lineWidth = width * (0.7 + 0.5 * Math.random());
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.stroke();
  }
}

function linePoints(x0, y0, x1, y1, n) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pts.push([x0 + (x1 - x0) * t, y0 + (y1 - y0) * t]);
  }
  return pts;
}

function quadPoints(x0, y0, cxp, cyp, x1, y1, n) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, mt = 1 - t;
    pts.push([
      mt * mt * x0 + 2 * mt * t * cxp + t * t * x1,
      mt * mt * y0 + 2 * mt * t * cyp + t * t * y1,
    ]);
  }
  return pts;
}

// a hand-drawn circle: random start, overshooting just past a full turn
function ellipsePoints(cx, cy, rx, ry, n) {
  const start = Math.random() * Math.PI * 2;
  const end = start + Math.PI * 2 + 0.4;
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = start + (end - start) * (i / n);
    pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
  }
  return pts;
}

// Light-blue notebook grid, drawn procedurally over a page rect. Deterministic
// (no per-frame randomness) so the grid stays put across frames and flips; a
// faint sine wobble + alpha variation give it a hand-ruled, organic feel.
const GRID_COLS = 22;
function drawPaperGrid(g, x, y, w, h) {
  const cell = w / GRID_COLS;
  const rows = Math.max(1, Math.round(h / cell));
  g.save();
  g.lineWidth = 1;
  for (let c = 0; c <= GRID_COLS; c++) {
    const px = x + c * cell + Math.sin(c * 12.9) * 0.5;
    g.strokeStyle = `rgba(122,168,219,${0.32 + 0.07 * Math.sin(c * 7.3)})`;
    g.beginPath();
    g.moveTo(px, y);
    g.lineTo(px, y + h);
    g.stroke();
  }
  for (let r = 0; r <= rows; r++) {
    const py = y + r * cell + Math.sin(r * 9.7) * 0.5;
    g.strokeStyle = `rgba(122,168,219,${0.32 + 0.07 * Math.sin(r * 5.1)})`;
    g.beginPath();
    g.moveTo(x, py);
    g.lineTo(x + w, py);
    g.stroke();
  }
  g.restore();
}

// ---- Value noise (fast integer hash) for organic, non-uniform pencil work ----
function ihash(ix, iy) {
  let n = (ix | 0) * 374761393 + (iy | 0) * 668265263;
  n = (n ^ (n >> 13)) * 1274126177;
  n = (n ^ (n >> 16)) >>> 0;
  return n / 4294967295;
}
function vnoise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = ihash(ix, iy), b = ihash(ix + 1, iy);
  const c = ihash(ix, iy + 1), d = ihash(ix + 1, iy + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

// One band of pencil hatching, but deliberately irregular: each stroke gets its
// own thickness, position jitter, and pressure that also varies ALONG its length,
// with occasional lifted/broken strokes — so it reads as hand-drawn, not a screen.
// The thickness also breathes along the stroke, so a single line swells and
// tapers the way a graphite tip does as the hand bears down and eases off.
//   u = coordinate along the stroke, v = coordinate across the strokes
function pencilBand(u, v, spacing) {
  const cell = v / spacing;
  const idx = Math.floor(cell);
  const tn = vnoise(idx * 1.3, 2.0);          // per-stroke base thickness + jitter
  const swell = vnoise(u * 0.03, idx * 0.7 + 4.0); // thickness wandering along its length
  // wide thickness range: some strokes are hairlines, others are bold and dark
  const thick = 0.08 + 0.72 * tn * (0.5 + 0.8 * swell);
  const f = cell - idx + (tn - 0.5) * 0.34;
  const center = thick * 0.5;
  const dist = Math.abs(f - center);
  if (dist > center) return 0;
  let profile = 1 - dist / center;            // tapered edges (soft pressure)
  profile *= profile;
  // pressure varies along the stroke (two scales: long fades + quick flicks)
  const along = vnoise(u * 0.05, idx * 0.6 + 11.0) * 0.7
              + vnoise(u * 0.16, idx * 0.9 + 23.0) * 0.3;
  if (along < 0.16) return 0;                  // lifted / broken stroke
  return profile * (0.36 + 0.82 * along);
}

// Sketchbook paper with a little grain + the blue grid — shared by every source
function drawSketchPaper(g) {
  g.fillStyle = '#fbfaf5';
  g.fillRect(0, 0, 400, 550);
  g.fillStyle = 'rgba(70, 64, 50, 0.015)';
  for (let t = 0; t < 1100; t++) {
    g.fillRect(Math.random() * 400, Math.random() * 550, 1, 1);
  }
  drawPaperGrid(g, 0, 0, 400, 550);
}

// A blank grid page (paper + grid, no drawing) — used for the back of a turning
// page so the reverse side is also lined/grid paper, like a real notebook.
let gridPageCanvas = null;
function getGridPage() {
  if (!gridPageCanvas) {
    gridPageCanvas = document.createElement('canvas');
    gridPageCanvas.width = 400;
    gridPageCanvas.height = 550;
    drawSketchPaper(gridPageCanvas.getContext('2d'));
  }
  return gridPageCanvas;
}

// Generate basketball bouncing frames
function generateFrames() {
  frames = [];

  for (let i = 0; i < BASKETBALL_FRAMES; i++) {
    const frameCanvas = document.createElement('canvas');
    const ctx = frameCanvas.getContext('2d');

    frameCanvas.width = 400;
    frameCanvas.height = 550;

    drawSketchPaper(ctx);

    const progress = i / (BASKETBALL_FRAMES - 1);
    const bounceHeight = Math.abs(Math.sin(progress * Math.PI)) * 180;
    const ballY = 420 - bounceHeight;
    const ballX = 200;

    const squash = bounceHeight < 25 ? 0.85 : 1.0;
    const radiusX = 40 * (1 / squash);
    const radiusY = 40 * squash;

    // Draw basketball — a loose pencil sketch on the sketchbook page
    const cx = ballX, cy = ballY, rx = radiusX, ry = radiusY;
    const ink = '58,55,60'; // graphite

    // opaque paper coat so the ball sits on top of the grid and overrides it
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#fbfaf5';
    ctx.fill();

    // faint colour wash so it still reads as a basketball, not flat orange
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(214,120,52,0.16)';
    ctx.fill();

    // graphite hatching builds form on the lower-right (shadow side)
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.clip();
    const diag = Math.max(rx, ry) * 2.3;
    for (let o = -diag; o <= diag; o += 5.5) {
      const mx = cx + o * 0.7071, my = cy + o * 0.7071;
      const w = Math.min(1, Math.max(0, (o + diag * 0.1) / (diag * 0.95)));
      if (w <= 0.03) continue;
      pencilStroke(ctx, [
        [mx - 0.7071 * diag, my + 0.7071 * diag],
        [mx + 0.7071 * diag, my - 0.7071 * diag],
      ], { passes: 1, jitter: 1.0, width: 1.1, alpha: 0.15 * w, color: ink });
    }
    ctx.restore();

    // rough hand-drawn outline (two laps)
    pencilStroke(ctx, ellipsePoints(cx, cy, rx, ry, 44),
      { passes: 2, jitter: 1.7, width: 1.9, alpha: 0.5, color: '44,42,48' });

    // seams: vertical + horizontal cross, plus two curved panel seams
    const segV = Math.max(6, Math.round(ry / 7));
    const segH = Math.max(6, Math.round(rx / 7));
    pencilStroke(ctx, linePoints(cx, cy - ry, cx, cy + ry, segV),
      { passes: 2, jitter: 1.5, width: 1.5, alpha: 0.5, color: ink });
    pencilStroke(ctx, linePoints(cx - rx, cy, cx + rx, cy, segH),
      { passes: 2, jitter: 1.5, width: 1.5, alpha: 0.5, color: ink });
    pencilStroke(ctx, quadPoints(cx, cy - ry, cx - rx * 1.18, cy, cx, cy + ry, 20),
      { passes: 2, jitter: 1.5, width: 1.5, alpha: 0.5, color: ink });
    pencilStroke(ctx, quadPoints(cx, cy - ry, cx + rx * 1.18, cy, cx, cy + ry, 20),
      { passes: 2, jitter: 1.5, width: 1.5, alpha: 0.5, color: ink });

    // Motion streaks — light pencil ticks trailing the ball when it's quick
    if (bounceHeight > 70) {
      const dir = progress < 0.5 ? -1 : 1; // rising vs falling trail
      for (let m = 0; m < 3; m++) {
        const sx = cx - rx * 0.55 + m * rx * 0.55;
        const sy = cy + dir * (ry + 10);
        pencilStroke(ctx, linePoints(sx, sy, sx, sy + dir * 14, 3),
          { passes: 1, jitter: 1.4, width: 1.0, alpha: 0.2, color: ink });
      }
    }

    // Ground line — a sketched horizon
    pencilStroke(ctx, linePoints(78, 460, 322, 460, 18),
      { passes: 2, jitter: 1.6, width: 1.3, alpha: 0.38, color: ink });

    // Frame number
    ctx.fillStyle = 'rgba(70,66,72,0.45)';
    ctx.font = '13px monospace';
    ctx.fillText(`${i + 1}`, 20, 520);

    frames.push(frameCanvas);
  }
}

// ---- Sources: the procedural basketball plus any scraped image sequences ----
const SOURCES = [{ id: 'basketball', label: 'basketball', type: 'procedural' }];
let currentSourceId = 'basketball';

// Discover image-sequence flipbooks listed in sequences/manifest.json
async function loadManifest() {
  try {
    const r = await fetch('sequences/manifest.json?ts=' + Date.now());
    if (!r.ok) return;
    const list = await r.json();
    for (const e of list) {
      if (!e || !e.id || SOURCES.some(s => s.id === e.id)) continue;
      SOURCES.push({
        id: e.id,
        label: e.label || e.id,
        type: 'sequence',
        count: e.count | 0,
        ext: e.ext || 'png',
        raw: !!e.raw,
      });
    }
  } catch (_) {
    /* no manifest yet — only the basketball is available */
  }
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error('failed to load ' + src));
    im.src = src;
  });
}

// Pre-stylized frames (oil pastel, watercolor, etc.) are used as-is — they
// already include the sketchbook paper and grid from the batch script.
function buildRawFrame(img) {
  const W = 400, H = 550;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0, W, H);
  return c;
}

// A short, confident pencil stroke (two soft passes with a slight bow). Jitter
// is deterministic (value-noise from a seed) so strokes are stable across frames
// — this is the same multi-pass look as the basketball's pencilStroke.
function inkStroke(g, x0, y0, x1, y1, width, alpha, seed) {
  const mx = (x0 + x1) / 2 + (vnoise(seed, 1.3) - 0.5) * 1.8;
  const my = (y0 + y1) / 2 + (vnoise(seed, 2.7) - 0.5) * 1.8;
  for (let k = 0; k < 2; k++) {
    const j = (vnoise(seed + k * 4.1, 5.0) - 0.5) * 1.1;
    g.beginPath();
    g.moveTo(x0 + j, y0 + j);
    g.quadraticCurveTo(mx + j * 0.5, my + j * 0.5, x1 + j, y1 + j);
    g.strokeStyle = `rgba(56,53,58,${alpha * (0.6 + 0.4 * vnoise(seed + k * 7.3, 9.0))})`;
    g.lineWidth = width * (0.65 + 0.6 * vnoise(seed + k * 2.9, 3.0));
    g.stroke();
  }
}

// One hatch stroke centred at (cx,cy), with occasional lifted/broken strokes.
function hatchAt(g, cx, cy, ang, len, alpha, seed) {
  if (vnoise(seed, 13.0) < 0.12) return;
  const hx = Math.cos(ang) * len * 0.5, hy = Math.sin(ang) * len * 0.5;
  inkStroke(g, cx - hx, cy - hy, cx + hx, cy + hy, 0.7 + 0.7 * vnoise(seed, 3.0), alpha, seed);
}

// A long, continuous pencil stroke through many points (two soft passes, with a
// little per-point wobble). Used for flowing contour and hatch lines so strokes
// connect into long marks instead of short, repetitive ticks.
function pencilPolyline(g, pts, width, alpha, seed) {
  if (pts.length < 2) return;
  for (let k = 0; k < 2; k++) {
    g.beginPath();
    for (let i = 0; i < pts.length; i++) {
      const jx = (vnoise(seed + i * 0.6 + k * 13, 1.0) - 0.5) * 1.3;
      const jy = (vnoise(seed + i * 0.6 + k * 13, 2.0) - 0.5) * 1.3;
      const x = pts[i][0] + jx, y = pts[i][1] + jy;
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.strokeStyle = `rgba(56,53,58,${alpha * (0.6 + 0.4 * vnoise(seed + k * 5, 9))})`;
    g.lineWidth = width * (0.7 + 0.5 * vnoise(seed + k * 3, 4));
    g.stroke();
  }
}

// Turn a photographic frame into a hand-drawn pencil line drawing over the
// sketchbook paper: confident contour strokes that follow the image edges plus
// layered hatching — the basketball's stroke aesthetic, with more line detail.
// `frameSeed` shifts all the stroke jitter per page, so every page looks
// individually drawn (the lines wobble frame-to-frame, like real hand-drawn
// animation) rather than being identical from frame to frame.
function buildSketchFrame(img, frameSeed = 0) {
  const FS = frameSeed * 131.7;          // per-page jitter offset (boiling lines)

  // "pencil strokes" detail (1..10): higher = finer tone + denser, more strokes.
  const dt01 = (Math.max(1, Math.min(10, detail)) - 1) / 9; // 0..1
  const DETAIL = 0.55 + dt01 * 0.45;     // tone resolution: 0.55 .. 1.0
  const CSEED  = 11 - dt01 * 7.5;        // contour seed spacing: sparse .. dense
  const HSEED  = 12 - dt01 * 8;          // hatch seed spacing: sparse .. dense
  const ETH    = 16 - dt01 * 7;          // edge sensitivity: coarse .. fine
  const CSKIP  = 0.6 - dt01 * 0.4;       // contour start gate: many skipped .. few

  const W = 400, H = 550;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  drawSketchPaper(g);

  // letterbox the frame to fit the page
  const scale = Math.min(W / img.width, H / img.height);
  const dw = Math.max(1, Math.round(img.width * scale));
  const dh = Math.max(1, Math.round(img.height * scale));
  const dx = Math.round((W - dw) / 2);
  const dy = Math.round((H - dh) / 2);

  // Tone is read at a resolution set by the detail level; strokes are drawn at
  // full resolution and stay crisp.
  const sw = Math.max(1, Math.round(dw * DETAIL));
  const sh = Math.max(1, Math.round(dh * DETAIL));

  const low = document.createElement('canvas');
  low.width = sw; low.height = sh;
  const lg = low.getContext('2d');
  lg.imageSmoothingEnabled = true;
  lg.drawImage(img, 0, 0, sw, sh);            // downscale to drop small detail

  const full = document.createElement('canvas');
  full.width = dw; full.height = dh;
  const fg = full.getContext('2d');
  fg.imageSmoothingEnabled = true;
  fg.drawImage(low, 0, 0, sw, sh, 0, 0, dw, dh); // smooth upscale = detail-limited tone
  const fdata = fg.getImageData(0, 0, dw, dh).data;

  const lum = new Float32Array(dw * dh);
  for (let p = 0, q = 0; p < fdata.length; p += 4, q++) {
    lum[q] = 0.299 * fdata[p] + 0.587 * fdata[p + 1] + 0.114 * fdata[p + 2];
  }

  const Lf = (x, y) => {
    const xi = x < 0 ? 0 : x >= dw ? dw - 1 : Math.floor(x);
    const yi = y < 0 ? 0 : y >= dh ? dh - 1 : Math.floor(y);
    return lum[yi * dw + xi]; // integer indices: a Float32Array returns undefined otherwise
  };

  // A second, FULL-resolution luminance buffer (no downscale) keeps the fine
  // detail the tone buffer throws away — eyes, nose, mouth, jawline, sharp edges
  // — so a crisp feature pass can draw them back in and the subject reads clearly.
  const hi = document.createElement('canvas');
  hi.width = dw; hi.height = dh;
  const hictx = hi.getContext('2d');
  hictx.imageSmoothingEnabled = true;
  hictx.drawImage(img, 0, 0, dw, dh);
  const hdata = hictx.getImageData(0, 0, dw, dh).data;
  const lumH = new Float32Array(dw * dh);
  for (let p = 0, q = 0; p < hdata.length; p += 4, q++) {
    lumH[q] = 0.299 * hdata[p] + 0.587 * hdata[p + 1] + 0.114 * hdata[p + 2];
  }

  // Local-contrast (unsharp) enhancement: subtract a heavily blurred copy so
  // low-contrast detail inside dark regions — eyes, nose, mouth, beard — is
  // exaggerated instead of flattening into one black mass. The strong version
  // drives the crisp feature edges; a milder version nudges the hatch density,
  // so the face's structure shows up in BOTH the shading and the linework.
  const bw = Math.max(2, Math.round(dw / 18)), bh = Math.max(2, Math.round(dh / 18));
  const bc = document.createElement('canvas');
  bc.width = bw; bc.height = bh;
  const bctx = bc.getContext('2d');
  bctx.imageSmoothingEnabled = true;
  bctx.drawImage(img, 0, 0, bw, bh);
  const bdata = bctx.getImageData(0, 0, bw, bh).data;
  const blurLum = new Float32Array(bw * bh);
  for (let p = 0, q = 0; p < bdata.length; p += 4, q++) {
    blurLum[q] = 0.299 * bdata[p] + 0.587 * bdata[p + 1] + 0.114 * bdata[p + 2];
  }
  const blurAt = (x, y) => {
    const bx = x < 0 ? 0 : x >= dw ? bw - 1 : Math.floor((x / dw) * bw);
    const by = y < 0 ? 0 : y >= dh ? bh - 1 : Math.floor((y / dh) * bh);
    return blurLum[by * bw + bx];
  };
  for (let yy = 0, q = 0; yy < dh; yy++) {
    for (let xx = 0; xx < dw; xx++, q++) {
      const b = blurAt(xx, yy);
      const eh = lumH[q] + 1.15 * (lumH[q] - b); // strong: crisp feature edges
      lumH[q] = eh < 0 ? 0 : eh > 255 ? 255 : eh;
      const et = lum[q] + 0.55 * (lum[q] - b);   // mild: nudges hatch density
      lum[q] = et < 0 ? 0 : et > 255 ? 255 : et;
    }
  }

  const LfH = (x, y) => {
    const xi = x < 0 ? 0 : x >= dw ? dw - 1 : Math.floor(x);
    const yi = y < 0 ? 0 : y >= dh ? dh - 1 : Math.floor(y);
    return lumH[yi * dw + xi];
  };
  const gradH = (x, y) => {
    const gx = (LfH(x + 1, y - 1) + 2 * LfH(x + 1, y) + LfH(x + 1, y + 1))
             - (LfH(x - 1, y - 1) + 2 * LfH(x - 1, y) + LfH(x - 1, y + 1));
    const gy = (LfH(x - 1, y + 1) + 2 * LfH(x, y + 1) + LfH(x + 1, y + 1))
             - (LfH(x - 1, y - 1) + 2 * LfH(x, y - 1) + LfH(x + 1, y - 1));
    return [gx / 8, gy / 8];
  };

  // Direct photographic reference: a soft grayscale ghost of the ACTUAL frame,
  // composited with 'multiply' so it only deepens where the photo is dark and
  // leaves the paper/grid untouched in the lights. This grounds the drawing in
  // the real image — faces and fine detail read clearly — while the pencil
  // strokes still carry the bulk of the look on top. Not everything is a stroke.
  const REF = 0.42;            // strength of the photographic reference
  const refC = document.createElement('canvas');
  refC.width = dw; refC.height = dh;
  const rctx = refC.getContext('2d');
  const refData = rctx.createImageData(dw, dh);
  const rpx = refData.data;
  for (let i = 0, q = 0; q < dw * dh; i += 4, q++) {
    let L = 0.299 * hdata[i] + 0.587 * hdata[i + 1] + 0.114 * hdata[i + 2];
    L = 255 * Math.pow(L / 255, 0.85); // lift slightly so the multiply stays gentle
    rpx[i] = rpx[i + 1] = rpx[i + 2] = L;
    rpx[i + 3] = 255;
  }
  rctx.putImageData(refData, 0, 0);
  g.save();
  g.globalCompositeOperation = 'multiply';
  g.globalAlpha = REF;
  g.drawImage(refC, dx, dy);
  g.restore();

  // Draw the line drawing in page space, on top of the reference.
  g.save();
  g.translate(dx, dy);
  g.lineCap = 'round';
  g.lineJoin = 'round';

  // Local gradient of the tone, used to follow edges.
  const grad = (x, y) => {
    const gx = (Lf(x + 1, y - 1) + 2 * Lf(x + 1, y) + Lf(x + 1, y + 1))
             - (Lf(x - 1, y - 1) + 2 * Lf(x - 1, y) + Lf(x - 1, y + 1));
    const gy = (Lf(x - 1, y + 1) + 2 * Lf(x, y + 1) + Lf(x + 1, y + 1))
             - (Lf(x - 1, y - 1) + 2 * Lf(x, y - 1) + Lf(x + 1, y - 1));
    return [gx / 8, gy / 8];
  };

  // 1) Contour lines: long pencil strokes that ride ALONG the edges. Each is
  //    seeded from a scattered point and walks the contour (re-steering by the
  //    gradient) for a randomized length, so the marks are long and flowing,
  //    not a field of short repetitive ticks.
  for (let gy = 0; gy < dh; gy += CSEED) {
    for (let gx0 = 0; gx0 < dw; gx0 += CSEED) {
      const seed = gx0 * 0.217 + gy * 0.149 + FS + 91;
      if (vnoise(seed, 31) < CSKIP) continue;           // detail sets how sparse the starts are
      const sx = gx0 + (vnoise(seed, 1) - 0.5) * CSEED * 1.5;
      const sy = gy + (vnoise(seed, 2) - 0.5) * CSEED * 1.5;
      const [gX, gY] = grad(sx, sy);
      const m0 = Math.hypot(gX, gY);
      if (m0 <= ETH) continue;
      const maxSteps = 8 + Math.floor(vnoise(seed, 17) * 30); // very varied length
      const step = 2.2;
      const trace = (sign) => {
        const pts = [];
        let x = sx, y = sy;
        let tx = -gY, ty = gX; const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
        for (let s = 0; s < maxSteps; s++) {
          x += sign * tx * step; y += sign * ty * step;
          if (x < 1 || x >= dw - 1 || y < 1 || y >= dh - 1) break;
          const [ngx, ngy] = grad(x, y);
          if (Math.hypot(ngx, ngy) <= ETH * 0.7) break;
          let nx = -ngy, ny = ngx; const nl = Math.hypot(nx, ny) || 1; nx /= nl; ny /= nl;
          if (nx * tx + ny * ty < 0) { nx = -nx; ny = -ny; } // keep a consistent heading
          tx = nx; ty = ny;
          pts.push([x, y]);
        }
        return pts;
      };
      const pts = trace(-1).reverse();
      pts.push([sx, sy]);
      for (const p of trace(1)) pts.push(p);
      if (pts.length < 3) continue;
      const strength = Math.min(1, (m0 - ETH) / 55);
      pencilPolyline(g, pts, 0.7 + 1.5 * strength, Math.min(1, 0.45 + 0.6 * strength), seed);
    }
  }

  // 2) Tonal hatching — the image is reconstructed ENTIRELY from line density.
  //    Each pass lays strokes wherever the picture is at least `thresh` dark, at
  //    its own angle. Light mid-tones receive only the first, airy pass; darker
  //    values pick up successive passes (cross-hatched), so tone builds up from
  //    accumulated pencil lines exactly the way a real graphite drawing shades.
  // A pass lays parallel strokes whose *density* tracks the local darkness: in
  // each cell the chance of drawing a stroke is proportional to how much darker
  // the picture is than `thresh`, so lighter values stay open (few lines) and
  // darker values fill in. Stacking passes at rising thresholds + crossed
  // angles cross-hatches the shadows. `cover` scales how readily a pass fills.
  const hatchPass = (thresh, angleAdd, seedOff, press, cover) => {
    for (let gy = 0; gy < dh; gy += HSEED) {
      for (let gx0 = 0; gx0 < dw; gx0 += HSEED) {
        const seed = gx0 * 0.123 + gy * 0.371 + FS + seedOff;
        const sx = gx0 + (vnoise(seed, 1) - 0.5) * HSEED * 1.7;
        const sy = gy + (vnoise(seed, 2) - 0.5) * HSEED * 1.7;
        // contrast-boosted value: lifts lights toward paper while keeping
        // gradation deep in the shadows (upper edge near 1) so a dark face keeps
        // internal tonal variation instead of collapsing to a flat black mass.
        const dd = smoothstep(0.05, 0.92, 1 - Lf(sx, sy) / 255);
        if (dd <= thresh) continue;
        // density ∝ darkness: probabilistic gate so tone comes from line spacing
        const p = (dd - thresh) / (1 - thresh);
        if (vnoise(seed, 23) > p * cover) continue;

        // Direction: follow the form where there's structure, drift through a
        // slowly rotating field in flat areas; angleAdd sets this pass's grain.
        const [hgx, hgy] = grad(sx, sy);
        let ang;
        if (Math.hypot(hgx, hgy) > 9) {
          ang = Math.atan2(hgy, hgx) + Math.PI / 2;
        } else {
          ang = vnoise(sx * 0.011, sy * 0.011) * Math.PI * 2;
        }
        ang += angleAdd + (vnoise(seed, 11) - 0.5) * 0.6;
        const dirx = Math.cos(ang), diry = Math.sin(ang);
        const maxSteps = 4 + Math.floor(dd * 22); // darker -> longer marks fill the mass
        const step = 2.4;
        const pts = [[sx, sy]];
        let x = sx, y = sy;
        for (let s = 0; s < maxSteps; s++) {
          x += dirx * step + (vnoise(x * 0.09, y * 0.09 + seed) - 0.5) * 1.2;
          y += diry * step + (vnoise(x * 0.09 + 4, y * 0.09 + seed) - 0.5) * 1.2;
          if (x < 0 || x >= dw || y < 0 || y >= dh) break;
          if (1 - Lf(x, y) / 255 < 0.14) break; // stay inside the darker region
          pts.push([x, y]);
        }
        if (pts.length < 2) continue;
        pencilPolyline(g, pts, 0.6 + 0.6 * vnoise(seed, 3), press, seed);
      }
    }
  };

  // Layered build-up: low thresholds sketch the whole picture; higher ones only
  // re-darken the shadows, each from a crossed angle. Opacity rises per layer so
  // mid-tones read as light hatching while shadow cores build toward solid black.
  hatchPass(0.06,  0.0,           0,   0.22, 1.5);  // base value across the image
  hatchPass(0.30,  Math.PI / 2,   53,  0.24, 1.7);  // second grain in the mid-darks
  hatchPass(0.52,  Math.PI / 4,   131, 0.32, 1.9);  // deepen the shadows
  hatchPass(0.70, -Math.PI / 4,   219, 0.42, 2.2);  // darkest cores

  // 3) Feature lines: crisp, fine contours pulled from the FULL-resolution image.
  //    These ride the strong high-frequency edges the blurred tone buffer misses
  //    (facial features, hairline, jaw, outlines) and are drawn sharply ON TOP of
  //    the hatching so the subject — LeBron's face — reads like the real frame.
  const FSEED = 3;
  const FETH = 26 - dt01 * 13;                       // detail lets finer features through
  for (let gy = 0; gy < dh; gy += FSEED) {
    for (let gx0 = 0; gx0 < dw; gx0 += FSEED) {
      const seed = gx0 * 0.331 + gy * 0.207 + FS + 311;
      const sx = gx0 + (vnoise(seed, 1) - 0.5) * FSEED;
      const sy = gy + (vnoise(seed, 2) - 0.5) * FSEED;
      const [gX, gY] = gradH(sx, sy);
      const m0 = Math.hypot(gX, gY);
      if (m0 <= FETH) continue;
      const maxSteps = 4 + Math.floor(vnoise(seed, 17) * 12);
      const step = 1.5;
      const trace = (sign) => {
        const pts = [];
        let x = sx, y = sy;
        let tx = -gY, ty = gX; const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
        for (let s = 0; s < maxSteps; s++) {
          x += sign * tx * step; y += sign * ty * step;
          if (x < 1 || x >= dw - 1 || y < 1 || y >= dh - 1) break;
          const [ngx, ngy] = gradH(x, y);
          if (Math.hypot(ngx, ngy) <= FETH * 0.7) break;   // stop where the edge fades
          let nx = -ngy, ny = ngx; const nl = Math.hypot(nx, ny) || 1; nx /= nl; ny /= nl;
          if (nx * tx + ny * ty < 0) { nx = -nx; ny = -ny; }
          tx = nx; ty = ny;
          pts.push([x, y]);
        }
        return pts;
      };
      const pts = trace(-1).reverse();
      pts.push([sx, sy]);
      for (const p of trace(1)) pts.push(p);
      if (pts.length < 3) continue;
      const strength = Math.min(1, (m0 - FETH) / 70);
      pencilPolyline(g, pts, 0.5 + 0.7 * strength, Math.min(0.85, 0.32 + 0.6 * strength), seed);
    }
  }

  g.restore();
  return c;
}

function showLoading() {
  ctx.fillStyle = '#fbf9f4';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.font = "14px 'Inter', sans-serif";
  ctx.textAlign = 'center';
  ctx.fillText('loading…', canvas.width / 2, canvas.height / 2);
  ctx.textAlign = 'start';
}

// Build frames[] for the chosen source, then reset playback state
async function loadSource(id) {
  const src = SOURCES.find(s => s.id === id) || SOURCES[0];
  currentSourceId = src.id;

  if (src.type === 'sequence') {
    showLoading();
    const built = [];
    const imgs = [];
    for (let i = 1; i <= src.count; i++) {
      const n = String(i).padStart(3, '0');
      try {
        const img = await loadImage(`sequences/${src.id}/frame_${n}.${src.ext}`);
        imgs.push(img);
        built.push(src.raw ? buildRawFrame(img) : buildSketchFrame(img, i));
      } catch (_) {
        /* skip missing frames */
      }
    }
    if (built.length > 0) {
      frames = built;
      // cache images so the detail slider can rebuild without re-fetching
      currentSeq = src.raw ? null : { images: imgs };
    } else {
      generateFrames(); // fall back to the basketball if nothing loaded
      currentSourceId = 'basketball';
      currentSeq = null;
    }
  } else {
    generateFrames();
    currentSeq = null;
  }

  totalFrames = frames.length;
  currentFrame = 0;
  flipProgress = 0;
  isFlipping = false;
  lastAnimationTime = 0;
  updateFrameDisplay();
  drawNotebook();
}

// Layout helpers — the spine is the page's LEFT edge; the page lies to the
// right of it, and turned pages stack to the left of it.
const PAGE_ASPECT = 400 / 550; // source frame proportions
function getLayout() {
  // the open book spans two page widths around a centred spine, so size the
  // page to fit both half the width and the height, then centre the spine
  const margin = 40;
  let pageHeight = Math.min(550, canvas.height - 90);
  let pageWidth = pageHeight * PAGE_ASPECT;
  const maxWidth = canvas.width / 2 - margin;
  if (pageWidth > maxWidth) {
    pageWidth = maxWidth;
    pageHeight = pageWidth / PAGE_ASPECT;
  }
  pageWidth = Math.round(pageWidth);
  pageHeight = Math.round(pageHeight);
  const spineX = Math.round(canvas.width / 2);
  const pageY = Math.round((canvas.height - pageHeight) / 2);
  return { pageWidth, pageHeight, spineX, pageY };
}

// The notebook's back board, so the open book reads balanced around the
// centred spine even before many pages have been turned.
function drawCoverBoard(x, y, w, h) {
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.14)';
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 6;
  ctx.fillStyle = '#ede9df';
  ctx.fillRect(x, y, w, h);
  ctx.restore();
  drawPaperGrid(ctx, x, y, w, h);
  ctx.strokeStyle = 'rgba(0,0,0,0.07)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, w, h);
}

// A short stack of pages, fanned by a couple of px, to give the book thickness.
function drawStack(x, y, w, h, count, dir) {
  for (let i = count - 1; i >= 0; i--) {
    const o = (i + 1) * 1.6;
    ctx.fillStyle = i % 2 ? '#f7f6f0' : '#f1efe7';
    ctx.fillRect(x + dir * o, y + o, w, h);
    // the topmost page of the stack is visible, so it gets the notebook grid
    if (i === 0) drawPaperGrid(ctx, x + dir * o, y + o, w, h);
    ctx.strokeStyle = 'rgba(0,0,0,0.06)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + dir * o, y + o, w, h);
  }
}

// Soft shadow in the gutter, where a page meets the binding.
function drawGutterShadow(spineX, y, h, dir) {
  const g = ctx.createLinearGradient(spineX, 0, spineX + dir * 46, 0);
  g.addColorStop(0, 'rgba(0,0,0,0.20)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(dir > 0 ? spineX : spineX - 46, y, 46, h);
}

// A flat page resting on the stack, with a gentle paper sheen + gutter shadow.
function drawRestingPage(img, spineX, y, w, h) {
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.16)';
  ctx.shadowBlur = 22;
  ctx.shadowOffsetX = 4;
  ctx.shadowOffsetY = 8;
  ctx.fillStyle = PAGE_FRONT;
  ctx.fillRect(spineX, y, w, h);
  ctx.restore();

  ctx.drawImage(img, spineX, y, w, h);

  // vertical sheen across the sheet
  const sheen = ctx.createLinearGradient(spineX, 0, spineX + w, 0);
  sheen.addColorStop(0,    'rgba(0,0,0,0.05)');
  sheen.addColorStop(0.12, 'rgba(255,255,255,0.05)');
  sheen.addColorStop(0.5,  'rgba(255,255,255,0)');
  sheen.addColorStop(1,    'rgba(0,0,0,0.04)');
  ctx.fillStyle = sheen;
  ctx.fillRect(spineX, y, w, h);

  drawGutterShadow(spineX, y, h, 1);

  ctx.strokeStyle = 'rgba(0,0,0,0.10)';
  ctx.lineWidth = 1;
  ctx.strokeRect(spineX, y, w, h);
}

// The metal twin-loop coil, drawn over the spine so the rings sit on top of
// the paper. Each loop is a slanted chrome ring with a punched hole, a drop
// shadow on the page, and a specular glint.
function drawSpiral(spineX, y, h) {
  // small, tightly-packed loops like a real flipbook coil
  const rings = Math.max(16, Math.round(h / 13));
  const step = h / rings;
  const rx = 7.5;
  const ry = step * 0.62; // loops nearly touch, so the coil reads as a spiral

  ctx.lineCap = 'round';
  for (let i = 0; i < rings; i++) {
    const cy = y + step * (i + 0.5);

    // small punched holes just inside each page edge
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath();
    ctx.ellipse(spineX + 7, cy, 1.4, 2.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(spineX - 7, cy, 1.4, 2.4, 0, 0, Math.PI * 2);
    ctx.fill();

    // soft shadow the wire casts on the paper
    ctx.strokeStyle = 'rgba(0,0,0,0.14)';
    ctx.lineWidth = 3.0;
    ctx.beginPath();
    ctx.ellipse(spineX + 1, cy + 1.6, rx, ry, -0.42, 0, Math.PI * 2);
    ctx.stroke();

    // chrome wire: bright top-left to dark bottom-right
    const metal = ctx.createLinearGradient(spineX - rx, cy - ry, spineX + rx, cy + ry);
    metal.addColorStop(0.0,  '#fcfcfd');
    metal.addColorStop(0.30, '#c8cbd1');
    metal.addColorStop(0.58, '#94989f');
    metal.addColorStop(0.80, '#71747c');
    metal.addColorStop(1.0,  '#a3a7af');
    ctx.strokeStyle = metal;
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.ellipse(spineX, cy, rx, ry, -0.42, 0, Math.PI * 2);
    ctx.stroke();

    // specular glint on the upper-left of the loop
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.ellipse(spineX, cy, rx, ry, -0.42, Math.PI * 1.02, Math.PI * 1.5);
    ctx.stroke();
  }
  ctx.lineCap = 'butt';
}

// Draw the flipbook as a flat 2D spiral notebook.
function drawNotebook() {
  ctx.fillStyle = '#fbf9f4';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (frames.length === 0) return;

  const { pageWidth, pageHeight, spineX, pageY } = getLayout();
  const remaining = totalFrames - currentFrame - 1;

  // back board fills the left half so the open book stays balanced
  drawCoverBoard(spineX - pageWidth, pageY, pageWidth, pageHeight);

  // book thickness: turned pages to the left, unturned to the right
  if (currentFrame > 0) {
    drawStack(spineX - pageWidth, pageY, pageWidth, pageHeight, Math.min(currentFrame, 5), -1);
  }
  if (remaining > 0) {
    drawStack(spineX, pageY, pageWidth, pageHeight, Math.min(remaining, 5), 1);
  }

  // gutter shadow where the turned pages meet the binding
  drawGutterShadow(spineX, pageY, pageHeight, -1);

  if (!isFlipping) {
    drawRestingPage(frames[currentFrame], spineX, pageY, pageWidth, pageHeight);
  } else {
    // the next page is revealed underneath as the current page lifts away
    const nextFrame = (currentFrame + 1) % totalFrames;
    drawRestingPage(frames[nextFrame], spineX, pageY, pageWidth, pageHeight);

    drawFlippingPage(frames[currentFrame], spineX, pageY, pageWidth, pageHeight, flipProgress);
  }

  drawSpiral(spineX, pageY, pageHeight);
}

// Draw the turning page as a sheet that pivots about the spine and curls.
// `u` runs 0..width from the spine to the free edge; the sheet's local angle
// is a(u) = swing + bend * (u/width): `swing` rotates the whole page from
// lying right (0) to lying left (π), while `bend` adds a curl that peaks
// mid-turn so the free edge lifts first and settles last.
function drawFlippingPage(img, spineX, pageY, width, height, progress) {
  // gravity-driven swing with a soft landing; the curl is strongest early
  // (page peeled and bowing) and relaxes as the sheet flattens onto the stack
  const swing = Math.PI * flipSwing(progress);
  const bend  = Math.sin(Math.PI * progress) * (1.05 - 0.45 * progress);

  const segments = 64;
  const ds = width / segments;

  // first pass: integrate the page shape into screen-space slices
  const slices = [];
  let X = spineX, Z = 0;
  let minLeft = Infinity, maxRight = -Infinity;
  for (let i = 0; i < segments; i++) {
    const uMid = (i + 0.5) * ds;
    const a = swing + bend * (uMid / width);
    const ca = Math.cos(a), sa = Math.sin(a);
    const nx = X + ca * ds;
    const zMid = Z + sa * ds * 0.5;

    // foreshorten vertically as the sheet stands up (it tilts away from view),
    // returning to full height as it lays flat — reads as a real 3D turn
    const scaleY = 1 - 0.075 * Math.abs(sa);
    const drawH = height * scaleY;
    const topY = pageY - (drawH - height) / 2;
    const left = Math.min(X, nx);
    const sliceW = Math.abs(ca * ds) + 0.7; // overlap hides seams

    slices.push({ left, topY, sliceW, drawH, a, ca, srcX: i * ds, srcW: ds });

    minLeft = Math.min(minLeft, left);
    maxRight = Math.max(maxRight, left + sliceW);
    X = nx; Z += sa * ds;
  }

  // contact shadow the lifting page drops on the spread below: nil while flat,
  // swelling as it lifts to vertical, then fading back to nil as it lays down —
  // zero at both ends so consecutive flips transition smoothly with no pop
  const cast = Math.sin(progress * Math.PI); // 0 -> 1 -> 0 across the flip
  if (cast > 0.01) {
    ctx.save();
    ctx.fillStyle = `rgba(0,0,0,${0.26 * cast})`;
    ctx.shadowColor = `rgba(0,0,0,${0.3 * cast})`;
    ctx.shadowBlur = 24;
    ctx.shadowOffsetY = 12;
    ctx.fillRect(minLeft + 6, pageY + 6, Math.max(1, maxRight - minLeft - 12), height);
    ctx.restore();
  }

  // second pass: paint each slice. Front shows the drawing; the back is the
  // reverse of the sheet, so it shows the blank grid paper (lined both sides).
  const backPage = getGridPage();
  for (const s of slices) {
    const front = s.ca >= 0;

    if (front) {
      ctx.drawImage(img, s.srcX, 0, s.srcW, height, s.left, s.topY, s.sliceW, s.drawH);
    } else {
      ctx.drawImage(backPage, s.srcX, 0, s.srcW, height, s.left, s.topY, s.sliceW, s.drawH);
    }

    // shade by tilt: just a gentle shadow as the sheet stands up, so the back
    // still reads clearly as lined grid paper (a regular sheet) through the turn
    // rather than being darkened into a grey slab
    const shade = front ? 0.84 + 0.16 * s.ca : 0.74 + 0.24 * (-s.ca);
    ctx.fillStyle = `rgba(28,26,20,${Math.max(0, 1 - shade)})`;
    ctx.fillRect(s.left, s.topY, s.sliceW, s.drawH);

    // bright glint along the fold as it passes vertical
    const fold = Math.exp(-Math.pow(s.a - Math.PI / 2, 2) / 0.02);
    if (fold > 0.01) {
      ctx.fillStyle = `rgba(255,255,255,${0.45 * fold})`;
      ctx.fillRect(s.left, s.topY, s.sliceW, s.drawH);
    }
  }

  // crisp leading edge so the page reads as a solid sheet with thickness
  const edge = slices[slices.length - 1];
  ctx.strokeStyle = 'rgba(0,0,0,0.18)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(edge.left + (edge.ca >= 0 ? edge.sliceW : 0), edge.topY);
  ctx.lineTo(edge.left + (edge.ca >= 0 ? edge.sliceW : 0), edge.topY + edge.drawH);
  ctx.stroke();
}

// Animation loop
function animate(timestamp) {
  const renderInterval = 1000 / renderFps;
  const flipDuration = Math.max(70, 1000 / animationSpeed); // ms per page turn

  const dt = lastFrameT ? timestamp - lastFrameT : 0;
  lastFrameT = timestamp;

  // Continuous flipping: the turn phase accumulates and rolls straight from one
  // page into the next (wrapping 1 -> 0), so there is no rest beat and nothing
  // resets between flips — the whole riffle reads as one smooth motion.
  if (isPlaying) {
    isFlipping = true;
    flipProgress += dt / flipDuration;
    while (flipProgress >= 1) {
      flipProgress -= 1;
      currentFrame = (currentFrame + 1) % totalFrames;
      updateFrameDisplay();
    }
  }

  // Render
  if (timestamp - lastRenderTime >= renderInterval) {
    drawNotebook();
    lastRenderTime = timestamp;
  }

  requestAnimationFrame(animate);
}

// Update frame display
function updateFrameDisplay() {
  document.getElementById('frame-val').textContent = `${currentFrame + 1} / ${totalFrames}`;
}

// UI Controls
const sourceSelect = document.getElementById('source');
const detailSlider = document.getElementById('detail');
const detailVal = document.getElementById('detail-val');
const speedSlider = document.getElementById('speed');
const speedVal = document.getElementById('speed-val');
const renderFpsSlider = document.getElementById('renderFps');
const renderFpsVal = document.getElementById('renderFps-val');
const playPauseBtn = document.getElementById('playPause');
const resetBtn = document.getElementById('reset');

// Rebuild the current sketch sequence's frames at the new detail level. Debounced
// so dragging the slider doesn't rebuild 100+ frames on every tick.
let detailRebuildTimer = null;
function scheduleDetailRebuild() {
  if (!currentSeq || !currentSeq.images) return; // only sketch sequences use detail
  clearTimeout(detailRebuildTimer);
  detailRebuildTimer = setTimeout(() => {
    showLoading();
    frames = currentSeq.images.map((img, i) => buildSketchFrame(img, i + 1));
    totalFrames = frames.length;
    if (currentFrame >= totalFrames) currentFrame = 0;
    drawNotebook();
  }, 200);
}

function populateSources() {
  if (!sourceSelect) return;
  sourceSelect.innerHTML = '';
  for (const s of SOURCES) {
    const o = document.createElement('option');
    o.value = s.id;
    o.textContent = s.label;
    sourceSelect.appendChild(o);
  }
  sourceSelect.value = currentSourceId;
}

sourceSelect?.addEventListener('change', (e) => {
  loadSource(e.target.value);
});

detailSlider?.addEventListener('input', (e) => {
  detail = parseInt(e.target.value, 10);
  if (detailVal) detailVal.textContent = String(detail);
  scheduleDetailRebuild();
});

speedSlider.addEventListener('input', (e) => {
  animationSpeed = parseFloat(e.target.value);
  speedVal.textContent = `${animationSpeed} fps`;
});

renderFpsSlider.addEventListener('input', (e) => {
  renderFps = parseFloat(e.target.value);
  renderFpsVal.textContent = `${renderFps} fps`;
});

playPauseBtn.addEventListener('click', () => {
  isPlaying = !isPlaying;
  playPauseBtn.textContent = isPlaying ? 'pause' : 'play';
  playPauseBtn.classList.toggle('active', isPlaying);
});

resetBtn.addEventListener('click', () => {
  currentFrame = 0;
  isFlipping = false;
  flipProgress = 0;
  lastAnimationTime = 0;
  updateFrameDisplay();
  drawNotebook();
});

// Initialize
async function init() {
  await loadManifest();
  populateSources();
  await loadSource(currentSourceId);
  requestAnimationFrame(animate);
}
init();
