import { addFloorRelief } from './floor-reliefs.js';
import { createCombatPresentation } from './combat-presentation.js';
import * as THREE from 'three';
import { CinematicPipeline } from './cinematic-pipeline.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { addGothicArchitecture } from './gothic-architecture.js';
import { createSurfaceLibrary } from './surface-assets.js';
import {
  loadCharacterAssets,
  loadCharacterLODs,
  createCharacterVisual,
  getCharacterAssetStatus,
} from './character-assets.js';
import {
  loadPropAssets,
  createPropVisual,
  propAssetState,
  disposePropAssets,
} from './prop-assets.js';

// The world lives on the X/Z plane. Game coordinates stay in tiles throughout.
const UP = new THREE.Vector3(0, 1, 0);
const PALETTE = {
  warden: '#82d5ef',
  ranger: '#97d879',
  arcanist: '#b79aff',
  reaver: '#f2a275',
  oracle: '#f4da92',
};
const GEO = {
  box: new THREE.BoxGeometry(1, 1, 1),
  bevel: new RoundedBoxGeometry(1, 1, 1, 1, 0.035),
  sphere: new THREE.SphereGeometry(1, 8, 6),
  gem: new THREE.OctahedronGeometry(1, 0),
  cone: new THREE.ConeGeometry(1, 1, 6),
  cylinder: new THREE.CylinderGeometry(1, 1, 1, 8),
  taper: new THREE.CylinderGeometry(0.75, 1, 1, 6),
  plane: new THREE.PlaneGeometry(1, 1),
  circle: new THREE.CircleGeometry(1, 20),
};

function color(value, fallback = '#b99165') {
  try {
    return new THREE.Color(value ?? fallback);
  } catch {
    return new THREE.Color(fallback);
  }
}
function hash(x, y = 0) {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}
function transformGeometry(geometry, position, scale, rotation = [0, 0, 0]) {
  const matrix = new THREE.Matrix4().compose(
    new THREE.Vector3(...position),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),
    new THREE.Vector3(...scale),
  );
  // PolyhedronGeometry is non-indexed while boxes/cylinders are indexed.
  // Normalizing here lets both participate in a single static draw call.
  const clone = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  return clone.applyMatrix4(matrix);
}

/** A small material/geometry batch, used for architecture and character bodies. */
class Batch {
  constructor(renderer, spatial = false) {
    this.renderer = renderer;
    this.spatial = spatial;
    this.groups = new Map();
  }
  add(geometry, material, position, scale, rotation) {
    const key =
      material.uuid +
      (this.spatial ? `:${Math.floor(position[0] / 12)}:${Math.floor(position[2] / 12)}` : '');
    if (!this.groups.has(key)) this.groups.set(key, { material, geometries: [] });
    this.groups.get(key).geometries.push(transformGeometry(geometry, position, scale, rotation));
  }
  finish(parent) {
    for (const { material, geometries } of this.groups.values()) {
      if (!geometries.length) continue;
      const geometry = mergeGeometries(geometries, false);
      geometries.forEach((g) => g.dispose());
      if (!geometry) continue;
      geometry.computeBoundingSphere();
      const mesh = new THREE.Mesh(geometry, this.renderer.presentMaterial(material));
      mesh.userData.ownedGeometry = true;
      mesh.castShadow = material.userData.shadowCaster !== false && !material.transparent;
      mesh.receiveShadow = !material.isMeshBasicMaterial;
      parent.add(mesh);
    }
  }
}

