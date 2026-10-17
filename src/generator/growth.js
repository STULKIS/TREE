/**
 * Skeleton growth: builds the limb hierarchy (spines + radii + frames) from
 * parameters. Purely numeric, no mesh output; see tubes.js / leaves.js.
 *
 * Growth is breadth-first by depth so a global limb budget trims the deepest,
 * least significant limbs uniformly rather than lopping off one side of the tree.
 */
import { LIMITS } from './params.js';
import {
  add, addScaled, cross, dot, normalize, scale, sub, length, rotateAround, perpendicular,
  parallelTransportFrames
} from './vec.js';

const DEG = Math.PI / 180;
const GOLDEN = 2.39996323;
const UP = [0, 1, 0];
const SOIL = 0.02; // nothing goes below this height

/**
 * @typedef {object} Limb
 * @property {number} index
 * @property {number} depth        0 = trunk
 * @property {number} parent       parent limb index or -1
 * @property {number} t0           position along parent [0..1]
 * @property {number[][]} points   spine points
 * @property {number[]} radii      radius at each point
 * @property {number} length
 * @property {number} baseRadius
 * @property {number} tipRadius
 * @property {number[]} children   child limb indices
 * @property {number} tier         generations from the nearest terminal limb (0 = terminal)
 * @property {boolean} twig
 * @property {number} sides        ring vertex count (set by budgeting)
 * @property {{tangents:number[][],normals:number[][],binormals:number[][]}} frames
 */

