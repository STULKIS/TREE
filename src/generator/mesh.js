/**
 * Growable indexed mesh buffer. Collects positions / normals / colours / uvs /
 * indices into plain JS arrays and finalises into typed arrays that can be
 * transferred out of a worker with zero copies.
 */
export class MeshBuilder {
  constructor() {
    this.positions = [];
    this.normals = [];
    this.colors = [];
    this.uvs = [];
    this.indices = [];
    this.vertexCount = 0;
  }

  vertex(p, n, c, uv) {
    this.positions.push(p[0], p[1], p[2]);
    this.normals.push(n[0], n[1], n[2]);
    this.colors.push(c[0], c[1], c[2]);
    this.uvs.push(uv[0], uv[1]);
    return this.vertexCount++;
  }

  triangle(a, b, c) {
    this.indices.push(a, b, c);
  }

  get triangleCount() {
    return this.indices.length / 3;
  }

  /** Finalise into transferable typed arrays with bounds. */
  finish() {
    const positions = new Float32Array(this.positions);
    const normals = new Float32Array(this.normals);
    const colors = new Float32Array(this.colors);
    const uvs = new Float32Array(this.uvs);
    const indices = this.vertexCount > 65535 ? new Uint32Array(this.indices) : new Uint16Array(this.indices);
    return { positions, normals, colors, uvs, indices, bounds: computeBounds(positions) };
  }
}

export function computeBounds(positions) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      const v = positions[i + k];
      if (v < min[k]) min[k] = v;
      if (v > max[k]) max[k] = v;
    }
  }
  if (!Number.isFinite(min[0])) {
    return { min: [0, 0, 0], max: [0, 0, 0] };
  }
  return { min, max };
}

export function mergeBounds(a, b) {
  return {
    min: [Math.min(a.min[0], b.min[0]), Math.min(a.min[1], b.min[1]), Math.min(a.min[2], b.min[2])],
    max: [Math.max(a.max[0], b.max[0]), Math.max(a.max[1], b.max[1]), Math.max(a.max[2], b.max[2])]
  };
}

/** Geometry buffers that can be moved across a worker boundary. */
export function transferablesOf(geometry) {
  return [geometry.positions.buffer, geometry.normals.buffer, geometry.colors.buffer, geometry.uvs.buffer, geometry.indices.buffer];
}
