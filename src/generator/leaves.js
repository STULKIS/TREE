/**
 * Foliage: leaf cards as triangle fans around a single base vertex.
 * Density is tiered by distance from the twig tip and thinned uniformly
 * against a hard card budget so the crown top is never left bare.
 */
import { add, addScaled, cross, normalize, scale, sub, dot } from './vec.js';
import { hexToRgb, mix, shiftHsl, autumnize } from './color.js';
import { sampleLimb } from './growth.js';

/** 2D outlines in (along, across) space; base vertex is implicit at (0, 0). */
export const OUTLINES = {
  broad: [[0.25, 0.42], [0.65, 0.46], [1, 0], [0.65, -0.46], [0.25, -0.42]],
  slender: [[0.3, 0.2], [0.7, 0.24], [1, 0], [0.7, -0.24], [0.3, -0.2]],
  droop: [[0.3, 0.18], [0.7, 0.2], [1, 0], [0.7, -0.2], [0.3, -0.18]],
  needle: [[0.95, 0.42], [0.5, 0.12], [1, 0], [0.5, -0.12], [0.95, -0.42]]
};

export function trianglesPerCard(style) {
  const o = OUTLINES[style];
  return o ? o.length - 1 : 0;
}

export function verticesPerCard(style) {
  const o = OUTLINES[style];
  return o ? o.length + 1 : 0;
}

/** Leaves-per-metre multiplier by style (needles are many and small). */
const STYLE_RATE = { broad: 56, slender: 66, droop: 70, needle: 190 };

function tierWeight(tier, reach) {
  if (tier === 0) return 1;
  if (tier === 1) return 0.45 * reach;
  if (tier === 2) return 0.15 * reach * reach;
  return 0;
}

/**
 * Plan leaf placements without building geometry.
 * Returns an array of lightweight records sorted by tier (terminal first).
 */
export function planLeaves(limbs, params, quality, rng) {
  const style = params.leafStyle;
  if (style === 'none' || params.leafDensity <= 0) return [];
  const rate = STYLE_RATE[style] * params.leafDensity * quality.leaves;
  const sizeAvg = params.leafSize;
  const tiers = [[], [], []];

  for (const limb of limbs) {
    if (limb.culled) continue;
    const effDepth = limb.twig ? limb.depth - 1 : limb.depth;
    if (effDepth < params.leafStartDepth) continue;
    if (limb.depth === 0 && params.depth > 0 && params.leafStartDepth > 0) continue;
    const w = tierWeight(limb.tier, params.leafReach);
    if (w <= 0) continue;
    const lr = rng.fork(limb.index + 101);
    // Leaves per limb scale with length, inverse with leaf size (bigger leaves, fewer of them)
    const count = Math.round((limb.length * rate * w) / Math.max(0.08, Math.sqrt(sizeAvg / 0.2)) + lr.next() * 0.5);
    if (count <= 0) continue;
    // Along-limb range: terminal limbs leaf from `1 - along` to the tip; interior limbs spread out.
    const along = limb.tier === 0 ? 0.35 + 0.65 * params.leafReach : 1;
    for (let i = 0; i < count; i++) {
      const t = 1 - along * Math.pow(lr.next(), 1.35);
      tiers[Math.min(2, limb.tier)].push({
        limb: limb.index,
        t,
        az: lr.next() * Math.PI * 2,
        r1: lr.next(),
        r2: lr.next(),
        r3: lr.next(),
        r4: lr.next(),
        r5: lr.next()
      });
    }
  }
  return tiers;
}

/** Thin tiered placements to a hard budget: interior tiers go first, then uniform striding. */
export function thinToBudget(tiers, budget) {
  const out = [];
  let remaining = Math.max(0, Math.floor(budget));
  for (let ti = 0; ti < tiers.length; ti++) {
    const list = tiers[ti];
    if (!list.length) continue;
    if (list.length <= remaining) {
      for (const p of list) out.push(p);
      remaining -= list.length;
    } else if (remaining > 0) {
      // Uniform stride keeps the spatial distribution (crown top stays leafy)
      const ratio = remaining / list.length;
      let acc = 0;
      for (const p of list) {
        acc += ratio;
        if (acc >= 1) {
          acc -= 1;
          out.push(p);
        }
      }
      remaining = 0;
    }
    if (remaining <= 0) break;
  }
  return out;
}

