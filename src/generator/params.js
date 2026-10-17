/**
 * Parameter schema, limits, species presets, quality tiers and the single
 * sanitiser used by the worker, the UI and share-link / design-file parsing.
 */

export const LEAF_STYLES = ['broad', 'slender', 'droop', 'needle', 'none'];

/**
 * Schema-driven parameter list. Every exposed parameter lives here exactly
 * once. `LIMITS` and `DEFAULTS` are derived from it so there is one source of
 * truth for ranges.
 */
export const SCHEMA = [
  // ─── Trunk ────────────────────────────────────────────────────────────────
  { key: 'height', label: 'Height', unit: 'm', group: 'Trunk', type: 'number', min: 1, max: 40, step: 0.1, default: 12 },
  { key: 'radius', label: 'Base radius', unit: 'm', group: 'Trunk', type: 'number', min: 0.02, max: 2, step: 0.01, default: 0.35 },
  { key: 'taper', label: 'Taper', group: 'Trunk', type: 'number', min: 0, max: 1, step: 0.01, default: 0.7 },
  { key: 'flare', label: 'Root flare', group: 'Trunk', type: 'number', min: 0, max: 2, step: 0.01, default: 0.6 },
  { key: 'trunkBend', label: 'Lean / bend', group: 'Trunk', type: 'number', min: 0, max: 1, step: 0.01, default: 0.15 },
  { key: 'trunkWobble', label: 'Wobble', group: 'Trunk', type: 'number', min: 0, max: 1, step: 0.01, default: 0.2 },
  { key: 'trunkSegments', label: 'Segments', group: 'Trunk', type: 'int', min: 4, max: 48, step: 1, default: 18 },
  { key: 'trunkSides', label: 'Sides', group: 'Trunk', type: 'int', min: 3, max: 32, step: 1, default: 16 },

  // ─── Branches ─────────────────────────────────────────────────────────────
  { key: 'depth', label: 'Depth', group: 'Branches', type: 'int', min: 1, max: 7, step: 1, default: 4 },
  { key: 'children', label: 'Children', group: 'Branches', type: 'number', min: 1, max: 12, step: 0.5, default: 4 },
  { key: 'childrenFalloff', label: 'Children falloff', group: 'Branches', type: 'number', min: 0, max: 1, step: 0.01, default: 0.2 },
  { key: 'angle', label: 'Angle', unit: '°', group: 'Branches', type: 'number', min: 5, max: 120, step: 1, default: 45 },
  { key: 'spread', label: 'Spread', group: 'Branches', type: 'number', min: 0, max: 1, step: 0.01, default: 0.35 },
  { key: 'lengthRatio', label: 'Length ratio', group: 'Branches', type: 'number', min: 0.15, max: 1, step: 0.01, default: 0.62 },
  { key: 'lengthVariance', label: 'Length variance', group: 'Branches', type: 'number', min: 0, max: 1, step: 0.01, default: 0.3 },
  { key: 'radiusRatio', label: 'Radius ratio', group: 'Branches', type: 'number', min: 0.2, max: 1, step: 0.01, default: 0.68 },
  { key: 'startOffset', label: 'Start offset', group: 'Branches', type: 'number', min: 0, max: 0.95, step: 0.01, default: 0.35 },
  { key: 'endOffset', label: 'End offset', group: 'Branches', type: 'number', min: 0.05, max: 1, step: 0.01, default: 0.96 },
  { key: 'curve', label: 'Curve', group: 'Branches', type: 'number', min: 0, max: 1, step: 0.01, default: 0.3 },
  { key: 'droop', label: 'Droop', group: 'Branches', type: 'number', min: -1, max: 1, step: 0.01, default: 0.1 },
  { key: 'gnarl', label: 'Gnarl', group: 'Branches', type: 'number', min: 0, max: 1, step: 0.01, default: 0.25 },
  { key: 'gravitropism', label: 'Gravitropism', group: 'Branches', type: 'number', min: -1, max: 1, step: 0.01, default: 0.2 },
  { key: 'phototropism', label: 'Phototropism', group: 'Branches', type: 'number', min: 0, max: 1, step: 0.01, default: 0.3 },
  { key: 'branchSegments', label: 'Segments', group: 'Branches', type: 'int', min: 2, max: 16, step: 1, default: 8 },
  { key: 'twigs', label: 'Twigs', group: 'Branches', type: 'number', min: 0, max: 1, step: 0.01, default: 0.4 },
  { key: 'crown', label: 'Crown shape', group: 'Branches', type: 'number', min: 0, max: 1, step: 0.01, default: 0.7 },

  // ─── Leaves ───────────────────────────────────────────────────────────────
  { key: 'leafStyle', label: 'Style', group: 'Leaves', type: 'select', options: LEAF_STYLES, default: 'broad' },
  { key: 'leafDensity', label: 'Density', group: 'Leaves', type: 'number', min: 0, max: 1, step: 0.01, default: 0.6 },
  { key: 'leafSize', label: 'Size', unit: 'm', group: 'Leaves', type: 'number', min: 0.02, max: 1.2, step: 0.01, default: 0.22 },
  { key: 'leafSizeVariance', label: 'Size variance', group: 'Leaves', type: 'number', min: 0, max: 1, step: 0.01, default: 0.35 },
  { key: 'leafReach', label: 'Inward reach', group: 'Leaves', type: 'number', min: 0, max: 1, step: 0.01, default: 0.35 },
  { key: 'leafDroop', label: 'Hang', group: 'Leaves', type: 'number', min: 0, max: 1, step: 0.01, default: 0.3 },
  { key: 'leafStartDepth', label: 'Start depth', group: 'Leaves', type: 'int', min: 0, max: 7, step: 1, default: 2 },
  { key: 'leafBudget', label: 'Card budget', group: 'Leaves', type: 'int', min: 500, max: 32000, step: 100, default: 16000 },

  // ─── Palette ──────────────────────────────────────────────────────────────
  { key: 'barkColor', label: 'Bark', group: 'Palette', type: 'color', default: '#5b4634' },
  { key: 'barkTint', label: 'Bark tint', group: 'Palette', type: 'color', default: '#8a7257' },
  { key: 'leafColor', label: 'Leaf base', group: 'Palette', type: 'color', default: '#3f7a2d' },
  { key: 'leafTipColor', label: 'Leaf tip', group: 'Palette', type: 'color', default: '#9ccd4a' },
  { key: 'leafVariance', label: 'Leaf variance', group: 'Palette', type: 'number', min: 0, max: 1, step: 0.01, default: 0.35 },
  { key: 'autumn', label: 'Autumn', group: 'Palette', type: 'number', min: 0, max: 1, step: 0.01, default: 0 }
];

