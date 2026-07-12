// Part catalog: pin layouts, top-down SVG art, and sim model tags.
// Board parts use pitch-unit pin offsets from the anchor pin (0,0) and snap to
// holes. Free parts live off-board and expose snappable "ports" for wires.

import { P, E, HOLE_BY_ID } from './board.js?v=3';

// ---- shared art helpers -----------------------------------------------------

function lead(g, x1, y1, x2, y2, w = 1.6) {
  E('line', { x1, y1, x2, y2, stroke: '#b6bac0', 'stroke-width': w, 'stroke-linecap': 'butt' }, g);
  E('line', { x1, y1, x2, y2, stroke: 'rgba(255,255,255,0.35)', 'stroke-width': Math.max(0.5, w * 0.28), 'stroke-linecap': 'butt' }, g);
}
function txt(g, x, y, s, size = 6, fill = '#e8e6e0', anchor = 'middle', weight = 400) {
  return E('text', {
    x, y, text: s, fill, 'font-size': size, 'font-weight': weight,
    'text-anchor': anchor, 'font-family': 'Inter, sans-serif', 'pointer-events': 'none',
  }, g);
}

// resistor color bands from value (4- or 5-band)
const BANDC = ['#141414', '#7b4a12', '#c62828', '#ef6c00', '#f2c832', '#2e7d32', '#1565c0', '#7b1fa2', '#9e9e9e', '#fafafa'];
export function resistorBands(v) {
  if (v <= 0) return ['#141414'];
  let e = 0, m = v;
  while (m >= 100 && Number.isInteger(m / 10)) { m /= 10; e++; }
  if (m < 100 && Number.isInteger(m)) {
    // 2 significant digits
    if (m < 10) { m *= 10; e--; }
    return [BANDC[Math.floor(m / 10)], BANDC[m % 10], BANDC[Math.max(0, e)], '#c9a227'];
  }
  // 3 significant digits (e.g. 536)
  m = v; e = 0;
  while (m >= 1000) { m /= 10; e++; }
  m = Math.round(m);
  return [BANDC[Math.floor(m / 100)], BANDC[Math.floor(m / 10) % 10], BANDC[m % 10], BANDC[Math.max(0, e)], '#c9a227'];
}
export function fmtOhm(v) {
  if (v >= 1e6) return `${+(v / 1e6).toFixed(2)} M\u03A9`;
  if (v >= 1000) return `${+(v / 1000).toFixed(2)} k\u03A9`;
  return `${v} \u03A9`;
}

function placePhoto(g, href, x, y, w, h, { multiply = false } = {}) {
  const im = E('image', { x, y, width: w, height: h, preserveAspectRatio: 'xMidYMid meet' }, g);
  im.setAttribute('href', href);
  im.setAttributeNS('http://www.w3.org/1999/xlink', 'href', href);
  // Product shots sit on black — multiply drops the backdrop on the light board
  if (multiply) im.style.mixBlendMode = 'multiply';
  return im;
}

function drawAxialResistor(g, span, _value) {
  const L = span * P;
  // Sharp metal leads into breadboard holes
  lead(g, 0, 0, L * 0.16, 0, 1.5);
  lead(g, L * 0.84, 0, L, 0, 1.5);
  // Photo body (leads cropped out so hole tips stay vector-aligned)
  const nest = E('svg', {
    x: L * 0.14, y: -7, width: L * 0.72, height: 14,
    viewBox: '70 8 278 46', overflow: 'hidden',
  }, g);
  placePhoto(nest, 'img/resistor.png', 0, 0, 418, 62, { multiply: true });
}

function drawDIP(g, half, spanRows, label) {
  const w = (half - 1) * P;
  const y0 = 0.36 * P, y1 = spanRows * P - 0.36 * P;
  const bh = y1 - y0;
  const bx = -0.45 * P, bw = w + 0.9 * P;
  // Stepped DIP legs: wider shoulder under the body, thin tip into the hole
  const leg = (x, holeY, towardBody) => {
    const tipH = 3.2;
    const tipTop = towardBody > holeY ? holeY : holeY - tipH;
    const shTop = towardBody > holeY ? holeY + tipH : towardBody;
    const shoulderH = Math.abs(towardBody - holeY) - tipH;
    E('rect', { x: x - 0.85, y: tipTop, width: 1.7, height: tipH, fill: '#b8b4a8' }, g);
    if (shoulderH > 0.5) {
      E('rect', { x: x - 1.55, y: shTop, width: 3.1, height: shoulderH, fill: '#c4c0b4' }, g);
      E('rect', { x: x - 1.55, y: shTop, width: 0.9, height: shoulderH, fill: 'rgba(255,255,255,0.28)' }, g);
    }
  };
  for (let k = 0; k < half; k++) {
    leg(k * P, 0, y0);
    leg(k * P, spanRows * P, y1);
  }
  // Matte moulded body — sharp corners, chamfered top face
  E('rect', { x: bx, y: y0, width: bw, height: bh, fill: '#2a2a2c' }, g);
  E('rect', { x: bx + 1.6, y: y0 + 1.6, width: bw - 3.2, height: bh - 3.2, fill: '#1f1f21' }, g);
  E('rect', { x: bx + 1.6, y: y0 + 1.6, width: bw - 3.2, height: (bh - 3.2) * 0.22, fill: 'rgba(255,255,255,0.035)' }, g);
  const cy = (y0 + y1) / 2;
  // Orientation notch + pin-1 dimple
  E('path', { d: `M ${bx} ${cy - 4} A 4 4 0 0 1 ${bx} ${cy + 4} Z`, fill: '#141416' }, g);
  E('circle', { cx: bx + 5.5, cy: y1 - 5.5, r: 1.35, fill: '#141416' }, g);
  txt(g, w / 2, cy + 2.4, label, 8.2, '#ffffff', 'middle', 400);
}

