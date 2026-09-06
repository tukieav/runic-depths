import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { ENEMY_PRESENTATION } from './enemy-presentation.js';

const high = new Map(),
  low = new Map(),
  failed = new Map(),
  lodFailed = new Map(),
  pending = new Map();
let surfacePromise, sharedMaterial;
const themedMaterials = new Map();

async function fetchBounded(url, timeout) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
    return await response.arrayBuffer();
  } finally {
    clearTimeout(timer);
  }
}

function loadSurfaces(timeout) {
  if (sharedMaterial) return Promise.resolve(sharedMaterial);
  if (!surfacePromise)
    surfacePromise = (async () => {
      const results = await Promise.allSettled(
        ['color', 'normal', 'roughmetal', 'emission'].map(async (name) => {
          const bytes = await fetchBounded(`assets/enemies/${name}.png`, timeout);
          return {
            name,
            bitmap: await createImageBitmap(new Blob([bytes], { type: 'image/png' }), {
              imageOrientation: 'none',
              premultiplyAlpha: 'none',
              colorSpaceConversion: 'none',
            }),
          };
        }),
      );
      const failure = results.find((result) => result.status === 'rejected');
      if (failure) {
        for (const result of results)
          if (result.status === 'fulfilled') result.value.bitmap.close();
        throw failure.reason;
      }
      const textures = results.map((result) => {
        const { name, bitmap } = result.value;
        const texture = new THREE.Texture(bitmap);
        texture.flipY = false;
        texture.colorSpace =
          name === 'color' || name === 'emission' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        texture.anisotropy = 4;
        texture.needsUpdate = true;
        return texture;
      });
      sharedMaterial = new THREE.MeshStandardMaterial({
        name: 'Shared original bestiary PBR',
        map: textures[0],
        normalMap: textures[1],
        normalScale: new THREE.Vector2(0.45, 0.45),
        roughnessMap: textures[2],
        metalnessMap: textures[2],
        metalness: 1,
        roughness: 1,
        emissiveMap: textures[3],
        emissive: 0x666666,
        vertexColors: true,
        side: THREE.DoubleSide,
      });
      return sharedMaterial;
    })().finally(() => {
      surfacePromise = undefined;
    });
  return surfacePromise;
}

/** Strip external material references before parsing. All thirty GLBs use one
 * shared GPU material and four textures; parsing a new rig never refetches or
 * allocates thirty identical texture sets. Geometry/rig/animation bytes remain
 * untouched, preserving glTF validation and artist source reproducibility. */
function geometryBuffer(buffer) {
  const source = new DataView(buffer),
    length = source.getUint32(12, true);
  const doc = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 20, length)));
  delete doc.images;
  delete doc.textures;
  delete doc.samplers;
  doc.materials = [
    {
      name: 'Pending shared bestiary surface',
      pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1] },
    },
  ];
  const bytes = new TextEncoder().encode(JSON.stringify(doc));
  const padded = Math.ceil(bytes.length / 4) * 4;
  const tail = new Uint8Array(buffer, 20 + length);
  const result = new ArrayBuffer(20 + padded + tail.byteLength),
    view = new DataView(result);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, result.byteLength, true);
  view.setUint32(12, padded, true);
  view.setUint32(16, 0x4e4f534a, true);
  new Uint8Array(result, 20, padded).fill(32);
  new Uint8Array(result, 20, bytes.length).set(bytes);
  new Uint8Array(result, 20 + padded).set(tail);
  return result;
}

export async function loadEnemyAssets({
  quality = 'high',
  ids = Object.keys(ENEMY_PRESENTATION),
  timeout = 15000,
} = {}) {
  const target = quality === 'low' ? low : high,
    errors = quality === 'low' ? lodFailed : failed;
  await Promise.allSettled(
    [...new Set(ids)]
      .filter((id) => ENEMY_PRESENTATION[id])
      .map(async (id) => {
        if (target.has(id)) return;
        const key = `${quality}:${id}`;
        if (pending.has(key)) return pending.get(key);
        const task = (async () => {
          try {
            const [buffer, material] = await Promise.all([
              fetchBounded(`assets/enemies/${quality === 'low' ? 'lod/' : ''}${id}.glb`, timeout),
              loadSurfaces(timeout),
            ]);
            const gltf = await new GLTFLoader()
              .setMeshoptDecoder(MeshoptDecoder)
              .parseAsync(geometryBuffer(buffer), '');
            let triangles = 0,
              vertices = 0,
              meshes = 0,
              bones = 0;
            const parts = new Set(),
              boneNames = [];
            gltf.scene.traverse((object) => {
              if (object.isBone) {
                bones++;
                boneNames.push(object.name);
              }
              if (!object.isMesh) return;
              meshes++;
              vertices += object.geometry.attributes.position.count;
              triangles +=
                (object.geometry.index?.count || object.geometry.attributes.position.count) / 3;
              for (const part of object.userData.parts || []) parts.add(part);
              for (const old of [].concat(object.material)) old.dispose();
              const glow = ENEMY_PRESENTATION[id].palette.glow;
              if (!themedMaterials.has(glow)) {
                const themed = material.clone();
                themed.name = `Bestiary ${ENEMY_PRESENTATION[id].theme} shared surfaces`;
                themed.emissive.setHex(glow);
                themed.emissiveIntensity = 0.42;
                themedMaterials.set(glow, themed);
              }
              object.material = themedMaterials.get(glow);
              object.castShadow = true;
              object.receiveShadow = true;
              object.frustumCulled = false;
            });
            gltf.scene.updateMatrixWorld(true);
            const height = new THREE.Box3().setFromObject(gltf.scene).max.y;
            const stats = {
              id,
              height,
              detail: quality,
              meshes,
              bones,
              boneNames,
              triangles,
              vertices,
              bytes: buffer.byteLength,
              clips: gltf.animations.map((clip) => clip.name),
              parts: [...parts],
              weapon: ENEMY_PRESENTATION[id].weapon,
            };
            target.set(id, { gltf, stats });
            errors.delete(id);
          } catch (error) {
            errors.set(id, String(error.message || error));
          } finally {
            pending.delete(key);
          }
        })();
        pending.set(key, task);
        return task;
      }),
  );
  return getEnemyAssetStatus();
}