export const GROUPS = ['Trunk', 'Branches', 'Leaves', 'Palette'];

export const SCHEMA_BY_KEY = Object.fromEntries(SCHEMA.map((s) => [s.key, s]));

/** Numeric limits derived from the schema (plus structural caps). */
export const LIMITS = Object.freeze({
  ...Object.fromEntries(
    SCHEMA.filter((s) => s.type === 'number' || s.type === 'int').map((s) => [s.key, { min: s.min, max: s.max }])
  ),
  seed: { min: 1, max: 0xffffffff },
  maxLimbs: 9000,
  maxTriangles: 250000,
  maxLeaves: 32000,
  softwareTriangles: 70000
});

export const DEFAULTS = Object.freeze(Object.fromEntries(SCHEMA.map((s) => [s.key, s.default])));

/**
 * Quality tiers. `studio` is what exports always use; `preview` is used while a
 * slider is being dragged; `software` is used when WebGL is unavailable.
 */
export const QUALITY = Object.freeze({
  studio: { id: 'studio', sides: 1, segments: 1, leaves: 1, limbs: 1, maxDepth: 7, triangleBudget: LIMITS.maxTriangles },
  preview: { id: 'preview', sides: 0.6, segments: 0.6, leaves: 0.5, limbs: 0.6, maxDepth: 6, triangleBudget: 120000 },
  software: { id: 'software', sides: 0.45, segments: 0.5, leaves: 0.3, limbs: 0.45, maxDepth: 5, triangleBudget: 60000 },
  thumb: { id: 'thumb', sides: 0.35, segments: 0.5, leaves: 0.2, limbs: 0.35, maxDepth: 4, triangleBudget: 24000 }
});

