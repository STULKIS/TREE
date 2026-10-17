import {
  createColorSet,
  createSection,
  createSegmented,
  createSlider,
  el,
} from './controls.js';
import { clone, SPECIES_BY_ID } from '../generator/params.js';

/**
 * Builds the parameter panel from a schema, and keeps it in sync when a preset
 * is loaded. `getParams()` always returns the current params object.
 */
export function buildPanel({
  container,
  getParams,
  getPreset,
  onChange,
  onResetChange,
  quality = 'studio',
  onQuality,
}) {
  container.innerHTML = '';
  const params = getParams();
  const preset = getPreset();

  const controls = {};

  const commit = (mutate) => {
    mutate(params);
    onChange?.(params);
  };

  const release = () => {
    onResetChange?.(params);
  };

  const sections = {};

  // ---- trunk -------------------------------------------------------------
  {
    const section = createSection({
      title: 'Trunk',
      hint: `${params.trunk.height.toFixed(1)} m · ⌀ ${(params.trunk.radius * 2).toFixed(2)} m`,
      open: true,
      onReset: () => {
        params.trunk = clone(preset.trunk);
        onResetChange?.(params);
      },
    });
    sections.trunk = section;

    const height = createSlider({
      label: 'Height',
      value: params.trunk.height,
      min: 2,
      max: 22,
      step: 0.1,
      unit: 'm',
      decimals: 1,
      onInput: (v) => {
        commit((p) => {
          p.trunk.height = v;
        });
        section.setHint(`${v.toFixed(1)} m · ⌀ ${(params.trunk.radius * 2).toFixed(2)} m`);
      },
      onCommit: release,
    });
    const radius = createSlider({
      label: 'Thickness',
      value: params.trunk.radius,
      min: 0.04,
      max: 1.6,
      step: 0.01,
      unit: 'm',
      decimals: 2,
      hint: 'Radius at breast height, before the base flare.',
      onInput: (v) => {
        commit((p) => {
          p.trunk.radius = v;
        });
        section.setHint(`${params.trunk.height.toFixed(1)} m · ⌀ ${(v * 2).toFixed(2)} m`);
      },
      onCommit: release,
    });
    const flare = createSlider({
      label: 'Base flare',
      value: params.trunk.flare,
      min: 0,
      max: 1.6,
      step: 0.01,
      decimals: 2,
      hint: 'How far the trunk foot spreads into the soil.',
      onInput: (v) => commit((p) => {
        p.trunk.flare = v;
      }),
      onCommit: release,
    });
    const lean = createSlider({
      label: 'Lean',
      value: params.trunk.lean,
      min: 0,
      max: 18,
      step: 0.5,
      unit: '°',
      decimals: 0,
      onInput: (v) => commit((p) => {
        p.trunk.lean = v;
      }),
      onCommit: release,
    });
    const wobble = createSlider({
      label: 'Character',
      value: params.trunk.wobble,
      min: 0,
      max: 1.2,
      step: 0.01,
      decimals: 2,
      hint: 'Organic wobble along the trunk.',
      onInput: (v) => commit((p) => {
        p.trunk.wobble = v;
      }),
      onCommit: release,
    });
    const sides = createSlider({
      label: 'Trunk resolution',
      value: params.trunk.sides,
      min: 5,
      max: 20,
      step: 1,
      hint: 'Radial segments around the trunk.',
      onInput: (v) => commit((p) => {
        p.trunk.sides = v;
      }),
      onCommit: release,
    });

    controls.trunk = { height, radius, flare, lean, wobble, sides };

    section.body.append(
      height.node,
      radius.node,
      flare.node,
      lean.node,
      wobble.node,
      sides.node,
    );
    container.append(section.group);
  }

  // ---- roots -------------------------------------------------------------
  {
    const section = createSection({
      title: 'Root flare',
      hint: `${params.roots.count} roots`,
      onReset: () => {
        params.roots = clone(preset.roots);
        onResetChange?.(params);
      },
    });
    const rootHint = (value) => `${Math.round(value)} ${Math.round(value) === 1 ? 'root' : 'roots'}`;
    const count = createSlider({
      label: 'Surface roots',
      value: params.roots.count,
      min: 0,
      max: 8,
      step: 1,
      onInput: (v) => {
        commit((p) => {
          p.roots.count = v;
        });
        section.setHint(rootHint(v));
      },
      onCommit: release,
    });
    const reach = createSlider({
      label: 'Reach',
      value: params.roots.reach,
      min: 0.1,
      max: 2.4,
      step: 0.01,
      decimals: 2,
      onInput: (v) => commit((p) => {
        p.roots.reach = v;
      }),
      onCommit: release,
    });
    controls.roots = { count, reach };
    section.body.append(count.node, reach.node, el('p', 'control-note', 'Roots arc out of the trunk and dive just below the soil line.'));
    container.append(section.group);
  }

  // ---- branching ---------------------------------------------------------
  {
    const section = createSection({
      title: 'Branching',
      hint: `${params.branches.levels} levels`,
      open: true,
      onReset: () => {
        params.branches = clone(preset.branches);
        onResetChange?.(params);
      },
    });
    sections.branches = section;

    const levels = createSlider({
      label: 'Branch levels',
      value: params.branches.levels,
      min: 2,
      max: 20,
      step: 1,
      onInput: (v) => {
        commit((p) => {
          p.branches.levels = v;
        });
        section.setHint(`${Math.round(v)} levels`);
      },
      onCommit: release,
    });
    const start = createSlider({
      label: 'Crown starts',
      value: params.branches.start,
      min: 0.05,
      max: 0.9,
      step: 0.01,
      decimals: 2,
      hint: 'Where along the trunk the first branch leaves.',
      onInput: (v) => commit((p) => {
        p.branches.start = v;
      }),
      onCommit: release,
    });
    const end = createSlider({
      label: 'Crown ends',
      value: params.branches.end,
      min: 0.3,
      max: 1,
      step: 0.01,
      decimals: 2,
      onInput: (v) => commit((p) => {
        p.branches.end = v;
      }),
      onCommit: release,
    });
    const angle = createSlider({
      label: 'Branch angle',
      value: params.branches.angle,
      min: 10,
      max: 105,
      step: 1,
      unit: '°',
      onInput: (v) => commit((p) => {
        p.branches.angle = v;
      }),
      onCommit: release,
    });
    const angleVar = createSlider({
      label: 'Angle variance',
      value: params.branches.angleVar,
      min: 0,
      max: 32,
      step: 1,
      unit: '°',
      onInput: (v) => commit((p) => {
        p.branches.angleVar = v;
      }),
      onCommit: release,
    });
    const upBias = createSlider({
      label: 'Upward bias',
      value: params.branches.upBias,
      min: -1,
      max: 1,
      step: 0.01,
      decimals: 2,
      hint: 'Positive lifts branches; negative lets them sag.',
      onInput: (v) => commit((p) => {
        p.branches.upBias = v;
      }),
      onCommit: release,
    });
    const droop = createSlider({
      label: 'Gravity droop',
      value: params.branches.droop,
      min: 0,
      max: 1,
      step: 0.01,
      decimals: 2,
      onInput: (v) => commit((p) => {
        p.branches.droop = v;
      }),
      onCommit: release,
    });
    const reach = createSlider({
      label: 'Branch reach',
      value: params.branches.reach,
      min: 0.15,
      max: 0.95,
      step: 0.01,
      decimals: 2,
      onInput: (v) => commit((p) => {
        p.branches.reach = v;
      }),
      onCommit: release,
    });
    const split = createSlider({
      label: 'Split per node',
      value: params.branches.split,
      min: 1,
      max: 4,
      step: 1,
      onInput: (v) => commit((p) => {
        p.branches.split = v;
      }),
      onCommit: release,
    });
    const depth = createSlider({
      label: 'Recursion depth',
      value: params.branches.depth,
      min: 1,
      max: 6,
      step: 1,
      hint: 'How many times each limb divides. Cost grows quickly.',
      onInput: (v) => commit((p) => {
        p.branches.depth = v;
      }),
      onCommit: release,
    });
    const taper = createSlider({
      label: 'Taper',
      value: params.branches.taper,
      min: 0.3,
      max: 0.92,
      step: 0.01,
      decimals: 2,
      hint: 'Child thickness as a fraction of the parent.',
      onInput: (v) => commit((p) => {
        p.branches.taper = v;
      }),
      onCommit: release,
    });
    const gnarl = createSlider({
      label: 'Gnarl',
      value: params.branches.gnarl,
      min: 0,
      max: 1.2,
      step: 0.01,
      decimals: 2,
      onInput: (v) => commit((p) => {
        p.branches.gnarl = v;
      }),
      onCommit: release,
    });

    controls.branches = { levels, start, end, angle, angleVar, upBias, droop, reach, split, depth, taper, gnarl };

    section.body.append(
      levels.node,
      start.node,
      end.node,
      angle.node,
      angleVar.node,
      upBias.node,
      droop.node,
      reach.node,
      split.node,
      depth.node,
      taper.node,
      gnarl.node,
    );
    container.append(section.group);
  }

  // ---- foliage -----------------------------------------------------------
  {
    const section = createSection({
      title: 'Foliage',
      hint: params.leaves.style === 'needle' ? 'needles' : params.leaves.style === 'none' ? 'bare' : 'broadleaf',
      open: true,
      onReset: () => {
        params.leaves = clone(preset.leaves);
        onResetChange?.(params);
      },
    });
    sections.leaves = section;

    const style = createSegmented({
      label: 'Leaf style',
      value: params.leaves.style,
      options: [
        { value: 'broad', label: 'Broadleaf' },
        { value: 'slender', label: 'Slender' },
        { value: 'needle', label: 'Needle' },
        { value: 'none', label: 'Bare' },
      ],
      onChange: (v) => {
        commit((p) => {
          p.leaves.style = v;
        });
        section.setHint(v === 'needle' ? 'needles' : v === 'none' ? 'bare' : v === 'slender' ? 'slender' : 'broadleaf');
      },
    });
    const density = createSlider({
      label: 'Density',
      value: params.leaves.density,
      min: 0.1,
      max: 2.4,
      step: 0.05,
      decimals: 2,
      hint: 'Number of leaf cards. The single biggest cost.',
      onInput: (v) => commit((p) => {
        p.leaves.density = v;
      }),
      onCommit: release,
    });
    const size = createSlider({
      label: 'Leaf size',
      value: params.leaves.size,
      min: 0.05,
      max: 0.9,
      step: 0.01,
      unit: 'm',
      decimals: 2,
      onInput: (v) => commit((p) => {
        p.leaves.size = v;
      }),
      onCommit: release,
    });
    const sizeVar = createSlider({
      label: 'Size variation',
      value: params.leaves.sizeVar,
      min: 0,
      max: 0.6,
      step: 0.01,
      decimals: 2,
      onInput: (v) => commit((p) => {
        p.leaves.sizeVar = v;
      }),
      onCommit: release,
    });
    const wind = createSlider({
      label: 'Leaf wind',
      value: params.leaves.wind,
      min: 0,
      max: 2,
      step: 0.05,
      decimals: 2,
      onInput: (v) => commit((p) => {
        p.leaves.wind = v;
      }),
      onCommit: release,
    });
    const colors = createColorSet({
      label: 'Foliage palette',
      note: '',
      colors: [
        ['colorA', 'Shade', params.leaves.colorA],
        ['colorB', 'Body', params.leaves.colorB],
        ['colorTip', 'Tip', params.leaves.colorTip],
      ],
      onChange: (key, value) => {
        commit((p) => {
          p.leaves[key] = value;
        });
      },
    });

    controls.leaves = { style, density, size, sizeVar, wind, colors };

    section.body.append(style.node, density.node, size.node, sizeVar.node, colors.node, wind.node);
    container.append(section.group);
  }

  // ---- bark --------------------------------------------------------------
  {
    const section = createSection({
      title: 'Bark',
      hint: '',
      onReset: () => {
        params.bark = clone(preset.bark);
        onResetChange?.(params);
      },
    });
    const colors = createColorSet({
      label: 'Bark palette',
      note: '',
      colors: [
        ['colorA', 'Shadow', params.bark.colorA],
        ['colorB', 'Highlight', params.bark.colorB],
      ],
      onChange: (key, value) => {
        commit((p) => {
          p.bark[key] = value;
        });
      },
    });
    const roughness = createSlider({
      label: 'Roughness',
      value: params.bark.roughness,
      min: 0.2,
      max: 1,
      step: 0.01,
      decimals: 2,
      onInput: (v) => commit((p) => {
        p.bark.roughness = v;
      }),
      onCommit: release,
    });
    const lumpiness = createSlider({
      label: 'Bark relief',
      value: params.bark.lumpiness,
      min: 0,
      max: 0.45,
      step: 0.005,
      decimals: 3,
      hint: 'Geometric ridges in the trunk surface.',
      onInput: (v) => commit((p) => {
        p.bark.lumpiness = v;
      }),
      onCommit: release,
    });
    controls.bark = { colors, roughness, lumpiness };
    section.body.append(colors.node, roughness.node, lumpiness.node);
    container.append(section.group);
  }

  // ---- rendering ---------------------------------------------------------
  {
    const section = createSection({ title: 'Studio', hint: '' });
    const qualityControl = createSegmented({
      label: 'Detail',
      value: quality,
      options: [
        { value: 'draft', label: 'Draft', title: 'Fast — fewer cards and sides while you sculpt' },
        { value: 'studio', label: 'Studio', title: 'Balanced preview quality' },
        { value: 'max', label: 'Max', title: 'High quality preview' },
      ],
      onChange: (v) => onQuality?.(v),
    });
    controls.quality = qualityControl;
    section.body.append(
      qualityControl.node,
      el(
        'p',
        'control-note',
        'Detail changes the live preview budget only. Exports are always generated at full detail.',
      ),
    );
    container.append(section.group);
  }

  // sync on preset change
  controls.applyPreset = () => {
    const fresh = getParams();
    controls.trunk?.height.set(fresh.trunk.height);
    controls.trunk?.radius.set(fresh.trunk.radius);
    controls.trunk?.flare.set(fresh.trunk.flare);
    controls.trunk?.lean.set(fresh.trunk.lean);
    controls.trunk?.wobble.set(fresh.trunk.wobble);
    controls.trunk?.sides.set(fresh.trunk.sides);

    controls.roots?.count.set(fresh.roots.count);
    controls.roots?.reach.set(fresh.roots.reach);

    Object.entries(controls.branches || {}).forEach(([key, control]) => control.set(fresh.branches[key]));

    controls.leaves?.style.set(fresh.leaves.style);
    controls.leaves?.density.set(fresh.leaves.density);
    controls.leaves?.size.set(fresh.leaves.size);
    controls.leaves?.sizeVar.set(fresh.leaves.sizeVar);
    controls.leaves?.wind.set(fresh.leaves.wind);
    controls.leaves?.colors.set(fresh.leaves);

    controls.bark?.colors.set(fresh.bark);
    controls.bark?.roughness.set(fresh.bark.roughness);
    controls.bark?.lumpiness.set(fresh.bark.lumpiness);

    sections.trunk?.setHint(`${fresh.trunk.height.toFixed(1)} m · ⌀ ${(fresh.trunk.radius * 2).toFixed(2)} m`);
    sections.branches?.setHint(`${fresh.branches.levels} levels`);
    sections.leaves?.setHint(fresh.leaves.style === 'needle' ? 'needles' : fresh.leaves.style === 'none' ? 'bare' : fresh.leaves.style === 'slender' ? 'slender' : 'broadleaf');
  };

  controls.speciesNote = el(
    'p',
    'control-note species-note',
    `${SPECIES_BY_ID[params.species]?.note || ''}`,
  );
  container.prepend(controls.speciesNote);

  return controls;
}
