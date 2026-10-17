import * as THREE from 'three';
import { makeRng } from './rng.js';
import { MeshBuilder, addTube, computeFrames, perpendicular } from './geometry.js';

const UP = new THREE.Vector3(0, 1, 0);
const TAU = Math.PI * 2;
const DEG = Math.PI / 180;

const MAX_LEAF_CARDS = 30000;

const LEAF_OUTLINE_BROAD = [
  [0, 0],
  [0.34, 0.1],
  [0.78, 0.28],
  [1, 0.52],
  [0.8, 0.79],
  [0.32, 0.97],
  [0, 1],
  [-0.32, 0.97],
  [-0.8, 0.79],
  [-1, 0.52],
  [-0.78, 0.28],
  [-0.34, 0.1],
];

const LEAF_OUTLINE_NEEDLE = [
  [0, 0],
  [0.55, 0.36],
  [0, 1],
  [-0.55, 0.36],
];

const clamp = THREE.MathUtils.clamp;

function sampleLimb(samples, t) {
  const x = clamp(t, 0, 1) * (samples.length - 1);
  const i = Math.floor(x);
  const f = x - i;
  const a = samples[i];
  const b = samples[Math.min(i + 1, samples.length - 1)];
  return {
    center: a.center.clone().lerp(b.center, f),
    tangent: a.tangent.clone().lerp(b.tangent, f).normalize(),
    radius: THREE.MathUtils.lerp(a.radius, b.radius, f),
  };
}

function buildTrunk(p, rng) {
  const height = Math.max(1.2, p.trunk.height);
  const segments = Math.max(6, Math.round(p.trunk.segments));
  const step = height / segments;
  const samples = [];
  const leanDirection = new THREE.Vector3(Math.cos(rng.range(0, TAU)), 0, Math.sin(rng.range(0, TAU)));
  const lean = p.trunk.lean * DEG;
  const wobble = p.trunk.wobble;
  const wobblePhase = rng.range(0, TAU);

  let center = new THREE.Vector3(0, 0, 0);
  let tangent = new THREE.Vector3(leanDirection.x * Math.sin(lean) * 0.4, 1, leanDirection.z * Math.sin(lean) * 0.4)
    .normalize();

  for (let i = 0; i <= segments; i += 1) {
    const t = i / segments;
    if (i > 0) {
      const desired = new THREE.Vector3(
        leanDirection.x * Math.sin(lean) + Math.sin(t * 4.4 + wobblePhase) * wobble * 0.16,
        1,
        leanDirection.z * Math.sin(lean) + Math.cos(t * 3.7 + wobblePhase * 1.4) * wobble * 0.16,
      ).normalize();
      tangent.lerp(desired, 0.22).normalize();
      center = center.clone().addScaledVector(tangent, step);
    }

    const taper = Math.pow(1 - t, 0.74);
    const flare = 1 + p.trunk.flare * Math.pow(1 - t, 3.2) * 1.35;
    const radius = Math.max(p.trunk.radius * taper, p.trunk.radius * 0.014) * flare;

    samples.push({ center: center.clone(), tangent: tangent.clone(), radius, t });
  }

  return samples;
}

function buildRoots(p, rng, barkBuilder, tintBark, stats) {
  const count = Math.round(clamp(p.roots.count, 0, 10));
  if (count < 1) return;
  const baseRadius = p.trunk.radius * 0.34;
  const reach = p.roots.reach * (0.7 + p.trunk.radius * 1.1);
  const phaseBase = rng.range(0, TAU);

  for (let i = 0; i < count; i += 1) {
    const azimuth = (i / count) * TAU + rng.range(-0.34, 0.34) + phaseBase;
    const phase = rng.range(0, TAU);
    const steps = 9;
    const samples = [];

    for (let s = 0; s <= steps; s += 1) {
      const t = s / steps;
      const distance = p.trunk.radius * 0.72 + (reach - p.trunk.radius * 0.72) * Math.pow(t, 1.15);
      const wander = Math.sin(t * 2.1 + phase) * reach * 0.12;
      const x = Math.cos(azimuth) * distance + Math.cos(azimuth + Math.PI / 2) * wander;
      const z = Math.sin(azimuth) * distance + Math.sin(azimuth + Math.PI / 2) * wander;
      // ridges start high on the trunk and dive under the ground at the end
      const y = THREE.MathUtils.lerp(0.34 + p.trunk.radius * 0.55, -0.06, Math.pow(t, 0.72));
      const radius = Math.max(0.005, baseRadius * (0.55 + 0.55 * Math.pow(1 - t, 1.35)));
      samples.push({ center: new THREE.Vector3(x, y, z), radius });
    }

    addTube(barkBuilder, samples, Math.max(5, p.trunk.sides - 3), {
      phase,
      lump: p.bark.lumpiness * 1.3,
      colorFn: tintBark,
      vScale: 0.6,
      cap: false,
    });
    stats.limbs += 1;
  }
}

