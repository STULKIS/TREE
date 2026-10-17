// Design JSON: the full parameter tree plus stats. Import goes through the same sanitiser
// as share links, so a hostile file can never produce an out-of-range tree.
import { sanitizeDesign, PARAM_LIST } from '../generator/params.js';

export const DESIGN_FORMAT = 'sapling.design';
export const DESIGN_VERSION = 1;
const MAX_DESIGN_BYTES = 256 * 1024;

export function designToJSON(design, stats = null) {
  const clean = sanitizeDesign(design);
  const params = {};
  for (const spec of PARAM_LIST) params[spec.key] = clean.params[spec.key];
  return JSON.stringify({
    format: DESIGN_FORMAT,
    version: DESIGN_VERSION,
    species: clean.species,
    seed: clean.seed,
    params,
    stats: stats ?? undefined,
  }, null, 2) + '\n';
}

export function designFromJSON(text) {
  if (typeof text !== 'string') throw new TypeError('Design file must be text');
  if (text.length > MAX_DESIGN_BYTES) throw new RangeError('Design file is too large');
  const obj = JSON.parse(text);
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) throw new TypeError('Design file must be a JSON object');
  if (obj.format !== undefined && obj.format !== DESIGN_FORMAT) throw new TypeError('Not a Sapling design file');
  return sanitizeDesign(obj);
}
