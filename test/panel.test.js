import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDom } from './helpers/dom.js';
import { ParamPanel } from '../src/ui/panel.js';
import { SCHEMA, GROUPS, presetParams } from '../src/generator/params.js';

test('panel renders every schema parameter grouped, with labels and live values', async () => {
  const dom = createDom();
  const doc = dom.window.document;
  const root = doc.getElementById('params');
  const panel = new ParamPanel(root, {});
  assert.equal(root.querySelectorAll('.param-group').length, GROUPS.length);
  assert.equal(root.querySelectorAll('.param').length, SCHEMA.length);
  for (const def of SCHEMA) {
    const input = doc.getElementById(`param-${def.key}`);
    assert.ok(input, def.key);
    const label = root.querySelector(`label[for="param-${def.key}"]`);
    assert.equal(label.textContent, def.label);
    if (def.type === 'number' || def.type === 'int') {
      assert.equal(input.type, 'range');
      assert.equal(Number(input.min), def.min);
      assert.equal(Number(input.max), def.max);
      assert.equal(Number(input.step), def.step);
    }
  }
  panel.setParams(presetParams('pine'));
  assert.equal(panel.getValue('leafStyle'), 'needle');
  assert.equal(doc.getElementById('param-height-value').textContent, '18.0 m');
});

test('panel writes sanitised values back to state through onChange', async () => {
  const dom = createDom();
  const doc = dom.window.document;
  const changes = [];
  const panel = new ParamPanel(doc.getElementById('params'), { onChange: (k, v, meta) => changes.push([k, v, meta.commit]) });
  const height = doc.getElementById('param-height');
  height.value = '25.5';
  height.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  height.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  assert.deepEqual(changes[0], ['height', 25.5, false]);
  assert.deepEqual(changes[1], ['height', 25.5, true]);
  assert.equal(doc.getElementById('param-height-value').textContent, '25.5 m');

  const depth = doc.getElementById('param-depth');
  depth.value = '999';
  depth.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  assert.deepEqual(changes[2], ['depth', 7, true]);

  const style = doc.getElementById('param-leafStyle');
  style.value = 'needle';
  style.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  assert.deepEqual(changes[3], ['leafStyle', 'needle', true]);

  const color = doc.getElementById('param-barkColor');
  color.value = '#ff0000';
  color.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  assert.deepEqual(changes[4], ['barkColor', '#ff0000', true]);

  panel.markDirty(['height']);
  assert.ok(height.closest('.param').classList.contains('is-dirty'));
  assert.ok(!depth.closest('.param').classList.contains('is-dirty'));
});
