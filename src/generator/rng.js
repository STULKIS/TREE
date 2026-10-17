/**
 * Seeded PRNG utilities. Every source of randomness in the generator flows
 * through here so that one seed always yields the same tree.
 *
 * Core generator: mulberry32 (32-bit state, period 2^32, good enough
 * statistical quality for procedural content and very fast).
 */

/** Hash an arbitrary string into a 32-bit unsigned integer (cyrb53 variant folded to 32 bits). */
export function hashString(str) {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  const s = String(str);
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h1 ^ h2) >>> 0;
}

/** Normalise any seed value (number or string) into a 32-bit unsigned integer. */
export function normalizeSeed(seed) {
  if (typeof seed === 'number' && Number.isFinite(seed)) {
    return Math.floor(Math.abs(seed)) >>> 0;
  }
  if (typeof seed === 'string') {
    const trimmed = seed.trim();
    if (/^\d{1,10}$/.test(trimmed)) {
      const n = Number(trimmed);
      if (n <= 0xffffffff) return n >>> 0;
    }
    return hashString(trimmed);
  }
  return 1;
}

/** Mix two 32-bit values into a fresh seed (for deterministic sub-streams). */
export function mixSeed(a, b) {
  let x = (a ^ Math.imul(b + 0x9e3779b9, 0x85ebca6b)) >>> 0;
  x = Math.imul(x ^ (x >>> 15), 0x2c1b3c6d) >>> 0;
  x = Math.imul(x ^ (x >>> 12), 0x297a2d39) >>> 0;
  return (x ^ (x >>> 15)) >>> 0;
}

export class Rng {
  constructor(seed = 1) {
    this.state = normalizeSeed(seed) || 1;
  }

  /** Uniform float in [0, 1). */
  next() {
    let t = (this.state = (this.state + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Uniform float in [min, max). */
  range(min, max) {
    return min + (max - min) * this.next();
  }

  /** Symmetric jitter in [-amount, amount]. */
  jitter(amount) {
    return (this.next() * 2 - 1) * amount;
  }

  /** Integer in [min, max] inclusive. */
  int(min, max) {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** Boolean with the given probability of being true. */
  chance(p) {
    return this.next() < p;
  }

  /** Approximately normal (Irwin–Hall, n=4) sample with mean 0 and std ~0.5. */
  gaussian() {
    return (this.next() + this.next() + this.next() + this.next() - 2) * 0.5;
  }

  /** Pick a random element. */
  pick(list) {
    return list[Math.floor(this.next() * list.length)];
  }

  /** Spawn an independent, deterministic child generator. */
  fork(salt = 0) {
    const s = mixSeed(this.state, (salt >>> 0) + Math.floor(this.next() * 0xffffffff));
    return new Rng(s || 1);
  }
}

/** Fresh random seed drawn from crypto when possible (used for dice/surprise only). */
export function randomSeed() {
  const c = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined;
  if (c && typeof c.getRandomValues === 'function') {
    const buf = new Uint32Array(1);
    c.getRandomValues(buf);
    return (buf[0] % 999999) + 1;
  }
  // Deterministic fallback keyed on time; only used when crypto is unavailable.
  return (hashString(String(Date.now())) % 999999) + 1;
}
