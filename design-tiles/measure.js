export const REF_FS = 100;
export const BASELINE_Y = 100;

/** Em-based tracking matching the thisisneverthat logo lockup. */
export const LETTER_SPACING_EM = -0.055;

let canvas = null;
let ctx = null;

function getCtx() {
  if (typeof document === "undefined") return null;
  if (!canvas) {
    canvas = document.createElement("canvas");
    ctx = canvas.getContext("2d");
  }
  return ctx;
}

export function measureWord(word, fontFamily, weight, letterSpacingEm = 0) {
  const c = getCtx();
  if (!c) return null;

  c.font = `${weight} ${REF_FS}px ${fontFamily}`;
  const tracking = letterSpacingEm * REF_FS;

  const glyphs = [];
  let x = 0;
  const chars = [...word];

  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    const m = c.measureText(ch);
    const w = m.width;
    const ascent =
      m.actualBoundingBoxAscent > 0 ? m.actualBoundingBoxAscent : REF_FS * 0.72;
    const descent =
      m.actualBoundingBoxDescent > 0 ? m.actualBoundingBoxDescent : REF_FS * 0.2;

    glyphs.push({
      ch,
      x,
      w,
      top: BASELINE_Y - ascent,
      bottom: BASELINE_Y + descent,
    });
    x += w;
    if (i < chars.length - 1) x += tracking;
  }

  return { width: x, glyphs };
}
