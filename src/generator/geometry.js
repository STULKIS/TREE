// Procedural tree builder. Pure and deterministic: (design, quality) -> typed-array meshes.
import { createRng } from './rng.js';
import { QUALITY, presetParams } from './params.js';

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
const UP = [0, 1, 0];
const SOIL = 0.02; // nothing is allowed to pierce the soil disc
const GOLDEN = 2.399963229728653;

/** Leaf-card outlines. `sVals` are the outline stations (base→tip) on each side. */
export const LEAF_CONFIG = Object.freeze({
  broad: { sVals: [0.4, 0.75], widthRatio: 0.42, lenScale: 1.0, bend: 0.25, shape: (s) => Math.pow(Math.sin(Math.PI * Math.pow(s, 0.85)), 0.9) },
  slender: { sVals: [0.4, 0.75], widthRatio: 0.2, lenScale: 1.25, bend: 0.2, shape: (s) => Math.sin(Math.PI * s) * (1 - 0.25 * s) },
  droop: { sVals: [0.4, 0.75], widthRatio: 0.3, lenScale: 1.4, bend: 0.9, shape: (s) => Math.pow(Math.sin(Math.PI * s), 0.8) },
  needle: { sVals: [0.5], widthRatio: 0.05, lenScale: 1.1, bend: 0.05, shape: (s) => 1 - 0.3 * s },
});

// ---------- small vector helpers (plain arrays; allocation cost is negligible here) ----------
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const madd = (a, b, s) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const norm = (a) => {
  const l = len(a);
  return l > 1e-12 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 1, 0];
};
const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const clampInt = (v, lo, hi) => clamp(Math.round(v), lo, hi);

/** sRGB hex → linear RGB triple (vertex colours are stored linear, as glTF expects). */
export function hexToLinear(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
}

/** Growing vertex/index buffers. Vertices are not shared between cards or tubes. */
class MeshBuilder {
  constructor() {
    this.pos = []; this.nor = []; this.col = []; this.uv = []; this.idx = [];
    this.count = 0;
  }
  vertex(p, n, c, u, v) {
    this.pos.push(p[0], p[1], p[2]);
    this.nor.push(n[0], n[1], n[2]);
    this.col.push(c[0], c[1], c[2]);
    this.uv.push(u, v);
    return this.count++;
  }
  tri(a, b, c) { this.idx.push(a, b, c); }
  get triangles() { return this.idx.length / 3; }
  toArrays() {
    return {
      positions: Float32Array.from(this.pos),
      normals: Float32Array.from(this.nor),
      colors: Float32Array.from(this.col),
      uvs: Float32Array.from(this.uv),
      indices: Uint32Array.from(this.idx),
    };
  }
}

/**
 * Rotation-minimising (parallel transport) frames via double reflection (Wang et al. 2008).
 * Child tubes therefore never twist as they curve.
 */
function transportFrames(pts) {
  const n = pts.length;
  const T = new Array(n);
  for (let i = 0; i < n; i++) T[i] = norm(sub(pts[Math.min(n - 1, i + 1)], pts[Math.max(0, i - 1)]));
  const N = new Array(n);
  const ref = Math.abs(T[0][0]) < 0.9 ? [1, 0, 0] : [0, 0, 1];
  N[0] = norm(cross(T[0], ref));
  for (let i = 1; i < n; i++) {
    const v1 = sub(pts[i], pts[i - 1]);
    const c1 = dot(v1, v1);
    if (c1 < 1e-14) { N[i] = N[i - 1]; continue; }
    const rL = madd(N[i - 1], v1, (-2 * dot(v1, N[i - 1])) / c1);
    const tL = madd(T[i - 1], v1, (-2 * dot(v1, T[i - 1])) / c1);
    const v2 = sub(T[i], tL);
    const c2 = dot(v2, v2);
    N[i] = norm(c2 < 1e-14 ? rL : madd(rL, v2, (-2 * dot(v2, rL)) / c2));
  }
  return { T, N };
}

