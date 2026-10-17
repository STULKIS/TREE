import * as THREE from 'three';

const TAU = Math.PI * 2;
const scratchAxis = ['x', 'y', 'z'];

export class MeshBuilder {
  constructor() {
    this.positions = [];
    this.normals = [];
    this.uvs = [];
    this.colors = [];
    this.indices = [];
  }

  get vertexCount() {
    return this.positions.length / 3;
  }

  get triangleCount() {
    return this.indices.length / 3;
  }

  addVertex(x, y, z, u, v, color) {
    this.positions.push(x, y, z);
    this.uvs.push(u, v);
    this.colors.push(color.r, color.g, color.b);
    return this.positions.length / 3 - 1;
  }

  addTriangle(a, b, c) {
    this.indices.push(a, b, c);
  }

  addQuad(a, b, c, d) {
    this.indices.push(a, b, d, b, c, d);
  }

  toGeometry() {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(this.uvs, 2));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(this.colors, 3));
    geometry.setIndex(this.indices);
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
  }
}

/** Returns any unit vector perpendicular to v. */
export function perpendicular(v) {
  let best = 0;
  let bestDot = Infinity;
  for (let i = 0; i < 3; i += 1) {
    const dot = Math.abs(v[scratchAxis[i]]);
    if (dot < bestDot) {
      bestDot = dot;
      best = i;
    }
  }
  const axis = new THREE.Vector3();
  axis[scratchAxis[best]] = 1;
  return new THREE.Vector3().crossVectors(v, axis).normalize();
}

/**
 * Parallel-transport frames along a polyline. Avoids the twisting that
 * naive "cross(tangent, up)" frames produce on curving limbs.
 */
export function computeFrames(centers) {
  const count = centers.length;
  const tangents = centers.map((center, index) => {
    const prev = centers[Math.max(0, index - 1)];
    const next = centers[Math.min(count - 1, index + 1)];
    const tangent = next.clone().sub(prev);
    if (tangent.lengthSq() < 1e-10) tangent.set(0, 1, 0);
    return tangent.normalize();
  });

  const normals = new Array(count);
  let normal = perpendicular(tangents[0]);
  normals[0] = normal;

  for (let i = 1; i < count; i += 1) {
    const q = new THREE.Quaternion().setFromUnitVectors(tangents[i - 1], tangents[i]);
    normal = normal.clone().applyQuaternion(q);
    normal.addScaledVector(tangents[i], -normal.dot(tangents[i]));
    if (normal.lengthSq() < 1e-8) normal = perpendicular(tangents[i]);
    normal.normalize();
    normals[i] = normal;
  }

  return centers.map((center, i) => ({
    tangent: tangents[i],
    normal: normals[i],
    binormal: new THREE.Vector3().crossVectors(tangents[i], normals[i]).normalize(),
  }));
}

/**
 * Adds a tapered tube (a limb) to a MeshBuilder.
 *
 * samples: [{ center: Vector3, radius: number }]
 * colorFn(t, sample, angleFraction, color): mutate `color`
 */
export function addTube(builder, samples, sides, options) {
  const count = samples.length;
  if (count < 2) return;

  const frames = computeFrames(samples.map((sample) => sample.center));
  const color = new THREE.Color(1, 1, 1);
  const ringStarts = new Array(count);
  const phase = options.phase || 0;
  const lump = options.lump || 0;
  const colorFn = options.colorFn;
  const vScale = options.vScale || 1;
  let distance = 0;

  for (let i = 0; i < count; i += 1) {
    const sample = samples[i];
    const frame = frames[i];
    const t = i / (count - 1);
    if (i > 0) distance += samples[i].center.distanceTo(samples[i - 1].center);
    ringStarts[i] = builder.vertexCount;

    for (let j = 0; j < sides; j += 1) {
      const angle = (j / sides) * TAU;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);

      let wobble = 1;
      if (lump > 0) {
        wobble +=
          lump *
          (0.5 * Math.sin(angle * 3 + phase + t * 7.5) +
            0.28 * Math.sin(angle * 7 - phase * 0.6 + t * 3.1));
        wobble *= 1 - lump * 0.18 * t;
      }
      const radius = sample.radius * wobble;

      const px = sample.center.x + (frame.normal.x * cos + frame.binormal.x * sin) * radius;
      const py = sample.center.y + (frame.normal.y * cos + frame.binormal.y * sin) * radius;
      const pz = sample.center.z + (frame.normal.z * cos + frame.binormal.z * sin) * radius;

      if (colorFn) colorFn(t, sample, j / sides, color);
      builder.addVertex(px, py, pz, j / sides, distance * vScale, color);
    }
  }

  for (let i = 0; i < count - 1; i += 1) {
    const lower = ringStarts[i];
    const upper = ringStarts[i + 1];
    for (let j = 0; j < sides; j += 1) {
      const j2 = (j + 1) % sides;
      builder.addQuad(lower + j, lower + j2, upper + j2, upper + j);
    }
  }

  if (options.cap !== false) {
    const last = samples[count - 1];
    const frame = frames[count - 1];
    const apex = last.center.clone().addScaledVector(frame.tangent, last.radius * 1.4);
    if (colorFn) colorFn(1, last, 0, color);
    const tipIndex = builder.addVertex(apex.x, apex.y, apex.z, 0.5, distance * vScale, color);
    const tipRing = builder.vertexCount;
    for (let j = 0; j < sides; j += 1) {
      const angle = (j / sides) * TAU;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const radius = last.radius;
      if (colorFn) colorFn(1, last, j / sides, color);
      builder.addVertex(
        last.center.x + (frame.normal.x * cos + frame.binormal.x * sin) * radius,
        last.center.y + (frame.normal.y * cos + frame.binormal.y * sin) * radius,
        last.center.z + (frame.normal.z * cos + frame.binormal.z * sin) * radius,
        0.5,
        distance * vScale,
        color,
      );
    }
    for (let j = 0; j < sides; j += 1) {
      builder.addTriangle(tipRing + j, tipRing + ((j + 1) % sides), tipIndex);
    }
  }
}
