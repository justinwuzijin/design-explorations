import {
  WORDS,
  INITIAL,
  PHRASE_ORDERS,
  randomSwatchAvoiding,
} from "./palette.js";
import { LETTER_SPACING_EM } from "./measure.js";
import { CHARS } from "./dials.js";

const FLY_MS = 680;
const CONTORT_MS = 280;

const POP_EASE = "cubic-bezier(.34,1.56,.64,1)";

function contortTransform(amount = 1) {
  const a = amount;
  const sx = (0.92 + Math.random() * 0.22 * a).toFixed(3);
  const sy = (0.88 + Math.random() * 0.28 * a).toFixed(3);
  const skew = ((Math.random() * 14 - 7) * a).toFixed(2);
  const rot = ((Math.random() * 10 - 5) * a).toFixed(2);
  const y = ((Math.random() * 6 - 2) * a).toFixed(2);
  return `translateY(${y}px) rotate(${rot}deg) skewX(${skew}deg) scale(${sx}, ${sy})`;
}

export class DesignTiles {
  constructor(host, initialSettings = {}) {
    this.host = host;
    this.tiles = [];
    this.byWord = new Map();
    this.allLetters = []; // flat letter refs in lockup order
    this.raf = 0;
    this.running = false;
    this.disposed = false;
    this.revealed = false;
    this.now = 0;
    this.nextPhraseAt = 0;
    this.phraseStep = 0;
    this.scriptedDone = false;
    this.currentOrder = PHRASE_ORDERS[0].slice();
    this.animating = false;
    this.cleanup = [];
    this.jitterSeeds = CHARS.map(() => Math.random() * 2 - 1);
    this.settings = {
      fontFamily: '"Helvetica Neue", Helvetica, Arial, Inter, sans-serif',
      weight: 700,
      sizeRem: 2.4,
      letterSpacingEm: LETTER_SPACING_EM,
      italic: false,
      opacity: 1,
      stretchX: 1,
      stretchY: 1,
      slant: 0,
      rotate: 0,
      baseline: 0,
      colorMode: "swatch",
      ink: "#0a0a0a",
      strokeWidth: 0,
      strokeColor: "#0a0a0a",
      shadowX: 0,
      shadowY: 0,
      shadowBlur: 0,
      shadowColor: "rgba(0,0,0,0.25)",
      wordGap: 0,
      trackingJitter: 0,
      markSize: 0.5,
      markRaise: 0.1,
      markGap: 0.08,
      markWeight: 700,
      markColor: "#0a0a0a",
      markOpacity: 1,
      markFollowInk: true,
      charSpacing: CHARS.map(() => 0),
      idleWave: true,
      hoverRecolor: true,
      colorOnWave: true,
      flyStagger: 55,
      wordStagger: 140,
      contortAmount: 1,
      waveMin: 2000,
      waveMax: 3200,
      colorSpeed: 520,
      background: "#f6f5f2",
      ...initialSettings,
    };

    const root = document.createElement("div");
    Object.assign(root.style, {
      position: "absolute",
      inset: "0",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      userSelect: "none",
    });
    root.setAttribute("aria-label", `${WORDS.join("")}®`);

    const bar = document.createElement("div");
    Object.assign(bar.style, {
      display: "flex",
      alignItems: "baseline",
      lineHeight: "1",
    });

    let letterIndex = 0;

    WORDS.forEach((word, i) => {
      const sw = INITIAL[i] ?? randomSwatchAvoiding([]);
      const outer = document.createElement("span");
      Object.assign(outer.style, {
        display: "inline-flex",
        alignItems: "baseline",
        cursor: "pointer",
      });

      const letters = [];
      for (const ch of word) {
        const el = document.createElement("span");
        el.textContent = ch;
        Object.assign(el.style, {
          display: "inline-block",
          color: sw.bg === "#0a0a0a" ? "#0a0a0a" : sw.bg,
          transition: `color ${this.settings.colorSpeed}ms ease, transform ${FLY_MS}ms ${POP_EASE}, opacity ${Math.round(FLY_MS * 0.7)}ms ease`,
          opacity: "0",
          transform:
            contortTransform(this.settings.contortAmount) + " scale(0.35)",
          transformOrigin: "50% 80%",
        });
        outer.appendChild(el);
        const letter = { el, index: letterIndex++, ch };
        letters.push(letter);
        this.allLetters.push(letter);
      }

      bar.appendChild(outer);
      const tile = { outer, letters, word, swatch: sw, baseSwatch: sw };
      this.tiles.push(tile);
      this.byWord.set(word, tile);
    });

    const mark = document.createElement("span");
    mark.setAttribute("aria-hidden", "true");
    mark.textContent = "®";
    Object.assign(mark.style, {
      display: "inline-block",
      position: "relative",
      lineHeight: "1",
      letterSpacing: "0",
      color: "#0a0a0a",
      opacity: "0",
      transformOrigin: "50% 80%",
      transform:
        contortTransform(this.settings.contortAmount) + " scale(0.35)",
      transition: `opacity ${Math.round(FLY_MS * 0.7)}ms ease, transform ${FLY_MS}ms ${POP_EASE}`,
      userSelect: "none",
      pointerEvents: "none",
    });
    bar.appendChild(mark);
    this.mark = mark;

    root.appendChild(bar);
    host.appendChild(root);
    this.root = root;
    this.bar = bar;

    this.bindEvents();
    this.applySettings(this.settings);
  }

