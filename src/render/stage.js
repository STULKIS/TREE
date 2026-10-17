import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const TAU = Math.PI * 2;

function makeGroundTexture() {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(size / 2, size / 2, size * 0.05, size / 2, size / 2, size * 0.72);
  gradient.addColorStop(0, '#26352a');
  gradient.addColorStop(0.45, '#1d2a21');
  gradient.addColorStop(1, '#121a15');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  let seed = 9271;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let i = 0; i < 9000; i += 1) {
    const x = rand() * size;
    const y = rand() * size;
    const r = rand() * 1.8 + 0.3;
    const light = rand();
    ctx.fillStyle = light > 0.55
      ? `rgba(146, 164, 122, ${0.05 + rand() * 0.11})`
      : `rgba(8, 14, 10, ${0.08 + rand() * 0.16})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
  }
  // faint moss patches
  for (let i = 0; i < 42; i += 1) {
    const x = rand() * size;
    const y = rand() * size;
    const r = 8 + rand() * 36;
    const patch = ctx.createRadialGradient(x, y, 0, x, y, r);
    patch.addColorStop(0, `rgba(96, 118, 74, ${0.02 + rand() * 0.05})`);
    patch.addColorStop(1, 'rgba(96, 118, 74, 0)');
    ctx.fillStyle = patch;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(5, 5);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function makeShadowTexture() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(0, 0, 0, 0.55)');
  gradient.addColorStop(0.35, 'rgba(0, 0, 0, 0.3)');
  gradient.addColorStop(0.72, 'rgba(0, 0, 0, 0.08)');
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const windUniforms = {
  time: { value: 0 },
  strength: { value: 0 },
};

function addWind(material, amplitude, heightScale, cacheKey) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = windUniforms.time;
    shader.uniforms.uWind = windUniforms.strength;
    shader.vertexShader = `uniform float uTime;\nuniform float uWind;\n${shader.vertexShader}`;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      float windH = clamp(position.y * ${heightScale.toFixed(5)}, 0.0, 1.0);
      float windPhase = position.x * 0.42 + position.z * 0.31;
      float windSwing = sin(uTime * 1.25 + windPhase) * 0.62 + sin(uTime * 2.13 + windPhase * 1.7) * 0.38;
      float windAmp = uWind * ${amplitude.toFixed(5)} * (0.12 + windH * windH);
      transformed.x += windSwing * windAmp;
      transformed.z += cos(uTime * 1.02 + windPhase * 0.8) * windAmp * 0.6;
      transformed.y += sin(uTime * 1.71 + windPhase * 2.1) * windAmp * 0.22;`,
    );
  };
  material.customProgramCacheKey = () => cacheKey;
  return material;
}

