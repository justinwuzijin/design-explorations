// Bidirectional CircuitJS schematic ↔ breadboard conversion.
// Import uses live CircuitJS element posts (accurate gate pin geometry).
// Export rebuilds a conventional gate-level schematic from the breadboard.

import { BODY, HOLE_BY_ID, baseNetOf, COLS, RAIL_COUNT } from './board.js?v=3';
import { CATALOG, DEF_BY_ID } from './parts.js?v=33';

// ---- gate / IC packing tables ------------------------------------------------

export const GATE_TO_IC = {
  inverter: { id: 'hc14', gatesPerChip: 6, inputs: 1 },
  and:      { id: 'hc08', gatesPerChip: 4, inputs: 2 },
  or:       { id: 'hc32', gatesPerChip: 4, inputs: 2 },
  nand:     { id: 'hc00', gatesPerChip: 4, inputs: 2 },
  nor:      { id: 'hc02', gatesPerChip: 4, inputs: 2 },
  xor:      { id: 'hc86', gatesPerChip: 4, inputs: 2 },
  dff:      { id: 'cd4013', gatesPerChip: 2, inputs: 2 },
};

// CircuitJS JS class name → our gate type
const ELM_GATE = {
  InverterElm: 'inverter',
  InvertingSchmittElm: 'inverter',
  AndGateElm: 'and',
  OrGateElm: 'or',
  NandGateElm: 'nand',
  NorGateElm: 'nor',
  XorGateElm: 'xor',
  XnorGateElm: 'xnor', // unsupported on breadboard (no HC XNOR) — reported
  DFlipFlopElm: 'dff',
};

// Text dump-type codes (legacy .txt circuits)
const DUMP_GATE = {
  73: 'inverter',
  150: 'and',
  151: 'nand',
  152: 'or',
  153: 'nor',
  154: 'xor',
  155: 'dff',
};

// Pin-index maps keyed by def.pins order from dipPins()
// (upper L→R = VCC…pin8, lower L→R = pin1…GND)
function gatePinMap(gateType, slot) {
  if (gateType === 'inverter') {
    return [
      { input: [7], output: 8 },
      { input: [9], output: 10 },
      { input: [11], output: 12 },
      { input: [5], output: 6 },
      { input: [3], output: 4 },
      { input: [1], output: 2 },
    ][slot];
  }
  if (gateType === 'nor') {
    // 74HC02: Y,A,B order on each gate
    return [
      { input: [8, 9], output: 7 },
      { input: [11, 12], output: 10 },
      { input: [6, 5], output: 4 },
      { input: [3, 2], output: 1 },
    ][slot];
  }
  if (gateType === 'dff') {
    return [
      { input: [9, 11], output: 7, qn: 8, rst: 10, set: 12 }, // CLK1,D1→Q1
      { input: [3, 5], output: 1, qn: 2, rst: 4, set: 6 },   // CLK2,D2→Q2
    ][slot];
  }
  // HC08 / HC00 / HC32 / HC86
  return [
    { input: [7, 8], output: 9 },
    { input: [10, 11], output: 12 },
    { input: [5, 4], output: 6 },
    { input: [2, 1], output: 3 },
  ][slot];
}

// DIP hole layout matching dipPins geometry (14-pin, half=7)
function dip14Holes(icCol) {
  return [
    `${icCol}e`, `${icCol + 1}e`, `${icCol + 2}e`, `${icCol + 3}e`,
    `${icCol + 4}e`, `${icCol + 5}e`, `${icCol + 6}e`,
    `${icCol}f`, `${icCol + 1}f`, `${icCol + 2}f`, `${icCol + 3}f`,
    `${icCol + 4}f`, `${icCol + 5}f`, `${icCol + 6}f`,
  ];
}

const RES_DEFS = CATALOG.filter((d) => d.sim?.type === 'resistor');
function nearestResistorDef(ohms) {
  let best = RES_DEFS[0], bd = Infinity;
  for (const d of RES_DEFS) {
    const diff = Math.abs(Math.log(d.props.ohms) - Math.log(ohms || 1000));
    if (diff < bd) { bd = diff; best = d; }
  }
  return best;
}

function railHoleNear(rail, col) {
  let best = 0, bd = Infinity;
  for (let i = 0; i < RAIL_COUNT; i++) {
    const rc = 2 + i + Math.floor(i / 5);
    const d = Math.abs(rc - col);
    if (d < bd) { bd = d; best = i; }
  }
  return `${rail}${best}`;
}

const NET_COLORS = ['#3fa54a', '#2f6fed', '#e07b39', '#8e44ad', '#16a085', '#e8b53a'];

const SKIP_TYPES = new Set([
  'ScopeElm', 'OutputElm', 'ProbeElm', 'BoxElm', 'TextElm', 'GraphicElm',
  'RelayElm',
]);

const UNSUPPORTED_HINT = {
  CapacitorElm: 'capacitor', InductorElm: 'inductor', DiodeElm: 'diode',
  NTransistorElm: 'transistor', PTransistorElm: 'transistor',
  NMosfetElm: 'MOSFET', PMosfetElm: 'MOSFET', OpAmpElm: 'op-amp',
  TransformerElm: 'transformer', CurrentElm: 'current source',
  XnorGateElm: 'XNOR gate (no breadboard IC)',
  JKFlipFlopElm: 'JK flip-flop', TFlipFlopElm: 'T flip-flop',
  CounterElm: 'counter', MultiplexerElm: 'multiplexer',
};

// ---- read live CircuitJS circuit --------------------------------------------

