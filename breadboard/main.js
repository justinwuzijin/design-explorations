// Breadboard simulator: palette, placement, wiring, inspector, sim loop.

import { P, E, BODY, buildBoard, nearestHole, HOLE_BY_ID, baseNetOf } from './board.js';
import { CATALOG, DEF_BY_ID, WIRE_COLORS, fmtOhm } from './parts.js?v=14';
import { runSim, portNode } from './sim.js';

const svg = document.getElementById('canvas');
const world = document.getElementById('world');
const boardL = document.getElementById('boardL');
const partsL = document.getElementById('partsL');
const wiresL = document.getElementById('wiresL');
const fxL = document.getElementById('fxL');
const stage = document.getElementById('stage');
const hintEl = document.getElementById('hint');
const inspector = document.getElementById('inspector');
const zoomPct = document.getElementById('zoom-pct');

// ---------------------------------------------------------------- state
const state = { parts: [], wires: [], uid: 1 };
let view = { x: 60, y: 60, k: 1 };
let sel = null;                    // {kind:'part', inst} | {kind:'wire', wire}
let pendingWire = null;            // a floating wire waiting for its second hole
let dragging = null;               // active pointer interaction
const occ = new Map();             // holeId -> occupant uid ('w'+i for wires)

buildBoard(boardL);

// ---------------------------------------------------------------- view
function applyView() {
  world.setAttribute('transform', `translate(${view.x},${view.y}) scale(${view.k})`);
  if (zoomPct) zoomPct.textContent = `${Math.round(view.k * 100)}%`;
}

// zoom in/out in 10% steps, anchored on the canvas center
function zoomStep(dir) {
  const cx = stage.clientWidth / 2, cy = stage.clientHeight / 2;
  const k0 = view.k;
  let k1 = Math.min(3, Math.max(0.4, Math.round(k0 * 10) / 10 + dir * 0.1));
  if (k1 === k0) return;
  view.x = cx - ((cx - view.x) / k0) * k1;
  view.y = cy - ((cy - view.y) / k0) * k1;
  view.k = k1;
  applyView();
  refreshSelBox();
}
function fitView() {
  const w = stage.clientWidth, h = stage.clientHeight;
  const k = Math.min((w - 80) / BODY.w, (h - 130) / BODY.h, 1.2);
  view = {
    k,
    x: (w - BODY.w * k) / 2 - BODY.x * k,
    y: (h - BODY.h * k) / 2 - BODY.y * k,   // vertically centered in the canvas
  };
  applyView();
}
function toWorld(e) {
  const r = svg.getBoundingClientRect();
  return { x: (e.clientX - r.left - view.x) / view.k, y: (e.clientY - r.top - view.y) / view.k };
}

// ---------------------------------------------------------------- helpers
const rotXY = (x, y, rot) => {
  switch (((rot % 4) + 4) % 4) {
    case 1: return [-y, x];
    case 2: return [-x, -y];
    case 3: return [y, -x];
    default: return [x, y];
  }
};

function footprintAt(def, wx, wy, rot) {
  const anchor = nearestHole(wx, wy, P * 0.75);
  if (!anchor) return { ok: false, holes: [] };
  const holes = [];
  for (const pin of def.pins) {
    const [dx, dy] = rotXY(pin.x, pin.y, rot);
    const h = nearestHole(anchor.x + dx * P, anchor.y + dy * P, P * 0.34);
    if (!h) return { ok: false, holes: [], anchor };
    holes.push(h.id);
  }
  const distinct = new Set(holes);
  if (distinct.size !== holes.length) return { ok: false, holes: [], anchor };
  for (const id of holes) {
    const o = occ.get(id);
    if (o !== undefined && (!dragging || o !== dragging.inst?.uid)) return { ok: false, holes: [], anchor };
  }
  return { ok: true, holes, anchor };
}

// world position of a free part's port, accounting for its rotation angle
function portWorld(inst, port) {
  const s = inst.def.size || { w: 40, h: 40 };
  const cx = s.w / 2, cy = s.h / 2;
  const a = ((inst.ang || 0) * Math.PI) / 180, cos = Math.cos(a), sin = Math.sin(a);
  const dx = port.x - cx, dy = port.y - cy;
  return [inst.x + cx + dx * cos - dy * sin, inst.y + cy + dx * sin + dy * cos];
}

function nodeAt(wx, wy) {
  const h = nearestHole(wx, wy, P * 0.55);
  if (h) return { node: baseNetOf(h.id), hole: h.id, x: h.x, y: h.y };
  for (const inst of state.parts) {
    if (!inst.def.ports) continue;
    for (const port of inst.def.ports) {
      const [px, py] = portWorld(inst, port);
      const d = Math.hypot(px - wx, py - wy);
      if (d < 11) return { node: portNode(inst, port.name), port: [inst.uid, port.name], x: px, y: py };
    }
  }
  return null;
}
function endpointPos(ep) {
  if (ep.hole) { const h = HOLE_BY_ID.get(ep.hole); return [h.x, h.y]; }
  const inst = state.parts.find((p) => p.uid === ep.port[0]);
  if (!inst) return [0, 0];
  const port = inst.def.ports.find((pp) => pp.name === ep.port[1]);
  return portWorld(inst, port);
}
function epNode(ep) {
  return ep.hole ? baseNetOf(ep.hole) : `q${ep.port[0]}:${ep.port[1]}`;
}

// ---------------------------------------------------------------- rendering
const LED_GLOW = { red: '#ff5a52', green: '#57e06a', yellow: '#ffe14a' };

// A placed part is drawn either from its real photo (`def.img`) or the vector
// fallback. The photo is dropped into `def.imgBox` (pin-space, so it rotates and
// snaps with the part); logic dots and LED glow are layered on top by the loop.
function renderArt(g, inst) {
  if (inst.def.img) drawImagePart(g, inst);
  else inst.def.draw(g, inst);
}
function drawImagePart(g, inst) {
  const box = inst.def.imgBox || { x: -20, y: -20, w: 40, h: 40 };
  const im = E('image', {
    x: box.x, y: box.y, width: box.w, height: box.h,
    preserveAspectRatio: 'xMidYMid meet',
  }, g);
  im.setAttribute('href', inst.def.img);
  im.setAttributeNS('http://www.w3.org/1999/xlink', 'href', inst.def.img);
  if (inst.def.filter) im.style.filter = inst.def.filter;
  if (inst.def.sim && inst.def.sim.type === 'led') {
    const cx = box.x + box.w / 2, cy = box.y + box.h * 0.34;
    const glow = E('circle', { cx, cy, r: 12, fill: LED_GLOW[inst.props.color] || '#ff5a52', opacity: 0 }, g);
    glow.setAttribute('filter', 'url(#ledGlow)');
    glow.style.mixBlendMode = 'screen';
    inst._dyn = { glow, imageEl: im, base: inst.def.filter || '' };
  }
}

