/**
 * Parameter schema + species presets.
 * All numbers are in metres / degrees / 0–1 ranges.
 */

export const DEFAULTS = {
  species: 'oak',
  seed: 4815,
  trunk: {
    height: 9.2,
    radius: 0.48,
    flare: 0.85,
    lean: 2.5,
    wobble: 0.45,
    segments: 30,
    sides: 10,
  },
  roots: {
    count: 4,
    reach: 1.15,
  },
  branches: {
    levels: 9,
    start: 0.34,
    end: 0.95,
    angle: 62,
    angleVar: 15,
    upBias: 0.26,
    droop: 0.1,
    reach: 0.62,
    split: 2,
    depth: 4,
    taper: 0.68,
    gnarl: 0.42,
    segments: 9,
    sides: 6,
  },
  leaves: {
    style: 'broad',
    density: 1,
    size: 0.32,
    sizeVar: 0.3,
    colorA: '#3c5526',
    colorB: '#7f9945',
    colorTip: '#c3ce7c',
    wind: 1,
  },
  bark: {
    colorA: '#3a2f26',
    colorB: '#7b6754',
    roughness: 0.95,
    lumpiness: 0.16,
  },
};

const SPECIES_LIST = [
  {
    id: 'oak',
    name: 'Oak',
    latin: 'Quercus robur',
    note: 'Heavy limbs, a broad crown and a stubborn lean.',
    icon: 'oak',
    params: {
      trunk: { height: 9.2, radius: 0.46, flare: 0.62, lean: 2.5, wobble: 0.45, segments: 30, sides: 10 },
      branches: {
        levels: 11, start: 0.32, end: 0.96, angle: 60, angleVar: 16, upBias: 0.3,
        droop: 0.12, reach: 0.46, split: 2, depth: 4, taper: 0.7, gnarl: 0.44, segments: 9, sides: 6,
      },
      leaves: {
        style: 'broad', density: 1.5, size: 0.31, sizeVar: 0.3,
        colorA: '#3b5325', colorB: '#7c9644', colorTip: '#c4cf7d', wind: 1,
      },
      bark: { colorA: '#3a2f26', colorB: '#7e6a56', roughness: 0.95, lumpiness: 0.17 },
    },
  },
  {
    id: 'maple',
    name: 'Maple',
    latin: 'Acer rubrum',
    note: 'Balanced, upright limbs with a warm autumn edge.',
    icon: 'maple',
    params: {
      trunk: { height: 8.2, radius: 0.35, flare: 0.55, lean: 2, wobble: 0.35, segments: 28, sides: 9 },
      roots: { count: 3, reach: 0.85 },
      branches: {
        levels: 11, start: 0.34, end: 0.97, angle: 48, angleVar: 14, upBias: 0.4,
        droop: 0.06, reach: 0.5, split: 2, depth: 4, taper: 0.66, gnarl: 0.34, segments: 9, sides: 6,
      },
      leaves: {
        style: 'broad', density: 1.6, size: 0.17, sizeVar: 0.34,
        colorA: '#54672c', colorB: '#9aa949', colorTip: '#d9cf72', wind: 1.1,
      },
      bark: { colorA: '#4a4038', colorB: '#85786a', roughness: 0.92, lumpiness: 0.12 },
    },
  },
  {
    id: 'birch',
    name: 'Birch',
    latin: 'Betula pendula',
    note: 'Pale bark, airy twigs, a slim northern silhouette.',
    icon: 'birch',
    params: {
      trunk: { height: 11.4, radius: 0.24, flare: 0.22, lean: 1.4, wobble: 0.22, segments: 34, sides: 9 },
      roots: { count: 2, reach: 0.55 },
      branches: {
        levels: 15, start: 0.24, end: 0.97, angle: 46, angleVar: 12, upBias: 0.46,
        droop: 0.24, reach: 0.52, split: 2, depth: 4, taper: 0.6, gnarl: 0.3, segments: 8, sides: 5,
      },
      leaves: {
        style: 'broad', density: 1.0, size: 0.23, sizeVar: 0.34,
        colorA: '#5a7235', colorB: '#a4b862', colorTip: '#d8d992', wind: 1.35,
      },
      bark: { colorA: '#c9c2ac', colorB: '#f0ead8', roughness: 0.78, lumpiness: 0.055 },
    },
  },
  {
    id: 'willow',
    name: 'Willow',
    latin: 'Salix babylonica',
    note: 'Long, combed branches that pour toward the ground.',
    icon: 'willow',
    params: {
      trunk: { height: 7.2, radius: 0.56, flare: 0.95, lean: 4.5, wobble: 0.55, segments: 28, sides: 10 },
      roots: { count: 5, reach: 1.25 },
      branches: {
        levels: 12, start: 0.28, end: 0.93, angle: 63, angleVar: 14, upBias: -0.3,
        droop: 0.72, reach: 0.72, split: 2, depth: 4, taper: 0.63, gnarl: 0.5, segments: 10, sides: 6,
      },
      leaves: {
        style: 'slender', density: 1.5, size: 0.2, sizeVar: 0.3,
        colorA: '#6f8749', colorB: '#b3c37a', colorTip: '#dfe0a8', wind: 1.4,
      },
      bark: { colorA: '#493d2e', colorB: '#82705a', roughness: 0.96, lumpiness: 0.18 },
    },
  },
  {
    id: 'pine',
    name: 'Pine',
    latin: 'Pinus sylvestris',
    note: 'A straight leader under stacked, horizontal whorls.',
    icon: 'pine',
    params: {
      trunk: { height: 11, radius: 0.3, flare: 0.32, lean: 0.6, wobble: 0.16, segments: 32, sides: 9 },
      roots: { count: 3, reach: 0.7 },
      branches: {
        levels: 13, start: 0.28, end: 0.97, angle: 76, angleVar: 11, upBias: 0.18,
        droop: 0.22, reach: 0.52, split: 3, depth: 3, taper: 0.56, gnarl: 0.3, segments: 8, sides: 5,
      },
      leaves: {
        style: 'needle', density: 1.65, size: 0.4, sizeVar: 0.25,
        colorA: '#243b24', colorB: '#516d35', colorTip: '#849552', wind: 0.9,
      },
      bark: { colorA: '#3b2f25', colorB: '#755e45', roughness: 0.96, lumpiness: 0.12 },
    },
  },
  {
    id: 'blossom',
    name: 'Blossom',
    latin: 'Prunus serrulata',
    note: 'A small ornamental, grown for one loud week in spring.',
    icon: 'blossom',
    params: {
      trunk: { height: 6.6, radius: 0.29, flare: 0.45, lean: 5, wobble: 0.5, segments: 26, sides: 9 },
      roots: { count: 3, reach: 0.8 },
      branches: {
        levels: 10, start: 0.3, end: 0.94, angle: 54, angleVar: 16, upBias: 0.24,
        droop: 0.1, reach: 0.64, split: 2, depth: 4, taper: 0.61, gnarl: 0.48, segments: 9, sides: 6,
      },
      leaves: {
        style: 'broad', density: 1.6, size: 0.17, sizeVar: 0.32,
        colorA: '#a35f6d', colorB: '#e7a8b3', colorTip: '#fbe7e4', wind: 1.2,
      },
      bark: { colorA: '#392b2a', colorB: '#6f5550', roughness: 0.93, lumpiness: 0.14 },
    },
  },
];