function postKey(p) {
  return `${Math.round(p.x_0)},${Math.round(p.y_0)}`;
}

/** Read connectivity from live CircuitJS elements (preferred). */
export function readLiveCircuit(sim) {
  if (!sim || typeof sim.getElements !== 'function') {
    throw new Error('CircuitJS simulator not ready');
  }
  const elms = sim.getElements();
  const parent = new Map();
  const add = (a) => { if (!parent.has(a)) parent.set(a, a); };
  const find = (a) => {
    let r = a;
    while (parent.get(r) !== r) r = parent.get(r);
    let n = a;
    while (parent.get(n) !== r) { const nx = parent.get(n); parent.set(n, r); n = nx; }
    return r;
  };
  const uni = (a, b) => {
    add(a); add(b);
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };

  const elems = [];   // passives / switches / wires / power markers
  const gates = [];   // logic
  const unsupported = new Set();

  for (const elm of elms) {
    const type = elm.getType();
    if (SKIP_TYPES.has(type)) continue;

    const n = elm.getPostCount();
    const posts = [];
    for (let i = 0; i < n; i++) {
      const p = elm.getPost(i);
      if (!p) continue;
      const k = postKey(p);
      add(k);
      posts.push(k);
    }
    if (!posts.length) continue;

    if (type === 'WireElm') {
      if (posts.length >= 2) uni(posts[0], posts[1]);
      elems.push({ type: 'w', a: posts[0], b: posts[1] });
      continue;
    }
    if (type === 'GroundElm') {
      elems.push({ type: 'g', a: posts[0], b: posts[0] });
      continue;
    }
    if (type === 'RailElm') {
      // high/low rail — treat as voltage marker on that net
      const info = (elm.getInfo?.() || []).join(' ').toLowerCase();
      const isGnd = info.includes('ground') || info.includes('0 v');
      elems.push({ type: isGnd ? 'g' : 'v', a: posts[0], b: posts[0], volts: elm.maxVoltage_0 ?? 5 });
      continue;
    }
    if (type === 'VoltageElm' || type === 'DCVoltageElm') {
      // post0 = negative end (point1), post1 = positive (point2) for DC
      elems.push({
        type: 'v', a: posts[0], b: posts[1] || posts[0],
        volts: elm.maxVoltage_0 ?? 5,
      });
      continue;
    }
    if (type === 'ResistorElm') {
      elems.push({ type: 'r', a: posts[0], b: posts[1], ohms: elm.resistance || 1000 });
      continue;
    }
    if (type === 'LEDElm') {
      elems.push({ type: 'led', a: posts[0], b: posts[1] }); // a=anode side typically point1
      continue;
    }
    if (type === 'SwitchElm' || type === 'PushSwitchElm' || type === 'Switch2Elm'
      || type === 'AnalogSwitchElm' || type === 'AnalogSwitch2Elm') {
      // Analog switches in lab circuits are used as CLK/Reset push contacts
      if (posts.length >= 2) elems.push({ type: 's', a: posts[0], b: posts[1] });
      continue;
    }
    if (type === 'LogicInputElm') {
      elems.push({ type: 'lin', a: posts[0], b: posts[0] });
      continue;
    }
    if (type === 'LogicOutputElm') {
      elems.push({ type: 'lout', a: posts[0], b: posts[0] });
      continue;
    }

    if (type in ELM_GATE) {
      const gateType = ELM_GATE[type];
      if (gateType === 'xnor') {
        unsupported.add(UNSUPPORTED_HINT.XnorGateElm);
        continue;
      }
      if (gateType === 'dff') {
        // posts: 0=D, 1=Q, 2=Qn, 3=CLK, optional 4=R, 5=S
        gates.push({
          gateType: 'dff',
          inputs: [posts[3], posts[0]], // CLK, D
          output: posts[1],
          qn: posts[2],
          rst: posts[4] || null,
          set: posts[5] || null,
        });
        continue;
      }
      const inputCount = Math.max(1, posts.length - 1);
      const inputs = posts.slice(0, inputCount);
      const output = posts[inputCount];
      gates.push({ gateType, inputs, output });
      continue;
    }

    if (UNSUPPORTED_HINT[type]) unsupported.add(UNSUPPORTED_HINT[type]);
    else unsupported.add(type.replace(/Elm$/, ''));
  }

  // Expand 3+/N-input gates into binary trees of 2-input gates (74xx packing)
  const expanded = expandMultiInputGates(gates, add);
  return { elems, gates: expanded, find, unsupported, parent };
}

/** Turn a 4-input OR/AND/etc into a tree of 2-input gates. */
function expandMultiInputGates(gates, add) {
  const out = [];
  let seq = 0;
  for (const g of gates) {
    const info = GATE_TO_IC[g.gateType];
    if (!info || g.gateType === 'dff' || g.gateType === 'inverter') {
      out.push(g);
      continue;
    }
    const maxIn = info.inputs;
    if (g.inputs.length <= maxIn) {
      out.push(g);
      continue;
    }
    // Left-associative reduction: (((a∨b)∨c)∨d)
    let acc = g.inputs[0];
    for (let i = 1; i < g.inputs.length; i++) {
      const isLast = i === g.inputs.length - 1;
      const dest = isLast ? g.output : `__t${seq++}`;
      if (!isLast) add(dest);
      out.push({ gateType: g.gateType, inputs: [acc, g.inputs[i]], output: dest });
      acc = dest;
    }
  }
  return out;
}

// ---- schematic → breadboard -------------------------------------------------