/** Sweep a tapered tube along `pts`. Returns nothing; writes into builder `B`. */
function addTube(B, pts, radii, cols, sides, furrow, phase) {
  const { T, N } = transportFrames(pts);
  const n = pts.length;
  const rings = new Array(n);
  let arc = 0;
  for (let i = 0; i < n; i++) {
    if (i > 0) arc += len(sub(pts[i], pts[i - 1]));
    const Bv = cross(T[i], N[i]);
    rings[i] = B.count;
    const p = pts[i];
    for (let j = 0; j <= sides; j++) {
      const th = (TAU * j) / sides;
      const c = Math.cos(th);
      const s = Math.sin(th);
      const dir = [N[i][0] * c + Bv[0] * s, N[i][1] * c + Bv[1] * s, N[i][2] * c + Bv[2] * s];
      const pos = madd(p, dir, radii[i]);
      if (pos[1] < 0) pos[1] = 0; // roots flatten onto the soil rather than dipping below it
      const shade = 1 + furrow * (0.22 * Math.sin(th * 3 + p[1] * 2.3 + phase) + 0.1 * Math.sin(th * 7 + p[1] * 5.1));
      const col = cols[i];
      B.vertex(pos, dir, [clamp(col[0] * shade, 0, 1), clamp(col[1] * shade, 0, 1), clamp(col[2] * shade, 0, 1)], j / sides, arc);
    }
  }
  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < sides; j++) {
      const a = rings[i] + j;
      const b = a + 1;
      const c = rings[i + 1] + j;
      const d = c + 1;
      B.tri(a, b, c);
      B.tri(b, d, c);
    }
  }
}

function makeLimb(origin, dir, length, r0, taper, depth, isTrunk, phase, isLeader = false) {
  return { origin, dir, length, r0, taper, depth, isTrunk, phase, isLeader };
}

/** Direction rotated by `ang` away from `tan`, at azimuth `phi`. */
function orient(tan, ang, phi) {
  const ref = Math.abs(tan[1]) < 0.9 ? UP : [1, 0, 0];
  const U = norm(cross(tan, ref));
  const V = cross(tan, U);
  const around = add(mul(U, Math.cos(phi)), mul(V, Math.sin(phi)));
  return norm(add(mul(tan, Math.cos(ang)), mul(around, Math.sin(ang))));
}

function sampleAt(pts, radii, t) {
  const nSeg = pts.length - 1;
  const f = clamp(t, 0, 1) * nSeg;
  const i = Math.min(nSeg - 1, Math.floor(f));
  const k = f - i;
  return {
    pos: lerp3(pts[i], pts[i + 1], k),
    tan: norm(sub(pts[i + 1], pts[i])),
    r: radii[i] + (radii[i + 1] - radii[i]) * k,
  };
}

/** Children of a limb: side limbs along the crown, plus a continuing leader. */
function spawnChildren(ctx, limb, pts, radii) {
  const { p, rng } = ctx;
  const kids = [];
  if (limb.depth >= p.depth) return kids;
  const nSeg = pts.length - 1;
  const count = clampInt(p.children * (1 - 0.08 * limb.depth) * rng.range(0.8, 1.2), 1, 6);
  for (let k = 0; k < count; k++) {
    const u = (k + rng.range(0.2, 0.8)) / count;
    const s = sampleAt(pts, radii, p.crownStart + (p.crownEnd - p.crownStart) * u);
    const ang = (p.branchAngle + p.angleSpread * rng.range(-1, 1)) * DEG;
    const phi = k * GOLDEN + limb.phase + rng.range(-0.3, 0.3);
    kids.push(makeLimb(
      s.pos,
      orient(s.tan, ang, phi),
      limb.length * p.lengthRatio * (1 - 0.35 * u) * rng.range(0.85, 1.15),
      Math.max(0.003, s.r * p.radiusRatio),
      p.taper,
      limb.depth + 1,
      false,
      rng.next() * TAU,
    ));
  }
  if (!limb.isLeader && rng.next() < 0.2 + 0.8 * p.apicalDominance) {
    const tanEnd = norm(sub(pts[nSeg], pts[nSeg - 1]));
    const ang = (p.branchAngle * 0.25 * (1 - p.apicalDominance) + 2) * DEG;
    kids.push(makeLimb(
      pts[nSeg].slice(),
      orient(tanEnd, ang, rng.next() * TAU),
      limb.length * (limb.isTrunk ? 0.4 : p.lengthRatio * 0.85),
      Math.max(0.003, radii[nSeg] * 0.95),
      p.taper,
      limb.depth,
      limb.isTrunk,
      rng.next() * TAU,
      true,
    ));
  }
  return kids;
}