// standard DIP pin geometry: anchor = upper-left pin. upper row L->R is pins
// [2n..n+1], lower row L->R is pins [1..n]. Named via `names` (index = pin#-1).
function dipPins(half, spanRows, names) {
  const pins = [];
  for (let k = 0; k < half; k++) pins.push({ x: k, y: 0, name: names[2 * half - 1 - k] });
  for (let k = 0; k < half; k++) pins.push({ x: k, y: spanRows, name: names[k] });
  return pins;
}

// ---- LED / caps / switches ---------------------------------------------------

const LED_GLOW = { red: '#ff5a52', green: '#57e06a', yellow: '#ffe14a' };
const DOME_LIT = { red: '#c43c36', green: '#3aad4a', yellow: '#d0b02c' };
const DOME_DIM = { red: '#7a3834', green: '#3a6840', yellow: '#7a7034' };
const LED_RIM = { red: '#9a7a74', green: '#7a9074', yellow: '#9a9068' };

function drawLED(g, inst) {
  // Local X of pin 1 (may be negative if the cathode is "behind" the anode)
  let lx = P;
  if (inst?.holes?.length >= 2) {
    const a = HOLE_BY_ID.get(inst.holes[0]);
    const b = HOLE_BY_ID.get(inst.holes[1]);
    if (a && b) {
      const wx = b.x - a.x, wy = b.y - a.y;
      const r = (inst.rot || 0) & 3;
      if (r === 0) lx = wx;
      else if (r === 1) lx = wy;
      else if (r === 2) lx = -wx;
      else lx = -wy;
      if (!Number.isFinite(lx) || Math.abs(lx) < 1) lx = P;
    }
  }
  // Overhead LED: sharp leads into the two holes, body centered between them
  lead(g, 0, 0, 0, 5, 1.45);
  lead(g, lx, 0, lx, 5, 1.45);
  const cx = lx / 2, cy = 1.2;
  const c = inst.props.color || 'red';
  const glow = E('circle', { cx, cy, r: 12, fill: LED_GLOW[c], opacity: 0, filter: 'url(#ledGlow)' }, g);
  glow.style.mixBlendMode = 'screen';
  // Flange with cathode flat — no soft shadow / bubbly highlight
  const flat = lx >= 0 ? 1 : -1;
  E('path', {
    d: `M ${cx + flat * 6.4} ${cy - 5.8} A 8.4 8.4 0 1 0 ${cx + flat * 6.4} ${cy + 5.8} Z`,
    fill: LED_RIM[c],
  }, g);
  E('line', {
    x1: cx + flat * 6.4, y1: cy - 5.8, x2: cx + flat * 6.4, y2: cy + 5.8,
    stroke: 'rgba(0,0,0,0.22)', 'stroke-width': 0.8, 'stroke-linecap': 'butt',
  }, g);
  const body = E('circle', { cx, cy, r: 6.5, fill: DOME_DIM[c] }, g);
  E('circle', { cx, cy, r: 6.5, fill: 'none', stroke: 'rgba(0,0,0,0.18)', 'stroke-width': 0.6 }, g);
  inst._dyn = { glow, body, colorFill: DOME_LIT, colorDim: DOME_DIM };
}

function drawCeramic(g) {
  lead(g, 0, 0, 0, -8, 1.45); lead(g, P, 0, P, -8, 1.45);
  const cx = P / 2, cy = -10;
  E('path', { d: `M ${cx - 7} ${cy + 4} C ${cx - 8} ${cy - 10} ${cx + 8} ${cy - 10} ${cx + 7} ${cy + 4} Z`, fill: '#c4a24e' }, g);
  E('path', { d: `M ${cx - 7} ${cy + 4} C ${cx - 8} ${cy - 10} ${cx + 8} ${cy - 10} ${cx + 7} ${cy + 4} Z`, fill: 'none', stroke: '#8a7030', 'stroke-width': 0.6 }, g);
  txt(g, cx, cy + 1, '103', 4.2, '#5a3d15', 'middle', 600);
}