/** Interpolate a point / tangent / radius along a limb spine at t in [0,1]. */
export function sampleLimb(limb, t) {
  const n = limb.points.length;
  const f = Math.max(0, Math.min(1, t)) * (n - 1);
  const i = Math.min(n - 2, Math.floor(f));
  const k = f - i;
  const a = limb.points[i];
  const b = limb.points[i + 1];
  const pos = [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
  const radius = limb.radii[i] + (limb.radii[i + 1] - limb.radii[i]) * k;
  const fr = limb.frames;
  const tangent = normalize(add(scale(fr.tangents[i], 1 - k), scale(fr.tangents[i + 1], k)));
  let normal = normalize(add(scale(fr.normals[i], 1 - k), scale(fr.normals[i + 1], k)));
  normal = normalize(sub(normal, scale(tangent, dot(normal, tangent))));
  const binormal = normalize(cross(tangent, normal));
  return { pos, radius, tangent, normal, binormal };
}

function crownLengthFactor(t, crown) {
  const cone = 1 - 0.68 * t;
  const round = 0.5 + 0.5 * Math.sin(Math.PI * (0.12 + 0.88 * t));
  return cone + (round - cone) * crown;
}

/**
 * Grow one limb spine from an origin and direction.
 */
function growSpine(rng, opts) {
  const {
    origin, direction, length: len, segments, depth, isTrunk, params, outward, baseRadius, tipRadius
  } = opts;
  const pts = [origin];
  const radii = [baseRadius];
  let dir = normalize(direction);
  const dt = 1 / segments;
  const step = len / segments;

  // Fixed-plane curvature axis (perpendicular to the initial direction).
  const bendAxis = rotateAround(perpendicular(dir), dir, rng.next() * Math.PI * 2);
  const curveTotal = isTrunk ? params.trunkBend * 28 * DEG : params.curve * 70 * DEG * (0.6 + rng.next() * 0.8);
  const curveSign = rng.chance(0.5) ? 1 : -1;
  const gnarl = isTrunk ? params.trunkWobble * 0.55 : params.gnarl * (0.6 + 0.25 * depth);
  const droop = isTrunk ? 0 : params.droop;
  const gravi = params.gravitropism;
  const photo = params.phototropism;
  const minY = SOIL + baseRadius * 0.5;

  for (let i = 1; i <= segments; i++) {
    const t = i / segments;
    // Planar curvature
    dir = rotateAround(dir, bendAxis, curveSign * curveTotal * dt);
    // Gnarl: random walk, variance scales with dt so segment count barely changes the shape
    const g = gnarl * Math.sqrt(dt) * 0.9;
    dir = [dir[0] + rng.gaussian() * g, dir[1] + rng.gaussian() * g * 0.6, dir[2] + rng.gaussian() * g];
    // Droop: progressive downward tendency, stronger toward the tip
    if (droop !== 0) dir[1] -= droop * 1.6 * dt * (0.35 + t * t);
    // Gravitropism: + bends toward the sky, − toward the soil
    if (isTrunk) {
      // Trunks always seek the sky, lean is applied through the initial direction.
      dir = addScaled(dir, UP, 0.9 * dt);
    } else if (gravi !== 0) {
      dir = addScaled(dir, UP, gravi * 1.2 * dt);
    }
    // Phototropism: bend toward light = up + outward from the trunk axis
    if (photo > 0 && !isTrunk) {
      const light = normalize([outward[0] * 0.6, 0.8, outward[2] * 0.6]);
      dir = addScaled(dir, light, photo * 0.8 * dt);
    }
    dir = normalize(dir);
    let next = addScaled(pts[i - 1], dir, step);
    // Soil guard: hangers fold back up, never pierce y = 0.
    if (next[1] < minY) {
      dir = normalize([dir[0], Math.max(dir[1], 0.12 + 0.3 * (minY - next[1])), dir[2]]);
      next = addScaled(pts[i - 1], dir, step);
      if (next[1] < minY) next[1] = minY;
    }
    pts.push(next);
    const taperT = Math.pow(t, isTrunk ? 1.15 : 0.9);
    radii.push(baseRadius + (tipRadius - baseRadius) * taperT);
  }
  return { points: pts, radii, tipDir: dir };
}

/**
 * Build the full skeleton.
 * @param {object} params sanitised params
 * @param {object} quality quality tier
 * @param {import('./rng.js').Rng} rng
 */
export function growSkeleton(params, quality, rng) {
  const limbs = [];
  const maxDepth = Math.min(params.depth, quality.maxDepth);
  const limbBudget = Math.max(64, Math.floor(LIMITS.maxLimbs * quality.limbs));

  const segScale = quality.segments;
  const trunkSegments = Math.max(4, Math.round(params.trunkSegments * segScale));
  const trunkTipRadius = Math.max(0.006, params.radius * (1 - params.taper) * 0.45);

  // Trunk
  const leanAz = rng.next() * Math.PI * 2;
  const leanAngle = params.trunkBend * 14 * DEG * (0.4 + rng.next() * 0.6);
  const trunkDir = normalize([Math.sin(leanAz) * Math.sin(leanAngle), Math.cos(leanAngle), Math.cos(leanAz) * Math.sin(leanAngle)]);
  const trunkLength = params.height * (params.depth > 0 ? 0.62 : 1);
  const trunkSpine = growSpine(rng, {
    origin: [0, 0, 0], direction: trunkDir, length: trunkLength, segments: trunkSegments, depth: 0,
    isTrunk: true, params, outward: [0, 0, 0], baseRadius: params.radius, tipRadius: trunkTipRadius
  });
  const trunk = makeLimb(0, -1, 0, trunkSpine, trunkLength, params.radius, trunkTipRadius, false, rng.next() * Math.PI * 2);
  trunk.index = 0;
  limbs.push(trunk);

  let frontier = [0];
  const branchRng = rng.fork(11);
  const twigDepth = maxDepth + 1;

  for (let depth = 1; depth <= twigDepth && frontier.length; depth++) {
    const isTwigLevel = depth === twigDepth;
    if (isTwigLevel && params.twigs <= 0) break;
    const candidates = [];
    for (const parentIndex of frontier) {
      const parent = limbs[parentIndex];
      const pr = branchRng.fork(parentIndex);
      let count;
      if (isTwigLevel) {
        count = Math.round(params.twigs * 3 * (0.5 + pr.next()));
      } else if (depth === 1) {
        count = Math.round(params.children * 2.4 * (0.85 + pr.next() * 0.3));
      } else {
        count = Math.round(params.children * Math.pow(1 - params.childrenFalloff, depth - 1) * (0.7 + pr.next() * 0.6));
      }
      count = Math.max(isTwigLevel ? 0 : 1, Math.min(count, 40));
      for (let i = 0; i < count; i++) {
        candidates.push({ parentIndex, i, count, rng: pr.fork(i + 1) });
      }
    }
    if (!candidates.length) break;
    const remaining = limbBudget - limbs.length;
    if (remaining <= 0) break;
    // Uniform deterministic thinning when over budget
    let keep = candidates;
    if (candidates.length > remaining) {
      keep = [];
      let acc = 0;
      const ratio = remaining / candidates.length;
      for (const c of candidates) {
        acc += ratio;
        if (acc >= 1) {
          acc -= 1;
          keep.push(c);
        }
      }
    }
    const next = [];
    for (const c of keep) {
      const parent = limbs[c.parentIndex];
      const limb = growChild(parent, c, depth, isTwigLevel, params, quality, limbs.length);
      if (!limb) continue;
      limbs.push(limb);
      parent.children.push(limb.index);
      if (!isTwigLevel) next.push(limb.index);
    }
    frontier = next;
  }

  // Tier: generations from the nearest terminal limb. Twigs count as part of
  // their parent's extremity, so a limb carrying only twigs is still tier 0.
  for (let i = limbs.length - 1; i >= 0; i--) {
    const l = limbs[i];
    if (!l.children.length || l.children.every((c) => limbs[c].twig)) l.tier = 0;
    else {
      let m = Infinity;
      for (const c of l.children) if (!limbs[c].twig) m = Math.min(m, limbs[c].tier);
      l.tier = m + 1;
    }
  }

  // Normalise overall height toward the requested height (positions only; radii stay physical).
  let maxY = 0;
  for (const l of limbs) for (const p of l.points) if (p[1] > maxY) maxY = p[1];
  if (maxY > 0) {
    const s = Math.max(0.75, Math.min(1.3, params.height / maxY));
    if (Math.abs(s - 1) > 0.01) {
      for (const l of limbs) {
        for (const p of l.points) {
          p[0] *= s;
          p[1] *= s;
          p[2] *= s;
        }
        l.length *= s;
      }
    }
  }
  const actualDepth = limbs.reduce((m, l) => Math.max(m, l.twig ? l.depth - 1 : l.depth), 0);
  return { limbs, depth: actualDepth };
}

function makeLimb(depth, parent, t0, spine, len, baseRadius, tipRadius, twig, phase) {
  return {
    index: -1,
    depth,
    parent,
    t0,
    points: spine.points,
    radii: spine.radii,
    tipDir: spine.tipDir,
    length: len,
    baseRadius,
    tipRadius,
    children: [],
    tier: 0,
    twig,
    sides: 3,
    phase,
    frames: parallelTransportFrames(spine.points)
  };
}

function growChild(parent, c, depth, isTwig, params, quality, index) {
  const rng = c.rng;
  const isTrunkChild = parent.depth === 0;
  const span = params.endOffset - params.startOffset;
  let t;
  if (isTwig) {
    t = 0.45 + 0.55 * ((c.i + 0.5 + rng.jitter(0.4)) / c.count);
  } else if (isTrunkChild) {
    t = params.startOffset + span * ((c.i + 0.5 + rng.jitter(0.35)) / c.count);
  } else {
    // On branches, children crowd toward the tip a little.
    const u = (c.i + 0.5 + rng.jitter(0.35)) / c.count;
    t = params.startOffset * 0.6 + (1 - params.startOffset * 0.6) * Math.pow(u, 0.85) * params.endOffset;
  }
  t = Math.max(0.03, Math.min(0.995, t));

  const s = sampleLimb(parent, t);
  const parentRadius = s.radius;
  if (parentRadius < 0.0008 && !isTwig) return null;

  // Azimuth: phyllotactic spiral plus spread jitter
  const az = parent.phase + c.i * GOLDEN + rng.jitter(params.spread * Math.PI * 0.9);
  let angleDeg = params.angle * (1 + rng.jitter(params.spread * 0.6));
  if (isTrunkChild) angleDeg *= 1.2 - 0.5 * t; // lower limbs flatter, upper ones reach
  if (isTwig) angleDeg = 35 + rng.next() * 40;
  const angle = Math.max(4, Math.min(150, angleDeg)) * DEG;
  const side = add(scale(s.normal, Math.cos(az)), scale(s.binormal, Math.sin(az)));
  let dir = normalize(add(scale(s.tangent, Math.cos(angle)), scale(side, Math.sin(angle))));

  // Outward direction from the trunk axis (for phototropism)
  const outward = normalize([s.pos[0], 0, s.pos[2]]);
  if (!Number.isFinite(outward[0]) || length([s.pos[0], 0, s.pos[2]]) < 1e-4) {
    outward[0] = side[0];
    outward[2] = side[2];
  }

  // Length
  let len = parent.length * params.lengthRatio * (1 + rng.jitter(params.lengthVariance));
  if (isTrunkChild) len *= crownLengthFactor(t, params.crown);
  else len *= 0.75 + 0.35 * t;
  if (isTwig) len = Math.min(parent.length * 0.45, 0.25 + params.leafSize * 2) * (0.6 + rng.next() * 0.6);
  len = Math.max(0.05, len);

  // Radius
  let baseRadius = Math.min(parentRadius * params.radiusRatio, parentRadius * 0.92);
  if (isTrunkChild) baseRadius *= 0.9 + 0.2 * (1 - t);
  if (isTwig) baseRadius = Math.min(baseRadius, 0.012);
  baseRadius = Math.max(0.0025, baseRadius);
  const terminal = isTwig || depth === Math.min(params.depth, quality.maxDepth);
  const tipRadius = Math.max(0.0015, baseRadius * (terminal ? 0.12 : Math.max(0.2, 1 - params.taper)));

  // Segments decrease with depth
  const segs = isTwig
    ? 2
    : Math.max(2, Math.round(params.branchSegments * quality.segments * Math.pow(0.82, depth - 1)));

  // Nudge the origin outward so the base ring sits in the parent skin, not its core.
  const origin = addScaled(s.pos, side, parentRadius * 0.35);
  const spine = growSpine(rng, {
    origin, direction: dir, length: len, segments: segs, depth, isTrunk: false, params, outward,
    baseRadius, tipRadius
  });
  const limb = makeLimb(depth, parent.index, t, spine, len, baseRadius, tipRadius, isTwig, rng.next() * Math.PI * 2);
  limb.index = index;
  return limb;
}