/* ────────────────────────────────────────────────────────────────────────────
 * Species presets. Each is a complete parameter set; `DEFAULTS` fill any gap.
 * ──────────────────────────────────────────────────────────────────────────── */
export const SPECIES = Object.freeze({
  oak: {
    name: 'Oak',
    latin: 'Quercus robur',
    blurb: 'Broad, muscular crown. Heavy limbs that wander.',
    params: {
      height: 13, radius: 0.5, taper: 0.55, flare: 0.9, trunkBend: 0.15, trunkWobble: 0.3,
      trunkSegments: 16, trunkSides: 18,
      depth: 5, children: 4, childrenFalloff: 0.1, angle: 52, spread: 0.45, lengthRatio: 0.62,
      lengthVariance: 0.35, radiusRatio: 0.7, startOffset: 0.3, endOffset: 0.92, curve: 0.35,
      droop: 0.05, gnarl: 0.45, gravitropism: 0.15, phototropism: 0.35, branchSegments: 7, twigs: 0.5, crown: 0.8,
      leafStyle: 'broad', leafDensity: 0.62, leafSize: 0.26, leafSizeVariance: 0.35, leafReach: 0.35,
      leafDroop: 0.25, leafStartDepth: 2, leafBudget: 18000,
      barkColor: '#4e3b2c', barkTint: '#7c6752', leafColor: '#2f6a28', leafTipColor: '#8fbf3f',
      leafVariance: 0.35, autumn: 0
    }
  },
  maple: {
    name: 'Maple',
    latin: 'Acer rubrum',
    blurb: 'Upright and rounded, with an ember palette in autumn.',
    params: {
      height: 14, radius: 0.36, taper: 0.65, flare: 0.5, trunkBend: 0.08, trunkWobble: 0.15,
      trunkSegments: 16, trunkSides: 16,
      depth: 5, children: 4, childrenFalloff: 0.15, angle: 38, spread: 0.35, lengthRatio: 0.66,
      lengthVariance: 0.3, radiusRatio: 0.68, startOffset: 0.35, endOffset: 0.95, curve: 0.25,
      droop: 0, gnarl: 0.2, gravitropism: 0.35, phototropism: 0.4, branchSegments: 7, twigs: 0.5, crown: 0.75,
      leafStyle: 'broad', leafDensity: 0.65, leafSize: 0.24, leafSizeVariance: 0.3, leafReach: 0.3,
      leafDroop: 0.2, leafStartDepth: 2, leafBudget: 18000,
      barkColor: '#5a4a41', barkTint: '#8e7b6c', leafColor: '#c7471d', leafTipColor: '#f2a63b',
      leafVariance: 0.45, autumn: 0.8
    }
  },
  birch: {
    name: 'Birch',
    latin: 'Betula pendula',
    blurb: 'Slender, pale, airy. Fine twigs that drift downward.',
    params: {
      height: 15, radius: 0.2, taper: 0.8, flare: 0.3, trunkBend: 0.2, trunkWobble: 0.15,
      trunkSegments: 20, trunkSides: 14,
      depth: 5, children: 3.5, childrenFalloff: 0.1, angle: 32, spread: 0.3, lengthRatio: 0.58,
      lengthVariance: 0.35, radiusRatio: 0.6, startOffset: 0.4, endOffset: 0.97, curve: 0.3,
      droop: 0.35, gnarl: 0.2, gravitropism: -0.1, phototropism: 0.3, branchSegments: 8, twigs: 0.6, crown: 0.65,
      leafStyle: 'slender', leafDensity: 0.5, leafSize: 0.16, leafSizeVariance: 0.3, leafReach: 0.3,
      leafDroop: 0.5, leafStartDepth: 2, leafBudget: 16000,
      barkColor: '#d9d6cc', barkTint: '#6c665c', leafColor: '#5f9a35', leafTipColor: '#c9e067',
      leafVariance: 0.3, autumn: 0
    }
  },
  willow: {
    name: 'Willow',
    latin: 'Salix babylonica',
    blurb: 'A fountain of hanging twigs brushing the soil.',
    params: {
      height: 11, radius: 0.45, taper: 0.6, flare: 0.8, trunkBend: 0.2, trunkWobble: 0.3,
      trunkSegments: 14, trunkSides: 16,
      depth: 5, children: 4, childrenFalloff: 0.05, angle: 55, spread: 0.4, lengthRatio: 0.7,
      lengthVariance: 0.3, radiusRatio: 0.62, startOffset: 0.3, endOffset: 0.95, curve: 0.4,
      droop: 0.85, gnarl: 0.3, gravitropism: -0.7, phototropism: 0.15, branchSegments: 10, twigs: 0.7, crown: 0.6,
      leafStyle: 'droop', leafDensity: 0.7, leafSize: 0.18, leafSizeVariance: 0.3, leafReach: 0.6,
      leafDroop: 0.9, leafStartDepth: 2, leafBudget: 22000,
      barkColor: '#5c5342', barkTint: '#8a8064', leafColor: '#55863a', leafTipColor: '#b9d36a',
      leafVariance: 0.3, autumn: 0
    }
  },
  pine: {
    name: 'Pine',
    latin: 'Pinus sylvestris',
    blurb: 'Straight bole, whorled tiers, needles in dark bundles.',
    params: {
      height: 18, radius: 0.32, taper: 0.85, flare: 0.4, trunkBend: 0.04, trunkWobble: 0.08,
      trunkSegments: 22, trunkSides: 14,
      depth: 4, children: 5, childrenFalloff: 0.05, angle: 78, spread: 0.2, lengthRatio: 0.45,
      lengthVariance: 0.25, radiusRatio: 0.45, startOffset: 0.3, endOffset: 0.98, curve: 0.15,
      droop: 0.3, gnarl: 0.1, gravitropism: 0.3, phototropism: 0.25, branchSegments: 6, twigs: 1, crown: 0.05,
      leafStyle: 'needle', leafDensity: 1, leafSize: 0.3, leafSizeVariance: 0.25, leafReach: 0.85,
      leafDroop: 0.3, leafStartDepth: 2, leafBudget: 18000,
      barkColor: '#5a3d2b', barkTint: '#a3684a', leafColor: '#1f4a2c', leafTipColor: '#4f8a4a',
      leafVariance: 0.25, autumn: 0
    }
  },
  blossom: {
    name: 'Blossom',
    latin: 'Prunus serrulata',
    blurb: 'Low, spreading, and clouded in pink.',
    params: {
      height: 7, radius: 0.28, taper: 0.5, flare: 0.6, trunkBend: 0.25, trunkWobble: 0.35,
      trunkSegments: 12, trunkSides: 14,
      depth: 5, children: 3.5, childrenFalloff: 0.1, angle: 60, spread: 0.5, lengthRatio: 0.7,
      lengthVariance: 0.35, radiusRatio: 0.66, startOffset: 0.25, endOffset: 0.9, curve: 0.4,
      droop: 0.15, gnarl: 0.5, gravitropism: 0.05, phototropism: 0.5, branchSegments: 7, twigs: 0.6, crown: 0.85,
      leafStyle: 'broad', leafDensity: 0.75, leafSize: 0.15, leafSizeVariance: 0.4, leafReach: 0.4,
      leafDroop: 0.2, leafStartDepth: 2, leafBudget: 20000,
      barkColor: '#3f3029', barkTint: '#6e5a4d', leafColor: '#e58aa5', leafTipColor: '#fbe3ea',
      leafVariance: 0.3, autumn: 0
    }
  }
});