function drawElectrolytic(g) {
  lead(g, 0, 0, 0, -6, 1.45); lead(g, P, 0, P, -6, 1.45);
  const cx = P / 2, cy = -12;
  E('circle', { cx, cy, r: 9.2, fill: '#1a2740' }, g);
  E('path', { d: `M ${cx + 5.2} ${cy - 7.4} A 9.2 9.2 0 0 1 ${cx + 5.2} ${cy + 7.4} Z`, fill: '#c9cdd6' }, g);
  E('circle', { cx, cy, r: 6.6, fill: '#d0d3d8' }, g);
  E('path', { d: `M ${cx - 4} ${cy} L ${cx + 4} ${cy} M ${cx} ${cy - 4} L ${cx} ${cy + 4}`, stroke: 'rgba(0,0,0,0.45)', 'stroke-width': 1 }, g);
  txt(g, cx, cy - 14, '120\u00B5F', 4.0, 'rgba(0,0,0,0.45)', 'middle', 400);
}

function drawTactile(g, inst) {
  const w = 2 * P, h = 3 * P, cx = w / 2, cy = h / 2;
  // Sharp leads into the four holes
  for (const [px, py] of [[0, 0], [2, 0], [0, 3], [2, 3]]) {
    lead(g, px * P, py * P, px * P + (px ? -3 : 3), py * P + (py ? -4 : 4), 1.55);
  }
  // Overhead square housing — sharp corners, muted black (no softShadow / rx)
  E('rect', { x: -3, y: 0.4 * P, width: w + 6, height: h - 0.8 * P, fill: '#1c1d21' }, g);
  E('rect', { x: -3, y: 0.4 * P, width: w + 6, height: h - 0.8 * P, fill: 'none', stroke: '#323338', 'stroke-width': 0.7 }, g);
  // Metal actuator (circle is the real top-down silhouette)
  const cap = E('circle', { cx, cy, r: 8.2, fill: '#b6bac0', stroke: '#6e7278', 'stroke-width': 0.9 }, g);
  E('circle', { cx, cy, r: 5.0, fill: 'none', stroke: 'rgba(255,255,255,0.16)', 'stroke-width': 0.7 }, g);
  inst._dyn = { cap };
}

function drawSPST(g, inst) {
  lead(g, 0, 0, 0, 5, 1.5); lead(g, 2 * P, 0, 2 * P, 5, 1.5);
  E('rect', { x: -5, y: -15, width: 2 * P + 10, height: 17, fill: '#1f3f78' }, g);
  E('rect', { x: -1, y: -12, width: 2 * P + 2, height: 11, fill: '#dfe2e6' }, g);
  const knob = E('rect', { x: 1, y: -11, width: 12, height: 9, fill: '#c0c4ca', stroke: '#8b8e94', 'stroke-width': 0.6 }, g);
  txt(g, 2 * P + 2, -17, 'ON', 4.0, 'rgba(0,0,0,0.4)', 'middle', 400);
  inst._dyn = { knob, onX: 2 * P - 13, offX: 1 };
}

function drawSPDT(g, inst) {
  for (const px of [0, 1, 2]) lead(g, px * P, 0, px * P, 5, 1.5);
  E('rect', { x: -5, y: -15, width: 2 * P + 10, height: 17, fill: '#20222a' }, g);
  E('circle', { cx: P, cy: -6, r: 7.2, fill: '#c0c4ca' }, g);
  const lever = E('line', { x1: P, y1: -6, x2: P - 10, y2: -22, stroke: '#c0c4ca', 'stroke-width': 3.2, 'stroke-linecap': 'butt' }, g);
  E('circle', { cx: P, cy: -6, r: 3.2, fill: '#3a3b40' }, g);
  inst._dyn = { lever };
}

function drawPot(g, inst) {
  for (const px of [0, 1, 2]) lead(g, px * P, 0, px * P, 6, 1.5);
  E('rect', { x: -6, y: -2 * P - 8, width: 2 * P + 12, height: 2 * P + 8, fill: '#2a6a3a' }, g);
  txt(g, P, -2 * P - 1, '103', 4.2, 'rgba(255,255,255,0.65)', 'middle', 500);
  const cx = P, cy = -P - 1;
  E('circle', { cx, cy, r: 9.0, fill: '#c9a24a' }, g);
  const slot = E('g', {}, g);
  E('line', { x1: cx - 6.0, y1: cy, x2: cx + 6.0, y2: cy, stroke: '#6b5f3c', 'stroke-width': 2.2, 'stroke-linecap': 'butt' }, slot);
  inst._dyn = { slot, cx, cy };
}

