import { SPECIES_BY_ID } from '../generator/params.js';

const HASH_PATTERN = /^([a-z]+)-(\d{1,9})$/i;

/** Parses "#oak-4815" into { species, seed }, or null when it is not ours. */
export function parseHash(hash) {
  const raw = String(hash || '').trim().replace(/^#/, '').trim();
  const match = raw.match(HASH_PATTERN);
  if (!match) return null;
  const species = SPECIES_BY_ID[match[1].toLowerCase()];
  if (!species) return null;
  const seed = Number(match[2]);
  if (!Number.isFinite(seed) || seed < 1) return null;
  return { species: species.id, seed };
}

export function buildHash(species, seed) {
  return `#${species}-${Math.max(1, Math.round(Number(seed) || 1))}`;
}
