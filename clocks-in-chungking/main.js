// Clocks in Chungking — a wall of TWEMCO-style flip clocks that all tick from
// one shared time source, so every minute/hour digit split-flaps in sync.

const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const MONS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN',
              'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
// Bilingual faces, like the real TWEMCO calendar clocks.
const DAYS_CN = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
const MONS_CN = ['一月', '二月', '三月', '四月', '五月', '六月',
                 '七月', '八月', '九月', '十月', '十一月', '十二月'];

// ----------------------------------------------------------------------------
// Flip tile: a split-flap that shows one digit or word and folds when it changes.
// Four stacked layers — two static halves (top/bottom) and two folding leaves.
// ----------------------------------------------------------------------------
// A flap carries a top face and a bottom face. For a digit they're the same
// value (the number is split across the slit); for a bilingual day/month card
// the top face is English and the bottom face is Chinese.
function createFlap(opts = {}) {
  const { vars = {}, split = false } = opts;
  const el = document.createElement('div');
  el.className = 'flap' + (split ? ' split' : '');
  for (const [k, v] of Object.entries(vars)) el.style.setProperty(k, v);
  el.innerHTML =
    '<div class="flap-half top"><div class="glyph"></div></div>' +
    '<div class="flap-half bottom"><div class="glyph"></div></div>' +
    '<div class="flap-leaf top"><div class="glyph"></div></div>' +
    '<div class="flap-leaf bottom"><div class="glyph"></div></div>';

  const sTop = el.querySelector('.flap-half.top .glyph');
  const sBot = el.querySelector('.flap-half.bottom .glyph');
  const lTop = el.querySelector('.flap-leaf.top .glyph');
  const lBot = el.querySelector('.flap-leaf.bottom .glyph');

  let curT = null, curB = null, timer = null;
  const durMs = () => {
    const v = getComputedStyle(el).getPropertyValue('--dur').trim();
    const n = parseFloat(v);
    return v.endsWith('ms') ? n : (n || 0.33) * 1000;
  };

  function rest(t, b) { sTop.textContent = t; lTop.textContent = t; sBot.textContent = b; lBot.textContent = b; }
  // Resting state: bottom card + un-rotated top card show the value; the bottom
  // leaf is folded away out of sight.
  function finalize(t, b) { sBot.textContent = b; lTop.textContent = t; el.classList.remove('flip'); timer = null; }

  // set(value) for digits, or set(english, chinese) for a bilingual card.
  function set(top, bottom) {
    const t = String(top);
    const b = bottom === undefined ? t : String(bottom);
    if (curT === null) { curT = t; curB = b; rest(t, b); return; }   // first paint, no flip
    if (timer) finalize(curT, curB);                                 // commit an in-flight flip
    if (t === curT && b === curB) return;

    const oT = curT, oB = curB;
    curT = t; curB = b;
    sTop.textContent = t;   // revealed as the top card folds down
    sBot.textContent = oB;  // held until the bottom card covers it
    lTop.textContent = oT;  // the folding-down face
    lBot.textContent = b;   // the folding-up face

    el.classList.remove('flip');
    void el.offsetWidth;    // restart the keyframes
    el.classList.add('flip');
    timer = setTimeout(() => finalize(t, b), durMs() + 30);
  }

  return { el, set, get value() { return curT; } };
}

// A pair of digit flaps (e.g. "08"). set("08") drives both, flipping only what changed.
function digitPair(vars) {
  const a = createFlap({ vars });
  const b = createFlap({ vars });
  return {
    nodes: [a.el, b.el],
    set(str2) { a.set(str2[0]); b.set(str2[1]); },
  };
}

// A bilingual word card: set(english, chinese).
function wordFlap(vars) { return createFlap({ vars, split: true }); }

function colon(px, color) {
  const c = document.createElement('div');
  c.textContent = ':';
  c.style.cssText =
    `align-self:center;font-family:'Oswald',sans-serif;font-weight:700;` +
    `font-size:${px}px;line-height:1;color:${color};padding:0 2px;`;
  return c;
}

// ----------------------------------------------------------------------------
// Time: one shared, optionally accelerated clock. Every display is derived from
// the same base ms with a whole-hour offset, so all minutes flip together.
// ----------------------------------------------------------------------------
const time = (() => {
  let speed = 1;
  let anchorReal = Date.now();      // real ms that "now" maps to
  let anchorPerf = performance.now();
  const baseMs = () => anchorReal + (performance.now() - anchorPerf) * speed;
  return {
    base: baseMs,
    setSpeed(s) {                    // rebase so the time doesn't jump
      anchorReal = baseMs();
      anchorPerf = performance.now();
      speed = s;
    },
    reset() {
      anchorReal = Date.now();
      anchorPerf = performance.now();
    },
  };
})();