function renderPart(inst) {
  if (inst.g) inst.g.remove();
  const g = E('g', { class: 'part' }, partsL);
  inst.g = g;
  g.dataset.uid = inst.uid;
  inst._dyn = null;
  renderArt(g, inst);
  // snappable port dots for free parts
  if (inst.def.ports) {
    for (const port of inst.def.ports) {
      E('circle', { cx: port.x, cy: port.y, r: 4.4, fill: 'url(#metalG)', stroke: 'rgba(0,0,0,0.45)', 'stroke-width': 1 }, g);
      E('circle', { cx: port.x, cy: port.y, r: 1.6, fill: '#26262a' }, g);
    }
  }
  positionPart(inst);
}
function positionPart(inst) {
  if (inst.def.kind === 'board') {
    const a = HOLE_BY_ID.get(inst.holes[0]);
    inst.g.setAttribute('transform', `translate(${a.x},${a.y}) rotate(${inst.rot * 90})`);
  } else {
    if (inst.x == null) inst.x = 0;
    if (inst.y == null) inst.y = 0;
    const s = inst.def.size || { w: 40, h: 40 };
    inst.g.setAttribute('transform', `translate(${inst.x},${inst.y}) rotate(${inst.ang || 0} ${s.w / 2} ${s.h / 2})`);
  }
}

function wirePath(x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const sag = Math.min(30, len * 0.22);
  const mx = (x1 + x2) / 2 - (dy / len) * sag;
  const my = (y1 + y2) / 2 + (dx / len) * sag;
  return `M ${x1} ${y1} Q ${mx} ${my} ${x2} ${y2}`;
}
function renderWire(w) {
  if (w.g) w.g.remove();
  const g = E('g', { class: 'wire' }, wiresL);
  w.g = g;
  const [x1, y1] = endpointPos(w.a);
  const [x2, y2] = endpointPos(w.b);
  const d = wirePath(x1, y1, x2, y2);
  E('path', { d, stroke: 'rgba(0,0,0,0.25)', 'stroke-width': (w.kind === 'gator' ? 6.5 : 4.6), fill: 'none', 'stroke-linecap': 'round', transform: 'translate(0,1.6)' }, g);
  E('path', { d, stroke: w.color, 'stroke-width': w.kind === 'gator' ? 5 : 3.4, fill: 'none', 'stroke-linecap': 'round' }, g);
  E('path', { d, stroke: 'rgba(255,255,255,0.28)', 'stroke-width': 1.1, fill: 'none', 'stroke-linecap': 'round', transform: 'translate(0,-0.9)' }, g);
  for (const [x, y] of [[x1, y1], [x2, y2]]) {
    if (w.kind === 'gator') {
      E('path', { d: `M ${x - 4} ${y - 6} L ${x} ${y} L ${x + 4} ${y - 6}`, stroke: 'url(#metalG)', 'stroke-width': 3, fill: 'none', 'stroke-linecap': 'round' }, g);
    } else {
      E('circle', { cx: x, cy: y, r: 2.1, fill: 'url(#metalG)' }, g);
    }
  }
  // invisible fat hit path for selection
  const hit = E('path', { d, stroke: 'rgba(0,0,0,0)', 'stroke-width': 12, fill: 'none' }, g);
  hit.addEventListener('pointerdown', (e) => { e.stopPropagation(); select({ kind: 'wire', wire: w }); });
}

function renderAll() {
  for (const inst of state.parts) renderPart(inst);
  for (const w of state.wires) renderWire(w);
}

// selection box
// Figma-style selection: a crisp bounding box with constant-size corner
// handles and a rotation handle floating above the top edge.
let selBox = null;
function refreshSelBox() {
  if (selBox) { selBox.remove(); selBox = null; }
  if (!sel) return;
  const isPart = sel.kind === 'part';
  const g = isPart ? sel.inst.g : sel.wire.g;
  const bb = g.getBBox();
  const m = g.getAttribute('transform') || '';
  const s = 1 / view.k;                 // keep chrome a constant on-screen size
  const pad = 6 * s;
  const x = bb.x - pad, y = bb.y - pad, w = bb.width + pad * 2, h = bb.height + pad * 2;
  selBox = E('g', { transform: m }, fxL);
  E('rect', { x, y, width: w, height: h, fill: 'none', stroke: '#2f6fed', 'stroke-width': 1.5 * s, 'pointer-events': 'none' }, selBox);
  if (!isPart) return;                  // wires: outline only

  // rotation handle above the top edge
  const cxm = x + w / 2, ry = y - 22 * s;
  E('line', { x1: cxm, y1: y, x2: cxm, y2: ry, stroke: '#2f6fed', 'stroke-width': 1.2 * s, 'pointer-events': 'none' }, selBox);
  const rot = E('circle', { cx: cxm, cy: ry, r: 5.5 * s, fill: '#fff', stroke: '#2f6fed', 'stroke-width': 1.6 * s }, selBox);
  rot.style.cursor = 'grab';
  rot.addEventListener('pointerdown', beginRotate);

  // corner handles (also grab to rotate — parts have no meaningful resize)
  const hs = 8 * s;
  for (const [hx, hy] of [[x, y], [x + w, y], [x, y + h], [x + w, y + h]]) {
    const sq = E('rect', {
      x: hx - hs / 2, y: hy - hs / 2, width: hs, height: hs, rx: 1.2 * s,
      fill: '#fff', stroke: '#2f6fed', 'stroke-width': 1.6 * s,
    }, selBox);
    sq.style.cursor = 'grab';
    sq.addEventListener('pointerdown', beginRotate);
  }
}

// ---------------------------------------------------------------- occupancy
function rebuildOcc() {
  occ.clear();
  for (const inst of state.parts) {
    if (inst.def.kind === 'board') for (const id of inst.holes) occ.set(id, inst.uid);
  }
  for (const w of state.wires) {
    if (w.a.hole) occ.set(w.a.hole, -1);
    if (w.b.hole) occ.set(w.b.hole, -1);
  }
}