export const SPECIES = SPECIES_LIST;

export const SPECIES_BY_ID = Object.fromEntries(SPECIES_LIST.map((entry) => [entry.id, entry]));

export function getPath(object, path) {
  return path.split('.').reduce((value, key) => (value == null ? value : value[key]), object);
}

export function setPath(object, path, value) {
  const keys = path.split('.');
  const last = keys.pop();
  const target = keys.reduce((value, key) => value[key], object);
  target[last] = value;
}

export function clone(value) {
  return typeof structuredClone === 'function'
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

export function deepMerge(base, ...sources) {
  const output = clone(base);
  for (const source of sources) {
    if (!source) continue;
    for (const [key, value] of Object.entries(source)) {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        output[key] = deepMerge(output[key] || {}, value);
      } else {
        output[key] = value;
      }
    }
  }
  return output;
}

export function makeParams(speciesId = 'oak', seed = DEFAULTS.seed) {
  const species = SPECIES_BY_ID[speciesId] || SPECIES_BY_ID.oak;
  const params = deepMerge(DEFAULTS, species.params);
  params.species = species.id;
  params.seed = seed;
  return params;
}

export function presetParams(speciesId) {
  const species = SPECIES_BY_ID[speciesId] || SPECIES_BY_ID.oak;
  return deepMerge(DEFAULTS, species.params);
}

export function randomSeed() {
  return Math.floor(1000 + Math.random() * 98999);
}
