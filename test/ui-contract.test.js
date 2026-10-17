import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { SPECIES } from '../src/generator/params.js';

const root = path.resolve(import.meta.dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const main = fs.readFileSync(path.join(root, 'src/main.js'), 'utf8');
const dom = new JSDOM(html);
const { document } = dom.window;

test('every element main.js looks up exists in index.html', () => {
  const ids = new Set();
  for (const match of main.matchAll(/\$\(\s*'([^']+)'\s*\)/g)) ids.add(match[1]);
  for (const match of main.matchAll(/getElementById\(\s*'([^']+)'\s*\)/g)) ids.add(match[1]);
  assert.ok(ids.size > 20);
  const missing = [...ids].filter((id) => !document.getElementById(id));
  assert.deepEqual(missing, []);
});

test('the markup loads the studio entry point and has no duplicate ids', () => {
  assert.match(html, /src="\/src\/main\.js"/);
  const seen = new Set();
  const duplicates = [];
  document.querySelectorAll('[id]').forEach((node) => {
    const id = node.getAttribute('id');
    if (seen.has(id)) duplicates.push(id);
    seen.add(id);
  });
  assert.deepEqual(duplicates, []);
  assert.equal(document.querySelector('canvas#stage').tagName, 'CANVAS');
});

test('each species in the field guide has a generated thumbnail', () => {
  for (const species of SPECIES) {
    const file = path.join(root, 'public', 'thumbs', `${species.id}.png`);
    assert.ok(fs.existsSync(file), `${species.id} thumbnail is missing`);
    assert.ok(fs.statSync(file).size > 1000, `${species.id} thumbnail looks empty`);
  }
});

test('the app never ships an absolute localhost URL', () => {
  const sources = ['src/main.js', 'src/render/stage.js', 'src/ui/panel.js', 'src/export/exporters.js']
    .map((file) => fs.readFileSync(path.join(root, file), 'utf8'))
    .join('\n');
  assert.doesNotMatch(sources, /https?:\/\/(localhost|127\.0\.0\.1)/);
});