// ---------------------------------------------------------------- mutations
function addPart(def, opts) {
  const inst = {
    uid: state.uid++,
    def,
    props: JSON.parse(JSON.stringify(def.props || {})),
    rt: {},
    ...opts,
  };
  if (opts.props) inst.props = { ...inst.props, ...opts.props };
  state.parts.push(inst);
  renderPart(inst);
  rebuildOcc();
  saveSoon();
  return inst;
}
function removeSelected() {
  if (!sel) return;
  if (sel.kind === 'part') {
    const inst = sel.inst;
    state.wires = state.wires.filter((w) => {
      const dead = (w.a.port && w.a.port[0] === inst.uid) || (w.b.port && w.b.port[0] === inst.uid);
      if (dead && w.g) w.g.remove();
      return !dead;
    });
    inst.g.remove();
    state.parts = state.parts.filter((p) => p !== inst);
  } else {
    sel.wire.g.remove();
    state.wires = state.wires.filter((w) => w !== sel.wire);
  }
  select(null);
  rebuildOcc();
  saveSoon();
}
function addWire(a, b, color, kind) {
  a.node = epNode(a);
  b.node = epNode(b);
  const w = { a, b, color, kind: kind || 'wire' };
  state.wires.push(w);
  renderWire(w);
  rebuildOcc();
  saveSoon();
  return w;
}

// ---------------------------------------------------------------- selection + inspector
function select(s) {
  sel = s;
  refreshSelBox();
  buildInspector();
}

function insRow(parent, labelText) {
  const row = document.createElement('div');
  row.className = 'ins-row';
  const label = document.createElement('label');
  label.textContent = labelText;
  row.appendChild(label);
  parent.appendChild(row);
  return row;
}

function buildInspector() {
  inspector.hidden = !sel;
  inspector.innerHTML = '';
  if (!sel) return;
  const h = document.createElement('h3');
  inspector.appendChild(h);

  if (sel.kind === 'wire') {
    h.textContent = sel.wire.kind === 'gator' ? 'alligator lead' : 'wire';
    const row = insRow(inspector, 'color');
    const s = document.createElement('select');
    for (const [c, name] of WIRE_COLORS) {
      const o = document.createElement('option');
      o.value = c; o.textContent = name;
      if (c === sel.wire.color) o.selected = true;
      s.appendChild(o);
    }
    s.onchange = () => { sel.wire.color = s.value; renderWire(sel.wire); refreshSelBox(); saveSoon(); };
    row.appendChild(s);
  } else {
    const inst = sel.inst;
    h.textContent = inst.def.name;
    const type = inst.def.sim?.type;

    if (type === 'resistor') {
      const row = insRow(inspector, 'value');
      const inp = document.createElement('input');
      inp.type = 'number'; inp.min = 1; inp.step = 1; inp.value = inst.props.ohms;
      inp.onchange = () => { inst.props.ohms = Math.max(1, +inp.value || 1000); renderPart(inst); refreshSelBox(); saveSoon(); };
      row.appendChild(inp);
      const note = document.createElement('div');
      note.className = 'ins-note';
      note.textContent = fmtOhm(inst.props.ohms);
      inspector.appendChild(note);
      inp.addEventListener('input', () => { note.textContent = fmtOhm(+inp.value || 0); });
    }
    if (type === 'pot') {
      const row = insRow(inspector, 'wiper');
      const rng = document.createElement('input');
      rng.type = 'range'; rng.min = 0; rng.max = 100; rng.value = Math.round((inst.props.t ?? 0.5) * 100);
      rng.oninput = () => { inst.props.t = +rng.value / 100; saveSoon(); };
      row.appendChild(rng);
    }
    if (type === 'led') {
      const row = insRow(inspector, 'color');
      const s = document.createElement('select');
      for (const c of ['red', 'green', 'yellow']) {
        const o = document.createElement('option');
        o.value = c; o.textContent = c;
        if (c === inst.props.color) o.selected = true;
        s.appendChild(o);
      }
      s.onchange = () => { inst.props.color = s.value; renderPart(inst); refreshSelBox(); saveSoon(); };
      row.appendChild(s);
    }
    if (type === 'ic') {
      const row = insRow(inspector, 'chip');
      const s = document.createElement('select');
      for (const d of CHIP_DEFS) {
        const o = document.createElement('option');
        o.value = d.id; o.textContent = d.name;
        if (d.id === inst.def.id) o.selected = true;
        s.appendChild(o);
      }
      s.onchange = () => { if (!changeChip(inst, s.value)) s.value = inst.def.id; };
      row.appendChild(s);
    }
    if (type === 'supply') {
      const row = insRow(inspector, 'volts');
      const inp = document.createElement('input');
      inp.type = 'number'; inp.min = 0; inp.max = 30; inp.step = 0.5; inp.value = inst.props.volts;
      inp.onchange = () => { inst.props.volts = Math.min(30, Math.max(0, +inp.value || 0)); saveSoon(); };
      row.appendChild(inp);
    }
    if (type === 'funcgen') {
      const row = insRow(inspector, 'freq (Hz)');
      const inp = document.createElement('input');
      inp.type = 'number'; inp.min = 0.1; inp.max = 1000; inp.step = 0.1; inp.value = inst.props.hz;
      inp.onchange = () => { inst.props.hz = Math.min(1000, Math.max(0.1, +inp.value || 2)); saveSoon(); };
      row.appendChild(inp);
    }
    if (type === 'spst') {
      const row = insRow(inspector, 'state');
      const b = document.createElement('button');
      b.textContent = inst.props.closed ? 'on' : 'off';
      b.className = '';
      b.style.cssText = 'border:none;border-radius:7px;padding:4px 12px;cursor:pointer;background:rgba(0,0,0,0.07)';
      b.onclick = () => { inst.props.closed = !inst.props.closed; b.textContent = inst.props.closed ? 'on' : 'off'; saveSoon(); };
      row.appendChild(b);
    }
    if (type === 'spdt') {
      const row = insRow(inspector, 'throw');
      const b = document.createElement('button');
      b.textContent = inst.props.side;
      b.style.cssText = 'border:none;border-radius:7px;padding:4px 12px;cursor:pointer;background:rgba(0,0,0,0.07)';
      b.onclick = () => { inst.props.side = inst.props.side === 'l' ? 'r' : 'l'; b.textContent = inst.props.side; saveSoon(); };
      row.appendChild(b);
    }
    if (type === 'button') {
      const note = document.createElement('div');
      note.className = 'ins-note';
      note.textContent = 'press and hold the cap to close the switch.';
      inspector.appendChild(note);
    }
    if (type === 'dmm') {
      const note = document.createElement('div');
      note.className = 'ins-note';
      note.textContent = 'wire COM and V\u03A9 ports to any two points to measure.';
      inspector.appendChild(note);
    }

    const actions = document.createElement('div');
    actions.className = 'ins-actions';
    const rb = document.createElement('button');
    rb.textContent = 'rotate (r)';
    rb.onclick = rotateSelected;
    actions.appendChild(rb);
    const db = document.createElement('button');
    db.textContent = 'delete';
    db.className = 'danger';
    db.onclick = removeSelected;
    actions.appendChild(db);
    inspector.appendChild(actions);
  }
}

