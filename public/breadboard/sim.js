// Simulation: union-find connectivity over breadboard nets + a lightweight DC
// pass (resistors, LEDs, drivers) + behavioral digital ICs and 555 timing.
// Not a full SPICE — just enough physics for real breadboard-lab behavior.

import { baseNetOf } from './board.js?v=3';
import { ArduinoRuntime } from './arduino.js?v=2';

// node key for a placed pin: base net of the hole under it
export function pinNode(inst, i) {
  const holeId = inst.holes && inst.holes[i];
  return holeId ? baseNetOf(holeId) : null;
}
export function portNode(inst, portName) {
  return `q${inst.uid}:${portName}`;
}
function pinByName(inst, name) {
  const i = inst.def.pins.findIndex((p) => p.name === name);
  return i >= 0 ? pinNode(inst, i) : null;
}

// ------------------------------------------------------------------ union-find
function makeUF() {
  const parent = new Map();
  const find = (a) => {
    let r = a;
    while (parent.has(r) && parent.get(r) !== r) r = parent.get(r);
    // path compress
    let n = a;
    while (parent.has(n) && parent.get(n) !== n) { const nx = parent.get(n); parent.set(n, r); n = nx; }
    return r;
  };
  const uni = (a, b) => {
    if (!a || !b) return;
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };
  return { find, uni };
}

const LED_VF = { red: 1.9, green: 2.2, yellow: 2.0 };
const LED_RS = 260;