/**
 * Grow one limb as a tube. Returns its children, or null when the budget refuses it.
 * Limbs are processed breadth-first so the crown stays balanced when budgets bite.
 */
function growLimb(ctx, limb) {
  const { p, q, rng, C } = ctx;
  if (ctx.limbs >= q.maxLimbs) return null;
  const nSeg = clampInt(p.segments * (1 - 0.1 * limb.depth), 2, q.segsMax);
  const sides = clampInt(p.sides * (1 - 0.06 * limb.depth), 4, q.sidesMax);
  const tris = sides * nSeg * 2;
  if (ctx.barkTris + tris > q.maxBarkTris) return null;
  ctx.limbs += 1;
  ctx.barkTris += tris;
  ctx.maxDepth = Math.max(ctx.maxDepth, limb.depth);

  const k = 1 / nSeg;
  const step = limb.length / nSeg;
  const flareOn = limb.depth === 0 && !limb.isLeader;
  const tint = rng.range(0.9, 1.1);
  const pts = [limb.origin.slice()];
  const radii = [];
  const cols = [];
  let pos = limb.origin.slice();
  let dir = limb.dir.slice();

  for (let i = 0; i <= nSeg; i++) {
    const t = i / nSeg;
    let r = limb.r0 * (1 - (1 - limb.taper) * t);
    if (flareOn) r *= 1 + p.rootFlare * Math.exp(-(t * limb.length) / (0.12 * p.height + 0.05));
    radii.push(Math.max(0.002, r));
    const shade = tint * (0.94 + 0.12 * Math.sin(i * 1.7 + limb.phase));
    cols.push([C.bark[0] * shade, C.bark[1] * shade, C.bark[2] * shade]);
    if (i === nSeg) break;

    // Tropisms: trunk sways and climbs; limbs bend toward light (lift) and soil (sag).
    if (limb.isTrunk) {
      dir = [
        dir[0] + rng.range(-1, 1) * p.trunkWobble * 0.4 * k,
        dir[1] + 0.3 * k,
        dir[2] + rng.range(-1, 1) * p.trunkWobble * 0.4 * k,
      ];
    } else {
      const sag = p.droop * (0.25 + t) * 1.6 * k;
      const lift = p.rise * (1 - 0.5 * t) * 1.2 * k;
      const gn = p.gnarl * 0.9 * k;
      dir = [
        dir[0] + rng.range(-1, 1) * gn,
        dir[1] - sag + lift + rng.range(-1, 1) * gn * 0.5,
        dir[2] + rng.range(-1, 1) * gn,
      ];
    }
    dir = norm(dir);
    let next = madd(pos, dir, step);
    if (next[1] < SOIL + radii[i]) {
      dir = norm([dir[0], Math.max(dir[1], 0.4), dir[2]]);
      next = madd(pos, dir, step);
      if (next[1] < SOIL) next[1] = SOIL;
    }
    pos = next;
    pts.push(pos);
  }

  addTube(ctx.bark, pts, radii, cols, sides, p.barkFurrow, limb.phase);

  if (ctx.leafOn && limb.depth >= Math.min(p.leafDepthMin, p.depth)) {
    for (let i = 0; i < nSeg; i++) {
      const t = (i + 0.5) / nSeg;
      const tip = clamp(0.5 * (limb.depth / p.depth) + 0.5 * t, 0, 1);
      const tierW = 0.3 + 0.7 * Math.pow(tip, 1 + 2 * p.leafTipBias);
      const expected = p.leafDensity * tierW * 18;
      const count = Math.floor(expected) + (rng.next() < expected % 1 ? 1 : 0);
      if (count <= 0) continue;
      const mid = lerp3(pts[i], pts[i + 1], 0.5);
      ctx.sites.push({
        idx: ctx.sites.length,
        p: mid,
        t: norm(sub(pts[i + 1], pts[i])),
        r: (radii[i] + radii[i + 1]) / 2,
        n: count,
        // Crown-top priority: tips and high points win when the card budget bites.
        pr: tip * 0.7 + (mid[1] / Math.max(1, p.height)) * 0.3 + rng.next() * 0.05,
      });
    }
  }

  return spawnChildren(ctx, limb, pts, radii);
}