function drawSMD0(g) {
  lead(g, 0, 0, P, 0, 1.4);
  E('rect', { x: P / 2 - 5.4, y: -3.6, width: 10.8, height: 7.2, fill: '#141519' }, g);
  E('rect', { x: P / 2 - 5.4, y: -3.6, width: 2.6, height: 7.2, fill: '#c0c4ca' }, g);
  E('rect', { x: P / 2 + 2.8, y: -3.6, width: 2.6, height: 7.2, fill: '#c0c4ca' }, g);
  txt(g, P / 2, 1.4, '0', 4.4, '#d8d8d8', 'middle', 500);
}

function drawBatterySnap(g) {
  lead(g, 0, 0, 0, 4, 1.5);
  lead(g, P, 0, P, 4, 1.5);
  E('rect', { x: -12, y: -35, width: P + 24, height: 21, fill: '#1a1b20' }, g);
  E('circle', { cx: -1, cy: -24.5, r: 4.4, fill: '#26272c', stroke: '#c0c4ca', 'stroke-width': 2 }, g);
  E('circle', { cx: P + 1, cy: -24.5, r: 3.2, fill: '#c0c4ca' }, g);
  txt(g, P / 2, -38.5, '9V snap', 4.0, 'rgba(0,0,0,0.4)', 'middle', 400);
}

function draw5V(g) {
  lead(g, 0, 0, 0, 4, 1.5); lead(g, P, 0, P, 4, 1.5);
  E('rect', { x: -9, y: -28, width: P + 18, height: 26, fill: '#8f2420' }, g);
  txt(g, P / 2, -15, '5V', 6.5, '#fff', 'middle', 600);
  E('circle', { cx: 0, cy: -5, r: 2.8, fill: '#c9a24a' }, g);
  E('circle', { cx: P, cy: -5, r: 2.8, fill: '#c9a24a' }, g);
}

// ---- free (off-board) parts ---------------------------------------------------

function drawArduino(g, inst) {
  // Photoreal Arduino Uno SMD — ports are calibrated to the header holes.
  // Cropped photo maps so 0.1" header pitch ≈ 10.16 SVG units.
  const scale = 10.16 / 31;
  const ox = (51 - 138) * scale;   // USB sticks past teal left edge
  const oy = (184 - 185) * scale;
  const dw = 899 * scale;
  const dh = 650 * scale;

  const im = E('image', {
    x: ox, y: oy, width: dw, height: dh,
    preserveAspectRatio: 'none',
  }, g);
  im.setAttribute('href', 'img/arduino-smd.png?v=4');
  im.setAttributeNS('http://www.w3.org/1999/xlink', 'href', 'img/arduino-smd.png?v=4');

  // Status LED overlays (photo already has LEDs; these tint for sim feedback)
  const led = (x, y, fill, opacity = 0) => {
    const el = E('rect', {
      x: x - 2.2, y: y - 1.2, width: 4.4, height: 2.4,
      fill, opacity, 'pointer-events': 'none',
    }, g);
    el.style.mixBlendMode = 'screen';
    return el;
  };
  // Approx ON / TX / RX on the right edge of the board photo
  const statusLED = led(243, 72, '#3adb6a', 0.55);
  const txLED = led(243, 82, '#ff8f2e', 0);
  const rxLED = led(243, 90, '#ff8f2e', 0);

  inst._dyn = { statusLED, txLED, rxLED };
}

function mapArduinoPin(imgX, imgY) {
  const scale = 10.16 / 31;
  return [(imgX - 138) * scale, (imgY - 185) * scale];
}

// off-board 9V battery photo — ports sit on the snap terminals
function drawBattery(g) {
  const W = 46, H = 84;
  placePhoto(g, 'img/battery.png', 0, 0, W, H);
}

function drawBattery9V(g) {
  const W = 92, H = 138;
  E('rect', { x: 0, y: 0, width: W, height: H, rx: 7, fill: '#1c1d22', filter: 'url(#softShadow)' }, g);
  E('rect', { x: 0, y: 34, width: W, height: 62, fill: '#c9a227' }, g);
  txt(g, W / 2, 72, '9V', 20, '#1c1d22', 'middle', 700);
  txt(g, W / 2, 88, 'ALKALINE', 5.4, 'rgba(28,29,34,0.7)');
  E('circle', { cx: 26, cy: 14, r: 8, fill: 'none', stroke: 'url(#metalG)', 'stroke-width': 3.4 }, g);
  E('circle', { cx: 66, cy: 14, r: 5.6, fill: 'url(#metalG)' }, g);
  txt(g, 26, 30, '+', 7, '#fff', 'middle', 700);
  txt(g, 66, 30, '\u2212', 7, '#fff', 'middle', 700);
}