// world-space center of a part (rotation pivot)
function partCenterWorld(inst) {
  if (inst.def.kind !== 'board') {
    const s = inst.def.size || { w: 40, h: 40 };
    return { x: inst.x + s.w / 2, y: inst.y + s.h / 2 };
  }
  const r = inst.g.getBoundingClientRect(), sr = svg.getBoundingClientRect();
  return {
    x: (r.left + r.width / 2 - sr.left - view.x) / view.k,
    y: (r.top + r.height / 2 - sr.top - view.y) / view.k,
  };
}
function rerenderPartWires(uid) {
  for (const wr of state.wires) {
    if ((wr.a.port && wr.a.port[0] === uid) || (wr.b.port && wr.b.port[0] === uid)) renderWire(wr);
  }
}

// all chip variants (only the first is shown in the palette; the rest are
// reachable via the inspector's chip picker)
const CHIP_DEFS = CATALOG.filter((d) => d.sim && d.sim.type === 'ic');

// swap a placed chip to a different variant, re-fitting its footprint in place
function changeChip(inst, newId) {
  const newDef = DEF_BY_ID.get(newId);
  if (!newDef || newDef === inst.def) return false;
  const a = HOLE_BY_ID.get(inst.holes[0]);
  for (const id of inst.holes) occ.delete(id);
  const fp = footprintAt(newDef, a.x, a.y, inst.rot || 0);
  if (!fp.ok) { rebuildOcc(); return false; }   // not enough room — keep current chip
  inst.def = newDef;
  inst.holes = fp.holes;
  inst.props = JSON.parse(JSON.stringify(newDef.props || {}));
  inst.rt = {};
  renderPart(inst);
  rebuildOcc();
  refreshSelBox();
  buildInspector();
  saveSoon();
  return true;
}

// snap a board part to an absolute 90° step, validating the footprint
function rotateBoardTo(inst, step) {
  step = ((step % 4) + 4) % 4;
  if (step === inst.rot) return;
  const a = HOLE_BY_ID.get(inst.holes[0]);
  const save = inst.rot;
  inst.rot = step;
  for (const id of inst.holes) occ.delete(id);
  const fp = footprintAt(inst.def, a.x, a.y, inst.rot);
  if (fp.ok) { inst.holes = fp.holes; positionPart(inst); }
  else { inst.rot = save; }
  rebuildOcc();
}

// drag the rotation/corner handle to spin the part (free = any angle, board = 90° snaps)
function beginRotate(e) {
  e.preventDefault();
  e.stopPropagation();
  if (!sel || sel.kind !== 'part') return;
  const inst = sel.inst;
  const isBoard = inst.def.kind === 'board';
  const c = partCenterWorld(inst);
  const start = toWorld(e);
  const startAng = Math.atan2(start.y - c.y, start.x - c.x);
  const base = isBoard ? inst.rot * 90 : (inst.ang || 0);
  const move = (ev) => {
    const w = toWorld(ev);
    let deg = base + (Math.atan2(w.y - c.y, w.x - c.x) - startAng) * 180 / Math.PI;
    if (isBoard) {
      rotateBoardTo(inst, Math.round(deg / 90));
    } else {
      if (ev.shiftKey) deg = Math.round(deg / 15) * 15;   // shift = 15° snaps
      inst.ang = ((deg % 360) + 360) % 360;
      positionPart(inst);
      rerenderPartWires(inst.uid);
    }
    refreshSelBox();
  };
  const up = () => {
    document.removeEventListener('pointermove', move);
    document.removeEventListener('pointerup', up);
    saveSoon();
  };
  document.addEventListener('pointermove', move);
  document.addEventListener('pointerup', up);
}

function rotateSelected() {
  if (!sel || sel.kind !== 'part') return;
  const inst = sel.inst;
  if (inst.def.kind === 'board') {
    rotateBoardTo(inst, inst.rot + 1);
  } else {
    inst.ang = (((inst.ang || 0) + 90) % 360);
    positionPart(inst);
    rerenderPartWires(inst.uid);
  }
  refreshSelBox();
  saveSoon();
}

// ---------------------------------------------------------------- wire color
let currentWireColor = '#3fa54a';
const wirebar = document.getElementById('wirebar');
const wbSwatches = document.getElementById('wb-swatches');
const wbColorInput = document.getElementById('wb-color');
const wbCustom = wbColorInput.closest('.wb-custom');

// Dock-style proximity magnification: swatches swell as the cursor nears them.
const MAG_MAX = 1.45;    // peak scale directly under the cursor
const MAG_RADIUS = 66;   // px of horizontal influence around the cursor
let magPointerX = null;  // last cursor x while hovering the bar (null = away)

function magItems() {
  return [...wbSwatches.children, wbCustom];
}
function baseScaleOf(el) {
  if (!el.classList.contains('active')) return 1;
  return el === wbCustom ? 1.35 : 1.42;
}
function updateMagnify() {
  for (const el of magItems()) {
    const base = baseScaleOf(el);          // selected rests bigger, always centered
    let mag = 1;
    if (magPointerX != null) {             // proximity swell is a hover-only effect
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const t = Math.max(0, 1 - Math.abs(magPointerX - cx) / MAG_RADIUS);
      const s = t * t * (3 - 2 * t);       // smoothstep falloff
      mag = 1 + (MAG_MAX - 1) * s;
    }
    // Always grow from the center so nothing pops up out of the bar.
    el.style.transformOrigin = 'center center';
    el.style.transform = `scale(${Math.max(base, mag)})`;
  }
}