function limbSamples(start, direction, length, segments, p, rng, depth) {
  const samples = [];
  const step = length / segments;
  let center = start.clone();
  let tangent = direction.clone().normalize();
  const phase = rng.range(0, TAU);
  const gravity = p.branches.droop * (0.2 + depth * 0.055);
  const lift = p.branches.upBias * 0.1;
  const gnarl = p.branches.gnarl * 0.2;

  for (let i = 0; i <= segments; i += 1) {
    const t = i / segments;
    samples.push({ center: center.clone(), tangent: tangent.clone(), radius: 0 });
    if (i === segments) break;

    const desired = tangent.clone();
    desired.y += lift * (1 - t * 0.6) - gravity * t;
    desired.x += Math.sin(phase + t * 4.6) * gnarl;
    desired.z += Math.cos(phase * 1.3 + t * 3.9) * gnarl;
    desired.normalize();
    tangent.lerp(desired, 0.5).normalize();
    if (center.y < 0.22) {
      tangent.y = Math.max(tangent.y, 0.08);
      tangent.normalize();
    }
    center = center.clone().addScaledVector(tangent, step);
  }

  return samples;
}

function leafFrame(rng, outward) {
  const up = new THREE.Vector3(
    rng.range(-1, 1),
    rng.range(-0.45, 1),
    rng.range(-1, 1),
  ).normalize();
  if (up.dot(UP) < -0.15) up.lerp(UP, 0.3).normalize();
  if (outward) up.addScaledVector(outward, 0.3).normalize();
  const right = perpendicular(up).applyAxisAngle(up, rng.range(0, TAU));
  const normal = new THREE.Vector3().crossVectors(right, up).normalize();
  return { up, right, normal };
}

function addLeafCard(builder, base, frame, length, width, palette, rng, stats, options = {}) {
  const { up, right, normal } = frame;
  const needle = options.needle === true;
  const outline = needle ? LEAF_OUTLINE_NEEDLE : LEAF_OUTLINE_BROAD;
  const fold = needle ? 0 : width * 0.18;
  const lean = options.lean || 0;

  if (base.y < 0.04) return;

  const cardBase = new THREE.Color().copy(palette.a).lerp(palette.b, 0.25 + rng() * 0.4);
  const cardTip = new THREE.Color().copy(palette.b).lerp(palette.tip, 0.5 + rng() * 0.5);
  const brightness = 0.86 + rng() * 0.26;
  const color = new THREE.Color();

  const direction = up.clone();
  if (lean) direction.addScaledVector(UP, -lean).normalize();
  if (options.hang) direction.addScaledVector(UP, -options.hang).normalize();
  // nothing should pierce the soil: fold hanging cards back up near the ground
  const maxDrop = Math.max(0.02, base.y - 0.03);
  const minDirectionY = -maxDrop / Math.max(length, 0.001);
  if (direction.y < minDirectionY) {
    direction.y = minDirectionY;
    direction.normalize();
  }

  const indices = [];
  const baseIndex = builder.vertexCount;
  const u = 0.5;
  const shadeBase = 0.82 + rng() * 0.08;
  color.copy(cardBase).multiplyScalar(shadeBase * brightness);
  builder.addVertex(base.x, base.y, base.z, u, 0, color);
  indices.push(0);

  for (let i = 0; i < outline.length; i += 1) {
    const [ox, oy] = outline[i];
    const w = ox * width;
    const l = oy * length;
    const bend = fold * Math.sin(Math.PI * oy);
    const point = base
      .clone()
      .addScaledVector(direction, l)
      .addScaledVector(right, w)
      .addScaledVector(normal, bend);
    const f = THREE.MathUtils.smoothstep(oy, 0.32, 1) * 0.72;
    color.copy(cardBase).lerp(cardTip, f).multiplyScalar(brightness * (0.9 + rng() * 0.12));
    builder.addVertex(point.x, point.y, point.z, u + 0.05, oy, color);
    indices.push(i + 1);
  }

  for (let i = 1; i < indices.length - 1; i += 1) {
    builder.addTriangle(baseIndex + indices[0], baseIndex + indices[i], baseIndex + indices[i + 1]);
  }
  builder.addTriangle(
    baseIndex + indices[0],
    baseIndex + indices[indices.length - 1],
    baseIndex + indices[1],
  );

  stats.leaves += 1;
}

