import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const sourceModels = new Map();
const resources = new Set();
export const propAssetState = { requested: 0, loaded: 0, failed: [], ready: false, triangles: 0 };
let loading;
let generation = 0;

function discard(scene) {
  const disposable = new Set();
  scene.traverse((node) => {
    if (!node.isMesh) return;
    disposable.add(node.geometry);
    for (const material of Array.isArray(node.material) ? node.material : [node.material])
      disposable.add(material);
  });
  for (const resource of disposable) resource.dispose();
}

function loadWithDeadline(loader, url) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timeout = setTimeout(() => {
      settled = true;
      reject(new Error('Prop loading deadline exceeded'));
    }, 4500);
    loader.load(
      url,
      (gltf) => {
        if (settled) {
          discard(gltf.scene);
          return;
        }
        settled = true;
        clearTimeout(timeout);
        resolve(gltf);
      },
      undefined,
      (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

/** Load the two shared original GLBs once. Failure leaves procedural fallbacks available. */
export function loadPropAssets(surfaceLibrary) {
  if (loading) return loading;
  const loader = new GLTFLoader();
  const currentGeneration = generation;
  loading = Promise.all(
    ['sarcophagus', 'shrine'].map(async (kind) => {
      propAssetState.requested++;
      try {
        const gltf = await loadWithDeadline(loader, `assets/props/${kind}.glb`);
        if (generation !== currentGeneration) {
          discard(gltf.scene);
          return;
        }
        gltf.scene.traverse((node) => {
          if (!node.isMesh) return;
          resources.add(node.geometry);
          for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
            resources.add(material);
            const surfaceKind = material.name.split('.')[1];
            if (surfaceLibrary && surfaceLibrary.kinds.includes(surfaceKind))
              surfaceLibrary.apply(material, surfaceKind);
          }
          propAssetState.triangles +=
            (node.geometry.index?.count ?? node.geometry.attributes.position.count) / 3;
        });
        gltf.scene.userData.propKind = kind;
        sourceModels.set(kind, gltf.scene);
        propAssetState.loaded++;
      } catch {
        if (generation === currentGeneration)
          propAssetState.failed.push(`assets/props/${kind}.glb`);
      }
    }),
  ).then(() => {
    if (generation === currentGeneration) propAssetState.ready = true;
    return propAssetState;
  });
  return loading;
}

/** A fresh transform hierarchy, with shared cached geometry/material resources. */
export function createPropVisual(kind) {
  return sourceModels.get(kind)?.clone(true) || null;
}

/** Call only after all renderers using the shared prop library have been disposed. */
export function disposePropAssets() {
  generation++;
  for (const resource of resources) resource.dispose();
  resources.clear();
  sourceModels.clear();
  loading = undefined;
  Object.assign(propAssetState, {
    requested: 0,
    loaded: 0,
    failed: [],
    ready: false,
    triangles: 0,
  });
}
