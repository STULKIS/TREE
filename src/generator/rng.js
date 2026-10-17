/**
 * Small deterministic random number helpers.
 * Every tree is a pure function of its parameters + seed, so the same
 * seed always grows the same tree (and exports reproduce exactly).
 */

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeRng(seed) {
  const next = mulberry32((seed >>> 0) || 1);
  let spare = null;

  const rng = () => next();

  rng.range = (min, max) => min + (max - min) * next();

  rng.int = (min, max) => Math.floor(min + (max - min + 1) * next());

  /** Approximately normal distribution (Box–Muller), clamped to ±3σ. */
  rng.gauss = () => {
    if (spare !== null) {
      const value = spare;
      spare = null;
      return value;
    }
    let u = 0;
    let v = 0;
    while (u === 0) u = next();
    while (v === 0) v = next();
    const mag = Math.sqrt(-2 * Math.log(u));
    spare = mag * Math.sin(2 * Math.PI * v);
    return Math.max(-3, Math.min(3, mag * Math.cos(2 * Math.PI * v)));
  };

  rng.chance = (probability) => next() < probability;

  rng.pick = (array) => array[Math.floor(next() * array.length) % array.length];

  rng.sign = () => (next() < 0.5 ? -1 : 1);

  return rng;
}

/** Stable 32-bit hash used to derive sub-seeds (e.g. per-limb variation). */
export function hash32(value) {
  let x = Math.imul(value ^ 0x9e3779b9, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  x ^= x >>> 16;
  return x >>> 0;
}