function addBroadleafFoliage(builder, samples, depth, p, rng, palette, stats) {
  const style = p.leaves.style;
  if (style === 'none' || p.leaves.density <= 0) return;

  const fromTip = Math.max(0, p.branches.depth - depth);
  const density = clamp(p.leaves.density, 0.05, 2.5);
  const slender = style === 'slender';
  const styles = { droop: p.branches.droop > 0.35 };

  // tier by distance from the twig tip: dense at the extremities, sparse on
  // the big interior limbs so the crown fills without ballooning the budget
  const tiers = [
    { start: 0, spacing: 0.05, cards: 4.2, allowTipBud: true },
    { start: 0.02, spacing: 0.06, cards: 3.2, allowTipBud: true },
    { start: 0.1, spacing: 0.11, cards: 2.2, allowTipBud: false },
    { start: 0.3, spacing: 0.22, cards: 1.4, allowTipBud: false },
  ];
  const tier = tiers[Math.min(fromTip, tiers.length - 1)];
  if (slender && fromTip > 2) return;
  // the lowest trunk branches carry a little leaf cover but not much
  if (fromTip === 0 && depth === 1) return;

  const addCluster = (at, count) => {
    for (let i = 0; i < count; i += 1) {
      if (stats.leaves >= (stats.leafLimit || MAX_LEAF_CARDS)) return;
      const jitter = at.radius * 1.8 + 0.04;
      const base = at.center.clone().add(new THREE.Vector3(
        rng.range(-jitter, jitter),
        rng.range(-jitter, jitter) * 0.6,
        rng.range(-jitter, jitter),
      ));
      const frame = leafFrame(rng, at.tangent);
      const size = p.leaves.size * rng.range(1 - p.leaves.sizeVar, 1 + p.leaves.sizeVar);
      const length = size * (slender ? 1.7 : 1);
      const width = length * (slender ? 0.16 : 0.34);
      addLeafCard(builder, base, frame, length, width, palette, rng, stats, {
        lean: slender ? 0.12 : 0.04,
        hang: styles.droop ? p.branches.droop * 1.7 : 0,
      });
    }
  };

  // The tip goes in first: if the budget runs out, the bare stretch is hidden
  // inside the crown instead of leaving spikes poking out of the silhouette.
  if (tier.allowTipBud && !slender) {
    addCluster(sampleLimb(samples, 1), Math.round(tier.cards * 1.3 + density * 2));
    if (stats.leaves >= (stats.leafLimit || MAX_LEAF_CARDS)) return;
  }

  const spacing = tier.spacing / density;
  let t = 1 - spacing * rng.range(0.3, 0.9);
  while (t >= tier.start) {
    if (stats.leaves >= (stats.leafLimit || MAX_LEAF_CARDS)) return;
    addCluster(sampleLimb(samples, t), Math.round(tier.cards + density * 1.2));
    t -= spacing * rng.range(0.72, 1.25);
  }
}

