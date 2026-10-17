// Single source of truth for parameter ranges, quality budgets, species presets and
// sanitisation. The worker, the UI, share links and design import all use this module.

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

const num = (key, label, min, max, step, unit = '', hint = '') => ({ key, label, type: 'number', min, max, step, unit, hint });
const int = (key, label, min, max, unit = '', hint = '') => ({ key, label, type: 'integer', min, max, step: 1, unit, hint });
const color = (key, label, hint = '') => ({ key, label, type: 'color', hint });
const choice = (key, label, options, hint = '') => ({ key, label, type: 'choice', options, hint });

export const LEAF_STYLE_OPTIONS = [
  { value: 'broad', label: 'Broad' },
  { value: 'slender', label: 'Slender' },
  { value: 'droop', label: 'Drooping' },
  { value: 'needle', label: 'Needle' },
  { value: 'none', label: 'None' },
];

/** Panel schema: groups with ~40 exposed parameters (seed is handled separately). */
export const SCHEMA = Object.freeze([
  {
    id: 'trunk', title: 'Trunk & bark', params: [
      num('height', 'Height', 1, 40, 0.1, 'm', 'Trunk length before the crown'),
      num('trunkRadius', 'Base radius', 0.02, 1.2, 0.01, 'm'),
      num('trunkTaper', 'Top taper', 0.2, 1, 0.01, '×', 'Top radius as a share of the base'),
      num('trunkLean', 'Lean', -25, 25, 0.5, '°'),
      num('trunkWobble', 'Sway', 0, 1, 0.01, '', 'Random sideways drift along the trunk'),
      num('rootFlare', 'Root flare', 0, 2, 0.01, '', 'Buttress at the base'),
      color('barkColor', 'Bark tone'),
      num('barkFurrow', 'Furrow contrast', 0, 1, 0.01, '', 'Vertex-colour furrowing'),
    ],
  },
  {
    id: 'crown', title: 'Branching', params: [
      int('depth', 'Branch generations', 1, 7, '', 'Recursion depth of limbs'),
      int('children', 'Children per limb', 2, 5, '', 'Typical number of side limbs'),
      num('branchAngle', 'Branch angle', 5, 85, 1, '°'),
      num('angleSpread', 'Angle spread', 0, 60, 1, '°'),
      num('crownStart', 'Crown start', 0.05, 0.9, 0.01, '', 'Where along the trunk branching starts'),
      num('crownEnd', 'Crown end', 0.5, 1, 0.01, '', 'Where along the trunk branching ends'),
      num('lengthRatio', 'Length ratio', 0.2, 0.95, 0.01, '×', 'Child length relative to parent'),
      num('radiusRatio', 'Radius ratio', 0.2, 0.9, 0.01, '×'),
      num('apicalDominance', 'Leader dominance', 0, 1, 0.01, '', 'Strength of the continuing leader'),
      num('rise', 'Phototropism', 0, 1, 0.01, '', 'Limbs bend toward light'),
      num('droop', 'Gravitropism', 0, 1, 0.01, '', 'Limbs bend toward soil (never below it)'),
      num('gnarl', 'Gnarl', 0, 1, 0.01, '', 'Irregular wandering of limbs'),
      num('taper', 'Limb taper', 0.2, 1, 0.01, '×'),
    ],
  },
  {
    id: 'mesh', title: 'Mesh detail', params: [
      int('sides', 'Radial sides', 4, 12, '', 'Reduced automatically with depth'),
      int('segments', 'Segments per limb', 2, 8, '', 'Reduced automatically with depth'),
    ],
  },
  {
    id: 'foliage', title: 'Foliage', params: [
      choice('leafStyle', 'Leaf style', LEAF_STYLE_OPTIONS),
      num('leafSize', 'Leaf size', 0.03, 0.6, 0.01, 'm'),
      num('leafWidth', 'Leaf width', 0.2, 1.2, 0.01, '×'),
      num('leafDensity', 'Density', 0, 1, 0.01),
      num('leafTipBias', 'Tip bias', 0, 1, 0.01, '', 'Concentrates foliage at twig tips'),
      int('leafDepthMin', 'Foliage from generation', 1, 7, '', 'Lowest limb generation carrying leaves'),
      num('leafDroop', 'Droop', 0, 1, 0.01),
      num('leafTilt', 'Leaf tilt', 0, 90, 1, '°'),
      num('hangerFloor', 'Ground fold height', 0, 3, 0.05, 'm', 'Leaves below this fold back up'),
      int('leafCap', 'Card budget', 500, 30000, 'cards', 'Hard ceiling on leaf cards'),
    ],
  },
  {
    id: 'palette', title: 'Palette', params: [
      color('leafColor', 'Leaf base'),
      color('leafTipColor', 'Leaf tip'),
      color('flowerColor', 'Blossom colour'),
      num('flowerMix', 'Blossom mix', 0, 1, 0.01, '', 'Share of cards that carry blossom'),
      num('autumn', 'Autumn shift', 0, 1, 0.01),
    ],
  },
]);