/**
 * @param {object} circuit  from readLiveCircuit()
 * @param {object} api      { addPart, addWire, clearBoard }
 */
export function buildBreadboard(circuit, api) {
  const { elems, gates, find, unsupported } = circuit;
  if (unsupported.size) {
    return `can't build — unsupported part(s): ${[...unsupported].join(', ')}. supported: resistor, LED, switch, logic gates, D flip-flops, logic in/out, power, ground.`;
  }
  const hasPassive = elems.some((e) => ['r', 'led', 's', 'lin', 'lout'].includes(e.type));
  if (!hasPassive && !gates.length) {
    return 'nothing to build — add a resistor, LED, switch, logic gate, or logic I/O';
  }

  // Pack gates into physical ICs
  const chipInstances = [];
  const gateToChip = new Map();
  for (const gate of gates) {
    const icInfo = GATE_TO_IC[gate.gateType];
    if (!icInfo) continue;
    let chip = chipInstances.find((c) =>
      c.type === gate.gateType && c.gates.length < icInfo.gatesPerChip);
    if (!chip) {
      const icDef = DEF_BY_ID.get(icInfo.id);
      if (!icDef) continue;
      chip = { type: gate.gateType, icDef, gates: [] };
      chipInstances.push(chip);
    }
    const slot = chip.gates.length;
    chip.gates.push(gate);
    gateToChip.set(gate, { chip, slot });
  }

  const dffCount = gates.filter((g) => g.gateType === 'dff').length;
  if (dffCount > 8) {
    return `can't build — schematic has ${dffCount} flip-flops (looks like two circuits in one file). Import one circuit: lab4-counter.txt or lab4-traffic.txt.`;
  }

  // 14-pin DIPs span 7 columns (pitch 7). Pushbuttons straddle the ravine (e/f)
  // in a left reserve so they never share a column with an IC.
  const IC_PITCH = 7;
  const SWITCH_COLS = 8; // cols 1..7 for switches; ICs start at 8
  const icStart = SWITCH_COLS;
  const icColsNeeded = chipInstances.length
    ? icStart + (chipInstances.length - 1) * IC_PITCH + 6
    : 0;
  if (icColsNeeded > COLS) {
    return `can't build — ${chipInstances.length} ICs need columns through ${icColsNeeded}, board has ${COLS}. Import one circuit at a time (Lab 4 has two — use lab4-counter.txt or lab4-traffic.txt).`;
  }

  api.clearBoard();

  // Classify power nets
  const ground = new Set(), plus = new Set();
  for (const e of elems) {
    if (e.type === 'g') ground.add(find(e.a));
    if (e.type === 'v') {
      if (e.a === e.b) plus.add(find(e.a));
      else { ground.add(find(e.a)); plus.add(find(e.b)); }
    }
  }
  const isGroundR = (root) => ground.has(root);
  const isPlusR = (root) => plus.has(root) && !ground.has(root);

  // Hole occupancy: part pins + each wire end get a unique hole (breadboard rule).
  const occupied = new Set();
  const markHoles = (holes) => { for (const h of holes || []) if (h) occupied.add(h); };
  const TOP_TAP = ['a', 'b', 'c', 'd']; // leave e for DIP / button pins
  const BOT_TAP = ['j', 'i', 'h', 'g']; // leave f for DIP / button pins
  const allocTap = (col, top) => {
    if (col < 1 || col > COLS) return null;
    for (const r of (top ? TOP_TAP : BOT_TAP)) {
      const id = `${col}${r}`;
      if (!HOLE_BY_ID.has(id) || occupied.has(id)) continue;
      occupied.add(id);
      return id;
    }
    return null;
  };
  const usedRails = new Set();
  const allocRail = (rail, col) => {
    let best = null, bd = Infinity;
    for (let i = 0; i < RAIL_COUNT; i++) {
      const id = `${rail}${i}`;
      if (!HOLE_BY_ID.has(id) || occupied.has(id) || usedRails.has(id)) continue;
      const rc = 2 + i + Math.floor(i / 5);
      const d = Math.abs(rc - col);
      if (d < bd) { bd = d; best = id; }
    }
    if (best) { usedRails.add(best); occupied.add(best); }
    return best;
  };

  const netHome = new Map();
  const powerPlus = new Map();  // key col:top → {col,top}
  const powerMinus = new Map();
  const jumpers = [];
  const registerNet = (root, col, top) => {
    if (col < 1 || col > COLS) return;
    if (isGroundR(root)) { powerMinus.set(`${col}:${top ? 1 : 0}`, { col, top }); return; }
    if (isPlusR(root)) { powerPlus.set(`${col}:${top ? 1 : 0}`, { col, top }); return; }
    if (netHome.has(root)) {
      const h = netHome.get(root);
      if (h.col !== col || h.top !== top) jumpers.push({ a: h, b: { col, top } });
    } else netHome.set(root, { col, top });
  };

  const placed = { r: 0, led: 0, sw: 0, lin: 0, lout: 0 };
  let swCursor = 1;

  // 1) Pushbuttons straddle the ravine (e↔f) so they bridge top and bottom halves
  for (const e of elems) {
    if (e.type !== 's' && e.type !== 'lin') continue;
    if (swCursor + 2 >= SWITCH_COLS) break;
    const c0 = swCursor;
    if (e.type === 'lin') {
      const pull = nearestResistorDef(10000);
      const pullCol = Math.min(c0 + 3, SWITCH_COLS - 1);
      const pullHoles = [`${c0}b`, `${pullCol}b`];
      api.addPart(pull, { holes: pullHoles, rot: 0, props: { ohms: 10000 } });
      markHoles(pullHoles);
      placed.r++;
      powerPlus.set(`${pullCol}:1`, { col: pullCol, top: true });
    }
    const btnHoles = [`${c0}e`, `${c0 + 2}e`, `${c0}f`, `${c0 + 2}f`];
    api.addPart(DEF_BY_ID.get('button'), { holes: btnHoles, rot: 0 });
    markHoles(btnHoles);
    const netA = find(e.a), netB = find(e.b || e.a);
    if (e.type === 'lin') {
      // signal on top, ground on bottom — press bridges halves
      registerNet(netA, c0, true);
      powerMinus.set(`${c0}:0`, { col: c0, top: false });
      placed.lin++;
    } else if (isGroundR(netA)) {
      registerNet(netA, c0, true);
      registerNet(netA, c0, false);
      registerNet(netB, c0 + 2, true);
      placed.sw++;
    } else if (isGroundR(netB)) {
      registerNet(netA, c0, true);
      registerNet(netB, c0 + 2, true);
      registerNet(netB, c0 + 2, false);
      placed.sw++;
    } else {
      registerNet(netA, c0, true);
      registerNet(netB, c0 + 2, true);
      placed.sw++;
    }
    swCursor = c0 + 3;
  }

  // 2) ICs packed along the ravine starting after the switch reserve
  const icPlacements = [];
  const icPower = [];
  let icCol = icStart;
  for (const chip of chipInstances) {
    if (icCol + 6 > COLS) {
      return `can't build — ran out of board columns placing ${chip.icDef.id}. Split the schematic into one circuit.`;
    }
    const holes = dip14Holes(icCol);
    if (!holes.every((h) => HOLE_BY_ID.has(h))) {
      return `can't build — invalid IC placement at column ${icCol}`;
    }
    const icInst = api.addPart(chip.icDef, { holes, rot: 0 });
    markHoles(holes);
    icPlacements.push({ chip, inst: icInst, col: icCol });
    // VCC = pin14 @ col e, GND = pin7 @ col+6 f — tap other rows in those columns
    icPower.push(
      { type: 'vcc', col: icCol, top: true },
      { type: 'gnd', col: icCol + 6, top: false },
    );
    icCol += IC_PITCH;
  }

  // Wire gate signals onto IC pins
  for (const gate of gates) {
    const mapping = gateToChip.get(gate);
    if (!mapping) continue;
    const { chip, slot } = mapping;
    const placement = icPlacements.find((p) => p.chip === chip);
    if (!placement) continue;
    const pins = gatePinMap(chip.type, slot);
    if (!pins) continue;
    const icInst = placement.inst;

    const nInputs = Math.min(gate.inputs.length, pins.input.length);
    for (let i = 0; i < nInputs; i++) {
      const inputNet = find(gate.inputs[i]);
      const hole = icInst.holes[pins.input[i]];
      const holeCol = parseInt(hole.match(/\d+/)[0], 10);
      registerNet(inputNet, holeCol, hole.endsWith('e'));
    }
    const outputNet = find(gate.output);
    const outHole = icInst.holes[pins.output];
    registerNet(outputNet, parseInt(outHole.match(/\d+/)[0], 10), outHole.endsWith('e'));

    if (chip.type === 'dff') {
      if (gate.rst) {
        const h = icInst.holes[pins.rst];
        registerNet(find(gate.rst), parseInt(h.match(/\d+/)[0], 10), h.endsWith('e'));
      } else if (pins.rst != null) {
        const h = icInst.holes[pins.rst];
        powerMinus.set(
          `${parseInt(h.match(/\d+/)[0], 10)}:${h.endsWith('e') ? 1 : 0}`,
          { col: parseInt(h.match(/\d+/)[0], 10), top: h.endsWith('e') },
        );
      }
      if (gate.set) {
        const h = icInst.holes[pins.set];
        registerNet(find(gate.set), parseInt(h.match(/\d+/)[0], 10), h.endsWith('e'));
      } else if (pins.set != null) {
        const h = icInst.holes[pins.set];
        powerMinus.set(
          `${parseInt(h.match(/\d+/)[0], 10)}:${h.endsWith('e') ? 1 : 0}`,
          { col: parseInt(h.match(/\d+/)[0], 10), top: h.endsWith('e') },
        );
      }
    }
  }

  // Tie unused gate inputs
  for (const { chip, inst } of icPlacements) {
    const used = new Set();
    for (let s = 0; s < chip.gates.length; s++) {
      const pins = gatePinMap(chip.type, s);
      if (!pins) continue;
      for (const idx of pins.input) used.add(idx);
      used.add(pins.output);
      if (pins.qn != null) used.add(pins.qn);
      if (pins.rst != null) used.add(pins.rst);
      if (pins.set != null) used.add(pins.set);
    }
    const icInfo = GATE_TO_IC[chip.type];
    for (let s = chip.gates.length; s < icInfo.gatesPerChip; s++) {
      const pins = gatePinMap(chip.type, s);
      if (!pins) continue;
      for (const idx of pins.input) {
        if (used.has(idx)) continue;
        const hole = inst.holes[idx];
        const holeCol = parseInt(hole.match(/\d+/)[0], 10);
        const top = hole.endsWith('e');
        const key = `${holeCol}:${top ? 1 : 0}`;
        if (chip.type === 'nor' || chip.type === 'or') powerMinus.set(key, { col: holeCol, top });
        else powerPlus.set(key, { col: holeCol, top });
      }
    }
  }

  // 3) LED + series resistor in free columns (never share a column with an IC pin)
  const icColSet = new Set();
  for (const p of icPlacements) {
    for (let k = 0; k < 7; k++) icColSet.add(p.col + k);
  }
  const findLedSlot = () => {
    // resistor pins span 3 cols; LED uses adjacent pair on the far end → need c0..c0+4
    const tryCol = (c) => {
      if (c < 1 || c + 4 > COLS) return null;
      for (let k = 0; k <= 4; k++) {
        if (icColSet.has(c + k)) return null;
      }
      const holes = [`${c}b`, `${c + 3}b`, `${c + 3}a`, `${c + 4}a`];
      if (holes.some((h) => occupied.has(h) || !HOLE_BY_ID.has(h))) return null;
      return c;
    };
    // Prefer the right side (past ICs), then scan left
    for (let c = COLS - 4; c >= 1; c--) {
      const hit = tryCol(c);
      if (hit != null) return hit;
    }
    return null;
  };

  /** Drive net for an LED / logic-output: the side that is NOT ground. */
  const ledDriveNet = (e) => {
    const netA = find(e.a);
    const netB = find(e.b);
    if (e.type === 'lout') return netA;
    // Prefer the LED terminal that shares a node with a series resistor; the
    // resistor's other end is the gate/logic drive. Falls back to the non-GND end.
    const series = elems.find((x) => {
      if (x.type !== 'r') return false;
      const ra = find(x.a), rb = find(x.b);
      return ra === netA || rb === netA || ra === netB || rb === netB;
    });
    if (series) {
      const ra = find(series.a), rb = find(series.b);
      const mid = (ra === netA || ra === netB) ? ra : rb;
      const drive = mid === ra ? rb : ra;
      if (!isGroundR(drive)) return drive;
    }
    if (isGroundR(netA) && !isGroundR(netB)) return netB;
    if (isGroundR(netB) && !isGroundR(netA)) return netA;
    return netA;
  };

  for (const e of elems) {
    if (e.type !== 'led' && e.type !== 'lout') continue;
    const signalNet = ledDriveNet(e);
    if (isGroundR(signalNet)) continue; // nowhere to drive from
    const c0 = findLedSlot();
    if (c0 == null) continue;
    const ohms = e.type === 'lout' ? 330 : (elems.find((x) => {
      if (x.type !== 'r') return false;
      const ra = find(x.a), rb = find(x.b);
      return ra === signalNet || rb === signalNet
        || ra === find(e.a) || rb === find(e.a)
        || ra === find(e.b) || rb === find(e.b);
    })?.ohms || 1000);
    const series = nearestResistorDef(ohms);
    const rHoles = [`${c0}b`, `${c0 + 3}b`];
    const lHoles = [`${c0 + 3}a`, `${c0 + 4}a`];
    api.addPart(series, { holes: rHoles, rot: 0, props: { ohms: series.props?.ohms || ohms } });
    api.addPart(DEF_BY_ID.get('led'), { holes: lHoles, rot: 0 });
    markHoles([...rHoles, ...lHoles]);
    // Signal feeds the resistor's free end (c0); LED cathode column goes to GND
    registerNet(signalNet, c0, true);
    powerMinus.set(`${c0 + 4}:1`, { col: c0 + 4, top: true });
    placed.r++;
    placed.led++;
    if (e.type === 'lout') placed.lout++;
  }

  // Battery
  const supply = api.addPart(DEF_BY_ID.get('pow5'), { x: BODY.x - 78, y: BODY.y + BODY.h * 0.5 });
  const batPos = allocRail('T+', 3);
  const batNeg = allocRail('B-', 3);
  if (batPos) api.addWire({ port: [supply.uid, 'pos'] }, { hole: batPos }, '#d43c3c', 'wire');
  if (batNeg) api.addWire({ port: [supply.uid, 'neg'] }, { hole: batNeg }, '#26262a', 'wire');

  const safeWire = (a, b, color) => {
    if (!a?.hole || !b?.hole) return;
    if (!HOLE_BY_ID.has(a.hole) || !HOLE_BY_ID.has(b.hole)) return;
    api.addWire(a, b, color, 'wire');
  };

  for (const t of powerPlus.values()) {
    const board = allocTap(t.col, t.top);
    const rail = allocRail('T+', t.col);
    if (board && rail) safeWire({ hole: board }, { hole: rail }, '#d43c3c');
  }
  for (const t of powerMinus.values()) {
    const board = allocTap(t.col, t.top);
    const rail = allocRail('B-', t.col);
    if (board && rail) safeWire({ hole: board }, { hole: rail }, '#26262a');
  }
  for (const pwr of icPower) {
    const board = allocTap(pwr.col, pwr.top);
    const rail = allocRail(pwr.type === 'vcc' ? 'T+' : 'B-', pwr.col);
    if (board && rail) {
      safeWire({ hole: board }, { hole: rail }, pwr.type === 'vcc' ? '#d43c3c' : '#26262a');
    }
  }
  let ci = 0;
  for (const j of jumpers) {
    const ha = allocTap(j.a.col, j.a.top);
    const hb = allocTap(j.b.col, j.b.top);
    if (ha && hb) safeWire({ hole: ha }, { hole: hb }, NET_COLORS[ci++ % NET_COLORS.length]);
  }

  const parts = [];
  if (placed.r) parts.push(`${placed.r} resistor${placed.r > 1 ? 's' : ''}`);
  if (placed.led) parts.push(`${placed.led} LED${placed.led > 1 ? 's' : ''}`);
  if (placed.sw) parts.push(`${placed.sw} switch${placed.sw > 1 ? 'es' : ''}`);
  if (placed.lin) parts.push(`${placed.lin} logic input${placed.lin > 1 ? 's' : ''}`);
  if (placed.lout) parts.push(`${placed.lout} logic output${placed.lout > 1 ? 's' : ''}`);
  if (chipInstances.length) {
    const icCounts = {};
    for (const chip of chipInstances) {
      const name = chip.icDef.id.toUpperCase();
      icCounts[name] = (icCounts[name] || 0) + 1;
    }
    for (const [name, count] of Object.entries(icCounts)) parts.push(`${count} ${name}`);
  }
  return `built ${parts.join(', ')}`;
}

