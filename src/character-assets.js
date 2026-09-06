import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';

const IDS = ['warden', 'ranger', 'arcanist', 'reaver', 'oracle', 'skeleton', 'wraith', 'brute'];
const cache = new Map();
const failures = new Map();
let loading;

/** These authored GLBs are optional presentation data; failed requests leave the
 * procedural renderer available. Abort fetches so unavailable assets never hold
 * game startup open indefinitely. Shared resources survive individual actors. */
export function loadCharacterAssets({ timeout = 4500 } = {}) {
  if (loading) return loading;
  const loader = new GLTFLoader();
  loading = Promise.allSettled(
    IDS.map(async (id) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);
      try {
        const response = await fetch(`assets/models/${id}.glb`, { signal: controller.signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const buffer = await response.arrayBuffer();
        const gltf = await loader.parseAsync(buffer, '');
        let vertices = 0,
          triangles = 0,
          meshes = 0,
          bones = 0;
        gltf.scene.traverse((object) => {
          if (object.isBone) bones++;
          if (!object.isMesh) return;
          meshes++;
          object.castShadow = true;
          object.receiveShadow = true;
          object.frustumCulled = false; // Animated bounds must not use the bind pose.
          vertices += object.geometry.attributes.position.count;
          triangles +=
            (object.geometry.index?.count || object.geometry.attributes.position.count) / 3;
          for (const material of [].concat(object.material)) {
            if (material.map) material.map.anisotropy = 4;
            material.shadowSide = THREE.FrontSide;
          }
        });
        cache.set(id, {
          gltf,
          stats: {
            id,
            meshes,
            bones,
            vertices,
            triangles,
            bytes: buffer.byteLength,
            clips: gltf.animations.map((clip) => clip.name),
          },
        });
      } catch (error) {
        failures.set(id, String(error.message || error));
      } finally {
        clearTimeout(timer);
      }
    }),
  ).then(() => getCharacterAssetStatus());
  return loading;
}

export function getCharacterAssetStatus() {
  return {
    loaded: [...cache.keys()],
    failed: Object.fromEntries(failures),
    ready: cache.size === IDS.length,
    assets: Object.fromEntries([...cache].map(([id, item]) => [id, item.stats])),
  };
}

/** Feet at 0, +Z forward, ~1.5 units high. Root transform belongs to renderer.
 * data.moving is optional; movement can be inferred from world x/y positions.
 * A renderer should avoid applying its legacy limb swing to this hierarchy. */
export function createCharacterVisual(id) {
  const resource = cache.get(id);
  if (!resource) return null;
  const root = clone(resource.gltf.scene);
  root.name = `authored-${id}`;
  root.userData.characterAsset = id;
  const mixer = new THREE.AnimationMixer(root);
  const actions = Object.fromEntries(
    resource.gltf.animations.map((clip) => [clip.name, mixer.clipAction(clip)]),
  );
  let active = null,
    previousX,
    previousY,
    previousAttack = 0,
    previousCast = 0;
  let actionUntil = 0,
    clock = 0;

  function play(name, restart = false) {
    const next = actions[name] || actions.idle;
    if (!next || (active === next && !restart)) return;
    if (active) active.fadeOut(0.12);
    next.reset().fadeIn(0.12).play();
    const once = ['attack', 'cast', 'death'].includes(name);
    next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, once ? 1 : Infinity);
    next.clampWhenFinished = once;
    active = next;
    root.userData.animation = name;
  }
  play('idle');
  return {
    root,
    mixer,
    stats: resource.stats,
    update(data, dt, time) {
      dt = Math.max(0, Math.min(0.1, Number(dt) || 0));
      clock += dt;
      const moving =
        data.moving ??
        (previousX !== undefined && Math.hypot(data.x - previousX, data.y - previousY) > 0.0005);
      previousX = data.x;
      previousY = data.y;
      const attack = Number(data.attackTime) || 0;
      const cast = Number(data.castTime) || Number(data.skillTime) || 0;
      if (data.hp <= 0 || data.dead) {
        play('death');
      } else if (cast > previousCast + 0.01) {
        play('cast', true);
        actionUntil = clock + 0.7;
      } else if (attack > previousAttack + 0.01) {
        play('attack', true);
        actionUntil = clock + 0.46;
      } else if (clock >= actionUntil) {
        play(moving && !data.reducedMotion ? 'walk' : 'idle');
      }
      previousAttack = attack;
      previousCast = cast;
      if (active && root.userData.animation === 'walk')
        active.timeScale = data.dashTime > 0 ? 1.7 : 1;
      mixer.update(data.reducedMotion && root.userData.animation === 'idle' ? 0 : dt);
    },
    dispose() {
      mixer.stopAllAction();
      mixer.uncacheRoot(root);
      root.removeFromParent();
    },
  };
}