function addCard(ctx, site, cfg) {
  const { p, rng, fol, C } = ctx;
  const T = site.t;
  const refV = Math.abs(T[1]) < 0.9 ? UP : [1, 0, 0];
  const U = norm(cross(T, refV));
  const V = cross(T, U);
  const phi = rng.next() * TAU;
  const outward = add(mul(U, Math.cos(phi)), mul(V, Math.sin(phi)));
  const tilt = clamp(p.leafTilt * DEG * (0.6 + 0.8 * rng.next()), 0, Math.PI * 0.48);
  let axis = add(mul(outward, Math.cos(tilt)), mul(UP, Math.sin(tilt)));
  axis = madd(axis, T, rng.range(-0.35, 0.35));
  axis[1] -= p.leafDroop * 0.5;
  const base = madd(site.p, outward, site.r * 0.6);
  if (base[1] < p.hangerFloor) axis[1] = Math.abs(axis[1]) + 0.35; // fold hangers back up
  axis = norm(axis);
  let W = cross(axis, T);
  if (len(W) < 1e-6) W = cross(axis, U);
  W = norm(W);
  const n0 = norm(cross(axis, W));
  const normal = n0[1] < 0 ? mul(n0, -1) : n0;

  const L = p.leafSize * (0.75 + 0.5 * rng.next()) * cfg.lenScale;
  const wmax = L * cfg.widthRatio * p.leafWidth;
  const bendAmt = cfg.bend * (0.3 + p.leafDroop) * L;
  const jitter = 0.84 + 0.32 * rng.next();
  let baseC;
  let tipC;
  if (rng.next() < p.flowerMix) {
    baseC = mul(C.flower, jitter);
    tipC = mul(C.flower, jitter * 1.08);
  } else {
    const au = p.autumn * rng.next();
    baseC = mul(lerp3(C.leaf, C.autumn, au), jitter);
    tipC = mul(lerp3(C.leafTip, C.autumn, au * 0.8), jitter);
  }
  baseC = baseC.map((v) => clamp(v, 0, 1));
  tipC = tipC.map((v) => clamp(v, 0, 1));

  const bySide = [];
  const cIdx = fol.vertex(base[1] < SOIL ? [base[0], SOIL, base[2]] : base, normal, baseC, 0.5, 0);
  const ringSpec = [];
  for (const s of cfg.sVals) ringSpec.push({ s, side: -1 });
  ringSpec.push({ s: 1, side: 0 });
  for (let i = cfg.sVals.length - 1; i >= 0; i--) ringSpec.push({ s: cfg.sVals[i], side: 1 });

  for (const rs of ringSpec) {
    const w = wmax * cfg.shape(rs.s) * (rs.side === 0 ? 0 : 1);
    const pos = [
      base[0] + axis[0] * rs.s * L + W[0] * rs.side * w,
      base[1] + axis[1] * rs.s * L + W[1] * rs.side * w - bendAmt * rs.s * rs.s,
      base[2] + axis[2] * rs.s * L + W[2] * rs.side * w,
    ];
    if (pos[1] < SOIL) pos[1] = SOIL;
    const u = 0.5 + 0.5 * rs.side * (wmax > 0 ? cfg.shape(rs.s) : 0);
    bySide.push(fol.vertex(pos, normal, lerp3(baseC, tipC, rs.s), u, rs.s));
  }
  for (let j = 0; j < bySide.length; j++) fol.tri(cIdx, bySide[j], bySide[(j + 1) % bySide.length]);
}

