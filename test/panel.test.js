import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeDOM } from './helpers.js';
import { createPanel } from '../src/ui/panel.js';
import { PARAM_LIST, presetParams } from '../src/generator/params.js';

function setup() {
  const dom = makeDOM();
  const doc = dom.window.document;
  const writes = [];
  const commits = [];
  const seeds = [];
  let rolls = 0;
  let resets = 0;
  const panel = createPanel({
    doc,
    root: doc.getElementById('panel-body'),
    onInput: (k, v) => writes.push([k, v]),
    onCommit: (k, v) => commits.push([k, v]),
    onSeedCommit: (v) => seeds.push(v),
    onRollSeed: () => rolls++,
    onReset: () => resets++,
  });
  return { dom, doc, panel, writes, commits, seeds, rolls: () => rolls, resets: () => resets };
}

test('panel builds one control per schema parameter with accessible labels', () => {
  const { doc, panel } = setup();
  for (const spec of PARAM_LIST) {
    const control = panel.getControl(spec.key);
    assert.ok(control, `missing control for ${spec.key}`);
    if (spec.type !== 'choice') {
      const label = [...doc.querySelectorAll('label')].find((l) => l.htmlFor === control.id);
      assert.ok(label, `no label for ${spec.key}`);
    }
  }
  assert.ok(doc.querySelectorAll('details.group').length >= 5);
});

test('range input writes back through onInput while dragging and onCommit on release', () => {
  const { doc, panel, writes, commits } = setup();
  panel.setValues(presetParams('oak'), 1);
  const input = panel.getControl('height');
  input.value = '12.4';
  input.dispatchEvent(new doc.defaultView.Event('input'));
  assert.deepEqual(writes.at(-1), ['height', 12.4]);
  input.dispatchEvent(new doc.defaultView.Event('change'));
  assert.deepEqual(commits.at(-1), ['height', 12.4]);
  const out = input.parentElement.querySelector('output');
  assert.match(out.textContent, /12\.4/);
});

test('choice radios and colour swatches write back', () => {
  const { doc, panel, commits } = setup();
  panel.setValues(presetParams('oak'), 1);
  const pine = doc.getElementById(`${doc.querySelector('fieldset.choice').querySelector('input').name}-needle`);
  pine.checked = true;
  pine.dispatchEvent(new doc.defaultView.Event('change'));
  assert.deepEqual(commits.at(-1), ['leafStyle', 'needle']);
  const swatch = panel.getControl('barkColor');
  swatch.value = '#112233';
  swatch.dispatchEvent(new doc.defaultView.Event('change'));
  assert.deepEqual(commits.at(-1), ['barkColor', '#112233']);
});

test('setValues reflects state without firing write callbacks', () => {
  const { panel, writes, commits } = setup();
  panel.setValues({ ...presetParams('birch'), height: 20, leafStyle: 'droop', barkColor: '#101010' }, 555);
  assert.equal(panel.getControl('height').value, '20');
  assert.equal(panel.getSeedInput().value, '555');
  assert.equal(writes.length, 0);
  assert.equal(commits.length, 0);
});

test('seed and dice/reset buttons call their handlers', () => {
  const { doc, panel, seeds, rolls, resets } = setup();
  panel.setValues(presetParams('oak'), 9);
  const seed = panel.getSeedInput();
  seed.value = '4242';
  seed.dispatchEvent(new doc.defaultView.Event('change'));
  assert.deepEqual(seeds, ['4242']);
  doc.querySelector('[data-action="roll"]').click();
  doc.querySelector('[data-action="reset"]').click();
  assert.equal(rolls(), 1);
  assert.equal(resets(), 1);
});