function applyWireColor(color, fromCustom) {
  currentWireColor = color;
  [...wbSwatches.children].forEach((sw) => sw.classList.toggle('active', !fromCustom && sw.dataset.color === color));
  wbCustom.classList.toggle('active', !!fromCustom);
  updateMagnify();
  if (pendingWire) { pendingWire.color = color; }
  if (sel && sel.kind === 'wire') {
    sel.wire.color = color;
    renderWire(sel.wire);
    refreshSelBox();
    if (!inspector.hidden) buildInspector();
    saveSoon();
  }
}
function buildWireBar() {
  wbSwatches.innerHTML = '';
  for (const [color, name] of WIRE_COLORS) {
    const sw = document.createElement('div');
    sw.className = 'wb-sw';
    sw.style.background = color;
    sw.dataset.color = color;
    sw.title = name;
    sw.addEventListener('click', () => applyWireColor(color, false));
    wbSwatches.appendChild(sw);
  }
  wbColorInput.addEventListener('input', () => applyWireColor(wbColorInput.value, true));
  wirebar.addEventListener('pointermove', (e) => { magPointerX = e.clientX; updateMagnify(); });
  wirebar.addEventListener('pointerleave', () => { magPointerX = null; updateMagnify(); });
  applyWireColor(currentWireColor, false);
}

// ---------------------------------------------------------------- palette
const grid = document.getElementById('grid');

function thumbSVG(def) {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const t = def.thumb || { x: -10, y: -10, w: 80, h: 80 };
  s.setAttribute('viewBox', `${t.x} ${t.y} ${t.w} ${t.h}`);
  const g = E('g', {}, s);
  def.draw(g, { props: { ...(def.props || {}) }, def, rt: {} });
  return s;
}

// Palette thumbnails prefer a real photo. `thumbImg` shows a photo ONLY in the
// tray while the part still draws as vector on the canvas (so its legs snap into
// the holes); `img` shows the photo in both places. `filter`/`thumbFilter`
// hue-shift the photo so colour/value variants read distinctly.
function buildThumb(def) {
  const img = def.thumbImg || def.img;
  if (img) {
    const im = document.createElement('img');
    im.className = 'thumb-img';
    im.src = img;
    im.alt = def.name;
    im.draggable = false;
    const filter = def.thumbFilter || def.filter;
    if (filter) im.style.filter = filter;
    return im;
  }
  return thumbSVG(def);
}

function buildGrid() {
  grid.innerHTML = '';
  for (const def of CATALOG) {
    if (def.hidden) continue;                 // variants live behind the inspector picker
    const cell = document.createElement('div');
    cell.className = 'cell' + (def.kind === 'disabled' ? ' disabled' : '');
    cell.appendChild(buildThumb(def));
    const tip = document.createElement('div');
    tip.className = 'tip';
    tip.textContent = def.paletteName || def.name;
    cell.appendChild(tip);
    cell.addEventListener('pointerdown', (e) => startPaletteDrag(e, def));
    grid.appendChild(cell);
  }
}

// ---------------------------------------------------------------- floating wire
// Click a hole to drop one wire end there; the wire floats to the cursor until
// you click a second hole (or an instrument port), which drops the other end.
let fxTemp = [];
function clearFx() { for (const f of fxTemp) f.remove(); fxTemp = []; }
function markNode(n) {
  fxTemp.push(E('circle', { cx: n.x, cy: n.y, r: 6, fill: 'none', stroke: '#2f6fed', 'stroke-width': 2, 'pointer-events': 'none' }, fxL));
}
function drawWirePreview(from, to, color) {
  fxTemp.push(E('path', {
    d: wirePath(from.x, from.y, to.x, to.y),
    stroke: color, 'stroke-width': 3, fill: 'none', opacity: 0.6, 'stroke-linecap': 'round', 'pointer-events': 'none',
  }, fxL));
}

// ports on free instruments (supply, battery) — checked before part drag
function portAt(wx, wy) {
  for (const inst of state.parts) {
    if (!inst.def.ports) continue;
    for (const port of inst.def.ports) {
      const [px, py] = portWorld(inst, port);
      if (Math.hypot(px - wx, py - wy) < 11) {
        return { node: portNode(inst, port.name), port: [inst.uid, port.name], x: px, y: py };
      }
    }
  }
  return null;
}

function startWire(n) {
  select(null);
  pendingWire = {
    fromNode: n.node,
    from: n.hole ? { hole: n.hole } : { port: n.port },
    x: n.x, y: n.y,
    color: currentWireColor,
  };
  svg.classList.add('wiring');
  clearFx();
  markNode(n);
  setHint('wire end dropped \u2014 click another hole to place the other end \u00b7 esc to cancel');
  document.addEventListener('pointermove', onWireHover);
}
function onWireHover(ev) {
  if (!pendingWire) return;
  const w = toWorld(ev);
  clearFx();
  markNode({ x: pendingWire.x, y: pendingWire.y });
  const n = nodeAt(w.x, w.y);
  if (n) markNode(n);
  drawWirePreview(pendingWire, n ? { x: n.x, y: n.y } : w, pendingWire.color);
}
function cancelWire() {
  pendingWire = null;
  svg.classList.remove('wiring');
  clearFx();
  setHint('');
  document.removeEventListener('pointermove', onWireHover);
}
function finishWire(n) {
  if (n && n.node !== pendingWire.fromNode) {
    addWire(pendingWire.from, n.hole ? { hole: n.hole } : { port: n.port }, pendingWire.color, 'wire');
  }
  cancelWire();
}

// ---------------------------------------------------------------- palette drag placement
function startPaletteDrag(e, def) {
  e.preventDefault();
  if (pendingWire) cancelWire();
  const ghost = E('g', { opacity: 0.8, 'pointer-events': 'none' }, fxL);
  const inst = { props: { ...(def.props || {}) }, def, rt: {} };
  renderArt(ghost, inst);
  let valid = def.kind !== 'board';
  let lastFp = null;
  let wpos = { x: -9999, y: -9999 };

  const move = (ev) => {
    const w = toWorld(ev);
    wpos = w;
    if (def.kind === 'board') {
      lastFp = footprintAt(def, w.x, w.y, 0);
      valid = lastFp.ok;
      const ax = lastFp.anchor ? lastFp.anchor.x : w.x;
      const ay = lastFp.anchor ? lastFp.anchor.y : w.y;
      ghost.setAttribute('transform', `translate(${ax},${ay})`);
      ghost.setAttribute('opacity', valid ? 0.85 : 0.35);
    } else {
      const sz = def.size || { w: 60, h: 60 };
      ghost.setAttribute('transform', `translate(${w.x - sz.w / 2},${w.y - sz.h / 2})`);
    }
  };
  const up = (ev) => {
    document.removeEventListener('pointermove', move);
    document.removeEventListener('pointerup', up);
    ghost.remove();
    const overStage = ev.clientX > stage.getBoundingClientRect().left;
    if (!overStage) return;
    if (def.kind === 'board') {
      if (lastFp && lastFp.ok) {
        const inst2 = addPart(def, { holes: lastFp.holes, rot: 0 });
        select({ kind: 'part', inst: inst2 });
      }
    } else {
      const sz = def.size || { w: 60, h: 60 };
      const inst2 = addPart(def, { x: wpos.x - sz.w / 2, y: wpos.y - sz.h / 2 });
      select({ kind: 'part', inst: inst2 });
    }
  };
  document.addEventListener('pointermove', move);
  document.addEventListener('pointerup', up);
}