const LOCAL_OFFSET = -new Date().getTimezoneOffset();   // minutes
// Read a UTC instant and pretend it's wall-clock time (offset already applied).
function fieldsAt(ms) {
  const d = new Date(ms);
  const h = d.getUTCHours();
  return {
    H2: String(h).padStart(2, '0'),
    h12: String(((h % 12) || 12)).padStart(2, '0'),
    M2: String(d.getUTCMinutes()).padStart(2, '0'),
    S: d.getUTCSeconds(),
    Mn: d.getUTCMinutes(),
    h12n: (h % 12) + d.getUTCMinutes() / 60,
    day: DAYS[d.getUTCDay()],
    dayCN: DAYS_CN[d.getUTCDay()],
    dd: String(d.getUTCDate()).padStart(2, '0'),
    mon: MONS[d.getUTCMonth()],
    monCN: MONS_CN[d.getUTCMonth()],
  };
}

// ----------------------------------------------------------------------------
// Clock builders — each returns { el, offset, update(fields) }.
// ----------------------------------------------------------------------------

// Size presets (passed straight through as CSS custom properties).
const SZ = {
  bigD:  { '--w': '64px', '--h': '100px', '--fs': '86px', '--tr': '6px' },
  bigW:  { '--w': '86px', '--h': '64px',  '--fs': '23px', '--fs-cn': '17px' },
  bigDD: { '--w': '40px', '--h': '64px',  '--fs': '46px' },
  sqD:   { '--w': '56px', '--h': '84px',  '--fs': '72px' },
  sqW:   { '--w': '68px', '--h': '52px',  '--fs': '18px', '--fs-cn': '14px' },
  sqDD:  { '--w': '32px', '--h': '52px',  '--fs': '34px' },
  miniD: { '--w': '42px', '--h': '64px',  '--fs': '54px' },
  worldD:{ '--w': '28px', '--h': '44px',  '--fs': '36px' },
};
const DARK  = { '--card': '#1c1e22', '--ink': '#f6f5f1' }; // white-on-black flaps
const LIGHT = { '--card': '#efece3', '--ink': '#1a1b1f' }; // black-on-cream flaps

const merge = (...o) => Object.assign({}, ...o);

function frame(faceVars = {}) {
  const clock = document.createElement('div');
  clock.className = 'clock';
  const face = document.createElement('div');
  face.className = 'clock-face';
  for (const [k, v] of Object.entries(faceVars)) face.style.setProperty(k, v);
  clock.appendChild(face);
  const brand = document.createElement('div');
  brand.className = 'brand';
  brand.textContent = 'TWEMCO';
  clock.appendChild(brand);
  return { clock, face };
}

function row(...children) {
  const r = document.createElement('div');
  r.className = 'clock-row';
  for (const c of children) {
    if (Array.isArray(c)) c.forEach((n) => r.appendChild(n));
    else r.appendChild(c);
  }
  return r;
}

// Hero landscape clock: DAY / DD / MON across the top, big HH : MM below.
function makeBigDateClock(offset) {
  const { clock, face } = frame({ '--face': '#f3f1ea', '--face-gap': '10px', '--gap': '8px' });
  const dayF = wordFlap(merge(DARK, SZ.bigW));
  const ddF  = digitPair(merge(DARK, SZ.bigDD));
  const monF = wordFlap(merge(DARK, SZ.bigW));
  const hF   = digitPair(merge(DARK, SZ.bigD));
  const mF   = digitPair(merge(DARK, SZ.bigD));
  face.appendChild(row(dayF.el, ddF.nodes, monF.el));
  face.appendChild(row(hF.nodes, colon(60, '#1c1e22'), mF.nodes));
  return {
    el: clock, offset,
    update(f) {
      dayF.set(f.day, f.dayCN); ddF.set(f.dd); monF.set(f.mon, f.monCN);
      hF.set(f.H2); mF.set(f.M2);
    },
  };
}

// Square clock: big HH MM stacked feel, with DAY / DD / MON beneath.
function makeSquareClock(offset, palette = DARK) {
  const { clock, face } = frame({ '--face': '#f1efe7', '--face-gap': '9px', '--gap': '6px' });
  const hF  = digitPair(merge(palette, SZ.sqD));
  const mF  = digitPair(merge(palette, SZ.sqD));
  const dayF = wordFlap(merge(palette, SZ.sqW));
  const ddF  = digitPair(merge(palette, SZ.sqDD));
  const monF = wordFlap(merge(palette, SZ.sqW));
  face.appendChild(row(hF.nodes, mF.nodes));
  face.appendChild(row(dayF.el, ddF.nodes, monF.el));
  return {
    el: clock, offset,
    update(f) { hF.set(f.H2); mF.set(f.M2); dayF.set(f.day, f.dayCN); ddF.set(f.dd); monF.set(f.mon, f.monCN); },
  };
}