function drawSupply(g, inst) {
  const W = 190, H = 120;
  E('rect', { x: 0, y: 0, width: W, height: H, rx: 8, fill: '#3c4048', filter: 'url(#softShadow)' }, g);
  E('rect', { x: 0, y: 0, width: W, height: 5, rx: 3, fill: 'rgba(255,255,255,0.16)' }, g);
  E('rect', { x: 14, y: 14, width: 108, height: 40, rx: 4, fill: '#0d1a10' }, g);
  const disp = txt(g, 68, 40, '5.0 V', 15, '#54e07c', 'middle', 600);
  txt(g, 156, 36, 'DC', 6.6, 'rgba(255,255,255,0.7)');
  E('circle', { cx: 156, cy: 58, r: 15, fill: '#23252a', stroke: 'rgba(255,255,255,0.2)', 'stroke-width': 1.4 }, g);
  E('line', { x1: 156, y1: 58, x2: 156, y2: 46, stroke: '#cfd2d8', 'stroke-width': 2.4, 'stroke-linecap': 'round' }, g);
  txt(g, 46, 104, '+', 8, '#ff6b6b', 'middle', 700);
  txt(g, 86, 104, '\u2212', 8, '#7db1ff', 'middle', 700);
  txt(g, W / 2, H - 40, 'LAB SUPPLY', 5, 'rgba(255,255,255,0.45)');
  inst._dyn = { disp };
}

function drawFuncGen(g, inst) {
  const W = 190, H = 110;
  E('rect', { x: 0, y: 0, width: W, height: H, rx: 8, fill: '#23262c', filter: 'url(#softShadow)' }, g);
  E('rect', { x: 0, y: 0, width: W, height: 5, rx: 3, fill: 'rgba(255,255,255,0.14)' }, g);
  E('rect', { x: 14, y: 14, width: 118, height: 38, rx: 4, fill: '#081018' }, g);
  const disp = txt(g, 73, 38, '2.0 Hz', 13, '#5ac8ff', 'middle', 600);
  E('path', { d: 'M 24 60 h 10 v -6 h 10 v 12 h 10 v -6 h 10', stroke: '#5ac8ff', 'stroke-width': 1.6, fill: 'none', transform: 'translate(0, 14)' }, g);
  txt(g, 160, 34, 'AFG', 6.6, 'rgba(255,255,255,0.75)', 'middle', 700);
  txt(g, 158, 44, 'TEKTRONIX', 3.8, 'rgba(255,255,255,0.4)');
  txt(g, 132, 98, 'OUT', 5, '#ffb26b');
  txt(g, 164, 98, 'GND', 5, '#9aa3ad');
  inst._dyn = { disp };
}

function drawDMM(g, inst) {
  const W = 130, H = 190;
  E('rect', { x: 0, y: 0, width: W, height: H, rx: 12, fill: '#f2b21c', filter: 'url(#softShadow)' }, g);
  E('rect', { x: 8, y: 8, width: W - 16, height: H - 16, rx: 8, fill: '#2b2d33' }, g);
  E('rect', { x: 16, y: 18, width: W - 32, height: 44, rx: 4, fill: '#c9d6c3' }, g);
  const disp = txt(g, W / 2, 46, '-- --', 15, '#22301e', 'middle', 600);
  E('circle', { cx: W / 2, cy: 108, r: 26, fill: '#3a3d45', stroke: 'rgba(255,255,255,0.15)', 'stroke-width': 1.5 }, g);
  E('line', { x1: W / 2, y1: 108, x2: W / 2 + 16, y2: 90, stroke: '#e8e6e0', 'stroke-width': 3, 'stroke-linecap': 'round' }, g);
  txt(g, W / 2, 78, 'V \u2126 ))))', 5, 'rgba(255,255,255,0.6)');
  txt(g, 34, 172, 'COM', 4.8, '#9aa3ad');
  txt(g, 96, 172, 'V\u2126', 4.8, '#ff8f8f');
  txt(g, W / 2, 152, 'DMM', 5.4, 'rgba(255,255,255,0.4)');
  inst._dyn = { disp };
}