  bindEvents() {
    this.tiles.forEach((tile) => {
      const onEnter = () => {
        if (this.animating || !this.revealed) return;
        if (this.settings.hoverRecolor) this.recolor(tile);
        this.popContortTiles([tile]);
        if (tile.word === "that") this.popContortMark();
      };
      tile.outer.addEventListener("pointerenter", onEnter);
      this.cleanup.push(() =>
        tile.outer.removeEventListener("pointerenter", onEnter)
      );
    });
  }

  colorMs() {
    return this.settings.colorSpeed ?? 520;
  }

  resolveLetterColor(tile) {
    const mode = this.settings.colorMode;
    if (mode === "black") return "#0a0a0a";
    if (mode === "mono") return this.settings.ink;
    if (mode === "invert") return this.settings.background;
    const sw = tile.swatch;
    return sw.bg === "#0a0a0a" ? "#0a0a0a" : sw.bg;
  }

  applySettings(partial = {}) {
    this.settings = { ...this.settings, ...partial };
    const s = this.settings;

    const bg =
      s.colorMode === "invert" ? s.ink : (s.background ?? "#f6f5f2");
    document.documentElement.style.setProperty("--dt-bg", bg);
    if (document.body) document.body.style.background = bg;

    this.fontFamily = s.fontFamily;
    this.bar.style.fontFamily = s.fontFamily;
    this.bar.style.fontWeight = String(s.weight);
    this.bar.style.fontSize = `${s.sizeRem}rem`;
    this.bar.style.letterSpacing = `${s.letterSpacingEm}em`;
    this.bar.style.fontStyle = s.italic ? "italic" : "normal";
    this.bar.style.opacity = String(s.opacity);
    this.bar.style.transform = [
      `translateY(${s.baseline}px)`,
      `rotate(${s.rotate}deg)`,
      `skewX(${s.slant}deg)`,
      `scale(${s.stretchX}, ${s.stretchY})`,
    ].join(" ");
    this.bar.style.transformOrigin = "center center";

    this.root.style.fontFamily = s.fontFamily;
    this.root.style.fontWeight = String(s.weight);
    this.root.style.letterSpacing = `${s.letterSpacingEm}em`;

    const stroke =
      s.strokeWidth > 0.01
        ? `${s.strokeWidth}px ${s.strokeColor}`
        : "0 transparent";
    const shadow =
      s.shadowBlur > 0.01 || Math.abs(s.shadowX) > 0.01 || Math.abs(s.shadowY) > 0.01
        ? `${s.shadowX}px ${s.shadowY}px ${s.shadowBlur}px ${s.shadowColor}`
        : "none";

    this.tiles.forEach((tile, ti) => {
      tile.outer.style.marginLeft = ti === 0 ? "0" : `${s.wordGap}em`;
      const color = this.resolveLetterColor(tile);
      for (const { el } of tile.letters) {
        el.style.color = color;
        el.style.fontFamily = s.fontFamily;
        el.style.fontWeight = String(s.weight);
        el.style.fontStyle = s.italic ? "italic" : "normal";
        el.style.webkitTextStroke = stroke;
        el.style.textShadow = shadow;
        el.style.transition = `color ${this.colorMs()}ms ease, transform ${FLY_MS}ms ${POP_EASE}, opacity ${Math.round(FLY_MS * 0.7)}ms ease`;
      }
    });

    this.allLetters.forEach((letter, i) => {
      const extra = s.charSpacing?.[i] ?? 0;
      const jitter = (this.jitterSeeds[i] ?? 0) * (s.trackingJitter ?? 0);
      letter.el.style.marginLeft = `${extra + jitter}em`;
      if (this.revealed) letter.el.style.opacity = "1";
    });

    const markSize = s.markSize;
    const markRaise = 0.1;
    this.settings.markRaise = markRaise;
    const markColor =
      s.markFollowInk && (s.colorMode === "mono" || s.colorMode === "black")
        ? s.colorMode === "black"
          ? "#0a0a0a"
          : s.ink
        : s.colorMode === "invert"
          ? s.background
          : s.markColor;

    this.mark.style.fontFamily = s.fontFamily;
    this.mark.style.fontWeight = String(s.markWeight);
    this.mark.style.fontStyle = s.italic ? "italic" : "normal";
    this.mark.style.fontSize = `${markSize}em`;
    this.mark.style.top = `${(-markRaise / markSize).toFixed(3)}em`;
    this.mark.style.marginLeft = `${(s.markGap / markSize).toFixed(3)}em`;
    this.mark.style.color = markColor;
    this.mark.style.webkitTextStroke = stroke;
    this.mark.style.textShadow = shadow;
    if (this.revealed) this.mark.style.opacity = String(s.markOpacity);
  }