// ---------------------------------------------------------------- canvas interactions
svg.addEventListener('pointerdown', (e) => {
  const w = toWorld(e);

  // a floating wire is waiting for its second end
  if (pendingWire) {
    finishWire(nodeAt(w.x, w.y));
    return;
  }

  // an instrument port starts a wire (checked before dragging the instrument)
  const port = portAt(w.x, w.y);
  if (port) { startWire(port); return; }

  // part hit -> drag it
  let g = e.target;
  while (g && g !== svg && !(g.classList && g.classList.contains('part'))) g = g.parentNode;
  if (g && g !== svg) {
    const inst = state.parts.find((p) => p.uid === +g.dataset.uid);
    if (inst) { beginPartDrag(e, inst, w); return; }
  }

  // a breadboard hole -> drop the first end of a new wire
  const h = nearestHole(w.x, w.y, P * 0.55);
  if (h) { startWire({ node: baseNetOf(h.id), hole: h.id, x: h.x, y: h.y }); return; }

  // empty space -> pan + deselect
  beginPan(e);
  select(null);
});

function beginPan(e) {
  const start = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y };
  svg.classList.add('panning');
  const move = (ev) => {
    view.x = start.vx + (ev.clientX - start.x);
    view.y = start.vy + (ev.clientY - start.y);
    applyView();
  };
  const up = () => {
    svg.classList.remove('panning');
    document.removeEventListener('pointermove', move);
    document.removeEventListener('pointerup', up);
  };
  document.addEventListener('pointermove', move);
  document.addEventListener('pointerup', up);
}

function beginPartDrag(e, inst, startW) {
  e.preventDefault();
  let moved = false;
  const isBoard = inst.def.kind === 'board';
  const a0 = isBoard ? HOLE_BY_ID.get(inst.holes[0]) : null;
  const off = isBoard
    ? { x: startW.x - a0.x, y: startW.y - a0.y }
    : { x: startW.x - inst.x, y: startW.y - inst.y };
  const origHoles = isBoard ? [...inst.holes] : null;
  let lastFp = null;

  // momentary pushbutton press
  const type = inst.def.sim?.type;
  if (type === 'button') { inst.rt.pressed = true; }

  dragging = { inst };
  const move = (ev) => {
    const w = toWorld(ev);
    if (!moved && Math.hypot(w.x - startW.x, w.y - startW.y) < 5 / view.k) return;
    if (!moved && type === 'button') inst.rt.pressed = false;
    moved = true;
    if (isBoard) {
      lastFp = footprintAt(inst.def, w.x - off.x, w.y - off.y, inst.rot);
      const ax = lastFp.anchor ? lastFp.anchor.x : w.x - off.x;
      const ay = lastFp.anchor ? lastFp.anchor.y : w.y - off.y;
      inst.g.setAttribute('transform', `translate(${ax},${ay}) rotate(${inst.rot * 90})`);
      inst.g.setAttribute('opacity', lastFp.ok ? 1 : 0.4);
    } else {
      inst.x = w.x - off.x;
      inst.y = w.y - off.y;
      positionPart(inst);
      for (const wr of state.wires) {
        if ((wr.a.port && wr.a.port[0] === inst.uid) || (wr.b.port && wr.b.port[0] === inst.uid)) renderWire(wr);
      }
    }
    if (selBox) refreshSelBox();
  };
  const up = () => {
    document.removeEventListener('pointermove', move);
    document.removeEventListener('pointerup', up);
    dragging = null;
    if (type === 'button') inst.rt.pressed = false;
    if (!moved) {
      // simple click: toggles for switches, select for all
      if (type === 'spst') { inst.props.closed = !inst.props.closed; saveSoon(); }
      if (type === 'spdt') { inst.props.side = inst.props.side === 'l' ? 'r' : 'l'; saveSoon(); }
      select({ kind: 'part', inst });
      return;
    }
    if (isBoard) {
      if (lastFp && lastFp.ok) inst.holes = lastFp.holes;
      else inst.holes = origHoles;
      positionPart(inst);
      inst.g.setAttribute('opacity', 1);
      rebuildOcc();
    }
    refreshSelBox();
    saveSoon();
  };
  document.addEventListener('pointermove', move);
  document.addEventListener('pointerup', up);
}

svg.addEventListener('wheel', (e) => {
  e.preventDefault();
  const r = svg.getBoundingClientRect();
  const mx = e.clientX - r.left, my = e.clientY - r.top;
  const k0 = view.k;
  const k1 = Math.min(3, Math.max(0.35, k0 * Math.exp(-e.deltaY * 0.0016)));
  view.x = mx - ((mx - view.x) / k0) * k1;
  view.y = my - ((my - view.y) / k0) * k1;
  view.k = k1;
  applyView();
  refreshSelBox();   // keep selection chrome a constant on-screen size
}, { passive: false });

window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
  if (e.key === 'Escape') { cancelWire(); select(null); }
  if (e.key === 'r' || e.key === 'R') rotateSelected();
  if (e.key === 'Delete' || e.key === 'Backspace') removeSelected();
});

// ---------------------------------------------------------------- hints
function setHint(s) {
  if (hintEl) hintEl.textContent = s || '';
}