/** Flat list of exposed parameter specs. */
export const PARAM_LIST = Object.freeze(SCHEMA.flatMap((g) => g.params));
export const PARAM_SPEC = Object.freeze(Object.fromEntries(PARAM_LIST.map((s) => [s.key, s])));

/** Numeric limits derived from the schema: the only place ranges are defined. */
export const LIMITS = Object.freeze(Object.fromEntries(
  PARAM_LIST.filter((s) => s.type === 'number' || s.type === 'integer')
    .map((s) => [s.key, Object.freeze({ min: s.min, max: s.max, step: s.step })]),
));

/** Generation budgets per quality tier. */
export const QUALITY = Object.freeze({
  studio: Object.freeze({ id: 'studio', maxLimbs: 2600, maxBarkTris: 105000, foliageTriBudget: 135000, sidesMax: 12, segsMax: 8 }),
  preview: Object.freeze({ id: 'preview', maxLimbs: 700, maxBarkTris: 24000, foliageTriBudget: 30000, sidesMax: 6, segsMax: 4 }),
  software: Object.freeze({ id: 'software', maxLimbs: 700, maxBarkTris: 22000, foliageTriBudget: 40000, sidesMax: 6, segsMax: 4 }),
});

/** Hard product limits asserted by the test-suite. */
export const HARD_LIMITS = Object.freeze({ studioTriangles: 250000, studioLeaves: 32000, softwareTriangles: 70000 });

const base = (o) => Object.freeze(o);

