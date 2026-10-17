/**
 * Top-level generator: params + seed + quality → bark & foliage geometry.
 * Deterministic: the same inputs always produce identical typed arrays.
 */
import { Rng } from './rng.js';
import { sanitizeParams, QUALITY, LIMITS } from './params.js';
import { growSkeleton } from './growth.js';
import { MeshBuilder, mergeBounds } from './mesh.js';
import { budgetSides, cullToBudget, buildBark } from './tubes.js';
import { planLeaves, thinToBudget, buildLeaves, trianglesPerCard } from './leaves.js';

/**
 * @param {object} design  `{ species, seed, params }` (params may be partial / hostile)
 * @param {string|object} [quality] quality tier id or object
 */
export function generateTree(design, quality = 'studio') {
  const q = typeof quality === 'string' ? QUALITY[quality] || QUALITY.studio : quality;
  const species = design.species;
  const params = sanitizeParams(design.params, species);
  const seed = design.seed ?? 1;
  const rng = new Rng(seed);
  const started = now();

  // 1. Skeleton
  const { limbs, depth } = growSkeleton(params, q, rng.fork(1));

  // 2. Plan leaves so bark and foliage can share the triangle budget
  const leafRng = rng.fork(2);
  const tiers = planLeaves(limbs, params, q, leafRng);
  const tpc = trianglesPerCard(params.leafStyle);
  const candidateLeaves = tiers.reduce((n, t) => n + t.length, 0);
  const cardBudget = Math.min(LIMITS.maxLeaves, Math.round(params.leafBudget * q.leaves), candidateLeaves);
  const total = q.triangleBudget;
  // Bark gets at least 45% of the budget; foliage takes what it needs from the rest
  const leafReserve = Math.min(cardBudget * tpc, Math.floor(total * 0.55));
  const barkBudget = total - leafReserve;

  // 3. Fit bark sides to budget, cull if still over
  budgetSides(limbs, params, q, barkBudget);
  const barkTris = cullToBudget(limbs, barkBudget);

  // 4. Final leaf budget from what remains
  const leafTriBudget = Math.max(0, total - barkTris);
  const finalCards = tpc > 0 ? Math.min(cardBudget, Math.floor(leafTriBudget / tpc)) : 0;
  const placements = thinToBudget(tiers, finalCards);

  // 5. Build meshes
  const barkMesh = new MeshBuilder();
  buildBark(barkMesh, limbs, params, rng.fork(3));
  const leafMesh = new MeshBuilder();
  const leaves = buildLeaves(leafMesh, limbs, placements, params);

  const bark = barkMesh.finish();
  const foliage = leafMesh.finish();
  foliage.cardTriangles = tpc;
  const bounds = leaves > 0 ? mergeBounds(bark.bounds, foliage.bounds) : bark.bounds;
  const limbCount = limbs.filter((l) => !l.culled).length;

  return {
    bark,
    foliage,
    bounds,
    params,
    seed,
    species,
    quality: q.id,
    stats: {
      triangles: barkMesh.triangleCount + leafMesh.triangleCount,
      barkTriangles: barkMesh.triangleCount,
      leafTriangles: leafMesh.triangleCount,
      leaves,
      limbs: limbCount,
      depth,
      height: bounds.max[1],
      width: Math.max(bounds.max[0] - bounds.min[0], bounds.max[2] - bounds.min[2]),
      ms: Math.round(now() - started)
    }
  };
}

function now() {
  return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
}
