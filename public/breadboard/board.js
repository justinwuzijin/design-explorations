// Breadboard geometry + art. A full-size board with room for lab builds:
// numbered columns, rows a-e / f-j split by the center ravine, and two
// power-rail pairs (magenta + / blue -) top and bottom.

export const P = 16;                 // 0.1" hole pitch, in px
export const COLS = 84;              // wider than a physical 63-col strip so auto-builds fit
export const RAIL_COUNT = 70;        // rail taps spanning the board

// y positions (in pitch units) of every hole row
const ROW_Y = {
  'T+': 1.2, 'T-': 2.2,
  a: 4.4, b: 5.4, c: 6.4, d: 7.4, e: 8.4,
  f: 11.4, g: 12.4, h: 13.4, i: 14.4, j: 15.4,
  'B+': 17.6, 'B-': 18.6,
};
export const MAIN_ROWS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];

export const BODY = { x: -3 * P, y: 0, w: (COLS + 5) * P, h: 19.9 * P };

export const colX = (c) => (c - 1) * P;            // columns are 1-based
export const rowY = (r) => ROW_Y[r] * P;

// rail hole i sits at column slot 2 + i + floor(i/5) -> groups of 5
const railCol = (i) => 2 + i + Math.floor(i / 5);

// ---- hole table -------------------------------------------------------------
export const HOLES = [];             // {id, x, y, net}
export const HOLE_BY_ID = new Map();

for (let c = 1; c <= COLS; c++) {
  for (const r of MAIN_ROWS) {
    const top = 'abcde'.includes(r);
    const h = {
      id: `${c}${r}`,
      x: colX(c), y: rowY(r),
      net: top ? `A${c}` : `B${c}`,  // a-e share one net per column, f-j another
    };
    HOLES.push(h); HOLE_BY_ID.set(h.id, h);
  }
}
for (const rail of ['T+', 'T-', 'B+', 'B-']) {
  for (let i = 0; i < RAIL_COUNT; i++) {
    const h = {
      id: `${rail}${i}`,
      x: colX(railCol(i)), y: rowY(rail),
      net: rail,                     // each rail line is a single net
    };
    HOLES.push(h); HOLE_BY_ID.set(h.id, h);
  }
}

export function baseNetOf(holeId) {
  const h = HOLE_BY_ID.get(holeId);
  return h ? h.net : null;
}

export function nearestHole(x, y, maxD = P * 0.45) {
  let best = null, bd = maxD * maxD;
  for (const h of HOLES) {
    const dx = h.x - x, dy = h.y - y;
    const d = dx * dx + dy * dy;
    if (d < bd) { bd = d; best = h; }
  }
  return best;
}

// ---- svg helpers ------------------------------------------------------------
export function E(tag, attrs = {}, parent = null) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'text') el.textContent = v;
    else el.setAttribute(k, v);
  }
  if (parent) parent.appendChild(el);
  return el;
}

// ---- board art --------------------------------------------------------------
export function buildBoard(g) {
  // body
  E('rect', {
    x: BODY.x, y: BODY.y, width: BODY.w, height: BODY.h,
    rx: 10, fill: 'url(#boardG)', filter: 'url(#softShadow)',
  }, g);
  // subtle edge
  E('rect', {
    x: BODY.x + 1, y: BODY.y + 1, width: BODY.w - 2, height: BODY.h - 2,
    rx: 9, fill: 'none', stroke: 'rgba(0,0,0,0.08)', 'stroke-width': 1,
  }, g);

  // seams that separate the rail strips from the main block (like real boards)
  for (const yy of [3.3, 16.5]) {
    E('line', {
      x1: BODY.x + 6, y1: yy * P, x2: BODY.x + BODY.w - 6, y2: yy * P,
      stroke: 'rgba(0,0,0,0.07)', 'stroke-width': 1,
    }, g);
  }

  // center ravine
  E('rect', {
    x: BODY.x, y: 9.4 * P, width: BODY.w, height: 1.9 * P,
    fill: 'url(#ravineG)',
  }, g);
  E('line', { x1: BODY.x, y1: 9.4 * P, x2: BODY.x + BODY.w, y2: 9.4 * P, stroke: 'rgba(0,0,0,0.12)', 'stroke-width': 1 }, g);
  E('line', { x1: BODY.x, y1: 11.3 * P, x2: BODY.x + BODY.w, y2: 11.3 * P, stroke: 'rgba(255,255,255,0.7)', 'stroke-width': 1 }, g);

  // rail stripes: magenta above the + row, blue below the - row
  const stripe = (y, color) => E('line', {
    x1: colX(1), y1: y, x2: colX(COLS), y2: y,
    stroke: color, 'stroke-width': 2.2, 'stroke-linecap': 'round', opacity: 0.85,
  }, g);
  stripe(rowY('T+') - 0.62 * P, '#e0218a');
  stripe(rowY('T-') + 0.62 * P, '#2f7bd9');
  stripe(rowY('B+') - 0.62 * P, '#e0218a');
  stripe(rowY('B-') + 0.62 * P, '#2f7bd9');

  // +/- end labels for each rail
  const railLabel = (x, y, s, color) => E('text', {
    x, y: y + 4, text: s, fill: color, 'font-size': 13, 'font-weight': 700,
    'text-anchor': 'middle', 'font-family': 'Inter, sans-serif',
  }, g);
  for (const [row, s, color] of [['T+', '+', '#e0218a'], ['T-', '\u2212', '#2f7bd9'], ['B+', '+', '#e0218a'], ['B-', '\u2212', '#2f7bd9']]) {
    railLabel(colX(1) - 1.6 * P, rowY(row), s, color);
    railLabel(colX(COLS) + 1.6 * P, rowY(row), s, color);
  }

  // row letters on both sides of each block
  for (const r of MAIN_ROWS) {
    for (const x of [colX(1) - 1.55 * P, colX(COLS) + 1.55 * P]) {
      E('text', {
        x, y: rowY(r) + 3.2, text: r, fill: 'rgba(0,0,0,0.42)',
        'font-size': 8.5, 'text-anchor': 'middle', 'font-family': 'Inter, sans-serif',
      }, g);
    }
  }

  // column numbers above row a and below row j
  const numbered = [];
  for (let c = 1; c <= COLS; c++) {
    if (c === 1 || c % 5 === 0) numbered.push(c);
  }
  for (const c of numbered) {
    for (const y of [rowY('a') - 0.72 * P, rowY('j') + 1.05 * P]) {
      E('text', {
        x: colX(c), y, text: String(c), fill: 'rgba(0,0,0,0.4)',
        'font-size': 7.5, 'text-anchor': 'middle', 'font-family': 'Inter, sans-serif',
      }, g);
    }
  }

  // holes (square, dark, slightly inset like the photo)
  const S = 4.6;
  for (const h of HOLES) {
    E('rect', {
      x: h.x - S / 2, y: h.y - S / 2, width: S, height: S, rx: 1,
      fill: 'url(#holeG)',
    }, g);
    E('rect', {
      x: h.x - S / 2, y: h.y + S / 2 - 0.7, width: S, height: 0.9, rx: 0.4,
      fill: 'rgba(255,255,255,0.5)',
    }, g);
  }
}
