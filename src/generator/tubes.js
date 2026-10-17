/**
 * Bark mesh: tapered tubes swept along each limb's parallel-transport frames,
 * closed with a cone cap, with a lobed root flare on the trunk.
 */
import { add, scale, normalize, sub, dot, addScaled, distance } from './vec.js';
import { hexToRgb, mix, shiftHsl } from './color.js';

/** Assign ring side counts per limb to fit a triangle budget. Returns estimated triangles. */
export function budgetSides(limbs, params, quality, triangleBudget) {
  const baseSides = Math.max(3, Math.round(params.trunkSides * quality.sides));
  const trunkRadius = params.radius;
  for (const l of limbs) {
    if (l.twig) {
      l.sides = 3;
      continue;
    }
    const byDepth = baseSides * Math.pow(0.68, l.depth);
    const byRadius = baseSides * Math.sqrt(l.baseRadius / trunkRadius) * 1.1;
    l.sides = Math.max(3, Math.min(baseSides, Math.round(Math.min(byDepth, byRadius))));
  }
  let tris = estimateBarkTriangles(limbs);
  let guard = 0;
  while (tris > triangleBudget && guard++ < 12) {
    const ratio = triangleBudget / tris;
    let changed = false;
    for (const l of limbs) {
      if (l.sides > 3) {
        const ns = Math.max(3, Math.floor(l.sides * Math.max(0.5, ratio)));
        if (ns !== l.sides) {
          l.sides = ns;
          changed = true;
        }
      }
    }
    if (!changed) break;
    tris = estimateBarkTriangles(limbs);
  }
  return tris;
}

export function limbTriangles(l) {
  return (l.points.length - 1) * l.sides * 2 + l.sides;
}

export function estimateBarkTriangles(limbs) {
  let t = 0;
  for (const l of limbs) if (!l.culled) t += limbTriangles(l);
  return t;
}

/**
 * Drop the least significant limbs (twigs, then deepest) until the bark fits.
 */
export function cullToBudget(limbs, triangleBudget) {
  let tris = estimateBarkTriangles(limbs);
  if (tris <= triangleBudget) return tris;
  const order = limbs
    .map((l, i) => i)
    .filter((i) => limbs[i].depth > 0)
    .sort((a, b) => {
      const la = limbs[a];
      const lb = limbs[b];
      if (la.twig !== lb.twig) return la.twig ? -1 : 1;
      if (la.depth !== lb.depth) return lb.depth - la.depth;
      return la.baseRadius - lb.baseRadius;
    });
  for (const i of order) {
    if (tris <= triangleBudget) break;
    const l = limbs[i];
    if (l.culled) continue;
    // Only cull leaves of the hierarchy (no live children)
    if (l.children.some((c) => !limbs[c].culled)) continue;
    l.culled = true;
    tris -= limbTriangles(l);
  }
  return tris;
}

/**
 * Build the bark mesh for all limbs into `mesh`.
 */
export function buildBark(mesh, limbs, params, rng) {
  const barkA = hexToRgb(params.barkColor);
  const barkB = hexToRgb(params.barkTint);
  const flareLen = Math.max(0.2, params.radius * 3.2);
  const lobes = 3 + rng.int(0, 3);
  const lobePhase = rng.next() * Math.PI * 2;
  const treeHeight = params.height;

  for (const limb of limbs) {
    if (limb.culled) continue;
    const sides = limb.sides;
    const pts = limb.points;
    const n = pts.length;
    const fr = limb.frames;
    const isTrunk = limb.depth === 0;
    // Per-limb colour: deeper = tinted toward barkTint, with slight per-limb jitter
    const depthMix = Math.min(1, 0.12 + limb.depth * 0.18 + (limb.twig ? 0.2 : 0));
    const limbTint = rng.jitter(0.05);
    const rings = [];
    let v = 0;
    const circumference = Math.max(0.05, 2 * Math.PI * limb.baseRadius);
    let arc = 0;

    for (let i = 0; i < n; i++) {
      const p = pts[i];
      const t = i / (n - 1);
      if (i > 0) arc += distance(pts[i - 1], p);
      v = arc / circumference;
      const rBase = limb.radii[i];
      const N = fr.normals[i];
      const B = fr.binormals[i];
      const T = fr.tangents[i];
      // Slope of the radius for correct normals
      const rPrev = limb.radii[Math.max(0, i - 1)];
      const rNext = limb.radii[Math.min(n - 1, i + 1)];
      const ds = Math.max(1e-4, distance(pts[Math.max(0, i - 1)], pts[Math.min(n - 1, i + 1)]));
      const slope = (rNext - rPrev) / ds;
      const ring = [];
      for (let k = 0; k <= sides; k++) {
        const a = (k / sides) * Math.PI * 2;
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        let r = rBase;
        if (isTrunk && arc < flareLen && params.flare > 0) {
          const f = 1 - arc / flareLen;
          const lobe = 0.5 + 0.5 * Math.cos(a * lobes + lobePhase);
          r *= 1 + params.flare * (0.55 * f * f + 0.6 * lobe * f * f * f);
        }
        const radial = add(scale(N, ca), scale(B, sa));
        const pos = addScaled(p, radial, r);
        if (pos[1] < 0 || (isTrunk && i === 0)) pos[1] = 0;
        const nrm = normalize(sub(radial, scale(T, slope)));
        // Colour: base/tint mix, vertical ridge noise, AO toward the ground and interior
        const ridge = 0.5 + 0.5 * Math.sin(a * (sides >= 8 ? 7 : 3) + v * 2.1);
        let c = mix(barkA, barkB, Math.min(1, depthMix + ridge * 0.22 + limbTint));
        const ao = isTrunk ? 0.72 + 0.28 * Math.min(1, pos[1] / (treeHeight * 0.25)) : 0.88 + 0.12 * t;
        c = [c[0] * ao, c[1] * ao, c[2] * ao];
        if (limbTint !== 0) c = shiftHsl(c, limbTint * 0.1, 0, 0);
        ring.push(mesh.vertex(pos, nrm, c, [k / sides, v]));
      }
      rings.push(ring);
    }
    // Side quads
    for (let i = 0; i < n - 1; i++) {
      const r0 = rings[i];
      const r1 = rings[i + 1];
      for (let k = 0; k < sides; k++) {
        const a = r0[k];
        const b = r0[k + 1];
        const c = r1[k];
        const d = r1[k + 1];
        mesh.triangle(a, b, c);
        mesh.triangle(b, d, c);
      }
    }
    // Cone cap
    const tipT = fr.tangents[n - 1];
    const tipPos = addScaled(pts[n - 1], tipT, Math.max(0.002, limb.radii[n - 1] * 1.6));
    const tipColor = mix(barkA, barkB, Math.min(1, depthMix + 0.15));
    const apex = mesh.vertex(tipPos, tipT, tipColor, [0.5, v + 0.1]);
    const last = rings[n - 1];
    for (let k = 0; k < sides; k++) mesh.triangle(last[k], last[k + 1], apex);
  }
}