// small tools
function drawIron(g) {
  // blue barrel handle
  E('rect', { x: 26, y: 2, width: 48, height: 22, rx: 11, transform: 'rotate(34 26 2)', fill: '#2b5fb8' }, g);
  E('rect', { x: 26, y: 3, width: 48, height: 7, rx: 3.5, transform: 'rotate(34 26 2)', fill: 'rgba(255,255,255,0.28)' }, g);
  // metal ferrule + shaft
  E('line', { x1: 18, y1: 46, x2: 36, y2: 22, stroke: 'url(#metalG)', 'stroke-width': 8, 'stroke-linecap': 'round' }, g);
  E('line', { x1: 6, y1: 62, x2: 20, y2: 44, stroke: 'url(#metalG)', 'stroke-width': 4, 'stroke-linecap': 'round' }, g);
  // copper tip
  E('path', { d: 'M 2 67 L 12 54 L 9 63 Z', fill: '#b5773a' }, g);
}
function drawStrippers(g) {
  // steel head with stripping notches
  E('path', { d: 'M 18 6 L 46 6 L 40 30 L 24 30 Z', fill: 'url(#metalG)' }, g);
  for (let i = 0; i < 4; i++) E('circle', { cx: 24 + i * 4.2, cy: 13, r: 1.3, fill: '#3a3d45' }, g);
  E('circle', { cx: 32, cy: 24, r: 3, fill: '#6b6f77', stroke: 'rgba(0,0,0,0.3)', 'stroke-width': 0.8 }, g);
  // red plastic grips
  E('path', { d: 'M 24 30 L 15 62 L 22 62 L 30 31 Z', fill: '#d43c3c' }, g);
  E('path', { d: 'M 40 30 L 49 62 L 42 62 L 34 31 Z', fill: '#d43c3c' }, g);
  E('path', { d: 'M 24 30 L 21 42 L 27 41 L 30 31 Z', fill: 'rgba(255,255,255,0.16)' }, g);
}
function drawCutters(g) {
  // angled cutting jaws
  E('path', { d: 'M 20 4 C 30 10 34 18 33 27 L 27 24 C 26 16 22 10 16 8 Z', fill: 'url(#metalG)' }, g);
  E('path', { d: 'M 44 6 C 34 12 30 18 31 27 L 37 24 C 38 16 42 12 48 10 Z', fill: '#b9bdc4' }, g);
  E('circle', { cx: 32, cy: 26, r: 3, fill: '#6b6f77', stroke: 'rgba(0,0,0,0.3)', 'stroke-width': 0.8 }, g);
  // orange grips
  E('path', { d: 'M 29 28 L 21 62 L 28 62 L 34 30 Z', fill: '#e0a52e' }, g);
  E('path', { d: 'M 35 28 L 43 62 L 36 62 L 32 30 Z', fill: '#e0a52e' }, g);
}
function drawUSB(g) {
  E('path', { d: 'M 14 62 C 2 42 16 26 32 20', stroke: '#2b2d33', 'stroke-width': 5, fill: 'none', 'stroke-linecap': 'round' }, g);
  E('rect', { x: 24, y: 4, width: 24, height: 20, rx: 2.5, transform: 'rotate(-24 24 4)', fill: 'url(#metalG)' }, g);
  E('rect', { x: 28, y: 22, width: 16, height: 12, rx: 2, transform: 'rotate(-24 28 22)', fill: '#2b2d33' }, g);
  txt(g, 58, 50, 'USB', 6, 'rgba(0,0,0,0.4)');
}
function drawProbes(g) {
  E('path', { d: 'M 6 66 C 0 42 14 28 30 20', stroke: '#c33', 'stroke-width': 4, fill: 'none', 'stroke-linecap': 'round' }, g);
  E('path', { d: 'M 26 68 C 22 48 34 32 50 24', stroke: '#222', 'stroke-width': 4, fill: 'none', 'stroke-linecap': 'round' }, g);
  E('rect', { x: 25, y: 8, width: 8, height: 17, rx: 3.5, transform: 'rotate(-30 25 8)', fill: '#c33' }, g);
  E('rect', { x: 45, y: 12, width: 8, height: 17, rx: 3.5, transform: 'rotate(-30 45 12)', fill: '#242424' }, g);
  E('line', { x1: 31, y1: 9, x2: 37, y2: -1, stroke: 'url(#metalG)', 'stroke-width': 2, 'stroke-linecap': 'round' }, g);
  E('line', { x1: 51, y1: 13, x2: 57, y2: 3, stroke: 'url(#metalG)', 'stroke-width': 2, 'stroke-linecap': 'round' }, g);
}
function drawHeatShrink(g) {
  E('rect', { x: 0, y: -5, width: 3 * P, height: 10, rx: 5, fill: '#1c1d22' }, g);
  E('rect', { x: 0, y: -5, width: 3 * P, height: 3.4, rx: 2, fill: 'rgba(255,255,255,0.16)' }, g);
  E('rect', { x: 2, y: -1.5, width: 3 * P - 4, height: 3, rx: 1.5, fill: 'rgba(0,0,0,0.25)' }, g);
}
function drawPCB(g) {
  const W = 120, H = 84;
  E('rect', { x: 0, y: 0, width: W, height: H, rx: 5, fill: '#1e7a3c', filter: 'url(#softShadow)' }, g);
  E('rect', { x: 0, y: 0, width: W, height: 4, rx: 2, fill: 'rgba(255,255,255,0.16)' }, g);
  for (let r = 0; r < 5; r++) for (let c = 0; c < 8; c++) {
    E('circle', { cx: 14 + c * 13.4, cy: 16 + r * 13.4, r: 2.6, fill: '#d8b34a' }, g);
    E('circle', { cx: 14 + c * 13.4, cy: 16 + r * 13.4, r: 1.1, fill: '#123a1e' }, g);
  }
  txt(g, W - 10, H - 8, '555 KIT', 4.6, 'rgba(255,255,255,0.5)', 'end');
}
// ---- IC pin name tables --------------------------------------------------------

