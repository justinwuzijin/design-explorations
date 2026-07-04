// Breadboard simulator: palette, placement, wiring, inspector, sim loop.

import { P, E, BODY, buildBoard, nearestHole, HOLE_BY_ID, baseNetOf } from './board.js';
import { CATALOG, CATS, DEF_BY_ID, WIRE_COLORS, fmtOhm } from './parts.js';
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

// ---------------------------------------------------------------- state
const state = { parts: [], wires: [], uid: 1 };
let view = { x: 60, y: 60, k: 1 };
let sel = null;                    // {kind:'part', inst} | {kind:'wire', wire}
let wireMode = null;               // {color, kind, from?}
let dragging = null;               // active pointer interaction
const occ = new Map();             // holeId -> occupant uid ('w'+i for wires)

buildBoard(boardL);

// ---------------------------------------------------------------- view
function applyView() {
  world.setAttribute('transform', `translate(${view.x},${view.y}) scale(${view.k})`);
}
function fitView() {
  const w = stage.clientWidth, h = stage.clientHeight;
  const k = Math.min((w - 90) / BODY.w, (h - 260) / BODY.h, 1.15);
  view = { k, x: (w - BODY.w * k) / 2 - BODY.x * k, y: 54, };
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

function nodeAt(wx, wy) {
  const h = nearestHole(wx, wy, P * 0.55);
  if (h) return { node: baseNetOf(h.id), hole: h.id, x: h.x, y: h.y };
  for (const inst of state.parts) {
    if (!inst.def.ports) continue;
    for (const port of inst.def.ports) {
      const px = inst.x + port.x, py = inst.y + port.y;
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
  return [inst.x + port.x, inst.y + port.y];
}
function epNode(ep) {
  return ep.hole ? baseNetOf(ep.hole) : `q${ep.port[0]}:${ep.port[1]}`;
}

// ---------------------------------------------------------------- rendering
function renderPart(inst) {
  if (inst.g) inst.g.remove();
  const g = E('g', { class: 'part' }, partsL);
  inst.g = g;
  g.dataset.uid = inst.uid;
  inst._dyn = null;
  inst.def.draw(g, inst);
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
    inst.g.setAttribute('transform', `translate(${inst.x},${inst.y})`);
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
let selBox = null;
function refreshSelBox() {
  if (selBox) { selBox.remove(); selBox = null; }
  if (!sel) return;
  let bb, pad = 7;
  if (sel.kind === 'part') bb = sel.inst.g.getBBox();
  else bb = sel.wire.g.getBBox();
  const g = sel.kind === 'part' ? sel.inst.g : sel.wire.g;
  const m = g.getAttribute('transform') || '';
  selBox = E('rect', {
    x: bb.x - pad, y: bb.y - pad, width: bb.width + pad * 2, height: bb.height + pad * 2,
    rx: 6, fill: 'none', stroke: '#2f6fed', 'stroke-width': 1.4, 'stroke-dasharray': '5 4',
    transform: m, 'pointer-events': 'none',
  }, fxL);
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
    if (inst.def.kind === 'board') {
      const rb = document.createElement('button');
      rb.textContent = 'rotate (r)';
      rb.onclick = rotateSelected;
      actions.appendChild(rb);
    }
    const db = document.createElement('button');
    db.textContent = 'delete';
    db.className = 'danger';
    db.onclick = removeSelected;
    actions.appendChild(db);
    inspector.appendChild(actions);
  }
}

function rotateSelected() {
  if (!sel || sel.kind !== 'part' || sel.inst.def.kind !== 'board') return;
  const inst = sel.inst;
  const a = HOLE_BY_ID.get(inst.holes[0]);
  const saveRot = inst.rot;
  inst.rot = (inst.rot + 1) % 4;
  // temporarily free own holes for validation
  const fp = (() => {
    for (const id of inst.holes) occ.delete(id);
    const r = footprintAt(inst.def, a.x, a.y, inst.rot);
    return r;
  })();
  if (fp.ok) {
    inst.holes = fp.holes;
    positionPart(inst);
  } else {
    inst.rot = saveRot;
  }
  rebuildOcc();
  refreshSelBox();
  saveSoon();
}

// ---------------------------------------------------------------- palette
const catsNav = document.getElementById('cats');
const grid = document.getElementById('grid');
let activeCat = 'wiring';

function buildCats() {
  catsNav.innerHTML = '';
  for (const [id, label] of CATS) {
    const a = document.createElement('a');
    a.textContent = label;
    a.className = id === activeCat ? 'active' : '';
    a.onclick = () => { activeCat = id; buildCats(); buildGrid(); };
    catsNav.appendChild(a);
  }
}

function thumbSVG(def) {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const t = def.thumb || { x: -10, y: -10, w: 80, h: 80 };
  s.setAttribute('viewBox', `${t.x} ${t.y} ${t.w} ${t.h}`);
  const g = E('g', {}, s);
  def.draw(g, { props: { ...(def.props || {}) }, def, rt: {} });
  return s;
}

function buildGrid() {
  grid.innerHTML = '';
  for (const def of CATALOG) {
    if (def.cat !== activeCat) continue;
    const cell = document.createElement('div');
    cell.className = 'cell' + (def.kind === 'disabled' ? ' disabled' : '');
    cell.appendChild(thumbSVG(def));
    const tip = document.createElement('div');
    tip.className = 'tip';
    tip.textContent = def.name;
    cell.appendChild(tip);
    if (def.kind === 'wiremode') {
      cell.addEventListener('pointerdown', (e) => { e.preventDefault(); enterWireMode(def); });
    } else if (def.kind !== 'disabled') {
      cell.addEventListener('pointerdown', (e) => startPaletteDrag(e, def));
    }
    grid.appendChild(cell);
  }
}

// ---------------------------------------------------------------- wire mode
function enterWireMode(def) {
  wireMode = { color: def.color, kind: def.wireKind, from: null };
  svg.classList.add('wiring');
  setHint('wire: click a hole (or an instrument port), then a second one. esc to stop.');
}
function exitWireMode() {
  wireMode = null;
  svg.classList.remove('wiring');
  clearFx();
  setHint('');
}
let fxTemp = [];
function clearFx() { for (const f of fxTemp) f.remove(); fxTemp = []; }
function drawWirePreview(from, to) {
  clearFx();
  fxTemp.push(E('path', {
    d: wirePath(from.x, from.y, to.x, to.y),
    stroke: wireMode.color, 'stroke-width': 3, fill: 'none', opacity: 0.55, 'stroke-linecap': 'round', 'pointer-events': 'none',
  }, fxL));
}
function markNode(n) {
  fxTemp.push(E('circle', { cx: n.x, cy: n.y, r: 6, fill: 'none', stroke: '#2f6fed', 'stroke-width': 2, 'pointer-events': 'none' }, fxL));
}

// ---------------------------------------------------------------- palette drag placement
function startPaletteDrag(e, def) {
  e.preventDefault();
  const ghost = E('g', { opacity: 0.8, 'pointer-events': 'none' }, fxL);
  const inst = { props: { ...(def.props || {}) }, def, rt: {} };
  def.draw(ghost, inst);
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

  // wiring mode
  if (wireMode) {
    const n = nodeAt(w.x, w.y);
    if (!n) {
      if (!wireMode.from) exitWireMode();
      else { wireMode.from = null; clearFx(); }
      return;
    }
    if (!wireMode.from) {
      wireMode.from = n;
      markNode(n);
    } else if (n.node !== wireMode.from.node || n.hole !== wireMode.from.hole) {
      addWire(
        wireMode.from.hole ? { hole: wireMode.from.hole } : { port: wireMode.from.port },
        n.hole ? { hole: n.hole } : { port: n.port },
        wireMode.color, wireMode.kind,
      );
      wireMode.from = null;
      clearFx();
    }
    return;
  }

  // part hit?
  let g = e.target;
  while (g && g !== svg && !(g.classList && g.classList.contains('part'))) g = g.parentNode;
  if (g && g !== svg) {
    const inst = state.parts.find((p) => p.uid === +g.dataset.uid);
    if (inst) { beginPartDrag(e, inst, w); return; }
  }

  // quick-wire from a hole
  const n = nodeAt(w.x, w.y);
  if (n && n.hole && !occ.has(n.hole)) {
    beginQuickWire(e, n);
    return;
  }

  // else: pan
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

function beginQuickWire(e, from) {
  const railColor = from.hole && from.hole.includes('+') ? '#d43c3c'
    : from.hole && from.hole.includes('-') ? '#26262a' : '#3fa54a';
  wireMode = { color: railColor, kind: 'wire', from, quick: true };
  markNode(from);
  const move = (ev) => {
    const w = toWorld(ev);
    drawWirePreview(from, w);
  };
  const up = (ev) => {
    document.removeEventListener('pointermove', move);
    document.removeEventListener('pointerup', up);
    const w = toWorld(ev);
    const n = nodeAt(w.x, w.y);
    if (n && (n.hole !== from.hole || n.port)) {
      addWire(
        { hole: from.hole },
        n.hole ? { hole: n.hole } : { port: n.port },
        railColor, 'wire',
      );
    }
    wireMode = null;
    clearFx();
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
}, { passive: false });

window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
  if (e.key === 'Escape') { exitWireMode(); select(null); }
  if (e.key === 'r' || e.key === 'R') rotateSelected();
  if (e.key === 'Delete' || e.key === 'Backspace') removeSelected();
});

// ---------------------------------------------------------------- hints
function setHint(s) {
  hintEl.textContent = s || 'drag parts from the left \u00B7 drag hole to hole to wire \u00B7 scroll to zoom \u00B7 r rotates \u00B7 click a part to edit it';
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
      def: p.def.id, props: p.props, rot: p.rot || 0,
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
    addPart(def, { props: sp.props, rot: sp.rot, holes: sp.holes || undefined, x: sp.x, y: sp.y });
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
document.getElementById('btn-fit').addEventListener('click', fitView);
document.getElementById('projname').addEventListener('change', saveSoon);

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
      dyn.glow.setAttribute('opacity', (b * 0.9).toFixed(3));
      dyn.body.setAttribute('fill', b > 0.04 ? dyn.colorFill[inst.props.color] : dyn.colorDim[inst.props.color]);
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
buildCats();
buildGrid();
setHint('');
load();
fitView();
requestAnimationFrame(frame);
window.addEventListener('resize', fitView);