export function getEnemyAssetStatus() {
  return {
    loaded: [...high.keys()],
    lodLoaded: [...low.keys()],
    failed: Object.fromEntries(failed),
    lodFailed: Object.fromEntries(lodFailed),
    ready: high.size === Object.keys(ENEMY_PRESENTATION).length,
    assets: Object.fromEntries([...high].map(([id, item]) => [id, item.stats])),
    lodAssets: Object.fromEntries([...low].map(([id, item]) => [id, item.stats])),
  };
}

export function createEnemyVisual(id, { quality = 'high' } = {}) {
  const resource = (quality === 'low' ? low.get(id) : high.get(id)) || high.get(id) || low.get(id);
  if (!resource) return null;
  const root = clone(resource.gltf.scene),
    spec = ENEMY_PRESENTATION[id];
  root.name = `authored-enemy-${id}`;
  Object.assign(root.userData, {
    enemyAsset: id,
    enemyId: id,
    weapon: spec.weapon,
    anatomy: spec.body,
    parts: resource.stats.parts,
  });
  const mixer = new THREE.AnimationMixer(root),
    actions = Object.fromEntries(
      resource.gltf.animations.map((clip) => [clip.name, mixer.clipAction(clip)]),
    );
  let active,
    clock = 0,
    until = 0,
    previousAttack = 0,
    previousCast = 0,
    previousHit = 0,
    previousX,
    previousY,
    count = 0;
  function play(name, restart = false) {
    const action = actions[name] || actions.idle;
    if (!action || (active === action && !restart)) return;
    active?.fadeOut(0.1);
    action.reset().fadeIn(0.1).play();
    const once = !['idle', 'walk'].includes(name);
    action.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, once ? 1 : Infinity);
    action.clampWhenFinished = once;
    // Ranged release at .32 s aligns the authored bow draw/release with engine windup.
    action.timeScale = ['shoot', 'shoot_alt'].includes(name) ? 1.18 : 1;
    active = action;
    root.userData.animation = name;
  }
  play('idle');
  return {
    root,
    mixer,
    stats: resource.stats,
    update(data, dt) {
      dt = Math.max(0, Math.min(0.1, Number(dt) || 0));
      clock += dt;
      const moving =
        data.moving ??
        (previousX !== undefined && Math.hypot(data.x - previousX, data.y - previousY) > 0.0005);
      previousX = data.x;
      previousY = data.y;
      const attack = Number(data.attackTime) || 0,
        cast = Number(data.castTime) || 0,
        hit = Number(data.hitTime) || 0;
      if (data.hp <= 0 || data.dead) play('death');
      else if (cast > previousCast + 0.01) {
        play('cast', true);
        until = clock + 0.72;
      } else if (attack > previousAttack + 0.01) {
        const ranged = spec.weapon === 'bow';
        play(
          ranged
            ? ++count % 2
              ? 'shoot'
              : 'shoot_alt'
            : spec.attackStyle === 'cast'
              ? 'cast'
              : ++count % 2
                ? 'attack'
                : 'attack_alt',
          true,
        );
        until = clock + 0.68;
      } else if (hit > previousHit + 0.01 && clock >= until) {
        play('hit', true);
        until = clock + 0.3;
      } else if (clock >= until) play(moving && !data.reducedMotion ? 'walk' : 'idle');
      previousAttack = attack;
      previousCast = cast;
      previousHit = hit;
      mixer.update(data.reducedMotion && root.userData.animation === 'idle' ? 0 : dt);
    },
    dispose() {
      mixer.stopAllAction();
      mixer.uncacheRoot(root);
      const skeletons = new Set();
      root.traverse((object) => {
        if (object.isSkinnedMesh) skeletons.add(object.skeleton);
      });
      for (const skeleton of skeletons) skeleton.dispose();
      root.removeFromParent();
    },
  };
}