export class Stage {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.18;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x0c1411, 0.016);
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 400);
    this.camera.position.set(11, 7.5, 16);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.075;
    this.controls.rotateSpeed = 0.72;
    this.controls.zoomSpeed = 0.85;
    this.controls.panSpeed = 0.6;
    this.controls.minDistance = 2;
    this.controls.maxDistance = 95;
    this.controls.maxPolarAngle = Math.PI * 0.502;
    this.controls.autoRotate = true;
    this.controls.autoRotateSpeed = 0.32;
    this.controls.target.set(0, 5, 0);
    this.controls.addEventListener('start', () => {
      this.autoRotateInterrupted = true;
      if (this.onUserInteract) this.onUserInteract();
    });

    this.clock = new THREE.Clock();
    this.elapsed = 0;
    this.windTarget = 0;
    this.windStrength = 0;
    this.tween = null;

    this.buildEnvironment();
    this.buildTreeGroup();
    this.resize();
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(canvas.parentElement || canvas);
    this.renderer.setAnimationLoop(() => this.render());
  }

  buildEnvironment() {
    const hemi = new THREE.HemisphereLight(0xc7d9c4, 0x1b2418, 0.95);
    this.scene.add(hemi);

    const key = new THREE.DirectionalLight(0xffeed2, 2.55);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.bias = -0.0006;
    key.shadow.normalBias = 0.025;
    key.shadow.radius = 3;
    this.keyLight = key;
    this.scene.add(key);
    this.scene.add(key.target);

    const fill = new THREE.DirectionalLight(0x9fc4b7, 0.65);
    fill.position.set(-14, 9, -10);
    this.scene.add(fill);

    const rim = new THREE.DirectionalLight(0xffd8a1, 0.5);
    rim.position.set(-6, 4, -18);
    this.scene.add(rim);

    const groundTexture = makeGroundTexture();
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(85, 96),
      new THREE.MeshStandardMaterial({
        map: groundTexture,
        color: 0xcfd8c6,
        roughness: 1,
        metalness: 0,
      }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.02;
    ground.receiveShadow = true;
    this.ground = ground;
    this.scene.add(ground);

    const blob = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        map: makeShadowTexture(),
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
        color: 0x081009,
      }),
    );
    blob.rotation.x = -Math.PI / 2;
    blob.position.y = 0.005;
    blob.renderOrder = 1;
    this.blob = blob;
    this.scene.add(blob);

    // drifting pollen
    const count = 220;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      const radius = 1.5 + Math.random() * 13;
      const angle = Math.random() * TAU;
      positions[i * 3] = Math.cos(angle) * radius;
      positions[i * 3 + 1] = 0.4 + Math.random() * 12;
      positions[i * 3 + 2] = Math.sin(angle) * radius;
    }
    const pollenGeometry = new THREE.BufferGeometry();
    pollenGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.pollen = new THREE.Points(
      pollenGeometry,
      new THREE.PointsMaterial({
        color: 0xe6d9a9,
        size: 0.055,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        sizeAttenuation: true,
      }),
    );
    this.scene.add(this.pollen);

    this.barkMaterial = addWind(new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.96,
      metalness: 0,
      name: 'Sapling_Bark',
    }), 0.016, 0.11, 'wind-bark');

    this.leafMaterial = addWind(new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.82,
      metalness: 0,
      side: THREE.DoubleSide,
      name: 'Sapling_Leaves',
    }), 0.055, 0.1, 'wind-leaf');
  }

  buildTreeGroup() {
    this.treeGroup = new THREE.Group();
    this.treeGroup.name = 'Sapling_Tree';
    this.scene.add(this.treeGroup);
    this.barkMesh = null;
    this.leafMesh = null;
  }

  setTree(tree, { instant = false, frame = true } = {}) {
    if (this.barkMesh) {
      this.treeGroup.remove(this.barkMesh, this.leafMesh);
      this.barkMesh.geometry.dispose();
      if (this.leafMesh) this.leafMesh.geometry.dispose();
    }
    const bark = new THREE.Mesh(tree.barkGeometry, this.barkMaterial);
    bark.name = 'Bark';
    bark.castShadow = true;
    bark.receiveShadow = true;
    this.barkMesh = bark;
    this.treeGroup.add(bark);

    if (tree.leafGeometry) {
      const leaves = new THREE.Mesh(tree.leafGeometry, this.leafMaterial);
      leaves.name = 'Foliage';
      leaves.castShadow = true;
      this.leafMesh = leaves;
      this.treeGroup.add(leaves);
    } else {
      this.leafMesh = null;
    }

    this.currentBounds = tree.bounds;
    this.currentStats = tree.stats;
    this.updateGround(tree.bounds);
    if (frame) this.frameTree(tree.bounds, { instant });
  }

  updateGround(bounds) {
    const size = bounds.getSize(new THREE.Vector3());
    const spread = Math.max(size.x, size.z, size.z * 1.1, 4);
    this.blob.scale.set(spread * 1.45, spread * 1.45, 1);
    this.blob.position.x = bounds.getCenter(new THREE.Vector3()).x;
    this.blob.position.z = bounds.getCenter(new THREE.Vector3()).z;

    const height = Math.max(size.y, 4);
    const center = bounds.getCenter(new THREE.Vector3());
    const radius = Math.max(spread * 1.1, height * 0.75, 7);
    const light = this.keyLight;
    light.position.set(center.x + radius * 0.95, height * 1.75 + 5, center.z + radius * 0.8);
    light.target.position.set(center.x, 0, center.z);
    light.target.updateMatrixWorld();
    const shadowCamera = light.shadow.camera;
    shadowCamera.left = -radius;
    shadowCamera.right = radius;
    shadowCamera.top = radius;
    shadowCamera.bottom = -radius;
    shadowCamera.near = 0.5;
    shadowCamera.far = height * 5 + 30;
    shadowCamera.updateProjectionMatrix();
    light.shadow.needsUpdate = true;
  }

  frameTree(bounds, { instant = false, angle = null } = {}) {
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    const target = new THREE.Vector3(center.x, bounds.min.y + size.y * 0.52, center.z);

    const fov = (this.camera.fov * Math.PI) / 180;
    const aspect = this.camera.aspect || 1;
    const fitHeight = (size.y * 0.58) / Math.tan(fov / 2);
    const fitWidth = (Math.max(size.x, size.z) * 0.62) / (Math.tan(fov / 2) * aspect);
    const distance = Math.max(fitHeight, fitWidth, 7) * 1.06;

    let direction;
    if (angle) {
      direction = new THREE.Vector3(Math.sin(angle), 0.28, Math.cos(angle)).normalize();
    } else {
      direction = this.camera.position.clone().sub(this.controls.target).normalize();
      if (!Number.isFinite(direction.x) || direction.lengthSq() < 0.001) {
        direction = new THREE.Vector3(0.55, 0.26, 1).normalize();
      }
    }
    const destination = target.clone().addScaledVector(direction, distance);

    if (instant) {
      this.camera.position.copy(destination);
      this.controls.target.copy(target);
      this.controls.update();
      this.tween = null;
      return;
    }
    this.tween = {
      elapsed: 0,
      duration: 0.85,
      fromPos: this.camera.position.clone(),
      toPos: destination,
      fromTarget: this.controls.target.clone(),
      toTarget: target,
    };
  }

  resetView({ instant = false } = {}) {
    if (!this.currentBounds) return;
    this.frameTree(this.currentBounds, { instant, angle: 0.5 });
  }

  setWind(strength) {
    this.windTarget = strength;
  }

  setAutoRotate(value) {
    this.controls.autoRotate = value;
  }

  /** Renders the current view over a studio backdrop, at 2x for crisp files. */
  screenshot() {
    this.renderer.render(this.scene, this.camera);
    const width = this.canvas.width;
    const height = this.canvas.height;
    const out = document.createElement('canvas');
    out.width = width;
    out.height = height;
    const ctx = out.getContext('2d');

    const backdrop = ctx.createRadialGradient(
      width * 0.62, height * 0.2, 0,
      width * 0.62, height * 0.2, Math.max(width, height) * 0.85,
    );
    backdrop.addColorStop(0, '#1b2b20');
    backdrop.addColorStop(0.55, '#0d1511');
    backdrop.addColorStop(1, '#050a07');
    ctx.fillStyle = backdrop;
    ctx.fillRect(0, 0, width, height);

    ctx.drawImage(this.canvas, 0, 0);
    return out.toDataURL('image/png');
  }

  resize() {
    const parent = this.canvas.parentElement || document.body;
    const width = parent.clientWidth || window.innerWidth;
    const height = parent.clientHeight || window.innerHeight;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
  }

  render() {
    const dt = Math.min(this.clock.getDelta(), 0.1);
    this.elapsed += dt;

    const ease = 1 - Math.pow(0.001, dt);
    this.windStrength += (this.windTarget - this.windStrength) * ease;
    windUniforms.time.value = this.elapsed;
    windUniforms.strength.value = this.windStrength * 0.95;

    if (this.tween) {
      this.tween.elapsed += dt;
      const t = Math.min(1, this.tween.elapsed / this.tween.duration);
      const eased = 1 - Math.pow(1 - t, 3);
      this.camera.position.lerpVectors(this.tween.fromPos, this.tween.toPos, eased);
      this.controls.target.lerpVectors(this.tween.fromTarget, this.tween.toTarget, eased);
      if (t >= 1) this.tween = null;
    }

    this.controls.update();

    if (this.pollen) {
      const positions = this.pollen.geometry.getAttribute('position');
      for (let i = 0; i < positions.count; i += 1) {
        let y = positions.getY(i) + dt * 0.06;
        if (y > 13) y = 0.3;
        positions.setY(i, y);
        positions.setX(i, positions.getX(i) + Math.sin(this.elapsed * 0.25 + i) * dt * 0.03);
      }
      positions.needsUpdate = true;
    }

    this.renderer.render(this.scene, this.camera);
  }
}