export class DungeonRenderer {
  constructor(canvas, { onContextLost, onContextRestored } = {}) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.info.autoReset = false;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.setClearColor('#101925');
    this.scene = new THREE.Scene();
    this.createLightingProbe();
    this.camera = new THREE.OrthographicCamera(-10, 10, 8, -8, 0.1, 120);
    this.camera.up.copy(UP);
    this.camera.position.set(14, 18, 14);
    this.camera.lookAt(0, 0, 0);
    this.cameraOffset = new THREE.Vector3(14, 18, 14);
    this.target = new THREE.Vector3();
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.ground = new THREE.Plane(UP, 0);
    this.hit = new THREE.Vector3();
    this.static = new THREE.Group();
    this.dynamic = new THREE.Group();
    this.scene.add(this.static, this.dynamic);
    this.surfaces = createSurfaceLibrary(this.renderer);
    this.materials = new Map();
    this.actors = new Map();
    this.objectModels = new Map();
    this.lootModels = new Map();
    this.projectileModels = new Map();
    this.effectModels = new Map();
    this.torches = [];
    this.quality = 'high';
    this.zoom = 1;
    this.pipeline = new CinematicPipeline(this.renderer, this.scene, this.camera);
    this.revealUniform = { value: null };
    this.revealSize = { value: new THREE.Vector2(1, 1) };
    this.impactShake = 0;
    this.heroHitUntil = 0;
    this.initialized = false;
    this.scene.add(new THREE.HemisphereLight('#a6bfd8', '#30232b', 1.35));
    const sun = new THREE.DirectionalLight('#ffe3ba', 3.2);
    sun.position.set(-7, 13, 9);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, {
      left: -12,
      right: 12,
      top: 12,
      bottom: -12,
      near: 0.5,
      far: 42,
    });
    sun.shadow.radius = 2;
    sun.shadow.intensity = 0.86;
    sun.shadow.normalBias = 0.035;
    sun.shadow.bias = -0.00015;
    this.sun = sun;
    this.scene.add(sun, sun.target);
    const rim = new THREE.DirectionalLight('#799ed3', 1.1);
    rim.position.set(5, 4, -8);
    this.scene.add(rim);
    this.heroLight = new THREE.PointLight('#91bded', 7, 6, 2);
    this.scene.add(this.heroLight);
    this.torchLights = Array.from({ length: 3 }, () => {
      const light = new THREE.PointLight('#ff9c45', 6, 5, 2);
      this.scene.add(light);
      return light;
    });
    this._contextLost = (event) => {
      event.preventDefault();
      // Retire GPU handles while their context is lost. Deleting these after
      // restoration would send stale handles to the replacement context.
      this.pipeline?.dispose();
      this.pipeline = null;
      this.lightingProbe?.dispose();
      this.lightingProbe = null;
      this.scene.environment = null;
      this.retireSceneGpuResources();
      onContextLost?.();
    };
    this._contextRestored = () => {
      this.createLightingProbe();
      this.pipeline = new CinematicPipeline(this.renderer, this.scene, this.camera);
      this.pipeline.enabled = this.quality === 'high';
      this.resize();
      for (const actor of this.actors.values()) this.prepareCharacterVisual(actor.visual);
      for (const object of this.objectModels.values()) this.prepareCharacterVisual(object.visual);
      onContextRestored?.();
    };
    canvas.addEventListener('webglcontextlost', this._contextLost);
    canvas.addEventListener('webglcontextrestored', this._contextRestored);
    this._resize = () => this.resize();
    window.addEventListener('resize', this._resize);
    this.resize();
  }

  retireSceneGpuResources() {
    // Keep CPU geometry and decoded images, but remove old-context disposal
    // listeners before Three.js creates its replacement WebGL resource caches.
    const geometries = new Set(Object.values(GEO));
    const materials = new Set(this.materials.values());
    const textures = new Set();
    this.scene.traverse((node) => {
      if (node.geometry) geometries.add(node.geometry);
      if (node.material) for (const material of [].concat(node.material)) materials.add(material);
      if (node.skeleton?.boneTexture) textures.add(node.skeleton.boneTexture);
    });
    for (const material of materials) {
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
      for (const uniform of Object.values(material.uniforms || {}))
        if (uniform.value?.isTexture) textures.add(uniform.value);
    }
    textures.add(this.revealUniform.value);
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
    for (const texture of textures) texture?.dispose();
    this.sun.shadow.map?.dispose();
    this.sun.shadow.map = null;
  }

  createLightingProbe() {
    this.lightingProbe?.dispose();
    if (!this.renderer.extensions.has('EXT_color_buffer_float')) {
      this.lightingProbe = null;
      this.scene.environment = null;
      return;
    }
    const environment = new RoomEnvironment();
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.lightingProbe = pmrem.fromScene(environment, 0.04, 0.1, 100, { size: 128 });
    this.scene.environment = this.lightingProbe.texture;
    this.scene.environmentIntensity = 0.18;
    environment.dispose();
    pmrem.dispose();
  }

  material(
    value,
    { emissive = 0, transparent = false, opacity = 1, metalness = 0, basic = false } = {},
  ) {
    const c = color(value);
    const key = `${c.getHexString()}|${emissive}|${opacity}|${metalness}|${basic}`;
    if (!this.materials.has(key)) {
      const material = basic
        ? new THREE.MeshBasicMaterial({
            color: c,
            transparent,
            opacity,
            depthWrite: !transparent,
            side: THREE.DoubleSide,
          })
        : new THREE.MeshStandardMaterial({
            color: c,
            roughness: 0.8 - metalness * 0.4,
            metalness,
            emissive: c,
            emissiveIntensity: emissive,
            transparent,
            opacity,
            depthWrite: !transparent,
            flatShading: true,
          });
      if (!basic && metalness >= 0.4 && emissive === 0)
        this.surfaces.apply(material, 'metal', { metalness });
      this.materials.set(key, material);
    }
    return this.materials.get(key);
  }

  presentMaterial(material) {
    if (this.quality !== 'low' || !material.isMeshStandardMaterial) return material;
    const key = `performance:${material.uuid}`;
    if (!this.materials.has(key)) {
      const simple = new THREE.MeshLambertMaterial({
        color: material.color,
        map: material.map,
        emissive: material.emissive,
        emissiveMap: material.emissiveMap,
        emissiveIntensity: material.emissiveIntensity,
        transparent: material.transparent,
        opacity: material.opacity,
        side: material.side,
        depthWrite: material.depthWrite,
        vertexColors: material.vertexColors,
        flatShading: material.flatShading,
      });
      simple.name = `${material.name || 'surface'}-performance`;
      simple.userData.surfaceKind = material.userData.surfaceKind;
      simple.userData.shadowCaster = material.userData.shadowCaster;
      this.materials.set(key, simple);
    }
    return this.materials.get(key);
  }

  stoneMaterial(value, kind = 'masonry') {
    const c = color(value);
    const key = `surface:${kind}:${c.getHexString()}`;
    if (!this.materials.has(key)) {
      const material = new THREE.MeshStandardMaterial({ color: c, roughness: 0.94 });
      this.surfaces.apply(material, kind);
      this.materials.set(key, material);
    }
    return this.materials.get(key);
  }

  async loadAssets() {
    let timer;
    await Promise.race([
      Promise.all([
        this.surfaces.ready,
        loadCharacterAssets(),
        loadPropAssets(this.surfaces),
        this.quality === 'low' ? loadCharacterLODs() : Promise.resolve(),
      ]),
      new Promise((resolve) => {
        timer = setTimeout(resolve, 6000);
      }),
    ]);
    clearTimeout(timer);
  }

  prepareCharacterVisual(visual, tint = null) {
    if (!visual) return;
    visual.root.traverse((node) => {
      if (!node.isMesh) return;
      if (tint !== null) {
        const key = `character-tint:${visual.stats.detail}:${visual.stats.id}:${color(tint).getHexString()}`;
        if (!this.materials.has(key)) {
          const material = node.material.clone();
          material.color.lerp(color(tint), 0.22);
          this.materials.set(key, material);
        }
        node.material = this.materials.get(key);
      }
      node.material = Array.isArray(node.material)
        ? node.material.map((mat) => this.presentMaterial(mat))
        : this.presentMaterial(node.material);
      for (const material of [].concat(node.material)) {
        material.envMap = this.quality === 'high' ? this.lightingProbe?.texture || null : null;
        material.envMapIntensity = 0.58;
        material.needsUpdate = true;
      }
    });
  }

  playHeroAnimation(name) {
    if (name === 'cast') this.heroCastUntil = (this.world?.time || 0) + 0.6;
    if (name === 'hit') {
      this.heroHitUntil = (this.world?.time || 0) + 0.36;
      this.impactShake = 0.065;
    }
  }

  getGraphicsStatus() {
    return {
      characters: getCharacterAssetStatus(),
      props: { ...propAssetState },
      surfaces: { ...this.surfaces.state },
      shadows: this.renderer.shadowMap.enabled,
      drawCalls: this.renderer.info.render.calls,
      triangles: this.renderer.info.render.triangles,
    };
  }

  mesh(geometry, material, position = [0, 0, 0], scale = [1, 1, 1], parent = null) {
    const mesh = new THREE.Mesh(geometry, this.presentMaterial(material));
    mesh.position.set(...position);
    mesh.scale.set(...scale);
    mesh.castShadow = !material.transparent && !material.isMeshBasicMaterial;
    mesh.receiveShadow = !material.isMeshBasicMaterial;
    parent?.add(mesh);
    return mesh;
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const width = Math.max(1, rect.width || window.innerWidth);
    const height = Math.max(1, rect.height || window.innerHeight);
    this.renderer.setPixelRatio(
      Math.min(window.devicePixelRatio || 1, this.quality === 'low' ? 1 : 1.5),
    );
    this.renderer.setSize(width, height, false);
    this.pipeline?.resize(width, height, this.renderer.getPixelRatio());
    const aspect = width / height;
    const vertical = (aspect < 1 ? 14.5 : height < 500 ? 11.7 : 11.5) / this.zoom;
    this.camera.left = (-vertical * aspect) / 2;
    this.camera.right = (vertical * aspect) / 2;
    this.camera.top = vertical / 2;
    this.camera.bottom = -vertical / 2;
    this.camera.updateProjectionMatrix();
  }

  setZoom(zoom) {
    this.zoom = Math.max(0.8, Math.min(1.35, zoom));
    this.resize();
  }

  postprocessingStatus() {
    return (
      this.pipeline?.status() || {
        enabled: false,
        quality: this.quality,
        passes: [],
        fallbackReason: 'WebGL context lost',
      }
    );
  }

  setQuality(quality) {
    const previous = this.quality;
    this.quality = quality === 'low' ? 'low' : 'high';
    this.renderer.shadowMap.enabled = this.quality === 'high';
    if (this.pipeline) this.pipeline.enabled = this.quality === 'high';
    this.sun.castShadow = this.quality === 'high';
    this.torchLights.forEach((light) => {
      light.visible = this.quality === 'high';
    });
    this.resize();
    if (previous !== this.quality && this.initialized) {
      if (this.quality === 'low')
        loadCharacterLODs().then(() => {
          if (!this.disposed && this.quality === 'low' && this.world) this.build(this.world);
        });
      else if (this.world) this.build(this.world);
    }
  }

  clearGroup(group) {
    group.traverse((child) => {
      if (child.userData.ownedGeometry) child.geometry?.dispose();
      if (child.userData.ownedMaterial) child.material?.dispose();
    });
    group.clear();
  }

  build(world) {
    this.world = world;
    this.heroCastUntil = 0;
    this.heroHitUntil = 0;
    this.impactShake = 0;
    this.nearestTorches = null;
    this.nextRevealUpdate = 0;
    this.nextTorchUpdate = 0;
    for (const actor of this.actors.values()) actor.visual?.dispose();
    for (const object of this.objectModels.values()) object.visual?.dispose();
    this.clearGroup(this.static);
    this.clearGroup(this.dynamic);
    for (const models of [
      this.actors,
      this.objectModels,
      this.lootModels,
      this.projectileModels,
      this.effectModels,
    ])
      models.clear();
    this.torches = [];
    const chapter = world.chapter || {};
    const floorColor = color(chapter.floorColor, '#515666');
    const stoneColor = color(chapter.wallColor, '#59626e');
    const accent = color(chapter.color, '#6bdbe2');
    this.accent = accent;
    this.scene.background = color(chapter.fogColor, '#121a29');
    this.scene.fog = new THREE.Fog(this.scene.background, 28, 49);
    const map = world.map || [];
    const height = map.length;
    const width = map[0]?.length || 0;
    const isFloor = (x, y) => y >= 0 && y < height && x >= 0 && x < width && map[y][x] === 0;
    const batch = new Batch(this, true);
    const floors = Array.from({ length: 5 }, (_, i) =>
      this.stoneMaterial(floorColor.clone().multiplyScalar(0.9 + i * 0.07), 'flagstone'),
    );
    floors.forEach((material) => {
      material.userData.shadowCaster = false;
    });
    const wall = this.stoneMaterial(stoneColor);
    const wallDark = this.stoneMaterial(stoneColor.clone().multiplyScalar(0.67));
    const trim = this.stoneMaterial(stoneColor.clone().lerp(color('#b9b09c'), 0.25));
    const cap = this.stoneMaterial(stoneColor.clone().multiplyScalar(0.77));
    const gold = this.material('#b49a5b', { metalness: 0.5 });
    const dark = this.material('#242a36');
    const rubble = this.material(stoneColor.clone().multiplyScalar(0.77));
    const rune = this.material(accent, { emissive: 0.6 });
    const earth = this.material(floorColor.clone().multiplyScalar(0.23));
    const chapterId = chapter.id || 'ashen_bells';
    const bark = this.material('#554938');
    const leaves = this.material('#577e5b');
    const coral = this.material('#bc8298');
    const flame = this.material('#ed944c', { emissive: 0.8 });
    const alcoveCells = new Set(
      (world.rooms || []).flatMap((room) => [
        `${room.x + 2},${room.y - 1}`,
        `${room.x + 1},${room.y - 1}`,
        `${room.x + 3},${room.y - 1}`,
      ]),
    );
    batch.add(GEO.box, earth, [width / 2 - 0.5, -0.37, height / 2 - 0.5], [width, 0.35, height]);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const n = hash(x, y);
        if (isFloor(x, y)) {
          if (n > 0.74) {
            batch.add(
              GEO.bevel,
              floors[Math.floor(n * floors.length)],
              [x - 0.245, -0.09, y],
              [0.475, 0.18, 0.97],
            );
            batch.add(
              GEO.bevel,
              floors[Math.floor(n * floors.length) - 1],
              [x + 0.245, -0.09, y],
              [0.475, 0.18, 0.97],
            );
          } else
            batch.add(
              GEO.bevel,
              floors[Math.floor(n * floors.length)],
              [x, -0.09, y],
              [0.97, 0.18, 0.97],
            );
          // Worn flagstone seams, tiny chips, and irregular pale inclusions.
          if (n > 0.87) {
            batch.add(
              GEO.box,
              dark,
              [x + 0.1, 0.003, y - 0.14],
              [0.015, 0.008, 0.47],
              [0, n * 3, 0],
            );
            batch.add(
              GEO.bevel,
              floors[4],
              [x - 0.22, 0.007, y + 0.27],
              [0.19, 0.008, 0.025],
              [0, n, 0],
            );
          }
          if (n < 0.06 && (!isFloor(x + 1, y) || !isFloor(x, y + 1))) {
            batch.add(
              GEO.gem,
              rubble,
              [x + 0.3, 0.07, y + 0.25],
              [0.14, 0.09, 0.18],
              [n * 10, n * 6, 0],
            );
            batch.add(GEO.gem, rubble, [x + 0.15, 0.04, y + 0.32], [0.07, 0.06, 0.06]);
          }
          continue;
        }
        const north = isFloor(x, y - 1),
          south = isFloor(x, y + 1);
        const east = isFloor(x + 1, y),
          west = isFloor(x - 1, y);
        if (!(north || south || east || west)) continue;
        // Near walls are cut low, keeping player and enemy silhouettes readable.
        const near = north || west;
        const alcove = alcoveCells.has(`${x},${y}`);
        const h = near ? 0.48 : alcove ? 0.36 : 1.38;
        batch.add(GEO.box, wallDark, [x, h / 2, y], [0.98, h, 0.98]);
        batch.add(GEO.box, wall, [x, h / 2 + 0.09, y], [0.91, Math.max(0.18, h - 0.24), 0.91]);
        batch.add(GEO.box, wallDark, [x, h + 0.005, y], [1.025, 0.08, 1.025]);
        batch.add(GEO.box, cap, [x, h + 0.065, y], [0.96, 0.075, 0.96]);
        batch.add(GEO.box, wallDark, [x, 0.08, y], [1.08, 0.16, 1.08]);
        if (!near && !alcove) {
          // Projecting courses reveal the masonry at an isometric angle.
          batch.add(GEO.box, wallDark, [x, 0.48, y], [1.003, 0.032, 1.003]);
          batch.add(GEO.box, wallDark, [x, 0.96, y], [1.003, 0.032, 1.003]);
        }
        if (!near && !alcove && (x + y) % 3 === 0) {
          const pillarH = 1.78;
          const px = x + (east ? 0.48 : 0),
            py = y + (south ? 0.48 : 0);
          batch.add(GEO.cylinder, wall, [px, pillarH / 2, py], [0.24, pillarH, 0.24]);
          batch.add(GEO.cylinder, trim, [px, 0.16, py], [0.32, 0.23, 0.32]);
          batch.add(GEO.cylinder, trim, [px, pillarH, py], [0.31, 0.18, 0.31]);
          batch.add(GEO.cone, wallDark, [px, pillarH + 0.2, py], [0.27, 0.32, 0.27]);
          batch.add(GEO.box, gold, [px, pillarH - 0.2, py], [0.45, 0.055, 0.45]);
        }
        if (!near && !alcove && (x * 7 + y * 11) % 8 === 0) {
          const tx = x + (east ? 0.56 : west ? -0.56 : 0);
          const ty = y + (south ? 0.56 : north ? -0.56 : 0);
          batch.add(GEO.cylinder, gold, [tx, 0.83, ty], [0.055, 0.43, 0.055]);
          batch.add(GEO.cone, dark, [tx, 1.03, ty], [0.14, 0.19, 0.14], [Math.PI, 0, 0]);
          this.addTorch(tx, ty, 1.17, n * 20);
        }
        if (!near && !alcove && n > 0.66 && (x + y) % 3 !== 0) {
          const px = x + (east ? 0.51 : 0),
            pz = y + (south ? 0.51 : 0);
          const yaw = east ? Math.PI / 2 : 0;
          const add = (geo, mat, p, s, r = [0, 0, 0]) => {
            const dx = Math.cos(yaw) * p[0] + Math.sin(yaw) * p[2];
            const dz = -Math.sin(yaw) * p[0] + Math.cos(yaw) * p[2];
            batch.add(geo, mat, [px + dx, p[1], pz + dz], s, [r[0], r[1] + yaw, r[2]]);
          };
          if (chapterId === 'rootbound') {
            add(GEO.cylinder, bark, [0, 0.58, 0.02], [0.07, 1.15, 0.08], [0, 0, 0.17]);
            for (let j = 0; j < 3; j++) {
              add(
                GEO.cylinder,
                bark,
                [j % 2 ? -0.16 : 0.16, 0.38 + j * 0.28, 0.08],
                [0.04, 0.43, 0.04],
                [0, 0, j % 2 ? -0.8 : 0.8],
              );
              add(
                GEO.gem,
                leaves,
                [j % 2 ? -0.3 : 0.3, 0.51 + j * 0.28, 0.06],
                [0.19, 0.1, 0.1],
                [0, 0, 0.2],
              );
            }
            add(GEO.cylinder, trim, [0.26, 0.12, 0.19], [0.03, 0.2, 0.03]);
            add(GEO.sphere, rune, [0.26, 0.24, 0.19], [0.14, 0.045, 0.11]);
          } else if (chapterId === 'glass_archive') {
            add(GEO.box, dark, [0, 0.62, 0.02], [0.75, 1.05, 0.1]);
            for (let j = 0; j < 3; j++) {
              add(GEO.box, gold, [0, 0.26 + j * 0.32, 0.08], [0.78, 0.035, 0.2]);
              for (let k = 0; k < 5; k++)
                add(
                  GEO.box,
                  k % 2 ? wall : rune,
                  [-0.27 + k * 0.13, 0.39 + j * 0.32, 0.06],
                  [0.085, 0.2 - (k % 2) * 0.035, 0.11],
                  [0, 0, k === 0 ? -0.15 : 0],
                );
            }
          } else if (chapterId === 'iron_court') {
            add(GEO.box, dark, [0, 0.59, 0.02], [0.72, 0.96, 0.11]);
            add(GEO.box, flame, [0, 0.57, 0.088], [0.56, 0.72, 0.015]);
            for (let j = 0; j < 5; j++)
              add(GEO.box, wallDark, [-0.26 + j * 0.13, 0.59, 0.12], [0.06, 0.85, 0.09]);
            add(GEO.box, gold, [0, 0.17, 0.1], [0.74, 0.09, 0.16]);
            add(GEO.box, gold, [0, 1.05, 0.1], [0.74, 0.09, 0.16]);
          } else if (chapterId === 'drowned_court') {
            for (let j = 0; j < 4; j++) {
              add(
                GEO.cylinder,
                coral,
                [-0.25 + j * 0.16, 0.24 + (j % 2) * 0.08, 0.1],
                [0.035, 0.43 + (j % 2) * 0.16, 0.035],
                [0.2, 0, (j - 1.5) * 0.3],
              );
              add(
                GEO.gem,
                rune,
                [-0.31 + j * 0.2, 0.45 + (j % 2) * 0.15, 0.12],
                [0.07, 0.09, 0.07],
              );
            }
            add(GEO.sphere, wall, [0, 0.1, 0.11], [0.38, 0.09, 0.23]);
          } else if (chapterId === 'starless_heart') {
            add(GEO.gem, dark, [0, 0.45, 0.05], [0.25, 0.52, 0.21]);
            add(GEO.gem, rune, [0, 1.12, 0.08], [0.15, 0.3, 0.14], [0, 0.3, 0.1]);
            for (let j = 0; j < 3; j++)
              add(GEO.gem, gold, [(j - 1) * 0.25, 0.62 + j * 0.17, 0.11], [0.03, 0.08, 0.03]);
          } else {
            add(GEO.box, dark, [0, 0.69, 0.07], [0.45, 0.66, 0.035]);
            add(GEO.box, gold, [0, 1.07, 0.1], [0.58, 0.045, 0.07]);
            add(GEO.taper, gold, [0, 0.81, 0.12], [0.18, 0.24, 0.15]);
            add(GEO.sphere, gold, [0, 0.69, 0.12], [0.045, 0.06, 0.045]);
            add(GEO.box, rune, [0, 0.49, 0.1], [0.035, 0.22, 0.017]);
          }
        }
      }
    }
    for (let ri = 0; ri < (world.rooms || []).length; ri++) {
      const room = world.rooms[ri];
      const cx = room.cx ?? room.x + room.w / 2;
      const cy = room.cy ?? room.y + room.h / 2;
      const insetX = room.w * 0.28,
        insetY = room.h * 0.28;
      if (chapterId === 'ashen_bells' && ri % 3 !== 2) {
        // Threadbare prayer carpets lie flat and never alter navigation.
        const carpet = this.stoneMaterial('#594047', 'cloth');
        const edging = this.material('#827152');
        batch.add(
          GEO.box,
          carpet,
          [cx, 0.008, cy],
          [Math.min(3.7, room.w - 3), 0.012, Math.min(4.8, room.h - 2)],
        );
        for (const sx of [-1, 1])
          batch.add(
            GEO.box,
            edging,
            [cx + sx * 1.7, 0.017, cy],
            [0.026, 0.008, Math.min(4.6, room.h - 2.2)],
          );
        for (let j = -3; j <= 3; j++)
          for (const sz of [-1, 1])
            batch.add(GEO.box, edging, [cx + j * 0.45, 0.019, cy + sz * 2.37], [0.09, 0.01, 0.14]);
        for (const sz of [-1, 1]) {
          batch.add(
            GEO.box,
            edging,
            [cx, 0.019, cy + sz * 1.75],
            [0.31, 0.009, 0.31],
            [0, Math.PI / 4, 0],
          );
          for (const sx of [-1, 1])
            batch.add(
              GEO.box,
              edging,
              [cx + sx * 0.43, 0.019, cy + sz * 1.75],
              [0.13, 0.009, 0.13],
              [0, Math.PI / 4, 0],
            );
        }
      } else if (chapterId === 'rootbound') {
        const moss = this.material('#355546');
        const paleMoss = this.material('#526b43');
        for (let j = 0; j < 7; j++) {
          const a = hash(j, ri) * Math.PI * 2;
          const mx = cx + Math.cos(a) * insetX,
            my = cy + Math.sin(a) * insetY;
          if (isFloor(Math.round(mx), Math.round(my))) {
            batch.add(
              GEO.circle,
              j % 2 ? moss : paleMoss,
              [mx, 0.012, my],
              [0.55 + hash(j, 7) * 0.6, 0.3 + hash(j, 2) * 0.5, 1],
              [-Math.PI / 2, 0, a],
            );
            batch.add(GEO.box, bark, [mx, 0.023, my], [0.06, 0.024, 0.75], [0, a, 0]);
          }
        }
      } else if (chapterId === 'glass_archive') {
        addFloorRelief({
          batch,
          surface: this,
          x: cx,
          z: cy,
          size: Math.min(room.w, room.h) * 0.23,
          seed: ri,
        });
      } else if (chapterId === 'iron_court') {
        for (const sx of [-1, 1]) {
          batch.add(GEO.box, dark, [cx + sx * insetX, 0.003, cy], [0.36, 0.02, room.h - 2]);
          batch.add(GEO.box, flame, [cx + sx * insetX, 0.016, cy], [0.2, 0.013, room.h - 2.2]);
          for (let j = 0; j < room.h - 2; j++)
            batch.add(
              GEO.box,
              wallDark,
              [cx + sx * insetX, 0.036, room.y + 1 + j],
              [0.38, 0.038, 0.065],
            );
        }
      } else if (chapterId === 'drowned_court') {
        const water = this.material('#2c626b', { metalness: 0.55 });
        const reflection = this.material('#538993', { emissive: 0.15 });
        for (let j = 0; j < 4; j++) {
          const a = (j * Math.PI) / 2 + 0.4;
          const wx = cx + Math.cos(a) * insetX,
            wy = cy + Math.sin(a) * insetY;
          batch.add(GEO.circle, water, [wx, 0.014, wy], [0.7, 0.39, 1], [-Math.PI / 2, 0, a]);
          batch.add(GEO.box, reflection, [wx, 0.021, wy], [0.4, 0.007, 0.012], [0, a, 0]);
          batch.add(
            GEO.box,
            reflection,
            [wx + 0.13, 0.021, wy + 0.13],
            [0.21, 0.007, 0.012],
            [0, a, 0],
          );
        }
      } else if (chapterId === 'starless_heart') {
        addFloorRelief({
          batch,
          surface: this,
          x: cx,
          z: cy,
          size: Math.min(room.w, room.h) * 0.25,
          voidTheme: true,
          seed: ri,
        });
      }
      if (room.w >= 7 && room.h >= 7 && !['glass_archive', 'starless_heart'].includes(chapterId)) {
        // Inlaid geometric seals establish a visual center without hiding loot.
        const size = Math.min(room.w, room.h) * 0.23;
        for (let i = 0; i < 8; i++) {
          const a = (i * Math.PI) / 4;
          const sx = cx + Math.cos(a) * size,
            sy = cy + Math.sin(a) * size;
          if (!isFloor(Math.round(sx), Math.round(sy))) continue;
          batch.add(
            GEO.box,
            ri % 2 ? gold : rune,
            [sx, 0.014, sy],
            [0.028, 0.015, size * 0.65],
            [0, -a, 0],
          );
        }
        for (let i = 0; i < 4; i++) {
          const a = (i * Math.PI) / 2;
          batch.add(
            GEO.box,
            gold,
            [cx + Math.cos(a) * 0.47, 0.018, cy + Math.sin(a) * 0.47],
            [0.035, 0.016, 0.44],
            [0, -a, 0],
          );
        }
      }
      // Broken column stumps stay at the walls, outside the navigable room.
      if (room.w > 6 && room.h > 6) {
        for (const [px, py] of [
          [room.x - 0.5, room.y - 0.5],
          [room.x + room.w - 0.5, room.y - 0.5],
        ]) {
          batch.add(GEO.cylinder, trim, [px, 0.16, py], [0.44, 0.28, 0.44]);
          batch.add(GEO.cylinder, wall, [px, 0.77, py], [0.27, 1.12, 0.27]);
          batch.add(GEO.cylinder, gold, [px, 1.21, py], [0.31, 0.07, 0.31]);
          batch.add(GEO.cone, trim, [px, 1.4, py], [0.4, 0.26, 0.4]);
        }
      }
      // Alcove furniture is placed inside wall cells, so decorative geometry
      // cannot become an invisible obstacle to the game's tile collision.
      const alcoveX = room.x + 2,
        alcoveY = room.y - 1;
      if (!isFloor(alcoveX, alcoveY) && isFloor(alcoveX, alcoveY + 1)) {
        const z = alcoveY + 0.45;
        if (chapterId === 'ashen_bells' && ri % 2) {
          const prop = createPropVisual('sarcophagus');
          if (prop) {
            prop.position.set(alcoveX, 0.02, alcoveY - 0.08);
            prop.rotation.y = Math.PI / 2;
            prop.traverse((node) => {
              if (node.isMesh) {
                node.castShadow = true;
                node.receiveShadow = true;
              }
            });
            this.static.add(prop);
          } else {
            batch.add(GEO.box, wallDark, [alcoveX, 0.3, z], [1.6, 0.49, 0.62]);
            batch.add(GEO.box, cap, [alcoveX, 0.59, z], [1.72, 0.14, 0.67]);
            batch.add(GEO.gem, trim, [alcoveX, 0.72, z], [0.47, 0.12, 0.2]);
            batch.add(GEO.box, gold, [alcoveX, 0.86, z], [0.38, 0.024, 0.025]);
          }
        } else if (chapterId === 'glass_archive') {
          batch.add(GEO.box, bark, [alcoveX, 0.44, z], [1.65, 0.12, 0.49]);
          for (let j = 0; j < 4; j++)
            batch.add(
              GEO.box,
              j % 2 ? gold : rune,
              [alcoveX - 0.5 + j * 0.34, 0.56, z],
              [0.23, 0.09, 0.31],
              [0, j * 0.3, 0],
            );
        } else if (chapterId === 'rootbound') {
          for (let j = 0; j < 3; j++) {
            batch.add(
              GEO.cylinder,
              bark,
              [alcoveX - 0.45 + j * 0.4, 0.42, z],
              [0.085, 0.78 + j * 0.12, 0.08],
              [0, 0, (j - 1) * 0.24],
            );
            batch.add(
              GEO.gem,
              leaves,
              [alcoveX - 0.53 + j * 0.45, 0.89 + j * 0.12, z],
              [0.3, 0.22, 0.25],
            );
          }
        } else {
          batch.add(GEO.box, bark, [alcoveX, 0.4, z], [1.65, 0.1, 0.43]);
          for (const sx of [-1, 1])
            batch.add(GEO.box, dark, [alcoveX + sx * 0.6, 0.19, z], [0.12, 0.35, 0.35]);
        }
      }
    }
    addGothicArchitecture({
      batch,
      geo: GEO,
      world,
      isFloor,
      wall,
      trim,
      metal: gold,
      dark,
      surface: this,
    });
    batch.finish(this.static);
    this.createExploration(world);
    this.static.traverse((node) => {
      if (!node.isMesh) return;
      node.material = Array.isArray(node.material)
        ? node.material.map((mat) => this.presentMaterial(mat))
        : this.presentMaterial(node.material);
      for (const mat of [].concat(node.material)) this.applyExplorationMaterial(mat);
    });
    this.createEmbers();
    this.target.set(world.hero?.x || 0, 0, world.hero?.y || 0);
    this.camera.position.copy(this.target).add(this.cameraOffset);
    this.camera.lookAt(this.target);
    this.initialized = true;
    this.syncObjects(world);
  }

  addTorch(x, z, y, phase) {
    const group = new THREE.Group();
    group.position.set(x, y, z);
    const glow = this.mesh(
      GEO.gem,
      this.material('#ff982d', { emissive: 2 }),
      [0, 0, 0],
      [0.105, 0.2, 0.105],
      group,
    );
    this.mesh(
      GEO.gem,
      this.material('#ffe8a0', { emissive: 3 }),
      [0, -0.025, 0],
      [0.06, 0.12, 0.06],
      group,
    );
    this.static.add(group);
    this.torches.push({ group, glow, phase, x, z, y });
  }

  createEmbers() {
    const count = 65;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const c = i % 3 ? color('#bf9969') : this.accent;
      colors.set([c.r, c.g, c.b], i * 3);
    }
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const material = new THREE.PointsMaterial({
      size: 0.045,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      vertexColors: true,
      sizeAttenuation: true,
    });
    this.embers = new THREE.Points(geometry, material);
    this.embers.frustumCulled = false;
    this.embers.userData.ownedGeometry = true;
    this.embers.userData.ownedMaterial = true;
    this.static.add(this.embers);
  }

  shadow(parent, radius = 0.4) {
    const mesh = this.mesh(
      GEO.circle,
      this.material('#080910', { basic: true, transparent: true, opacity: 0.34 }),
      [0, 0.021, 0],
      [radius, radius, radius],
      parent,
    );
    mesh.rotation.x = -Math.PI / 2;
    return mesh;
  }

  ring(radius, thickness, material, parent, y = 0.035) {
    const geometry = new THREE.RingGeometry(radius - thickness, radius, 40);
    const mesh = this.mesh(geometry, material, [0, y, 0], [1, 1, 1], parent);
    mesh.rotation.x = -Math.PI / 2;
    mesh.userData.ownedGeometry = true;
    return mesh;
  }

  createActor(data, hero = false) {
    const root = new THREE.Group();
    const model = new THREE.Group();
    root.add(model);
    const id = data.classId || 'warden';
    const mainColor = data.color || (hero ? PALETTE[id] : '#bd7770');
    const primary = this.material(mainColor);
    const cloth = this.material(color(mainColor).multiplyScalar(0.48));
    const armor = this.material(hero ? '#a6afc1' : '#595e72', { metalness: 0.6 });
    const gold = this.material(hero ? '#d0b677' : '#8d7865', { metalness: 0.4 });
    const skin = this.material(hero ? '#cba68c' : '#bcae94');
    const dark = this.material('#242536');
    const glow = this.material(mainColor, { emissive: 1.8 });
    const whiteGlow = this.material('#d2eaff', { emissive: 1.6 });
    const batch = new Batch(this);
    const shape = String(data.shape || data.type || 'humanoid').toLowerCase();
    let height = 1.1;
    let leftLeg, rightLeg;
    const weapon = new THREE.Group();
    model.add(weapon);
    const isWraith = /ghost|wraith|spirit|shade|spect|wisp|flying|cultist/.test(shape);
    const isBeast = /beast|wolf|hound|rat|crawler/.test(shape);
    const isInsect = /spider|insect|swarm|scarab/.test(shape);
    const isBrute = /brute|golem|ogre|construct|troll|demon/.test(shape);
    const assetId = hero
      ? id
      : /skeleton|bone|undead|humanoid/.test(shape)
        ? 'skeleton'
        : isWraith
          ? 'wraith'
          : isBrute
            ? 'brute'
            : null;
    const visual = createCharacterVisual(assetId, { quality: this.quality });
    if (visual) {
      this.prepareCharacterVisual(visual, hero ? null : mainColor);
      model.add(visual.root);
      height = 1.65;
    } else {
      if (!hero && isBeast) {
        height = 0.72;
        batch.add(GEO.sphere, cloth, [0, 0.4, 0], [0.3, 0.27, 0.47]);
        batch.add(GEO.gem, primary, [0, 0.52, 0.37], [0.26, 0.24, 0.31]);
        batch.add(GEO.box, dark, [0, 0.46, 0.58], [0.19, 0.13, 0.21]);
        for (const sx of [-1, 1]) {
          batch.add(
            GEO.cone,
            primary,
            [sx * 0.15, 0.74, 0.3],
            [0.08, 0.23, 0.07],
            [0.1, 0, sx * -0.15],
          );
          batch.add(GEO.gem, glow, [sx * 0.16, 0.58, 0.52], [0.045, 0.035, 0.03]);
          batch.add(GEO.box, cloth, [sx * 0.2, 0.16, -0.25], [0.1, 0.29, 0.12]);
          batch.add(GEO.box, cloth, [sx * 0.2, 0.16, 0.27], [0.1, 0.29, 0.12]);
        }
        batch.add(GEO.cone, cloth, [0, 0.44, -0.54], [0.09, 0.42, 0.1], [-1.1, 0, 0]);
        for (let i = 0; i < 3; i++)
          batch.add(GEO.cone, armor, [0, 0.65, -0.2 + i * 0.2], [0.09, 0.2, 0.08], [-0.5, 0, 0]);
      } else if (!hero && isInsect) {
        height = 0.6;
        batch.add(GEO.sphere, dark, [0, 0.32, -0.1], [0.32, 0.24, 0.38]);
        batch.add(GEO.gem, primary, [0, 0.36, 0.27], [0.25, 0.2, 0.25]);
        batch.add(GEO.gem, glow, [0, 0.52, -0.1], [0.12, 0.05, 0.2]);
        for (const sx of [-1, 1]) {
          for (let i = 0; i < 3; i++) {
            batch.add(
              GEO.box,
              cloth,
              [sx * 0.4, 0.28, -0.25 + i * 0.25],
              [0.48, 0.065, 0.065],
              [0, (i - 1) * sx * 0.5, sx * -0.35],
            );
            batch.add(
              GEO.box,
              primary,
              [sx * 0.6, 0.13, -0.31 + i * 0.3],
              [0.065, 0.28, 0.065],
              [0, 0, sx * 0.3],
            );
          }
          batch.add(GEO.gem, glow, [sx * 0.11, 0.4, 0.45], [0.04, 0.04, 0.035]);
        }
      } else if (!hero && isWraith) {
        height = 1.25;
        batch.add(GEO.cone, cloth, [0, 0.6, 0], [0.32, 0.9, 0.27]);
        batch.add(GEO.sphere, primary, [0, 1.03, 0], [0.23, 0.26, 0.22]);
        batch.add(GEO.box, dark, [0, 1.04, 0.185], [0.27, 0.17, 0.035]);
        for (const sx of [-1, 1]) {
          batch.add(GEO.gem, glow, [sx * 0.075, 1.07, 0.21], [0.037, 0.022, 0.025]);
          batch.add(GEO.cone, primary, [sx * 0.32, 0.67, 0], [0.11, 0.58, 0.11], [0, 0, sx * 0.8]);
        }
        batch.add(GEO.gem, glow, [0, 0.63, 0.25], [0.075, 0.12, 0.06]);
        this.ring(
          0.4,
          0.022,
          this.material(mainColor, { basic: true, transparent: true, opacity: 0.6 }),
          root,
        );
      } else {
        const brute = !hero && isBrute;
        const skeleton = !hero && /skeleton|bone|undead|humanoid/.test(shape);
        const torso = skeleton ? skin : brute ? armor : primary;
        const shoulderWidth = brute ? 0.35 : 0.23;
        height = brute ? 1.4 : 1.12;
        leftLeg = this.mesh(GEO.box, dark, [-0.13, 0.21, 0], [0.17, 0.36, 0.2], model);
        rightLeg = this.mesh(GEO.box, dark, [0.13, 0.21, 0], [0.17, 0.36, 0.2], model);
        batch.add(GEO.taper, cloth, [0, 0.42, 0], [brute ? 0.38 : 0.28, 0.3, 0.22]);
        batch.add(
          GEO.taper,
          torso,
          [0, 0.68, 0],
          [brute ? 0.42 : 0.29, brute ? 0.5 : 0.38, brute ? 0.29 : 0.2],
          [0, 0, Math.PI],
        );
        batch.add(GEO.box, gold, [0, 0.49, 0.017], [brute ? 0.6 : 0.48, 0.075, 0.4]);
        batch.add(GEO.gem, glow, [0, 0.5, 0.225], [0.055, 0.065, 0.025]);
        batch.add(
          GEO.sphere,
          skeleton ? skin : hero ? skin : primary,
          [0, brute ? 1.17 : 1, 0],
          [brute ? 0.26 : 0.19, brute ? 0.25 : 0.19, 0.185],
        );
        for (const sx of [-1, 1]) {
          batch.add(
            GEO.gem,
            brute || id === 'warden' ? armor : cloth,
            [sx * shoulderWidth, 0.83, 0],
            [brute ? 0.26 : 0.17, 0.17, 0.22],
          );
          batch.add(
            GEO.box,
            cloth,
            [sx * (shoulderWidth + 0.07), 0.63, 0],
            [0.13, 0.28, 0.16],
            [0, 0, sx * 0.15],
          );
          if (!hero)
            batch.add(
              GEO.gem,
              glow,
              [sx * 0.072, brute ? 1.2 : 1.015, 0.164],
              [0.037, 0.025, 0.033],
            );
        }
        if (skeleton) {
          for (let i = 0; i < 3; i++)
            batch.add(GEO.box, dark, [0, 0.59 + i * 0.08, 0.2], [0.34, 0.028, 0.032]);
          batch.add(GEO.box, dark, [0, 0.95, 0.16], [0.11, 0.027, 0.035]);
        }
        if (hero && id === 'warden') {
          batch.add(GEO.sphere, armor, [0, 1.075, -0.015], [0.205, 0.15, 0.2]);
          batch.add(GEO.box, dark, [0, 1.015, 0.181], [0.23, 0.04, 0.035]);
          batch.add(GEO.box, primary, [0, 1.2, -0.07], [0.055, 0.16, 0.2]);
          batch.add(GEO.box, cloth, [0, 0.64, -0.235], [0.4, 0.62, 0.045], [-0.18, 0, 0]);
          batch.add(GEO.gem, armor, [-0.38, 0.57, 0.16], [0.27, 0.37, 0.1]);
          batch.add(GEO.gem, primary, [-0.38, 0.57, 0.235], [0.2, 0.29, 0.04]);
          batch.add(GEO.box, gold, [-0.38, 0.57, 0.27], [0.05, 0.35, 0.035]);
        } else if (hero && id === 'ranger') {
          batch.add(GEO.sphere, cloth, [0, 1.07, -0.015], [0.21, 0.17, 0.21]);
          batch.add(GEO.cone, primary, [0, 1.19, -0.09], [0.16, 0.25, 0.17], [-0.6, 0, 0]);
          batch.add(GEO.box, cloth, [0, 0.64, -0.22], [0.34, 0.52, 0.045], [-0.15, 0, 0]);
          batch.add(GEO.cylinder, gold, [-0.13, 0.74, -0.3], [0.07, 0.5, 0.07], [0, 0, -0.3]);
          for (let i = 0; i < 3; i++)
            batch.add(
              GEO.box,
              skin,
              [-0.19 + i * 0.035, 1.02, -0.3],
              [0.015, 0.29, 0.015],
              [0, 0, -0.3],
            );
        } else if (hero && (id === 'arcanist' || id === 'oracle')) {
          batch.add(GEO.taper, primary, [0, 0.35, 0], [0.3, 0.56, 0.27]);
          batch.add(GEO.box, gold, [0, 0.7, 0.21], [0.055, 0.39, 0.025]);
          batch.add(GEO.sphere, cloth, [0, 1.04, -0.04], [0.21, 0.21, 0.2]);
          if (id === 'arcanist') {
            batch.add(GEO.cone, primary, [0, 1.34, -0.03], [0.23, 0.47, 0.22], [-0.15, 0, 0]);
            batch.add(GEO.cylinder, gold, [0, 1.13, -0.03], [0.25, 0.055, 0.24]);
          } else {
            for (const sx of [-1, 1])
              batch.add(
                GEO.cone,
                gold,
                [sx * 0.15, 1.25, -0.04],
                [0.065, 0.32, 0.07],
                [0, 0, -sx * 0.3],
              );
            batch.add(GEO.gem, whiteGlow, [0, 1.2, 0.07], [0.08, 0.15, 0.06]);
          }
        } else if (hero && id === 'reaver') {
          batch.add(GEO.gem, armor, [0.29, 0.86, 0], [0.22, 0.19, 0.25]);
          batch.add(GEO.box, skin, [-0.28, 0.65, 0], [0.17, 0.35, 0.16]);
          batch.add(GEO.box, cloth, [0, 1.095, -0.01], [0.2, 0.1, 0.32]);
          batch.add(GEO.box, primary, [0, 1.02, 0.17], [0.28, 0.065, 0.025]);
        } else if (brute) {
          for (const sx of [-1, 1]) {
            batch.add(
              GEO.cone,
              gold,
              [sx * 0.24, 1.4, -0.01],
              [0.09, 0.35, 0.1],
              [0, 0, -sx * 0.5],
            );
            batch.add(
              GEO.cone,
              primary,
              [sx * 0.38, 0.98, -0.04],
              [0.13, 0.34, 0.12],
              [0, 0, -sx * 0.65],
            );
          }
        }
        // Weapons move independently of the merged torso.
        weapon.position.set(0.31, 0.58, 0.13);
        const wb = new Batch(this);
        if (hero && id === 'ranger') {
          for (let i = 0; i < 7; i++) {
            const a = -0.95 + i * 0.32;
            wb.add(
              GEO.box,
              gold,
              [0, Math.sin(a) * 0.47, 0.22 + Math.cos(a) * 0.22],
              [0.045, 0.17, 0.045],
              [a * 0.8, 0, 0],
            );
          }
          wb.add(GEO.box, skin, [0, 0, 0.34], [0.008, 0.77, 0.008]);
          wb.add(GEO.box, armor, [0, 0, 0.49], [0.016, 0.016, 0.57]);
        } else if (hero && (id === 'arcanist' || id === 'oracle')) {
          wb.add(GEO.cylinder, gold, [0.09, 0.1, 0.03], [0.033, 1.25, 0.033]);
          wb.add(GEO.gem, glow, [0.09, 0.83, 0.03], [0.13, 0.19, 0.13]);
          for (const sx of [-1, 1])
            wb.add(
              GEO.cone,
              gold,
              [0.09 + sx * 0.12, 0.75, 0.03],
              [0.038, 0.27, 0.04],
              [0, 0, sx * -0.4],
            );
        } else if ((hero && id === 'reaver') || brute) {
          wb.add(GEO.cylinder, gold, [0, 0.14, 0.08], [0.035, 0.88, 0.035]);
          wb.add(GEO.gem, armor, [0, 0.54, 0.08], [0.29, 0.26, 0.055]);
          wb.add(GEO.gem, primary, [0, 0.53, 0.115], [0.18, 0.16, 0.03]);
        } else {
          wb.add(GEO.box, gold, [0, 0, 0.12], [0.055, 0.24, 0.06]);
          wb.add(GEO.box, gold, [0, 0.15, 0.12], [0.28, 0.055, 0.07]);
          wb.add(GEO.box, armor, [0, 0.41, 0.12], [0.075, 0.49, 0.035]);
          wb.add(GEO.cone, armor, [0, 0.7, 0.12], [0.055, 0.14, 0.025]);
          wb.add(GEO.box, whiteGlow, [0.029, 0.41, 0.145], [0.012, 0.45, 0.005]);
        }
        wb.finish(weapon);
      }
      batch.finish(model);
    }
    const scale = data.scale || (data.boss ? 1.65 : 1);
    model.scale.setScalar(scale);
    this.shadow(root, (data.boss ? 0.65 : 0.35) * Math.max(1, scale * 0.8));
    if (hero) {
      this.ring(
        0.4,
        0.025,
        this.material(mainColor, { basic: true, transparent: true, opacity: 0.75 }),
        root,
      );
      this.ring(
        0.47,
        0.01,
        this.material(mainColor, { basic: true, transparent: true, opacity: 0.3 }),
        root,
      );
    }
    if (data.boss) {
      this.ring(
        0.85,
        0.028,
        this.material('#e87075', { basic: true, transparent: true, opacity: 0.7 }),
        root,
      );
    }
    const health = new THREE.Group();
    const barWidth = data.boss ? 1.25 : 0.64;
    const back = this.mesh(
      GEO.plane,
      this.material('#191826', { basic: true }),
      [0, 0, 0],
      [barWidth + 0.055, 0.08, 1],
      health,
    );
    const bar = this.mesh(
      GEO.plane,
      this.material(data.boss ? '#fda15e' : '#e98786', { basic: true }),
      [0, 0, 0.008],
      [barWidth, 0.045, 1],
      health,
    );
    health.position.y = height * scale + 0.27;
    health.visible = false;
    root.add(health);
    this.dynamic.add(root);
    return {
      root,
      model,
      visual,
      weapon,
      leftLeg,
      rightLeg,
      health,
      bar,
      back,
      barWidth,
      previousX: data.x,
      previousY: data.y,
      phase: hash(data.x, data.y) * 7,
      isWraith,
      scale,
      height,
    };
  }

  createObject(data) {
    const group = new THREE.Group();
    const batch = new Batch(this);
    const stone = this.stoneMaterial('#8b929a', 'runestone');
    const dark = this.material('#27283a');
    const gold = this.material('#c5a864', { metalness: 0.65 });
    const wood = this.material('#674b44');
    const accent = this.material(this.accent, { emissive: 1.4 });
    const object = { group, animated: [], type: data.type };
    this.shadow(group, 0.52);
    if (data.type === 'portal' || data.type === 'waypoint') {
      const small = data.type === 'waypoint';
      batch.add(GEO.cylinder, dark, [0, 0.07, 0], [0.77, 0.13, 0.77]);
      batch.add(GEO.cylinder, stone, [0, 0.16, 0], [0.65, 0.12, 0.65]);
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4;
        batch.add(
          GEO.box,
          gold,
          [Math.cos(a) * 0.66, 0.24, Math.sin(a) * 0.66],
          [0.15, 0.09, 0.15],
          [0, -a, 0],
        );
      }
      if (small) {
        const diamond = this.mesh(GEO.gem, accent, [0, 0.72, 0], [0.26, 0.48, 0.26], group);
        object.animated.push(diamond);
        this.ring(0.56, 0.045, accent, group, 0.23);
      } else {
        // A freestanding engraved gateway, with concentric, drifting energy arcs.
        const energy = this.presentMaterial(accent).clone();
        object.portalMaterial = energy;
        for (const sx of [-1, 1]) {
          batch.add(GEO.box, stone, [sx * 0.73, 0.77, 0], [0.21, 1.18, 0.24], [0, 0, -sx * 0.14]);
          batch.add(GEO.cone, gold, [sx * 0.61, 1.52, 0], [0.17, 0.5, 0.17], [0, 0, sx * 0.75]);
          batch.add(GEO.gem, accent, [sx * 0.7, 0.79, 0.15], [0.07, 0.13, 0.045]);
        }
        const portal = new THREE.Group();
        portal.position.y = 1.05;
        portal.rotation.y = Math.PI / 4;
        group.add(portal);
        for (let i = 0; i < 3; i++) {
          const geometry = new THREE.TorusGeometry(
            0.63 + i * 0.065,
            0.018 + i * 0.006,
            4,
            40,
            i === 1 ? Math.PI * 1.55 : Math.PI * 2,
          );
          const ring = this.mesh(
            geometry,
            i === 1 ? gold : energy,
            [0, 0, i * 0.015],
            [1, 1.17, 1],
            portal,
          );
          ring.userData.ownedGeometry = true;
          if (i === 0) ring.userData.ownedMaterial = true;
          object.animated.push(ring);
        }
        const inner = this.mesh(
          GEO.circle,
          this.material(this.accent, { basic: true, transparent: true, opacity: 0.14 }).clone(),
          [0, 0, -0.018],
          [0.58, 0.7, 1],
          portal,
        );
        inner.userData.ownedMaterial = true;
        object.inner = inner;
        for (let i = 0; i < 9; i++) {
          const a = (i * Math.PI * 2) / 9;
          const mote = this.mesh(
            GEO.gem,
            accent,
            [Math.cos(a) * 0.46, Math.sin(a) * 0.53, 0.03],
            [0.025, 0.055, 0.025],
            portal,
          );
          mote.rotation.z = -a;
        }
        object.portal = portal;
      }
    } else if (data.type === 'chest') {
      batch.add(GEO.box, dark, [0, 0.13, 0], [0.75, 0.22, 0.53]);
      batch.add(GEO.box, wood, [0, 0.3, 0], [0.69, 0.35, 0.5]);
      for (const sx of [-1, 1]) batch.add(GEO.box, gold, [sx * 0.24, 0.3, 0], [0.055, 0.4, 0.53]);
      const lid = new THREE.Group();
      lid.position.set(0, 0.48, -0.22);
      const lb = new Batch(this);
      lb.add(GEO.box, wood, [0, 0.06, 0.22], [0.72, 0.15, 0.52]);
      lb.add(GEO.box, gold, [0, 0.14, 0.22], [0.73, 0.035, 0.53]);
      for (const sx of [-1, 1]) lb.add(GEO.box, gold, [sx * 0.24, 0.09, 0.22], [0.055, 0.16, 0.54]);
      lb.finish(lid);
      group.add(lid);
      object.lid = lid;
      batch.add(GEO.gem, gold, [0, 0.42, 0.28], [0.095, 0.105, 0.035]);
      object.spark = this.mesh(
        GEO.gem,
        this.material('#ffe8a0', { emissive: 1.6 }),
        [0, 0.43, 0.307],
        [0.025, 0.045, 0.015],
        group,
      );
    } else if (data.type === 'shrine') {
      const prop = createPropVisual('shrine');
      if (prop) {
        prop.traverse((node) => {
          if (node.isMesh) {
            node.castShadow = true;
            node.receiveShadow = true;
          }
        });
        group.add(prop);
      } else {
        batch.add(GEO.box, dark, [0, 0.08, 0], [0.95, 0.16, 0.85]);
        batch.add(GEO.box, stone, [0, 0.27, 0], [0.66, 0.32, 0.58]);
        batch.add(GEO.box, gold, [0, 0.46, 0], [0.79, 0.1, 0.7]);
        batch.add(GEO.taper, stone, [0, 0.81, -0.13], [0.19, 0.62, 0.19]);
        batch.add(GEO.sphere, gold, [0, 1.22, -0.13], [0.16, 0.18, 0.15]);
        for (const sx of [-1, 1])
          batch.add(
            GEO.cone,
            stone,
            [sx * 0.27, 0.94, -0.1],
            [0.12, 0.6, 0.15],
            [0, 0, -sx * 0.85],
          );
        const gem = this.mesh(
          GEO.gem,
          this.material('#7cebbb', { emissive: 1.4 }),
          [0, 0.78, 0.28],
          [0.1, 0.17, 0.1],
          group,
        );
        object.animated.push(gem);
        object.spark = gem;
        this.ring(
          0.68,
          0.035,
          this.material('#74dba6', { basic: true, transparent: true, opacity: 0.55 }),
          group,
        );
      }
    } else if (data.type === 'lore') {
      batch.add(GEO.box, stone, [0, 0.22, 0], [0.5, 0.42, 0.44]);
      batch.add(GEO.box, gold, [0, 0.48, 0], [0.63, 0.08, 0.49], [0.18, 0, 0]);
      batch.add(GEO.box, wood, [0, 0.54, 0], [0.45, 0.06, 0.35], [0.18, 0, 0]);
      batch.add(
        GEO.box,
        this.material('#ded2b2'),
        [0, 0.579, 0.01],
        [0.39, 0.025, 0.29],
        [0.18, 0, 0],
      );
      batch.add(GEO.box, gold, [0, 0.594, 0.01], [0.025, 0.02, 0.3], [0.18, 0, 0]);
      object.spark = this.mesh(
        GEO.gem,
        this.material('#f8d886', { emissive: 1.7 }),
        [0, 0.96, 0],
        [0.065, 0.12, 0.065],
        group,
      );
      object.animated.push(object.spark);
    } else if (data.type === 'npc') {
      object.visual = createCharacterVisual('oracle', { quality: this.quality });
      this.prepareCharacterVisual(object.visual);
      if (object.visual) {
        object.visual.root.rotation.y = 0.55;
        group.add(object.visual.root);
      } else {
        batch.add(GEO.taper, this.material('#5c8298'), [0, 0.39, 0], [0.31, 0.69, 0.25]);
        batch.add(GEO.sphere, this.material('#c3a18a'), [0, 0.93, 0], [0.19, 0.2, 0.18]);
        batch.add(GEO.sphere, dark, [0, 1.04, -0.03], [0.21, 0.17, 0.19]);
        batch.add(GEO.box, gold, [0, 0.68, 0.22], [0.045, 0.35, 0.03]);
        batch.add(GEO.cylinder, wood, [0.34, 0.55, 0.07], [0.04, 1.09, 0.04]);
      }
      const marker = this.mesh(
        GEO.gem,
        this.material('#f4d78a', { emissive: 1.2 }),
        [0, object.visual ? 1.95 : 1.5, 0],
        [0.1, 0.17, 0.1],
        group,
      );
      object.animated.push(marker);
      this.ring(
        0.48,
        0.024,
        this.material('#f4d78a', { basic: true, transparent: true, opacity: 0.6 }),
        group,
      );
    }
    batch.finish(group);
    group.traverse((node) => {
      if (node.isMesh)
        node.material = Array.isArray(node.material)
          ? node.material.map((mat) => this.presentMaterial(mat))
          : this.presentMaterial(node.material);
    });
    group.position.set(data.x, 0, data.y);
    this.dynamic.add(group);
    return object;
  }

  syncObjects(world) {
    const active = new Set();
    (world.objects || []).forEach((data, index) => {
      const id = data.id ?? `${data.type}:${index}`;
      active.add(id);
      let object = this.objectModels.get(id);
      if (!object) {
        object = this.createObject(data);
        this.objectModels.set(id, object);
      }
      object.used = data.used;
      object.group.position.set(data.x, 0, data.y);
      object.group.visible = this.isExplored(world, data.x, data.y);
      if (object.portalMaterial) {
        const unlocked = world.portalOpen !== false;
        object.portalMaterial.color.copy(unlocked ? color('#f0c878') : this.accent);
        object.portalMaterial.emissive.copy(object.portalMaterial.color);
        object.portalMaterial.emissiveIntensity = unlocked ? 1.8 : 0.55;
        object.inner.material.color.copy(object.portalMaterial.color);
      }
      if (object.lid) object.lid.rotation.x = data.used ? -1.65 : 0;
      if (object.spark) object.spark.visible = !data.used;
    });
    this.removeMissing(this.objectModels, active, 'group');
  }

  removeMissing(models, active, key = 'root') {
    for (const [id, model] of models) {
      if (active.has(id)) continue;
      model.visual?.dispose();
      const object = model[key] || model;
      this.clearGroup(object);
      if (object.userData?.ownedGeometry) object.geometry?.dispose();
      if (object.userData?.ownedMaterial) object.material?.dispose();
      object.removeFromParent();
      models.delete(id);
    }
  }

  createExploration(world) {
    this.revealUniform.value?.dispose();
    const height = world.map.length,
      width = world.map[0].length;
    this.revealSize.value.set(width, height);
    this.revealPixels = new Uint8Array(width * height);
    const texture = new THREE.DataTexture(this.revealPixels, width, height, THREE.RedFormat);
    texture.minFilter = texture.magFilter = THREE.LinearFilter;
    texture.unpackAlignment = 1;
    this.revealUniform.value = texture;
    this.updateExploration(world, true);
  }

  applyExplorationMaterial(material) {
    if (material.userData.explorationShader) return;
    material.userData.explorationShader = true;
    const previous = material.onBeforeCompile;
    material.onBeforeCompile = (shader) => {
      previous.call(material, shader);
      shader.uniforms.revealMap = this.revealUniform;
      shader.uniforms.revealSize = this.revealSize;
      shader.vertexShader = 'varying vec3 vExplorePosition;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace(
        '#include <project_vertex>',
        '#include <project_vertex>\nvExplorePosition=(modelMatrix*vec4(transformed,1.)).xyz;',
      );
      shader.fragmentShader =
        'uniform sampler2D revealMap; uniform vec2 revealSize; varying vec3 vExplorePosition;\n' +
        shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <opaque_fragment>',
        'float exploredLight=texture2D(revealMap,(vExplorePosition.xz+.5)/revealSize).r;\noutgoingLight*=mix(.07,1.,smoothstep(.04,.96,exploredLight));\n#include <opaque_fragment>',
      );
    };
    material.customProgramCacheKey = () => 'exploration-v1';
    material.needsUpdate = true;
  }

  updateExploration(world, force = false) {
    if (!this.revealPixels || (!force && world.time < this.nextRevealUpdate)) return;
    this.nextRevealUpdate = world.time + 0.2;
    const { x: width, y: height } = this.revealSize.value;
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        // Reveal the enclosing walls with the room, keeping unexplored corridors dark.
        let revealed = !world.explored || !!world.explored[y]?.[x];
        if (!revealed && world.map[y][x] !== 0)
          for (let dy = -1; dy <= 1 && !revealed; dy++)
            for (let dx = -1; dx <= 1; dx++)
              if (world.explored[y + dy]?.[x + dx]) {
                revealed = true;
                break;
              }
        this.revealPixels[y * width + x] = revealed ? 255 : 0;
      }
    this.revealUniform.value.needsUpdate = true;
  }

  isExplored(world, x, y) {
    const explored = world.explored;
    if (Array.isArray(explored) && Array.isArray(explored[0]))
      return !!explored[Math.round(y)]?.[Math.round(x)];
    return true;
  }

  updateActors(world, dt, time) {
    const active = new Set();
    const list = [{ ...world.hero, id: '$hero', isHero: true }, ...(world.enemies || [])];
    for (let i = 0; i < list.length; i++) {
      const data = list[i];
      if (!Number.isFinite(data.x) || !Number.isFinite(data.y)) continue;
      const id = data.id ?? `enemy:${i}`;
      if (data.dead || (data.hp <= 0 && !data.isHero)) {
        const corpse = this.actors.get(id);
        // Only an enemy seen alive gets a brief visual death; loaded corpses do
        // not resurrect. This is presentation only and does not alter combat.
        if (corpse?.visual) {
          corpse.deathAge = (corpse.deathAge || 0) + (world.mode === 'paused' ? 0 : dt);
          if (corpse.deathAge < 1.3) {
            active.add(id);
            corpse.health.visible = false;
            corpse.visual.update({ ...data, dead: true }, world.mode === 'paused' ? 0 : dt, time);
            corpse.model.position.y = -Math.max(0, corpse.deathAge - 0.85) * 1.4;
          }
        }
        continue;
      }
      active.add(id);
      let actor = this.actors.get(id);
      if (!actor) {
        actor = this.createActor(data, data.isHero);
        this.actors.set(id, actor);
      }
      if (Number.isFinite(actor.previousHp) && data.hp < actor.previousHp) {
        actor.hitUntil = world.time + 0.36;
        if (data.isHero) this.impactShake = 0.065;
      }
      actor.previousHp = data.hp;
      const dx = data.x - actor.previousX,
        dy = data.y - actor.previousY;
      const moving = dx * dx + dy * dy > 0.00001;
      actor.phase += dt * (moving ? 13 : 2);
      actor.previousX = data.x;
      actor.previousY = data.y;
      actor.root.position.set(data.x, 0, data.y);
      const distance = Math.hypot(data.x - world.hero.x, data.y - world.hero.y);
      actor.root.visible = data.isHero || (distance < 19 && this.isExplored(world, data.x, data.y));
      let facing = typeof data.facing === 'number' ? data.facing : null;
      if (facing === null && data.facing && typeof data.facing === 'object')
        facing = Math.atan2(data.facing.x || 0, data.facing.y || 0);
      if (facing === null && moving) facing = Math.atan2(dx, dy);
      if (facing !== null) actor.model.rotation.y = facing;
      const reduced = world.settings?.reducedMotion;
      if (actor.visual) {
        if (actor.root.visible)
          actor.visual.update(
            {
              ...data,
              moving,
              castTime: data.isHero ? Math.max(0, (this.heroCastUntil || 0) - world.time) : 0,
              hitTime: Math.max(
                0,
                Math.max(actor.hitUntil || 0, data.isHero ? this.heroHitUntil : 0) - world.time,
              ),
              reducedMotion: reduced,
            },
            world.mode === 'paused' ? 0 : dt,
            time,
          );
        actor.model.position.y = 0;
      } else {
        actor.model.position.y = reduced
          ? 0
          : actor.isWraith
            ? 0.09 + Math.sin(time * 2 + actor.phase) * 0.055
            : moving
              ? Math.abs(Math.sin(actor.phase)) * 0.045
              : Math.sin(time * 2 + actor.phase) * 0.009;
        const stride = moving && !reduced ? Math.sin(actor.phase) * 0.47 : 0;
        if (actor.leftLeg) actor.leftLeg.rotation.x = stride;
        if (actor.rightLeg) actor.rightLeg.rotation.x = -stride;
        const attack = Math.max(0, Math.min(1, Number(data.attackTime) || 0));
        actor.weapon.rotation.x =
          attack > 0
            ? -0.9 - Math.sin(attack * 12) * 0.8
            : moving
              ? Math.sin(actor.phase) * 0.1
              : 0;
        actor.weapon.rotation.z = attack > 0 ? -0.6 : 0;
        actor.model.rotation.z = data.dashTime > 0 ? -0.15 : 0;
        if (data.isHero && data.hp <= 0) actor.model.rotation.z = -Math.PI / 2;
      }
      actor.health.visible = !data.isHero && (data.hp < data.maxHp || data.boss) && distance < 12;
      actor.health.quaternion.copy(this.camera.quaternion);
      const ratio = Math.max(0, Math.min(1, data.hp / (data.maxHp || 1)));
      actor.bar.scale.x = actor.barWidth * ratio;
      actor.bar.position.x = (-(1 - ratio) * actor.barWidth) / 2;
    }
    this.removeMissing(this.actors, active);
  }

  updateDrops(world, time) {
    const active = new Set();
    (world.loot || []).forEach((data, index) => {
      const id = data.id ?? `loot:${index}`;
      active.add(id);
      let model = this.lootModels.get(id);
      if (!model) {
        const root = new THREE.Group();
        const c = data.color || (data.type === 'gold' ? '#f5cc69' : '#a3daee');
        const gem = this.mesh(
          data.type === 'gold' ? GEO.cylinder : GEO.gem,
          this.material(c, { emissive: 0.8, metalness: 0.3 }),
          [0, 0.19, 0],
          data.type === 'gold' ? [0.11, 0.055, 0.11] : [0.1, 0.18, 0.1],
          root,
        );
        this.ring(
          0.21,
          0.024,
          this.material(c, { basic: true, transparent: true, opacity: 0.55 }),
          root,
        );
        const beam = this.mesh(
          GEO.cone,
          this.material(c, { basic: true, transparent: true, opacity: 0.065 }),
          [0, 0.49, 0],
          [0.12, 0.85, 0.12],
          root,
        );
        beam.rotation.x = Math.PI;
        this.dynamic.add(root);
        model = { root, gem };
        this.lootModels.set(id, model);
      }
      model.root.position.set(data.x, 0, data.y);
      model.root.visible = this.isExplored(world, data.x, data.y);
      model.gem.position.y =
        0.2 + (world.settings?.reducedMotion ? 0 : Math.sin(time * 2.5 + index) * 0.04);
      model.gem.rotation.y = world.settings?.reducedMotion ? index : time * 0.8 + index;
    });
    this.removeMissing(this.lootModels, active);
  }

  updateProjectiles(world) {
    const active = new Set();
    (world.projectiles || []).forEach((data, index) => {
      const id = data.id ?? `projectile:${index}`;
      active.add(id);
      let model = this.projectileModels.get(id);
      if (!model) {
        const root = new THREE.Group();
        const c = data.color || '#b4dcff';
        this.mesh(GEO.gem, this.material(c, { emissive: 2 }), [0, 0, 0], [0.07, 0.08, 0.17], root);
        this.mesh(
          GEO.cone,
          this.material(c, { basic: true, transparent: true, opacity: 0.22 }),
          [0, 0, -0.24],
          [0.09, 0.48, 0.09],
          root,
        ).rotation.x = Math.PI / 2;
        this.dynamic.add(root);
        model = { root };
        this.projectileModels.set(id, model);
      }
      model.root.position.set(data.x, 0.52, data.y);
      model.root.rotation.y = Math.atan2(data.vx || 0, data.vy || 0);
      model.root.scale.setScalar(Math.max(0.7, Math.min(2, (data.radius || 0.15) * 6)));
    });
    this.removeMissing(this.projectileModels, active);
  }

  updateEffects(world, time) {
    const active = new Set();
    (world.effects || []).forEach((data, index) => {
      const id = data.id ?? `effect:${index}`;
      active.add(id);
      let model = this.effectModels.get(id);
      if (!model) {
        const root = new THREE.Group();
        const warning = data.type === 'warning';
        const c = color(warning ? '#ff4b40' : data.color || '#a6d9ff');
        const material = new THREE.MeshBasicMaterial({
          color: c,
          transparent: true,
          opacity: 0.65,
          depthWrite: false,
          side: THREE.DoubleSide,
        });
        const mesh = this.ring(1, 0.055, material, root, 0.055);
        mesh.userData.ownedMaterial = true;
        const burst = new THREE.Group();
        root.add(burst);
        for (let j = 0; j < (warning ? 0 : 3); j++) {
          const a = (j * Math.PI) / 3;
          const shard = this.mesh(
            GEO.gem,
            material,
            [Math.cos(a) * 0.7, 0.1, Math.sin(a) * 0.7],
            [0.055, 0.13, 0.055],
            burst,
          );
          shard.rotation.z = Math.cos(a) * 0.8;
        }
        let fill, countdown, crystal;
        if (warning) {
          const fillMaterial = new THREE.MeshBasicMaterial({
            color: '#df302f',
            transparent: true,
            opacity: 0.2,
            depthWrite: false,
            side: THREE.DoubleSide,
          });
          fill = this.mesh(GEO.circle, fillMaterial, [0, 0.042, 0], [0.97, 0.97, 1], root);
          fill.rotation.x = -Math.PI / 2;
          fill.userData.ownedMaterial = true;
          countdown = this.ring(0.97, 0.018, material, root, 0.06);
          for (let j = 0; j < 4; j++) {
            const a = (j * Math.PI) / 2;
            const marker = this.mesh(
              GEO.box,
              material,
              [Math.cos(a) * 0.84, 0.06, Math.sin(a) * 0.84],
              [0.1, 0.012, 0.028],
              root,
            );
            marker.rotation.y = -a;
          }
        } else if (data.type === 'totem') {
          crystal = this.mesh(GEO.gem, material, [0, 0.65, 0], [0.2, 0.4, 0.2], root);
          const reach = Math.max(0.12, data.radius || 0.5);
          this.mesh(
            GEO.cylinder,
            this.material('#777487'),
            [0, 0.14 / reach, 0],
            [0.23 / reach, 0.27 / reach, 0.23 / reach],
            root,
          );
        } else if (data.type === 'slash') {
          mesh.geometry.dispose();
          mesh.geometry = new THREE.RingGeometry(0.63, 1, 24, 1, -0.85, 2.4);
        }
        const accent =
          warning || data.type === 'totem' ? null : createCombatPresentation(data.type, c);
        if (accent) root.add(accent.group);
        if (data.type === 'slash' || data.type === 'hit') {
          mesh.visible = false;
          burst.visible = false;
        }
        this.dynamic.add(root);
        model = { root, mesh, material, burst, fill, countdown, crystal, accent, type: data.type };
        this.effectModels.set(id, model);
      }
      const remaining = Math.max(0, Math.min(1, (data.life ?? 1) / (data.maxLife || 1)));
      const radius = Math.max(0.12, data.radius || 0.5);
      model.root.position.set(data.x, 0, data.y);
      model.root.scale.setScalar(
        radius *
          (model.type === 'warning' || model.type === 'totem' ? 1 : 0.65 + (1 - remaining) * 0.35),
      );
      model.material.opacity = model.type === 'warning' ? 0.8 : remaining * 0.7;
      if (model.fill) model.fill.material.opacity = 0.12 + (1 - remaining) * 0.13;
      if (model.countdown) model.countdown.scale.setScalar(Math.max(0.02, remaining));
      if (model.crystal) {
        model.crystal.rotation.y = world.settings?.reducedMotion ? 0 : time;
        model.crystal.scale.set(0.2 / radius, 0.4 / radius, 0.2 / radius);
        model.crystal.position.y =
          (0.65 + (world.settings?.reducedMotion ? 0 : Math.sin(time * 4) * 0.035)) / radius;
        model.mesh.scale.setScalar(
          world.settings?.reducedMotion ? 1 : 0.9 + Math.sin(time * 3) * 0.1,
        );
      }
      if (model.type === 'slash')
        model.root.rotation.y = data.facing ?? data.angle ?? world.hero.facing ?? 0;
      model.accent?.update(1 - remaining, world.settings?.reducedMotion);
      model.burst.position.y = (1 - remaining) * 0.35;
      model.burst.rotation.y = world.settings?.reducedMotion ? 0 : time * 0.6;
    });
    this.removeMissing(this.effectModels, active);
  }

  render(world, dt = 0.016) {
    if (!world?.map || !world.hero || !this.pipeline || this.renderer.getContext().isContextLost())
      return;
    if (!this.initialized) this.build(world);
    this.world = world;
    dt = Math.max(0, Math.min(0.1, dt));
    const time = Number.isFinite(world.time) ? world.time : performance.now() / 1000;
    const target = new THREE.Vector3(world.hero.x, 0, world.hero.y);
    const snap = world.settings?.reducedMotion || this.target.distanceTo(target) > 12;
    this.target.lerp(target, snap ? 1 : 1 - Math.exp(-dt * 8));
    this.camera.position.copy(this.target).add(this.cameraOffset);
    if (!world.settings?.reducedMotion && this.impactShake > 0.001) {
      this.camera.position.x += Math.sin(time * 73) * this.impactShake;
      this.camera.position.y += Math.cos(time * 61) * this.impactShake * 0.6;
    }
    this.impactShake *= Math.exp(-dt * 15);
    this.camera.lookAt(this.target);
    this.sun.position.set(world.hero.x - 7, 13, world.hero.y + 9);
    this.sun.target.position.set(world.hero.x, 0, world.hero.y);
    this.heroLight.position.set(world.hero.x, 2.3, world.hero.y);
    this.updateExploration(world);
    this.updateActors(world, dt, time);
    this.syncObjects(world);
    this.updateDrops(world, time);
    this.updateProjectiles(world);
    this.updateEffects(world, time);
    for (const object of this.objectModels.values()) {
      object.visual?.update({ hp: 1, moving: false }, world.mode === 'paused' ? 0 : dt, time);
      for (let i = 0; i < object.animated.length; i++) {
        const mesh = object.animated[i];
        if (!world.settings?.reducedMotion) {
          if (object.portal) mesh.rotation.z = time * (i % 2 ? -0.23 : 0.15);
          else mesh.rotation.y = time * 0.8;
        }
      }
      if (object.inner)
        object.inner.material.opacity =
          0.13 + (world.settings?.reducedMotion ? 0 : Math.sin(time * 1.8) * 0.025);
    }
    const torches = this.torches;
    for (const torch of torches) {
      const flicker = world.settings?.reducedMotion
        ? 1
        : 1 + Math.sin(time * 9 + torch.phase) * 0.09 + Math.sin(time * 14 + torch.phase) * 0.035;
      torch.group.scale.set(flicker, flicker, flicker);
    }
    if (this.quality === 'high') {
      if (!this.nearestTorches || time >= this.nextTorchUpdate) {
        this.nextTorchUpdate = time + 0.25;
        this.nearestTorches = [...torches]
          .sort(
            (a, b) =>
              (a.x - world.hero.x) ** 2 +
              (a.z - world.hero.y) ** 2 -
              (b.x - world.hero.x) ** 2 -
              (b.z - world.hero.y) ** 2,
          )
          .slice(0, 3);
      }
      const nearest = this.nearestTorches;
      this.torchLights.forEach((light, i) => {
        const torch = nearest[i];
        light.visible = !!torch;
        if (torch) {
          light.position.set(torch.x, torch.y + 0.15, torch.z);
          light.intensity =
            6 + (world.settings?.reducedMotion ? 0 : Math.sin(time * 7 + torch.phase) * 0.45);
        }
      });
    }
    if (this.embers) {
      this.embers.visible = this.quality === 'high' && !world.settings?.reducedMotion;
      const positions = this.embers.geometry.attributes.position;
      for (let i = 0; i < positions.count; i++) {
        const x = world.hero.x + (hash(i, 1) - 0.5) * 21;
        const z = world.hero.y + (hash(i, 2) - 0.5) * 21;
        positions.setXYZ(
          i,
          x + Math.sin(time * 0.2 + i) * 0.3,
          0.3 + ((time * 0.12 + hash(i, 3) * 3) % 3),
          z,
        );
      }
      positions.needsUpdate = true;
    }
    this.renderer.info.reset();
    this.pipeline.render(dt);
  }

  screenToWorld(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    this.mouse.set(
      ((clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1,
      -((clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1,
    );
    this.camera.updateMatrixWorld();
    this.raycaster.setFromCamera(this.mouse, this.camera);
    if (!this.raycaster.ray.intersectPlane(this.ground, this.hit)) return null;
    return { x: this.hit.x, y: this.hit.z };
  }

  project(x, y, height = 1.5) {
    const rect = this.canvas.getBoundingClientRect();
    this.camera.updateMatrixWorld();
    const p = new THREE.Vector3(x, height, y).project(this.camera);
    return {
      x: rect.left + ((p.x + 1) * rect.width) / 2,
      y: rect.top + ((1 - p.y) * rect.height) / 2,
    };
  }

  dispose() {
    this.disposed = true;
    window.removeEventListener('resize', this._resize);
    this.canvas.removeEventListener('webglcontextlost', this._contextLost);
    this.canvas.removeEventListener('webglcontextrestored', this._contextRestored);
    for (const actor of this.actors.values()) actor.visual?.dispose();
    for (const object of this.objectModels.values()) object.visual?.dispose();
    this.clearGroup(this.static);
    this.clearGroup(this.dynamic);
    for (const material of this.materials.values()) material.dispose();
    this.materials.clear();
    disposePropAssets();
    this.surfaces.dispose();
    this.lightingProbe?.dispose();
    this.pipeline?.dispose();
    this.revealUniform.value?.dispose();
    this.renderer.dispose();
  }
}