// ------------------------------------------------------------------ main entry
// state: { parts:[inst], wires:[{a:{node},b:{node}}] }, dt seconds, t seconds
export function runSim(state, dt, t) {
  const uf = makeUF();

  // 1) merge nets: wires + closed switches + internal links
  for (const w of state.wires) uf.uni(w.a.node, w.b.node);
  for (const inst of state.parts) {
    const st = inst.def.sim ? inst.def.sim.type : 'deco';
    const rt = inst.rt || (inst.rt = {});
    if (st === 'zero') uf.uni(pinNode(inst, 0), pinNode(inst, 1));
    else if (st === 'spst' && inst.props.closed) uf.uni(pinNode(inst, 0), pinNode(inst, 1));
    else if (st === 'spdt') uf.uni(pinByName(inst, 'c'), pinByName(inst, inst.props.side === 'r' ? 'r' : 'l'));
    else if (st === 'button') {
      uf.uni(pinByName(inst, 'a1'), pinByName(inst, 'a2'));
      uf.uni(pinByName(inst, 'b1'), pinByName(inst, 'b2'));
      if (rt.pressed) uf.uni(pinByName(inst, 'a1'), pinByName(inst, 'b1'));
    }
  }

  // 2) fixed nets (voltage sources) + element stamps
  const fixed = new Map();          // root -> volts
  const adj = new Map();            // root -> [{type, ...}]
  const addAdj = (root, e) => {
    if (!adj.has(root)) adj.set(root, []);
    adj.get(root).push(e);
  };
  const addR = (na, nb, R) => {
    if (!na || !nb || R <= 0) { if (R <= 0) uf.uni(na, nb); return; }
    const a = uf.find(na), b = uf.find(nb);
    if (a === b) return;
    const g = 1 / R;
    addAdj(a, { type: 'r', other: b, g });
    addAdj(b, { type: 'r', other: a, g });
  };
  const addDrv = (n, V, Rout) => {
    if (!n) return;
    addAdj(uf.find(n), { type: 'drv', V, g: 1 / Rout });
  };

  const leds = [];
  const dmms = [];
  const icQueue = [];
  const arduinos = [];

  for (const inst of state.parts) {
    const sim = inst.def.sim || { type: 'deco' };
    const rt = inst.rt || (inst.rt = {});
    switch (sim.type) {
      case 'source': {  // on-board 2-pin source (5V module, battery snap)
        const p = pinNode(inst, 0), n = pinNode(inst, 1);
        if (p) fixed.set(uf.find(p), sim.volts);
        if (n) fixed.set(uf.find(n), 0);
        break;
      }
      case 'supply': {  // free part with pos/neg ports
        const p = portNode(inst, 'pos'), n = portNode(inst, 'neg');
        fixed.set(uf.find(p), inst.props.volts ?? sim.volts ?? 5);
        fixed.set(uf.find(n), 0);
        break;
      }
      case 'ports': {   // Arduino power header
        for (const port of inst.def.ports) {
          if (port.volts !== undefined) fixed.set(uf.find(portNode(inst, port.name)), port.volts);
        }
        break;
      }
      case 'resistor':
        addR(pinNode(inst, 0), pinNode(inst, 1), inst.props.ohms || 1000);
        break;
      case 'pot': {
        const tW = Math.min(1, Math.max(0, inst.props.t ?? 0.5));
        const R = inst.def.sim.ohms || 10000;
        addR(pinByName(inst, 'a'), pinByName(inst, 'w'), Math.max(1, tW * R));
        addR(pinByName(inst, 'w'), pinByName(inst, 'b'), Math.max(1, (1 - tW) * R));
        break;
      }
      case 'led':
        leds.push({
          inst,
          a: uf.find(pinNode(inst, 0)),
          k: uf.find(pinNode(inst, 1)),
          vf: LED_VF[inst.props.color] || 2.0,
        });
        break;
      case 'funcgen': {
        fixed.set(uf.find(portNode(inst, 'gnd')), 0);
        const hz = inst.props.hz || 2;
        rt.level = (t * hz) % 1 < 0.5;
        addDrv(portNode(inst, 'out'), rt.level ? 5 : 0, 50);
        break;
      }
      case 'dmm':
        dmms.push(inst);
        break;
      case 'ic':
        icQueue.push(inst);
        break;
      case 'arduino': {
        // Initialize Arduino runtime if not exists
        if (!rt.arduino) {
          rt.arduino = new ArduinoRuntime();
          if (inst.props.code) {
            rt.arduino.loadSketch(inst.props.code);
          }
        }
        // Power pins provide fixed voltages
        for (const port of inst.def.ports) {
          if (port.volts !== undefined) {
            fixed.set(uf.find(portNode(inst, port.name)), port.volts);
          }
        }
        arduinos.push(inst);
        break;
      }
    }
  }

  // LED adjacency entries (condition applied during iteration)
  for (const led of leds) {
    if (!led.a || !led.k || led.a === led.k) continue;
    addAdj(led.a, { type: 'led', other: led.k, vf: led.vf, pol: 'a' });
    addAdj(led.k, { type: 'led', other: led.a, vf: led.vf, pol: 'k' });
  }

  // 3) solve DC + evaluate ICs, a few outer passes so gate outputs settle
  const V = new Map();
  const icDrivers = [];

  const solve = () => {
    const nets = new Set([...adj.keys(), ...fixed.keys()]);
    for (const d of icDrivers) nets.add(d.net);
    for (const n of nets) if (!V.has(n)) V.set(n, fixed.get(n) ?? 0);
    for (let it = 0; it < 60; it++) {
      for (const n of nets) {
        if (fixed.has(n)) { V.set(n, fixed.get(n)); continue; }
        let num = 0, den = 0;
        for (const e of adj.get(n) || []) {
          if (e.type === 'r') { num += e.g * (V.get(e.other) ?? 0); den += e.g; }
          else if (e.type === 'drv') { num += e.g * e.V; den += e.g; }
          else if (e.type === 'led') {
            const vo = V.get(e.other) ?? 0, vs = V.get(n) ?? 0;
            const fwd = e.pol === 'a' ? vs - vo : vo - vs;
            if (fwd > e.vf) {
              const gl = 1 / LED_RS;
              num += gl * (e.pol === 'a' ? vo + e.vf : vo - e.vf);
              den += gl;
            }
          }
        }
        for (const d of icDrivers) {
          if (d.net === n) { num += d.g * d.V; den += d.g; }
        }
        if (den > 0) V.set(n, num / den);
      }
    }
  };

  const vAt = (node) => (node ? V.get(uf.find(node)) ?? 0 : 0);

  const evalICs = () => {
    icDrivers.length = 0;
    for (const inst of icQueue) {
      const rt = inst.rt;
      const sim = inst.def.sim;
      const vcc = vAt(pinByName(inst, 'VCC'));
      const gnd = vAt(pinByName(inst, 'GND'));
      const gndFixed = fixed.has(uf.find(pinByName(inst, 'GND') || '~')) || gnd < 0.5;
      rt.powered = vcc - gnd >= 3 && gndFixed;
      if (!rt.powered) { rt.outs = {}; continue; }
      const TH = (vcc + gnd) / 2;
      const hi = (name) => vAt(pinByName(inst, name)) > TH;
      const drive = (name, level) => {
        const n = pinByName(inst, name);
        if (!n) return;
        icDrivers.push({ net: uf.find(n), V: level ? vcc : gnd, g: 1 / 60 });
        rt.outs[name] = level;
      };
      rt.outs = {};

      switch (sim.icType) {
        case 'hc14':
          for (let i = 1; i <= 6; i++) drive(`${i}Y`, !hi(`${i}A`));
          break;
        case 'hc08':
          for (let i = 1; i <= 4; i++) drive(`${i}Y`, hi(`${i}A`) && hi(`${i}B`));
          break;
        case 'hc32':
          for (let i = 1; i <= 4; i++) drive(`${i}Y`, hi(`${i}A`) || hi(`${i}B`));
          break;
        case 'hc00':
          for (let i = 1; i <= 4; i++) drive(`${i}Y`, !(hi(`${i}A`) && hi(`${i}B`)));
          break;
        case 'hc02':
          for (let i = 1; i <= 4; i++) drive(`${i}Y`, !(hi(`${i}A`) || hi(`${i}B`)));
          break;
        case 'hc86':
          for (let i = 1; i <= 4; i++) drive(`${i}Y`, hi(`${i}A`) !== hi(`${i}B`));
          break;
        case 'hc283': {
          let a = 0, b = 0;
          for (let i = 0; i < 4; i++) {
            if (hi(`A${i + 1}`)) a |= 1 << i;
            if (hi(`B${i + 1}`)) b |= 1 << i;
          }
          const s = a + b + (hi('C0') ? 1 : 0);
          for (let i = 0; i < 4; i++) drive(`S${i + 1}`, !!(s & (1 << i)));
          drive('C4', s > 15);
          break;
        }
        case 'hc153': {
          const sel = (hi('B') ? 2 : 0) | (hi('A') ? 1 : 0);
          drive('1Y', !hi('1G') && hi(`1C${sel}`));
          drive('2Y', !hi('2G') && hi(`2C${sel}`));
          break;
        }
        case 'cd4013': {
          for (const ff of [1, 2]) {
            const clk = hi(`CLK${ff}`);
            const key = `q${ff}`;
            if (rt[key] === undefined) rt[key] = false;
            if (hi(`SET${ff}`)) rt[key] = true;
            else if (hi(`RST${ff}`)) rt[key] = false;
            else if (clk && !rt[`clkPrev${ff}`]) rt[key] = hi(`D${ff}`);
            rt[`clkNext${ff}`] = clk;
            drive(`Q${ff}`, rt[key]);
            drive(`Q${ff}N`, !rt[key]);
          }
          break;
        }
        case 'ne555': {
          ne555(inst, state, uf, vAt, fixed, dt, drive, vcc);
          break;
        }
      }
    }
  };

  // Arduino execution and I/O
  const evalArduinos = () => {
    for (const inst of arduinos) {
      const rt = inst.rt;
      const arduino = rt.arduino;
      if (!arduino) continue;

      // Arduino is always powered in simulation
      rt.powered = true;

      // Read input voltages from circuit for all digital and analog pins
      for (let i = 0; i <= 13; i++) {
        const pinName = `D${i}`;
        const node = portNode(inst, pinName);
        arduino.setExternalVoltage(pinName, vAt(node));
      }
      for (let i = 0; i < 6; i++) {
        const pinName = `A${i}`;
        const node = portNode(inst, pinName);
        arduino.setExternalVoltage(pinName, vAt(node));
      }

      // Execute Arduino code
      arduino.tick(dt);

      // Drive output pins
      for (let i = 0; i <= 13; i++) {
        const pinName = `D${i}`;
        const voltage = arduino.getPinVoltage(pinName);
        if (voltage > 0) {
          const node = portNode(inst, pinName);
          if (node) {
            // Arduino outputs have ~40 ohm source resistance
            addDrv(node, voltage, 40);
          }
        }
      }

      // Analog pins can also be used as digital outputs
      for (let i = 0; i < 6; i++) {
        const pinName = `A${i}`;
        const voltage = arduino.getPinVoltage(pinName);
        if (voltage > 0) {
          const node = portNode(inst, pinName);
          if (node) {
            addDrv(node, voltage, 40);
          }
        }
      }
    }
  };

  solve();
  evalArduinos();
  for (let pass = 0; pass < 3; pass++) { evalICs(); evalArduinos(); solve(); }

  // latch flip-flop clock levels for next frame's edge detection
  for (const inst of icQueue) {
    const rt = inst.rt;
    if (inst.def.sim.icType === 'cd4013') {
      rt.clkPrev1 = rt.clkNext1; rt.clkPrev2 = rt.clkNext2;
    }
  }

  // 4) per-part results
  for (const led of leds) {
    const I = Math.max(0, ((V.get(led.a) ?? 0) - (V.get(led.k) ?? 0) - led.vf) / LED_RS);
    led.inst.rt.bright = Math.min(1, Math.pow(I / 0.006, 0.7));
  }
  for (const inst of dmms) {
    const a = portNode(inst, 'vin'), b = portNode(inst, 'com');
    const wired = state.wires.some((w) => w.a.node === a || w.b.node === a) &&
                  state.wires.some((w) => w.a.node === b || w.b.node === b);
    if (!wired) inst.rt.reading = '-- --';
    else if (uf.find(a) === uf.find(b)) inst.rt.reading = '0.0 \u03A9 )))';
    else inst.rt.reading = `${(vAt(a) - vAt(b)).toFixed(2)} V`;
  }

  return { V, find: uf.find, vAt };
}

