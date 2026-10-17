import * as THREE from 'three';

/**
 * Geometry marshalling between the generation worker and the main thread.
 * Only typed arrays cross the boundary; the worker transfers their buffers.
 */

export function packGeometry(geometry) {
  if (!geometry) return null;
  const { position, normal, uv, color } = geometry.attributes;
  const index = geometry.index;
  return {
    position: position.array,
    normal: normal.array,
    uv: uv.array,
    color: color.array,
    index: index.array,
    transfer: [position.array.buffer, normal.array.buffer, uv.array.buffer, color.array.buffer, index.array.buffer],
  };
}

export function unpackGeometry(data) {
  if (!data) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(data.position, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(data.normal, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(data.uv, 2));
  geometry.setAttribute('color', new THREE.BufferAttribute(data.color, 3));
  geometry.setIndex(new THREE.BufferAttribute(data.index, 1));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}