// Plain desk flip clock: HH : MM only.
function makeMiniClock(offset, palette = DARK) {
  const { clock, face } = frame({ '--face': palette === DARK ? '#f0eee6' : '#222', '--gap': '6px' });
  const hF = digitPair(merge(palette, SZ.miniD));
  const mF = digitPair(merge(palette, SZ.miniD));
  face.appendChild(row(hF.nodes, colon(42, palette['--card']), mF.nodes));
  return { el: clock, offset, update(f) { hF.set(f.H2); mF.set(f.M2); } };
}

// World clock: a labelled small HH : MM.
function makeWorldClock(offset, label) {
  const { clock, face } = frame({ '--face': '#1b1d21', '--gap': '5px', '--face-gap': '6px' });
  const lab = document.createElement('div');
  lab.className = 'clock-label';
  lab.style.color = 'rgba(255,255,255,0.62)';
  lab.textContent = label;
  const hF = digitPair(merge(DARK, SZ.worldD));
  const mF = digitPair(merge(DARK, SZ.worldD));
  face.appendChild(lab);
  face.appendChild(row(hF.nodes, colon(28, '#1c1e22'), mF.nodes));
  return { el: clock, offset, update(f) { hF.set(f.H2); mF.set(f.M2); } };
}

// Round analog clock, ticking from the same shared time.
function makeAnalog(offset, size = 150) {
  const { clock, face } = frame({ '--face': '#f4f2ec', '--r': '50%' });
  face.style.padding = '0';
  const dial = document.createElement('div');
  dial.className = 'analog';
  dial.style.width = size + 'px';
  dial.style.height = size + 'px';
  for (let i = 0; i < 12; i++) {
    const t = document.createElement('div');
    t.className = 'tick';
    t.style.setProperty('--a', (i * 30) + 'deg');
    t.innerHTML = '<i></i>';
    dial.appendChild(t);
  }
  const positions = { 12: [50, 12], 3: [88, 50], 6: [50, 88], 9: [12, 50] };
  for (const [n, [x, y]] of Object.entries(positions)) {
    const num = document.createElement('div');
    num.className = 'num';
    num.textContent = n;
    num.style.left = x + '%';
    num.style.top = y + '%';
    dial.appendChild(num);
  }
  const hour = document.createElement('div'); hour.className = 'hand hour';
  const min  = document.createElement('div'); min.className = 'hand min';
  const sec  = document.createElement('div'); sec.className = 'hand sec';
  const cap  = document.createElement('div'); cap.className = 'cap';
  dial.append(hour, min, sec, cap);
  face.appendChild(dial);
  return {
    el: clock, offset,
    update(f) {
      const secA = f.S * 6;
      const minA = f.Mn * 6 + f.S * 0.1;
      const hrA  = f.h12n * 30;
      hour.style.transform = `rotate(${hrA}deg)`;
      min.style.transform  = `rotate(${minA}deg)`;
      sec.style.transform  = `rotate(${secA}deg)`;
    },
  };
}

// ----------------------------------------------------------------------------
// Build the wall.
// ----------------------------------------------------------------------------
const wall = document.getElementById('wall');
const board = document.getElementById('clocks');

// City offsets (minutes from UTC) — June-ish, exactness isn't the point.
const NY = -240, LDN = 60, TYO = 540, HK = 480;

const clocks = [
  makeAnalog(LOCAL_OFFSET, 132),
  makeBigDateClock(LOCAL_OFFSET),
  makeWorldClock(NY, 'NEW YORK'),
  makeSquareClock(LOCAL_OFFSET),
  makeWorldClock(LDN, 'LONDON'),
  makeMiniClock(LOCAL_OFFSET, DARK),
  makeWorldClock(TYO, 'TOKYO'),
  makeMiniClock(LOCAL_OFFSET, LIGHT),
  makeWorldClock(HK, 'HONG KONG'),
  makeAnalog(LOCAL_OFFSET, 108),
];

let seed = 7;
const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
clocks.forEach((c) => {
  c.el.style.transform = `rotate(${(rnd() - 0.5) * 2.4}deg)`;
  board.appendChild(c.el);
});

// ----------------------------------------------------------------------------
// Render loop — derive each clock's fields from the shared base + its offset,
// and push them in. set() only animates digits that actually changed.
// ----------------------------------------------------------------------------
function frameLoop() {
  const b = time.base();
  for (const c of clocks) {
    c.update(fieldsAt(b + c.offset * 60000));
  }
  requestAnimationFrame(frameLoop);
}
requestAnimationFrame(frameLoop);

// ----------------------------------------------------------------------------
// Controls: grade toggle, speed, now.
// ----------------------------------------------------------------------------
const gradeSeg = document.getElementById('grade-seg');
gradeSeg.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-grade]');
  if (!btn) return;
  wall.dataset.grade = btn.dataset.grade;
  gradeSeg.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b === btn));
});

const speedSeg = document.getElementById('speed-seg');
speedSeg.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-speed]');
  if (!btn) return;
  time.setSpeed(parseFloat(btn.dataset.speed));
  speedSeg.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b === btn));
});

document.getElementById('now-btn').addEventListener('click', () => time.reset());
