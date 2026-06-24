// 2D Flipbook with Realistic Page Curl
// Flat top-down view like a real notebook

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

// Settings
let animationSpeed = 8;
let renderFps = 60;
let isPlaying = true;
let currentFrame = 0;
const totalFrames = 12;

// Timing
let lastAnimationTime = 0;
let lastRenderTime = 0;
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

// Generate basketball bouncing frames
function generateFrames() {
  frames = [];

  for (let i = 0; i < totalFrames; i++) {
    const frameCanvas = document.createElement('canvas');
    const ctx = frameCanvas.getContext('2d');

    frameCanvas.width = 400;
    frameCanvas.height = 550;

    // Warm sketchbook paper with a little grain
    ctx.fillStyle = '#faf8f1';
    ctx.fillRect(0, 0, 400, 550);

    ctx.fillStyle = 'rgba(70, 64, 50, 0.015)';
    for (let t = 0; t < 1100; t++) {
      const tx = Math.random() * 400;
      const ty = Math.random() * 550;
      ctx.fillRect(tx, ty, 1, 1);
    }

    const progress = i / (totalFrames - 1);
    const bounceHeight = Math.abs(Math.sin(progress * Math.PI)) * 180;
    const ballY = 420 - bounceHeight;
    const ballX = 200;

    const squash = bounceHeight < 25 ? 0.85 : 1.0;
    const radiusX = 40 * (1 / squash);
    const radiusY = 40 * squash;

    // Draw basketball — a loose pencil sketch on the sketchbook page
    const cx = ballX, cy = ballY, rx = radiusX, ry = radiusY;
    const ink = '58,55,60'; // graphite

    // faint colour wash so it still reads as a basketball, not flat orange
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(214,120,52,0.13)';
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
  ctx.fillStyle = '#e7e3d9';
  ctx.fillRect(x, y, w, h);
  ctx.restore();
  ctx.strokeStyle = 'rgba(0,0,0,0.07)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, w, h);
}

// A short stack of pages, fanned by a couple of px, to give the book thickness.
function drawStack(x, y, w, h, count, dir) {
  for (let i = count - 1; i >= 0; i--) {
    const o = (i + 1) * 1.6;
    ctx.fillStyle = i % 2 ? '#f4f2ec' : '#efece4';
    ctx.fillRect(x + dir * o, y + o, w, h);
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
  const rings = Math.max(8, Math.round(h / 24));
  const step = h / rings;
  const rx = 14;
  const ry = step * 0.44;

  for (let i = 0; i < rings; i++) {
    const cy = y + step * (i + 0.5);

    // punched holes just inside each page edge
    ctx.fillStyle = 'rgba(0,0,0,0.20)';
    ctx.beginPath();
    ctx.ellipse(spineX + 12, cy, 2.4, 4.0, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(spineX - 12, cy, 2.4, 4.0, 0, 0, Math.PI * 2);
    ctx.fill();

    // soft shadow the wire casts on the paper
    ctx.strokeStyle = 'rgba(0,0,0,0.16)';
    ctx.lineWidth = 5.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.ellipse(spineX + 1.5, cy + 2.5, rx, ry, -0.4, 0, Math.PI * 2);
    ctx.stroke();

    // chrome wire: bright top-left to dark bottom-right
    const metal = ctx.createLinearGradient(spineX - rx, cy - ry, spineX + rx, cy + ry);
    metal.addColorStop(0.0,  '#fdfdfe');
    metal.addColorStop(0.28, '#c8cbd1');
    metal.addColorStop(0.55, '#92969e');
    metal.addColorStop(0.78, '#6e717a');
    metal.addColorStop(1.0,  '#a6aab2');
    ctx.strokeStyle = metal;
    ctx.lineWidth = 4.5;
    ctx.beginPath();
    ctx.ellipse(spineX, cy, rx, ry, -0.4, 0, Math.PI * 2);
    ctx.stroke();

    // specular glint on the upper-left of the loop
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.ellipse(spineX, cy, rx, ry, -0.4, Math.PI * 1.02, Math.PI * 1.52);
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

  // contact shadow the lifting page drops on the spread below: darkest at the
  // start of the turn (page still close to the surface) and fading to light as
  // the page rises and swings away
  const cast = Math.cos(progress * Math.PI * 0.5); // 1 -> 0 across the flip
  if (cast > 0.01) {
    ctx.save();
    ctx.fillStyle = `rgba(0,0,0,${0.26 * cast})`;
    ctx.shadowColor = `rgba(0,0,0,${0.3 * cast})`;
    ctx.shadowBlur = 24;
    ctx.shadowOffsetY = 12;
    ctx.fillRect(minLeft + 6, pageY + 6, Math.max(1, maxRight - minLeft - 12), height);
    ctx.restore();
  }

  // second pass: paint each slice, front shows the print, back shows paper
  for (const s of slices) {
    const front = s.ca >= 0;

    if (front) {
      ctx.drawImage(img, s.srcX, 0, s.srcW, height, s.left, s.topY, s.sliceW, s.drawH);
    } else {
      ctx.fillStyle = PAGE_BACK;
      ctx.fillRect(s.left, s.topY, s.sliceW, s.drawH);
    }

    // shade by tilt: the front darkens as it stands up; the back of the page
    // starts dark in shadow when vertical and brightens as it lays flat on the
    // far side (dark -> light through the turn)
    const shade = front ? 0.80 + 0.20 * s.ca : 0.42 + 0.50 * (-s.ca);
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
  const animationInterval = 1000 / animationSpeed;
  const renderInterval = 1000 / renderFps;

  // Trigger page flip — the turn takes most of the interval, leaving a brief
  // beat where the page rests so the frame reads before the next turn
  if (isPlaying && !isFlipping && timestamp - lastAnimationTime >= animationInterval) {
    isFlipping = true;
    flipStartTime = timestamp;
    flipProgress = 0;
    // the turn fills almost the whole interval so pages flow continuously,
    // like riffling a real flipbook, with only a sliver of rest between turns
    flipDuration = Math.max(70, animationInterval * 0.92);
    lastAnimationTime = timestamp;
  }

  // Update flip animation
  if (isFlipping) {
    const elapsed = timestamp - flipStartTime;
    flipProgress = Math.min(elapsed / flipDuration, 1);

    if (flipProgress >= 1) {
      isFlipping = false;
      currentFrame = (currentFrame + 1) % totalFrames;
      flipProgress = 0;
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
const speedSlider = document.getElementById('speed');
const speedVal = document.getElementById('speed-val');
const renderFpsSlider = document.getElementById('renderFps');
const renderFpsVal = document.getElementById('renderFps-val');
const playPauseBtn = document.getElementById('playPause');
const resetBtn = document.getElementById('reset');

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
generateFrames();
updateFrameDisplay();
requestAnimationFrame(animate);
