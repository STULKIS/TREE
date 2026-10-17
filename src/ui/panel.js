// Schema-driven parameter panel. Built entirely from SCHEMA, so adding a parameter to the
// schema adds a control here with no UI changes. Writes go through callbacks, never globals.
import { SCHEMA, PARAM_SPEC } from '../generator/params.js';

let uid = 0;

function formatValue(spec, v) {
  if (spec.type === 'color') return String(v).toUpperCase();
  if (spec.type === 'choice') return spec.options.find((o) => o.value === v)?.label ?? String(v);
  const decimals = spec.type === 'integer' ? 0 : (String(spec.step).split('.')[1] || '').length;
  return Number(v).toFixed(decimals) + (spec.unit && spec.unit !== '°' && spec.unit !== '×' ? ` ${spec.unit}` : spec.unit);
}

/**
 * @param {object} opts
 * @param {Document} opts.doc
 * @param {HTMLElement} opts.root
 * @param {(key:string, value:any) => void} opts.onInput   while dragging (preview quality)
 * @param {(key:string, value:any) => void} opts.onCommit  on release (studio quality)
 */
export function createPanel({ doc, root, onInput = () => {}, onCommit = () => {}, onSeedInput = () => {}, onSeedCommit = () => {}, onRollSeed = () => {}, onReset = () => {} }) {
  const controls = new Map();
  const outputs = new Map();
  const id = `p${++uid}`;

  const seedWrap = doc.createElement('div');
  seedWrap.className = 'seed-row';
  seedWrap.innerHTML = `
    <label for="${id}-seed">Seed</label>
    <div class="seed-controls">
      <input id="${id}-seed" name="seed" type="number" inputmode="numeric" min="0" max="4294967295" step="1" />
      <button type="button" class="icon-btn" data-action="roll" aria-label="Roll a new seed" title="Roll a new seed (D)">
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1.4"/><circle cx="16" cy="16" r="1.4"/><circle cx="12" cy="12" r="1.4"/></svg>
      </button>
      <button type="button" class="text-btn" data-action="reset">Reset parameters</button>
    </div>`;
  root.append(seedWrap);
  const seedInput = seedWrap.querySelector('input');
  seedInput.addEventListener('input', () => onSeedInput(seedInput.value));
  seedInput.addEventListener('change', () => onSeedCommit(seedInput.value));
  seedWrap.querySelector('[data-action="roll"]').addEventListener('click', () => onRollSeed());
  seedWrap.querySelector('[data-action="reset"]').addEventListener('click', () => onReset());

  for (const group of SCHEMA) {
    const details = doc.createElement('details');
    details.className = 'group';
    details.open = group.id !== 'mesh';
    const summary = doc.createElement('summary');
    summary.textContent = group.title;
    details.append(summary);
    const body = doc.createElement('div');
    body.className = 'group-body';
    details.append(body);

    for (const spec of group.params) {
      const row = doc.createElement('div');
      row.className = `field field-${spec.type}`;
      const fid = `${id}-${spec.key}`;
      if (spec.type === 'choice') {
        const fs = doc.createElement('fieldset');
        fs.className = 'choice';
        const legend = doc.createElement('legend');
        legend.textContent = spec.label;
        fs.append(legend);
        const list = doc.createElement('div');
        list.className = 'segmented';
        const radios = [];
        for (const opt of spec.options) {
          const rid = `${fid}-${opt.value}`;
          const input = doc.createElement('input');
          input.type = 'radio';
          input.name = fid;
          input.id = rid;
          input.value = opt.value;
          const lab = doc.createElement('label');
          lab.htmlFor = rid;
          lab.textContent = opt.label;
          input.addEventListener('change', () => {
            if (input.checked) onCommit(spec.key, opt.value);
          });
          list.append(input, lab);
          radios.push(input);
        }
        fs.append(list);
        row.append(fs);
        controls.set(spec.key, { type: 'choice', radios, el: fs });
      } else if (spec.type === 'color') {
        const label = doc.createElement('label');
        label.htmlFor = fid;
        label.textContent = spec.label;
        const input = doc.createElement('input');
        input.type = 'color';
        input.id = fid;
        input.className = 'swatch';
        const out = doc.createElement('output');
        out.htmlFor = fid;
        outputs.set(spec.key, out);
        input.addEventListener('input', () => { out.textContent = input.value.toUpperCase(); onInput(spec.key, input.value); });
        input.addEventListener('change', () => onCommit(spec.key, input.value));
        const line = doc.createElement('div');
        line.className = 'line';
        line.append(label, input, out);
        row.append(line);
        controls.set(spec.key, { type: 'color', input });
      } else {
        const label = doc.createElement('label');
        label.htmlFor = fid;
        label.textContent = spec.label;
        const input = doc.createElement('input');
        input.type = 'range';
        input.id = fid;
        input.min = String(spec.min);
        input.max = String(spec.max);
        input.step = String(spec.step);
        input.setAttribute('aria-valuetext', '');
        const out = doc.createElement('output');
        out.htmlFor = fid;
        out.setAttribute('aria-live', 'off');
        outputs.set(spec.key, out);
        const read = () => Number(input.value);
        input.addEventListener('input', () => {
          out.textContent = formatValue(spec, read());
          input.setAttribute('aria-valuetext', out.textContent);
          onInput(spec.key, read());
        });
        input.addEventListener('change', () => onCommit(spec.key, read()));
        const line = doc.createElement('div');
        line.className = 'line';
        line.append(label, out);
        if (spec.hint) {
          const hint = doc.createElement('p');
          hint.className = 'hint';
          hint.id = `${fid}-hint`;
          hint.textContent = spec.hint;
          input.setAttribute('aria-describedby', hint.id);
          row.append(line, input, hint);
        } else {
          row.append(line, input);
        }
        controls.set(spec.key, { type: spec.type, input });
      }
      body.append(row);
    }
    root.append(details);
  }

  return {
    /** Reflect a design into every control without firing change callbacks. */
    setValues(params, seed) {
      if (seed !== undefined) seedInput.value = String(seed);
      for (const [key, value] of Object.entries(params)) {
        const c = controls.get(key);
        if (!c) continue;
        const spec = PARAM_SPEC[key];
        if (c.type === 'choice') {
          for (const r of c.radios) r.checked = r.value === value;
        } else if (c.type === 'color') {
          c.input.value = value;
          outputs.get(key).textContent = String(value).toUpperCase();
        } else {
          c.input.value = String(value);
          const out = outputs.get(key);
          out.textContent = formatValue(spec, value);
          c.input.setAttribute('aria-valuetext', out.textContent);
        }
      }
    },
    getSeedInput: () => seedInput,
    getControl: (key) => {
      const c = controls.get(key);
      return c ? (c.input ?? c.el ?? null) : null;
    },
    get keys() { return [...controls.keys()]; },
  };
}