const HC14 = ['1A', '1Y', '2A', '2Y', '3A', '3Y', 'GND', '4Y', '4A', '5Y', '5A', '6Y', '6A', 'VCC'];
const HC08 = ['1A', '1B', '1Y', '2A', '2B', '2Y', 'GND', '3Y', '3A', '3B', '4Y', '4A', '4B', 'VCC'];
const HC32 = HC08;  // OR gates — same pinout as AND
const HC00 = HC08;  // NAND gates — same pinout as AND
// 74HC02 NOR has outputs on pins 1/4/10/13 (different from HC08!)
const HC02 = ['1Y', '1A', '1B', '2Y', '2A', '2B', 'GND', '3A', '3B', '3Y', '4A', '4B', '4Y', 'VCC'];
const HC86 = HC08;  // XOR gates — same pinout as AND
const HC283 = ['S2', 'B2', 'A2', 'S1', 'A1', 'B1', 'C0', 'GND', 'C4', 'S4', 'B4', 'A4', 'S3', 'A3', 'B3', 'VCC'];
const HC153 = ['1G', 'B', '1C3', '1C2', '1C1', '1C0', '1Y', 'GND', '2Y', '2C0', '2C1', '2C2', '2C3', 'A', '2G', 'VCC'];
const CD4013 = ['Q1', 'Q1N', 'CLK1', 'RST1', 'D1', 'SET1', 'GND', 'SET2', 'D2', 'RST2', 'CLK2', 'Q2N', 'Q2', 'VCC'];
const NE555 = ['GND', 'TRIG', 'OUT', 'RESET', 'CTRL', 'THRES', 'DISCH', 'VCC'];
const MEGA328 = Array.from({ length: 28 }, (_, i) => `P${i + 1}`);

function dipDef(id, name, half, spanRows, label, icType, names) {
  return {
    id, cat: 'ics', name, kind: 'board',
    pins: dipPins(half, spanRows, names),
    sim: { type: 'ic', icType },
    props: {},
    draw: (g) => drawDIP(g, half, spanRows, label),
    thumbImg: 'img/ic.png',   // photo in the tray; vector on the board so legs land in the holes
    thumb: { x: -12, y: -8, w: (half - 1) * P + 24, h: spanRows * P + 16 },
  };
}

// ---- catalog --------------------------------------------------------------------

export const CATS = [
  ['switches', 'switches'],
  ['resistors', 'resistors'],
  ['leds', 'leds'],
  ['ics', 'logic ics'],
  ['power', 'power'],
];

const rdef = (id, value, name, filter = '') => ({
  id, cat: 'resistors', name, kind: 'board',
  pins: [{ x: 0, y: 0, name: 'a' }, { x: 3, y: 0, name: 'b' }],
  sim: { type: 'resistor' },
  props: { ohms: value },
  draw: (g, inst) => drawAxialResistor(g, 3, inst.props.ohms),
  thumbImg: 'img/resistor.png', filter,
  thumb: { x: -4, y: -14, w: 3 * P + 8, h: 28 },
});

// LED photo body + sharp leads seated in adjacent holes
const ledDef = (id, color, name, thumbFilter = '') => ({
  id, cat: 'leds', name, kind: 'board',
  pins: [{ x: 0, y: 0, name: 'a' }, { x: 1, y: 0, name: 'k' }],
  sim: { type: 'led' },
  props: { color },
  draw: drawLED,
  thumbImg: 'img/led.png', thumbFilter,
  thumb: { x: -10, y: -12, w: P + 20, h: 30 },
});

