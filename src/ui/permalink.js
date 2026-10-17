// Share links: `#species=oak&seed=42&height=9.5&…`. Only values that differ from the species
// preset are written. Reading always goes through sanitizeDesign, so hostile hashes are safe.
import { PARAM_SPEC, PARAM_LIST, presetParams, sanitizeDesign, DEFAULT_SPECIES } from '../generator/params.js';

export function encodeHash(design) {
  const clean = sanitizeDesign(design);
  const preset = presetParams(clean.species);
  const parts = [`species=${encodeURIComponent(clean.species)}`, `seed=${clean.seed}`];
  for (const spec of PARAM_LIST) {
    const v = clean.params[spec.key];
    if (v !== preset[spec.key]) parts.push(`${spec.key}=${encodeURIComponent(String(v))}`);
  }
  return `#${parts.join('&')}`;
}

/**
 * Parse a hash. Returns a sanitised design, or null when nothing usable is present.
 * Never throws: malformed percent-encoding is treated as "no link".
 */
export function decodeHash(hash) {
  if (typeof hash !== 'string') return null;
  const body = hash.trim().replace(/^#/, '').trim();
  if (!body) return null;
  const raw = {};
  let hits = 0;
  try {
    for (const pair of body.split('&')) {
      const eq = pair.indexOf('=');
      if (eq <= 0) continue;
      const key = decodeURIComponent(pair.slice(0, eq)).trim();
      const value = decodeURIComponent(pair.slice(eq + 1)).trim();
      if (key === 'species' || key === 'seed' || Object.hasOwn(PARAM_SPEC, key)) {
        raw[key] = value;
        hits++;
      }
    }
  } catch {
    return null;
  }
  if (hits === 0) return null;
  const species = Object.hasOwn(raw, 'species') ? raw.species : DEFAULT_SPECIES;
  const params = {};
  for (const spec of PARAM_LIST) if (Object.hasOwn(raw, spec.key)) params[spec.key] = raw[spec.key];
  return sanitizeDesign({ species, seed: raw.seed, params });
}