/** Choose which candidate sites receive cards: crown tops first, then the rest. */
function placeFoliage(ctx) {
  const { p, q, sites, rng } = ctx;
  const cfg = LEAF_CONFIG[p.leafStyle];
  if (!cfg || sites.length === 0) return;
  const perCard = 2 * cfg.sVals.length + 1;
  const cap = Math.min(p.leafCap, Math.floor(q.foliageTriBudget / perCard));
  const total = sites.reduce((a, s) => a + s.n, 0);
  const keep = new Array(sites.length).fill(0);
  if (total <= cap) {
    for (const s of sites) keep[s.idx] = s.n;
  } else {
    const order = sites.slice().sort((a, b) => b.pr - a.pr || a.idx - b.idx);
    let remaining = cap;
    for (const s of order) {
      if (remaining <= 0) break;
      const c = Math.min(s.n, remaining);
      keep[s.idx] = c;
      remaining -= c;
    }
  }
  // Keep the RNG draw count identical regardless of which sites are kept (stable for seeds).
  rng.next();
  for (const s of sites) {
    for (let c = 0; c < keep[s.idx]; c++) {
      addCard(ctx, s, cfg);
      ctx.cardStarts.push(ctx.fol.triangles);
    }
  }
  ctx.cards = ctx.cardStarts.length - 1;
}

function boundsOf(arrays) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const arr of arrays) {
    const pos = arr.positions;
    for (let i = 0; i < pos.length; i += 3) {
      for (let c = 0; c < 3; c++) {
        const v = pos[i + c];
        if (v < min[c]) min[c] = v;
        if (v > max[c]) max[c] = v;
      }
    }
  }
  if (!Number.isFinite(min[0])) return { min: [0, 0, 0], max: [0, 0, 0] };
  return { min, max };
}

/**
 * Build a complete tree.
 * @param {{species?: string, seed: number, params: object}} design  sanitised design
 * @param {'studio'|'preview'|'software'} quality
 */
export function buildTree(design, quality = 'studio') {
  const q = QUALITY[quality] ?? QUALITY.studio;
  const p = { ...presetParams(design.species), ...design.params };
  const rng = createRng(design.seed);
  const lean = p.trunkLean * DEG;
  const az = rng.next() * TAU;
  const C = {
    bark: hexToLinear(p.barkColor),
    leaf: hexToLinear(p.leafColor),
    leafTip: hexToLinear(p.leafTipColor),
    flower: hexToLinear(p.flowerColor),
    autumn: hexToLinear('#c9652b'),
  };
  const ctx = {
    p, q, rng, C,
    bark: new MeshBuilder(),
    fol: new MeshBuilder(),
    sites: [],
    cardStarts: [0],
    cards: 0,
    limbs: 0,
    barkTris: 0,
    maxDepth: 0,
    leafOn: p.leafStyle !== 'none' && p.leafDensity > 0.001,
  };

  const queue = [makeLimb(
    [0, 0, 0],
    [Math.sin(lean) * Math.cos(az), Math.cos(lean), Math.sin(lean) * Math.sin(az)],
    p.height,
    p.trunkRadius,
    p.trunkTaper,
    0,
    true,
    rng.next() * TAU,
  )];
  for (let qi = 0; qi < queue.length; qi++) {
    const kids = growLimb(ctx, queue[qi]);
    if (kids) for (const kid of kids) queue.push(kid);
  }
  if (ctx.leafOn) placeFoliage(ctx);

  const bark = ctx.bark.toArrays();
  const foliage = ctx.fol.toArrays();
  foliage.cardStarts = Uint32Array.from(ctx.cardStarts);
  const bounds = boundsOf([bark, foliage]);
  const barkTriangles = bark.indices.length / 3;
  const foliageTriangles = foliage.indices.length / 3;
  return {
    bark,
    foliage,
    bounds,
    stats: {
      triangles: barkTriangles + foliageTriangles,
      barkTriangles,
      foliageTriangles,
      leaves: ctx.cards,
      limbs: ctx.limbs,
      depth: ctx.maxDepth,
      height: bounds.max[1],
      quality: q.id,
    },
  };
}

/** Every typed array in a result, for zero-copy transfer from the worker. */
export function transferables(result) {
  const out = [];
  for (const group of [result.bark, result.foliage]) {
    for (const v of Object.values(group)) if (ArrayBuffer.isView(v)) out.push(v.buffer);
  }
  return out;
}