export const SPECIES = base({
  oak: base({
    label: 'Oak', blurb: 'Broad, heavy-limbed crown with lobed summer foliage.',
    params: {
      height: 9, trunkRadius: 0.32, trunkTaper: 0.55, trunkLean: 4, trunkWobble: 0.35, rootFlare: 0.6, barkColor: '#5b4a3a', barkFurrow: 0.6,
      depth: 4, children: 3, branchAngle: 45, angleSpread: 25, crownStart: 0.35, crownEnd: 0.98, lengthRatio: 0.7, radiusRatio: 0.6,
      apicalDominance: 0.4, rise: 0.3, droop: 0.15, gnarl: 0.45, taper: 0.6,
      sides: 8, segments: 4,
      leafStyle: 'broad', leafSize: 0.16, leafWidth: 1, leafDensity: 0.8, leafTipBias: 0.7, leafDepthMin: 2, leafDroop: 0.2, leafTilt: 35, hangerFloor: 0.5, leafCap: 14000,
      leafColor: '#4f7a2e', leafTipColor: '#8cb84a', flowerColor: '#f0e6b0', flowerMix: 0, autumn: 0,
    },
  }),
  maple: base({
    label: 'Maple', blurb: 'Upright, dense crown with palmate leaves that turn early.',
    params: {
      height: 8, trunkRadius: 0.24, trunkTaper: 0.6, trunkLean: -3, trunkWobble: 0.2, rootFlare: 0.4, barkColor: '#6a5a4c', barkFurrow: 0.3,
      depth: 5, children: 3, branchAngle: 38, angleSpread: 30, crownStart: 0.3, crownEnd: 1, lengthRatio: 0.75, radiusRatio: 0.62,
      apicalDominance: 0.6, rise: 0.45, droop: 0.05, gnarl: 0.25, taper: 0.65,
      sides: 7, segments: 3,
      leafStyle: 'broad', leafSize: 0.13, leafWidth: 1.1, leafDensity: 0.85, leafTipBias: 0.6, leafDepthMin: 2, leafDroop: 0.1, leafTilt: 20, hangerFloor: 0.5, leafCap: 16000,
      leafColor: '#5c8f35', leafTipColor: '#a8c94e', flowerColor: '#ffd27a', flowerMix: 0, autumn: 0.2,
    },
  }),
  birch: base({
    label: 'Birch', blurb: 'Slender white stems and fine, fluttering leaves.',
    params: {
      height: 12, trunkRadius: 0.14, trunkTaper: 0.7, trunkLean: 6, trunkWobble: 0.1, rootFlare: 0.3, barkColor: '#e8e2d6', barkFurrow: 0.9,
      depth: 5, children: 3, branchAngle: 30, angleSpread: 20, crownStart: 0.3, crownEnd: 1, lengthRatio: 0.78, radiusRatio: 0.65,
      apicalDominance: 0.75, rise: 0.6, droop: 0.3, gnarl: 0.1, taper: 0.7,
      sides: 6, segments: 3,
      leafStyle: 'slender', leafSize: 0.09, leafWidth: 0.8, leafDensity: 0.7, leafTipBias: 0.8, leafDepthMin: 2, leafDroop: 0.25, leafTilt: 40, hangerFloor: 0.5, leafCap: 18000,
      leafColor: '#6fa23f', leafTipColor: '#c4dc5a', flowerColor: '#ffffff', flowerMix: 0, autumn: 0.1,
    },
  }),
  willow: base({
    label: 'Willow', blurb: 'Weeping limbs that hang toward the soil.',
    params: {
      height: 10, trunkRadius: 0.26, trunkTaper: 0.55, trunkLean: 8, trunkWobble: 0.4, rootFlare: 0.5, barkColor: '#6d6a4a', barkFurrow: 0.5,
      depth: 5, children: 3, branchAngle: 50, angleSpread: 15, crownStart: 0.2, crownEnd: 1, lengthRatio: 0.85, radiusRatio: 0.7,
      apicalDominance: 0.2, rise: 0.15, droop: 0.75, gnarl: 0.2, taper: 0.8,
      sides: 6, segments: 5,
      leafStyle: 'droop', leafSize: 0.14, leafWidth: 0.5, leafDensity: 0.9, leafTipBias: 0.5, leafDepthMin: 2, leafDroop: 0.8, leafTilt: 70, hangerFloor: 0.8, leafCap: 20000,
      leafColor: '#7ba64a', leafTipColor: '#b9d977', flowerColor: '#f2f0c8', flowerMix: 0, autumn: 0.15,
    },
  }),
  pine: base({
    label: 'Pine', blurb: 'Whorled, conical crown of needle clusters.',
    params: {
      height: 14, trunkRadius: 0.22, trunkTaper: 0.35, trunkLean: 2, trunkWobble: 0.15, rootFlare: 0.3, barkColor: '#7a4f35', barkFurrow: 0.75,
      depth: 5, children: 4, branchAngle: 70, angleSpread: 15, crownStart: 0.25, crownEnd: 0.95, lengthRatio: 0.55, radiusRatio: 0.5,
      apicalDominance: 0.9, rise: 0.8, droop: 0.1, gnarl: 0.15, taper: 0.4,
      sides: 6, segments: 3,
      leafStyle: 'needle', leafSize: 0.22, leafWidth: 0.6, leafDensity: 0.9, leafTipBias: 0.9, leafDepthMin: 3, leafDroop: 0.3, leafTilt: 25, hangerFloor: 0.6, leafCap: 26000,
      leafColor: '#2e5b3a', leafTipColor: '#4f8a5a', flowerColor: '#e8d080', flowerMix: 0, autumn: 0,
    },
  }),
  blossom: base({
    label: 'Blossom', blurb: 'Low, wide flowering tree with pale pink canopy.',
    params: {
      height: 6.5, trunkRadius: 0.18, trunkTaper: 0.6, trunkLean: -6, trunkWobble: 0.5, rootFlare: 0.4, barkColor: '#4a3b36', barkFurrow: 0.4,
      depth: 4, children: 3, branchAngle: 40, angleSpread: 35, crownStart: 0.3, crownEnd: 1, lengthRatio: 0.72, radiusRatio: 0.6,
      apicalDominance: 0.3, rise: 0.35, droop: 0.35, gnarl: 0.6, taper: 0.6,
      sides: 7, segments: 4,
      leafStyle: 'broad', leafSize: 0.09, leafWidth: 0.9, leafDensity: 0.95, leafTipBias: 0.85, leafDepthMin: 1, leafDroop: 0.3, leafTilt: 50, hangerFloor: 0.5, leafCap: 22000,
      leafColor: '#7aa35a', leafTipColor: '#f5b8c8', flowerColor: '#f7a8c0', flowerMix: 0.55, autumn: 0,
    },
  }),
});