// ---------------------------------------------------------------- persistence
const SAVE_KEY = 'breadboard-sim-v1';
let saveTimer = null;
function saveSoon() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 350);
}
function save() {
  const data = {
    name: document.getElementById('projname').value,
    parts: state.parts.map((p) => ({
      def: p.def.id, props: p.props, rot: p.rot || 0, ang: p.ang || 0,
      holes: p.holes || null, x: p.x, y: p.y,
    })),
    wires: state.wires.map((w) => ({
      a: w.a.hole ? { hole: w.a.hole } : { port: [state.parts.findIndex((p) => p.uid === w.a.port[0]), w.a.port[1]] },
      b: w.b.hole ? { hole: w.b.hole } : { port: [state.parts.findIndex((p) => p.uid === w.b.port[0]), w.b.port[1]] },
      color: w.color, kind: w.kind,
    })),
  };
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); } catch (_) { /* full/blocked */ }
}
function load() {
  let data = null;
  try { data = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (_) { /* corrupted */ }
  if (!data) return;
  document.getElementById('projname').value = data.name || 'untitled circuit';
  for (const sp of data.parts || []) {
    const def = DEF_BY_ID.get(sp.def);
    if (!def) continue;
    addPart(def, { props: sp.props, rot: sp.rot, ang: sp.ang, holes: sp.holes || undefined, x: sp.x, y: sp.y });
  }
  for (const sw of data.wires || []) {
    const fix = (ep) => ep.hole ? { hole: ep.hole } : { port: [state.parts[ep.port[0]]?.uid, ep.port[1]] };
    const a = fix(sw.a), b = fix(sw.b);
    if ((a.port && a.port[0] === undefined) || (b.port && b.port[0] === undefined)) continue;
    addWire(a, b, sw.color, sw.kind);
  }
}

document.getElementById('btn-clear').addEventListener('click', () => {
  for (const p of state.parts) p.g.remove();
  for (const w of state.wires) w.g.remove();
  state.parts = [];
  state.wires = [];
  select(null);
  rebuildOcc();
  save();
});
document.getElementById('zoom-in').addEventListener('click', () => zoomStep(1));
document.getElementById('zoom-out').addEventListener('click', () => zoomStep(-1));
// Re-fit every frame while the parts panel slides so the board recenters
// gradually in sync with the panel (instead of one jump at the end).
let paletteAnim = 0;
document.getElementById('menu-toggle').addEventListener('click', () => {
  document.getElementById('app').classList.toggle('palette-hidden');
  cancelAnimationFrame(paletteAnim);
  const start = performance.now();
  const step = (now) => {
    fitView();                                  // stage width animates with the panel
    if (now - start < 360) paletteAnim = requestAnimationFrame(step);
  };
  paletteAnim = requestAnimationFrame(step);
});
document.getElementById('projname').addEventListener('change', saveSoon);

// ---------------------------------------------------------------- CircuitJS bridge
// CircuitJS is now self-hosted (same origin), so we can read the drawn circuit
// directly through its JS interface instead of asking the user to paste text.
const schEl = document.getElementById('schematic');
const schFrame = document.getElementById('sch-frame');
let cjSim = null;
function hookCircuitJS() {
  try {
    const win = schFrame.contentWindow;
    if (!win) return;
    if (win.CircuitJS1) cjSim = win.CircuitJS1;            // already booted
    win.oncircuitjsloaded = () => { cjSim = win.CircuitJS1; };
  } catch (_) { /* still loading */ }
}
schFrame.addEventListener('load', hookCircuitJS);
hookCircuitJS();

document.getElementById('btn-schematic').addEventListener('click', () => schEl.classList.toggle('open'));
document.getElementById('sch-close').addEventListener('click', () => schEl.classList.remove('open'));
document.getElementById('build-bb').addEventListener('click', () => {
  const status = document.getElementById('bridge-status');
  if (!cjSim) hookCircuitJS();
  if (!cjSim || typeof cjSim.exportCircuit !== 'function') {
    status.textContent = 'simulator still loading \u2014 try again in a moment';
    return;
  }
  try {
    status.textContent = importSchematic(cjSim.exportCircuit());
    fitView();
  } catch (err) {
    status.textContent = 'could not read the circuit';
    console.error(err);
  }
});

const RES_DEFS = CATALOG.filter((d) => d.sim && d.sim.type === 'resistor');
function nearestResistorDef(ohms) {
  let best = RES_DEFS[0], bd = Infinity;
  for (const d of RES_DEFS) {
    const diff = Math.abs(Math.log(d.props.ohms) - Math.log(ohms || 1000));
    if (diff < bd) { bd = diff; best = d; }
  }
  return best;
}

// Parse a CircuitJS "Export As Text" netlist and lay out a functional breadboard:
// components placed in a row, same-net pins joined by jumpers, power/ground to
// the rails. Supported: resistor, LED, switch, voltage source (R/v), ground, wire.
function importSchematic(text) {
  if (!text || !text.trim()) return 'draw a circuit in the simulator first';
  document.getElementById('btn-clear').click();   // start from a clean board

  // union-find over element coordinates (shared coords / wires => one net)
  const parent = new Map();
  const add = (a) => { if (!parent.has(a)) parent.set(a, a); };
  const find = (a) => { let r = a; while (parent.get(r) !== r) r = parent.get(r); let n = a; while (parent.get(n) !== r) { const nx = parent.get(n); parent.set(n, r); n = nx; } return r; };
  const uni = (a, b) => { add(a); add(b); const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); };
  const K = (x, y) => x + ',' + y;

  // Accepts either CircuitJS's newer XML export or the legacy text netlist.
  const elems = [];
  let skipped = 0;
  const pushEl = (type, x1, y1, x2, y2, ohms) => {
    if ([x1, y1, x2, y2].some((n) => Number.isNaN(n))) return;
    const a = K(x1, y1), b = K(x2, y2);
    add(a); add(b);
    if (type === 'w' || type === 'g') uni(a, b);
    elems.push({ type, a, b, ohms });
  };

  if (text.trim().startsWith('<')) {
    // XML: <cir> with <r/>, <LED/>, <s/>, <w/>, <g/>, <v/> children (x="x1 y1 x2 y2")
    const TAG = { r: 'r', LED: 'led', s: 's', w: 'w', g: 'g', v: 'v' };
    const doc = new DOMParser().parseFromString(text, 'text/xml');
    for (const el of doc.querySelectorAll('*')) {
      const tag = el.tagName;
      if (tag === 'cir' || tag === 'parsererror') continue;
      const c = (el.getAttribute('x') || '').trim().split(/\s+/).map(Number);
      const type = TAG[tag];
      if (!type) { if (c.length >= 4) skipped++; continue; }
      pushEl(type, c[0], c[1], c[2], c[3], parseFloat(el.getAttribute('r')));
    }
  } else {
    const SUP = new Set(['w', 'r', 'g', 'R', 'v', '162', 's']);
    for (const raw of text.split(/\r?\n/)) {
      const ln = raw.trim();
      if (!ln) continue;
      const tk = ln.split(/\s+/);
      const t0 = tk[0];
      if (t0 === '$' || t0 === 'o' || t0 === 'h' || t0 === '%' || t0 === 'B' || t0 === '38') continue;
      if (!SUP.has(t0)) { skipped++; continue; }
      const type = t0 === '162' ? 'led' : t0;
      pushEl(type, +tk[1], +tk[2], +tk[3], +tk[4], type === 'r' ? parseFloat(tk[6]) : NaN);
    }
  }

  // classify nets
  const ground = new Set(), plus = new Set();
  for (const e of elems) {
    if (e.type === 'g') ground.add(find(e.a));
    if (e.type === 'R') plus.add(find(e.a));
    if (e.type === 'v') { plus.add(find(e.b)); ground.add(find(e.a)); }
  }
  const isGround = (c) => ground.has(find(c));
  const isPlus = (c) => plus.has(find(c)) && !isGround(c);

  // rails: spread taps across rail holes (all one net each)
  let pr = 4, mr = 4;
  const nextPlus = () => `T+${Math.min(49, pr++)}`;
  const nextMinus = () => `T-${Math.min(49, mr++)}`;

  // free battery placed beside the board, terminals wired to the rails
  const supply = addPart(DEF_BY_ID.get('pow5'), { x: BODY.x - 78, y: BODY.y + BODY.h * 0.5 });
  addWire({ port: [supply.uid, 'pos'] }, { hole: nextPlus() }, '#d43c3c', 'wire');
  addWire({ port: [supply.uid, 'neg'] }, { hole: nextMinus() }, '#26262a', 'wire');

  const anchor = new Map();
  const connect = (hole, coord) => {
    if (isGround(coord)) { addWire({ hole }, { hole: nextMinus() }, '#26262a', 'wire'); return; }
    if (isPlus(coord)) { addWire({ hole }, { hole: nextPlus() }, '#d43c3c', 'wire'); return; }
    const r = find(coord);
    if (anchor.has(r)) addWire({ hole }, { hole: anchor.get(r) }, '#3fa54a', 'wire');
    else anchor.set(r, hole);
  };

  let col = 6, placed = { r: 0, led: 0, sw: 0 };
  const wrap = () => { if (col > 56) col = 6; };
  for (const e of elems) {
    if (e.type === 'r') {
      const ohms = e.ohms || 1000;
      addPart(nearestResistorDef(ohms), { holes: [`${col}c`, `${col + 3}c`], props: { ohms } });
      connect(`${col}c`, e.a); connect(`${col + 3}c`, e.b);
      col += 5; placed.r++;
    } else if (e.type === 'led') {
      addPart(DEF_BY_ID.get('led'), { holes: [`${col}c`, `${col + 1}c`] });
      connect(`${col}c`, e.a); connect(`${col + 1}c`, e.b);
      col += 3; placed.led++;
    } else if (e.type === 's') {
      addPart(DEF_BY_ID.get('button'), { holes: [`${col}e`, `${col + 2}e`, `${col}f`, `${col + 2}f`] });
      connect(`${col}e`, e.a); connect(`${col}f`, e.b);
      col += 4; placed.sw++;
    }
    wrap();
  }

  const parts = placed.r + placed.led + placed.sw;
  if (parts === 0) return skipped ? `no supported parts found (${skipped} unsupported skipped)` : 'no components found in netlist';
  let msg = `built ${placed.r} resistor(s), ${placed.led} LED(s), ${placed.sw} switch(es)`;
  if (skipped) msg += ` \u00b7 ${skipped} unsupported part(s) skipped`;
  return msg;
}

