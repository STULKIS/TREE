/**
 * Share links: `#s=<species>&seed=<seed>&<param>=<value>…` for every param that
 * differs from the species preset. Parsing goes through `sanitizeDesign`, so a
 * hostile or truncated hash degrades to a valid design rather than an error.
 */
import { sanitizeDesign, diffFromPreset, SCHEMA_BY_KEY, DEFAULT_SPECIES } from '../generator/params.js';

const MAX_HASH_LENGTH = 4096;

/** Encode a design into a hash string (with leading `#`). */
export function encodeHash(design) {
  const clean = sanitizeDesign(design);
  const qs = new URLSearchParams();
  qs.set('s', clean.species);
  qs.set('seed', String(clean.seed));
  const diff = diffFromPreset(clean.params, clean.species);
  for (const key of Object.keys(diff)) {
    const def = SCHEMA_BY_KEY[key];
    let v = diff[key];
    if (def.type === 'color') v = String(v).replace('#', '');
    qs.set(key, String(v));
  }
  return `#${qs.toString()}`;
}

/**
 * Decode a hash (with or without `#`) into a sanitised design.
 * Returns `null` when the hash carries no Sapling data at all.
 */
export function decodeHash(hash) {
  if (typeof hash !== 'string') return null;
  let h = hash.trim();
  if (h.startsWith('#')) h = h.slice(1);
  if (!h) return null;
  if (h.length > MAX_HASH_LENGTH) h = h.slice(0, MAX_HASH_LENGTH);
  let qs;
  try {
    qs = new URLSearchParams(h);
  } catch {
    return null;
  }
  if (!qs.has('s') && !qs.has('seed') && ![...qs.keys()].some((k) => SCHEMA_BY_KEY[k])) return null;
  const species = qs.get('s') || DEFAULT_SPECIES;
  const seed = qs.get('seed');
  const params = {};
  for (const [k, v] of qs.entries()) {
    const def = SCHEMA_BY_KEY[k];
    if (!def) continue;
    params[k] = def.type === 'color' ? `#${v}` : v;
  }
  return sanitizeDesign({ species, seed: seed === null ? undefined : seed, params });
}

/** Full shareable URL for the current location. */
export function shareUrl(design, loc = typeof location !== 'undefined' ? location : null) {
  const hash = encodeHash(design);
  if (!loc) return hash;
  return `${loc.origin}${loc.pathname}${loc.search}${hash}`;
}