export const SPECIES_ORDER = Object.freeze(Object.keys(SPECIES));
export const DEFAULT_SPECIES = 'oak';
export const DEFAULT_SEED = 1;

export function presetParams(speciesId = DEFAULT_SPECIES) {
  const id = Object.hasOwn(SPECIES, speciesId) ? speciesId : DEFAULT_SPECIES;
  return { ...SPECIES[id].params };
}

function quantize(spec, n) {
  const k = Math.round((n - spec.min) / spec.step);
  const v = Math.min(spec.max, Math.max(spec.min, spec.min + k * spec.step));
  const decimals = (String(spec.step).split('.')[1] || '').length;
  return Number(v.toFixed(decimals));
}

function sanitizeValue(spec, raw, fallback) {
  if (spec.type === 'choice') {
    return spec.options.some((o) => o.value === raw) ? raw : fallback;
  }
  if (spec.type === 'color') {
    if (typeof raw !== 'string') return fallback;
    const m = /^#?([0-9a-f]{6})$/i.exec(raw.trim());
    return m ? `#${m[1].toLowerCase()}` : fallback;
  }
  let n = NaN;
  if (typeof raw === 'number') n = raw;
  else if (typeof raw === 'string' && raw.trim() !== '' && raw.trim().length < 32) n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return quantize(spec, n);
}

/** Clamp, quantise and whitelist a parameter object. Unknown keys are dropped. */
export function sanitizeParams(raw, speciesId = DEFAULT_SPECIES) {
  const preset = presetParams(speciesId);
  const src = isObj(raw) ? raw : {};
  const out = {};
  for (const spec of PARAM_LIST) {
    out[spec.key] = sanitizeValue(spec, Object.hasOwn(src, spec.key) ? src[spec.key] : undefined, preset[spec.key]);
  }
  return out;
}

/** Seeds are unsigned 32-bit integers; anything else is folded deterministically. */
export function sanitizeSeed(raw, fallback = DEFAULT_SEED) {
  let n = NaN;
  if (typeof raw === 'number') n = raw;
  else if (typeof raw === 'string' && raw.trim() !== '' && raw.trim().length < 32) n = Number(raw.trim());
  if (!Number.isFinite(n)) return fallback;
  const m = 4294967296;
  return ((Math.trunc(n) % m) + m) % m;
}

/** Full design sanitiser: shared by share links, design JSON and the worker. */
export function sanitizeDesign(raw) {
  const o = isObj(raw) ? raw : {};
  const species = typeof o.species === 'string' && Object.hasOwn(SPECIES, o.species) ? o.species : DEFAULT_SPECIES;
  return {
    species,
    seed: sanitizeSeed(o.seed),
    params: sanitizeParams(o.params, species),
  };
}

export function randomDesignFromRng(rng) {
  const species = SPECIES_ORDER[rng.int(0, SPECIES_ORDER.length - 1)];
  const params = {};
  for (const spec of PARAM_LIST) {
    if (spec.type === 'choice') params[spec.key] = spec.options[rng.int(0, spec.options.length - 1)].value;
    else if (spec.type === 'color') params[spec.key] = presetParams(species)[spec.key];
    else params[spec.key] = rng.range(spec.min, spec.max);
  }
  return sanitizeDesign({ species, seed: rng.int(0, 4294967295), params });
}
