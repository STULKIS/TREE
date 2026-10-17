/**
 * Design JSON: the full parameter tree plus stats, enough to rebuild exactly.
 * Import goes through the same sanitiser as share links.
 */
import { sanitizeDesign } from '../generator/params.js';

export const DESIGN_FORMAT = 'sapling-design';
export const DESIGN_VERSION = 1;

export function buildDesignJson(design, stats = null) {
  const clean = sanitizeDesign(design);
  return JSON.stringify(
    {
      format: DESIGN_FORMAT,
      version: DESIGN_VERSION,
      species: clean.species,
      seed: clean.seed,
      params: clean.params,
      stats: stats || undefined,
      exportedAt: new Date().toISOString()
    },
    null,
    2
  );
}

/** Parse + sanitise design JSON text. Throws on unparsable input. */
export function parseDesignJson(text) {
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('That file is not valid JSON.');
  }
  if (!raw || typeof raw !== 'object') throw new Error('That file does not contain a Sapling design.');
  if (raw.format && raw.format !== DESIGN_FORMAT) throw new Error(`Unknown design format "${raw.format}".`);
  return sanitizeDesign(raw);
}
