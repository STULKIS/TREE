/**
 * Tiny DOM control kit. No framework — every control is a plain element that
 * reports changes through callbacks.
 */

const CHEVRON = `
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <path d="M9 6l6 6-6 6" />
  </svg>`;

const RESET = `
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
    <path d="M4 10a8 8 0 1 1 2 6.5" />
    <path d="M4 4v6h6" />
  </svg>`;

export function el(tag, className, html) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (html != null) node.innerHTML = html;
  return node;
}

export function createSection({ title, hint, onReset, open = false }) {
  const group = el('section', `group${open ? ' is-open' : ''}`);
  const head = el('header', 'group-head');

  const toggle = el(
    'button',
    'group-toggle',
    `${CHEVRON}<span class="group-title">${title}</span><span class="group-hint">${hint || ''}</span>`,
  );
  toggle.type = 'button';
  toggle.setAttribute('aria-expanded', String(open));

  const reset = el('button', 'group-reset', RESET);
  reset.type = 'button';
  reset.title = `Reset ${title.toLowerCase()} to preset`;
  reset.setAttribute('aria-label', `Reset ${title.toLowerCase()}`);

  head.append(toggle, reset);
  const body = el('div', 'group-body');
  group.append(head, body);

  const setOpen = (value) => {
    group.classList.toggle('is-open', value);
    toggle.setAttribute('aria-expanded', String(value));
  };

  toggle.addEventListener('click', () => setOpen(!group.classList.contains('is-open')));
  reset.addEventListener('click', (event) => {
    event.stopPropagation();
    onReset?.();
  });

  return {
    group,
    body,
    open: () => setOpen(true),
    setHint: (value) => {
      head.querySelector('.group-hint').textContent = value;
    },
  };
}

export function createSlider({
  label,
  value,
  min,
  max,
  step = 0.01,
  unit = '',
  decimals = 0,
  hint = '',
  onInput,
  onCommit,
}) {
  const wrap = el('div', 'control');
  const head = el('div', 'control-head');
  const labelNode = el('label', null, label);
  const output = el('output');
  head.append(labelNode, output);
  wrap.append(head);

  const input = document.createElement('input');
  input.type = 'range';
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.id = `ctrl-${Math.random().toString(36).slice(2, 8)}`;
  labelNode.htmlFor = input.id;
  if (hint) labelNode.title = hint;
  wrap.append(input);

  const format = (v) => {
    const number = decimals > 0 ? Number(v).toFixed(decimals) : String(Math.round(Number(v)));
    return `${number}${unit ? `<em>${unit}</em>` : ''}`;
  };

  const paint = (v) => {
    output.innerHTML = format(v);
    const pct = ((Number(v) - min) / (max - min || 1)) * 100;
    input.style.setProperty('--fill', `${Math.min(100, Math.max(0, pct))}%`);
  };

  input.value = String(value);
  paint(value);

  input.addEventListener('input', () => {
    paint(input.value);
    onInput?.(Number(input.value));
  });
  input.addEventListener('change', () => onCommit?.(Number(input.value)));

  return {
    node: wrap,
    set(valueToSet) {
      input.value = String(valueToSet);
      paint(valueToSet);
    },
    get() {
      return Number(input.value);
    },
  };
}

export function createSegmented({ label, options, value, onChange }) {
  const wrap = el('div', 'control');
  const head = el('div', 'control-head');
  head.append(el('label', null, label));
  wrap.append(head);

  const bar = el('div', 'segmented');
  const buttons = options.map((option) => {
    const button = el('button', null, option.label);
    button.type = 'button';
    button.dataset.value = option.value;
    if (option.title) button.title = option.title;
    button.classList.toggle('is-active', option.value === value);
    button.addEventListener('click', () => {
      buttons.forEach((b) => b.classList.toggle('is-active', b === button));
      onChange?.(option.value);
    });
    bar.append(button);
    return button;
  });
  wrap.append(bar);

  return {
    node: wrap,
    set(next) {
      buttons.forEach((button) => button.classList.toggle('is-active', button.dataset.value === next));
    },
  };
}

export function createColorSet({ label, note, colors, onChange }) {
  const wrap = el('div', 'control');
  const head = el('div', 'control-head');
  head.append(el('label', null, label));
  if (note) head.append(el('span', 'control-note', note));
  wrap.append(head);

  const row = el('div', 'swatches');
  const stops = [];
  const spectrum = el('div', 'spectrum');

  colors.forEach(([key, sublabel], index) => {
    const holder = el('label', 'swatch-label');
    const swatch = el('span', 'swatch');
    swatch.style.setProperty('--swatch', colors[index][2]);
    const input = document.createElement('input');
    input.type = 'color';
    input.value = colors[index][2];
    input.setAttribute('aria-label', `${label} ${sublabel}`);
    swatch.append(input);
    holder.append(swatch, el('span', null, sublabel));
    row.append(holder);
    stops.push({ key, input, swatch });

    input.addEventListener('input', () => {
      swatch.style.setProperty('--swatch', input.value);
      onChange?.(key, input.value);
      paintSpectrum();
    });
  });

  const paintSpectrum = () => {
    const values = stops.map((stop) => stop.input.value).join(', ');
    spectrum.style.background = `linear-gradient(90deg, ${values})`;
  };

  wrap.append(row, spectrum);
  paintSpectrum();

  return {
    node: wrap,
    set(value) {
      stops.forEach((stop) => {
        const next = value[stop.key];
        if (next) {
          stop.input.value = next;
          stop.swatch.style.setProperty('--swatch', next);
        }
      });
      paintSpectrum();
    },
  };
}