export function importFromSim(sim, api) {
  const circuit = readLiveCircuit(sim);
  return buildBreadboard(circuit, api);
}

// ---- breadboard → schematic -------------------------------------------------

const IC_TO_GATE = {
  hc14: 'inverter', hc08: 'and', hc32: 'or', hc00: 'nand',
  hc02: 'nor', hc86: 'xor', cd4013: 'dff',
};

const GATE_DUMP = {
  inverter: 73, and: 150, nand: 151, or: 152, nor: 153, xor: 154, dff: 155,
};

function epNet(ep, partsByUid) {
  if (ep.hole) return baseNetOf(ep.hole);
  const inst = partsByUid.get(ep.port?.[0]);
  if (!inst) return null;
  return `q${inst.uid}:${ep.port[1]}`;
}

function pinHoleNet(inst, pinIdx) {
  const hole = inst.holes?.[pinIdx];
  return hole ? baseNetOf(hole) : null;
}

/**
 * Build a conventional CircuitJS text circuit from the breadboard state.
 * ICs are exploded back into individual gate symbols.
 */
export function exportBreadboardToText(state) {
  const partsByUid = new Map(state.parts.map((p) => [p.uid, p]));

  // Union-find over breadboard nets via wires + shared columns
  const parent = new Map();
  const add = (a) => { if (a != null && !parent.has(a)) parent.set(a, a); };
  const find = (a) => {
    if (a == null) return null;
    add(a);
    let r = a;
    while (parent.get(r) !== r) r = parent.get(r);
    let n = a;
    while (parent.get(n) !== r) { const nx = parent.get(n); parent.set(n, r); n = nx; }
    return r;
  };
  const uni = (a, b) => {
    if (a == null || b == null) return;
    add(a); add(b);
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };

  for (const w of state.wires) {
    uni(epNet(w.a, partsByUid), epNet(w.b, partsByUid));
  }
  // Column continuity is already in baseNetOf (A{n}/B{n}/rails)

  // Identify power nets from supply parts
  let plusNet = null, gndNet = null;
  for (const inst of state.parts) {
    if (inst.def.sim?.type === 'supply') {
      plusNet = find(`q${inst.uid}:pos`);
      gndNet = find(`q${inst.uid}:neg`);
    }
  }
  // Also treat rail holes
  for (const [id] of HOLE_BY_ID) {
    if (id.startsWith('T+') || id.startsWith('B+')) {
      const n = find(baseNetOf(id));
      if (plusNet == null) plusNet = n;
      else uni(plusNet, n);
    }
    if (id.startsWith('T-') || id.startsWith('B-')) {
      const n = find(baseNetOf(id));
      if (gndNet == null) gndNet = n;
      else uni(gndNet, n);
    }
  }
  plusNet = plusNet != null ? find(plusNet) : null;
  gndNet = gndNet != null ? find(gndNet) : null;

  // Collect components to emit
  const passives = [];
  const gateElms = [];
  const logicIO = [];

  for (const inst of state.parts) {
    const sim = inst.def.sim;
    if (!sim) continue;
    if (sim.type === 'resistor') {
      const a = find(pinHoleNet(inst, 0));
      const b = find(pinHoleNet(inst, 1));
      if (a && b) passives.push({ kind: 'r', a, b, ohms: inst.props.ohms || 1000 });
    } else if (sim.type === 'led') {
      const a = find(pinHoleNet(inst, 0));
      const b = find(pinHoleNet(inst, 1));
      if (a && b) passives.push({ kind: 'led', a, b });
    } else if (sim.type === 'button') {
      const a = find(pinHoleNet(inst, 0));
      const b = find(pinHoleNet(inst, 2)); // a1 ↔ b1 when pressed; use a1 and b1 columns
      if (a && b && a !== b) passives.push({ kind: 's', a, b });
    } else if (sim.type === 'ic') {
      const gateType = IC_TO_GATE[sim.icType];
      if (!gateType) continue;
      const icInfo = GATE_TO_IC[gateType];
      for (let slot = 0; slot < icInfo.gatesPerChip; slot++) {
        const pins = gatePinMap(gateType, slot);
        if (!pins) continue;
        const inputs = pins.input.map((idx) => find(pinHoleNet(inst, idx)));
        const output = find(pinHoleNet(inst, pins.output));
        // Skip unused gates whose inputs were tied only to power rails
        const allInputsPower = inputs.every((n) => !n || n === plusNet || n === gndNet);
        if (allInputsPower || !output) continue;
        if (gateType === 'dff') {
          gateElms.push({
            gateType, inputs, output,
            qn: pins.qn != null ? find(pinHoleNet(inst, pins.qn)) : null,
          });
        } else {
          gateElms.push({ gateType, inputs, output });
        }
      }
    }
  }

  // Detect conventional logic-I/O patterns created by import:
  //   pull-up (~10k to VCC) + button to GND  → LogicInput
  //   series R + LED to GND on a gate output → LogicOutput
  const skipPassive = new Set();
  const gateOutNets = new Set(gateElms.map((g) => g.output).filter(Boolean));

  for (const sw of passives.filter((p) => p.kind === 's')) {
    const signal = [sw.a, sw.b].find((n) => n !== gndNet && n !== plusNet);
    const other = signal === sw.a ? sw.b : sw.a;
    if (!signal || other !== gndNet) continue;
    const pull = passives.find((p) =>
      p.kind === 'r' &&
      ((p.a === signal && p.b === plusNet) || (p.b === signal && p.a === plusNet)) &&
      p.ohms >= 5000);
    if (!pull) continue;
    logicIO.push({ kind: 'lin', net: signal });
    skipPassive.add(sw);
    skipPassive.add(pull);
  }
  for (const led of passives.filter((p) => p.kind === 'led')) {
    // Import places: gateOut --Rseries-- LED+ --> LED- --> GND
    const series = passives.find((p) =>
      p.kind === 'r' && (p.a === led.a || p.b === led.a) && p.ohms <= 2000);
    if (!series) continue;
    const driveNet = series.a === led.a ? series.b : series.a;
    if (!gateOutNets.has(driveNet) && !gateOutNets.has(led.a)) continue;
    const signal = gateOutNets.has(driveNet) ? driveNet : led.a;
    logicIO.push({ kind: 'lout', net: signal });
    skipPassive.add(led);
    skipPassive.add(series);
  }

  const emitPassives = passives.filter((p) => !skipPassive.has(p));

  // Deduplicate logic IO
  const seenIO = new Set();
  const uniqIO = [];
  for (const io of logicIO) {
    const k = io.kind + ':' + io.net;
    if (seenIO.has(k)) continue;
    seenIO.add(k);
    uniqIO.push(io);
  }

  // Assign grid positions
  const netXY = new Map();
  const lines = ['$ 1 5.0E-6 10.20027730826997 50 5.0 50'];

  // Power
  const vx = 48, vy = 320;
  lines.push(`v ${vx} ${vy} ${vx} ${vy - 80} 0 0 40 5.0 0 0 0.5`);
  lines.push(`g ${vx} ${vy} ${vx} ${vy + 32} 0`);
  if (plusNet) netXY.set(plusNet, { x: vx, y: vy - 80 });
  if (gndNet) netXY.set(gndNet, { x: vx, y: vy });

  let cursorX = 160;
  const rowY = 176;
  const gateW = 112;
  const gateGap = 48;

  // Place logic inputs on the left
  let linY = 96;
  for (const io of uniqIO.filter((x) => x.kind === 'lin')) {
    if (netXY.has(io.net)) continue;
    const x = 96, y = linY;
    lines.push(`L ${x} ${y} ${x - 48} ${y} 0 false false`);
    netXY.set(io.net, { x, y });
    linY += 48;
  }

  // Place gates
  for (const g of gateElms) {
    const dump = GATE_DUMP[g.gateType];
    if (dump == null) continue;
    const x1 = cursorX, y1 = rowY, x2 = cursorX + gateW, y2 = rowY;

    if (g.gateType === 'dff') {
      lines.push(`155 ${x1} ${y1 - 32} ${x1} ${y1 + 32} 0 6`);
      const dPos = { x: x1, y: y1 - 32 };
      const qPos = { x: x1 + 96, y: y1 - 32 };
      const qnPos = { x: x1 + 96, y: y1 + 32 };
      const clkPos = { x: x1, y: y1 };
      if (g.inputs[1] && !netXY.has(g.inputs[1])) netXY.set(g.inputs[1], dPos);
      if (g.inputs[0] && !netXY.has(g.inputs[0])) netXY.set(g.inputs[0], clkPos);
      if (g.output && !netXY.has(g.output)) netXY.set(g.output, qPos);
      if (g.qn && !netXY.has(g.qn)) netXY.set(g.qn, qnPos);
      cursorX += gateW + gateGap + 16;
      continue;
    }

    const inputCount = g.gateType === 'inverter' ? 1 : 2;
    if (g.gateType === 'inverter') {
      lines.push(`73 ${x1} ${y1} ${x2} ${y2} 0 1.5 5.0`);
    } else {
      lines.push(`${dump} ${x1} ${y1} ${x2} ${y2} 0 ${inputCount} 0.0`);
    }

    const hs = 16;
    if (inputCount === 1) {
      if (g.inputs[0] && !netXY.has(g.inputs[0])) netXY.set(g.inputs[0], { x: x1, y: y1 });
    } else {
      if (g.inputs[0] && !netXY.has(g.inputs[0])) netXY.set(g.inputs[0], { x: x1, y: y1 + hs });
      if (g.inputs[1] && !netXY.has(g.inputs[1])) netXY.set(g.inputs[1], { x: x1, y: y1 - hs });
    }
    if (g.output && !netXY.has(g.output)) netXY.set(g.output, { x: x2, y: y2 });
    cursorX += gateW + gateGap;
  }

  // Remaining passives (not folded into L/M)
  let px = 160, py = 320;
  for (const p of emitPassives) {
    if (p.kind === 'r') {
      const a = p.a, b = p.b;
      const x1 = px, y1 = py, x2 = px + 64, y2 = py;
      lines.push(`r ${x1} ${y1} ${x2} ${y2} 0 ${p.ohms}`);
      if (!netXY.has(a)) netXY.set(a, { x: x1, y: y1 });
      if (!netXY.has(b)) netXY.set(b, { x: x2, y: y2 });
      const ca = netXY.get(a), cb = netXY.get(b);
      if (ca && (ca.x !== x1 || ca.y !== y1)) lines.push(`w ${ca.x} ${ca.y} ${x1} ${y1} 0`);
      if (cb && (cb.x !== x2 || cb.y !== y2)) lines.push(`w ${x2} ${y2} ${cb.x} ${cb.y} 0`);
      px += 96;
    } else if (p.kind === 'led') {
      const x1 = px, y1 = py, x2 = px + 48, y2 = py;
      lines.push(`162 ${x1} ${y1} ${x2} ${y2} 1 default-led 1 0 0 0.01`);
      if (!netXY.has(p.a)) netXY.set(p.a, { x: x1, y: y1 });
      if (!netXY.has(p.b)) netXY.set(p.b, { x: x2, y: y2 });
      const ca = netXY.get(p.a), cb = netXY.get(p.b);
      if (ca && (ca.x !== x1 || ca.y !== y1)) lines.push(`w ${ca.x} ${ca.y} ${x1} ${y1} 0`);
      if (cb && (cb.x !== x2 || cb.y !== y2)) lines.push(`w ${x2} ${y2} ${cb.x} ${cb.y} 0`);
      if (gndNet && find(p.b) === gndNet) {
        const g = netXY.get(gndNet);
        if (g) lines.push(`w ${x2} ${y2} ${g.x} ${g.y} 0`);
      }
      px += 80;
    } else if (p.kind === 's') {
      const x1 = px, y1 = py + 64, x2 = px + 48, y2 = py + 64;
      lines.push(`s ${x1} ${y1} ${x2} ${y2} 0 1 false`);
      if (!netXY.has(p.a)) netXY.set(p.a, { x: x1, y: y1 });
      if (!netXY.has(p.b)) netXY.set(p.b, { x: x2, y: y2 });
      const ca = netXY.get(p.a), cb = netXY.get(p.b);
      if (ca && (ca.x !== x1 || ca.y !== y1)) lines.push(`w ${ca.x} ${ca.y} ${x1} ${y1} 0`);
      if (cb && (cb.x !== x2 || cb.y !== y2)) lines.push(`w ${x2} ${y2} ${cb.x} ${cb.y} 0`);
      px += 80;
    }
  }

  // Logic outputs on the right
  let loutY = 96;
  const loutX = Math.max(cursorX + 32, 400);
  for (const io of uniqIO.filter((x) => x.kind === 'lout')) {
    const src = netXY.get(io.net);
    const x = loutX, y = src?.y ?? loutY;
    lines.push(`M ${x} ${y} ${x + 48} ${y} 0`);
    if (src) lines.push(`w ${src.x} ${src.y} ${x} ${y} 0`);
    else netXY.set(io.net, { x, y });
    loutY += 48;
  }

  // Collect all terminals per net and chain-wire them
  const terminals = new Map();
  const addTerm = (net, x, y) => {
    if (!net) return;
    if (!terminals.has(net)) terminals.set(net, []);
    const list = terminals.get(net);
    if (!list.some((t) => t.x === x && t.y === y)) list.push({ x, y });
  };

  cursorX = 160;
  for (const g of gateElms) {
    const x1 = cursorX, y1 = rowY, x2 = cursorX + gateW, y2 = rowY;
    if (g.gateType === 'dff') {
      addTerm(g.inputs[1], x1, y1 - 32);
      addTerm(g.inputs[0], x1, y1);
      addTerm(g.output, x1 + 96, y1 - 32);
      addTerm(g.qn, x1 + 96, y1 + 32);
      cursorX += gateW + gateGap + 16;
      continue;
    }
    const hs = 16;
    const inputCount = g.gateType === 'inverter' ? 1 : 2;
    if (inputCount === 1) addTerm(g.inputs[0], x1, y1);
    else {
      addTerm(g.inputs[0], x1, y1 + hs);
      addTerm(g.inputs[1], x1, y1 - hs);
    }
    addTerm(g.output, x2, y2);
    cursorX += gateW + gateGap;
  }
  for (const io of uniqIO) {
    const pt = netXY.get(io.net);
    if (pt) addTerm(io.net, pt.x, pt.y);
  }
  if (plusNet) {
    const p = netXY.get(plusNet);
    if (p) addTerm(plusNet, p.x, p.y);
  }
  if (gndNet) {
    const p = netXY.get(gndNet);
    if (p) addTerm(gndNet, p.x, p.y);
  }

  for (const [, terms] of terminals) {
    if (terms.length < 2) continue;
    for (let i = 1; i < terms.length; i++) {
      const a = terms[0], b = terms[i];
      lines.push(`w ${a.x} ${a.y} ${b.x} ${b.y} 0`);
    }
  }

  if (lines.length <= 1) {
    return { text: null, message: 'nothing to export — place parts on the breadboard first' };
  }

  const nGates = gateElms.length;
  const nPass = emitPassives.length;
  const nIO = uniqIO.length;
  return {
    text: lines.join('\n') + '\n',
    message: `exported ${nGates} gate${nGates === 1 ? '' : 's'}${nIO ? `, ${nIO} logic I/O` : ''}${nPass ? `, ${nPass} passive${nPass === 1 ? '' : 's'}` : ''} → schematic`,
  };
}