function addNeedleFoliage(builder, samples, depth, p, rng, palette, stats) {
  if (p.leaves.style !== 'needle' || p.leaves.density <= 0) return;
  const terminal = depth >= p.branches.depth;
  const penultimate = depth === p.branches.depth - 1;
  const outer = depth === p.branches.depth - 2;
  if (!terminal && !penultimate && !outer) return;

  const density = clamp(p.leaves.density, 0.05, 2.5);
  const startT = terminal ? 0.08 : penultimate ? 0.2 : 0.4;
  const spacing = (terminal ? 0.055 : penultimate ? 0.055 : 0.085) / density;

  // Two needle fans per anchor, each fanning around the twig.
  let t = startT + rng.range(0, spacing);
  while (t <= 1.001) {
    if (stats.leaves >= (stats.leafLimit || MAX_LEAF_CARDS)) return;
    const at = sampleLimb(samples, t);
    const frame = computeFrames([at.center.clone().addScaledVector(at.tangent, -0.01), at.center.clone().addScaledVector(at.tangent, 0.01)])[0];
    const count = Math.round(10 + density * 5);
    const fanPhase = rng.range(0, TAU);

    for (let i = 0; i < count; i += 1) {
      if (stats.leaves >= (stats.leafLimit || MAX_LEAF_CARDS)) return;
      const angle = fanPhase + (i / count) * TAU + rng.range(-0.25, 0.25);
      const outward = frame.normal.clone().multiplyScalar(Math.cos(angle))
        .addScaledVector(frame.binormal, Math.sin(angle));
      const up = outward.clone().multiplyScalar(0.82)
        .addScaledVector(at.tangent, rng.range(0.15, 0.55))
        .addScaledVector(UP, rng.range(-0.32, -0.05))
        .normalize();
      const right = perpendicular(up).applyAxisAngle(up, rng.range(0, TAU));
      const normal = new THREE.Vector3().crossVectors(right, up).normalize();
      const base = at.center.clone().addScaledVector(outward, at.radius * 0.8 + 0.01);
      const size = p.leaves.size * rng.range(1 - p.leaves.sizeVar, 1 + p.leaves.sizeVar);
      addLeafCard(builder, base, { up, right, normal }, size * 0.72, size * 0.1, palette, rng, stats, {
        needle: true,
        hang: p.branches.droop * 0.9,
      });
    }
    t += spacing * rng.range(0.75, 1.2);
  }
}