export const SPECIES_IDS = Object.keys(SPECIES);
export const DEFAULT_SPECIES = 'oak';

/* ────────────────────────────────────────────────────────────────────────────
 * Sanitisation
 * ──────────────────────────────────────────────────────────────────────────── */

const HEX_RE = /^#?([0-9a-f]{6})$/i;
const SHORT_HEX_RE = /^#?([0-9a-f]{3})$/i;

export function sanitizeColor(value, fallback) {
  if (typeof value !== 'string') return fallback;
  const v = value.trim();
  let m = HEX_RE.exec(v);
  if (m) return `#${m[1].toLowerCase()}`;
  m = SHORT_HEX_RE.exec(v);
  if (m) {
    const [r, g, b] = m[1].toLowerCase();
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return fallback;
}

function toNumber(value) {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? n : NaN;
  }
  if (typeof value === 'boolean') return value ? 1 : 0;
  return NaN;
}

export function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

function snap(value, step, min) {
  if (!step) return value;
  const n = Math.round((value - min) / step);
  const v = min + n * step;
  // Avoid 0.30000000000000004 style noise
  const decimals = Math.max(0, Math.ceil(-Math.log10(step)) + 1);
  return Number(v.toFixed(Math.min(10, decimals)));
}

/** Sanitise one parameter value according to its schema entry. */
export function sanitizeValue(key, value, fallback) {
  const def = SCHEMA_BY_KEY[key];
  if (!def) return undefined;
  const fb = fallback !== undefined ? fallback : def.default;
  switch (def.type) {
    case 'int': {
      const n = toNumber(value);
      if (Number.isNaN(n)) return fb;
      return Math.round(clamp(n, def.min, def.max));
    }
    case 'number': {
      const n = toNumber(value);
      if (Number.isNaN(n)) return fb;
      return snap(clamp(n, def.min, def.max), def.step, def.min);
    }
    case 'select': {
      return def.options.includes(value) ? value : fb;
    }
    case 'color':
      return sanitizeColor(value, fb);
    default:
      return fb;
  }
}

