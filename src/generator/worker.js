/**
 * Generation worker. Keeps parameter dragging smooth: the heavy recursive
 * growth happens off the main thread and only typed arrays cross the boundary.
 */
import { generateTree } from './tree.js';
import { clone, makeParams } from './params.js';
import { packGeometry } from './transfer.js';

self.onmessage = (event) => {
  const { id, params, quality } = event.data;
  try {
    const p = makeParams(params.species, params.seed);
    Object.assign(p, clone(params));
    const tree = generateTree(p);
    const bark = packGeometry(tree.barkGeometry);
    const leaf = packGeometry(tree.leafGeometry);
    const bounds = tree.bounds;
    const payload = {
      id,
      quality,
      bark,
      leaf,
      stats: tree.stats,
      bounds: [bounds.min.x, bounds.min.y, bounds.min.z, bounds.max.x, bounds.max.y, bounds.max.z],
      trunkHeight: tree.trunkHeight,
    };
    const transfer = [];
    if (bark) transfer.push(...bark.transfer);
    if (leaf) transfer.push(...leaf.transfer);
    self.postMessage(payload, transfer);
  } catch (error) {
    self.postMessage({ id, error: error.message });
  }
};