export const CATALOG = [
  // --- switches
  {
    id: 'button', cat: 'switches', name: 'push button', kind: 'board',
    pins: [{ x: 0, y: 0, name: 'a1' }, { x: 2, y: 0, name: 'a2' }, { x: 0, y: 3, name: 'b1' }, { x: 2, y: 3, name: 'b2' }],
    sim: { type: 'button' }, props: {},
    draw: drawTactile, thumbImg: 'img/button.png',
    thumb: { x: -8, y: -4, w: 2 * P + 16, h: 3 * P + 8 },
  },

  // --- resistor (single item; edit the resistance once placed/selected)
  rdef('resistor', 1000, 'resistor'),

  // --- led (single item; edit the colour once placed/selected)
  ledDef('led', 'red', 'LED'),

  // --- ics (single palette item; pick the chip once placed/selected)
  { ...dipDef('hc14', 'SN74HC14N inverter', 7, 3, 'SN74HC14N', 'hc14', HC14), paletteName: 'logic chip' },
  { ...dipDef('hc08', 'SN74HC08N AND', 7, 3, 'SN74HC08N', 'hc08', HC08), hidden: true },
  { ...dipDef('hc32', 'SN74HC32N OR', 7, 3, 'SN74HC32N', 'hc32', HC32), hidden: true },
  { ...dipDef('hc00', 'SN74HC00N NAND', 7, 3, 'SN74HC00N', 'hc00', HC00), hidden: true },
  { ...dipDef('hc02', 'SN74HC02N NOR', 7, 3, 'SN74HC02N', 'hc02', HC02), hidden: true },
  { ...dipDef('hc86', 'SN74HC86N XOR', 7, 3, 'SN74HC86N', 'hc86', HC86), hidden: true },
  { ...dipDef('hc283', 'CD74HC283E adder', 8, 3, 'CD74HC283E', 'hc283', HC283), hidden: true },
  { ...dipDef('hc153', 'SN74HC153N mux', 8, 3, 'SN74HC153N', 'hc153', HC153), hidden: true },
  { ...dipDef('cd4013', 'CD4013BE flip-flop', 7, 3, 'CD4013BE', 'cd4013', CD4013), hidden: true },
  { ...dipDef('ne555', 'NE555P timer', 4, 3, 'NE555P', 'ne555', NE555), hidden: true },

  // --- power (single source): a free 9V battery wired to the board
  {
    id: 'pow5', cat: 'power', name: '9V battery', kind: 'free',
    ports: [{ x: 16, y: 10, name: 'pos' }, { x: 30, y: 10, name: 'neg' }],
    sim: { type: 'supply', volts: 5 }, props: { volts: 5 },
    draw: drawBattery,
    size: { w: 46, h: 84 },
    thumb: { x: -4, y: -4, w: 54, h: 92 },
  },

  // --- Arduino Uno (free part with digital and analog I/O)
  {
    id: 'arduino', cat: 'power', name: 'arduino uno', kind: 'free',
    ports: (() => {
      // Pin centers calibrated to img/arduino-smd.png header holes
      const topY = 211, botY = 791;
      const dig13to8 = [473, 504, 535, 566, 597, 628]; // left→right
      const dig7to0 = [677, 708, 739, 770, 801, 832, 863, 894]; // left→right
      // POWER L→R: IOREF, RESET, 3.3V, 5V, GND, GND, Vin
      const power = [414, 445, 476, 507, 538, 569, 600];
      // ANALOG IN L→R: A0…A5 (real board order)
      const analog = [738, 769, 800, 831, 862, 893];
      const ports = [];

      dig7to0.forEach((imgX, i) => {
        const [x, y] = mapArduinoPin(imgX, topY);
        ports.push({ x, y, name: `D${7 - i}` });
      });
      dig13to8.forEach((imgX, i) => {
        const [x, y] = mapArduinoPin(imgX, topY);
        ports.push({ x, y, name: `D${13 - i}` });
      });

      const [x33, yP] = mapArduinoPin(power[2], botY);
      const [x5] = mapArduinoPin(power[3], botY);
      const [xG1] = mapArduinoPin(power[4], botY);
      const [xG2] = mapArduinoPin(power[5], botY);
      const [xVin] = mapArduinoPin(power[6], botY);
      ports.push({ x: x5, y: yP, name: '5V', volts: 5 });
      ports.push({ x: x33, y: yP, name: '3V3', volts: 3.3 });
      ports.push({ x: xG1, y: yP, name: 'GND', volts: 0 });
      ports.push({ x: xG2, y: yP, name: 'GND2', volts: 0 });
      ports.push({ x: xVin, y: yP, name: 'VIN' });

      analog.forEach((imgX, i) => {
        const [x, y] = mapArduinoPin(imgX, botY);
        ports.push({ x, y, name: `A${i}` });
      });

      return ports;
    })(),
    sim: { type: 'arduino' },
    props: { code: '' },
    draw: drawArduino,
    thumbImg: 'img/arduino-smd.png?v=4',
    size: { w: 266, h: 207 },
    thumb: { x: -32, y: -4, w: 300, h: 216 },
  },
];

export const DEF_BY_ID = new Map(CATALOG.map((d) => [d.id, d]));

// wire colors offered in the inspector
export const WIRE_COLORS = [
  ['#d43c3c', 'red'], ['#26262a', 'black'], ['#3fa54a', 'green'],
  ['#e8b53a', 'yellow'], ['#2f6fed', 'blue'], ['#e07b39', 'orange'], ['#f4f2ec', 'white'],
];