// ---------------------------------------------------------------- sim + dynamic render loop
let lastT = 0;
let dotsG = null;
function frame(ts) {
  const dt = Math.min(0.05, lastT ? (ts - lastT) / 1000 : 0.016);
  lastT = ts;
  const t = ts / 1000;

  const res = runSim(state, dt, t);

  if (dotsG) dotsG.remove();
  dotsG = E('g', { 'pointer-events': 'none' }, fxL);

  for (const inst of state.parts) {
    const type = inst.def.sim?.type;
    const rt = inst.rt;
    const dyn = inst._dyn;
    if (type === 'led' && dyn) {
      const b = rt.bright || 0;
      dyn.glow.setAttribute('opacity', (b * 0.95).toFixed(3));
      if (dyn.imageEl) dyn.imageEl.style.filter = dyn.base + (b > 0.05 ? ` brightness(${(1 + b * 0.6).toFixed(2)})` : '');
      if (dyn.body) dyn.body.setAttribute('fill', b > 0.04 ? dyn.colorFill[inst.props.color] : dyn.colorDim[inst.props.color]);
    } else if (type === 'button' && dyn) {
      dyn.cap.setAttribute('r', rt.pressed ? 7.4 : 8.4);
      dyn.cap.setAttribute('fill', rt.pressed ? '#9ea3ab' : 'url(#metalG)');
    } else if (type === 'spst' && dyn) {
      dyn.knob.setAttribute('x', inst.props.closed ? dyn.onX : dyn.offX);
    } else if (type === 'spdt' && dyn) {
      const dir = inst.props.side === 'r' ? 1 : -1;
      dyn.lever.setAttribute('x2', P + dir * 10);
    } else if (type === 'pot' && dyn) {
      const ang = (inst.props.t ?? 0.5) * 270 - 135;
      dyn.slot.setAttribute('transform', `rotate(${ang} ${dyn.cx} ${dyn.cy})`);
    } else if (type === 'dmm' && dyn) {
      dyn.disp.textContent = rt.reading || '-- --';
    } else if (type === 'supply' && dyn) {
      dyn.disp.textContent = `${(+inst.props.volts).toFixed(1)} V`;
    } else if (type === 'funcgen' && dyn) {
      dyn.disp.textContent = `${(+inst.props.hz).toFixed(1)} Hz`;
    }
    // logic-level dots on powered IC outputs
    if (type === 'ic' && rt.powered && rt.outs) {
      const a = HOLE_BY_ID.get(inst.holes[0]);
      for (const [name, level] of Object.entries(rt.outs)) {
        const i = inst.def.pins.findIndex((p) => p.name === name);
        if (i < 0) continue;
        const [dx, dy] = rotXY(inst.def.pins[i].x, inst.def.pins[i].y, inst.rot || 0);
        E('circle', {
          cx: a.x + dx * P, cy: a.y + dy * P, r: 2.6,
          fill: level ? '#3adb6a' : '#b23c3c', opacity: 0.85,
        }, dotsG);
      }
    }
  }
  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------- boot
buildWireBar();
buildGrid();
setHint('');
load();
fitView();
requestAnimationFrame(frame);
window.addEventListener('resize', fitView);