  applyColor(tile, sw) {
    tile.swatch = sw;
    const color = this.resolveLetterColor(tile);
    for (const { el } of tile.letters) el.style.color = color;
  }

  recolor(tile) {
    if (this.settings.colorMode !== "swatch") {
      this.applyColor(tile, tile.swatch);
      return;
    }
    const used = this.tiles.filter((t) => t !== tile).map((t) => t.swatch);
    this.applyColor(tile, randomSwatchAvoiding(used));
  }

  reshuffleColors() {
    if (this.settings.colorMode !== "swatch") {
      this.applySettings({});
      return;
    }
    const used = [];
    for (const tile of this.tiles) {
      const sw = randomSwatchAvoiding(used);
      used.push(sw);
      this.applyColor(tile, sw);
    }
  }

  popContortTiles(tiles) {
    const amount = this.settings.contortAmount;
    const cms = this.colorMs();
    for (const tile of tiles) {
      for (const { el } of tile.letters) {
        el.style.transition = `color ${cms}ms ease, transform ${CONTORT_MS}ms ${POP_EASE}`;
        el.style.transform = contortTransform(amount);
      }
    }
    const t = window.setTimeout(() => {
      for (const tile of tiles) {
        for (const { el } of tile.letters) {
          el.style.transition = `color ${cms}ms ease, transform ${FLY_MS}ms ${POP_EASE}`;
          el.style.transform = "none";
        }
      }
    }, CONTORT_MS - 40);
    this.cleanup.push(() => window.clearTimeout(t));
  }

  popContortMark() {
    const amount = this.settings.contortAmount;
    const cms = this.colorMs();
    this.mark.style.transition = `opacity ${cms}ms ease, transform ${CONTORT_MS}ms ${POP_EASE}`;
    this.mark.style.transform = contortTransform(amount);
    const t = window.setTimeout(() => {
      this.mark.style.transition = `opacity ${cms}ms ease, transform ${FLY_MS}ms ${POP_EASE}`;
      this.mark.style.transform = "none";
      this.mark.style.opacity = String(this.settings.markOpacity);
    }, CONTORT_MS - 40);
    this.cleanup.push(() => window.clearTimeout(t));
  }

  nextContortOrder() {
    if (!this.scriptedDone) {
      const order = PHRASE_ORDERS[this.phraseStep].slice();
      this.phraseStep += 1;
      if (this.phraseStep >= PHRASE_ORDERS.length) this.scriptedDone = true;
      return order;
    }
    const curKey = this.currentOrder.join(" ");
    const pool = PHRASE_ORDERS.filter((p) => p.join(" ") !== curKey);
    const pick =
      pool.length > 0
        ? pool[(Math.random() * pool.length) | 0]
        : PHRASE_ORDERS[(Math.random() * PHRASE_ORDERS.length) | 0];
    return pick.slice();
  }

