/**
 * Tiny allocation-light 3-vector helpers on plain arrays `[x, y, z]`.
 * Kept dependency-free so the worker bundle stays small.
 */

export const v3 = (x = 0, y = 0, z = 0) => [x, y, z];
export const copy = (a) => [a[0], a[1], a[2]];
export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const addScaled = (a, b, s) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0]
];
export const length = (a) => Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]);
export const distance = (a, b) => length(sub(a, b));

export function normalize(a) {
  const l = length(a);
  if (l < 1e-12) return [0, 1, 0];
  return [a[0] / l, a[1] / l, a[2] / l];
}

export const lerp = (a, b, t) => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t
];

/** Rotate vector `v` around unit axis `k` by angle (Rodrigues). */
export function rotateAround(v, k, angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const kv = cross(k, v);
  const kd = dot(k, v);
  return [
    v[0] * c + kv[0] * s + k[0] * kd * (1 - c),
    v[1] * c + kv[1] * s + k[1] * kd * (1 - c),
    v[2] * c + kv[2] * s + k[2] * kd * (1 - c)
  ];
}

/** Any unit vector perpendicular to `d` (deterministic choice). */
export function perpendicular(d) {
  const ax = Math.abs(d[0]);
  const ay = Math.abs(d[1]);
  const az = Math.abs(d[2]);
  let ref;
  if (ax <= ay && ax <= az) ref = [1, 0, 0];
  else if (ay <= az) ref = [0, 1, 0];
  else ref = [0, 0, 1];
  return normalize(cross(d, ref));
}

/**
 * Parallel-transport a normal from tangent `t0` to tangent `t1` (both unit).
 * Rotates `n` by the minimal rotation taking t0 to t1 so the frame never twists.
 */
export function transportNormal(n, t0, t1) {
  const axis = cross(t0, t1);
  const al = length(axis);
  if (al < 1e-9) return n;
  const c = Math.max(-1, Math.min(1, dot(t0, t1)));
  const angle = Math.atan2(al, c);
  return rotateAround(n, scale(axis, 1 / al), angle);
}

/**
 * Compute parallel transport frames for a polyline.
 * @param {number[][]} points
 * @returns {{tangents:number[][], normals:number[][], binormals:number[][]}}
 */
export function parallelTransportFrames(points, initialNormal) {
  const n = points.length;
  const tangents = new Array(n);
  for (let i = 0; i < n; i++) {
    const a = points[Math.max(0, i - 1)];
    const b = points[Math.min(n - 1, i + 1)];
    let t = sub(b, a);
    if (length(t) < 1e-9) t = i > 0 ? tangents[i - 1] : [0, 1, 0];
    tangents[i] = normalize(t);
  }
  const normals = new Array(n);
  const binormals = new Array(n);
  let nrm = initialNormal ? normalize(initialNormal) : perpendicular(tangents[0]);
  // Re-orthogonalise against the first tangent in case the caller passed a sloppy normal.
  nrm = normalize(sub(nrm, scale(tangents[0], dot(nrm, tangents[0]))));
  if (!Number.isFinite(nrm[0])) nrm = perpendicular(tangents[0]);
  normals[0] = nrm;
  binormals[0] = normalize(cross(tangents[0], nrm));
  for (let i = 1; i < n; i++) {
    nrm = transportNormal(nrm, tangents[i - 1], tangents[i]);
    nrm = normalize(sub(nrm, scale(tangents[i], dot(nrm, tangents[i]))));
    normals[i] = nrm;
    binormals[i] = normalize(cross(tangents[i], nrm));
  }
  return { tangents, normals, binormals };
}

export const smoothstep = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
export const easeOutCubic = (t) => 1 - Math.pow(1 - Math.max(0, Math.min(1, t)), 3);