/**
 * Build leaf card geometry into `mesh`.
 */
export function buildLeaves(mesh, limbs, placements, params) {
  const style = params.leafStyle;
  const outline = OUTLINES[style];
  if (!outline) return 0;
  const baseColor = hexToRgb(params.leafColor);
  const tipColor = hexToRgb(params.leafTipColor);
  const variance = params.leafVariance;
  const autumn = params.autumn;
  const UP = [0, 1, 0];
  const droopStyle = style === 'droop';
  const needle = style === 'needle';
  const aspect = needle ? 1.0 : style === 'broad' ? 1.0 : 1.0;
  let built = 0;

  for (const pl of placements) {
    const limb = limbs[pl.limb];
    const s = sampleLimb(limb, pl.t);
    const size = params.leafSize * (1 + (pl.r1 * 2 - 1) * params.leafSizeVariance) * aspect;
    if (size <= 0.001) continue;
    // Base sits on the limb surface
    const radial = add(scale(s.normal, Math.cos(pl.az)), scale(s.binormal, Math.sin(pl.az)));
    const base = addScaled(s.pos, radial, s.radius * 0.9);

    // Direction: outward + a little along the twig, pulled down by hang
    let dir = add(scale(radial, 0.75), scale(s.tangent, 0.45 + pl.r2 * 0.4));
    const hang = params.leafDroop * (droopStyle ? 1.6 : 0.9);
    dir = addScaled(dir, UP, needle ? 0.15 - hang * 0.4 : 0.35 - hang * 1.4 + (pl.r3 - 0.5) * 0.4);
    dir = normalize(dir);
    // Fold hangers back up near the soil
    const floor = 0.03;
    if (base[1] + dir[1] * size < floor) {
      dir[1] = Math.abs(dir[1]) + (floor - base[1]) / size;
      dir = normalize(dir);
    }
    // Card plane: faces up-ish toward light, with jitter
    let facing = normalize([(pl.r4 - 0.5) * 0.8, 1, (pl.r5 - 0.5) * 0.8]);
    if (droopStyle) facing = normalize(add(radial, scale(facing, 0.4)));
    let side = cross(dir, facing);
    if (dot(side, side) < 1e-6) side = cross(dir, [1, 0, 0]);
    side = normalize(side);
    const nrm = normalize(cross(side, dir));

    // Per-leaf colour variance + autumn
    const leafAutumn = autumn > 0 ? Math.min(1, autumn * (0.4 + pl.r2 * 1.1)) : 0;
    let cBase = baseColor;
    let cTip = tipColor;
    if (leafAutumn > 0) {
      cBase = autumnize(cBase, leafAutumn);
      cTip = autumnize(cTip, leafAutumn);
    }
    if (variance > 0) {
      const dh = (pl.r3 - 0.5) * 0.08 * variance;
      const dl = (pl.r4 - 0.5) * 0.22 * variance;
      cBase = shiftHsl(cBase, dh, 0, dl);
      cTip = shiftHsl(cTip, dh, 0, dl);
    }

    const width = size * (needle ? 0.7 : 1);
    const baseIndex = mesh.vertex(base, nrm, cBase, [0.5, 0]);
    const idx = [];
    for (const [ax, ay] of outline) {
      const p = add(addScaled(base, dir, ax * size), scale(side, ay * width));
      const c = mix(cBase, cTip, ax);
      idx.push(mesh.vertex(p, nrm, c, [0.5 + ay, ax]));
    }
    for (let i = 0; i < idx.length - 1; i++) mesh.triangle(baseIndex, idx[i], idx[i + 1]);
    built++;
  }
  return built;
}