export function generateTree(params) {
  const p = params;
  const rng = makeRng(p.seed);
  const barkBuilder = new MeshBuilder();
  const leafBuilder = new MeshBuilder();
  const stats = { limbs: 0, leaves: 0 };
  const H = Math.max(1.2, p.trunk.height);

  const barkA = new THREE.Color(p.bark.colorA);
  const barkB = new THREE.Color(p.bark.colorB);
  const scratch = new THREE.Color();
  const tintBark = (t, sample, angleFraction, out) => {
    const heightMix = clamp(0.12 + (sample.center.y / H) * 0.82 + (rng() - 0.5) * 0.24, 0, 1);
    out.copy(barkA).lerp(barkB, heightMix);
    const bands = 0.94 + 0.06 * Math.sin(angleFraction * TAU * 3 + t * 9 + (sample.center.y / H) * 4);
    out.multiplyScalar(bands * (0.94 + rng() * 0.1));
  };

  // Trunk
  const trunk = buildTrunk(p, rng);
  addTube(barkBuilder, trunk, Math.max(6, Math.round(p.trunk.sides)), {
    phase: rng.range(0, TAU),
    lump: p.bark.lumpiness,
    colorFn: tintBark,
    vScale: 0.7,
    cap: true,
  });
  stats.limbs += 1;

  buildRoots(p, rng, barkBuilder, tintBark, stats);

  const leafPalette = {
    a: new THREE.Color(p.leaves.colorA),
    b: new THREE.Color(p.leaves.colorB),
    tip: new THREE.Color(p.leaves.colorTip),
  };
  const leafTarget = p.leaves.style === 'needle' ? addNeedleFoliage : addBroadleafFoliage;
  const grownLimbs = [];

  const growLimb = (start, direction, length, radius, depth) => {
    if (depth > p.branches.depth + 1 || radius < 0.0032 || length < 0.07) return;
    if (stats.limbs > 4500) return;

    const segments = Math.max(4, Math.round(p.branches.segments * (1 - depth * 0.05)));
    const samples = limbSamples(start, direction, length, segments, p, rng, depth);
    const tipRadius = Math.max(0.0025, radius * 0.055);

    for (let i = 0; i < samples.length; i += 1) {
      const t = i / (samples.length - 1);
      samples[i].radius = tipRadius + (radius - tipRadius) * Math.pow(1 - t, 0.88);
    }

    const sides = Math.max(4, Math.round(p.branches.sides) - Math.max(0, depth - 1));
    addTube(barkBuilder, samples, sides, {
      phase: rng.range(0, TAU),
      lump: p.bark.lumpiness * 0.8,
      colorFn: tintBark,
      vScale: 0.7,
      cap: true,
    });
    stats.limbs += 1;

    grownLimbs.push({ samples, depth, length });

    if (depth >= p.branches.depth) return;

    const baseChildren = Math.round(clamp(p.branches.split, 1, 4));
    const childCount = Math.max(1, baseChildren + (rng.chance(0.22) ? 1 : 0));
    const spreadStart = 0.42;
    const spreadEnd = 0.94;

    for (let k = 0; k < childCount; k += 1) {
      const ft = childCount === 1
        ? 0.82
        : spreadStart + ((spreadEnd - spreadStart) * k) / (childCount - 1);
      const at = sampleLimb(samples, clamp(ft + rng.range(-0.05, 0.05), 0.3, 0.97));
      const radial = perpendicular(at.tangent).applyAxisAngle(at.tangent, rng.range(0, TAU));
      const angle = clamp(p.branches.angle + rng.gauss() * p.branches.angleVar, 12, 102) * DEG;
      const childDirection = at.tangent.clone().multiplyScalar(Math.cos(angle))
        .addScaledVector(radial, Math.sin(angle));
      childDirection.addScaledVector(UP, p.branches.upBias * 0.4);
      childDirection.normalize();

      const childLength = Math.max(
        0.16,
        length * p.branches.reach * rng.range(0.78, 1.12) * (1 - depth * 0.04),
      );
      const childRadius = Math.max(0.003, at.radius * p.branches.taper);
      growLimb(at.center.clone(), childDirection, childLength, childRadius, depth + 1);
    }
  };

  const levels = Math.max(1, Math.round(p.branches.levels));
  const trunkLength = trunk[trunk.length - 1].center.y;
  const startT = clamp(p.branches.start, 0.05, 0.98);
  const endT = clamp(p.branches.end, startT + 0.02, 1);

  for (let i = 0; i < levels; i += 1) {
    const levelFraction = levels === 1 ? 0.6 : i / (levels - 1);
    const t = THREE.MathUtils.lerp(startT, endT, levelFraction);
    const at = sampleLimb(trunk, t);
    const baseCount = Math.round(clamp(p.branches.split, 1, 4));
    const count = Math.max(1, baseCount + (rng.chance(0.3) ? 1 : 0));
    const azimuthBase = i * 2.39996 * 0.72 + rng.range(0, TAU) * 0.35;
    const radialRef = perpendicular(at.tangent);

    for (let j = 0; j < count; j += 1) {
      const azimuth = azimuthBase + (j / count) * TAU + rng.range(-0.45, 0.45);
      const radial = radialRef.clone().applyAxisAngle(at.tangent, azimuth);
      const start = at.center.clone().addScaledVector(radial, at.radius * 0.78);
      const angle = clamp(p.branches.angle + rng.gauss() * p.branches.angleVar, 12, 104) * DEG;
      const direction = at.tangent.clone().multiplyScalar(Math.cos(angle))
        .addScaledVector(radial, Math.sin(angle));
      direction.addScaledVector(UP, p.branches.upBias * 0.42);
      direction.normalize();

      const crownFalloff = 0.62 + 0.38 * Math.pow(1 - levelFraction, 1.4);
      const length = Math.max(
        0.24,
        H * p.branches.reach * crownFalloff * rng.range(0.82, 1.14),
      );
      const radius = Math.max(0.004, at.radius * p.branches.taper);
      growLimb(start, direction, length, radius, 1);
    }
  }

  // Top leader: bends the trunk into a soft apex and carries the crown upward.
  {
    const tip = trunk[trunk.length - 1];
    const leaderDir = tip.tangent.clone();
    const leaderLength = H * 0.16 + 0.6;
    const samples = limbSamples(tip.center.clone(), leaderDir, leaderLength, 6, p, rng, 1);
    const tipRadius = Math.max(0.004, tip.radius * 1.2);
    for (let i = 0; i < samples.length; i += 1) {
      const t = i / (samples.length - 1);
      samples[i].radius = tipRadius * (1 - t * 0.85);
    }
    addTube(barkBuilder, samples, Math.max(4, Math.round(p.trunk.sides) - 2), {
      phase: rng.range(0, TAU),
      lump: p.bark.lumpiness * 0.6,
      colorFn: tintBark,
      vScale: 0.7,
      cap: true,
    });
    grownLimbs.push({ samples, depth: p.branches.depth, length: leaderLength });
  }

  // Foliage pass: outer limbs first so the crown silhouette fills evenly and a
  // global card budget can never leave the top of the tree bare.
  const foliageDepth = 1;
  const foliageLimbs = grownLimbs
    .filter((limb) => limb.depth >= Math.max(1, foliageDepth))
    .sort((a, b) => b.depth - a.depth || b.length - a.length);
  const cardBudget = Math.min(
    MAX_LEAF_CARDS,
    Math.round(MAX_LEAF_CARDS * clamp(p.leaves.density, 0.1, 2.5) * 0.55),
  );
  const needle = p.leaves.style === 'needle';
  const minShare = needle ? 12 : 30;
  // Longer, deeper limbs carry more foliage, so the crown reads as one mass
  // instead of a handful of decorated spikes.
  const weights = foliageLimbs.map((limb) => (
    Math.pow(Math.max(limb.length, 0.05), 1.25) * (1 + Math.max(0, limb.depth - foliageDepth) * 0.22)
  ));
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0) || 1;
  let cumulative = 0;
  for (let i = 0; i < foliageLimbs.length; i += 1) {
    const limb = foliageLimbs[i];
    cumulative += weights[i];
    const target = Math.round((cardBudget * cumulative) / totalWeight);
    const before = stats.leaves;
    stats.leafLimit = Math.min(cardBudget, Math.max(before + minShare, target));
    leafTarget(leafBuilder, limb.samples, limb.depth, p, rng, leafPalette, stats);
  }
  stats.leafLimit = cardBudget;

  const barkGeometry = barkBuilder.toGeometry();
  const leafGeometry = leafBuilder.vertexCount > 0 ? leafBuilder.toGeometry() : null;

  barkGeometry.computeBoundingBox();
  if (leafGeometry) leafGeometry.computeBoundingBox();

  const box = barkGeometry.boundingBox.clone();
  if (leafGeometry) box.union(leafGeometry.boundingBox);
  const size = new THREE.Vector3();
  box.getSize(size);

  const triangles = barkBuilder.triangleCount + leafBuilder.triangleCount;
  const vertices = barkBuilder.vertexCount + leafBuilder.vertexCount;

  return {
    barkGeometry,
    leafGeometry,
    stats: {
      limbs: stats.limbs,
      leaves: stats.leaves,
      triangles,
      vertices,
      height: size.y,
      spread: Math.max(size.x, size.z),
      seed: p.seed,
      species: p.species,
    },
    bounds: box,
    colors: {
      bark: barkB.clone().lerp(barkA, 0.35).getHexString(),
      leaf: new THREE.Color(p.leaves.colorB).getHexString(),
    },
    trunkHeight: trunkLength,
  };
}
