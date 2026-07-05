// Part catalog: pin layouts, top-down SVG art, and sim model tags.
// Board parts use pitch-unit pin offsets from the anchor pin (0,0) and snap to
// holes. Free parts live off-board and expose snappable "ports" for wires.

import { P, E } from './board.js';

// ---- shared art helpers -----------------------------------------------------

function lead(g, x1, y1, x2, y2, w = 2) {
  E('line', { x1, y1, x2, y2, stroke: 'url(#metalG)', 'stroke-width': w, 'stroke-linecap': 'round' }, g);
}
function txt(g, x, y, s, size = 6, fill = '#e8e6e0', anchor = 'middle', weight = 500) {
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

function drawAxialResistor(g, span, value) {
  const L = span * P;
  lead(g, 0, 0, L, 0, 1.7);
  const bw = L * 0.6, bx = (L - bw) / 2, h = 11, y = -h / 2;
  E('ellipse', { cx: L / 2, cy: 6.2, rx: bw / 2, ry: 2.6, fill: 'rgba(0,0,0,0.2)' }, g);   // contact shadow
  E('rect', { x: bx, y, width: bw, height: h, rx: h / 2, fill: 'url(#resG)' }, g);          // domed-end body
  const bands = resistorBands(value);
  const n = bands.length;
  bands.forEach((c, i) => {
    const fx = bx + bw * (0.2 + (i / (n - 1)) * 0.6);
    E('rect', { x: fx - 1.5, y: y + 0.4, width: 3, height: h - 0.8, fill: c }, g);
  });
  E('rect', { x: bx, y, width: bw, height: h, rx: h / 2, fill: 'url(#cylShade)' }, g);       // cylinder curvature
  E('rect', { x: bx + 2.5, y: y + 1.3, width: bw - 5, height: 1.5, rx: 0.7, fill: 'rgba(255,255,255,0.5)' }, g);
}

function drawDIP(g, half, spanRows, label, sub = '') {
  const w = (half - 1) * P;
  const y0 = 0.36 * P, y1 = spanRows * P - 0.36 * P;
  const bh = y1 - y0;
  // gull-wing legs with a highlight edge
  const leg = (x, yTop, hgt) => {
    E('rect', { x: x - 2.3, y: yTop, width: 4.6, height: hgt, rx: 1, fill: 'url(#metalG)' }, g);
    E('rect', { x: x - 2.3, y: yTop, width: 1.4, height: hgt, fill: 'rgba(255,255,255,0.45)' }, g);
  };
  for (let k = 0; k < half; k++) {
    leg(k * P, -2, y0 + 2.5);
    leg(k * P, y1 - 0.5, spanRows * P - y1 + 2.5);
  }
  // matte black moulded body with rounded top/bottom shading
  E('rect', { x: -0.5 * P, y: y0 + 2, width: w + P, height: bh, rx: 3, fill: 'rgba(0,0,0,0.28)' }, g);
  E('rect', { x: -0.5 * P, y: y0, width: w + P, height: bh, rx: 2.5, fill: 'url(#dipG)' }, g);
  E('rect', { x: -0.5 * P, y: y0, width: w + P, height: bh * 0.42, rx: 2.5, fill: 'rgba(255,255,255,0.06)' }, g);
  E('rect', { x: -0.5 * P, y: y0 + bh * 0.72, width: w + P, height: bh * 0.28, fill: 'rgba(0,0,0,0.24)' }, g);
  const cy = (y0 + y1) / 2;
  // half-moon orientation notch on the left edge
  E('path', { d: `M ${-0.5 * P} ${cy - 4.8} A 4.8 4.8 0 0 1 ${-0.5 * P} ${cy + 4.8} Z`, fill: '#0b0b0e' }, g);
  E('path', { d: `M ${-0.5 * P} ${cy - 4.8} A 4.8 4.8 0 0 1 ${-0.5 * P} ${cy + 4.8}`, fill: 'none', stroke: 'rgba(255,255,255,0.1)', 'stroke-width': 0.7 }, g);
  // pin-1 dimple
  E('circle', { cx: 0.5, cy: y1 - 5.5, r: 1.9, fill: '#0b0b0e' }, g);
  E('circle', { cx: 0.5, cy: y1 - 5.5, r: 1.9, fill: 'none', stroke: 'rgba(255,255,255,0.16)', 'stroke-width': 0.7 }, g);
  const t = txt(g, w / 2, cy + 2.2, label, 6.6, '#cfcdc8', 'middle', 600);
  t.setAttribute('letter-spacing', '0.05em');
  if (sub) txt(g, w / 2, cy + 10, sub, 4.4, 'rgba(207,205,200,0.5)');
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
const DOME_LIT = { red: 'url(#ledRedG)', green: 'url(#ledGreenG)', yellow: 'url(#ledYellowG)' };
const DOME_DIM = { red: 'url(#ledRedGd)', green: 'url(#ledGreenGd)', yellow: 'url(#ledYellowGd)' };
const LED_RIM = { red: '#eab7ae', green: '#bfe2b6', yellow: '#eadfa8' };

function drawLED(g, inst) {
  lead(g, 0, -1, 0, 7, 1.7); lead(g, P, -1, P, 7, 1.7);
  const cx = P / 2, cy = 1.2;
  const c = inst.props.color || 'red';
  const glow = E('circle', { cx, cy, r: 14, fill: LED_GLOW[c], opacity: 0, filter: 'url(#ledGlow)' }, g);
  E('ellipse', { cx, cy: cy + 6.6, rx: 8.6, ry: 2.4, fill: 'rgba(0,0,0,0.2)' }, g);            // contact shadow
  // translucent plastic base flange with a flat on the cathode side
  E('path', { d: `M ${cx + 6.6} ${cy - 6} A 8.8 8.8 0 1 0 ${cx + 6.6} ${cy + 6} Z`, fill: LED_RIM[c] }, g);
  E('line', { x1: cx + 6.6, y1: cy - 6, x2: cx + 6.6, y2: cy + 6, stroke: 'rgba(0,0,0,0.16)', 'stroke-width': 1 }, g);
  const body = E('circle', { cx, cy, r: 6.9, fill: DOME_DIM[c] }, g);                            // dome
  E('ellipse', { cx: cx - 2.1, cy: cy - 2.6, rx: 2.4, ry: 1.7, fill: 'rgba(255,255,255,0.8)' }, g);
  inst._dyn = { glow, body, colorFill: DOME_LIT, colorDim: DOME_DIM };
}

function drawCeramic(g) {
  lead(g, 0, -1, 0, 6, 1.7); lead(g, P, -1, P, 6, 1.7);
  const cx = P / 2, cy = -1;
  E('ellipse', { cx, cy: cy + 6, rx: 7.4, ry: 2.2, fill: 'rgba(0,0,0,0.2)' }, g);
  E('path', { d: `M ${cx - 7} ${cy + 3} C ${cx - 8.4} ${cy - 9.5} ${cx + 8.4} ${cy - 9.5} ${cx + 7} ${cy + 3} Z`, fill: 'url(#ceramicG)' }, g);
  E('ellipse', { cx: cx - 2, cy: cy - 3.6, rx: 2.6, ry: 1.7, fill: 'rgba(255,255,255,0.32)' }, g);
  txt(g, cx, cy + 1.2, '103', 4.4, '#5a3d15', 'middle', 700);
}

function drawElectrolytic(g) {
  lead(g, 0, -1, 0, 5, 1.7); lead(g, P, -1, P, 5, 1.7);
  const cx = P / 2, cy = -2.5;
  E('ellipse', { cx, cy: cy + 8.6, rx: 9, ry: 2.6, fill: 'rgba(0,0,0,0.22)' }, g);
  E('circle', { cx, cy, r: 9.6, fill: '#1a2740' }, g);                         // blue sleeve
  // light negative stripe on the cathode side
  E('path', { d: `M ${cx + 5.6} ${cy - 7.8} A 9.6 9.6 0 0 1 ${cx + 5.6} ${cy + 7.8} Z`, fill: '#c9cdd6' }, g);
  txt(g, cx + 7, cy - 3, '\u2212', 5.4, '#1a2740', 'middle', 800);
  txt(g, cx + 7, cy + 3.6, '\u2212', 5.4, '#1a2740', 'middle', 800);
  E('circle', { cx, cy, r: 7, fill: 'url(#elecG)' }, g);                       // aluminum top
  E('path', { d: `M ${cx - 4.6} ${cy} L ${cx + 4.6} ${cy} M ${cx} ${cy - 4.6} L ${cx} ${cy + 4.6}`, stroke: 'rgba(0,0,0,0.5)', 'stroke-width': 1.1 }, g);
  E('ellipse', { cx: cx - 2, cy: cy - 2.4, rx: 2.6, ry: 1.7, fill: 'rgba(255,255,255,0.16)' }, g);
  txt(g, cx, cy - 12, '120\u00B5F', 4.4, 'rgba(0,0,0,0.5)');
}

function drawTactile(g, inst) {
  const w = 2 * P, h = 3 * P, cx = w / 2, cy = h / 2;
  for (const [px, py] of [[0, 0], [2, 0], [0, 3], [2, 3]]) {
    lead(g, px * P, py * P, px * P + (px ? -3 : 3), py * P + (py ? -4 : 4), 2.2);
  }
  E('rect', { x: -3, y: 0.4 * P + 2, width: w + 6, height: h - 0.8 * P, rx: 2.5, fill: 'rgba(0,0,0,0.25)' }, g);
  E('rect', { x: -3, y: 0.4 * P, width: w + 6, height: h - 0.8 * P, rx: 2.5, fill: '#1c1d21' }, g);
  E('rect', { x: -3, y: 0.4 * P, width: w + 6, height: 4, rx: 2, fill: 'rgba(255,255,255,0.1)' }, g);
  const cap = E('circle', { cx, cy, r: 8.4, fill: 'url(#metalG)', stroke: '#4a4b50', 'stroke-width': 1 }, g);
  E('circle', { cx, cy, r: 8.4, fill: 'none', stroke: 'rgba(255,255,255,0.28)', 'stroke-width': 0.8 }, g);
  E('ellipse', { cx: cx - 2.4, cy: cy - 2.6, rx: 2.6, ry: 1.8, fill: 'rgba(255,255,255,0.4)' }, g);
  inst._dyn = { cap };
}

function drawSPST(g, inst) {
  lead(g, 0, 0, 0, 5, 1.7); lead(g, 2 * P, 0, 2 * P, 5, 1.7);
  E('rect', { x: -5, y: -15, width: 2 * P + 10, height: 17, rx: 2.5, fill: '#1f3f78' }, g);
  E('rect', { x: -5, y: -15, width: 2 * P + 10, height: 4, rx: 2, fill: 'rgba(255,255,255,0.2)' }, g);
  E('rect', { x: -1, y: -12, width: 2 * P + 2, height: 11, rx: 1.5, fill: '#dfe2e6' }, g);          // slider channel
  E('rect', { x: -1, y: -12, width: 2 * P + 2, height: 4, rx: 1.5, fill: 'rgba(0,0,0,0.08)' }, g);
  const knob = E('rect', { x: 1, y: -11, width: 12, height: 9, rx: 1.4, fill: 'url(#metalG)', stroke: '#8b8e94', 'stroke-width': 0.6 }, g);
  txt(g, 2 * P + 2, -17, 'ON', 4.2, 'rgba(0,0,0,0.45)');
  inst._dyn = { knob, onX: 2 * P - 13, offX: 1 };
}

function drawSPDT(g, inst) {
  for (const px of [0, 1, 2]) lead(g, px * P, 0, px * P, 5, 1.7);
  E('rect', { x: -5, y: -15, width: 2 * P + 10, height: 17, rx: 3, fill: '#20222a' }, g);
  E('rect', { x: -5, y: -15, width: 2 * P + 10, height: 4, rx: 2, fill: 'rgba(255,255,255,0.14)' }, g);
  E('circle', { cx: P, cy: -6, r: 7.5, fill: 'url(#metalG)' }, g);                                  // threaded bushing
  E('circle', { cx: P, cy: -6, r: 7.5, fill: 'none', stroke: 'rgba(0,0,0,0.3)', 'stroke-width': 1 }, g);
  const lever = E('line', { x1: P, y1: -6, x2: P - 10, y2: -22, stroke: 'url(#metalG)', 'stroke-width': 3.6, 'stroke-linecap': 'round' }, g);
  E('circle', { cx: P, cy: -6, r: 3.4, fill: '#3a3b40' }, g);
  inst._dyn = { lever };
}

function drawPot(g, inst) {
  for (const px of [0, 1, 2]) lead(g, px * P, 0, px * P, 6, 1.7);
  E('rect', { x: -6, y: -2 * P - 6, width: 2 * P + 12, height: 2 * P + 8, rx: 2.5, fill: 'rgba(0,0,0,0.25)' }, g);
  E('rect', { x: -6, y: -2 * P - 8, width: 2 * P + 12, height: 2 * P + 8, rx: 2.5, fill: 'url(#potG)' }, g);
  E('rect', { x: -6, y: -2 * P - 8, width: 2 * P + 12, height: 4, rx: 2, fill: 'rgba(255,255,255,0.22)' }, g);
  txt(g, P, -2 * P - 1, '103', 4.4, 'rgba(255,255,255,0.7)', 'middle', 600);
  const cx = P, cy = -P - 1;
  E('circle', { cx, cy, r: 9.4, fill: 'url(#screwG)' }, g);                                          // brass adjust screw
  E('circle', { cx, cy, r: 9.4, fill: 'none', stroke: 'rgba(0,0,0,0.3)', 'stroke-width': 1 }, g);
  const slot = E('g', {}, g);
  E('line', { x1: cx - 6.2, y1: cy, x2: cx + 6.2, y2: cy, stroke: '#6b5f3c', 'stroke-width': 2.4, 'stroke-linecap': 'round' }, slot);
  inst._dyn = { slot, cx, cy };
}

function drawSMD0(g) {
  lead(g, 0, 0, P, 0, 1.6);
  E('rect', { x: P / 2 - 5.6, y: -3.8, width: 11.2, height: 7.6, rx: 0.8, fill: '#141519' }, g);
  E('rect', { x: P / 2 - 5.6, y: -3.8, width: 2.8, height: 7.6, fill: 'url(#metalG)' }, g);
  E('rect', { x: P / 2 + 2.8, y: -3.8, width: 2.8, height: 7.6, fill: 'url(#metalG)' }, g);
  E('rect', { x: P / 2 - 3, y: -3.8, width: 6, height: 2, fill: 'rgba(255,255,255,0.06)' }, g);
  txt(g, P / 2, 1.6, '0', 4.6, '#d8d8d8', 'middle', 600);
}

function drawBatterySnap(g) {
  lead(g, 0, 0, 0, 4, 1.7);
  lead(g, P, 0, P, 4, 1.7);
  // insulated wires up to the connector
  E('path', { d: `M 0 2 C -4 -8 -6 -12 -6 -18`, stroke: '#c33', 'stroke-width': 2.6, fill: 'none', 'stroke-linecap': 'round' }, g);
  E('path', { d: `M ${P} 2 C ${P + 4} -8 ${P + 6} -12 ${P + 6} -18`, stroke: '#222', 'stroke-width': 2.6, fill: 'none', 'stroke-linecap': 'round' }, g);
  // moulded snap connector body
  E('rect', { x: -12, y: -35, width: P + 24, height: 21, rx: 5, fill: '#1a1b20' }, g);
  E('rect', { x: -12, y: -35, width: P + 24, height: 5, rx: 3, fill: 'rgba(255,255,255,0.14)' }, g);
  E('circle', { cx: -1, cy: -24.5, r: 4.6, fill: '#26272c', stroke: 'url(#metalG)', 'stroke-width': 2.2 }, g);  // + ring terminal
  E('circle', { cx: P + 1, cy: -24.5, r: 3.4, fill: 'url(#metalG)' }, g);                                       // - button terminal
  txt(g, P / 2, -38.5, '9V snap', 4.4, 'rgba(0,0,0,0.5)');
}

function draw5V(g) {
  lead(g, 0, 0, 0, 4, 1.7); lead(g, P, 0, P, 4, 1.7);
  // small regulated power module
  E('rect', { x: -9, y: -28, width: P + 18, height: 26, rx: 3, fill: '#8f2420' }, g);
  E('rect', { x: -9, y: -28, width: P + 18, height: 26, rx: 3, fill: 'url(#cylShade)', opacity: 0.5 }, g);
  E('rect', { x: -9, y: -28, width: P + 18, height: 4.5, rx: 2, fill: 'rgba(255,255,255,0.22)' }, g);
  txt(g, P / 2, -15, '5V', 7, '#fff', 'middle', 700);
  // solder pads for the two pins
  E('circle', { cx: 0, cy: -5, r: 3, fill: '#c9a24a' }, g);
  E('circle', { cx: P, cy: -5, r: 3, fill: '#c9a24a' }, g);
  txt(g, 0, -3.2, '+', 4.6, '#5a2a10', 'middle', 800);
  txt(g, P, -3.2, '\u2212', 4.6, '#5a2a10', 'middle', 800);
}

// ---- free (off-board) parts ---------------------------------------------------

function drawArduino(g, inst) {
  const W = 214, H = 152;
  E('rect', { x: 0, y: 0, width: W, height: H, rx: 8, fill: '#0f7a8a', filter: 'url(#softShadow)' }, g);
  E('rect', { x: 0, y: 0, width: W, height: 5, rx: 3, fill: 'rgba(255,255,255,0.12)' }, g);
  // usb + barrel
  E('rect', { x: -10, y: 16, width: 34, height: 30, rx: 3, fill: 'url(#metalG)' }, g);
  E('rect', { x: -10, y: 96, width: 30, height: 34, rx: 4, fill: '#17181c' }, g);
  E('circle', { cx: 20, cy: 113, r: 7, fill: '#0a0a0c' }, g);
  // headers
  E('rect', { x: 52, y: 6, width: 150, height: 12, rx: 2, fill: '#17181c' }, g);
  E('rect', { x: 62, y: H - 18, width: 140, height: 12, rx: 2, fill: '#17181c' }, g);
  // atmega
  E('rect', { x: 76, y: 92, width: 96, height: 26, rx: 2.5, fill: 'url(#dipG)' }, g);
  txt(g, 124, 108, 'ATMEGA328P', 5.4, '#cfcdc8');
  // silk
  txt(g, 124, 56, 'ARDUINO', 11, '#eaf5f6', 'middle', 600);
  txt(g, 124, 68, 'UNO', 8, 'rgba(234,245,246,0.8)', 'middle', 600);
  E('circle', { cx: 190, cy: 40, r: 3, fill: '#3adb6a' }, g);
  txt(g, 190, 51, 'ON', 4.2, 'rgba(255,255,255,0.7)');
  // port dots (drawn by main.js port renderer) — label the power pins
  txt(g, 84, H - 22, '5V', 4.6, 'rgba(255,255,255,0.85)');
  txt(g, 100, H - 22, '3V3', 4.6, 'rgba(255,255,255,0.85)');
  txt(g, 118, H - 22, 'GND', 4.6, 'rgba(255,255,255,0.85)');
  txt(g, 136, H - 22, 'GND', 4.6, 'rgba(255,255,255,0.85)');
  txt(g, 154, H - 22, 'VIN', 4.6, 'rgba(255,255,255,0.6)');
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
function drawMiniBoard(g) {
  const W = 96, H = 34;
  E('rect', { x: 0, y: 0, width: W, height: H, rx: 4, fill: 'url(#boardG)', filter: 'url(#partShadow)' }, g);
  for (let r = 0; r < 2; r++) for (let c = 0; c < 12; c++) {
    E('rect', { x: 8 + c * 7, y: 7 + r * 14, width: 3, height: 3, fill: '#222' }, g);
  }
  E('line', { x1: 4, y1: 17, x2: W - 4, y2: 17, stroke: 'rgba(0,0,0,0.1)' }, g);
}

// ---- IC pin name tables --------------------------------------------------------

const HC14 = ['1A', '1Y', '2A', '2Y', '3A', '3Y', 'GND', '4Y', '4A', '5Y', '5A', '6Y', '6A', 'VCC'];
const HC08 = ['1A', '1B', '1Y', '2A', '2B', '2Y', 'GND', '3Y', '3A', '3B', '4Y', '4A', '4B', 'VCC'];
const HC32 = HC08;
const HC283 = ['S2', 'B2', 'A2', 'S1', 'A1', 'B1', 'C0', 'GND', 'C4', 'S4', 'B4', 'A4', 'S3', 'A3', 'B3', 'VCC'];
const HC153 = ['1G', 'B', '1C3', '1C2', '1C1', '1C0', '1Y', 'GND', '2Y', '2C0', '2C1', '2C2', '2C3', 'A', '2G', 'VCC'];
const CD4013 = ['Q1', 'Q1N', 'CLK1', 'RST1', 'D1', 'SET1', 'GND', 'SET2', 'D2', 'RST2', 'CLK2', 'Q2N', 'Q2', 'VCC'];
const NE555 = ['GND', 'TRIG', 'OUT', 'RESET', 'CTRL', 'THRES', 'DISCH', 'VCC'];
const MEGA328 = Array.from({ length: 28 }, (_, i) => `P${i + 1}`);

function dipDef(id, name, half, spanRows, label, icType, names, sub) {
  return {
    id, cat: 'ics', name, kind: 'board',
    pins: dipPins(half, spanRows, names),
    sim: { type: 'ic', icType },
    props: {},
    draw: (g) => drawDIP(g, half, spanRows, label, sub),
    thumb: { x: -12, y: -8, w: (half - 1) * P + 24, h: spanRows * P + 16 },
  };
}

// ---- catalog --------------------------------------------------------------------

export const CATS = [
  ['wiring', 'wiring'],
  ['switches', 'switches'],
  ['resistors', 'resistors'],
  ['caps', 'capacitors'],
  ['leds', 'leds'],
  ['ics', 'logic ics'],
  ['micro', 'micro'],
  ['power', 'power'],
  ['lab', 'lab'],
];

const rdef = (id, value, name) => ({
  id, cat: 'resistors', name, kind: 'board',
  pins: [{ x: 0, y: 0, name: 'a' }, { x: 3, y: 0, name: 'b' }],
  sim: { type: 'resistor' },
  props: { ohms: value },
  draw: (g, inst) => drawAxialResistor(g, 3, inst.props.ohms),
  thumb: { x: -4, y: -14, w: 3 * P + 8, h: 28 },
});

const wdef = (id, name, color, kind = 'wire') => ({
  id, cat: 'wiring', name, kind: 'wiremode', wireKind: kind, color,
  draw: (g) => {
    E('path', { d: 'M 4 40 C 14 6 46 6 56 40', stroke: color, 'stroke-width': kind === 'gator' ? 5 : 3.6, fill: 'none', 'stroke-linecap': 'round', filter: 'url(#partShadow)' }, g);
    if (kind === 'gator') {
      E('path', { d: 'M 2 44 l 6 -8 M 58 44 l -6 -8', stroke: 'url(#metalG)', 'stroke-width': 3.6, 'stroke-linecap': 'round' }, g);
    } else {
      E('line', { x1: 4, y1: 40, x2: 4, y2: 46, stroke: 'url(#metalG)', 'stroke-width': 2.4 }, g);
      E('line', { x1: 56, y1: 40, x2: 56, y2: 46, stroke: 'url(#metalG)', 'stroke-width': 2.4 }, g);
    }
  },
  thumb: { x: 0, y: 0, w: 60, h: 50 },
});

const ledDef = (id, color, name) => ({
  id, cat: 'leds', name, kind: 'board',
  pins: [{ x: 0, y: 0, name: 'a' }, { x: 1, y: 0, name: 'k' }],
  sim: { type: 'led' },
  props: { color },
  draw: drawLED,
  thumb: { x: -10, y: -12, w: P + 20, h: 30 },
});

export const CATALOG = [
  // --- wiring
  {
    id: 'breadboard', cat: 'wiring', name: 'breadboard (already on canvas)', kind: 'disabled',
    draw: drawMiniBoard, thumb: { x: 0, y: 0, w: 96, h: 34 },
  },
  wdef('wire-jumper', 'jumper wire', '#3fa54a'),
  wdef('wire-solid', 'solid-core wire #22 AWG', '#e8b53a'),
  wdef('wire-red', 'red hook-up wire', '#d43c3c'),
  wdef('wire-black', 'black hook-up wire', '#26262a'),
  wdef('wire-gator', 'banana \u2192 alligator lead', '#d43c3c', 'gator'),
  {
    id: 'batsnap', cat: 'wiring', name: 'battery snap (9V)', kind: 'board',
    pins: [{ x: 0, y: 0, name: 'pos' }, { x: 1, y: 0, name: 'neg' }],
    sim: { type: 'source', volts: 9 }, props: {},
    draw: drawBatterySnap, thumb: { x: -16, y: -44, w: P + 32, h: 54 },
  },
  {
    id: 'heatshrink', cat: 'wiring', name: 'heat shrink tubing', kind: 'free', size: { w: 3 * P, h: 12 },
    sim: { type: 'deco' }, props: {},
    draw: (g) => drawHeatShrink(E('g', { transform: 'translate(0,6)' }, g)),
    thumb: { x: -2, y: -3, w: 3 * P + 4, h: 18 },
  },
  {
    id: 'pcb', cat: 'wiring', name: 'PCB (soldering workshop)', kind: 'free', size: { w: 120, h: 84 },
    sim: { type: 'deco' }, props: {}, draw: drawPCB, thumb: { x: -4, y: -4, w: 128, h: 92 },
  },

  // --- switches
  {
    id: 'button', cat: 'switches', name: 'pushbutton (4-pin tactile)', kind: 'board',
    pins: [{ x: 0, y: 0, name: 'a1' }, { x: 2, y: 0, name: 'a2' }, { x: 0, y: 3, name: 'b1' }, { x: 2, y: 3, name: 'b2' }],
    sim: { type: 'button' }, props: {},
    draw: drawTactile, thumb: { x: -8, y: -4, w: 2 * P + 16, h: 3 * P + 8 },
  },
  {
    id: 'spst', cat: 'switches', name: 'SPST switch', kind: 'board',
    pins: [{ x: 0, y: 0, name: 'a' }, { x: 2, y: 0, name: 'b' }],
    sim: { type: 'spst' }, props: { closed: false },
    draw: drawSPST, thumb: { x: -8, y: -22, w: 2 * P + 16, h: 32 },
  },
  {
    id: 'spdt', cat: 'switches', name: 'SPDT switch', kind: 'board',
    pins: [{ x: 0, y: 0, name: 'l' }, { x: 1, y: 0, name: 'c' }, { x: 2, y: 0, name: 'r' }],
    sim: { type: 'spdt' }, props: { side: 'l' },
    draw: drawSPDT, thumb: { x: -8, y: -28, w: 2 * P + 16, h: 38 },
  },

  // --- resistors
  rdef('r10k', 10000, '10 k\u03A9 resistor'),
  {
    id: 'pot10k', cat: 'resistors', name: '10 k\u03A9 potentiometer', kind: 'board',
    pins: [{ x: 0, y: 0, name: 'a' }, { x: 1, y: 0, name: 'w' }, { x: 2, y: 0, name: 'b' }],
    sim: { type: 'pot', ohms: 10000 }, props: { t: 0.5 },
    draw: drawPot, thumb: { x: -9, y: -2 * P - 10, w: 2 * P + 18, h: 2 * P + 18 },
  },
  rdef('r5k1', 5100, '5.1 k\u03A9 resistor'),
  rdef('r2k', 2000, '2 k\u03A9 resistor'),
  rdef('r1k', 1000, '1 k\u03A9 resistor'),
  rdef('r536', 536, '536 \u03A9 resistor'),
  rdef('r510', 510, '510 \u03A9 resistor'),
  rdef('r200', 200, '200 \u03A9 resistor'),
  {
    id: 'r0', cat: 'resistors', name: '0 \u03A9 SMD resistor', kind: 'board',
    pins: [{ x: 0, y: 0, name: 'a' }, { x: 1, y: 0, name: 'b' }],
    sim: { type: 'zero' }, props: {},
    draw: drawSMD0, thumb: { x: -4, y: -10, w: P + 8, h: 20 },
  },

  // --- caps
  {
    id: 'c10n', cat: 'caps', name: '10 nF ceramic capacitor', kind: 'board',
    pins: [{ x: 0, y: 0, name: 'a' }, { x: 1, y: 0, name: 'b' }],
    sim: { type: 'cap', farads: 10e-9 }, props: {},
    draw: drawCeramic, thumb: { x: -8, y: -12, w: P + 16, h: 24 },
  },
  {
    id: 'c120u', cat: 'caps', name: '120 \u00B5F electrolytic capacitor', kind: 'board',
    pins: [{ x: 0, y: 0, name: 'pos' }, { x: 1, y: 0, name: 'neg' }],
    sim: { type: 'cap', farads: 120e-6 }, props: {},
    draw: drawElectrolytic, thumb: { x: -8, y: -16, w: P + 16, h: 28 },
  },

  // --- leds
  ledDef('led-red', 'red', 'red LED'),
  ledDef('led-green', 'green', 'green LED'),
  ledDef('led-yellow', 'yellow', 'yellow LED'),

  // --- ics
  dipDef('hc14', 'SN74HC14N hex schmitt inverter', 7, 3, 'SN74HC14N', 'hc14', HC14, 'hex inverter'),
  dipDef('hc08', 'SN74HC08N quad AND', 7, 3, 'SN74HC08N', 'hc08', HC08, 'quad AND'),
  dipDef('hc32', 'SN74HC32N quad OR', 7, 3, 'SN74HC32N', 'hc32', HC32, 'quad OR'),
  dipDef('hc283', 'CD74HC283E 4-bit full adder', 8, 3, 'CD74HC283E', 'hc283', HC283, '4-bit adder'),
  dipDef('hc153', 'SN74HC153N dual 4:1 mux', 8, 3, 'SN74HC153N', 'hc153', HC153, 'dual 4:1 mux'),
  dipDef('cd4013', 'CD4013BE dual D flip-flop', 7, 3, 'CD4013BE', 'cd4013', CD4013, 'dual D-FF'),
  dipDef('ne555', 'NE555P timer', 4, 3, 'NE555P', 'ne555', NE555, 'timer'),

  // --- micro
  {
    id: 'arduino', cat: 'micro', name: 'Arduino Uno', kind: 'free', size: { w: 214, h: 152 },
    ports: [
      { x: 84, y: 140, name: '5V', volts: 5 },
      { x: 100, y: 140, name: '3V3', volts: 3.3 },
      { x: 118, y: 140, name: 'GND', volts: 0 },
      { x: 136, y: 140, name: 'GND2', volts: 0 },
    ],
    sim: { type: 'ports' }, props: {},
    draw: drawArduino, thumb: { x: -14, y: -4, w: 232, h: 162 },
  },
  (() => {
    const d = dipDef('mega328', 'ATmega328P (DIP-28)', 14, 6, 'ATMEGA328P-PU', 'inert', MEGA328, 'AVR MCU');
    d.cat = 'micro';
    return d;
  })(),
  {
    id: 'usb', cat: 'micro', name: 'USB cable', kind: 'free', size: { w: 70, h: 70 },
    sim: { type: 'deco' }, props: {}, draw: drawUSB, thumb: { x: 0, y: 0, w: 72, h: 70 },
  },

  // --- power
  {
    id: 'pow5', cat: 'power', name: '5 V power source', kind: 'board',
    pins: [{ x: 0, y: 0, name: 'pos' }, { x: 1, y: 0, name: 'neg' }],
    sim: { type: 'source', volts: 5 }, props: {},
    draw: draw5V, thumb: { x: -12, y: -30, w: P + 24, h: 40 },
  },
  {
    id: 'supply', cat: 'power', name: 'DC lab power supply', kind: 'free', size: { w: 190, h: 120 },
    ports: [
      { x: 46, y: 88, name: 'pos', srcPos: true },
      { x: 86, y: 88, name: 'neg', volts: 0 },
    ],
    sim: { type: 'supply' }, props: { volts: 5 },
    draw: drawSupply, thumb: { x: -6, y: -4, w: 202, h: 130 },
  },
  {
    id: 'bat9', cat: 'power', name: '9 V battery', kind: 'free', size: { w: 92, h: 138 },
    ports: [
      { x: 26, y: 14, name: 'pos', srcPos: true },
      { x: 66, y: 14, name: 'neg', volts: 0 },
    ],
    sim: { type: 'supply' }, props: { volts: 9 },
    draw: drawBattery9V, thumb: { x: -4, y: -6, w: 100, h: 148 },
  },

  // --- lab
  {
    id: 'dmm', cat: 'lab', name: 'digital multimeter (DMM)', kind: 'free', size: { w: 130, h: 190 },
    ports: [
      { x: 34, y: 160, name: 'com' },
      { x: 96, y: 160, name: 'vin' },
    ],
    sim: { type: 'dmm' }, props: {},
    draw: drawDMM, thumb: { x: -4, y: -4, w: 138, h: 198 },
  },
  {
    id: 'probes', cat: 'lab', name: 'DMM probes', kind: 'free', size: { w: 64, h: 68 },
    sim: { type: 'deco' }, props: {}, draw: drawProbes, thumb: { x: 0, y: 0, w: 66, h: 70 },
  },
  {
    id: 'funcgen', cat: 'lab', name: 'arbitrary function generator', kind: 'free', size: { w: 190, h: 110 },
    ports: [
      { x: 132, y: 84, name: 'out' },
      { x: 164, y: 84, name: 'gnd', volts: 0 },
    ],
    sim: { type: 'funcgen' }, props: { hz: 2 },
    draw: drawFuncGen, thumb: { x: -6, y: -4, w: 202, h: 120 },
  },
  {
    id: 'iron', cat: 'lab', name: 'soldering iron', kind: 'free', size: { w: 76, h: 70 },
    sim: { type: 'deco' }, props: {}, draw: drawIron, thumb: { x: 0, y: 0, w: 78, h: 72 },
  },
  {
    id: 'strippers', cat: 'lab', name: 'wire strippers', kind: 'free', size: { w: 64, h: 66 },
    sim: { type: 'deco' }, props: {}, draw: drawStrippers, thumb: { x: 4, y: 2, w: 58, h: 64 },
  },
  {
    id: 'cutters', cat: 'lab', name: 'flush cutters', kind: 'free', size: { w: 64, h: 64 },
    sim: { type: 'deco' }, props: {}, draw: drawCutters, thumb: { x: 12, y: 2, w: 46, h: 62 },
  },
];

export const DEF_BY_ID = new Map(CATALOG.map((d) => [d.id, d]));

// wire colors offered in the inspector
export const WIRE_COLORS = [
  ['#d43c3c', 'red'], ['#26262a', 'black'], ['#3fa54a', 'green'],
  ['#e8b53a', 'yellow'], ['#2f6fed', 'blue'], ['#e07b39', 'orange'], ['#f4f2ec', 'white'],
];
