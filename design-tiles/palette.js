export const WORDS = ["this", "is", "never", "that"];

/** Contort wave order (logo text always stays thisisneverthat). */
export const PHRASE_ORDERS = [
  ["this", "is", "never", "that"],
  ["that", "is", "never", "this"],
  ["this", "is", "that"],
  ["never", "is", "that", "this"],
];

export const SWATCHES = [
  { bg: "#0a0a0a", fg: "#ffffff" },
  { bg: "#ff2e20", fg: "#0a0a0a" },
  { bg: "#f0c2f7", fg: "#0a0a0a" },
  { bg: "#22e58b", fg: "#0a0a0a" },
  { bg: "#7c4dff", fg: "#ffffff" },
  { bg: "#ffe14d", fg: "#0a0a0a" },
  { bg: "#18b6ff", fg: "#0a0a0a" },
  { bg: "#ff7a1a", fg: "#0a0a0a" },
  { bg: "#ff4fa3", fg: "#0a0a0a" },
];

export function randomSwatch(exclude) {
  if (SWATCHES.length < 2 || !exclude) {
    return SWATCHES[(Math.random() * SWATCHES.length) | 0];
  }
  let s = exclude;
  while (s === exclude) s = SWATCHES[(Math.random() * SWATCHES.length) | 0];
  return s;
}

export function randomSwatchAvoiding(used) {
  const free = SWATCHES.filter((s) => !used.includes(s));
  const pool = free.length > 0 ? free : SWATCHES;
  return pool[(Math.random() * pool.length) | 0];
}

export const INITIAL = [
  SWATCHES[0],
  SWATCHES[1],
  SWATCHES[2],
  SWATCHES[3],
  SWATCHES[4],
];