export function sanitizeSeed(seed, fallback = 1) {
  const n = toNumber(seed);
  if (!Number.isFinite(n)) {
    if (typeof seed === 'string' && seed.trim()) {
      // Non-numeric strings get hashed deterministically by the RNG; keep as-is
      // but bounded in length so nobody can stuff a megabyte into the URL.
      return seed.trim().slice(0, 64);
    }
    return fallback;
  }
  return clamp(Math.floor(Math.abs(n)), LIMITS.seed.min, LIMITS.seed.max);
}

export function sanitizeSpecies(id) {
  return typeof id === 'string' && SPECIES[id] ? id : DEFAULT_SPECIES;
}

/** Full preset parameter set for a species (defaults filled in). */
export function presetParams(speciesId) {
  const id = sanitizeSpecies(speciesId);
  return { ...DEFAULTS, ...SPECIES[id].params };
}

/**
 * Sanitise a complete parameter object. Unknown keys are dropped, missing keys
 * are filled from the species preset (or defaults). Hostile input (NaN,
 * Infinity, objects, strings, out-of-range) is coerced or replaced.
 *
 * Also enforces structural invariants (endOffset > startOffset, etc.).
 */
export function sanitizeParams(input, speciesId = DEFAULT_SPECIES) {
  const base = presetParams(speciesId);
  const src = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const out = {};
  for (const def of SCHEMA) {
    const has = Object.prototype.hasOwnProperty.call(src, def.key);
    out[def.key] = has ? sanitizeValue(def.key, src[def.key], base[def.key]) : base[def.key];
  }
  if (out.endOffset <= out.startOffset + 0.02) {
    out.endOffset = Math.min(1, out.startOffset + 0.05);
    if (out.endOffset <= out.startOffset + 0.02) out.startOffset = Math.max(0, out.endOffset - 0.05);
  }
  if (out.leafStartDepth > out.depth) out.leafStartDepth = out.depth;
  return out;
}

/** Sanitise a whole design `{ species, seed, params }`. */
export function sanitizeDesign(input) {
  const src = input && typeof input === 'object' ? input : {};
  const species = sanitizeSpecies(src.species);
  const seed = sanitizeSeed(src.seed, 1);
  const params = sanitizeParams(src.params, species);
  return { species, seed, params };
}

/** Return only the params that differ from the species preset (for compact links). */
export function diffFromPreset(params, speciesId) {
  const base = presetParams(speciesId);
  const diff = {};
  for (const def of SCHEMA) {
    const v = params[def.key];
    if (v !== base[def.key]) diff[def.key] = v;
  }
  return diff;
}

/** Human-readable grouped schema for the panel. */
export function groupedSchema() {
  return GROUPS.map((group) => ({ group, items: SCHEMA.filter((s) => s.group === group) }));
}