  waveContort(order) {
    if (this.animating || this.disposed) return;
    this.animating = true;
    this.currentOrder = order;
    const wordStagger = this.settings.wordStagger;

    order.forEach((word, i) => {
      const tile = this.byWord.get(word);
      if (!tile) return;
      const delay = i * wordStagger;
      const t = window.setTimeout(() => {
        if (this.settings.colorOnWave) this.recolor(tile);
        this.popContortTiles([tile]);
        if (word === "that") this.popContortMark();
      }, delay);
      this.cleanup.push(() => window.clearTimeout(t));
    });

    // Always finish the wave with ® if "that" wasn't in this phrase
    const markBeat = order.includes("that")
      ? order.indexOf("that") * wordStagger
      : order.length * wordStagger;
    if (!order.includes("that")) {
      const tm = window.setTimeout(() => this.popContortMark(), markBeat);
      this.cleanup.push(() => window.clearTimeout(tm));
    }

    const doneAt = Math.max(markBeat, (order.length - 1) * wordStagger) + CONTORT_MS + 80;
    const td = window.setTimeout(() => {
      this.animating = false;
    }, doneAt);
    this.cleanup.push(() => window.clearTimeout(td));
  }

  advancePhrase() {
    this.waveContort(this.nextContortOrder());
  }

  refreshFont() {
    // fonts loaded — re-apply so metrics pick up webfont
    this.applySettings({});
  }

  reveal() {
    if (this.revealed) return;
    this.revealed = true;

    this.currentOrder = PHRASE_ORDERS[0].slice();
    this.phraseStep = 0;
    this.scriptedDone = false;

    const flyStagger = this.settings.flyStagger;
    const amount = this.settings.contortAmount;
    const all = this.allLetters;

    all.forEach((letter, i) => {
      const delay = i * flyStagger;
      const t = window.setTimeout(() => {
        letter.el.style.opacity = "1";
        letter.el.style.transform = contortTransform(amount);
        const settle = window.setTimeout(() => {
          letter.el.style.transform = "none";
        }, Math.round(FLY_MS * 0.55));
        this.cleanup.push(() => window.clearTimeout(settle));
      }, delay);
      this.cleanup.push(() => window.clearTimeout(t));
    });

    // ® flies in last with the same contort settle as letters
    const markDelay = all.length * flyStagger;
    const tm = window.setTimeout(() => {
      this.mark.style.opacity = String(this.settings.markOpacity);
      this.mark.style.transform = contortTransform(amount);
      const settle = window.setTimeout(() => {
        this.mark.style.transform = "none";
      }, Math.round(FLY_MS * 0.55));
      this.cleanup.push(() => window.clearTimeout(settle));
    }, markDelay);
    this.cleanup.push(() => window.clearTimeout(tm));

    const assembledAt = (all.length + 1) * flyStagger + FLY_MS;
    const wMin = this.settings.waveMin ?? 2000;
    const wMax = Math.max(wMin, this.settings.waveMax ?? 3200);
    this.nextPhraseAt =
      performance.now() + assembledAt + wMin + Math.random() * (wMax - wMin);
  }

  replay() {
    // reset letters and mark, then reveal again
    this.cleanup.forEach((fn) => fn());
    this.cleanup = [];
    this.revealed = false;
    this.animating = false;
    this.phraseStep = 0;
    this.scriptedDone = false;
    for (const letter of this.allLetters) {
      letter.el.style.opacity = "0";
      letter.el.style.transform =
        contortTransform(this.settings.contortAmount) + " scale(0.35)";
    }
    this.mark.style.opacity = "0";
    this.mark.style.transform =
      contortTransform(this.settings.contortAmount) + " scale(0.35)";
    this.reveal();
  }

  start() {
    if (this.running || this.disposed) return;
    this.running = true;
    this.reveal();
    this.raf = requestAnimationFrame(this.loop);
  }

  stop() {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  loop = () => {
    if (!this.running) return;
    this.now = performance.now();
    if (
      this.settings.idleWave &&
      this.nextPhraseAt > 0 &&
      this.now >= this.nextPhraseAt &&
      !this.animating
    ) {
      this.advancePhrase();
      const wMin = this.settings.waveMin ?? 2000;
      const wMax = Math.max(wMin, this.settings.waveMax ?? 3200);
      this.nextPhraseAt = this.now + wMin + Math.random() * (wMax - wMin);
    }
    this.raf = requestAnimationFrame(this.loop);
  };

  renderStill() {
    this.revealed = true;
    for (const letter of this.allLetters) {
      letter.el.style.transition = "none";
      letter.el.style.opacity = "1";
      letter.el.style.transform = "none";
    }
    this.mark.style.transition = "none";
    this.mark.style.opacity = String(this.settings.markOpacity);
    this.mark.style.transform = "none";
    this.applySettings({});
  }

  destroy() {
    this.disposed = true;
    this.stop();
    this.cleanup.forEach((fn) => fn());
    this.root.parentNode?.removeChild(this.root);
  }
}