// -------------------------------------------------------------------- NE555
// Recognizes the classic astable wiring: R1 VCC->DISCH, R2 DISCH->THRES,
// C THRES->GND, TRIG tied to THRES. Output toggles with real 555 timing.
function ne555(inst, state, uf, vAt, fixed, dt, drive, vcc) {
  const rt = inst.rt;
  const n = (name) => {
    const i = inst.def.pins.findIndex((p) => p.name === name);
    const holeId = inst.holes && inst.holes[i];
    return holeId ? uf.find(baseNetOf(holeId)) : null;
  };
  const nVcc = n('VCC'), nGnd = n('GND'), nDis = n('DISCH'), nThr = n('THRES'), nTrig = n('TRIG'), nRst = n('RESET');

  // RESET held low -> output low
  if (nRst && fixed.has(nRst) && fixed.get(nRst) < 1) { drive('OUT', false); return; }

  // find R1, R2, C in the placed parts
  let R1 = null, R2 = null, C = null;
  for (const p of state.parts) {
    const st = p.def.sim ? p.def.sim.type : '';
    if (st === 'resistor') {
      const a = uf.find(pinNode(p, 0)), b = uf.find(pinNode(p, 1));
      const R = p.props.ohms || 1000;
      if ((a === nVcc && b === nDis) || (b === nVcc && a === nDis)) R1 = R;
      if ((a === nDis && b === nThr) || (b === nDis && a === nThr)) R2 = R;
    } else if (st === 'cap') {
      const a = uf.find(pinNode(p, 0)), b = uf.find(pinNode(p, 1));
      if ((a === nThr && b === nGnd) || (b === nThr && a === nGnd)) C = p.def.sim.farads;
    }
  }
  const astable = R1 && R2 && C && nTrig === nThr;

  if (astable) {
    const tHi = 0.693 * (R1 + R2) * C;
    const tLo = 0.693 * R2 * C;
    rt.ph = ((rt.ph || 0) + dt) % (tHi + tLo);
    rt.level = rt.ph < tHi;
    drive('OUT', rt.level);
    if (!rt.level) drive('DISCH', false); // discharging phase pulls pin 7 low
  } else {
    // comparator-style fallback: TRIG below 1/3 Vcc -> out high
    const idx = inst.def.pins.findIndex((p) => p.name === 'TRIG');
    const trigV = idx >= 0 ? vAt(pinNode(inst, idx)) : vcc;
    drive('OUT', trigV < vcc / 3);
  }
}
