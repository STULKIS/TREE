/**
 * Schema-driven parameter panel. Builds grouped controls from `SCHEMA`, shows
 * live values, and writes sanitised values back through an `onChange` callback.
 */
import { groupedSchema, sanitizeValue, SCHEMA_BY_KEY } from '../generator/params.js';

function formatValue(def, value) {
  if (def.type === 'color' || def.type === 'select') return String(value);
  const step = def.step || 1;
  const decimals = step >= 1 ? 0 : Math.min(3, Math.ceil(-Math.log10(step)));
  const text = Number(value).toFixed(decimals);
  return def.unit ? `${text} ${def.unit}` : text;
}

export class ParamPanel {
  /**
   * @param {HTMLElement} root container
   * @param {object} options `{ onChange(key, value, { commit }), onReset() }`
   */
  constructor(root, options = {}) {
    this.root = root;
    this.doc = root.ownerDocument;
    this.onChange = options.onChange || (() => {});
    this.onReset = options.onReset || (() => {});
    this.controls = new Map();
    this.openGroups = new Set(options.openGroups || ['Trunk', 'Branches', 'Leaves']);
    this.build();
  }

  build() {
    const d = this.doc;
    this.root.innerHTML = '';
    this.root.classList.add('param-panel');
    for (const { group, items } of groupedSchema()) {
      const details = d.createElement('details');
      details.className = 'param-group';
      details.dataset.group = group;
      if (this.openGroups.has(group)) details.open = true;
      const summary = d.createElement('summary');
      summary.innerHTML = `<span>${group}</span><span class="param-group__count">${items.length}</span>`;
      details.appendChild(summary);
      const body = d.createElement('div');
      body.className = 'param-group__body';
      for (const def of items) body.appendChild(this.buildControl(def));
      details.appendChild(body);
      this.root.appendChild(details);
    }
  }

  buildControl(def) {
    const d = this.doc;
    const row = d.createElement('div');
    row.className = `param param--${def.type}`;
    row.dataset.key = def.key;
    const id = `param-${def.key}`;
    const label = d.createElement('label');
    label.className = 'param__label';
    label.htmlFor = id;
    label.textContent = def.label;
    const value = d.createElement('output');
    value.className = 'param__value';
    value.htmlFor = id;
    value.setAttribute('aria-live', 'off');
    let input;
    if (def.type === 'number' || def.type === 'int') {
      input = d.createElement('input');
      input.type = 'range';
      input.min = String(def.min);
      input.max = String(def.max);
      input.step = String(def.step);
      input.value = String(def.default);
      input.addEventListener('input', () => {
        const v = sanitizeValue(def.key, input.value);
        value.textContent = formatValue(def, v);
        this.onChange(def.key, v, { commit: false });
      });
      input.addEventListener('change', () => {
        const v = sanitizeValue(def.key, input.value);
        value.textContent = formatValue(def, v);
        this.onChange(def.key, v, { commit: true });
      });
    } else if (def.type === 'select') {
      input = d.createElement('select');
      for (const opt of def.options) {
        const o = d.createElement('option');
        o.value = opt;
        o.textContent = opt;
        input.appendChild(o);
      }
      input.value = def.default;
      input.addEventListener('change', () => {
        const v = sanitizeValue(def.key, input.value);
        this.onChange(def.key, v, { commit: true });
      });
    } else {
      input = d.createElement('input');
      input.type = 'color';
      input.value = def.default;
      input.addEventListener('input', () => {
        const v = sanitizeValue(def.key, input.value);
        value.textContent = formatValue(def, v);
        this.onChange(def.key, v, { commit: false });
      });
      input.addEventListener('change', () => {
        const v = sanitizeValue(def.key, input.value);
        value.textContent = formatValue(def, v);
        this.onChange(def.key, v, { commit: true });
      });
    }
    input.id = id;
    input.name = def.key;
    input.className = 'param__input';
    input.setAttribute('aria-describedby', `${id}-value`);
    value.id = `${id}-value`;
    value.textContent = formatValue(def, def.default);
    const head = d.createElement('div');
    head.className = 'param__head';
    head.appendChild(label);
    if (def.type !== 'select') head.appendChild(value);
    row.appendChild(head);
    row.appendChild(input);
    this.controls.set(def.key, { def, input, value });
    return row;
  }

  /** Push a full params object into the controls without emitting change events. */
  setParams(params) {
    for (const [key, ctl] of this.controls) {
      if (!(key in params)) continue;
      const v = params[key];
      ctl.input.value = String(v);
      ctl.value.textContent = formatValue(ctl.def, v);
    }
  }

  /** Mark controls that differ from the preset. */
  markDirty(dirtyKeys) {
    const set = new Set(dirtyKeys);
    for (const [key, ctl] of this.controls) {
      ctl.input.closest('.param').classList.toggle('is-dirty', set.has(key));
    }
  }

  getValue(key) {
    const ctl = this.controls.get(key);
    return ctl ? sanitizeValue(key, ctl.input.value) : SCHEMA_BY_KEY[key]?.default;
  }

  focusFirst() {
    const first = this.root.querySelector('input, select');
    if (first) first.focus();
  }
}
