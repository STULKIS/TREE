/**
 * Generation worker. Receives `{ id, design, quality }`, replies with the
 * generated tree, transferring the typed arrays rather than copying them.
 */
import { generateTree } from './tree.js';
import { transferablesOf } from './mesh.js';

self.onmessage = (event) => {
  const { id, design, quality } = event.data || {};
  try {
    const tree = generateTree(design, quality);
    const transfer = [...transferablesOf(tree.bark), ...transferablesOf(tree.foliage)];
    self.postMessage({ id, ok: true, tree }, transfer);
  } catch (error) {
    self.postMessage({ id, ok: false, error: String((error && error.message) || error) });
  }
};
