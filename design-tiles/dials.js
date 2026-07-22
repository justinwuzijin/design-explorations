/** DialKit config for the thisisneverthat lockup. */

export const FONT_OPTIONS = [
  { value: "helvetica", label: "Helvetica Neue" },
  { value: "inter", label: "Inter" },
  { value: "arial", label: "Arial" },
  { value: "arial-black", label: "Arial Black" },
  { value: "system", label: "System UI" },
  { value: "georgia", label: "Georgia" },
  { value: "courier", label: "Courier New" },
];

export const FONT_STACKS = {
  helvetica: '"Helvetica Neue", Helvetica, Arial, sans-serif',
  inter: "Inter, system-ui, sans-serif",
  arial: "Arial, Helvetica, sans-serif",
  "arial-black": '"Arial Black", Arial, sans-serif',
  system: "system-ui, -apple-system, sans-serif",
  georgia: "Georgia, Times, serif",
  courier: '"Courier New", Courier, monospace',
};

export const COLOR_MODE_OPTIONS = [
  { value: "swatch", label: "Swatch shuffle" },
  { value: "mono", label: "Single color" },
  { value: "black", label: "All black" },
  { value: "invert", label: "Ink on tint" },
];

/** Flat list of characters in lockup order for per-glyph spacing. */
export const CHARS = [..."thisisneverthat"];

function charSpacingFolder() {
  const folder = {};
  CHARS.forEach((ch, i) => {
    folder[`c${i}_${ch}`] = [0, -0.35, 0.55, 0.005];
  });
  return folder;
}

export const dialConfig = {
  type: {
    font: {
      type: "select",
      options: FONT_OPTIONS,
      default: "helvetica",
    },
    weight: [700, 100, 900, 100],
    size: [2.4, 0.8, 6, 0.05],
    letterSpacing: [-0.055, -0.2, 0.35, 0.001],
    italic: false,
    opacity: [1, 0.05, 1, 0.01],
  },
  distort: {
    stretchX: [1, 0.5, 1.8, 0.01],
    stretchY: [1, 0.5, 1.8, 0.01],
    slant: [0, -25, 25, 0.5], // deg skewX
    rotate: [0, -15, 15, 0.1], // deg whole lockup
    baseline: [0, -40, 40, 1], // px vertical shift
  },
  look: {
    colorMode: {
      type: "select",
      options: COLOR_MODE_OPTIONS,
      default: "swatch",
    },
    ink: { type: "color", default: "#0a0a0a" },
    strokeWidth: [0, 0, 4, 0.05],
    strokeColor: { type: "color", default: "#0a0a0a" },
    shadowX: [0, -20, 20, 0.5],
    shadowY: [0, -20, 20, 0.5],
    shadowBlur: [0, 0, 40, 0.5],
    shadowColor: { type: "color", default: "#000000" },
    shadowAlpha: [0.25, 0, 1, 0.01],
  },
  layout: {
    wordGap: [0, -0.15, 0.6, 0.005], // em between words
    trackingJitter: [0, 0, 0.12, 0.001], // random per-letter nudge amp
  },
  mark: {
    size: [0.5, 0.2, 1.2, 0.01],
    gap: [0.08, -0.3, 0.4, 0.005],
    weight: [700, 100, 900, 100],
    color: { type: "color", default: "#0a0a0a" },
    opacity: [1, 0, 1, 0.01],
    followInk: true, // when true, mark uses look.ink in mono/black modes
  },
  chars: charSpacingFolder(),
  motion: {
    idleWave: true,
    hoverRecolor: true,
    colorOnWave: true,
    flyStagger: [55, 0, 200, 1],
    wordStagger: [140, 0, 400, 5],
    contortAmount: [1, 0, 2.5, 0.05],
    waveMin: [2, 0.5, 8, 0.1], // seconds
    waveMax: [3.2, 1, 12, 0.1],
    colorSpeed: [520, 80, 2000, 20], // ms fill transition
  },
  scene: {
    background: { type: "color", default: "#f6f5f2" },
  },
  actions: {
    replay: { type: "action", label: "Replay Fly-in" },
    wave: { type: "action", label: "Contort Wave" },
    reshuffle: { type: "action", label: "Reshuffle Colors" },
  },
};

function hexAlpha(hex, alpha) {
  const h = (hex || "#000000").replace("#", "");
  const full =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h.padEnd(6, "0").slice(0, 6);
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Convert nested DialKit resolved values → engine settings. */
export function valuesToSettings(v) {
  const charSpacing = CHARS.map((ch, i) => {
    const key = `c${i}_${ch}`;
    return v?.chars?.[key] ?? 0;
  });

  const fontKey = v?.type?.font ?? "helvetica";
  const shadowAlpha = v?.look?.shadowAlpha ?? 0.25;

  return {
    fontKey,
    fontFamily: FONT_STACKS[fontKey] ?? FONT_STACKS.helvetica,
    weight: v?.type?.weight ?? 700,
    sizeRem: v?.type?.size ?? 2.4,
    letterSpacingEm: v?.type?.letterSpacing ?? -0.055,
    italic: v?.type?.italic ?? false,
    opacity: v?.type?.opacity ?? 1,

    stretchX: v?.distort?.stretchX ?? 1,
    stretchY: v?.distort?.stretchY ?? 1,
    slant: v?.distort?.slant ?? 0,
    rotate: v?.distort?.rotate ?? 0,
    baseline: v?.distort?.baseline ?? 0,

    colorMode: v?.look?.colorMode ?? "swatch",
    ink: v?.look?.ink ?? "#0a0a0a",
    strokeWidth: v?.look?.strokeWidth ?? 0,
    strokeColor: v?.look?.strokeColor ?? "#0a0a0a",
    shadowX: v?.look?.shadowX ?? 0,
    shadowY: v?.look?.shadowY ?? 0,
    shadowBlur: v?.look?.shadowBlur ?? 0,
    shadowColor: hexAlpha(v?.look?.shadowColor ?? "#000000", shadowAlpha),

    wordGap: v?.layout?.wordGap ?? 0,
    trackingJitter: v?.layout?.trackingJitter ?? 0,

    markSize: v?.mark?.size ?? 0.5,
    markRaise: 0.1,
    markGap: v?.mark?.gap ?? 0.08,
    markWeight: v?.mark?.weight ?? 700,
    markColor: v?.mark?.color ?? "#0a0a0a",
    markOpacity: v?.mark?.opacity ?? 1,
    markFollowInk: v?.mark?.followInk ?? true,

    charSpacing,

    idleWave: v?.motion?.idleWave ?? true,
    hoverRecolor: v?.motion?.hoverRecolor ?? true,
    colorOnWave: v?.motion?.colorOnWave ?? true,
    flyStagger: v?.motion?.flyStagger ?? 55,
    wordStagger: v?.motion?.wordStagger ?? 140,
    contortAmount: v?.motion?.contortAmount ?? 1,
    waveMin: (v?.motion?.waveMin ?? 2) * 1000,
    waveMax: (v?.motion?.waveMax ?? 3.2) * 1000,
    colorSpeed: v?.motion?.colorSpeed ?? 520,

    background: v?.scene?.background ?? "#f6f5f2",
  };
}
