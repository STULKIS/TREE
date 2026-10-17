/**
 * Wind: a vertex-shader displacement injected into three.js standard materials
 * via `onBeforeCompile`. Shared uniforms (time, strength, height) plus a
 * per-material amplitude so leaves flutter more than limbs.
 */
import { Vector3 } from 'three';

export class WindUniforms {
  constructor() {
    this.uTime = { value: 0 };
    this.uWindStrength = { value: 0 };
    this.uWindHeight = { value: 10 };
    this.uWindDir = { value: new Vector3(0.8, 0, 0.6).normalize() };
  }
  setHeight(h) {
    this.uWindHeight.value = Math.max(1, h);
  }
}

const PARS = /* glsl */ `
uniform float uTime;
uniform float uWindStrength;
uniform float uWindHeight;
uniform vec3 uWindDir;
uniform float uWindAmp;
uniform float uWindFlutter;

vec3 saplingWind(vec3 p, vec3 worldSeed) {
  // Height factor: nothing moves at the roots, the crown sways most.
  float h = clamp(p.y / uWindHeight, 0.0, 1.0);
  float hf = h * h;
  // Main sway: slow gust moving across the tree
  float phase = dot(worldSeed.xz, uWindDir.xz) * 0.35;
  float gust = sin(uTime * 1.1 + phase) * 0.6 + sin(uTime * 0.37 + phase * 0.5) * 0.4;
  gust = gust * 0.5 + 0.5 * sin(uTime * 2.3 + phase * 1.7) * 0.25;
  vec3 sway = uWindDir * gust * hf * uWindStrength * uWindAmp;
  // Flutter: fast, per-vertex jitter (leaves only, scaled by uWindFlutter)
  float f = sin(uTime * 9.0 + p.x * 7.0 + p.z * 5.0 + p.y * 3.0) * 0.5
          + sin(uTime * 13.0 + p.y * 11.0 - p.x * 4.0) * 0.5;
  vec3 flutter = vec3(f, f * 0.6, -f) * 0.03 * h * uWindStrength * uWindFlutter;
  return p + sway + flutter;
}
`;

/**
 * Patch a material so its vertices sway.
 * @param {import('three').Material} material
 * @param {WindUniforms} shared
 * @param {{amp:number, flutter:number}} options
 */
export function applyWind(material, shared, { amp = 1, flutter = 0 } = {}) {
  const own = { uWindAmp: { value: amp }, uWindFlutter: { value: flutter } };
  material.userData.wind = own;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, {
      uTime: shared.uTime,
      uWindStrength: shared.uWindStrength,
      uWindHeight: shared.uWindHeight,
      uWindDir: shared.uWindDir,
      uWindAmp: own.uWindAmp,
      uWindFlutter: own.uWindFlutter
    });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${PARS}`)
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>\n  transformed = saplingWind(transformed, position);`
      );
  };
  material.customProgramCacheKey = () => `sapling-wind-${amp}-${flutter}`;
  material.needsUpdate = true;
  return material;
}
